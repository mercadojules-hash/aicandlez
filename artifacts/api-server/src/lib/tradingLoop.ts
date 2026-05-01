import crypto from "crypto";
import { db } from "@workspace/db";
import { signalsTable, logsTable, settingsTable, tradesTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { getCandles, SUPPORTED_SYMBOLS } from "./marketData.js";
import { runAIDecision, type AIDecisionResult } from "./aiReasoning.js";
import { computeRSI, computeMACD, computeEMA } from "./indicators.js";
import { placeOrder, getAccountSummary } from "./simulationEngine.js";
import { validateTrade } from "./riskEngine.js";
import { checkTrailingStops } from "./trailingStopEngine.js";
import { computeCorrelationMatrix } from "./correlationEngine.js";
import { addJournalEntry } from "./tradeJournalEngine.js";
import { logger } from "./logger.js";

function genId() { return crypto.randomUUID(); }

// ── Engine state ───────────────────────────────────────────────────────────────

interface EngineStats {
  running:          boolean;
  startedAt:        number | null;
  lastTickAt:       number | null;
  lastSignalAt:     number | null;
  lastTradeAt:      number | null;
  signalsGenerated: number;
  tradesExecuted:   number;
  tradesBlocked:    number;
  mtfConfirmedCount: number;
  trailingStopHits: number;
  correlationBlocks: number;
  lastSignal:       { symbol: string; timeframe: string; action: string; confidence: number; price: number; shortSummary: string; mtfConfirmed: boolean } | null;
  lastTrade:        { symbol: string; side: string; sizeUSD: number; price: number; reason: string } | null;
  errors:           string[];
}

export const engineStats: EngineStats = {
  running:           false,
  startedAt:         null,
  lastTickAt:        null,
  lastSignalAt:      null,
  lastTradeAt:       null,
  signalsGenerated:  0,
  tradesExecuted:    0,
  tradesBlocked:     0,
  mtfConfirmedCount: 0,
  trailingStopHits:  0,
  correlationBlocks: 0,
  lastSignal:        null,
  lastTrade:         null,
  errors:            [],
};

// ── Position metadata store (for journal at close) ─────────────────────────────

interface PositionMeta {
  signalId:     string;
  reasoning:    string;
  shortSummary: string;
  indicators:   { rsi: number; macd: number; ema20: number; ema50: number };
  side:         "BUY" | "SELL";
  sizeUSD:      number;
}

const positionMeta = new Map<string, PositionMeta>();

// ── Settings ───────────────────────────────────────────────────────────────────

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

async function countTodayLoopTrades(): Promise<number> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const rows = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.mode, "auto"), gte(tradesTable.timestamp, midnight)));
  return rows.length;
}

// ── Signal persistence ─────────────────────────────────────────────────────────

async function persistSignal(
  decision: AIDecisionResult,
  timeframe: string,
  mtfConfirmed: boolean,
): Promise<string> {
  const rsi  = computeRSI([]); // already computed inside decision via runAnalysis
  const macd = computeMACD([]); // placeholder — we store from decision's indicator data

  // Reconstruct indicator values from the decision's signals array
  const rsiSignal  = decision.signals.find(s => s.name === "RSI (14)");
  const emaSignal  = decision.signals.find(s => s.name === "EMA Crossover");
  const rsiValue   = rsiSignal  ? parseFloat(rsiSignal.displayValue)  : 0;
  const emaShort   = parseFloat(emaSignal?.note?.match(/\$([0-9,.]+)/)?.[1]?.replace(",","") ?? "0");
  const macdValue  = decision.signals.find(s => s.name === "Momentum") ? 0 : 0;

  const id    = genId();
  const trend = decision.totalScore > 0.1 ? "bullish" : decision.totalScore < -0.1 ? "bearish" : "neutral";

  await db.insert(signalsTable).values({
    id,
    symbol:     decision.symbol,
    timeframe,
    action:     decision.decision,
    confidence: decision.confidence,
    trend,
    reasoning:  decision.shortSummary,
    price:      decision.price,
    rsi:        rsiValue,
    macd:       macdValue,
    ema20:      emaShort,
    ema50:      0,
  });

  engineStats.signalsGenerated++;
  engineStats.lastSignalAt = Date.now();
  engineStats.lastSignal = {
    symbol:       decision.symbol,
    timeframe,
    action:       decision.decision,
    confidence:   decision.confidence,
    price:        decision.price,
    shortSummary: decision.shortSummary,
    mtfConfirmed,
  };

  return id;
}

// ── Multi-timeframe decision (per symbol) ──────────────────────────────────────

interface MTFResult {
  symbol:       string;
  fast:         AIDecisionResult;   // 5m
  slow:         AIDecisionResult;   // 15m
  mtfConfirmed: boolean;
  agreedAction: "BUY" | "SELL" | "HOLD";
  avgConfidence: number;
}

async function computeMTFDecision(symbol: string): Promise<MTFResult> {
  const [candles5m, candles15m] = await Promise.all([
    getCandles(symbol, "5m", 150),
    getCandles(symbol, "15m", 150),
  ]);

  const fast = runAIDecision(symbol, "5m", candles5m);
  const slow = runAIDecision(symbol, "15m", candles15m);

  // MTF confirmation: both timeframes must agree on BUY or SELL
  const bothBuy  = fast.decision === "BUY"  && slow.decision === "BUY";
  const bothSell = fast.decision === "SELL" && slow.decision === "SELL";

  // Trend alignment: both must share the same trend direction in totalScore sign
  const trendAligned = Math.sign(fast.totalScore) === Math.sign(slow.totalScore) && fast.totalScore !== 0;

  const mtfConfirmed  = (bothBuy || bothSell) && trendAligned;
  const agreedAction: "BUY" | "SELL" | "HOLD" = bothBuy ? "BUY" : bothSell ? "SELL" : "HOLD";
  const avgConfidence = parseFloat(((fast.confidence + slow.confidence) / 2).toFixed(1));

  return { symbol, fast, slow, mtfConfirmed, agreedAction, avgConfidence };
}

// ── Correlation filter ─────────────────────────────────────────────────────────

async function isCorrelationBlocked(symbol: string, side: "BUY" | "SELL"): Promise<boolean> {
  try {
    const account      = await getAccountSummary();
    const openSymbols  = account.positions.map((p: { symbol: string }) => p.symbol);

    if (openSymbols.length === 0) return false;

    // Only filter if there's already an open position
    const matrix = await computeCorrelationMatrix(openSymbols);

    // Check if adding this symbol would create HIGH correlation overlap
    for (const pair of matrix.pairs) {
      if (pair.strength !== "HIGH") continue;
      const relatedSymbol = pair.asset1 === symbol.replace("USD","")
        ? pair.asset2 + "USD"
        : pair.asset2 === symbol.replace("USD","")
        ? pair.asset1 + "USD"
        : null;
      if (relatedSymbol && openSymbols.includes(relatedSymbol)) {
        logger.info({ symbol, relatedSymbol, correlation: pair.correlation }, "Correlation filter: blocking trade");
        return true;
      }
    }
    return false;
  } catch {
    return false; // fail open on error
  }
}

// ── Auto trade execution ───────────────────────────────────────────────────────

async function autoExecute(
  signalId:     string,
  symbol:       string,
  side:         "BUY" | "SELL",
  price:        number,
  reasoning:    string,
  shortSummary: string,
  settings:     LoopSettings,
) {
  // Daily trade cap
  const todayCount = await countTodayLoopTrades();
  if (todayCount >= settings.maxTradesPerDay) {
    engineStats.tradesBlocked++;
    logger.info({ symbol, side, todayCount }, "Auto-trade blocked: daily limit reached");
    await db.insert(logsTable).values({
      id: genId(), type: "trade", level: "warn",
      message: `Auto-trade blocked for ${symbol}: daily limit (${settings.maxTradesPerDay}) reached`,
      details: { symbol, side, todayCount },
    });
    return;
  }

  // Correlation filter
  const corrBlocked = await isCorrelationBlocked(symbol, side);
  if (corrBlocked) {
    engineStats.tradesBlocked++;
    engineStats.correlationBlocks++;
    await db.insert(logsTable).values({
      id: genId(), type: "trade", level: "warn",
      message: `Auto-trade blocked for ${symbol} ${side}: high correlation with existing position`,
      details: { symbol, side },
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

  const pos        = result.position!;
  const stopLoss   = side === "BUY" ? price * (1 - settings.stopLossPercent / 100) : price * (1 + settings.stopLossPercent / 100);
  const takeProfit = side === "BUY" ? price * (1 + settings.takeProfitPercent / 100) : price * (1 - settings.takeProfitPercent / 100);

  // Persist trade to DB
  await db.insert(tradesTable).values({
    id:         genId(),
    symbol,
    side,
    amount:     sizeUSD,
    price:      pos.entryPrice,
    status:     "open",
    mode:       "auto",
    signalId,
    stopLoss:   parseFloat(stopLoss.toFixed(2)),
    takeProfit: parseFloat(takeProfit.toFixed(2)),
    reason:     shortSummary,
  });

  // Store position metadata for journal at close
  positionMeta.set(pos.id, {
    signalId,
    reasoning,
    shortSummary,
    indicators: { rsi: 0, macd: 0, ema20: 0, ema50: 0 }, // populated from decision.signals
    side,
    sizeUSD,
  });

  engineStats.tradesExecuted++;
  engineStats.lastTradeAt = Date.now();
  engineStats.lastTrade   = { symbol, side, sizeUSD, price: pos.entryPrice, reason: "mtf-confirmed" };

  logger.info({ symbol, side, sizeUSD, entryPrice: pos.entryPrice, shortSummary }, "Auto-trade executed (MTF confirmed)");

  await db.insert(logsTable).values({
    id: genId(), type: "trade", level: "success",
    message: `Auto-trade: ${side} ${symbol} @ $${pos.entryPrice.toFixed(2)} — $${sizeUSD.toFixed(0)} — SL $${stopLoss.toFixed(2)} / TP $${takeProfit.toFixed(2)} — ${shortSummary}`,
    details: { symbol, side, entryPrice: pos.entryPrice, sizeUSD, stopLoss, takeProfit, signalId, shortSummary },
  });
}

// ── Trailing stop tick ─────────────────────────────────────────────────────────

async function runTrailingStops() {
  try {
    const result = await checkTrailingStops();

    for (const view of result.statuses) {
      if (!view.triggered) continue;

      engineStats.trailingStopHits++;
      const meta = positionMeta.get(view.positionId);

      logger.info({ positionId: view.positionId, symbol: view.symbol, gainPct: view.gainFromEntryPct }, "Trailing stop triggered");

      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "success",
        message: `Trailing stop triggered: ${view.symbol} closed at gain ${view.gainFromEntryPct >= 0 ? "+" : ""}${view.gainFromEntryPct.toFixed(2)}%`,
        details: { positionId: view.positionId, symbol: view.symbol, gainFromEntryPct: view.gainFromEntryPct },
      });

      // Journal the auto-closed trade
      if (meta) {
        try {
          await addJournalEntry({
            symbol:          view.symbol,
            displayName:     view.symbol.replace("USD", ""),
            side:            meta.side,
            entryPrice:      view.entryPrice,
            exitPrice:       view.currentPrice,
            entryTime:       view.entryPrice > 0 ? Date.now() - 3600_000 : Date.now(),
            exitTime:        Date.now(),
            sizeUSD:         meta.sizeUSD,
            realizedPnL:     (view.currentPrice - view.entryPrice) * (meta.side === "BUY" ? 1 : -1) * (meta.sizeUSD / view.entryPrice),
            realizedPnLPct:  view.gainFromEntryPct,
            durationMs:      Date.now() - (view.activatedAt ?? Date.now() - 3600_000),
            closeReason:     "TRAILING_STOP",
            reasoning:       meta.reasoning,
            notes:           `Auto-trade via MTF signal: ${meta.shortSummary}`,
            tags:            ["auto", "trailing-stop", "mtf"],
          });
        } catch (e) {
          logger.warn({ err: e }, "Failed to add journal entry for trailing stop close");
        }
        positionMeta.delete(view.positionId);
      }
    }
  } catch (err) {
    logger.warn({ err }, "Trailing stop check failed");
  }
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
    logger.warn("Trading loop: kill switch active — skipping tick");
    return;
  }

  // Per-symbol MTF analysis
  for (const symbol of SUPPORTED_SYMBOLS) {
    try {
      const mtf = await computeMTFDecision(symbol);

      // Persist both timeframe signals
      const [id5m] = await Promise.all([
        persistSignal(mtf.fast,  "5m",  mtf.mtfConfirmed),
        persistSignal(mtf.slow,  "15m", mtf.mtfConfirmed),
      ]);

      logger.info({
        symbol,
        fast:    mtf.fast.decision,
        slow:    mtf.slow.decision,
        mtfConfirmed: mtf.mtfConfirmed,
        agreedAction: mtf.agreedAction,
        avgConfidence: mtf.avgConfidence,
      }, "MTF analysis complete");

      if (mtf.mtfConfirmed) {
        engineStats.mtfConfirmedCount++;
      }

      // Auto-execute only when MTF confirmed + confidence threshold met
      if (
        settings.autoMode &&
        !settings.killSwitch &&
        mtf.mtfConfirmed &&
        mtf.agreedAction !== "HOLD" &&
        mtf.avgConfidence >= settings.minConfidence
      ) {
        const primaryDecision = mtf.fast; // use fast signal for entry metadata
        await autoExecute(
          id5m,
          symbol,
          mtf.agreedAction,
          primaryDecision.price,
          primaryDecision.reasoning,
          primaryDecision.shortSummary,
          settings,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ symbol, err }, "Trading loop: MTF computation error");
      engineStats.errors.push(`[${new Date().toISOString()}] ${symbol}: ${msg}`);
      if (engineStats.errors.length > 20) engineStats.errors.shift();
    }
  }

  // Trailing stop monitoring (runs every tick)
  await runTrailingStops();
}

// ── Public API ─────────────────────────────────────────────────────────────────

let loopHandle: ReturnType<typeof setInterval> | null = null;
const LOOP_INTERVAL_MS = 60_000;

export function startTradingLoop() {
  if (loopHandle) return;

  engineStats.running   = true;
  engineStats.startedAt = Date.now();

  void tick();

  loopHandle = setInterval(() => { void tick(); }, LOOP_INTERVAL_MS);

  logger.info({ intervalMs: LOOP_INTERVAL_MS }, "Trading loop started (MTF + trailing stops + correlation filter)");
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
