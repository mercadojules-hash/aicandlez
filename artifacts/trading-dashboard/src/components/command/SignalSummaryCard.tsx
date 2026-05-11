import { Activity } from "lucide-react";
import type { EngineStatus } from "./types";
import { ago } from "./helpers";

interface Props { engine: EngineStatus | undefined }

export function SignalSummaryCard({ engine }: Props) {
  const counts = engine?.signalCounts ?? { BUY: 0, SELL: 0, HOLD: 0 };
  const funnel  = engine?.funnel ?? { total: 0, passedMTF: 0, blockedMTF: 0, executed: 0 };
  const total   = counts.BUY + counts.SELL + counts.HOLD || 1;

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Signal Summary</h3>
        <span className="ml-auto text-[10px] text-muted-foreground/50">{ago(engine?.lastTickAt ?? null)}</span>
      </div>

      <div className="space-y-2 mb-3">
        {[
          { label: "BUY",  count: counts.BUY,  color: "#22c55e" },
          { label: "SELL", count: counts.SELL, color: "#ef4444" },
          { label: "HOLD", count: counts.HOLD, color: "#6b7280" },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-10 text-[10px] font-bold text-muted-foreground/60 text-right">{label}</div>
            <div className="flex-1 h-3 bg-muted/15 rounded overflow-hidden">
              <div className="h-full rounded transition-all" style={{ width: `${(count / total) * 100}%`, backgroundColor: color + "80" }} />
            </div>
            <div className="w-6 text-[10px] font-mono text-muted-foreground/50 text-right">{count}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-border/20 pt-3 grid grid-cols-2 gap-2 text-center">
        <div>
          <div className="text-base font-bold font-mono text-sky-400">{funnel.passedMTF}</div>
          <div className="text-[9px] text-muted-foreground/50">MTF passed</div>
        </div>
        <div>
          <div className="text-base font-bold font-mono text-emerald-400">{funnel.executed}</div>
          <div className="text-[9px] text-muted-foreground/50">Executed</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
          engine?.running
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : "bg-muted/20 text-muted-foreground/50 border-border/30"
        }`}>{engine?.running ? "● LOOP RUNNING" : "○ STOPPED"}</span>
        {engine?.testMode && (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold border bg-amber-500/15 text-amber-400 border-amber-500/30">TEST MODE</span>
        )}
      </div>
    </div>
  );
}
