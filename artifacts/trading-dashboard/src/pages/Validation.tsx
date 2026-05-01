import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, ShieldX, ShieldAlert, Play, RefreshCw, Lock, Unlock,
  TrendingUp, TrendingDown, BarChart2, Layers, AlertTriangle,
  CheckCircle2, XCircle, Clock, Zap, ArrowRight, Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ── Types ──────────────────────────────────────────────────────────────────────

interface StrategyParams {
  emaShort: number; emaLong: number;
  rsiBuyThreshold: number; rsiSellThreshold: number;
}

interface WindowResult {
  windowIndex: number; label: string; candleCount: number;
  tradeCount: number; winRate: number; totalReturn: number;
  sharpe: number; maxDrawdown: number; passed: boolean;
}

interface OOSResult {
  inSampleReturn: number; outOfSampleReturn: number;
  inSampleWinRate: number; outOfSampleWinRate: number;
  inSampleTrades: number; outOfSampleTrades: number; ratio: number;
}

interface OverfitResult {
  score: number; grade: "A" | "B" | "C" | "F";
  degradation: number; verdict: string;
}

interface ValidationResult {
  runAt: number; symbol: string; timeframe: string;
  totalCandles: number; params: StrategyParams;
  windows: WindowResult[]; oos: OOSResult; overfit: OverfitResult;
  grade: "PASS" | "WARN" | "FAIL"; gradeScore: number;
  reasons: string[]; liveLocked: boolean;
}

interface StatusResponse {
  liveLocked: boolean; lockReason: string; validating: boolean;
  lastRunAt: number | null; lastGrade: string | null;
  lastGradeScore: number | null; lastResult: ValidationResult | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtRet(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function retColor(n: number) { return n >= 0 ? "text-green-400" : "text-red-400"; }

const GRADE_CONFIG = {
  PASS: { label: "PASS", bg: "bg-green-500/15 border-green-500/30", text: "text-green-400", icon: ShieldCheck },
  WARN: { label: "WARN", bg: "bg-yellow-500/15 border-yellow-500/30", text: "text-yellow-400", icon: ShieldAlert },
  FAIL: { label: "FAIL", bg: "bg-red-500/15 border-red-500/30", text: "text-red-400", icon: ShieldX },
};

const OVERFIT_GRADE_CONFIG = {
  A: { color: "text-green-400", bar: "bg-green-500", label: "Low Overfitting" },
  B: { color: "text-blue-400",  bar: "bg-blue-500",  label: "Moderate"        },
  C: { color: "text-yellow-400",bar: "bg-yellow-500",label: "High Risk"       },
  F: { color: "text-red-400",   bar: "bg-red-500",   label: "Severe"          },
};

// ── Window card ────────────────────────────────────────────────────────────────

function WindowCard({ w, total }: { w: WindowResult; total: number }) {
  return (
    <div className={`rounded-xl border p-4 bg-card/60 ${w.passed ? "border-green-500/20" : "border-red-500/20"}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] text-muted-foreground font-mono mb-0.5">Window {w.windowIndex + 1}/{total}</div>
          <div className="text-[10px] text-muted-foreground">{w.label.split("·")[1]?.trim()}</div>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border ${
          w.passed
            ? "bg-green-500/10 border-green-500/25 text-green-400"
            : "bg-red-500/10 border-red-500/25 text-red-400"
        }`}>
          {w.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {w.passed ? "PASS" : "FAIL"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        <div>
          <div className="text-muted-foreground">Return</div>
          <div className={`font-mono font-bold ${retColor(w.totalReturn)}`}>{fmtRet(w.totalReturn)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Win Rate</div>
          <div className="font-mono font-bold">{w.winRate.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-muted-foreground">Trades</div>
          <div className="font-mono font-bold">{w.tradeCount}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Max DD</div>
          <div className="font-mono font-bold text-orange-400">{w.maxDrawdown.toFixed(1)}%</div>
        </div>
      </div>

      {/* Return bar */}
      <div className="mt-3">
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${w.totalReturn >= 0 ? "bg-green-500" : "bg-red-500"}`}
            style={{ width: `${Math.min(100, Math.abs(w.totalReturn) * 5)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── OOS comparison ─────────────────────────────────────────────────────────────

function OOSPanel({ oos }: { oos: OOSResult }) {
  const ratio = oos.ratio;
  const ratioOk = ratio >= 0.5;

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" /> Out-of-Sample Validation
          <span className="text-[10px] text-muted-foreground font-normal ml-1">70% train · 30% test</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Split comparison */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "In-Sample", sub: "70% of data", ret: oos.inSampleReturn, wr: oos.inSampleWinRate, trades: oos.inSampleTrades, accent: "border-blue-500/20 bg-blue-500/5" },
            { label: "Out-of-Sample", sub: "30% of data", ret: oos.outOfSampleReturn, wr: oos.outOfSampleWinRate, trades: oos.outOfSampleTrades, accent: ratioOk ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5" },
          ].map(col => (
            <div key={col.label} className={`rounded-lg border p-3 ${col.accent}`}>
              <div className="text-[10px] font-semibold mb-0.5">{col.label}</div>
              <div className="text-[9px] text-muted-foreground mb-2">{col.sub}</div>
              <div className={`text-lg font-bold font-mono ${retColor(col.ret)}`}>{fmtRet(col.ret)}</div>
              <div className="mt-1.5 space-y-1 text-[10px] text-muted-foreground">
                <div>Win Rate <span className="font-mono text-foreground font-semibold">{col.wr.toFixed(0)}%</span></div>
                <div>Trades <span className="font-mono text-foreground font-semibold">{col.trades}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* IS → OOS arrow */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`font-mono font-bold ${retColor(oos.inSampleReturn)}`}>{fmtRet(oos.inSampleReturn)}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className={`font-mono font-bold ${retColor(oos.outOfSampleReturn)}`}>{fmtRet(oos.outOfSampleReturn)}</span>
          <span className="text-muted-foreground ml-1">OOS/IS ratio:</span>
          <span className={`font-mono font-bold ${ratioOk ? "text-green-400" : "text-red-400"}`}>
            {ratio.toFixed(2)}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${ratioOk ? "bg-green-500/10 border-green-500/25 text-green-400" : "bg-red-500/10 border-red-500/25 text-red-400"}`}>
            {ratioOk ? "OK" : "LOW"}
          </span>
        </div>

        {/* Ratio bar */}
        <div>
          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
            <span>OOS Performance Ratio</span><span>≥ 0.50 required</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600 z-10" />
            <div
              className={`h-full rounded-full transition-all ${ratioOk ? "bg-green-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, Math.max(0, (ratio + 1) / 2) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
            <span>−1.0</span><span>0.0</span><span>+1.0</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Overfit panel ──────────────────────────────────────────────────────────────

function OverfitPanel({ overfit }: { overfit: OverfitResult }) {
  const cfg = OVERFIT_GRADE_CONFIG[overfit.grade];
  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" /> Overfitting Detection
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Score gauge */}
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="#1e293b" strokeWidth="8" />
              <circle
                cx="32" cy="32" r="26" fill="none"
                stroke={overfit.grade === "A" ? "#22c55e" : overfit.grade === "B" ? "#3b82f6" : overfit.grade === "C" ? "#eab308" : "#ef4444"}
                strokeWidth="8"
                strokeDasharray={`${overfit.score / 100 * 163.4} 163.4`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-sm font-bold font-mono ${cfg.color}`}>{Math.round(overfit.score)}</span>
            </div>
          </div>
          <div>
            <div className={`text-lg font-bold ${cfg.color}`}>{cfg.label}</div>
            <div className="text-[10px] text-muted-foreground">Grade: <span className={`font-bold ${cfg.color}`}>{overfit.grade}</span></div>
            <div className="text-[10px] text-muted-foreground">Degradation: <span className="font-mono font-semibold text-foreground">{overfit.degradation.toFixed(1)}%</span></div>
          </div>
        </div>

        {/* Score bar */}
        <div>
          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
            <span>Generalization Score</span><span>{overfit.score}/100</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${overfit.score}%` }} />
          </div>
        </div>

        <div className="text-[11px] text-slate-400 leading-relaxed border border-border/30 rounded-lg p-3 bg-slate-800/20">
          {overfit.verdict}
        </div>

        {/* Thresholds */}
        <div className="grid grid-cols-2 gap-1.5 text-[9px]">
          {[
            { g: "A", range: "80–100", c: "text-green-400" },
            { g: "B", range: "60–79",  c: "text-blue-400"  },
            { g: "C", range: "40–59",  c: "text-yellow-400"},
            { g: "F", range: "0–39",   c: "text-red-400"   },
          ].map(({ g, range, c }) => (
            <div key={g} className="flex items-center gap-1.5">
              <span className={`font-bold font-mono ${c}`}>{g}</span>
              <span className="text-muted-foreground">{range}</span>
              {g === overfit.grade && <span className="ml-auto text-primary text-[8px]">← you</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Live lock panel ────────────────────────────────────────────────────────────

function LiveLockPanel({ status, onOverride }: {
  status: StatusResponse;
  onOverride: (lock: boolean) => void;
}) {
  const locked = status.liveLocked;
  return (
    <Card className={`border-2 ${locked ? "border-red-500/40 bg-red-500/5" : "border-green-500/30 bg-green-500/5"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {locked ? <Lock className="w-5 h-5 text-red-400" /> : <Unlock className="w-5 h-5 text-green-400" />}
            <span className={`font-bold text-sm ${locked ? "text-red-400" : "text-green-400"}`}>
              {locked ? "LIVE TRADING LOCKED" : "LIVE TRADING UNLOCKED"}
            </span>
          </div>
          <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${locked ? "bg-red-500" : "bg-green-500"}`} />
        </div>

        {locked && status.lockReason && (
          <div className="text-[11px] text-red-300/80 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 leading-relaxed">
            {status.lockReason}
          </div>
        )}

        {!locked && (
          <div className="text-[11px] text-green-300/80">
            Strategy has passed validation — live trading is permitted.
          </div>
        )}

        {/* Override buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onOverride(false)}
            disabled={!locked}
            className={`flex items-center justify-center gap-1.5 text-[10px] py-2 rounded-lg border transition-colors
              ${!locked
                ? "border-green-500/20 text-green-400/40 cursor-not-allowed"
                : "border-green-500/30 text-green-400 hover:bg-green-500/10"}`}
          >
            <Unlock className="w-3 h-3" /> Force Unlock
          </button>
          <button
            onClick={() => onOverride(true)}
            disabled={locked}
            className={`flex items-center justify-center gap-1.5 text-[10px] py-2 rounded-lg border transition-colors
              ${locked
                ? "border-red-500/20 text-red-400/40 cursor-not-allowed"
                : "border-red-500/30 text-red-400 hover:bg-red-500/10"}`}
          >
            <Lock className="w-3 h-3" /> Force Lock
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Validation() {
  const qc = useQueryClient();
  const [elapsed, setElapsed] = useState(0);

  const { data: status, isLoading: statusLoading } = useQuery<StatusResponse>({
    queryKey: ["/validation/status"],
    queryFn: () => fetch("/api/validation/status").then(r => r.json()),
    refetchInterval: 5_000,
  });

  const runMutation = useMutation<ValidationResult, Error>({
    mutationFn: () => fetch("/api/validation/run", { method: "POST" }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.error)));
      return r.json();
    }),
    onMutate: () => {
      setElapsed(0);
      const t = setInterval(() => setElapsed(e => e + 1), 1000);
      return t;
    },
    onSettled: (_data, _err, _vars, ctx) => {
      if (ctx) clearInterval(ctx as ReturnType<typeof setInterval>);
      qc.invalidateQueries({ queryKey: ["/validation/status"] });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: (lock: boolean) =>
      fetch("/api/validation/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/validation/status"] }),
  });

  const result = status?.lastResult ?? null;
  const gradeConfig = result ? GRADE_CONFIG[result.grade] : null;
  const GradeIcon = gradeConfig?.icon ?? ShieldAlert;

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Strategy Validation</h1>
            <p className="text-[11px] text-muted-foreground">Walk-forward · Out-of-sample · Overfitting detection · Live lock</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["/validation/status"] })}
            className="gap-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            disabled={runMutation.isPending}
            onClick={() => runMutation.mutate()}
            className="gap-2 text-xs bg-primary hover:bg-primary/90"
          >
            {runMutation.isPending
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running ({elapsed}s)</>
              : <><Play className="w-3.5 h-3.5" /> Run Validation</>}
          </Button>
          <Badge variant="outline" className="font-mono text-[10px] px-3 py-1">v1.0 · MODULE 13</Badge>
        </div>
      </div>

      {/* ── No result yet ── */}
      {!result && !runMutation.isPending && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-10 flex flex-col items-center gap-4 text-center">
          <ShieldCheck className="w-12 h-12 text-primary/40" />
          <div>
            <div className="text-lg font-semibold mb-1">No validation run yet</div>
            <div className="text-sm text-muted-foreground max-w-md">
              Click "Run Validation" to fetch 300 hours of BTC/USD price data and test your strategy
              across 4 walk-forward windows plus a 70/30 in-sample / out-of-sample split.
            </div>
          </div>
          <div className="flex gap-4 text-[11px] text-muted-foreground">
            {["300 hourly candles", "4 walk-forward windows", "OOS split 70/30", "Overfitting score", "Live lock gate"].map(t => (
              <div key={t} className="flex items-center gap-1"><Zap className="w-3 h-3 text-primary" />{t}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Running spinner ── */}
      {runMutation.isPending && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-10 flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-primary animate-spin" />
          <div className="text-sm font-medium">Running validation... {elapsed}s elapsed</div>
          <div className="text-[11px] text-muted-foreground">Fetching 300h BTC candles · running 6 backtest slices · computing OOS ratio</div>
        </div>
      )}

      {/* ── Error ── */}
      {runMutation.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {runMutation.error?.message ?? "Validation failed"}
        </div>
      )}

      {/* ── Results ── */}
      {result && !runMutation.isPending && (
        <>
          {/* ── Top stat strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Overall grade */}
            <div className={`rounded-xl border p-4 bg-card/60 ${gradeConfig?.bg}`}>
              <div className="text-[10px] text-muted-foreground mb-2">Overall Grade</div>
              <div className="flex items-center gap-2">
                <GradeIcon className={`w-5 h-5 ${gradeConfig?.text}`} />
                <span className={`text-2xl font-bold font-mono ${gradeConfig?.text}`}>{result.grade}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">Score: {result.gradeScore}/100</div>
            </div>

            {/* OOS ratio */}
            <div className="rounded-xl border border-border/40 p-4 bg-card/60">
              <div className="text-[10px] text-muted-foreground mb-2">OOS/IS Ratio</div>
              <div className={`text-2xl font-bold font-mono ${result.oos.ratio >= 0.5 ? "text-green-400" : result.oos.ratio >= 0.3 ? "text-yellow-400" : "text-red-400"}`}>
                {result.oos.ratio.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">threshold ≥ 0.50</div>
            </div>

            {/* Walk-forward */}
            <div className="rounded-xl border border-border/40 p-4 bg-card/60">
              <div className="text-[10px] text-muted-foreground mb-2">Walk-Forward</div>
              <div className="text-2xl font-bold font-mono">
                <span className="text-green-400">{result.windows.filter(w => w.passed).length}</span>
                <span className="text-muted-foreground text-base">/{result.windows.length}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">windows passed</div>
            </div>

            {/* Overfit score */}
            <div className="rounded-xl border border-border/40 p-4 bg-card/60">
              <div className="text-[10px] text-muted-foreground mb-2">Overfit Score</div>
              <div className={`text-2xl font-bold font-mono ${OVERFIT_GRADE_CONFIG[result.overfit.grade].color}`}>
                {Math.round(result.overfit.score)}
                <span className="text-muted-foreground text-base font-normal">/100</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">Grade {result.overfit.grade}</div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

            {/* Left: walk-forward + OOS */}
            <div className="space-y-5">

              {/* Walk-forward windows */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Walk-Forward Windows
                  </h2>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {result.totalCandles} candles · {result.timeframe} · {result.symbol}
                    {result.runAt && <> · {fmtDate(result.runAt)}</>}
                  </span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {result.windows.map(w => (
                    <WindowCard key={w.windowIndex} w={w} total={result.windows.length} />
                  ))}
                </div>
              </div>

              {/* OOS */}
              <OOSPanel oos={result.oos} />

              {/* Reasons / findings */}
              <Card className="border-border/40 bg-card/60">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" /> Validation Findings
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {result.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                        {result.grade === "PASS"
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                          : result.grade === "WARN"
                          ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                          : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
                        <span className="leading-relaxed">{r}</span>
                      </div>
                    ))}
                  </div>

                  {/* Params used */}
                  <div className="mt-4 pt-3 border-t border-border/30">
                    <div className="text-[10px] text-muted-foreground mb-2">Strategy Parameters Tested</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "EMA Fast", value: result.params.emaShort },
                        { label: "EMA Slow", value: result.params.emaLong },
                        { label: "RSI Buy",  value: result.params.rsiBuyThreshold },
                        { label: "RSI Sell", value: result.params.rsiSellThreshold },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/30 rounded-lg px-2.5 py-1.5 text-[10px]">
                          <span className="text-muted-foreground">{label}:</span>
                          <span className="font-mono font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Live lock */}
              {status && (
                <LiveLockPanel
                  status={status}
                  onOverride={(lock) => overrideMutation.mutate(lock)}
                />
              )}

              {/* Overfitting */}
              <OverfitPanel overfit={result.overfit} />

              {/* Score guide */}
              <Card className="border-border/40 bg-card/60">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" /> Pass/Fail Criteria
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2 text-[10px]">
                  {[
                    { rule: "OOS/IS ratio ≥ 0.50", ok: result.oos.ratio >= 0.5 },
                    { rule: "OOS win rate ≥ 35%",  ok: result.oos.outOfSampleWinRate >= 35 },
                    { rule: "OOS return ≥ −5%",    ok: result.oos.outOfSampleReturn >= -5 },
                    { rule: "Overfit grade ≠ F",   ok: result.overfit.grade !== "F" },
                    { rule: `≥ 3/${result.windows.length} windows pass`, ok: result.windows.filter(w => w.passed).length >= 3 },
                  ].map(({ rule, ok }) => (
                    <div key={rule} className="flex items-center gap-2">
                      {ok
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{rule}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-border/30 text-muted-foreground leading-relaxed">
                    Live trading is locked when grade = FAIL. Override available for advanced users.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
