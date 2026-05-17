import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, RefreshCw, TrendingUp, TrendingDown, Trophy,
  Clock, DollarSign, Target, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, ArrowRight, Activity, Zap,
  AlertTriangle, Wallet, BarChart2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ── Types ──────────────────────────────────────────────────────────────────────

// Raw shape returned by GET /api/simulation/trades (per-user, DB-backed)
interface UserSimTrade {
  id:             string;
  symbol:         string;
  side:           "BUY" | "SELL";
  quantity:       number;
  entryPrice:     number;
  exitPrice:      number;
  entryTime:      number;   // unix ms
  exitTime:       number;   // unix ms
  sizeUSD:        number;
  realizedPnL:    number;
  realizedPnLPct: number;
  durationMs:     number;
  closeReason:    string;
}

// Normalised shape used throughout this page
interface Trade {
  id:          string;
  symbol:      string;
  side:        "BUY" | "SELL";
  amount:      number | null;
  price:       number | null;
  exitPrice:   number | null;
  pnl:         number | null;
  pnlPercent:  number | null;
  status:      string;
  mode:        string;
  signalId:    string | null;
  stopLoss:    number | null;
  takeProfit:  number | null;
  reason:      string | null;
  timestamp:   string;
  closedAt:    string | null;
}

function normalizeSimTrade(t: UserSimTrade): Trade {
  return {
    id:         t.id,
    symbol:     t.symbol,
    side:       t.side,
    amount:     t.sizeUSD,
    price:      t.entryPrice,
    exitPrice:  t.exitPrice,
    pnl:        t.realizedPnL,
    pnlPercent: t.realizedPnLPct,
    status:     "closed",
    mode:       "simulation",
    signalId:   null,
    stopLoss:   null,
    takeProfit: null,
    reason:     t.closeReason,
    timestamp:  new Date(t.entryTime).toISOString(),
    closedAt:   new Date(t.exitTime).toISOString(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function safeNum(v: number | null | undefined, fallback = 0): number {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

function fmtPrice(n: number | null | undefined): string {
  const v = safeNum(n);
  return v >= 1000
    ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${v.toFixed(4)}`;
}

function fmtPct(n: number | null | undefined): string {
  const v = safeNum(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtUSD(n: number | null | undefined): string {
  const v = safeNum(n);
  return `${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(2)}`;
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function pnlColor(v: number | null | undefined): string {
  const n = safeNum(v);
  return n >= 0 ? "text-green-400" : "text-red-400";
}

function pnlBorder(v: number | null | undefined): string {
  const n = safeNum(v);
  return n >= 0 ? "border-green-500/20" : "border-red-500/20";
}

function modeStyle(mode: string): string {
  switch (mode) {
    case "auto":   return "bg-primary/15 text-primary border-primary/30";
    case "test":   return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "manual": return "bg-slate-700/60 text-slate-300 border-slate-600/40";
    default:       return "bg-slate-700/60 text-slate-300 border-slate-600/40";
  }
}

// ── Summary calculator ─────────────────────────────────────────────────────────

interface Summary {
  total:    number;
  open:     number;
  closed:   number;
  wins:     number;
  losses:   number;
  winRate:  number;
  totalPnL: number;
  avgPnLPct: number;
}

function calcSummary(trades: Trade[]): Summary {
  const closed  = trades.filter(t => t.status === "closed");
  const open    = trades.filter(t => t.status === "open");
  const wins    = closed.filter(t => safeNum(t.pnl) >= 0);
  const losses  = closed.filter(t => safeNum(t.pnl) < 0);
  const winRate = closed.length > 0 ? parseFloat(((wins.length / closed.length) * 100).toFixed(1)) : 0;
  const totalPnL = closed.reduce((sum, t) => sum + safeNum(t.pnl), 0);
  const avgPnLPct = closed.length > 0
    ? closed.reduce((sum, t) => sum + safeNum(t.pnlPercent), 0) / closed.length
    : 0;

  return {
    total:    trades.length,
    open:     open.length,
    closed:   closed.length,
    wins:     wins.length,
    losses:   losses.length,
    winRate,
    totalPnL,
    avgPnLPct,
  };
}

// ── Paper trading account ──────────────────────────────────────────────────────

const START_BALANCE = 100_000;

function getLivePrice(t: Trade): number {
  return safeNum(t.price);
}

function calcAccount(trades: Trade[]) {
  const openTrades   = trades.filter(t => t?.status === "open");
  const closedTrades = trades.filter(t => t?.status === "closed");

  const closedPnL = closedTrades.reduce((sum, t) => sum + safeNum(t.pnl), 0);

  const unrealizedPnL = openTrades.reduce((sum, t) => {
    const current = getLivePrice(t);
    const entry   = safeNum(t.price);
    const amt     = safeNum(t.amount);
    if (entry === 0 || amt === 0) return sum;
    const pnl = t.side === "BUY"
      ? (current - entry) * amt
      : (entry - current) * amt;
    return sum + (isFinite(pnl) ? pnl : 0);
  }, 0);

  const totalPnL = closedPnL + unrealizedPnL;
  const equity   = START_BALANCE + totalPnL;

  return { closedPnL, unrealizedPnL, totalPnL, equity };
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

// ── Trade card ─────────────────────────────────────────────────────────────────

function TradeCard({ trade }: { trade: Trade }) {
  const [expanded, setExpanded] = useState(false);

  const pnl     = safeNum(trade.pnl);
  const pnlPct  = safeNum(trade.pnlPercent);
  const price   = safeNum(trade.price);
  const exit    = trade.exitPrice != null ? safeNum(trade.exitPrice) : null;
  const isOpen  = trade.status === "open";
  const win     = pnl >= 0;
  const symbol  = trade.symbol ?? "UNKNOWN";
  const display = symbol.replace(/USD$/, "");

  return (
    <div className={`rounded-xl border bg-card/60 overflow-hidden transition-all ${
      isOpen ? "border-primary/20" : pnlBorder(pnl)
    }`}>
      {/* ── Header row ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          isOpen ? "bg-primary/10" : win ? "bg-green-500/15" : "bg-red-500/15"
        }`}>
          {isOpen
            ? <Activity className="w-3.5 h-3.5 text-primary" />
            : win
              ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
              : <TrendingDown className="w-3.5 h-3.5 text-red-400" />
          }
        </div>

        {/* Symbol + side */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm">{display}</span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
              trade.side === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
            }`}>
              {trade.side ?? "—"}
            </span>
            {isOpen && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                LIVE
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{fmtTs(trade.timestamp)}</div>
        </div>

        {/* Entry → Exit */}
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono ml-1">
          <span>{fmtPrice(price)}</span>
          {exit != null && (
            <>
              <ArrowRight className="w-3 h-3 shrink-0" />
              <span>{fmtPrice(exit)}</span>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* P&L (closed only) */}
        {!isOpen ? (
          <div className="text-right mr-3">
            <div className={`text-sm font-bold font-mono ${pnlColor(pnl)}`}>{fmtUSD(pnl)}</div>
            <div className={`text-[10px] font-mono ${pnlColor(pnlPct)}`}>{fmtPct(pnlPct)}</div>
          </div>
        ) : (
          <div className="text-right mr-3">
            <div className="text-[10px] text-muted-foreground font-mono">${safeNum(trade.amount).toLocaleString()}</div>
            <div className="text-[9px] text-muted-foreground">position</div>
          </div>
        )}

        {/* Mode badge */}
        <div className={`text-[9px] font-mono px-2 py-1 rounded border ${modeStyle(trade.mode ?? "")}`}>
          {(trade.mode ?? "—").toUpperCase()}
        </div>

        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        }
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-border/30 px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            {[
              { label: "Entry Price",   value: fmtPrice(price) },
              { label: "Exit Price",    value: exit != null ? fmtPrice(exit) : "Open" },
              { label: "Position Size", value: `$${safeNum(trade.amount).toLocaleString()}` },
              { label: "Status",        value: (trade.status ?? "—").toUpperCase() },
              { label: "Stop Loss",     value: trade.stopLoss != null ? fmtPrice(trade.stopLoss) : "—" },
              { label: "Take Profit",   value: trade.takeProfit != null ? fmtPrice(trade.takeProfit) : "—" },
              { label: "Closed At",     value: trade.closedAt ? fmtTs(trade.closedAt) : "—" },
              { label: "Signal ID",     value: trade.signalId ? trade.signalId.slice(0, 8) + "…" : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/30">
                <div className="text-muted-foreground mb-0.5">{label}</div>
                <div className="font-mono font-semibold text-foreground">{value}</div>
              </div>
            ))}
          </div>

          {/* Reason / notes */}
          {trade.reason && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Reason</div>
              <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-800/30 rounded-lg p-3 border border-slate-700/20">
                {trade.reason}
              </div>
            </div>
          )}

          {/* P&L detail for closed trades */}
          {!isOpen && (
            <div className={`rounded-lg p-3 border flex items-center justify-between ${
              win ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"
            }`}>
              <div className="flex items-center gap-2">
                {win
                  ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />
                }
                <span className={`text-sm font-bold ${win ? "text-green-400" : "text-red-400"}`}>
                  {win ? "WIN" : "LOSS"}
                </span>
              </div>
              <div className="text-right">
                <div className={`font-mono font-bold text-sm ${pnlColor(pnl)}`}>{fmtUSD(pnl)}</div>
                <div className={`text-[10px] font-mono ${pnlColor(pnlPct)}`}>{fmtPct(pnlPct)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2">
      <BookOpen className="w-8 h-8 opacity-30" />
      <div className="text-sm">{message}</div>
      <div className="text-[11px]">{sub}</div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Journal() {
  const qc = useQueryClient();

  const {
    data: trades = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<Trade[]>({
    queryKey: ["/simulation/trades"],
    queryFn: async () => {
      // Uses the auth-gated, per-user DB-backed simulation trade history
      const res = await fetch("/api/simulation/trades", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: UserSimTrade[] = await res.json();
      return Array.isArray(data) ? data.map(normalizeSimTrade) : [];
    },
    refetchInterval:            15_000,
    refetchIntervalInBackground: true,
    staleTime:                  5_000,
  });

  function handleRefresh() {
    void refetch();
    void qc.refetchQueries({ queryKey: ["/simulation/trades"] });
  }

  const safeTrades = Array.isArray(trades) ? trades : [];
  const open       = safeTrades.filter(t => t?.status === "open");
  const closed     = safeTrades.filter(t => t?.status === "closed");
  const summary    = calcSummary(safeTrades);
  const account    = calcAccount(safeTrades);

  const pnlPositive      = summary.totalPnL >= 0;
  const equityPositive   = account.equity >= START_BALANCE;
  const totalPnLPositive = account.totalPnL >= 0;
  const unrealPositive   = account.unrealizedPnL >= 0;

  const equityChangePct = ((account.equity - START_BALANCE) / START_BALANCE) * 100;

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Trade Journal</h1>
            <p className="text-[11px] text-muted-foreground">My simulation trades · Closed history · Lifetime P&L · Auto-refresh 15s</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm" className="gap-2 text-xs"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Badge variant="outline" className="font-mono text-[10px] px-3 py-1">v1.0 · MODULE 12</Badge>
        </div>
      </div>

      {/* ── Error banner ── */}
      {isError && (
        <div className="flex items-center gap-2 border border-red-900/40 bg-red-950/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Failed to load trades. Check that the API server is running.
        </div>
      )}

      {/* ── Portfolio Panel ── */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">My Simulation Account</span>
          <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">based on your closed simulation trades</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card 1 — Starting Balance */}
          <div className="rounded-xl border border-border/40 p-4 bg-slate-800/30">
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] text-muted-foreground font-medium">Starting Balance</div>
              <DollarSign className="w-4 h-4 text-muted-foreground/40" />
            </div>
            <div className="text-xl font-bold font-mono">
              ${START_BALANCE.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Simulation starting balance</div>
          </div>

          {/* Card 2 — Account Value (equity) */}
          <div className={`rounded-xl border p-4 ${equityPositive ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] text-muted-foreground font-medium">Account Value</div>
              <BarChart2 className={`w-4 h-4 ${equityPositive ? "text-green-400" : "text-red-400"}`} />
            </div>
            <div className={`text-xl font-bold font-mono ${equityPositive ? "text-green-400" : "text-red-400"}`}>
              ${account.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`text-[10px] font-mono mt-0.5 ${equityPositive ? "text-green-400/70" : "text-red-400/70"}`}>
              {equityPositive ? "+" : ""}{equityChangePct.toFixed(2)}% from start
            </div>
          </div>

          {/* Card 3 — Unrealized PnL */}
          <div className={`rounded-xl border p-4 ${unrealPositive ? "border-primary/30 bg-primary/5" : "border-orange-500/30 bg-orange-500/5"}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] text-muted-foreground font-medium">Open PnL</div>
              <Activity className={`w-4 h-4 ${unrealPositive ? "text-primary" : "text-orange-400"}`} />
            </div>
            <div className={`text-xl font-bold font-mono ${unrealPositive ? "text-primary" : "text-orange-400"}`}>
              {unrealPositive ? "+" : ""}${account.unrealizedPnL.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {open.length} open position{open.length !== 1 ? "s" : ""} · unrealized
            </div>
          </div>

          {/* Card 4 — Total PnL */}
          <div className={`rounded-xl border p-4 ${totalPnLPositive ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] text-muted-foreground font-medium">Total PnL</div>
              {totalPnLPositive
                ? <TrendingUp className="w-4 h-4 text-green-400" />
                : <TrendingDown className="w-4 h-4 text-red-400" />
              }
            </div>
            <div className={`text-xl font-bold font-mono ${totalPnLPositive ? "text-green-400" : "text-red-400"}`}>
              {totalPnLPositive ? "+" : ""}${account.totalPnL.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Closed ${account.closedPnL.toFixed(2)} · Open ${account.unrealizedPnL.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Trades"
          value={String(summary.total)}
          sub={`${summary.open} open · ${summary.closed} closed`}
          icon={<Activity className="w-4 h-4 text-primary" />}
          accent="border-primary/20"
        />
        <StatCard
          label="Win Rate"
          value={summary.closed > 0 ? `${summary.winRate}%` : "—"}
          sub={summary.closed > 0 ? `${summary.wins}W / ${summary.losses}L` : "No closed trades yet"}
          icon={<Target className="w-4 h-4 text-green-400" />}
          accent={summary.winRate >= 50 ? "border-green-500/20" : summary.closed > 0 ? "border-red-500/20" : "border-border/40"}
        />
        <StatCard
          label="Total P&L"
          value={summary.closed > 0 ? `${pnlPositive ? "+" : ""}$${Math.abs(summary.totalPnL).toFixed(2)}` : "—"}
          sub={summary.closed > 0 ? `Avg ${fmtPct(summary.avgPnLPct)} per trade` : "No closed trades yet"}
          icon={<DollarSign className={`w-4 h-4 ${pnlPositive ? "text-green-400" : "text-red-400"}`} />}
          accent={summary.closed > 0 ? (pnlPositive ? "border-green-500/20" : "border-red-500/20") : "border-border/40"}
        />
        <StatCard
          label="Best Trade"
          value={closed.length > 0
            ? fmtUSD(Math.max(...closed.map(t => safeNum(t.pnl))))
            : "—"
          }
          sub={closed.length > 0
            ? (() => {
                const best = closed.reduce((b, t) => safeNum(t.pnl) > safeNum(b.pnl) ? t : b, closed[0]!);
                return best.symbol?.replace(/USD$/, "") ?? "—";
              })()
            : "No closed trades yet"
          }
          icon={<Trophy className="w-4 h-4 text-yellow-400" />}
          accent="border-yellow-500/20"
        />
      </div>

      {/* ── Body: two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">

        {/* ── Trade lists ── */}
        <div className="space-y-6">

          {/* Active Trades */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                Active Trades
                {open.length > 0 && (
                  <span className="text-[10px] font-mono bg-primary/15 border border-primary/20 text-primary px-2 py-0.5 rounded">
                    {open.length}
                  </span>
                )}
              </h2>
              <span className="text-[10px] text-muted-foreground font-mono">status = open</span>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                Loading trades…
              </div>
            )}

            {!isLoading && open.length === 0 && (
              <EmptyState
                message="No open positions"
                sub="Open positions are shown here — trade history is in the Closed section below"
              />
            )}

            {open.map(trade => (
              <TradeCard key={trade.id ?? Math.random()} trade={trade} />
            ))}
          </div>

          {/* Trade History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Trade History
              </h2>
              <span className="text-[10px] text-muted-foreground font-mono">{closed.length} closed · click to expand</span>
            </div>

            {!isLoading && closed.length === 0 && (
              <EmptyState
                message="No closed trades yet"
                sub="Close a position to see it here"
              />
            )}

            {closed.map(trade => (
              <TradeCard key={trade.id ?? Math.random()} trade={trade} />
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="space-y-4">

          {/* Win/loss breakdown */}
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
                  <span className="font-mono font-semibold text-foreground">
                    {summary.closed > 0 ? `${summary.winRate}%` : "—"}
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all"
                    style={{ width: `${summary.closed > 0 ? summary.winRate : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>Total P&L</span>
                  <span className={`font-mono font-semibold ${pnlPositive ? "text-green-400" : "text-red-400"}`}>
                    {summary.closed > 0 ? `${pnlPositive ? "+" : ""}$${Math.abs(summary.totalPnL).toFixed(2)}` : "—"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                    <div className="text-green-400 font-mono font-semibold text-sm">{summary.wins}</div>
                    <div className="text-muted-foreground">Wins</div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                    <div className="text-red-400 font-mono font-semibold text-sm">{summary.losses}</div>
                    <div className="text-muted-foreground">Losses</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Best / worst closed trades */}
          {closed.length > 0 && (() => {
            const best  = closed.reduce((b, t) => safeNum(t.pnl) > safeNum(b.pnl) ? t : b, closed[0]!);
            const worst = closed.reduce((w, t) => safeNum(t.pnl) < safeNum(w.pnl) ? t : w, closed[0]!);
            return (
              <Card className="border-border/40 bg-card/60">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" /> Notable Trades
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      <span className="text-[10px] font-semibold text-green-400">Best Trade</span>
                    </div>
                    <div className="text-sm font-bold">{(best.symbol ?? "").replace(/USD$/, "")}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtTs(best.closedAt ?? best.timestamp)}</div>
                    <div className="text-green-400 font-mono font-bold text-sm mt-1">{fmtUSD(best.pnl)}</div>
                  </div>
                  {best.id !== worst.id && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <XCircle className="w-3 h-3 text-red-400" />
                        <span className="text-[10px] font-semibold text-red-400">Worst Trade</span>
                      </div>
                      <div className="text-sm font-bold">{(worst.symbol ?? "").replace(/USD$/, "")}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtTs(worst.closedAt ?? worst.timestamp)}</div>
                      <div className="text-red-400 font-mono font-bold text-sm mt-1">{fmtUSD(worst.pnl)}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Mode breakdown */}
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Trade Modes
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {(["auto", "test", "manual"] as const).map(mode => {
                const count = safeTrades.filter(t => t?.mode === mode).length;
                const pct = safeTrades.length > 0 ? (count / safeTrades.length) * 100 : 0;
                return (
                  <div key={mode}>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span className="capitalize">{mode}</span>
                      <span className="font-mono">{count}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          mode === "auto" ? "bg-primary" : mode === "test" ? "bg-yellow-500" : "bg-slate-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {safeTrades.length === 0 && (
                <div className="text-[11px] text-muted-foreground">No trades yet.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
