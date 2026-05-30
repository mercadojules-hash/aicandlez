/**
 * liquidityGuard — Customer AI Trading Liquidity Cushion + Trade Size Control.
 *
 * Pure, dependency-free policy module. Does NOT touch the DB, the network,
 * or any singleton. All inputs are passed in by the caller so the same
 * function backs both the execution gate (`liveUserExecution.ts` gate 0LIQ)
 * and the read-only status endpoint (`routes/userAiLiquidity.ts`). Two
 * callers, one policy — they cannot drift.
 *
 * The guard answers exactly one operational question:
 *
 *   "If I open a new AI trade RIGHT NOW at the customer's chosen
 *    trade size, will I still have enough cash to (a) fund every
 *    remaining slot the plan allows, (b) cover the round-trip
 *    broker fees on each, and (c) leave a small safety cushion?"
 *
 * If the answer is no, we BLOCK the new entry with `liquidity_protected`
 * and surface the user-facing message:
 *
 *   "AI paused new entries to preserve fee/cash cushion."
 *
 * Existing positions are not touched — the customer can still monitor and
 * close them via the normal AI exit logic. Only new entries are gated.
 *
 * Plan tier capacity (free=0, starter=3, pro=6, elite=12) is also enforced
 * here so the operational ceiling stays in one file. The platform-wide
 * concurrent cap (`LIVE_EXECUTION_CONCURRENT_CAP`, default 25) remains a
 * SEPARATE gate upstream — this guard is per-user, plan-scoped, and additive.
 */

export type CustomerPlan = "free" | "starter" | "pro" | "elite";

/** Display label per plan tier (drives user-facing cap messages). */
export const PLAN_LABEL: Record<CustomerPlan, string> = {
  free:    "Free",
  starter: "Starter",
  pro:     "Pro",
  elite:   "Elite VIP",
};

/**
 * Maximum simultaneous open AI positions per plan tier.
 *
 * - free    = 0   (no AI execution; paper-only product surface)
 * - starter = 3   (per locked tier ladder)
 * - pro     = 6   (per locked tier ladder)
 * - elite   = 12  (per locked tier ladder)
 *
 * Admin / super-admin bypass this guard entirely (role-based, enforced
 * upstream in liveUserExecution).
 */
export const PLAN_MAX_OPEN_POSITIONS: Record<CustomerPlan, number> = {
  free:    0,
  starter: 3,
  pro:     6,
  elite:   12,
};

/** Customer trade-size presets surfaced in the PWA + Portal pickers. */
export const ALLOWED_TRADE_SIZES = [10, 20, 50, 100] as const;
export type AllowedTradeSize = (typeof ALLOWED_TRADE_SIZES)[number];

/** Default AI trade size for a brand-new customer (smallest preset). */
export const DEFAULT_TRADE_SIZE_USD: AllowedTradeSize = 10;

/**
 * Round-trip broker fee buffer baked into the liquidity calculation.
 * 0.5% per leg × 2 legs = 1%. Conservative ceiling vs. real maker/taker
 * fees (Kraken Pro ~0.16/0.26%, Coinbase ~0.4/0.6%) so the cushion holds
 * across any exchange the customer might add.
 */
export const FEE_BUFFER_PCT = 0.01;

/**
 * Absolute USD safety cushion on top of `tradeSize × remainingSlots × fee`.
 * Covers spread, slippage, and one missed mark-to-market tick.
 */
export const LIQUIDITY_SAFETY_CUSHION_USD = 5;

/** Standard user-facing message when the cushion gate fires. */
export const LIQUIDITY_PROTECTED_MESSAGE =
  "AI paused new entries to preserve fee/cash cushion.";

/** Standard user-facing message when the plan capacity gate fires. */
export const PLAN_MAX_POSITIONS_MESSAGE = (plan: CustomerPlan, cap: number): string =>
  `${PLAN_LABEL[plan] ?? "Your"} plan allows up to ${cap} concurrent AI position${cap === 1 ? "" : "s"} — close one before opening a new entry.`;

export interface LiquidityGuardInput {
  plan:              CustomerPlan;
  /** Open LIVE positions THIS user currently holds (rows with `exchange IS NOT NULL`). */
  openLiveCount:     number;
  /** Customer's chosen per-trade size (already validated to be in the preset set). */
  tradeSizeUsd:      number;
  /** Cash the customer has available to deploy (NOT total equity). */
  availableCashUsd:  number;
  /**
   * Entitlement-exempt (operator / internal-QA) accounts. When true the
   * plan-tier max-open-positions cap (Gate A) is skipped entirely and the
   * liquidity cushion (Gate B) funds only the single pending entry rather
   * than the whole tier slot count. Liquidity protection is still enforced;
   * the position count simply isn't tier-bounded. `planMaxOpen` /
   * `remainingSlots` echo `-1` (unlimited sentinel) in the result.
   */
  unlimitedPositions?: boolean;
}

export interface LiquidityGuardResult {
  ok:               boolean;
  reasonCode:       "ok" | "plan_max_positions_reached" | "liquidity_protected";
  message:          string | null;
  planMaxOpen:      number;
  remainingSlots:   number;
  /** Cash required to safely run `remainingSlots` × tradeSize with fees + cushion. */
  requiredCashUsd:  number;
  /** Cash currently available — echoed for UI display. */
  availableCashUsd: number;
  feeBufferPct:     number;
  safetyCushionUsd: number;
}

/**
 * Pure evaluator. Inputs assumed sanitized (`tradeSizeUsd` already validated
 * upstream against `ALLOWED_TRADE_SIZES`; caller is responsible). Negative
 * cash / counts are coerced to 0 defensively so a downstream NaN can never
 * produce a "looks fine" verdict.
 */
export function evaluateLiquidityGuard(input: LiquidityGuardInput): LiquidityGuardResult {
  const plan               = input.plan;
  const unlimitedPositions = input.unlimitedPositions === true;
  const planMaxOpen        = PLAN_MAX_OPEN_POSITIONS[plan] ?? 0;
  const openLiveCount      = Math.max(0, Math.floor(input.openLiveCount));
  const tradeSizeUsd       = Math.max(0, input.tradeSizeUsd);
  const availableCashUsd   = Math.max(0, input.availableCashUsd);

  const remainingSlots = unlimitedPositions
    ? Number.POSITIVE_INFINITY
    : Math.max(0, planMaxOpen - openLiveCount);

  // Echo values for the result object. Unlimited-position accounts surface
  // the `-1` unlimited sentinel rather than an unbounded Infinity (which
  // would serialize to null) or a misleading finite tier value.
  const echoPlanMaxOpen    = unlimitedPositions ? -1 : planMaxOpen;
  const echoRemainingSlots = unlimitedPositions ? -1 : remainingSlots;

  // Gate A — plan capacity. Even a customer with infinite cash cannot
  // exceed their tier's open-position cap. Free → always blocked here
  // because cap=0. SKIPPED for entitlement-exempt (operator / internal-QA)
  // accounts, which have no tier position ceiling.
  if (!unlimitedPositions && remainingSlots <= 0) {
    return {
      ok:               false,
      reasonCode:       "plan_max_positions_reached",
      message:          PLAN_MAX_POSITIONS_MESSAGE(plan, planMaxOpen),
      planMaxOpen,
      remainingSlots:   0,
      requiredCashUsd:  0,
      availableCashUsd,
      feeBufferPct:     FEE_BUFFER_PCT,
      safetyCushionUsd: LIQUIDITY_SAFETY_CUSHION_USD,
    };
  }

  // Gate B — liquidity cushion.
  //   required = tradeSize × slots × (1 + feeBuffer) + cushion
  // For normal accounts `slots` = every remaining tier slot, so the floor
  // is the cash to safely RUN all of them at the customer's chosen size
  // with a round-trip fee allowance and a small absolute safety margin. For
  // entitlement-exempt accounts there is no finite slot count, so the floor
  // funds just the single pending entry (slots=1) — liquidity protection
  // still applies, it simply isn't multiplied by an unbounded slot count.
  // Either way, if available cash is below this floor we pause new entries
  // before the AI session risks running dry on fees / margin mid-trade.
  const slotsForCushion = unlimitedPositions ? 1 : remainingSlots;
  const requiredCashUsd =
    tradeSizeUsd * slotsForCushion * (1 + FEE_BUFFER_PCT) + LIQUIDITY_SAFETY_CUSHION_USD;

  if (availableCashUsd < requiredCashUsd) {
    return {
      ok:               false,
      reasonCode:       "liquidity_protected",
      message:          LIQUIDITY_PROTECTED_MESSAGE,
      planMaxOpen:      echoPlanMaxOpen,
      remainingSlots:   echoRemainingSlots,
      requiredCashUsd,
      availableCashUsd,
      feeBufferPct:     FEE_BUFFER_PCT,
      safetyCushionUsd: LIQUIDITY_SAFETY_CUSHION_USD,
    };
  }

  return {
    ok:               true,
    reasonCode:       "ok",
    message:          null,
    planMaxOpen:      echoPlanMaxOpen,
    remainingSlots:   echoRemainingSlots,
    requiredCashUsd,
    availableCashUsd,
    feeBufferPct:     FEE_BUFFER_PCT,
    safetyCushionUsd: LIQUIDITY_SAFETY_CUSHION_USD,
  };
}

/** Coerce an arbitrary value into the preset set (default on miss). */
export function coerceTradeSizeToPreset(value: unknown): AllowedTradeSize {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TRADE_SIZE_USD;
  for (const allowed of ALLOWED_TRADE_SIZES) {
    if (allowed === n) return allowed;
  }
  return DEFAULT_TRADE_SIZE_USD;
}

/** True iff `value` is one of `ALLOWED_TRADE_SIZES`. */
export function isAllowedTradeSize(value: unknown): value is AllowedTradeSize {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return (ALLOWED_TRADE_SIZES as readonly number[]).includes(value);
}
