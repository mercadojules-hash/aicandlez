import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, RefreshCw, TrendingUp, TrendingDown, Trophy, AlertTriangle,
  Clock, DollarSign, Target, Lightbulb, ChevronDown, ChevronUp, Trash2,
  CheckCircle2, XCircle, ArrowRight, Zap, Shield, Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  base: number; profitable: number; rrRatio: number;
  patience: number; sizing: number; trend: number;
}

interface JournalIndicators {
  emaFast: number; emaSlow: number; rsi: number; trend: string;
}

interface JournalEntry {
  id: string; symbol: string; displayName: string;
  side: "BUY" | "SELL"; entryPrice: number; exitPrice: number;
  entryTime: number; exitTime: number; sizeUSD: number;
  realizedPnL: number; realizedPnLPct: number; durationMs: number;
  indicatorsAtEntry: JournalIndicators; reasoning: string;
  closeReason: string; score: number; scoreBreakdown: ScoreBreakdown;
  notes: string; tags: string[];
}

interface FeedbackSummary {
  totalTrades: number; wins: number; losses: number; winRate: number;
  avgScore: number; totalPnL: number; avgHoldHours: number;
  bestTrade: JournalEntry | null; worstTrade: JournalEntry | null;
  avgWinPct: number; avgLossPct: number; insights: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return n >= 1000 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toFixed(4)}`;
}
function fmtPct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }
function fmtDur(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function scoreColor(s: number) {
  if (s >= 70) return "text-green-400";
  if (s >= 50) return "text-yellow-400";
  return "text-red-400";
}
function scoreBg(s: number) {
  if (s >= 70) return "bg-green-500/15 border-green-500/30 text-green-400";
  if (s >= 50) return "bg-yellow-500/15 border-yellow-500/30 text-yellow-400";
  return "bg-red-500/15 border-red-500/30 text-red-400";
}
function pnlColor(v: number) { return v >= 0 ? "text-green-400" : "text-red-400"; }

const CLOSE_REASON_LABELS: Record<string, { label: string; color: string }> = {
  MANUAL:        { label: "Manual",        color: "bg-slate-700/60 text-slate-300 border-slate-600/40" },
  TRAILING_STOP: { label: "Trailing Stop", color: "bg-blue-500/15  text-blue-400  border-blue-500/30" },
  RISK_KILL:     { label: "Risk Kill",     color: "bg-red-500/15   text-red-400   border-red-500/30"  },
  AUTO:          { label: "Auto",          color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
};

// ── Score breakdown mini bar ───────────────────────────────────────────────────

function ScoreBar({ score, breakdown }: { score: number; breakdown: ScoreBreakdown }) {
  const items = [
    { label: "Base",        value: breakdown.base,       max: 50,  color: "bg-slate-500" },
    { label: "Win/Loss",    value: breakdown.profitable, max: 20,  color: "bg-green-500" },
    { label: "R:R",         value: breakdown.rrRatio,    max: 10,  color: "bg-blue-500"  },
    { label: "Patience",    value: breakdown.patience,   max: 10,  color: "bg-purple-500"},
    { label: "Sizing",      value: breakdown.sizing,     max: 5,   color: "bg-cyan-500"  },
    { label: "Trend Align", value: breakdown.trend,      max: 10,  color: "bg-orange-500"},
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground font-mono">Score Breakdown</span>
        <span className={`text-base font-bold font-mono ${scoreColor(score)}`}>{score}<span className="text-[10px] text-muted-foreground">/100</span></span>
      </div>
      {items.map(({ label, value, max, color }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground w-16 shrink-0">{label}</span>
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${value >= 0 ? color : "bg-red-500"}`}
              style={{ width: `${Math.max(0, Math.abs(value) / Math.abs(max)) * 100}%` }}
            />
          </div>
          <span className={`text-[9px] font-mono w-8 text-right ${value >= 0 ? "text-muted-foreground" : "text-red-400"}`}>
            {value >= 0 ? `+${value}` : value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Trade card ─────────────────────────────────────────────────────────────────

function TradeCard({ entry, onDelete }: { entry: JournalEntry; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const reasonInfo = CLOSE_REASON_LABELS[entry.closeReason] ?? CLOSE_REASON_LABELS["MANUAL"]!;
  const win = entry.realizedPnL >= 0;

  return (
    <div className={`rounded-xl border bg-card/60 overflow-hidden transition-all ${win ? "border-green-500/20" : "border-red-500/20"}`}>
      {/* ── Header row ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Win/loss icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${win ? "bg-green-500/15" : "bg-red-500/15"}`}>
          {win ? <TrendingUp className="w-3.5 h-3.5 text-green-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
        </div>

        {/* Symbol + side */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm">{entry.displayName}</span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${entry.side === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {entry.side}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(entry.exitTime)}</div>
        </div>

        {/* Entry → Exit */}
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono ml-1">
          <span>{fmtPrice(entry.entryPrice)}</span>
          <ArrowRight className="w-3 h-3 shrink-0" />
          <span>{fmtPrice(entry.exitPrice)}</span>
        </div>

        <div className="flex-1" />

        {/* P&L */}
        <div className="text-right mr-3">
          <div className={`text-sm font-bold font-mono ${pnlColor(entry.realizedPnL)}`}>
            {entry.realizedPnL >= 0 ? "+" : ""}${Math.abs(entry.realizedPnL).toFixed(2)}
          </div>
          <div className={`text-[10px] font-mono ${pnlColor(entry.realizedPnL)}`}>{fmtPct(entry.realizedPnLPct)}</div>
        </div>

        {/* Score badge */}
        <div className={`text-sm font-bold font-mono border rounded-lg px-2.5 py-1 ${scoreBg(entry.score)}`}>
          {entry.score}
        </div>

        {/* Close reason */}
        <div className={`hidden md:block text-[9px] font-mono px-2 py-1 rounded border ${reasonInfo.color}`}>
          {reasonInfo.label}
        </div>

        {/* Duration */}
        <div className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          {fmtDur(entry.durationMs)}
        </div>

        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/50 shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-border/30 px-4 py-4 grid grid-cols-1 md:grid-cols-[1fr_180px] gap-5">
          {/* Left: details */}
          <div className="space-y-4">
            {/* Indicators at entry */}
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Indicators at Entry</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "EMA Fast",  value: fmtPrice(entry.indicatorsAtEntry.emaFast) },
                  { label: "EMA Slow",  value: fmtPrice(entry.indicatorsAtEntry.emaSlow) },
                  { label: "RSI",       value: entry.indicatorsAtEntry.rsi.toFixed(1) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/30">
                    <div className="text-[9px] text-muted-foreground mb-0.5">{label}</div>
                    <div className="text-xs font-mono font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                  entry.indicatorsAtEntry.trend === "BULLISH" ? "bg-green-500/10 border-green-500/30 text-green-400" :
                  entry.indicatorsAtEntry.trend === "BEARISH" ? "bg-red-500/10 border-red-500/30 text-red-400" :
                  "bg-slate-600/20 border-slate-600/30 text-slate-400"
                }`}>
                  Trend: {entry.indicatorsAtEntry.trend}
                </span>
              </div>
            </div>

            {/* Reasoning */}
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">AI Reasoning</div>
              <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-800/30 rounded-lg p-3 border border-slate-700/20">
                {entry.reasoning}
              </div>
            </div>

            {/* Notes */}
            {entry.notes && (
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Notes</div>
                <div className="text-[11px] text-slate-400 italic leading-relaxed">{entry.notes}</div>
              </div>
            )}

            {/* Tags */}
            {entry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map(tag => (
                  <span key={tag} className="text-[9px] font-mono px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary/70">{tag}</span>
                ))}
              </div>
            )}

            {/* Trade metrics */}
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="bg-slate-800/30 rounded-lg p-2 border border-slate-700/20">
                <div className="text-muted-foreground">Size</div>
                <div className="font-mono font-semibold">${entry.sizeUSD.toLocaleString()}</div>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-2 border border-slate-700/20">
                <div className="text-muted-foreground">Duration</div>
                <div className="font-mono font-semibold">{fmtDur(entry.durationMs)}</div>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-2 border border-slate-700/20">
                <div className="text-muted-foreground">Closed via</div>
                <div className="font-mono font-semibold">{reasonInfo.label}</div>
              </div>
            </div>
          </div>

          {/* Right: score breakdown + delete */}
          <div className="space-y-3">
            <ScoreBar score={entry.score} breakdown={entry.scoreBreakdown} />
            <button
              onClick={() => onDelete(entry.id)}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] text-red-400/60 hover:text-red-400 transition-colors py-2 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
            >
              <Trash2 className="w-3 h-3" /> Remove entry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className={`rounded-xl border p-4 bg-card/60 ${accent}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
        {icon}
      </div>
      <div className="text-xl font-bold font-mono">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Journal() {
  const qc = useQueryClient();

  const { data: tradesData, isLoading: tradesLoading } = useQuery<{ trades: JournalEntry[] }>({
    queryKey: ["/journal/trades"],
    queryFn: () => fetch("/api/journal/trades").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery<FeedbackSummary>({
    queryKey: ["/journal/summary"],
    queryFn: () => fetch("/api/journal/summary").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/journal/trades/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/journal/trades"] });
      qc.invalidateQueries({ queryKey: ["/journal/summary"] });
    },
  });

  const trades = tradesData?.trades ?? [];

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Trade Journal · Learning</h1>
            <p className="text-[11px] text-muted-foreground">Entry/exit log · Indicator snapshot · Scoring · Feedback</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-xs"
            onClick={() => { qc.invalidateQueries({ queryKey: ["/journal/trades"] }); qc.invalidateQueries({ queryKey: ["/journal/summary"] }); }}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Badge variant="outline" className="font-mono text-[10px] px-3 py-1">v1.0 · MODULE 12</Badge>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Trades" value={String(summary?.totalTrades ?? 0)}
          sub={`${summary?.wins ?? 0}W / ${summary?.losses ?? 0}L`}
          icon={<Activity className="w-4 h-4 text-primary" />}
          accent="border-primary/20"
        />
        <StatCard
          label="Win Rate" value={`${summary?.winRate ?? 0}%`}
          sub={`Avg win ${summary?.avgWinPct?.toFixed(2) ?? 0}%`}
          icon={<Target className="w-4 h-4 text-green-400" />}
          accent={`border-${(summary?.winRate ?? 0) >= 50 ? "green" : "red"}-500/20`}
        />
        <StatCard
          label="Avg Score" value={`${summary?.avgScore ?? 0}/100`}
          sub={(summary?.avgScore ?? 0) >= 70 ? "Excellent" : (summary?.avgScore ?? 0) >= 50 ? "Good" : "Needs work"}
          icon={<Trophy className="w-4 h-4 text-yellow-400" />}
          accent="border-yellow-500/20"
        />
        <StatCard
          label="Total P&L" value={`${(summary?.totalPnL ?? 0) >= 0 ? "+" : ""}$${Math.abs(summary?.totalPnL ?? 0).toFixed(2)}`}
          sub={`Avg hold ${summary?.avgHoldHours?.toFixed(1) ?? 0}h`}
          icon={<DollarSign className={`w-4 h-4 ${(summary?.totalPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`} />}
          accent={(summary?.totalPnL ?? 0) >= 0 ? "border-green-500/20" : "border-red-500/20"}
        />
      </div>

      {/* ── Body ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* Trade list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Trade Log</h2>
            <span className="text-[10px] text-muted-foreground font-mono">{trades.length} entries · click to expand</span>
          </div>

          {tradesLoading && (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading journal...</div>
          )}

          {!tradesLoading && trades.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <BookOpen className="w-8 h-8 opacity-30" />
              <div className="text-sm">No trades logged yet.</div>
              <div className="text-[11px]">Close a simulation position to auto-log it here.</div>
            </div>
          )}

          {trades.map(entry => (
            <TradeCard
              key={entry.id}
              entry={entry}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>

        {/* Right panel: feedback */}
        <div className="space-y-4">

          {/* Win rate bar */}
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>Win Rate</span>
                  <span className="font-mono font-semibold text-foreground">{summary?.winRate ?? 0}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all"
                    style={{ width: `${summary?.winRate ?? 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>Avg Score</span>
                  <span className={`font-mono font-semibold ${scoreColor(summary?.avgScore ?? 0)}`}>{summary?.avgScore ?? 0}/100</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${(summary?.avgScore ?? 0) >= 70 ? "bg-green-500" : (summary?.avgScore ?? 0) >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${summary?.avgScore ?? 0}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                  <div className="text-green-400 font-mono font-semibold text-sm">+{summary?.avgWinPct?.toFixed(2) ?? 0}%</div>
                  <div className="text-muted-foreground">Avg Win</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                  <div className="text-red-400 font-mono font-semibold text-sm">{summary?.avgLossPct?.toFixed(2) ?? 0}%</div>
                  <div className="text-muted-foreground">Avg Loss</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Best / Worst trades */}
          {(summary?.bestTrade || summary?.worstTrade) && (
            <Card className="border-border/40 bg-card/60">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" /> Notable Trades
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {summary?.bestTrade && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      <span className="text-[10px] font-semibold text-green-400">Best Trade</span>
                    </div>
                    <div className="text-sm font-bold">{summary.bestTrade.displayName}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtDate(summary.bestTrade.exitTime)}</div>
                    <div className="text-green-400 font-mono font-bold text-sm mt-1">
                      +${summary.bestTrade.realizedPnL.toFixed(2)} ({fmtPct(summary.bestTrade.realizedPnLPct)})
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${scoreBg(summary.bestTrade.score)}`}>
                        {summary.bestTrade.score}/100
                      </span>
                    </div>
                  </div>
                )}
                {summary?.worstTrade && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <XCircle className="w-3 h-3 text-red-400" />
                      <span className="text-[10px] font-semibold text-red-400">Worst Trade</span>
                    </div>
                    <div className="text-sm font-bold">{summary.worstTrade.displayName}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtDate(summary.worstTrade.exitTime)}</div>
                    <div className="text-red-400 font-mono font-bold text-sm mt-1">
                      ${summary.worstTrade.realizedPnL.toFixed(2)} ({fmtPct(summary.worstTrade.realizedPnLPct)})
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${scoreBg(summary.worstTrade.score)}`}>
                        {summary.worstTrade.score}/100
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Learning insights */}
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" /> Learning Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {(!summary?.insights || summary.insights.length === 0) ? (
                <div className="text-[11px] text-muted-foreground">Log more trades to generate insights.</div>
              ) : (
                <div className="space-y-2">
                  {summary.insights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                      <Zap className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                      <span className="leading-relaxed">{insight}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Score guide */}
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Score Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2 text-[10px]">
                {[
                  { range: "70–100", label: "Excellent", color: "text-green-400", dot: "bg-green-400" },
                  { range: "50–69",  label: "Good",      color: "text-yellow-400", dot: "bg-yellow-400" },
                  { range: "0–49",   label: "Review",    color: "text-red-400",    dot: "bg-red-400"   },
                ].map(({ range, label, color, dot }) => (
                  <div key={range} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className={`font-mono ${color}`}>{range}</span>
                    <span className="text-muted-foreground">— {label}</span>
                  </div>
                ))}
                <div className="mt-3 pt-2 border-t border-border/30 text-muted-foreground leading-relaxed">
                  Factors: profitability, risk/reward, patience, position sizing, trend alignment.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
