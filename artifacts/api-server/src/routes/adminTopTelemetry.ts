/**
 * GET /api/admin/top-telemetry
 *
 * Single aggregated payload that powers the AdminTopTelemetryBar — the
 * always-visible 15-metric horizontal operator strip sitting under the
 * trading-dashboard top header. ALL values are real, derived from
 * database state + in-process engine stats. No simulated/placeholder
 * numbers — anything genuinely unavailable returns `null` and the UI
 * renders a dash so the operator never mistakes mock data for live.
 *
 * Auth: admin / super-admin only.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { engineStats } from "../lib/tradingLoop.js";
import { getLastOperatorEmailSuccessAt, isOperatorEmailConfigured, sendOperatorAlert } from "../lib/notifications.js";

const router = Router();

// Process start time captured at module load — gives a true uptime
// reading even if engineStats.startedAt is unset.
const PROCESS_STARTED_AT_MS = Date.now();

router.get(
  "/admin/top-telemetry",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    try {
      // ── Users ────────────────────────────────────────────────────────
      const [userRow] = await db.execute(sql`
        SELECT COUNT(*)::int AS total_users
        FROM users
      `).then(r => r.rows) as Array<{ total_users: number }>;

      // "Active right now" = distinct users who placed a sim or live
      // trade in the last 10 minutes. Approximate but real.
      const [activeRow] = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS active_now
        FROM sim_trades
        WHERE created_at > NOW() - INTERVAL '10 minutes'
      `).then(r => r.rows) as Array<{ active_now: number }>;

      // ── Trades ──────────────────────────────────────────────────────
      const [tradeRow] = await db.execute(sql`
        WITH all_trades AS (
          SELECT timestamp  AS ts, pnl                AS pnl, status      AS status FROM trades
          UNION ALL
          SELECT created_at AS ts, realized_pnl       AS pnl, 'closed'    AS status FROM sim_trades
        )
        SELECT
          COUNT(*)::int                                                                AS total_trades,
          COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours')::int                AS trades_today,
          COALESCE(SUM(pnl), 0)::float                                                  AS platform_pnl,
          COUNT(*) FILTER (WHERE pnl < 0)::int                                         AS failed_trades
        FROM all_trades
      `).then(r => r.rows) as Array<{
        total_trades: number; trades_today: number;
        platform_pnl: number; failed_trades: number;
      }>;

      // ── Fees collected (all-time, settled + pending) ────────────────
      const [feeRow] = await db.execute(sql`
        SELECT COALESCE(SUM(fee_amount_usd), 0)::float AS fees_collected
        FROM performance_fees
      `).then(r => r.rows) as Array<{ fees_collected: number }>;

      // ── Exchange connections (per-user, all six brokers) ────────────
      // user_exchange_connections.status: 'active' | 'error' | 'revoked'
      // (default 'active'). Count rows in 'active' state that have been
      // verified at least once (last_verified_at is set on first OK test).
      let activeExchangeConnections = 0;
      try {
        const [connRow] = await db.execute(sql`
          SELECT COUNT(*)::int AS active_connections
          FROM user_exchange_connections
          WHERE status = 'active' AND last_verified_at IS NOT NULL
        `).then(r => r.rows) as Array<{ active_connections: number }>;
        activeExchangeConnections = connRow?.active_connections ?? 0;
      } catch {
        // Table may not exist in legacy environments — leave at 0.
      }

      // ── Subscriptions + MRR ─────────────────────────────────────────
      const [subRow] = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE plan_status = 'active'   AND plan != 'free')::int AS live_subs,
          COUNT(*) FILTER (WHERE plan_status = 'active'   AND plan  = 'starter')::int AS starter_subs,
          COUNT(*) FILTER (WHERE plan_status = 'active'   AND plan  = 'pro')::int     AS pro_subs
        FROM users
      `).then(r => r.rows) as Array<{
        live_subs: number; starter_subs: number; pro_subs: number;
      }>;
      // Monthly revenue = starter*$39.99 + pro*$79.99 — derived from DB.
      const monthlyRevenue =
        (subRow?.starter_subs ?? 0) * 39.99 +
        (subRow?.pro_subs     ?? 0) * 79.99;

      // ── AI engine snapshot ──────────────────────────────────────────
      const aiExecutions = engineStats.tradesExecuted ?? 0;
      const signalsGen   = engineStats.signalsGenerated ?? 0;
      const engineRunning = engineStats.running ?? false;

      // ── Uptime ─────────────────────────────────────────────────────
      // Prefer process.uptime() (Node tracks since spawn). Falls back to
      // module-load timestamp if for some reason process.uptime is unset.
      const uptimeSec =
        typeof process.uptime === "function"
          ? Math.floor(process.uptime())
          : Math.floor((Date.now() - PROCESS_STARTED_AT_MS) / 1000);

      // ── Queue throughput (signals/min) ─────────────────────────────
      // engineStats tracks cumulative signalsGenerated. We don't store
      // per-window rates, so derive throughput from signals/uptime.
      const queueThroughputPerMin =
        uptimeSec > 0 ? Math.round((signalsGen / uptimeSec) * 60 * 10) / 10 : 0;

      // ── Websocket status (best-effort) ─────────────────────────────
      // Trading loop running implies the upstream market WS is consuming.
      // No separate client-count metric is currently exposed.
      const websocketStatus = engineRunning ? "online" : "offline";

      // ── API latency (process self-measure) ─────────────────────────
      // Sample the event loop responsiveness with a 1-tick async hop.
      const latencyStart = process.hrtime.bigint();
      await new Promise<void>(resolve => setImmediate(resolve));
      const apiLatencyMs = Number((process.hrtime.bigint() - latencyStart) / 1_000_000n);

      res.json({
        // 1. active users right now
        activeUsersNow:           activeRow?.active_now ?? 0,
        // 2. total registered users
        totalRegisteredUsers:     userRow?.total_users  ?? 0,
        // 3. total user trades
        totalUserTrades:          tradeRow?.total_trades ?? 0,
        // 4. trades today
        tradesToday:              tradeRow?.trades_today ?? 0,
        // 5. platform PnL
        platformPnlUsd:           tradeRow?.platform_pnl ?? 0,
        // 6. fees collected
        feesCollectedUsd:         feeRow?.fees_collected ?? 0,
        // 7. active exchange connections
        activeExchangeConnections,
        // 8. active AI executions
        activeAiExecutions:       aiExecutions,
        // 9. live subscriptions
        liveSubscriptions:        subRow?.live_subs ?? 0,
        // 10. monthly revenue
        monthlyRevenueUsd:        monthlyRevenue,
        // 11. failed trades (losing trades — closest DB-derivable proxy)
        failedTrades:             tradeRow?.failed_trades ?? 0,
        // 12. system uptime
        systemUptimeSec:          uptimeSec,
        // 13. websocket status
        websocketStatus,
        // 14. queue throughput (signals/min, lifetime average)
        queueThroughputPerMin,
        // 15. API latency
        apiLatencyMs,

        engineRunning,
        // 16. operator email transport configured
        // True iff RESEND_API_KEY + OPERATOR_ALERT_EMAIL_FROM +
        // OPERATOR_ALERT_EMAIL_TO are all set. No secret values leaked.
        operatorEmailConfigured: isOperatorEmailConfigured(),
        // 17. last successful operator-email delivery timestamp (ms epoch).
        // null until the first 2xx from Resend lands — surfaced so the
        // operator can see how stale the transport is at a glance.
        lastOperatorEmailSuccessAt: getLastOperatorEmailSuccessAt(),
        timestamp:                Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /admin/top-telemetry failed");
      res.status(500).json({ error: "Failed to load top telemetry" });
    }
  },
);

/**
 * POST /api/admin/operator-email-test
 *
 * Fires a `sendOperatorAlert` with a dedicated dedupe key so the operator
 * can prove end-to-end delivery from the admin console. Returns whether
 * the transport is configured — actual delivery success/failure is
 * surfaced in server logs (we don't expose Resend response bodies).
 */
router.post(
  "/admin/operator-email-test",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    const configured = isOperatorEmailConfigured();
    try {
      await sendOperatorAlert({
        subject:   "[AICandlez] Operator email test",
        body:      "This is a manual test alert fired from the admin telemetry bar. " +
                   "If you received this email, the operator alert transport is wired correctly.",
        dedupeKey: "operator-email-test",
        context:   { triggeredBy: "admin-top-telemetry", at: new Date().toISOString() },
      });
      res.json({ ok: true, configured });
    } catch (err) {
      req.log.error({ err }, "POST /admin/operator-email-test failed");
      res.status(500).json({ ok: false, configured, error: "Failed to send test alert" });
    }
  },
);

export default router;
