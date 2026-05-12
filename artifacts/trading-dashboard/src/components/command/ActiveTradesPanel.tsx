import { Zap } from "lucide-react";
import type { Trade } from "./types";
import { SYMBOL_COLOR } from "./types";
import { fmtPrice } from "./helpers";

interface Props { trades: Trade[] | undefined }

export function ActiveTradesPanel({ trades }: Props) {
  const all    = trades ?? [];
  const active = all.filter((t) => t.status === "open");
  const recent = all.filter((t) => t.status !== "open");
  const rows   = [...active, ...recent].slice(0, 60);

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: "#000000", border: "1px solid #1c1c1c", minHeight: 520 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b shrink-0"
        style={{ borderBottomColor: "#141414", background: "#000000" }}
      >
        <Zap className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00eeff" }}>
          ACTIVE TRADES
        </span>
        <span
          className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded font-mono"
          style={active.length > 0
            ? { background: "#00ff8a0d", color: "#00ff8a", border: "1px solid #00ff8a28" }
            : { background: "#000000",   color: "#1a2a35", border: "1px solid #181818"  }
          }
        >
          {active.length}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {active.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
              <span className="text-[9px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE BLOTTER</span>
            </span>
          )}
          <span className="text-[9px] font-mono" style={{ color: "#1a2a35" }}>
            {recent.length} closed
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[11px] font-mono" style={{ color: "#0e1a22" }}>
            NO TRADES IN THIS SESSION
          </span>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Scrollable blotter — fills all remaining height */}
          <div
            className="blotter-scroll flex-1"
            style={{
              overflowY:  "scroll",
              minHeight:  0,
              maxHeight:  680,
            }}
          >
            {rows.map((t, idx) => {
              const sym      = t.symbol.replace("USD", "");
              const color    = SYMBOL_COLOR[t.symbol] ?? "#4a8fa8";
              const pnl      = t.pnl ?? 0;
              const isOpen   = t.status === "open";
              const sideUp   = t.side === "BUY" || t.side === "buy";
              const sideColor = sideUp ? "#00ff8a" : "#ff3355";
              const ts       = new Date(t.timestamp).toLocaleTimeString("en-US", {
                hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
              });

              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{
                    borderBottom:  "1px solid #0a0a0a",
                    background:    isOpen ? "#020202" : "#000000",
                    borderLeft:    `2.5px solid ${isOpen ? color + "55" : "#141414"}`,
                  }}
                >
                  {/* Row index */}
                  <span className="text-[8px] font-mono w-5 shrink-0 text-right tabular-nums"
                    style={{ color: "#1a2a35" }}>
                    {idx + 1}
                  </span>

                  {/* Symbol badge */}
                  <div
                    className="w-9 h-9 rounded text-[9px] font-bold flex items-center justify-center shrink-0"
                    style={{ background: "#000000", color, border: `1px solid ${color}22` }}
                  >
                    {sym.slice(0, 4)}
                  </div>

                  {/* Middle */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[12px] font-bold font-mono" style={{ color: sideColor }}>
                        {t.side.toUpperCase()}
                      </span>
                      <span className="text-[11px] font-mono font-bold" style={{ color: "#4a7a90" }}>
                        ${fmtPrice(t.price)}
                      </span>
                      {t.amount != null && (
                        <span className="text-[9px] font-mono" style={{ color: "#1a2a35" }}>
                          {t.amount.toFixed(4)} {sym}
                        </span>
                      )}
                    </div>
                    <div className="text-[8px] font-mono" style={{ color: "#1a2a35" }}>
                      {ts} · {sym}/USD
                    </div>
                  </div>

                  {/* PnL / OPEN badge */}
                  {!isOpen && t.pnl != null ? (
                    <div className="text-right shrink-0">
                      <div
                        className="text-[13px] font-bold font-mono tabular-nums"
                        style={{ color: pnl >= 0 ? "#00ff8a" : "#ff3355" }}
                      >
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                      </div>
                      {t.pnlPercent != null && (
                        <div className="text-[8px] font-mono tabular-nums"
                          style={{ color: t.pnlPercent >= 0 ? "#00ff8a70" : "#ff335570" }}>
                          {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  ) : isOpen ? (
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded font-mono tracking-[0.1em] shrink-0"
                      style={{ background: "#00eeff0a", color: "#00eeff", border: "1px solid #00eeff1e" }}
                    >
                      OPEN
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono shrink-0" style={{ color: "#1a2a35" }}>CLOSED</span>
                  )}
                </div>
              );
            })}

            {/* Terminal footer */}
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ background: "#000000", borderTop: "1px solid #0a0a0a" }}
            >
              <span className="text-[9px] font-mono" style={{ color: "#1a2a35" }}>$</span>
              <span className="text-[9px] font-mono" style={{ color: "#1a2a35" }}>
                {active.length} OPEN · {recent.length} CLOSED THIS SESSION
              </span>
              <span className="cursor-blink ml-1" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
