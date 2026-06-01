/**
 * profitReport — consolidated per-customer profit report (Profit
 * Optimization P7).
 *
 * A single read-only rollup of a customer's realized trading performance,
 * computed from their own `sim_trades` (closed legs) plus their live-order
 * attempt funnel (`customerExecutionAttribution.ts`) for the attempt→fill
 * conversion. Pure compute (`computeProfitReport`) is separated from the DB
 * read so it stays unit-testable; the route supplies the rows.
 *
 * close_reason breakdown uses the distinct reasons stamped by the exit engine
 * (TAKE_PROFIT / STOP_LOSS / TRAILING_STOP / MAX_HOLD, plus MANUAL / OTHER) so
 * the let-winners-run work (P3) shows up here as a TP-vs-trailing-vs-maxhold
 * split.
 */

import { categoryForSymbol, type SymbolCategory } from "./symbolCategories.js";

/** Minimal closed-trade shape this report needs from sim_trades. */
export interface ProfitReportTrade {
  symbol: string;
  realizedPnL: number;
  durationMs: number;
  closeReason: string | null;
  exchange: string | null;
}

export interface ProfitReportFunnel {
  attempts: number;
  successes: number;
}

export type CloseReasonKey =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "TRAILING_STOP"
  | "MAX_HOLD"
  | "MANUAL"
  | "OTHER";

const CLOSE_REASON_KEYS: readonly CloseReasonKey[] = [
  "TAKE_PROFIT",
  "STOP_LOSS",
  "TRAILING_STOP",
  "MAX_HOLD",
  "MANUAL",
  "OTHER",
] as const;

function normalizeCloseReason(raw: string | null): CloseReasonKey {
  const r = (raw ?? "").toUpperCase();
  if (r === "TAKE_PROFIT" || r === "STOP_LOSS" || r === "TRAILING_STOP" || r === "MAX_HOLD" || r === "MANUAL") {
    return r;
  }
  return "OTHER";
}

export interface RankedPnL {
  key: string;
  realizedPnL: number;
  trades: number;
}

export interface ProfitReport {
  /** Total closed trades counted. */
  tradeCount: number;
  wins: number;
  losses: number;
  /** wins / tradeCount (0..1). */
  winRate: number;
  totalRealizedPnL: number;
  avgWin: number;
  avgLoss: number; // negative or 0
  /** Σwins / |Σlosses|; null when there are no losses (undefined ratio). */
  profitFactor: number | null;
  /** Average hold time in ms across all counted trades. */
  avgHoldMs: number;
  /** Live-order attempt→fill conversion (successes / attempts), 0..1. */
  attemptToFillRate: number;
  attempts: number;
  fills: number;
  /** Realized P&L grouped by category, desc. */
  byCategory: Array<{ category: SymbolCategory; realizedPnL: number; trades: number }>;
  /** Realized P&L grouped by exchange (live legs only), desc. */
  byExchange: RankedPnL[];
  /** Top symbols by realized P&L, desc (capped). */
  bySymbol: RankedPnL[];
  /** Closes broken down by reason. */
  closesByReason: Array<{ reason: CloseReasonKey; count: number }>;
}

const TOP_SYMBOLS = 8;

export function computeProfitReport(
  trades: ProfitReportTrade[],
  funnel: ProfitReportFunnel,
): ProfitReport {
  let wins = 0;
  let losses = 0;
  let sumWin = 0;
  let sumLoss = 0; // accumulates negative values
  let totalPnL = 0;
  let totalHold = 0;

  const catMap = new Map<SymbolCategory, { pnl: number; trades: number }>();
  const exMap = new Map<string, { pnl: number; trades: number }>();
  const symMap = new Map<string, { pnl: number; trades: number }>();
  const reasonCounts = new Map<CloseReasonKey, number>();
  for (const k of CLOSE_REASON_KEYS) reasonCounts.set(k, 0);

  for (const t of trades) {
    const pnl = Number.isFinite(t.realizedPnL) ? t.realizedPnL : 0;
    totalPnL += pnl;
    totalHold += Number.isFinite(t.durationMs) ? t.durationMs : 0;
    if (pnl > 0) {
      wins += 1;
      sumWin += pnl;
    } else if (pnl < 0) {
      losses += 1;
      sumLoss += pnl;
    }

    const cat = categoryForSymbol(t.symbol);
    const c = catMap.get(cat) ?? { pnl: 0, trades: 0 };
    c.pnl += pnl;
    c.trades += 1;
    catMap.set(cat, c);

    if (t.exchange) {
      const e = exMap.get(t.exchange) ?? { pnl: 0, trades: 0 };
      e.pnl += pnl;
      e.trades += 1;
      exMap.set(t.exchange, e);
    }

    const s = symMap.get(t.symbol) ?? { pnl: 0, trades: 0 };
    s.pnl += pnl;
    s.trades += 1;
    symMap.set(t.symbol, s);

    const reason = normalizeCloseReason(t.closeReason);
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const tradeCount = trades.length;
  const winRate = tradeCount > 0 ? wins / tradeCount : 0;
  const avgWin = wins > 0 ? sumWin / wins : 0;
  const avgLoss = losses > 0 ? sumLoss / losses : 0;
  const profitFactor =
    sumLoss < 0 ? sumWin / Math.abs(sumLoss) : null;
  const avgHoldMs = tradeCount > 0 ? Math.round(totalHold / tradeCount) : 0;

  const attempts = Math.max(0, funnel.attempts);
  const fills = Math.max(0, funnel.successes);
  const attemptToFillRate = attempts > 0 ? fills / attempts : 0;

  const byCategory = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      realizedPnL: round2(v.pnl),
      trades: v.trades,
    }))
    .sort((a, b) => b.realizedPnL - a.realizedPnL);

  const byExchange = Array.from(exMap.entries())
    .map(([key, v]) => ({ key, realizedPnL: round2(v.pnl), trades: v.trades }))
    .sort((a, b) => b.realizedPnL - a.realizedPnL);

  const bySymbol = Array.from(symMap.entries())
    .map(([key, v]) => ({ key, realizedPnL: round2(v.pnl), trades: v.trades }))
    .sort((a, b) => b.realizedPnL - a.realizedPnL)
    .slice(0, TOP_SYMBOLS);

  const closesByReason = CLOSE_REASON_KEYS.map((reason) => ({
    reason,
    count: reasonCounts.get(reason) ?? 0,
  }));

  return {
    tradeCount,
    wins,
    losses,
    winRate: parseFloat(winRate.toFixed(4)),
    totalRealizedPnL: round2(totalPnL),
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    profitFactor: profitFactor === null ? null : parseFloat(profitFactor.toFixed(4)),
    avgHoldMs,
    attemptToFillRate: parseFloat(attemptToFillRate.toFixed(4)),
    attempts,
    fills,
    byCategory,
    byExchange,
    bySymbol,
    closesByReason,
  };
}

function round2(n: number): number {
  return Number.isFinite(n) ? parseFloat(n.toFixed(2)) : 0;
}
