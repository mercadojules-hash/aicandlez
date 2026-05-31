/**
 * ExecutionMetricsPanel — operator diagnostic that separates the historically
 * conflated "executed" number into honest, independently-meaningful metrics and
 * proves every customer broker fill is reconcilable end-to-end (Issue #2).
 *
 * Reads GET /api/admin/execution-metrics (admin-gated):
 *   counters (in-memory, since last reset):
 *     Operator Sim Executions        — global operator/sim book opens (simulated)
 *     Customer Broker Orders Submitted
 *     Customer Broker Orders Filled  — broker-accepted + persisted only
 *     Broker Rejects
 *   live (DB ground truth):
 *     Live Positions (open)          — sim_positions WHERE exchange IS NOT NULL
 *     Closed Live Trades             — sim_trades WHERE exchange IS NOT NULL
 *   reconciliation:
 *     open live positions + recent closed live trades, each with its Broker
 *     Order ID and which records (position / live-trade / trade-history) exist.
 *
 * "Customer Broker Orders Filled" can never run ahead of a real persisted fill
 * because the server increments it from the single post-persistence hook.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cpu, Send, CheckCircle2, XCircle, Layers, Archive, RotateCcw, Link2,
} from "lucide-react";
import { authFetch, API_BASE_URL } from "@/lib/authFetch";

interface RecordPresence {
  brokerOrderId: boolean;
  positionRecord: boolean;
  liveTradeRecord: boolean;
  tradeHistoryRecord: boolean;
}

interface OpenLivePosition {
  positionId: string;
  userId: string;
  symbol: string;
  side: string;
  exchange: string | null;
  brokerOrderId: string | null;
  entryPrice: number | null;
  sizeUSD: number | null;
  openedAt: number | null;
  records: RecordPresence;
}

interface ClosedLiveTrade {
  tradeId: string;
  userId: string;
  symbol: string;
  side: string;
  exchange: string | null;
  brokerOrderId: string | null;
  brokerCloseOrderId: string | null;
  realizedPnL: number | null;
  closedAt: number | null;
  records: RecordPresence;
}

interface ExecutionMetricsResponse {
  since: number;
  counters: {
    operatorSimExecutions: number;
    customerBrokerOrdersSubmitted: number;
    customerBrokerOrdersFilled: number;
    brokerRejects: number;
  };
  live: {
    customerLivePositions: number;
    customerClosedTrades: number;
  };
  reconciliation: {
    openLivePositions: OpenLivePosition[];
    recentClosedLiveTrades: ClosedLiveTrade[];
  };
  serverNow: number;
}

function ago(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function shortId(id: string | null): string {
  if (!id) return "—";
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

type Tone = "neutral" | "info" | "good" | "bad";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "text-white/80",
  info:    "text-sky-300",
  good:    "text-emerald-300",
  bad:     "text-red-300",
};

function MetricCard({
  icon: Icon, label, value, hint, tone = "neutral",
}: {
  icon: typeof Cpu; label: string; value: number; hint: string; tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${TONE_CLASS[tone]}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-white/35">{hint}</div>
    </div>
  );
}

function RecordPips({ r }: { r: RecordPresence }) {
  const pips: { label: string; on: boolean }[] = [
    { label: "ORD", on: r.brokerOrderId },
    { label: "POS", on: r.positionRecord },
    { label: "LIVE", on: r.liveTradeRecord },
    { label: "HIST", on: r.tradeHistoryRecord },
  ];
  return (
    <div className="flex items-center gap-1">
      {pips.map((p) => (
        <span
          key={p.label}
          title={p.label}
          className={`px-1 py-0.5 rounded text-[9px] font-mono font-bold border ${
            p.on
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/5 text-white/25"
          }`}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}

export default function ExecutionMetricsPanel() {
  const qc = useQueryClient();

  const { data, isError, isLoading } = useQuery<ExecutionMetricsResponse>({
    queryKey: ["adminExecutionMetrics"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/admin/execution-metrics`, {
        method: "GET",
      });
      return res.json() as Promise<ExecutionMetricsResponse>;
    },
    refetchInterval: 5_000,
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/admin/execution-metrics/reset`, {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminExecutionMetrics"] }),
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-sm text-white/50">
        Loading execution metrics…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
        Execution metrics unavailable.
      </div>
    );
  }

  const c = data.counters;
  const live = data.live;
  const open = data.reconciliation.openLivePositions;
  const closed = data.reconciliation.recentClosedLiveTrades;

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-white/90">Execution Metrics</h2>
          <p className="text-[11px] text-white/40">
            Separated counters · simulated vs real broker · since {ago(data.since)}
          </p>
        </div>
        <button
          onClick={() => resetMut.mutate()}
          disabled={resetMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-card text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${resetMut.isPending ? "animate-spin" : ""}`} />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          icon={Cpu}
          label="Operator Sim Executions"
          value={c.operatorSimExecutions}
          hint="Global operator/sim book opens — simulated, not customer money."
          tone="info"
        />
        <MetricCard
          icon={Send}
          label="Broker Orders Submitted"
          value={c.customerBrokerOrdersSubmitted}
          hint="Customer live orders dispatched to a broker."
          tone="neutral"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Broker Orders Filled"
          value={c.customerBrokerOrdersFilled}
          hint="Broker-accepted AND persisted with a position record. Real fills only."
          tone="good"
        />
        <MetricCard
          icon={XCircle}
          label="Broker Rejects"
          value={c.brokerRejects}
          hint="Customer broker orders rejected by the exchange."
          tone="bad"
        />
        <MetricCard
          icon={Layers}
          label="Live Positions"
          value={live.customerLivePositions}
          hint="Open positions on a real exchange (DB ground truth)."
          tone="good"
        />
        <MetricCard
          icon={Archive}
          label="Closed Live Trades"
          value={live.customerClosedTrades}
          hint="Closed real-exchange trades in Trade History (DB ground truth)."
          tone="neutral"
        />
      </div>

      {/* ── Reconciliation feed ── */}
      <div className="mt-5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
        <Link2 className="w-3.5 h-3.5" />
        Reconciliation — every customer fill → Broker Order ID + records
      </div>

      <div className="mt-2 grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Open live positions */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold text-white/60">
            Open Live Positions ({open.length})
          </div>
          {open.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-[11px] text-white/30">
              No open live positions.
            </div>
          ) : (
            <div className="space-y-1.5">
              {open.map((p) => (
                <div
                  key={p.positionId}
                  className="rounded-lg border border-white/10 bg-black/20 p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-white/90">{p.symbol}</span>
                      <span className={p.side === "BUY" ? "text-emerald-400" : "text-red-400"}>
                        {p.side}
                      </span>
                      <span className="text-white/40">{p.exchange ?? "—"}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] font-mono text-white/40 truncate">
                      ORD {shortId(p.brokerOrderId)} · {ago(p.openedAt)}
                    </div>
                  </div>
                  <RecordPips r={p.records} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent closed live trades */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold text-white/60">
            Recent Closed Live Trades ({closed.length})
          </div>
          {closed.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-[11px] text-white/30">
              No closed live trades yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {closed.map((t) => (
                <div
                  key={t.tradeId}
                  className="rounded-lg border border-white/10 bg-black/20 p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-white/90">{t.symbol}</span>
                      <span className={t.side === "BUY" ? "text-emerald-400" : "text-red-400"}>
                        {t.side}
                      </span>
                      {t.realizedPnL != null && (
                        <span className={t.realizedPnL >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {t.realizedPnL >= 0 ? "+" : ""}
                          {t.realizedPnL.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] font-mono text-white/40 truncate">
                      ORD {shortId(t.brokerOrderId)} · CLS {shortId(t.brokerCloseOrderId)} · {ago(t.closedAt)}
                    </div>
                  </div>
                  <RecordPips r={t.records} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
