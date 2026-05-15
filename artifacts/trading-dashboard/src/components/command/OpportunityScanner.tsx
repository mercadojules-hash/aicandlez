import { useEffect, useRef, useState } from "react";
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
  const confHistory = useRef<number[]>([]);
  const SPARK_N = 40;

  useEffect(() => {
    if (!top) return;
    const confTarget = top.avgConfidence;
    const execTarget = top.mtfConfirmed && top.volumeConfirmed
      ? Math.min(92, top.avgConfidence * 1.08)
      : Math.min(55, top.avgConfidence * 0.65);
    const id = setInterval(() => {
      setAiConv(p => {
        const d = confTarget - p;
        const next = Math.abs(d) < 0.3 ? confTarget : p + d * 0.12 + (Math.random() - 0.5) * 1.2;
        confHistory.current = [...confHistory.current.slice(-(SPARK_N - 1)), next];
        return next;
      });
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
            {/* ── Spotlight card — institutional grade ─────────────── */}
            {(() => {
              const color  = SYMBOL_COLOR[top.symbol] ?? "#4a8fa8";
              const lbl    = top.symbol.replace("USD", "");
              const isBuy  = top.agreedAction === "BUY";
              const isSell = top.agreedAction === "SELL";
              const decCol = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#445566";
              const bias   = isBuy ? "LONG" : isSell ? "SHORT" : "NEUTRAL";

              // Sparkline SVG from confHistory
              const hist = confHistory.current;
              const W = 260, H = 52;
              const pl = 2, pr = 2, pt = 3, pb = 8;
              const cW = W - pl - pr, cH = H - pt - pb;
              const sparkPath = (() => {
                if (hist.length < 2) return "";
                const min = Math.max(0,  Math.min(...hist) - 5);
                const max = Math.min(100, Math.max(...hist) + 5);
                const rng = Math.max(max - min, 10);
                const pts = hist.map((v, i) => ({
                  x: pl + (i / (hist.length - 1)) * cW,
                  y: pt + (1 - (v - min) / rng) * cH,
                }));
                let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
                for (let i = 1; i < pts.length; i++) {
                  const cx = ((pts[i-1].x + pts[i].x) / 2).toFixed(1);
                  d += ` C ${cx},${pts[i-1].y.toFixed(1)} ${cx},${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
                }
                const last = pts[pts.length - 1];
                const areaClose = ` L ${last.x.toFixed(1)},${pt + cH} L ${pts[0].x.toFixed(1)},${pt + cH} Z`;
                return { line: d, area: d + areaClose, last };
              })();
              const hasSpark = typeof sparkPath === "object";

              return (
                <div className="mx-2 mt-2 mb-1.5 rounded-lg overflow-hidden"
                  style={{ background: "#040608", border: `1px solid ${color}22`, boxShadow: `0 0 24px ${color}08` }}>

                  {/* Header row */}
                  <div className="flex items-center justify-between px-3 pt-2.5 pb-2"
                    style={{ borderBottom: `1px solid ${color}12` }}>
                    <div className="flex items-center gap-2">
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: color, boxShadow: `0 0 6px ${color}` }} />
                      <span className="text-[13px] font-bold font-mono" style={{ color, textShadow: `0 0 16px ${color}60` }}>
                        {lbl}
                      </span>
                      <span className="text-[9px] font-mono" style={{ color: `${color}70` }}>/ USDT</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8.5px] font-bold font-mono px-2 py-0.5 rounded"
                        style={{ background: decCol + "14", color: decCol, border: `1px solid ${decCol}32` }}>
                        {bias}
                      </span>
                      {top.mtfConfirmed && (
                        <span className="text-[7.5px] font-bold font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#00f0ff12", color: "#00f0ff", border: "1px solid #00f0ff28" }}>
                          MTF ✓
                        </span>
                      )}
                      {top.volumeConfirmed && (
                        <span className="text-[7.5px] font-bold font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#ffb80012", color: "#ffb800", border: "1px solid #ffb80028" }}>
                          VOL ✓
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score + sparkline */}
                  <div className="flex items-stretch">
                    {/* Left: big number */}
                    <div className="flex flex-col justify-center px-3 py-2 flex-shrink-0" style={{ minWidth: 90 }}>
                      <div className="font-bold font-mono tabular-nums leading-none"
                        style={{ fontSize: 38, color, textShadow: `0 0 28px ${color}55`, letterSpacing: "-0.03em" }}>
                        {aiConv.toFixed(0)}
                      </div>
                      <div className="text-[7.5px] font-mono mt-0.5" style={{ color: "#3a5a70", letterSpacing: "0.1em" }}>
                        AI CONF %
                      </div>
                    </div>

                    {/* Right: sparkline */}
                    <div className="flex-1 flex flex-col justify-end" style={{ paddingRight: 10, paddingTop: 10, paddingBottom: 4 }}>
                      {hasSpark && (
                        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                          style={{ display: "block" }}>
                          <defs>
                            <linearGradient id="sc-grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                            </linearGradient>
                          </defs>
                          {/* Grid lines */}
                          {[25, 50, 75].map(p => {
                            const y = pt + (1 - (p - Math.max(0, Math.min(...hist) - 5)) / Math.max(Math.min(100, Math.max(...hist) + 5) - Math.max(0, Math.min(...hist) - 5), 10)) * cH;
                            return <line key={p} x1={pl} y1={y} x2={pl + cW} y2={y} stroke="#0c1820" strokeWidth={1} strokeDasharray="2 5" />;
                          })}
                          <path d={(sparkPath as any).area} fill="url(#sc-grad)" />
                          <path d={(sparkPath as any).line} fill="none" stroke={color} strokeWidth={1.8} />
                          {/* Latest dot */}
                          {(sparkPath as any).last && (
                            <circle cx={(sparkPath as any).last.x} cy={(sparkPath as any).last.y} r={3}
                              fill={color} style={{ filter: `drop-shadow(0 0 5px ${color})` }} />
                          )}
                          {/* Axis labels */}
                          <text x={pl} y={H - 1} fontSize={6} fill="#1a3050" fontFamily="monospace">0</text>
                          <text x={pl + cW} y={H - 1} fontSize={6} fill="#1a3050" fontFamily="monospace" textAnchor="end">NOW</text>
                        </svg>
                      )}
                      {!hasSpark && (
                        <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3040" }}>CONNECTING…</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metric bars */}
                  <div className="px-3 pb-3 space-y-2" style={{ borderTop: `1px solid ${color}0e` }}>
                    {[
                      { label: "AI SIGNAL",  sub: "5m + 1H avg confidence",         val: aiConv,    col: color  },
                      { label: "EXEC GATE",  sub: "MTF alignment · volume confirm",  val: execReady, col: decCol },
                    ].map(({ label, sub, val, col }) => (
                      <div key={label} className="pt-2">
                        <div className="flex justify-between items-baseline mb-1">
                          <div>
                            <span className="text-[8.5px] font-bold font-mono" style={{ color: "#C7D4E2" }}>{label}</span>
                            <span className="text-[7px] font-mono ml-2" style={{ color: "#2a4050" }}>{sub}</span>
                          </div>
                          <span className="text-[15px] font-bold font-mono tabular-nums" style={{ color: col }}>
                            {val.toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ height: 5, background: "#060606", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.min(100, val)}%`,
                            background: col,
                            borderRadius: 3,
                            transition: "width 0.25s ease",
                            boxShadow: `0 0 8px ${col}55`,
                          }} />
                        </div>
                      </div>
                    ))}

                    {/* Breakdown chips */}
                    <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                      {[
                        { label: `5M ${top.fast?.decision ?? "—"}`,  color: top.fast?.decision  === "BUY" ? "#00ff8a" : top.fast?.decision  === "SELL" ? "#ff3355" : "#445566" },
                        { label: `1H ${top.slow?.decision ?? "—"}`,  color: top.slow?.decision  === "BUY" ? "#00ff8a" : top.slow?.decision  === "SELL" ? "#ff3355" : "#445566" },
                        { label: `RSI ${top.fast?.rsi?.toFixed(0) ?? "—"}`, color: "#9FB3C8" },
                        { label: top.marketCondition ?? "—",          color: "#4a8fa8" },
                      ].map(ch => (
                        <span key={ch.label} className="text-[7.5px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${ch.color}10`, color: ch.color, border: `1px solid ${ch.color}22` }}>
                          {ch.label}
                        </span>
                      ))}
                    </div>
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
