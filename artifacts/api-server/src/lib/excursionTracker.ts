// ── Excursion tracker (Phase 0 profitability telemetry — measurement only) ────
//
// Records, per OPEN position, the Maximum Favorable Excursion (MFE — the peak
// unrealized profit the position reached) and Maximum Adverse Excursion (MAE —
// the worst unrealized drawdown), each with the epoch-ms timestamp at which it
// occurred. Values are GROSS of fees: excursion is a price-path concept, sampled
// from the live ticker on every risk-monitor tick.
//
// State is intentionally in-memory and lives in a NEUTRAL module so both the
// risk monitor (tradingLoop) — which samples it each tick — and the close path
// (userSimRegistry.closeUserPosition) — which reads it into the sim_trades row —
// can share it WITHOUT a circular import. A process restart resets the running
// marks; a position that closes before any sample (or right after a restart)
// simply persists NULL excursion. This is an acceptable measurement-only
// degradation and changes NO trading behaviour.

export interface ExcursionMark {
  /** Peak favorable unrealized P&L in USD (gross of fees). */
  mfeUsd: number;
  /** Peak favorable unrealized move, percent of entry price. */
  mfePct: number;
  /** Epoch-ms at which the favorable peak was observed. */
  mfeAt: number;
  /** Worst adverse unrealized P&L in USD (gross of fees; most negative seen). */
  maeUsd: number;
  /** Worst adverse unrealized move, percent of entry price. */
  maePct: number;
  /** Epoch-ms at which the adverse trough was observed. */
  maeAt: number;
}

const marks = new Map<string, ExcursionMark>();

/**
 * Fold a fresh unrealized-P&L sample into a position's running MFE/MAE marks.
 * The first sample seeds both the favorable and adverse extremes; subsequent
 * samples only widen them. No-op semantics beyond updating the two extremes.
 */
export function updateExcursion(
  positionId: string,
  unrealizedUsd: number,
  unrealizedPct: number,
  nowMs: number,
): void {
  if (!Number.isFinite(unrealizedUsd) || !Number.isFinite(unrealizedPct)) return;
  const m = marks.get(positionId);
  if (m === undefined) {
    marks.set(positionId, {
      mfeUsd: unrealizedUsd, mfePct: unrealizedPct, mfeAt: nowMs,
      maeUsd: unrealizedUsd, maePct: unrealizedPct, maeAt: nowMs,
    });
    return;
  }
  if (unrealizedUsd > m.mfeUsd) { m.mfeUsd = unrealizedUsd; m.mfePct = unrealizedPct; m.mfeAt = nowMs; }
  if (unrealizedUsd < m.maeUsd) { m.maeUsd = unrealizedUsd; m.maePct = unrealizedPct; m.maeAt = nowMs; }
}

/** Read a position's accumulated excursion marks (undefined if never sampled). */
export function getExcursion(positionId: string): ExcursionMark | undefined {
  return marks.get(positionId);
}

/** Drop a single position's marks (called on a full close). */
export function clearExcursion(positionId: string): void {
  marks.delete(positionId);
}

/** Prune marks for positions no longer open (prevents unbounded growth). */
export function pruneExcursions(openPositionIds: Set<string>): void {
  for (const id of marks.keys()) {
    if (!openPositionIds.has(id)) marks.delete(id);
  }
}

/** Number of positions currently being tracked (diagnostics). */
export function excursionCount(): number {
  return marks.size;
}
