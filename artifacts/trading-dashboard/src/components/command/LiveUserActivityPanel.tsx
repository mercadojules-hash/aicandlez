import { useState, useEffect, useRef } from "react";
import { Maximize2 } from "lucide-react";
import type { EngineStatus, Trade, SimAccount } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const N        = 120;   // chart data points
const TICK_MS  = 700;   // update interval — fast enough to feel alive

type TF = "1M" | "5M" | "15M" | "1H" | "4H" | "1D";
const TIMEFRAMES: TF[] = ["1M", "5M", "15M", "1H", "4H", "1D"];

interface Pt {
  aiSignals:   number;  // cyan
  executions:  number;  // green
  userActivity:number;  // purple
  volume:      number;  // yellow
  activeUsers: number;  // teal
  riskBlocks:  number;  // red
}

interface Props {
  engine?:    EngineStatus;
  openTrade?: Trade;
  simPos?:    SimAccount["positions"][0];
}

// ── Stream config ─────────────────────────────────────────────────────────────

const STREAMS = [
  { key: "aiSignals",    label: "AI SIGNALS",    color: "#00f0ff", width: 2   },
  { key: "executions",   label: "EXECUTIONS",    color: "#00ff8a", width: 2.5 },
  { key: "userActivity", label: "USER ACTIVITY", color: "#cc55ff", width: 2   },
  { key: "volume",       label: "VOLUME (USD)",  color: "#ffcc00", width: 1.5 },
  { key: "activeUsers",  label: "ACTIVE USERS",  color: "#00ccaa", width: 1.5 },
  { key: "riskBlocks",   label: "RISK BLOCKS",   color: "#ff3355", width: 1.5 },
] as const;

// ── SVG helpers ───────────────────────────────────────────────────────────────

function catmullRom(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = (p1.x + (p2.x - p0.x) / 6).toFixed(1);
    const cp1y = (p1.y + (p2.y - p0.y) / 6).toFixed(1);
    const cp2x = (p2.x - (p3.x - p1.x) / 6).toFixed(1);
    const cp2y = (p2.y - (p3.y - p1.y) / 6).toFixed(1);
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function toSvgPts(
  data: Pt[],
  key: keyof Pt,
  VW: number, VH: number,
  pl: number, pr: number, pt: number, pb: number,
) {
  const cW = VW - pl - pr;
  const cH = VH - pt - pb;
  return data.map((d, i) => ({
    x: pl + (i / Math.max(data.length - 1, 1)) * cW,
    y: pt + (1 - d[key] / 100) * cH,
  }));
}

function areaPath(linePts: { x: number; y: number }[], VH: number, pt: number, pb: number): string {
  if (linePts.length < 2) return "";
  const base = VH - pb;
  return `${catmullRom(linePts)} L ${linePts[linePts.length - 1].x.toFixed(1)},${base} L ${linePts[0].x.toFixed(1)},${base} Z`;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

function seed(): Pt[] {
  return Array.from({ length: N }, (_, i) => ({
    aiSignals:    30 + Math.sin(i * 0.18) * 20 + Math.sin(i * 0.07) * 15 + Math.random() * 8,
    executions:   12 + Math.sin(i * 0.22) * 10 + Math.cos(i * 0.11) * 8  + Math.random() * 6,
    userActivity: 40 + Math.sin(i * 0.12) * 22 + Math.cos(i * 0.08) * 10 + Math.random() * 7,
    volume:       25 + Math.sin(i * 0.09) * 28 + Math.sin(i * 0.19) * 12 + Math.random() * 9,
    activeUsers:  55 + Math.sin(i * 0.07) * 18 + Math.cos(i * 0.13) * 10 + Math.random() * 5,
    riskBlocks:   8  + Math.sin(i * 0.25) * 8  + Math.random() * 6,
  }));
}

// ── Chart component ───────────────────────────────────────────────────────────

function ActivityChart({ data, execPulses }: { data: Pt[]; execPulses: number[] }) {
  const VW = 1200, VH = 260;
  const pl = 32, pr = 8, pt = 14, pb = 22;
  const cW = VW - pl - pr;
  const cH = VH - pt - pb;

  const gridYs  = [20, 40, 60, 80].map(p => pt + (1 - p / 100) * cH);
  const gridXs  = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map(f => pl + f * cW);

  const streamPts = STREAMS.map(s =>
    toSvgPts(data, s.key, VW, VH, pl, pr, pt, pb)
  );

  return (
    <svg
      width="100%" height="100%"
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <defs>
        {STREAMS.map(s => (
          <linearGradient key={s.key} id={`ual-g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={s.color} stopOpacity={s.key === "executions" ? 0.30 : 0.18} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
          </linearGradient>
        ))}
        <filter id="ual-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect x={pl} y={pt} width={cW} height={cH} fill="#010508" />

      {/* Grid lines */}
      {gridYs.map((y, i) => (
        <line key={`gy-${i}`} x1={pl} y1={y} x2={pl + cW} y2={y}
          stroke="#0d1f2e" strokeWidth={1} strokeDasharray="4 8" />
      ))}
      {gridXs.map((x, i) => (
        <line key={`gx-${i}`} x1={x} y1={pt} x2={x} y2={pt + cH}
          stroke="#0a1822" strokeWidth={1} />
      ))}

      {/* Execution pulse verticals */}
      {execPulses.map((xi, i) => {
        const x = pl + (xi / Math.max(N - 1, 1)) * cW;
        return (
          <line key={i} x1={x} y1={pt} x2={x} y2={pt + cH}
            stroke="#00ff8a" strokeWidth={1.5} strokeOpacity={0.45}
            strokeDasharray="3 5" />
        );
      })}

      {/* Y-axis labels */}
      {[0, 25, 50, 75, 100].map(p => (
        <text key={p}
          x={pl - 5} y={pt + (1 - p / 100) * cH + 4}
          textAnchor="end" fontSize={8} fill="#1e3848" fontFamily="monospace">
          {p}
        </text>
      ))}

      {/* Areas — back to front (order matters for visual layering) */}
      {[5, 3, 4, 2, 0, 1].map(idx => {
        const s = STREAMS[idx];
        const pts = streamPts[idx];
        return (
          <path key={`area-${s.key}`}
            d={areaPath(pts, VH, pt, pb)}
            fill={`url(#ual-g-${s.key})`} />
        );
      })}

      {/* Lines — back to front */}
      {[5, 3, 4, 2, 0, 1].map(idx => {
        const s = STREAMS[idx];
        const pts = streamPts[idx];
        const isExec = s.key === "executions";
        return (
          <path key={`line-${s.key}`}
            d={catmullRom(pts)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            filter={isExec ? "url(#ual-glow)" : undefined}
            strokeOpacity={isExec ? 0.95 : 0.8}
          />
        );
      })}

      {/* Live head dots */}
      {STREAMS.map((s, idx) => {
        const pts = streamPts[idx];
        const last = pts[pts.length - 1];
        if (!last) return null;
        return (
          <circle key={`dot-${s.key}`}
            cx={last.x} cy={last.y} r={s.key === "executions" ? 4.5 : 3}
            fill={s.color}
            style={{ filter: `drop-shadow(0 0 ${s.key === "executions" ? 7 : 4}px ${s.color})` }}
          />
        );
      })}

      {/* Time labels */}
      {gridXs.slice(0, -1).map((x, i) => (
        <text key={`tx-${i}`}
          x={x + cW * 0.1} y={VH - 5}
          textAnchor="middle" fontSize={7} fill="#1e3040" fontFamily="monospace">
          {`T-${(5 - i) * 10}m`}
        </text>
      ))}
    </svg>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({
  label, value, color, sub, pulse,
}: {
  label: string; value: string; color: string; sub?: string; pulse?: boolean;
}) {
  return (
    <div style={{
      flex:         1,
      padding:      "7px 14px",
      borderRight:  "1px solid #080e16",
      position:     "relative",
      minWidth:     0,
    }}>
      {pulse && (
        <span className="live-dot" style={{
          position: "absolute", top: 8, right: 10,
          width: 4, height: 4,
          background: color, boxShadow: `0 0 6px ${color}`,
        }} />
      )}
      <div style={{
        fontSize:      22,
        fontWeight:    800,
        fontFamily:    "monospace",
        color,
        lineHeight:    1,
        letterSpacing: "-0.02em",
        textShadow:    `0 0 16px ${color}35`,
        marginBottom:  3,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 7.5, fontFamily: "monospace", color: `${color}60`, marginBottom: 1 }}>
          {sub}
        </div>
      )}
      <div style={{
        fontSize:      7,
        fontFamily:    "monospace",
        color:         "#1e3040",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function LiveUserActivityPanel({ engine, openTrade, simPos }: Props) {

  const [data,       setData]       = useState<Pt[]>(seed);
  const [tf,         setTf]         = useState<TF>("5M");
  const [execPulses, setExecPulses] = useState<number[]>([]);

  // Live counters
  const [activeSessions, setActiveSessions] = useState(24);
  const [tradingNow,     setTradingNow]     = useState(8);
  const [newToday,       setNewToday]       = useState(0);
  const [volUSD,         setVolUSD]         = useState(285_000);

  const prevExecRef = useRef(0);
  const prevSigRef  = useRef(0);
  const engRef      = useRef(engine);
  useEffect(() => { engRef.current = engine; }, [engine]);

  useEffect(() => {
    const id = setInterval(() => {
      const eng    = engRef.current;
      const execs  = eng?.tradesExecuted ?? 0;
      const sigs   = eng?.signalsGenerated ?? 0;
      const isExec = execs > prevExecRef.current;
      const isSig  = sigs  > prevSigRef.current;
      prevExecRef.current = execs;
      prevSigRef.current  = sigs;

      const running = eng?.running ?? false;
      const sigBase = running ? 58 : 28;
      const usrBase = running ? 52 : 32;

      setData(prev => {
        const last = prev[prev.length - 1] ?? prev[0];
        // Natural oscillation — each stream has its own rhythm
        const t = Date.now() / 1000;
        const next: Pt = {
          aiSignals:    clamp(last.aiSignals    + (sigBase - last.aiSignals)    * 0.1  + (isSig  ? 30 : 0) + Math.sin(t * 0.9) * 3 + rand(-6, 6),   5, 97),
          executions:   clamp(last.executions   + (isExec  ? 85 : -10)                  + Math.cos(t * 1.3) * 2 + rand(-5, 5),                       2, 98),
          userActivity: clamp(last.userActivity + (usrBase - last.userActivity) * 0.07 + Math.sin(t * 0.5) * 4 + rand(-5, 5),                        8, 94),
          volume:       clamp(last.volume       + (running  ? 4 : -3)                   + Math.sin(t * 0.7) * 5 + rand(-7, 8),                        4, 96),
          activeUsers:  clamp(last.activeUsers  + (running  ? 2 : -1.5)                 + Math.cos(t * 0.4) * 3 + rand(-4, 4),                       10, 90),
          riskBlocks:   clamp(last.riskBlocks   + ((eng?.tradesBlocked ?? 0) > 0 ? 3 : -1.5) + rand(-4, 4),                                           2, 65),
        };
        return [...prev.slice(1), next];
      });

      if (isExec) {
        setExecPulses(prev => [...prev.slice(-18), N - 1]);
        setVolUSD(p => p + 8_000 + Math.random() * 22_000);
      }

      setActiveSessions(p => clamp(p + Math.round(rand(-2, 2)),   10, 60));
      setTradingNow(p     => clamp(p + Math.round(rand(-1, 1)),    2,  25));
      setNewToday(p       => p + (Math.random() < 0.14 ? 1 : 0));
      if (running) setVolUSD(p => p + Math.random() * 1_200);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const riskBlocks = engine?.tradesBlocked   ?? 0;
  const execCount  = engine?.tradesExecuted  ?? 0;
  const sigCount   = engine?.signalsGenerated ?? 0;
  const fmtVol     = volUSD >= 1_000_000
    ? `$${(volUSD / 1_000_000).toFixed(2)}M`
    : `$${(volUSD / 1_000).toFixed(0)}K`;

  // Active position data (from either live trade or sim position)
  const hasActiveTrade = !!(openTrade || simPos);
  const activeSym   = openTrade?.symbol ?? simPos?.symbol ?? "";
  const activeSide  = (openTrade?.side  ?? simPos?.side.toUpperCase() ?? "").toUpperCase();
  const activePnl   = openTrade?.pnl    ?? simPos?.unrealizedPnL ?? 0;
  const activePnlPct = openTrade?.pnlPercent ?? simPos?.unrealizedPnLPct ?? 0;
  const sideColor   = activeSide === "BUY" ? "#00ff8a" : "#ff3355";

  return (
    <div style={{
      flex:          1,
      display:       "flex",
      flexDirection: "column",
      background:    "#000000",
      minHeight:     0,
      overflow:      "hidden",
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        padding:      "5px 14px",
        borderBottom: "1px solid #0b1a26",
        flexShrink:   0,
        background:   "#000000",
      }}>
        <span className="live-dot" style={{ width: 5, height: 5, background: "#00f0ff", boxShadow: "0 0 8px #00f0ff" }} />
        <span style={{
          fontSize:      9.5,
          fontFamily:    "monospace",
          fontWeight:    700,
          color:         "#00f0ff",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
        }}>
          Live Platform Activity Overview
        </span>
        <span style={{ fontSize: 7, fontFamily: "monospace", color: "#1a2e40", letterSpacing: "0.1em" }}>
          · USER TRAFFIC · AI EXECUTION · PLATFORM INTELLIGENCE
        </span>

        <div style={{ flex: 1 }} />

        {/* Legend — inline, compact */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {STREAMS.map(s => (
            <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <svg width={14} height={3} style={{ flexShrink: 0 }}>
                <line x1={0} y1={1.5} x2={14} y2={1.5} stroke={s.color} strokeWidth={2.5} />
              </svg>
              <span style={{ fontSize: 7, fontFamily: "monospace", color: `${s.color}75`, letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
            </span>
          ))}
        </div>

        <div style={{ width: 1, height: 14, background: "#0d1e2e", margin: "0 8px" }} />

        {/* Timeframe selector */}
        <div style={{ display: "flex", gap: 1 }}>
          {TIMEFRAMES.map(t => (
            <button key={t} onClick={() => setTf(t)} style={{
              fontSize: 7.5, fontFamily: "monospace", fontWeight: 700,
              padding: "2px 5px", borderRadius: 3,
              border:      tf === t ? "1px solid #00f0ff40" : "1px solid transparent",
              background:  tf === t ? "#00f0ff12" : "transparent",
              color:       tf === t ? "#00f0ff" : "#2a4a60",
              cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.12s",
            }}>
              {t}
            </button>
          ))}
        </div>
        <Maximize2 size={9} color="#1a2e40" style={{ marginLeft: 6, flexShrink: 0 }} />
      </div>

      {/* ── Chart — always rendered, fills remaining space ──────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0, position: "relative" }}>
        <ActivityChart data={data} execPulses={execPulses} />
      </div>

      {/* ── Active position overlay — shown when a trade is open ────────────── */}
      {hasActiveTrade && (
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          12,
          padding:      "5px 14px",
          borderTop:    `1px solid ${sideColor}28`,
          background:   `${sideColor}06`,
          flexShrink:   0,
        }}>
          <span className="live-dot" style={{ width: 4, height: 4, background: sideColor, boxShadow: `0 0 6px ${sideColor}` }} />
          <span style={{ fontSize: 8, fontFamily: "monospace", fontWeight: 700, color: `${sideColor}90`, letterSpacing: "0.15em" }}>
            ACTIVE POSITION
          </span>
          <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#EAF2FF" }}>
            {activeSym.replace("USD","")}
          </span>
          <span style={{
            fontSize: 9, fontFamily: "monospace", fontWeight: 700,
            padding: "1px 6px", borderRadius: 3,
            background: `${sideColor}18`, color: sideColor, border: `1px solid ${sideColor}40`,
          }}>
            {activeSide}
          </span>
          <span style={{
            fontSize: 12, fontFamily: "monospace", fontWeight: 800,
            color: activePnl >= 0 ? "#00ff8a" : "#ff3355",
          }}>
            {activePnl >= 0 ? "+" : ""}{activePnl.toFixed(2)}
            <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 4 }}>
              ({activePnlPct >= 0 ? "+" : ""}{activePnlPct.toFixed(2)}%)
            </span>
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 7, fontFamily: "monospace", color: "#2a4050", letterSpacing: "0.1em" }}>
            UNREALIZED P&L · LIVE
          </span>
        </div>
      )}

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      <div style={{
        display:        "flex",
        borderTop:      "1px solid #0b1a26",
        flexShrink:     0,
        background:     "#000000",
        overflowX:      "auto",
        scrollbarWidth: "none",
      }}>
        <StatCell label="ACTIVE USERS"  value={String(activeSessions)} color="#00ccaa" pulse />
        <StatCell label="TRADING NOW"   value={String(tradingNow)}     color="#cc55ff" />
        <StatCell label="NEW TODAY"     value={String(newToday)}       color="#ff9900" />
        <StatCell label="AI SIGNALS"    value={String(sigCount)}       color="#00f0ff" pulse={sigCount > 0} />
        <StatCell label="VOLUME TODAY"  value={fmtVol}                 color="#ffcc00" />
        <StatCell label="EXECUTIONS"    value={String(execCount)}      color="#00ff8a" pulse={execCount > 0}
          sub={riskBlocks > 0 ? `${riskBlocks} BLOCKED` : undefined} />
      </div>
    </div>
  );
}

// ── Util ──────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function rand(lo: number, hi: number) { return lo + Math.random() * (hi - lo); }
