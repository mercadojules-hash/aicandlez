import { Shield } from "lucide-react";
import type { EngineStatus, AppSettings } from "./types";

interface Props { engine: EngineStatus | undefined; settings: AppSettings | undefined }

export function RiskCard({ engine, settings }: Props) {
  const maxTrades = settings?.maxTradesPerDay ?? 5;
  const usedToday = engine?.tradesExecuted ?? 0;
  const remaining = Math.max(0, maxTrades - usedToday);
  const autoMode  = settings?.autoMode ?? false;
  const minConf   = settings?.minConfidence ?? 60;
  const riskPct   = maxTrades > 0 ? remaining / maxTrades : 1;

  const barColor  =
    riskPct > 0.5 ? "#00ff88" :
    riskPct > 0.2 ? "#ffb800" : "#ff3366";

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomColor: "#141414" }}>
        <Shield className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.18em] font-mono" style={{ color: "#00eeff" }}>
          RISK STATUS
        </span>
        <span
          className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded font-mono"
          style={autoMode
            ? { background: "#00ff8810", color: "#00ff88", border: "1px solid #00ff8828" }
            : { background: "#ffffff05", color: "#1e4060", border: "1px solid #ffffff08" }
          }
        >
          {autoMode ? "AUTO ON" : "MANUAL"}
        </span>
      </div>

      <div className="p-3">
        <div className="mb-4">
          <div className="flex justify-between text-[9px] font-mono mb-1.5">
            <span style={{ color: "#1e4060" }}>TRADES REMAINING TODAY</span>
            <span className="font-bold tabular-nums" style={{ color: barColor }}>
              {remaining} / {maxTrades}
            </span>
          </div>
          <div className="rounded overflow-hidden" style={{ height: 6, background: "#0a0a0a" }}>
            <div
              className="h-full rounded transition-all"
              style={{ width: `${riskPct * 100}%`, background: barColor, boxShadow: `0 0 4px ${barColor}50` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
          {[
            { v: `${settings?.allocation ?? 20}%`,      l: "POSITION SIZE",   c: "#4a8fa8" },
            { v: `${minConf}%`,                         l: "MIN CONFIDENCE",  c: "#00eeff" },
            { v: `${settings?.stopLossPercent ?? 2}%`,  l: "STOP LOSS",       c: "#ff3366" },
            { v: `${engine?.tradesExecuted ?? 0}`,       l: "TOTAL EXECUTED",  c: "#00ff88" },
          ].map(({ v, l, c }) => (
            <div key={l} className="rounded p-2.5 text-center" style={{ background: "#050505", border: "1px solid #181818" }}>
              <div className="text-[16px] font-bold mb-0.5 tabular-nums" style={{ color: c, textShadow: `0 0 5px ${c}40` }}>
                {v}
              </div>
              <div className="text-[7px] uppercase tracking-widest" style={{ color: "#1a2a35" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
