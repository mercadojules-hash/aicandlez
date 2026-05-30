/**
 * GET  /api/admin/execution-funnel        — read the execution-funnel snapshot
 * POST /api/admin/execution-funnel/reset   — rebaseline counters (admin action)
 *
 * Diagnostic surface that answers "the scanner is producing signals — why are
 * they not becoming trades?". Returns per-stage block counts, a granular
 * rejection-reason breakdown, and recent rejections, alongside the engine's
 * lifetime signal/trade totals for context.
 *
 * Importing `executionFunnel` here also wires its executionStreamBus
 * subscriber at server boot (side-effect import).
 *
 * Auth: admin / super-admin only.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { engineStats } from "../lib/tradingLoop.js";
import {
  getExecutionFunnelSnapshot,
  resetExecutionFunnel,
} from "../lib/executionFunnel.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

router.get(
  "/admin/execution-funnel",
  ...requireOperator,
  (_req, res): void => {
    const funnel = getExecutionFunnelSnapshot();
    res.json({
      funnel,
      engine: {
        running:          engineStats.running,
        signalsGenerated: engineStats.signalsGenerated,
        tradesExecuted:   engineStats.tradesExecuted,
        tradesBlocked:    engineStats.tradesBlocked,
        funnelExecuted:   engineStats.funnelExecuted,
        lastSignalAt:     engineStats.lastSignalAt,
        lastTradeAt:      engineStats.lastTradeAt,
        lastTickAt:       engineStats.lastTickAt,
      },
      serverNow: Date.now(),
    });
  },
);

router.post(
  "/admin/execution-funnel/reset",
  ...requireOperator,
  (req, res): void => {
    resetExecutionFunnel();
    req.log.info("Execution-funnel telemetry reset by operator");
    res.json({ ok: true, since: getExecutionFunnelSnapshot().since });
  },
);

export default router;
