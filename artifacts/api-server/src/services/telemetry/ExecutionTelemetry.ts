import { logger } from "../../lib/logger.js";

// ── ExecutionTelemetry ────────────────────────────────────────────────────────
//
// Records and exposes execution-level telemetry for every order placed:
//   - Signal-to-order latency (ms from signal received to order sent)
//   - Order-to-fill latency (ms from order sent to fill confirmed)
//   - Exchange round-trip latency
//   - Fill quality (slippage vs expected)
//   - Rejection / error rates
//   - Per-symbol and per-exchange performance breakdown
//
// Used by:
//   - Platform dashboard system health panel
//   - Mobile app telemetry endpoint
//   - Admin analytics
//   - SLA monitoring

export interface ExecutionRecord {
  id:             string;
  userId:         string;
  exchange:       string;
  symbol:         string;
  side:           "buy" | "sell";
  sizeUSD:        number;
  expectedPrice:  number;
  fillPrice:      number;
  slippagePct:    number;
  status:         "filled" | "rejected" | "partial" | "timeout";
  signalAt:       number;        // unix ms when signal fired
  sentAt:         number;        // unix ms when order was sent to exchange
  confirmedAt:    number | null; // unix ms when fill confirmed
  signalLatencyMs:  number;      // sentAt - signalAt
  fillLatencyMs:    number | null; // confirmedAt - sentAt
  roundTripMs:      number | null; // confirmedAt - signalAt
  errorMessage:   string | null;
  mode:           "simulation" | "live";
  sessionId:      string;
}

export interface LatencyStats {
  exchange:           string;
  sampleCount:        number;
  avgSignalLatencyMs: number;
  p50SignalLatencyMs: number;
  p95SignalLatencyMs: number;
  avgFillLatencyMs:   number;
  p95FillLatencyMs:   number;
  avgRoundTripMs:     number;
  avgSlippagePct:     number;
  fillRate:           number;    // filled / total attempts
  rejectionRate:      number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

class ExecutionTelemetryStore {
  private records: ExecutionRecord[] = [];
  private readonly MAX_RECORDS = 10_000;

  append(record: ExecutionRecord): void {
    this.records.unshift(record);
    if (this.records.length > this.MAX_RECORDS) this.records.pop();

    if (record.status === "rejected") {
      logger.warn({
        userId: record.userId, exchange: record.exchange, symbol: record.symbol,
        error: record.errorMessage,
      }, "ExecutionTelemetry: order rejected");
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  getRecent(limit = 100, userId?: string): ExecutionRecord[] {
    const base = userId ? this.records.filter(r => r.userId === userId) : this.records;
    return base.slice(0, limit);
  }

  getLatencyStats(exchange?: string): LatencyStats[] {
    const grouped: Record<string, ExecutionRecord[]> = {};
    for (const r of this.records) {
      const key = exchange ? exchange : r.exchange;
      if (exchange && r.exchange !== exchange) continue;
      if (!grouped[key]) grouped[key] = [];
      grouped[key]!.push(r);
    }

    return Object.entries(grouped).map(([exch, recs]) => {
      const signalLats = recs.map(r => r.signalLatencyMs).filter(Boolean).sort((a, b) => a - b);
      const fillLats   = recs.map(r => r.fillLatencyMs).filter((v): v is number => v !== null).sort((a, b) => a - b);
      const rts        = recs.map(r => r.roundTripMs).filter((v): v is number => v !== null);
      const filled     = recs.filter(r => r.status === "filled" || r.status === "partial");
      const rejected   = recs.filter(r => r.status === "rejected");

      return {
        exchange:           exch,
        sampleCount:        recs.length,
        avgSignalLatencyMs: avg(signalLats),
        p50SignalLatencyMs: percentile(signalLats, 50),
        p95SignalLatencyMs: percentile(signalLats, 95),
        avgFillLatencyMs:   avg(fillLats),
        p95FillLatencyMs:   percentile(fillLats, 95),
        avgRoundTripMs:     avg(rts),
        avgSlippagePct:     parseFloat((recs.reduce((s, r) => s + r.slippagePct, 0) / Math.max(recs.length, 1)).toFixed(4)),
        fillRate:           recs.length > 0 ? filled.length / recs.length : 0,
        rejectionRate:      recs.length > 0 ? rejected.length / recs.length : 0,
      };
    });
  }

  // Per-symbol performance
  getSymbolBreakdown(): Array<{ symbol: string; fills: number; avgSlippage: number; avgFillMs: number }> {
    const groups: Record<string, ExecutionRecord[]> = {};
    for (const r of this.records) {
      if (!groups[r.symbol]) groups[r.symbol] = [];
      groups[r.symbol]!.push(r);
    }
    return Object.entries(groups).map(([symbol, recs]) => {
      const filled  = recs.filter(r => r.status === "filled");
      const fillMs  = filled.map(r => r.fillLatencyMs).filter((v): v is number => v !== null);
      return {
        symbol,
        fills:      filled.length,
        avgSlippage: parseFloat((recs.reduce((s, r) => s + r.slippagePct, 0) / Math.max(recs.length, 1)).toFixed(4)),
        avgFillMs:   avg(fillMs),
      };
    });
  }

  totalCount(): number     { return this.records.length; }
  clearOld(olderThanMs: number): void {
    const cutoff = Date.now() - olderThanMs;
    this.records = this.records.filter(r => r.signalAt >= cutoff);
  }
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1));
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

export const executionTelemetry = new ExecutionTelemetryStore();
