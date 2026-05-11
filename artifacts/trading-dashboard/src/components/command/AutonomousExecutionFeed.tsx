import { Bot } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

export function AutonomousExecutionFeed({ engine }: Props) {
  const log = (engine?.recentSignalLog ?? [])
    .filter((s) => s.executedAs !== null)
    .slice(0, 10);

  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
        <Bot className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Autonomous Execution Feed</h3>
        <span className="ml-auto text-[10px] text-muted-foreground/40">last {log.length} executions</span>
      </div>

      {log.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground/30 text-xs">
          No autonomous executions yet this session
        </div>
      ) : (
        <div className="divide-y divide-border/15">
          {log.map((s) => {
            const color = SYMBOL_COLOR[s.symbol] ?? "#888";
            const lbl   = s.symbol.replace("USD", "");
            const ts    = new Date(s.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ backgroundColor: color + "25", color }}
                >
                  {lbl}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold ${
                      s.executedAs === "BUY" ? "text-emerald-400" : "text-red-400"
                    }`}>{s.executedAs}</span>
                    <span className="text-[9px] text-muted-foreground/50 truncate">{s.shortSummary}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground/30 font-mono">{ts}</div>
                </div>
                <span className="text-[9px] font-mono text-muted-foreground/40">{s.confidence.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
