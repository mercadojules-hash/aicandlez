/**
 * customerExecutionAttribution — per-customer execution funnel attribution
 * (Task #219).
 *
 * The portal previously showed the GLOBAL engine execution funnel
 * (`engine.executionFunnel`, anonymous, all users), which is why a customer
 * could see "16 attempts / 3 fills" with no explanation: those 16 were the
 * engine's signals, not the user's own live-order attempts. This module records
 * EACH customer's OWN live-order outcomes (AI fan-out + manual portal pill —
 * both flow through `executeCustomerOrder`) and classifies every failure into a
 * small, customer-readable reason taxonomy so the user can see exactly where
 * their attempts are dropping.
 *
 * In-memory only (mirrors `signalFunnel.ts` / `executionFunnel.ts`): cumulative
 * since boot, per user, with a small rolling list of recent attempts. A process
 * restart resets the counters — acceptable for live operational telemetry.
 */

export type AttributionReason =
  | "confidence"   // signal confidence below the live floor
  | "duplicate"    // a position for this asset already exists
  | "cooldown"     // daily trade limit / cooldown reached
  | "risk"         // per-user risk budget gate blocked it
  | "exchange"     // the broker / exchange rejected the order
  | "slot_cap"     // concurrent / plan / per-exchange slot cap reached
  | "liquidity"    // liquidity cushion protection paused new entries
  | "allocation"   // category allocation weight reached for this category
  | "spot_short_blocked" // spot-only venue cannot open a short (SELL) entry
  | "cash_unavailable"   // insufficient deployable USD for the BUY notional
  | "other";       // anything else (config state, universe mismatch, etc.)

export const ATTRIBUTION_REASONS: readonly AttributionReason[] = [
  "confidence", "duplicate", "cooldown", "risk", "exchange",
  "slot_cap", "liquidity", "allocation", "spot_short_blocked",
  "cash_unavailable", "other",
] as const;

export interface AttributionAttempt {
  at:       number;
  symbol:   string;
  side:     string;
  exchange: string | null;
  success:  boolean;
  reason:   AttributionReason | null; // null when success
}

interface UserAttributionState {
  since:     number;
  attempts:  number;
  successes: number;
  byReason:  Record<AttributionReason, number>;
  recent:    AttributionAttempt[]; // newest last, capped
}

const RECENT_CAP = 50;
const store = new Map<string, UserAttributionState>();

function emptyByReason(): Record<AttributionReason, number> {
  return {
    confidence: 0, duplicate: 0, cooldown: 0, risk: 0, exchange: 0,
    slot_cap: 0, liquidity: 0, allocation: 0, spot_short_blocked: 0,
    cash_unavailable: 0, other: 0,
  };
}

function ensure(userId: string): UserAttributionState {
  let s = store.get(userId);
  if (!s) {
    s = { since: Date.now(), attempts: 0, successes: 0, byReason: emptyByReason(), recent: [] };
    store.set(userId, s);
  }
  return s;
}

/**
 * Map a `placeLiveAutoOrderForUser` errorCode to the customer-facing taxonomy.
 * Unknown / config-state codes fall through to "other".
 */
export function classifyErrorCode(errorCode: string | undefined | null): AttributionReason {
  const code = (errorCode ?? "").toLowerCase();
  if (!code) return "other";
  if (code.startsWith("risk_")) return "risk";
  switch (code) {
    case "low_confidence_signal":
      return "confidence";
    case "trade_limit_exhausted":
      return "cooldown";
    case "concurrent_live_cap_reached":
    case "plan_max_positions_reached":
      return "slot_cap";
    case "liquidity_protected":
      return "liquidity";
    case "allocation_limit":
      return "allocation";
    case "spot_short_blocked":
      return "spot_short_blocked";
    case "cash_unavailable":
      return "cash_unavailable";
    case "exchange_reject":
    case "unsupported_symbol":
    case "unsupported":
    case "price_unavailable":
    case "decrypt_failed":
    case "no_connection":
    case "not_trade_authorized":
    case "no_sandbox":
      return "exchange";
    case "duplicate_position":
    case "position_exists":
      return "duplicate";
    default:
      // symbol_not_in_universe, volume_safety_gate, user_status_blocked,
      // user_ai_disabled, ai_disclaimer_not_accepted, runtime_not_armed,
      // customer_live_execution_disabled, etc.
      return "other";
  }
}

export interface RecordAttemptInput {
  userId:    string;
  symbol:    string;
  side:      string;
  exchange?: string | null;
  success:   boolean;
  errorCode?: string | null;
}

/** Record one customer live-order outcome (success or a classified failure). */
export function recordCustomerAttempt(input: RecordAttemptInput): void {
  const { userId, symbol, side, success, errorCode } = input;
  if (!userId) return;
  const s = ensure(userId);
  s.attempts += 1;
  const reason: AttributionReason | null = success ? null : classifyErrorCode(errorCode);
  if (success) {
    s.successes += 1;
  } else if (reason) {
    s.byReason[reason] += 1;
  }
  s.recent.push({
    at:       Date.now(),
    symbol,
    side,
    exchange: input.exchange ?? null,
    success,
    reason,
  });
  if (s.recent.length > RECENT_CAP) s.recent.splice(0, s.recent.length - RECENT_CAP);
}

export interface CustomerFunnelSnapshot {
  since:     number;
  attempts:  number;
  successes: number;
  failures:  number;
  byReason:  Array<{ reason: AttributionReason; count: number }>;
  recent:    AttributionAttempt[];
}

/** Read one customer's own execution funnel snapshot. */
export function getCustomerFunnel(userId: string): CustomerFunnelSnapshot {
  const s = store.get(userId);
  if (!s) {
    return {
      since:     Date.now(),
      attempts:  0,
      successes: 0,
      failures:  0,
      byReason:  ATTRIBUTION_REASONS.map((reason) => ({ reason, count: 0 })),
      recent:    [],
    };
  }
  return {
    since:     s.since,
    attempts:  s.attempts,
    successes: s.successes,
    failures:  s.attempts - s.successes,
    byReason:  ATTRIBUTION_REASONS.map((reason) => ({ reason, count: s.byReason[reason] })),
    recent:    [...s.recent].reverse(), // newest first for display
  };
}
