import crypto from "crypto";
import { db } from "@workspace/db";
import { signalsTable, logsTable, settingsTable, tradesTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { getCandles, SUPPORTED_SYMBOLS } from "./marketData.js";
import { runAIDecision } from "./aiReasoning.js";
import { computeRSI, computeMACD, computeEMA } from "./indicators.js";
import { placeOrder } from "./simulationEngine.js";
import { validateTrade } from "./riskEngine.js";
import { logger } from "./logger.js";

function genId() { return crypto.randomUUID(); }

// ── Engine state (in-memory, read via /engine/status) ─────────────────────────

interface EngineStats {
  running:          boolean;
  startedAt:        number | null;
  lastTickAt:       number | null;
  lastSignalAt:     number | null;
  lastTradeAt:      number | null;
  signalsGenerated: number;
  tradesExecuted:   number;
  tradesBlocked:    number;
  lastSignal:       { symbol: string; timeframe: string; action: string; confidence: number; price: number } | null;
  lastTrade:        { symbol: string; side: string; sizeUSD: number; price: number; reason: string } | null;
  errors:           string[];
}

export const engineStats: EngineStats = {
  running:          false,
  startedAt:        null,
  lastTickAt:       null,
  lastSignalAt:     null,
  lastTradeAt:      null,
  signalsGenerated: 0,
  tradesExecuted:   0,
  tradesBlocked:    0,
  lastSignal:       null,
  lastTrade:        null,
  errors:           [],
};

// Pair each symbol with the two most actionable timeframes
const LOOP_PAIRS: Array<{ symbol: string; timeframe: string }> = SUPPORTED_SYMBOLS.flatMap((symbol) => [
  { symbol, timeframe: "5m" },
  { symbol, timeframe: "15m" },
]);

// ── Settings fetch ─────────────────────────────────────────────────────────────

interface LoopSettings {
  autoMode:          boolean;
  killSwitch:        boolean;
  minConfidence:     number;
  allocation:        number;
  stopLossPercent:   number;
  takeProfitPercent: number;
  maxTradesPerDay:   number;
}

async function fetchSettings(): Promise<LoopSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, "default")).limit(1);
  if (rows.length === 0) {
    return { autoMode: false, killSwitch: false, minConfidence: 70, allocation: 1000, stopLossPercent: 2, takeProfitPercent: 4, maxTradesPerDay: 5 };
  }
  const s = rows[0]!;
  return {
    autoMode:          s.autoMode,
    killSwitch:        s.killSwitch,
    minConfidence:     s.minConfidence,
    allocation:        s.allocation,
    stopLossPercent:   s.stopLossPercent,
    takeProfitPercent: s.takeProfitPercent,
    maxTradesPerDay:   s.maxTradesPerDay,
  };
}

// Count trades placed by the loop today
async function countTodayLoopTrades(): Promise<number> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const rows = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.mode, "auto"), gte(tradesTable.timestamp, midnight)));
  return rows.length;
}

// ── Signal generation ──────────────────────────────────────────────────────────

async function generateSignal(symbol: string, timeframe: string, settings: LoopSettings) {
  const candles  = await getCandles(symbol, timeframe, 150);
  const decision = runAIDecision(symbol, timeframe, candles);
  const rsi      = computeRSI(candles);
  const macd     = computeMACD(candles);
  const ema      = computeEMA(candles);
  const id       = genId();

  const trend = decision.totalScore > 0.1 ? "bullish" : decision.totalScore < -0.1 ? "bearish" : "neutral";

  await db.insert(signalsTable).values({
    id,
    symbol,
    timeframe,
    action:     decision.decision,
    confidence: decision.confidence,
    trend,
    reasoning:  decision.reasoning,
    price:      decision.price,
    rsi:        rsi.value,
    macd:       macd.macdLine,
    ema20:      ema.short,
    ema50:      ema.long,
  });

  engineStats.signalsGenerated++;
  engineStats.lastSignalAt = Date.now();
  engineStats.lastSignal = {
    symbol, timeframe,
    action:     decision.decision,
    confidence: decision.confidence,
    price:      decision.price,
  };

  logger.info({
    symbol, timeframe,
    action:     decision.decision,
    confidence: decision.confidence,
    score:      decision.totalScore,
    price:      decision.price,
  }, "Loop signal generated");

  // Auto-execute if conditions are met
  if (
    settings.autoMode &&
    !settings.killSwitch &&
    decision.decision !== "HOLD" &&
    decision.confidence >= settings.minConfidence
  ) {
    await autoExecute(id, symbol, decision.decision as "BUY" | "SELL", decision.price, settings);
  }
}

// ── Auto trade execution ───────────────────────────────────────────────────────

async function autoExecute(
  signalId: string,
  symbol:   string,
  side:     "BUY" | "SELL",
  price:    number,
  settings: LoopSettings,
) {
  // Daily trade cap
  const todayCount = await countTodayLoopTrades();
  if (todayCount >= settings.maxTradesPerDay) {
    engineStats.tradesBlocked++;
    logger.info({ symbol, side, todayCount, maxTradesPerDay: settings.maxTradesPerDay }, "Auto-trade blocked: daily limit reached");
    await db.insert(logsTable).values({
      id: genId(), type: "trade", level: "warn",
      message: `Auto-trade blocked for ${symbol}: daily limit (${settings.maxTradesPerDay}) reached`,
      details: { symbol, side, todayCount },
    });
    return;
  }

  const sizeUSD = settings.allocation;

  // Risk engine gate
  const riskCheck = validateTrade(sizeUSD);
  if (!riskCheck.allowed) {
    engineStats.tradesBlocked++;
    logger.warn({ symbol, side, violations: riskCheck.violations }, "Auto-trade blocked by risk engine");
    await db.insert(logsTable).values({
      id: genId(), type: "trade", level: "warn",
      message: `Auto-trade blocked for ${symbol}: risk engine — ${riskCheck.violations.join("; ")}`,
      details: { symbol, side, violations: riskCheck.violations },
    });
    return;
  }

  // Execute via simulation engine
  const result = await placeOrder({ symbol, side, sizeUSD });

  if (!result.success) {
    engineStats.tradesBlocked++;
    logger.warn({ symbol, side, error: result.error }, "Auto-trade rejected by simulation engine");
    await db.insert(logsTable).values({
      id: genId(), type: "trade", level: "warn",
      message: `Auto-trade failed for ${symbol} ${side}: ${result.error}`,
      details: { symbol, side, error: result.error },
    });
    return;
  }

  const pos = result.position!;
  const stopLoss    = side === "BUY" ? price * (1 - settings.stopLossPercent / 100) : price * (1 + settings.stopLossPercent / 100);
  const takeProfit  = side === "BUY" ? price * (1 + settings.takeProfitPercent / 100) : price * (1 - settings.takeProfitPercent / 100);

  // Persist trade to DB for history / journal
  await db.insert(tradesTable).values({
    id:        genId(),
    symbol,
    side,
    amount:    sizeUSD,
    price:     pos.entryPrice,
    status:    "open",
    mode:      "auto",
    signalId,
    stopLoss:  parseFloat(stopLoss.toFixed(2)),
    takeProfit: parseFloat(takeProfit.toFixed(2)),
  });

  engineStats.tradesExecuted++;
  engineStats.lastTradeAt = Date.now();
  engineStats.lastTrade = { symbol, side, sizeUSD, price: pos.entryPrice, reason: "auto-signal" };

  logger.info({ symbol, side, sizeUSD, entryPrice: pos.entryPrice }, "Auto-trade executed");

  await db.insert(logsTable).values({
    id: genId(), type: "trade", level: "success",
    message: `Auto-trade executed: ${side} ${symbol} @ $${pos.entryPrice.toFixed(2)} — size $${sizeUSD.toFixed(0)} — SL $${stopLoss.toFixed(2)} / TP $${takeProfit.toFixed(2)}`,
    details: { symbol, side, entryPrice: pos.entryPrice, sizeUSD, stopLoss, takeProfit, signalId },
  });
}

// ── Main loop tick ─────────────────────────────────────────────────────────────

async function tick() {
  engineStats.lastTickAt = Date.now();

  let settings: LoopSettings;
  try {
    settings = await fetchSettings();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Trading loop: failed to fetch settings");
    engineStats.errors.push(`[${new Date().toISOString()}] settings fetch: ${msg}`);
    if (engineStats.errors.length > 20) engineStats.errors.shift();
    return;
  }

  if (settings.killSwitch) {
    logger.warn("Trading loop: kill switch is active — skipping tick");
    return;
  }

  // Process pairs sequentially to avoid Kraken rate-limit pressure
  for (const { symbol, timeframe } of LOOP_PAIRS) {
    try {
      await generateSignal(symbol, timeframe, settings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ symbol, timeframe, err }, "Trading loop: signal generation error");
      engineStats.errors.push(`[${new Date().toISOString()}] ${symbol}/${timeframe}: ${msg}`);
      if (engineStats.errors.length > 20) engineStats.errors.shift();
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

let loopHandle: ReturnType<typeof setInterval> | null = null;
const LOOP_INTERVAL_MS = 60_000;

export function startTradingLoop() {
  if (loopHandle) return;

  engineStats.running   = true;
  engineStats.startedAt = Date.now();

  // Run first tick immediately (async, non-blocking)
  void tick();

  loopHandle = setInterval(() => { void tick(); }, LOOP_INTERVAL_MS);

  logger.info({ intervalMs: LOOP_INTERVAL_MS }, "Trading loop started");
}

export function stopTradingLoop() {
  if (loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
  }
  engineStats.running = false;
  logger.info("Trading loop stopped");
}

export function getLoopIntervalMs() { return LOOP_INTERVAL_MS; }
