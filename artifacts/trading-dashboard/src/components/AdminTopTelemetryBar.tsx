/**
 * AdminTopTelemetryBar
 *
 * Always-on horizontal operator strip rendered directly under the
 * trading-dashboard top header for admin/super-admin users. Surfaces
 * 15 real-time metrics in a single scrollable line so an operator
 * never loses sight of platform health while navigating modules.
 *
 * Data source: GET /api/admin/top-telemetry (real DB + engine state,
 * never simulated). Polls every 5s. If the request fails or returns
 * `null` for a field, the cell renders an em-dash so mock/missing data
 * is visually distinct from live values.
 *
 * Admin-only at render time (Layout gates on `useUserRole().isAdmin`);
 * backend mirrors this with requireRole(["admin","super-admin"]).
 */

import { useQuery } from "@tanstack/react-query";

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

// Resolve API base URL. In production trade./admintrade. is served by a
// static host while /api lives on api.aicandlez.com — so we must use the
// cross-origin VITE_API_BASE_URL. In dev it falls back to same-origin so
// the local reverse proxy handles routing.
const API_BASE = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  (import.meta.env.BASE_URL ?? "/")
).replace(/\/$/, "");

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs  = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtInt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3_600);
  const m = Math.floor((sec %  3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Cell({
  label, value, tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warn" | "accent";
}) {
  const color =
    tone === "positive" ? "#00ff8a" :
    tone === "negative" ? "#ff3355" :
    tone === "warn"     ? "#ffaa00" :
    tone === "accent"   ? "#00f0ff" :
                          "#EAF2FF";
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 shrink-0 border-r min-w-[88px]"
         style={{ borderRightColor: "#0d1e2e" }}>
      <div className="text-[14px] font-bold font-mono tabular-nums leading-none"
           style={{ color }}>
        {value}
      </div>
      <div className="text-[8px] font-mono uppercase tracking-[0.12em] font-medium"
           style={{ color: "#5a7a90" }}>
        {label}
      </div>
    </div>
  );
}

export function AdminTopTelemetryBar() {
  const { data, isError } = useQuery<TopTelemetry>({
    queryKey: ["adminTopTelemetry"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/top-telemetry`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<TopTelemetry>;
    },
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
    retry: 1,
  });

  const dash = "—";
  const v = (n: number | undefined, fmt: (x: number) => string): string =>
    typeof n === "number" && Number.isFinite(n) ? fmt(n) : dash;

  // Live tone signals
  const pnlTone     = (data?.platformPnlUsd ?? 0) >= 0 ? "positive" : "negative";
  const wsTone      = data?.websocketStatus === "online" ? "positive" : "negative";
  const latencyTone =
    typeof data?.apiLatencyMs === "number"
      ? data.apiLatencyMs < 50 ? "positive"
      : data.apiLatencyMs < 200 ? "warn"
      : "negative"
      : "neutral";
  const failedTone  = (data?.failedTrades ?? 0) > 0 ? "warn" : "neutral";

  return (
    <div
      className="h-10 shrink-0 border-b flex items-center overflow-x-auto whitespace-nowrap sticky top-10 z-40"
      style={{
        background:        "linear-gradient(180deg, #000508 0%, #000a14 100%)",
        borderBottomColor: "#0D2035",
        boxShadow:         "0 1px 0 #00eeff08, 0 2px 8px #00000060",
      }}
      role="status"
      aria-label="Operator telemetry"
    >
      {/* Leading status dot + label */}
      <div className="flex items-center gap-2 px-3 shrink-0 border-r"
           style={{ borderRightColor: "#0d1e2e" }}>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background:  isError ? "#ff3355" : data?.engineRunning ? "#00ff8a" : "#ffaa00",
            boxShadow:   isError ? "0 0 6px #ff335580" : "0 0 6px #00ff8a80",
          }}
        />
        <span className="text-[9px] font-bold font-mono uppercase tracking-[0.18em]"
              style={{ color: isError ? "#ff5566" : "#7ab8cc" }}>
          {isError ? "Telemetry offline" : "Operator · Live"}
        </span>
      </div>

      <Cell label="Active Now"    value={v(data?.activeUsersNow,            fmtInt)}  tone="accent"   />
      <Cell label="Total Users"   value={v(data?.totalRegisteredUsers,      fmtInt)}                  />
      <Cell label="Total Trades"  value={v(data?.totalUserTrades,           fmtInt)}                  />
      <Cell label="Trades 24h"    value={v(data?.tradesToday,               fmtInt)}                  />
      <Cell label="Platform PnL"  value={v(data?.platformPnlUsd,            fmtUsd)}  tone={pnlTone}  />
      <Cell label="Fees"          value={v(data?.feesCollectedUsd,          fmtUsd)}  tone="warn"     />
      <Cell label="Connections"   value={v(data?.activeExchangeConnections, fmtInt)}  tone="accent"   />
      <Cell label="AI Execs"      value={v(data?.activeAiExecutions,        fmtInt)}                  />
      <Cell label="Live Subs"     value={v(data?.liveSubscriptions,         fmtInt)}  tone="positive" />
      <Cell label="MRR"           value={v(data?.monthlyRevenueUsd,         fmtUsd)}  tone="warn"     />
      <Cell label="Failed"        value={v(data?.failedTrades,              fmtInt)}  tone={failedTone}/>
      <Cell label="Uptime"        value={v(data?.systemUptimeSec,           fmtUptime)}               />
      <Cell label="WS"            value={data?.websocketStatus
                                           ? data.websocketStatus.toUpperCase()
                                           : dash} tone={wsTone}                                     />
      <Cell label="Queue/min"     value={v(data?.queueThroughputPerMin,     n => n.toFixed(1))}       />
      <Cell label="API Latency"   value={v(data?.apiLatencyMs,              n => `${Math.round(n)}ms`)}
                                                                                      tone={latencyTone}/>
    </div>
  );
}
