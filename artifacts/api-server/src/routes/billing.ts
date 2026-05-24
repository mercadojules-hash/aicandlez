import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireDisclaimer } from "../middlewares/requireDisclaimer.js";
import { TIER_MAX_SIZE_USD, type TierPlan } from "../lib/tierLimits.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { resolveCustomerAppBaseUrl } from "../lib/customerAppUrl.js";
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
//   • AI Trading      $39.99/mo — up to 3 concurrent AI trades, crypto live exec
//   • AI Trading Pro  $79.99/mo — up to 12 concurrent AI trades, crypto + equities
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

  // ── AI TRADING — $39.99/month ───────────────────────────────────────────────
  // Plan key kept as `starter` for DB enum compatibility with existing users.
  starter: {
    name:           "AICandlez Starter",
    price_monthly:  3999,   // $39.99 in cents (Stripe standard)
    price_yearly:   39990,  // $399.90/yr — 2 months free
    description:    "Live AI execution + AI Auto Trade. 3 concurrent AI trades. 3% performance fee on profitable closed trades only.",
    performanceFee: PERFORMANCE_FEE_RATE,
    features: [
      "Live AI execution enabled",
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
      concurrentTrades: 3, liveTrading: true, aiAutoTrade: true, equitiesAI: false,
    },
  },

  // ── AI TRADING PRO — $79.99/month ───────────────────────────────────────────
  // Plan key kept as `pro` for DB enum compatibility with existing users.
  pro: {
    name:           "AICandlez Pro",
    price_monthly:  7999,   // $79.99 in cents
    price_yearly:   79990,  // $799.90/yr — 2 months free
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

    // Per-trade LIVE order USD cap (mirrors server-side enforcement in
    // routes/userLiveOrder.ts via shared `lib/tierLimits.ts`). Surfacing
    // this lets the client (SignalRow size picker) preempt the
    // SIZE_EXCEEDS_TIER_CAP rejection by greying out over-cap presets
    // and clamping the custom input.
    const liveOrderCapUSD =
      TIER_MAX_SIZE_USD[planStr as TierPlan] ?? TIER_MAX_SIZE_USD.free;
    const nextTier: TierPlan | null =
      planStr === "free"    ? "starter" :
      planStr === "starter" ? "pro"     :
      null;
    const nextTierLiveOrderCapUSD = nextTier
      ? TIER_MAX_SIZE_USD[nextTier]
      : null;

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
      liveOrderCapUSD,
      nextTierLiveOrderCapUSD,
      nextTier,
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

router.post("/billing/checkout", requireAuth, requireDisclaimer, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  // Diagnostic logging for production 403 triage — captures origin + auth
  // shape so the "Your account does not have permission to upgrade" path
  // (Portal.tsx:1037, res.status===403) can be root-caused from logs alone.
  // requireAuth itself returns 401 not 403, so a 403 reaching this handler
  // would indicate an upstream middleware (CORS / proxy / Clerk JWT) is the
  // source — these logs surface enough context to identify which.
  req.log.info(
    {
      origin:    req.headers.origin,
      referer:   req.headers.referer,
      host:      req.headers.host,
      userIdLen: userId?.length ?? 0,
      hasAuth:   Boolean(req.headers.authorization),
      hasCookie: Boolean(req.headers.cookie),
      planId:    (req.body as { planId?: string })?.planId,
    },
    "[checkout] request accepted (post-requireAuth)",
  );
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

    // Resolution order:
    //   1. Env vars STRIPE_PRICE_{STARTER,PRO}_{MONTHLY,YEARLY} — fastest, no DB
    //      dependency, and canonical per replit.md. This is the primary path.
    //   2. stripe.* synced schema fallback — used only when the env var is not
    //      set, e.g. during ops/migration windows.
    const period = body.billingPeriod === "yearly" ? "YEARLY" : "MONTHLY";
    const envKey =
      body.planId === "starter" ? `STRIPE_PRICE_STARTER_${period}` :
      body.planId === "pro"     ? `STRIPE_PRICE_PRO_${period}`     :
      null;
    if (envKey) {
      const fromEnv = process.env[envKey];
      if (fromEnv && fromEnv.startsWith("price_")) priceId = fromEnv;
    }

    if (!priceId) {
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
      } catch (err) {
        // Log the actual error so future failures are diagnosable. Prior
        // code swallowed this silently — that's what masked the original
        // "Stripe price not configured" complaint.
        req.log.error({ err, planId: body.planId }, "[checkout] stripe schema lookup failed");
      }
    }
  }

  if (!priceId) {
    req.log.warn(
      { planId: body.planId, billingPeriod: body.billingPeriod, hadPriceIdInBody: Boolean(body.priceId) },
      "[checkout] could not resolve priceId from env or stripe schema",
    );
    res.status(400).json({ error: "priceId or valid planId is required (Stripe price not configured)" });
    return;
  }

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

    // Task #162 Phase B: derive return host from request Origin (allow-listed)
    // so PWA checkout returns land on the customer host (app./trade.) — not
    // api.aicandlez.com (WEBHOOK_BASE_URL) which 404s. Falls back to
    // CUSTOMER_APP_BASE_URL env, then the legacy WEBHOOK_BASE_URL chain.
    // The return path is *server-controlled* (`/billing?success=1` /
    // `/billing?canceled=1`) — client-provided successUrl/cancelUrl are
    // intentionally ignored to enforce the canonical billing-return
    // contract regardless of which call site initiates checkout.
    const baseUrl = resolveCustomerAppBaseUrl(req.get("origin") ?? undefined);

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

    // Same Origin-aware derivation as the checkout handler (Task #162 Phase B).
    // Return path is server-controlled (`/billing`) — client overrides are
    // ignored to keep the billing-return contract uniform.
    const baseUrl = resolveCustomerAppBaseUrl(req.get("origin") ?? undefined);

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

// ─────────────────────────────────────────────────────────────────────────────
// Phase C — Prepaid credit top-ups & outstanding-fee payments
// ─────────────────────────────────────────────────────────────────────────────
//
// `POST /api/billing/topup`            — fixed-pack Stripe Checkout (payment mode)
// `POST /api/billing/pay_outstanding`  — pay current outstanding fees directly
//
// Webhook fulfillment (payment_intent.succeeded with metadata.type) lives in
// `webhookHandlers.ts` so a single Stripe endpoint covers both subscription
// (stripe-replit-sync) and credit/outstanding flows.
//
// Auto-restoration is handled inside `evaluateAndEnforceBillingHold`, which is
// invoked from the webhook fulfillment path. It preserves moderation
// precedence (never overrides suspended / disabled / force_paper).
//
// Strict invariants preserved:
//   - This route only mints Stripe Checkout sessions; no exchange, queue,
//     trading-loop, or auth-routing surface is touched.
//   - No client-overridable success/cancel URLs (server-derived, same as
//     subscription checkout — Task #162 Phase B).

import { checkBillingHealth } from "../lib/billingEnforcement.js";

const CREDIT_TOPUP_PACKS_USD = [25, 50, 100, 250] as const;
type CreditPack = (typeof CREDIT_TOPUP_PACKS_USD)[number];

router.post("/billing/topup", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const body   = req.body as { amount?: number };
  const amt    = Number(body?.amount);

  if (!CREDIT_TOPUP_PACKS_USD.includes(amt as CreditPack)) {
    res.status(400).json({
      error:     "Invalid amount. Allowed packs: $25, $50, $100, $250.",
      allowed:   CREDIT_TOPUP_PACKS_USD,
    });
    return;
  }

  try {
    const [user] = await db
      .select({ email: usersTable.email, billingEmail: usersTable.billingEmail })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const customerId = await ensureStripeCustomer(userId, user.billingEmail ?? user.email);
    const stripe     = await getUncachableStripeClient();
    const baseUrl    = resolveCustomerAppBaseUrl(req.get("origin") ?? undefined);

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ["card"],
      mode:                 "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency:     "usd",
          unit_amount:  amt * 100,
          product_data: {
            name:        `AICandlez Credit Top-Up ($${amt})`,
            description: "Prepaid balance used to settle performance fees on profitable closed trades.",
          },
        },
      }],
      // Critical: metadata propagates to the PaymentIntent so the webhook
      // path can disambiguate credit_topup vs outstanding_payment vs unrelated
      // future flows. The clerkUserId carries identity since the PaymentIntent
      // itself is not user-scoped at the API layer.
      payment_intent_data: {
        metadata: {
          type:        "credit_topup",
          clerkUserId: userId,
          packUsd:     String(amt),
        },
      },
      metadata: {
        type:        "credit_topup",
        clerkUserId: userId,
        packUsd:     String(amt),
      },
      success_url: `${baseUrl}/billing?topup=success`,
      cancel_url:  `${baseUrl}/billing?topup=canceled`,
    });

    res.json({ url: session.url, amount: amt });
  } catch (err) {
    req.log.error({ err, userId, amount: amt }, "POST /billing/topup failed");
    res.status(500).json({ error: "Failed to create top-up session" });
  }
});

router.post("/billing/pay_outstanding", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;

  try {
    const health = await checkBillingHealth(userId);
    if (health.netOwed <= 0) {
      res.status(400).json({ error: "No outstanding balance to pay.", netOwed: 0 });
      return;
    }

    // Minimum Stripe charge ($0.50). Round UP to cent precision so the
    // user is never undercharged by float drift; any leftover (sub-cent or
    // whole-cent surplus) is added to credits by applyPaymentToOutstandingFees.
    const amountCents = Math.max(50, Math.ceil(health.netOwed * 100));
    const amountUsd   = amountCents / 100;

    const [user] = await db
      .select({ email: usersTable.email, billingEmail: usersTable.billingEmail })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const customerId = await ensureStripeCustomer(userId, user.billingEmail ?? user.email);
    const stripe     = await getUncachableStripeClient();
    const baseUrl    = resolveCustomerAppBaseUrl(req.get("origin") ?? undefined);

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ["card"],
      mode:                 "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency:    "usd",
          unit_amount: amountCents,
          product_data: {
            name:        "AICandlez — Outstanding Performance Fees",
            description: `Clears the current outstanding balance of $${health.netOwed.toFixed(2)}.`,
          },
        },
      }],
      payment_intent_data: {
        metadata: {
          type:           "outstanding_payment",
          clerkUserId:    userId,
          netOwedAtStart: String(health.netOwed.toFixed(2)),
          amountUsd:      String(amountUsd.toFixed(2)),
        },
      },
      metadata: {
        type:           "outstanding_payment",
        clerkUserId:    userId,
        netOwedAtStart: String(health.netOwed.toFixed(2)),
        amountUsd:      String(amountUsd.toFixed(2)),
      },
      success_url: `${baseUrl}/billing?outstanding=success`,
      cancel_url:  `${baseUrl}/billing?outstanding=canceled`,
    });

    res.json({ url: session.url, amount: amountUsd, netOwed: health.netOwed });
  } catch (err) {
    req.log.error({ err, userId }, "POST /billing/pay_outstanding failed");
    res.status(500).json({ error: "Failed to create outstanding payment session" });
  }
});

export default router;
