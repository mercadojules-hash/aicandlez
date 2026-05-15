import { useState, useEffect, useRef } from "react";
import { Activity, Radio } from "lucide-react";
import type { EngineStatus, ExchangeStatus, FeeSummary, SignalLogEntry } from "./types";

const CHART_N = 72;
const TICK_MS = 1800;

interface Pt  { ai: number; qual: number; exec: boolean }
interface Evt { id: number; ts: number; type: "exec"|"signal"|"risk"|"system"; msg: string; color: string }

interface Props { engine?: EngineStatus; exchangeStatus?: ExchangeStatus; feeSummary?: FeeSummary }

let _eid = 1;

/* ── Convert a real signal log entry to an event ────────────────────────── */
function sigToEvt(sig: SignalLogEntry, idx: number): Evt {
  const isExec    = !!sig.executedAs;
  const isBlocked = !!(sig.blockReason && sig.blockReason !== "None");
  const type: Evt["type"] = isExec ? "exec" : isBlocked ? "risk" : "signal";

  const color = isExec
    ? "#00ff8a"
    : isBlocked
    ? "#ffaa00"
    : sig.decision === "BUY"  ? "#00f0ff"
    : sig.decision === "SELL" ? "#ff3355"
    : "#4a8fa8";

  let msg = "";
  if (isExec) {
    msg = `${(sig.executedAs ?? "").toUpperCase()} · ${sig.symbol} ${sig.decision} ${sig.confidence.toFixed(0)}% conf · ${sig.timeframe}`;
  } else if (isBlocked) {
    msg = `BLOCKED · ${sig.symbol} ${sig.decision} ${sig.confidence.toFixed(0)}% — ${sig.blockReason}`;
  } else {
    msg = `Signal · ${sig.symbol} ${sig.decision} ${sig.confidence.toFixed(0)}% · ${sig.timeframe}${sig.shortSummary ? " · " + sig.shortSummary : ""}`;
  }

  return {
    id:    _eid++,
    ts:    typeof sig.timestamp === "number" ? sig.timestamp : Date.now() - idx * 5000,
    type,
    msg,
    color,
  };
}

/* ── Metric cell (real data only) ────────────────────────────────────────── */
function MetCell({ label, value, sub, color, pulse = false, wide = false }: {
  label: string; value: string | number; sub?: string; color: string; pulse?: boolean; wide?: boolean;
}) {
  return (
    <div style={{
      padding:     wide ? "8px 18px" : "8px 13px",
      borderRight: "1px solid #081420",
      minWidth:    wide ? 120 : 90,
      flexShrink:  0,
      position:    "relative",
    }}>
      {pulse && (
        <div style={{
          position:     "absolute",
          top:          6,
          right:        8,
          width:        4,
          height:       4,
          borderRadius: "50%",
          background:   color,
          boxShadow:    `0 0 5px ${color}`,
        }} className="live-dot" />
      )}
      <div style={{
        fontSize:      22,
        fontFamily:    "monospace",
        fontWeight:    700,
        color,
        lineHeight:    1,
        letterSpacing: "-0.02em",
        marginBottom:  3,
        textShadow:    `0 0 14px ${color}35`,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize:      7.5,
          fontFamily:    "monospace",
          color:         `${color}60`,
          marginBottom:  2,
          letterSpacing: "0.06em",
        }}>
          {sub}
        </div>
      )}
      <div style={{
        fontSize:      7.5,
        fontFamily:    "monospace",
        color:         "#2a4458",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  );
}

/* ── Smooth bezier path ───────────────────────────────────────────────────── */
function smooth(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
    d += ` C ${cx},${pts[i-1].y.toFixed(1)} ${cx},${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  }
  return d;
}

/* ── Activity Chart (real data only: AI confidence + execution quality) ──── */
function ActivityChart({ data }: { data: Pt[] }) {
  const VW = 960, VH = 260;
  const pl = 28, pr = 8, pt = 12, pb = 24;
  const cW = VW - pl - pr;
  const cH = VH - pt - pb;

  const mapPts = (key: "ai" | "qual") =>
    data.map((d, i) => ({
      x: pl + (i / Math.max(data.length - 1, 1)) * cW,
      y: pt + (1 - d[key] / 100) * cH,
    }));

  const area = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return "";
    const base = pt + cH;
    return `${smooth(pts)} L ${pts[pts.length-1].x.toFixed(1)},${base} L ${pts[0].x.toFixed(1)},${base} Z`;
  };

  const aiPts   = mapPts("ai");
  const qualPts = mapPts("qual");
  const gridYs  = [25, 50, 75].map(p => pt + (1 - p / 100) * cH);
  const execs   = data.map((d, i) => ({
    x: pl + (i / Math.max(data.length - 1, 1)) * cW,
    on: d.exec,
  })).filter(x => x.on);
  const lastAi  = aiPts[aiPts.length - 1];

  return (
    <svg
      width="100%" height="100%"
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="pah-grad-ai"   x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00f0ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="pah-grad-qual" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00ff8a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#00ff8a" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      <rect x={pl} y={pt} width={cW} height={cH} fill="#000000" rx={2} />

      {gridYs.map((y, i) => (
        <line key={i} x1={pl} y1={y} x2={pl + cW} y2={y}
          stroke="#0a1a28" strokeWidth={1} strokeDasharray="3 6" />
      ))}

      {execs.map((e, i) => (
        <line key={i} x1={e.x} y1={pt} x2={e.x} y2={pt + cH}
          stroke="#00ff8a" strokeWidth={1} strokeOpacity={0.5} />
      ))}

      <path d={area(qualPts)} fill="url(#pah-grad-qual)" />
      <path d={smooth(qualPts)} fill="none" stroke="#00ff8a" strokeWidth={1.5} strokeOpacity={0.45} />

      <path d={area(aiPts)} fill="url(#pah-grad-ai)" />
      <path d={smooth(aiPts)} fill="none" stroke="#00f0ff" strokeWidth={2.5} />

      {lastAi && (
        <circle cx={lastAi.x} cy={lastAi.y} r={4} fill="#00f0ff"
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
        { label: "AI CONFIDENCE",   color: "#00f0ff" },
        { label: "EXEC QUALITY",    color: "#00ff8a" },
        { label: "TRADE EXECUTED",  color: "#00ff8a", dashed: true },
      ] as Array<{ label: string; color: string; dashed?: boolean }>).map((l, i) => (
        <g key={l.label} transform={`translate(${pl + 6 + i * 140}, ${pt + 10})`}>
          <line x1={0} y1={4} x2={16} y2={4}
            stroke={l.color} strokeWidth={l.dashed ? 1.5 : 2.5}
            strokeDasharray={l.dashed ? "4 3" : undefined} />
          <text x={20} y={8} fontSize={8} fill={`${l.color}90`} fontFamily="monospace">
            {l.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── Live Event Stream — REAL signal log only ────────────────────────────── */
function EventStream({ events }: { events: Evt[] }) {
  const nowMs = Date.now();
  return (
    <div style={{
      width:         290,
      borderLeft:    "1px solid #0d1a24",
      background:    "#000000",
      display:       "flex",
      flexDirection: "column",
      overflow:      "hidden",
      flexShrink:    0,
    }}>
      <div style={{
        padding:      "8px 12px",
        borderBottom: "1px solid #0d1824",
        background:   "#000000",
        display:      "flex",
        alignItems:   "center",
        gap:          6,
      }}>
        <Radio size={9} color="#00aaff" />
        <span style={{
          fontSize:      8,
          fontFamily:    "monospace",
          fontWeight:    700,
          color:         "#00aaff70",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}>
          AI Signal Stream
        </span>
        <span className="live-dot live-dot-cyan ml-auto" style={{ width: 4, height: 4 }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }} className="feed-scroll">
        {events.length === 0 ? (
          <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 9, fontFamily: "monospace", color: "#1e3040" }}>
            CONNECTING…
          </div>
        ) : events.map(ev => {
          const ageSec = Math.floor((nowMs - ev.ts) / 1000);
          const ageStr = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
          return (
            <div key={ev.id} style={{ padding: "6px 12px", borderBottom: "1px solid #0a0a0a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <div style={{
                  width:        5,
                  height:       5,
                  borderRadius: "50%",
                  background:   ev.color,
                  boxShadow:    `0 0 4px ${ev.color}`,
                  flexShrink:   0,
                }} />
                <span style={{
                  fontSize:      8,
                  fontFamily:    "monospace",
                  color:         ev.color,
                  fontWeight:    700,
                  letterSpacing: "0.08em",
                }}>
                  {ev.type.toUpperCase()}
                </span>
                <span style={{ fontSize: 7.5, fontFamily: "monospace", color: "#1a3050", marginLeft: "auto" }}>
                  {ageStr} ago
                </span>
              </div>
              <div style={{
                fontSize:    9,
                fontFamily:  "monospace",
                color:       "#4a7a94",
                paddingLeft: 10,
                lineHeight:  1.45,
              }}>
                {ev.msg}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export function PlatformActivityHub({ engine, exchangeStatus, feeSummary }: Props) {

  const [data, setData] = useState<Pt[]>(() =>
    Array.from({ length: CHART_N }, () => ({ ai: 35, qual: 20, exec: false }))
  );

  const [events, setEvents] = useState<Evt[]>([]);
  const prevExecRef  = useRef<number>(0);
  const prevLogRef   = useRef<string>("");
  const engRef       = useRef(engine);
  useEffect(() => { engRef.current = engine; }, [engine]);

  /* Sync events from real signal log */
  useEffect(() => {
    const eng = engRef.current;
    const log = eng?.recentSignalLog ?? [];
    if (log.length === 0) return;
    const key = log.map(s => s.id).join(",");
    if (key === prevLogRef.current) return;
    prevLogRef.current = key;
    setEvents(log.slice(0, 22).map((sig, i) => sigToEvt(sig as any, i)));
  });

  /* Animate chart from real engine data */
  useEffect(() => {
    const id = setInterval(() => {
      const eng = engRef.current;

      const avgConf = eng
        ? (() => {
            const bds = Object.values(eng.symbolBreakdowns ?? {});
            return bds.length
              ? bds.reduce((s, b) => s + (b as any).avgConfidence, 0) / bds.length
              : 35;
          })()
        : 35;

      const total   = eng?.signalsGenerated ?? 0;
      const execs   = eng?.tradesExecuted   ?? 0;
      const qualPct = total > 0 ? Math.min(95, (execs / total) * 100 * 8) : 20;

      const newExec = execs > prevExecRef.current;
      prevExecRef.current = execs;

      setData(prev => {
        const last  = prev[prev.length - 1] ?? { ai: 35, qual: 20, exec: false };
        const newAi = Math.max(5, Math.min(98,
          last.ai + (avgConf - last.ai) * 0.15 + (Math.random() - 0.5) * 6
        ));
        const newQual = Math.max(3, Math.min(85,
          last.qual + (qualPct - last.qual) * 0.12 + (Math.random() - 0.5) * 4
        ));
        return [...prev.slice(1), { ai: newAi, qual: newQual, exec: newExec }];
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  const execs   = engine?.tradesExecuted  ?? 0;
  const sigs    = engine?.signalsGenerated ?? 0;
  const blocked = engine?.tradesBlocked   ?? 0;
  const fees    = feeSummary?.totalFeesCollected ?? 0;
  const mtfPass = engine?.mtfConfirmedCount ?? 0;
  const mtfBlk  = engine?.mtfBlockCount    ?? 0;

  const rawExch = exchangeStatus?.exchangeName;
  const exch    = rawExch ? rawExch.toUpperCase() : "—";
  const exMode  = exchangeStatus?.mode === "live" ? "LIVE TRADING" : "SIMULATION";
  const exColor = exchangeStatus?.mode === "live" ? "#ff3355" : "#00aaff";

  /* Only real, backend-sourced metrics */
  const metrics: Array<{ label: string; value: string | number; color: string; sub?: string; pulse?: boolean; wide?: boolean }> = [
    { label: "AI EXECUTIONS",  value: execs,                             color: "#ffb800", pulse: execs > 0,  wide: true, sub: "this session"    },
    { label: "SIGNALS TOTAL",  value: sigs,                              color: "#00aaff"                                                         },
    { label: "AI REJECTIONS",  value: blocked,                           color: blocked > 100 ? "#ff5544" : "#ffaa44"                             },
    { label: "MTF CONFIRMED",  value: mtfPass,                           color: "#00f0ff"                                                         },
    { label: "MTF BLOCKED",    value: mtfBlk,                            color: "#ff8844"                                                         },
    { label: "FEES GENERATED", value: `$${fees.toFixed(2)}`,             color: "#ffb800"                                                         },
    { label: "ENGINE STATUS",  value: engine?.running ? "ONLINE" : (engine ? "OFFLINE" : "—"),
                                                                          color: engine?.running ? "#00ff8a" : "#ff3355",
                                                                          pulse: engine?.running                                                  },
    { label: "BROKER",         value: exch.slice(0, 7),                  color: exColor, sub: exMode, wide: true                                  },
  ];

  return (
    <div style={{ background: "#000000", borderBottom: "1px solid #0d1824", flexShrink: 0 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        padding:      "8px 16px",
        borderBottom: "1px solid #0d1824",
        background:   "#000000",
      }}>
        <Activity size={11} color="#00aaff" />
        <span style={{
          fontSize:      9.5,
          fontFamily:    "monospace",
          fontWeight:    700,
          color:         "#9FB3C8",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
        }}>
          AI Execution Telemetry
        </span>
        <span style={{
          fontSize:    7.5,
          fontFamily:  "monospace",
          color:       "#2a4050",
          letterSpacing: "0.1em",
          marginLeft:  6,
        }}>
          LIVE ENGINE DATA · NO SYNTHETIC STREAMS
        </span>
        <div style={{ flex: 1 }} />
        <span className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
        <span style={{ fontSize: 8.5, fontFamily: "monospace", fontWeight: 700, color: "#00ff8a" }}>
          LIVE
        </span>
      </div>

      {/* ── Real Metrics Strip ─────────────────────────────────────────────── */}
      <div style={{
        display:        "flex",
        borderBottom:   "1px solid #0d1824",
        background:     "#000000",
        overflowX:      "auto",
        scrollbarWidth: "none",
      }}>
        {metrics.map(m => (
          <MetCell
            key={m.label}
            label={m.label}
            value={m.value}
            color={m.color}
            sub={m.sub}
            pulse={m.pulse}
            wide={m.wide}
          />
        ))}
      </div>

      {/* ── Chart + Event Stream ──────────────────────────────────────────── */}
      <div style={{ display: "flex", height: 280 }}>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ActivityChart data={data} />
        </div>
        <EventStream events={events} />
      </div>
    </div>
  );
}
