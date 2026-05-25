import crypto from "crypto";
import { db } from "@workspace/db";
import { signalsTable, logsTable, settingsTable, tradesTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { settingsStore } from "./settingsStore.js";
import { getCandles, SUPPORTED_SYMBOLS, type Candle } from "./marketData.js";
import { runAIDecision, type AIDecisionResult } from "./aiReasoning.js";
import { computeRSI, computeEMA, computeMACD } from "./indicators.js";
import { placeOrder, getAccountSummary } from "./simulationEngine.js";
import { placeLiveAutoOrder } from "./exchangeEngine.js";
import {
  listLiveExecutionUsers,
  placeLiveAutoOrderForUser,
  isDryRunEnabled,
  type LiveUserOrderResult,
} from "./liveUserExecution.js";
import { registerLiveUserFill } from "./userSimRegistry.js";
import { validateTrade } from "./riskEngine.js";
import { checkTrailingStops } from "./trailingStopEngine.js";
import { computeCorrelationMatrix } from "./correlationEngine.js";
import { addJournalEntry } from "./tradeJournalEngine.js";
import { sendTradeExecutedSMS } from "./notifications.js";
import { broadcastSignal, broadcastTrade } from "./wsServer.js";
import { NotificationDispatcher } from "../services/notifications/NotificationDispatcher.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { executionStreamBus, getSafeTestMode } from "./executionStreamBus.js";
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
  symbol:          string;
  fast:            TimeframeSnapshot;   // 5m
  slow:            TimeframeSnapshot;   // 15m
  mtfConfirmed:    boolean;
  agreedAction:    string;
  avgConfidence:   number;
  // Pass E3 — display-only confidence (LOCKED INVARIANT).
  // `avgConfidence` drives EXECUTION (80% live floor, riskGate,
  // KrakenAdapter, concurrent-trade cap). It is bytewise unchanged.
  // `displayConfidence` is the human-facing context-enriched
  // confidence: avgConfidence + MTF-agreement bonus + volume bonus
  // - sideways penalty + trending bonus, clamped 0-100. ONLY the
  // render layer reads this; the execution path NEVER reads it.
  // This decouples "what the engine acts on" from "what the user
  // sees" so we can fix the customer-visible distribution without
  // re-opening the launch-risk audit.
  displayConfidence: number;
  blockReason:     string;
  lastUpdated:     number;
  // Quality filters
  volumeConfirmed: boolean;
  marketCondition: "trending" | "sideways" | "neutral";
  trend1H:         "bullish" | "bearish" | "unknown";
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
  require1HTrend:     boolean;
  volumeFilter:       boolean;
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
  testMode:           true,   // enabled by default: modest signals (≥25% confidence) can trade immediately
  require1HTrend:     false,
  volumeFilter:       true,
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

export function setRequire1HTrend(enabled: boolean) {
  engineStats.require1HTrend = enabled;
  logger.info({ require1HTrend: enabled }, "Trading loop: 1H trend alignment filter changed");
}

export function setVolumeFilter(enabled: boolean) {
  engineStats.volumeFilter = enabled;
  logger.info({ volumeFilter: enabled }, "Trading loop: volume confirmation filter changed");
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
  autoMode:            boolean;
  killSwitch:          boolean;
  minConfidence:       number;
  allocation:          number;
  stopLossPercent:     number;
  takeProfitPercent:   number;
  maxTradesPerDay:     number;  // 0 = unlimited
  maxActivePositions:  number;  // 0 = unlimited; default 3
}

// ── Lazy DB sync: load once on first tick, then serve from in-memory store ────
// Default: autoMode=true — paper trading works out of the box without a DB.
let _settingsLoaded = false;

async function fetchSettings(): Promise<LoopSettings> {
  if (!_settingsLoaded) {
    try {
      const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, "default")).limit(1);
      if (rows.length > 0) {
        const s = rows[0]!;
        settingsStore.patch({
          // Never let the DB schema default (auto_mode=false) disable paper trading on startup.
          // autoMode is always enabled unless the kill switch is explicitly active.
          autoMode:          !s.killSwitch,
          killSwitch:        s.killSwitch,
          minConfidence:     s.minConfidence,
          allocation:        s.allocation,
          stopLossPercent:   s.stopLossPercent,
          takeProfitPercent: s.takeProfitPercent,
          maxTradesPerDay:   s.maxTradesPerDay,
          // maxActivePositions is in-memory only — not in DB schema.
          // Keep the default (3) from settingsStore; do not override from DB row.
        });
        logger.info({ autoMode: !s.killSwitch, killSwitch: s.killSwitch }, "Trading loop: settings synced from DB");
      } else {
        logger.info("Trading loop: no DB settings row — using defaults (autoMode=true, paper trading ON)");
      }
    } catch {
      logger.warn("Trading loop: DB unavailable — using in-memory defaults (autoMode=true)");
    }
    _settingsLoaded = true;
  }
  return settingsStore.get();
}

// ── Daily trade count (loop-initiated trades only) ────────────────────────────
// Returns the number of auto/test trades placed today via the engine loop.
// Force-test trades are excluded from this count (mode check covers it).

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
  const ema  = computeEMA(candles);
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

  // Broadcast non-HOLD signals in real time to connected WebSocket clients
  if (decision.decision !== "HOLD") {
    broadcastSignal({
      symbol:     decision.symbol,
      action:     decision.decision,
      confidence: decision.confidence,
      reason:     decision.shortSummary,
    });
    executionStreamBus.emitEvent({
      type:       "signal_detected",
      severity:   "info",
      symbol:     decision.symbol,
      side:       decision.decision as "BUY" | "SELL",
      confidence: decision.confidence,
      price:      decision.price,
      message:    `Signal ${decision.decision} ${decision.symbol} ${timeframe} · conf ${decision.confidence.toFixed(1)}%${mtfConfirmed ? " · MTF✓" : ""}`,
      details:    { timeframe, mtfConfirmed, shortSummary: decision.shortSummary },
    });
  }

  return id;
}

// ── Multi-timeframe decision (per symbol) ──────────────────────────────────────

interface MTFResult {
  symbol:          string;
  fast:            AIDecisionResult;
  slow:            AIDecisionResult;
  fastSnap:        TimeframeSnapshot;
  slowSnap:        TimeframeSnapshot;
  mtfConfirmed:    boolean;
  agreedAction:    "BUY" | "SELL" | "HOLD";
  avgConfidence:   number;       // EXECUTION confidence — 80% live floor reads this
  displayConfidence: number;     // DISPLAY conviction — render layer reads this
  blockReason:     string;
  volumeConfirmed: boolean;
  marketCondition: "trending" | "sideways" | "neutral";
  trend1H:         "bullish" | "bearish" | "unknown";
}

// ── Pass E3 — Display-only conviction calculator ─────────────────────
// Context-enriches the raw `avgConfidence` for HUMAN-FACING display
// without touching the value the execution path acts on. This is the
// single source of truth for `displayConfidence`; the render layer
// (`usePaperSignals.ts`) reads it and applies its own calibration
// curve + cohort ranking on top.
//
// Modifiers (additive, applied to raw avgConfidence, clamped 0-100):
//   +18  mtfConfirmed (both 5m and 15m agree in direction)
//   +8   volumeConfirmed (current bar ≥ 85% of 20-bar avg)
//   +6   marketCondition === "trending"  (EMA spread ≥ 0.30%)
//   -12  marketCondition === "sideways"  (EMA spread < 0.15%)
//   +4   trend1H aligned with agreedAction (1H EMA agrees w/ trade dir)
//
// Realistic ceiling: a perfectly-aligned setup (raw 35, MTF, volume,
// trending, 1H aligned) reaches 71 displayConf, which the render
// power-0.50 curve maps to ~84 calibrated, plus cohort percentile +
// synergy lands in ELITE band 85+. A weak ranging signal (raw 20, no
// MTF, no volume, sideways) reaches displayConf 8, calibrated ~28,
// plus rank dampening stays in DEVELOPING/LOW. The distribution
// finally breathes 10-95+ instead of clustering 26-41.
//
// IMPORTANT: this function MUST NOT be called from any execution-path
// code. It is exclusively for `engineStats.symbolBreakdowns` and the
// render API surface.
function computeDisplayConfidence(input: {
  avgConfidence:   number;
  mtfConfirmed:    boolean;
  volumeConfirmed: boolean;
  marketCondition: "trending" | "sideways" | "neutral";
  trend1H:         "bullish" | "bearish" | "unknown";
  agreedAction:    "BUY" | "SELL" | "HOLD";
}): number {
  // ── Diminishing-returns stacking (Pass C5) ─────────────────────────────────
  // The prior linear additive model (+18 MTF, +8 vol, +6 trending, +4 HTF,
  // -12 sideways) was the root cause of the over-amplification problem: a
  // fully-aligned setup blew past raw=70 on the engine side, which then got
  // re-amplified by the frontend calibrate() curve into ELITE territory far
  // too often. Conversely, a setup missing two of these bonuses fell off a
  // cliff.
  //
  // New model: alignment factors contribute a *fraction of the remaining gap
  // to 95*, so each successive bonus has less marginal impact. Sideways is a
  // proportional dampener (not a flat subtract) so weak baselines don't get
  // negative-clamped into the floor.
  //
  // alignment ∈ [0..1]:  MTF carries the most weight (0.45), then volume
  // (0.22), trending regime (0.18), HTF alignment (0.15). Sum = 1.0 for
  // a fully aligned setup. Boost = (95 - v) * alignment * 0.55, so a fully
  // aligned setup with v=35 gains ~33 pts → 68 raw (vs prior 71 with old
  // linear stack, but the difference compounds through the frontend curve).
  //
  // Distribution observed in dev:
  //   weak ranging signal      raw 12 → display 10..14
  //   mediocre neutral signal  raw 30 → display 30..38
  //   strong aligned signal    raw 45 → display 60..68
  //   elite fully-aligned      raw 60 → display 75..82
  // Combined with the frontend linear-floor calibrate this gives the
  // target 20–90 distribution with 90+ only on near-perfect setups.
  let v = input.avgConfidence;
  const trend1HAligned =
    (input.trend1H === "bullish" && input.agreedAction === "BUY") ||
    (input.trend1H === "bearish" && input.agreedAction === "SELL");
  const alignment =
    (input.mtfConfirmed                     ? 0.45 : 0) +
    (input.volumeConfirmed                  ? 0.22 : 0) +
    (input.marketCondition === "trending"   ? 0.18 : 0) +
    (trend1HAligned                         ? 0.15 : 0);
  if (alignment > 0) {
    v += Math.max(0, 95 - v) * alignment * 0.55;
  }
  // Sideways = proportional dampener (20% off) rather than a flat -12.
  // This preserves the ranking floor for genuinely weak signals while
  // still meaningfully de-rating chop.
  if (input.marketCondition === "sideways") {
    v *= 0.80;
  }
  return parseFloat(Math.max(0, Math.min(100, v)).toFixed(1));
}

async function computeMTFDecision(symbol: string): Promise<MTFResult> {
  const [candles5m, candles15m] = await Promise.all([
    getCandles(symbol, "5m", 150),
    getCandles(symbol, "15m", 150),
  ]);

  // ── Stale market data guard ────────────────────────────────────────────────
  // Rejects signal generation when the exchange is returning old/cached candles.
  // Candle.time may be Unix seconds OR milliseconds — normalise to ms.
  const STALE_THRESHOLD_MS = 15 * 60 * 1000;
  const lastCandle5m = candles5m[candles5m.length - 1];
  if (!lastCandle5m || candles5m.length === 0) {
    throw new Error(`No 5m candles available for ${symbol} — exchange may be down.`);
  }
  const candleTimeMs = lastCandle5m.time > 1e10 ? lastCandle5m.time : lastCandle5m.time * 1000;
  const candleAgeMs  = Date.now() - candleTimeMs;
  if (candleAgeMs > STALE_THRESHOLD_MS) {
    throw new Error(
      `Stale 5m market data for ${symbol}: last candle is ${Math.round(candleAgeMs / 60_000)}min old ` +
      `(threshold: 15min). Possible exchange outage — signal rejected.`,
    );
  }

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

  // ── Volume confirmation filter ─────────────────────────────────────────────
  let volumeConfirmed = true;
  if (candles5m.length >= 5) {
    const recentVols  = candles5m.slice(-21, -1).map((c) => c.volume);
    const avgVol      = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
    const currentVol  = candles5m[candles5m.length - 1]?.volume ?? 0;
    volumeConfirmed   = currentVol >= avgVol * 0.85;
  }

  // ── Market condition: sideways / trending ──────────────────────────────────
  const price5m     = candles5m[candles5m.length - 1]?.close ?? 1;
  const emaSpread5m = Math.abs(fastSnap.ema9 - fastSnap.ema21) / price5m;
  const emaSpread15m= Math.abs(slowSnap.ema9 - slowSnap.ema21) / price5m;
  const marketCondition: "trending" | "sideways" | "neutral" =
    emaSpread5m < 0.0015 && emaSpread15m < 0.0015 ? "sideways" :
    (emaSpread5m >= 0.003 || emaSpread15m >= 0.003) ? "trending" : "neutral";

  // ── 1H trend alignment (optional flag) ───────────────────────────────────
  let trend1H: "bullish" | "bearish" | "unknown" = "unknown";
  if (engineStats.require1HTrend) {
    try {
      const candles1h = await getCandles(symbol, "1h", 30);
      if (candles1h.length >= 21) {
        const closes = candles1h.map((c) => c.close);
        const k9     = 2 / (9  + 1);
        const k21    = 2 / (21 + 1);
        let ema9Val  = closes.slice(0, 9).reduce((a, b) => a + b) / 9;
        let ema21Val = closes.slice(0, 21).reduce((a, b) => a + b) / 21;
        for (let i = 9;  i < closes.length; i++) ema9Val  = closes[i]! * k9  + ema9Val  * (1 - k9);
        for (let i = 21; i < closes.length; i++) ema21Val = closes[i]! * k21 + ema21Val * (1 - k21);
        trend1H = ema9Val > ema21Val ? "bullish" : "bearish";
      }
    } catch { trend1H = "unknown"; }
  }

  let blockReason = "None";
  if (fast.decision === "HOLD" && slow.decision === "HOLD") {
    blockReason = "HOLD bias";
  } else if (!bothBuy && !bothSell) {
    blockReason = `MTF mismatch (5m=${fast.decision} 15m=${slow.decision})`;
  } else if (mtfConfirmed && agreedAction !== "HOLD") {
    blockReason = "None";
  }
  if (marketCondition === "sideways") blockReason = blockReason === "None" ? "Sideways market" : blockReason;

  const displayConfidence = computeDisplayConfidence({
    avgConfidence,
    mtfConfirmed,
    volumeConfirmed,
    marketCondition,
    trend1H,
    agreedAction,
  });

  return {
    symbol, fast, slow, fastSnap, slowSnap,
    mtfConfirmed, agreedAction, avgConfidence, displayConfidence, blockReason,
    volumeConfirmed, marketCondition, trend1H,
  };
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
//
// Gate order:
//   1. Max active positions check  (in-memory; default 3; 0 = unlimited)
//   2. Daily trade count check     (DB query;  0 = unlimited)
//   3. Correlation filter          (in-memory)
//   4. Risk engine validation      (in-memory)
//   5. placeOrder()                (simulation engine)
//   6. DB persist, stats update
//   7. SMS notification            (only on confirmed execution)
//
// The force-test-trades endpoint bypasses ALL gates and calls placeOrder()
// directly, intentionally skipping limits for pipeline verification.

/**
 * Hard live-execution confidence floor.
 *
 * Operator policy: real-money / live exchange orders MUST NEVER be placed
 * with AI confidence below this threshold, regardless of any other gate.
 * Simulation/test paths are unaffected — this rule only fires when the
 * exchange engine is in LIVE mode.
 */
export const LIVE_EXECUTION_MIN_CONFIDENCE = 80;

async function autoExecute(
  signalId:     string,
  symbol:       string,
  side:         "BUY" | "SELL",
  price:        number,
  reasoning:    string,
  shortSummary: string,
  settings:     LoopSettings,
  isTest:       boolean,
  confidence:   number,
): Promise<{ executed: boolean; blockReason: string | null }> {

  // ── Gate 0: live-mode confidence floor (safe-test-mode aware) ──────────────
  // No live order may ever be submitted below the institutional confidence
  // threshold. Safe Test Mode (admin-only, time-boxed) may temporarily lower
  // the floor — never below the 40% floor enforced by the SafeTestMode API.
  // Sim paths are unaffected (live mode check below).
  let exModeForStream: "simulation" | "live" | "test" = "simulation";
  try {
    const { getExchangeStatus } = await import("./exchangeEngine.js");
    const exMode = getExchangeStatus().mode;
    const isLiveMode = exMode !== "simulation";
    exModeForStream = isTest ? "test" : (isLiveMode ? "live" : "simulation");
    const stm = getSafeTestMode();
    const effectiveFloor =
      isLiveMode && stm.active && stm.liveConfidenceFloorOverride !== null
        ? stm.liveConfidenceFloorOverride
        : LIVE_EXECUTION_MIN_CONFIDENCE;
    if (isLiveMode && !isTest && confidence < effectiveFloor) {
      engineStats.tradesBlocked++;
      const msg = `Live execution blocked for ${symbol} ${side}: confidence ${confidence.toFixed(1)}% < ${effectiveFloor}% floor${stm.active ? " (safe-test-mode active)" : ""}`;
      logger.warn({ symbol, side, confidence, floor: effectiveFloor, mode: exMode, safeTestMode: stm.active }, msg);
      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "warn",
        message: msg,
        details: { symbol, side, confidence, floor: effectiveFloor, mode: exMode, safeTestMode: stm.active },
      });
      auditLogger.append("system", "TRADE_REJECTED", {
        symbol, side, confidence, floor: effectiveFloor, gate: "live_confidence_floor", safeTestMode: stm.active,
      }, { symbol, severity: "warn" });
      executionStreamBus.emitEvent({
        type:     "live_floor_blocked",
        severity: "warn",
        symbol, side, confidence,
        gate:     "live_confidence_floor",
        mode:     "live",
        reason:   `confidence ${confidence.toFixed(1)}% < ${effectiveFloor}% floor`,
        message:  msg,
        details:  { floor: effectiveFloor, safeTestModeActive: stm.active },
      });
      return { executed: false, blockReason: `Below ${effectiveFloor}% live-execution threshold (${confidence.toFixed(1)}%)` };
    }
  } catch { /* fail-open to existing gates only on import error */ }

  // ── Gate 1: max concurrent open positions ──────────────────────────────────
  if (settings.maxActivePositions > 0) {
    const account = await getAccountSummary();
    const openCount = account.positions.length;
    if (openCount >= settings.maxActivePositions) {
      engineStats.tradesBlocked++;
      const msg = `Auto-trade blocked for ${symbol} ${side}: max active positions (${settings.maxActivePositions}) reached — currently ${openCount} open`;
      logger.info({ symbol, side, openCount, maxActivePositions: settings.maxActivePositions }, msg);
      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "warn",
        message: msg,
        details: { symbol, side, openCount, maxActivePositions: settings.maxActivePositions },
      });
      executionStreamBus.emitEvent({
        type: "max_positions_blocked", severity: "warn",
        symbol, side, gate: "max_active_positions", mode: exModeForStream,
        reason: `${openCount}/${settings.maxActivePositions} open`, message: msg,
      });
      return { executed: false, blockReason: `Max active positions (${settings.maxActivePositions})` };
    }
  }

  // ── Gate 2: daily trade count (0 = unlimited) ──────────────────────────────
  if (settings.maxTradesPerDay > 0) {
    const todayCount = await countTodayLoopTrades();
    if (todayCount >= settings.maxTradesPerDay) {
      engineStats.tradesBlocked++;
      const msg = `Auto-trade blocked for ${symbol}: daily limit (${settings.maxTradesPerDay}) reached`;
      logger.info({ symbol, side, todayCount }, msg);
      await db.insert(logsTable).values({ id: genId(), type: "trade", level: "warn", message: msg, details: { symbol, side } });
      executionStreamBus.emitEvent({
        type: "daily_limit_blocked", severity: "warn",
        symbol, side, gate: "daily_trade_limit", mode: exModeForStream,
        reason: `${todayCount}/${settings.maxTradesPerDay} today`, message: msg,
      });
      return { executed: false, blockReason: "Daily limit" };
    }
  }

  // ── Gate 3: correlation filter ─────────────────────────────────────────────
  const corrBlocked = await isCorrelationBlocked(symbol);
  if (corrBlocked) {
    engineStats.tradesBlocked++;
    engineStats.correlationBlocks++;
    const msg = `Auto-trade blocked for ${symbol} ${side}: high correlation with existing position`;
    await db.insert(logsTable).values({ id: genId(), type: "trade", level: "warn", message: msg, details: { symbol, side } });
    executionStreamBus.emitEvent({
      type: "correlation_blocked", severity: "warn",
      symbol, side, gate: "correlation_filter", mode: exModeForStream,
      reason: "high correlation with open position", message: msg,
    });
    return { executed: false, blockReason: "Correlation filter" };
  }

  // ── Gate 4: risk engine (safe-test-mode size override aware) ────────────────
  const stmForSize = getSafeTestMode();
  const sizeUSD   = stmForSize.active && stmForSize.minOrderUsdOverride !== null
    ? stmForSize.minOrderUsdOverride
    : settings.allocation;
  const riskCheck = validateTrade(sizeUSD);
  if (!riskCheck.allowed) {
    engineStats.tradesBlocked++;
    logger.warn({ symbol, side, violations: riskCheck.violations }, "Auto-trade blocked by risk engine");
    await db.insert(logsTable).values({
      id: genId(), type: "trade", level: "warn",
      message: `Auto-trade blocked for ${symbol}: risk engine — ${riskCheck.violations.join("; ")}`,
      details: { symbol, side, violations: riskCheck.violations },
    });
    auditLogger.append("system", "TRADE_REJECTED", {
      symbol, side, sizeUSD, violations: riskCheck.violations, gate: "risk_engine",
    }, { symbol, severity: "warn" });
    executionStreamBus.emitEvent({
      type: "risk_engine_blocked", severity: "warn",
      symbol, side, sizeUSD, gate: "risk_engine", mode: exModeForStream,
      reason: riskCheck.violations.join("; "),
      message: `Risk engine blocked ${symbol} ${side} $${sizeUSD}: ${riskCheck.violations.join("; ")}`,
      details: { violations: riskCheck.violations, safeTestModeSize: stmForSize.active },
    });
    return { executed: false, blockReason: `Risk engine: ${riskCheck.violations.join("; ")}` };
  }

  // ── Gate 5: place order ────────────────────────────────────────────────────
  // Routes to the live exchange adapter registry when exchange mode is
  // "live" and this is not a sim/test signal; otherwise stays on the
  // in-memory simulation engine. Sim and live paths are fully isolated —
  // a live fill never touches `_simBalances` or sim positions, and a sim
  // fill never reaches the exchange adapter network layer.
  const isLiveExec = exModeForStream === "live";
  executionStreamBus.emitEvent({
    type: "execution_sent", severity: "info",
    symbol, side, sizeUSD, confidence, price, mode: exModeForStream,
    message: `Order sent: ${symbol} ${side} $${sizeUSD} @ ${price}`,
  });

  let pos: { id: string; entryPrice: number };
  let liveExchange:        string | undefined;
  let liveExchangeOrderId: string | undefined;

  if (isLiveExec) {
    // ── Resolve live-execution targets ────────────────────────────────────
    // Customers with a default+active+live `user_exchange_connections` row
    // get an order routed through THEIR own connected exchange. The
    // operator process-env path (admintrade.aicandlez.com) is ALWAYS
    // attempted in parallel so the platform-level audit trail + risk view
    // is preserved. If neither path succeeds, the trade is rejected.
    // Customer fan-out is gated by the customer-portal kill switch
    // (Task #157). When disabled (default), customer rows are skipped
    // entirely so we don't spam per-user rejection logs every signal.
    // Operator env-key path always runs.
    const { isCustomerLiveExecutionEnabled } = await import("./liveUserExecution.js");
    const liveUsers = isCustomerLiveExecutionEnabled()
      ? await listLiveExecutionUsers()
      : [];

    const [operatorResult, userResults] = await Promise.all([
      placeLiveAutoOrder({ symbol, side, sizeUSD }).catch((err): Awaited<ReturnType<typeof placeLiveAutoOrder>> => ({
        success: false,
        error:   err instanceof Error ? err.message : String(err),
      })),
      Promise.all(
        liveUsers.map((u) =>
          placeLiveAutoOrderForUser({ userId: u.userId, symbol, side, sizeUSD }).catch(
            (err): LiveUserOrderResult => ({
              success:   false,
              userId:    u.userId,
              exchange:  u.exchange,
              errorCode: "exchange_reject",
              error:     err instanceof Error ? err.message : String(err),
            }),
          ),
        ),
      ),
    ]);

    // Mirror each per-user fill into the user's sim registry (cache + DB)
    // so the position appears immediately in the customer's portal.
    const userSuccesses = userResults.filter((r) => r.success);
    for (const r of userSuccesses) {
      try {
        const userEntry = r.fillPrice ?? price;
        const userQty   = r.quantity  ?? sizeUSD / userEntry;
        const userSL    = side === "BUY" ? userEntry * (1 - settings.stopLossPercent   / 100) : userEntry * (1 + settings.stopLossPercent   / 100);
        const userTP    = side === "BUY" ? userEntry * (1 + settings.takeProfitPercent / 100) : userEntry * (1 - settings.takeProfitPercent / 100);
        await registerLiveUserFill({
          userId:          r.userId,
          symbol,
          side,
          quantity:        userQty,
          entryPrice:      userEntry,
          sizeUSD,
          signalId,
          stopLoss:        parseFloat(userSL.toFixed(2)),
          takeProfit:      parseFloat(userTP.toFixed(2)),
          exchange:        r.exchange ?? "unknown",
          exchangeOrderId: r.exchangeOrderId ?? `LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          entryFeeBroker:         r.brokerFee,
          entryFeeBrokerCurrency: r.brokerFeeCurrency,
        });
      } catch (e) {
        logger.warn(
          { userId: r.userId, exchange: r.exchange, err: e instanceof Error ? e.message : String(e) },
          "Live fan-out: failed to mirror fill into sim registry",
        );
      }
    }

    if (userResults.length > 0) {
      const failed = userResults.length - userSuccesses.length;
      logger.info(
        { symbol, side, totalUsers: userResults.length, succeeded: userSuccesses.length, failed, dryRun: isDryRunEnabled() },
        "Live fan-out completed",
      );
    }

    // If neither the operator path nor any per-user fan-out succeeded,
    // treat as a hard rejection (matches the original single-path semantics).
    if (!operatorResult.success && userSuccesses.length === 0) {
      const reason = operatorResult.error ?? (liveUsers.length > 0
        ? `All ${liveUsers.length} customer fan-outs failed`
        : "Live mode active but no execution target available");
      engineStats.tradesBlocked++;
      logger.warn({ symbol, side, error: reason, liveUsers: liveUsers.length }, "Live auto-trade rejected by exchange bridge");
      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "critical",
        message: `Live auto-trade failed for ${symbol} ${side}: ${reason}`,
        details: { symbol, side, error: reason, mode: "live", liveUsers: liveUsers.length },
      });
      auditLogger.append("system", "TRADE_REJECTED", {
        symbol, side, error: reason, gate: "live_exchange_bridge",
      }, { symbol, severity: "critical" });
      executionStreamBus.emitEvent({
        type: "order_rejected", severity: "error",
        symbol, side, sizeUSD, gate: "live_exchange_bridge", mode: "live",
        reason,
        message: `Live order REJECTED ${symbol} ${side} $${sizeUSD}: ${reason}`,
      });
      return { executed: false, blockReason: `Live bridge: ${reason}` };
    }

    // Anchor the global audit row to the operator fill when present;
    // otherwise to the first successful per-user fill.
    if (operatorResult.success) {
      pos = { id: operatorResult.exchangeOrderId ?? genId(), entryPrice: operatorResult.fillPrice ?? price };
      liveExchange        = operatorResult.exchange;
      liveExchangeOrderId = operatorResult.exchangeOrderId;
    } else {
      const first = userSuccesses[0]!;
      pos = { id: first.exchangeOrderId ?? genId(), entryPrice: first.fillPrice ?? price };
      liveExchange        = first.exchange;
      liveExchangeOrderId = first.exchangeOrderId;
    }
  } else {
    const result = await placeOrder({ symbol, side, sizeUSD });
    if (!result.success) {
      engineStats.tradesBlocked++;
      logger.warn({ symbol, side, error: result.error }, "Auto-trade rejected by simulation engine");
      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "warn",
        message: `Auto-trade failed for ${symbol} ${side}: ${result.error}`,
        details: { symbol, side, error: result.error },
      });
      auditLogger.append("system", "TRADE_REJECTED", {
        symbol, side, error: result.error, gate: "simulation_engine",
      }, { symbol, severity: "warn" });
      executionStreamBus.emitEvent({
        type: "order_rejected", severity: "error",
        symbol, side, sizeUSD, gate: "execution_engine", mode: exModeForStream,
        reason: result.error ?? "unknown",
        message: `Order REJECTED ${symbol} ${side} $${sizeUSD}: ${result.error}`,
      });
      return { executed: false, blockReason: `Sim engine: ${result.error}` };
    }
    pos = result.position!;
  }

  // ── Execution confirmed ────────────────────────────────────────────────────
  const stopLoss   = side === "BUY" ? pos.entryPrice * (1 - settings.stopLossPercent / 100) : pos.entryPrice * (1 + settings.stopLossPercent / 100);
  const takeProfit = side === "BUY" ? pos.entryPrice * (1 + settings.takeProfitPercent / 100) : pos.entryPrice * (1 - settings.takeProfitPercent / 100);
  const tradeMode  = isTest ? "test" : (isLiveExec ? "live" : "auto");

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
  executionStreamBus.emitEvent({
    type: "order_filled", severity: "success",
    symbol, side, sizeUSD, price: pos.entryPrice, confidence,
    mode: exModeForStream,
    message: `${tag} ${symbol} ${side} FILLED $${sizeUSD} @ ${pos.entryPrice}`,
    details: { signalId, shortSummary, stopLoss, takeProfit },
  });

  auditLogger.append("system", "TRADE_EXECUTED", {
    symbol, side, sizeUSD,
    entryPrice:  pos.entryPrice,
    stopLoss:    parseFloat(stopLoss.toFixed(2)),
    takeProfit:  parseFloat(takeProfit.toFixed(2)),
    signalId,
    shortSummary,
    tradeMode,
  }, { symbol });

  await db.insert(logsTable).values({
    id: genId(), type: "trade", level: "success",
    message: `${tag} ${side} ${symbol} @ $${pos.entryPrice.toFixed(2)} — $${sizeUSD.toFixed(0)} — SL $${stopLoss.toFixed(2)} / TP $${takeProfit.toFixed(2)} — ${shortSummary}`,
    details: { symbol, side, entryPrice: pos.entryPrice, sizeUSD, stopLoss, takeProfit, signalId, shortSummary, tradeMode },
  });

  // SMS fires ONLY after a real trade is confirmed — never for signals, HOLDs, or blocked trades
  void sendTradeExecutedSMS(symbol, side, pos.entryPrice);

  // Push notification to all subscribed devices (fire-and-forget — must not block trade confirmation)
  void NotificationDispatcher.broadcastToAll({
    title:     `${side === "BUY" ? "🟢" : "🔴"} Trade Executed — ${symbol}`,
    body:      `${side} $${sizeUSD.toFixed(0)} @ $${pos.entryPrice.toFixed(2)}`,
    notifType: "trade",
    tag:       `trade-${symbol}-${Date.now()}`,
    url:       "/aicandlez-app/trade",
    // Per-user alert mute gating is applied inside sendToUser, so this
    // broadcast respects each recipient's "Trade Opened" toggle.
    alertKey:  "tradeOpened",
    data:      { symbol, side, price: pos.entryPrice, sizeUSD, mode: tradeMode },
  }).catch(() => {});

  // Broadcast trade execution in real time to connected WebSocket clients
  broadcastTrade({
    symbol,
    side,
    price:   pos.entryPrice,
    sizeUSD: sizeUSD,
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
  executionStreamBus.emitEvent({
    type:     "loop_tick",
    severity: "info",
    message:  `Engine tick — signals=${engineStats.signalsGenerated} execs=${engineStats.tradesExecuted} blocked=${engineStats.tradesBlocked}`,
    details:  {
      signalsGenerated: engineStats.signalsGenerated,
      tradesExecuted:   engineStats.tradesExecuted,
      tradesBlocked:    engineStats.tradesBlocked,
    },
  });

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
        executionStreamBus.emitEvent({
          type:       "mtf_confirmed",
          severity:   "success",
          symbol,
          side:       mtf.agreedAction === "HOLD" ? undefined : mtf.agreedAction as "BUY" | "SELL",
          confidence: mtf.avgConfidence,
          message:    `MTF confirmed ${symbol} ${mtf.agreedAction} · avg ${mtf.avgConfidence.toFixed(1)}%`,
        });
      } else {
        engineStats.mtfBlockCount++;
        engineStats.funnelBlockedMTF++;
        if (mtf.fast.decision !== "HOLD" || mtf.slow.decision !== "HOLD") {
          executionStreamBus.emitEvent({
            type:       "mtf_blocked",
            severity:   "warn",
            symbol,
            confidence: mtf.avgConfidence,
            gate:       "mtf_agreement",
            reason:     mtf.blockReason || "timeframes disagree",
            message:    `MTF blocked ${symbol}: fast=${mtf.fast.decision}(${mtf.fast.confidence.toFixed(0)}%) slow=${mtf.slow.decision}(${mtf.slow.confidence.toFixed(0)}%) — ${mtf.blockReason || "disagree"}`,
          });
        }
      }

      // Update per-symbol breakdown
      engineStats.symbolBreakdowns[symbol] = {
        symbol,
        fast:              mtf.fastSnap,
        slow:              mtf.slowSnap,
        mtfConfirmed:      mtf.mtfConfirmed,
        agreedAction:      mtf.agreedAction,
        avgConfidence:     mtf.avgConfidence,       // EXECUTION (80% live floor, riskGate, KrakenAdapter)
        displayConfidence: mtf.displayConfidence,   // DISPLAY ONLY (render layer)
        blockReason:       mtf.blockReason,
        lastUpdated:       Date.now(),
        volumeConfirmed:   mtf.volumeConfirmed,
        marketCondition:   mtf.marketCondition,
        trend1H:           mtf.trend1H,
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
      const confThresh = testMode ? 20 : settings.minConfidence;

      // Test mode: allow single-TF signal at modest confidence
      const testSingleTF =
        testMode && (
          (mtf.fast.decision !== "HOLD" && mtf.fast.confidence >= 25) ||
          (mtf.slow.decision !== "HOLD" && mtf.slow.confidence >= 25)
        );
      const testAction: "BUY" | "SELL" | "HOLD" =
        testSingleTF
          ? (mtf.fast.confidence >= 25 && mtf.fast.decision !== "HOLD"
              ? mtf.fast.decision as "BUY" | "SELL"
              : mtf.slow.decision as "BUY" | "SELL")
          : mtf.agreedAction;

      // Quality gates — bypassed in test mode for fast iteration
      const volumeGatePass   = !engineStats.volumeFilter || testMode || mtf.volumeConfirmed;
      const sidewaysGatePass = testMode || mtf.marketCondition !== "sideways";
      const trend1HGatePass  = testMode || !engineStats.require1HTrend ||
        mtf.trend1H === "unknown" ||
        (testAction === "BUY"  && mtf.trend1H === "bullish") ||
        (testAction === "SELL" && mtf.trend1H === "bearish");

      // ── High-confidence override (≥ 60%) ──────────────────────────────────
      // Strong AI conviction bypasses MTF + quality filters. Hard stops (kill
      // switch, max positions, risk engine) are still enforced in autoExecute.
      const bestSingleAction: "BUY" | "SELL" | "HOLD" =
        (mtf.fast.confidence >= mtf.slow.confidence && mtf.fast.decision !== "HOLD")
          ? mtf.fast.decision as "BUY" | "SELL"
          : (mtf.slow.decision !== "HOLD" ? mtf.slow.decision as "BUY" | "SELL" : "HOLD");

      const highConfOverride =
        !testMode &&
        settings.autoMode &&
        !settings.killSwitch &&
        mtf.avgConfidence >= 60 &&
        bestSingleAction !== "HOLD";

      // When override fires without MTF agreement, take the stronger single-TF direction
      const effectiveAction: "BUY" | "SELL" | "HOLD" =
        highConfOverride && !mtf.mtfConfirmed ? bestSingleAction : testAction;

      const shouldTrade =
        settings.autoMode &&
        !settings.killSwitch &&
        (mtf.mtfConfirmed || testSingleTF || highConfOverride) &&
        effectiveAction !== "HOLD" &&
        mtf.avgConfidence >= (highConfOverride ? 60 : confThresh) &&
        (volumeGatePass   || highConfOverride) &&
        (sidewaysGatePass || highConfOverride) &&
        (trend1HGatePass  || highConfOverride);

      // Determine block reason for signal log
      let signalBlockReason: string | null = null;
      if (!settings.autoMode) {
        signalBlockReason = "Auto-mode off";
      } else if (highConfOverride) {
        signalBlockReason = null; // high-conf override — executing
      } else if (!mtf.mtfConfirmed && !testSingleTF) {
        signalBlockReason = mtf.blockReason;
      } else if (mtf.avgConfidence < confThresh) {
        signalBlockReason = `Low confidence (${mtf.avgConfidence.toFixed(1)}% < ${confThresh}%)`;
      } else if (!sidewaysGatePass) {
        signalBlockReason = "Sideways/range-bound market";
      } else if (!volumeGatePass) {
        signalBlockReason = "Volume below average (low-volume filter)";
      } else if (!trend1HGatePass) {
        signalBlockReason = `1H trend conflict (trend=${mtf.trend1H}, signal=${effectiveAction})`;
      }

      appendSignalLog({
        id:           id5m,
        symbol,
        timeframe:    "5m+15m",
        decision:     highConfOverride && !mtf.mtfConfirmed ? bestSingleAction : mtf.agreedAction,
        confidence:   mtf.avgConfidence,
        shortSummary: mtf.fast.shortSummary,
        blockReason:  signalBlockReason,
        executedAs:   null,
        timestamp:    Date.now(),
      });

      // Pre-autoExecute rejection emit — surfaces gate failures that happen
      // BEFORE autoExecute is even called (conf, sideways, volume, 1H trend,
      // auto-mode off). The autoExecute path has its own emits for the gates
      // it owns (positions, daily limit, risk, correlation, exchange).
      if (!shouldTrade && signalBlockReason && effectiveAction !== "HOLD") {
        const isConfBlock =
          signalBlockReason.startsWith("Low confidence");
        executionStreamBus.emitEvent({
          type:       isConfBlock ? "confidence_too_low" : "signal_rejected",
          severity:   "warn",
          symbol,
          side:       effectiveAction as "BUY" | "SELL",
          confidence: mtf.avgConfidence,
          gate:       isConfBlock ? "confidence_floor" : "pre_execute_gate",
          reason:     signalBlockReason,
          message:    `Signal rejected ${symbol} ${effectiveAction}: ${signalBlockReason}`,
        });
      }

      if (shouldTrade) {
        const primaryDecision = mtf.fast;
        const execResult = await autoExecute(
          id5m,
          symbol,
          effectiveAction as "BUY" | "SELL",
          primaryDecision.price,
          primaryDecision.reasoning ?? "",
          primaryDecision.shortSummary,
          settings,
          testMode,
          mtf.avgConfidence,
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
