/**
 * Per-signal execution-funnel instrumentation.
 *
 * Answers the operator question: "the engine generates thousands of signals —
 * exactly which gate stops them from becoming trades, and how many die at each
 * gate?". This is PURE DIAGNOSTIC TELEMETRY. It changes no thresholds, no
 * confidence floors, no liquidity/risk rules — it only observes the decisions
 * the engine already makes in `tradingLoop.ts:tick()` and records them.
 *
 * Unlike `executionFunnel.ts` (which subscribes to the event bus and counts
 * only BLOCK events), this module records a complete per-signal trace with a
 * Y/N result for every gate, in funnel order, plus monotonic PASS-THROUGH
 * counters at each stage. That gives a true funnel:
 *
 *   signalsEvaluated
 *     → passedConfidence → passedMTF → passedVolume → passedSideways
 *     → passedTrend1H → reachedExecution
 *     → passedPositionLimits → passedCooldown → passedDuplicate
 *     → passedRisk → passedExchange
 *     → executionAttempted → executionSucceeded
 *
 * Counts are cumulative since the last reset (defaults to process boot). Read
 * on demand by GET /api/engine/signal-funnel (operator) and surfaced in a
 * customer-safe rollup on GET /api/engine/status.
 */

export type EngineGateKey =
  | "confidence"
  | "mtf"
  | "volume"
  | "sideways"
  | "trend1h";

export type ExecGateKey =
  | "positionLimit"
  | "cooldown"
  | "duplicate"
  | "risk"
  | "exchange";

/**
 * A complete decision record for one directional signal candidate. Downstream
 * gates are `null` when the signal was rejected before reaching them (the
 * normal case when the collapse is upstream) — `null` reads as "not evaluated".
 */
export interface SignalTrace {
  ts:                 number;
  symbol:             string;
  side:               "BUY" | "SELL";
  confidence:         number;
  // Engine-stage gates (always evaluated for a directional candidate).
  passedConfidence:   boolean;
  passedMTF:          boolean;
  passedVolume:       boolean;
  passedSideways:     boolean;
  passedTrend1H:      boolean;
  // Did the signal clear every engine gate (and the engine was enabled),
  // i.e. autoExecute was actually invoked.
  reachedExecution:   boolean;
  // Downstream execution gates (null = not evaluated).
  passedPositionLimit: boolean | null;
  passedCooldown:     boolean | null;
  passedDuplicate:    boolean | null;
  passedRisk:         boolean | null;
  passedExchange:     boolean | null;
  // Was an order actually dispatched to the (sim/live) order path.
  executionAttempted: boolean;
  finalResult:        "EXECUTED" | "REJECTED";
  // First failing gate key + a human reason. null/null when EXECUTED.
  rejectionGate:      string | null;
  rejectionReason:    string | null;
}

export interface SignalFunnelSnapshot {
  since:                number;
  signalsEvaluated:     number;
  passedConfidence:     number;
  passedMTF:            number;
  passedVolume:         number;
  passedSideways:       number;
  passedTrend1H:        number;
  reachedExecution:     number;
  passedPositionLimits: number;
  passedCooldown:       number;
  passedDuplicate:      number;
  passedRisk:           number;
  passedExchange:       number;
  executionAttempted:   number;
  executionSucceeded:   number;
  rejectionsByGate:     { gate: string; count: number }[];
  recent:               SignalTrace[];
}

const RECENT_MAX = 120;

interface FunnelState {
  since:                number;
  signalsEvaluated:     number;
  passedConfidence:     number;
  passedMTF:            number;
  passedVolume:         number;
  passedSideways:       number;
  passedTrend1H:        number;
  reachedExecution:     number;
  passedPositionLimits: number;
  passedCooldown:       number;
  passedDuplicate:      number;
  passedRisk:           number;
  passedExchange:       number;
  executionAttempted:   number;
  executionSucceeded:   number;
  rejectionsByGate:     Map<string, number>;
  recent:               SignalTrace[];
}

function freshState(): FunnelState {
  return {
    since:                Date.now(),
    signalsEvaluated:     0,
    passedConfidence:     0,
    passedMTF:            0,
    passedVolume:         0,
    passedSideways:       0,
    passedTrend1H:        0,
    reachedExecution:     0,
    passedPositionLimits: 0,
    passedCooldown:       0,
    passedDuplicate:      0,
    passedRisk:           0,
    passedExchange:       0,
    executionAttempted:   0,
    executionSucceeded:   0,
    rejectionsByGate:     new Map(),
    recent:               [],
  };
}

const state: FunnelState = freshState();

/**
 * Downstream-gate classification derived from autoExecute's existing
 * `blockReason` string + executed flag. autoExecute is intentionally left
 * UNCHANGED — we read its return value rather than threading a trace through
 * its ~600-line body, so there is zero behavioral risk to the order path.
 *
 * autoExecute gate order: live-confidence-floor → position-limit →
 * daily-limit (cooldown/throughput) → correlation (duplicate-asset) →
 * risk-engine → order placement (exchange validation).
 */
export interface DownstreamResult {
  passedPositionLimit: boolean | null;
  passedCooldown:      boolean | null;
  passedDuplicate:     boolean | null;
  passedRisk:          boolean | null;
  passedExchange:      boolean | null;
  executionAttempted:  boolean;
  rejectionGate:       string | null;
  rejectionReason:     string | null;
}

export function classifyDownstream(
  blockReason: string | null,
  executed:    boolean,
): DownstreamResult {
  if (executed) {
    return {
      passedPositionLimit: true,
      passedCooldown:      true,
      passedDuplicate:     true,
      passedRisk:          true,
      passedExchange:      true,
      executionAttempted:  true,
      rejectionGate:       null,
      rejectionReason:     null,
    };
  }

  const r = blockReason ?? "";

  // Live-confidence floor (live mode only) — fails before the position gate.
  if (r.startsWith("Below ") && r.includes("live-execution")) {
    return {
      passedPositionLimit: null, passedCooldown: null, passedDuplicate: null,
      passedRisk: null, passedExchange: null, executionAttempted: false,
      rejectionGate: "live_confidence_floor", rejectionReason: r,
    };
  }
  if (r.startsWith("Max active positions")) {
    return {
      passedPositionLimit: false, passedCooldown: null, passedDuplicate: null,
      passedRisk: null, passedExchange: null, executionAttempted: false,
      rejectionGate: "position_limit", rejectionReason: r,
    };
  }
  if (r === "Daily limit") {
    return {
      passedPositionLimit: true, passedCooldown: false, passedDuplicate: null,
      passedRisk: null, passedExchange: null, executionAttempted: false,
      rejectionGate: "cooldown_daily_limit", rejectionReason: r,
    };
  }
  if (r === "Correlation filter") {
    return {
      passedPositionLimit: true, passedCooldown: true, passedDuplicate: false,
      passedRisk: null, passedExchange: null, executionAttempted: false,
      rejectionGate: "duplicate_asset", rejectionReason: r,
    };
  }
  if (r.startsWith("Risk engine")) {
    return {
      passedPositionLimit: true, passedCooldown: true, passedDuplicate: true,
      passedRisk: false, passedExchange: null, executionAttempted: false,
      rejectionGate: "risk_engine", rejectionReason: r,
    };
  }
  // Anything else = a failure during order placement: all pre-placement gates
  // passed and an order WAS attempted, but the exchange/sim layer rejected it.
  return {
    passedPositionLimit: true, passedCooldown: true, passedDuplicate: true,
    passedRisk: true, passedExchange: false, executionAttempted: true,
    rejectionGate: "exchange_validation", rejectionReason: r || "order placement failed",
  };
}

/**
 * Record one signal's full funnel trace and advance the monotonic
 * pass-through counters. Walks the gates in funnel order and stops counting at
 * the first gate that is false/null, so each counter reflects "how many
 * signals reached AND passed this stage".
 */
export function recordSignalTrace(t: SignalTrace): void {
  state.signalsEvaluated++;
  // Count "an order was dispatched" exactly once per trace, independent of the
  // gate walk below. executionAttempted is only ever true once the signal
  // reached the placement stage (executed, or an exchange-stage rejection), so
  // counting it here — rather than inside both the pass path and finishReject —
  // avoids double-counting exchange-rejection traces.
  if (t.executionAttempted) state.executionAttempted++;

  // Engine stages (sequential).
  if (!t.passedConfidence) { finishReject(t); return; }
  state.passedConfidence++;
  if (!t.passedMTF) { finishReject(t); return; }
  state.passedMTF++;
  if (!t.passedVolume) { finishReject(t); return; }
  state.passedVolume++;
  if (!t.passedSideways) { finishReject(t); return; }
  state.passedSideways++;
  if (!t.passedTrend1H) { finishReject(t); return; }
  state.passedTrend1H++;

  if (!t.reachedExecution) { finishReject(t); return; }
  state.reachedExecution++;

  // Downstream stages (null = not evaluated → stop).
  if (t.passedPositionLimit !== true) { finishReject(t); return; }
  state.passedPositionLimits++;
  if (t.passedCooldown !== true) { finishReject(t); return; }
  state.passedCooldown++;
  if (t.passedDuplicate !== true) { finishReject(t); return; }
  state.passedDuplicate++;
  if (t.passedRisk !== true) { finishReject(t); return; }
  state.passedRisk++;

  if (t.passedExchange !== true) { finishReject(t); return; }
  state.passedExchange++;

  if (t.finalResult === "EXECUTED") state.executionSucceeded++;
  pushRecent(t);
}

function finishReject(t: SignalTrace): void {
  if (t.rejectionGate) {
    state.rejectionsByGate.set(
      t.rejectionGate,
      (state.rejectionsByGate.get(t.rejectionGate) ?? 0) + 1,
    );
  }
  pushRecent(t);
}

function pushRecent(t: SignalTrace): void {
  state.recent.unshift(t);
  if (state.recent.length > RECENT_MAX) state.recent.length = RECENT_MAX;
}

export function getSignalFunnelSnapshot(): SignalFunnelSnapshot {
  const rejectionsByGate = Array.from(state.rejectionsByGate.entries())
    .map(([gate, count]) => ({ gate, count }))
    .sort((a, b) => b.count - a.count);
  return {
    since:                state.since,
    signalsEvaluated:     state.signalsEvaluated,
    passedConfidence:     state.passedConfidence,
    passedMTF:            state.passedMTF,
    passedVolume:         state.passedVolume,
    passedSideways:       state.passedSideways,
    passedTrend1H:        state.passedTrend1H,
    reachedExecution:     state.reachedExecution,
    passedPositionLimits: state.passedPositionLimits,
    passedCooldown:       state.passedCooldown,
    passedDuplicate:      state.passedDuplicate,
    passedRisk:           state.passedRisk,
    passedExchange:       state.passedExchange,
    executionAttempted:   state.executionAttempted,
    executionSucceeded:   state.executionSucceeded,
    rejectionsByGate,
    recent:               state.recent.slice(),
  };
}

export function resetSignalFunnel(): void {
  Object.assign(state, freshState());
}
