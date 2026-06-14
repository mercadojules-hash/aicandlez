import { db } from "@workspace/db";
import { userSettingsTable, userExchangeSettingsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Per-account / per-exchange live-exit controls (Task #220).
 *
 * Resolves the four live-exit values — take-profit %, stop-loss %, trailing-stop
 * %, and max-hold hours — for a given (userId, exchange) pair.
 *
 * Resolution precedence (highest first):
 *   1. Per-(user, exchange) override — `user_exchange_settings` columns. NULL →
 *      inherit the account default.
 *   2. Account default — `user_settings`. SL/TP are always present (NOT NULL
 *      cols); trailing / max-hold are nullable.
 *   3. Env operator default — `LIVE_TRAILING_STOP_PERCENT` /
 *      `LIVE_POSITION_MAX_HOLD_MS`. A global DEFAULT (not an override): it only
 *      applies for trailing / max-hold when the account/exchange leave the field
 *      unset. Per-account / per-exchange edits MUST win over it, otherwise the
 *      per-account controls would be silently ineffective in any environment
 *      where the operator env knob is set. (SL/TP have no env knob.)
 *   4. Hardcoded default — SL 2 %, TP 4.5 %, trailing 1.75 %, max-hold 6h.
 *      These Strategy V2 fallback defaults apply only when no account,
 *      exchange, or env default is configured. Explicit user settings still win.
 *
 * `trailingStopPercent === null` is still honored by the live monitor (mirror
 * each position's own stored stop-loss band) if a row explicitly carries it, but
 * after P4 the resolver no longer PRODUCES null from defaults — an unconfigured
 * account resolves to the fixed 2 %. An explicit `0` disables trailing; `0`
 * max-hold disables the time ceiling.
 */

export const EXIT_DEFAULTS = {
  stopLossPercent:     2,
  // Strategy V2 fallback only. Per-account / per-exchange settings and env
  // defaults still take precedence, so this does not override user-specific DB
  // settings.
  takeProfitPercent:   4.5,
  trailingStopPercent: 1.75,
  // Universal max-hold: 24h → 6h → 1h → restored to 6h (approved, applies to ALL
  // users). A production exit audit of live Coinbase trades showed the 1h ceiling
  // was the dominant exit (~55% MAX_HOLD) and was force-closing positions long
  // before they could develop toward the 10% take-profit — including some of the
  // largest winners. 6h gives trades room to reach TP while still capping
  // open-position hold time. Per-account / per-exchange overrides still win over
  // this default. To revert, restore 1 (prior) or 24.
  maxHoldHours:        6,
} as const;

// Safe clamp ranges, centralized so every write path (customer + admin) reuses
// the same bounds. SL/TP must be > 0 (a 0 band would exit at entry); trailing /
// max-hold allow 0 (= disabled).
export const EXIT_BOUNDS = {
  stopLossPercent:     { min: 0.1, max: 50 },
  takeProfitPercent:   { min: 0.1, max: 100 },
  trailingStopPercent: { min: 0,   max: 50 },
  maxHoldHours:        { min: 0,   max: 720 }, // 720h = 30 days
} as const;

export type ExitField = keyof typeof EXIT_BOUNDS;

/**
 * Clamp + round a candidate exit value to its safe range. Non-finite input
 * throws (callers validate with Zod first, so this is a defensive backstop).
 * Rounded to 4 decimals to avoid float dust in persisted percentages.
 */
export function clampExitValue(field: ExitField, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`clampExitValue: ${field} must be a finite number`);
  }
  const { min, max } = EXIT_BOUNDS[field];
  const clamped = Math.min(max, Math.max(min, value));
  return parseFloat(clamped.toFixed(4));
}

export interface ResolvedExitConfig {
  /** Concrete stop-loss distance (percent). Always > 0. */
  stopLossPercent: number;
  /** Concrete take-profit distance (percent). Always > 0. */
  takeProfitPercent: number;
  /**
   * Trailing-stop distance (percent), or `null` to mirror the position's own
   * stored stop-loss band (the default). `0` = trailing disabled.
   */
  trailingStopPercent: number | null;
  /** Max-hold ceiling in milliseconds. `0` = disabled. */
  maxHoldMs: number;
  /** Max-hold ceiling in hours (for API/UI display). `0` = disabled. */
  maxHoldHours: number;
  /**
   * Let-winners-run opt-in (Profit-Optimization, feature #3). Derived from the
   * account `aiPersonality` — `true` ONLY for "aggressive". When set, the live
   * exit monitor may hold a position past its take-profit while upside momentum
   * is still strong, letting the trailing-stop / trend-weakening / max-hold
   * exits capture the gain instead of a hard TP cut. SL is untouched. Every
   * other personality keeps the byte-for-byte hard-TP behaviour (`false`).
   */
  letWinnersRun: boolean;
}

// ── Env operator defaults (global fallback, below per-account/exchange) ───────

/**
 * Live trailing-stop env DEFAULT (percent). `null` when the env var is unset.
 * Acts as a fallback BELOW per-exchange / account config (see resolveFrom
 * precedence) — it fills the gap when neither is set, but never overrides an
 * explicit per-account / per-exchange edit. A value of `0` makes "no trailing"
 * the default.
 */
export function getLiveTrailingStopPercentOverride(): number | null {
  const raw = process.env.LIVE_TRAILING_STOP_PERCENT;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Live max-hold env DEFAULT in milliseconds. `null` when the env var is unset;
 * a value of `0` makes "no max-hold" the default. Acts as a fallback BELOW
 * per-account / per-exchange config (see resolveFrom precedence) — per-account
 * edits win over it.
 *
 * Distinct from `tradingLoop.getLivePositionMaxHoldMs()` which ALWAYS returns a
 * number (defaulting to 24h) and therefore can't tell "operator set 24h" from
 * "unset". This null-shaped reader is what lets per-account config take priority
 * and slot the env value in only as a default.
 */
export function getLivePositionMaxHoldMsOverride(): number | null {
  const raw = process.env.LIVE_POSITION_MAX_HOLD_MS;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ── Pure resolution (no IO) ───────────────────────────────────────────────────

interface AccountRow {
  stopLossPercent:     number;
  takeProfitPercent:   number;
  trailingStopPercent: number | null;
  maxHoldHours:        number | null;
  aiPersonality:       string | null;
}
interface PerExchangeRow {
  takeProfitPercent:   number | null;
  stopLossPercent:     number | null;
  trailingStopPercent: number | null;
  maxHoldHours:        number | null;
}

function resolveFrom(
  account:        AccountRow | null,
  perExchange:    PerExchangeRow | null,
  envTrailPct:    number | null,
  envMaxHoldMs:   number | null,
): ResolvedExitConfig {
  const stopLossPercent =
    perExchange?.stopLossPercent ??
    account?.stopLossPercent ??
    EXIT_DEFAULTS.stopLossPercent;

  const takeProfitPercent =
    perExchange?.takeProfitPercent ??
    account?.takeProfitPercent ??
    EXIT_DEFAULTS.takeProfitPercent;

  // Trailing precedence: per-exchange override → account default → env DEFAULT
  // → hardcoded 2 %. Env is a default that fills the gap only when the account /
  // exchange leave trailing unset; it must NOT override an explicit per-account /
  // per-exchange edit (doing so would make the per-account controls silently
  // ineffective wherever LIVE_TRAILING_STOP_PERCENT is set). `0` = trailing
  // disabled. (P4 set 1.5 %, post-deploy counterfactual widened to 2 %.)
  const trailingStopPercent: number | null =
    perExchange?.trailingStopPercent ??
    account?.trailingStopPercent ??
    envTrailPct ??
    EXIT_DEFAULTS.trailingStopPercent;

  // Max-hold precedence (same order): per-exchange → account → env DEFAULT →
  // hardcoded 24h. `0` = disabled. Env hours derived from the ms knob only when
  // it is set; a per-account/exchange value wins over it.
  const maxHoldHours: number =
    perExchange?.maxHoldHours ??
    account?.maxHoldHours ??
    (envMaxHoldMs !== null ? envMaxHoldMs / 3_600_000 : null) ??
    EXIT_DEFAULTS.maxHoldHours;
  const maxHoldMs = Math.round(maxHoldHours * 3_600_000);

  // Let-winners-run is opt-in via the aggressive personality only — every other
  // personality (and a missing row) keeps the hard take-profit behaviour.
  const letWinnersRun = account?.aiPersonality === "aggressive";

  return { stopLossPercent, takeProfitPercent, trailingStopPercent, maxHoldMs, maxHoldHours, letWinnersRun };
}

// ── DB-backed resolution ──────────────────────────────────────────────────────

const ACCOUNT_COLS = {
  stopLossPercent:     userSettingsTable.stopLossPercent,
  takeProfitPercent:   userSettingsTable.takeProfitPercent,
  trailingStopPercent: userSettingsTable.trailingStopPercent,
  maxHoldHours:        userSettingsTable.maxHoldHours,
  aiPersonality:       userSettingsTable.aiPersonality,
} as const;

const PER_EXCHANGE_COLS = {
  takeProfitPercent:   userExchangeSettingsTable.takeProfitPercent,
  stopLossPercent:     userExchangeSettingsTable.stopLossPercent,
  trailingStopPercent: userExchangeSettingsTable.trailingStopPercent,
  maxHoldHours:        userExchangeSettingsTable.maxHoldHours,
} as const;

/**
 * Resolve the effective exit config for a single (userId, exchange). `userId`
 * null (operator / global book paths) yields pure env→default resolution.
 * `exchange` null (paper) skips the per-exchange lookup → account default.
 */
export async function resolveExitConfig(
  userId:   string | null,
  exchange: string | null,
): Promise<ResolvedExitConfig> {
  let account:     AccountRow | null = null;
  let perExchange: PerExchangeRow | null = null;

  if (userId) {
    account =
      (await db.select(ACCOUNT_COLS).from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId)).limit(1))[0] ?? null;

    if (exchange) {
      perExchange =
        (await db.select(PER_EXCHANGE_COLS).from(userExchangeSettingsTable)
          .where(and(
            eq(userExchangeSettingsTable.userId, userId),
            eq(userExchangeSettingsTable.exchange, exchange),
          )).limit(1))[0] ?? null;
    }
  }

  return resolveFrom(
    account,
    perExchange,
    getLiveTrailingStopPercentOverride(),
    getLivePositionMaxHoldMsOverride(),
  );
}

/**
 * Batch-load exit config for many positions in TWO queries (one per table),
 * returning a synchronous resolver closure keyed by (userId, exchange). Used by
 * the live exit monitor which evaluates every open position each tick — calling
 * `resolveExitConfig` per position would issue 2N queries.
 */
export async function buildExitConfigResolver(
  positions: Array<{ userId: string; exchange: string | null }>,
): Promise<(userId: string, exchange: string | null) => ResolvedExitConfig> {
  const userIds = [...new Set(positions.map((p) => p.userId))];

  const accountRows = userIds.length
    ? await db.select({ userId: userSettingsTable.userId, ...ACCOUNT_COLS })
        .from(userSettingsTable)
        .where(inArray(userSettingsTable.userId, userIds))
    : [];

  const perExchangeRows = userIds.length
    ? await db.select({
        userId:   userExchangeSettingsTable.userId,
        exchange: userExchangeSettingsTable.exchange,
        ...PER_EXCHANGE_COLS,
      })
        .from(userExchangeSettingsTable)
        .where(inArray(userExchangeSettingsTable.userId, userIds))
    : [];

  const accountMap = new Map<string, AccountRow>();
  for (const r of accountRows) {
    accountMap.set(r.userId, {
      stopLossPercent:     r.stopLossPercent,
      takeProfitPercent:   r.takeProfitPercent,
      trailingStopPercent: r.trailingStopPercent,
      maxHoldHours:        r.maxHoldHours,
      aiPersonality:       r.aiPersonality,
    });
  }

  const perExchangeMap = new Map<string, PerExchangeRow>();
  for (const r of perExchangeRows) {
    perExchangeMap.set(`${r.userId}:${r.exchange}`, {
      takeProfitPercent:   r.takeProfitPercent,
      stopLossPercent:     r.stopLossPercent,
      trailingStopPercent: r.trailingStopPercent,
      maxHoldHours:        r.maxHoldHours,
    });
  }

  const envTrailPct  = getLiveTrailingStopPercentOverride();
  const envMaxHoldMs = getLivePositionMaxHoldMsOverride();

  return (userId: string, exchange: string | null): ResolvedExitConfig =>
    resolveFrom(
      accountMap.get(userId) ?? null,
      exchange ? perExchangeMap.get(`${userId}:${exchange}`) ?? null : null,
      envTrailPct,
      envMaxHoldMs,
    );
}
