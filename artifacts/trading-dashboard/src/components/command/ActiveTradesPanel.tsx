import { Zap } from "lucide-react";
import type { Trade } from "./types";
import { SYMBOL_COLOR } from "./types";
import { fmtPrice } from "./helpers";

interface Props { trades: Trade[] | undefined }

export function ActiveTradesPanel({ trades }: Props) {
  const active = (trades ?? []).filter((t) => t.status === "open").slice(0, 8);
  const recent = (trades ?? []).filter((t) => t.status !== "open").slice(0, 4);

  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Active Trades</h3>
        <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
          active.length > 0
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            : "bg-muted/20 text-muted-foreground/50 border-border/20"
        }`}>{active.length}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/40">
          {recent.length} closed recently
        </span>
      </div>

      {active.length === 0 && recent.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground/30 text-xs">No trades in this session</div>
      ) : (
        <div className="divide-y divide-border/15">
          {[...active, ...recent].slice(0, 8).map((t) => {
            const sym   = t.symbol.replace("USD", "");
            const color = SYMBOL_COLOR[t.symbol] ?? "#888";
            const pnl   = t.pnl ?? 0;
            const open  = t.status === "open";
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/5 transition-colors">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ backgroundColor: color + "25", color }}
                >
                  {sym}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold ${t.side === "BUY" || t.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                      {t.side.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">
                      ${fmtPrice(t.price)}
                    </span>
                    {!open && <span className="text-[9px] text-muted-foreground/30 ml-auto">closed</span>}
                  </div>
                  <div className="text-[9px] text-muted-foreground/40 font-mono">
                    {new Date(t.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {!open && t.pnl != null && (
                  <div className={`text-xs font-bold font-mono ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                    {t.pnlPercent != null && (
                      <span className="text-[9px] block text-center opacity-70">
                        {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
                {open && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-sky-500/15 text-sky-400 border-sky-500/30">
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
