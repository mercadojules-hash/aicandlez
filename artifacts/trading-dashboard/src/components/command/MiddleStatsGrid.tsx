import type { Trade, EngineStatus } from "./types";

interface Props { trades: Trade[] | undefined; engine: EngineStatus | undefined }

function StatBox({ label, value, sub, color = "#4a8fa8" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[#050e1a] rounded p-2.5 text-center border border-[#0A1820] hover:border-[#0D2235] transition-colors">
      <div
        className="text-[13px] font-bold font-mono leading-none"
        style={{ color, textShadow: `0 0 10px ${color}50` }}
      >
        {value}
      </div>
      {sub && <div className="text-[7px] text-[#0E2235] font-mono mt-0.5">{sub}</div>}
      <div className="text-[7px] text-[#0A1828] uppercase tracking-[0.15em] mt-0.5 font-mono">{label}</div>
    </div>
  );
}

export function MiddleStatsGrid({ trades, engine }: Props) {
  const all    = trades ?? [];
  const open   = all.filter((t) => t.status === "open");
  const closed = all.filter((t) => t.status === "closed");
  const wins   = closed.filter((t) => (t.pnl ?? 0) > 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const exposure = open.reduce((s, t) => s + (t.amount ?? 0), 0);

  const execCount = engine?.tradesExecuted ?? 0;
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" =
    execCount === 0  ? "LOW"      :
    execCount > 10   ? "CRITICAL" :
    execCount > 6    ? "HIGH"     :
    execCount > 3    ? "MEDIUM"   : "LOW";

  const riskColor =
    riskLevel === "CRITICAL" ? "#ff3366" :
    riskLevel === "HIGH"     ? "#ff8800" :
    riskLevel === "MEDIUM"   ? "#ffb800" : "#00ff88";

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <div className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">PORTFOLIO SNAPSHOT</span>
      </div>
      <div className="p-2">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          <StatBox
            label="WIN RATE"
            value={`${winRate.toFixed(0)}%`}
            sub={`${wins.length}W/${closed.length - wins.length}L`}
            color={winRate >= 50 ? "#00ff88" : "#ff3366"}
          />
          <StatBox
            label="TOTAL P&L"
            value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(0)}`}
            sub={`${closed.length} closed`}
            color={totalPnl >= 0 ? "#00ff88" : "#ff3366"}
          />
          <StatBox
            label="EXPOSURE"
            value={`$${exposure.toFixed(0)}`}
            sub={`${open.length} pos`}
            color={exposure > 0 ? "#ffb800" : "#0E2235"}
          />
          <StatBox
            label="ACTIVE"
            value={`${open.length}`}
            sub="open trades"
            color={open.length > 0 ? "#00eeff" : "#0E2235"}
          />
          <StatBox
            label="EXECUTED"
            value={`${execCount}`}
            sub="this session"
            color={execCount > 0 ? "#ffb800" : "#0E2235"}
          />
          <StatBox
            label="THREAT LEVEL"
            value={riskLevel}
            color={riskColor}
          />
        </div>
      </div>
    </div>
  );
}
