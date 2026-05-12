import { useEffect, useState } from "react";
import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[] }

type Tab = "ALL" | "LONG" | "SHORT";

export function OpportunityScanner({ breakdowns }: Props) {
  const [tab, setTab] = useState<Tab>("ALL");
  const [minConf, setMinConf] = useState(0);

  const ranked = [...breakdowns].sort((a, b) => b.avgConfidence - a.avgConfidence);
  const top    = ranked[0];

  const filtered = ranked.filter((b) => {
    const matchTab = tab === "ALL"
      ? true
      : tab === "LONG"  ? b.agreedAction === "BUY"
      : b.agreedAction === "SELL";
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
      setAiConv((p)     => { const d = confTarget - p; return Math.abs(d) < 0.3 ? confTarget : p + d * 0.12; });
      setExecReady((p)  => { const d = execTarget - p; return Math.abs(d) < 0.3 ? execTarget : p + d * 0.12; });
    }, 80);
    return () => clearInterval(id);
  }, [top?.symbol, top?.avgConfidence, top?.mtfConfirmed, top?.volumeConfirmed]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#000000", border: "1px solid #1c1c1c" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderBottomColor: "#141414", background: "#000000" }}>
        <div className="flex-1">
          <div className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
            AI OPPORTUNITY SCANNER
          </div>
          <div className="text-[8px] font-mono tracking-[0.1em] mt-0.5" style={{ color: "#1a2a35" }}>
            AUTONOMOUS MARKET INTELLIGENCE
          </div>
        </div>
        <span className="flex items-center gap-1.5">
          <span className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
          <span className="text-[9px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
        </span>
      </div>

      {/* Tab bar + conf filter */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b"
        style={{ borderBottomColor: "#0d0d0d", background: "#000000" }}>
        {(["ALL", "LONG", "SHORT"] as Tab[]).map((t) => (
          <button key={t}
            onClick={() => setTab(t)}
            className="text-[8px] font-bold font-mono px-2.5 py-0.5 rounded tracking-widest transition-all"
            style={tab === t
              ? {
                  background: t === "LONG" ? "#00ff8a14" : t === "SHORT" ? "#ff335514" : "#00aaff14",
                  color:      t === "LONG" ? "#00ff8a"   : t === "SHORT" ? "#ff3355"   : "#00aaff",
                  border: `1px solid ${t === "LONG" ? "#00ff8a28" : t === "SHORT" ? "#ff335528" : "#00aaff28"}`,
                }
              : { background: "transparent", color: "#1e3040", border: "1px solid transparent" }
            }>
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[7px] font-mono" style={{ color: "#1e3040" }}>MIN</span>
          <select
            value={minConf}
            onChange={(e) => setMinConf(Number(e.target.value))}
            className="text-[8px] font-mono rounded px-1"
            style={{ background: "#050505", border: "1px solid #181818", color: "#4a7a90", outline: "none" }}
          >
            {[0, 30, 40, 50, 60, 70, 80].map((v) => (
              <option key={v} value={v}>{v}%</option>
            ))}
          </select>
        </div>
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
              const bias   = isBuy ? "LONG SETUP" : isSell ? "SHORT SETUP" : "NEUTRAL";
              return (
                <div className="rounded-lg p-4 mb-4"
                  style={{ background: "#050505", border: `1px solid ${color}18` }}>
                  <div className="text-[8px] font-mono tracking-[0.14em] mb-1" style={{ color: "#1a2a35" }}>
                    BEST OPPORTUNITY
                  </div>
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <div className="text-[30px] font-bold font-mono leading-none" style={{ color }}>
                        {lbl}/USDT
                      </div>
                      <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded mt-1 inline-block"
                        style={{ background: decCol + "14", color: decCol, border: `1px solid ${decCol}28` }}>
                        {bias}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-[36px] font-bold font-mono leading-none tabular-nums" style={{ color }}>
                        {top.avgConfidence.toFixed(0)}%
                      </div>
                      <div className="text-[8px] font-mono tracking-[0.12em]" style={{ color: "#1a2a35" }}>
                        AI CONFIDENCE
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      { label: "AI CONVICTION",       val: aiConv,    col: color  },
                      { label: "EXECUTION READINESS", val: execReady, col: decCol },
                    ].map(({ label, val, col }) => (
                      <div key={label}>
                        <div className="flex justify-between text-[9px] font-mono mb-1">
                          <span style={{ color: "#1a2a35" }}>{label}</span>
                          <span className="font-bold tabular-nums" style={{ color: col }}>{val.toFixed(0)}%</span>
                        </div>
                        <div className="rounded-sm overflow-hidden" style={{ height: 5, background: "#0a0a0a" }}>
                          <div className="h-full rounded-sm"
                            style={{ width: `${Math.min(100, val)}%`, background: col, opacity: 0.75, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Ranked list */}
            <div className="space-y-0 mb-3">
              {filtered.map((b, i) => {
                const color  = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
                const lbl    = b.symbol.replace("USD", "");
                const isBuy  = b.agreedAction === "BUY";
                const isSell = b.agreedAction === "SELL";
                const decCol = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#445566";
                const action = isBuy ? "LONG" : isSell ? "SHORT" : "HOLD";
                return (
                  <div key={b.symbol} className="flex items-center gap-3 py-2.5 border-b"
                    style={{ borderBottomColor: "#0a0a0a" }}>
                    <span className="text-[9px] font-mono w-4 shrink-0 text-right" style={{ color: "#1a2a35" }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold font-mono" style={{ color }}>{lbl}/USDT</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="rounded-sm overflow-hidden" style={{ width: 40, height: 2.5, background: "#0a0a0a" }}>
                          <div className="h-full rounded-sm"
                            style={{ width: `${b.avgConfidence}%`, background: decCol, opacity: 0.7 }} />
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide shrink-0"
                      style={{ background: decCol + "12", color: decCol, border: `1px solid ${decCol}22` }}>
                      {action}
                    </span>
                    <span className="text-[13px] font-bold font-mono tabular-nums w-10 text-right shrink-0"
                      style={{ color: "#7a9cb0" }}>
                      {b.avgConfidence.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* View all link */}
            <button
              className="w-full text-[9px] font-bold font-mono py-2 rounded tracking-[0.15em] transition-all"
              style={{ background: "#050505", color: "#2a4a60", border: "1px solid #141414" }}
              onClick={() => setMinConf(0)}
            >
              VIEW ALL OPPORTUNITIES →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
