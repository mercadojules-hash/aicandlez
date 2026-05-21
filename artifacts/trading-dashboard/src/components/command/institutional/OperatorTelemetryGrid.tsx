/**
 * OperatorTelemetryGrid — institutional operator-only telemetry surface.
 *
 * Renders the five panels that PlatformOverview / CommandBar / LiveAccountPanel
 * don't already cover:
 *
 *   1. Execution Latency  — signal→order + order→fill p50/p95 + slippage
 *                            per exchange (from /api/admin/execution-telemetry)
 *   2. Execution Funnel   — signals → MTF-confirmed → orders sent → filled
 *                            (drop-off pipeline visualization)
 *   3. Live Execution Stream — last 30 fills/rejects, scrolling feed
 *   4. Fees & Revenue     — performance fee aggregate, pending / settled,
 *                            top profitable users (from /api/admin/analytics/fees)
 *   5. Subscription Telemetry — total / paid / active / past-due / canceled,
 *                            estimated MRR, plan distribution
 *                            (from /api/admin/analytics/memberships)
 *
 * Slot: between PlatformOverview and LiveAccountPanel in CommandCenter.
 * All data is real (no fabricated values) and auto-refreshes every 5s.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Gauge, GitBranch, Radio, DollarSign, Users,
  ArrowDownRight, CheckCircle2, XCircle, AlertCircle,
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
  summary: {
    total_records?:      string | number;
    total_realized_pnl?: string | number;
    total_fees_usd?:     string | number;
    pending_usd?:        string | number;
    settled_usd?:        string | number;
    unique_users?:       string | number;
    live_fee_count?:     string | number;
    paper_fee_count?:    string | number;
  };
  byExchange: Array<{ exchange: string; trades: string | number; fees_usd: string | number }>;
  topUsers:   Array<{ email: string | null; total_fees_generated: string | number }>;
  feeRatePct: number;
}

interface MembershipsResponse {
  userTotals: {
    total_users?:          string | number;
    paid_users?:           string | number;
    active_subscriptions?: string | number;
    past_due?:             string | number;
    canceled?:             string | number;
  };
  planDistribution: Array<{ plan: string; plan_status: string; count: string | number }>;
  estimatedMrr:     number;
  stripeMetrics?:   {
    total_subscriptions?: string | number;
    active?:              string | number;
    mrr_usd?:             string | number;
  };
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
function fmtInt(n: number): string { return n.toLocaleString("en-US"); }
function fmtMs(n: number): string  { return n > 0 ? `${n.toFixed(0)}ms` : "—"; }

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

  const errored = telErr || feesErr || memErr;

  return (
    <section className="px-2">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-2">
          <Radio size={11} style={{ color: N.BRAND }} className="animate-pulse" />
          <span className="text-[9px] font-bold tracking-[0.28em]"
            style={{ color: N.TEXT_1, fontFamily: N.FONT_MONO }}>
            AICANDLEZ · OPERATOR TELEMETRY DEEP-LAYER
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

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "1.1fr 0.9fr 1.2fr", alignItems: "stretch" }}
      >
        <LatencyPanel  data={tel?.latency} />
        <FunnelPanel   data={tel?.funnel} />
        <StreamPanel   data={tel?.recentExecutions} />
      </div>

      <div
        className="grid gap-2 mt-2"
        style={{ gridTemplateColumns: "1fr 1fr", alignItems: "stretch" }}
      >
        <FeesPanel         data={fees} />
        <SubscriptionPanel data={mem} />
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
        boxShadow: `inset 0 1px 0 ${accent}08, 0 0 18px ${accent}05`,
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
            <div style={{
              height: 3, background: "#000", borderRadius: 2,
              border: `1px solid ${N.BORDER}`,
            }}>
              <div style={{
                height: "100%",
                width: `${i === 0 ? 100 : Math.min(100, pct)}%`,
                background: color,
                boxShadow: `0 0 6px ${color}66`,
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
            const icon = r.status === "filled"   ? CheckCircle2
                       : r.status === "rejected" ? XCircle
                       : AlertCircle;
            const Icon  = icon;
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
  const total   = num(s.total_fees_usd);
  const pending = num(s.pending_usd);
  const settled = num(s.settled_usd);
  const records = num(s.total_records);
  const users   = num(s.unique_users);
  const realized = num(s.total_realized_pnl);
  const live    = num(s.live_fee_count);
  const paper   = num(s.paper_fee_count);
  const top     = (data?.topUsers ?? []).slice(0, 3);

  return (
    <Panel title="FEES & REVENUE · 3% PERFORMANCE" icon={DollarSign} accent={N.LONG}>
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
  const total    = num(t.total_users);
  const paid     = num(t.paid_users);
  const active   = num(t.active_subscriptions);
  const pastDue  = num(t.past_due);
  const canceled = num(t.canceled);
  const estMrr   = data?.estimatedMrr ?? 0;
  const stripeMrr = num(data?.stripeMetrics?.mrr_usd);
  const mrr      = stripeMrr > 0 ? stripeMrr : estMrr;

  // Plan distribution → group by plan
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
                color: plan === "pro" ? N.BRAND : plan === "starter" ? N.LONG : N.TEXT_1,
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

// ── Stat card ────────────────────────────────────────────────────────────────

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
