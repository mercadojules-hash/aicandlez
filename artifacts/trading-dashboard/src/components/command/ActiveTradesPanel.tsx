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
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomColor: "#141414" }}>
        <Zap className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.18em] font-mono" style={{ color: "#00eeff" }}>
          ACTIVE TRADES
        </span>
        <span
          className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono"
          style={active.length > 0
            ? { background: "#00ff8810", color: "#00ff88", border: "1px solid #00ff8828" }
            : { background: "#ffffff04", color: "#0E2235", border: "1px solid #ffffff06" }
          }
        >
          {active.length}
        </span>
        <span className="ml-auto text-[9px] font-mono" style={{ color: "#1a2a35" }}>
          {recent.length} closed recently
        </span>
      </div>

      {active.length === 0 && recent.length === 0 ? (
        <div className="py-8 text-center text-[10px] font-mono" style={{ color: "#0E2235" }}>
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
                className="flex items-center gap-3 px-3 py-2.5 border-b transition-colors"
                style={{ borderBottomColor: "#0d0d0d" }}
              >
                <div
                  className="w-8 h-8 rounded text-[9px] font-bold flex items-center justify-center shrink-0"
                  style={{ background: color + "14", color, border: `1px solid ${color}22` }}
                >
                  {sym.slice(0, 4)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-bold font-mono"
                      style={{ color: sideUp ? "#00ff88" : "#ff3366" }}
                    >
                      {t.side.toUpperCase()}
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: "#1e4060" }}>
                      ${fmtPrice(t.price)}
                    </span>
                    {!open && (
                      <span className="text-[8px] font-mono ml-auto" style={{ color: "#0E2235" }}>CLOSED</span>
                    )}
                  </div>
                  <div className="text-[8px] font-mono" style={{ color: "#0E2235" }}>
                    {new Date(t.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    {" · "}{sym}
                  </div>
                </div>
                {!open && t.pnl != null && (
                  <div
                    className="text-[12px] font-bold font-mono tabular-nums text-right"
                    style={{
                      color: pnl >= 0 ? "#00ff88" : "#ff3366",
                      textShadow: pnl >= 0 ? "0 0 8px #00ff8855" : "0 0 8px #ff336655",
                    }}
                  >
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                    {t.pnlPercent != null && (
                      <span className="text-[8px] block text-center" style={{ opacity: 0.7 }}>
                        {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
                {open && (
                  <span
                    className="text-[8px] font-bold px-2 py-0.5 rounded font-mono tracking-wide"
                    style={{ background: "#00eeff0a", color: "#00eeff", border: "1px solid #00eeff20" }}
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
