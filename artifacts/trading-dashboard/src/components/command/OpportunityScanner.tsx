import { useEffect, useState } from "react";
import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[] }

export function OpportunityScanner({ breakdowns }: Props) {
  const ranked = [...breakdowns].sort((a, b) => b.avgConfidence - a.avgConfidence);
  const top    = ranked[0];

  const [execReady, setExecReady] = useState(0);
  useEffect(() => {
    if (!top) return;
    const target = top.mtfConfirmed && top.volumeConfirmed
      ? Math.min(95, top.avgConfidence * 1.1)
      : Math.min(60, top.avgConfidence * 0.7);
    const id = setInterval(() => {
      setExecReady((prev) => {
        const diff = target - prev;
        return Math.abs(diff) < 0.5 ? target : prev + diff * 0.08;
      });
    }, 100);
    return () => clearInterval(id);
  }, [top?.symbol, top?.avgConfidence]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#030d18", border: "1px solid #0D2235" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderBottomColor: "#0D2235", background: "#020a14" }}
      >
        <span className="text-[8px] font-bold tracking-[0.2em] text-[#00aaff]">
          AI OPPORTUNITY SCANNER
        </span>
        <span className="text-[7px] font-mono text-[#1a3850] tracking-[0.08em]">
          AUTONOMOUS MARKET INTELLIGENCE
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
          <span className="text-[8px] font-mono" style={{ color: "#00ff8a70" }}>LIVE</span>
        </span>
      </div>

      <div className="p-3">
        {!top ? (
          <div className="text-center text-[9px] text-[#0E2235] py-4 font-mono animate-pulse">
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
              const decCol = isBuy ? "#00ff8a" : isSell ? "#ff2255" : "#2a6080";
              return (
                <div
                  className="rounded-lg p-3 mb-3 border"
                  style={{
                    background: `${color}06`,
                    borderColor: `${color}20`,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-[8px] font-mono text-[#1a3850] tracking-[0.12em] mb-0.5">
                        HIGHEST AI CONFIDENCE
                      </div>
                      <div className="text-[16px] font-bold font-mono" style={{ color }}>
                        {lbl}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-[22px] font-bold font-mono leading-none"
                        style={{ color }}
                      >
                        {top.avgConfidence.toFixed(0)}%
                      </div>
                      <div className="text-[8px] font-mono text-[#1a3850] tracking-[0.1em]">
                        CONFIDENCE
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[7px] font-mono text-[#1a3850] mb-0.5">
                        <span>AI CONVICTION</span>
                        <span style={{ color }}>{top.avgConfidence.toFixed(0)}%</span>
                      </div>
                      <div className="rounded-sm overflow-hidden" style={{ height: 4, background: "#0a1820" }}>
                        <div
                          className="h-full rounded-sm transition-all duration-1000"
                          style={{ width: `${Math.min(100, top.avgConfidence)}%`, background: color, opacity: 0.75 }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[7px] font-mono text-[#1a3850] mb-0.5">
                        <span>EXECUTION READINESS</span>
                        <span style={{ color: decCol }}>{execReady.toFixed(0)}%</span>
                      </div>
                      <div className="rounded-sm overflow-hidden" style={{ height: 4, background: "#0a1820" }}>
                        <div
                          className="h-full rounded-sm transition-all duration-300"
                          style={{ width: `${Math.min(100, execReady)}%`, background: decCol, opacity: 0.65 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Ranked list */}
            <div className="space-y-1">
              {ranked.map((b, i) => {
                const color  = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
                const lbl    = b.symbol.replace("USD", "");
                const isBuy  = b.agreedAction === "BUY";
                const isSell = b.agreedAction === "SELL";
                const decCol = isBuy ? "#ffb800" : isSell ? "#ff2255" : "#ff4455";
                const actLbl = b.agreedAction;
                return (
                  <div
                    key={b.symbol}
                    className="flex items-center gap-2.5 py-1.5 border-b"
                    style={{ borderBottomColor: "#0a1820" }}
                  >
                    <span className="text-[8px] font-mono text-[#1a3850] w-4 shrink-0">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-bold font-mono"
                          style={{ color }}
                        >
                          {lbl}
                        </span>
                        <span className="text-[7px] font-mono text-[#1a3850]">AI MONITORED</span>
                      </div>
                    </div>
                    <span
                      className="text-[9px] font-bold font-mono"
                      style={{ color: decCol }}
                    >
                      {actLbl}
                    </span>
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: decCol, boxShadow: `0 0 4px ${decCol}` }}
                    />
                    <span
                      className="text-[10px] font-bold font-mono w-8 text-right shrink-0"
                      style={{ color: "#7a9cb0" }}
                    >
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
