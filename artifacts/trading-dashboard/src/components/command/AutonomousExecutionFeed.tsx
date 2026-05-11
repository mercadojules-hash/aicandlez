import { Bot } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

export function AutonomousExecutionFeed({ engine }: Props) {
  const log = (engine?.recentSignalLog ?? [])
    .filter((s) => s.executedAs !== null)
    .slice(0, 10);

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <Bot className="w-3.5 h-3.5 text-[#00eeff]" />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">AUTONOMOUS EXECUTION FEED</span>
        <span className="ml-auto flex items-center gap-1.5 text-[8px] text-[#0E2235] font-mono">
          {engine?.running && <span className="live-dot" style={{ width: 4, height: 4 }} />}
          {log.length} EXECUTIONS
        </span>
      </div>

      {log.length === 0 ? (
        <div className="py-6 text-center text-[9px] text-[#0E2235] font-mono">
          NO AUTONOMOUS EXECUTIONS YET THIS SESSION
        </div>
      ) : (
        <div>
          {log.map((s) => {
            const color = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
            const sym   = s.symbol.replace("USD", "");
            const ts    = new Date(s.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
            });
            const isBuy = s.executedAs === "BUY";
            return (
              <div
                key={s.id}
                className="flex items-center gap-2.5 px-3 py-2 border-b border-[#0A1820] hover:bg-[#010C18] transition-colors"
              >
                <div
                  className="w-6 h-6 rounded text-[8px] font-bold flex items-center justify-center shrink-0"
                  style={{ background: color + "18", color, boxShadow: `0 0 6px ${color}40` }}
                >
                  {sym.slice(0, 4)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-bold font-mono"
                      style={{ color: isBuy ? "#00ff88" : "#ff3366" }}
                    >
                      {s.executedAs}
                    </span>
                    <span className="text-[8px] text-[#1e4060] truncate font-mono">{s.shortSummary}</span>
                  </div>
                  <div className="text-[7px] text-[#0E2235] font-mono">{ts}</div>
                </div>
                <span className="text-[8px] font-mono" style={{ color: "#00eeff60" }}>
                  {s.confidence.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
