import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Activity, Shield, Zap,
  BarChart2, RefreshCw, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CheckCircle2, Brain, Clock,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface ChartPt { label: string; close: number; volume: number; ema9: number | null; ema21: number | null; }

interface TFSnap { decision: string; confidence: number; rsi: number; ema9: number; ema21: number; macdState: string; shortSummary: string; }
interface SymBreakdown { symbol: string; fast: TFSnap; slow: TFSnap; mtfConfirmed: boolean; agreedAction: string; avgConfidence: number; blockReason: string; lastUpdated: number; }
interface EngineStatus {
  running: boolean; testMode: boolean; signalsGenerated: number; tradesExecuted: number;
  signalCounts: { BUY: number; SELL: number; HOLD: number };
  funnel: { total: number; passedMTF: number; blockedMTF: number; executed: number };
  symbolBreakdowns: Record<string, SymBreakdown>;
  recentSignalLog: Array<{ id: string; symbol: string; decision: string; confidence: number; shortSummary: string; blockReason: string | null; executedAs: string | null; timestamp: number; }>;
  lastTickAt: number | null;
}
interface AppSettings { allocation: number; maxTradesPerDay: number; minConfidence: number; autoMode: boolean; stopLossPercent: number; }
interface Trade { id: string; symbol: string; side: string; amount: number; price: number; pnl: number | null; pnlPercent: number | null; status: string; mode: string; timestamp: string; }

// ── EMA helper ────────────────────────────────────────────────────────────────
function calcEMA(values: number[], period: number): (number | null)[] {
  if (values.length < period) return new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(period - 1).fill(null);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) { ema = values[i] * k + ema * (1 - k); result.push(ema); }
  return result;
}
function buildChartData(candles: Candle[]): ChartPt[] {
  const closes = candles.map((c) => c.close);
  const ema9s  = calcEMA(closes, 9);
  const ema21s = calcEMA(closes, 21);
  return candles.map((c, i) => ({
    label:  new Date(c.time * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    close:  c.close, volume: c.volume, ema9: ema9s[i], ema21: ema21s[i],
  }));
}
function fmtPrice(v: number) {
  return v >= 10000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v >= 100 ? v.toFixed(2) : v.toFixed(4);
}
function ago(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Asset config ──────────────────────────────────────────────────────────────
const ASSETS = [
  { symbol: "BTCUSD", label: "BTC", color: "#F7931A" },
  { symbol: "ETHUSD", label: "ETH", color: "#627EEA" },
  { symbol: "SOLUSD", label: "SOL", color: "#9945FF" },
];

// ── Mini chart tooltip ────────────────────────────────────────────────────────
function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPt;
  if (!d) return null;
  return (
    <div className="bg-card border border-border/50 rounded-lg p-2 text-[10px] shadow-xl">
      <div className="text-muted-foreground/60 mb-1">{label}</div>
      <div className="font-mono font-bold">{fmtPrice(d.close)}</div>
    </div>
  );
}

// ── Mini asset chart ──────────────────────────────────────────────────────────
function MiniChart({ symbol, label, color, breakdown }: {
  symbol: string; label: string; color: string; breakdown?: SymBreakdown;
}) {
  const { data: candles, isLoading } = useQuery<Candle[]>({
    queryKey:        ["candles", symbol, "15m", 60],
    queryFn:         () => fetch(`/api/candles?symbol=${symbol}&timeframe=15m&limit=60`).then((r) => r.json()),
    refetchInterval: 60_000,
    staleTime:       30_000,
  });

  const chartData = candles ? buildChartData(candles) : [];
  const last      = chartData[chartData.length - 1];
  const first     = chartData[0];
  const pctChg    = first && last ? ((last.close - first.close) / first.close) * 100 : null;
  const isUp      = (pctChg ?? 0) >= 0;
  const decision  = breakdown?.agreedAction ?? "HOLD";
  const conf      = breakdown?.avgConfidence ?? 0;

  const maxVol = chartData.length ? Math.max(...chartData.map((d) => d.volume)) : 1;
  const prices = chartData.flatMap((d) => [d.close, d.ema9, d.ema21].filter(Boolean) as number[]);
  const pMin   = prices.length ? Math.min(...prices) : 0;
  const pMax   = prices.length ? Math.max(...prices) : 1;
  const pad    = (pMax - pMin) * 0.06;

  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
             style={{ backgroundColor: color + "25", color }}>
          {label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold leading-none">{symbol.replace("USD", "/USD")}</div>
          {last && <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">${fmtPrice(last.close)}</div>}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {pctChg !== null && (
            <span className={`text-[10px] font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? "+" : ""}{pctChg.toFixed(2)}%
            </span>
          )}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
            decision === "BUY"  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
            decision === "SELL" ? "bg-red-500/15 text-red-400 border-red-500/30" :
            "bg-muted/20 text-muted-foreground/60 border-border/30"
          }`}>{decision}</span>
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="flex items-center justify-center h-28 text-muted-foreground/30">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <YAxis yAxisId="p" domain={[pMin - pad, pMax + pad]} hide />
            <YAxis yAxisId="v" domain={[0, maxVol * 4.5]} hide />
            <Tooltip content={<MiniTooltip />} />
            <Bar yAxisId="v" dataKey="volume" fill={color} fillOpacity={0.18} radius={[1,1,0,0]} isAnimationActive={false} />
            <Line yAxisId="p" dataKey="close"  stroke={color}   strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line yAxisId="p" dataKey="ema9"   stroke="#fbbf24" strokeWidth={1}   dot={false} isAnimationActive={false} strokeDasharray="3 2" connectNulls />
            <Line yAxisId="p" dataKey="ema21"  stroke="#60a5fa" strokeWidth={1}   dot={false} isAnimationActive={false} strokeDasharray="5 3" connectNulls />
            {last?.close && <ReferenceLine yAxisId="p" y={last.close} stroke={color} strokeDasharray="2 4" strokeOpacity={0.4} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Confidence bar */}
      {conf > 0 && (
        <div className="px-3 pb-2.5 pt-1">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground/40 mb-1">
            <span>AI conf</span><span className="font-mono">{conf.toFixed(0)}%</span>
          </div>
          <div className="h-1 bg-muted/20 rounded overflow-hidden">
            <div className="h-full rounded transition-all" style={{ width: `${Math.min(100, conf)}%`, backgroundColor: color }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Signal summary ────────────────────────────────────────────────────────────
function SignalSummaryCard({ engine }: { engine: EngineStatus | undefined }) {
  const counts = engine?.signalCounts ?? { BUY: 0, SELL: 0, HOLD: 0 };
  const funnel = engine?.funnel ?? { total: 0, passedMTF: 0, blockedMTF: 0, executed: 0 };
  const total  = counts.BUY + counts.SELL + counts.HOLD || 1;

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Signal Summary</h3>
        <span className="ml-auto text-[10px] text-muted-foreground/50">{ago(engine?.lastTickAt ?? null)}</span>
      </div>

      {/* BUY / SELL / HOLD bars */}
      <div className="space-y-2 mb-3">
        {[
          { label: "BUY",  count: counts.BUY,  color: "#22c55e" },
          { label: "SELL", count: counts.SELL, color: "#ef4444" },
          { label: "HOLD", count: counts.HOLD, color: "#6b7280" },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-10 text-[10px] font-bold text-muted-foreground/60 text-right">{label}</div>
            <div className="flex-1 h-3 bg-muted/15 rounded overflow-hidden">
              <div className="h-full rounded transition-all" style={{ width: `${(count / total) * 100}%`, backgroundColor: color + "80" }} />
            </div>
            <div className="w-6 text-[10px] font-mono text-muted-foreground/50 text-right">{count}</div>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="border-t border-border/20 pt-3 grid grid-cols-2 gap-2 text-center">
        <div>
          <div className="text-base font-bold font-mono text-sky-400">{funnel.passedMTF}</div>
          <div className="text-[9px] text-muted-foreground/50">MTF passed</div>
        </div>
        <div>
          <div className="text-base font-bold font-mono text-emerald-400">{funnel.executed}</div>
          <div className="text-[9px] text-muted-foreground/50">Executed</div>
        </div>
      </div>

      {/* Engine state pills */}
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
          engine?.running
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : "bg-muted/20 text-muted-foreground/50 border-border/30"
        }`}>{engine?.running ? "● LOOP RUNNING" : "○ STOPPED"}</span>
        {engine?.testMode && (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold border bg-amber-500/15 text-amber-400 border-amber-500/30">TEST MODE</span>
        )}
      </div>
    </div>
  );
}

// ── Risk status card ──────────────────────────────────────────────────────────
function RiskCard({ engine, settings, tradesData }: {
  engine: EngineStatus | undefined;
  settings: AppSettings | undefined;
  tradesData: Trade[] | undefined;
}) {
  const maxTrades    = settings?.maxTradesPerDay ?? 5;
  const usedToday    = engine?.tradesExecuted ?? 0;
  const remaining    = Math.max(0, maxTrades - usedToday);
  const autoMode     = settings?.autoMode ?? false;
  const minConf      = settings?.minConfidence ?? 80;
  const riskPct      = remaining / maxTrades;

  const riskColor = riskPct > 0.5 ? "text-emerald-400" : riskPct > 0.2 ? "text-amber-400" : "text-red-400";
  const barColor  = riskPct > 0.5 ? "#22c55e"           : riskPct > 0.2 ? "#f59e0b"           : "#ef4444";

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Risk Status</h3>
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded border ${
          autoMode
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : "bg-muted/20 text-muted-foreground/60 border-border/30"
        }`}>{autoMode ? "AUTO ON" : "MANUAL"}</span>
      </div>

      {/* Trade capacity */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-muted-foreground/60">Trades remaining today</span>
          <span className={`font-bold font-mono ${riskColor}`}>{remaining} / {maxTrades}</span>
        </div>
        <div className="h-2 bg-muted/20 rounded overflow-hidden">
          <div className="h-full rounded transition-all" style={{ width: `${riskPct * 100}%`, backgroundColor: barColor }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-muted/10 rounded-lg p-2">
          <div className="text-sm font-bold font-mono">{settings?.allocation ?? 20}%</div>
          <div className="text-[9px] text-muted-foreground/50">Position size</div>
        </div>
        <div className="bg-muted/10 rounded-lg p-2">
          <div className="text-sm font-bold font-mono">{minConf}%</div>
          <div className="text-[9px] text-muted-foreground/50">Min confidence</div>
        </div>
        <div className="bg-muted/10 rounded-lg p-2">
          <div className="text-sm font-bold font-mono text-red-400">{settings?.stopLossPercent ?? 2}%</div>
          <div className="text-[9px] text-muted-foreground/50">Stop loss</div>
        </div>
        <div className="bg-muted/10 rounded-lg p-2">
          <div className="text-sm font-bold font-mono text-emerald-400">{engine?.tradesExecuted ?? 0}</div>
          <div className="text-[9px] text-muted-foreground/50">Total executed</div>
        </div>
      </div>
    </div>
  );
}

// ── AI market brief ───────────────────────────────────────────────────────────
function AIBriefCard({ engine }: { engine: EngineStatus | undefined }) {
  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">AI Market Brief</h3>
      </div>

      {breakdowns.length === 0 ? (
        <div className="text-center text-muted-foreground/40 text-xs py-4">Waiting for first tick…</div>
      ) : (
        <div className="space-y-2.5">
          {breakdowns.map((bd) => {
            const color = bd.symbol === "BTCUSD" ? "#F7931A" : bd.symbol === "ETHUSD" ? "#627EEA" : "#9945FF";
            const lbl   = bd.symbol.replace("USD", "");
            const rsi   = bd.fast.rsi;
            const emaOk = bd.fast.ema9 > bd.fast.ema21;
            return (
              <div key={bd.symbol} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/5 border border-border/20">
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                     style={{ backgroundColor: color + "25", color }}>
                  {lbl}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold">{lbl}</span>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${
                      bd.agreedAction === "BUY"  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                      bd.agreedAction === "SELL" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                      "bg-muted/20 text-muted-foreground/50 border-border/20"
                    }`}>{bd.agreedAction}</span>
                    <span className={`text-[9px] ml-auto ${rsi > 70 ? "text-red-400" : rsi < 35 ? "text-emerald-400" : "text-muted-foreground/50"}`}>
                      RSI {rsi.toFixed(0)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 leading-snug truncate">
                    {emaOk ? "EMA bullish (9>21)" : "EMA bearish (9<21)"} · MACD {bd.fast.macdState}
                  </div>
                  {bd.blockReason && bd.blockReason !== "None" && (
                    <div className="text-[9px] text-amber-400/70 mt-0.5 truncate">⚠ {bd.blockReason}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Active trades panel ───────────────────────────────────────────────────────
function ActiveTradesPanel({ trades }: { trades: Trade[] | undefined }) {
  const active = (trades ?? []).filter((t) => t.status === "open").slice(0, 8);
  const recent = (trades ?? []).filter((t) => t.status !== "open").slice(0, 4);

  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Active Trades</h3>
        <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
          active.length > 0 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted/20 text-muted-foreground/50 border-border/20"
        }`}>{active.length}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/40">{recent.length} closed recently</span>
      </div>

      {active.length === 0 && recent.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground/30 text-xs">No trades in this session</div>
      ) : (
        <div className="divide-y divide-border/15">
          {[...active, ...recent].slice(0, 6).map((t) => {
            const sym   = t.symbol.replace("USD", "");
            const color = t.symbol === "BTCUSD" ? "#F7931A" : t.symbol === "ETHUSD" ? "#627EEA" : "#9945FF";
            const pnl   = t.pnl ?? 0;
            const open  = t.status === "open";
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/5 transition-colors">
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                     style={{ backgroundColor: color + "25", color }}>
                  {sym}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold ${t.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                      {t.side.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">${fmtPrice(t.price)}</span>
                    {!open && <span className="text-[9px] text-muted-foreground/30 ml-auto">closed</span>}
                  </div>
                  <div className="text-[9px] text-muted-foreground/40 font-mono">
                    {new Date(t.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {!open && t.pnl != null && (
                  <div className={`text-xs font-bold font-mono ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                    {t.pnlPercent != null && (
                      <span className="text-[9px] block text-center opacity-70">
                        {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
                {open && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-sky-500/15 text-sky-400 border-sky-500/30">OPEN</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Quick stat chip ───────────────────────────────────────────────────────────
function StatChip({ label, value, color = "text-foreground", icon: Icon }: {
  label: string; value: string | number; color?: string; icon: any;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-card border border-border/40 rounded-xl px-3 py-2.5 flex-1 min-w-[100px]">
      <Icon className="w-4 h-4 text-muted-foreground/50 shrink-0" />
      <div className="min-w-0">
        <div className={`text-base font-bold font-mono leading-none ${color}`}>{value}</div>
        <div className="text-[10px] text-muted-foreground/50 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const { data: engine, isLoading: engLoading } = useQuery<EngineStatus>({
    queryKey:        ["engine-status-cmd"],
    queryFn:         () => fetch("/api/engine/status").then((r) => r.json()),
    refetchInterval: 12_000,
  });

  const { data: settings } = useQuery<AppSettings>({
    queryKey:  ["settings"],
    queryFn:   () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: trades } = useQuery<Trade[]>({
    queryKey:        ["trades-cmd"],
    queryFn:         () => fetch("/api/trades?limit=20").then((r) => r.json()),
    refetchInterval: 15_000,
  });

  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];
  const activeTrades = (trades ?? []).filter((t) => t.status === "open").length;
  const buySig  = engine?.signalCounts.BUY  ?? 0;
  const sellSig = engine?.signalCounts.SELL ?? 0;

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-screen-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Activity className="w-5 h-5 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold tracking-wide">Command Center</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono border bg-primary/10 text-primary border-primary/30">MODULE 19</span>
            {engine?.running && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/60">Unified view · all markets · all signals · all controls</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <Clock className="w-3 h-3" />
          Last tick {ago(engine?.lastTickAt ?? null)}
        </div>
      </div>

      {/* ── Quick stat bar ── */}
      <div className="flex gap-2 flex-wrap">
        <StatChip label="BUY signals"    value={buySig}        color="text-emerald-400" icon={TrendingUp} />
        <StatChip label="SELL signals"   value={sellSig}       color="text-red-400"     icon={TrendingDown} />
        <StatChip label="Executed"       value={engine?.tradesExecuted ?? 0} color={engine?.tradesExecuted ? "text-amber-400" : "text-muted-foreground"} icon={Zap} />
        <StatChip label="Active trades"  value={activeTrades}  color={activeTrades > 0 ? "text-sky-400" : "text-muted-foreground"} icon={BarChart2} />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Left 2/3 — Charts + Active Trades */}
        <div className="xl:col-span-2 space-y-4">

          {/* Mini charts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ASSETS.map((a) => {
              const bd = breakdowns.find((b) => b.symbol === a.symbol);
              return (
                <MiniChart key={a.symbol} symbol={a.symbol} label={a.label} color={a.color} breakdown={bd} />
              );
            })}
          </div>

          {/* Active trades */}
          <ActiveTradesPanel trades={trades} />
        </div>

        {/* Right 1/3 — Signal summary + Risk + AI brief */}
        <div className="space-y-4">
          <SignalSummaryCard engine={engine} />
          <RiskCard engine={engine} settings={settings} tradesData={trades} />
          <AIBriefCard engine={engine} />
        </div>
      </div>
    </div>
  );
}
