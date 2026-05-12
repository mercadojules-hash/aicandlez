import { useEffect, useState } from "react";
import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[] }

type Tab = "ALL" | "LONG" | "SHORT";

export function OpportunityScanner({ breakdowns }: Props) {
  const [tab, setTab]       = useState<Tab>("ALL");
  const [minConf, setMinConf] = useState(0);

  const ranked = [...breakdowns].sort((a, b) => b.avgConfidence - a.avgConfidence);
  const top    = ranked[0];

  const filtered = ranked.filter(b => {
    const matchTab = tab === "ALL" ? true : tab === "LONG" ? b.agreedAction === "BUY" : b.agreedAction === "SELL";
    return matchTab && b.avgConfidence >= minConf;
  });

  const [execReady, setExecReady] = useState(0);
  const [aiConv,    setAiConv]    = useState(0);

  useEffect(() => {
    if (!top) return;
    const confTarget = top.avgConfidence;
    const execTarget = top.mtfConfirmed && top.volumeConfirmed
      ? Math.min(92, top.avgConfidence * 1.08)
      : Math.min(55, top.avgConfidence * 0.65);
    const id = setInterval(() => {
      setAiConv(p    => { const d = confTarget - p; return Math.abs(d) < 0.3 ? confTarget : p + d * 0.12; });
      setExecReady(p => { const d = execTarget - p; return Math.abs(d) < 0.3 ? execTarget : p + d * 0.12; });
    }, 80);
    return () => clearInterval(id);
  }, [top?.symbol, top?.avgConfidence, top?.mtfConfirmed, top?.volumeConfirmed]);

  return (
    <div className="terminal-card flex flex-col" style={{ height: "100%" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderBottomColor: "#111111" }}>
        <span className="panel-header-title" style={{ color: "#00aaff" }}>AI OPPORTUNITY SCANNER</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
          <span className="text-[8px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1 border-b flex-shrink-0"
        style={{ borderBottomColor: "#0d0d0d", background: "#020202" }}>
        {(["ALL", "LONG", "SHORT"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="text-[8px] font-bold font-mono px-2 py-0.5 rounded tracking-widest transition-all"
            style={tab === t
              ? {
                  background: t === "LONG" ? "#00ff8a14" : t === "SHORT" ? "#ff335514" : "#00aaff14",
                  color:      t === "LONG" ? "#00ff8a"   : t === "SHORT" ? "#ff3355"   : "#00aaff",
                  border: `1px solid ${t === "LONG" ? "#00ff8a28" : t === "SHORT" ? "#ff335528" : "#00aaff28"}`,
                }
              : { background: "transparent", color: "#9FB3C8", border: "1px solid transparent" }
            }>
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <select value={minConf} onChange={e => setMinConf(Number(e.target.value))}
            className="text-[8px] font-mono rounded px-1"
            style={{ background: "#050505", border: "1px solid #181818", color: "#C7D4E2", outline: "none" }}>
            {[0, 30, 40, 50, 60, 70, 80].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto feed-scroll">
        {!top ? (
          <div className="text-center py-8 text-[10px] font-mono animate-pulse font-medium"
            style={{ color: "#9FB3C8" }}>SCANNING MARKETS…</div>
        ) : (
          <>
            {/* Top highlighted asset — fixed hierarchy: BIG conf, small pair */}
            {(() => {
              const color  = SYMBOL_COLOR[top.symbol] ?? "#4a8fa8";
              const lbl    = top.symbol.replace("USD", "");
              const isBuy  = top.agreedAction === "BUY";
              const isSell = top.agreedAction === "SELL";
              const decCol = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#445566";
              const bias   = isBuy ? "LONG SETUP" : isSell ? "SHORT SETUP" : "NEUTRAL";
              return (
                <div className="mx-3 mt-3 mb-2 rounded-lg p-3"
                  style={{ background: "#050505", border: `1px solid ${color}18` }}>
                  <div className="text-[7px] font-mono tracking-[0.14em] mb-2 font-semibold"
                    style={{ color: "#9FB3C8" }}>
                    BEST OPPORTUNITY
                  </div>

                  {/* Hierarchy: BIG confidence first, small pair below */}
                  <div className="flex items-end justify-between mb-2">
                    {/* LEFT: Confidence is primary */}
                    <div>
                      <div className="text-[40px] font-bold font-mono leading-none tabular-nums"
                        style={{ color, textShadow: `0 0 20px ${color}50` }}>
                        {top.avgConfidence.toFixed(0)}%
                      </div>
                      <div className="text-[8px] font-mono font-semibold mt-0.5" style={{ color: "#9FB3C8" }}>
                        AI CONFIDENCE
                      </div>
                    </div>
                    {/* RIGHT: Pair + bias (secondary) */}
                    <div className="text-right">
                      <div className="text-[15px] font-bold font-mono leading-none" style={{ color }}>
                        {lbl}/USDT
                      </div>
                      <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded mt-1 inline-block"
                        style={{ background: decCol + "14", color: decCol, border: `1px solid ${decCol}28` }}>
                        {bias}
                      </span>
                    </div>
                  </div>

                  {/* Bars */}
                  <div className="space-y-2">
                    {[
                      { label: "AI CONVICTION",       val: aiConv,    col: color  },
                      { label: "EXECUTION READINESS", val: execReady, col: decCol },
                    ].map(({ label, val, col }) => (
                      <div key={label}>
                        <div className="flex justify-between text-[9px] font-mono mb-1">
                          <span className="font-medium" style={{ color: "#C7D4E2" }}>{label}</span>
                          <span className="font-bold tabular-nums" style={{ color: col }}>{val.toFixed(0)}%</span>
                        </div>
                        <div className="rounded-sm overflow-hidden" style={{ height: 5, background: "#0a0a0a" }}>
                          <div className="h-full rounded-sm"
                            style={{ width: `${Math.min(100, val)}%`, background: col, opacity: 0.8, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Ranked list */}
            <div className="px-3 pb-2">
              {filtered.map((b, i) => {
                const color  = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
                const lbl    = b.symbol.replace("USD", "");
                const isBuy  = b.agreedAction === "BUY";
                const isSell = b.agreedAction === "SELL";
                const decCol = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#445566";
                const action = isBuy ? "LONG" : isSell ? "SHORT" : "HOLD";
                return (
                  <div key={b.symbol} className="flex items-center gap-2 py-2 border-b"
                    style={{ borderBottomColor: "#0a0a0a" }}>
                    <span className="text-[8px] font-mono w-3 flex-shrink-0 text-right font-medium"
                      style={{ color: "#9FB3C8" }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      {/* Pair name — smaller, secondary */}
                      <div className="text-[10px] font-bold font-mono mb-0.5" style={{ color }}>{lbl}/USDT</div>
                      {/* Mini bar */}
                      <div style={{ height: 3, background: "#0a0a0a", borderRadius: 2 }}>
                        <div className="h-full rounded-sm"
                          style={{ width: `${b.avgConfidence}%`, background: decCol, opacity: 0.7 }} />
                      </div>
                    </div>
                    {/* Action badge */}
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide flex-shrink-0"
                      style={{ background: decCol + "12", color: decCol, border: `1px solid ${decCol}22` }}>
                      {action}
                    </span>
                    {/* Confidence — visually dominant in list */}
                    <span className="text-[14px] font-bold font-mono tabular-nums w-10 text-right flex-shrink-0"
                      style={{ color: "#EAF2FF", textShadow: `0 0 8px ${color}30` }}>
                      {b.avgConfidence.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="px-3 pb-3">
              <button className="w-full text-[8px] font-bold font-mono py-1.5 rounded tracking-[0.15em] transition-all font-semibold"
                style={{ background: "#050505", color: "#C7D4E2", border: "1px solid #1a1a1a" }}
                onClick={() => setMinConf(0)}>
                VIEW ALL OPPORTUNITIES →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
