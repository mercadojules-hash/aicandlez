import { Shield } from "lucide-react";
import type { EngineStatus, AppSettings } from "./types";

interface Props {
  engine:   EngineStatus | undefined;
  settings: AppSettings  | undefined;
}

export function RiskCard({ engine, settings }: Props) {
  const maxTrades = settings?.maxTradesPerDay ?? 5;
  const usedToday = engine?.tradesExecuted ?? 0;
  const remaining = Math.max(0, maxTrades - usedToday);
  const autoMode  = settings?.autoMode ?? false;
  const minConf   = settings?.minConfidence ?? 80;
  const riskPct   = maxTrades > 0 ? remaining / maxTrades : 1;

  const riskColor = riskPct > 0.5 ? "text-emerald-400" : riskPct > 0.2 ? "text-amber-400" : "text-red-400";
  const barColor  = riskPct > 0.5 ? "#22c55e"           : riskPct > 0.2 ? "#f59e0b"           : "#ef4444";

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Risk Status</h3>
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded border ${
          autoMode
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : "bg-muted/20 text-muted-foreground/60 border-border/30"
        }`}>{autoMode ? "AUTO ON" : "MANUAL"}</span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-muted-foreground/60">Trades remaining today</span>
          <span className={`font-bold font-mono ${riskColor}`}>{remaining} / {maxTrades}</span>
        </div>
        <div className="h-2 bg-muted/20 rounded overflow-hidden">
          <div className="h-full rounded transition-all" style={{ width: `${riskPct * 100}%`, backgroundColor: barColor }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        {[
          { value: `${settings?.allocation ?? 20}%`, label: "Position size", color: "" },
          { value: `${minConf}%`,                    label: "Min confidence", color: "" },
          { value: `${settings?.stopLossPercent ?? 2}%`,   label: "Stop loss",    color: "text-red-400" },
          { value: `${engine?.tradesExecuted ?? 0}`,        label: "Total executed", color: "text-emerald-400" },
        ].map(({ value, label, color }) => (
          <div key={label} className="bg-muted/10 rounded-lg p-2">
            <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
            <div className="text-[9px] text-muted-foreground/50">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
