import { authFetch } from "@/lib/authFetch";
import { useState } from "react";
import {
  BarChart2, Play, RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  CheckCircle2, Trophy, Target, Zap, Clock, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BacktestTrade {
  n: number;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  returnPct: number;
  returnUSD: number;
  won: boolean;
}

interface BacktestResult {
  config: {
    symbol: string;
    timeframe: string;
    initialCapital: number;
    candleCount: number;
    periodLabel: string;
    strategy: string;
  };
  metrics: {
    totalReturn: number;
    totalReturnUSD: number;
    winRate: number;
    maxDrawdown: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    profitFactor: number;
    avgWinPct: number;
    avgLossPct: number;
    benchmarkReturn: number;
    finalEquity: number;
    sharpeRatio: number;
  };
  trades: BacktestTrade[];
  equityCurve: Array<{ time: number; equity: number; pct: number }>;
  runAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SYMBOLS = [
  { id: "BTCUSD", label: "BTC", name: "Bitcoin",  color: "#F7931A" },
  { id: "ETHUSD", label: "ETH", name: "Ethereum", color: "#627EEA" },
  { id: "SOLUSD", label: "SOL", name: "Solana",   color: "#9945FF" },
];
const TIMEFRAMES = [
  { id: "1h",  label: "1 Hour",  detail: "~30 day window"   },
  { id: "4h",  label: "4 Hour",  detail: "~120 day window"  },
  { id: "1d",  label: "1 Day",   detail: "~365 day window"  },
  { id: "15m", label: "15 Min",  detail: "~5 day window"    },
  { id: "5m",  label: "5 Min",   detail: "~1.7 day window"  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function usd(n: number, dec = 2) {
  const sign = n < 0 ? "−$" : "$";
  return sign + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pct(n: number, d = 2, showSign = true) {
  const sign = showSign ? (n >= 0 ? "+" : "") : "";
  return sign + n.toFixed(d) + "%";
}
function tsLabel(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Equity Curve SVG ──────────────────────────────────────────────────────────

function EquityCurve({ curve, initialCapital, benchmarkReturn }: {
  curve: BacktestResult["equityCurve"];
  initialCapital: number;
  benchmarkReturn: number;
}) {
  if (curve.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/30 text-sm">
        No equity data
      </div>
    );
  }

  const W = 800;
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 24, left: 60 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  const equities = curve.map(p => p.equity);
  const benchFinal = initialCapital * (1 + benchmarkReturn / 100);
  const benchArr = curve.map((_, i) =>
    initialCapital + (benchFinal - initialCapital) * (i / (curve.length - 1))
  );

  const allVals = [...equities, ...benchArr, initialCapital];
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const rangeV = maxV === minV ? 1 : maxV - minV;

  const px = (i: number) => PAD.left + (i / (curve.length - 1)) * iW;
  const py = (v: number) => PAD.top + iH - ((v - minV) / rangeV) * iH;

  const stratPath = equities.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const benchPath = benchArr.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const areaClose = ` L${px(curve.length - 1).toFixed(1)},${py(minV).toFixed(1)} L${PAD.left},${py(minV).toFixed(1)} Z`;

  const isProfit  = equities[equities.length - 1]! >= initialCapital;
  const lineColor = isProfit ? "#34d399" : "#f87171";
  const yTicks    = [minV, (minV + maxV) / 2, maxV];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={py(v)} x2={W - PAD.right} y2={py(v)}
            stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
          <text x={PAD.left - 6} y={py(v) + 4} textAnchor="end" fontSize="9"
            fill="currentColor" fillOpacity="0.35">
            {Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`}
          </text>
        </g>
      ))}

      <line x1={PAD.left} y1={py(initialCapital)} x2={W - PAD.right} y2={py(initialCapital)}
        stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="4 4" />

      <path d={stratPath + areaClose} fill="url(#eqGrad)" />
      <path d={benchPath} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeOpacity="0.45" strokeDasharray="6 3" />
      <path d={stratPath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <g>
        <line x1={W - 110} y1={PAD.top + 9} x2={W - 96} y2={PAD.top + 9}
          stroke={lineColor} strokeWidth="2.5" />
        <text x={W - 92} y={PAD.top + 13} fontSize="9" fill={lineColor} fillOpacity="0.9">Strategy</text>
        <line x1={W - 110} y1={PAD.top + 23} x2={W - 96} y2={PAD.top + 23}
          stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" strokeOpacity="0.7" />
        <text x={W - 92} y={PAD.top + 27} fontSize="9" fill="#94a3b8" fillOpacity="0.7">Buy &amp; Hold</text>
      </g>
    </svg>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-background border border-border/30 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground/60 mb-2 text-xs">{icon}{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/40 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Backtest() {
  const [symbol,         setSymbol]    = useState("BTCUSD");
  const [timeframe,      setTimeframe] = useState("1h");
  const [initialCapital, setCapital]   = useState(10000);
  const [running,        setRunning]   = useState(false);
  const [result,         setResult]    = useState<BacktestResult | null>(null);
  const [error,          setError]     = useState<string | null>(null);
  const [showAllTrades,  setShowAll]   = useState(false);

  async function runBacktest() {
    setRunning(true);
    setError(null);
    setResult(null);
    setShowAll(false);
    try {
      const res = await authFetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, initialCapital }),
      });
      const data: BacktestResult & { error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const m = result?.metrics;
  const sym = SYMBOLS.find(s => s.id === symbol);
  const visibleTrades = showAllTrades ? result?.trades : result?.trades.slice(0, 8);

  return (
    <div className="flex flex-col gap-5 max-w-[1100px]">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono text-primary tracking-widest uppercase">Module 07 · Backtesting</span>
        </div>
        <h1 className="text-xl font-bold">Backtesting Engine</h1>
        <p className="text-sm text-muted-foreground">
          EMA Crossover strategy on historical Kraken data · Equity curve · Win rate · Max drawdown
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-red-900/40 bg-red-950/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">

        {/* ── Config panel ─────────────────────────────────────────────────────── */}
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-muted-foreground/50" />
            <span className="text-sm font-semibold">Configuration</span>
          </div>

          <div className="p-5 flex flex-col gap-5 flex-1">
            {/* Symbol */}
            <div>
              <label className="text-xs text-muted-foreground/70 mb-2 block">Asset</label>
              <div className="flex flex-col gap-1.5">
                {SYMBOLS.map((s) => (
                  <button key={s.id} onClick={() => setSymbol(s.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm transition-all text-left ${
                      symbol === s.id
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/30 text-muted-foreground/60 hover:text-foreground hover:border-border/50"
                    }`}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="font-bold">{s.label}</span>
                    <span className="text-xs opacity-60 ml-1">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe */}
            <div>
              <label className="text-xs text-muted-foreground/70 mb-2 block">Candle Timeframe</label>
              <div className="flex flex-col gap-1.5">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf.id} onClick={() => setTimeframe(tf.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${
                      timeframe === tf.id
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/30 text-muted-foreground/60 hover:text-foreground"
                    }`}>
                    <span className="font-bold">{tf.label}</span>
                    <span className="text-[10px] opacity-60">{tf.detail}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Capital */}
            <div>
              <label className="text-xs text-muted-foreground/70 mb-2 block">Starting Capital</label>
              <input
                type="number" min={100} step={1000} value={initialCapital}
                onChange={(e) => setCapital(Math.max(100, Number(e.target.value)))}
                className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50"
              />
              <div className="flex gap-1.5 mt-2">
                {[1000, 5000, 10000, 25000].map((v) => (
                  <button key={v} onClick={() => setCapital(v)}
                    className={`flex-1 text-[10px] font-mono py-1 rounded border transition-colors ${
                      initialCapital === v ? "border-primary/40 text-primary bg-primary/10" : "border-border/30 text-muted-foreground/50 hover:text-foreground"
                    }`}>
                    {v >= 1000 ? `$${v / 1000}K` : `$${v}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Strategy (fixed label) */}
            <div className="bg-background border border-border/30 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground/40 mb-1">Strategy (fixed)</div>
              <div className="text-sm font-bold mb-1.5">EMA Crossover + RSI Filter</div>
              <div className="text-[10px] text-muted-foreground/50 leading-relaxed">
                <span className="text-emerald-400">▲ BUY</span> when EMA-9 crosses above EMA-21 &amp; RSI &lt; 70<br />
                <span className="text-red-400">▼ SELL</span> when EMA-9 crosses below EMA-21 or RSI &gt; 78
              </div>
            </div>
          </div>

          <div className="p-5 pt-0">
            <button
              onClick={runBacktest} disabled={running}
              className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                running
                  ? "bg-primary/20 text-primary/40 cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
              }`}>
              {running
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Simulating…</>
                : <><Play className="w-4 h-4" />Run Backtest</>
              }
            </button>
          </div>
        </div>

        {/* ── Results column ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Loading */}
          {running && (
            <div className="bg-card border border-border/40 rounded-xl p-10 flex flex-col items-center gap-3 text-center">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium">Fetching &amp; simulating…</p>
              <p className="text-xs text-muted-foreground/50">
                Pulling up to {timeframe === "1d" ? "365" : "720"} {timeframe} candles for {sym?.label} from Kraken, then running EMA Crossover
              </p>
            </div>
          )}

          {/* Empty state */}
          {!running && !result && !error && (
            <div className="bg-card border border-border/40 rounded-xl p-14 flex flex-col items-center gap-3 text-center">
              <BarChart2 className="w-10 h-10 text-border/40" />
              <p className="text-sm font-medium text-muted-foreground/60">Configure and run a backtest</p>
              <p className="text-xs text-muted-foreground/40">
                Historical {sym?.label ?? "BTC"} {timeframe} candles from Kraken · EMA Crossover strategy
              </p>
            </div>
          )}

          {/* Results */}
          {result && !running && (
            <>
              {/* Summary strip */}
              <div className="bg-card border border-border/40 rounded-xl px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground/60">
                <span className="font-mono font-bold text-foreground">
                  {result.config.symbol.replace("USD", "")} · {result.config.timeframe}
                </span>
                <span>{result.config.periodLabel}</span>
                <span>Capital: {usd(result.config.initialCapital, 0)}</span>
                <span className="ml-auto">Run at {new Date(result.runAt).toLocaleTimeString()}</span>
              </div>

              {/* 6 metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricCard
                  label="Total Return"
                  value={pct(m!.totalReturn)}
                  sub={`${m!.totalReturnUSD >= 0 ? "+" : ""}${usd(m!.totalReturnUSD)} · Final: ${usd(m!.finalEquity, 0)}`}
                  color={m!.totalReturn >= 0 ? "text-emerald-400" : "text-red-400"}
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                />
                <MetricCard
                  label="Win Rate"
                  value={pct(m!.winRate, 1, false)}
                  sub={`${m!.winningTrades}W · ${m!.losingTrades}L · ${m!.totalTrades} trades`}
                  color={m!.winRate >= 55 ? "text-emerald-400" : m!.winRate >= 40 ? "text-yellow-400" : "text-red-400"}
                  icon={<Trophy className="w-3.5 h-3.5" />}
                />
                <MetricCard
                  label="Max Drawdown"
                  value={`−${m!.maxDrawdown.toFixed(2)}%`}
                  sub="Worst peak-to-trough decline"
                  color={m!.maxDrawdown < 5 ? "text-emerald-400" : m!.maxDrawdown < 15 ? "text-yellow-400" : "text-red-400"}
                  icon={<TrendingDown className="w-3.5 h-3.5" />}
                />
                <MetricCard
                  label="Profit Factor"
                  value={m!.profitFactor >= 99 ? "∞" : m!.profitFactor.toFixed(2)}
                  sub={`Avg win ${pct(m!.avgWinPct, 2, false)} · Avg loss −${pct(m!.avgLossPct, 2, false)}`}
                  color={m!.profitFactor > 1.5 ? "text-emerald-400" : m!.profitFactor >= 1 ? "text-yellow-400" : "text-red-400"}
                  icon={<Zap className="w-3.5 h-3.5" />}
                />
                <MetricCard
                  label="Sharpe Ratio"
                  value={m!.sharpeRatio.toFixed(2)}
                  sub="Annualized risk-adjusted return"
                  color={m!.sharpeRatio > 1 ? "text-emerald-400" : m!.sharpeRatio > 0 ? "text-yellow-400" : "text-red-400"}
                  icon={<Target className="w-3.5 h-3.5" />}
                />
                <MetricCard
                  label="vs Buy & Hold"
                  value={pct(m!.totalReturn - m!.benchmarkReturn)}
                  sub={`Benchmark: ${pct(m!.benchmarkReturn)}`}
                  color={(m!.totalReturn - m!.benchmarkReturn) >= 0 ? "text-emerald-400" : "text-red-400"}
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                />
              </div>

              {/* Equity Curve */}
              <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className="text-sm font-semibold">Equity Curve</span>
                  <span className="text-xs text-muted-foreground/40 ml-auto">{result.equityCurve.length} candle snapshots</span>
                </div>
                <div className="p-4 h-[220px]">
                  <EquityCurve
                    curve={result.equityCurve}
                    initialCapital={result.config.initialCapital}
                    benchmarkReturn={m!.benchmarkReturn}
                  />
                </div>
              </div>

              {/* Trade table */}
              {result.trades.length > 0 ? (
                <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <span className="text-sm font-semibold">Simulated Trades</span>
                    <span className="text-xs text-muted-foreground/40 ml-auto">{result.trades.length} total</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-muted-foreground/40">
                          {["#", "Entry Date", "Entry $", "Exit Date", "Exit $", "Return", "P&L"].map((h, i) => (
                            <th key={h} className={`px-4 py-2.5 font-medium ${i === 0 ? "text-left" : i < 4 ? "text-left" : "text-right"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTrades!.map((t) => (
                          <tr key={t.n} className={`border-b border-border/10 last:border-0 hover:bg-card/60 transition-colors ${
                            t.won ? "bg-emerald-400/[0.02]" : "bg-red-400/[0.02]"
                          }`}>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground/40">{t.n}</td>
                            <td className="px-4 py-2.5 text-muted-foreground/60 whitespace-nowrap">{tsLabel(t.entryTime)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{usd(t.entryPrice)}</td>
                            <td className="px-4 py-2.5 text-muted-foreground/60 whitespace-nowrap">{tsLabel(t.exitTime)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{usd(t.exitPrice)}</td>
                            <td className={`px-4 py-2.5 text-right font-mono font-bold ${t.won ? "text-emerald-400" : "text-red-400"}`}>
                              {pct(t.returnPct)}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono ${t.won ? "text-emerald-400" : "text-red-400"}`}>
                              {t.returnUSD >= 0 ? "+" : ""}{usd(t.returnUSD)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.trades.length > 8 && (
                    <div className="border-t border-border/20">
                      <button onClick={() => setShowAll(!showAllTrades)}
                        className="w-full py-2.5 text-xs text-muted-foreground/50 hover:text-foreground flex items-center justify-center gap-1.5 transition-colors">
                        {showAllTrades
                          ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                          : <><ChevronDown className="w-3.5 h-3.5" /> Show all {result.trades.length} trades</>
                        }
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-card border border-border/40 rounded-xl p-8 text-center">
                  <p className="text-sm text-muted-foreground/40">No EMA crossover signals generated in this period</p>
                  <p className="text-xs text-muted-foreground/30 mt-1">Try a different timeframe or symbol</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
