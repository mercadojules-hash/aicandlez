import crypto from "crypto";
import { Router } from "express";
import {
  engineStats,
  startTradingLoop,
  stopTradingLoop,
  getLoopIntervalMs,
  setTestMode,
  setRequire1HTrend,
  setVolumeFilter,
} from "../lib/tradingLoop.js";
import { placeOrder } from "../lib/simulationEngine.js";
import { sendTradeExecutedSMS } from "../lib/notifications.js";
import { db } from "@workspace/db";
import { tradesTable, logsTable } from "@workspace/db";

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
    require1HTrend:     engineStats.require1HTrend,
    volumeFilter:       engineStats.volumeFilter,
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

router.post("/engine/filters", (req, res) => {
  const body = req.body ?? {};
  let changed = false;

  if (typeof body.volumeFilter === "boolean") {
    setVolumeFilter(body.volumeFilter);
    changed = true;
  }
  if (typeof body.require1HTrend === "boolean") {
    setRequire1HTrend(body.require1HTrend);
    changed = true;
  }
  if (!changed) {
    res.status(400).json({ error: "body must include at least one of: { volumeFilter: boolean, require1HTrend: boolean }" });
    return;
  }
  res.json({
    volumeFilter:   engineStats.volumeFilter,
    require1HTrend: engineStats.require1HTrend,
    message: "Quality filters updated.",
  });
});

// ── POST /engine/force-test-trades ───────────────────────────────────────────
// Bypass all signal filters and place one BUY for each supported symbol.
// Use this to verify the full execution pipeline works:
//   signal → placeOrder → tradesTable → UI (Active Trades + Logs)
// Trades are tagged mode="test" and sizeUSD=$500 each.
// Safe: simulation engine only — no real orders placed.
router.post("/engine/force-test-trades", async (_req, res) => {
  const targets: Array<{ symbol: string; side: "BUY" | "SELL" }> = [
    { symbol: "BTCUSD", side: "BUY" },
    { symbol: "ETHUSD", side: "BUY" },
    { symbol: "SOLUSD", side: "BUY" },
  ];

  const results: Array<{
    symbol: string; success: boolean;
    side?: string; price?: number; sizeUSD?: number; error?: string;
  }> = [];

  for (const { symbol, side } of targets) {
    try {
      const result = await placeOrder({ symbol, side, sizeUSD: 500 });

      if (result.success && result.position) {
        const pos      = result.position;
        const tradeId  = crypto.randomUUID();
        const signalId = crypto.randomUUID();
        const stopLoss   = parseFloat((pos.entryPrice * 0.98).toFixed(2));
        const takeProfit = parseFloat((pos.entryPrice * 1.04).toFixed(2));

        await db.insert(tradesTable).values({
          id:         tradeId,
          symbol,
          side,
          amount:     500,
          price:      pos.entryPrice,
          status:     "open",
          mode:       "test",
          signalId,
          stopLoss,
          takeProfit,
          reason:     "[FORCE TEST] Execution pipeline verification",
        });

        await db.insert(logsTable).values({
          id:      crypto.randomUUID(),
          type:    "trade",
          level:   "success",
          message: `[FORCE TEST] ${side} ${symbol} @ $${pos.entryPrice.toFixed(2)} — $500 — Execution pipeline verified`,
          details: { symbol, side, entryPrice: pos.entryPrice, sizeUSD: 500, mode: "test", tradeId },
        });

        engineStats.tradesExecuted++;
        engineStats.funnelExecuted++;
        engineStats.lastTradeAt = Date.now();
        engineStats.lastTrade   = { symbol, side, sizeUSD: 500, price: pos.entryPrice, reason: "Force test", mode: "test" };

        // SMS fires ONLY after a confirmed trade — never for signals, HOLDs, or blocked trades
        void sendTradeExecutedSMS(symbol, side, pos.entryPrice);

        results.push({ symbol, success: true, side, price: pos.entryPrice, sizeUSD: 500 });
      } else {
        results.push({ symbol, success: false, error: result.error ?? "Unknown error" });
      }
    } catch (err) {
      results.push({ symbol, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const ok = results.filter((r) => r.success).length;
  res.json({
    message: ok > 0
      ? `Force-test: ${ok}/3 trades placed. Check Active Trades panel and Logs.`
      : "Force-test failed — check simulation engine balance or symbol config.",
    results,
    totalExecuted: ok,
    note: "Test trades ($500 each) placed directly into the simulation engine, bypassing signal filters. Appear in Active Trades, Trade History, and Logs immediately.",
  });
});

export default router;
