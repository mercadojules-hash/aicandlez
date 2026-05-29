import { authFetch } from "@/lib/authFetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity, GitMerge, TrendingUp, TrendingDown, Minus, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, FlaskConical, ChevronRight,
  Zap, BarChart2, Clock, Filter, ArrowRight,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts";

// ── Types ───────────────────────────────────────────────────────────────────

interface TimeframeSnap {
  decision: string; confidence: number;
  rsi: number; ema9: number; ema21: number; emaSignal: string;
  macdLine: number; macdSignal: number; macdState: string; shortSummary: string;
}

interface SymbolBreakdown {
  symbol: string; fast: TimeframeSnap; slow: TimeframeSnap;
  mtfConfirmed: boolean; agreedAction: string; avgConfidence: number;
  blockReason: string; lastUpdated: number;
  volumeConfirmed?: boolean;
  marketCondition?: "trending" | "sideways" | "neutral";
  trend1H?: "bullish" | "bearish" | "unknown";
}

interface SignalLogEntry {
  id: string; symbol: string; timeframe: string;
  decision: string; confidence: number; shortSummary: string;
  blockReason: string | null; executedAs: "auto" | "test" | null; timestamp: number;
}

interface EngineStatus {
  running: boolean; testMode: boolean;
  require1HTrend?: boolean; volumeFilter?: boolean;
  signalCounts: { BUY: number; SELL: number; HOLD: number };
  signalsGenerated: number; tradesExecuted: number;
  mtfConfirmedCount: number; mtfBlockCount: number;
  funnel: { total: number; passedMTF: number; blockedMTF: number; executed: number };
  symbolBreakdowns: Record<string, SymbolBreakdown>;
  recentSignalLog: SignalLogEntry[];
  lastTickAt: number | null; startedAt: number | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ago(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmt(n: number, d = 2) { return n.toFixed(d); }

function decisionColor(d: string) {
  if (d === "BUY")  return "text-emerald-400";
  if (d === "SELL") return "text-red-400";
  return "text-muted-foreground";
}

function DecisionBadge({ d }: { d: string }) {
  const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border";
  if (d === "BUY")  return <span className={`${base} bg-emerald-500/15 text-emerald-400 border-emerald-500/30`}><TrendingUp  className="w-3 h-3" />{d}</span>;
  if (d === "SELL") return <span className={`${base} bg-red-500/15    text-red-400    border-red-500/30`}   ><TrendingDown className="w-3 h-3" />{d}</span>;
  return               <span className={`${base} bg-muted/30          text-muted-foreground border-border/40`}><Minus        className="w-3 h-3" />{d}</span>;
}

function MtfBadge({ confirmed }: { confirmed: boolean }) {
  return confirmed
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-emerald-500/15 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3" />PASS</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-red-500/15 text-red-400 border-red-500/30"><XCircle className="w-3 h-3" />FAIL</span>;
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "text-foreground" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="text-xs text-muted-foreground/60 mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground/50 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Indicator row ────────────────────────────────────────────────────────────

function IndicatorRow({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: "bull" | "bear" | "neutral";
}) {
  const cls = highlight === "bull" ? "text-emerald-400" : highlight === "bear" ? "text-red-400" : "text-foreground/80";
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs text-muted-foreground/60">{label}</span>
      <div className="text-right">
        <span className={`text-xs font-mono ${cls}`}>{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground/40 ml-1">{sub}</span>}
      </div>
    </div>
  );
}

// ── Timeframe column ─────────────────────────────────────────────────────────

function TFColumn({ tf, snap }: { tf: string; snap: TimeframeSnap }) {
  const emaUp = snap.ema9 > snap.ema21;
  return (
    <div className="flex-1 min-w-0 p-3 rounded-lg bg-background/40 border border-border/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono text-muted-foreground/60">{tf}</span>
        <DecisionBadge d={snap.decision} />
      </div>
      <div className="space-y-0.5">
        <IndicatorRow
          label="Confidence"
          value={`${snap.confidence.toFixed(1)}%`}
          highlight={snap.confidence >= 60 ? "bull" : snap.confidence >= 40 ? "neutral" : "bear"}
        />
        <IndicatorRow
          label="RSI (14)"
          value={fmt(snap.rsi)}
          sub={snap.rsi < 35 ? "oversold" : snap.rsi > 65 ? "overbought" : "neutral"}
          highlight={snap.rsi < 35 ? "bull" : snap.rsi > 65 ? "bear" : "neutral"}
        />
        <IndicatorRow
          label="EMA 9"
          value={snap.ema9.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          highlight={emaUp ? "bull" : "bear"}
        />
        <IndicatorRow
          label="EMA 21"
          value={snap.ema21.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        />
        <IndicatorRow
          label="EMA bias"
          value={emaUp ? "9 > 21 ↑" : "9 < 21 ↓"}
          highlight={emaUp ? "bull" : "bear"}
        />
        <IndicatorRow
          label="MACD"
          value={snap.macdState}
          highlight={snap.macdState === "bullish" ? "bull" : snap.macdState === "bearish" ? "bear" : "neutral"}
        />
        <IndicatorRow
          label="MACD line"
          value={snap.macdLine.toFixed(4)}
          highlight={snap.macdLine > 0 ? "bull" : "bear"}
        />
      </div>
    </div>
  );
}

// ── Symbol breakdown card ────────────────────────────────────────────────────

const SYMBOL_META: Record<string, { label: string; color: string }> = {
  BTCUSD: { label: "BTC", color: "#F7931A" },
  ETHUSD: { label: "ETH", color: "#627EEA" },
  SOLUSD: { label: "SOL", color: "#9945FF" },
};

interface CandlePoint { time: number; close: number; volume: number }

function DebugMiniChart({ symbol }: { symbol: string }) {
  const meta   = SYMBOL_META[symbol];
  const stroke = meta?.color ?? "#64748b";

  const { data: candles, isLoading } = useQuery<CandlePoint[]>({
    queryKey: ["debugMiniChart", symbol],
    queryFn: async () => {
      const r = await authFetch(`/api/candles?symbol=${symbol}&timeframe=5m&limit=48`);
      if (!r.ok) throw new Error("candle fetch failed");
      return r.json();
    },
    staleTime:       20_000,
    refetchInterval: 60_000,
  });

  if (isLoading || !candles || candles.length < 2) {
    return <div className="h-12 flex items-center justify-center"><div className="w-3 h-3 border border-border border-t-foreground/40 rounded-full animate-spin" /></div>;
  }

  const first = candles[0]!.close;
  const last  = candles[candles.length - 1]!.close;
  const bullish  = last >= first;
  const fillBase = bullish ? "#10b981" : "#ef4444";
  const pctChg   = ((last - first) / first) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-muted-foreground/40">5m · 48 bars</span>
        <span className={`text-[9px] font-mono font-semibold ${bullish ? "text-emerald-400" : "text-red-400"}`}>
          {bullish ? "+" : ""}{pctChg.toFixed(2)}%
        </span>
      </div>
      <div className="h-12 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={candles} margin={{ top: 1, right: 0, left: 0, bottom: 1 }}>
            <defs>
              <linearGradient id={`dbg-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={fillBase} stopOpacity={0.25} />
                <stop offset="95%" stopColor={fillBase} stopOpacity={0}    />
              </linearGradient>
            </defs>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const c = payload[0]?.payload as CandlePoint;
                return (
                  <div className="bg-card border border-border rounded px-2 py-0.5 text-[9px] text-foreground/80">
                    ${c.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={stroke}
              strokeWidth={1.5}
              fill={`url(#dbg-${symbol})`}
              dot={false}
              activeDot={{ r: 2, fill: stroke }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SymbolCard({ bd }: { bd: SymbolBreakdown }) {
  const meta = SYMBOL_META[bd.symbol] ?? { label: bd.symbol, color: "#888" };
  const hasBlock = bd.blockReason && bd.blockReason !== "None";

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold" style={{ backgroundColor: meta.color + "25", color: meta.color }}>
          {meta.label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{bd.symbol.replace("USD", "/USD")}</span>
            <MtfBadge confirmed={bd.mtfConfirmed} />
          </div>
          <div className="text-[10px] text-muted-foreground/50">{ago(bd.lastUpdated)}</div>
        </div>
        <div className="text-right">
          <DecisionBadge d={bd.agreedAction} />
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">avg {bd.avgConfidence.toFixed(1)}%</div>
        </div>
      </div>

      {/* Block reason */}
      {hasBlock && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span className="text-[11px] text-amber-300">{bd.blockReason}</span>
        </div>
      )}

      {/* Mini price chart */}
      <DebugMiniChart symbol={bd.symbol} />

      {/* Quality filter badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {bd.volumeConfirmed !== undefined && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border
            ${bd.volumeConfirmed
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              : "bg-red-500/10 text-red-400 border-red-500/25"}`}>
            {bd.volumeConfirmed ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
            VOL {bd.volumeConfirmed ? "OK" : "LOW"}
          </span>
        )}
        {bd.marketCondition && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border
            ${bd.marketCondition === "trending"
              ? "bg-sky-500/10 text-sky-400 border-sky-500/25"
              : bd.marketCondition === "sideways"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                : "bg-slate-700/40 text-slate-400 border-slate-600/30"}`}>
            <Activity className="w-2.5 h-2.5" />
            {bd.marketCondition.toUpperCase()}
          </span>
        )}
        {bd.trend1H && bd.trend1H !== "unknown" && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border
            ${bd.trend1H === "bullish"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              : "bg-red-500/10 text-red-400 border-red-500/25"}`}>
            {bd.trend1H === "bullish" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            1H {bd.trend1H.toUpperCase()}
          </span>
        )}
      </div>

      {/* 5m + 15m columns */}
      <div className="flex gap-2">
        <TFColumn tf="5m" snap={bd.fast} />
        <TFColumn tf="15m" snap={bd.slow} />
      </div>

      {/* Short summary */}
      <div className="text-[10px] text-muted-foreground/50 italic leading-tight px-1">
        {bd.fast.shortSummary}
      </div>
    </div>
  );
}

// ── Execution funnel ─────────────────────────────────────────────────────────

function FunnelBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-xs text-muted-foreground/70 text-right">{label}</div>
      <div className="flex-1 h-5 bg-muted/20 rounded overflow-hidden relative">
        <div className="h-full rounded transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        <div className="absolute inset-0 flex items-center px-2">
          <span className="text-[11px] font-mono font-bold text-white/80">{count}</span>
        </div>
      </div>
      <div className="w-12 shrink-0 text-xs text-muted-foreground/50 font-mono">{pct}%</div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SignalDebug() {
  const qc = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery<EngineStatus>({
    queryKey:        ["engine-debug"],
    queryFn:         () => authFetch("/api/engine/status").then((r) => r.json()),
    refetchInterval: 15_000,
  });

  const testModeMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      authFetch("/api/engine/testmode", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engine-debug"] }),
  });

  const filterMutation = useMutation({
    mutationFn: (patch: { volumeFilter?: boolean; require1HTrend?: boolean }) =>
      authFetch("/api/engine/filters", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engine-debug"] }),
  });

  const d = data;
  const breakdowns = d ? Object.values(d.symbolBreakdowns) : [];
  const log        = d?.recentSignalLog ?? [];
  const funnel     = d?.funnel ?? { total: 0, passedMTF: 0, blockedMTF: 0, executed: 0 };
  const counts     = d?.signalCounts ?? { BUY: 0, SELL: 0, HOLD: 0 };

  // Signals per minute estimate (based on generated count and runtime)
  const uptimeMins = d?.startedAt ? Math.max(1, Math.round((Date.now() - d.startedAt) / 60_000)) : 1;
  const sigPerMin  = d ? (d.signalsGenerated / uptimeMins).toFixed(1) : "—";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Activity className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-wide">Signal Debug</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border bg-primary/10 text-primary border-primary/30">
              WHY NO TRADES?
            </span>
            {d?.running && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LOOP RUNNING
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground/60">
            Real-time signal analysis · Last tick {ago(d?.lastTickAt ?? null)} · Auto-refreshes every 15s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-card text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32 text-muted-foreground/40">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading engine data…
        </div>
      )}

      {d && (
        <>
          {/* ── 1. Signal frequency counters ── */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3">Signal Frequency</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Total Signals"   value={d.signalsGenerated}  sub={`${sigPerMin}/min`} />
              <StatCard label="BUY Signals"     value={counts.BUY}          color="text-emerald-400" sub={d.signalsGenerated > 0 ? `${Math.round(counts.BUY / d.signalsGenerated * 100)}%` : "0%"} />
              <StatCard label="SELL Signals"    value={counts.SELL}         color="text-red-400"     sub={d.signalsGenerated > 0 ? `${Math.round(counts.SELL / d.signalsGenerated * 100)}%` : "0%"} />
              <StatCard label="HOLD Signals"    value={counts.HOLD}         color="text-muted-foreground" sub={d.signalsGenerated > 0 ? `${Math.round(counts.HOLD / d.signalsGenerated * 100)}%` : "0%"} />
              <StatCard label="MTF Confirmed"   value={d.mtfConfirmedCount} color="text-sky-400"     sub="both TFs agreed" />
              <StatCard label="Executed Trades" value={d.tradesExecuted}    color={d.tradesExecuted > 0 ? "text-emerald-400" : "text-muted-foreground"} sub={d.testMode ? "incl. test mode" : "auto mode"} />
            </div>
          </div>

          {/* ── 2. Execution funnel ── */}
          <div className="bg-card border border-border/40 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-muted-foreground/60" />
              <h2 className="text-sm font-semibold">Execution Funnel</h2>
              <span className="ml-auto text-xs text-muted-foreground/50">Why signals don't become trades</span>
            </div>
            <div className="space-y-2.5">
              <FunnelBar label="Signals in"    count={funnel.total}      total={funnel.total}  color="#6366f1" />
              <div className="flex items-center gap-2 pl-24">
                <ArrowRight className="w-3 h-3 text-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground/40">MTF gate: 5m AND 15m must agree direction</span>
              </div>
              <FunnelBar label="MTF PASS"      count={funnel.passedMTF}  total={funnel.total}  color="#22c55e" />
              <FunnelBar label="MTF BLOCKED"   count={funnel.blockedMTF} total={funnel.total}  color="#ef4444" />
              <div className="flex items-center gap-2 pl-24">
                <ArrowRight className="w-3 h-3 text-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground/40">Then: confidence threshold + risk engine + daily cap</span>
              </div>
              <FunnelBar label="Executed"       count={funnel.executed}   total={funnel.total}  color="#f59e0b" />
            </div>
            {funnel.blockedMTF > 0 && funnel.passedMTF === 0 && (
              <div className="mt-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <strong>Root cause:</strong> 100% of signals blocked at MTF gate — 5m and 15m are not agreeing on the same direction. Markets are in HOLD/neutral territory. Waiting for a trending move.
              </div>
            )}
          </div>

          {/* ── 3. Test mode toggle ── */}
          <div className="bg-card border border-border/40 rounded-xl p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <FlaskConical className="w-4 h-4 text-muted-foreground/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold">Execution Mode</span>
                  {d.testMode ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-500/15 text-amber-400 border-amber-500/30">TEST MODE</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-sky-500/15 text-sky-400 border-sky-500/30">STRICT MODE</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground/60">
                  {d.testMode
                    ? "TEST MODE: trades execute when confidence ≥ 35% OR single-TF confidence ≥ 60%. Trades tagged 'test'."
                    : "STRICT MODE: both 5m and 15m must agree on direction, average confidence must meet threshold."}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => testModeMutation.mutate(false)}
                  disabled={!d.testMode || testModeMutation.isPending}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    !d.testMode
                      ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                      : "bg-muted/20 text-muted-foreground border-border/40 hover:border-border"
                  }`}
                >
                  Strict Mode
                </button>
                <button
                  onClick={() => testModeMutation.mutate(true)}
                  disabled={d.testMode || testModeMutation.isPending}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    d.testMode
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                      : "bg-muted/20 text-muted-foreground border-border/40 hover:border-border"
                  }`}
                >
                  Test Mode
                </button>
              </div>
            </div>
          </div>

          {/* ── 4. Quality filter toggles ── */}
          <div className="bg-card border border-border/40 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-muted-foreground/60" />
              <span className="text-sm font-semibold">Signal Quality Filters</span>
              <span className="text-[10px] text-muted-foreground/40 ml-1">(bypassed in test mode)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Volume filter */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/10 border border-border/30">
                <div>
                  <div className="text-xs font-semibold text-foreground/80">Volume Confirmation</div>
                  <div className="text-[10px] text-muted-foreground/50 mt-0.5">Block low-volume signals (current &lt; 65% of avg)</div>
                </div>
                <button
                  onClick={() => filterMutation.mutate({ volumeFilter: !(d?.volumeFilter ?? true) })}
                  disabled={filterMutation.isPending}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    (d?.volumeFilter ?? true)
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-muted/20 text-muted-foreground border-border/40"
                  }`}
                >
                  {(d?.volumeFilter ?? true) ? "ON" : "OFF"}
                </button>
              </div>
              {/* 1H trend filter */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/10 border border-border/30">
                <div>
                  <div className="text-xs font-semibold text-foreground/80">1H Trend Alignment</div>
                  <div className="text-[10px] text-muted-foreground/50 mt-0.5">Require 1H EMA9 &gt; EMA21 to match signal</div>
                </div>
                <button
                  onClick={() => filterMutation.mutate({ require1HTrend: !(d?.require1HTrend ?? false) })}
                  disabled={filterMutation.isPending}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    (d?.require1HTrend ?? false)
                      ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                      : "bg-muted/20 text-muted-foreground border-border/40"
                  }`}
                >
                  {(d?.require1HTrend ?? false) ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>

          {/* ── 5. Signal breakdown per symbol ── */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3 flex items-center gap-2">
              <GitMerge className="w-3.5 h-3.5" /> Signal Breakdown · 5m vs 15m per symbol
            </h2>
            {breakdowns.length === 0 ? (
              <div className="text-center text-muted-foreground/40 py-12 border border-border/30 rounded-xl">
                Waiting for first tick… check back in ~60 seconds
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {breakdowns.map((bd) => <SymbolCard key={bd.symbol} bd={bd} />)}
              </div>
            )}
          </div>

          {/* ── 5. Last 10 signals log ── */}
          <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 p-4 border-b border-border/30">
              <Clock className="w-4 h-4 text-muted-foreground/60" />
              <h2 className="text-sm font-semibold">Last {log.length} Signal Evaluations</h2>
              <span className="ml-auto text-xs text-muted-foreground/50">Most recent first</span>
            </div>
            {log.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground/40 text-sm">
                No signals yet — first tick fires in ~60s
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {log.map((entry, i) => (
                  <div key={entry.id ?? i} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/5 transition-colors">
                    <div className="w-14 shrink-0 text-[10px] font-mono text-muted-foreground/50 mt-0.5">{ago(entry.timestamp)}</div>
                    <div className="w-16 shrink-0 font-mono text-xs font-bold" style={{ color: SYMBOL_META[entry.symbol]?.color ?? "#888" }}>
                      {SYMBOL_META[entry.symbol]?.label ?? entry.symbol}
                    </div>
                    <div className="shrink-0"><DecisionBadge d={entry.decision} /></div>
                    <div className="shrink-0 w-12 text-right text-xs font-mono text-muted-foreground/60">
                      {entry.confidence.toFixed(1)}%
                    </div>
                    <div className="flex-1 min-w-0 text-xs text-muted-foreground/70 truncate">
                      {entry.shortSummary}
                    </div>
                    <div className="shrink-0 text-right">
                      {entry.executedAs ? (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          entry.executedAs === "test"
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        }`}>
                          <Zap className="w-2.5 h-2.5" /> {entry.executedAs.toUpperCase()}
                        </span>
                      ) : entry.blockReason ? (
                        <span className="text-[10px] text-amber-300/70 max-w-[160px] text-right truncate block">
                          {entry.blockReason}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/30">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
