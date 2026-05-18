import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
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
// 3-tier subscription ladder:
//   • Paper Trading (free)      — signals + simulated buy/sell, no live execution
//   • AI Trading      $15.99/mo — up to 6 concurrent AI trades, crypto live exec
//   • AI Trading Pro  $39.99/mo — up to 12 concurrent AI trades, crypto + equities
// PLUS 3% performance fee on PROFITABLE CLOSED trades only.
//   • No fee on losing trades.
//   • No fee on unrealized PnL.
//   • Tier and performance fee are disclosed and accepted at onboarding.

export const PERFORMANCE_FEE_RATE   = 0.03;

export const PLAN_FEATURES: Record<string, {
  name:          string;
  price_monthly: number | null;
  price_yearly:  number | null;
  description:   string;
  features:      string[];
  performanceFee?: number;
  limits: {
    exchanges:        number | string;
    positions:        number | string;
    trades:           number | string;
    concurrentTrades: number;            // Max simultaneous AI-managed trades
    liveTrading:      boolean;
    aiAutoTrade:      boolean;           // Autonomous AI execution unlocked
    equitiesAI:       boolean;           // Stocks AI trading unlocked (Pro only)
  };
}> = {
  // ── PAPER TRADING (FREE) ────────────────────────────────────────────────────
  // Signals + simulated buy/sell only. No live AI execution.
  free: {
    name:          "Paper Trading",
    price_monthly: 0,
    price_yearly:  0,
    description:   "AI signals + paper trading. No live execution.",
    features: [
      "AI signals",
      "Paper trading only",
      "Market scanning",
      "AI confidence engine",
      "Watchlists",
      "Simulated buy/sell only",
    ],
    limits: {
      exchanges: 1, positions: 3, trades: 5,
      concurrentTrades: 0, liveTrading: false, aiAutoTrade: false, equitiesAI: false,
    },
  },

  // ── AI TRADING — $15.99/month ───────────────────────────────────────────────
  // Plan key kept as `starter` for DB enum compatibility with existing users.
  starter: {
    name:           "AI Trading",
    price_monthly:  1599,   // $15.99 in cents (Stripe standard)
    price_yearly:   15990,  // $159.90/yr — 2 months free
    description:    "Live AI Trading + AI Auto Trade. 3 concurrent AI trades. 3% performance fee on profitable closed trades only.",
    performanceFee: PERFORMANCE_FEE_RATE,
    features: [
      "Live AI Trading enabled",
      "Up to 3 concurrent AI trades",
      "AI Auto Trade enabled",
      "Crypto AI execution",
      "AI portfolio tracking",
      "AI performance analytics",
      "Live exchange connection",
      "3% performance fee on profitable trades only",
      "No fee on losing trades",
    ],
    limits: {
      exchanges: 3, positions: 10, trades: 50,
      concurrentTrades: 6, liveTrading: true, aiAutoTrade: true, equitiesAI: false,
    },
  },

  // ── AI TRADING PRO — $39.99/month ───────────────────────────────────────────
  // Plan key kept as `pro` for DB enum compatibility with existing users.
  pro: {
    name:           "AI Trading Pro",
    price_monthly:  3999,   // $39.99 in cents
    price_yearly:   39990,  // $399.90/yr — 2 months free
    description:    "Expanded AI capacity. 12 concurrent trades. Crypto + Equities. Priority execution. 3% performance fee on profitable closed trades only.",
    performanceFee: PERFORMANCE_FEE_RATE,
    features: [
      "Up to 12 concurrent AI trades",
      "Priority AI execution",
      "Crypto + Equities AI trading",
      "Advanced AI scanners",
      "Expanded AI confidence engine",
      "Enhanced analytics",
      "Advanced AI automation controls",
      "3% performance fee on profitable trades only",
    ],
    limits: {
      exchanges: 5, positions: 50, trades: "unlimited",
      concurrentTrades: 12, liveTrading: true, aiAutoTrade: true, equitiesAI: true,
    },
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

    // Build price ID map from stripe schema.
    //
    // Stripe product NAMES are mapped to internal PLAN_FEATURES KEYS so the
    // app stays decoupled from human-readable product naming in Stripe.
    // Both the new branded names ("AI Trading", "AI Trading Pro", "Paper
    // Trading") and the legacy names ("Starter", "Pro", "Free") are accepted.
    const NAME_TO_KEY: Record<string, string> = {
      "paper trading":  "free",
      "free":           "free",
      "ai trading":     "starter",
      "starter":        "starter",
      "ai trading pro": "pro",
      "pro":            "pro",
    };
    const priceMap: Record<string, { monthly?: string; yearly?: string }> = {};
    for (const row of priceRows) {
      const normalized = row.product_name.toLowerCase().replace(/\s+plan$/, "").trim();
      const planKey    = NAME_TO_KEY[normalized] ?? normalized;
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
  // Accept either `priceId` (direct Stripe price) or `planId` (internal plan
  // key — `free`/`starter`/`pro`). When `planId` is supplied, we look up the
  // active monthly price from the synced stripe schema.
  const body = req.body as {
    priceId?: string;
    planId?:  string;
    billingPeriod?: "monthly" | "yearly";
  };
  let priceId = body.priceId;

  if (!priceId && body.planId) {
    if (body.planId === "free") {
      res.status(400).json({ error: "Free plan does not require checkout" });
      return;
    }
    try {
      const result = await db.execute(sql`
        SELECT p.name AS product_name, pr.id AS price_id,
               pr.recurring->>'interval' AS interval
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
      `);
      const NAME_TO_KEY: Record<string, string> = {
        "paper trading":  "free",
        "free":           "free",
        "ai trading":     "starter",
        "starter":        "starter",
        "ai trading pro": "pro",
        "pro":            "pro",
      };
      const desiredInterval = body.billingPeriod === "yearly" ? "year" : "month";
      for (const r of result.rows as Array<{ product_name: string; price_id: string; interval: string }>) {
        const normalized = r.product_name.toLowerCase().replace(/\s+plan$/, "").trim();
        const planKey    = NAME_TO_KEY[normalized] ?? normalized;
        if (planKey === body.planId && r.interval === desiredInterval) {
          priceId = r.price_id;
          break;
        }
      }
    } catch {
      // stripe schema unavailable — fall through to "priceId required" error
    }
  }

  if (!priceId) { res.status(400).json({ error: "priceId or valid planId is required (Stripe price not configured)" }); return; }

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

  const eventType =
    planStatus === "canceled" || planStatus === "expired" ? "SUBSCRIPTION_EXPIRED" :
    planStatus === "past_due" || planStatus === "unpaid"  ? "BILLING_FAILED"       :
    "SUBSCRIPTION_CHANGED";

  auditLogger.append(clerkUserId, eventType, {
    plan, planStatus, stripeSubscriptionId,
  }, {
    severity: eventType === "BILLING_FAILED" ? "critical" : eventType === "SUBSCRIPTION_EXPIRED" ? "warn" : "info",
  });
}

export default router;
