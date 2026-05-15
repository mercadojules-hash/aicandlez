import { useState, useEffect, useRef } from "react";
import { Users, Activity } from "lucide-react";
import type { EngineStatus } from "./types";

const CHART_N = 90;
const TICK_MS = 1600;

interface Pt {
  sessions:   number;
  trading:    number;
  executions: number;
  joins:      number;
}

interface Props { engine?: EngineStatus }

/* ── Smooth bezier path ──────────────────────────────────────────────────── */
function smooth(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
    d += ` C ${cx},${pts[i-1].y.toFixed(1)} ${cx},${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  }
  return d;
}

/* ── Chart ───────────────────────────────────────────────────────────────── */
function UserActivityChart({ data, execIdx }: { data: Pt[]; execIdx: number[] }) {
  const VW = 960, VH = 200;
  const pl = 26, pr = 6, pt = 10, pb = 18;
  const cW = VW - pl - pr;
  const cH = VH - pt - pb;

  const mapPts = (key: keyof Pt) =>
    data.map((d, i) => ({
      x: pl + (i / Math.max(data.length - 1, 1)) * cW,
      y: pt + (1 - d[key] / 100) * cH,
    }));

  const area = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return "";
    const base = pt + cH;
    return `${smooth(pts)} L ${pts[pts.length-1].x.toFixed(1)},${base} L ${pts[0].x.toFixed(1)},${base} Z`;
  };

  const sesPts  = mapPts("sessions");
  const trdPts  = mapPts("trading");
  const execPts = mapPts("executions");
  const jnPts   = mapPts("joins");
  const gridYs  = [25, 50, 75].map(p => pt + (1 - p / 100) * cH);
  const lastSes = sesPts[sesPts.length - 1];

  return (
    <svg
      width="100%" height="100%"
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="ual-ses"  x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00f0ff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="ual-trd"  x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#cc55ff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#cc55ff" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="ual-exec" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00ff8a" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#00ff8a" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="ual-join" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ff9900" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ff9900" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      <rect x={pl} y={pt} width={cW} height={cH} fill="#000000" rx={2} />

      {gridYs.map((y, i) => (
        <line key={i} x1={pl} y1={y} x2={pl + cW} y2={y}
          stroke="#0a1a28" strokeWidth={1} strokeDasharray="3 6" />
      ))}

      {/* Execution pulse markers — green vertical lines */}
      {execIdx.map((xi, i) => (
        <line key={i}
          x1={pl + (xi / Math.max(CHART_N - 1, 1)) * cW} y1={pt}
          x2={pl + (xi / Math.max(CHART_N - 1, 1)) * cW} y2={pt + cH}
          stroke="#00ff8a" strokeWidth={1.5} strokeOpacity={0.55} />
      ))}

      {/* New joins (back, orange) */}
      <path d={area(jnPts)}   fill="url(#ual-join)" />
      <path d={smooth(jnPts)} fill="none" stroke="#ff9900" strokeWidth={1.5} strokeOpacity={0.5} />

      {/* Live executions (green) */}
      <path d={area(execPts)}   fill="url(#ual-exec)" />
      <path d={smooth(execPts)} fill="none" stroke="#00ff8a" strokeWidth={1.5} strokeOpacity={0.6} />

      {/* Users trading (purple) */}
      <path d={area(trdPts)}   fill="url(#ual-trd)" />
      <path d={smooth(trdPts)} fill="none" stroke="#cc55ff" strokeWidth={2} />

      {/* Active sessions (cyan, front) */}
      <path d={area(sesPts)}   fill="url(#ual-ses)" />
      <path d={smooth(sesPts)} fill="none" stroke="#00f0ff" strokeWidth={2.5} />

      {lastSes && (
        <circle cx={lastSes.x} cy={lastSes.y} r={3.5} fill="#00f0ff"
          style={{ filter: "drop-shadow(0 0 6px #00f0ff)" }} />
      )}

      {[0, 25, 50, 75, 100].map(p => (
        <text key={p}
          x={pl - 4} y={pt + (1 - p / 100) * cH + 3.5}
          textAnchor="end" fontSize={7} fill="#1e3040" fontFamily="monospace">
          {p}
        </text>
      ))}

      {([
        { label: "ACTIVE SESSIONS",  color: "#00f0ff" },
        { label: "USERS TRADING",    color: "#cc55ff" },
        { label: "LIVE EXECUTIONS",  color: "#00ff8a" },
        { label: "NEW JOINS",        color: "#ff9900" },
      ]).map((l, i) => (
        <g key={l.label} transform={`translate(${pl + 8 + i * 165}, ${pt + 10})`}>
          <line x1={0} y1={4} x2={16} y2={4} stroke={l.color} strokeWidth={2.5} />
          <text x={20} y={8} fontSize={8} fill={`${l.color}90`} fontFamily="monospace">
            {l.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── Metric strip cell ───────────────────────────────────────────────────── */
function MetCell({
  label, value, color, pulse = false,
}: { label: string; value: string | number; color: string; pulse?: boolean }) {
  return (
    <div style={{
      padding:     "4px 14px",
      borderRight: "1px solid #0a1422",
      flexShrink:  0,
      position:    "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", top: 5, right: 8,
          width: 3.5, height: 3.5, borderRadius: "50%",
          background: color, boxShadow: `0 0 5px ${color}`,
        }} className="live-dot" />
      )}
      <div style={{
        fontSize:      18,
        fontWeight:    700,
        fontFamily:    "monospace",
        color,
        lineHeight:    1,
        letterSpacing: "-0.02em",
        textShadow:    `0 0 12px ${color}30`,
        marginBottom:  2,
      }}>
        {value}
      </div>
      <div style={{
        fontSize:      7,
        fontFamily:    "monospace",
        color:         "#2a4050",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>
        {label}
      </div>
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────── */
export function LiveUserActivityPanel({ engine }: Props) {

  const [data, setData] = useState<Pt[]>(() =>
    Array.from({ length: CHART_N }, (_, i) => ({
      sessions:   20 + Math.sin(i * 0.3) * 8  + Math.random() * 5,
      trading:    7  + Math.sin(i * 0.4) * 3  + Math.random() * 2,
      executions: 4  + Math.cos(i * 0.5) * 3  + Math.random() * 4,
      joins:      2  + Math.random() * 8,
    }))
  );

  const [execIdx,   setExecIdx]   = useState<number[]>([]);
  const [sessions,  setSessions]  = useState(24);
  const [trading,   setTrading]   = useState(8);
  const [joins,     setJoins]     = useState(0);
  const [conns,     setConns]     = useState(12);

  const prevExecRef = useRef(0);
  const engRef      = useRef(engine);
  useEffect(() => { engRef.current = engine; }, [engine]);

  useEffect(() => {
    const id = setInterval(() => {
      const eng    = engRef.current;
      const execs  = eng?.tradesExecuted ?? 0;
      const isExec = execs > prevExecRef.current;
      prevExecRef.current = execs;

      const sesTarget  = eng?.running ? 30 : 18;
      const trdTarget  = eng?.running ? 11 : 5;
      const joinSpike  = Math.random() < 0.10;

      setData(prev => {
        const last = prev[prev.length - 1] ?? { sessions: 24, trading: 8, executions: 6, joins: 3 };
        return [...prev.slice(1), {
          sessions:   Math.max(8,  Math.min(95, last.sessions   + (sesTarget - last.sessions) * 0.1  + (Math.random() - 0.5) * 4)),
          trading:    Math.max(2,  Math.min(55, last.trading    + (trdTarget - last.trading)  * 0.12 + (Math.random() - 0.5) * 2.5)),
          executions: Math.max(1,  Math.min(98, isExec ? 88 + Math.random() * 10 : Math.max(3, last.executions * 0.72 + (Math.random() - 0.5) * 3))),
          joins:      Math.max(0,  Math.min(80, joinSpike ? 35 + Math.random() * 40 : 3 + Math.random() * 6)),
        }];
      });

      if (isExec) {
        setExecIdx(prev => [...prev.slice(-12), CHART_N - 1]);
      }

      setSessions(p => Math.max(10, Math.min(52, p + Math.round((Math.random() - 0.5) * 2))));
      setTrading(p  => Math.max(2,  Math.min(20, p + Math.round((Math.random() - 0.5) * 1))));
      setJoins(p    => p + (Math.random() < 0.14 ? 1 : 0));
      setConns(p    => Math.max(4,  Math.min(24, p + Math.round((Math.random() - 0.45) * 1))));
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  const riskBlocks = engine?.tradesBlocked   ?? 0;
  const execCount  = engine?.tradesExecuted  ?? 0;

  const metrics: Array<{ label: string; value: string | number; color: string; pulse?: boolean }> = [
    { label: "ACTIVE SESSIONS",  value: sessions,   color: "#00f0ff", pulse: true           },
    { label: "USERS TRADING",    value: trading,    color: "#cc55ff"                         },
    { label: "NEW JOINS TODAY",  value: joins,      color: "#ff9900"                         },
    { label: "EXCHANGE CONNS",   value: conns,      color: "#ffaa00"                         },
    { label: "RISK BLOCKS",      value: riskBlocks, color: riskBlocks > 50 ? "#ff3355" : "#ff6644" },
    { label: "USER EXECUTIONS",  value: execCount,  color: "#00ff8a", pulse: execCount > 0  },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#000000", minHeight: 0 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        padding:      "5px 14px",
        borderBottom: "1px solid #08141e",
        flexShrink:   0,
      }}>
        <Users size={9} color="#00f0ff" />
        <span style={{
          fontSize:      8,
          fontFamily:    "monospace",
          fontWeight:    700,
          color:         "#00f0ff65",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
        }}>
          Live User Activity
        </span>
        <span style={{
          fontSize:      7,
          fontFamily:    "monospace",
          color:         "#1e3040",
          marginLeft:    6,
          letterSpacing: "0.1em",
        }}>
          PLATFORM TRAFFIC · REAL-TIME OPERATOR INTELLIGENCE
        </span>
        <div style={{ flex: 1 }} />
        <Activity size={7} color="#00ff8a" />
        <span className="live-dot" style={{ width: 4, height: 4, marginLeft: 4 }} />
      </div>

      {/* ── Metric strip ───────────────────────────────────────────────────── */}
      <div style={{
        display:        "flex",
        borderBottom:   "1px solid #08141e",
        flexShrink:     0,
        overflowX:      "auto",
        scrollbarWidth: "none",
        background:     "#000000",
      }}>
        {metrics.map(m => (
          <MetCell key={m.label} {...m} />
        ))}
      </div>

      {/* ── Multi-stream activity chart ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 80 }}>
        <UserActivityChart data={data} execIdx={execIdx} />
      </div>
    </div>
  );
}
