import { Router } from "express";
import {
  engineStats,
  startTradingLoop,
  stopTradingLoop,
  getLoopIntervalMs,
  setTestMode,
} from "../lib/tradingLoop.js";

const router = Router();

router.get("/engine/status", (_req, res) => {
  res.json({
    running:            engineStats.running,
    startedAt:          engineStats.startedAt,
    lastTickAt:         engineStats.lastTickAt,
    lastSignalAt:       engineStats.lastSignalAt,
    lastTradeAt:        engineStats.lastTradeAt,
    signalsGenerated:   engineStats.signalsGenerated,
    tradesExecuted:     engineStats.tradesExecuted,
    tradesBlocked:      engineStats.tradesBlocked,
    mtfConfirmedCount:  engineStats.mtfConfirmedCount,
    mtfBlockCount:      engineStats.mtfBlockCount,
    trailingStopHits:   engineStats.trailingStopHits,
    correlationBlocks:  engineStats.correlationBlocks,
    testMode:           engineStats.testMode,
    loopIntervalMs:     getLoopIntervalMs(),
    // Signal distribution
    signalCounts:       engineStats.signalCounts,
    // Execution funnel
    funnel: {
      total:      engineStats.funnelTotal,
      passedMTF:  engineStats.funnelPassedMTF,
      blockedMTF: engineStats.funnelBlockedMTF,
      executed:   engineStats.funnelExecuted,
    },
    // Per-symbol MTF breakdowns
    symbolBreakdowns:   engineStats.symbolBreakdowns,
    // Last 10 signals log
    recentSignalLog:    engineStats.recentSignalLog,
    lastSignal:         engineStats.lastSignal,
    lastTrade:          engineStats.lastTrade,
    recentErrors:       engineStats.errors.slice(-5),
  });
});

router.post("/engine/start", (_req, res) => {
  startTradingLoop();
  res.json({ started: true, message: "Trading loop started" });
});

router.post("/engine/stop", (_req, res) => {
  stopTradingLoop();
  res.json({ stopped: true, message: "Trading loop stopped" });
});

router.post("/engine/testmode", (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "body must include { enabled: boolean }" });
    return;
  }
  setTestMode(enabled);
  res.json({
    testMode: engineStats.testMode,
    message:  enabled
      ? "Test mode ON — trades execute at confidence >= 35% or single-TF strong signal. Mode tagged 'test'."
      : "Test mode OFF — strict MTF confirmation required.",
  });
});

export default router;
