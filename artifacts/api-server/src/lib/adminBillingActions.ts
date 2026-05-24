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

/** Create a brand-new complimentary subscription for a user who has no
 *  existing Stripe subscription. Used by Admin Console "Create Complimentary
 *  STARTER/PRO" for influencers, beta testers, reviewers, partners.
 *
 *  Flow:
 *    1. Lookup or create Stripe customer (by email, metadata.clerkUserId)
 *    2. stripe.subscriptions.create({ items: [{ price }], trial_period_days })
 *    3. Caller is responsible for persisting `stripe_subscription_id`,
 *       `plan`, `plan_status='trialing'`, `trial_ends_at` on the users row.
 *
 *  No upfront charge — Stripe collects nothing until trial ends. Caller
 *  should set `cancel_at_period_end=true` afterwards if comp should NOT
 *  auto-renew (default behaviour here = auto-cancel at trial end).
 */
export async function createComplimentarySubscription(opts: {
  email:           string;
  clerkUserId:     string;
  priceId:         string;
  days:            number;
  existingCustomerId?: string | null;
  idempotencyKey:  string;
  autoCancelAtTrialEnd?: boolean;
}): Promise<{ subscription: StripeSubscriptionOutcome; customerId: string }> {
  const stripe = await getUncachableStripeClient();

  let customerId = opts.existingCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create(
      { email: opts.email, metadata: { clerkUserId: opts.clerkUserId } },
      { idempotencyKey: `${opts.idempotencyKey}-cust` },
    );
    customerId = customer.id;
  }

  const sub = await stripe.subscriptions.create(
    {
      customer:           customerId,
      items:              [{ price: opts.priceId }],
      trial_period_days:  opts.days,
      // Auto-cancel at trial end so comp users don't accidentally start
      // paying. Operator can flip this later via extend/cancel actions.
      cancel_at_period_end: opts.autoCancelAtTrialEnd ?? true,
      payment_behavior:   "default_incomplete",
      metadata:           {
        complimentary:   "true",
        clerkUserId:     opts.clerkUserId,
        compDays:        String(opts.days),
      },
    },
    { idempotencyKey: opts.idempotencyKey },
  );

  return { subscription: shape(sub), customerId };
}

/** Resolve a Stripe monthly price ID for a plan tier. Env-first, matches the
 *  same resolution used by customer-facing checkout. */
export function resolvePriceIdForPlan(plan: "starter" | "pro"): string | null {
  const envKey = plan === "starter" ? "STRIPE_PRICE_STARTER_MONTHLY" : "STRIPE_PRICE_PRO_MONTHLY";
  const val = process.env[envKey];
  return val && val.startsWith("price_") ? val : null;
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

/** Extend the END of the current paid period by N days. Unlike
 *  `grantComplimentaryDays` (which always pushes `trial_end` from *now*
 *  and is a goodwill grant for a paused / unpaid customer), this reads
 *  the subscription's existing `current_period_end` (falling back to
 *  `trial_end`, then `now`) and pushes from there. Stacking multiple
 *  extensions for an active subscription therefore grows the runway by
 *  exactly N days each call instead of resetting to `now + N`. */
export async function extendSubscriptionByDays(
  subscriptionId: string,
  days: number,
  idempotencyKey: string,
): Promise<StripeSubscriptionOutcome> {
  const stripe = await getUncachableStripeClient();
  const existing = await stripe.subscriptions.retrieve(subscriptionId) as unknown as {
    current_period_end?: number | null;
    trial_end?:          number | null;
  };
  const nowUnix  = Math.floor(Date.now() / 1000);
  const base     = Math.max(
    existing.current_period_end ?? 0,
    existing.trial_end          ?? 0,
    nowUnix,
  );
  const trialEndUnix = base + days * 86_400;
  const sub = await stripe.subscriptions.update(
    subscriptionId,
    { trial_end: trialEndUnix, proration_behavior: "none" },
    { idempotencyKey },
  );
  return shape(sub);
}
