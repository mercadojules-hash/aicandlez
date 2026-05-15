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

/* ── Flat telemetry cell — no card box, just an inline separator strip ────── */
function Cell({
  label, value, color = "#00f0ff", dim = false, pulse = false,
}: {
  label: string; value: string | number;
  color?: string; dim?: boolean; pulse?: boolean;
}) {
  const valColor = dim ? "#1e3a50" : color;

  return (
    <div
      style={{
        padding:     "3px 11px",
        borderRight: "1px solid #090f1a",
        flexShrink:  0,
        minWidth:    84,
        position:    "relative",
      }}
    >
      {pulse && !dim && (
        <div style={{
          position: "absolute", top: 5, right: 7,
          width: 3.5, height: 3.5, borderRadius: "50%",
          background: color, boxShadow: `0 0 5px ${color}`,
        }} className="live-dot" />
      )}

      <div
        className="font-bold font-mono leading-none tabular-nums"
        style={{
          fontSize:      22,
          color:         valColor,
          textShadow:    dim ? "none" : `0 0 14px ${color}45, 0 0 28px ${color}18`,
          marginBottom:  3,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>

      <div
        className="font-mono uppercase leading-none tracking-[0.11em]"
        style={{ fontSize: 7, color: dim ? "#213040" : "#3a5878" }}
      >
        {label}
      </div>
    </div>
  );
}

/* ── Vertical rail label ─────────────────────────────────────────────────── */
function RailHeader({ title, color }: { title: string; color: string }) {
  return (
    <div
      className="flex-shrink-0 flex items-center"
      style={{
        writingMode:     "vertical-rl",
        textOrientation: "mixed",
        padding:         "6px 7px",
        borderRight:     `1px solid ${color}18`,
        background:      `${color}04`,
        alignSelf:       "stretch",
      }}
    >
      <span
        className="font-mono font-bold tracking-[0.22em] uppercase"
        style={{ fontSize: 6, color: `${color}65`, transform: "rotate(180deg)" }}
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

  const isLive   = exchangeStatus?.mode === "live";
  const exName   = exchangeStatus?.exchangeName ?? "—";
  const mode     = isLive ? "LIVE" : "SIM";

  /* ── Portfolio equity — exchange-scoped, no cross-exchange leakage ─────── */
  const liveUSD      = isLive && liveBalance?.source === "live" ? (liveBalance.balances.USD ?? null) : null;
  const simUSD       = exchangeStatus?.simBalances?.USD ?? simAccount?.equity ?? null;
  const portfolioEq  = isLive ? liveUSD : simUSD;
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

  /* ── Rail 1: Operational / live state ─────────────────────────────────── */
  const rail1: Array<{ label: string; value: string | number; color?: string; dim?: boolean; pulse?: boolean }> = [
    {
      label: "BROKER",
      value: exName === "—" ? "—" : exName.toUpperCase().slice(0, 6),
      color: isLive ? "#ff3355" : "#00f0ff",
      pulse: isLive,
    },
    {
      label: "MODE",
      value: mode,
      color: isLive ? "#ff3355" : "#ffaa00",
    },
    {
      label: "AI ENGINE",
      value: engine?.running ? "ON" : "OFF",
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
      label: portfolioLabel,
      value: portfolioEq != null ? fmt$(portfolioEq) : "—",
      color: portfolioColor,
      dim:   portfolioEq == null,
    },
    {
      label: "ACCT HEALTH",
      value: `${acctHealth.toFixed(0)}%`,
      color: acctHealth >= 80 ? "#00ff8a" : acctHealth >= 50 ? "#ffaa00" : "#ff3355",
      pulse: acctHealth < 50,
    },
    {
      label: "LAST SIGNAL",
      value: engine?.lastSignalAt ? lastSig : "—",
      color: "#00f0ff",
      dim:   !engine?.lastSignalAt,
    },
    {
      label: "FEES COLLECTED",
      value: `$${(feeSummary?.totalFeesCollected ?? 0).toFixed(2)}`,
      color: "#00ff8a",
    },
  ];

  /* ── Rail 2: AI execution analytics ─────────────────────────────────── */
  const rail2: Array<{ label: string; value: string | number; color?: string; dim?: boolean; pulse?: boolean }> = [
    {
      label: "AI CONFIDENCE",
      value: engine ? `${avgConf.toFixed(0)}%` : "—",
      color: avgConf >= 65 ? "#00ff8a" : avgConf >= 45 ? "#ffaa00" : "#ff3355",
      dim:   !engine,
    },
    {
      label: "SIGNALS TOTAL",
      value: totalSig,
      color: "#00aaff",
      dim:   totalSig === 0,
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
      label: "AI REJECTIONS",
      value: blocked,
      color: blocked > 50 ? "#ff2255" : "#ffb800",
      dim:   blocked === 0,
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

  /* ── Rail 3: Account / P&L ───────────────────────────────────────────── */
  const rail3: Array<{ label: string; value: string | number; color?: string; dim?: boolean; pulse?: boolean }> = [
    {
      label: "REALIZED P&L",
      value: closed.length > 0
        ? (totalPnl >= 0 ? `+$${Math.abs(totalPnl).toFixed(0)}` : `-$${Math.abs(totalPnl).toFixed(0)}`)
        : "—",
      color: totalPnl >= 0 ? "#00ff8a" : "#ff2255",
      pulse: Math.abs(totalPnl) > 0 && closed.length > 0,
      dim:   closed.length === 0,
    },
    {
      label: "UNREALIZED P&L",
      value: open.length > 0
        ? (realPnl >= 0 ? `+$${Math.abs(realPnl).toFixed(2)}` : `-$${Math.abs(realPnl).toFixed(2)}`)
        : "—",
      color: realPnl >= 0 ? "#00ff8a" : "#ff2255",
      dim:   open.length === 0,
    },
    {
      label: "EXPOSURE",
      value: exposure > 0 ? `$${exposure.toFixed(0)}` : "$0",
      color: exposure > 0 ? "#ffb800" : "#ffb800",
      dim:   exposure === 0,
    },
    {
      label: "AI WIN RATE",
      value: closed.length > 0 ? `${winRate.toFixed(1)}%` : "—",
      color: winRate >= 55 ? "#00ff8a" : winRate >= 40 ? "#ffb800" : "#ff2255",
      dim:   closed.length === 0,
    },
    {
      label: "ACCT MODE",
      value: settings?.autoMode ? "AUTO" : "MANUAL",
      color: settings?.autoMode ? "#00ff8a" : "#ffb800",
      pulse: settings?.autoMode,
    },
    {
      label: "STOP LOSS",
      value: settings ? `${settings.stopLossPercent ?? 2}%` : "—",
      color: "#ff8844",
      dim:   !settings,
    },
    {
      label: "TAKE PROFIT",
      value: settings ? `${settings.takeProfitPercent ?? 4}%` : "—",
      color: "#00ff8a",
      dim:   !settings,
    },
    {
      label: "MAX TRADES/DAY",
      value: settings?.maxTradesPerDay ?? "—",
      color: "#9FB3C8",
      dim:   !settings,
    },
    {
      label: "POSITION SIZE",
      value: settings ? `${((settings.allocation ?? 0.01) * 100).toFixed(1)}%` : "—",
      color: "#9FB3C8",
      dim:   !settings,
    },
  ];

  const stripStyle: React.CSSProperties = {
    display:        "flex",
    overflowX:      "auto",
    scrollbarWidth: "none",
    flex:           1,
  };

  return (
    <div style={{ background: "#000000", borderBottom: "1px solid #0c1824" }}>

      {/* ── Rail 1: Operational ────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid #08111a" }}>
        <RailHeader title="OPERATIONAL" color="#00f0ff" />
        <div style={stripStyle}>
          {rail1.map((c) => <Cell key={c.label} {...c} />)}
        </div>
      </div>

      {/* ── Rail 2: AI Execution ───────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid #08111a" }}>
        <RailHeader title="AI EXECUTION" color="#cc55ff" />
        <div style={stripStyle}>
          {rail2.map((c) => <Cell key={c.label} {...c} />)}
        </div>
      </div>

      {/* ── Rail 3: Account / P&L ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <RailHeader title="ACCOUNT" color="#ffaa00" />
        <div style={stripStyle}>
          {rail3.map((c) => <Cell key={c.label} {...c} />)}
        </div>
      </div>

    </div>
  );
}
