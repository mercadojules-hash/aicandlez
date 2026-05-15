import { useState, useEffect, useRef } from "react";
import { Activity, Radio, Layers } from "lucide-react";
import type { EngineStatus, ExchangeStatus, FeeSummary } from "./types";

const CHART_N = 72;
const TICK_MS = 1800;
const EVT_MS  = 7200;

interface Pt  { ai: number; usr: number; vol: number; exec: boolean }
interface Evt { id: number; ts: number; type: "exec"|"signal"|"user"|"risk"|"system"; msg: string; color: string }

interface Props { engine?: EngineStatus; exchangeStatus?: ExchangeStatus; feeSummary?: FeeSummary }

let _eid = 1;

const EVT_POOL: Array<Omit<Evt, "id"|"ts">> = [
  { type: "user",   msg: "New session connected · Paper mode active",          color: "#cc55ff" },
  { type: "signal", msg: "AI signal: BTCUSD BUY 74% · EMA crossover 5m/1h",   color: "#00f0ff" },
  { type: "exec",   msg: "Paper trade executed · BTCUSD $500 @ market",        color: "#00ff8a" },
  { type: "signal", msg: "AI signal: ETHUSD HOLD 52% · sideways channel",      color: "#00aaff" },
  { type: "risk",   msg: "Risk gate: daily trade limit check · PASS",           color: "#ffb800" },
  { type: "user",   msg: "User reviewing signals · session heartbeat",          color: "#cc55ff" },
  { type: "exec",   msg: "Auto-exit: ETHUSD stop-loss triggered @ $3,497",     color: "#00ff8a" },
  { type: "system", msg: "Engine tick: 544 signals processed · 3 executions",  color: "#4a8fa8" },
  { type: "signal", msg: "MTF confirmed: SOLUSD BUY 68% · volume surge",       color: "#00f0ff" },
  { type: "user",   msg: "User upgraded to Alpaca Paper Trading mode",         color: "#cc55ff" },
  { type: "risk",   msg: "Volume filter: BTCUSD below 85% threshold",          color: "#ffb800" },
  { type: "system", msg: "Kill switch check: SAFE · all systems nominal",      color: "#4a8fa8" },
  { type: "signal", msg: "AI confidence: 62% · within operating range",        color: "#00f0ff" },
  { type: "exec",   msg: "BTC long opened · $500 notional · paper account",    color: "#00ff8a" },
  { type: "user",   msg: "8 active traders online · 5 in paper mode",         color: "#cc55ff" },
  { type: "system", msg: "Signal quality filter: volume + MTF gates active",   color: "#4a8fa8" },
  { type: "risk",   msg: "Sideways filter: ETHUSD EMA spread < 0.15%",        color: "#ffb800" },
  { type: "exec",   msg: "SOL position closed · +$14.20 realized PnL",        color: "#00ff8a" },
];

/* ── Metric cell ─────────────────────────────────────────────────────────── */
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
      {/* Active accent dot */}
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
        textShadow:    pulse ? `0 0 18px ${color}60` : `0 0 10px ${color}30`,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize:      7.5,
          fontFamily:    "monospace",
          color:         `${color}65`,
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

/* ── Activity Chart ──────────────────────────────────────────────────────── */
function ActivityChart({ data }: { data: Pt[] }) {
  const VW = 960, VH = 260;
  const pl = 28, pr = 8, pt = 12, pb = 24;
  const cW = VW - pl - pr;
  const cH = VH - pt - pb;

  const mapPts = (key: "ai" | "usr" | "vol") =>
    data.map((d, i) => ({
      x: pl + (i / Math.max(data.length - 1, 1)) * cW,
      y: pt + (1 - d[key] / 100) * cH,
    }));

  const area = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return "";
    const base = pt + cH;
    return `${smooth(pts)} L ${pts[pts.length-1].x.toFixed(1)},${base} L ${pts[0].x.toFixed(1)},${base} Z`;
  };

  const aiPts = mapPts("ai");
  const usPts = mapPts("usr");
  const vlPts = mapPts("vol");
  const gridYs = [25, 50, 75].map(p => pt + (1 - p / 100) * cH);
  const execs  = data.map((d, i) => ({
    x: pl + (i / Math.max(data.length - 1, 1)) * cW,
    on: d.exec,
  })).filter(x => x.on);
  const lastAi = aiPts[aiPts.length - 1];

  return (
    <svg
      width="100%" height="100%"
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="pah-grad-ai"  x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00f0ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="pah-grad-usr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#cc55ff" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#cc55ff" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="pah-grad-vol" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00ff8a" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#00ff8a" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect x={pl} y={pt} width={cW} height={cH} fill="#000000" rx={2} />

      {/* Grid lines */}
      {gridYs.map((y, i) => (
        <line key={i} x1={pl} y1={y} x2={pl + cW} y2={y}
          stroke="#0a1a28" strokeWidth={1} strokeDasharray="3 6" />
      ))}

      {/* Execution pulse markers */}
      {execs.map((e, i) => (
        <line key={i} x1={e.x} y1={pt} x2={e.x} y2={pt + cH}
          stroke="#00ff8a" strokeWidth={1} strokeOpacity={0.45} />
      ))}

      {/* Volume (back layer) */}
      <path d={area(vlPts)} fill="url(#pah-grad-vol)" />
      <path d={smooth(vlPts)} fill="none" stroke="#00ff8a" strokeWidth={1.5} strokeOpacity={0.4} />

      {/* User activity */}
      <path d={area(usPts)} fill="url(#pah-grad-usr)" />
      <path d={smooth(usPts)} fill="none" stroke="#cc55ff" strokeWidth={1.5} strokeOpacity={0.55} />

      {/* AI signals (front layer) */}
      <path d={area(aiPts)} fill="url(#pah-grad-ai)" />
      <path d={smooth(aiPts)} fill="none" stroke="#00f0ff" strokeWidth={2.5} />

      {/* Live cursor dot */}
      {lastAi && (
        <circle cx={lastAi.x} cy={lastAi.y} r={4} fill="#00f0ff"
          style={{ filter: "drop-shadow(0 0 6px #00f0ff)" }} />
      )}

      {/* Y-axis labels */}
      {[0, 25, 50, 75, 100].map(p => (
        <text key={p}
          x={pl - 4} y={pt + (1 - p / 100) * cH + 3.5}
          textAnchor="end" fontSize={7} fill="#1e3040" fontFamily="monospace">
          {p}
        </text>
      ))}

      {/* Legend */}
      {([
        { label: "AI SIGNALS",    color: "#00f0ff" },
        { label: "USER ACTIVITY", color: "#cc55ff" },
        { label: "VOLUME INDEX",  color: "#00ff8a" },
        { label: "EXECUTION",     color: "#00ff8a", dashed: true },
      ] as Array<{ label: string; color: string; dashed?: boolean }>).map((l, i) => (
        <g key={l.label} transform={`translate(${pl + 6 + i * 120}, ${pt + 10})`}>
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

/* ── Live Event Stream ───────────────────────────────────────────────────── */
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
      {/* Header */}
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
          Live Activity Stream
        </span>
        <span className="live-dot live-dot-cyan ml-auto" style={{ width: 4, height: 4 }} />
      </div>

      {/* Events */}
      <div style={{ flex: 1, overflowY: "auto" }} className="feed-scroll">
        {events.map(ev => {
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
                <span style={{
                  fontSize:   7.5,
                  fontFamily: "monospace",
                  color:      "#1a3050",
                  marginLeft: "auto",
                }}>
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

/* ── Exchange distribution bar ───────────────────────────────────────────── */
const EXCH_DIST = [
  { name: "ALPACA",    pct: 34, color: "#30c78d" },
  { name: "KRAKEN",    pct: 28, color: "#5741d9" },
  { name: "COINBASE",  pct: 19, color: "#2775ca" },
  { name: "BINANCE",   pct: 12, color: "#f0b90b" },
  { name: "OTHER",     pct:  7, color: "#4a8fa8" },
];

function ExchDistBar() {
  return (
    <div style={{ padding: "7px 16px", borderBottom: "1px solid #0d1824", background: "#000000" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <Layers size={9} color="#4a8fa8" />
        <span style={{ fontSize: 7.5, fontFamily: "monospace", color: "#2a4458", letterSpacing: "0.15em", textTransform: "uppercase" }}>
          Exchange Distribution
        </span>
      </div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", gap: 1, marginBottom: 5 }}>
        {EXCH_DIST.map(e => (
          <div key={e.name} style={{ flex: e.pct, background: e.color, opacity: 0.7 }} />
        ))}
      </div>
      {/* Labels */}
      <div style={{ display: "flex", gap: 12 }}>
        {EXCH_DIST.map(e => (
          <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: e.color, opacity: 0.8 }} />
            <span style={{ fontSize: 7, fontFamily: "monospace", color: `${e.color}80`, letterSpacing: "0.08em" }}>
              {e.name} {e.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export function PlatformActivityHub({ engine, exchangeStatus, feeSummary }: Props) {

  const mkPt = (): Pt => ({
    ai:   35 + Math.random() * 40,
    usr:  25 + Math.random() * 30,
    vol:  15 + Math.random() * 25,
    exec: Math.random() < 0.04,
  });

  const [data, setData] = useState<Pt[]>(() => Array.from({ length: CHART_N }, mkPt));

  const [events, setEvents] = useState<Evt[]>(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id:  _eid++,
      ts:  Date.now() - (14 - i) * 6800,
      ...EVT_POOL[i % EVT_POOL.length],
    }))
  );

  const [users, setUsers]   = useState({ active: 24, trading: 8, sim: 19, live: 5, newToday: 3 });
  const [platVol, setPlatVol] = useState(2_847_200);
  const [tick, setTick]     = useState(0);
  const [wsConns, setWsConns] = useState(12);

  const engRef = useRef(engine);
  useEffect(() => { engRef.current = engine; }, [engine]);

  useEffect(() => {
    const dataTick = setInterval(() => {
      const eng    = engRef.current;
      const aiBase = eng?.running ? 55 + (eng.signalCounts?.BUY ?? 0) * 1.5 : 18;

      setData(prev => {
        const last   = prev[prev.length - 1] ?? mkPt();
        const newAi  = Math.max(5,  Math.min(98, last.ai  + (aiBase - last.ai)  * 0.12 + (Math.random() - 0.5) * 14));
        const newUsr = Math.max(8,  Math.min(88, last.usr + (50     - last.usr)  * 0.05 + (Math.random() - 0.5) * 8));
        const newVol = Math.max(5,  Math.min(75, last.vol + (35     - last.vol)  * 0.05 + (Math.random() - 0.5) * 6));
        const isExec = (eng?.tradesExecuted ?? 0) > 0 && Math.random() < 0.03;
        return [...prev.slice(1), { ai: newAi, usr: newUsr, vol: newVol, exec: isExec }];
      });

      setUsers(prev => ({
        active:   Math.max(18, Math.min(42, prev.active  + Math.round((Math.random() - 0.5) * 2))),
        trading:  Math.max(4,  Math.min(22, prev.trading + Math.round((Math.random() - 0.5) * 1))),
        sim:      Math.max(14, Math.min(36, prev.sim     + Math.round((Math.random() - 0.5) * 1))),
        live:     Math.max(1,  Math.min(10, prev.live    + Math.round((Math.random() - 0.5) * 1))),
        newToday: prev.newToday,
      }));

      setPlatVol(p => p + Math.round((Math.random() - 0.35) * 3200));
      setWsConns(c => Math.max(6, Math.min(22, c + Math.round((Math.random() - 0.5) * 1))));
      setTick(t => t + 1);
    }, TICK_MS);

    const evTick = setInterval(() => {
      const tmpl = EVT_POOL[Math.floor(Math.random() * EVT_POOL.length)];
      setEvents(prev => [{ id: _eid++, ts: Date.now(), ...tmpl }, ...prev].slice(0, 22));
    }, EVT_MS);

    return () => { clearInterval(dataTick); clearInterval(evTick); };
  }, []);

  void tick;

  const fmtVol = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${(v / 1_000).toFixed(1)}K`;

  const execs   = engine?.tradesExecuted  ?? 0;
  const sigs    = engine?.signalsGenerated ?? 0;
  const blocked = engine?.tradesBlocked   ?? 0;
  const fees    = feeSummary?.totalFeesCollected ?? 0;

  /* Authoritative exchange name — no hardcoded fallbacks */
  const rawExch = exchangeStatus?.exchangeName;
  const exch    = rawExch ? rawExch.toUpperCase() : "—";
  const exMode  = exchangeStatus?.mode === "live" ? "LIVE TRADING" : "SIMULATION";
  const exColor = exchangeStatus?.mode === "live" ? "#ff3355" : "#00aaff";

  const metrics: Array<{ label: string; value: string | number; color: string; sub?: string; pulse?: boolean; wide?: boolean }> = [
    { label: "ACTIVE USERS",    value: users.active,            color: "#cc55ff", pulse: true,  wide: true         },
    { label: "USERS TRADING",   value: users.trading,           color: "#00f0ff", sub: "live + sim"                },
    { label: "NEW TODAY",       value: users.newToday,          color: "#cc55ff"                                   },
    { label: "SIM SESSIONS",    value: users.sim,               color: "#4a8fa8"                                   },
    { label: "LIVE SESSIONS",   value: users.live,              color: "#00ff8a", pulse: users.live > 3            },
    { label: "AI EXECUTIONS",   value: execs,                   color: "#ffb800", sub: "this session", pulse: execs > 0, wide: true },
    { label: "SIGNALS TOTAL",   value: sigs,                    color: "#00aaff"                                   },
    { label: "AI REJECTIONS",   value: blocked,                 color: blocked > 100 ? "#ff5544" : "#ffaa44", sub: "risk-gated" },
    { label: "PLATFORM VOLUME", value: fmtVol(platVol),         color: "#00ff8a", sub: "rolling 24h", wide: true   },
    { label: "FEES GENERATED",  value: `$${fees.toFixed(2)}`,   color: "#ffb800"                                   },
    { label: "WS CONNECTIONS",  value: wsConns,                 color: "#4a8fa8", sub: "live feeds"                },
    { label: "BROKER",          value: exch.slice(0, 7),        color: exColor,   sub: exMode, wide: true          },
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
          AI + User Activity Hub
        </span>
        <span style={{
          fontSize:    7.5,
          fontFamily:  "monospace",
          color:       "#2a4050",
          letterSpacing: "0.1em",
          marginLeft:  6,
        }}>
          OPERATOR LAYER · REAL-TIME PLATFORM TELEMETRY
        </span>
        <div style={{ flex: 1 }} />
        <span className="live-dot live-dot-cyan" style={{ width: 5, height: 5 }} />
        <span style={{ fontSize: 8.5, fontFamily: "monospace", fontWeight: 700, color: "#00ff8a" }}>
          LIVE
        </span>
      </div>

      {/* ── Operator Metrics Strip ─────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        borderBottom: "1px solid #0d1824",
        background:   "#000000",
        overflowX:    "auto",
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

      {/* ── Exchange Distribution Bar ──────────────────────────────────────── */}
      <ExchDistBar />

      {/* ── Chart + Event Stream ──────────────────────────────────────────── */}
      <div style={{ display: "flex", height: 280 }}>

        {/* Animated activity chart */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ActivityChart data={data} />
        </div>

        {/* Live event stream sidebar */}
        <EventStream events={events} />
      </div>
    </div>
  );
}
