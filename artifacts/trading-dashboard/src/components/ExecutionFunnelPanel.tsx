/**
 * ExecutionFunnelPanel — operator diagnostic that answers "the scanner is
 * producing signals, why aren't they becoming trades?".
 *
 * Reads GET /api/admin/execution-funnel (admin-gated) and renders an 8-stage
 * execution funnel with per-stage drop-off, a rejection-reason breakdown
 * (sorted desc, bottleneck highlighted), and a recent-rejections feed. Counts
 * are cumulative since the last reset.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Filter, ShieldCheck, Droplets, Plug, Layers, Send, CheckCircle2,
  Radio, RotateCcw, AlertTriangle,
} from "lucide-react";
import { authFetch, API_BASE_URL } from "@/lib/authFetch";

type FunnelStage = "confidence" | "risk" | "liquidity" | "exchange" | "positionLimits";

interface FunnelSnapshot {
  since: number;
  blockedByStage: Record<FunnelStage, number>;
  totalBlocked: number;
  executionAttempted: number;
  executionSucceeded: number;
  rejectionsByReason: { reason: string; stage: FunnelStage; count: number }[];
  recent: {
    ts: number; stage: FunnelStage; reason: string;
    symbol: string | null; side: "BUY" | "SELL" | null;
    path: "operator" | "customer"; message: string;
  }[];
}

interface FunnelResponse {
  funnel: FunnelSnapshot;
  engine: {
    running: boolean;
    signalsGenerated: number;
    tradesExecuted: number;
    tradesBlocked: number;
    funnelExecuted: number;
    lastSignalAt: number | null;
    lastTradeAt: number | null;
    lastTickAt: number | null;
  };
  serverNow: number;
}

const STAGE_LABEL: Record<FunnelStage, string> = {
  confidence: "Confidence",
  risk: "Risk Checks",
  liquidity: "Liquidity Checks",
  exchange: "Exchange Validation",
  positionLimits: "Position Limits",
};

function ago(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function reasonNice(r: string): string {
  return r.replace(/^exchange:/, "").replace(/_/g, " ");
}

interface FunnelRow {
  key: string;
  label: string;
  count: number;
  blocked: number;
  icon: typeof Filter;
  tone: "neutral" | "good" | "warn";
}

export default function ExecutionFunnelPanel() {
  const qc = useQueryClient();

  const { data, isError, isLoading } = useQuery<FunnelResponse>({
    queryKey: ["adminExecutionFunnel"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/admin/execution-funnel`, {
        method: "GET",
      });
      return res.json() as Promise<FunnelResponse>;
    },
    refetchInterval: 5_000,
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/admin/execution-funnel/reset`, {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminExecutionFunnel"] }),
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-sm text-white/50">
        Loading execution funnel…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
        Execution funnel unavailable.
      </div>
    );
  }

  const f = data.funnel;
  const e = data.engine;

  // Derive a coherent top-down funnel. Every classified candidate ends at
  // exactly one outcome: blocked at one stage, or an execution attempt. All
  // five gates are PRE-attempt validation (confidence/risk/liquidity/exchange/
  // position-limits all reject before the broker order is sent — including
  // symbol_not_in_universe and order-minimum), matching the canonical stage
  // order. The subtraction order below is therefore presentational only; since
  // each bus event increments exactly one stage, the running total is coherent.
  //
  // NOTE: operator blocks/attempts are per-signal while customer blocks are
  // per-user fan-out, so the two grains can mix. The customer live path is OFF
  // by default (so it is ~0 in practice), but `clamp` still guards the display
  // from ever rendering a negative "passed" count if the grains diverge.
  const bs = f.blockedByStage;
  const totalStageBlocks =
    bs.confidence + bs.risk + bs.liquidity + bs.exchange + bs.positionLimits;
  const candidates = totalStageBlocks + f.executionAttempted;
  const clamp = (n: number) => Math.max(0, n);

  const passedConfidence = clamp(candidates - bs.confidence);
  const passedRisk = clamp(passedConfidence - bs.risk);
  const passedLiquidity = clamp(passedRisk - bs.liquidity);
  const passedExchange = clamp(passedLiquidity - bs.exchange);
  const passedPositions = clamp(passedExchange - bs.positionLimits);
  const attempted = f.executionAttempted;
  const succeeded = f.executionSucceeded;

  const rows: FunnelRow[] = [
    { key: "generated", label: "Signals Generated", count: e.signalsGenerated, blocked: 0, icon: Radio, tone: "neutral" },
    { key: "candidates", label: "Actionable Candidates", count: candidates, blocked: 0, icon: Filter, tone: "neutral" },
    { key: "confidence", label: "Passed Confidence", count: passedConfidence, blocked: bs.confidence, icon: Filter, tone: "neutral" },
    { key: "risk", label: "Passed Risk Checks", count: passedRisk, blocked: bs.risk, icon: ShieldCheck, tone: "neutral" },
    { key: "liquidity", label: "Passed Liquidity Checks", count: passedLiquidity, blocked: bs.liquidity, icon: Droplets, tone: "neutral" },
    { key: "exchange", label: "Passed Exchange Validation", count: passedExchange, blocked: bs.exchange, icon: Plug, tone: "neutral" },
    { key: "positionLimits", label: "Passed Position Limits", count: passedPositions, blocked: bs.positionLimits, icon: Layers, tone: "neutral" },
    { key: "attempted", label: "Execution Attempted", count: attempted, blocked: 0, icon: Send, tone: "neutral" },
    { key: "succeeded", label: "Execution Succeeded", count: succeeded, blocked: 0, icon: CheckCircle2, tone: "good" },
  ];

  const maxCount = Math.max(candidates, 1);

  // Bottleneck = stage with the most blocks.
  const bottleneck = (Object.entries(f.blockedByStage) as [FunnelStage, number][])
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n > 0)[0];

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
            Execution Funnel
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/40">
          <span>since {ago(f.since)}</span>
          <button
            onClick={() => resetMut.mutate()}
            disabled={resetMut.isPending}
            className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/60 transition hover:border-emerald-400/40 hover:text-emerald-300 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      </div>

      {/* Bottleneck banner */}
      {bottleneck && succeeded === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Primary bottleneck: <span className="font-semibold">{STAGE_LABEL[bottleneck[0]]}</span>{" "}
            blocked <span className="font-semibold">{bottleneck[1].toLocaleString()}</span> candidate
            {bottleneck[1] === 1 ? "" : "s"} — 0 trades have executed since reset.
          </span>
        </div>
      )}

      {/* Funnel rows */}
      <div className="space-y-1.5">
        {rows.map((r) => {
          const pct = Math.max(0, Math.min(100, (Math.max(0, r.count) / maxCount) * 100));
          const Icon = r.icon;
          return (
            <div key={r.key} className="group">
              <div className="flex items-center gap-3">
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    r.tone === "good" ? "text-emerald-400" : "text-white/40"
                  }`}
                />
                <div className="flex-1">
                  <div className="mb-0.5 flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-white/70">{r.label}</span>
                    <span className="flex items-baseline gap-2">
                      <span
                        className={`tabular-nums text-sm font-semibold ${
                          r.tone === "good" ? "text-emerald-300" : "text-white/90"
                        }`}
                      >
                        {Math.max(0, r.count).toLocaleString()}
                      </span>
                      {r.blocked > 0 && (
                        <span className="tabular-nums text-[11px] text-red-400/80">
                          −{r.blocked.toLocaleString()}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full transition-all ${
                        r.tone === "good"
                          ? "bg-emerald-400/80"
                          : "bg-gradient-to-r from-emerald-500/40 to-emerald-400/60"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two-column: rejection reasons + recent feed */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Rejection reasons */}
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Rejection Reasons
          </h4>
          {f.rejectionsByReason.length === 0 ? (
            <p className="text-[12px] text-white/40">No rejections recorded since reset.</p>
          ) : (
            <div className="space-y-1">
              {f.rejectionsByReason.slice(0, 12).map((rr, i) => (
                <div
                  key={rr.reason}
                  className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[12px] ${
                    i === 0
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-white/80">{reasonNice(rr.reason)}</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">
                      {STAGE_LABEL[rr.stage]}
                    </span>
                  </span>
                  <span className="tabular-nums font-semibold text-white/90">
                    {rr.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent rejections feed */}
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Recent Blocked Signals
          </h4>
          {f.recent.length === 0 ? (
            <p className="text-[12px] text-white/40">No blocked signals yet.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {f.recent.slice(0, 30).map((rj, i) => (
                <div key={`${rj.ts}-${i}`} className="flex items-center gap-2 text-[11px]">
                  <span className="w-12 shrink-0 tabular-nums text-white/30">{ago(rj.ts)}</span>
                  {rj.symbol && (
                    <span className="w-14 shrink-0 font-medium text-white/70">{rj.symbol}</span>
                  )}
                  {rj.side && (
                    <span
                      className={`shrink-0 ${rj.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {rj.side}
                    </span>
                  )}
                  <span className="truncate text-white/50">{reasonNice(rj.reason)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
