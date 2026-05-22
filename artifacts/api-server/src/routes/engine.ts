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
import { sendTradeExecutedSMS } from "../lib/notifications.js";
import {
  setMode,
  setSelectedExchange,
  getExchangeStatus,
} from "../lib/exchangeEngine.js";
import { clearAllPositions } from "../lib/simulationEngine.js";
import { registry } from "../services/exchanges/ExchangeRegistry.js";
import { db } from "@workspace/db";
import { tradesTable, logsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  generateId,
  getBasePrice,
  generateSimulatedPrice,
  calculatePnL,
} from "../lib/trading.js";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();
// All engine-control routes are operator-only (super-admin / admin).
// Customers route their AI execution through user-scoped /api/simulation/*
// and /api/user/* endpoints — they never touch the global engine.
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

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
    signalCounts:       engineStats.signalCounts,
    funnel: {
      total:      engineStats.funnelTotal,
      passedMTF:  engineStats.funnelPassedMTF,
      blockedMTF: engineStats.funnelBlockedMTF,
      executed:   engineStats.funnelExecuted,
    },
    symbolBreakdowns:   engineStats.symbolBreakdowns,
    recentSignalLog:    engineStats.recentSignalLog,
    lastSignal:         engineStats.lastSignal,
    lastTrade:          engineStats.lastTrade,
    recentErrors:       engineStats.errors.slice(-5),
  });
});

router.post("/engine/start", ...requireOperator, (_req, res) => {
  startTradingLoop();
  res.json({ started: true, message: "Trading loop started" });
});

router.post("/engine/stop", ...requireOperator, (_req, res) => {
  stopTradingLoop();
  res.json({ stopped: true, message: "Trading loop stopped" });
});

router.post("/engine/testmode", ...requireOperator, (req, res) => {
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

router.post("/engine/filters", ...requireOperator, (req, res) => {
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

// ── Exchange ID → adapter canonical name ──────────────────────────────────────
// Normalises frontend IDs ("kraken", "coinbase", "binance", "cryptocom") to the
// exact name used by ExchangeRegistry and the credential-check helpers.
const EXCHANGE_ID_TO_ADAPTER: Record<string, string> = {
  coinbase:   "Coinbase",
  binance:    "Binance",
  binanceus:  "Binance",
  cryptocom:  "CryptoDotCom",
  gemini:     "Gemini",
  alpaca:     "Alpaca",
};

// ── POST /engine/exchange-mode ────────────────────────────────────────────────
// Unified exchange switcher. body: { mode: "simulation" | "kraken" | "coinbase" | ... }
// "simulation" → paper trading.  Any exchange name → live mode on that exchange.
router.post("/engine/exchange-mode", ...requireOperator, async (req, res) => {
  const { mode } = (req.body ?? {}) as { mode?: string };
  if (!mode || typeof mode !== "string") {
    res.status(400).json({ error: 'body must include { mode: "simulation" | "<exchange>" }' });
    return;
  }

  // Gate live exchange selection behind Starter plan or higher
  if (mode !== "simulation") {
    const userId = (req as import("express").Request & { clerkUserId?: string }).clerkUserId ?? "";
    try {
      const [user] = await db
        .select({ plan: usersTable.plan, planStatus: usersTable.planStatus })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, userId))
        .limit(1);
      const planOk   = user?.plan === "starter" || user?.plan === "pro" || user?.plan === "enterprise";
      const statusOk = !user?.planStatus || user.planStatus === "active" || user.planStatus === "trialing";
      if (!planOk || !statusOk) {
        res.status(402).json({
          error:      "Live trading requires a Starter plan or higher",
          code:       "PLAN_REQUIRED",
          upgradeUrl: "/billing",
        });
        return;
      }
    } catch { /* fail open on DB errors — don't block users */ }
  }

  if (mode === "simulation") {
    // PAPER AI — reset to Alpaca sim (default paper account)
    setMode("simulation");
    setSelectedExchange("Alpaca");
    res.json({ mode, status: getExchangeStatus() });
    return;
  }

  // Resolve the canonical adapter name (e.g. "cryptocom" → "CryptoDotCom")
  const adapterName = EXCHANGE_ID_TO_ADAPTER[mode.toLowerCase()] ?? mode;

  // Always select the exchange — this switches the balance snapshot immediately.
  setSelectedExchange(adapterName);

  // Try to enable live mode. If not available (EXCHANGE_LIVE_ENABLED not set or keys missing),
  // fall back to simulation mode silently — the exchange's balance snapshot is still shown.
  const liveResult = setMode("live", adapterName);
  if (!liveResult.ok) {
    setMode("simulation");
  }

  // Best-effort adapter registry sync
  if (registry.has(adapterName)) {
    registry.setActive(adapterName);
  }

  // Always succeed — exchange selection never fails
  res.json({ mode, status: getExchangeStatus() });
});

// ── POST /engine/close-all-positions ─────────────────────────────────────────
// Bulk-closes every open trade in tradesTable (simulated exit price + PnL) and
// clears the in-memory simulationEngine positions so the funnel unblocks.
router.post("/engine/close-all-positions", ...requireOperator, async (_req, res) => {
  // Fetch all open trades
  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  let closed = 0;
  for (const t of openTrades) {
    try {
      const exitPrice = generateSimulatedPrice(t.price);
      const { pnl, pnlPercent } = calculatePnL(t.side, t.price, exitPrice, t.amount);
      await db
        .update(tradesTable)
        .set({ status: "closed", exitPrice, pnl, pnlPercent, closedAt: new Date(), reason: "force_close_all" })
        .where(eq(tradesTable.id, t.id));
      closed++;
    } catch { /* skip failed rows */ }
  }

  // Clear in-memory simulation engine positions so maxActivePositions resets
  const cleared = clearAllPositions();

  await db.insert(logsTable).values({
    id:      generateId(),
    type:    "system",
    level:   "warn",
    message: `[FORCE CLOSE] All open positions closed (${closed} DB rows, ${cleared} in-memory). Funnel unblocked.`,
    details: { closed, cleared },
  });

  res.json({ ok: true, dbClosed: closed, simCleared: cleared });
});

// ── POST /engine/force-test-trades ───────────────────────────────────────────
// Creates 2–5 real trades (random mix of open and closed) directly into the DB.
// Uses the same insert pattern as POST /api/trades.
// Does NOT go through placeOrder() — no simulation balance deducted.
// Mode is always "test". Safe: no real orders placed.
router.post("/engine/force-test-trades", ...requireOperator, async (_req, res) => {
  // ── Config ──
  const SYMBOLS: Array<"BTCUSD" | "ETHUSD" | "SOLUSD"> = ["BTCUSD", "ETHUSD", "SOLUSD"];
  const SIDES:   Array<"BUY" | "SELL">                  = ["BUY", "SELL"];

  // Map our symbol format to the key getBasePrice() understands
  const BASE_KEY: Record<string, string> = {
    BTCUSD: "BTCUSDT",
    ETHUSD: "ETHUSDT",
    SOLUSD: "SOLUSDT",
  };

  function rand<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
  }
  function randFloat(min: number, max: number, decimals = 2): number {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
  }

  // Generate 2–5 trades
  const count = Math.floor(Math.random() * 4) + 2; // 2, 3, 4, or 5
  let tradesCreated = 0;

  const results: Array<{
    id: string; symbol: string; side: string; status: string;
    price: number; amount: number; pnl?: number; error?: string;
  }> = [];

  for (let i = 0; i < count; i++) {
    try {
      const symbol = rand(SYMBOLS);
      const side   = rand(SIDES);
      // Amount is in USD — range $100–$1 000, matches how calculatePnL treats it
      const amount = randFloat(100, 1000);

      // Entry price: live-ish via generateSimulatedPrice on base price
      const basePrice  = getBasePrice(BASE_KEY[symbol] ?? symbol);
      const entryPrice = generateSimulatedPrice(basePrice);
      const stopLoss   = parseFloat((entryPrice * (side === "BUY" ? 0.98 : 1.02)).toFixed(2));
      const takeProfit = parseFloat((entryPrice * (side === "BUY" ? 1.04 : 0.96)).toFixed(2));

      // Randomly decide open vs closed (50/50)
      const isClosed = Math.random() < 0.5;
      const id       = generateId();
      const signalId = generateId();
      const now      = new Date();

      if (isClosed) {
        // ── Closed trade: calculate exit + PnL ──
        const exitPrice = generateSimulatedPrice(entryPrice);
        const { pnl, pnlPercent } = calculatePnL(side, entryPrice, exitPrice, amount);

        await db.insert(tradesTable).values({
          id,
          symbol,
          side,
          amount,
          price:      entryPrice,
          exitPrice,
          pnl,
          pnlPercent,
          status:     "closed",
          mode:       "test",
          signalId,
          stopLoss,
          takeProfit,
          reason:     "test_close",
          closedAt:   now,
        });

        await db.insert(logsTable).values({
          id:      generateId(),
          type:    "trade",
          level:   pnl >= 0 ? "success" : "warn",
          message: `[FORCE TEST] CLOSED ${side} ${symbol} @ $${entryPrice.toFixed(2)} → $${exitPrice.toFixed(2)} — PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`,
          details: { symbol, side, amount, entryPrice, exitPrice, pnl, pnlPercent, mode: "test", id },
        });

        results.push({ id, symbol, side, status: "closed", price: entryPrice, amount, pnl });
      } else {
        // ── Open trade: no exit or PnL ──
        await db.insert(tradesTable).values({
          id,
          symbol,
          side,
          amount,
          price:      entryPrice,
          status:     "open",
          mode:       "test",
          signalId,
          stopLoss,
          takeProfit,
          reason:     "[FORCE TEST] Execution pipeline verification",
        });

        await db.insert(logsTable).values({
          id:      generateId(),
          type:    "trade",
          level:   "success",
          message: `[FORCE TEST] OPEN ${side} ${symbol} @ $${entryPrice.toFixed(2)} — $${amount.toFixed(2)} — Pipeline verified`,
          details: { symbol, side, amount, entryPrice, mode: "test", id },
        });

        results.push({ id, symbol, side, status: "open", price: entryPrice, amount });
      }

      // Update engine stats to reflect the real execution
      engineStats.tradesExecuted++;
      engineStats.funnelExecuted++;
      engineStats.lastTradeAt = Date.now();
      engineStats.lastTrade   = { symbol, side, sizeUSD: amount, price: entryPrice, reason: "Force test", mode: "test" };

      // SMS fires only on confirmed execution
      void sendTradeExecutedSMS(symbol, side, entryPrice);

      tradesCreated++;
    } catch (err) {
      results.push({
        id: "error", symbol: "—", side: "—", status: "error",
        price: 0, amount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  res.json({
    success:       tradesCreated > 0,
    tradesCreated,
    results,
    note: `${tradesCreated} test trades inserted into DB (mix of open/closed). Check Trade Journal immediately.`,
  });
});

export default router;
