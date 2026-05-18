/**
 * PlatformOverview — full-width institutional telemetry row.
 *
 * Bloomberg / hedge-fund mission-control feel.
 * Renders 13 compact metric cards across the top of the workstation,
 * polled live from `/api/admin/platform-overview`.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Users, UserCheck, Bot, Activity, TrendingUp, CalendarDays,
  CalendarRange, DollarSign, BarChart3, LineChart, Percent,
  Radio, Brain,
} from "lucide-react";
import { N } from "./theme";

interface PlatformOverview {
  users: { total: number; online: number; recentSignups: number };
  trades: {
    today: number; winsToday: number; winsWeek: number; winsMonth: number;
    totalTrades: number; totalPnL: number; totalVolume: number; winRate: number;
  };
  fees:  { totalCollected: number };
  ai:    {
    enginesRunning: number; signalsGenerated: number;
    tradesExecuted: number; mtfConfirmed: number; avgConfidence: number;
  };
  timestamp: number;
}

const j = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function PlatformOverview() {
  const { data, isError } = useQuery<PlatformOverview>({
    queryKey:        ["platform-overview"],
    queryFn:         () => j("/api/admin/platform-overview"),
    refetchInterval: 5_000,
    refetchOnWindowFocus: false,
    staleTime:       0,
    retry:           false,
  });

  // Defensive — endpoint is admin-gated, fall back to zeroed display if 401/500
  const d: PlatformOverview = data ?? {
    users:  { total: 0, online: 0, recentSignups: 0 },
    trades: { today: 0, winsToday: 0, winsWeek: 0, winsMonth: 0,
              totalTrades: 0, totalPnL: 0, totalVolume: 0, winRate: 0 },
    fees:   { totalCollected: 0 },
    ai:     { enginesRunning: 0, signalsGenerated: 0, tradesExecuted: 0,
              mtfConfirmed: 0, avgConfidence: 0 },
    timestamp: Date.now(),
  };

  return (
    <section
      style={{
        background: N.SURFACE_1,
        border: `1px solid ${N.BORDER}`,
        borderRadius: 4,
        padding: "8px 10px",
        boxShadow: `inset 0 1px 0 ${N.BRAND}08, 0 0 22px ${N.BRAND}06`,
      }}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Radio size={11} style={{ color: N.BRAND }} className="animate-pulse" />
          <span className="text-[9px] font-bold tracking-[0.28em]"
            style={{ color: N.TEXT_1, fontFamily: N.FONT_MONO }}>
            AICANDLEZ · GLOBAL PLATFORM TELEMETRY
          </span>
          {isError && (
            <span className="text-[8.5px] tracking-[0.16em] font-bold"
              style={{ color: N.WARN, fontFamily: N.FONT_MONO }}>
              · ADMIN ROLE REQUIRED ·
            </span>
          )}
        </div>
        <span className="text-[8.5px] tracking-[0.18em] font-semibold"
          style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
          LIVE · {new Date(d.timestamp).toLocaleTimeString("en-US", { hour12: false })}
        </span>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(13, minmax(0, 1fr))",
          gap: 6,
        }}
      >
        <MetricCard label="USERS ONLINE"      value={fmtInt(d.users.online)}       icon={UserCheck}    accent={N.BRAND} live />
        <MetricCard label="TOTAL USERS"       value={fmtInt(d.users.total)}        icon={Users}        accent={N.TEXT_1} />
        <MetricCard label="ACTIVE AI BOTS"    value={fmtInt(d.ai.enginesRunning)}  icon={Bot}          accent={N.BRAND} live={d.ai.enginesRunning > 0} />
        <MetricCard label="TRADES TODAY"      value={fmtInt(d.trades.today)}       icon={Activity}     accent={N.TEXT_0} />
        <MetricCard label="WINS · TODAY"      value={fmtInt(d.trades.winsToday)}   icon={TrendingUp}   accent={N.LONG} />
        <MetricCard label="WINS · WEEK"       value={fmtInt(d.trades.winsWeek)}    icon={CalendarDays} accent={N.LONG} />
        <MetricCard label="WINS · MONTH"      value={fmtInt(d.trades.winsMonth)}   icon={CalendarRange} accent={N.LONG} />
        <MetricCard label="FEES COLLECTED"    value={fmtMoney(d.fees.totalCollected)} icon={DollarSign}  accent={N.BRAND} />
        <MetricCard label="PLATFORM PNL"      value={fmtMoney(d.trades.totalPnL)}  icon={LineChart}
          accent={d.trades.totalPnL >= 0 ? N.LONG : N.SHORT} />
        <MetricCard label="VOLUME TRADED"     value={fmtMoney(d.trades.totalVolume)} icon={BarChart3} accent={N.TEXT_1} />
        <MetricCard label="AI WIN RATE"       value={`${d.trades.winRate.toFixed(1)}%`} icon={Percent}
          accent={d.trades.winRate >= 50 ? N.LONG : N.SHORT} />
        <MetricCard label="SIGNALS TODAY"     value={fmtInt(d.ai.signalsGenerated)} icon={Radio}     accent={N.BRAND} live={d.ai.signalsGenerated > 0} />
        <MetricCard label="AVG AI CONF"       value={`${d.ai.avgConfidence.toFixed(0)}%`} icon={Brain}
          accent={d.ai.avgConfidence >= 70 ? N.BRAND : N.WARN} />
      </div>
    </section>
  );
}

function MetricCard({
  label, value, icon: Icon, accent, live = false,
}: {
  label: string;
  value: string;
  icon:  React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  accent: string;
  live?: boolean;
}) {
  return (
    <div
      style={{
        background: "#000",
        border: `1px solid ${N.BORDER}`,
        borderRadius: 3,
        padding: "6px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minHeight: 50,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {live && (
        <span style={{
          position: "absolute", top: 5, right: 5,
          width: 5, height: 5, borderRadius: 5,
          background: accent, boxShadow: `0 0 6px ${accent}`,
          animation: "neon-pulse 1.4s infinite",
        }} />
      )}
      <div className="flex items-center gap-1">
        <Icon size={9} style={{ color: N.TEXT_3 }} />
        <span className="text-[7.5px] font-bold tracking-[0.14em] truncate"
          style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
          {label}
        </span>
      </div>
      <span className="text-[14px] font-extrabold tabular-nums tracking-tight"
        style={{
          color: accent,
          fontFamily: N.FONT_MONO,
          textShadow: live ? `0 0 6px ${accent}55` : "none",
          lineHeight: 1.1,
        }}>
        {value}
      </span>
    </div>
  );
}
