import type { EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary } from "./types";
import { ago } from "./helpers";

interface Props {
  engine:         EngineStatus   | undefined;
  settings:       AppSettings    | undefined;
  trades:         Trade[]        | undefined;
  exchangeStatus: ExchangeStatus | undefined;
  feeSummary:     FeeSummary     | undefined;
}

function Cell({
  label, value, sub, color = "#00f0ff", dim = false, pulse = false,
}: {
  label: string; value: string | number; sub?: string;
  color?: string; dim?: boolean; pulse?: boolean;
}) {
  return (
    <div
      className="tele-cell rounded shrink-0"
      style={pulse && !dim ? { animation: "border-march 3s ease-in-out infinite" } : {}}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t"
        style={{ background: dim ? "transparent" : `linear-gradient(90deg, transparent, ${color}50, transparent)` }}
      />
      <div
        className="text-[22px] font-bold font-mono leading-none mb-1 tracking-tight tabular-nums"
        style={{
          color: dim ? "#1a3850" : color,
          textShadow: dim ? "none" : `0 0 16px ${color}70, 0 0 32px ${color}30`,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-[#1e4860] font-mono uppercase tracking-[0.15em] leading-none mb-1">
          {sub}
        </div>
      )}
      <div className="text-[8px] text-[#1a3850] font-mono uppercase tracking-[0.15em] leading-none">
        {label}
      </div>
    </div>
  );
}

export function TelemetryRow({ engine, settings, trades, exchangeStatus, feeSummary }: Props) {
  const all      = trades ?? [];
  const open     = all.filter((t) => t.status === "open");
  const closed   = all.filter((t) => t.status === "closed");
  const wins     = closed.filter((t) => (t.pnl ?? 0) > 0);
  const winRate  = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const exposure = open.reduce((s, t) => s + (t.amount ?? 0), 0);

  const exName    = exchangeStatus?.exchangeName ?? "KRAKEN";
  const mode      = exchangeStatus?.mode === "live" ? "LIVE" : "SIM";
  const execToday = engine?.tradesExecuted  ?? 0;
  const blocked   = engine?.tradesBlocked   ?? 0;
  const buySig    = engine?.signalCounts.BUY  ?? 0;
  const sellSig   = engine?.signalCounts.SELL ?? 0;
  const passedMTF = engine?.funnel?.passedMTF ?? 0;
  const totalSig  = engine?.signalsGenerated  ?? 0;
  const execCount = engine?.funnel?.executed  ?? 0;
  const execRate  = totalSig > 0 ? (execCount / totalSig * 100) : 0;
  const simUSD    = exchangeStatus?.simBalances?.USD ?? 100_000;
  const lastSig   = ago(engine?.lastSignalAt ?? null);
  const volFilter = engine?.volumeFilter ?? false;
  const mtfBlocked = engine?.mtfBlockCount ?? 0;

  const cells: Array<{
    label: string; value: string | number; sub?: string; color?: string; dim?: boolean; pulse?: boolean;
  }> = [
    {
      label: "PORTFOLIO EQ",
      value: `$${simUSD >= 1000 ? (simUSD / 1000).toFixed(0) + "K" : simUSD.toFixed(0)}`,
      color: "#00f0ff",
    },
    {
      label: "UNREALIZED P&L",
      value: totalPnl >= 0 ? `+$${Math.abs(totalPnl).toFixed(0)}` : `-$${Math.abs(totalPnl).toFixed(0)}`,
      color: totalPnl >= 0 ? "#00ff8a" : "#ff2255",
      pulse: Math.abs(totalPnl) > 0,
    },
    {
      label: "EXPOSURE",
      value: exposure > 0 ? `$${exposure.toFixed(0)}` : "$0",
      color: exposure > 0 ? "#ffb800" : "#1a3850",
      dim:   exposure === 0,
    },
    {
      label: "AI WIN RATE",
      value: `${winRate.toFixed(1)}%`,
      color: winRate >= 55 ? "#00ff8a" : winRate >= 40 ? "#ffb800" : "#ff2255",
      pulse: closed.length > 0,
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
      label: "LAST SIGNAL",
      value: lastSig,
      color: "#00f0ff",
      dim:   !engine?.lastSignalAt,
    },
    {
      label: "VOL FILTER",
      value: volFilter ? "ON" : "OFF",
      color: volFilter ? "#00ff8a" : "#ffb800",
    },
    {
      label: "BROKER",
      value: exName.toUpperCase().slice(0, 6),
      sub:   `${mode} MODE`,
      color: "#00f0ff",
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
    },
    {
      label: "MIN CONF",
      value: `${settings?.minConfidence ?? 60}%`,
      color: "#00f0ff",
    },
    {
      label: "ACCT MODE",
      value: settings?.autoMode ? "AUTO" : "MANUAL",
      color: settings?.autoMode ? "#00ff8a" : "#ffb800",
      pulse: settings?.autoMode,
    },
    {
      label: "FEES",
      value: `$${(feeSummary?.totalFeesCollected ?? 0).toFixed(2)}`,
      color: "#00ff8a",
    },
  ];

  return (
    <div
      className="border-b border-[#0C1E2C] px-2 py-2"
      style={{ background: "linear-gradient(180deg, #000810 0%, #000000 100%)" }}
    >
      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {cells.map((c) => (
          <Cell
            key={c.label}
            label={c.label}
            value={c.value}
            sub={c.sub}
            color={c.color}
            dim={c.dim}
            pulse={c.pulse}
          />
        ))}
      </div>
    </div>
  );
}
