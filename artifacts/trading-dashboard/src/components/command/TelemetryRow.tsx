import type { EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary, SimAccount, LiveBalance } from "./types";
import { ago } from "./helpers";

interface Props {
  engine:         EngineStatus   | undefined;
  settings:       AppSettings    | undefined;
  trades:         Trade[]        | undefined;
  exchangeStatus: ExchangeStatus | undefined;
  feeSummary:     FeeSummary     | undefined;
  liveBalance?:   LiveBalance    | undefined;
  simAccount?:    SimAccount     | undefined;
}

/* ── Single telemetry cell ───────────────────────────────────────────────── */
function Cell({
  label, value, sub, color = "#00f0ff", dim = false, pulse = false, wide = false,
}: {
  label: string; value: string | number; sub?: string;
  color?: string; dim?: boolean; pulse?: boolean; wide?: boolean;
}) {
  /* Dim = "zero / inactive" state — still visible, just clearly muted */
  const valColor  = dim ? "#1e3a50" : color;
  const subColor  = dim ? "#162a3a" : `${color}75`;
  const barColor  = dim
    ? `linear-gradient(90deg, transparent, ${color}10, transparent)`
    : `linear-gradient(90deg, transparent, ${color}50, transparent)`;

  return (
    <div
      style={{
        background:    "#030b14",
        border:        `1px solid ${dim ? "#0c1824" : "#141f2e"}`,
        borderRadius:  3,
        padding:       "10px 16px",
        minWidth:      wide ? 145 : 115,
        position:      "relative",
        overflow:      "hidden",
        flexShrink:    0,
        transition:    "border-color 0.25s",
        ...(pulse && !dim ? { animation: "border-march 3s ease-in-out infinite" } : {}),
      }}
    >
      {/* Top accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: barColor }} />

      {/* Primary value */}
      <div
        className="font-bold font-mono leading-none tabular-nums"
        style={{
          fontSize:      23,
          color:         valColor,
          textShadow:    dim ? "none" : `0 0 14px ${color}45, 0 0 28px ${color}18`,
          marginBottom:  sub ? 5 : 6,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>

      {/* Sub-label */}
      {sub && (
        <div
          className="font-mono uppercase tracking-[0.14em] leading-none"
          style={{ fontSize: 8.5, color: subColor, marginBottom: 4 }}
        >
          {sub}
        </div>
      )}

      {/* Label — always readable, never invisible */}
      <div
        className="font-mono uppercase leading-none tracking-[0.12em]"
        style={{ fontSize: 8.5, color: dim ? "#2a4a60" : "#3a5878" }}
      >
        {label}
      </div>
    </div>
  );
}

/* ── Row header label ────────────────────────────────────────────────────── */
function RowHeader({ title, color }: { title: string; color: string }) {
  return (
    <div
      className="flex-shrink-0 flex items-center"
      style={{
        writingMode:     "vertical-rl",
        textOrientation: "mixed",
        paddingLeft:    10,
        paddingRight:   10,
        paddingTop:     14,
        paddingBottom:  14,
        borderRight:    `1px solid ${color}22`,
        background:     `${color}06`,
        marginRight:    4,
        alignSelf:      "stretch",
      }}
    >
      <span
        className="font-mono font-bold tracking-[0.22em] uppercase"
        style={{ fontSize: 7, color: `${color}80`, transform: "rotate(180deg)" }}
      >
        {title}
      </span>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function TelemetryRow({ engine, settings, trades, exchangeStatus, feeSummary, liveBalance, simAccount }: Props) {
  const all      = trades ?? [];
  const open     = all.filter((t) => t.status === "open");
  const closed   = all.filter((t) => t.status === "closed");
  const wins     = closed.filter((t) => (t.pnl ?? 0) > 0);
  const winRate  = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const realPnl  = open.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const exposure = open.reduce((s, t) => s + (t.amount ?? 0), 0);

  /* ── Exchange / mode — AUTHORITATIVE from server, no hardcoded fallbacks ── */
  const isLive     = exchangeStatus?.mode === "live";
  const exName     = exchangeStatus?.exchangeName ?? "—";
  const mode       = isLive ? "LIVE" : "SIM";

  /* ── Portfolio equity — exchange-scoped, no cross-exchange leakage ─────── */
  const liveUSD   = isLive && liveBalance?.source === "live" ? (liveBalance.balances.USD ?? null) : null;
  const simUSD    = exchangeStatus?.simBalances?.USD ?? simAccount?.equity ?? 100_000;
  const portfolioEq = isLive ? liveUSD : simUSD;
  const portfolioLabel = isLive
    ? `${exName.toUpperCase().slice(0, 6)} LIVE USD`
    : "SIM EQUITY";
  const portfolioColor = isLive ? "#00ff8a" : "#00f0ff";

  const fmt$ = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000   ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`;

  const execToday  = engine?.tradesExecuted  ?? 0;
  const blocked    = engine?.tradesBlocked   ?? 0;
  const buySig     = engine?.signalCounts?.BUY  ?? 0;
  const sellSig    = engine?.signalCounts?.SELL ?? 0;
  const passedMTF  = engine?.funnel?.passedMTF ?? 0;
  const totalSig   = engine?.signalsGenerated  ?? 0;
  const execCount  = engine?.funnel?.executed  ?? 0;
  const execRate   = totalSig > 0 ? (execCount / totalSig * 100) : 0;
  const lastSig    = ago(engine?.lastSignalAt ?? null);
  const volFilter  = engine?.volumeFilter ?? false;
  const mtfBlocked = engine?.mtfBlockCount ?? 0;

  const avgConf = engine
    ? (() => {
        const bds = Object.values(engine.symbolBreakdowns ?? {});
        return bds.length ? bds.reduce((s, b) => s + (b as any).avgConfidence, 0) / bds.length : 0;
      })()
    : 0;

  const acctHealth = exchangeStatus?.killSwitch ? 0 : Math.max(40, 100 - blocked * 0.15);

  /* ── ROW 1: Operational / live state ─────────────────────────────────── */
  const row1: Array<{
    label: string; value: string | number; sub?: string;
    color?: string; dim?: boolean; pulse?: boolean; wide?: boolean;
  }> = [
    {
      label: "BROKER",
      value: exName === "—" ? "—" : exName.toUpperCase().slice(0, 6),
      sub:   `${mode} MODE`,
      color: isLive ? "#ff3355" : "#00f0ff",
      pulse: isLive,
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
      label: "OPEN POSITIONS",
      value: open.length,
      color: open.length > 0 ? "#00f0ff" : "#00a0cc",
      dim:   open.length === 0,
      pulse: open.length > 0,
    },
    {
      label: "EXECUTIONS",
      value: execToday,
      color: execToday > 0 ? "#ffb800" : "#aa7800",
      dim:   execToday === 0,
    },
    {
      label: "FEES COLLECTED",
      value: `$${(feeSummary?.totalFeesCollected ?? 0).toFixed(2)}`,
      color: "#00ff8a",
      wide:  true,
    },
    {
      label: portfolioLabel,
      value: portfolioEq != null ? fmt$(portfolioEq) : "—",
      color: portfolioColor,
      wide:  true,
    },
    {
      label: "ACCT HEALTH",
      value: `${acctHealth.toFixed(0)}%`,
      color: acctHealth >= 80 ? "#00ff8a" : acctHealth >= 50 ? "#ffaa00" : "#ff3355",
      pulse: acctHealth < 50,
    },
    {
      label: "LAST SIGNAL",
      value: lastSig,
      color: "#00f0ff",
      dim:   !engine?.lastSignalAt,
      wide:  true,
    },
  ];

  /* ── ROW 2: Performance / signals / infrastructure ─────────────────── */
  const row2: Array<{
    label: string; value: string | number; sub?: string;
    color?: string; dim?: boolean; pulse?: boolean; wide?: boolean;
  }> = [
    {
      label: "REALIZED P&L",
      value: totalPnl >= 0
        ? `+$${Math.abs(totalPnl).toFixed(0)}`
        : `-$${Math.abs(totalPnl).toFixed(0)}`,
      color: totalPnl >= 0 ? "#00ff8a" : "#ff2255",
      pulse: Math.abs(totalPnl) > 0,
      wide:  true,
    },
    {
      label: "UNREALIZED",
      value: realPnl >= 0
        ? `+$${Math.abs(realPnl).toFixed(2)}`
        : `-$${Math.abs(realPnl).toFixed(2)}`,
      color: realPnl >= 0 ? "#00ff8a" : "#ff2255",
    },
    {
      label: "EXPOSURE",
      value: exposure > 0 ? `$${exposure.toFixed(0)}` : "$0",
      color: exposure > 0 ? "#ffb800" : "#ffb800",
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
      label: "AI CONFIDENCE",
      value: `${avgConf.toFixed(0)}%`,
      color: avgConf >= 65 ? "#00ff8a" : avgConf >= 45 ? "#ffaa00" : "#ff3355",
    },
    {
      label: "AI REJECTIONS",
      value: blocked,
      sub:   blocked > 0 ? "signals filtered" : undefined,
      color: blocked > 50 ? "#ff2255" : blocked > 20 ? "#ffb800" : "#ffb800",
      dim:   blocked === 0,
    },
    {
      label: "BUY SIGNALS",
      value: buySig,
      color: buySig > 0 ? "#00ff8a" : "#00cc66",
      dim:   buySig === 0,
    },
    {
      label: "SELL SIGNALS",
      value: sellSig,
      color: sellSig > 0 ? "#ff2255" : "#cc2244",
      dim:   sellSig === 0,
    },
    {
      label: "MTF PASSED",
      value: passedMTF,
      color: passedMTF > 0 ? "#00f0ff" : "#00a0cc",
      dim:   passedMTF === 0,
    },
    {
      label: "MTF BLOCKED",
      value: mtfBlocked,
      color: mtfBlocked > 100 ? "#ff2255" : "#ff8844",
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
      label: "MIN CONF",
      value: `${settings?.minConfidence ?? 60}%`,
      color: "#00f0ff",
    },
  ];

  const rowStyle: React.CSSProperties = {
    display:        "flex",
    gap:            8,
    overflowX:      "auto",
    scrollbarWidth: "none",
    padding:        "0 10px",
    flex:           1,
  };

  return (
    <div style={{ background: "#000000", borderBottom: "1px solid #101e2c" }}>

      {/* ── Row 1: Operational / live state ─────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid #0a1824" }}>
        <RowHeader title="OPERATIONAL STATUS" color="#00f0ff" />
        <div style={{ ...rowStyle, paddingTop: 9, paddingBottom: 8 }}>
          {row1.map((c) => <Cell key={c.label} {...c} />)}
        </div>
      </div>

      {/* ── Row 2: Performance / analytics ──────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <RowHeader title="PERFORMANCE ANALYTICS" color="#cc55ff" />
        <div style={{ ...rowStyle, paddingTop: 8, paddingBottom: 9 }}>
          {row2.map((c) => <Cell key={c.label} {...c} />)}
        </div>
      </div>

    </div>
  );
}
