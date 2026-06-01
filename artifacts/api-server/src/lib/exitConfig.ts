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
 *   1. Env operator override  — `LIVE_TRAILING_STOP_PERCENT` /
 *      `LIVE_POSITION_MAX_HOLD_MS`. A global escape hatch; when SET it wins for
 *      trailing / max-hold so the operator can tune or kill those exits without
 *      a redeploy. (SL/TP have no env knob.)
 *   2. Per-(user, exchange) override — `user_exchange_settings` columns. NULL →
 *      inherit the account default.
 *   3. Account default — `user_settings`. SL/TP are always present (NOT NULL
 *      cols); trailing / max-hold are nullable.
 *   4. Hardcoded default — SL 2 %, TP 4 %, trailing = mirror SL band, max-hold
 *      24h. These reproduce the EXACT pre-#220 live behavior, so an account
 *      that never touches the controls keeps today's exits byte-for-byte.
 *
 * `trailingStopPercent === null` is meaningful: it tells the live monitor to
 * mirror each position's own stored stop-loss band (the locked default), rather
 * than apply a fixed distance. An explicit `0` disables trailing; `0` max-hold
 * disables the time ceiling.
 */

export const EXIT_DEFAULTS = {
  stopLossPercent:     2,
  takeProfitPercent:   4,
  trailingStopPercent: 1.5,
  maxHoldHours:        24,
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

// ── Env operator overrides (global escape hatch) ──────────────────────────────

/**
 * Live trailing-stop override (percent). `null` when the env var is unset —
 * the resolver then falls through to per-exchange / account config. A value of
 * `0` disables live trailing globally.
 */
export function getLiveTrailingStopPercentOverride(): number | null {
  const raw = process.env.LIVE_TRAILING_STOP_PERCENT;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Live max-hold override in milliseconds. `null` when the env var is unset (so
 * per-account config applies); a value of `0` disables max-hold globally.
 *
 * Distinct from `tradingLoop.getLivePositionMaxHoldMs()` which ALWAYS returns a
 * number (defaulting to 24h) and therefore can't tell "operator set 24h" from
 * "unset". This override-shaped reader is what lets per-account config slot into
 * the gap when the operator has NOT pinned a global ceiling.
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

  // Trailing: env override wins; else per-exchange; else account; else null
  // (= mirror SL band — the locked default the monitor already implements).
  let trailingStopPercent: number | null;
  if (envTrailPct !== null) {
    trailingStopPercent = envTrailPct;
  } else {
    trailingStopPercent =
      perExchange?.trailingStopPercent ??
      account?.trailingStopPercent ??
      EXIT_DEFAULTS.trailingStopPercent;
  }

  // Max-hold: env override wins; else per-exchange hours; else account hours;
  // else hardcoded 24h. 0 = disabled.
  let maxHoldMs: number;
  let maxHoldHours: number;
  if (envMaxHoldMs !== null) {
    maxHoldMs    = envMaxHoldMs;
    maxHoldHours = envMaxHoldMs / 3_600_000;
  } else {
    maxHoldHours =
      perExchange?.maxHoldHours ??
      account?.maxHoldHours ??
      EXIT_DEFAULTS.maxHoldHours;
    maxHoldMs = Math.round(maxHoldHours * 3_600_000);
  }

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
