import { Zap } from "lucide-react";
import type { Trade } from "./types";
import { SYMBOL_COLOR } from "./types";
import { fmtPrice } from "./helpers";

interface Props { trades: Trade[] | undefined }

export function ActiveTradesPanel({ trades }: Props) {
  const active = (trades ?? []).filter((t) => t.status === "open").slice(0, 8);
  const recent = (trades ?? []).filter((t) => t.status !== "open").slice(0, 4);

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <Zap className="w-3.5 h-3.5 text-[#00eeff]" />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">ACTIVE TRADES</span>
        <span
          className="ml-1 text-[8px] font-bold px-1.5 py-0.5 rounded font-mono"
          style={active.length > 0
            ? { background: "#00ff8810", color: "#00ff88", border: "1px solid #00ff8830" }
            : { background: "#ffffff06", color: "#0E2235", border: "1px solid #ffffff08" }
          }
        >
          {active.length}
        </span>
        <span className="ml-auto text-[8px] text-[#0E2235] font-mono">
          {recent.length} closed recently
        </span>
      </div>

      {active.length === 0 && recent.length === 0 ? (
        <div className="py-6 text-center text-[9px] text-[#0E2235] font-mono">
          NO TRADES IN THIS SESSION
        </div>
      ) : (
        <div>
          {[...active, ...recent].slice(0, 8).map((t) => {
            const sym   = t.symbol.replace("USD", "");
            const color = SYMBOL_COLOR[t.symbol] ?? "#4a8fa8";
            const pnl   = t.pnl ?? 0;
            const open  = t.status === "open";
            const sideUp = t.side === "BUY" || t.side === "buy";

            return (
              <div
                key={t.id}
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
                      style={{ color: sideUp ? "#00ff88" : "#ff3366" }}
                    >
                      {t.side.toUpperCase()}
                    </span>
                    <span className="text-[9px] text-[#1e4060] font-mono">${fmtPrice(t.price)}</span>
                    {!open && <span className="text-[7px] text-[#0E2235] font-mono ml-auto">CLOSED</span>}
                  </div>
                  <div className="text-[7px] text-[#0E2235] font-mono">
                    {new Date(t.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {!open && t.pnl != null && (
                  <div
                    className="text-[10px] font-bold font-mono"
                    style={{
                      color: pnl >= 0 ? "#00ff88" : "#ff3366",
                      textShadow: pnl >= 0 ? "0 0 8px #00ff8860" : "0 0 8px #ff336660",
                    }}
                  >
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                    {t.pnlPercent != null && (
                      <span className="text-[7px] block text-center opacity-70">
                        {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
                {open && (
                  <span
                    className="text-[7px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide"
                    style={{ background: "#00eeff10", color: "#00eeff", border: "1px solid #00eeff25" }}
                  >
                    OPEN
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
