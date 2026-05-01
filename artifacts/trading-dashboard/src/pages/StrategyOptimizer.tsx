import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  SlidersHorizontal,
  Zap,
  Trophy,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Target,
  Timer,
  Hash,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────────────

interface StrategyParams {
  emaShort:         number;
  emaLong:          number;
  rsiBuyThreshold:  number;
  rsiSellThreshold: number;
}

interface RunMetrics {
  totalReturn:     number;
  winRate:         number;
  maxDrawdown:     number;
  profitFactor:    number;
  sharpeRatio:     number;
  totalTrades:     number;
  finalEquity:     number;
}

interface OptimizeRun {
  rank:    number;
  params:  StrategyParams;
  metrics: RunMetrics;
  score:   number;
}

interface OptimizationResult {
  config:    { symbol: string; timeframe: string; initialCapital: number; optimizeFor: string; candleCount: number; periodLabel: string };
  best:      OptimizeRun;
  results:   OptimizeRun[];
  totalRuns: number;
  durationMs: number;
  grid:      { emaShort: number[]; emaLong: number[]; rsiBuyThreshold: number[]; rsiSellThreshold: number[] };
  runAt:     number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SYMBOLS    = ["BTCUSD", "ETHUSD", "SOLUSD"] as const;
const TIMEFRAMES = ["1h", "15m", "5m"] as const;

type OptimizeTarget = "totalReturn" | "sharpeRatio" | "winRate" | "profitFactor";
const TARGETS: { value: OptimizeTarget; label: string }[] = [
  { value: "totalReturn",  label: "Total Return (%)" },
  { value: "sharpeRatio",  label: "Sharpe Ratio" },
  { value: "winRate",      label: "Win Rate (%)" },
  { value: "profitFactor", label: "Profit Factor" },
];

const TARGET_LABELS: Record<OptimizeTarget, string> = {
  totalReturn:  "Return",
  sharpeRatio:  "Sharpe",
  winRate:      "Win Rate",
  profitFactor: "PF",
};

function fmt(n: number, dec = 2) { return n.toFixed(dec); }
function pct(n: number)           { return `${n >= 0 ? "+" : ""}${fmt(n)}%`; }

function scoreColor(rank: number): string {
  if (rank === 1) return "text-yellow-400";
  if (rank <= 3)  return "text-blue-400";
  if (rank <= 10) return "text-slate-300";
  return "text-slate-500";
}

function returnColor(val: number) { return val >= 0 ? "text-emerald-400" : "text-red-400"; }

// ── Component ─────────────────────────────────────────────────────────────────

export default function StrategyOptimizer() {
  const [symbol,        setSymbol]        = useState<string>("BTCUSD");
  const [timeframe,     setTimeframe]     = useState<string>("1h");
  const [initialCap,    setInitialCap]    = useState<number>(10000);
  const [optimizeFor,   setOptimizeFor]   = useState<OptimizeTarget>("totalReturn");
  const [showAll,       setShowAll]       = useState(false);

  // ── API call ─────────────────────────────────────────────────────────────────
  const mutation = useMutation<OptimizationResult, Error, void>({
    mutationFn: async () => {
      const r = await fetch("/api/optimizer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, initialCapital: initialCap, optimizeFor }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(e.error ?? "Optimizer failed");
      }
      return r.json();
    },
  });

  const data    = mutation.data;
  const running = mutation.isPending;
  const err     = mutation.error?.message;

  const visibleRows = data
    ? (showAll ? data.results : data.results.slice(0, 10))
    : [];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Strategy Optimizer</h1>
            <p className="text-sm text-slate-400">EMA Crossover · Grid Search · Parameter Tuning</p>
          </div>
        </div>
        <Badge variant="outline" className="border-violet-500/40 text-violet-300 text-xs px-3 py-1">
          v1.0 · MODULE 08
        </Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
        {/* ── Left: Config panel ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card className="bg-slate-900 border-slate-700/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Target className="w-4 h-4 text-violet-400" /> Optimizer Config
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Symbol */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Symbol</label>
                <div className="flex gap-2">
                  {SYMBOLS.map(s => (
                    <button
                      key={s}
                      onClick={() => setSymbol(s)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${
                        symbol === s
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {s.replace("USD", "")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeframe */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Timeframe</label>
                <div className="flex gap-2">
                  {TIMEFRAMES.map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${
                        timeframe === tf
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Initial capital */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                  Initial Capital — ${initialCap.toLocaleString()}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[1000, 5000, 10000, 25000].map(v => (
                    <button
                      key={v}
                      onClick={() => setInitialCap(v)}
                      className={`py-1.5 px-3 text-xs font-semibold rounded-md border transition-colors ${
                        initialCap === v
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      ${(v / 1000).toFixed(v < 1000 ? 0 : 0)}k
                    </button>
                  ))}
                </div>
              </div>

              {/* Optimize for */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Optimize For</label>
                <Select value={optimizeFor} onValueChange={v => setOptimizeFor(v as OptimizeTarget)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {TARGETS.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-xs text-slate-200">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Run button */}
              <Button
                onClick={() => mutation.mutate()}
                disabled={running}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold h-10"
              >
                {running ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running Grid Search…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Run Optimizer
                  </span>
                )}
              </Button>

              {err && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-md px-3 py-2">
                  {err}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Parameter grid preview */}
          <Card className="bg-slate-900 border-slate-700/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Hash className="w-4 h-4 text-slate-400" /> Search Grid
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              {[
                { label: "EMA Short",        values: [5, 7, 9, 12],   unit: "periods" },
                { label: "EMA Long",         values: [15, 21, 26],    unit: "periods" },
                { label: "RSI Buy ≤",        values: [60, 65, 70],    unit: "" },
                { label: "RSI Sell ≥",       values: [75, 78, 82],    unit: "" },
              ].map(row => (
                <div key={row.label}>
                  <span className="text-slate-400 font-medium">{row.label}</span>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {row.values.map(v => (
                      <span key={v} className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="pt-1 border-t border-slate-800 text-slate-500">
                Valid combos: <span className="text-slate-300 font-semibold">~72–108</span> · 1 candle fetch
              </div>
            </CardContent>
          </Card>

          {/* Run stats */}
          {data && (
            <Card className="bg-slate-900 border-slate-700/60">
              <CardContent className="pt-4 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Combinations run</span>
                  <span className="text-slate-200 font-mono">{data.totalRuns}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Candles</span>
                  <span className="text-slate-200 font-mono">{data.config.candleCount}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Period</span>
                  <span className="text-slate-200 font-mono text-right max-w-[160px]">{data.config.periodLabel}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> Duration</span>
                  <span className="text-slate-200 font-mono">{data.durationMs}ms</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: Results ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {!data && !running && (
            <div className="h-64 flex items-center justify-center border border-slate-700/50 rounded-xl bg-slate-900/40">
              <div className="text-center">
                <SlidersHorizontal className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Configure parameters and run the optimizer</p>
                <p className="text-slate-600 text-xs mt-1">Grid searches ~72 combinations per run</p>
              </div>
            </div>
          )}

          {running && (
            <div className="h-64 flex items-center justify-center border border-violet-700/40 rounded-xl bg-violet-950/20">
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-violet-300 text-sm font-medium">Running grid search…</p>
                <p className="text-violet-500 text-xs mt-1">Testing ~72 parameter combinations</p>
              </div>
            </div>
          )}

          {data && (
            <>
              {/* Best config banner */}
              <Card className="bg-gradient-to-r from-yellow-950/40 to-amber-950/30 border-yellow-700/40">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wider mb-0.5">
                          Best Config — {TARGETS.find(t => t.value === optimizeFor)?.label}
                        </p>
                        <p className="text-sm text-slate-200 font-mono">
                          EMA {data.best.params.emaShort}/{data.best.params.emaLong} ·
                          RSI {data.best.params.rsiBuyThreshold}/{data.best.params.rsiSellThreshold}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-6 flex-wrap">
                      <div className="text-center">
                        <p className={`text-2xl font-bold font-mono ${returnColor(data.best.metrics.totalReturn)}`}>
                          {pct(data.best.metrics.totalReturn)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Total Return</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold font-mono text-blue-400">
                          {fmt(data.best.metrics.sharpeRatio)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Sharpe</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold font-mono text-slate-200">
                          {fmt(data.best.metrics.winRate)}%
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Win Rate</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold font-mono text-orange-400">
                          -{fmt(data.best.metrics.maxDrawdown)}%
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Max DD</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold font-mono text-emerald-400">
                          {fmt(data.best.metrics.profitFactor)}x
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Profit Factor</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold font-mono text-slate-300">
                          {data.best.metrics.totalTrades}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Trades</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Top-N metric summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Best Return",    icon: TrendingUp,   value: pct(data.results[0]?.metrics.totalReturn ?? 0),   color: "text-emerald-400" },
                  { label: "Best Sharpe",    icon: BarChart2,    value: fmt(data.results[0]?.metrics.sharpeRatio ?? 0),   color: "text-blue-400" },
                  { label: "Best Win Rate",  icon: Target,       value: fmt(Math.max(...data.results.map(r => r.metrics.winRate))) + "%", color: "text-slate-200" },
                  { label: "Best Prof. Factor", icon: TrendingDown, value: fmt(Math.min(...data.results.map(r => r.metrics.profitFactor))), color: "text-orange-400" },
                ].map(card => (
                  <Card key={card.label} className="bg-slate-900 border-slate-700/60">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <card.icon className="w-3.5 h-3.5 text-slate-500" />
                        <p className="text-xs text-slate-400">{card.label}</p>
                      </div>
                      <p className={`text-lg font-bold font-mono ${card.color}`}>{card.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Comparison table */}
              <Card className="bg-slate-900 border-slate-700/60">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-200">
                    Results Comparison — sorted by {TARGETS.find(t => t.value === optimizeFor)?.label}
                  </CardTitle>
                  <span className="text-xs text-slate-500">{data.totalRuns} combinations</span>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left text-slate-400 font-medium px-4 py-2.5 whitespace-nowrap">#</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">EMA S</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">EMA L</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">RSI Buy</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">RSI Sell</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">Return</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">Win %</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">Drawdown</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">Sharpe</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">PF</th>
                          <th className="text-right text-slate-400 font-medium px-3 py-2.5 whitespace-nowrap">Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((run) => (
                          <tr
                            key={run.rank}
                            className={`border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors ${
                              run.rank === 1 ? "bg-yellow-950/20" : ""
                            }`}
                          >
                            <td className={`px-4 py-2 font-bold font-mono ${scoreColor(run.rank)}`}>
                              {run.rank === 1 ? "🥇" : run.rank === 2 ? "🥈" : run.rank === 3 ? "🥉" : run.rank}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">{run.params.emaShort}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">{run.params.emaLong}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">{run.params.rsiBuyThreshold}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">{run.params.rsiSellThreshold}</td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold ${returnColor(run.metrics.totalReturn)}`}>
                              {pct(run.metrics.totalReturn)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">{fmt(run.metrics.winRate)}%</td>
                            <td className="px-3 py-2 text-right font-mono text-red-400">-{fmt(run.metrics.maxDrawdown)}%</td>
                            <td className="px-3 py-2 text-right font-mono text-blue-400">{fmt(run.metrics.sharpeRatio)}</td>
                            <td className="px-3 py-2 text-right font-mono text-orange-400">{fmt(run.metrics.profitFactor)}x</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-400">{run.metrics.totalTrades}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.results.length > 10 && (
                    <div className="px-4 py-3 border-t border-slate-800">
                      <button
                        onClick={() => setShowAll(v => !v)}
                        className="text-xs text-violet-400 hover:text-violet-300 font-medium"
                      >
                        {showAll ? `Show top 10 ↑` : `Show all ${data.results.length} results ↓`}
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
