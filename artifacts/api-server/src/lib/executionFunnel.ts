/**
 * Execution-funnel telemetry.
 *
 * Diagnostic instrumentation that answers one operator question: "the engine
 * is generating signals — why aren't they becoming trades?". Every gate in
 * both execution paths (global/operator `autoExecute` in tradingLoop.ts and
 * the per-user customer fan-out in liveUserExecution.ts) already emits a typed
 * `executionStreamBus` event. Rather than scatter counter increments across
 * those two large files, this module subscribes to the bus ONCE and classifies
 * each event into a canonical funnel stage + a stable rejection-reason key.
 *
 * Counts are cumulative since the last reset (defaults to process boot). The
 * snapshot is read-on-demand by `GET /api/admin/execution-funnel`.
 *
 * Importing this module attaches the subscriber as a side-effect — keep the
 * import in the admin route so it is wired up at server boot, before the
 * trading loop's first tick.
 *
 * Known limitations (acceptable for this diagnostic, which targets the
 * operator/global path — the current 0-trade incident — and deliberately
 * avoids churn in the two execution files):
 *   - Counting grain differs by path: operator events are per-signal while
 *     customer events are per-user fan-out. The customer live path is OFF by
 *     default, so in practice the snapshot reflects the operator path; the UI
 *     clamps derived "passed" counts to guard against grain divergence.
 *   - `executionAttempted`/`executionSucceeded` track the operator path only
 *     (`execution_sent`/`order_filled`). Customer fills emit a notification,
 *     not a bus `order_filled`, so they are not counted here.
 *   - A few customer exchange-path early-returns in liveUserExecution.ts do
 *     not emit a bus event; those rejections will be under-counted until those
 *     exits emit. Operator-path coverage is complete.
 */

import { executionStreamBus, type ExecStreamEvent } from "./executionStreamBus.js";

export type FunnelStage =
  | "confidence"
  | "risk"
  | "liquidity"
  | "exchange"
  | "positionLimits";

export const FUNNEL_STAGE_ORDER: FunnelStage[] = [
  "confidence",
  "risk",
  "liquidity",
  "exchange",
  "positionLimits",
];

export interface RecentRejection {
  ts:      number;
  stage:   FunnelStage;
  reason:  string;
  symbol:  string | null;
  side:    "BUY" | "SELL" | null;
  path:    "operator" | "customer";
  message: string;
}

export interface ExecutionFunnelSnapshot {
  since:               number;
  blockedByStage:      Record<FunnelStage, number>;
  totalBlocked:        number;
  executionAttempted:  number;
  executionSucceeded:  number;
  rejectionsByReason:  { reason: string; stage: FunnelStage; count: number }[];
  recent:              RecentRejection[];
}

const RECENT_MAX = 60;

interface FunnelState {
  since:              number;
  blockedByStage:     Record<FunnelStage, number>;
  reasonCounts:       Map<string, { stage: FunnelStage; count: number }>;
  executionAttempted: number;
  executionSucceeded: number;
  recent:             RecentRejection[];
}

function freshState(): FunnelState {
  return {
    since: Date.now(),
    blockedByStage: { confidence: 0, risk: 0, liquidity: 0, exchange: 0, positionLimits: 0 },
    reasonCounts: new Map(),
    executionAttempted: 0,
    executionSucceeded: 0,
    recent: [],
  };
}

const state: FunnelState = freshState();

/**
 * Customer-path rejection reasons (errorCode carried on the event `reason`
 * field of an `order_rejected` event), mapped to their canonical funnel stage.
 * Mirrors the errorCode union in lib/liveUserExecution.ts.
 */
const REASON_STAGE: Record<string, FunnelStage> = {
  // confidence
  low_confidence_signal:            "confidence",
  // risk / safety / eligibility
  volume_safety_gate:               "risk",
  user_status_blocked:              "risk",
  user_ai_disabled:                 "risk",
  ai_disclaimer_not_accepted:       "risk",
  customer_live_execution_disabled: "risk",
  risk_max_per_trade:               "risk",
  risk_max_simultaneous:            "risk",
  risk_max_allocation:              "risk",
  risk_reserve_cash_breach:         "risk",
  risk_no_equity:                   "risk",
  // liquidity
  liquidity_protected:              "liquidity",
  // position / throughput limits
  plan_max_positions_reached:       "positionLimits",
  concurrent_live_cap_reached:      "positionLimits",
  trade_limit_exhausted:            "positionLimits",
  // exchange validation / placement
  no_connection:                    "exchange",
  not_trade_authorized:             "exchange",
  decrypt_failed:                   "exchange",
  unsupported:                      "exchange",
  unsupported_symbol:               "exchange",
  symbol_not_in_universe:           "exchange",
  no_sandbox:                       "exchange",
  price_unavailable:                "exchange",
  exchange_reject:                  "exchange",
  exchange_mismatch:                "exchange",
};

/**
 * Operator-path block events emit a distinct `type`. Map each to its canonical
 * stage. `null` value = an event we count specially (attempt/success) or ignore.
 */
const TYPE_STAGE: Partial<Record<ExecStreamEvent["type"], FunnelStage>> = {
  confidence_too_low:    "confidence",
  live_floor_blocked:    "confidence",
  signal_rejected:       "risk",
  correlation_blocked:   "risk",
  risk_engine_blocked:   "risk",
  position_size_too_small: "risk",
  max_positions_blocked: "positionLimits",
  daily_limit_blocked:   "positionLimits",
  duplicate_blocked:     "positionLimits",
  order_minimum_failed:  "exchange",
};

/**
 * Derive a STABLE reason key for aggregation. Many events carry free-text
 * `reason`/`message` with embedded numbers (confidence %, counts) that would
 * fragment a naive group-by — normalise those to a fixed key.
 */
function reasonKeyFor(ev: ExecStreamEvent): string {
  if (ev.type === "order_rejected") {
    // Customer path carries the errorCode on `reason`; operator exchange
    // failures carry free text + a `gate`. Prefer a known errorCode.
    if (ev.reason && REASON_STAGE[ev.reason]) return ev.reason;
    if (ev.gate) return `exchange:${ev.gate}`;
    return "exchange_reject";
  }
  switch (ev.type) {
    case "confidence_too_low": return "confidence_floor";
    case "live_floor_blocked": return "live_confidence_floor";
    case "correlation_blocked": return "correlation_filter";
    case "risk_engine_blocked": return "risk_engine";
    case "max_positions_blocked": return "max_active_positions";
    case "daily_limit_blocked": return "daily_trade_limit";
    case "duplicate_blocked": return "duplicate_asset";
    case "position_size_too_small": return "position_size_too_small";
    case "order_minimum_failed": return "order_minimum";
    case "signal_rejected": {
      const r = (ev.reason ?? "").toLowerCase();
      if (r.includes("volume")) return "volume_filter";
      if (r.includes("sideways") || r.includes("range")) return "sideways_market";
      if (r.includes("1h") || r.includes("trend")) return "trend_1h_conflict";
      if (r.includes("spread")) return "spread_too_wide";
      if (r.includes("auto-mode")) return "auto_mode_off";
      return ev.reason || "signal_rejected";
    }
    default:
      return ev.reason || ev.type;
  }
}

function classify(ev: ExecStreamEvent): FunnelStage | null {
  if (ev.type === "order_rejected") {
    if (ev.reason && REASON_STAGE[ev.reason]) return REASON_STAGE[ev.reason];
    // order_rejected with no known errorCode = a post-send exchange/engine
    // failure (operator path) — attribute to the exchange stage.
    return "exchange";
  }
  return TYPE_STAGE[ev.type] ?? null;
}

function pathFor(ev: ExecStreamEvent): "operator" | "customer" {
  if (ev.type === "order_rejected" && ev.reason && REASON_STAGE[ev.reason]) {
    return "customer";
  }
  if (ev.details && typeof ev.details === "object" && "userId" in ev.details) {
    return "customer";
  }
  return "operator";
}

function onEvent(ev: ExecStreamEvent): void {
  // Execution outcomes (operator path) — counted independently of blocks.
  if (ev.type === "execution_sent") { state.executionAttempted++; return; }
  if (ev.type === "order_filled")   { state.executionSucceeded++; return; }

  const stage = classify(ev);
  if (!stage) return; // not a funnel-relevant event (mtf_blocked, loop_tick, etc.)

  state.blockedByStage[stage]++;

  const reason = reasonKeyFor(ev);
  const existing = state.reasonCounts.get(reason);
  if (existing) existing.count++;
  else state.reasonCounts.set(reason, { stage, count: 1 });

  state.recent.unshift({
    ts:      ev.ts,
    stage,
    reason,
    symbol:  ev.symbol ?? null,
    side:    ev.side ?? null,
    path:    pathFor(ev),
    message: ev.message,
  });
  if (state.recent.length > RECENT_MAX) state.recent.length = RECENT_MAX;
}

let subscribed = false;
function ensureSubscribed(): void {
  if (subscribed) return;
  executionStreamBus.on("event", onEvent);
  subscribed = true;
}
ensureSubscribed();

export function getExecutionFunnelSnapshot(): ExecutionFunnelSnapshot {
  const totalBlocked = FUNNEL_STAGE_ORDER.reduce((s, st) => s + state.blockedByStage[st], 0);
  const rejectionsByReason = Array.from(state.reasonCounts.entries())
    .map(([reason, v]) => ({ reason, stage: v.stage, count: v.count }))
    .sort((a, b) => b.count - a.count);
  return {
    since:              state.since,
    blockedByStage:     { ...state.blockedByStage },
    totalBlocked,
    executionAttempted: state.executionAttempted,
    executionSucceeded: state.executionSucceeded,
    rejectionsByReason,
    recent:             state.recent.slice(),
  };
}

export function resetExecutionFunnel(): void {
  const next = freshState();
  state.since = next.since;
  state.blockedByStage = next.blockedByStage;
  state.reasonCounts = next.reasonCounts;
  state.executionAttempted = 0;
  state.executionSucceeded = 0;
  state.recent = next.recent;
}
