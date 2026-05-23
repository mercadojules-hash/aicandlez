/**
 * Operator-side billing helpers.
 *
 * Centralizes the Stripe calls used by operator user-management actions
 * (`cancel_subscription`, `complimentary_subscription`, `extend_subscription`,
 * and the Stripe leg of `emergency_disable`). The customer-facing billing
 * routes own checkout + portal + subscription read; this module owns the
 * operator-write side. Both go through the same `getUncachableStripeClient`
 * so credentials and Stripe-mode resolution stay centralized — no operator
 * route reaches Stripe directly.
 *
 * Idempotency is the caller's responsibility: every helper takes an
 * `idempotencyKey` and forwards it to Stripe. Operator routes derive a
 * day-stable key from (action, target, actor, UTC day) so a flapping
 * operator click cannot double-charge or double-grant.
 */

import { getUncachableStripeClient } from "../stripeClient.js";

export interface StripeSubscriptionOutcome {
  id:         string;
  status:     string;
  cancelAt:   number | null;
  trialEnd:   number | null;
}

function shape(sub: { id: string; status: string; cancel_at?: number | null; trial_end?: number | null }): StripeSubscriptionOutcome {
  return {
    id:       sub.id,
    status:   sub.status,
    cancelAt: sub.cancel_at ?? null,
    trialEnd: sub.trial_end ?? null,
  };
}

/** Schedule the subscription to cancel at the end of the current period.
 *  Customers retain access through paid-through-date. */
export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string,
  idempotencyKey: string,
): Promise<StripeSubscriptionOutcome> {
  const stripe = await getUncachableStripeClient();
  const sub = await stripe.subscriptions.update(
    subscriptionId,
    { cancel_at_period_end: true },
    { idempotencyKey },
  );
  return shape(sub);
}

/** Immediately cancel a subscription (no period-end grace). Used by
 *  `cancel_subscription` only when explicitly requested with
 *  `cancelAtPeriodEnd: false`. */
export async function cancelSubscriptionImmediately(
  subscriptionId: string,
  idempotencyKey: string,
): Promise<StripeSubscriptionOutcome> {
  const stripe = await getUncachableStripeClient();
  const sub = await stripe.subscriptions.cancel(subscriptionId, {}, { idempotencyKey });
  return shape(sub);
}

/** Grant a complimentary period by pushing `trial_end` forward N days.
 *  Stripe-native, proration disabled so the customer is not retroactively
 *  charged for the comp window. */
export async function grantComplimentaryDays(
  subscriptionId: string,
  days: number,
  idempotencyKey: string,
): Promise<StripeSubscriptionOutcome> {
  const stripe = await getUncachableStripeClient();
  const trialEndUnix = Math.floor(Date.now() / 1000) + days * 86_400;
  const sub = await stripe.subscriptions.update(
    subscriptionId,
    { trial_end: trialEndUnix, proration_behavior: "none" },
    { idempotencyKey },
  );
  return shape(sub);
}

/** Extend the current period by N days (operationally equivalent to
 *  `grantComplimentaryDays`; kept distinct so audit labels and idempotency
 *  keys read clearly). */
export async function extendSubscriptionByDays(
  subscriptionId: string,
  days: number,
  idempotencyKey: string,
): Promise<StripeSubscriptionOutcome> {
  return grantComplimentaryDays(subscriptionId, days, idempotencyKey);
}
