/**
 * GET /api/admin/platform-overview
 *
 * Live institutional telemetry feed for the operator command center.
 * Returns aggregate platform metrics: user counts, trade counts,
 * winning trades over various windows, fees, volume, win-rate, signals.
 *
 * Auth: admin / super-admin only.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { engineStats } from "../lib/tradingLoop.js";

const router = Router();

router.get(
  "/admin/platform-overview",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    try {
      // ── User counts ────────────────────────────────────────────────
      // NOTE: users table has no last_login_at column. "Online" is derived as
      // distinct user IDs that recorded a trade in the last 10 minutes.
      const [userTotals] = await db.execute(sql`
        SELECT
          COUNT(*)::int                                                          AS total_users,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int  AS recent_signups
        FROM users
      `).then(r => r.rows) as Array<Record<string, number | null>>;

      const [onlineRow] = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS users_online
        FROM sim_trades
        WHERE created_at > NOW() - INTERVAL '10 minutes'
      `).then(r => r.rows) as Array<Record<string, number | null>>;

      // ── Trade aggregates (combined: trades table + sim_trades) ────
      const [tradeTotals] = await db.execute(sql`
        WITH all_trades AS (
          SELECT timestamp AS ts, pnl, side, amount, price FROM trades
          UNION ALL
          SELECT created_at AS ts, realized_pnl AS pnl, side, quantity AS amount, exit_price AS price FROM sim_trades
        )
        SELECT
          COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours')::int  AS trades_today,
          COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours' AND pnl > 0)::int  AS wins_today,
          COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '7 days'  AND pnl > 0)::int  AS wins_week,
          COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '30 days' AND pnl > 0)::int  AS wins_month,
          COUNT(*)::int                                                            AS total_trades,
          COUNT(*) FILTER (WHERE pnl > 0)::int                                     AS total_wins,
          COALESCE(SUM(pnl), 0)::float                                              AS total_pnl,
          COALESCE(SUM(amount * price), 0)::float                                  AS total_volume
        FROM all_trades
      `).then(r => r.rows) as Array<Record<string, number>>;

      // ── Performance fees ──────────────────────────────────────────
      const [feeTotals] = await db.execute(sql`
        SELECT
          COALESCE(SUM(fee_amount_usd), 0)::float AS total_fees
        FROM performance_fees
      `).then(r => r.rows) as Array<Record<string, number>>;

      // ── AI engine snapshot (in-process, no DB) ────────────────────
      const breakdowns = Object.values(engineStats.symbolBreakdowns ?? {});
      const avgConfidence = breakdowns.length
        ? breakdowns.reduce((s, b) => s + (b.avgConfidence ?? 0), 0) / breakdowns.length
        : 0;

      // ── Derived ────────────────────────────────────────────────────
      const totalTrades = Number(tradeTotals?.total_trades ?? 0);
      const totalWins   = Number(tradeTotals?.total_wins   ?? 0);
      const winRate     = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

      res.json({
        users: {
          total:        Number(userTotals?.total_users   ?? 0),
          online:       Number(onlineRow?.users_online   ?? 0),
          recentSignups:Number(userTotals?.recent_signups ?? 0),
        },
        trades: {
          today:        Number(tradeTotals?.trades_today ?? 0),
          winsToday:    Number(tradeTotals?.wins_today   ?? 0),
          winsWeek:     Number(tradeTotals?.wins_week    ?? 0),
          winsMonth:    Number(tradeTotals?.wins_month   ?? 0),
          totalTrades,
          totalPnL:     Number(tradeTotals?.total_pnl    ?? 0),
          totalVolume:  Number(tradeTotals?.total_volume ?? 0),
          winRate,
        },
        fees: {
          totalCollected: Number(feeTotals?.total_fees ?? 0),
        },
        ai: {
          enginesRunning:    engineStats.running ? 1 : 0,
          signalsGenerated:  engineStats.signalsGenerated ?? 0,
          tradesExecuted:    engineStats.tradesExecuted ?? 0,
          mtfConfirmed:      engineStats.mtfConfirmedCount ?? 0,
          avgConfidence,
        },
        timestamp: Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /admin/platform-overview failed");
      res.status(500).json({ error: "Failed to load platform overview" });
    }
  },
);

export default router;
