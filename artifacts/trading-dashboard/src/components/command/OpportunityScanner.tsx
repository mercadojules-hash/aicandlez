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
    <div className="rounded-lg overflow-hidden" style={{ background: "#080808", border: "1px solid #181818" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomColor: "#181818", background: "#050505" }}>
        <div className="flex-1">
          <div className="text-[10px] font-bold tracking-[0.2em] font-mono" style={{ color: "#00aaff" }}>
            AI OPPORTUNITY SCANNER
          </div>
          <div className="text-[8px] font-mono text-[#2a4050] tracking-[0.1em] mt-0.5">
            AUTONOMOUS MARKET INTELLIGENCE
          </div>
        </div>
        <span className="flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
          <span className="text-[8px] font-mono" style={{ color: "#00ff8a" }}>LIVE</span>
        </span>
      </div>

      <div className="p-3">
        {!top ? (
          <div className="text-center py-6 text-[11px] font-mono text-[#1e3040] animate-pulse">
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
                <div className="rounded-lg p-3 mb-3 border" style={{ background: `${color}08`, borderColor: `${color}18` }}>
                  <div className="text-[9px] font-mono text-[#2a4050] tracking-[0.12em] mb-1.5">
                    HIGHEST AI CONFIDENCE
                  </div>
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="text-[26px] font-bold font-mono leading-none"
                      style={{ color }}
                    >
                      {lbl}
                    </div>
                    <div className="text-right">
                      <div
                        className="text-[28px] font-bold font-mono leading-none tabular-nums"
                        style={{ color }}
                      >
                        {top.avgConfidence.toFixed(0)}%
                      </div>
                      <div className="text-[8px] font-mono text-[#2a4050] tracking-[0.1em]">CONFIDENCE</div>
                    </div>
                  </div>

                  {/* Bars */}
                  <div className="space-y-2">
                    {[
                      { label: "AI CONVICTION",      val: aiConv,    col: color },
                      { label: "EXECUTION READINESS", val: execReady, col: decCol },
                    ].map(({ label, val, col }) => (
                      <div key={label}>
                        <div className="flex justify-between text-[8px] font-mono mb-1">
                          <span className="text-[#2a4050]">{label}</span>
                          <span style={{ color: col }}>{val.toFixed(0)}%</span>
                        </div>
                        <div className="rounded-sm overflow-hidden" style={{ height: 5, background: "#111111" }}>
                          <div
                            className="h-full rounded-sm"
                            style={{ width: `${Math.min(100, val)}%`, background: col, opacity: 0.7, transition: "width 0.3s" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Ranked list */}
            <div className="space-y-0">
              {ranked.map((b, i) => {
                const color  = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
                const lbl    = b.symbol.replace("USD", "");
                const isBuy  = b.agreedAction === "BUY";
                const isSell = b.agreedAction === "SELL";
                const decCol = isBuy ? "#ffaa00" : isSell ? "#ff3355" : "#ff4455";
                return (
                  <div
                    key={b.symbol}
                    className="flex items-center gap-2.5 py-2 border-b"
                    style={{ borderBottomColor: "#111111" }}
                  >
                    <span className="text-[9px] font-mono text-[#2a4050] w-5 shrink-0 text-right">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold font-mono" style={{ color }}>{lbl}</div>
                      <div className="text-[8px] font-mono text-[#2a4050]">AI MONITORED</div>
                    </div>
                    <span className="text-[11px] font-bold font-mono" style={{ color: decCol }}>
                      {b.agreedAction}
                    </span>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: decCol, boxShadow: `0 0 5px ${decCol}80` }}
                    />
                    <span className="text-[12px] font-bold font-mono tabular-nums w-9 text-right shrink-0" style={{ color: "#7a9cb0" }}>
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
