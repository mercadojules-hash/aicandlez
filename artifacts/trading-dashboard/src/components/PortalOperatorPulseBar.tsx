/**
 * PortalOperatorPulseBar
 *
 * Replaces the BTC/ETH/SOL `MarketHeartbeat` placeholder strip on
 * /portal with high-value operator telemetry. Admin/super-admin only —
 * the customer portal renders nothing in this slot (per the
 * customer/admin separation invariant, customers must never see
 * operator-level platform metrics).
 *
 * Cells (8): Active Users, Live Exchanges, Platform Revenue (MRR),
 * Fees Collected, AI Executions, Trades Today, Failed Trades, Queue
 * Throughput. Data source: GET /api/admin/top-telemetry (same as
 * AdminTopTelemetryBar — single source of truth, real DB + engine
 * state, polled every 5s). Cells gracefully render an em-dash when a
 * field is null so missing data is visually distinct from live values.
 *
 * The render is gated client-side by the caller (`{isAdmin && <… />}`
 * in Portal.tsx) AND server-side by `requireOperator` on the underlying
 * endpoint, so a non-admin who somehow mounted the bar would just see
 * em-dashes instead of leaked data.
 */

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "../lib/authFetch";

interface TopTelemetry {
  activeUsersNow:            number;
  totalRegisteredUsers:      number;
  totalUserTrades:           number;
  tradesToday:               number;
  platformPnlUsd:            number;
  feesCollectedUsd:          number;
  activeExchangeConnections: number;
  activeAiExecutions:        number;
  liveSubscriptions:         number;
  monthlyRevenueUsd:         number;
  failedTrades:              number;
  systemUptimeSec:           number;
  websocketStatus:           "online" | "offline";
  queueThroughputPerMin:     number;
  apiLatencyMs:              number;
  engineRunning:             boolean;
  timestamp:                 number;
}

const N = {
  BG:          "#050D1A",
  BG_HI:       "#08131F",
  BORDER:      "rgba(255,255,255,0.08)",
  BRAND:       "#66FF66",
  BRAND_GLOW:  "rgba(102,255,102,0.45)",
  BRAND_DEEP:  "#00C853",
  TEXT_0:      "#E8F5EC",
  TEXT_1:      "#8A9C94",
  TEXT_2:      "#5A726A",
  POS:         "#66FF66",
  NEG:         "#ff3355",
  WARN:        "#ffaa00",
  ACCENT:      "#00f0ff",
  FONT_MONO:   "ui-monospace, 'JetBrains Mono', Menlo, monospace",
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs  = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function Cell({
  label, value, tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warn" | "accent";
}) {
  const color =
    tone === "positive" ? N.POS    :
    tone === "negative" ? N.NEG    :
    tone === "warn"     ? N.WARN   :
    tone === "accent"   ? N.ACCENT :
                          N.TEXT_0;
  return (
    <div
      className="flex flex-col gap-0.5 px-4 py-2 shrink-0 min-w-[120px]"
      style={{
        borderRight: `1px solid ${N.BORDER}`,
      }}
    >
      <div
        className="text-[15px] font-extrabold tabular-nums leading-none"
        style={{
          color,
          fontFamily: N.FONT_MONO,
          textShadow: tone === "positive" || tone === "accent"
            ? `0 0 12px ${color}55`
            : "none",
        }}
      >
        {value}
      </div>
      <div
        className="text-[8.5px] uppercase font-semibold tracking-[0.16em]"
        style={{ color: N.TEXT_2, fontFamily: N.FONT_MONO }}
      >
        {label}
      </div>
    </div>
  );
}

export function PortalOperatorPulseBar() {
  const { data, isError } = useQuery<TopTelemetry>({
    queryKey:        ["admin-top-telemetry-portal"],
    queryFn: async () => {
      const r = await authFetch("/api/admin/top-telemetry", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval:  5_000,
    refetchOnWindowFocus: true,
    staleTime:        2_500,
    retry:            1,
  });

  const wsOnline    = data?.websocketStatus === "online";
  const engineUp    = !!data?.engineRunning;
  const headerTone  = wsOnline && engineUp ? "positive" : "warn";

  return (
    <section
      className="w-full rounded-md overflow-hidden"
      style={{
        background:   N.BG,
        border:       `1px solid ${N.BORDER}`,
        boxShadow:    `0 0 18px rgba(102,255,102,0.06)`,
        fontFamily:   N.FONT_MONO,
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: `1px solid ${N.BORDER}`, background: N.BG_HI }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded-full"
            style={{
              width: 6, height: 6,
              background: headerTone === "positive" ? N.BRAND : N.WARN,
              boxShadow: `0 0 8px ${headerTone === "positive" ? N.BRAND : N.WARN}, 0 0 16px ${headerTone === "positive" ? N.BRAND_GLOW : "rgba(255,170,0,0.4)"}`,
              animation: "neon-pulse 1.4s infinite",
            }}
          />
          <span
            className="text-[10px] font-bold tracking-[0.22em]"
            style={{ color: N.TEXT_0 }}
          >
            OPERATOR PULSE
          </span>
          <span
            className="text-[8px] font-semibold tracking-[0.16em]"
            style={{ color: N.TEXT_2 }}
          >
            · LIVE PLATFORM TELEMETRY · 5s
          </span>
        </div>
        <span
          className="text-[8px] font-semibold tracking-[0.18em]"
          style={{ color: isError ? N.NEG : wsOnline ? N.BRAND_DEEP : N.WARN }}
        >
          {isError
            ? "TELEMETRY OFFLINE"
            : `WS ${wsOnline ? "ONLINE" : "OFFLINE"} · ENGINE ${engineUp ? "RUN" : "IDLE"}`}
        </span>
      </div>

      {/* Cells — horizontal scrollable strip */}
      <div className="flex overflow-x-auto">
        <Cell
          label="Active Users"
          value={fmtInt(data?.activeUsersNow)}
          tone={data && data.activeUsersNow > 0 ? "positive" : "neutral"}
        />
        <Cell
          label="Live Exchanges"
          value={fmtInt(data?.activeExchangeConnections)}
          tone={data && data.activeExchangeConnections > 0 ? "positive" : "neutral"}
        />
        <Cell
          label="MRR"
          value={fmtUsd(data?.monthlyRevenueUsd)}
          tone="positive"
        />
        <Cell
          label="Fees Collected"
          value={fmtUsd(data?.feesCollectedUsd)}
          tone="positive"
        />
        <Cell
          label="AI Executions"
          value={fmtInt(data?.activeAiExecutions)}
          tone="accent"
        />
        <Cell
          label="Trades Today"
          value={fmtInt(data?.tradesToday)}
        />
        <Cell
          label="Failed Trades"
          value={fmtInt(data?.failedTrades)}
          tone={data && data.failedTrades > 0 ? "negative" : "neutral"}
        />
        <Cell
          label="Throughput /min"
          value={fmtInt(data?.queueThroughputPerMin)}
        />
      </div>
    </section>
  );
}
