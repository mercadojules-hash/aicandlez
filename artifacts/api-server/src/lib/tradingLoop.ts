import crypto from "crypto";
import { db } from "@workspace/db";
import { signalsTable, logsTable, settingsTable, tradesTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { getCandles, SUPPORTED_SYMBOLS, type Candle } from "./marketData.js";
import { runAIDecision, type AIDecisionResult } from "./aiReasoning.js";
import { computeRSI, computeEMA, computeMACD } from "./indicators.js";
import { placeOrder, getAccountSummary } from "./simulationEngine.js";
import { validateTrade } from "./riskEngine.js";
import { checkTrailingStops } from "./trailingStopEngine.js";
import { computeCorrelationMatrix } from "./correlationEngine.js";
import { addJournalEntry } from "./tradeJournalEngine.js";
import { logger } from "./logger.js";

function genId() { return crypto.randomUUID(); }

// ── Per-symbol breakdown (for debug panel) ────────────────────────────────────

export interface TimeframeSnapshot {
  decision:    string;
  confidence:  number;
  rsi:         number;
  ema9:        number;
  ema21:       number;
  emaSignal:   string;
  macdLine:    number;
  macdSignal:  number;
  macdState:   string;
  shortSummary: string;
}

export interface SymbolBreakdown {
  symbol:        string;
  fast:          TimeframeSnapshot;   // 5m
  slow:          TimeframeSnapshot;   // 15m
  mtfConfirmed:  boolean;
  agreedAction:  string;
  avgConfidence: number;
  blockReason:   string;
  lastUpdated:   number;
}

// ── Signal log entry (last-10 circular buffer) ────────────────────────────────

export interface SignalLogEntry {
  id:           string;
  symbol:       string;
  timeframe:    string;
  decision:     string;
  confidence:   number;
  shortSummary: string;
  blockReason:  string | null;
  executedAs:   "auto" | "test" | null;
  timestamp:    number;
}

// ── Engine state ───────────────────────────────────────────────────────────────

interface EngineStats {
  running:            boolean;
  startedAt:          number | null;
  lastTickAt:         number | null;
  lastSignalAt:       number | null;
  lastTradeAt:        number | null;
  signalsGenerated:   number;
  tradesExecuted:     number;
  tradesBlocked:      number;
  mtfConfirmedCount:  number;
  mtfBlockCount:      number;
  trailingStopHits:   number;
  correlationBlocks:  number;
  testMode:           boolean;
  // Signal distribution
  signalCounts:       { BUY: number; SELL: number; HOLD: number };
  // Execution funnel
  funnelTotal:        number;
  funnelPassedMTF:    number;
  funnelBlockedMTF:   number;
  funnelExecuted:     number;
  // Per-symbol MTF breakdown
  symbolBreakdowns:   Record<string, SymbolBreakdown>;
  // Last 10 signals log
  recentSignalLog:    SignalLogEntry[];
  lastSignal:         { symbol: string; timeframe: string; action: string; confidence: number; price: number; shortSummary: string; mtfConfirmed: boolean } | null;
  lastTrade:          { symbol: string; side: string; sizeUSD: number; price: number; reason: string; mode: string } | null;
  errors:             string[];
}

export const engineStats: EngineStats = {
  running:            false,
  startedAt:          null,
  lastTickAt:         null,
  lastSignalAt:       null,
  lastTradeAt:        null,
  signalsGenerated:   0,
  tradesExecuted:     0,
  tradesBlocked:      0,
  mtfConfirmedCount:  0,
  mtfBlockCount:      0,
  trailingStopHits:   0,
  correlationBlocks:  0,
  testMode:           false,
  signalCounts:       { BUY: 0, SELL: 0, HOLD: 0 },
  funnelTotal:        0,
  funnelPassedMTF:    0,
  funnelBlockedMTF:   0,
  funnelExecuted:     0,
  symbolBreakdowns:   {},
  recentSignalLog:    [],
  lastSignal:         null,
  lastTrade:          null,
  errors:             [],
};

export function setTestMode(enabled: boolean) {
  engineStats.testMode = enabled;
  logger.info({ testMode: enabled }, "Trading loop: test mode changed");
}

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

// ── Signal log helper ──────────────────────────────────────────────────────────

function appendSignalLog(entry: SignalLogEntry) {
  engineStats.recentSignalLog.unshift(entry);
  if (engineStats.recentSignalLog.length > 10) {
    engineStats.recentSignalLog.pop();
  }
}

// ── Indicator snapshot from candles ───────────────────────────────────────────

function buildTimeframeSnapshot(
  decision: AIDecisionResult,
  candles:  Candle[],
): TimeframeSnapshot {
  const rsi  = computeRSI(candles);
  const ema  = computeEMA(candles);   // EMA9 / EMA21 by default
  const macd = computeMACD(candles);

  const macdState =
    macd.macdLine > 0 && macd.histogram > 0 ? "bullish"  :
    macd.macdLine < 0 && macd.histogram < 0 ? "bearish"  :
    macd.crossover !== "none"               ? `${macd.crossover} cross` :
    "neutral";

  return {
    decision:    decision.decision,
    confidence:  decision.confidence,
    rsi:         rsi.value,
    ema9:        ema.short,
    ema21:       ema.long,
    emaSignal:   ema.signal,
    macdLine:    macd.macdLine,
    macdSignal:  macd.signalLine,
    macdState,
    shortSummary: decision.shortSummary,
  };
}

// ── Signal persistence ─────────────────────────────────────────────────────────

async function persistSignal(
  decision: AIDecisionResult,
  timeframe: string,
  snap:     TimeframeSnapshot,
  mtfConfirmed: boolean,
): Promise<string> {
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
    rsi:        snap.rsi,
    macd:       snap.macdLine,
    ema20:      snap.ema9,
    ema50:      snap.ema21,
  });

  // Update signal counters
  const key = decision.decision as "BUY" | "SELL" | "HOLD";
  if (key in engineStats.signalCounts) engineStats.signalCounts[key]++;
  engineStats.signalsGenerated++;
  engineStats.funnelTotal++;
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
  symbol:        string;
  fast:          AIDecisionResult;
  slow:          AIDecisionResult;
  fastSnap:      TimeframeSnapshot;
  slowSnap:      TimeframeSnapshot;
  mtfConfirmed:  boolean;
  agreedAction:  "BUY" | "SELL" | "HOLD";
  avgConfidence: number;
  blockReason:   string;
}

async function computeMTFDecision(symbol: string): Promise<MTFResult> {
  const [candles5m, candles15m] = await Promise.all([
    getCandles(symbol, "5m", 150),
    getCandles(symbol, "15m", 150),
  ]);

  const fast = runAIDecision(symbol, "5m",  candles5m);
  const slow = runAIDecision(symbol, "15m", candles15m);

  const fastSnap = buildTimeframeSnapshot(fast, candles5m);
  const slowSnap = buildTimeframeSnapshot(slow, candles15m);

  const bothBuy  = fast.decision === "BUY"  && slow.decision === "BUY";
  const bothSell = fast.decision === "SELL" && slow.decision === "SELL";
  const trendAligned = Math.sign(fast.totalScore) === Math.sign(slow.totalScore) && fast.totalScore !== 0;

  const mtfConfirmed  = (bothBuy || bothSell) && trendAligned;
  const agreedAction: "BUY" | "SELL" | "HOLD" = bothBuy ? "BUY" : bothSell ? "SELL" : "HOLD";
  const avgConfidence = parseFloat(((fast.confidence + slow.confidence) / 2).toFixed(1));

  // Determine block reason
  let blockReason = "None";
  if (fast.decision === "HOLD" && slow.decision === "HOLD") {
    blockReason = "HOLD bias";
  } else if (!bothBuy && !bothSell) {
    blockReason = `MTF mismatch (5m=${fast.decision} 15m=${slow.decision})`;
  } else if (mtfConfirmed && agreedAction !== "HOLD") {
    blockReason = "None";
  }

  return { symbol, fast, slow, fastSnap, slowSnap, mtfConfirmed, agreedAction, avgConfidence, blockReason };
}

// ── Correlation filter ─────────────────────────────────────────────────────────

async function isCorrelationBlocked(symbol: string): Promise<boolean> {
  try {
    const account     = await getAccountSummary();
    const openSymbols = account.positions.map((p: { symbol: string }) => p.symbol);
    if (openSymbols.length === 0) return false;

    const matrix = await computeCorrelationMatrix(openSymbols);
    for (const pair of matrix.pairs) {
      if (pair.strength !== "HIGH") continue;
      const relatedSymbol =
        pair.asset1 === symbol.replace("USD", "") ? pair.asset2 + "USD" :
        pair.asset2 === symbol.replace("USD", "") ? pair.asset1 + "USD" : null;
      if (relatedSymbol && openSymbols.includes(relatedSymbol)) {
        logger.info({ symbol, relatedSymbol, correlation: pair.correlation }, "Correlation filter: blocking");
        return true;
      }
    }
    return false;
  } catch {
    return false;
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
  isTest:       boolean,
): Promise<{ executed: boolean; blockReason: string | null }> {
  const todayCount = await countTodayLoopTrades();
  if (todayCount >= settings.maxTradesPerDay) {
    engineStats.tradesBlocked++;
    const msg = `Auto-trade blocked for ${symbol}: daily limit (${settings.maxTradesPerDay}) reached`;
    logger.info({ symbol, side, todayCount }, msg);
    await db.insert(logsTable).values({ id: genId(), type: "trade", level: "warn", message: msg, details: { symbol, side } });
    return { executed: false, blockReason: "Daily limit" };
  }

  const corrBlocked = await isCorrelationBlocked(symbol);
  if (corrBlocked) {
    engineStats.tradesBlocked++;
    engineStats.correlationBlocks++;
    const msg = `Auto-trade blocked for ${symbol} ${side}: high correlation with existing position`;
    await db.insert(logsTable).values({ id: genId(), type: "trade", level: "warn", message: msg, details: { symbol, side } });
    return { executed: false, blockReason: "Correlation filter" };
  }

  const sizeUSD   = settings.allocation;
  const riskCheck = validateTrade(sizeUSD);
  if (!riskCheck.allowed) {
    engineStats.tradesBlocked++;
    logger.warn({ symbol, side, violations: riskCheck.violations }, "Auto-trade blocked by risk engine");
    await db.insert(logsTable).values({
      id: genId(), type: "trade", level: "warn",
      message: `Auto-trade blocked for ${symbol}: risk engine — ${riskCheck.violations.join("; ")}`,
      details: { symbol, side, violations: riskCheck.violations },
    });
    return { executed: false, blockReason: `Risk engine: ${riskCheck.violations.join("; ")}` };
  }

  const result = await placeOrder({ symbol, side, sizeUSD });
  if (!result.success) {
    engineStats.tradesBlocked++;
    logger.warn({ symbol, side, error: result.error }, "Auto-trade rejected by simulation engine");
    await db.insert(logsTable).values({
      id: genId(), type: "trade", level: "warn",
      message: `Auto-trade failed for ${symbol} ${side}: ${result.error}`,
      details: { symbol, side, error: result.error },
    });
    return { executed: false, blockReason: `Sim engine: ${result.error}` };
  }

  const pos        = result.position!;
  const stopLoss   = side === "BUY" ? price * (1 - settings.stopLossPercent / 100) : price * (1 + settings.stopLossPercent / 100);
  const takeProfit = side === "BUY" ? price * (1 + settings.takeProfitPercent / 100) : price * (1 - settings.takeProfitPercent / 100);
  const tradeMode  = isTest ? "test" : "auto";

  await db.insert(tradesTable).values({
    id:         genId(),
    symbol,
    side,
    amount:     sizeUSD,
    price:      pos.entryPrice,
    status:     "open",
    mode:       tradeMode,
    signalId,
    stopLoss:   parseFloat(stopLoss.toFixed(2)),
    takeProfit: parseFloat(takeProfit.toFixed(2)),
    reason:     shortSummary,
  });

  positionMeta.set(pos.id, { signalId, reasoning, shortSummary, indicators: { rsi: 0, macd: 0, ema20: 0, ema50: 0 }, side, sizeUSD });

  engineStats.tradesExecuted++;
  engineStats.funnelExecuted++;
  engineStats.lastTradeAt = Date.now();
  engineStats.lastTrade   = { symbol, side, sizeUSD, price: pos.entryPrice, reason: shortSummary, mode: tradeMode };

  const tag = isTest ? "[TEST MODE]" : "[AUTO]";
  logger.info({ symbol, side, sizeUSD, entryPrice: pos.entryPrice, shortSummary, tradeMode }, `${tag} Trade executed`);

  await db.insert(logsTable).values({
    id: genId(), type: "trade", level: "success",
    message: `${tag} ${side} ${symbol} @ $${pos.entryPrice.toFixed(2)} — $${sizeUSD.toFixed(0)} — SL $${stopLoss.toFixed(2)} / TP $${takeProfit.toFixed(2)} — ${shortSummary}`,
    details: { symbol, side, entryPrice: pos.entryPrice, sizeUSD, stopLoss, takeProfit, signalId, shortSummary, tradeMode },
  });

  return { executed: true, blockReason: null };
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
      if (meta) {
        try {
          await addJournalEntry({
            symbol:         view.symbol,
            displayName:    view.symbol.replace("USD", ""),
            side:           meta.side,
            entryPrice:     view.entryPrice,
            exitPrice:      view.currentPrice,
            entryTime:      Date.now() - 3600_000,
            exitTime:       Date.now(),
            sizeUSD:        meta.sizeUSD,
            realizedPnL:    (view.currentPrice - view.entryPrice) * (meta.side === "BUY" ? 1 : -1) * (meta.sizeUSD / view.entryPrice),
            realizedPnLPct: view.gainFromEntryPct,
            durationMs:     Date.now() - (view.activatedAt ?? Date.now() - 3600_000),
            closeReason:    "TRAILING_STOP",
            reasoning:      meta.reasoning,
            notes:          `Auto-trade via MTF signal: ${meta.shortSummary}`,
            tags:           ["auto", "trailing-stop", "mtf"],
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

  for (const symbol of SUPPORTED_SYMBOLS) {
    try {
      const mtf = await computeMTFDecision(symbol);

      // Persist both signals
      const [id5m] = await Promise.all([
        persistSignal(mtf.fast,  "5m",  mtf.fastSnap, mtf.mtfConfirmed),
        persistSignal(mtf.slow,  "15m", mtf.slowSnap, mtf.mtfConfirmed),
      ]);

      // Update funnel
      if (mtf.mtfConfirmed) {
        engineStats.mtfConfirmedCount++;
        engineStats.funnelPassedMTF++;
      } else {
        engineStats.mtfBlockCount++;
        engineStats.funnelBlockedMTF++;
      }

      // Update per-symbol breakdown
      engineStats.symbolBreakdowns[symbol] = {
        symbol,
        fast:          mtf.fastSnap,
        slow:          mtf.slowSnap,
        mtfConfirmed:  mtf.mtfConfirmed,
        agreedAction:  mtf.agreedAction,
        avgConfidence: mtf.avgConfidence,
        blockReason:   mtf.blockReason,
        lastUpdated:   Date.now(),
      };

      logger.info({
        symbol,
        fast:         mtf.fast.decision,
        slow:         mtf.slow.decision,
        mtfConfirmed: mtf.mtfConfirmed,
        agreedAction: mtf.agreedAction,
        avgConf:      mtf.avgConfidence,
        blockReason:  mtf.blockReason,
      }, "MTF analysis");

      const testMode   = engineStats.testMode;
      const confThresh = testMode ? 35 : settings.minConfidence;

      // Test mode also allows single-TF strong signal
      const testSingleTF =
        testMode && (
          (mtf.fast.decision !== "HOLD" && mtf.fast.confidence >= 60) ||
          (mtf.slow.decision !== "HOLD" && mtf.slow.confidence >= 60)
        );
      const testAction: "BUY" | "SELL" | "HOLD" =
        testSingleTF
          ? (mtf.fast.confidence >= 60 && mtf.fast.decision !== "HOLD"
              ? mtf.fast.decision as "BUY" | "SELL"
              : mtf.slow.decision as "BUY" | "SELL")
          : mtf.agreedAction;

      const shouldTrade =
        settings.autoMode &&
        !settings.killSwitch &&
        (mtf.mtfConfirmed || testSingleTF) &&
        testAction !== "HOLD" &&
        mtf.avgConfidence >= confThresh;

      // Determine block reason for the signal log
      let signalBlockReason: string | null = null;
      if (!settings.autoMode) {
        signalBlockReason = "Auto-mode off";
      } else if (!mtf.mtfConfirmed && !testSingleTF) {
        signalBlockReason = mtf.blockReason;
      } else if (mtf.avgConfidence < confThresh) {
        signalBlockReason = `Low confidence (${mtf.avgConfidence.toFixed(1)}% < ${confThresh}%)`;
      }

      // Append to signal log
      appendSignalLog({
        id:           id5m,
        symbol,
        timeframe:    "5m+15m",
        decision:     mtf.agreedAction,
        confidence:   mtf.avgConfidence,
        shortSummary: mtf.fast.shortSummary,
        blockReason:  signalBlockReason,
        executedAs:   null,
        timestamp:    Date.now(),
      });

      if (shouldTrade) {
        const primaryDecision = mtf.fast;
        const execResult = await autoExecute(
          id5m,
          symbol,
          testAction,
          primaryDecision.price,
          primaryDecision.reasoning ?? "",
          primaryDecision.shortSummary,
          settings,
          testMode,
        );

        // Update signal log with execution result
        const logEntry = engineStats.recentSignalLog.find((e) => e.id === id5m);
        if (logEntry) {
          logEntry.blockReason = execResult.blockReason;
          logEntry.executedAs  = execResult.executed ? (testMode ? "test" : "auto") : null;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ symbol, err }, "Trading loop: MTF computation error");
      engineStats.errors.push(`[${new Date().toISOString()}] ${symbol}: ${msg}`);
      if (engineStats.errors.length > 20) engineStats.errors.shift();
    }
  }

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

  logger.info({ intervalMs: LOOP_INTERVAL_MS }, "Trading loop started (MTF + trailing stops + correlation + test mode)");
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
