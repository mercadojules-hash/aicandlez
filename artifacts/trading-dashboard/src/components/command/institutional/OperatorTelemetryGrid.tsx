import { authFetch } from "@/lib/authFetch";
/**
 * OperatorTelemetryGrid — institutional operator-only telemetry surface.
 *
 * Comprehensive 14-panel deep-layer telemetry grid. Renders BELOW the
 * existing PlatformOverview / CommandBar / LiveAccountPanel surfaces.
 *
 *   Row 1  Latency · Funnel · Live Execution Stream
 *   Row 2  Fees & Revenue · Subscription Telemetry
 *   Row 3  Active Users · AI Throughput · Engine Health
 *   Row 4  Exchanges · Balances · Exchange Mode + Kill Switch
 *   Row 5  Cross-Tenant Positions · Cross-Tenant Closed Trades
 *
 * Endpoints (all admin-gated):
 *   /api/admin/execution-telemetry  /api/admin/platform-overview
 *   /api/admin/analytics/fees       /api/admin/analytics/memberships
 *   /api/admin/positions            /api/admin/closed-trades
 *   /api/engine/status              /api/exchange/status
 *   /api/exchange/balances          /api/adapters/health
 *   /api/exchange/kill (POST · kill switch button)
 *
 * All data is real (no fabricated values) and auto-refreshes.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Gauge, GitBranch, Radio, DollarSign, Users,
  ArrowDownRight, CheckCircle2, XCircle, AlertCircle,
  Activity, Brain, HeartPulse, Network, Wallet, Power, ToggleRight,
  TrendingUp, History,
} from "lucide-react";
import { N } from "./theme";

// ── Types ────────────────────────────────────────────────────────────────────

interface LatencyStat {
  exchange:           string;
  sampleCount:        number;
  avgSignalLatencyMs: number;
  p50SignalLatencyMs: number;
  p95SignalLatencyMs: number;
  avgFillLatencyMs:   number;
  p95FillLatencyMs:   number;
  avgRoundTripMs:     number;
  avgSlippagePct:     number;
  fillRate:           number;
  rejectionRate:      number;
}

interface FunnelData {
  signalsGenerated:       number;
  mtfConfirmed:           number;
  ordersSent:             number;
  recentFilled:           number;
  recentRejected:         number;
  recentPartial:          number;
  mtfConversionPct:       number;
  executionConversionPct: number;
}

interface ExecutionRow {
  id:           string;
  exchange:     string;
  symbol:       string;
  side:         "buy" | "sell";
  status:       "filled" | "rejected" | "partial" | "timeout";
  sizeUSD:      number;
  slippagePct:  number;
  roundTripMs:  number | null;
  sentAt:       number;
  mode:         "simulation" | "live";
  errorMessage: string | null;
}

interface TelemetryResponse {
  latency:          LatencyStat[];
  funnel:           FunnelData;
  recentExecutions: ExecutionRow[];
  totalRecorded:    number;
  engineRunning:    boolean;
  timestamp:        number;
}

interface FeesResponse {
  summary: Record<string, string | number | undefined>;
  byExchange: Array<{ exchange: string; trades: string | number; fees_usd: string | number }>;
  topUsers:   Array<{ email: string | null; total_fees_generated: string | number }>;
  feeRatePct: number;
}

interface MembershipsResponse {
  userTotals: Record<string, string | number | undefined>;
  planDistribution: Array<{ plan: string; plan_status: string; count: string | number }>;
  estimatedMrr:     number;
  stripeMetrics?:   Record<string, string | number | undefined>;
}

interface PlatformOverviewResponse {
  users:  { total: number; online: number; recentSignups: number };
  trades: { today: number; winsToday: number; winsWeek: number; winsMonth: number; totalTrades: number; totalPnL: number; totalVolume: number; winRate: number };
  fees:   { totalCollected: number };
  ai:     { enginesRunning: number; signalsGenerated: number; tradesExecuted: number; mtfConfirmed: number; avgConfidence: number };
  timestamp: number;
}

interface EngineStatusResponse {
  running:           boolean;
  startedAt:         number | null;
  lastTickAt:        number | null;
  lastSignalAt:      number | null;
  lastTradeAt:       number | null;
  signalsGenerated:  number;
  tradesExecuted:    number;
  tradesBlocked:     number;
  mtfConfirmedCount: number;
  testMode:          boolean;
  loopIntervalMs:    number;
  recentErrors:      Array<{ ts: number; message: string }>;
  symbolBreakdowns:  Record<string, { avgConfidence?: number; signalCount?: number }>;
}

interface ExchangeStatusResponse {
  mode:          string;
  exchangeName?: string;
  liveEnabled?:  boolean;
  paused?:       boolean;
  killSwitch?:   boolean;
}

// /api/exchange/balances returns:
//   { source: "live" | "sim", exchange: string,
//     balances: { USD: number, BTC: number, ETH: number, SOL: number } }
// (flat object map, NOT an array of { asset, total, usdValue } rows.)
interface BalancesResponse {
  source?:   string;
  exchange?: string;
  balances?: { USD?: number; BTC?: number; ETH?: number; SOL?: number };
}

interface AdaptersHealth {
  adapters?: Array<{ name: string; healthy: boolean; lastCheckMs?: number }>;
  // Some servers return a flat map { Kraken: {healthy:true}, ... }
  [k: string]: unknown;
}

interface AdminPositionsResponse {
  positions: Array<{
    id: string; user_id: string | null; user_email: string | null;
    symbol: string; side: string; size_usd: number;
    entry_price: number; entry_time: number | null; mode: string; source: string;
  }>;
  count: number;
}

interface AdminClosedTradesResponse {
  trades: Array<{
    id: string; user_id: string | null; user_email: string | null;
    symbol: string; side: string; size_usd: number;
    entry_price: number; exit_price: number; realized_pnl: number;
    realized_pnl_pct: number; mode: string; close_reason: string | null;
    exit_time: number | null; source: string;
  }>;
  count: number;
  summary: { total: number; wins: number; losses: number; total_pnl: number };
}

// ── Fetcher ──────────────────────────────────────────────────────────────────

const j = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
};

const num = (v: string | number | undefined | null): number =>
  typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0;

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtPnL(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${fmtMoney(Math.abs(n)).replace("$", "$")}`;
}
function fmtInt(n: number): string { return n.toLocaleString("en-US"); }
function fmtMs(n: number): string  { return n > 0 ? `${n.toFixed(0)}ms` : "—"; }
function fmtAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// ── Root grid ────────────────────────────────────────────────────────────────

export function OperatorTelemetryGrid() {
  const { data: tel,  isError: telErr  } = useQuery<TelemetryResponse>({
    queryKey:        ["operator-execution-telemetry"],
    queryFn:         () => j<TelemetryResponse>("/api/admin/execution-telemetry"),
    refetchInterval: 5_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: fees, isError: feesErr } = useQuery<FeesResponse>({
    queryKey:        ["operator-fees"],
    queryFn:         () => j<FeesResponse>("/api/admin/analytics/fees"),
    refetchInterval: 10_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: mem,  isError: memErr  } = useQuery<MembershipsResponse>({
    queryKey:        ["operator-memberships"],
    queryFn:         () => j<MembershipsResponse>("/api/admin/analytics/memberships"),
    refetchInterval: 15_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: platform } = useQuery<PlatformOverviewResponse>({
    queryKey:        ["operator-platform-overview"],
    queryFn:         () => j<PlatformOverviewResponse>("/api/admin/platform-overview"),
    refetchInterval: 5_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: engine } = useQuery<EngineStatusResponse>({
    queryKey:        ["operator-engine-status"],
    queryFn:         () => j<EngineStatusResponse>("/api/engine/status"),
    refetchInterval: 3_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: exch, refetch: refetchExch } = useQuery<ExchangeStatusResponse>({
    queryKey:        ["operator-exchange-status"],
    queryFn:         () => j<ExchangeStatusResponse>("/api/exchange/status"),
    refetchInterval: 4_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: balances } = useQuery<BalancesResponse>({
    queryKey:        ["operator-balances"],
    queryFn:         () => j<BalancesResponse>("/api/exchange/balances"),
    refetchInterval: 8_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: adapters } = useQuery<AdaptersHealth>({
    queryKey:        ["operator-adapters-health"],
    queryFn:         () => j<AdaptersHealth>("/api/adapters/health"),
    refetchInterval: 8_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: positions } = useQuery<AdminPositionsResponse>({
    queryKey:        ["operator-admin-positions"],
    queryFn:         () => j<AdminPositionsResponse>("/api/admin/positions?limit=50"),
    refetchInterval: 5_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });
  const { data: closed } = useQuery<AdminClosedTradesResponse>({
    queryKey:        ["operator-admin-closed-trades"],
    queryFn:         () => j<AdminClosedTradesResponse>("/api/admin/closed-trades?limit=30"),
    refetchInterval: 5_000, refetchOnWindowFocus: false, staleTime: 0, retry: false,
  });

  const qc = useQueryClient();
  const onKillSwitch = async () => {
    // /api/exchange/kill is a TOGGLE — confirm copy must reflect current state
    const currentlyKilled = !!exch?.killSwitch;
    const prompt = currentlyKilled
      ? "DEACTIVATE kill switch? Live execution will resume platform-wide."
      : "ACTIVATE kill switch? This halts all live execution platform-wide.";
    if (!window.confirm(prompt)) return;
    try {
      await authFetch("/api/exchange/kill", { method: "POST", cache: "no-store" });
      await refetchExch();
      qc.invalidateQueries({ queryKey: ["operator-engine-status"] });
    } catch { /* swallow */ }
  };

  const errored = telErr || feesErr || memErr;

  return (
    <section className="px-2">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-2">
          <Radio size={11} style={{ color: N.BRAND }} className="animate-pulse" />
          <span className="text-[9px] font-bold tracking-[0.28em]"
            style={{ color: N.TEXT_1, fontFamily: N.FONT_MONO }}>
            AICANDLEZ · OPERATOR TELEMETRY DEEP-LAYER · 14 PANELS
          </span>
          {errored && (
            <span className="text-[8.5px] tracking-[0.16em] font-bold"
              style={{ color: N.WARN, fontFamily: N.FONT_MONO }}>
              · ADMIN ROLE REQUIRED ·
            </span>
          )}
        </div>
        <span className="text-[8.5px] tracking-[0.18em] font-semibold"
          style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
          LIVE · {tel?.totalRecorded ?? 0} EXECS RECORDED
        </span>
      </div>

      {/* Row 1 — Latency · Funnel · Execution Stream */}
      <div className="grid gap-2"
        style={{ gridTemplateColumns: "1.1fr 0.9fr 1.2fr", alignItems: "stretch" }}>
        <LatencyPanel data={tel?.latency} />
        <FunnelPanel  data={tel?.funnel} />
        <StreamPanel  data={tel?.recentExecutions} />
      </div>

      {/* Row 2 — Fees · Subscriptions */}
      <div className="grid gap-2 mt-2"
        style={{ gridTemplateColumns: "1fr 1fr", alignItems: "stretch" }}>
        <FeesPanel         data={fees} />
        <SubscriptionPanel data={mem} />
      </div>

      {/* Row 3 — Active Users · AI Throughput · Engine Health */}
      <div className="grid gap-2 mt-2"
        style={{ gridTemplateColumns: "1fr 1.1fr 1fr", alignItems: "stretch" }}>
        <ActiveUsersPanel data={platform} />
        <AIThroughputPanel data={engine} platform={platform} />
        <EngineHealthPanel data={engine} />
      </div>

      {/* Row 4 — Exchanges · Balances · Exchange Mode + Kill Switch */}
      <div className="grid gap-2 mt-2"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", alignItems: "stretch" }}>
        <ExchangesPanel adapters={adapters} />
        <BalancesPanel  data={balances} />
        <ModeKillPanel  exch={exch} onKill={onKillSwitch} />
      </div>

      {/* Row 5 — Cross-Tenant Positions · Cross-Tenant Closed Trades */}
      <div className="grid gap-2 mt-2"
        style={{ gridTemplateColumns: "1fr 1fr", alignItems: "stretch" }}>
        <PositionsPanel data={positions} />
        <ClosedTradesPanel data={closed} />
      </div>
    </section>
  );
}

// ── Shared panel chrome ──────────────────────────────────────────────────────

function Panel({
  title, icon: Icon, children, accent = N.BRAND,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: N.SURFACE_1,
        border: `1px solid ${N.BORDER}`,
        borderRadius: 4,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        minHeight: 180,
        boxShadow: `inset 0 1px 0 ${accent}08, 0 0 7px ${accent}05`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={10} style={{ color: accent }} />
        <span className="text-[8.5px] font-bold tracking-[0.22em]"
          style={{ color: N.TEXT_1, fontFamily: N.FONT_MONO }}>
          {title}
        </span>
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-[8.5px] tracking-[0.18em] font-semibold"
      style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
      {label}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#000",
      border: `1px solid ${N.BORDER}`,
      borderRadius: 3,
      padding: "4px 6px",
      minHeight: 40,
      display: "flex",
      flexDirection: "column",
      gap: 1,
    }}>
      <span className="text-[7.5px] font-bold tracking-[0.14em] truncate"
        style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        {label}
      </span>
      <span className="text-[13px] font-extrabold tabular-nums tracking-tight"
        style={{ color, fontFamily: N.FONT_MONO, lineHeight: 1.1 }}>
        {value}
      </span>
    </div>
  );
}

// ── Panel 1 — Latency ────────────────────────────────────────────────────────

function LatencyPanel({ data }: { data: LatencyStat[] | undefined }) {
  const rows = data ?? [];
  return (
    <Panel title="EXECUTION LATENCY · P50 / P95" icon={Gauge}>
      {rows.length === 0 ? (
        <Empty label="NO EXECUTIONS RECORDED YET" />
      ) : (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-6 gap-1 text-[7.5px] tracking-[0.14em] font-bold"
            style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
            <span>EXCHANGE</span>
            <span className="text-right">P50</span>
            <span className="text-right">P95</span>
            <span className="text-right">FILL</span>
            <span className="text-right">SLIP%</span>
            <span className="text-right">FILL%</span>
          </div>
          {rows.map(r => (
            <div key={r.exchange} className="grid grid-cols-6 gap-1 text-[10px] tabular-nums font-semibold py-0.5"
              style={{ fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
              <span style={{ color: N.TEXT_0 }}>{r.exchange.toUpperCase()}</span>
              <span className="text-right" style={{ color: N.TEXT_1 }}>{fmtMs(r.p50SignalLatencyMs)}</span>
              <span className="text-right" style={{ color: r.p95SignalLatencyMs > 500 ? N.WARN : N.TEXT_1 }}>
                {fmtMs(r.p95SignalLatencyMs)}
              </span>
              <span className="text-right" style={{ color: N.TEXT_1 }}>{fmtMs(r.avgFillLatencyMs)}</span>
              <span className="text-right" style={{ color: Math.abs(r.avgSlippagePct) > 0.1 ? N.WARN : N.TEXT_1 }}>
                {r.avgSlippagePct.toFixed(3)}
              </span>
              <span className="text-right" style={{ color: r.fillRate >= 0.95 ? N.LONG : N.WARN }}>
                {(r.fillRate * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Panel 2 — Funnel ─────────────────────────────────────────────────────────

function FunnelPanel({ data }: { data: FunnelData | undefined }) {
  const d = data ?? {
    signalsGenerated: 0, mtfConfirmed: 0, ordersSent: 0,
    recentFilled: 0, recentRejected: 0, recentPartial: 0,
    mtfConversionPct: 0, executionConversionPct: 0,
  };
  const rows: Array<[string, number, number, string]> = [
    ["SIGNALS",       d.signalsGenerated, 100,                     N.BRAND],
    ["MTF CONFIRMED", d.mtfConfirmed,     d.mtfConversionPct,      N.BRAND],
    ["ORDERS SENT",   d.ordersSent,       d.executionConversionPct, N.LONG],
    ["FILLED (30)",   d.recentFilled,     0,                       N.LONG],
  ];
  return (
    <Panel title="EXECUTION FUNNEL" icon={GitBranch}>
      <div className="flex flex-col gap-1.5">
        {rows.map(([label, count, pct, color], i) => (
          <div key={label} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px] tracking-[0.16em] font-bold"
              style={{ fontFamily: N.FONT_MONO }}>
              <span style={{ color: N.TEXT_2 }}>
                {i > 0 && <ArrowDownRight size={9} className="inline mr-1" style={{ color: N.TEXT_3 }} />}
                {label}
              </span>
              <span className="tabular-nums" style={{ color }}>
                {fmtInt(count)}{i > 0 && i < 3 ? ` · ${pct.toFixed(0)}%` : ""}
              </span>
            </div>
            <div style={{ height: 3, background: "#000", borderRadius: 2, border: `1px solid ${N.BORDER}` }}>
              <div style={{
                height: "100%",
                width: `${i === 0 ? 100 : Math.min(100, pct)}%`,
                background: color,
                boxShadow: `0 0 4px ${color}66`,
                transition: "width 0.4s",
              }} />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between text-[8.5px] tracking-[0.14em] font-semibold mt-1 pt-1"
          style={{ fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
          <span style={{ color: N.SHORT }}>REJECTED · {d.recentRejected}</span>
          <span style={{ color: N.WARN }}>PARTIAL · {d.recentPartial}</span>
        </div>
      </div>
    </Panel>
  );
}

// ── Panel 3 — Live execution stream ──────────────────────────────────────────

function StreamPanel({ data }: { data: ExecutionRow[] | undefined }) {
  const rows = (data ?? []).slice(0, 12);
  return (
    <Panel title="LIVE EXECUTION STREAM" icon={Radio}>
      {rows.length === 0 ? (
        <Empty label="AWAITING FIRST EXECUTION" />
      ) : (
        <div className="flex flex-col gap-0.5 overflow-hidden">
          {rows.map(r => {
            const Icon  = r.status === "filled"   ? CheckCircle2
                       : r.status === "rejected" ? XCircle
                       : AlertCircle;
            const color = r.status === "filled" ? N.LONG : r.status === "rejected" ? N.SHORT : N.WARN;
            const t     = new Date(r.sentAt);
            const hh    = t.toLocaleTimeString("en-US", { hour12: false });
            return (
              <div key={r.id} className="grid items-center text-[9.5px] tabular-nums font-semibold py-0.5 px-1"
                style={{
                  gridTemplateColumns: "10px 60px 1fr 50px 60px 50px",
                  gap: 4,
                  fontFamily: N.FONT_MONO,
                  background: r.mode === "live" ? `${N.BRAND}05` : "transparent",
                  borderLeft: `2px solid ${color}`,
                }}>
                <Icon size={9} style={{ color }} />
                <span style={{ color: N.TEXT_3 }}>{hh}</span>
                <span style={{ color: N.TEXT_0 }}>
                  {r.symbol} <span style={{ color: r.side === "buy" ? N.LONG : N.SHORT }}>
                    {r.side.toUpperCase()}
                  </span>
                </span>
                <span className="text-right" style={{ color: N.TEXT_2 }}>{fmtMoney(r.sizeUSD)}</span>
                <span className="text-right" style={{ color: r.mode === "live" ? N.BRAND : N.TEXT_3 }}>
                  {r.mode === "live" ? "LIVE" : "SIM"}
                </span>
                <span className="text-right" style={{ color }}>{r.status.slice(0, 4).toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Panel 4 — Fees & revenue ─────────────────────────────────────────────────

function FeesPanel({ data }: { data: FeesResponse | undefined }) {
  const s = data?.summary ?? {};
  const total   = num(s["total_fees_usd"]);
  const pending = num(s["pending_usd"]);
  const settled = num(s["settled_usd"]);
  const records = num(s["total_records"]);
  const users   = num(s["unique_users"]);
  const realized = num(s["total_realized_pnl"]);
  const live    = num(s["live_fee_count"]);
  const paper   = num(s["paper_fee_count"]);
  const top     = (data?.topUsers ?? []).slice(0, 3);

  return (
    <Panel title="FEES & REVENUE · PERFORMANCE" icon={DollarSign} accent={N.LONG}>
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        <Stat label="TOTAL FEES"   value={fmtMoney(total)}   color={N.BRAND} />
        <Stat label="PENDING"      value={fmtMoney(pending)} color={N.WARN} />
        <Stat label="SETTLED"      value={fmtMoney(settled)} color={N.LONG} />
        <Stat label="GROSS PROFIT" value={fmtMoney(realized)} color={N.TEXT_0} />
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        <Stat label="FEE RECORDS"  value={fmtInt(records)} color={N.TEXT_1} />
        <Stat label="USERS"        value={fmtInt(users)}   color={N.TEXT_1} />
        <Stat label="LIVE"         value={fmtInt(live)}    color={N.BRAND} />
        <Stat label="PAPER"        value={fmtInt(paper)}   color={N.TEXT_2} />
      </div>
      <div className="text-[8px] font-bold tracking-[0.18em] mb-1"
        style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        TOP REVENUE GENERATORS
      </div>
      {top.length === 0 ? (
        <div className="text-[9px] py-1" style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
          No fee records yet
        </div>
      ) : top.map((u, i) => (
        <div key={i} className="flex items-center justify-between text-[9.5px] tabular-nums py-0.5"
          style={{ fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
          <span style={{ color: N.TEXT_1 }} className="truncate">{u.email ?? "(anon)"}</span>
          <span style={{ color: N.BRAND }} className="font-bold">
            {fmtMoney(num(u.total_fees_generated))}
          </span>
        </div>
      ))}
    </Panel>
  );
}

// ── Panel 5 — Subscription telemetry ─────────────────────────────────────────

function SubscriptionPanel({ data }: { data: MembershipsResponse | undefined }) {
  const t = data?.userTotals ?? {};
  const total    = num(t["total_users"]);
  const paid     = num(t["paid_users"]);
  const active   = num(t["active_subscriptions"]);
  const pastDue  = num(t["past_due"]);
  const canceled = num(t["canceled"]);
  const estMrr   = data?.estimatedMrr ?? 0;
  const stripeMrr = num(data?.stripeMetrics?.["mrr_usd"]);
  const mrr      = stripeMrr > 0 ? stripeMrr : estMrr;

  const dist = data?.planDistribution ?? [];
  const planMap: Record<string, number> = {};
  for (const row of dist) {
    const key = row.plan || "(none)";
    planMap[key] = (planMap[key] ?? 0) + num(row.count);
  }

  return (
    <Panel title="SUBSCRIPTION TELEMETRY · STRIPE" icon={Users} accent={N.BRAND}>
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        <Stat label="MRR"        value={fmtMoney(mrr)}     color={N.BRAND} />
        <Stat label="ACTIVE"     value={fmtInt(active)}    color={N.LONG} />
        <Stat label="PAID USERS" value={fmtInt(paid)}      color={N.TEXT_0} />
        <Stat label="TOTAL"      value={fmtInt(total)}     color={N.TEXT_1} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <Stat label="PAST DUE"   value={fmtInt(pastDue)}   color={pastDue > 0 ? N.WARN : N.TEXT_2} />
        <Stat label="CANCELED"   value={fmtInt(canceled)}  color={N.SHORT} />
        <Stat label="CONVERSION"
          value={total > 0 ? `${((paid / total) * 100).toFixed(1)}%` : "—"}
          color={N.BRAND} />
      </div>
      <div className="text-[8px] font-bold tracking-[0.18em] mb-1"
        style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        PLAN DISTRIBUTION
      </div>
      <div className="grid grid-cols-3 gap-1">
        {["free", "starter", "pro"].map(plan => (
          <div key={plan} style={{
            background: "#000",
            border: `1px solid ${N.BORDER}`,
            borderRadius: 3,
            padding: "4px 6px",
          }}>
            <div className="text-[7.5px] font-bold tracking-[0.16em]"
              style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
              {plan.toUpperCase()}
            </div>
            <div className="text-[12px] font-extrabold tabular-nums"
              style={{
                color: plan === "elite" ? N.GOLD : plan === "pro" ? N.BRAND : plan === "starter" ? N.LONG : N.TEXT_1,
                fontFamily: N.FONT_MONO,
              }}>
              {fmtInt(planMap[plan] ?? 0)}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Panel 6 — Active users ───────────────────────────────────────────────────

function ActiveUsersPanel({ data }: { data: PlatformOverviewResponse | undefined }) {
  const u = data?.users ?? { total: 0, online: 0, recentSignups: 0 };
  return (
    <Panel title="ACTIVE USERS · LIVE" icon={Users} accent={N.LONG}>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <Stat label="ONLINE (10m)"  value={fmtInt(u.online)}        color={u.online > 0 ? N.LONG : N.TEXT_2} />
        <Stat label="TOTAL"         value={fmtInt(u.total)}         color={N.TEXT_0} />
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <Stat label="NEW SIGNUPS · 24h" value={fmtInt(u.recentSignups)} color={N.BRAND} />
      </div>
      <div className="mt-auto pt-2 text-[8px] tracking-[0.16em] font-semibold"
        style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        ONLINE = USERS WITH TRADES IN LAST 10 MIN
      </div>
    </Panel>
  );
}

// ── Panel 7 — AI throughput ──────────────────────────────────────────────────

function AIThroughputPanel({
  data, platform,
}: {
  data: EngineStatusResponse | undefined;
  platform: PlatformOverviewResponse | undefined;
}) {
  const e = data;
  const p = platform?.ai;
  const breakdowns = Object.entries(e?.symbolBreakdowns ?? {});
  const topConf = breakdowns
    .map(([sym, b]) => [sym, b?.avgConfidence ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Signals / minute approximation: signalsGenerated since startedAt
  let perMin = 0;
  if (e?.startedAt && e.signalsGenerated > 0) {
    const ageMin = Math.max(1, (Date.now() - e.startedAt) / 60_000);
    perMin = e.signalsGenerated / ageMin;
  }

  return (
    <Panel title="AI THROUGHPUT" icon={Brain} accent={N.BRAND}>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <Stat label="SIGNALS"   value={fmtInt(e?.signalsGenerated ?? 0)} color={N.BRAND} />
        <Stat label="EXECUTED"  value={fmtInt(e?.tradesExecuted ?? 0)}   color={N.LONG} />
        <Stat label="MTF OK"    value={fmtInt(e?.mtfConfirmedCount ?? 0)} color={N.TEXT_0} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <Stat label="SIG / MIN" value={perMin.toFixed(1)} color={N.TEXT_1} />
        <Stat label="AVG CONF"
          value={`${(p?.avgConfidence ?? 0).toFixed(0)}%`}
          color={(p?.avgConfidence ?? 0) >= 60 ? N.LONG : N.WARN} />
        <Stat label="LOOP"
          value={e?.loopIntervalMs ? `${(e.loopIntervalMs / 1000).toFixed(0)}s` : "—"}
          color={N.TEXT_1} />
      </div>
      <div className="text-[8px] font-bold tracking-[0.18em] mb-1"
        style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        TOP CONFIDENCE
      </div>
      {topConf.length === 0 ? (
        <div className="text-[9px] py-1" style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
          Awaiting signals…
        </div>
      ) : topConf.map(([sym, conf]) => (
        <div key={sym} className="flex items-center justify-between text-[9.5px] tabular-nums py-0.5"
          style={{ fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
          <span style={{ color: N.TEXT_1 }}>{sym}</span>
          <span style={{ color: conf >= 80 ? N.LONG : conf >= 60 ? N.BRAND : N.WARN }}
            className="font-bold">
            {conf.toFixed(0)}%
          </span>
        </div>
      ))}
    </Panel>
  );
}

// ── Panel 8 — Engine health ──────────────────────────────────────────────────

function EngineHealthPanel({ data }: { data: EngineStatusResponse | undefined }) {
  const e = data;
  const running = e?.running ?? false;
  const errors  = e?.recentErrors ?? [];
  return (
    <Panel title="ENGINE HEALTH" icon={HeartPulse} accent={running ? N.LONG : N.SHORT}>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <Stat label="STATUS"
          value={running ? "RUNNING" : "IDLE"}
          color={running ? N.LONG : N.SHORT} />
        <Stat label="TEST MODE"
          value={e?.testMode ? "ON" : "OFF"}
          color={e?.testMode ? N.WARN : N.TEXT_1} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <Stat label="LAST TICK"    value={fmtAgo(e?.lastTickAt)}   color={N.TEXT_1} />
        <Stat label="LAST SIGNAL"  value={fmtAgo(e?.lastSignalAt)} color={N.TEXT_1} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <Stat label="LAST TRADE"   value={fmtAgo(e?.lastTradeAt)}  color={N.TEXT_1} />
        <Stat label="BLOCKED"      value={fmtInt(e?.tradesBlocked ?? 0)}
          color={(e?.tradesBlocked ?? 0) > 0 ? N.WARN : N.TEXT_2} />
      </div>
      <div className="text-[8px] font-bold tracking-[0.18em] mb-1"
        style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        RECENT ERRORS · {errors.length}
      </div>
      {errors.length === 0 ? (
        <div className="text-[9px] py-1" style={{ color: N.LONG, fontFamily: N.FONT_MONO }}>
          ✓ Clean — no errors
        </div>
      ) : errors.slice(-3).map((err, i) => (
        <div key={i} className="text-[8.5px] py-0.5 truncate"
          style={{ color: N.SHORT, fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
          {err.message}
        </div>
      ))}
    </Panel>
  );
}

// ── Panel 9 — Exchanges ──────────────────────────────────────────────────────

function ExchangesPanel({ adapters }: { adapters: AdaptersHealth | undefined }) {
  // Normalize either shape: { adapters: [...] } or flat map { Kraken: {...}, ... }
  let rows: Array<{ name: string; healthy: boolean }> = [];
  if (adapters && Array.isArray(adapters.adapters)) {
    rows = adapters.adapters.map(a => ({ name: a.name, healthy: !!a.healthy }));
  } else if (adapters && typeof adapters === "object") {
    rows = Object.entries(adapters)
      .filter(([, v]) => v && typeof v === "object" && "healthy" in (v as object))
      .map(([k, v]) => ({ name: k, healthy: !!(v as { healthy?: boolean }).healthy }));
  }

  return (
    <Panel title="EXCHANGES · ADAPTER HEALTH" icon={Network}>
      {rows.length === 0 ? (
        <Empty label="NO ADAPTERS REGISTERED" />
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map(r => (
            <div key={r.name} className="flex items-center justify-between text-[10px] font-bold py-0.5"
              style={{ fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
              <span style={{ color: N.TEXT_0 }}>{r.name.toUpperCase()}</span>
              <span style={{ color: r.healthy ? N.LONG : N.SHORT }}>
                {r.healthy ? "● HEALTHY" : "● DOWN"}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Panel 10 — Balances ──────────────────────────────────────────────────────

function BalancesPanel({ data }: { data: BalancesResponse | undefined }) {
  const b      = data?.balances ?? {};
  const usd    = b.USD ?? 0;
  const btc    = b.BTC ?? 0;
  const eth    = b.ETH ?? 0;
  const sol    = b.SOL ?? 0;
  const rows: Array<{ asset: string; amount: number; digits: number }> = [
    { asset: "BTC", amount: btc, digits: 6 },
    { asset: "ETH", amount: eth, digits: 4 },
    { asset: "SOL", amount: sol, digits: 2 },
  ];
  const hasAny = usd + btc + eth + sol > 0;
  return (
    <Panel title="ACTIVE EXCHANGE BALANCE" icon={Wallet} accent={N.LONG}>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <Stat label="EXCHANGE" value={(data?.exchange ?? "—").toUpperCase()} color={N.BRAND} />
        <Stat label="SOURCE"   value={(data?.source ?? "—").toUpperCase()}   color={data?.source === "live" ? N.LONG : N.TEXT_2} />
      </div>
      <div className="grid grid-cols-1 gap-1.5 mb-2">
        <Stat label="USD CASH" value={fmtMoney(usd)} color={N.TEXT_0} />
      </div>
      <div className="text-[8px] font-bold tracking-[0.18em] mb-1"
        style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
        ASSET BREAKDOWN
      </div>
      {!hasAny ? (
        <div className="text-[9px] py-1" style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
          No balances reported
        </div>
      ) : rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-[9.5px] tabular-nums py-0.5"
          style={{ fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
          <span style={{ color: N.TEXT_1 }}>{r.asset}</span>
          <span style={{ color: N.TEXT_0 }}>{r.amount.toFixed(r.digits)}</span>
        </div>
      ))}
    </Panel>
  );
}

// ── Panel 11 — Exchange mode + kill switch ───────────────────────────────────

function ModeKillPanel({
  exch, onKill,
}: {
  exch: ExchangeStatusResponse | undefined;
  onKill: () => void;
}) {
  const mode    = exch?.mode ?? "—";
  const live    = !!exch?.liveEnabled;
  const paused  = !!exch?.paused;
  const killed  = !!exch?.killSwitch;
  const exName  = exch?.exchangeName ?? "—";

  const state = killed ? "KILLED" : paused ? "PAUSED" : live ? "LIVE" : "SIM";
  const stateColor = killed ? N.SHORT : paused ? N.WARN : live ? N.LONG : N.TEXT_2;

  return (
    <Panel title="EXCHANGE MODE · KILL SWITCH" icon={ToggleRight} accent={stateColor}>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <Stat label="MODE"     value={mode.toUpperCase()} color={live ? N.BRAND : N.TEXT_1} />
        <Stat label="EXCHANGE" value={exName.toUpperCase()} color={N.TEXT_0} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <Stat label="LIVE"     value={live ? "ON"   : "OFF"} color={live   ? N.LONG : N.TEXT_2} />
        <Stat label="PAUSED"   value={paused ? "ON" : "OFF"} color={paused ? N.WARN : N.TEXT_2} />
      </div>
      <div className="grid grid-cols-1 gap-1.5 mb-2">
        <Stat label="EXECUTION STATE" value={state} color={stateColor} />
      </div>
      <button
        onClick={onKill}
        className="mt-auto flex items-center justify-center gap-2 py-2 transition-colors"
        style={{
          background: killed ? `${N.SHORT}22` : "#000",
          border: `1px solid ${killed ? N.SHORT : N.SHORT}88`,
          borderRadius: 3,
          color: N.SHORT,
          fontFamily: N.FONT_MONO,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.22em",
          cursor: "pointer",
        }}
      >
        <Power size={11} />
        {killed ? "KILL SWITCH ACTIVE" : "ACTIVATE KILL SWITCH"}
      </button>
    </Panel>
  );
}

// ── Panel 12 — Cross-tenant positions ────────────────────────────────────────

function PositionsPanel({ data }: { data: AdminPositionsResponse | undefined }) {
  const rows = (data?.positions ?? []).slice(0, 10);
  return (
    <Panel title={`OPEN POSITIONS · CROSS-TENANT · ${data?.count ?? 0}`} icon={TrendingUp} accent={N.BRAND}>
      {rows.length === 0 ? (
        <Empty label="NO OPEN POSITIONS" />
      ) : (
        <div className="flex flex-col gap-0.5">
          <div className="grid gap-1 text-[7.5px] tracking-[0.14em] font-bold"
            style={{ gridTemplateColumns: "1fr 50px 40px 60px 60px",
                     color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
            <span>USER · SYMBOL</span>
            <span className="text-right">SIDE</span>
            <span className="text-right">SRC</span>
            <span className="text-right">ENTRY</span>
            <span className="text-right">SIZE</span>
          </div>
          {rows.map(r => (
            <div key={r.id} className="grid gap-1 text-[9.5px] tabular-nums py-0.5"
              style={{ gridTemplateColumns: "1fr 50px 40px 60px 60px",
                       fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
              {/* P2-AD-05 — cross-nav to BillingAdmin drawer when a real
                  user_id exists. Global/non-attributable rows render plain. */}
              {r.user_id ? (
                <a href={`/admin/billing?user=${encodeURIComponent(r.user_id)}`}
                  className="truncate hover:underline"
                  style={{ color: N.TEXT_1 }}
                  title={`Open billing drawer for ${r.user_email ?? r.user_id}`}>
                  {(r.user_email ?? r.user_id).split("@")[0]} · {r.symbol}
                </a>
              ) : (
                <span style={{ color: N.TEXT_1 }} className="truncate">
                  global · {r.symbol}
                </span>
              )}
              <span className="text-right font-bold"
                style={{ color: r.side.toLowerCase() === "buy" ? N.LONG : N.SHORT }}>
                {r.side.toUpperCase()}
              </span>
              <span className="text-right" style={{ color: r.source === "sim" ? N.TEXT_3 : N.BRAND }}>
                {r.source === "sim" ? "SIM" : "GLB"}
              </span>
              <span className="text-right" style={{ color: N.TEXT_2 }}>
                ${r.entry_price.toFixed(2)}
              </span>
              <span className="text-right" style={{ color: N.TEXT_0 }}>
                {fmtMoney(r.size_usd)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Panel 13 — Cross-tenant closed trades ────────────────────────────────────

function ClosedTradesPanel({ data }: { data: AdminClosedTradesResponse | undefined }) {
  const rows = (data?.trades ?? []).slice(0, 10);
  const s = data?.summary ?? { total: 0, wins: 0, losses: 0, total_pnl: 0 };
  const winRate = s.total > 0 ? (s.wins / s.total) * 100 : 0;
  return (
    <Panel title={`CLOSED TRADES · CROSS-TENANT · ${s.total}`} icon={History} accent={s.total_pnl >= 0 ? N.LONG : N.SHORT}>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <Stat label="TOTAL PnL"
          value={fmtPnL(s.total_pnl)}
          color={s.total_pnl >= 0 ? N.LONG : N.SHORT} />
        <Stat label="WIN RATE"
          value={`${winRate.toFixed(1)}%`}
          color={winRate >= 50 ? N.LONG : N.WARN} />
        <Stat label="W / L"
          value={`${s.wins} / ${s.losses}`}
          color={N.TEXT_1} />
      </div>
      {rows.length === 0 ? (
        <Empty label="NO CLOSED TRADES YET" />
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map(r => (
            <div key={r.id} className="grid gap-1 text-[9.5px] tabular-nums py-0.5"
              style={{ gridTemplateColumns: "1fr 40px 40px 70px",
                       fontFamily: N.FONT_MONO, borderTop: `1px solid ${N.BORDER}` }}>
              {/* P2-AD-05 — cross-nav to BillingAdmin drawer when a real
                  user_id exists. */}
              {r.user_id ? (
                <a href={`/admin/billing?user=${encodeURIComponent(r.user_id)}`}
                  className="truncate hover:underline"
                  style={{ color: N.TEXT_1 }}
                  title={`Open billing drawer for ${r.user_email ?? r.user_id}`}>
                  {(r.user_email ?? r.user_id).split("@")[0]} · {r.symbol}
                </a>
              ) : (
                <span style={{ color: N.TEXT_1 }} className="truncate">
                  global · {r.symbol}
                </span>
              )}
              <span className="text-right font-bold"
                style={{ color: r.side.toLowerCase() === "buy" ? N.LONG : N.SHORT }}>
                {r.side.toUpperCase()}
              </span>
              <span className="text-right" style={{ color: r.source === "sim" ? N.TEXT_3 : N.BRAND }}>
                {r.source === "sim" ? "SIM" : "GLB"}
              </span>
              <span className="text-right font-bold"
                style={{ color: r.realized_pnl >= 0 ? N.LONG : N.SHORT }}>
                {fmtPnL(r.realized_pnl)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Panel 14 placeholder ─────────────────────────────────────────────────────
// The fourteenth "panel" is the kill-switch button embedded in ModeKillPanel
// above — it is the operator's hard-halt control. Keeping it co-located with
// the exchange-mode panel preserves the operational mental model: SEE the
// current execution state right next to the button that overrides it.
