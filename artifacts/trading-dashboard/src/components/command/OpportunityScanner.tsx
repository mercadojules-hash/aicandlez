import { useEffect, useState } from "react";
import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[] }

export function OpportunityScanner({ breakdowns }: Props) {
  const ranked = [...breakdowns].sort((a, b) => b.avgConfidence - a.avgConfidence);
  const top    = ranked[0];

  const [execReady, setExecReady] = useState(0);
  const [aiConv,    setAiConv]    = useState(0);

  useEffect(() => {
    if (!top) return;
    const confTarget = top.avgConfidence;
    const execTarget = top.mtfConfirmed && top.volumeConfirmed
      ? Math.min(92, top.avgConfidence * 1.08)
      : Math.min(55, top.avgConfidence * 0.65);

    const id = setInterval(() => {
      setAiConv((p) => {
        const d = confTarget - p; return Math.abs(d) < 0.3 ? confTarget : p + d * 0.12;
      });
      setExecReady((p) => {
        const d = execTarget - p; return Math.abs(d) < 0.3 ? execTarget : p + d * 0.12;
      });
    }, 80);
    return () => clearInterval(id);
  }, [top?.symbol, top?.avgConfidence, top?.mtfConfirmed, top?.volumeConfirmed]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#000000", border: "1px solid #1c1c1c" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderBottomColor: "#141414", background: "#000000" }}>
        <div className="flex-1">
          <div className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
            AI OPPORTUNITY SCANNER
          </div>
          <div className="text-[8px] font-mono tracking-[0.12em] mt-0.5" style={{ color: "#1a2a35" }}>
            AUTONOMOUS MARKET INTELLIGENCE
          </div>
        </div>
        <span className="flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
          <span className="text-[9px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
        </span>
      </div>

      <div className="p-4">
        {!top ? (
          <div className="text-center py-8 text-[11px] font-mono animate-pulse" style={{ color: "#1a2a35" }}>
            SCANNING MARKETS…
          </div>
        ) : (
          <>
            {/* Top highlighted asset */}
            {(() => {
              const color  = SYMBOL_COLOR[top.symbol] ?? "#4a8fa8";
              const lbl    = top.symbol.replace("USD", "");
              const isBuy  = top.agreedAction === "BUY";
              const isSell = top.agreedAction === "SELL";
              const decCol = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#445566";
              return (
                <div
                  className="rounded-lg p-4 mb-4"
                  style={{ background: "#050505", border: `1px solid ${color}18` }}
                >
                  <div className="text-[8px] font-mono tracking-[0.14em] mb-2" style={{ color: "#1a2a35" }}>
                    HIGHEST AI CONFIDENCE
                  </div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-[32px] font-bold font-mono leading-none" style={{ color }}>
                      {lbl}
                    </div>
                    <div className="text-right">
                      <div
                        className="text-[36px] font-bold font-mono leading-none tabular-nums"
                        style={{ color }}
                      >
                        {top.avgConfidence.toFixed(0)}%
                      </div>
                      <div className="text-[8px] font-mono tracking-[0.12em] mt-0.5" style={{ color: "#1a2a35" }}>
                        CONFIDENCE
                      </div>
                    </div>
                  </div>

                  {/* Bars */}
                  <div className="space-y-2.5">
                    {[
                      { label: "AI CONVICTION",       val: aiConv,    col: color  },
                      { label: "EXECUTION READINESS", val: execReady, col: decCol },
                    ].map(({ label, val, col }) => (
                      <div key={label}>
                        <div className="flex justify-between text-[9px] font-mono mb-1.5">
                          <span style={{ color: "#1a2a35" }}>{label}</span>
                          <span className="font-bold tabular-nums" style={{ color: col }}>{val.toFixed(0)}%</span>
                        </div>
                        <div className="rounded-sm overflow-hidden" style={{ height: 5, background: "#0a0a0a" }}>
                          <div
                            className="h-full rounded-sm"
                            style={{ width: `${Math.min(100, val)}%`, background: col, opacity: 0.75, transition: "width 0.3s" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Ranked list */}
            <div>
              {ranked.map((b, i) => {
                const color  = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
                const lbl    = b.symbol.replace("USD", "");
                const isBuy  = b.agreedAction === "BUY";
                const isSell = b.agreedAction === "SELL";
                const decCol = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#ff4455";
                return (
                  <div
                    key={b.symbol}
                    className="flex items-center gap-3 py-2.5 border-b"
                    style={{ borderBottomColor: "#0a0a0a" }}
                  >
                    <span className="text-[9px] font-mono w-5 shrink-0 text-right" style={{ color: "#1a2a35" }}>
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold font-mono" style={{ color }}>{lbl}</div>
                      <div className="text-[8px] font-mono" style={{ color: "#1a2a35" }}>AI MONITORED</div>
                    </div>
                    <span className="text-[11px] font-bold font-mono" style={{ color: decCol }}>
                      {b.agreedAction}
                    </span>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: decCol, boxShadow: `0 0 4px ${decCol}60` }}
                    />
                    <span className="text-[13px] font-bold font-mono tabular-nums w-10 text-right shrink-0"
                      style={{ color: "#7a9cb0" }}>
                      {b.avgConfidence.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
