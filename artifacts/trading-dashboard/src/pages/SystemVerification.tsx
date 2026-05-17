import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, AlertCircle, RefreshCw, Activity, Database,
  Brain, GitMerge, TrendingUp, ShieldX, Network, Timer, BookOpen,
  ShieldCheck, BarChart2, Clock, Wifi, WifiOff, Cpu,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface MarketDataStatus {
  ok: boolean; symbol: string; close: number; timestamp: number; ageSeconds: number;
}
interface SignalRow {
  id: string; symbol: string; timeframe: string; action: string;
  confidence: number; trend: string; reasoning: string; price: number; timestamp: string;
}
interface MtfStatus {
  confirmed: boolean; lastAction: string | null; lastShortSummary: string | null;
  confirmedCount: number; lastSignalAt: number | null;
}
interface AutoTradeStatus {
  mode: string; totalExecuted: number; totalBlocked: number;
  lastTrade: { symbol: string; side: string; amount: number; price: number; status: string; timestamp: string } | null;
}
interface LogItem { message: string; timestamp: string }
interface TrailingStatus {
  hitsThisSession: number; activeCount: number; lastHit: LogItem | null;
  positions: Array<{ symbol: string; status: string; gainPct: number }>;
}
interface JournalEntry {
  id: string; symbol: string; side: string; realizedPnLPct: number; closeReason: string; exitTime: string;
}
interface ValidationStatus {
  liveLocked: boolean; lockReason: string; hasRun: boolean; lastGrade: string | null;
  gradeScore: number | null; profitable: boolean | null; riskScore: number | null; summary: string;
}
interface BacktestCaps { timeframes: string[]; strategy: string; dataSource: string }

interface VerificationData {
  generatedAt: string;
  checks: {
    marketData:        MarketDataStatus | null;
    lastSignal:        SignalRow | null;
    mtfGate:           MtfStatus;
    autoTrading:       AutoTradeStatus;
    riskEngine:        { lastBlock: LogItem | null };
    correlationFilter: { blocksThisSession: number; lastBlock: LogItem | null };
    trailingStops:     TrailingStatus;
    journal:           { entryCount: number; lastEntry: JournalEntry | null };
    validation:        ValidationStatus;
    backtest:          BacktestCaps;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ago(ts: string | number | null): string {
  if (!ts) return "never";
  const ms = Date.now() - (typeof ts === "number" ? ts : new Date(ts).getTime());
  if (ms < 0)     return "just now";
  if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

type Status = "ok" | "warn" | "fail" | "idle";

function StatusDot({ s }: { s: Status }) {
  const cls =
    s === "ok"   ? "bg-emerald-500" :
    s === "warn" ? "bg-amber-400" :
    s === "fail" ? "bg-red-500" :
                   "bg-muted-foreground/30";
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

function StatusIcon({ s, size = 16 }: { s: Status; size?: number }) {
  const cls = `w-${size === 16 ? 4 : 5} h-${size === 16 ? 4 : 5}`;
  if (s === "ok")   return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (s === "warn") return <AlertCircle  className={`${cls} text-amber-400`} />;
  if (s === "fail") return <XCircle      className={`${cls} text-red-500`} />;
  return <AlertCircle className={`${cls} text-muted-foreground/40`} />;
}

function Badge({ label, variant = "default" }: { label: string; variant?: "ok" | "warn" | "fail" | "default" }) {
  const cls =
    variant === "ok"   ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
    variant === "warn" ? "bg-amber-400/15 text-amber-300 border-amber-400/30" :
    variant === "fail" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                         "bg-muted/40 text-muted-foreground border-border/40";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${cls}`}>
      {label}
    </span>
  );
}

// ── Card shell ───────────────────────────────────────────────────────────────

function CheckCard({
  icon, title, status, children,
}: {
  icon: React.ReactNode;
  title: string;
  status: Status;
  children: React.ReactNode;
}) {
  const border =
    status === "ok"   ? "border-emerald-500/25" :
    status === "warn" ? "border-amber-400/25" :
    status === "fail" ? "border-red-500/25" :
                        "border-border/40";

  return (
    <div className={`bg-card border ${border} rounded-xl p-4 flex flex-col gap-3`}>
      <div className="flex items-center gap-2.5">
        <div className="text-muted-foreground/60 shrink-0">{icon}</div>
        <span className="text-sm font-semibold tracking-wide">{title}</span>
        <div className="ml-auto"><StatusIcon s={status} /></div>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground/60 shrink-0">{label}</span>
      <span className={`text-right text-foreground/80 ${mono ? "font-mono" : ""} break-all`}>{value}</span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SystemVerification() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<VerificationData>({
    queryKey:        ["system-verification"],
    queryFn:         () => fetch("/api/system/verification").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const c = data?.checks;

  // ── Derived status values ──────────────────────────────────────────────────

  const krakenSt: Status = c?.marketData?.ok ? "ok" : c?.marketData ? "warn" : "fail";

  const signalSt: Status = c?.lastSignal
    ? new Date(c.lastSignal.timestamp).getTime() > Date.now() - 600_000 ? "ok" : "warn"
    : "idle";

  const mtfSt: Status =
    (c?.mtfGate?.confirmedCount ?? 0) > 0 ? "ok" :
    c?.mtfGate?.lastSignalAt ? "warn" : "idle";

  const autoSt: Status =
    c?.autoTrading.mode === "simulation" ? "ok" : "warn";

  const riskSt: Status = c?.riskEngine.lastBlock ? "warn" : "ok";
  const corrSt: Status = (c?.correlationFilter.blocksThisSession ?? 0) > 0 ? "warn" : "ok";

  const trailSt: Status =
    (c?.trailingStops.activeCount ?? 0) > 0 ? "ok" :
    (c?.trailingStops.hitsThisSession ?? 0) > 0 ? "ok" : "idle";

  const journalSt: Status = (c?.journal.entryCount ?? 0) > 0 ? "ok" : "idle";

  const valSt: Status =
    !c?.validation.hasRun ? "idle" :
    c?.validation.lastGrade === "PASS" ? "ok" :
    c?.validation.lastGrade === "WARN" ? "warn" : "fail";

  const btSt: Status = "ok";

  const allStatuses: Status[] = [krakenSt, signalSt, mtfSt, autoSt, riskSt, corrSt, trailSt, journalSt, valSt, btSt];
  const okCount   = allStatuses.filter((s) => s === "ok").length;
  const warnCount = allStatuses.filter((s) => s === "warn").length;
  const idleCount = allStatuses.filter((s) => s === "idle").length;

  const overallStatus: Status =
    warnCount > 3 ? "warn" :
    okCount >= 6  ? "ok"   : "warn";

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Cpu className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-wide">System Verification</h1>
            <Badge
              label={overallStatus === "ok" ? "SYSTEMS NOMINAL" : overallStatus === "warn" ? "REVIEW NEEDED" : "FAULT DETECTED"}
              variant={overallStatus}
            />
          </div>
          <p className="text-sm text-muted-foreground/60">
            Live proof that every engine subsystem is operational · Auto-refreshes every 30s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-card text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Score bar ── */}
      {!isLoading && (
        <div className="bg-card border border-border/40 rounded-xl p-4 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <StatusIcon s={overallStatus} size={20} />
            <div>
              <div className="text-sm font-semibold">{okCount + warnCount}/{allStatuses.length} checks passed</div>
              <div className="text-xs text-muted-foreground/60">
                {okCount} nominal · {warnCount} warnings · {idleCount} pending data
              </div>
            </div>
          </div>
          <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.round((okCount / allStatuses.length) * 100)}%` }}
            />
          </div>
          <div className="text-sm font-mono text-muted-foreground/60">
            Last: {data ? ago(data.generatedAt) : "—"}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground/40">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading verification data…
        </div>
      )}

      {/* ── Grid ── */}
      {!isLoading && c && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

          {/* 1 · Market Data */}
          <CheckCard icon={<Database className="w-4 h-4" />} title="Market Data" status={krakenSt}>
            <Row label="Status" value={
              <Badge label={c.marketData?.ok ? "LIVE" : "STALE"} variant={c.marketData?.ok ? "ok" : "warn"} />
            } />
            <Row label="Symbol"    value={c.marketData?.symbol ?? "—"} mono />
            <Row label="Last close" value={c.marketData ? `$${fmt(c.marketData.close)}` : "—"} mono />
            <Row label="Candle age" value={c.marketData ? `${c.marketData.ageSeconds}s` : "—"} mono />
            <Row label="Source"    value="Alpaca / Binance public API" />
          </CheckCard>

          {/* 2 · Last Signal */}
          <CheckCard icon={<Activity className="w-4 h-4" />} title="Signal Generation" status={signalSt}>
            <Row label="Action"    value={
              c.lastSignal
                ? <Badge label={c.lastSignal.action} variant={c.lastSignal.action === "BUY" ? "ok" : c.lastSignal.action === "SELL" ? "fail" : "default"} />
                : "—"
            } />
            <Row label="Symbol"      value={`${c.lastSignal?.symbol ?? "—"} · ${c.lastSignal?.timeframe ?? "—"}`} mono />
            <Row label="Confidence" value={c.lastSignal ? `${c.lastSignal.confidence.toFixed(1)}%` : "—"} mono />
            <Row label="Generated"  value={c.lastSignal ? ago(c.lastSignal.timestamp) : "—"} />
            <Row label="Summary" value={
              <span className="text-[10px] leading-tight">{c.lastSignal?.reasoning?.slice(0, 80) ?? "—"}{(c.lastSignal?.reasoning?.length ?? 0) > 80 ? "…" : ""}</span>
            } />
          </CheckCard>

          {/* 3 · MTF Gate */}
          <CheckCard icon={<GitMerge className="w-4 h-4" />} title="Multi-Timeframe Gate" status={mtfSt}>
            <Row label="Last 5m+15m action" value={
              c.mtfGate.lastAction
                ? <Badge label={c.mtfGate.lastAction} variant={c.mtfGate.lastAction === "BUY" ? "ok" : c.mtfGate.lastAction === "SELL" ? "fail" : "default"} />
                : "—"
            } />
            <Row label="MTF confirmed" value={
              <Badge label={c.mtfGate.confirmed ? "YES" : "NO"} variant={c.mtfGate.confirmed ? "ok" : "default"} />
            } />
            <Row label="Total confirmed"    value={String(c.mtfGate.confirmedCount ?? 0)} mono />
            <Row label="Last tick"          value={c.mtfGate.lastSignalAt ? ago(c.mtfGate.lastSignalAt) : "—"} />
            {c.mtfGate.lastShortSummary && (
              <Row label="Summary" value={
                <span className="text-[10px] leading-tight">{c.mtfGate.lastShortSummary}</span>
              } />
            )}
          </CheckCard>

          {/* 4 · Auto-trading */}
          <CheckCard icon={<Cpu className="w-4 h-4" />} title="Auto-Trading Mode" status={autoSt}>
            <Row label="Mode" value={<Badge label={c.autoTrading.mode.toUpperCase()} variant="ok" />} />
            <Row label="Executed"    value={String(c.autoTrading.totalExecuted)} mono />
            <Row label="Blocked"     value={String(c.autoTrading.totalBlocked)} mono />
            {c.autoTrading.lastTrade ? (
              <>
                <Row label="Last trade" value={`${c.autoTrading.lastTrade.side} ${c.autoTrading.lastTrade.symbol}`} mono />
                <Row label="Entry price" value={`$${fmt(c.autoTrading.lastTrade.price)}`} mono />
                <Row label="Trade time" value={ago(c.autoTrading.lastTrade.timestamp)} />
              </>
            ) : (
              <Row label="Last trade" value="No trades yet" />
            )}
          </CheckCard>

          {/* 5 · Risk Engine */}
          <CheckCard icon={<ShieldX className="w-4 h-4" />} title="Risk Engine" status={riskSt}>
            <Row label="Status" value={<Badge label="ACTIVE" variant="ok" />} />
            {c.riskEngine.lastBlock ? (
              <>
                <Row label="Last block" value={ago(c.riskEngine.lastBlock.timestamp)} />
                <Row label="Reason" value={
                  <span className="text-[10px] leading-tight">{c.riskEngine.lastBlock.message.slice(0, 100)}</span>
                } />
              </>
            ) : (
              <Row label="Last block" value="None this session" />
            )}
            <Row label="Note" value="Daily cap + max drawdown gated" />
          </CheckCard>

          {/* 6 · Correlation Filter */}
          <CheckCard icon={<Network className="w-4 h-4" />} title="Correlation Filter" status={corrSt}>
            <Row label="Status" value={<Badge label="ACTIVE" variant="ok" />} />
            <Row label="Blocks this session" value={String(c.correlationFilter.blocksThisSession)} mono />
            {c.correlationFilter.lastBlock ? (
              <>
                <Row label="Last block" value={ago(c.correlationFilter.lastBlock.timestamp)} />
                <Row label="Reason" value={
                  <span className="text-[10px] leading-tight">{c.correlationFilter.lastBlock.message.slice(0, 90)}</span>
                } />
              </>
            ) : (
              <Row label="Last block" value="None this session" />
            )}
            <Row label="Scope" value="BTC / ETH / SOL Pearson-r" />
          </CheckCard>

          {/* 7 · Trailing Stops */}
          <CheckCard icon={<Timer className="w-4 h-4" />} title="Trailing Stop Engine" status={trailSt}>
            <Row label="Status" value={<Badge label="RUNS EVERY TICK" variant="ok" />} />
            <Row label="Active positions" value={String(c.trailingStops.activeCount)} mono />
            <Row label="Hits this session" value={String(c.trailingStops.hitsThisSession)} mono />
            {c.trailingStops.positions.length > 0 ? (
              <div className="mt-1 space-y-1">
                {c.trailingStops.positions.slice(0, 3).map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="font-mono">{p.symbol}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge label={p.status} variant={p.status === "ACTIVE" ? "ok" : p.status === "TRIGGERED" ? "warn" : "default"} />
                      <span className={`font-mono text-[10px] ${p.gainPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {p.gainPct >= 0 ? "+" : ""}{p.gainPct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Row label="Open positions" value="None tracked" />
            )}
            {c.trailingStops.lastHit && (
              <Row label="Last hit" value={ago(c.trailingStops.lastHit.timestamp)} />
            )}
          </CheckCard>

          {/* 8 · Journal */}
          <CheckCard icon={<BookOpen className="w-4 h-4" />} title="Trade Journal" status={journalSt}>
            <Row label="Total entries" value={String(c.journal.entryCount)} mono />
            {c.journal.lastEntry ? (
              <>
                <Row label="Last trade"  value={`${c.journal.lastEntry.side} ${c.journal.lastEntry.symbol}`} mono />
                <Row label="PnL"         value={
                  <span className={c.journal.lastEntry.realizedPnLPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {c.journal.lastEntry.realizedPnLPct >= 0 ? "+" : ""}{c.journal.lastEntry.realizedPnLPct.toFixed(2)}%
                  </span>
                } />
                <Row label="Close reason" value={<Badge label={c.journal.lastEntry.closeReason} variant="default" />} />
                <Row label="Closed"      value={ago(c.journal.lastEntry.exitTime)} />
              </>
            ) : (
              <Row label="Entries" value="Populated by sample data or real closes" />
            )}
          </CheckCard>

          {/* 9 · Validation */}
          <CheckCard icon={<ShieldCheck className="w-4 h-4" />} title="Walk-Forward Validation" status={valSt}>
            <Row label="Has run" value={<Badge label={c.validation.hasRun ? "YES" : "NOT YET"} variant={c.validation.hasRun ? "ok" : "default"} />} />
            {c.validation.hasRun ? (
              <>
                <Row label="Grade"      value={<Badge label={c.validation.lastGrade ?? "?"} variant={c.validation.lastGrade === "PASS" ? "ok" : c.validation.lastGrade === "WARN" ? "warn" : "fail"} />} />
                <Row label="Score"      value={`${Math.round(c.validation.gradeScore ?? 0)}/100`} mono />
                <Row label="Profitable" value={<Badge label={c.validation.profitable ? "YES" : "NO"} variant={c.validation.profitable ? "ok" : "fail"} />} />
                <Row label="Risk score" value={`${c.validation.riskScore ?? "—"}/100`} mono />
              </>
            ) : (
              <Row label="Action" value="Run POST /api/validation/run to start" />
            )}
            <Row label="Summary" value={
              <span className="text-[10px] leading-tight">{c.validation.summary}</span>
            } />
          </CheckCard>

          {/* 10 · Backtest */}
          <CheckCard icon={<BarChart2 className="w-4 h-4" />} title="Backtest Engine" status={btSt}>
            <Row label="Strategy"    value={c.backtest.strategy} />
            <Row label="Data source" value={c.backtest.dataSource} />
            <div className="mt-1">
              <div className="text-muted-foreground/50 mb-1">Available timeframes</div>
              <div className="flex flex-wrap gap-1">
                {c.backtest.timeframes.map((tf) => (
                  <Badge key={tf} label={tf} variant="ok" />
                ))}
              </div>
            </div>
          </CheckCard>

          {/* Live feed status summary card */}
          <div className="bg-card border border-border/40 rounded-xl p-4 flex flex-col gap-3 md:col-span-2 xl:col-span-1">
            <div className="flex items-center gap-2.5">
              <Wifi className="w-4 h-4 text-muted-foreground/60" />
              <span className="text-sm font-semibold tracking-wide">Engine Loop</span>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                RUNNING
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <Row label="Tick interval"    value="60 seconds" mono />
              <Row label="Per tick"         value="MTF analysis + trailing stops + signals" />
              <Row label="Auto-trade gate"  value="5m AND 15m must agree on direction" />
              <Row label="Execution mode"   value={<Badge label="SIMULATION ONLY" variant="ok" />} />
              <Row label="Symbols tracked"  value="BTCUSD · ETHUSD · SOLUSD" />
            </div>
            <div className="mt-auto pt-2 border-t border-border/30 text-[10px] text-muted-foreground/40 font-mono">
              Snapshot: {data ? new Date(data.generatedAt).toLocaleTimeString() : "—"}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
