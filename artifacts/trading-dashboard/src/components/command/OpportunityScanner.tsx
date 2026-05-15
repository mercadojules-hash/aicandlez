import { useEffect, useState } from "react";
import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[] }

type Tab = "ALL" | "LONG" | "SHORT";

const FALLBACK_SYMBOLS = [
  { symbol: "BNBUSD",   color: "#F0B90B" },
  { symbol: "MATICUSD", color: "#8247E5" },
];

export function OpportunityScanner({ breakdowns }: Props) {
  const [tab,     setTab]     = useState<Tab>("ALL");
  const [minConf, setMinConf] = useState(0);

  const ranked = [...breakdowns].sort((a, b) => b.avgConfidence - a.avgConfidence);
  const top    = ranked[0];

  /* Pad to 15 entries with static rows when engine has fewer symbols */
  const paddedRanked: SymBreakdown[] = [...ranked];
  for (const fb of FALLBACK_SYMBOLS) {
    if (paddedRanked.length >= 15) break;
    if (!paddedRanked.find(b => b.symbol === fb.symbol)) {
      paddedRanked.push({
        symbol:          fb.symbol,
        fast:            { decision: "HOLD", confidence: 22, rsi: 49, ema9: 0, ema21: 0, emaSignal: "—", macdLine: 0, macdSignal: 0, macdState: "—", shortSummary: "Awaiting data" },
        slow:            { decision: "HOLD", confidence: 18, rsi: 51, ema9: 0, ema21: 0, emaSignal: "—", macdLine: 0, macdSignal: 0, macdState: "—", shortSummary: "Awaiting data" },
        mtfConfirmed:    false,
        agreedAction:    "HOLD",
        avgConfidence:   20,
        blockReason:     "Insufficient data",
        lastUpdated:     Date.now(),
        volumeConfirmed: false,
        marketCondition: "—",
        trend1H:         "—",
      });
    }
  }

  /* Long/short bias percentages */
  const longCount  = paddedRanked.filter(b => b.agreedAction === "BUY").length;
  const shortCount = paddedRanked.filter(b => b.agreedAction === "SELL").length;
  const activeDir  = longCount + shortCount;
  const longPct    = activeDir > 0 ? Math.round((longCount  / activeDir) * 100) : 50;
  const shortPct   = activeDir > 0 ? Math.round((shortCount / activeDir) * 100) : 50;

  const filtered = paddedRanked.filter(b => {
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

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col px-3 pt-2.5 pb-2 border-b flex-shrink-0"
        style={{ borderBottomColor: "#111111" }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="panel-header-title" style={{ color: "#00aaff" }}>AI OPPORTUNITY SCANNER</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="live-dot live-dot-cyan" style={{ width: 4, height: 4 }} />
            <span className="text-[8px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
          </span>
        </div>

        {/* Long/Short bias row — clearly labeled */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono font-semibold" style={{ color: "#4a6a80" }}>LONG BIAS</span>
            <span className="text-[14px] font-bold font-mono tabular-nums"
              style={{ color: "#00ff8a", textShadow: "0 0 8px #00ff8a50" }}>
              {longPct}%
            </span>
          </div>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#0d0d0d" }}>
            <div style={{
              height: "100%",
              width: `${longPct}%`,
              background: "linear-gradient(90deg, #00ff8a, #ff3355)",
              borderRadius: 4,
              transition: "width 0.6s ease",
            }} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold font-mono tabular-nums"
              style={{ color: "#ff3355", textShadow: "0 0 8px #ff335550" }}>
              {shortPct}%
            </span>
            <span className="text-[8px] font-mono font-semibold" style={{ color: "#4a6a80" }}>SHORT BIAS</span>
          </div>
        </div>

        <div className="text-[7.5px] font-mono mt-1" style={{ color: "#2a4050" }}>
          Directional signal weighting across all tracked symbols · updated each engine tick
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b flex-shrink-0"
        style={{ borderBottomColor: "#0d0d0d", background: "#020202" }}>
        {(["ALL", "LONG", "SHORT"] as Tab[]).map(t => {
          const pct = t === "LONG" ? longPct : t === "SHORT" ? shortPct : null;
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex items-center gap-1 text-[8.5px] font-bold font-mono px-2 py-0.5 rounded tracking-widest transition-all"
              style={tab === t ? {
                background: t === "LONG" ? "#00ff8a14" : t === "SHORT" ? "#ff335514" : "#00aaff14",
                color:      t === "LONG" ? "#00ff8a"   : t === "SHORT" ? "#ff3355"   : "#00aaff",
                border: `1px solid ${t === "LONG" ? "#00ff8a28" : t === "SHORT" ? "#ff335528" : "#00aaff28"}`,
              } : { background: "transparent", color: "#9FB3C8", border: "1px solid transparent" }}>
              {t}
              {pct !== null && (
                <span className="text-[7px] font-bold"
                  style={{ color: tab === t ? "inherit" : "#4a6a80" }}>
                  {pct}%
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <select value={minConf} onChange={e => setMinConf(Number(e.target.value))}
            className="text-[8px] font-mono rounded px-1"
            style={{ background: "#050505", border: "1px solid #181818", color: "#C7D4E2", outline: "none" }}>
            {[0, 30, 40, 50, 60, 70, 80].map(v => <option key={v} value={v}>{v}%+</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto feed-scroll min-h-0">
        {!top ? (
          <div className="text-center py-8 text-[11px] font-mono animate-pulse font-medium"
            style={{ color: "#9FB3C8" }}>SCANNING MARKETS…</div>
        ) : (
          <>
            {/* ── Spotlight card ───────────────────────────────────────── */}
            {(() => {
              const color  = SYMBOL_COLOR[top.symbol] ?? "#4a8fa8";
              const lbl    = top.symbol.replace("USD", "");
              const isBuy  = top.agreedAction === "BUY";
              const isSell = top.agreedAction === "SELL";
              const decCol = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#445566";
              const bias   = isBuy ? "LONG SETUP" : isSell ? "SHORT SETUP" : "NEUTRAL";
              return (
                <div className="mx-3 mt-2 mb-2 rounded-lg p-3"
                  style={{ background: "#050505", border: `1px solid ${color}20` }}>
                  <div className="text-[8px] font-mono tracking-[0.14em] mb-2 font-semibold"
                    style={{ color: "#9FB3C8" }}>
                    BEST OPPORTUNITY
                  </div>
                  <div className="flex items-end justify-between mb-2.5">
                    <div>
                      <div className="text-[40px] font-bold font-mono leading-none tabular-nums"
                        style={{ color, textShadow: `0 0 24px ${color}50` }}>
                        {top.avgConfidence.toFixed(0)}%
                      </div>
                      <div className="text-[9px] font-mono font-semibold mt-0.5" style={{ color: "#9FB3C8" }}>
                        AI CONFIDENCE SCORE
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[15px] font-bold font-mono leading-none" style={{ color }}>
                        {lbl}/USDT
                      </div>
                      <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded mt-1.5 inline-block"
                        style={{ background: decCol + "14", color: decCol, border: `1px solid ${decCol}30` }}>
                        {bias}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      {
                        label:   "AI SIGNAL STRENGTH",
                        sub:     "avg confidence across 5m + 1h timeframes",
                        val:     aiConv,
                        col:     color,
                      },
                      {
                        label:   "EXECUTION GATE",
                        sub:     "MTF alignment + volume confirmation",
                        val:     execReady,
                        col:     decCol,
                      },
                    ].map(({ label, sub, val, col }) => (
                      <div key={label}>
                        <div className="flex justify-between text-[8px] font-mono mb-0.5">
                          <div>
                            <span className="font-bold" style={{ color: "#C7D4E2" }}>{label}</span>
                            <div className="text-[7px]" style={{ color: "#4a6a80" }}>{sub}</div>
                          </div>
                          <span className="font-bold tabular-nums text-[14px]" style={{ color: col }}>{val.toFixed(0)}%</span>
                        </div>
                        <div className="rounded-sm overflow-hidden" style={{ height: 5, background: "#0a0a0a" }}>
                          <div className="h-full rounded-sm"
                            style={{ width: `${Math.min(100, val)}%`, background: col, opacity: 0.85, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Ranked list — top 15 ─────────────────────────────────── */}
            <div className="px-3 pb-3">
              {filtered.slice(0, 15).map((b, i) => {
                const color  = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
                const lbl    = b.symbol.replace("USD", "");
                const isBuy  = b.agreedAction === "BUY";
                const isSell = b.agreedAction === "SELL";
                const decCol = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#2a3a4a";
                const action = isBuy ? "LONG" : isSell ? "SHORT" : "HOLD";
                return (
                  <div key={b.symbol} className="flex items-center gap-2 py-2 border-b"
                    style={{ borderBottomColor: "#0a0a0a" }}>
                    <span className="text-[9px] font-mono w-4 flex-shrink-0 text-right font-bold"
                      style={{ color: "#3a5a70" }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold font-mono mb-1" style={{ color }}>{lbl}/USDT</div>
                      <div style={{ height: 3, background: "#0a0a0a", borderRadius: 2 }}>
                        <div className="h-full rounded-sm"
                          style={{ width: `${b.avgConfidence}%`, background: decCol, opacity: 0.75, transition: "width 0.5s" }} />
                      </div>
                    </div>
                    <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide flex-shrink-0"
                      style={{ background: decCol + "14", color: decCol, border: `1px solid ${decCol}28` }}>
                      {action}
                    </span>
                    <span className="text-[15px] font-bold font-mono tabular-nums w-12 text-right flex-shrink-0"
                      style={{ color: "#EAF2FF", textShadow: `0 0 8px ${color}40` }}>
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
