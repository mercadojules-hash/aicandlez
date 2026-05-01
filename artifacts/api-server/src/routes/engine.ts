import { Router } from "express";
import { engineStats, startTradingLoop, stopTradingLoop, getLoopIntervalMs } from "../lib/tradingLoop.js";

const router = Router();

router.get("/engine/status", (_req, res) => {
  res.json({
    running:          engineStats.running,
    startedAt:        engineStats.startedAt,
    lastTickAt:       engineStats.lastTickAt,
    lastSignalAt:     engineStats.lastSignalAt,
    lastTradeAt:      engineStats.lastTradeAt,
    signalsGenerated: engineStats.signalsGenerated,
    tradesExecuted:   engineStats.tradesExecuted,
    tradesBlocked:    engineStats.tradesBlocked,
    loopIntervalMs:   getLoopIntervalMs(),
    lastSignal:       engineStats.lastSignal,
    lastTrade:        engineStats.lastTrade,
    recentErrors:     engineStats.errors.slice(-5),
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

export default router;
