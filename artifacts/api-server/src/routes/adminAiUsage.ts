/**
 * GET /api/admin/ai-usage
 *
 * Platform-wide AI execution / signal usage aggregate. Powers the
 * /admin/ai-usage operator page.
 *
 * Auth: admin / super-admin only.
 *
 * Returns:
 *   global  — engine totals (signals emitted, trades executed,
 *             paper vs live split, lifetime totals).
 *   perUser — top users by recent AI activity in the last 24h
 *             with email + counts + lifetime trades + recent PnL.
 *
 * All numbers derived from DB state + in-process engineStats. No
 * placeholder data — anything not available is reported as 0/null.
 */
import { Router, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { engineStats } from "../lib/tradingLoop.js";

const router = Router();

interface PerUserRow {
  userId:           string;
  email:            string | null;
  role:             string | null;
  plan:             string | null;
  aiEnabled:        boolean;
  trades24h:        number;
  liveTrades24h:    number;
  paperTrades24h:   number;
  tradesLifetime:   number;
  pnl24h:           number;
  pnlLifetime:      number;
  lastTradeAt:      string | null;
}

router.get(
  "/admin/ai-usage",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (_req, res: Response): Promise<void> => {
    try {
      // ── Per-user AI activity ─────────────────────────────────────────
      // Uses sim_trades (the canonical execution table for both paper +
      // live AI-routed trades). `exchange IS NOT NULL` ⇒ live broker
      // execution; `exchange IS NULL` ⇒ paper/AI simulation.
      const perUserRows = await db.execute(sql`
        SELECT
          u.clerk_user_id                                            AS user_id,
          u.email                                                    AS email,
          u.role                                                     AS role,
          COALESCE(us.plan, 'free')                                  AS plan,
          COALESCE(us.auto_mode, false)                AS ai_enabled,
          COUNT(st.*) FILTER (
            WHERE st.created_at > NOW() - INTERVAL '24 hours'
          )::int                                                     AS trades_24h,
          COUNT(st.*) FILTER (
            WHERE st.created_at > NOW() - INTERVAL '24 hours'
              AND st.exchange IS NOT NULL
          )::int                                                     AS live_trades_24h,
          COUNT(st.*) FILTER (
            WHERE st.created_at > NOW() - INTERVAL '24 hours'
              AND st.exchange IS NULL
          )::int                                                     AS paper_trades_24h,
          COUNT(st.*)::int                                           AS trades_lifetime,
          COALESCE(SUM(st.realized_pnl) FILTER (
            WHERE st.created_at > NOW() - INTERVAL '24 hours'
          ), 0)::float                                               AS pnl_24h,
          COALESCE(SUM(st.realized_pnl), 0)::float                   AS pnl_lifetime,
          MAX(st.created_at)                                         AS last_trade_at
        FROM users u
        LEFT JOIN user_settings us ON us.user_id = u.clerk_user_id
        LEFT JOIN sim_trades   st ON st.user_id = u.clerk_user_id
        GROUP BY u.clerk_user_id, u.email, u.role, us.plan, us.auto_mode
        HAVING COUNT(st.*) > 0
        ORDER BY trades_24h DESC, trades_lifetime DESC
        LIMIT 200
      `).then(r => r.rows) as Array<{
        user_id:          string;
        email:            string | null;
        role:             string | null;
        plan:             string | null;
        ai_enabled:       boolean;
        trades_24h:       number;
        live_trades_24h:  number;
        paper_trades_24h: number;
        trades_lifetime:  number;
        pnl_24h:          number;
        pnl_lifetime:     number;
        last_trade_at:    Date | null;
      }>;

      const perUser: PerUserRow[] = perUserRows.map(r => ({
        userId:         r.user_id,
        email:          r.email,
        role:           r.role,
        plan:           r.plan,
        aiEnabled:      !!r.ai_enabled,
        trades24h:      r.trades_24h ?? 0,
        liveTrades24h:  r.live_trades_24h ?? 0,
        paperTrades24h: r.paper_trades_24h ?? 0,
        tradesLifetime: r.trades_lifetime ?? 0,
        pnl24h:         r.pnl_24h ?? 0,
        pnlLifetime:    r.pnl_lifetime ?? 0,
        lastTradeAt:    r.last_trade_at ? new Date(r.last_trade_at).toISOString() : null,
      }));

      // ── Global aggregates ─────────────────────────────────────────────
      const [globalRow] = await db.execute(sql`
        SELECT
          COUNT(*)::int                                              AS trades_lifetime,
          COUNT(*) FILTER (
            WHERE created_at > NOW() - INTERVAL '24 hours'
          )::int                                                     AS trades_24h,
          COUNT(*) FILTER (
            WHERE created_at > NOW() - INTERVAL '24 hours'
              AND exchange IS NOT NULL
          )::int                                                     AS live_24h,
          COUNT(*) FILTER (
            WHERE created_at > NOW() - INTERVAL '24 hours'
              AND exchange IS NULL
          )::int                                                     AS paper_24h,
          COALESCE(SUM(realized_pnl) FILTER (
            WHERE created_at > NOW() - INTERVAL '24 hours'
          ), 0)::float                                               AS pnl_24h,
          COUNT(DISTINCT user_id) FILTER (
            WHERE created_at > NOW() - INTERVAL '24 hours'
          )::int                                                     AS active_traders_24h
        FROM sim_trades
      `).then(r => r.rows) as Array<{
        trades_lifetime:     number;
        trades_24h:          number;
        live_24h:            number;
        paper_24h:           number;
        pnl_24h:             number;
        active_traders_24h:  number;
      }>;

      const [aiEnabledRow] = await db.execute(sql`
        SELECT COUNT(*)::int AS ai_enabled_users
        FROM user_settings
        WHERE auto_mode = true
      `).then(r => r.rows) as Array<{ ai_enabled_users: number }>;

      // engineStats is in-process — single source of truth for live signal
      // throughput. Falls back to 0 if a field hasn't initialised yet.
      const es = engineStats as unknown as Record<string, unknown>;
      const num = (k: string): number =>
        typeof es[k] === "number" ? (es[k] as number) : 0;

      const global = {
        signalsLifetime:    num("totalSignalsEmitted"),
        signalsLastMinute:  num("signalsLastMinute"),
        mtfPassRate:        num("mtfPassRate"),
        engineTickCount:    num("ticks"),
        engineUptimeSec:    Math.floor(
          (Date.now() - (num("startedAt") || Date.now())) / 1000,
        ),
        tradesLifetime:     globalRow?.trades_lifetime  ?? 0,
        trades24h:          globalRow?.trades_24h        ?? 0,
        liveTrades24h:      globalRow?.live_24h          ?? 0,
        paperTrades24h:     globalRow?.paper_24h         ?? 0,
        pnl24h:             globalRow?.pnl_24h           ?? 0,
        activeTraders24h:   globalRow?.active_traders_24h ?? 0,
        aiEnabledUsers:     aiEnabledRow?.ai_enabled_users ?? 0,
      };

      res.json({ global, perUser, timestamp: Date.now() });
    } catch (err) {
      const { logger } = await import("../lib/logger.js");
      logger.error({ err }, "admin_ai_usage_failed");
      res.status(500).json({ error: "internal_error" });
    }
  },
);

export default router;
