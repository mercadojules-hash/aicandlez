import type { EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary } from "./types";
import { ago } from "./helpers";

interface Props {
  engine:         EngineStatus   | undefined;
  settings:       AppSettings    | undefined;
  trades:         Trade[]        | undefined;
  exchangeStatus: ExchangeStatus | undefined;
  feeSummary:     FeeSummary     | undefined;
}

/* ── Single telemetry cell ───────────────────────────────────────────────── */
function Cell({
  label, value, sub, color = "#00f0ff", dim = false, pulse = false, wide = false,
}: {
  label: string; value: string | number; sub?: string;
  color?: string; dim?: boolean; pulse?: boolean; wide?: boolean;
}) {
  return (
    <div
      style={{
        background:  "#000000",
        border:      "1px solid #181818",
        padding:     "12px 18px",
        minWidth:    wide ? 140 : 110,
        position:    "relative",
        overflow:    "hidden",
        flexShrink:  0,
        transition:  "border-color 0.2s",
        ...(pulse && !dim ? { animation: "border-march 3s ease-in-out infinite" } : {}),
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          position:   "absolute",
          top: 0, left: 0, right: 0,
          height:     2,
          background: dim
            ? "transparent"
            : `linear-gradient(90deg, transparent, ${color}45, transparent)`,
        }}
      />

      {/* Primary value */}
      <div
        className="font-bold font-mono leading-none tabular-nums"
        style={{
          fontSize:   26,
          color:      dim ? "#1a3045" : color,
          textShadow: dim ? "none" : `0 0 16px ${color}55, 0 0 32px ${color}20`,
          marginBottom: sub ? 5 : 6,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>

      {/* Sub-label (e.g. "SIM MODE") */}
      {sub && (
        <div
          className="font-mono uppercase tracking-[0.14em] leading-none"
          style={{ fontSize: 9, color: dim ? "#112233" : `${color}80`, marginBottom: 4 }}
        >
          {sub}
        </div>
      )}

      {/* Label */}
      <div
        className="font-mono uppercase leading-none"
        style={{ fontSize: 9, color: "#1e3a50", letterSpacing: "0.14em" }}
      >
        {label}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function TelemetryRow({ engine, settings, trades, exchangeStatus, feeSummary }: Props) {
  const all      = trades ?? [];
  const open     = all.filter((t) => t.status === "open");
  const closed   = all.filter((t) => t.status === "closed");
  const wins     = closed.filter((t) => (t.pnl ?? 0) > 0);
  const winRate  = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const exposure = open.reduce((s, t) => s + (t.amount ?? 0), 0);

  const exName     = exchangeStatus?.exchangeName ?? "KRAKEN";
  const mode       = exchangeStatus?.mode === "live" ? "LIVE" : "SIM";
  const execToday  = engine?.tradesExecuted  ?? 0;
  const blocked    = engine?.tradesBlocked   ?? 0;
  const buySig     = engine?.signalCounts.BUY  ?? 0;
  const sellSig    = engine?.signalCounts.SELL ?? 0;
  const passedMTF  = engine?.funnel?.passedMTF ?? 0;
  const totalSig   = engine?.signalsGenerated  ?? 0;
  const execCount  = engine?.funnel?.executed  ?? 0;
  const execRate   = totalSig > 0 ? (execCount / totalSig * 100) : 0;
  const simUSD     = exchangeStatus?.simBalances?.USD ?? 100_000;
  const lastSig    = ago(engine?.lastSignalAt ?? null);
  const volFilter  = engine?.volumeFilter ?? false;
  const mtfBlocked = engine?.mtfBlockCount ?? 0;

  /* ── ROW 1: Operational / live state ──────────────────────────────── */
  const row1: Array<{
    label: string; value: string | number; sub?: string;
    color?: string; dim?: boolean; pulse?: boolean; wide?: boolean;
  }> = [
    {
      label: "BROKER",
      value: exName.toUpperCase().slice(0, 6),
      sub:   `${mode} MODE`,
      color: mode === "LIVE" ? "#ff3355" : "#00f0ff",
      pulse: mode === "LIVE",
      wide:  true,
    },
    {
      label: "AI ENGINE",
      value: engine?.running ? "ONLINE" : "OFFLINE",
      color: engine?.running ? "#00ff8a" : "#ff2255",
      pulse: engine?.running,
    },
    {
      label: "KILL SWITCH",
      value: exchangeStatus?.killSwitch ? "ACTIVE" : "SAFE",
      color: exchangeStatus?.killSwitch ? "#ff2255" : "#00ff8a",
      pulse: !!exchangeStatus?.killSwitch,
    },
    {
      label: "LIVE TRADES",
      value: open.length,
      color: open.length > 0 ? "#00f0ff" : "#1a3850",
      dim:   open.length === 0,
      pulse: open.length > 0,
    },
    {
      label: "EXECUTIONS",
      value: execToday,
      color: execToday > 0 ? "#ffb800" : "#1a3850",
      dim:   execToday === 0,
    },
    {
      label: "FEES",
      value: `$${(feeSummary?.totalFeesCollected ?? 0).toFixed(2)}`,
      color: "#00ff8a",
    },
    {
      label: "PORTFOLIO EQ",
      value: `$${simUSD >= 1000 ? (simUSD / 1000).toFixed(0) + "K" : simUSD.toFixed(0)}`,
      color: "#00f0ff",
    },
  ];

  /* ── ROW 2: Performance / signal quality ──────────────────────────── */
  const row2: Array<{
    label: string; value: string | number; sub?: string;
    color?: string; dim?: boolean; pulse?: boolean; wide?: boolean;
  }> = [
    {
      label: "UNREALIZED P&L",
      value: totalPnl >= 0
        ? `+$${Math.abs(totalPnl).toFixed(0)}`
        : `-$${Math.abs(totalPnl).toFixed(0)}`,
      color: totalPnl >= 0 ? "#00ff8a" : "#ff2255",
      pulse: Math.abs(totalPnl) > 0,
      wide:  true,
    },
    {
      label: "EXPOSURE",
      value: exposure > 0 ? `$${exposure.toFixed(0)}` : "$0",
      color: exposure > 0 ? "#ffb800" : "#1a3850",
      dim:   exposure === 0,
    },
    {
      label: "ACCT MODE",
      value: settings?.autoMode ? "AUTO" : "MANUAL",
      color: settings?.autoMode ? "#00ff8a" : "#ffb800",
      pulse: settings?.autoMode,
    },
    {
      label: "AI WIN RATE",
      value: `${winRate.toFixed(1)}%`,
      color: winRate >= 55 ? "#00ff8a" : winRate >= 40 ? "#ffb800" : "#ff2255",
    },
    {
      label: "BLOCKED",
      value: blocked,
      color: blocked > 50 ? "#ff2255" : blocked > 20 ? "#ffb800" : "#1a3850",
      dim:   blocked === 0,
    },
    {
      label: "BUY SIGNALS",
      value: buySig,
      color: buySig > 0 ? "#00ff8a" : "#1a3850",
      dim:   buySig === 0,
    },
    {
      label: "SELL SIGNALS",
      value: sellSig,
      color: sellSig > 0 ? "#ff2255" : "#1a3850",
      dim:   sellSig === 0,
    },
    {
      label: "MTF PASSED",
      value: passedMTF,
      color: passedMTF > 0 ? "#00f0ff" : "#1a3850",
      dim:   passedMTF === 0,
    },
    {
      label: "MTF BLOCKED",
      value: mtfBlocked,
      color: mtfBlocked > 100 ? "#ff2255" : "#1a3850",
      dim:   mtfBlocked === 0,
    },
    {
      label: "EXEC RATE",
      value: `${execRate.toFixed(1)}%`,
      color: execRate > 60 ? "#00ff8a" : execRate > 20 ? "#ffb800" : "#ff2255",
    },
    {
      label: "VOL FILTER",
      value: volFilter ? "ON" : "OFF",
      color: volFilter ? "#00ff8a" : "#ffb800",
    },
    {
      label: "LAST SIGNAL",
      value: lastSig,
      color: "#00f0ff",
      dim:   !engine?.lastSignalAt,
    },
    {
      label: "MIN CONF",
      value: `${settings?.minConfidence ?? 60}%`,
      color: "#00f0ff",
    },
  ];

  const rowStyle: React.CSSProperties = {
    display:         "flex",
    gap:             8,
    overflowX:       "auto",
    scrollbarWidth:  "none",
    paddingLeft:     8,
    paddingRight:    8,
  };

  return (
    <div style={{ background: "#000000", borderBottom: "1px solid #141414" }}>

      {/* Row 1 */}
      <div style={{ ...rowStyle, paddingTop: 10, paddingBottom: 6 }}>
        {row1.map((c) => <Cell key={c.label} {...c} />)}
      </div>

      {/* Thin divider between rows */}
      <div style={{ height: 1, background: "#0d0d0d", marginLeft: 8, marginRight: 8 }} />

      {/* Row 2 */}
      <div style={{ ...rowStyle, paddingTop: 6, paddingBottom: 10 }}>
        {row2.map((c) => <Cell key={c.label} {...c} />)}
      </div>

    </div>
  );
}
