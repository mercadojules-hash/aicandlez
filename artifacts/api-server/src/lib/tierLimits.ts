/**
 * Per-tier risk policy: maximum USD notional on a single manual LIVE order.
 *
 * Single source of truth shared by:
 *   • `routes/userLiveOrder.ts`  — server-side cap enforcement
 *   • `routes/billing.ts`        — exposes the cap to clients via
 *                                  `GET /api/billing/subscription` so the
 *                                  SignalRow size picker can preempt the
 *                                  `SIZE_EXCEEDS_TIER_CAP` rejection.
 *
 * Operators (admin / super-admin) bypass these caps entirely; the absolute
 * ceiling for any path remains the 100_000 schema cap in parseBody.
 */

export type TierPlan = "free" | "starter" | "pro" | "enterprise";

export const TIER_MAX_SIZE_USD: Record<TierPlan, number> = {
  free:       0,
  starter:    500,
  pro:        2500,
  enterprise: 100_000,
};

/** Hard absolute ceiling enforced by request validation. */
export const ABSOLUTE_MAX_SIZE_USD = 100_000;
