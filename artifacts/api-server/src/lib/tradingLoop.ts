import crypto from "crypto";
import { db } from "@workspace/db";
import { signalsTable, logsTable, settingsTable, tradesTable, userNotificationsTable } from "@workspace/db";
import { eq, and, gte, gt, inArray, count } from "drizzle-orm";
import { settingsStore } from "./settingsStore.js";
import { getCandles, SUPPORTED_SYMBOLS, type Candle } from "./marketData.js";
import { runAIDecision, type AIDecisionResult } from "./aiReasoning.js";
import { computeRSI, computeEMA, computeMACD } from "./indicators.js";
import { placeOrder, getAccountSummary, hydrateOpenPositions, type SimPosition } from "./simulationEngine.js";
import { placeLiveAutoOrder } from "./exchangeEngine.js";
import {
  listLiveExecutionUsers,
  isDryRunEnabled,
  type LiveUserOrderResult,
} from "./liveUserExecution.js";
import { executeCustomerOrder } from "./executionGateway.js";
import { getTradeLimitVerdict, invalidateTradeLimitCache } from "./tradeLimitEngine.js";
import {
  registerLiveUserFill,
  placeUserOrder,
  listPaperAutoTradeUsers,
  listOpenPaperPositionsBySymbol,
  listOpenPositionsForRiskMonitor,
  closeUserPosition,
} from "./userSimRegistry.js";
import { getTicker } from "./marketData.js";
import { emit as emitTelemetry, genCorrelationId, rememberCorrelation } from "./executionTelemetry.js";
import { notifyFillHydrated } from "./positionStore.js";
import { validateTrade } from "./riskEngine.js";
import { checkTrailingStops } from "./trailingStopEngine.js";
import { computeCorrelationMatrix } from "./correlationEngine.js";
import { addJournalEntry } from "./tradeJournalEngine.js";
import { sendTradeExecutedSMS } from "./notifications.js";
import { broadcastSignal, broadcastTrade } from "./wsServer.js";
import { NotificationDispatcher } from "../services/notifications/NotificationDispatcher.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { executionStreamBus, getSafeTestMode } from "./executionStreamBus.js";
import { recordSignalTrace, classifyDownstream, type SignalTrace } from "./signalFunnel.js";
import { logger } from "./logger.js";

function genId() { return crypto.randomUUID(); }

// SIGNAL_FUNNEL log helper: render a tri-state gate result (true/false/not-
// evaluated) as Y / N / — for the structured per-signal funnel log line.
function ynNull(v: boolean | null): "Y" | "N" | "—" {
  return v === null ? "—" : v ? "Y" : "N";
}

// ── EXIT_ENGINE_V2 feature flag ─────────────────────────────────────────────────
// Phase 1+ exit-lifecycle redesign. When OFF (default) the engine behaves exactly
// as before (volatile in-memory positions, in-memory cap gate, no automated
// trades-table close). When ON: open positions rehydrate from the `trades` table
// on boot, the cap gate counts persisted open rows, the `trades.id` is linked to
// the simulation position id, and automated closes persist back to `trades`.
function isExitEngineV2(): boolean {
  return process.env.EXIT_ENGINE_V2 === "true";
}

// ── Hard stop-loss / take-profit enforcement (Task 1 — blocking safety) ─────────
// Per-tick monitor that force-closes any open per-user position (paper OR live)
// once price breaches the fixed stop-loss / take-profit price stored on the
// position at open time. This is INDEPENDENT of the profit-only trailing-stop
// engine (`trailingStopEngine`), which never arms on a trade that stays
// underwater — so without this monitor a losing trade had unbounded downside.
//
// Default ON: this is a safety fix, not an opt-in feature. Set
// `HARD_STOP_ENFORCEMENT_ENABLED=false` to disable (kill switch only).
function isHardStopEnforcementEnabled(): boolean {
  return process.env.HARD_STOP_ENFORCEMENT_ENABLED !== "false";
}

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

/**
 * Engine-wide baseline minimum confidence (LOW-CONFIDENCE FILTER).
 * Mirrors the `user_settings.min_confidence` default. A signal whose
 * `avgConfidence` falls below this floor is rendered as INFORMATIONAL
 * (visually muted, marked LOW CONFIDENCE) and is NEVER routed to live
 * execution — `placeLiveAutoOrderForUser` gate 0e additionally re-checks
 * against the caller's per-user `minConfidence`, but the global
 * `executionEligible` flag here is the canonical UI separator between
 * "may display" and "may execute".
 *
 * Hard invariant before Kraken live rollout: every consumer of
 * `symbolBreakdowns` that routes to an order placement path MUST gate
 * on `executionEligible === true`. Display surfaces may still render
 * the underlying signal but must not surface "TRADE NOW" affordances.
 */
// ── CONF EXPERIMENT (controlled production 65→50→40 confidence experiment) ────
// Single env-overridable knob driving the ONE live-execution confidence floor so
// the experiment can be flipped or reverted WITHOUT a redeploy. Default 40 =
// experiment ACTIVE (lowered from the prior 50, itself from 60/65). Set
// EXPERIMENT_CONF_FLOOR=65 to restore the prior institutional floor, or =35 if
// trade volume remains insufficient at 40 (do NOT go to 30 yet). This is the
// SINGLE confidence source of truth — it drives, in lockstep:
//   • engine signal generation        (confThresh in tick())
//   • executionEligible UI/exec flag   (BASELINE_MIN_CONFIDENCE, below)
//   • operator live floor              (LIVE_EXECUTION_MIN_CONFIDENCE)
// Redundant downstream confidence re-checks (operator Gate 0 live-floor,
// customer per-user minConfidence clamp, unreachable >=60 highConfOverride)
// have been removed — every execution path now gates solely on
// `executionEligible`. INTENTIONALLY UNCHANGED: volume gate, MTF agreement,
// sideways filter, SL/TP, position sizing, kill switches, per-tier/concurrent
// caps. This is data-gathering only — NOT a permanent optimization.
export const EXPERIMENT_CONF_FLOOR = Number(process.env.EXPERIMENT_CONF_FLOOR ?? "40");
/** Confidence band [lo,hi] the experiment is measuring (inclusive). lo tracks
 *  the active EXPERIMENT_CONF_FLOOR (40) so telemetry covers newly-eligible
 *  40-49 signals; hi stays 64 (the band below the legacy 65 institutional floor). */
export const EXPERIMENT_CONF_BAND = { lo: 40, hi: 64 } as const;
/** True when an engine confidence falls inside the experiment measurement band. */
export function inConfExperimentBand(c: number): boolean {
  return c >= EXPERIMENT_CONF_BAND.lo && c <= EXPERIMENT_CONF_BAND.hi;
}
export const BASELINE_MIN_CONFIDENCE = EXPERIMENT_CONF_FLOOR;

// Single source of truth for the mandatory volume safety gate. Current-bar
// volume must be >= this fraction of the prior-20-bar average for
// `volumeConfirmed` to be true. Controlled live test (2026-05-29): lowered
// 0.85 -> 0.65 -> 0.35. TEMPORARY: 0.35 relaxes the gate to drive execution
// frequency up while validating the live Coinbase pipeline end-to-end; tighten
// back after the first confirmed live fill. The execution gate AND any
// user-facing rejection copy derive from this constant so the enforced
// threshold and the message can never drift.
export const VOLUME_GATE_FRACTION = 0.35;

export interface SymbolBreakdown {
  symbol:          string;
  fast:            TimeframeSnapshot;   // 5m
  slow:            TimeframeSnapshot;   // 15m
  mtfConfirmed:    boolean;
  agreedAction:    string;
  avgConfidence:   number;
  // Pass E3 — display-only confidence (LOCKED INVARIANT).
  // `avgConfidence` drives EXECUTION (65% live floor, riskGate,
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
  // TEMP OBSERVABILITY (additive, display-only): current 5m bar volume as a
  // fraction of the prior-20-bar average (1 = 100%). Surfaced on the customer
  // card as "volume % vs 20-bar average". No execution path reads this field.
  volumeRatio:     number;
  marketCondition: "trending" | "sideways" | "neutral";
  trend1H:         "bullish" | "bearish" | "unknown";
  // ── LOW-CONFIDENCE FILTER (separation of visibility vs execution) ────────
  // `executionEligible === true` is the SINGLE source of truth for whether
  // this signal may be routed to live execution. It is `true` only when the
  // signal:
  //   • has a directional bias (agreedAction !== "HOLD")
  //   • passes the engine baseline minConfidence (>= BASELINE_MIN_CONFIDENCE)
  //   • is MTF-confirmed (fast + slow timeframe agreement)
  //   • is in an active (non-sideways) market regime
  // When `false`, `executionBlockReason` carries a machine-readable code so
  // the UI can tag the card LOW CONFIDENCE / NO MTF / SIDEWAYS / HOLD BIAS
  // without re-deriving the reason from string blockReason. Live-execution
  // routes (`placeLiveAutoOrderForUser` gate 0e) consume this AND re-check
  // against per-user minConfidence on top.
  executionEligible:    boolean;
  executionBlockReason: "low_confidence" | "no_mtf_agreement" | "sideways" | "hold_bias" | null;
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
  // LOW-CONFIDENCE FILTER — INFORMATIONAL vs EXECUTABLE separator
  // surfaced in the AI Reasoning Console. Mirrors the same flag on
  // SymbolBreakdown: `false` means the signal is shown for context
  // only and never reaches a live order route.
  executionEligible: boolean;
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
  hardStopHits:       number;
  correlationBlocks:  number;
  positionsRehydrated: number;
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
  // CONVICTION_V2 telemetry — rolling ring buffer of the last N
  // confidence values emitted by `runAIDecision` (per-timeframe raw
  // confidence, BEFORE MTF averaging). Lets `/api/engine/status` surface
  // a live distribution (p10/p25/p50/p75/p90 + threshold buckets) so we
  // can validate the calibration math against real production data.
  // Ring buffer keeps memory bounded; percentile compute happens on
  // read at the route (cheap at N=400).
  confSamples:        number[];
  // TEMP [VOL_GATE_TEST] — controlled live-test telemetry tied to the 65%
  // volume-gate change (2026-05-29). Cumulative counters since boot, surfaced
  // on /api/engine/status. Remove when the controlled test window closes.
  volGateTest: {
    rejectedByConfidence: number;
    rejectedByVolume:     number;
    passedAllGates:       number;
    ordersSubmitted:      number;
    positionsOpened:      number;
  };
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
  hardStopHits:       0,
  correlationBlocks:  0,
  positionsRehydrated: 0,
  testMode:           false,  // OFF by default: strict MTF + volume + confidence-gate confirmation required (safe for live-money paths). Flip ON via POST /api/engine/testmode for dev-only signal flooding.
  require1HTrend:     false,   // GATE flag (line ~1247). Default OFF so 1H disagreement doesn't newly block signals if testMode is ever flipped off. Compute is decoupled — see computeMTFDecision where trend1H is always computed for the displayConfidence boost.
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
  confSamples:        [],
  volGateTest: {
    rejectedByConfidence: 0,
    rejectedByVolume:     0,
    passedAllGates:       0,
    ordersSubmitted:      0,
    positionsOpened:      0,
  },
};

// CONVICTION_V2 — ring buffer cap. 400 ≈ 20–30 min at current symbol
// rotation, enough resolution for p10–p90 without unbounded growth.
export const CONF_SAMPLE_CAP = 400;

export function recordConfidenceSample(value: number): void {
  if (!Number.isFinite(value)) return;
  engineStats.confSamples.push(value);
  if (engineStats.confSamples.length > CONF_SAMPLE_CAP) {
    engineStats.confSamples.shift();
  }
}

// Compute distribution on demand. Returns null when sample size is too
// small for percentile inference (<20). Called by `/api/engine/status`.
export function computeConfDistribution(): {
  n:        number;
  mean:     number;
  p10: number; p25: number; p50: number; p75: number; p90: number;
  gte50: number; gte60: number; gte70: number; gte80: number; gte85: number;
} | null {
  const xs = engineStats.confSamples;
  const n  = xs.length;
  if (n < 20) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const q = (p: number): number => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return parseFloat((sorted[idx] ?? 0).toFixed(1));
  };
  const mean = parseFloat((xs.reduce((s, v) => s + v, 0) / n).toFixed(1));
  const pctAtLeast = (t: number): number =>
    parseFloat(((xs.filter(v => v >= t).length / n) * 100).toFixed(1));
  return {
    n, mean,
    p10: q(0.10), p25: q(0.25), p50: q(0.50), p75: q(0.75), p90: q(0.90),
    gte50: pctAtLeast(50),
    gte60: pctAtLeast(60),
    gte70: pctAtLeast(70),
    gte80: pctAtLeast(80),
    gte85: pctAtLeast(85),
  };
}

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

// ── EXIT_ENGINE_V2 DB helpers ────────────────────────────────────────────────────
// The global engine writes `trades` rows with mode auto/live/test (manual/simulated
// rows come from other paths and are NOT part of the in-memory positions[]). The
// cap gate and boot rehydration both operate on exactly this set so they stay
// consistent with one another.
const V2_TRADE_MODES = ["auto", "live", "test"];

// Single predicate shared by the cap gate AND boot rehydration so the two sets are
// provably identical: an open, global-engine row with sane entry economics. Without
// the price>0 / amount>0 floor, a malformed open row could inflate the cap (blocking
// new trades) yet be skipped by rehydration (never closed) — a durable divergence.
function openGlobalPositionsPredicate() {
  return and(
    eq(tradesTable.status, "open"),
    inArray(tradesTable.mode, V2_TRADE_MODES),
    gt(tradesTable.price, 0),
    gt(tradesTable.amount, 0),
  );
}

// Count persisted open global-engine positions from the `trades` table. Used by the
// max-active-positions gate so the cap survives restarts.
async function countOpenTradePositions(): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(tradesTable)
    .where(openGlobalPositionsPredicate());
  return rows[0]?.value ?? 0;
}

// Rehydrate open global-engine positions from the `trades` table into the in-memory
// simulationEngine on boot, and rebuild positionMeta so the trailing-stop monitor +
// journal have entry context. Returns the number restored.
async function rehydrateOpenPositions(): Promise<number> {
  const rows = await db
    .select()
    .from(tradesTable)
    .where(openGlobalPositionsPredicate());

  const restored: SimPosition[] = [];
  for (const row of rows) {
    const entryPrice = row.price;
    const sizeUSD    = row.amount;
    if (!entryPrice || entryPrice <= 0 || !sizeUSD || sizeUSD <= 0) {
      // Defensive: the SQL predicate already excludes these, so reaching here
      // would indicate a query/schema drift. Keep the guard as a safety net.
      logger.warn({ tradeId: row.id, symbol: row.symbol }, "[EXIT_ENGINE_V2] skipping rehydrate of malformed trade row");
      continue;
    }
    const side: "BUY" | "SELL" = row.side === "SELL" ? "SELL" : "BUY";
    restored.push({
      id:         row.id,
      symbol:     row.symbol,
      side,
      quantity:   sizeUSD / entryPrice,
      entryPrice,
      entryTime:  row.timestamp instanceof Date ? row.timestamp.getTime() : Date.now(),
      sizeUSD,
    });
    positionMeta.set(row.id, {
      signalId:     row.signalId ?? "rehydrated",
      reasoning:    row.reason ?? "rehydrated position",
      shortSummary: row.reason ?? "rehydrated position",
      indicators:   { rsi: 0, macd: 0, ema20: 0, ema50: 0 },
      side,
      sizeUSD,
    });
  }

  const n = hydrateOpenPositions(restored);
  engineStats.positionsRehydrated = n;
  logger.info({ rehydrated: n, scanned: rows.length }, "[EXIT_ENGINE_V2] rehydrated open positions from trades table");
  return n;
}

// Persist an automated close back to the linked `trades` row. The row id equals
// the simulation position id (set at insert time when the flag is on). `exitPrice`,
// `pnl` and `pnlPercent` are the AUTHORITATIVE values from
// simulationEngine.closePosition's returned trade so the DB row matches the
// in-memory close exactly. The write is a single conditional UPDATE guarded by
// `status='open'` and `.returning()` so it is idempotent — a duplicate/concurrent
// close after the row is already closed is a no-op, not a double-write.
async function markTradeRowClosed(
  positionId: string,
  exitPrice:  number,
  pnl:        number,
  pnlPercent: number,
  reason:     string,
): Promise<void> {
  const updated = await db
    .update(tradesTable)
    .set({
      status:     "closed",
      exitPrice:  parseFloat(exitPrice.toFixed(2)),
      pnl:        parseFloat(pnl.toFixed(2)),
      pnlPercent: parseFloat(pnlPercent.toFixed(2)),
      closedAt:   new Date(),
      reason,
    })
    .where(and(eq(tradesTable.id, positionId), eq(tradesTable.status, "open")))
    .returning({ id: tradesTable.id });
  if (updated.length === 0) {
    logger.warn({ positionId }, "[EXIT_ENGINE_V2] no open trades row to close for position (already closed or unmapped)");
  }
}

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
  // CONVICTION_V2 telemetry — record every per-TF confidence sample
  // (pre-MTF averaging). Surfaces as live distribution on
  // /api/engine/status so we can validate the calibration curve
  // against real production behaviour.
  recordConfidenceSample(decision.confidence);
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
  avgConfidence:   number;       // EXECUTION confidence — 65% live floor reads this
  displayConfidence: number;     // DISPLAY conviction — render layer reads this
  blockReason:     string;
  volumeConfirmed: boolean;
  // TEMP OBSERVABILITY (additive, display-only): see SymbolBreakdown.volumeRatio.
  volumeRatio:     number;
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
//   +8   volumeConfirmed (current bar ≥ 65% of 20-bar avg)
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

  // CONVICTION_V2 (B): "directional + non-contradicting" MTF agreement.
  // Old (strict identical): both timeframes had to emit the same BUY/SELL.
  // That rejected early breakouts where 5m fires BUY but 15m hasn't crossed
  // the ±1.5 totalScore threshold yet (still HOLD). New: one timeframe must
  // be directional, the other must not contradict (HOLD is allowed). SELL
  // on the opposite side still hard-blocks confirmation — contradiction
  // protection is preserved.
  const bothBuy  = fast.decision === "BUY"  && slow.decision !== "SELL";
  const bothSell = fast.decision === "SELL" && slow.decision !== "BUY";
  const trendAligned = Math.sign(fast.totalScore) === Math.sign(slow.totalScore) && fast.totalScore !== 0;

  const mtfConfirmed  = (bothBuy || bothSell) && trendAligned;
  const agreedAction: "BUY" | "SELL" | "HOLD" = bothBuy ? "BUY" : bothSell ? "SELL" : "HOLD";
  // CONVICTION_V2 (2026-05-26): replace symmetric arithmetic mean with a
  // stronger-TF-weighted blend. Plain `(fast+slow)/2` let a weak TF drag
  // a confirmed aligned signal under the gate (e.g. 5m=72, 15m=48 → 60,
  // which evaluates against BASELINE_MIN_CONFIDENCE = 60 as a boundary
  // miss). The 0.65/0.35 weighting preserves MTF confirmation as a hard
  // requirement (`mtfConfirmed` above still requires `bothBuy || bothSell`
  // AND `trendAligned`) while letting the dominant-conviction TF carry
  // more of the score. The execution floor (LIVE_EXECUTION_MIN_CONFIDENCE
  // = 65) is applied downstream at Gate 0; this blend only calibrates the
  // fused score, it does not gate.
  const hi = Math.max(fast.confidence, slow.confidence);
  const lo = Math.min(fast.confidence, slow.confidence);
  const avgConfidence = parseFloat((hi * 0.65 + lo * 0.35).toFixed(1));

  // ── Volume confirmation filter ─────────────────────────────────────────────
  let volumeConfirmed = true;
  // TEMP OBSERVABILITY (additive, display-only): capture the raw current-bar
  // volume as a fraction of the 20-bar average so the customer card can show
  // "volume % vs 20-bar average". No decision branches on `volumeRatio`; the
  // gate boolean below is byte-for-byte unchanged. Defaults to 1 (=100%) when
  // there is insufficient history (same condition under which the gate passes).
  let volumeRatio = 1;
  if (candles5m.length >= 5) {
    const recentVols  = candles5m.slice(-21, -1).map((c) => c.volume);
    const avgVol      = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
    const currentVol  = candles5m[candles5m.length - 1]?.volume ?? 0;
    // Controlled live test (2026-05-29): mandatory volume gate lowered from
    // 85% → 65% of the prior-20-bar average to increase trade opportunities
    // while preserving a meaningful liquidity safeguard. All other gates
    // (confidence, MTF, sideways, 1H trend, risk, hard stop, EXIT_ENGINE_V2,
    // position sizing, max positions, exchange health) are unchanged.
    // Threshold lives in VOLUME_GATE_FRACTION (SoT) so messaging cannot drift.
    volumeConfirmed   = currentVol >= avgVol * VOLUME_GATE_FRACTION;
    volumeRatio       = avgVol > 0 ? currentVol / avgVol : 1;
  }

  // ── Market condition: sideways / trending ──────────────────────────────────
  const price5m     = candles5m[candles5m.length - 1]?.close ?? 1;
  const emaSpread5m = Math.abs(fastSnap.ema9 - fastSnap.ema21) / price5m;
  const emaSpread15m= Math.abs(slowSnap.ema9 - slowSnap.ema21) / price5m;
  // CONVICTION_V2 (C): tightened sideways threshold from 0.0015 (0.15%) to
  // 0.0008 (0.08%) to match modern crypto vol regime. BTC at $77k now needs
  // only ~$62 EMA9-vs-EMA21 spread to escape sideways instead of ~$116.
  // Trending threshold (0.30%) unchanged; range between is "neutral".
  const marketCondition: "trending" | "sideways" | "neutral" =
    emaSpread5m < 0.0008 && emaSpread15m < 0.0008 ? "sideways" :
    (emaSpread5m >= 0.003 || emaSpread15m >= 0.003) ? "trending" : "neutral";

  // ── 1H trend alignment ─────────────────────────────────────────────────
  // CONVICTION_V2 (A, revised per architect): compute trend1H UNCONDITIONALLY
  // so the displayConfidence calculator can award the 1H-alignment boost.
  // The downstream gate at `trend1HGatePass` (line ~1247) still consults
  // `engineStats.require1HTrend` (default false) so this compute does NOT
  // newly block any signal — it only enriches display conviction.
  let trend1H: "bullish" | "bearish" | "unknown" = "unknown";
  {
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
    volumeConfirmed, volumeRatio, marketCondition, trend1H,
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
 * Operator policy (updated 2026-05-29): real-money / live exchange orders
 * MUST NOT be placed with AI confidence below this threshold, regardless of
 * any other gate. Lowered 80 → 65 to align the live-execution floor with the
 * configured confidence threshold (65) instead of an internal hardcoded 80.
 * Confidence < 65 → hard reject; >= 65 → eligible to proceed through the
 * remaining gates (volume, MTF, sideways, risk, position limits, exchange /
 * account / universe validation — all unchanged). Simulation/test paths are
 * unaffected — this rule only fires when the exchange engine is in LIVE mode.
 */
// CONF EXPERIMENT: operator live floor now tracks the experiment knob (was 65).
export const LIVE_EXECUTION_MIN_CONFIDENCE = EXPERIMENT_CONF_FLOOR;

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

  // ── Exchange-mode resolution (for execution-stream tagging) ────────────────
  // The legacy "Gate 0: live-mode confidence floor" has been REMOVED. The
  // engine's unified `executionEligible` flag (computed once per tick in the
  // signal pass against BASELINE_MIN_CONFIDENCE) is now the single source of
  // truth for confidence — signals below the floor never reach autoExecute, so
  // re-checking confidence here was a redundant duplicate gate. We still resolve
  // the exchange mode so downstream gate emits carry the correct sim/live/test
  // tag. Hard safety gates (positions, risk, correlation, exchange validation)
  // are unchanged below.
  let exModeForStream: "simulation" | "live" | "test" = "simulation";
  try {
    const { getExchangeStatus } = await import("./exchangeEngine.js");
    const exMode = getExchangeStatus().mode;
    const isLiveMode = exMode !== "simulation";
    exModeForStream = isTest ? "test" : (isLiveMode ? "live" : "simulation");
  } catch { /* fail-open to existing gates only on import error */ }

  // ── Gate 1: max concurrent open positions ──────────────────────────────────
  if (settings.maxActivePositions > 0) {
    // EXIT_ENGINE_V2: count PERSISTED open positions from the `trades` table so
    // the cap survives restarts (the in-memory array used to reset to empty on
    // every deploy, then refill — orphaning DB rows). Flag OFF keeps the legacy
    // in-memory count for byte-identical behavior.
    const openCount = isExitEngineV2()
      ? await countOpenTradePositions()
      : (await getAccountSummary()).positions.length;
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

  // ── (removed) global daily-trade throttle ──────────────────────────────────
  // The engine-level `maxTradesPerDay` cap has been REMOVED. It was a single
  // global integer ceiling on the whole engine's daily trades that, once hit,
  // starved every remaining candidate platform-wide and could not express
  // per-tier policy. Daily throughput is now governed solely by the per-user
  // subscription entitlement system (trade_limit_exhausted in
  // liveUserExecution.ts), which preserves tier limits for normal customers and
  // unlimited access for designated QA / admin accounts. Exposure remains bound
  // by the position-count cap (Gate 1), platform concurrent-position cap, and
  // the risk engine (Gate 4) below.

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
        (() => {
          // Phase 4 AI dedup — collapse duplicate (userId, symbol) rows
          // within a tick so a misconfigured `listLiveExecutionUsers()`
          // (or a future per-connection fan-out) can't double-fire an
          // AI order for the same user+symbol on the same signal. The
          // Set is tick-scoped (lives only for this map() pass).
          const seen = new Set<string>();
          const deduped = liveUsers.filter((u) => {
            const key = `${u.userId}:${symbol}`;
            if (seen.has(key)) {
              logger.warn(
                { userId: u.userId, symbol, signalId },
                "[AI_TICK_DEDUP] dropped duplicate (userId,symbol) in tick fan-out",
              );
              return false;
            }
            seen.add(key);
            return true;
          });
          return deduped;
        })().map((u) => {
          // Phase 4 (Task #209) — one correlationId per (user, symbol, tick)
          // so the AI fan-out funnel is grep-correlatable end-to-end. Emit
          // [AI_TRADE_REQUEST] before handing off so on-call can see the
          // request before any gateway/exec gate fires.
          const correlationId = genCorrelationId();
          // Canonical normalization for AI: engine-native uppercased
          // symbol, and exchange = the user's connected adapter (already
          // resolved by listLiveExecutionUsers). This is the canonical
          // form the gateway/adapter will receive.
          const resolvedSymbol   = symbol.trim().toUpperCase();
          const resolvedExchange = u.exchange ?? null;
          emitTelemetry({
            tag:               "AI_TRADE_REQUEST",
            correlationId,
            userId:            u.userId,
            symbol,
            normalizedSymbol:  resolvedSymbol,
            exchange:          resolvedExchange,
            runtimeMode:       "live",
            persistenceResult: "pending",
            positionId:        null,
            latencyMs:         0,
            trigger:           "ai",
            side,
            sizeUSD,
            signalId,
          });
          // AI_TRADE_NORMALIZED — emitted AFTER canonical resolve so
          // `normalizedSymbol`+`exchange` reflect what the adapter will
          // actually receive (vs the raw input form).
          emitTelemetry({
            tag:               "AI_TRADE_NORMALIZED",
            correlationId,
            userId:            u.userId,
            symbol,
            normalizedSymbol:  resolvedSymbol,
            exchange:          resolvedExchange,
            runtimeMode:       "live",
            persistenceResult: "pending",
            positionId:        null,
            latencyMs:         0,
            trigger:           "ai",
            side,
            sizeUSD,
            signalId,
          });
          return executeCustomerOrder({
            trigger:       "ai",
            userId:        u.userId,
            symbol, side, sizeUSD,
            correlationId,
          }).catch(
            (err): LiveUserOrderResult => ({
              success:   false,
              userId:    u.userId,
              exchange:  u.exchange,
              errorCode: "exchange_reject",
              error:     err instanceof Error ? err.message : String(err),
            }),
          );
        }),
      ),
    ]);

    // Mirror each per-user fill into the user's sim registry (cache + DB)
    // so the position appears immediately in the customer's portal.
    const userSuccesses = userResults.filter((r) => r.success);
    for (const r of userSuccesses) {
      const corrId = (r as LiveUserOrderResult & { correlationId?: string }).correlationId;
      let persistenceResult: "persisted" | "failed" = "persisted";
      let mirroredPositionId: string | null = null;
      try {
        const userEntry = r.fillPrice ?? price;
        const userQty   = r.quantity  ?? sizeUSD / userEntry;
        const userSL    = side === "BUY" ? userEntry * (1 - settings.stopLossPercent   / 100) : userEntry * (1 + settings.stopLossPercent   / 100);
        const userTP    = side === "BUY" ? userEntry * (1 + settings.takeProfitPercent / 100) : userEntry * (1 - settings.takeProfitPercent / 100);
        const orderId = r.exchangeOrderId ?? `LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const pos = await registerLiveUserFill({
          userId:          r.userId,
          symbol,
          side,
          quantity:        userQty,
          entryPrice:      userEntry,
          sizeUSD,
          signalId,
          confidence,
          stopLoss:        parseFloat(userSL.toFixed(2)),
          takeProfit:      parseFloat(userTP.toFixed(2)),
          exchange:        r.exchange ?? "unknown",
          exchangeOrderId: orderId,
          entryFeeBroker:         r.brokerFee,
          entryFeeBrokerCurrency: r.brokerFeeCurrency,
        });
        mirroredPositionId = pos?.id ?? orderId;
        // CONF EXPERIMENT: per-customer LIVE fill in the measurement band [50,64].
        if (inConfExperimentBand(confidence)) {
          logger.info(
            { tag: "CONF_EXP_5064", outcome: "executed", scope: "customer_live", userId: r.userId, symbol, side, confidence, exchangeOrderId: orderId },
            `[CONF_EXP_5064] live fill ${symbol} ${side} @ ${confidence.toFixed(1)}% user=${r.userId}`,
          );
        }
      } catch (e) {
        persistenceResult = "failed";
        logger.warn(
          { userId: r.userId, exchange: r.exchange, correlationId: corrId, err: e instanceof Error ? e.message : String(e) },
          "Live fan-out: failed to mirror fill into sim registry",
        );
      }
      // Phase 4 (Task #209) — POSITION_PERSISTED canonical row stamped
      // with the gateway-returned correlationId so the AI funnel grep
      // chain stays linked through the persistence step. Also remember
      // the positionId→correlationId mapping so the eventual close emit
      // (loop-driven trailing stop / SL / TP / manual) preserves the chain.
      if (corrId && persistenceResult === "persisted") {
        rememberCorrelation(mirroredPositionId, corrId, "ai");
        rememberCorrelation(r.exchangeOrderId ?? null, corrId, "ai");
      }
      if (corrId) {
        const persistPid = mirroredPositionId ?? r.exchangeOrderId ?? null;
        emitTelemetry({
          tag:               "POSITION_PERSISTED",
          correlationId:     corrId,
          userId:            r.userId,
          symbol,
          normalizedSymbol:  symbol,
          exchange:          r.exchange ?? null,
          runtimeMode:       "live",
          persistenceResult,
          positionId:        persistPid,
          latencyMs:         0,
          trigger:           "ai",
          side,
          sizeUSD,
          signalId,
          fillPrice:         r.fillPrice ?? null,
        });
        // Hydration: stream event + LIVE_TRADES_HYDRATED telemetry —
        // both AFTER POSITION_PERSISTED so timing reconstruction lines
        // up with real lifecycle order. Only on successful persistence.
        if (persistenceResult === "persisted") {
          notifyFillHydrated({
            trigger:         "ai",
            correlationId:   corrId,
            userId:          r.userId,
            symbol,
            side,
            sizeUSD,
            fillPrice:       r.fillPrice ?? null,
            quantity:        r.quantity  ?? null,
            exchange:        r.exchange  ?? null,
            exchangeOrderId: r.exchangeOrderId ?? null,
            positionId:      persistPid,
            runtimeMode:     "live",
            latencyMs:       0,
            sandbox:         false,
            dryRun:          r.dryRun === true,
          });
        }
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
    // ── PAPER / SIM branch ────────────────────────────────────────────────
    //
    // Canonical convergence model (Phase 5 paper-side fix):
    //
    //   GLOBAL world  → simulationEngine.positions[] + tradesTable
    //                   (OPERATOR-ONLY mirror; tagged [GLOBAL_MIRROR_WRITE].
    //                    No customer-facing surface may read from here.)
    //
    //   PER-USER world → sim_positions / sim_trades / sim_accounts via
    //                    placeUserOrder() — fanned out to every user with
    //                    user_settings.autoMode = true AND tradingMode != 'live'.
    //                    This is the canonical source of truth for the
    //                    customer Portal / PWA (openPositions, equity,
    //                    realizedPnL, Live Trades, Trade History).
    //
    // Both writes happen on the same signal. The global mirror stays in
    // place until telemetry parity is verified and per-user convergence
    // stabilizes (then it can be retired behind a feature flag).
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
    logger.info(
      {
        tag:          "GLOBAL_MIRROR_WRITE",
        store:        "simulationEngine.positions[]",
        scope:        "GLOBAL",
        perUserAware: false,
        symbol, side, sizeUSD,
        positionId:   pos.id,
        entryPrice:   pos.entryPrice,
      },
      "[GLOBAL_MIRROR_WRITE] paper position opened in global simulationEngine (operator-only mirror)",
    );

    // ── Per-user paper fan-out — canonical convergence write ────────────
    //
    // Selection: user_settings.autoMode=true AND tradingMode!='live'.
    // `placeUserOrder` applies its own per-user gates (status guard,
    // balance check), so any rejection surfaces as [AI_FANOUT_SKIPPED]
    // with a structured reason instead of failing the whole tick.
    try {
      const fanoutCorrelationId = genCorrelationId();
      const eligibleUsers       = await listPaperAutoTradeUsers();

      logger.info(
        {
          tag:            "AI_FANOUT_ELIGIBLE",
          correlationId:  fanoutCorrelationId,
          eligibleCount:  eligibleUsers.length,
          symbol, side, signalId,
          runtimeMode:    "paper",
        },
        `[AI_FANOUT_ELIGIBLE] ${eligibleUsers.length} paper-mode AI auto-trade users eligible for ${symbol} ${side}`,
      );

      // Fan out in parallel — each user's open is independent. We capture
      // each outcome with userId+reason so on-call can grep a single
      // correlationId across the whole tick fan-out.
      await Promise.all(eligibleUsers.map(async (u) => {
        try {
          // ── Per-user daily PAPER trade-limit gate ───────────────────
          // Free tier is paper-only and capped (default 10 / 24h).
          // Admin / super-admin short-circuit to unlimited inside the
          // engine. Blocked users are skipped (not failed) so the tick
          // continues for everyone else.
          const paperVerdict = await getTradeLimitVerdict(u.userId, "paper");
          if (paperVerdict.blocked) {
            logger.info(
              {
                tag:           "AI_FANOUT_SKIPPED",
                correlationId: fanoutCorrelationId,
                userId:        u.userId,
                runtimeMode:   "paper",
                symbol, side,
                sizeUSD:       u.positionSizeUSD,
                signalId,
                reason:        "trade_limit_exhausted",
                used24h:       paperVerdict.used24h,
                capTier:       paperVerdict.capTier,
              },
              "[AI_FANOUT_SKIPPED] paper fan-out blocked by daily trade-limit",
            );
            try {
              await db.insert(userNotificationsTable).values({
                userId:  u.userId,
                type:    "trade_limit_reached",
                title:   "Daily paper trade limit reached",
                message: `You've used all ${paperVerdict.capTier} of your daily paper trades. Upgrade for live trading with higher limits.`,
                data:    {
                  scope:    "paper",
                  used24h:  paperVerdict.used24h,
                  capTier:  paperVerdict.capTier,
                  resetsAt: paperVerdict.windowResetsAt,
                },
                read:    false,
              });
            } catch (notifErr) {
              logger.warn(
                { userId: u.userId, err: notifErr instanceof Error ? notifErr.message : String(notifErr) },
                "tradingLoop: failed to persist trade_limit_reached notification",
              );
            }
            return;
          }

          const userResult = await placeUserOrder(u.userId, {
            symbol,
            side,
            sizeUSD:    u.positionSizeUSD,
            signalId:   signalId ?? undefined,
            confidence,
            stopLoss:   side === "BUY"
              ? parseFloat((pos.entryPrice * (1 - u.stopLossPercent   / 100)).toFixed(2))
              : parseFloat((pos.entryPrice * (1 + u.stopLossPercent   / 100)).toFixed(2)),
            takeProfit: side === "BUY"
              ? parseFloat((pos.entryPrice * (1 + u.takeProfitPercent / 100)).toFixed(2))
              : parseFloat((pos.entryPrice * (1 - u.takeProfitPercent / 100)).toFixed(2)),
          });
          if (userResult.success) {
            logger.info(
              {
                tag:           "AI_FANOUT_EXECUTED",
                correlationId: fanoutCorrelationId,
                userId:        u.userId,
                runtimeMode:   "paper",
                symbol, side,
                sizeUSD:       u.positionSizeUSD,
                signalId,
                positionId:    userResult.position?.id ?? null,
                entryPrice:    userResult.position?.entryPrice ?? null,
                store:         "sim_positions",
                scope:         "PER_USER",
                perUserAware:  true,
              },
              "[AI_FANOUT_EXECUTED] paper position opened in per-user sim_positions (canonical)",
            );
            // New paper open landed — bust the cached paper verdict so the
            // next tick re-counts against the daily cap immediately.
            invalidateTradeLimitCache(u.userId, "paper");
            // CONF EXPERIMENT: per-customer PAPER fill in the measurement band [50,64].
            if (inConfExperimentBand(confidence)) {
              logger.info(
                { tag: "CONF_EXP_5064", outcome: "executed", scope: "customer_paper", userId: u.userId, symbol, side, confidence, positionId: userResult.position?.id ?? null },
                `[CONF_EXP_5064] paper fill ${symbol} ${side} @ ${confidence.toFixed(1)}% user=${u.userId}`,
              );
            }
          } else {
            logger.info(
              {
                tag:           "AI_FANOUT_SKIPPED",
                correlationId: fanoutCorrelationId,
                userId:        u.userId,
                runtimeMode:   "paper",
                symbol, side,
                sizeUSD:       u.positionSizeUSD,
                signalId,
                reason:        userResult.error ?? "unknown",
              },
              "[AI_FANOUT_SKIPPED] paper fan-out rejected by per-user gate",
            );
          }
        } catch (err) {
          logger.warn(
            {
              tag:           "AI_FANOUT_SKIPPED",
              correlationId: fanoutCorrelationId,
              userId:        u.userId,
              runtimeMode:   "paper",
              symbol, side,
              sizeUSD:       u.positionSizeUSD,
              signalId,
              reason:        err instanceof Error ? err.message : String(err),
            },
            "[AI_FANOUT_SKIPPED] paper fan-out threw — user fall-through",
          );
        }
      }));
    } catch (err) {
      // Fan-out failure must NEVER break the global tick — log and continue.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), symbol, side },
        "Paper AI fan-out: outer failure (eligibility query / Promise.all)",
      );
    }
  }

  // ── Execution confirmed ────────────────────────────────────────────────────
  const stopLoss   = side === "BUY" ? pos.entryPrice * (1 - settings.stopLossPercent / 100) : pos.entryPrice * (1 + settings.stopLossPercent / 100);
  const takeProfit = side === "BUY" ? pos.entryPrice * (1 + settings.takeProfitPercent / 100) : pos.entryPrice * (1 - settings.takeProfitPercent / 100);
  const tradeMode  = isTest ? "test" : (isLiveExec ? "live" : "auto");

  // [GLOBAL_MIRROR_WRITE] — `tradesTable` has no `user_id` column and is
  // the operator-only audit/telemetry mirror. Customer surfaces must read
  // from `sim_trades` (per-user) via getUserAccountSummary / mobile routes.
  logger.info(
    {
      tag:          "GLOBAL_MIRROR_WRITE",
      store:        "tradesTable",
      scope:        "GLOBAL",
      perUserAware: false,
      symbol, side, sizeUSD,
      positionId:   pos.id,
      mode:         tradeMode,
    },
    "[GLOBAL_MIRROR_WRITE] inserting global tradesTable row (operator-only mirror)",
  );
  // EXIT_ENGINE_V2: link the `trades` row id to the simulation position id so the
  // automated close path (runTrailingStops) and boot rehydration can map a
  // position 1:1 to its persisted row. Flag OFF keeps the legacy random row id.
  await db.insert(tradesTable).values({
    id:         isExitEngineV2() ? pos.id : genId(),
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

// ── Hard stop-loss / take-profit monitor (Task 1 — blocking safety) ─────────────
//
// Runs every tick BEFORE the trailing-stop pass. Enumerates every open per-user
// position (paper + live) that carries a fixed SL/TP price, fetches the current
// price once per symbol, and force-closes any position whose price has breached
// its stop-loss or take-profit. Closes route through `closeUserPosition`, which
// fires the full EXIT_ENGINE_V2 close chain (and the live broker close for live
// positions) — only the TRIGGER is new here.
//
// Breach semantics (SL/TP prices are pre-computed at open from `side`):
//   BUY  → STOP_LOSS  when price <= stopLoss ; TAKE_PROFIT when price >= takeProfit
//   SELL → STOP_LOSS  when price >= stopLoss ; TAKE_PROFIT when price <= takeProfit
// Stop-loss is checked first so capital protection always wins a tie.
async function runHardStopMonitor() {
  if (!isHardStopEnforcementEnabled()) return;
  try {
    const positions = await listOpenPositionsForRiskMonitor();
    if (positions.length === 0) return;

    // Fetch each symbol's current price once, reuse across that symbol's
    // positions. A failed ticker fetch skips that symbol this tick (the next
    // tick retries) rather than closing on a stale/zero price.
    const symbols    = [...new Set(positions.map((p) => p.symbol))];
    const priceBySym = new Map<string, number>();
    await Promise.all(symbols.map(async (sym) => {
      try {
        const ticker = await getTicker(sym);
        if (ticker.price > 0) priceBySym.set(sym, ticker.price);
      } catch {
        /* skip symbol this tick */
      }
    }));

    const correlationId = genCorrelationId();
    await Promise.all(positions.map(async (p) => {
      const price = priceBySym.get(p.symbol);
      if (price === undefined) return;

      const isBuy = p.side === "BUY";
      let reason: "STOP_LOSS" | "TAKE_PROFIT" | null = null;
      if (p.stopLoss !== null) {
        if (isBuy ? price <= p.stopLoss : price >= p.stopLoss) reason = "STOP_LOSS";
      }
      if (reason === null && p.takeProfit !== null) {
        if (isBuy ? price >= p.takeProfit : price <= p.takeProfit) reason = "TAKE_PROFIT";
      }
      if (reason === null) return;

      const runtimeMode = p.exchange ? "LIVE" : "PAPER";
      try {
        const closeResult = await closeUserPosition(p.userId, p.positionId, reason);
        if (closeResult.success) {
          engineStats.hardStopHits++;
          logger.info(
            {
              tag:           "HARD_STOP_TRIGGERED",
              correlationId,
              userId:        p.userId,
              positionId:    p.positionId,
              symbol:        p.symbol,
              side:          p.side,
              reason,
              entryPrice:    p.entryPrice,
              triggerPrice:  price,
              stopLoss:      p.stopLoss,
              takeProfit:    p.takeProfit,
              mode:          runtimeMode,
              realizedPnLPct: closeResult.trade?.realizedPnLPct,
            },
            `[HARD_STOP_TRIGGERED] ${reason} ${runtimeMode} ${p.symbol} ${p.side} @ ${price} (entry ${p.entryPrice})`,
          );
          executionStreamBus.emitEvent({
            type:     "position_closed",
            severity: reason === "STOP_LOSS" ? "warn" : "success",
            symbol:   p.symbol,
            side:     isBuy ? "BUY" : "SELL",
            price,
            mode:     p.exchange ? "live" : "simulation",
            exchange: p.exchange ?? undefined,
            reason,
            message:  `${reason} hard close — ${runtimeMode} ${p.symbol} @ $${price.toFixed(2)}`,
            details:  {
              userId:        p.userId,
              positionId:    p.positionId,
              entryPrice:    p.entryPrice,
              realizedPnLPct: closeResult.trade?.realizedPnLPct,
            },
          });
        } else {
          // Position already gone (e.g. closed by trailing pass / manual close
          // earlier this tick) surfaces as not-found — benign.
          logger.info(
            {
              tag:        "HARD_STOP_SKIPPED",
              correlationId,
              userId:     p.userId,
              positionId: p.positionId,
              symbol:     p.symbol,
              reason:     closeResult.error ?? "closeUserPosition returned not-success",
              mode:       runtimeMode,
            },
            "[HARD_STOP_SKIPPED] hard-stop close not applied",
          );
        }
      } catch (err) {
        logger.warn(
          {
            tag:        "HARD_STOP_SKIPPED",
            correlationId,
            userId:     p.userId,
            positionId: p.positionId,
            symbol:     p.symbol,
            reason:     err instanceof Error ? err.message : String(err),
            mode:       runtimeMode,
          },
          "[HARD_STOP_SKIPPED] hard-stop close threw",
        );
      }
    }));
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "runHardStopMonitor: unexpected failure",
    );
  }
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

      // ── Per-user PAPER close fan-out (canonical convergence — Phase 5) ──
      //
      // The global trailing-stop engine just closed `view.positionId` in
      // `simulationEngine.positions[]`. That global close is operator-only
      // telemetry (`[GLOBAL_MIRROR_WRITE]` semantics). Every PAPER user with
      // an open position on the same symbol must now also close in their
      // canonical store via `closeUserPosition`, which fires the full
      // CLOSE_POSITION → REALIZED_PNL_APPLIED → POSITION_CLOSED →
      // ACCOUNT_SUMMARY_UPDATED → EQUITY_RECONCILED chain that the
      // customer-facing readers depend on.
      //
      // Live (`exchange IS NOT NULL`) per-user positions are excluded by
      // `listOpenPaperPositionsBySymbol`; live closes flow through the live
      // execution gateway path on their own.
      try {
        const closeCorrelationId = genCorrelationId();
        const eligible           = await listOpenPaperPositionsBySymbol(view.symbol);
        logger.info(
          {
            tag:           "AI_FANOUT_ELIGIBLE",
            phase:         "close",
            correlationId: closeCorrelationId,
            symbol:        view.symbol,
            eligibleCount: eligible.length,
            globalPositionId: view.positionId,
            reason:        "TRAILING_STOP",
            runtimeMode:   "paper",
          },
          `[AI_FANOUT_ELIGIBLE] close fan-out for ${view.symbol} TRAILING_STOP — ${eligible.length} per-user paper positions`,
        );
        await Promise.all(eligible.map(async (row) => {
          try {
            const closeResult = await closeUserPosition(row.userId, row.positionId, "TRAILING_STOP");
            if (closeResult.success) {
              logger.info(
                {
                  tag:           "AI_FANOUT_EXECUTED",
                  phase:         "close",
                  correlationId: closeCorrelationId,
                  userId:        row.userId,
                  symbol:        view.symbol,
                  positionId:    row.positionId,
                  reason:        "TRAILING_STOP",
                  runtimeMode:   "paper",
                  scope:         "PER_USER",
                  perUserAware:  true,
                },
                "[AI_FANOUT_EXECUTED] per-user paper close on TRAILING_STOP",
              );
            } else {
              logger.info(
                {
                  tag:           "AI_FANOUT_SKIPPED",
                  phase:         "close",
                  correlationId: closeCorrelationId,
                  userId:        row.userId,
                  symbol:        view.symbol,
                  positionId:    row.positionId,
                  reason:        closeResult.error ?? "closeUserPosition returned not-success",
                  runtimeMode:   "paper",
                },
                "[AI_FANOUT_SKIPPED] per-user paper close rejected",
              );
            }
          } catch (err) {
            logger.warn(
              {
                tag:           "AI_FANOUT_SKIPPED",
                phase:         "close",
                correlationId: closeCorrelationId,
                userId:        row.userId,
                symbol:        view.symbol,
                positionId:    row.positionId,
                reason:        err instanceof Error ? err.message : String(err),
                runtimeMode:   "paper",
              },
              "[AI_FANOUT_SKIPPED] per-user paper close threw",
            );
          }
        }));
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), symbol: view.symbol },
          "Paper close fan-out: outer failure (eligibility query / Promise.all)",
        );
      }

      logger.info(
        {
          tag:           "GLOBAL_MIRROR_WRITE",
          phase:         "close",
          store:         "simulationEngine.positions[]",
          scope:         "GLOBAL",
          perUserAware:  false,
          symbol:        view.symbol,
          positionId:    view.positionId,
          reason:        "TRAILING_STOP",
        },
        "[GLOBAL_MIRROR_WRITE] global trailing-stop close (operator-only mirror)",
      );
      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "success",
        message: `Trailing stop triggered: ${view.symbol} closed at gain ${view.gainFromEntryPct >= 0 ? "+" : ""}${view.gainFromEntryPct.toFixed(2)}%`,
        details: { positionId: view.positionId, symbol: view.symbol, gainFromEntryPct: view.gainFromEntryPct },
      });

      // EXIT_ENGINE_V2: persist the automated close back to the linked `trades`
      // row so the lifecycle is durable (row id == position id when the flag was
      // on at open time). Flag OFF leaves the trades row untouched (legacy: no
      // automated trades-table close ever happened).
      if (isExitEngineV2()) {
        // Prefer the authoritative close fill surfaced by the trailing engine
        // (simulationEngine.closePosition's returned trade). Fall back to the
        // trailing-check snapshot only if the close result was unavailable (e.g.
        // closePosition failed) — in that degraded case the in-memory position
        // was NOT removed, so we intentionally skip the DB close to avoid marking
        // a row closed that is still open in memory.
        const exitPrice = view.closeExitPrice;
        const pnl       = view.closeRealizedPnL;
        const pnlPct    = view.closeRealizedPnLPct;
        if (exitPrice !== undefined && pnl !== undefined && pnlPct !== undefined) {
          try {
            await markTradeRowClosed(view.positionId, exitPrice, pnl, pnlPct, "TRAILING_STOP");
          } catch (err) {
            logger.warn({ err, positionId: view.positionId }, "[EXIT_ENGINE_V2] failed to persist automated trades-table close");
          }
        } else {
          logger.warn({ positionId: view.positionId, symbol: view.symbol }, "[EXIT_ENGINE_V2] in-memory close fill unavailable; skipping DB close to avoid memory/DB divergence");
        }
      }
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

      // LOW-CONFIDENCE FILTER — compute global executionEligible flag.
      // Priority order matches the live-execution funnel's own ordering so
      // the reason surfaced on the card matches the reason a manual order
      // would be rejected with downstream. Resolved against the engine
      // BASELINE (BASELINE_MIN_CONFIDENCE = 60); per-user execution paths
      // still re-check the caller's own user_settings.minConfidence in
      // placeLiveAutoOrderForUser gate 0e.
      let executionBlockReason: SymbolBreakdown["executionBlockReason"] = null;
      if (mtf.agreedAction === "HOLD") {
        executionBlockReason = "hold_bias";
      } else if (!mtf.mtfConfirmed) {
        executionBlockReason = "no_mtf_agreement";
      } else if (mtf.avgConfidence < BASELINE_MIN_CONFIDENCE) {
        executionBlockReason = "low_confidence";
      } else if (mtf.marketCondition === "sideways") {
        executionBlockReason = "sideways";
      }
      const executionEligible = executionBlockReason === null;

      // Update per-symbol breakdown
      engineStats.symbolBreakdowns[symbol] = {
        symbol,
        fast:              mtf.fastSnap,
        slow:              mtf.slowSnap,
        mtfConfirmed:      mtf.mtfConfirmed,
        agreedAction:      mtf.agreedAction,
        avgConfidence:     mtf.avgConfidence,       // EXECUTION (65% live floor, riskGate, KrakenAdapter)
        displayConfidence: mtf.displayConfidence,   // DISPLAY ONLY (render layer)
        blockReason:       mtf.blockReason,
        lastUpdated:       Date.now(),
        volumeConfirmed:   mtf.volumeConfirmed,
        volumeRatio:       mtf.volumeRatio,
        marketCondition:   mtf.marketCondition,
        trend1H:           mtf.trend1H,
        executionEligible,
        executionBlockReason,
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
      // CONF EXPERIMENT: force the engine signal floor to the experiment knob
      // (default 50) instead of the operator-configured settings.minConfidence,
      // so 50–59 confidence signals are generated + fanned out platform-wide.
      // Revert by setting EXPERIMENT_CONF_FLOOR=65 (or restoring this line).
      const confThresh = testMode ? 20 : EXPERIMENT_CONF_FLOOR;

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

      // ── Unified execution decision ────────────────────────────────────────
      // `executionEligible` (computed above) is the SINGLE source of truth for
      // confidence + MTF agreement + sideways + HOLD-bias. The legacy ">=60
      // high-confidence override" path (which bypassed MTF/quality filters) has
      // been removed — execution now follows the same unified flag everywhere,
      // gated only by the remaining engine quality filters (volume, 1H trend)
      // and the operator auto-mode / kill-switch. Hard stops (positions cap,
      // risk engine, correlation, exchange validation) still live in autoExecute.
      const effectiveAction: "BUY" | "SELL" | "HOLD" = testAction;

      const shouldTrade =
        settings.autoMode &&
        !settings.killSwitch &&
        executionEligible &&
        effectiveAction !== "HOLD" &&
        volumeGatePass &&
        trend1HGatePass;

      // Determine block reason for signal log
      let signalBlockReason: string | null = null;
      if (!settings.autoMode) {
        signalBlockReason = "Auto-mode off";
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
        decision:     mtf.agreedAction,
        confidence:   mtf.avgConfidence,
        shortSummary: mtf.fast.shortSummary,
        blockReason:  signalBlockReason,
        executedAs:   null,
        timestamp:    Date.now(),
        // LOW-CONFIDENCE FILTER — mirrors the SymbolBreakdown flag so the
        // AI Reasoning Console can render INFORMATIONAL vs EXECUTABLE tags
        // directly off the wire payload without re-deriving from confidence.
        executionEligible,
      });

      // Pre-autoExecute rejection emit — surfaces gate failures that happen
      // BEFORE autoExecute is even called (conf, sideways, volume, 1H trend,
      // auto-mode off). The autoExecute path has its own emits for the gates
      // it owns (positions, daily limit, risk, correlation, exchange).
      if (!shouldTrade && signalBlockReason && effectiveAction !== "HOLD") {
        const isConfBlock =
          signalBlockReason.startsWith("Low confidence");
        // TEMP [VOL_GATE_TEST] — attribute each rejected actionable signal to
        // its first failing gate (confidence vs volume). Remove with the rest
        // of the volGateTest block when the controlled test window closes.
        if (isConfBlock) {
          engineStats.volGateTest.rejectedByConfidence++;
        } else if (signalBlockReason === "Volume below average (low-volume filter)") {
          engineStats.volGateTest.rejectedByVolume++;
        }
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

        // CONF EXPERIMENT: durable record of every actionable candidate REJECTED
        // while confidence sits in the measurement band [50,64] — these are the
        // trades the 50-floor experiment forgoes; capture the failing gate so
        // post-hoc analysis can weigh rejected-band quality against executed.
        if (inConfExperimentBand(mtf.avgConfidence)) {
          const cText = mtf.avgConfidence.toFixed(1);
          logger.info(
            { tag: "CONF_EXP_5064", outcome: "rejected", symbol, side: effectiveAction, confidence: mtf.avgConfidence, reason: signalBlockReason },
            `[CONF_EXP_5064] rejected ${symbol} ${effectiveAction} @ ${cText}% — ${signalBlockReason}`,
          );
          // Fire-and-forget: never await or throw inside the per-symbol tick.
          void db.insert(logsTable).values({
            id: genId(), type: "trade", level: "info",
            message: `[CONF_EXP_5064] rejected ${symbol} ${effectiveAction} @ ${cText}%: ${signalBlockReason}`,
            details: { tag: "CONF_EXP_5064", outcome: "rejected", symbol, side: effectiveAction, confidence: mtf.avgConfidence, reason: signalBlockReason },
          }).catch(() => { /* best-effort telemetry — never block the loop */ });
        }
      }

      // SIGNAL_FUNNEL: outcome of the order path, captured for the per-signal
      // funnel trace assembled after this block. Defaults assume the signal
      // never reached execution (the common case when the collapse is upstream).
      let execExecuted   = false;
      let execBlockReason: string | null = null;

      if (shouldTrade) {
        // TEMP [VOL_GATE_TEST] — signal cleared every signal-quality gate
        // (confidence, MTF, volume, sideways, 1H) and is entering the order
        // path. `ordersSubmitted` counts each autoExecute attempt; downstream
        // gates inside autoExecute (positions cap, daily limit, risk,
        // correlation, exchange health) may still block before a fill.
        engineStats.volGateTest.passedAllGates++;
        engineStats.volGateTest.ordersSubmitted++;
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
        execExecuted   = execResult.executed;
        execBlockReason = execResult.blockReason;
        if (execResult.executed) {
          engineStats.volGateTest.positionsOpened++;
          // CONF EXPERIMENT: greppable executed marker for the engine/operator
          // order path (per-customer fan-out fills are logged at their own
          // sites below). Durable per-trade record = sim_trades.confidence.
          if (inConfExperimentBand(mtf.avgConfidence)) {
            logger.info(
              { tag: "CONF_EXP_5064", outcome: "executed", scope: "engine", symbol, side: effectiveAction, confidence: mtf.avgConfidence },
              `[CONF_EXP_5064] executed ${symbol} ${effectiveAction} @ ${mtf.avgConfidence.toFixed(1)}%`,
            );
          }
        }

        // Update signal log with execution result
        const logEntry = engineStats.recentSignalLog.find((e) => e.id === id5m);
        if (logEntry) {
          logEntry.blockReason = execResult.blockReason;
          logEntry.executedAs  = execResult.executed ? (testMode ? "test" : "auto") : null;
        }
      }

      // ── SIGNAL_FUNNEL — per-signal funnel trace (diagnostic telemetry) ──────
      // Records a Y/N result for every gate, in funnel order, for each
      // DIRECTIONAL candidate (at least one timeframe is non-HOLD). This is the
      // instrumentation that answers "exactly which gate stops thousands of
      // signals from becoming trades" — it changes NO thresholds and gates
      // nothing; it only observes the decisions made above. Downstream gates
      // are derived from autoExecute's existing blockReason (autoExecute itself
      // is untouched). Engine-gate booleans mirror the `shouldTrade` formula:
      // the high-confidence override has been removed, so each gate stands on
      // its own and `executionEligible` is the unified confidence authority.
      const fnDirectional = mtf.fast.decision !== "HOLD" || mtf.slow.decision !== "HOLD";
      if (fnDirectional) {
        const fnSide: "BUY" | "SELL" =
          (effectiveAction !== "HOLD"
            ? effectiveAction
            : (mtf.fast.decision !== "HOLD" ? mtf.fast.decision : mtf.slow.decision)) as "BUY" | "SELL";
        const confFloor = confThresh;

        const gConfidence = mtf.avgConfidence >= confFloor;
        const gMTF        = mtf.mtfConfirmed || testSingleTF;
        const gVolume     = volumeGatePass;
        const gSideways   = sidewaysGatePass;
        const gTrend1H    = trend1HGatePass;

        // First failing engine gate → headline rejection reason.
        let fnRejGate:   string | null = null;
        let fnRejReason: string | null = null;
        if (!gConfidence) {
          fnRejGate = "confidence";
          fnRejReason = `Confidence ${mtf.avgConfidence.toFixed(1)}% < ${confFloor}% floor`;
        } else if (!gMTF) {
          fnRejGate = "mtf";
          fnRejReason = mtf.blockReason || "Multi-timeframe disagreement (5m/15m)";
        } else if (!gVolume) {
          fnRejGate = "volume";
          fnRejReason = "Volume below average (low-volume filter)";
        } else if (!gSideways) {
          fnRejGate = "sideways";
          fnRejReason = "Sideways / range-bound market (spread filter)";
        } else if (!gTrend1H) {
          fnRejGate = "trend1h";
          fnRejReason = `1H trend conflict (trend=${mtf.trend1H}, signal=${fnSide})`;
        } else if (!shouldTrade) {
          // All engine gates passed but the engine itself is disabled.
          fnRejGate = settings.autoMode ? "kill_switch" : "auto_mode_off";
          fnRejReason = settings.autoMode ? "Kill switch active" : "Auto-mode off";
        }

        const trace: SignalTrace = {
          ts:                  Date.now(),
          symbol,
          side:                fnSide,
          confidence:          mtf.avgConfidence,
          passedConfidence:    gConfidence,
          passedMTF:           gConfidence && gMTF,
          passedVolume:        gConfidence && gMTF && gVolume,
          passedSideways:      gConfidence && gMTF && gVolume && gSideways,
          passedTrend1H:       gConfidence && gMTF && gVolume && gSideways && gTrend1H,
          reachedExecution:    shouldTrade,
          passedPositionLimit: null,
          passedCooldown:      null,
          passedDuplicate:     null,
          passedRisk:          null,
          passedExchange:      null,
          executionAttempted:  false,
          finalResult:         "REJECTED",
          rejectionGate:       fnRejGate,
          rejectionReason:     fnRejReason,
        };

        if (shouldTrade) {
          const ds = classifyDownstream(execBlockReason, execExecuted);
          trace.passedPositionLimit = ds.passedPositionLimit;
          trace.passedCooldown      = ds.passedCooldown;
          trace.passedDuplicate     = ds.passedDuplicate;
          trace.passedRisk          = ds.passedRisk;
          trace.passedExchange      = ds.passedExchange;
          trace.executionAttempted  = ds.executionAttempted;
          trace.finalResult         = execExecuted ? "EXECUTED" : "REJECTED";
          trace.rejectionGate       = execExecuted ? null : ds.rejectionGate;
          trace.rejectionReason     = execExecuted ? null : ds.rejectionReason;
        }

        recordSignalTrace(trace);

        logger.info(
          {
            tag:        "SIGNAL_FUNNEL",
            symbol,
            side:       fnSide,
            confidence: mtf.avgConfidence,
            gates: {
              confidence:    trace.passedConfidence    ? "Y" : "N",
              mtf:           trace.passedMTF            ? "Y" : "N",
              volume:        trace.passedVolume         ? "Y" : "N",
              spread:        trace.passedSideways       ? "Y" : "N",
              trend1h:       trace.passedTrend1H        ? "Y" : "N",
              positionLimit: ynNull(trace.passedPositionLimit),
              cooldown:      ynNull(trace.passedCooldown),
              duplicate:     ynNull(trace.passedDuplicate),
              risk:          ynNull(trace.passedRisk),
              exchange:      ynNull(trace.passedExchange),
            },
            finalResult:     trace.finalResult,
            rejectionGate:   trace.rejectionGate,
            rejectionReason: trace.rejectionReason,
          },
          `[SIGNAL_FUNNEL] ${symbol} ${fnSide} @ ${mtf.avgConfidence.toFixed(1)}% → ${trace.finalResult}${trace.rejectionGate ? ` (${trace.rejectionGate})` : ""}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ symbol, err }, "Trading loop: MTF computation error");
      engineStats.errors.push(`[${new Date().toISOString()}] ${symbol}: ${msg}`);
      if (engineStats.errors.length > 20) engineStats.errors.shift();
    }
  }

  // TEMP [VOL_GATE_TEST] — controlled live-test funnel snapshot (cumulative
  // since boot) emitted once per tick so Render logs carry a time-series of
  // the 65% volume-gate impact. Remove when the controlled test window closes.
  logger.info({
    tag:                  "VOL_GATE_TEST",
    volumeGatePct:        65,
    rejectedByConfidence: engineStats.volGateTest.rejectedByConfidence,
    rejectedByVolume:     engineStats.volGateTest.rejectedByVolume,
    passedAllGates:       engineStats.volGateTest.passedAllGates,
    ordersSubmitted:      engineStats.volGateTest.ordersSubmitted,
    positionsOpened:      engineStats.volGateTest.positionsOpened,
  }, "[VOL_GATE_TEST] gate funnel snapshot");

  // Hard SL/TP enforcement runs BEFORE the profit-only trailing pass so a
  // breached stop is force-closed even on a trade that never went green.
  await runHardStopMonitor();
  await runTrailingStops();
}

// ── Public API ─────────────────────────────────────────────────────────────────

let loopHandle: ReturnType<typeof setInterval> | null = null;
const LOOP_INTERVAL_MS = 60_000;

export function startTradingLoop() {
  if (loopHandle) return;

  engineStats.running   = true;
  engineStats.startedAt = Date.now();

  // EXIT_ENGINE_V2: rehydrate open positions from the `trades` table BEFORE the
  // first tick so the trailing-stop monitor + cap gate see the persisted state
  // immediately (instead of an empty in-memory array that orphans DB rows). Flag
  // OFF preserves the legacy boot path (straight to tick, empty positions).
  if (isExitEngineV2()) {
    void (async () => {
      try {
        await rehydrateOpenPositions();
      } catch (err) {
        logger.error({ err }, "[EXIT_ENGINE_V2] rehydration failed on boot");
      } finally {
        void tick();
      }
    })();
  } else {
    void tick();
  }

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
