/**
 * concurrencyAdvisor — balance-aware concurrency RECOMMENDATION (Profit
 * Optimization P6).
 *
 * Advisory ONLY. This module never changes the hard caps enforced at
 * execution time (`PLAN_MAX_OPEN_POSITIONS` in liquidityGuard.ts, the
 * platform-wide live cap, or the per-user risk budget). It answers a
 * single customer-facing question: "given my current equity and my
 * per-trade size, how many concurrent positions can I realistically fund
 * while keeping a cash cushion?".
 *
 * The recommendation is derived from live equity (or paper equity when the
 * user has no funded live venue), NOT hardcoded — a $500 account on $100
 * trades is told ~3-4 slots even though its plan cap may be 6.
 */

import {
  ALLOWED_TRADE_SIZES,
  PLAN_MAX_OPEN_POSITIONS,
  type CustomerPlan,
} from "./liquidityGuard.js";

/**
 * Cash-cushion reserve fractions. Each profile keeps a slice of equity
 * un-deployed so a customer is never recommended to put 100% of capital at
 * risk. `balanced` drives the headline `recommended` number.
 */
export const CONCURRENCY_RESERVE = {
  conservative: 0.4,
  balanced: 0.25,
  aggressive: 0.1,
} as const;

export interface ConcurrencyAdvisorInput {
  /** Per-user equity in USD (live active-exchange equity, or paper equity). */
  equityUSD: number;
  /** The customer's per-trade size (preferredLiveOrderSizeUsd). */
  tradeSizeUSD: number;
  /** The customer's billing plan (drives the per-plan hard cap). */
  plan: CustomerPlan;
  /** Admin / internal accounts bypass the per-plan cap (capital-only). */
  isUnlimited?: boolean;
}

export interface ConcurrencyTierRange {
  tradeSizeUSD: number;
  /** Slots fundable at each reserve profile, already capped by the plan. */
  conservative: number;
  balanced: number;
  aggressive: number;
}

export interface ConcurrencyRecommendation {
  equityUSD: number;
  tradeSizeUSD: number;
  plan: CustomerPlan;
  /** Hard per-plan cap (unchanged by this module). null = unlimited. */
  planMaxPositions: number | null;
  /** Headline recommendation: balanced reserve, capped by plan. */
  recommended: number;
  /** True when the PLAN cap (not capital) is the binding constraint. */
  capLimitedByPlan: boolean;
  /** True when CAPITAL (not the plan cap) is the binding constraint. */
  capLimitedByBalance: boolean;
  /** Reserve fraction used for the headline `recommended`. */
  reserveFraction: number;
  /** Per-size-tier ranges across every allowed trade size. */
  perTier: ConcurrencyTierRange[];
  note: string;
}

function slotsFor(
  equityUSD: number,
  tradeSizeUSD: number,
  reserveFraction: number,
  planCap: number,
  isUnlimited: boolean,
): number {
  if (!Number.isFinite(equityUSD) || equityUSD <= 0) return 0;
  if (!Number.isFinite(tradeSizeUSD) || tradeSizeUSD <= 0) return 0;
  const deployable = equityUSD * (1 - reserveFraction);
  const byCapital = Math.floor(deployable / tradeSizeUSD);
  const capped = isUnlimited ? byCapital : Math.min(byCapital, planCap);
  return Math.max(0, capped);
}

export function recommendConcurrency(
  input: ConcurrencyAdvisorInput,
): ConcurrencyRecommendation {
  const { equityUSD, tradeSizeUSD, plan } = input;
  const isUnlimited = input.isUnlimited ?? false;
  const planCapRaw = PLAN_MAX_OPEN_POSITIONS[plan] ?? 0;
  const planCap = isUnlimited ? Number.POSITIVE_INFINITY : planCapRaw;

  const reserveFraction = CONCURRENCY_RESERVE.balanced;
  const recommended = slotsFor(
    equityUSD,
    tradeSizeUSD,
    reserveFraction,
    planCap,
    isUnlimited,
  );

  // What capital alone (balanced reserve) would allow, ignoring the plan cap.
  const byCapitalBalanced =
    Number.isFinite(equityUSD) &&
    equityUSD > 0 &&
    Number.isFinite(tradeSizeUSD) &&
    tradeSizeUSD > 0
      ? Math.max(
          0,
          Math.floor((equityUSD * (1 - reserveFraction)) / tradeSizeUSD),
        )
      : 0;

  const capLimitedByPlan = !isUnlimited && byCapitalBalanced > planCapRaw;
  const capLimitedByBalance =
    (isUnlimited || byCapitalBalanced <= planCapRaw) && byCapitalBalanced >= 0
      ? byCapitalBalanced === recommended && !capLimitedByPlan
      : false;

  const perTier: ConcurrencyTierRange[] = ALLOWED_TRADE_SIZES.map((size) => ({
    tradeSizeUSD: size,
    conservative: slotsFor(
      equityUSD,
      size,
      CONCURRENCY_RESERVE.conservative,
      planCap,
      isUnlimited,
    ),
    balanced: slotsFor(
      equityUSD,
      size,
      CONCURRENCY_RESERVE.balanced,
      planCap,
      isUnlimited,
    ),
    aggressive: slotsFor(
      equityUSD,
      size,
      CONCURRENCY_RESERVE.aggressive,
      planCap,
      isUnlimited,
    ),
  }));

  let note: string;
  if (recommended === 0) {
    note =
      equityUSD <= 0
        ? "No fundable equity detected — connect or fund an exchange to size concurrency."
        : `Equity ${fmtUSD(equityUSD)} is below one ${fmtUSD(tradeSizeUSD)} trade after the cash cushion.`;
  } else if (capLimitedByPlan) {
    note = `Your balance could fund more, but your plan caps concurrent positions at ${planCapRaw}.`;
  } else {
    note = `Balance supports ~${recommended} concurrent ${fmtUSD(tradeSizeUSD)} positions while keeping a ${Math.round(
      reserveFraction * 100,
    )}% cash cushion.`;
  }

  return {
    equityUSD: round2(equityUSD),
    tradeSizeUSD,
    plan,
    planMaxPositions: isUnlimited ? null : planCapRaw,
    recommended,
    capLimitedByPlan,
    capLimitedByBalance,
    reserveFraction,
    perTier,
    note,
  };
}

function round2(n: number): number {
  return Number.isFinite(n) ? parseFloat(n.toFixed(2)) : 0;
}

function fmtUSD(n: number): string {
  return `$${round2(n).toLocaleString("en-US")}`;
}
