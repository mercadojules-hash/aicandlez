import { TrendingUp, TrendingDown, BarChart2, AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import type { Trade, EngineStatus } from "./types";

interface Props {
  trades:  Trade[]       | undefined;
  engine:  EngineStatus  | undefined;
}

function StatBox({ label, value, sub, color = "" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-muted/10 rounded-lg p-3 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground/40">{sub}</div>}
      <div className="text-[9px] text-muted-foreground/50 mt-0.5">{label}</div>
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
  const exposure  = open.reduce((s, t) => s + (t.amount ?? 0), 0);

  const execCount = engine?.tradesExecuted ?? 0;
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" =
    execCount === 0  ? "LOW"      :
    execCount > 10   ? "CRITICAL" :
    execCount > 6    ? "HIGH"     :
    execCount > 3    ? "MEDIUM"   : "LOW";

  const riskColor =
    riskLevel === "CRITICAL" ? "text-red-400" :
    riskLevel === "HIGH"     ? "text-orange-400" :
    riskLevel === "MEDIUM"   ? "text-amber-400" :
    "text-emerald-400";

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Portfolio Snapshot</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatBox
          label="Win rate"
          value={`${winRate.toFixed(0)}%`}
          sub={`${wins.length}W / ${closed.length - wins.length}L`}
          color={winRate >= 50 ? "text-emerald-400" : "text-red-400"}
        />
        <StatBox
          label="Total P&L"
          value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`}
          sub={`${closed.length} closed`}
          color={totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatBox
          label="Open exposure"
          value={`$${exposure.toFixed(0)}`}
          sub={`${open.length} positions`}
        />
        <StatBox
          label="Active"
          value={`${open.length}`}
          sub="open trades"
          color={open.length > 0 ? "text-sky-400" : ""}
        />
        <StatBox
          label="Executed"
          value={`${engine?.tradesExecuted ?? 0}`}
          sub="this session"
          color={engine?.tradesExecuted ? "text-amber-400" : ""}
        />
        <StatBox
          label="Threat level"
          value={riskLevel}
          color={riskColor}
        />
      </div>
    </div>
  );
}
