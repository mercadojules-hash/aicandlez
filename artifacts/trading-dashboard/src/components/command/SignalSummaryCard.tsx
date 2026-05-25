import type { EngineStatus } from "./types";
import { ago } from "./helpers";

interface Props { engine: EngineStatus | undefined }

export function SignalSummaryCard({ engine }: Props) {
  const counts = engine?.signalCounts ?? { BUY: 0, SELL: 0, HOLD: 0 };
  const funnel  = engine?.funnel ?? { total: 0, passedMTF: 0, blockedMTF: 0, executed: 0 };
  const total   = counts.BUY + counts.SELL + counts.HOLD || 1;

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <div className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">SIGNAL SUMMARY</span>
        <span className="ml-auto text-[8px] text-[#0E2235] font-mono">{ago(engine?.lastTickAt ?? null)}</span>
      </div>

      <div className="p-3">
        <div className="space-y-1.5 mb-3">
          {[
            { label: "BUY",  count: counts.BUY,  color: "#00ff88" },
            { label: "SELL", count: counts.SELL, color: "#ff3366" },
            { label: "HOLD", count: counts.HOLD, color: "#2e5c75" },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-8 text-[8px] font-bold font-mono text-right" style={{ color }}>{label}</div>
              <div className="flex-1 h-2 bg-[#050e1a] rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${(count / total) * 100}%`,
                    background: color,
                    opacity: 0.7,
                    boxShadow: `0 0 4px ${color}50`,
                  }}
                />
              </div>
              <div className="w-5 text-[8px] font-mono text-[#1e4060] text-right">{count}</div>
            </div>
          ))}
        </div>

        <div className="neon-divider mb-2" />
        <div className="grid grid-cols-2 gap-2 text-center text-[8px] font-mono mb-3">
          <div>
            <div className="text-[14px] font-bold text-[#00eeff]" style={{ textShadow: "0 0 8px #00eeff60" }}>
              {funnel.passedMTF}
            </div>
            <div className="text-[#0E2235] uppercase tracking-widest">MTF PASSED</div>
          </div>
          <div>
            <div className="text-[14px] font-bold text-[#00ff88]" style={{ textShadow: "0 0 8px #00ff8860" }}>
              {funnel.executed}
            </div>
            <div className="text-[#0E2235] uppercase tracking-widest">EXECUTED</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="px-2 py-0.5 rounded text-[8px] font-bold font-mono tracking-wide"
            style={engine?.running
              ? { background: "#00ff8810", color: "#00ff88", border: "1px solid #00ff8830" }
              : { background: "#ffffff06", color: "#1e4060", border: "1px solid #ffffff10" }
            }
          >
            {engine?.running ? "● LOOP RUNNING" : "○ STOPPED"}
          </span>
          {engine?.testMode && (
            <span className="px-2 py-0.5 rounded text-[8px] font-bold font-mono tracking-wide"
              style={{ background: "#ffb80010", color: "#ffb800", border: "1px solid #ffb80030" }}>
              TEST MODE
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
