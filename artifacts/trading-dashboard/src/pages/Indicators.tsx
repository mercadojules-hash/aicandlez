import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart3, RefreshCw, TrendingUp, TrendingDown, Minus,
  Zap, Activity, Clock, AlertTriangle, CheckCircle2, Circle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Signal = "bullish" | "bearish" | "neutral";

interface RSIResult   { value: number; signal: Signal; score: number; label: string }
interface EMAResult   { short: number; shortPeriod: number; long: number; longPeriod: number; spread: number; spreadPct: number; signal: Signal; score: number; crossover: "golden" | "death" | "none" }
interface TrendResult { direction: Signal; strength: "strong" | "moderate" | "weak"; score: number; priceVsEma9: "above" | "below"; priceVsEma21: "above" | "below" }
interface Pattern     { name: string; detected: boolean; signal: Signal; score: number; description: string }

interface AnalysisResult {
  symbol: string; timeframe: string; price: number; analyzedAt: number; candles: number;
  indicators: { rsi: RSIResult; ema: EMAResult; trend: TrendResult };
  patterns: Pattern[];
  summary: { totalScore: number; maxScore: number; normalizedScore: number; signal: Signal; confidence: number };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SYMBOLS     = ["BTCUSD", "ETHUSD", "SOLUSD"];
const TIMEFRAMES  = ["1m", "5m", "15m", "1h"];
const SYM_LABEL: Record<string, string> = { BTCUSD: "BTC/USD", ETHUSD: "ETH/USD", SOLUSD: "SOL/USD" };

// ── Helpers ────────────────────────────────────────────────────────────────────

function signalColor(s: Signal) {
  if (s === "bullish") return "text-cyan-400";
  if (s === "bearish") return "text-red-400";
  return "text-muted-foreground";
}
function signalBg(s: Signal) {
  if (s === "bullish") return "bg-cyan-400/10 border-cyan-400/20";
  if (s === "bearish") return "bg-red-400/10 border-red-400/20";
  return "bg-card border-border/40";
}
function SignalIcon({ s, size = "w-4 h-4" }: { s: Signal; size?: string }) {
  if (s === "bullish") return <TrendingUp className={`${size} text-cyan-400`} />;
  if (s === "bearish") return <TrendingDown className={`${size} text-red-400`} />;
  return <Minus className={`${size} text-muted-foreground/40`} />;
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function timeSince(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}
function fmt(n: number, d = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

// ── RSI Gauge ─────────────────────────────────────────────────────────────────

function RSIGauge({ rsi }: { rsi: RSIResult }) {
  const pct = Math.min(100, Math.max(0, rsi.value));
  const barColor = rsi.signal === "bullish" ? "bg-cyan-400" : rsi.signal === "bearish" ? "bg-red-400" : "bg-yellow-400";

  return (
    <div className={`rounded-xl border p-4 ${signalBg(rsi.signal)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-xs font-mono text-muted-foreground/70">RSI (14)</span>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${signalColor(rsi.signal)} border ${signalBg(rsi.signal)}`}>
          {cap(rsi.signal)} · {rsi.label}
        </span>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <span className={`text-4xl font-bold font-mono ${signalColor(rsi.signal)}`}>{fmt(rsi.value, 1)}</span>
        <span className="text-sm text-muted-foreground/50 mb-1">/ 100</span>
      </div>

      {/* Bar */}
      <div className="relative h-3 rounded-full overflow-hidden bg-border/20 mb-2">
        {/* Zones */}
        <div className="absolute inset-y-0 left-0 w-[30%] bg-cyan-400/10" />
        <div className="absolute inset-y-0 right-0 w-[30%] bg-red-400/10" />
        {/* Value */}
        <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        {/* Cursor */}
        <div className="absolute inset-y-0 w-0.5 bg-white/60" style={{ left: `calc(${pct}% - 1px)` }} />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/30">
        <span>0 · Oversold</span>
        <span>50 · Neutral</span>
        <span>100 · Overbought</span>
      </div>

      <div className="mt-3 pt-3 border-t border-border/20 text-xs text-muted-foreground/50 flex justify-between">
        <span>Score contribution</span>
        <span className={signalColor(rsi.signal)}>{rsi.score >= 0 ? "+" : ""}{rsi.score.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ── EMA Card ──────────────────────────────────────────────────────────────────

function EMACard({ ema }: { ema: EMAResult }) {
  return (
    <div className={`rounded-xl border p-4 ${signalBg(ema.signal)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-xs font-mono text-muted-foreground/70">EMA Crossover</span>
        </div>
        {ema.crossover !== "none" && (
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${ema.crossover === "golden" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" : "text-red-400 bg-red-400/10 border-red-400/20"}`}>
            {ema.crossover === "golden" ? "⚡ GOLDEN CROSS" : "💀 DEATH CROSS"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 mb-3">
        <div>
          <div className="text-[10px] text-muted-foreground/50 font-mono mb-1">EMA {ema.shortPeriod}</div>
          <div className={`text-lg font-bold font-mono ${ema.signal === "bullish" ? "text-cyan-400" : "text-foreground"}`}>
            ${fmt(ema.short, 2)}
          </div>
        </div>
        <div className="text-muted-foreground/30 text-xl">vs</div>
        <div>
          <div className="text-[10px] text-muted-foreground/50 font-mono mb-1">EMA {ema.longPeriod}</div>
          <div className="text-lg font-bold font-mono text-foreground">${fmt(ema.long, 2)}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] text-muted-foreground/50 font-mono mb-1">Spread</div>
          <div className={`text-sm font-bold font-mono ${signalColor(ema.signal)}`}>
            {ema.spread >= 0 ? "+" : ""}{fmt(ema.spread, 2)}
          </div>
          <div className={`text-[10px] font-mono ${signalColor(ema.signal)}`}>
            ({ema.spreadPct >= 0 ? "+" : ""}{ema.spreadPct.toFixed(3)}%)
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-between">
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${signalColor(ema.signal)}`}>
          <SignalIcon s={ema.signal} size="w-4 h-4" />
          {cap(ema.signal)} · EMA{ema.shortPeriod} {ema.signal === "bullish" ? "above" : ema.signal === "bearish" ? "below" : "at"} EMA{ema.longPeriod}
        </div>
        <span className={`text-xs font-mono ${signalColor(ema.signal)}`}>
          Score {ema.score >= 0 ? "+" : ""}{ema.score.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── Trend Card ────────────────────────────────────────────────────────────────

function TrendCard({ trend, price }: { trend: TrendResult; price: number }) {
  return (
    <div className={`rounded-xl border p-4 ${signalBg(trend.direction)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SignalIcon s={trend.direction} size="w-3.5 h-3.5" />
          <span className="text-xs font-mono text-muted-foreground/70">Trend Detection</span>
        </div>
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
          trend.strength === "strong" ? signalBg(trend.direction) : "bg-card border-border/30"
        } ${signalColor(trend.direction)}`}>
          {cap(trend.strength)} {cap(trend.direction)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground/50 font-mono mb-1">Direction</div>
          <div className={`text-base font-bold ${signalColor(trend.direction)}`}>{cap(trend.direction)}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground/50 font-mono mb-1">Price vs EMA9</div>
          <div className={`text-base font-bold ${trend.priceVsEma9 === "above" ? "text-cyan-400" : "text-red-400"}`}>
            {cap(trend.priceVsEma9)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground/50 font-mono mb-1">Price vs EMA21</div>
          <div className={`text-base font-bold ${trend.priceVsEma21 === "above" ? "text-cyan-400" : "text-red-400"}`}>
            {cap(trend.priceVsEma21)}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-border/20 flex justify-between text-xs">
        <span className="text-muted-foreground/50">Current price <span className="text-foreground font-mono">${fmt(price, 2)}</span></span>
        <span className={`font-mono ${signalColor(trend.direction)}`}>Score {trend.score >= 0 ? "+" : ""}{trend.score.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ── Pattern Card ──────────────────────────────────────────────────────────────

function PatternList({ patterns }: { patterns: Pattern[] }) {
  const detected = patterns.filter((p) => p.detected);
  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-xs font-mono text-muted-foreground/70">Candle Patterns</span>
        </div>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
          detected.length > 0 ? "text-primary bg-primary/10 border-primary/20" : "text-muted-foreground/40 border-border/20"
        }`}>
          {detected.length} detected
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {patterns.map((p) => (
          <div
            key={p.name}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
              p.detected ? `${signalBg(p.signal)} shadow-sm` : "border-border/20 opacity-40"
            }`}
          >
            <div className={`mt-0.5 shrink-0 ${p.detected ? signalColor(p.signal) : "text-muted-foreground/20"}`}>
              {p.detected
                ? <CheckCircle2 className="w-4 h-4" />
                : <Circle className="w-4 h-4" />
              }
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${p.detected ? signalColor(p.signal) : "text-muted-foreground/40"}`}>
                  {p.name}
                </span>
                {p.detected && (
                  <span className={`text-[10px] font-mono shrink-0 ${signalColor(p.signal)}`}>
                    {p.score >= 0 ? "+" : ""}{p.score.toFixed(1)}
                  </span>
                )}
              </div>
              {p.detected && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">{p.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ summary, symbol, timeframe, analyzedAt }: {
  summary: AnalysisResult["summary"]; symbol: string; timeframe: string; analyzedAt: number;
}) {
  const pct = Math.round(summary.normalizedScore * 100);
  const barWidth = `${pct}%`;
  const barColor = summary.signal === "bullish" ? "bg-cyan-400" : summary.signal === "bearish" ? "bg-red-400" : "bg-yellow-400";

  return (
    <div className={`rounded-xl border p-5 ${signalBg(summary.signal)}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-mono text-muted-foreground/50 mb-1">Overall Analysis · {SYM_LABEL[symbol]} · {timeframe}</div>
          <div className={`text-2xl font-bold ${signalColor(summary.signal)}`}>
            {cap(summary.signal)} Signal
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono text-muted-foreground/50 mb-1">Confidence</div>
          <div className={`text-3xl font-bold font-mono ${signalColor(summary.signal)}`}>{summary.confidence}%</div>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground/50 mb-1.5">
          <span>Bearish</span>
          <span>Score: {summary.totalScore >= 0 ? "+" : ""}{summary.totalScore.toFixed(2)} / {summary.maxScore}</span>
          <span>Bullish</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-border/20 overflow-hidden">
          <div className="absolute inset-y-0 left-1/2 w-px bg-border/40" />
          <div className={`absolute inset-y-0 rounded-full ${barColor}`}
            style={summary.signal === "bullish"
              ? { left: "50%", width: `${(pct - 50) * 2}%` }
              : summary.signal === "bearish"
              ? { right: "50%", width: `${(50 - pct) * 2}%` }
              : { left: "48%", width: "4%" }
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40 font-mono">
        <Clock className="w-3 h-3" />
        Analyzed {timeSince(analyzedAt)} · {100} candles
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Indicators() {
  const [symbol, setSymbol]     = useState("BTCUSD");
  const [timeframe, setTimeframe] = useState("1h");
  const [data, setData]         = useState<AnalysisResult | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [tick, setTick]         = useState(0);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (sym: string, tf: string, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/${sym}?timeframe=${tf}&limit=100`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
      setLastFetch(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(symbol, timeframe);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(symbol, timeframe, true), 20_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [symbol, timeframe, fetchData]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const ind = data?.indicators;

  return (
    <div className="flex flex-col gap-5 max-w-[1100px]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-primary tracking-widest uppercase">Module 03 · Indicators</span>
          </div>
          <h1 className="text-xl font-bold">Indicator + Candle Engine</h1>
          <p className="text-sm text-muted-foreground">RSI · EMA crossover · Trend · Candle pattern detection</p>
        </div>

        <div className="flex items-center gap-2">
          {tick > -1 && lastFetch && (
            <span className="text-xs text-muted-foreground/50 font-mono">
              Updated {timeSince(lastFetch)}
            </span>
          )}
          <button
            onClick={() => fetchData(symbol, timeframe)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border/40 hover:bg-card transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Selectors */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-border/40 overflow-hidden">
          {SYMBOLS.map((s) => (
            <button key={s} onClick={() => setSymbol(s)}
              className={`px-4 py-1.5 text-xs font-mono font-semibold transition-colors ${symbol === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card"}`}>
              {SYM_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border/40 overflow-hidden">
          {TIMEFRAMES.map((tf) => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${timeframe === tf ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-card"}`}>
              {tf}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Auto-refresh every 20s
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-red-900/40 bg-red-950/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Overall summary */}
      {loading && !data ? (
        <div className="h-32 rounded-xl bg-border/10 animate-pulse" />
      ) : data ? (
        <SummaryCard summary={data.summary} symbol={symbol} timeframe={timeframe} analyzedAt={data.analyzedAt} />
      ) : null}

      {/* Indicators + Patterns grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* Left: RSI + EMA + Trend */}
        <div className="flex flex-col gap-4">
          {loading && !ind
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-36 rounded-xl bg-border/10 animate-pulse" />)
            : ind && (
              <>
                <RSIGauge rsi={ind.rsi} />
                <EMACard  ema={ind.ema} />
                <TrendCard trend={ind.trend} price={data!.price} />
              </>
            )
          }
        </div>

        {/* Right: Pattern list */}
        <div>
          {loading && !data
            ? <div className="h-80 rounded-xl bg-border/10 animate-pulse" />
            : data && <PatternList patterns={data.patterns} />
          }
        </div>
      </div>
    </div>
  );
}
