/**
 * GET /api/admin/execution-telemetry
 *
 * Real-time execution telemetry for the operator command center.
 * Surfaces three streams in one round-trip:
 *
 *   1. Latency stats    — signal→order, order→fill, round-trip, slippage,
 *                         fill-rate, rejection-rate (per exchange).
 *   2. Execution funnel — signals generated → MTF-confirmed →
 *                         orders sent → filled (system-wide).
 *   3. Recent executions — last 30 fills/rejects across the platform
 *                          (live stream feed).
 *
 * Auth: admin / super-admin only.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { executionTelemetry } from "../services/telemetry/ExecutionTelemetry.js";
import { engineStats } from "../lib/tradingLoop.js";

const router = Router();

router.get(
  "/admin/execution-telemetry",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  (_req, res): void => {
    const latencyByExchange = executionTelemetry.getLatencyStats();
    const recent            = executionTelemetry.getRecent(30);
    const totalRecorded     = executionTelemetry.totalCount();

    // ── Execution funnel ─────────────────────────────────────────────────────
    // Drop-off pipeline from raw signal → executed order. Numbers are
    // process-lifetime cumulative since the trading loop started.
    const signals      = engineStats.signalsGenerated ?? 0;
    const mtfConfirmed = engineStats.mtfConfirmedCount ?? 0;
    const executed     = engineStats.tradesExecuted ?? 0;
    const filled       = recent.filter(r => r.status === "filled").length;
    const rejected     = recent.filter(r => r.status === "rejected").length;
    const partial      = recent.filter(r => r.status === "partial").length;

    res.json({
      latency: latencyByExchange,
      funnel: {
        signalsGenerated: signals,
        mtfConfirmed,
        ordersSent:       executed,
        recentFilled:     filled,
        recentRejected:   rejected,
        recentPartial:    partial,
        // Conversion percentages (defensive guards against div-by-zero)
        mtfConversionPct:
          signals > 0 ? (mtfConfirmed / signals) * 100 : 0,
        executionConversionPct:
          mtfConfirmed > 0 ? (executed / mtfConfirmed) * 100 : 0,
      },
      recentExecutions: recent.map(r => ({
        id:           r.id,
        exchange:     r.exchange,
        symbol:       r.symbol,
        side:         r.side,
        status:       r.status,
        sizeUSD:      r.sizeUSD,
        slippagePct:  r.slippagePct,
        roundTripMs:  r.roundTripMs,
        sentAt:       r.sentAt,
        mode:         r.mode,
        errorMessage: r.errorMessage,
      })),
      totalRecorded,
      engineRunning: engineStats.running ?? false,
      timestamp:     Date.now(),
    });
  },
);

export default router;
