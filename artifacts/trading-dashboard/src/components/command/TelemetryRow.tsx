import type { EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary } from "./types";

interface Props {
  engine:         EngineStatus   | undefined;
  settings:       AppSettings    | undefined;
  trades:         Trade[]        | undefined;
  exchangeStatus: ExchangeStatus | undefined;
  feeSummary:     FeeSummary     | undefined;
}

function Cell({
  label, value, sub, color = "#00eeff", dim = false
}: {
  label: string; value: string | number; sub?: string; color?: string; dim?: boolean;
}) {
  return (
    <div className="tele-cell rounded flex-1 min-w-[88px]">
      <div
        className="text-[13px] font-bold font-mono leading-none mb-0.5 tracking-tight"
        style={{ color: dim ? "#2e5c75" : color, textShadow: dim ? "none" : `0 0 12px ${color}60` }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[8px] text-[#1e4860] font-mono uppercase tracking-widest leading-none mb-0.5">{sub}</div>
      )}
      <div className="text-[8px] text-[#1e4060] font-mono uppercase tracking-[0.12em] leading-none">{label}</div>
    </div>
  );
}

export function TelemetryRow({ engine, settings, trades, exchangeStatus, feeSummary }: Props) {
  const all     = trades ?? [];
  const open    = all.filter((t) => t.status === "open");
  const closed  = all.filter((t) => t.status === "closed");
  const wins    = closed.filter((t) => (t.pnl ?? 0) > 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const exposure = open.reduce((s, t) => s + (t.amount ?? 0), 0);

  const exName = exchangeStatus?.exchangeName ?? "KRAKEN";
  const mode   = exchangeStatus?.mode === "live" ? "LIVE" : "SIM";
  const execToday = engine?.tradesExecuted ?? 0;
  const buySig = engine?.signalCounts.BUY ?? 0;
  const sellSig = engine?.signalCounts.SELL ?? 0;
  const passedMTF = engine?.funnel?.passedMTF ?? 0;
  const totalSig = engine?.signalsGenerated ?? 0;
  const execRate = totalSig > 0 ? ((engine?.funnel?.executed ?? 0) / totalSig * 100) : 0;

  const simUSD = exchangeStatus?.simBalances?.USD ?? 100_000;

  const cells = [
    { label: "PORTFOLIO EQ",  value: `$${simUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,   color: "#00eeff" },
    { label: "UNREALIZED PNL",value: totalPnl >= 0 ? `+$${Math.abs(totalPnl).toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`, color: totalPnl >= 0 ? "#00ff88" : "#ff3366" },
    { label: "EXPOSURE",      value: exposure > 0 ? `$${exposure.toFixed(0)}` : "$0",   color: exposure > 0 ? "#ffb800" : "#1e4060" },
    { label: "AI WIN RATE",   value: `${winRate.toFixed(1)}%`,   color: winRate >= 50 ? "#00ff88" : "#ff3366" },
    { label: "LIVE TRADES",   value: open.length,   color: open.length > 0 ? "#00eeff" : "#1e4060" },
    { label: "EXECUTIONS",    value: execToday,     color: execToday > 0 ? "#ffb800" : "#1e4060" },
    { label: "BUY SIGNALS",   value: buySig,        color: buySig > 0 ? "#00ff88" : "#1e4060" },
    { label: "SELL SIGNALS",  value: sellSig,       color: sellSig > 0 ? "#ff3366" : "#1e4060" },
    { label: "MTF PASSED",    value: passedMTF,     color: passedMTF > 0 ? "#00eeff" : "#1e4060" },
    { label: "EXEC RATE",     value: `${execRate.toFixed(1)}%`,  color: execRate > 50 ? "#00ff88" : "#ffb800" },
    { label: "BROKER",        value: exName.toUpperCase(), sub: mode, color: "#00eeff" },
    { label: "FEES COLLECTED",value: `$${(feeSummary?.totalFeesCollected ?? 0).toFixed(2)}`, color: "#00ff88" },
    { label: "ACCOUNT MODE",  value: settings?.autoMode ? "AUTO" : "MANUAL", color: settings?.autoMode ? "#00ff88" : "#ffb800" },
    { label: "MIN CONFIDENCE",value: `${settings?.minConfidence ?? 60}%`,  color: "#00eeff" },
    { label: "MAX TRADES/DAY",value: settings?.maxTradesPerDay ?? 5,        color: "#4a8fa8" },
    { label: "AI ENGINE",     value: engine?.running ? "ONLINE" : "OFFLINE", color: engine?.running ? "#00ff88" : "#ff3366" },
    { label: "KILL SWITCH",   value: exchangeStatus?.killSwitch ? "ACTIVE" : "SAFE", color: exchangeStatus?.killSwitch ? "#ff3366" : "#00ff88" },
    { label: "SIGNALS GEN",   value: engine?.signalsGenerated ?? 0, color: "#4a8fa8" },
  ];

  return (
    <div className="border-b border-[#0C1E2E] bg-[#000508] px-2 py-1.5">
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {cells.map((c) => (
          <Cell key={c.label} label={c.label} value={c.value} sub={c.sub} color={c.color} />
        ))}
      </div>
    </div>
  );
}
