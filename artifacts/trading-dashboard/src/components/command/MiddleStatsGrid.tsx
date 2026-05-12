import type { Trade, EngineStatus } from "./types";

interface Props { trades: Trade[] | undefined; engine: EngineStatus | undefined }

function StatBox({
  label, value, sub, color = "#4a8fa8",
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      className="rounded text-center"
      style={{ background: "#050505", border: "1px solid #181818", padding: "14px 12px" }}
    >
      <div
        className="font-bold font-mono leading-none mb-1.5 tabular-nums"
        style={{ fontSize: 20, color, textShadow: `0 0 10px ${color}35` }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[9px] font-mono mt-1 tracking-[0.1em]" style={{ color: "#1a2a35" }}>{sub}</div>
      )}
      <div
        className="font-mono uppercase mt-1"
        style={{ fontSize: 9, letterSpacing: "0.15em", color: "#1a2a35" }}
      >
        {label}
      </div>
    </div>
  );
}

export function MiddleStatsGrid({ trades, engine }: Props) {
  const all     = trades ?? [];
  const open    = all.filter((t) => t.status === "open");
  const closed  = all.filter((t) => t.status === "closed");
  const wins    = closed.filter((t) => (t.pnl ?? 0) > 0);
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
    riskLevel === "CRITICAL" ? "#ff3355" :
    riskLevel === "HIGH"     ? "#ff8800" :
    riskLevel === "MEDIUM"   ? "#ffb800" : "#00ff8a";

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#000000", border: "1px solid #1c1c1c" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderBottomColor: "#141414", background: "#000000" }}
      >
        <div className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00eeff" }}>
          PORTFOLIO SNAPSHOT
        </span>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <StatBox
            label="WIN RATE"
            value={`${winRate.toFixed(0)}%`}
            sub={`${wins.length}W / ${closed.length - wins.length}L`}
            color={winRate >= 50 ? "#00ff8a" : "#ff3355"}
          />
          <StatBox
            label="TOTAL P&L"
            value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(0)}`}
            sub={`${closed.length} closed`}
            color={totalPnl >= 0 ? "#00ff8a" : "#ff3355"}
          />
          <StatBox
            label="EXPOSURE"
            value={`$${exposure.toFixed(0)}`}
            sub={`${open.length} pos`}
            color={exposure > 0 ? "#ffb800" : "#1a2a35"}
          />
          <StatBox
            label="ACTIVE"
            value={`${open.length}`}
            sub="open trades"
            color={open.length > 0 ? "#00eeff" : "#1a2a35"}
          />
          <StatBox
            label="EXECUTED"
            value={`${execCount}`}
            sub="this session"
            color={execCount > 0 ? "#ffb800" : "#1a2a35"}
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
