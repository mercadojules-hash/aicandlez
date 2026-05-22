/**
 * /api/admin/execution/* — Live execution debugging surface.
 *
 * Admin / super-admin only. Surfaces the in-process execution stream bus,
 * engine heartbeat snapshot, and Safe Test Mode controls. Read paths are
 * cheap (in-memory ring buffer); write paths (safe-test-mode activation)
 * are audit-logged.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { engineStats, LIVE_EXECUTION_MIN_CONFIDENCE } from "../lib/tradingLoop.js";
import {
  executionStreamBus,
  activateSafeTestMode,
  deactivateSafeTestMode,
  getSafeTestMode,
} from "../lib/executionStreamBus.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { executionTelemetry } from "../services/telemetry/ExecutionTelemetry.js";

const router = Router();

const PROCESS_STARTED_AT_MS = Date.now();

// ── GET /api/admin/execution/stream ──────────────────────────────────────────
// Returns the recent execution-stream events from the in-memory ring buffer.
// Optional `since` cursor — clients pass back the previously-returned cursor
// to receive only newer events. Cap of 200 per response.
router.get(
  "/admin/execution/stream",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  (req, res) => {
    const since = req.query["since"] ? Number(req.query["since"]) : undefined;
    const limit = req.query["limit"] ? Math.min(Number(req.query["limit"]), 500) : 200;
    const { events, cursor } = executionStreamBus.getRecent(limit, since);
    res.json({ events, cursor, bufferSize: executionStreamBus.size(), timestamp: Date.now() });
  },
);

// ── GET /api/admin/execution/heartbeat ───────────────────────────────────────
// Engine heartbeat snapshot — everything an operator needs to see at a glance
// whether the loop is alive and trades can flow.
router.get(
  "/admin/execution/heartbeat",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  (_req, res) => {
    const now = Date.now();
    const lastTickAt = engineStats.lastTickAt ?? null;
    const tickAgeMs  = lastTickAt ? now - lastTickAt : null;

    // Health classification — under 60s = healthy, 60-180s = stale, >180s = dead.
    const loopHealth: "healthy" | "stale" | "dead" | "not_started" =
      lastTickAt === null         ? "not_started" :
      tickAgeMs !== null && tickAgeMs <    60_000 ? "healthy" :
      tickAgeMs !== null && tickAgeMs <   180_000 ? "stale"   : "dead";

    const uptimeSec =
      typeof process.uptime === "function"
        ? Math.floor(process.uptime())
        : Math.floor((now - PROCESS_STARTED_AT_MS) / 1000);

    const signalsPerMin =
      uptimeSec > 0
        ? Math.round((engineStats.signalsGenerated / uptimeSec) * 60 * 10) / 10
        : 0;

    res.json({
      // Loop status
      running:                  engineStats.running,
      startedAt:                engineStats.startedAt,
      lastTickAt,
      tickAgeMs,
      loopHealth,
      uptimeSec,

      // Flags
      testMode:                 engineStats.testMode,
      require1HTrend:           engineStats.require1HTrend,
      volumeFilter:             engineStats.volumeFilter,
      liveConfidenceFloor:      LIVE_EXECUTION_MIN_CONFIDENCE,
      safeTestMode:             getSafeTestMode(),

      // Counters
      signalsGenerated:         engineStats.signalsGenerated,
      signalsPerMin,
      tradesExecuted:           engineStats.tradesExecuted,
      tradesBlocked:            engineStats.tradesBlocked,
      mtfConfirmedCount:        engineStats.mtfConfirmedCount,
      mtfBlockCount:            engineStats.mtfBlockCount,
      trailingStopHits:         engineStats.trailingStopHits,
      correlationBlocks:        engineStats.correlationBlocks,
      signalCounts:             engineStats.signalCounts,
      funnel: {
        total:        engineStats.funnelTotal,
        passedMTF:    engineStats.funnelPassedMTF,
        blockedMTF:   engineStats.funnelBlockedMTF,
        executed:     engineStats.funnelExecuted,
      },

      // Last events
      lastSignalAt:             engineStats.lastSignalAt,
      lastTradeAt:              engineStats.lastTradeAt,
      lastSignal:               engineStats.lastSignal,
      lastTrade:                engineStats.lastTrade,

      // Recent signal log (last 10, already maintained in tradingLoop)
      recentSignalLog:          engineStats.recentSignalLog,

      // Execution telemetry summary
      executionTelemetry: {
        totalRecords:           executionTelemetry.totalCount(),
        recent:                 executionTelemetry.getRecent(10),
      },

      errors:                   engineStats.errors.slice(0, 20),
      streamBufferSize:         executionStreamBus.size(),
      timestamp:                now,
    });
  },
);

// ── POST /api/admin/execution/safe-test-mode ─────────────────────────────────
// Activate or deactivate Safe Test Mode. NEVER bypasses risk engine, kill
// switch, or audit logger — only adjusts the confidence floor + min order size
// for a bounded duration.
router.post(
  "/admin/execution/safe-test-mode",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  (req, res) => {
    const body = req.body as {
      activate?:                     boolean;
      durationMinutes?:              number;
      liveConfidenceFloorOverride?:  number | null;
      minOrderUsdOverride?:          number | null;
      reason?:                       string;
    };

    if (body.activate === false) {
      auditLogger.append(
        (req as { user?: { id?: string } }).user?.id ?? "system",
        "ADMIN_ACTION",
        { action: "SAFE_TEST_MODE_DEACTIVATED", actor: (req as { user?: { id?: string } }).user?.id ?? "system" },
        { severity: "warn" },
      );
      const state = deactivateSafeTestMode();
      res.json({ ok: true, state });
      return;
    }

    // Activation — enforce sane bounds.
    const durationMinutes = Math.max(1, Math.min(120, Number(body.durationMinutes ?? 15)));
    const floor =
      body.liveConfidenceFloorOverride === null || body.liveConfidenceFloorOverride === undefined
        ? null
        : Math.max(40, Math.min(85, Number(body.liveConfidenceFloorOverride)));
    const minOrder =
      body.minOrderUsdOverride === null || body.minOrderUsdOverride === undefined
        ? null
        : Math.max(5, Math.min(1000, Number(body.minOrderUsdOverride)));
    const reason  = String(body.reason ?? "Operator verification of live execution pipeline");
    const actor   = (req as { user?: { id?: string } }).user?.id ?? "system";

    auditLogger.append(
      actor,
      "ADMIN_ACTION",
      { action: "SAFE_TEST_MODE_ACTIVATED", actor, durationMinutes, liveConfidenceFloorOverride: floor, minOrderUsdOverride: minOrder, reason },
      { severity: "warn" },
    );

    const state = activateSafeTestMode({
      durationMs:                   durationMinutes * 60_000,
      liveConfidenceFloorOverride:  floor,
      minOrderUsdOverride:          minOrder,
      reason,
      activatedBy:                  actor,
    });

    res.json({ ok: true, state });
  },
);

// ── GET /api/admin/execution/safe-test-mode ──────────────────────────────────
router.get(
  "/admin/execution/safe-test-mode",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  (_req, res) => {
    res.json({ state: getSafeTestMode() });
  },
);

export default router;
