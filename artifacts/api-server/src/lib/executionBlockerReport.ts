/**
 * executionBlockerReport — per-customer execution-blocker report (Profit
 * Optimization P5).
 *
 * Builds ON the existing per-customer attribution funnel
 * (`customerExecutionAttribution.ts`, which already records each user's own
 * live-order outcomes at the `executeCustomerOrder` chokepoint). This module
 * adds the SAFETY CLASSIFICATION the profit-optimization initiative needs:
 * for every blocked reason it states whether the block is
 *   - "tunable"     — relaxable opt-in via a trading-mode preset (confidence
 *                     floor, category allocation),
 *   - "entitlement" — lifted by upgrading the plan (daily limit, slot cap),
 *   - "safety"      — a CORE protection that presets must never remove
 *                     (risk budget, liquidity cushion, duplicate guard,
 *                     exchange validation, eligibility/kill-switch).
 *
 * Read-only. No execution behaviour changes here — this is the diagnostic
 * surface that tells a customer which blockers a preset can address and which
 * are protecting them on purpose.
 */

import {
  ATTRIBUTION_REASONS,
  getCustomerFunnel,
  type AttributionReason,
  type CustomerFunnelSnapshot,
} from "./customerExecutionAttribution.js";

export type BlockerClass = "tunable" | "entitlement" | "safety";

export interface BlockerMeta {
  reason: AttributionReason;
  label: string;
  blockerClass: BlockerClass;
  /** True only for the preset-relaxable levers (confidence, allocation). */
  tunableViaPreset: boolean;
  /** Customer-readable explanation of what this block protects / how to lift it. */
  explanation: string;
  /** Concrete next step the customer can take. */
  action: string;
}

/**
 * Static metadata for every attribution reason. Order follows
 * ATTRIBUTION_REASONS so the report is stable across calls.
 */
export const BLOCKER_META: Record<AttributionReason, BlockerMeta> = {
  confidence: {
    reason: "confidence",
    label: "Signal confidence below floor",
    blockerClass: "tunable",
    tunableViaPreset: true,
    explanation:
      "The signal scored below your minimum confidence, so the trade was skipped.",
    action:
      "The Aggressive Growth preset lowers the confidence floor (still above the safety baseline).",
  },
  allocation: {
    reason: "allocation",
    label: "Category allocation reached",
    blockerClass: "tunable",
    tunableViaPreset: true,
    explanation:
      "Your majors / alts / memes allocation weight for this category was already used.",
    action:
      "Pick a preset (or custom allocation) that gives more weight to this category.",
  },
  cooldown: {
    reason: "cooldown",
    label: "Daily trade limit reached",
    blockerClass: "entitlement",
    tunableViaPreset: false,
    explanation:
      "You hit your plan's daily trade allowance, so new entries paused until reset.",
    action: "Upgrade your plan for a higher daily trade allowance.",
  },
  slot_cap: {
    reason: "slot_cap",
    label: "Concurrent position cap reached",
    blockerClass: "entitlement",
    tunableViaPreset: false,
    explanation:
      "You already hold the maximum number of concurrent positions for your plan.",
    action:
      "Close a position, upgrade your plan, or review the balance-aware concurrency guidance.",
  },
  risk: {
    reason: "risk",
    label: "Risk budget protection",
    blockerClass: "safety",
    tunableViaPreset: false,
    explanation:
      "A per-trade or allocation risk limit protected your capital from over-exposure.",
    action: "Core protection — not removed by any preset.",
  },
  liquidity: {
    reason: "liquidity",
    label: "Liquidity cushion protection",
    blockerClass: "safety",
    tunableViaPreset: false,
    explanation:
      "Your cash cushion was too low to safely open another position.",
    action: "Core protection — fund the account or close positions to free cash.",
  },
  duplicate: {
    reason: "duplicate",
    label: "Duplicate-asset protection",
    blockerClass: "safety",
    tunableViaPreset: false,
    explanation:
      "You already hold a position in this asset, so a second entry was blocked.",
    action: "Core protection — not removed by any preset.",
  },
  exchange: {
    reason: "exchange",
    label: "Exchange / broker validation",
    blockerClass: "safety",
    tunableViaPreset: false,
    explanation:
      "The exchange rejected the order (symbol, venue, credentials, or pricing).",
    action:
      "Core protection — check the connected exchange and that the symbol is tradable.",
  },
  spot_short_blocked: {
    reason: "spot_short_blocked",
    label: "Spot venue — short not supported",
    blockerClass: "safety",
    tunableViaPreset: false,
    explanation:
      "Your connected exchange trades spot only, so a new short (SELL) entry cannot open a position and was skipped before submission.",
    action:
      "Core protection — long (BUY) entries are unaffected; shorting requires a margin/derivatives venue.",
  },
  cash_unavailable: {
    reason: "cash_unavailable",
    label: "Insufficient buying power",
    blockerClass: "safety",
    tunableViaPreset: false,
    explanation:
      "Your deployable USD (cash + USD-pegged stablecoin) could not cover the order size, so the BUY was skipped before submission.",
    action: "Core protection — fund the account or close positions to free cash.",
  },
  other: {
    reason: "other",
    label: "Eligibility / configuration",
    blockerClass: "safety",
    tunableViaPreset: false,
    explanation:
      "An eligibility or configuration gate blocked the trade (universe, kill switch, ARM, disclaimer, account status).",
    action: "Core protection — review your runtime status and account settings.",
  },
};

export interface BlockerRow extends BlockerMeta {
  count: number;
}

export interface ExecutionBlockerReport {
  since: number;
  attempts: number;
  successes: number;
  failures: number;
  /** Conversion = successes / attempts (0 when no attempts). */
  fillRate: number;
  /** All blocker reasons with counts + classification, count desc then stable. */
  blockers: BlockerRow[];
  /** Rollup of failure counts by class. */
  summary: Record<BlockerClass, number>;
}

/** Build the classified blocker report from a customer attribution snapshot. */
export function buildBlockerReport(
  snapshot: CustomerFunnelSnapshot,
): ExecutionBlockerReport {
  const countByReason = new Map<AttributionReason, number>();
  for (const r of snapshot.byReason) countByReason.set(r.reason, r.count);

  const blockers: BlockerRow[] = ATTRIBUTION_REASONS.map((reason) => ({
    ...BLOCKER_META[reason],
    count: countByReason.get(reason) ?? 0,
  })).sort((a, b) => b.count - a.count);

  const summary: Record<BlockerClass, number> = {
    tunable: 0,
    entitlement: 0,
    safety: 0,
  };
  for (const b of blockers) summary[b.blockerClass] += b.count;

  const fillRate =
    snapshot.attempts > 0 ? snapshot.successes / snapshot.attempts : 0;

  return {
    since: snapshot.since,
    attempts: snapshot.attempts,
    successes: snapshot.successes,
    failures: snapshot.failures,
    fillRate: parseFloat(fillRate.toFixed(4)),
    blockers,
    summary,
  };
}

/** Convenience: build the report for one user straight from the funnel store. */
export function getExecutionBlockerReport(userId: string): ExecutionBlockerReport {
  return buildBlockerReport(getCustomerFunnel(userId));
}
