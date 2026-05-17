import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  getUncachableStripeClient,
  getStripePublishableKey,
  getStripeSync,
} from "../stripeClient.js";
import type { Request } from "express";

// ── Billing routes ────────────────────────────────────────────────────────────
//
// All user-facing billing actions: plans, checkout, portal, subscription status.

const router = Router();
type AuthReq = Request & { clerkUserId: string };

// ── Plan definitions (mirrors Stripe product metadata) ────────────────────────

// ── Monetization model ────────────────────────────────────────────────────────
// $5.99/month membership — covers platform access, infrastructure, AI compute.
// PLUS 2% performance fee on PROFITABLE CLOSED trades only.
//   • No fee on losing trades.
//   • No fee on unrealized PnL.
//   • Membership and performance fee are disclosed and accepted at onboarding.

export const MEMBERSHIP_PRICE_USD   = 5.99;
export const PERFORMANCE_FEE_RATE   = 0.02;

export const PLAN_FEATURES: Record<string, {
  name:          string;
  price_monthly: number | null;
  price_yearly:  number | null;
  description:   string;
  features:      string[];
  performanceFee?: number;
  limits: {
    exchanges:  number | string;
    positions:  number | string;
    trades:     number | string;
    liveTrading: boolean;
  };
}> = {
  free: {
    name:          "Free",
    price_monthly: 0,
    price_yearly:  0,
    description:   "Paper trading, 1 exchange, core signals",
    features: [
      "Paper trading only",
      "1 exchange connection",
      "Up to 3 active positions",
      "5 trades/day",
      "Core AI signals",
      "30-day backtest history",
    ],
    limits: { exchanges: 1, positions: 3, trades: 5, liveTrading: false },
  },
  starter: {
    name:           "Starter",
    price_monthly:  599,   // $5.99 in cents (Stripe standard)
    price_yearly:   5990,  // $59.90/yr — 2 months free
    description:    "Platform access + live trading. 2% performance fee on profitable closed trades only.",
    performanceFee: PERFORMANCE_FEE_RATE,
    features: [
      "Live trading enabled",
      "Up to 3 exchange connections",
      "Up to 10 active positions",
      "50 trades/day",
      "Full MTF signal engine",
      "AI confidence engine",
      "90-day backtest history",
      "2% performance fee on profitable trades only",
      "No fee on losing trades",
    ],
    limits: { exchanges: 3, positions: 10, trades: 50, liveTrading: true },
  },
  pro: {
    name:           "Pro",
    price_monthly:  4900,
    price_yearly:   49000,
    description:    "Live trading, unlimited signals, advanced analytics. 2% performance fee on profitable closed trades only.",
    performanceFee: PERFORMANCE_FEE_RATE,
    features: [
      "Live trading enabled",
      "Up to 5 exchange connections",
      "Up to 50 active positions",
      "Unlimited trades/day",
      "Full MTF signal engine",
      "Copy trading",
      "2-year backtest history",
      "Priority API access",
      "2% performance fee on profitable trades only",
    ],
    limits: { exchanges: 5, positions: 50, trades: "unlimited", liveTrading: true },
  },
  enterprise: {
    name:           "Enterprise",
    price_monthly:  14900,
    price_yearly:   149000,
    description:    "Unlimited everything, priority support, multi-account. 2% performance fee on profitable closed trades only.",
    performanceFee: PERFORMANCE_FEE_RATE,
    features: [
      "Everything in Pro",
      "Unlimited exchange connections",
      "Unlimited active positions",
      "Multi-account support",
      "Priority execution queue",
      "Dedicated support",
      "Advanced analytics",
      "Unlimited backtest history",
      "2% performance fee on profitable trades only",
    ],
    limits: { exchanges: "unlimited", positions: "unlimited", trades: "unlimited", liveTrading: true },
  },
};

// ── Helper: ensure Stripe customer exists for user ────────────────────────────

async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  const [user] = await db
    .select({ stripeCustomerId: usersTable.stripeCustomerId })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId))
    .limit(1);

  if (user?.stripeCustomerId) return user.stripeCustomerId;

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({ email, metadata: { clerkUserId: userId } });

  await db
    .update(usersTable)
    .set({ stripeCustomerId: customer.id, billingEmail: email, updatedAt: new Date() })
    .where(eq(usersTable.clerkUserId, userId));

  return customer.id;
}

// ── GET /api/billing/publishable-key ─────────────────────────────────────────
// Returns the Stripe publishable key matching the current environment
// (test key in development, live key in production — always from the connector).
// Safe to call without auth; publishable key is not a secret.

router.get("/billing/publishable-key", async (_req, res): Promise<void> => {
  try {
    const publishableKey = await getStripePublishableKey();
    const mode = publishableKey.startsWith("pk_live_") ? "live" : "test";
    res.json({ publishableKey, mode });
  } catch (err) {
    res.status(503).json({ error: "Stripe connector unavailable" });
  }
});

// ── GET /api/billing/plans ────────────────────────────────────────────────────
// Returns plan metadata + Stripe price IDs (from synced stripe schema).

router.get("/billing/plans", async (_req, res): Promise<void> => {
  try {
    // Try to read live price IDs from synced stripe schema
    let priceRows: Array<{ product_name: string; price_id: string; unit_amount: number; interval: string }> = [];
    try {
      const result = await db.execute(sql`
        SELECT
          p.name            AS product_name,
          p.metadata        AS product_metadata,
          pr.id             AS price_id,
          pr.unit_amount    AS unit_amount,
          pr.recurring->>'interval' AS interval
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount
      `);
      priceRows = result.rows as typeof priceRows;
    } catch {
      // stripe schema not yet initialized — return plan metadata only
    }

    // Build price ID map from stripe schema
    const priceMap: Record<string, { monthly?: string; yearly?: string }> = {};
    for (const row of priceRows) {
      const planKey = row.product_name.toLowerCase().replace(" plan", "").trim();
      priceMap[planKey] ??= {};
      if (row.interval === "month") priceMap[planKey].monthly = row.price_id;
      if (row.interval === "year")  priceMap[planKey].yearly  = row.price_id;
    }

    const plans = Object.entries(PLAN_FEATURES).map(([id, p]) => ({
      id,
      ...p,
      priceIds: priceMap[id] ?? {},
    }));

    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: "Failed to load plans" });
  }
});

// ── GET /api/billing/subscription ────────────────────────────────────────────
// Returns the authenticated user's current plan + subscription details.

router.get("/billing/subscription", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const [user] = await db
      .select({
        plan:                 usersTable.plan,
        planStatus:           usersTable.planStatus,
        stripeCustomerId:     usersTable.stripeCustomerId,
        stripeSubscriptionId: usersTable.stripeSubscriptionId,
        trialEndsAt:          usersTable.trialEndsAt,
        billingEmail:         usersTable.billingEmail,
      })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // Enrich with live stripe subscription if available
    let stripeSubscription: Record<string, unknown> | null = null;
    if (user.stripeSubscriptionId) {
      try {
        const result = await db.execute(
          sql`SELECT * FROM stripe.subscriptions WHERE id = ${user.stripeSubscriptionId} LIMIT 1`,
        );
        stripeSubscription = (result.rows[0] as Record<string, unknown>) ?? null;
      } catch { /* stripe schema not yet initialized */ }
    }

    const planStr    = user.plan       ?? "free";
    const statusStr  = user.planStatus ?? null;
    const isActive   = planStr === "free" || statusStr === "active" || statusStr === "trialing";
    const isPaid     = planStr !== "free";
    const isTrialing = statusStr === "trialing";
    const planLimits = PLAN_FEATURES[planStr]?.limits ?? PLAN_FEATURES["free"]!.limits;
    const canLiveTrade = planLimits.liveTrading && isActive && isPaid;

    const trialEnd         = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
    const daysUntilTrialEnd = trialEnd
      ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000))
      : null;

    res.json({
      plan:                 planStr,
      planStatus:           statusStr,
      stripeCustomerId:     user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      trialEndsAt:          user.trialEndsAt,
      billingEmail:         user.billingEmail,
      subscription:         stripeSubscription,
      isActive,
      isPaid,
      isTrialing,
      canLiveTrade,
      daysUntilTrialEnd,
      limits:               planLimits,
      features:             PLAN_FEATURES[planStr]?.features ?? PLAN_FEATURES["free"]!.features,
    });
  } catch (err) {
    req.log.error({ err }, "GET /billing/subscription failed");
    res.status(500).json({ error: "Failed to load subscription" });
  }
});

// ── POST /api/billing/checkout ────────────────────────────────────────────────
// Creates a Stripe Checkout session for the given priceId.

router.post("/billing/checkout", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const { priceId } = req.body as { priceId?: string };

  if (!priceId) { res.status(400).json({ error: "priceId is required" }); return; }

  try {
    // Get user email for customer creation
    const [user] = await db
      .select({ email: usersTable.email, billingEmail: usersTable.billingEmail })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const customerId = await ensureStripeCustomer(userId, user.billingEmail ?? user.email);
    const stripe     = await getUncachableStripeClient();

    // Priority: explicit WEBHOOK_BASE_URL (production custom domain) →
    // REPLIT_DOMAINS (Replit Reserved VM) → localhost (dev fallback).
    const baseUrl =
      process.env["WEBHOOK_BASE_URL"] ??
      (process.env["REPLIT_DOMAINS"]
        ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0]}`
        : "http://localhost:80");

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ["card"],
      line_items:           [{ price: priceId, quantity: 1 }],
      mode:                 "subscription",
      success_url:          `${baseUrl}/billing?success=1`,
      cancel_url:           `${baseUrl}/billing?canceled=1`,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7,
        metadata:          { clerkUserId: userId },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "POST /billing/checkout failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ── POST /api/billing/portal ──────────────────────────────────────────────────
// Creates a Stripe Customer Portal session for managing subscriptions.

router.post("/billing/portal", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;

  try {
    const [user] = await db
      .select({ stripeCustomerId: usersTable.stripeCustomerId, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      customerId = await ensureStripeCustomer(userId, user.email);
    }

    const stripe = await getUncachableStripeClient();

    const baseUrl =
      process.env["WEBHOOK_BASE_URL"] ??
      (process.env["REPLIT_DOMAINS"]
        ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0]}`
        : "http://localhost:80");

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${baseUrl}/billing`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    req.log.error({ err }, "POST /billing/portal failed");
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

// ── POST /api/billing/sync ────────────────────────────────────────────────────
// Internal: sync subscription status from Stripe webhook events into users table.
// Called by stripe-replit-sync after webhook events (not a user-facing route).

export async function syncSubscriptionStatus(
  clerkUserId:         string,
  stripeSubscriptionId: string,
  plan:                string,
  planStatus:          string,
): Promise<void> {
  await db
    .update(usersTable)
    .set({
      stripeSubscriptionId,
      plan:       plan,
      planStatus: planStatus,
      updatedAt:  new Date(),
    })
    .where(eq(usersTable.clerkUserId, clerkUserId));
}

export default router;
