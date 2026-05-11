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
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <Shield className="w-3.5 h-3.5 text-[#00eeff]" />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">RISK STATUS</span>
        <span
          className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded font-mono"
          style={autoMode
            ? { background: "#00ff8810", color: "#00ff88", border: "1px solid #00ff8830" }
            : { background: "#ffffff06", color: "#1e4060", border: "1px solid #ffffff10" }
          }
        >
          {autoMode ? "AUTO ON" : "MANUAL"}
        </span>
      </div>

      <div className="p-3">
        <div className="mb-3">
          <div className="flex justify-between text-[8px] font-mono mb-1">
            <span className="text-[#1e4060]">TRADES REMAINING TODAY</span>
            <span style={{ color: barColor }}>{remaining} / {maxTrades}</span>
          </div>
          <div className="h-1.5 bg-[#050e1a] rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{ width: `${riskPct * 100}%`, background: barColor, boxShadow: `0 0 8px ${barColor}60` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[8px] font-mono">
          {[
            { v: `${settings?.allocation ?? 20}%`,       l: "POSITION SIZE",    c: "#4a8fa8" },
            { v: `${minConf}%`,                          l: "MIN CONFIDENCE",   c: "#00eeff" },
            { v: `${settings?.stopLossPercent ?? 2}%`,   l: "STOP LOSS",        c: "#ff3366" },
            { v: `${engine?.tradesExecuted ?? 0}`,        l: "TOTAL EXECUTED",   c: "#00ff88" },
          ].map(({ v, l, c }) => (
            <div key={l} className="bg-[#050e1a] rounded p-2 text-center border border-[#0A1E30]">
              <div className="text-[12px] font-bold mb-0.5" style={{ color: c, textShadow: `0 0 8px ${c}50` }}>{v}</div>
              <div className="text-[7px] text-[#0E2235] uppercase tracking-widest">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
