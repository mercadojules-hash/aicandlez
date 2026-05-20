import { Router } from "express";
import { db } from "@workspace/db";
import { performanceFeesTable, userConsentsTable, usersTable } from "@workspace/db";
import { sql, eq, desc, gt } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

// ── Admin Analytics ───────────────────────────────────────────────────────────
// All routes require auth + admin/super-admin role.
//
// Exposes two analytics streams:
//   1. Membership analytics  — subscriptions, MRR, churn (sourced from Stripe sync)
//   2. Performance fee analytics — realized profitable volume, fees, pending settlements

const router = Router();

// ── GET /api/admin/analytics/fees ─────────────────────────────────────────────
// Performance fee analytics: realized profitable volume, fees generated,
// pending vs settled, per-exchange breakdown, top profitable users.

router.get(
  "/admin/analytics/fees",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    try {
      // Total fees
      const [totals] = await db.execute(sql`
        SELECT
          COUNT(*)                                    AS total_records,
          COALESCE(SUM(realized_pnl), 0)              AS total_realized_pnl,
          COALESCE(SUM(fee_amount_usd), 0)            AS total_fees_usd,
          COALESCE(SUM(CASE WHEN settlement_status = 'pending'  THEN fee_amount_usd ELSE 0 END), 0) AS pending_usd,
          COALESCE(SUM(CASE WHEN settlement_status = 'settled'  THEN fee_amount_usd ELSE 0 END), 0) AS settled_usd,
          COALESCE(SUM(CASE WHEN settlement_status = 'waived'   THEN fee_amount_usd ELSE 0 END), 0) AS waived_usd,
          COUNT(DISTINCT user_id)                     AS unique_users,
          COUNT(CASE WHEN is_paper = false THEN 1 END)AS live_fee_count,
          COUNT(CASE WHEN is_paper = true  THEN 1 END)AS paper_fee_count
        FROM performance_fees
      `).then(r => r.rows) as any[];

      // Per-exchange breakdown
      const byExchange = await db.execute(sql`
        SELECT
          exchange,
          COUNT(*)                         AS trades,
          COALESCE(SUM(realized_pnl), 0)   AS realized_pnl,
          COALESCE(SUM(fee_amount_usd), 0) AS fees_usd
        FROM performance_fees
        GROUP BY exchange
        ORDER BY fees_usd DESC
        LIMIT 20
      `).then(r => r.rows);

      // Top profitable users (by total realized PnL that generated fees)
      const topUsers = await db.execute(sql`
        SELECT
          pf.user_id,
          u.email,
          COUNT(pf.id)                        AS profitable_trades,
          COALESCE(SUM(pf.realized_pnl), 0)   AS total_realized_pnl,
          COALESCE(SUM(pf.fee_amount_usd), 0) AS total_fees_generated
        FROM performance_fees pf
        LEFT JOIN users u ON u.clerk_user_id = pf.user_id
        GROUP BY pf.user_id, u.email
        ORDER BY total_fees_generated DESC
        LIMIT 10
      `).then(r => r.rows);

      // Recent fee records (last 20)
      const recentFees = await db
        .select()
        .from(performanceFeesTable)
        .orderBy(desc(performanceFeesTable.createdAt))
        .limit(20);

      res.json({
        summary:     totals ?? {},
        byExchange,
        topUsers,
        recentFees,
        feeRatePct:  2,
      });
    } catch (err) {
      req.log.error({ err }, "GET /admin/analytics/fees failed");
      res.status(500).json({ error: "Failed to load fee analytics" });
    }
  },
);

// ── GET /api/admin/analytics/memberships ──────────────────────────────────────
// Membership analytics: active subs, MRR, plan distribution, consent stats.

router.get(
  "/admin/analytics/memberships",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    try {
      // Plan distribution from users table
      const planDist = await db.execute(sql`
        SELECT
          plan,
          plan_status,
          COUNT(*) AS count
        FROM users
        GROUP BY plan, plan_status
        ORDER BY count DESC
      `).then(r => r.rows);

      // Total users
      const [userTotals] = await db.execute(sql`
        SELECT
          COUNT(*)                                              AS total_users,
          COUNT(CASE WHEN plan != 'free' THEN 1 END)           AS paid_users,
          COUNT(CASE WHEN plan_status = 'active' THEN 1 END)   AS active_subscriptions,
          COUNT(CASE WHEN plan_status = 'past_due' THEN 1 END) AS past_due,
          COUNT(CASE WHEN plan_status = 'canceled' THEN 1 END) AS canceled
        FROM users
      `).then(r => r.rows) as any[];

      // Consent adoption
      const [consentStats] = await db.execute(sql`
        SELECT
          COUNT(DISTINCT user_id) AS users_consented,
          MIN(created_at)         AS first_consent_at,
          MAX(created_at)         AS latest_consent_at
        FROM user_consents
        WHERE consent_version = 'v1.0'
      `).then(r => r.rows) as any[];

      // Estimated MRR — DB-derived rough estimate using AI Trading ($39.99)
      // baseline. Authoritative MRR comes from Stripe (stripeMetrics below)
      // which mixes both starter ($39.99) and pro ($79.99) tiers.
      const activePaidUsers = parseInt((userTotals as any)?.active_subscriptions ?? "0");
      const estimatedMrr    = activePaidUsers * 39.99;

      // Stripe-sourced subscription data (best-effort — requires Stripe sync schema)
      let stripeMetrics: Record<string, unknown> = {};
      try {
        const [stripeRow] = await db.execute(sql`
          SELECT
            COUNT(*)                                                   AS total_subscriptions,
            COUNT(CASE WHEN status = 'active' THEN 1 END)             AS active,
            COUNT(CASE WHEN status = 'past_due' THEN 1 END)           AS past_due,
            COUNT(CASE WHEN status = 'canceled' THEN 1 END)           AS canceled,
            COALESCE(SUM(CASE WHEN status = 'active'
              THEN (items->0->'price'->>'unit_amount')::int / 100.0
              ELSE 0 END), 0)                                          AS mrr_usd
          FROM stripe.subscriptions
        `).then(r => r.rows) as any[];
        stripeMetrics = stripeRow ?? {};
      } catch { /* stripe schema not yet synced */ }

      res.json({
        userTotals:        userTotals ?? {},
        planDistribution:  planDist,
        consentStats:      consentStats ?? {},
        estimatedMrr,
        membershipPricingUsd: { starter: 39.99, pro: 79.99 },
        stripeMetrics,
      });
    } catch (err) {
      req.log.error({ err }, "GET /admin/analytics/memberships failed");
      res.status(500).json({ error: "Failed to load membership analytics" });
    }
  },
);

// ── POST /api/admin/analytics/fees/:id/settle ─────────────────────────────────
// Mark a specific fee record as settled (manual admin action).

router.post(
  "/admin/analytics/fees/:id/settle",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      await db
        .update(performanceFeesTable)
        .set({ settlementStatus: "settled", settledAt: new Date() })
        .where(eq(performanceFeesTable.id, id));
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "POST /admin/analytics/fees/:id/settle failed");
      res.status(500).json({ error: "Failed to settle fee" });
    }
  },
);

// ── POST /api/admin/analytics/fees/:id/waive ──────────────────────────────────
// Waive a fee (admin override).

router.post(
  "/admin/analytics/fees/:id/waive",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      await db
        .update(performanceFeesTable)
        .set({ settlementStatus: "waived", settledAt: new Date() })
        .where(eq(performanceFeesTable.id, id));
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "POST /admin/analytics/fees/:id/waive failed");
      res.status(500).json({ error: "Failed to waive fee" });
    }
  },
);

export default router;
