import { authFetch } from "@/lib/authFetch";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain, RefreshCw, TrendingUp, TrendingDown, Minus,
  Activity, Clock, AlertTriangle, Zap, CheckCircle2,
  ArrowUpCircle, ArrowDownCircle, PauseCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Decision = "BUY" | "SELL" | "HOLD";
type Signal   = "bullish" | "bearish" | "neutral";

interface SignalFactor {
  name: string; displayValue: string; signal: Signal; score: number; weight: string; note: string;
}
interface Momentum {
  change5Pct: number; change20Pct: number; direction: Signal; strength: string;
}
interface AIResult {
  symbol: string; timeframe: string; price: number;
  decision: Decision; confidence: number; reasoning: string;
  momentum: Momentum;
  signals: SignalFactor[];
  totalScore: number; maxScore: number; analyzedAt: number; candles: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SYMBOLS    = ["BTCUSD", "ETHUSD", "SOLUSD"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h"];
const SYM_LABEL: Record<string, string> = { BTCUSD: "BTC/USD", ETHUSD: "ETH/USD", SOLUSD: "SOL/USD" };

// ── Helpers ────────────────────────────────────────────────────────────────────

function signalColor(s: Signal) {
  if (s === "bullish") return "text-cyan-400";
  if (s === "bearish") return "text-red-400";
  return "text-muted-foreground/60";
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function timeSince(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`;
}
function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Decision Config ────────────────────────────────────────────────────────────

const DECISION_CONFIG: Record<Decision, {
  label: string; color: string; bg: string; border: string;
  glow: string; icon: React.FC<{ className?: string }>; tagline: string;
}> = {
  BUY: {
    label: "BUY",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
    glow: "shadow-[0_0_40px_rgba(52,211,153,0.15)]",
    icon: ArrowUpCircle,
    tagline: "Long position entry signal",
  },
  SELL: {
    label: "SELL",
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/30",
    glow: "shadow-[0_0_40px_rgba(248,113,113,0.15)]",
    icon: ArrowDownCircle,
    tagline: "Short position entry signal",
  },
  HOLD: {
    label: "HOLD",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/30",
    glow: "shadow-[0_0_24px_rgba(251,191,36,0.1)]",
    icon: PauseCircle,
    tagline: "Insufficient edge — stay flat",
  },
};

// ── Confidence Ring ────────────────────────────────────────────────────────────

function ConfidenceRing({ pct, decision }: { pct: number; decision: Decision }) {
  const R = 40;
  const circ = 2 * Math.PI * R;
  const offset = circ * (1 - pct / 100);
  const { color } = DECISION_CONFIG[decision];
  const strokeColor = decision === "BUY" ? "#34d399" : decision === "SELL" ? "#f87171" : "#fbbf24";

  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="6" className="text-border/20" />
        <circle
          cx="50" cy="50" r={R} fill="none"
          stroke={strokeColor} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-xl font-bold font-mono ${color}`}>{pct}%</span>
        <span className="text-[9px] text-muted-foreground/50 font-mono uppercase tracking-wider">conf</span>
      </div>
    </div>
  );
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.abs(score) / max * 50; // 0–50% each side
  const positive = score >= 0;
  const color = positive ? "bg-emerald-400" : "bg-red-400";
  return (
    <div className="relative h-2 rounded-full bg-border/20 overflow-hidden">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border/40" />
      <div
        className={`absolute inset-y-0 rounded-full ${color} transition-all duration-500`}
        style={positive
          ? { left: "50%", width: `${pct}%` }
          : { right: "50%", width: `${pct}%` }
        }
      />
    </div>
  );
}

// ── Signal Factor Row ──────────────────────────────────────────────────────────

function SignalRow({ factor, max }: { factor: SignalFactor; max: number }) {
  const SignalArrow = () => {
    if (factor.signal === "bullish") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    if (factor.signal === "bearish") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground/40" />;
  };

  return (
    <div className="py-3 border-b border-border/20 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <SignalArrow />
          <span className="text-sm font-medium">{factor.name}</span>
          <span className={`text-xs font-mono font-bold ${signalColor(factor.signal)}`}>{factor.displayValue}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/50 max-w-[160px] text-right truncate">{factor.note}</span>
          <span className={`text-xs font-mono font-bold w-10 text-right ${factor.score > 0 ? "text-emerald-400" : factor.score < 0 ? "text-red-400" : "text-muted-foreground/40"}`}>
            {factor.weight}
          </span>
        </div>
      </div>
      <ScoreBar score={factor.score} max={max} />
    </div>
  );
}

// ── Reasoning Block ────────────────────────────────────────────────────────────

function ReasoningBlock({ text, decision }: { text: string; decision: Decision }) {
  const cfg = DECISION_CONFIG[decision];
  // Split reasoning into sentences for display
  const sentences = text.split(". ").filter(Boolean);

  return (
    <div className={`rounded-xl border p-5 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center gap-2 mb-3">
        <Brain className={`w-4 h-4 ${cfg.color}`} />
        <span className={`text-xs font-mono font-bold tracking-widest uppercase ${cfg.color}`}>
          AI Reasoning Engine · Analysis
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {sentences.map((s, i) => {
          const isConclusion = i === sentences.length - 1;
          return (
            <div key={i} className={`flex gap-2.5 text-sm leading-relaxed ${isConclusion ? `font-semibold ${cfg.color}` : "text-foreground/80"}`}>
              <span className={`shrink-0 mt-1 text-[10px] font-mono ${isConclusion ? cfg.color : "text-muted-foreground/30"}`}>
                {String(i + 1).padStart(2, "0")}.
              </span>
              <span>{s}{isConclusion ? "" : "."}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIReasoning() {
  const [symbol,    setSymbol]    = useState("BTCUSD");
  const [timeframe, setTimeframe] = useState("1h");
  const [data,      setData]      = useState<AIResult | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [tick,      setTick]      = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (sym: string, tf: string, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/ai-decision/${sym}?timeframe=${tf}&limit=100`);
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

  const cfg = data ? DECISION_CONFIG[data.decision] : null;

  return (
    <div className="flex flex-col gap-5 max-w-[1100px]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-primary tracking-widest uppercase">Module 04 · AI Reasoning</span>
          </div>
          <h1 className="text-xl font-bold">AI Reasoning Engine</h1>
          <p className="text-sm text-muted-foreground">Multi-signal decision engine · RSI + EMA + Trend + Momentum + Patterns</p>
        </div>
        <div className="flex items-center gap-2">
          {tick > -1 && lastFetch && (
            <span className="text-xs text-muted-foreground/50 font-mono">Updated {timeSince(lastFetch)}</span>
          )}
          <button onClick={() => fetchData(symbol, timeframe)} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border/40 hover:bg-card transition-colors disabled:opacity-40">
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
          Auto-refresh every 20s · No execution
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-red-900/40 bg-red-950/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Decision hero card */}
      {loading && !data ? (
        <div className="h-40 rounded-xl bg-border/10 animate-pulse" />
      ) : data && cfg ? (
        <div className={`rounded-xl border p-6 ${cfg.bg} ${cfg.border} ${cfg.glow}`}>
          <div className="flex items-center gap-6">
            {/* Confidence ring */}
            <ConfidenceRing pct={data.confidence} decision={data.decision} />

            {/* Decision label */}
            <div className="flex-1">
              <div className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 uppercase tracking-widest">
                {SYM_LABEL[symbol]} · {timeframe} · Algorithmic Decision
              </div>
              <div className="flex items-center gap-3 mb-1">
                <cfg.icon className={`w-8 h-8 ${cfg.color}`} />
                <span className={`text-5xl font-black font-mono tracking-tight ${cfg.color}`}>{data.decision}</span>
              </div>
              <p className={`text-sm ${cfg.color} opacity-70`}>{cfg.tagline}</p>
            </div>

            {/* Price + score */}
            <div className="text-right shrink-0">
              <div className="text-[10px] font-mono text-muted-foreground/50 mb-1">Current Price</div>
              <div className="text-2xl font-bold font-mono mb-3">${fmt(data.price)}</div>
              <div className="text-[10px] font-mono text-muted-foreground/50 mb-1">Composite Score</div>
              <div className={`text-lg font-bold font-mono ${data.totalScore > 0 ? "text-emerald-400" : data.totalScore < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {data.totalScore >= 0 ? "+" : ""}{data.totalScore.toFixed(2)} / {data.maxScore}
              </div>
            </div>
          </div>

          {/* Momentum strip */}
          <div className="mt-4 pt-4 border-t border-border/20 flex items-center gap-6 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-muted-foreground/50">Momentum (5-bar)</span>
              <span className={data.momentum.change5Pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                {data.momentum.change5Pct >= 0 ? "+" : ""}{data.momentum.change5Pct.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground/50">20-bar</span>
              <span className={data.momentum.change20Pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                {data.momentum.change20Pct >= 0 ? "+" : ""}{data.momentum.change20Pct.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground/50">Momentum</span>
              <span className={signalColor(data.momentum.direction)}>
                {cap(data.momentum.strength)} {cap(data.momentum.direction)}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-muted-foreground/40">
              <Clock className="w-3 h-3" />
              {tick > -1 && lastFetch ? timeSince(lastFetch) : "—"} · {data.candles} candles
            </div>
          </div>
        </div>
      ) : null}

      {/* Reasoning + Signal breakdown grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">

        {/* Reasoning */}
        <div className="flex flex-col gap-4">
          {loading && !data ? (
            <div className="h-60 rounded-xl bg-border/10 animate-pulse" />
          ) : data ? (
            <>
              <ReasoningBlock text={data.reasoning} decision={data.decision} />

              {/* No-execution notice */}
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border/20 bg-card/20 text-xs text-muted-foreground/50">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                This is analysis only — no trades are placed. Execution activates in Module 13: Live Trading.
              </div>
            </>
          ) : null}
        </div>

        {/* Signal factor breakdown */}
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-sm font-semibold">Signal Breakdown</span>
            </div>
            {data && (
              <span className="text-[10px] font-mono text-muted-foreground/40">
                5 factors · max ±{data.maxScore}
              </span>
            )}
          </div>

          <div className="px-4">
            {loading && !data
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="py-3 border-b border-border/20">
                    <div className="h-4 bg-border/15 rounded animate-pulse mb-2 w-2/3" />
                    <div className="h-2 bg-border/10 rounded animate-pulse" />
                  </div>
                ))
              : data?.signals.map((f) => (
                  <SignalRow key={f.name} factor={f} max={data.maxScore} />
                ))
            }
          </div>

          {/* Total score */}
          {data && (
            <div className="px-4 py-3 border-t border-border/30 bg-border/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Total Score</span>
                <span className={`text-sm font-bold font-mono ${data.totalScore > 0 ? "text-emerald-400" : data.totalScore < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                  {data.totalScore >= 0 ? "+" : ""}{data.totalScore.toFixed(3)}
                </span>
              </div>
              <ScoreBar score={data.totalScore} max={data.maxScore / 2} />
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground/30 mt-1.5">
                <span>← SELL ≤ −1.5</span>
                <span>HOLD</span>
                <span>BUY ≥ +1.5 →</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
