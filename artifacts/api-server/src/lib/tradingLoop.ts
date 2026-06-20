import crypto from "crypto";
import { db } from "@workspace/db";
import { signalsTable, logsTable, settingsTable, tradesTable, userNotificationsTable } from "@workspace/db";
import { eq, and, gte, gt, lt, inArray, count, isNotNull } from "drizzle-orm";
import { settingsStore } from "./settingsStore.js";
import { getCandles, SUPPORTED_SYMBOLS, type Candle } from "./marketData.js";
import { runAIDecision, type AIDecisionResult } from "./aiReasoning.js";
import { computeRSI, computeEMA, computeMACD } from "./indicators.js";
import { placeOrder, getAccountSummary, hydrateOpenPositions, closePosition, type SimPosition } from "./simulationEngine.js";
import { placeLiveAutoOrder, closeOperatorPositionLive, confirmOperatorOrderFill } from "./exchangeEngine.js";
import {
  listLiveExecutionUsers,
  isDryRunEnabled,
  getUserBrokerBaseBalance,
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
  reconcileZombiePosition,
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
import { recordOperatorSimExecution } from "./customerExecMetrics.js";
import { NotificationDispatcher } from "../services/notifications/NotificationDispatcher.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { executionStreamBus, getSafeTestMode } from "./executionStreamBus.js";
import { recordSignalTrace, classifyDownstream, type SignalTrace } from "./signalFunnel.js";
import { resolveExitConfig, buildExitConfigResolver } from "./exitConfig.js";
import { evaluateStrategyV2Gate, isStrategyV2Enabled } from "./strategyV2Gate.js";
import { updateExcursion, pruneExcursions } from "./excursionTracker.js";
import { logger } from "./logger.js";
import { roundOptionalPrice, roundPrice } from "./pricePrecision.js";
import { runManualTargetExitMonitor } from "./manualTargetExit.js";

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

// ── Global-book cap self-heal (max-hold force-close) ────────────────────────────
// A global `trades` row that has no live ticker (delisted/untradeable symbol) or
// is absent from in-memory simulationEngine (rehydration gap) can NEVER be closed
// by the SL/TP pass in `runGlobalHardStops`, yet keeps counting toward
// `maxActivePositions` (Gate 1). Enough of these and the cap deadlocks — every new
// candidate is rejected at `passedPositionLimits` and the engine opens 0 trades.
// This ceiling force-closes any global row open longer than the limit so the cap
// self-heals. Scoped to the GLOBAL `trades` book ONLY — per-user `sim_positions`
// (real-money, fixed SL/TP governance) are never touched here.
// Default 24h. Set `GLOBAL_POSITION_MAX_HOLD_MS=0` to disable.
const DEFAULT_GLOBAL_POSITION_MAX_HOLD_MS = 24 * 60 * 60 * 1000;
function getGlobalPositionMaxHoldMs(): number {
  const raw = process.env.GLOBAL_POSITION_MAX_HOLD_MS;
  if (raw === undefined || raw === "") return DEFAULT_GLOBAL_POSITION_MAX_HOLD_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_GLOBAL_POSITION_MAX_HOLD_MS;
}

// ── Per-user LIVE position exit enhancements (trailing-stop + max-hold) ──────────
// Live (`exchange IS NOT NULL`) per-user `sim_positions` historically had ONLY a
// fixed SL/TP exit (`runHardStopMonitor`). In a flat market that sits inside the
// SL/TP band, a real-money position could stay open indefinitely (observed: 18–27h
// holds). These two ceilings make the live exit lifecycle active rather than purely
// passive:
//   1. Trailing-stop — locks in profit once a position has run favourably. It only
//      arms once the trail sits above entry (the fixed SL still owns all downside),
//      so it targets a profitable exit; the realised broker fill can still differ
//      slightly from the trigger price on a gap/slippage.
//   2. Max-hold — a hard time ceiling so no live position can be held forever.
//      Evaluated price-independently so it fires even if the market-data feed is down.
//
// Both are LIVE-only here; paper trailing is owned by `runTrailingStops` and the
// global book by `runGlobalCapSelfHeal`. Tunable via env, no redeploy.

// Live trailing-stop distance resolution moved to `lib/exitConfig.ts`
// (`getLiveTrailingStopPercentOverride` + per-account / per-exchange config,
// Task #220). The env var `LIVE_TRAILING_STOP_PERCENT` still acts as the global
// operator override there.

// Max-hold for live per-user positions. Mirrors the global book default (24h ON).
// Set `LIVE_POSITION_MAX_HOLD_MS=0` to disable.
const DEFAULT_LIVE_POSITION_MAX_HOLD_MS = 24 * 60 * 60 * 1000;
function getLivePositionMaxHoldMs(): number {
  const raw = process.env.LIVE_POSITION_MAX_HOLD_MS;
  if (raw === undefined || raw === "") return DEFAULT_LIVE_POSITION_MAX_HOLD_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LIVE_POSITION_MAX_HOLD_MS;
}

// In-memory high/low-water marks for live trailing stops, keyed by positionId.
// BUY positions track the highest price seen; SELL the lowest. The map is pruned
// each tick to the set of currently-open live positions so it cannot leak. State
// is intentionally process-local: on restart the water mark re-anchors to the
// current price (conservative — trailing simply re-arms after the next run-up).
const liveTrailWaterMarks = new Map<string, { high: number; low: number }>();

// Consecutive LIVE stop-loss breach counter per position (Production Optimization
// P1 — confirmation logic). A live stop fires only after LIVE_STOP_CONFIRM_TICKS
// consecutive breaching ticks; this map holds the running count and is reset to 0
// whenever a position stops breaching. Pruned each tick alongside
// `liveTrailWaterMarks`. Process-local: on restart confirmation simply re-counts.
const liveStopBreachStreak = new Map<string, number>();

// ── Zombie LIVE-position reconciliation (orphaned max-hold closes) ────────────
// Consecutive FAILED live-close counter per position. A LIVE position past
// max-hold whose broker close is rejected this many ticks IN A ROW is escalated
// to a broker-balance check; only if the venue can no longer cover the recorded
// quantity is the position reconciled (retired) locally. Pruned each tick
// alongside the other per-position maps. Process-local: on restart the count
// simply re-accumulates — conservative, since reconciliation only fires after
// re-confirming both the repeated failures AND the missing broker balance.
const failedLiveCloseStreak = new Map<string, number>();

// Consecutive failed live closes before a max-hold orphan is balance-checked.
// Fail-safe parse → default 3. Hard floor of 2: the safety invariant forbids
// ever local-closing on a single rejection, so a misconfigured `1` (or any
// invalid value) falls back to the default rather than weakening the guard.
const DEFAULT_RECONCILE_FAILED_CLOSE_STREAK = 3;
const MIN_RECONCILE_FAILED_CLOSE_STREAK = 2;
function getReconcileFailedCloseStreak(): number {
  const raw = process.env.LIVE_RECONCILE_FAILED_CLOSE_STREAK;
  if (raw === undefined || raw === "") return DEFAULT_RECONCILE_FAILED_CLOSE_STREAK;
  const n = Number(raw);
  return Number.isFinite(n) && n >= MIN_RECONCILE_FAILED_CLOSE_STREAK
    ? Math.floor(n)
    : DEFAULT_RECONCILE_FAILED_CLOSE_STREAK;
}

// Tolerance band on the balance-vs-recorded-qty comparison so broker dust
// rounding doesn't keep a truly-gone position alive forever. Fail-safe parse →
// default 0.02 (2%), clamped to [0, 0.5).
const DEFAULT_RECONCILE_BALANCE_TOLERANCE = 0.02;
function getReconcileBalanceTolerance(): number {
  const raw = process.env.LIVE_RECONCILE_BALANCE_TOLERANCE;
  if (raw === undefined || raw === "") return DEFAULT_RECONCILE_BALANCE_TOLERANCE;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n < 0.5 ? n : DEFAULT_RECONCILE_BALANCE_TOLERANCE;
}

// ── Per-symbol concurrency cap (diversification entry gate) ──────────────────────
// Caps how many concurrent open global-engine positions a single symbol may hold.
// ENTRY-ONLY: enforced when evaluating NEW entries in `autoExecute`; it never
// closes, modifies, merges, or otherwise touches existing open positions, and is
// fully independent of SL/TP, trailing-stop, position-manager, and trade-history
// logic. Prevents one asset from consuming every active-position slot so the
// global cap holds a diversified book. Default 1. Set
// `MAX_POSITIONS_PER_SYMBOL=0` to disable (no per-symbol limit).
const DEFAULT_MAX_POSITIONS_PER_SYMBOL = 1;
export function getMaxPositionsPerSymbol(): number {
  const raw = process.env.MAX_POSITIONS_PER_SYMBOL;
  if (raw === undefined || raw === "") return DEFAULT_MAX_POSITIONS_PER_SYMBOL;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MAX_POSITIONS_PER_SYMBOL;
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

// ── LIVE stop-loss stabilization (Production Optimization P1) ─────────────────────
// Production validation found ~30% of live trades scratch-closed via STOP_LOSS
// within seconds of entry: the bid/ask spread alone, evaluated on the very next
// tick against a stop computed from the entry-side fill, tripped the stop before
// the trade could work. These knobs filter that spread/timing noise WITHOUT
// weakening real protection — a genuinely adverse move still stops out within a
// couple of ticks, and a catastrophic move bypasses every filter immediately. The
// 2% stop-loss LEVEL is unchanged; only the live TRIGGER is stabilized. LIVE
// positions only — paper SL is byte-for-byte untouched. All env-tunable, no redeploy.
//
// SAFETY: every knob is parsed fail-SAFE. A malformed/out-of-range env value
// (e.g. "abc", "", negative) MUST NOT silently disable live stop-loss exits —
// it falls back to the hard-coded safe default and logs a single warning at boot.
// Bounds are deliberately conservative so no env value can push the effective
// trigger so far that a genuine 2% breach can never confirm.
const liveStopEnvWarnings: string[] = [];
function parseLiveStopKnob(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    liveStopEnvWarnings.push(
      `${name}="${raw}" is invalid (expected ${min}..${max}); using safe default ${fallback}`,
    );
    return fallback;
  }
  return n;
}
// 1. Grace: suppress the NORMAL stop for the first N ms after entry (spread settle).
//    Capped at 10 min so a fat-finger value can't park a position un-stopped for hours.
export const LIVE_STOP_STABILIZATION_MS = parseLiveStopKnob(
  "LIVE_STOP_STABILIZATION_MS", process.env.LIVE_STOP_STABILIZATION_MS, 90000, 0, 600000);
// 2. Spread buffer: the stop must be breached by more than this % of entry price
//    before it counts, so the spread by itself can never trigger an exit. Capped at
//    1% so the buffer can never swallow the whole 2% stop distance.
export const LIVE_STOP_SPREAD_BUFFER_PCT = parseLiveStopKnob(
  "LIVE_STOP_SPREAD_BUFFER_PCT", process.env.LIVE_STOP_SPREAD_BUFFER_PCT, 0.15, 0, 1);
// 3. Confirmation: require this many CONSECUTIVE breaching ticks before exiting.
//    Floored at 1 (always at least one confirming tick) and capped at 10.
export const LIVE_STOP_CONFIRM_TICKS = parseLiveStopKnob(
  "LIVE_STOP_CONFIRM_TICKS", process.env.LIVE_STOP_CONFIRM_TICKS, 2, 1, 10);
// 4. Catastrophic override: a breach beyond (mult-1)× the stop distance past the
//    stop fires immediately, bypassing grace + confirmation (real-crash protection).
//    Floored at 1 (mult ≤ 1 would never trigger) and capped at 10.
export const LIVE_STOP_CATASTROPHIC_MULT = parseLiveStopKnob(
  "LIVE_STOP_CATASTROPHIC_MULT", process.env.LIVE_STOP_CATASTROPHIC_MULT, 2.5, 1, 10);
// 5. Immediate-fire band (anti-blow-through): a breach that runs beyond this
//    FRACTION of the stop distance past the stop fires NOW — bypassing grace +
//    multi-tick confirmation — so a fast adverse move can't ride the grace /
//    confirmation window all the way down to the (much wider) catastrophic
//    level. With a 2% stop and the 0.25 default this caps the intended exit at
//    ~2.5% loss; tiny breaches in the [buffer, 0.25×) band still require the
//    spread buffer + N-tick confirmation (preserving the P1 spread-noise fix).
//    A post-deploy counterfactual showed STOP_LOSS exits closing at -4% to
//    -5.4% because the only fast-path was the -5% catastrophic tier. Bounded
//    [0, catastrophic) effectively; floored at 0, capped at 5.
export const LIVE_STOP_IMMEDIATE_FRACTION = parseLiveStopKnob(
  "LIVE_STOP_IMMEDIATE_FRACTION", process.env.LIVE_STOP_IMMEDIATE_FRACTION, 0.25, 0, 5);
// 6. Absolute emergency stop (entry-relative, stop-INDEPENDENT backstop). The
//    five knobs above all compute the trigger RELATIVE to the position's stored
//    stopLoss price and live inside `if (p.stopLoss !== null)`. A position that
//    reaches the engine with NO synthetic stop (null), a stale/wrong stop, or a
//    breach that never registers as `rawBreach` therefore has NO fast exit and
//    can only be caught by the price-independent max-hold ceiling — riding to
//    -4%/-5% before closing (the MAX_HOLD losers in the prod audit). This knob is
//    a final safety net measured DIRECTLY from entry: once a LIVE position's raw
//    loss from entry reaches this %, it force-closes immediately, regardless of
//    whether a stop is set, bypassing grace + confirmation. It is purely additive
//    (only acts when no other exit fired) so it never changes the normal 2% stop,
//    TP, trailing, max-hold, sizing, or paper. Floored at 2.5% so it can never
//    undercut the configured 2% stop or the stabilization window's intent, capped
//    at 5% so it can never be set looser than the catastrophic tier. Default 3%.
export const LIVE_STOP_EMERGENCY_PCT = parseLiveStopKnob(
  "LIVE_STOP_EMERGENCY_PCT", process.env.LIVE_STOP_EMERGENCY_PCT, 3.0, 2.5, 5);
if (liveStopEnvWarnings.length > 0) {
  logger.warn(
    { tag: "LIVE_STOP_ENV_INVALID", warnings: liveStopEnvWarnings },
    "[LIVE_STOP_ENV_INVALID] one or more LIVE_STOP_* env knobs were invalid; safe defaults applied",
  );
}
// Cross-knob sanity: the immediate-fire band must sit INSIDE the catastrophic
// band (fraction < CATASTROPHIC_MULT - 1) or the immediate tier can never fire
// before the much-wider catastrophic tier — silently de-tuning the anti-
// blow-through fix back to the -5% regime it was added to eliminate. We only
// warn (never override an explicit operator value) so the misconfig is visible
// in boot logs.
if (LIVE_STOP_IMMEDIATE_FRACTION >= LIVE_STOP_CATASTROPHIC_MULT - 1) {
  logger.warn(
    {
      tag: "LIVE_STOP_IMMEDIATE_DETUNED",
      immediateFraction:  LIVE_STOP_IMMEDIATE_FRACTION,
      catastrophicMult:   LIVE_STOP_CATASTROPHIC_MULT,
      catastrophicBand:   LIVE_STOP_CATASTROPHIC_MULT - 1,
    },
    "[LIVE_STOP_IMMEDIATE_DETUNED] LIVE_STOP_IMMEDIATE_FRACTION >= catastrophic band; immediate-fire tier is effectively disabled (stops will only fast-exit at the catastrophic level). Lower LIVE_STOP_IMMEDIATE_FRACTION.",
  );
}

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

// Count persisted open global-engine positions for ONE symbol. Used by the
// per-symbol diversification cap (entry gate). Identical predicate to the global
// cap, narrowed to the symbol, so the count survives restarts and stays provably
// consistent with `countOpenTradePositions`.
async function countOpenTradePositionsForSymbol(symbol: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(tradesTable)
    .where(and(openGlobalPositionsPredicate(), eq(tradesTable.symbol, symbol)));
  return rows[0]?.value ?? 0;
}

type EntryDecisionOutcome = "ENTERED" | "SKIPPED";
type EntrySkipReason =
  | "Capacity Full"
  | "Liquidity Guard"
  | "Blocked Asset"
  | "Confidence Too Low"
  | "Risk Filter"
  | "Duplicate Exposure"
  | "Existing Position";

interface EntryDecisionDraft {
  ts: number;
  symbol: string;
  side: "BUY" | "SELL";
  confidence: number;
  compositeScore: number;
  outcome: EntryDecisionOutcome;
  skipReason: EntrySkipReason | null;
  rawReason: string | null;
  rejectionGate: string | null;
  reachedExecution: boolean;
  executionAttempted: boolean;
}

interface OpenPositionScore {
  symbol: string;
  positionId: string;
  score: number;
  confidence: number | null;
  source: "current_breakdown" | "entry_signal";
}

function classifyEntrySkipReason(
  rejectionGate: string | null,
  rejectionReason: string | null,
): EntrySkipReason {
  const gate = (rejectionGate ?? "").toLowerCase();
  const reason = (rejectionReason ?? "").toLowerCase();
  const haystack = `${gate} ${reason}`;

  if (
    haystack.includes("confidence") ||
    haystack.includes("below ") ||
    haystack.includes("floor")
  ) {
    return "Confidence Too Low";
  }
  if (
    haystack.includes("operator book full") ||
    haystack.includes("max active") ||
    haystack.includes("position_limit") ||
    haystack.includes("position limit") ||
    haystack.includes("plan_max_positions") ||
    haystack.includes("concurrent_live_cap") ||
    haystack.includes("trade_limit") ||
    haystack.includes("buying power") ||
    haystack.includes("insufficient") ||
    haystack.includes("balance") ||
    haystack.includes("cash") ||
    haystack.includes("capital") ||
    haystack.includes("allocation")
  ) {
    return "Capacity Full";
  }
  if (
    haystack.includes("per_symbol_cap") ||
    haystack.includes("per-symbol cap") ||
    haystack.includes("existing position") ||
    haystack.includes("already open")
  ) {
    return "Existing Position";
  }
  if (
    haystack.includes("duplicate") ||
    haystack.includes("correlation") ||
    haystack.includes("duplicate_asset")
  ) {
    return "Duplicate Exposure";
  }
  if (
    haystack.includes("blocklist") ||
    haystack.includes("blocked asset") ||
    haystack.includes("symbol_blocked") ||
    haystack.includes("strategy_v2_symbol_blocked") ||
    haystack.includes("unsupported_symbol") ||
    haystack.includes("unsupported symbol") ||
    haystack.includes("exchange eligibility")
  ) {
    return "Blocked Asset";
  }
  if (
    haystack.includes("liquidity") ||
    haystack.includes("volume") ||
    haystack.includes("spread") ||
    haystack.includes("sideways")
  ) {
    return "Liquidity Guard";
  }
  return "Risk Filter";
}

async function getLowestOpenPositionScore(): Promise<OpenPositionScore | null> {
  const openRows = await db
    .select({
      id:       tradesTable.id,
      symbol:   tradesTable.symbol,
      signalId: tradesTable.signalId,
    })
    .from(tradesTable)
    .where(openGlobalPositionsPredicate());

  if (openRows.length === 0) return null;

  const signalIds = Array.from(new Set(
    openRows
      .map((row) => row.signalId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));
  const signalScores = new Map<string, number>();
  if (signalIds.length > 0) {
    const signalRows = await db
      .select({ id: signalsTable.id, confidence: signalsTable.confidence })
      .from(signalsTable)
      .where(inArray(signalsTable.id, signalIds));
    for (const row of signalRows) {
      if (Number.isFinite(row.confidence)) signalScores.set(row.id, row.confidence);
    }
  }

  let lowest: OpenPositionScore | null = null;
  for (const row of openRows) {
    const current = engineStats.symbolBreakdowns[row.symbol];
    const currentScore = current && Number.isFinite(current.displayConfidence)
      ? current.displayConfidence
      : null;
    const entryScore = row.signalId ? signalScores.get(row.signalId) ?? null : null;
    const score = currentScore ?? entryScore;
    if (score === null || !Number.isFinite(score)) continue;
    const candidate: OpenPositionScore = {
      symbol:     row.symbol,
      positionId: row.id,
      score,
      confidence: current && Number.isFinite(current.avgConfidence)
        ? current.avgConfidence
        : entryScore,
      source: currentScore !== null ? "current_breakdown" : "entry_signal",
    };
    if (!lowest || candidate.score < lowest.score) lowest = candidate;
  }

  return lowest;
}

async function recordEntryDecisions(drafts: EntryDecisionDraft[]): Promise<void> {
  if (drafts.length === 0) return;

  try {
    const lowestOpen = drafts.some((d) => d.skipReason === "Capacity Full")
      ? await getLowestOpenPositionScore()
      : null;

    const ranked = drafts
      .map((draft, index) => ({ draft, index }))
      .sort((a, b) =>
        b.draft.compositeScore - a.draft.compositeScore ||
        b.draft.confidence - a.draft.confidence ||
        a.index - b.index,
      );
    const finalRanks = new Map<number, number>();
    ranked.forEach((item, index) => finalRanks.set(item.index, index + 1));

    const rows = drafts.map((draft, index) => {
      const finalRank = finalRanks.get(index) ?? index + 1;
      const missedOpportunity =
        draft.skipReason === "Capacity Full" &&
        lowestOpen !== null &&
        draft.compositeScore > lowestOpen.score;
      const message = missedOpportunity
        ? `[ENTRY_DECISION] MISSED_OPPORTUNITY ${draft.symbol} ${draft.side} rank=${finalRank} score=${draft.compositeScore.toFixed(1)} > open ${lowestOpen.symbol} score=${lowestOpen.score.toFixed(1)}`
        : `[ENTRY_DECISION] ${draft.outcome}${draft.skipReason ? ` (${draft.skipReason})` : ""} ${draft.symbol} ${draft.side} rank=${finalRank} score=${draft.compositeScore.toFixed(1)}`;

      return {
        id:      genId(),
        type:    "trade",
        level:   missedOpportunity ? "warn" : draft.outcome === "ENTERED" ? "success" : "info",
        message,
        details: {
          tag:             "ENTRY_DECISION",
          outcome:         draft.outcome,
          skipReason:      draft.skipReason,
          symbol:          draft.symbol,
          side:            draft.side,
          confidence:      draft.confidence,
          finalRank,
          compositeScore:  draft.compositeScore,
          timestamp:       draft.ts,
          rawReason:       draft.rawReason,
          rejectionGate:   draft.rejectionGate,
          reachedExecution: draft.reachedExecution,
          executionAttempted: draft.executionAttempted,
          missedOpportunity,
          candidateScore:  draft.compositeScore,
          lowestRankedOpenPosition: lowestOpen,
        },
      };
    });

    await db.insert(logsTable).values(rows);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[ENTRY_DECISION] failed to persist entry decision telemetry",
    );
  }
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
      exitPrice:  exitPrice,
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

// ── Manual operator override (AI-managed) ────────────────────────────────────
// A manual operator order placed via POST /api/exchange/order/execute fills a
// REAL position on the operator-env exchange but, unlike the AI path, registers
// nothing in any managed book. This records a managed `trades` row (mode
// "manual", `exchange` set, real fillPrice/fillQty captured) so the manual trade
// is governed by the same fixed SL/TP the AI applies — see
// `runManualOperatorLiveStops` for the real-exchange exit. Mode "manual" is kept
// OUT of `V2_TRADE_MODES`, so the row never collides with the paper global-book
// passes (`runGlobalHardStops` / `runGlobalCapSelfHeal`) or the
// `maxActivePositions` cap — manual + AI trades coexist on independent budgets.
export async function registerManualOperatorTrade(args: {
  symbol:           string;
  side:             "BUY" | "SELL";
  fillPrice:        number;
  fillQty:          number;
  sizeUSD:          number;
  exchange:         string;
  exchangeOrderId?: string;
}): Promise<{ positionId: string; stopLoss: number | null; takeProfit: number | null }> {
  const settings = await fetchSettings();
  const { symbol, side, fillPrice, fillQty, sizeUSD, exchange, exchangeOrderId } = args;
  const isBuy = side === "BUY";

  const slPct = settings.stopLossPercent;
  const tpPct = settings.takeProfitPercent;
  const stopLoss = slPct > 0
    ? (isBuy ? fillPrice * (1 - slPct / 100) : fillPrice * (1 + slPct / 100))
    : null;
  const takeProfit = tpPct > 0
    ? (isBuy ? fillPrice * (1 + tpPct / 100) : fillPrice * (1 - tpPct / 100))
    : null;

  const positionId = genId();
  await db.insert(tradesTable).values({
    id:              positionId,
    symbol,
    side,
    amount:          parseFloat(sizeUSD.toFixed(2)),
    price:           roundPrice(fillPrice),
    status:          "open",
    mode:            "manual",
    signalId:        null,
    stopLoss:        roundOptionalPrice(stopLoss),
    takeProfit:      roundOptionalPrice(takeProfit),
    reason:          "Manual operator override — AI-managed SL/TP",
    exchange,
    exchangeOrderId: exchangeOrderId ?? null,
    fillPrice:       roundPrice(fillPrice),
    fillQty:         parseFloat(fillQty.toFixed(8)),
  });

  logger.info({
    tag: "MANUAL_OVERRIDE_REGISTERED", symbol, side, exchange,
    positionId, fillPrice, fillQty, sizeUSD, stopLoss, takeProfit,
  }, `[MANUAL_OVERRIDE_REGISTERED] ${side} ${symbol} @ $${fillPrice.toFixed(2)} qty=${fillQty} — SL ${stopLoss?.toFixed(2) ?? "—"} / TP ${takeProfit?.toFixed(2) ?? "—"} (AI-managed)`);

  try {
    await db.insert(logsTable).values({
      id:      genId(),
      type:    "trade",
      level:   "success",
      message: `[MANUAL] ${side} ${symbol} @ $${fillPrice.toFixed(2)} — $${sizeUSD.toFixed(0)} — SL ${stopLoss?.toFixed(2) ?? "—"} / TP ${takeProfit?.toFixed(2) ?? "—"} — operator override (AI-managed)`,
      details: { symbol, side, fillPrice, fillQty, sizeUSD, stopLoss, takeProfit, exchange, mode: "manual" },
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "registerManualOperatorTrade: log insert failed");
  }

  return { positionId, stopLoss, takeProfit };
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

  // MTF_RELAX (2026-05-31): reduce the multi-timeframe confirmation
  // requirement by ~50% to lift the dominant post-confidence bottleneck
  // (183 of 395 post-confidence signals were dying here in production).
  //
  // Old logic stacked TWO requirements:
  //   1. fast (5m) directional AND slow (15m) non-contradicting, AND
  //   2. `trendAligned` — sign(fast.totalScore) === sign(slow.totalScore)
  //      with fast.totalScore !== 0.
  // The trend-sign clause (2) was the binding filter: it rejected setups
  // where one timeframe was clearly directional and the other was
  // neutral/HOLD but its near-zero score leaned the opposite way.
  //
  // New logic: confirm when EITHER timeframe is directional and the OTHER
  // does NOT contradict it (neutral/HOLD allowed). The strict trend-sign
  // alignment clause is dropped and the directional driver is now symmetric
  // (either 5m OR 15m may carry the direction). Opposite directional
  // decisions (5m BUY vs 15m SELL, or vice versa) STILL hard-block
  // confirmation — contradiction protection and the MTF gate itself are
  // fully preserved; only the full-agreement requirement is relaxed.
  const bothBuy  = (fast.decision === "BUY"  || slow.decision === "BUY")
                && fast.decision !== "SELL" && slow.decision !== "SELL";
  const bothSell = (fast.decision === "SELL" || slow.decision === "SELL")
                && fast.decision !== "BUY"  && slow.decision !== "BUY";

  const mtfConfirmed  = bothBuy || bothSell;
  const agreedAction: "BUY" | "SELL" | "HOLD" = bothBuy ? "BUY" : bothSell ? "SELL" : "HOLD";
  // CONVICTION_V2 (2026-05-26): replace symmetric arithmetic mean with a
  // stronger-TF-weighted blend. Plain `(fast+slow)/2` let a weak TF drag
  // a confirmed aligned signal under the gate (e.g. 5m=72, 15m=48 → 60,
  // which evaluates against BASELINE_MIN_CONFIDENCE = 60 as a boundary
  // miss). The 0.65/0.35 weighting preserves MTF confirmation as a hard
  // requirement (`mtfConfirmed` above still requires a directional,
  // non-contradicting `bothBuy || bothSell`) while letting the
  // dominant-conviction TF carry
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

  // ── Gate 1: max concurrent open positions (OPERATOR/GLOBAL book ONLY) ───────
  // CUSTOMER-EXECUTION INVARIANT: this cap bounds the OPERATOR's OWN global
  // `trades` book. It must NOT short-circuit the customer fan-out (live + paper),
  // which is independently protected by each customer's OWN gates (plan
  // max-positions, daily cap, liquidity, risk, duplicate, exchange + connection
  // validation, concurrent-live cap) inside placeLiveAutoOrderForUser /
  // placeUserOrder. When the global book is full we therefore set a flag and
  // SKIP ONLY the operator's own open further below — the fan-out still runs so
  // a saturated operator book can no longer starve real customer execution.
  let operatorBookFull = false;
  if (settings.maxActivePositions > 0) {
    // EXIT_ENGINE_V2: count PERSISTED open positions from the `trades` table so
    // the cap survives restarts (the in-memory array used to reset to empty on
    // every deploy, then refill — orphaning DB rows). Flag OFF keeps the legacy
    // in-memory count for byte-identical behavior.
    const openCount = isExitEngineV2()
      ? await countOpenTradePositions()
      : (await getAccountSummary()).positions.length;
    if (openCount >= settings.maxActivePositions) {
      operatorBookFull = true;
      const msg = `Operator/global book full for ${symbol} ${side}: max active positions (${settings.maxActivePositions}) reached — currently ${openCount} open. Skipping operator open; customer fan-out continues with per-user gates.`;
      logger.info({ tag: "OPERATOR_BOOK_FULL", symbol, side, openCount, maxActivePositions: settings.maxActivePositions }, msg);
      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "warn",
        message: msg,
        details: { symbol, side, openCount, maxActivePositions: settings.maxActivePositions, operatorOpenSkipped: true, customerFanoutContinues: true },
      });
    }
  }

  // ── Gate 1b: per-symbol concurrency cap (diversification) ──────────────────
  // ENTRY-ONLY. Blocks a NEW entry when the symbol already holds >= the per-symbol
  // ceiling of open global-engine positions, so one asset can't consume every
  // active-position slot. Existing open positions are GRANDFATHERED — this gate
  // runs only on the new-entry path and never closes/modifies/merges anything,
  // nor touches SL/TP, trailing, position-manager, or trade-history logic. Counts
  // the SAME persisted open-position set as Gate 1 (narrowed to this symbol) so it
  // survives restarts and stays consistent. When a symbol is capped the loop
  // simply skips it and keeps scanning other symbols for the next opportunity.
  // Default 1; tune via env MAX_POSITIONS_PER_SYMBOL (0 = unlimited).
  const maxPerSymbol = getMaxPositionsPerSymbol();
  if (maxPerSymbol > 0) {
    const openForSymbol = isExitEngineV2()
      ? await countOpenTradePositionsForSymbol(symbol)
      : (await getAccountSummary()).positions.filter((p) => p.symbol === symbol).length;
    if (openForSymbol >= maxPerSymbol) {
      engineStats.tradesBlocked++;
      const msg = `Auto-trade blocked for ${symbol} ${side}: per-symbol cap (${maxPerSymbol}) reached — currently ${openForSymbol} open for ${symbol}`;
      logger.info({ symbol, side, openForSymbol, maxPositionsPerSymbol: maxPerSymbol }, msg);
      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "warn",
        message: msg,
        details: { symbol, side, openForSymbol, maxPositionsPerSymbol: maxPerSymbol },
      });
      executionStreamBus.emitEvent({
        type: "max_positions_blocked", severity: "warn",
        symbol, side, gate: "max_positions_per_symbol", mode: exModeForStream,
        reason: `${openForSymbol}/${maxPerSymbol} open for ${symbol}`, message: msg,
      });
      return { executed: false, blockReason: `Per-symbol cap (${maxPerSymbol})` };
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
  // Count of per-user PAPER fills produced by the fan-out below — used (together
  // with customerLiveSuccesses) to resolve the execution outcome when the
  // operator's own open is skipped because the global book is full.
  let paperFanoutFills = 0;

  // ── Customer LIVE fan-out — DECOUPLED from operator/global live mode ────────
  // Customer live execution is governed SOLELY by CUSTOMER_LIVE_EXECUTION_ENABLED
  // + the per-customer runtime/safety gates inside executeCustomerOrder →
  // placeLiveAutoOrderForUser (kill switch, account status, AI-enabled, daily
  // trade limit, concurrent cap, risk engine, liquidity guard, disclaimer,
  // confidence floor, symbol-universe + exchange validation, position sizing,
  // SL/TP). It NO LONGER requires the global/operator engine to be in live mode
  // (isLiveExec) — so eligible customers receive REAL positions on every
  // successful AI execution, whether the global engine is paper or live. This
  // runs exactly once per autoExecute pass; the operator env-key path below
  // stays gated on isLiveExec. Customers handled here are recorded in
  // `customerFanoutUserIds` and excluded from the paper fan-out so no user can
  // get both a live AND a paper position on the same signal.
  const customerLiveSuccesses: LiveUserOrderResult[] = [];
  const customerFanoutUserIds = new Set<string>();
  {
    const { isCustomerLiveExecutionEnabled } = await import("./liveUserExecution.js");
    const customerLiveEnabled = isCustomerLiveExecutionEnabled();
    const liveUsers = customerLiveEnabled ? await listLiveExecutionUsers() : [];
    for (const u of liveUsers) customerFanoutUserIds.add(u.userId);

    logger.info(
      {
        tag:            "CUSTOMER_FANOUT_START",
        customerLiveEnabled,
        eligibleCount:  liveUsers.length,
        globalLiveMode: isLiveExec,
        symbol, side, signalId,
      },
      `[CUSTOMER_FANOUT_START] ${customerLiveEnabled ? `${liveUsers.length} live customers` : "disabled"} for ${symbol} ${side} (globalLiveMode=${isLiveExec})`,
    );

    if (customerLiveEnabled && liveUsers.length > 0) {
      // Phase 4 AI dedup — collapse duplicate rows within a tick so a
      // misconfigured `listLiveExecutionUsers()` can't double-fire an AI order
      // for the same destination on the same signal. Tick-scoped.
      // Task #216 — the dedup key includes the EXCHANGE so a parallel user's
      // Coinbase BTC and Kraken BTC are treated as distinct destinations and
      // both fan out; for single-exchange users this is identical to the old
      // (userId, symbol) key.
      const seen = new Set<string>();
      const deduped = liveUsers.filter((u) => {
        const key = `${u.userId}:${u.exchange}:${symbol}`;
        if (seen.has(key)) {
          logger.warn(
            { userId: u.userId, exchange: u.exchange, symbol, signalId },
            "[AI_TICK_DEDUP] dropped duplicate (userId,exchange,symbol) in tick fan-out",
          );
          return false;
        }
        seen.add(key);
        return true;
      });

      const userResults = await Promise.all(
        deduped.map((u) => {
          // Phase 4 (Task #209) — one correlationId per (user, symbol, tick)
          // so the AI fan-out funnel is grep-correlatable end-to-end.
          const correlationId = genCorrelationId();
          // Canonical normalization for AI: engine-native uppercased symbol,
          // and exchange = the user's connected adapter (resolved by
          // listLiveExecutionUsers) — the form the gateway/adapter receives.
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
            // Task #216 — route this fan-out leg to the SPECIFIC venue the
            // cohort lister resolved. Parallel users get one leg per exchange;
            // for single-exchange users this is just their one connection.
            targetExchange: u.exchange,
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
      );

      // Mirror each per-user fill into the user's sim registry (cache + DB) so
      // the position appears immediately in the customer's Portal / PWA —
      // sim_positions → Open Positions / Live Trades / equity / buying power,
      // and sim_trades / Trade History on close.
      const userSuccesses = userResults.filter((r) => r.success);
      for (const r of userSuccesses) {
        const corrId = (r as LiveUserOrderResult & { correlationId?: string }).correlationId;
        let persistenceResult: "persisted" | "failed" = "persisted";
        let mirroredPositionId: string | null = null;
        try {
          const userEntry = r.fillPrice ?? price;
          // BUG #1 fix: persist the RESOLVED per-user/per-exchange notional the
          // broker actually filled (gate 0SIZE output on the result), not the
          // engine-global allocation `sizeUSD`. Falls back to the global only
          // when the result omitted it (legacy/dry-run paths).
          const resolvedSizeUSD = r.sizeUSD ?? sizeUSD;
          const userQty   = r.quantity  ?? resolvedSizeUSD / userEntry;
          // Per-account / per-exchange exit config (Task #220). Resolves the
          // customer's own SL/TP for THIS exchange, falling back to their
          // account default → 2/4. Replaces the prior global `settings.*` band
          // so each customer's live fills honour their configured risk.
          const exitCfg   = await resolveExitConfig(r.userId, r.exchange ?? null);
          const userSL    = side === "BUY" ? userEntry * (1 - exitCfg.stopLossPercent   / 100) : userEntry * (1 + exitCfg.stopLossPercent   / 100);
          const userTP    = side === "BUY" ? userEntry * (1 + exitCfg.takeProfitPercent / 100) : userEntry * (1 - exitCfg.takeProfitPercent / 100);
          const orderId = r.exchangeOrderId ?? `LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const userPos = await registerLiveUserFill({
            userId:          r.userId,
            symbol,
            side,
            quantity:        userQty,
            entryPrice:      userEntry,
            sizeUSD:         resolvedSizeUSD,
            signalId,
            confidence,
            stopLoss:        roundPrice(userSL),
            takeProfit:      roundPrice(userTP),
            exchange:        r.exchange ?? "unknown",
            exchangeOrderId: orderId,
            entryFeeBroker:         r.brokerFee,
            entryFeeBrokerCurrency: r.brokerFeeCurrency,
          });
          mirroredPositionId = userPos?.id ?? orderId;
          logger.info(
            {
              tag:            "CUSTOMER_POSITION_CREATED",
              userId:         r.userId,
              exchange:       r.exchange ?? null,
              symbol, side, sizeUSD,
              entryPrice:     userEntry,
              quantity:       userQty,
              positionId:     mirroredPositionId,
              stopLoss:       roundPrice(userSL),
              takeProfit:     roundPrice(userTP),
              // Resolved exit settings actually applied to this live entry
              // (req: logs surface the resolved exit config on new live opens).
              exitConfig: {
                stopLossPercent:     exitCfg.stopLossPercent,
                takeProfitPercent:   exitCfg.takeProfitPercent,
                trailingStopPercent: exitCfg.trailingStopPercent,
                maxHoldHours:        exitCfg.maxHoldHours,
              },
              signalId,
              globalLiveMode: isLiveExec,
              store:          "sim_positions",
            },
            `[CUSTOMER_POSITION_CREATED] ${r.userId} ${symbol} ${side} @ ${userEntry} on ${r.exchange ?? "unknown"} (pos=${mirroredPositionId}) exits TP${exitCfg.takeProfitPercent}%/SL${exitCfg.stopLossPercent}%/trail${exitCfg.trailingStopPercent ?? "mirror"}/hold${exitCfg.maxHoldHours}h`,
          );
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
        // Phase 4 (Task #209) — POSITION_PERSISTED canonical row stamped with
        // the gateway-returned correlationId so the AI funnel grep chain stays
        // linked through persistence. Also remember positionId→correlationId so
        // the eventual close emit (trailing / SL / TP / manual) preserves it.
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

      // Explicit per-customer rejection logging (with reason) for every user
      // whose order did NOT fill, so on-call can see exactly why a customer was
      // skipped on an otherwise-successful AI execution.
      for (const r of userResults) {
        if (r.success) continue;
        logger.info(
          {
            tag:       "CUSTOMER_POSITION_REJECTED",
            userId:    r.userId,
            exchange:  r.exchange ?? null,
            errorCode: r.errorCode ?? "unknown",
            reason:    r.error ?? "unknown",
            symbol, side, sizeUSD, signalId,
          },
          `[CUSTOMER_POSITION_REJECTED] ${r.userId} ${symbol} ${side}: ${r.errorCode ?? r.error ?? "unknown"}`,
        );
      }

      customerLiveSuccesses.push(...userSuccesses);

      logger.info(
        {
          tag:        "CUSTOMER_FANOUT_COMPLETE",
          totalUsers: userResults.length,
          succeeded:  userSuccesses.length,
          failed:     userResults.length - userSuccesses.length,
          symbol, side, signalId,
          dryRun:     isDryRunEnabled(),
        },
        `[CUSTOMER_FANOUT_COMPLETE] ${symbol} ${side}: ${userSuccesses.length}/${userResults.length} customer positions created`,
      );
    }
  }

  if (isLiveExec && !operatorBookFull) {
    // ── Operator env-key path (admintrade.aicandlez.com) — GLOBAL live mode ──
    // Anchors the operator-level audit trail + risk view. The customer fan-out
    // already ran above (decoupled). If NEITHER the operator path NOR any
    // customer fan-out produced a fill, the global tick is a hard rejection
    // (matches the original single-path semantics).
    const operatorResult = await placeLiveAutoOrder({ symbol, side, sizeUSD }).catch((err): Awaited<ReturnType<typeof placeLiveAutoOrder>> => ({
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    }));

    if (!operatorResult.success && customerLiveSuccesses.length === 0) {
      const reason = operatorResult.error ?? (customerFanoutUserIds.size > 0
        ? `All ${customerFanoutUserIds.size} customer fan-outs failed`
        : "Live mode active but no execution target available");
      engineStats.tradesBlocked++;
      logger.warn({ symbol, side, error: reason, liveUsers: customerFanoutUserIds.size }, "Live auto-trade rejected by exchange bridge");
      await db.insert(logsTable).values({
        id: genId(), type: "trade", level: "critical",
        message: `Live auto-trade failed for ${symbol} ${side}: ${reason}`,
        details: { symbol, side, error: reason, mode: "live", liveUsers: customerFanoutUserIds.size },
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
      const first = customerLiveSuccesses[0]!;
      pos = { id: first.exchangeOrderId ?? genId(), entryPrice: first.fillPrice ?? price };
      liveExchange        = first.exchange;
      liveExchangeOrderId = first.exchangeOrderId;
    }
  } else if (isLiveExec && operatorBookFull) {
    // ── Operator/global book full (LIVE mode) ──────────────────────────────
    // Skip the operator's OWN live open. The decoupled customer LIVE fan-out
    // already ran above with each customer's per-user gates; anchor `pos` to a
    // customer fill if one landed so the operator-skip finalizer can resolve.
    // The operator's own global `trades` row is NOT written (would exceed cap).
    if (customerLiveSuccesses.length > 0) {
      const first = customerLiveSuccesses[0]!;
      pos = { id: first.exchangeOrderId ?? genId(), entryPrice: first.fillPrice ?? price };
      liveExchange        = first.exchange;
      liveExchangeOrderId = first.exchangeOrderId;
    } else {
      pos = { id: `GLOBALFULL-${genId()}`, entryPrice: price };
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
    // Global book full → skip the operator's OWN global sim open (would push the
    // operator book past its cap); the per-user paper fan-out below still runs.
    const result = operatorBookFull ? null : await placeOrder({ symbol, side, sizeUSD });
    if (result && !result.success) {
      // Observability note (not a money-correctness issue): the decoupled
      // customer LIVE fan-out above may already have persisted real fills to
      // sim_positions this tick. Those positions are self-managed by the
      // per-user SL/TP exit monitor and are INDEPENDENT of the global book, so
      // a global-sim rejection does NOT strand them. We deliberately do NOT
      // fabricate a global `trades` row anchored to a customer fill here — the
      // global simulationEngine has no position, and a synthetic global row
      // would confuse the global exit monitor / maxActivePositions cap. This
      // tick is rejected for the GLOBAL book only; the customer fills stand.
      if (customerLiveSuccesses.length > 0) {
        logger.warn(
          {
            tag:           "CUSTOMER_FANOUT_SALVAGE",
            symbol, side,
            error:         result.error,
            customerFills: customerLiveSuccesses.length,
          },
          `[CUSTOMER_FANOUT_SALVAGE] global sim placeOrder failed for ${symbol} ${side} but ${customerLiveSuccesses.length} customer LIVE fill(s) already persisted to sim_positions (self-managed, independent of the global book) — global tick rejected, customer positions stand`,
        );
      }
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
    if (operatorBookFull) {
      // Anchor pos to the SIGNAL price so the per-user paper fan-out below can
      // compute SL/TP and open INDEPENDENT per-user positions (sim_positions),
      // which are bound by per-user caps, NOT the operator/global cap.
      pos = { id: `GLOBALFULL-${genId()}`, entryPrice: price };
      logger.info(
        { tag: "OPERATOR_OPEN_SKIPPED", reason: "global_book_full", symbol, side, maxActivePositions: settings.maxActivePositions },
        "[OPERATOR_OPEN_SKIPPED] operator global book full — skipping operator paper open; running per-user paper fan-out",
      );
    } else {
      pos = result!.position!;
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
    }

    // ── Per-user paper fan-out — canonical convergence write ────────────
    //
    // Selection: user_settings.autoMode=true AND tradingMode!='live'.
    // `placeUserOrder` applies its own per-user gates (status guard,
    // balance check), so any rejection surfaces as [AI_FANOUT_SKIPPED]
    // with a structured reason instead of failing the whole tick.
    try {
      const fanoutCorrelationId = genCorrelationId();
      const eligibleUsersRaw    = await listPaperAutoTradeUsers();
      // Duplicate-prevention: a user already handled by the decoupled customer
      // LIVE fan-out this tick must NOT also receive a paper position. The two
      // selectors key off DIFFERENT tradingMode columns
      // (user_exchange_connections vs user_settings) and can overlap, so guard
      // explicitly here rather than relying on disjointness.
      const eligibleUsers = eligibleUsersRaw.filter((u) => {
        if (customerFanoutUserIds.has(u.userId)) {
          logger.info(
            {
              tag:           "AI_FANOUT_SKIPPED",
              correlationId: fanoutCorrelationId,
              userId:        u.userId,
              runtimeMode:   "paper",
              symbol, side, signalId,
              reason:        "handled_by_live_fanout",
            },
            "[AI_FANOUT_SKIPPED] paper fan-out skipped — user already handled by live fan-out this tick",
          );
          return false;
        }
        return true;
      });

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
              ? roundPrice(pos.entryPrice * (1 - u.stopLossPercent   / 100))
              : roundPrice(pos.entryPrice * (1 + u.stopLossPercent   / 100)),
            takeProfit: side === "BUY"
              ? roundPrice(pos.entryPrice * (1 + u.takeProfitPercent / 100))
              : roundPrice(pos.entryPrice * (1 - u.takeProfitPercent / 100)),
          });
          if (userResult.success) {
            paperFanoutFills++;
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

  // ── Operator open skipped (global book full) — finalize via fan-out only ────
  // The operator's OWN global open was intentionally skipped because the global
  // `trades` book is at its cap. The customer LIVE + paper fan-outs (independent
  // per-user books) already ran above with their own per-user gates. We MUST NOT
  // insert a global `trades` row here (it would push the operator book past its
  // cap and confuse the global exit monitor / maxActivePositions count). Report
  // execution based on whether any per-user fill landed this tick.
  if (operatorBookFull) {
    const perUserFills = customerLiveSuccesses.length + paperFanoutFills;
    logger.info(
      {
        tag:                "OPERATOR_BOOK_FULL_FANOUT",
        symbol, side, signalId,
        customerFills:      customerLiveSuccesses.length,
        paperFills:         paperFanoutFills,
        maxActivePositions: settings.maxActivePositions,
      },
      `[OPERATOR_BOOK_FULL_FANOUT] ${symbol} ${side}: operator open skipped (global book ${settings.maxActivePositions} full) — ${perUserFills} per-user fill(s) (live=${customerLiveSuccesses.length}, paper=${paperFanoutFills})`,
    );
    return perUserFills > 0
      ? { executed: true,  blockReason: null }
      : { executed: false, blockReason: `Operator book full (${settings.maxActivePositions}); no per-user fill` };
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
    stopLoss:   roundPrice(stopLoss),
    takeProfit: roundPrice(takeProfit),
    reason:     shortSummary,
  });

  positionMeta.set(pos.id, { signalId, reasoning, shortSummary, indicators: { rsi: 0, macd: 0, ema20: 0, ema50: 0 }, side, sizeUSD });

  engineStats.tradesExecuted++;
  engineStats.funnelExecuted++;
  // Issue #2: this is the GLOBAL operator/sim book opening a position — a
  // simulated open, NOT a customer broker order. Tracked under its own metric
  // so the dashboard never conflates it with real customer broker fills.
  recordOperatorSimExecution();
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
    stopLoss:    roundPrice(stopLoss),
    takeProfit:  roundPrice(takeProfit),
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

  // Broadcast trade execution in real time to connected WebSocket clients.
  // Issue #2: this is the GLOBAL operator/sim book open. Tag it source="operator"
  // + simulated=true so clients label it "OPERATOR BOOK EXECUTION" and customer
  // portals suppress it — "TRADE EXECUTED" is reserved for real customer fills.
  broadcastTrade({
    symbol,
    side,
    price:     pos.entryPrice,
    sizeUSD:   sizeUSD,
    source:    "operator",
    simulated: true,
    mode:      tradeMode,
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

    const correlationId      = genCorrelationId();
    // Per-account / per-exchange exit config (Task #220), batch-loaded for every
    // open position in two queries. Resolves trailing distance + max-hold ceiling
    // per (userId, exchange); env operator overrides still win globally.
    const resolveExit        = await buildExitConfigResolver(
      positions.map((p) => ({ userId: p.userId, exchange: p.exchange })),
    );
    const nowMs              = Date.now();

    // Let-winners-run momentum freshness window (Profit-Optimization #3). A
    // per-symbol breakdown older than this is treated as "no momentum signal",
    // so we fail safe to the hard take-profit rather than extend on stale data.
    const LET_RUN_MOMENTUM_FRESH_MS = 5 * 60_000;

    // Prune water marks for positions no longer open (prevents unbounded growth).
    const openPositionIds = new Set(positions.map((p) => p.positionId));
    for (const id of liveTrailWaterMarks.keys()) {
      if (!openPositionIds.has(id)) liveTrailWaterMarks.delete(id);
    }
    for (const id of liveStopBreachStreak.keys()) {
      if (!openPositionIds.has(id)) liveStopBreachStreak.delete(id);
    }
    for (const id of failedLiveCloseStreak.keys()) {
      if (!openPositionIds.has(id)) failedLiveCloseStreak.delete(id);
    }
    // Phase 0: prune MFE/MAE marks for positions no longer open (same pattern).
    pruneExcursions(openPositionIds);

    await Promise.all(positions.map(async (p) => {
      const isBuy  = p.side === "BUY";
      const isLive = !!p.exchange;

      // ── Dust-phantom orphan guard (retire locally, no broker round-trip) ─────
      // A LIVE row with quantity at the absolute floor (≤1e-8) AND sizeUSD 0 is a
      // phantom: it never represented a real broker fill (real opens require a
      // min-notional sizeUSD ≫ 0), so the underlying asset cannot exist at the
      // exchange. The normal exit path keeps firing a broker close the venue
      // rejects as sub-min-notional dust, and the balance-verified zombie
      // reconciler can never retire it because its balance probe fail-CLOSES
      // under exchange rate-limiting (429) — so the row sits open forever,
      // occupying a concurrency slot. Retire it in-process (delete DB + splice
      // memory atomically via reconcileZombiePosition) with NO broker probe.
      // Gate is doubly strict (qty≤1e-8 AND sizeUSD≤0) so no real position can
      // ever match: opens always carry sizeUSD>0. Runs every tick, independent
      // of max-hold, so phantoms are cleared the moment they're observed.
      if (isLive && p.quantity <= 1e-8 && (p.sizeUSD ?? 0) <= 0) {
        const recon = await reconcileZombiePosition({
          userId:           p.userId,
          positionId:       p.positionId,
          brokerError:      "phantom dust position (quantity ≤ 1e-8, sizeUSD = 0) — never a real broker fill",
          actualBalance:    0,
          recordedQuantity: p.quantity,
          closeReason:        "RECONCILED_DUST_PHANTOM",
          reconciliationTag:  "RECONCILED_DUST_PHANTOM",
          notificationTitle:  `Closed phantom ${p.symbol} position`,
          notificationMessage:
            `A phantom ${p.symbol} position on ${p.exchange ?? "your exchange"} was retired automatically. ` +
            `It carried no tradable size (dust quantity, $0 notional) and had no matching exchange balance, so no order was placed and your balance is unaffected.`,
        });
        if (recon.reconciled) {
          failedLiveCloseStreak.delete(p.positionId);
          logger.warn(
            {
              tag:        "ZOMBIE_RECONCILE_DUST_PHANTOM",
              userId:     p.userId,
              positionId: p.positionId,
              symbol:     p.symbol,
              exchange:   p.exchange,
              quantity:   p.quantity,
              sizeUSD:    p.sizeUSD,
            },
            "[ZOMBIE_RECONCILE_DUST_PHANTOM] retired phantom dust position locally (qty≤1e-8 & sizeUSD=0 — no real broker fill)",
          );
        }
        return;
      }

      const price  = priceBySym.get(p.symbol);
      const exitCfg = resolveExit(p.userId, p.exchange);

      // ── MFE/MAE telemetry (Phase 0 — measurement only, NO exit behaviour) ────
      // Fold this tick's unrealized P&L (gross of fees) into the position's
      // running peak-favorable / worst-adverse marks BEFORE any exit decision, so
      // even a same-tick close still records an excursion sample. Skipped on a
      // missing/stale price (the exit logic below is likewise price-gated).
      if (price !== undefined) {
        const unrealizedUsd = isBuy
          ? (price - p.entryPrice) * p.quantity
          : (p.entryPrice - price) * p.quantity;
        const unrealizedPct = p.entryPrice > 0
          ? (isBuy
              ? (price - p.entryPrice) / p.entryPrice
              : (p.entryPrice - price) / p.entryPrice) * 100
          : 0;
        updateExcursion(p.positionId, unrealizedUsd, unrealizedPct, nowMs);
      }

      // Age is computed price-independently so the max-hold ceiling can fire even
      // when the market-data feed is down. A hard time ceiling that depended on a
      // ticker being available wouldn't be a hard ceiling.
      const ageMs    = isLive && p.entryTime !== null && Number.isFinite(p.entryTime)
        ? nowMs - p.entryTime
        : null;
      const ageHours = ageMs !== null ? ageMs / 3_600_000 : null;

      // ── Exit decision (priority: SL → TP → trailing → max-hold) ──────────────
      let reason: "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP" | "MAX_HOLD" | null = null;
      // Which LIVE stop-loss tier fired (for trigger-vs-execution diagnostics).
      let slTier: "IMMEDIATE" | "CATASTROPHIC" | "CONFIRMED" | "EMERGENCY" | null = null;
      let trailPct:   number | null = null;
      let trailStop:  number | null = null;
      let trailArmed = false;
      let highWater:  number | null = null;
      let lowWater:   number | null = null;
      // True when an aggressive (opt-in) live winner is held past its TP because
      // momentum is still strong. Observability only — surfaced in the eval log.
      let letRunExtended = false;

      // Price-dependent exits (SL → TP → live trailing). Skipped on a missing /
      // stale price — never close on a zero/absent price; the next tick retries.
      if (price !== undefined) {
        if (p.stopLoss !== null) {
          const rawBreach = isBuy ? price <= p.stopLoss : price >= p.stopLoss;
          if (!isLive) {
            // Paper: unchanged — no spread/slippage to filter.
            if (rawBreach) reason = "STOP_LOSS";
          } else if (rawBreach) {
            // LIVE stop-loss stabilization (Production Optimization P1). The SL
            // LEVEL stays 2% — only the TRIGGER is filtered for spread/first-tick
            // noise. A catastrophic move bypasses grace + confirmation.
            const slDist = Math.abs(p.entryPrice - p.stopLoss);
            const buffer = p.entryPrice * (LIVE_STOP_SPREAD_BUFFER_PCT / 100);
            const bufferedBreach = isBuy
              ? price <= p.stopLoss - buffer
              : price >= p.stopLoss + buffer;
            // Decisive breach beyond a small fraction of the stop distance: a
            // genuine, fast adverse move. Fires NOW — bypassing grace + the
            // multi-tick confirmation — so it can't ride those windows down to
            // the (much wider) catastrophic level. Primary anti-blow-through
            // guard; the confirmation path below still owns marginal breaches.
            const immediateBreach = slDist > 0 && (isBuy
              ? price <= p.stopLoss - slDist * LIVE_STOP_IMMEDIATE_FRACTION
              : price >= p.stopLoss + slDist * LIVE_STOP_IMMEDIATE_FRACTION);
            const catastrophic = slDist > 0 && (isBuy
              ? price <= p.stopLoss - slDist * (LIVE_STOP_CATASTROPHIC_MULT - 1)
              : price >= p.stopLoss + slDist * (LIVE_STOP_CATASTROPHIC_MULT - 1));
            const withinGrace = ageMs !== null && ageMs < LIVE_STOP_STABILIZATION_MS;
            if (catastrophic) {
              // Real-crash protection — fire now regardless of grace/confirmation.
              reason = "STOP_LOSS";
              slTier = "CATASTROPHIC";
              liveStopBreachStreak.delete(p.positionId);
            } else if (immediateBreach) {
              // Decisive breach past the immediate band — fire now, bypassing
              // grace + confirmation so the loss can't run to catastrophic.
              reason = "STOP_LOSS";
              slTier = "IMMEDIATE";
              liveStopBreachStreak.delete(p.positionId);
            } else if (withinGrace) {
              // Stabilization window — suppress the normal stop; reset the streak.
              liveStopBreachStreak.delete(p.positionId);
            } else if (bufferedBreach) {
              // Genuine breach beyond the spread buffer — require N consecutive.
              const streak = (liveStopBreachStreak.get(p.positionId) ?? 0) + 1;
              liveStopBreachStreak.set(p.positionId, streak);
              if (streak >= LIVE_STOP_CONFIRM_TICKS) {
                reason = "STOP_LOSS";
                slTier = "CONFIRMED";
              }
            } else {
              // Breach within the spread buffer = noise — reset the streak.
              liveStopBreachStreak.delete(p.positionId);
            }
          } else {
            // No breach this tick — reset the confirmation streak.
            liveStopBreachStreak.delete(p.positionId);
          }
        }
        // ── Absolute emergency stop (LIVE backstop, stop-INDEPENDENT) ───────────
        // Final capital-protection net measured DIRECTLY from entry, NOT from the
        // stored stopLoss price. The relative SL tiers above all live inside
        // `if (p.stopLoss !== null)`, so a position that arrives with a null /
        // stale stop, or whose breach never registers, has no fast exit and only
        // the price-independent max-hold ceiling catches it — letting the loss run
        // to -4%/-5% (the MAX_HOLD losers in the prod stop-loss audit). This fires
        // the moment raw loss from entry reaches LIVE_STOP_EMERGENCY_PCT (default
        // 3%, floored at 2.5% so it can never undercut the normal 2% stop or the
        // stabilization window). Purely additive: gated on `reason === null`, so it
        // only acts when no normal exit fired — the 2% stop still owns ordinary
        // exits, and TP / trailing / max-hold / sizing / paper are untouched.
        if (reason === null && isLive && p.entryPrice > 0) {
          const lossPct = isBuy
            ? ((p.entryPrice - price) / p.entryPrice) * 100
            : ((price - p.entryPrice) / p.entryPrice) * 100;
          if (lossPct >= LIVE_STOP_EMERGENCY_PCT) {
            reason = "STOP_LOSS";
            slTier = "EMERGENCY";
            liveStopBreachStreak.delete(p.positionId);
          }
        }
        if (reason === null && p.takeProfit !== null) {
          const tpHit = isBuy ? price >= p.takeProfit : price <= p.takeProfit;
          if (tpHit) {
            // ── Let-winners-run (Profit-Optimization #3 — LIVE + opt-in only) ──
            // Aggressive accounts hold past TP while upside momentum is still
            // strong, letting the trailing-stop / trend-weakening / max-hold
            // exits capture more of the move. The default (and ANY stale or
            // missing momentum read) keeps today's hard take-profit cut. The
            // 2% stop-loss above is untouched and still owns the downside.
            if (isLive && exitCfg.letWinnersRun) {
              const bd = engineStats.symbolBreakdowns[p.symbol];
              const momentumFresh =
                bd !== undefined && (nowMs - bd.lastUpdated) < LET_RUN_MOMENTUM_FRESH_MS;
              const momentumStrong =
                momentumFresh &&
                bd.marketCondition === "trending" &&
                (isBuy
                  ? bd.agreedAction === "BUY"  && bd.trend1H !== "bearish"
                  : bd.agreedAction === "SELL" && bd.trend1H !== "bullish");
              if (momentumStrong) {
                // Hold — extend the winner. Trailing (armed above entry) and the
                // max-hold ceiling below still bound the downside.
                letRunExtended = true;
              } else {
                // Momentum gone / unknown — take profit now. Trend-weakening
                // exits route here and are stamped TAKE_PROFIT for reporting.
                reason = "TAKE_PROFIT";
              }
            } else {
              reason = "TAKE_PROFIT";
            }
          }
        }

        // Trailing stop is LIVE-only here. Paper trailing is owned by
        // `runTrailingStops`; the global book by `runGlobalCapSelfHeal`.
        if (isLive) {
          // Derive trailing distance (Task #220): the resolved config already
          // folds env override → per-exchange → account. A concrete value sets
          // an explicit distance; `null` means "mirror the position's own
          // stop-loss band" (the locked default) so it honours configured risk.
          if (exitCfg.trailingStopPercent !== null) {
            trailPct = exitCfg.trailingStopPercent;
          } else if (p.stopLoss !== null && p.entryPrice > 0) {
            trailPct = (Math.abs(p.entryPrice - p.stopLoss) / p.entryPrice) * 100;
          }

          if (trailPct !== null && trailPct > 0) {
            const wm = liveTrailWaterMarks.get(p.positionId) ?? { high: p.entryPrice, low: p.entryPrice };
            if (price > wm.high) wm.high = price;
            if (price < wm.low)  wm.low  = price;
            liveTrailWaterMarks.set(p.positionId, wm);
            highWater = wm.high;
            lowWater  = wm.low;

            if (isBuy) {
              trailStop  = wm.high * (1 - trailPct / 100);
              // Armed only once the trail sits above entry, so it targets locking
              // in profit while the fixed stop-loss owns the downside. This is the
              // intended trigger price — the actual broker market-close fill can
              // still land slightly below entry on a gap/slippage between this
              // trigger tick and the fill.
              trailArmed = trailStop > p.entryPrice;
              if (reason === null && trailArmed && price <= trailStop) reason = "TRAILING_STOP";
            } else {
              trailStop  = wm.low * (1 + trailPct / 100);
              trailArmed = trailStop < p.entryPrice;
              if (reason === null && trailArmed && price >= trailStop) reason = "TRAILING_STOP";
            }
          }
        }
      }

      // Price-independent exit: hard max-hold ceiling (LIVE-only). Evaluated even
      // when price is unavailable so a stuck position can always be force-closed;
      // `closeUserPosition` fetches its own authoritative broker fill price.
      if (reason === null && isLive && exitCfg.maxHoldMs > 0 && ageMs !== null && ageMs >= exitCfg.maxHoldMs) {
        reason = "MAX_HOLD";
      }

      if (isLive) {
        const currentProfitPct =
          price !== undefined && p.entryPrice > 0
            ? (isBuy
                ? (price - p.entryPrice) / p.entryPrice
                : (p.entryPrice - price) / p.entryPrice) * 100
            : null;
        const peakProfitPct =
          p.entryPrice > 0 && highWater !== null && lowWater !== null
            ? (isBuy
                ? (highWater - p.entryPrice) / p.entryPrice
                : (p.entryPrice - lowWater) / p.entryPrice) * 100
            : currentProfitPct;
        logger.info(
          {
            tag:                "TRAIL_DEBUG",
            correlationId,
            userId:             p.userId,
            positionId:         p.positionId,
            symbol:             p.symbol,
            side:               p.side,
            exchange:           p.exchange,
            entry_price:        p.entryPrice,
            current_price:      price ?? null,
            current_profit_pct: currentProfitPct !== null ? parseFloat(currentProfitPct.toFixed(4)) : null,
            peak_profit_pct:    peakProfitPct !== null ? parseFloat(peakProfitPct.toFixed(4)) : null,
            trail_distance_pct: trailPct !== null ? parseFloat(trailPct.toFixed(4)) : null,
            trailing_active:    trailArmed,
            should_exit:        reason === "TRAILING_STOP",
            exit_trigger:       trailStop !== null ? parseFloat(trailStop.toFixed(8)) : null,
          },
          `[TRAIL DEBUG] ${p.symbol} current=${currentProfitPct !== null ? currentProfitPct.toFixed(2) : "n/a"}% peak=${peakProfitPct !== null ? peakProfitPct.toFixed(2) : "n/a"}% active=${trailArmed ? "YES" : "NO"} trigger=${trailStop ?? "n/a"} exit=${reason === "TRAILING_STOP" ? "YES" : "NO"}`,
        );
      }

      // Per-position eval row — proves the live exit loop evaluated this position
      // this tick (last-eval timestamp = `evaluatedAt`) and records its full SL /
      // TP / trailing state. Emitted even when price is unavailable so liveness
      // stays observable.
      if (isLive) {
        logger.info(
          {
            tag:         "LIVE_POSITION_EVAL",
            correlationId,
            evaluatedAt: nowMs,
            userId:      p.userId,
            positionId:  p.positionId,
            symbol:      p.symbol,
            side:        p.side,
            exchange:    p.exchange,
            price:       price ?? null,
            entryPrice:  p.entryPrice,
            stopLoss:    p.stopLoss,
            takeProfit:  p.takeProfit,
            trailPct:    trailPct !== null ? parseFloat(trailPct.toFixed(4)) : null,
            trailStop:   trailStop !== null ? parseFloat(trailStop.toFixed(6)) : null,
            trailArmed,
            highWater,
            lowWater,
            ageHours:    ageHours !== null ? parseFloat(ageHours.toFixed(2)) : null,
            letRun:      letRunExtended,
            decision:    reason ?? (letRunExtended ? "HOLD_LET_RUN" : price === undefined ? "HOLD_NO_PRICE" : "HOLD"),
          },
          `[LIVE_POSITION_EVAL] ${p.symbol} ${p.side} @ ${price ?? "n/a"} (entry ${p.entryPrice}, SL ${p.stopLoss}, TP ${p.takeProfit}) → ${reason ?? "HOLD"}`,
        );
      }

      if (reason === null) return;

      const runtimeMode = isLive ? "LIVE" : "PAPER";
      // Display price for logging/stream only. The authoritative exit price is
      // resolved inside `closeUserPosition` (broker fill for live); on the
      // price-independent max-hold path `price` may be undefined, so fall back to
      // entry for presentation.
      const displayPrice = price ?? p.entryPrice;
      try {
        const closeResult = await closeUserPosition(p.userId, p.positionId, reason);
        if (closeResult.success) {
          if (reason === "TRAILING_STOP") engineStats.trailingStopHits++;
          else                            engineStats.hardStopHits++;
          if (p.exchange) liveTrailWaterMarks.delete(p.positionId);
          failedLiveCloseStreak.delete(p.positionId);
          const pnlPct = closeResult.trade?.realizedPnLPct;
          // Trigger-vs-execution diagnostics. `triggerPrice` is the price the
          // monitor observed when it decided to exit; `executionPrice` is the
          // authoritative broker fill (live) returned by closeUserPosition.
          // `slippageVsStopPct` = how far the fill landed PAST the intended stop
          // (signed by side; +ve = worse than the stop). `excursionVsEntryPct` =
          // total adverse move entry→fill. Together these quantify any
          // stop-loss blow-through beyond the configured 2% level.
          const executionPrice = closeResult.trade?.exitPrice ?? null;
          const slippageVsStopPct =
            reason === "STOP_LOSS" && executionPrice !== null &&
            p.stopLoss !== null && p.stopLoss > 0
              ? parseFloat(
                  (((isBuy ? p.stopLoss - executionPrice : executionPrice - p.stopLoss) /
                    p.stopLoss) * 100).toFixed(4),
                )
              : null;
          const excursionVsEntryPct =
            executionPrice !== null && p.entryPrice > 0
              ? parseFloat(
                  (((isBuy ? executionPrice - p.entryPrice : p.entryPrice - executionPrice) /
                    p.entryPrice) * 100).toFixed(4),
                )
              : null;
          logger.info(
            {
              tag:           "HARD_STOP_TRIGGERED",
              correlationId,
              userId:        p.userId,
              positionId:    p.positionId,
              symbol:        p.symbol,
              side:          p.side,
              reason,
              slTier,
              entryPrice:    p.entryPrice,
              triggerPrice:  price ?? null,
              executionPrice,
              stopLoss:      p.stopLoss,
              takeProfit:    p.takeProfit,
              trailStop,
              slippageVsStopPct,
              excursionVsEntryPct,
              ageHours:      ageHours !== null ? parseFloat(ageHours.toFixed(2)) : null,
              mode:          runtimeMode,
              realizedPnLPct: pnlPct,
            },
            `[HARD_STOP_TRIGGERED] ${reason}${slTier ? `/${slTier}` : ""} ${runtimeMode} ${p.symbol} ${p.side} trigger=${price ?? "n/a"} exec=${executionPrice ?? "n/a"} (entry ${p.entryPrice}, stop ${p.stopLoss}, slipVsStop=${slippageVsStopPct ?? "n/a"}%)`,
          );
          // Loss-bearing exits (SL always; MAX_HOLD when it closed underwater)
          // surface as "warn"; profit-locking exits (TP, trailing, profitable
          // max-hold) as "success".
          const isLossExit =
            reason === "STOP_LOSS" ||
            (reason === "MAX_HOLD" && typeof pnlPct === "number" && pnlPct < 0);
          executionStreamBus.emitEvent({
            type:     "position_closed",
            severity: isLossExit ? "warn" : "success",
            symbol:   p.symbol,
            side:     isBuy ? "BUY" : "SELL",
            price:    displayPrice,
            mode:     p.exchange ? "live" : "simulation",
            exchange: p.exchange ?? undefined,
            reason,
            message:  `${reason} close — ${runtimeMode} ${p.symbol} @ $${displayPrice.toFixed(2)}`,
            details:  {
              userId:        p.userId,
              positionId:    p.positionId,
              entryPrice:    p.entryPrice,
              realizedPnLPct: pnlPct,
            },
          });
        } else {
          // Position already gone (e.g. closed by another pass / manual close
          // earlier this tick) surfaces as not-found — benign.
          logger.info(
            {
              tag:        "HARD_STOP_SKIPPED",
              correlationId,
              userId:     p.userId,
              positionId: p.positionId,
              symbol:     p.symbol,
              reason:     closeResult.error ?? "closeUserPosition returned not-success",
              triggerReason: reason,
              mode:       runtimeMode,
            },
            "[HARD_STOP_SKIPPED] hard-stop close not applied",
          );

          // ── Zombie reconciliation (orphaned LIVE position past max-hold) ──────
          // A broker close that keeps failing on a LIVE position past its
          // max-hold ceiling may be a permanent orphan (the underlying asset is
          // gone from the exchange, so the close can never succeed). Escalate
          // ONLY after repeated consecutive failures AND a verified broker
          // balance below the recorded quantity. Anything short of that keeps
          // retrying — never close blind on a single rejection.
          const pastMaxHold =
            isLive && exitCfg.maxHoldMs > 0 && ageMs !== null && ageMs >= exitCfg.maxHoldMs;
          if (pastMaxHold && p.exchange) {
            const streak = (failedLiveCloseStreak.get(p.positionId) ?? 0) + 1;
            failedLiveCloseStreak.set(p.positionId, streak);
            if (streak >= getReconcileFailedCloseStreak()) {
              const probe = await getUserBrokerBaseBalance(p.userId, p.exchange, p.symbol);
              if (probe.ok) {
                // Use TOTAL (free + locked): if the asset exists ANYWHERE on the
                // venue — including locked in an open order — it is NOT an orphan
                // and we must keep trying. Reconcile only when even total cannot
                // cover the recorded quantity (minus the dust tolerance).
                const available = probe.totalBalance ?? 0;
                const required  = p.quantity * (1 - getReconcileBalanceTolerance());
                if (available < required) {
                  const recon = await reconcileZombiePosition({
                    userId:           p.userId,
                    positionId:       p.positionId,
                    brokerError:      closeResult.error ?? "broker close repeatedly rejected",
                    actualBalance:    available,
                    recordedQuantity: p.quantity,
                  });
                  if (recon.reconciled) failedLiveCloseStreak.delete(p.positionId);
                } else {
                  // Asset still present at the broker → transient/min-size issue,
                  // not an orphan. Reset the streak so a future genuine
                  // disappearance must re-accumulate its own confirmations.
                  failedLiveCloseStreak.delete(p.positionId);
                  logger.info(
                    {
                      tag:        "ZOMBIE_RECONCILE_SKIPPED",
                      userId:     p.userId,
                      positionId: p.positionId,
                      symbol:     p.symbol,
                      exchange:   p.exchange,
                      baseAsset:  probe.baseAsset,
                      available,
                      required,
                    },
                    "[ZOMBIE_RECONCILE_SKIPPED] broker balance still covers recorded qty — keeping position",
                  );
                }
              } else if (probe.errorCode === "connection_missing") {
                // PERMANENT orphan: the user fully REMOVED the exchange connection
                // (no row at all), so this LIVE position can NEVER be closed (no
                // credentials) and can NEVER be balance-verified (the probe needs
                // the connection it no longer has). Without this branch it loops
                // forever, counting toward concurrency/deployment limits.
                // "connection_missing" is unambiguous and permanent — distinct
                // from a present-but-inactive connection ("connection_inactive",
                // which may be reactivated → keeps deferring below) and from
                // transient probe failures — so we retire it locally. Any real
                // underlying assets remain in the user's exchange account under
                // their own manual control (removing our API key never liquidates
                // holdings).
                const recon = await reconcileZombiePosition({
                  userId:           p.userId,
                  positionId:       p.positionId,
                  brokerError:      `exchange connection removed — ${closeResult.error ?? "broker close unreachable"}`,
                  actualBalance:    null,
                  recordedQuantity: p.quantity,
                  closeReason:      "RECONCILED_CONNECTION_REMOVED",
                });
                if (recon.reconciled) {
                  failedLiveCloseStreak.delete(p.positionId);
                  logger.warn(
                    {
                      tag:        "ZOMBIE_RECONCILE_CONNECTION_REMOVED",
                      userId:     p.userId,
                      positionId: p.positionId,
                      symbol:     p.symbol,
                      exchange:   p.exchange,
                    },
                    "[ZOMBIE_RECONCILE_CONNECTION_REMOVED] retired orphaned live position — exchange connection removed (unmanageable)",
                  );
                }
              } else {
                // Balance probe failed for a TRANSIENT reason (the connection
                // still exists: getaccount_failed / decrypt_failed / unsupported)
                // → fail-CLOSED: never reconcile without a verified balance. Keep
                // the streak so once the probe recovers and confirms the asset is
                // gone, reconciliation fires then.
                logger.warn(
                  {
                    tag:        "ZOMBIE_RECONCILE_DEFERRED",
                    userId:     p.userId,
                    positionId: p.positionId,
                    symbol:     p.symbol,
                    exchange:   p.exchange,
                    errorCode:  probe.errorCode,
                    err:        probe.error,
                  },
                  "[ZOMBIE_RECONCILE_DEFERRED] could not verify broker balance — not reconciling (fail-closed)",
                );
              }
            }
          }
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
            triggerReason: reason,
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

// ── Global hard-stop tick (EXIT_ENGINE_V2 cap convergence) ───────────────────────
//
// The global `simulationEngine` positions ARE the `trades`-table rows (id-linked
// under EXIT_ENGINE_V2) that feed the max-active-positions cap
// (`countOpenTradePositions`). Until now they were only ever closed by the
// profit-only trailing pass — a global position that breaches a fixed SL/TP but
// never activates a trailing stop stayed open forever, inflating the cap and
// starving `autoExecute` (the 0-exec-attempts blocker). This pass mirrors
// `runHardStopMonitor` for the GLOBAL book: it force-closes any global position
// whose price breached its SL/TP and marks the linked `trades` row closed via
// `markTradeRowClosed`, so the cap self-heals as positions exit.
//
// Per-user positions are intentionally NOT touched here — `runHardStopMonitor`
// already enforces per-user SL/TP against `sim_positions`. This pass is purely the
// global/cap convergence path, so there is no double-close of per-user books.
//
// Breach semantics match `runHardStopMonitor` (SL checked first; capital
// protection wins a tie):
//   BUY  → STOP_LOSS price <= stopLoss ; TAKE_PROFIT price >= takeProfit
//   SELL → STOP_LOSS price >= stopLoss ; TAKE_PROFIT price <= takeProfit
async function runGlobalHardStops() {
  if (!isExitEngineV2()) return;
  if (!isHardStopEnforcementEnabled()) return;
  try {
    const openRows = await db
      .select({
        id:         tradesTable.id,
        symbol:     tradesTable.symbol,
        side:       tradesTable.side,
        stopLoss:   tradesTable.stopLoss,
        takeProfit: tradesTable.takeProfit,
      })
      .from(tradesTable)
      .where(openGlobalPositionsPredicate());
    if (openRows.length === 0) return;

    // Fetch each symbol's current price once, reuse across that symbol's rows.
    // A failed ticker fetch skips that symbol this tick (next tick retries)
    // rather than closing on a stale/zero price.
    const symbols    = [...new Set(openRows.map((r) => r.symbol))];
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
    for (const row of openRows) {
      const price = priceBySym.get(row.symbol);
      if (price === undefined) continue;

      const isBuy = row.side !== "SELL";
      let reason: "STOP_LOSS" | "TAKE_PROFIT" | null = null;
      if (row.stopLoss !== null && row.stopLoss !== undefined) {
        if (isBuy ? price <= row.stopLoss : price >= row.stopLoss) reason = "STOP_LOSS";
      }
      if (reason === null && row.takeProfit !== null && row.takeProfit !== undefined) {
        if (isBuy ? price >= row.takeProfit : price <= row.takeProfit) reason = "TAKE_PROFIT";
      }
      if (reason === null) continue;

      try {
        // closePosition fetches the authoritative live exit price + computes
        // realized PnL, removing the position from in-memory simulationEngine.
        const closeRes = await closePosition(row.id);
        if (closeRes.success && closeRes.trade) {
          engineStats.hardStopHits++;
          // markTradeRowClosed is idempotent (status='open' guarded + .returning()),
          // so a concurrent/duplicate close after the row is already closed is a no-op.
          await markTradeRowClosed(
            row.id,
            closeRes.trade.exitPrice,
            closeRes.trade.realizedPnL,
            closeRes.trade.realizedPnLPct,
            reason,
          );
          positionMeta.delete(row.id);
          logger.info(
            {
              tag:          "GLOBAL_HARD_STOP_TRIGGERED",
              correlationId,
              positionId:   row.id,
              symbol:       row.symbol,
              side:         row.side,
              reason,
              triggerPrice: price,
              stopLoss:     row.stopLoss,
              takeProfit:   row.takeProfit,
              realizedPnLPct: closeRes.trade.realizedPnLPct,
            },
            `[GLOBAL_HARD_STOP_TRIGGERED] ${reason} ${row.symbol} ${row.side} @ ${price} (exit ${closeRes.trade.exitPrice})`,
          );
        } else {
          // Position breached its stop in the DB but is absent from in-memory
          // simulationEngine (memory/DB divergence). Leave the row open so boot
          // rehydration reconciles it rather than marking a row closed without a
          // real close fill.
          logger.warn(
            {
              tag:        "GLOBAL_HARD_STOP_SKIPPED",
              correlationId,
              positionId: row.id,
              symbol:     row.symbol,
              reason:     closeRes.error ?? "closePosition returned not-success",
            },
            "[GLOBAL_HARD_STOP_SKIPPED] global position not in memory; trades row left open for rehydrate reconciliation",
          );
        }
      } catch (err) {
        logger.warn(
          {
            tag:        "GLOBAL_HARD_STOP_SKIPPED",
            correlationId,
            positionId: row.id,
            symbol:     row.symbol,
            reason:     err instanceof Error ? err.message : String(err),
          },
          "[GLOBAL_HARD_STOP_SKIPPED] global hard-stop close threw",
        );
      }
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "runGlobalHardStops: unexpected failure",
    );
  }
}

// ── Global-book cap self-heal (anti-deadlock) ───────────────────────────────────
// Force-closes any GLOBAL `trades` row open longer than the max-hold ceiling.
// Subsumes BOTH cap-deadlock modes that `runGlobalHardStops` cannot resolve:
//   (1) no live ticker feed (delisted/untradeable symbol) → SL/TP pass can never
//       evaluate it; (2) absent from in-memory simulationEngine (rehydration gap)
//       → closePosition can never close it. Either way the row keeps counting
//       toward `maxActivePositions` (Gate 1) forever, starving autoExecute.
//
// Deliberately INDEPENDENT of `runGlobalHardStops` and gated ONLY by
// `isExitEngineV2()` (the global book exists only under V2) — it must NOT be
// disabled by `HARD_STOP_ENFORCEMENT_ENABLED`, which is an unrelated SL/TP kill
// switch. Its own kill switch is `GLOBAL_POSITION_MAX_HOLD_MS=0`.
//
// Scoped to the GLOBAL `trades` book ONLY — per-user `sim_positions` (customer
// real-money, governed by separate fixed SL/TP exit governance) are never touched.
async function runGlobalCapSelfHeal() {
  if (!isExitEngineV2()) return;
  const maxHoldMs = getGlobalPositionMaxHoldMs();
  if (maxHoldMs <= 0) return;
  try {
    const now       = Date.now();
    const staleRows = await db
      .select({
        id:        tradesTable.id,
        symbol:    tradesTable.symbol,
        side:      tradesTable.side,
        price:     tradesTable.price,
        timestamp: tradesTable.timestamp,
      })
      .from(tradesTable)
      .where(openGlobalPositionsPredicate());
    if (staleRows.length === 0) return;

    const correlationId = genCorrelationId();
    for (const row of staleRows) {
      const openedAtMs = row.timestamp instanceof Date
        ? row.timestamp.getTime()
        : new Date(row.timestamp as unknown as string).getTime();
      if (!Number.isFinite(openedAtMs)) continue;
      const ageMs = now - openedAtMs;
      if (ageMs < maxHoldMs) continue;

      try {
        // Prefer a real market close (authoritative exit price + PnL) when the
        // position is still in memory.
        const closeRes = await closePosition(row.id).catch(() => null);
        if (closeRes?.success && closeRes.trade) {
          await markTradeRowClosed(
            row.id,
            closeRes.trade.exitPrice,
            closeRes.trade.realizedPnL,
            closeRes.trade.realizedPnLPct,
            "MAX_HOLD_FORCE_CLOSE",
          );
        } else {
          // Unmanageable (no ticker / not in memory): flat administrative close at
          // entry — no authoritative fill exists, so record zero realized P&L
          // (exit=entry, pnl=0, pnlPct=0) rather than a synthetic mark. This is
          // the operator-only mirror book, never a customer/real-money position.
          await markTradeRowClosed(row.id, row.price, 0, 0, "MAX_HOLD_FORCE_CLOSE");
        }
        positionMeta.delete(row.id);
        engineStats.hardStopHits++;
        logger.info(
          {
            tag:        "GLOBAL_MAX_HOLD_FORCE_CLOSE",
            correlationId,
            positionId: row.id,
            symbol:     row.symbol,
            side:       row.side,
            ageMs,
            maxHoldMs,
          },
          `[GLOBAL_MAX_HOLD_FORCE_CLOSE] cap self-heal — force-closed ${row.symbol} ${row.side} (age ${Math.round(ageMs / 3_600_000)}h)`,
        );
      } catch (err) {
        logger.warn(
          {
            tag:        "GLOBAL_MAX_HOLD_SKIPPED",
            positionId: row.id,
            symbol:     row.symbol,
            reason:     err instanceof Error ? err.message : String(err),
          },
          "[GLOBAL_MAX_HOLD_SKIPPED] force-close threw",
        );
      }
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "runGlobalCapSelfHeal: unexpected failure",
    );
  }
}

// ── Manual operator AI-managed exit monitor ──────────────────────────────────
// Enforces fixed SL/TP (and the live max-hold ceiling) on manual operator
// override trades (mode "manual", `exchange` set) by issuing a REAL market close
// on the operator-env exchange. This is the ONLY exit path that sends a real
// broker order for the operator/global book — `runGlobalHardStops` /
// `runGlobalCapSelfHeal` only ever close the paper mirror. Scoped strictly to
// mode='manual' rows so AI-operator (exchange NULL) and customer per-user
// (`sim_positions`) paths are untouched. Always-on (HARD_STOP_ENFORCEMENT only,
// NOT V2-gated) because these are real-money positions. On any close failure the
// row is left open for retry — a real position is never marked closed without a
// confirmed broker fill.
// A close attempt holds the 'closing' reservation only for the duration of one
// placeOrder + ~5s confirmation poll. Any row that has been 'closing' longer
// than this lease was stranded by a crash between claim and finalize/release,
// and is safe to reclaim. Kept far larger than a real close takes so a healthy
// in-flight close in ANOTHER process is never stolen (multi-instance safe).
const MANUAL_CLOSING_LEASE_MS = 120_000;
// A submitted-but-unconfirmed close whose order state stays UNKNOWN this long
// (broker unqueryable / order not found / still non-terminal) is escalated to
// an operator alert. The reservation is HELD throughout — it is never
// auto-retried, because the original close may still be live at the venue and a
// second close would oversell. Resolution is by re-confirmation or by hand.
const MANUAL_CLOSING_STUCK_ALERT_MS = 10 * 60_000;

/**
 * Apply a broker-confirmed manual close to a reserved ('closing') row. Shared
 * by the live close path and the lease re-confirmation path so both classify
 * full vs partial fills identically and never diverge.
 *
 * - confirmed fill ≥ requested → finalize row 'closing'→'closed' with realized
 *   PnL (returns "closed"), emits the position_closed telemetry event.
 * - confirmed fill < requested (real partial) → reduce tracked qty to the
 *   residual and release 'closing'→'open' so the next tick closes the remainder
 *   (returns "partial"); never marks the row closed (would orphan the residual).
 * - zero confirmed fill → "noop" (caller decides whether to release for retry).
 *
 * All writes are scoped to status='closing' so they can never collide with the
 * global hard-stop path (status='open'); a 0-row match returns "noop".
 */
async function settleManualClose(opts: {
  rowId:              string;
  symbol:             string;
  side:               string;
  entryPrice:         number;
  trackedQty:         number;
  confirmedFilledQty: number;
  exitPrice:          number;
  reason:             "STOP_LOSS" | "TAKE_PROFIT" | "MAX_HOLD";
  exchange:           string | null;
  correlationId:      string;
  source:             "live" | "reclaim";
}): Promise<"closed" | "partial" | "noop"> {
  const isBuy     = opts.side !== "SELL";
  const closedQty = opts.confirmedFilledQty > 0 ? opts.confirmedFilledQty : 0;
  if (closedQty <= 0) return "noop";

  const fullyFilled = closedQty >= opts.trackedQty * 0.999;
  if (!fullyFilled) {
    const residual = Math.max(opts.trackedQty - closedQty, 0);
    if (residual > opts.trackedQty * 0.001) {
      const upd = await db.update(tradesTable)
        .set({
          status:         "open",
          closedAt:       null,
          brokerResponse: null,
          fillQty:        parseFloat(residual.toFixed(8)),
          amount:         parseFloat((residual * opts.entryPrice).toFixed(2)),
        })
        .where(and(eq(tradesTable.id, opts.rowId), eq(tradesTable.status, "closing")))
        .returning({ id: tradesTable.id });
      if (upd.length === 0) return "noop";
      logger.warn({ tag: "MANUAL_EXIT_PARTIAL", correlationId: opts.correlationId, source: opts.source, positionId: opts.rowId, symbol: opts.symbol, triggerReason: opts.reason, requestedQty: opts.trackedQty, closedQty, residual },
        `[MANUAL_EXIT_PARTIAL] partial close ${opts.symbol} — ${closedQty}/${opts.trackedQty} filled, residual ${residual} kept managed for next tick`);
      return "partial";
    }
    // Residual is dust — treat as effectively flat and finalize below.
  }

  let exitPrice = opts.exitPrice;
  if (!(exitPrice > 0)) {
    // NEVER fall back to entryPrice — that fabricates a break-even close and
    // zeroes realized PnL (the sub-$1-coin accounting bug). Use a real market
    // ticker so the exit reflects an actual price; if even that is unavailable,
    // abort the finalize and keep the row reserved ('closing') for a later tick
    // rather than booking a zeroed close.
    try {
      const t = await getTicker(opts.symbol);
      exitPrice = t.price > 0 ? t.price : 0;
    } catch { exitPrice = 0; }
    if (!(exitPrice > 0)) {
      logger.warn(
        { tag: "MANUAL_EXIT_NO_PRICE", correlationId: opts.correlationId, positionId: opts.rowId, symbol: opts.symbol, triggerReason: opts.reason },
        "[MANUAL_EXIT_NO_PRICE] no broker fill price and ticker unavailable — finalize aborted, reservation held for retry",
      );
      return "noop";
    }
  }
  const fillQty   = closedQty > 0 ? closedQty : opts.trackedQty;
  const pnl    = isBuy ? (exitPrice - opts.entryPrice) * fillQty : (opts.entryPrice - exitPrice) * fillQty;
  const pnlPct = opts.entryPrice > 0
    ? (isBuy ? (exitPrice - opts.entryPrice) / opts.entryPrice : (opts.entryPrice - exitPrice) / opts.entryPrice) * 100
    : 0;
  const finalized = await db.update(tradesTable)
    .set({
      status:         "closed",
      exitPrice:      exitPrice,
      pnl:            parseFloat(pnl.toFixed(2)),
      pnlPercent:     parseFloat(pnlPct.toFixed(2)),
      closedAt:       new Date(),
      reason:         opts.reason,
      brokerResponse: null,
    })
    .where(and(eq(tradesTable.id, opts.rowId), eq(tradesTable.status, "closing")))
    .returning({ id: tradesTable.id });
  if (finalized.length === 0) return "noop";
  engineStats.hardStopHits++;

  logger.info({
    tag: "MANUAL_EXIT_TRIGGERED", correlationId: opts.correlationId, source: opts.source, positionId: opts.rowId, symbol: opts.symbol, side: opts.side,
    reason: opts.reason, entryPrice: opts.entryPrice, exitPrice, qtyBase: fillQty, realizedPnL: pnl, realizedPnLPct: pnlPct, exchange: opts.exchange,
  }, `[MANUAL_EXIT_TRIGGERED] ${opts.reason} ${opts.symbol} ${opts.side} exit $${exitPrice.toFixed(2)} (entry $${opts.entryPrice.toFixed(2)}) pnl ${pnl.toFixed(2)}`);

  executionStreamBus.emitEvent({
    type:     "position_closed",
    severity: opts.reason === "TAKE_PROFIT" || (opts.reason === "MAX_HOLD" && pnl >= 0) ? "success" : "warn",
    symbol:   opts.symbol,
    side:     isBuy ? "BUY" : "SELL",
    price:    exitPrice,
    mode:     "live",
    exchange: opts.exchange ?? undefined,
    reason:   opts.reason,
    message:  `${opts.reason} close — MANUAL ${opts.symbol} @ $${exitPrice.toFixed(2)} (pnl ${pnl.toFixed(2)})`,
    details:  { positionId: opts.rowId, entryPrice: opts.entryPrice, realizedPnL: pnl, realizedPnLPct: pnlPct, source: opts.source },
  });
  return "closed";
}

async function runManualOperatorLiveStops() {
  if (!isHardStopEnforcementEnabled()) return;
  try {
    // Crash recovery (lease-based, multi-process safe): a crash between claiming
    // a row (status='closing') and finalizing/releasing it would strand the
    // position forever — the selector below only reads status='open'. The claim
    // stamps `closedAt` with the claim time; reclaim only rows whose lease has
    // expired so a healthy close in flight elsewhere is never disturbed.
    try {
      const leaseCutoff = new Date(Date.now() - MANUAL_CLOSING_LEASE_MS);
      const stale = await db
        .select({
          id:             tradesTable.id,
          symbol:         tradesTable.symbol,
          side:           tradesTable.side,
          price:          tradesTable.price,
          fillQty:        tradesTable.fillQty,
          amount:         tradesTable.amount,
          exchange:       tradesTable.exchange,
          brokerResponse: tradesTable.brokerResponse,
          closedAt:       tradesTable.closedAt,
        })
        .from(tradesTable)
        .where(and(
          eq(tradesTable.mode, "manual"),
          eq(tradesTable.status, "closing"),
          isNotNull(tradesTable.exchange),
          lt(tradesTable.closedAt, leaseCutoff),
        ));
      const reclaimCorrelationId = genCorrelationId();
      for (const r of stale) {
        const br = (r.brokerResponse ?? null) as { closeOrderId?: string; closeReason?: string; closeSubmittedAt?: string } | null;
        const closeOrderId = br?.closeOrderId;
        const trackedQty = (r.fillQty != null && r.fillQty > 0)
          ? r.fillQty
          : (r.price > 0 ? r.amount / r.price : 0);

        // A close order was submitted but never confirmed. Re-confirm it
        // against the REAL exchange BEFORE deciding — re-submitting a close
        // that already filled would double-close (oversell) the position.
        if (closeOrderId && r.exchange) {
          const chk = await confirmOperatorOrderFill({ exchange: r.exchange, orderId: closeOrderId, symbol: r.symbol });
          if (chk.found && chk.terminal && chk.filledQty > 0) {
            const reason = (br?.closeReason === "STOP_LOSS" || br?.closeReason === "TAKE_PROFIT" || br?.closeReason === "MAX_HOLD")
              ? br.closeReason : "MAX_HOLD";
            await settleManualClose({
              rowId:              r.id,
              symbol:             r.symbol,
              side:               r.side,
              entryPrice:         r.price,
              trackedQty,
              confirmedFilledQty: chk.filledQty,
              exitPrice:          chk.avgFillPrice,
              reason,
              exchange:           r.exchange,
              correlationId:      reclaimCorrelationId,
              source:             "reclaim",
            });
            logger.warn({ tag: "MANUAL_CLOSING_RECONFIRMED", positionId: r.id, symbol: r.symbol, closeOrderId, status: chk.status, filledQty: chk.filledQty },
              `[MANUAL_CLOSING_RECONFIRMED] lease-expired close ${r.symbol} confirmed filled on re-check — finalized`);
            continue;
          }
          if (chk.found && chk.terminal && chk.filledQty <= 0) {
            // Broker confirms the close never filled (cancelled/rejected) —
            // safe to release for a fresh retry.
            await db.update(tradesTable).set({ status: "open", closedAt: null, brokerResponse: null })
              .where(and(eq(tradesTable.id, r.id), eq(tradesTable.status, "closing")));
            logger.warn({ tag: "MANUAL_CLOSING_RECLAIMED", positionId: r.id, symbol: r.symbol, closeOrderId, status: chk.status },
              `[MANUAL_CLOSING_RECLAIMED] lease-expired close ${r.symbol} confirmed unfilled — released for retry`);
            continue;
          }
          // Order state is UNKNOWN (not found / non-terminal / API error). The
          // close may still be live at the venue, so releasing for a fresh
          // close would risk a double-close (oversell). HOLD the reservation
          // ('closing') and KEEP closeOrderId so the next tick re-confirms —
          // never auto-retry an unconfirmed-but-possibly-live close. Escalate
          // to an operator alert once the position has been stuck beyond the
          // alert threshold so it can be resolved by hand.
          const submittedAtMs = br?.closeSubmittedAt ? Date.parse(br.closeSubmittedAt) : NaN;
          const stuckMs = Number.isFinite(submittedAtMs) ? Date.now() - submittedAtMs : Infinity;
          if (stuckMs >= MANUAL_CLOSING_STUCK_ALERT_MS) {
            logger.error({ tag: "MANUAL_CLOSING_STUCK", positionId: r.id, symbol: r.symbol, closeOrderId, status: chk.status, stuckMs, exchange: r.exchange },
              `[MANUAL_CLOSING_STUCK] manual close ${r.symbol} unresolved for ${Math.round(stuckMs / 1000)}s (order ${closeOrderId}) — reservation HELD, needs operator intervention`);
          } else {
            logger.warn({ tag: "MANUAL_CLOSING_HELD", positionId: r.id, symbol: r.symbol, closeOrderId, status: chk.status },
              `[MANUAL_CLOSING_HELD] lease-expired close ${r.symbol} still unresolved — reservation HELD for re-confirmation (no retry)`);
          }
          continue;
        }

        // No close order id recorded. We CANNOT prove whether a real broker
        // order was placed: the best-effort id-persist may have failed AFTER a
        // genuine submit, or the process may have crashed around submit time.
        // Auto-releasing would risk a second close against a possibly-live order
        // (oversell / double-close). FAIL-CLOSED: hold the reservation and
        // escalate for operator reconciliation rather than blindly retrying.
        const claimedAtMs = r.closedAt instanceof Date
          ? r.closedAt.getTime()
          : (r.closedAt ? Date.parse(r.closedAt as unknown as string) : NaN);
        const strandedMs = Number.isFinite(claimedAtMs) ? Date.now() - claimedAtMs : Infinity;
        logger.error({ tag: "MANUAL_CLOSING_STUCK", positionId: r.id, symbol: r.symbol, closeOrderId: null, strandedMs, exchange: r.exchange },
          `[MANUAL_CLOSING_STUCK] lease-expired manual close ${r.symbol} stranded with NO recorded order id for ${Number.isFinite(strandedMs) ? Math.round(strandedMs / 1000) + "s" : "unknown"} — cannot prove a close was not already submitted; reservation HELD (no auto-retry), needs operator reconciliation`);
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "runManualOperatorLiveStops: lease reclaim failed");
    }

    const openRows = await db
      .select({
        id:         tradesTable.id,
        symbol:     tradesTable.symbol,
        side:       tradesTable.side,
        price:      tradesTable.price,
        amount:     tradesTable.amount,
        stopLoss:   tradesTable.stopLoss,
        takeProfit: tradesTable.takeProfit,
        exchange:   tradesTable.exchange,
        fillQty:    tradesTable.fillQty,
        timestamp:  tradesTable.timestamp,
      })
      .from(tradesTable)
      .where(and(
        eq(tradesTable.mode, "manual"),
        eq(tradesTable.status, "open"),
        isNotNull(tradesTable.exchange),
      ));
    if (openRows.length === 0) return;

    const symbols    = [...new Set(openRows.map((r) => r.symbol))];
    const priceBySym = new Map<string, number>();
    await Promise.all(symbols.map(async (sym) => {
      try { const t = await getTicker(sym); if (t.price > 0) priceBySym.set(sym, t.price); }
      catch { /* skip this symbol this tick */ }
    }));

    const correlationId = genCorrelationId();
    const maxHoldMs     = getLivePositionMaxHoldMs();
    const nowMs         = Date.now();

    for (const row of openRows) {
      const isBuy = row.side !== "SELL";
      const price = priceBySym.get(row.symbol);

      let reason: "STOP_LOSS" | "TAKE_PROFIT" | "MAX_HOLD" | null = null;
      if (price !== undefined) {
        if (row.stopLoss != null && (isBuy ? price <= row.stopLoss : price >= row.stopLoss)) {
          reason = "STOP_LOSS";
        }
        if (reason === null && row.takeProfit != null && (isBuy ? price >= row.takeProfit : price <= row.takeProfit)) {
          reason = "TAKE_PROFIT";
        }
      }
      // Price-independent max-hold ceiling so a stuck position can always close.
      if (reason === null && maxHoldMs > 0) {
        const openedAtMs = row.timestamp instanceof Date
          ? row.timestamp.getTime()
          : new Date(row.timestamp as unknown as string).getTime();
        if (Number.isFinite(openedAtMs) && nowMs - openedAtMs >= maxHoldMs) reason = "MAX_HOLD";
      }
      if (reason === null) continue;

      const qtyBase = (row.fillQty != null && row.fillQty > 0)
        ? row.fillQty
        : (row.price > 0 ? row.amount / row.price : 0);
      if (!(qtyBase > 0)) {
        logger.warn({ tag: "MANUAL_EXIT_SKIPPED", correlationId, positionId: row.id, symbol: row.symbol, reason: "no_qty" },
          "[MANUAL_EXIT_SKIPPED] cannot size close — leaving row open");
        continue;
      }

      // Reserve the row BEFORE sending a real broker order: atomically flip
      // status open→closing. The openRows query only selects status='open', so
      // once claimed no overlapping tick can re-select it and submit a duplicate
      // close. If the claim matches 0 rows, another path already owns it — skip.
      // Stamp `closedAt` as the lease timestamp so the lease-based reclaim above
      // can detect a crash-stranded 'closing' row. Cleared on release; replaced
      // with the real close time on finalize.
      const claimed = await db
        .update(tradesTable)
        .set({ status: "closing", closedAt: new Date() })
        .where(and(eq(tradesTable.id, row.id), eq(tradesTable.status, "open")))
        .returning({ id: tradesTable.id });
      if (claimed.length === 0) continue;

      try {
        const closeRes = await closeOperatorPositionLive({
          symbol:   row.symbol,
          openSide: isBuy ? "BUY" : "SELL",
          qtyBase,
          exchange: row.exchange!,
          reason,
        });

        // If ANY broker order was placed (confirmed fill OR submitted-but-
        // unconfirmed), record its id on the reserved row FIRST — best-effort
        // and NEVER throwing. This is the crash-safe anchor: if a later step
        // (settle, or an unexpected throw) fails, the lease reclaim re-confirms
        // via this id instead of blindly re-closing a possibly-live order.
        const placedOrderId = closeRes.closeOrderId || closeRes.exchangeOrderId;
        if (placedOrderId) {
          await db.update(tradesTable)
            .set({ brokerResponse: { closeOrderId: placedOrderId, closeReason: reason, closeSubmittedAt: new Date().toISOString() } })
            .where(and(eq(tradesTable.id, row.id), eq(tradesTable.status, "closing")))
            .catch((e) => logger.warn({ tag: "MANUAL_EXIT_PERSIST_FAILED", correlationId, positionId: row.id, symbol: row.symbol, closeOrderId: placedOrderId, error: e instanceof Error ? e.message : String(e) },
              "[MANUAL_EXIT_PERSIST_FAILED] could not persist close order id — proceeding with in-hand result"));
        }

        if (!closeRes.success) {
          if (closeRes.submitted && placedOrderId) {
            // A broker close order WAS placed but its fill could not be
            // confirmed in time. Do NOT release for an immediate retry — that
            // would double-close a possibly-filled order. Keep the row reserved
            // ('closing'); the lease reclaim re-confirms via the persisted id.
            logger.warn({ tag: "MANUAL_EXIT_UNCONFIRMED", correlationId, positionId: row.id, symbol: row.symbol, triggerReason: reason, closeOrderId: placedOrderId, error: closeRes.error },
              "[MANUAL_EXIT_UNCONFIRMED] close submitted but unconfirmed — reservation held for re-confirmation");
            continue;
          }
          // No order placed (pre-submit reject) or a broker-confirmed zero fill
          // — safe to release the reservation so a later tick retries. Never
          // mark a real position closed without a confirmed broker fill. Clear
          // any stale brokerResponse so the reclaim never sees a dangling id.
          await db.update(tradesTable).set({ status: "open", closedAt: null, brokerResponse: null })
            .where(and(eq(tradesTable.id, row.id), eq(tradesTable.status, "closing")));
          logger.warn({ tag: "MANUAL_EXIT_SKIPPED", correlationId, positionId: row.id, symbol: row.symbol, triggerReason: reason, error: closeRes.error },
            "[MANUAL_EXIT_SKIPPED] real close unconfirmed/unfilled — reservation released for retry");
          continue;
        }

        // Broker-confirmed fill. settleManualClose finalizes (full) or reduces
        // to residual + releases (partial), scoped to the 'closing' reservation.
        const exitPrice = closeRes.fillPrice && closeRes.fillPrice > 0 ? closeRes.fillPrice : (price ?? row.price);
        await settleManualClose({
          rowId:              row.id,
          symbol:             row.symbol,
          side:               row.side,
          entryPrice:         row.price,
          trackedQty:         qtyBase,
          confirmedFilledQty: closeRes.quantity && closeRes.quantity > 0 ? closeRes.quantity : 0,
          exitPrice,
          reason,
          exchange:           row.exchange,
          correlationId,
          source:             "live",
        });
      } catch (err) {
        // FAIL-CLOSED: an exception after the row was reserved may have occurred
        // AFTER a real broker order was submitted (closeOperatorPositionLive is
        // built to never throw post-submit, but settle/DB writes still can).
        // Reopening here could double-close, so KEEP the reservation ('closing').
        // Recovery is by the lease reclaim: if a close order id was persisted
        // above it re-confirms that order; if no order was ever placed the
        // reclaim's no-id branch safely releases the row.
        logger.error({ tag: "MANUAL_EXIT_ERROR", correlationId, positionId: row.id, symbol: row.symbol, triggerReason: reason, error: err instanceof Error ? err.message : String(err) },
          "[MANUAL_EXIT_ERROR] manual exit threw after reservation — reservation HELD (fail-closed), lease reclaim will resolve");
      }
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "runManualOperatorLiveStops: unexpected failure");
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

  const entryDecisionDrafts: EntryDecisionDraft[] = [];

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
      const strategyV2Gate = evaluateStrategyV2Gate({
        enabled: isStrategyV2Enabled(),
        symbol,
        effectiveAction,
        fast: mtf.fast,
        slow: mtf.slow,
        fastSnap: mtf.fastSnap,
        slowSnap: mtf.slowSnap,
        compositeScore: mtf.displayConfidence,
      });
      const strategyV2GatePass = strategyV2Gate.allowed;

      const shouldTrade =
        settings.autoMode &&
        !settings.killSwitch &&
        executionEligible &&
        effectiveAction !== "HOLD" &&
        strategyV2GatePass &&
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
      } else if (!strategyV2GatePass) {
        signalBlockReason = strategyV2Gate.reason;
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
        const isStrategyV2Block =
          signalBlockReason.startsWith("strategy_v2_");
        // TEMP [VOL_GATE_TEST] — attribute each rejected actionable signal to
        // its first failing gate (confidence vs volume). Remove with the rest
        // of the volGateTest block when the controlled test window closes.
        if (isConfBlock) {
          engineStats.volGateTest.rejectedByConfidence++;
        } else if (signalBlockReason === "Volume below average (low-volume filter)") {
          engineStats.volGateTest.rejectedByVolume++;
        }
        if (isStrategyV2Block) {
          logger.info(
            { tag: "STRATEGY_V2_BLOCK", symbol, side: effectiveAction, confidence: mtf.avgConfidence, reason: signalBlockReason },
            `[STRATEGY_V2_BLOCK] ${symbol} ${effectiveAction} @ ${mtf.avgConfidence.toFixed(1)}% — ${signalBlockReason}`,
          );
        }
        executionStreamBus.emitEvent({
          type:       isConfBlock ? "confidence_too_low" : "signal_rejected",
          severity:   "warn",
          symbol,
          side:       effectiveAction as "BUY" | "SELL",
          confidence: mtf.avgConfidence,
          gate:       isConfBlock ? "confidence_floor" : isStrategyV2Block ? "strategy_v2" : "pre_execute_gate",
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
        const gStrategyV2 = strategyV2GatePass;

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
        } else if (!gStrategyV2) {
          fnRejGate = "strategy_v2";
          fnRejReason = strategyV2Gate.reason;
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

        entryDecisionDrafts.push({
          ts:                 trace.ts,
          symbol,
          side:               fnSide,
          confidence:         mtf.avgConfidence,
          compositeScore:     mtf.displayConfidence,
          outcome:            trace.finalResult === "EXECUTED" ? "ENTERED" : "SKIPPED",
          skipReason:         trace.finalResult === "EXECUTED"
            ? null
            : classifyEntrySkipReason(trace.rejectionGate, trace.rejectionReason),
          rawReason:          trace.rejectionReason,
          rejectionGate:      trace.rejectionGate,
          reachedExecution:   trace.reachedExecution,
          executionAttempted: trace.executionAttempted,
        });

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

  await recordEntryDecisions(entryDecisionDrafts);

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
  // runHardStopMonitor covers per-user `sim_positions`; runGlobalHardStops covers
  // the global `trades`-table book (the max-active-positions cap source) so those
  // rows actually close on SL/TP instead of only on a trailing trigger. The
  // per-user monitor ALSO runs on its own faster interval (see
  // STOP_MONITOR_INTERVAL_MS); the guard makes the two callers mutually
  // exclusive so they never double-fire a close.
  await runHardStopMonitorGuarded();
  await runManualOperatorLiveStops();
  await runGlobalHardStops();
  await runGlobalCapSelfHeal();
  await runTrailingStops();
}

// ── Public API ─────────────────────────────────────────────────────────────────

let loopHandle: ReturnType<typeof setInterval> | null = null;
const LOOP_INTERVAL_MS = 60_000;

// Dedicated FAST cadence for the per-user LIVE stop-loss / exit monitor. The
// heavy MTF analysis tick runs every 60s; gating stop enforcement on it meant a
// breached stop could sit up to a full tick (and, with multi-tick confirmation,
// up to ~120s) before force-closing — a primary driver of the -4% to -5.4%
// stop-loss blow-throughs seen post-deploy. Running the monitor every ~10s cuts
// that worst-case latency by ~6x. Env-tunable (fail-safe default 10s, floor 2s
// so we never hammer the broker, ceiling 60s = the analysis cadence).
let stopMonitorHandle: ReturnType<typeof setInterval> | null = null;
export const STOP_MONITOR_INTERVAL_MS = parseLiveStopKnob(
  "STOP_MONITOR_INTERVAL_MS", process.env.STOP_MONITOR_INTERVAL_MS, 10000, 2000, 60000);

// Re-entrancy guard shared by the 60s tick and the fast interval so a slow run
// (e.g. many open positions / slow ticker fetches) can never overlap itself and
// double-fire a close.
let stopMonitorRunning = false;
async function runHardStopMonitorGuarded() {
  if (stopMonitorRunning) return;
  stopMonitorRunning = true;
  try {
    await Promise.all([
      runHardStopMonitor(),
      runManualTargetExitMonitor(),
    ]);
  } finally {
    stopMonitorRunning = false;
  }
}

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

  // Fast LIVE stop-loss enforcement, independent of the 60s analysis tick.
  stopMonitorHandle = setInterval(
    () => { void runHardStopMonitorGuarded(); },
    STOP_MONITOR_INTERVAL_MS,
  );

  logger.info(
    { intervalMs: LOOP_INTERVAL_MS, stopMonitorIntervalMs: STOP_MONITOR_INTERVAL_MS },
    "Trading loop started (MTF + trailing stops + correlation + test mode; fast live stop monitor)",
  );
}

export function stopTradingLoop() {
  if (loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
  }
  if (stopMonitorHandle) {
    clearInterval(stopMonitorHandle);
    stopMonitorHandle = null;
  }
  engineStats.running = false;
  logger.info("Trading loop stopped");
}

export function getLoopIntervalMs() { return LOOP_INTERVAL_MS; }
