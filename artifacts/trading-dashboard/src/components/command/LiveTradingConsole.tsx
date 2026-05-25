import { useState, useEffect, useRef } from "react";
import {
  Play, Pause, ShieldOff, Shield, Square,
  TrendingUp, TrendingDown, Clock, Zap, AlertTriangle, Activity, X, Trash2,
} from "lucide-react";
import type { EngineStatus, AppSettings, Trade, ExchangeStatus, SimAccount, LiveBalance } from "./types";
import { LiveUserActivityPanel } from "./LiveUserActivityPanel";

// ── Exchange options ──────────────────────────────────────────────────────────

const LIVE_EXCHANGES = [
  { id: "kraken",    label: "KRAKEN",     color: "#5741d9" },
  { id: "coinbase",  label: "COINBASE",   color: "#2775ca" },
  { id: "binance",   label: "BINANCE.US", color: "#f0b90b" },
  { id: "cryptocom", label: "CRYPTO.COM", color: "#1199fa" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  engine:                EngineStatus   | undefined;
  settings:              AppSettings    | undefined;
  exchangeStatus:        ExchangeStatus | undefined;
  trades:                Trade[]        | undefined;
  simAccount:            SimAccount     | undefined;
  liveBalance?:          LiveBalance    | undefined;
  activeId:              string;
  liveActive:            boolean;
  onToggleKill:          () => void;
  onTogglePause:         () => void;
  onStartEngine:         () => void;
  onStopEngine:          () => void;
  onSettingsPatch:       (patch: Record<string, number | boolean>) => void;
  onSelectSim:           () => void;
  onSelectLive:          (ex: string) => void;
  switchError?:          string | null;
  onClearSwitchError?:   () => void;
  onCloseAllPositions?:  () => void;
  closingAll?:           boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$( n: number, decimals = 2 ) {
  const abs = Math.abs(n);
  const str = abs >= 1_000_000 ? `$${(abs/1_000_000).toFixed(2)}M`
    : abs >= 1_000 ? `$${(abs/1_000).toFixed(2)}K`
    : `$${abs.toFixed(decimals)}`;
  return n < 0 ? `-${str}` : str;
}

function pctColor(n: number | null): string {
  if (n == null) return "#9FB3C8";
  return n > 0 ? "#00ff8a" : n < 0 ? "#ff3355" : "#9FB3C8";
}

function tradeDuration(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, valueColor = "#EAF2FF", big = false,
}: {
  label: string; value: string; sub?: string; valueColor?: string; big?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2 flex-1 min-w-0 border-r last:border-r-0"
      style={{ borderRightColor: "#0d1e2e" }}>
      <div className={`font-mono font-bold tabular-nums leading-none ${big ? "text-2xl" : "text-xl"}`}
        style={{ color: valueColor }}>
        {value}
      </div>
      {sub && (
        <div className="text-[9px] font-mono font-semibold leading-none mt-0.5"
          style={{ color: pctColor(parseFloat(sub)) }}>
          {parseFloat(sub) > 0 ? "▲" : parseFloat(sub) < 0 ? "▼" : ""} {sub}
        </div>
      )}
      <div className="text-[9px] font-mono font-medium uppercase tracking-[0.12em] leading-none mt-1"
        style={{ color: "#4a6070" }}>
        {label}
      </div>
    </div>
  );
}

function LargeButton({
  onClick, label, sub, icon: Icon, color, bgColor, borderColor, disabled = false,
}: {
  onClick: () => void; label: string; sub?: string; icon: React.ElementType;
  color: string; bgColor: string; borderColor: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 w-full font-mono font-bold transition-all rounded-md"
      style={{
        padding:       "12px 16px",
        fontSize:      "13px",
        letterSpacing: "0.08em",
        color,
        background:    bgColor,
        border:        `1px solid ${borderColor}`,
        boxShadow: `0 0 8px ${bgColor}40`,
        opacity:       disabled ? 0.35 : 1,
        cursor:        disabled ? "not-allowed" : "pointer",
      }}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <div className="flex flex-col items-start gap-0.5">
        <span>{label}</span>
        {sub && <span className="text-[9px] font-normal opacity-60">{sub}</span>}
      </div>
    </button>
  );
}

// ── Institutional signal-waiting visualization — full center fill ─────────────

function SignalWaitingViz() {
  const N = 90;
  const [pts, setPts] = useState<{ ai: number; risk: number; exec: boolean }[]>(() =>
    Array.from({ length: N }, (_, i) => ({
      ai:   35 + Math.sin(i * 0.14) * 22 + Math.cos(i * 0.09) * 12 + (Math.random() - 0.5) * 8,
      risk: Math.random() > 0.85 ? 6 + Math.random() * 20 : 0,
      exec: Math.random() > 0.91,
    }))
  );
  const [scan, setScan] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now() / 3200;
      const aiVal = 40 + Math.sin(t) * 20 + Math.cos(t * 1.6) * 12 + (Math.random() - 0.5) * 10;
      setPts(prev => [...prev.slice(1), {
        ai:   Math.max(5, Math.min(90, aiVal)),
        risk: Math.random() > 0.82 ? 6 + Math.random() * 20 : 0,
        exec: Math.random() > 0.90,
      }]);
      setScan(s => (s + 1) % N);
    }, 130);
    return () => clearInterval(id);
  }, []);

  const W = 800, H = 100;
  const aiLine = pts.map((p, i) => {
    const x = (i / (N - 1)) * W;
    const y = H - (p.ai / 100) * (H * 0.85) - 4;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const aiArea = `${aiLine} L ${W} ${H} L 0 ${H} Z`;
  const scanX = ((scan / N) * W).toFixed(1);

  return (
    <div className="border-t flex" style={{ borderTopColor: "#0a1828", background: "#000000", flex: 1, minHeight: 95 }}>

      {/* Main multi-stream chart */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ display: "block" }}>
          <defs>
            <linearGradient id="sviz-ai-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {[25, 50, 75].map(pct => {
            const y = H - (pct / 100) * (H * 0.85) - 4;
            return <line key={pct} x1={0} y1={y} x2={W} y2={y}
              stroke="#0d1e2e" strokeWidth={0.5} strokeDasharray="4,10" />;
          })}
          {/* AI signal area fill */}
          <path d={aiArea} fill="url(#sviz-ai-grad)" />
          {/* AI signal line */}
          <path d={aiLine} fill="none" stroke="#00f0ff" strokeWidth={1.5}
            style={{ filter: "drop-shadow(0 0 4px #00f0ff55)" }} />
          {/* Execution spikes — green vertical lines */}
          {pts.map((p, i) => !p.exec ? null : (
            <line key={`e${i}`}
              x1={(i / (N - 1)) * W} y1={H}
              x2={(i / (N - 1)) * W} y2={H - 38}
              stroke="#00ff8a" strokeWidth={2} opacity={0.8}
              style={{ filter: "drop-shadow(0 0 3px #00ff8a)" }} />
          ))}
          {/* Risk bars — red micro bars at bottom */}
          {pts.map((p, i) => p.risk <= 0 ? null : (
            <rect key={`r${i}`}
              x={(i / (N - 1)) * W - 2} y={H - p.risk}
              width={4} height={p.risk}
              fill="#ff3355" opacity={0.4} rx={1} />
          ))}
          {/* Scanning line */}
          <line x1={scanX} y1={0} x2={scanX} y2={H}
            stroke="#00f0ff" strokeWidth={0.8} opacity={0.22} />
        </svg>

        {/* Stream legend */}
        <div style={{ position: "absolute", top: 6, left: 10, display: "flex", gap: 14, alignItems: "center" }}>
          {[
            { color: "#00f0ff", label: "AI SIGNAL FLOW", dash: false },
            { color: "#00ff8a", label: "EXECUTIONS",     dash: false },
            { color: "#ff3355", label: "RISK BLOCKS",    dash: false },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 18, height: 2, background: color, borderRadius: 1,
                boxShadow: `0 0 4px ${color}60` }} />
              <span style={{ fontSize: 7, fontFamily: "monospace", color: `${color}65`,
                letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Bottom label */}
        <div style={{ position: "absolute", bottom: 6, left: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Activity style={{ width: 11, height: 11, color: "#1a3040", flexShrink: 0 }} />
          <span style={{ fontSize: 8.5, fontFamily: "monospace", fontWeight: 700,
            color: "#1a3040", letterSpacing: "0.22em", textTransform: "uppercase" }}>
            AI MONITORING — NO ACTIVE POSITIONS
          </span>
        </div>
      </div>

      {/* Right status column */}
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "space-evenly",
        padding: "8px 14px", borderLeft: "1px solid #0a1828", flexShrink: 0, width: 130,
      }}>
        {[
          { label: "SIGNAL FLOW",  color: "#00f0ff", pulse: true  },
          { label: "MTF ACTIVE",   color: "#cc55ff", pulse: true  },
          { label: "RISK GATE",    color: "#00ff8a", pulse: false },
          { label: "VOL CONFIRM",  color: "#ffaa00", pulse: false },
          { label: "SCANNING",     color: "#00aaff", pulse: true  },
          { label: "CORRELATION",  color: "#ff8844", pulse: false },
        ].map(({ label, color, pulse }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: color,
              boxShadow: `0 0 3px ${color}`, flexShrink: 0 }}
              className={pulse ? "live-dot" : ""} />
            <span style={{ fontSize: 7.5, fontFamily: "monospace",
              color: `${color}58`, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Smooth bezier path helper (Catmull-Rom → cubic bezier) ───────────────────
function smoothSvgPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const tension  = 0.38;
    const cpx0 = x0 + (x1 - x0) * tension;
    const cpx1 = x1 - (x1 - x0) * tension;
    d += ` C ${cpx0.toFixed(1)} ${y0.toFixed(1)} ${cpx1.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

// ── AI Microstructure Panel — flowing liquidity wave + pressure gradient ──────

function LiveAssetIntelPanel({ engine }: { engine?: EngineStatus }) {
  const N = 48;

  // Primary: AI confidence flow (smooth cyan wave)
  const [flowPts, setFlowPts] = useState<number[]>(() => {
    const pts: number[] = [];
    let v = 52;
    for (let i = 0; i < N; i++) {
      v = Math.max(8, Math.min(92, v + (Math.random() - 0.48) * 12 + Math.sin(i * 0.22) * 5));
      pts.push(v);
    }
    return pts;
  });

  // Secondary: market pressure (smooth orange/amber wave, offset phase)
  const [pressurePts, setPressurePts] = useState<number[]>(() => {
    const pts: number[] = [];
    let v = 45;
    for (let i = 0; i < N; i++) {
      v = Math.max(8, Math.min(88, v + (Math.random() - 0.50) * 10 + Math.cos(i * 0.19) * 4));
      pts.push(v);
    }
    return pts;
  });

  // Volume depth bars (translucent, bottom-aligned)
  const [volBars, setVolBars] = useState<number[]>(() =>
    Array.from({ length: N }, () => 12 + Math.random() * 60)
  );

  // Execution heat events
  const [execEvents, setExecEvents] = useState<number[]>([]);
  // Pulse dots at confidence peaks
  const [pulseDots, setPulseDots] = useState<number[]>([]);

  const [scan, setScan] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      const bds     = engine?.symbolBreakdowns ? Object.values(engine.symbolBreakdowns) : [];
      const avgConf = bds.length
        ? bds.reduce((s, b: any) => s + (b.avgConfidence ?? 0), 0) / bds.length
        : 50;
      const t = Date.now() / 4000;

      setFlowPts(prev => {
        const next = Math.max(8, Math.min(92,
          avgConf + (Math.random() - 0.48) * 11 + Math.sin(t * 1.3) * 7
        ));
        return [...prev.slice(1), next];
      });

      setPressurePts(prev => {
        const next = Math.max(8, Math.min(88,
          prev[prev.length - 1]! + (Math.random() - 0.50) * 9 + Math.cos(t * 1.7) * 5
        ));
        return [...prev.slice(1), next];
      });

      setVolBars(prev => [...prev.slice(1), 12 + Math.random() * 62]);

      // Execution heat: mark index when trade fires
      setExecEvents(prev => {
        const fired = Math.random() > 0.88;
        return fired ? [...prev.slice(-6), N - 1] : prev.map(e => e - 1).filter(e => e >= 0);
      });

      // Pulse dots at local confidence peaks
      setPulseDots(prev => {
        const last   = flowPts[flowPts.length - 1] ?? 0;
        const second = flowPts[flowPts.length - 2] ?? 0;
        const isPeak = last > 68 && last > second;
        return isPeak ? [N - 1, ...prev.slice(0, 3)] : prev.map(e => e - 1).filter(e => e >= 0);
      });

      setScan(s => (s + 1) % N);
    }, 1400);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Derived live metrics
  const bds        = engine?.symbolBreakdowns ? Object.values(engine.symbolBreakdowns) : [];
  const topBd      = bds.length
    ? [...bds].sort((a: any, b: any) => b.avgConfidence - a.avgConfidence)[0]
    : null;
  const activeSym  = (topBd as any)?.symbol?.replace("USD", "") ?? "BTC";
  const liveConf   = flowPts[flowPts.length - 1] ?? 0;
  const confColor  = liveConf >= 65 ? "#00f0ff" : liveConf >= 45 ? "#ff9d3a" : "#ff4466";
  const pressureLast = pressurePts[pressurePts.length - 1] ?? 0;
  const pressureDir  = pressureLast > 50 ? "BUYING" : "SELLING";

  // SVG geometry
  const W = 260, H = 90, VH = 16;

  const toPt = (v: number, h: number): number => h - (v / 100) * (h - 6) - 3;

  const flowCoords: [number, number][] = flowPts.map((v, i) => [
    (i / (N - 1)) * W, toPt(v, H),
  ]);
  const pressureCoords: [number, number][] = pressurePts.map((v, i) => [
    (i / (N - 1)) * W, toPt(v, H),
  ]);

  const flowPath     = smoothSvgPath(flowCoords);
  const pressurePath = smoothSvgPath(pressureCoords);
  const flowAreaPath = `${flowPath} L ${W} ${H} L 0 ${H} Z`;

  const scanX = ((scan / N) * W).toFixed(1);

  const [lastFX, lastFY] = flowCoords[flowCoords.length - 1] ?? [W, H / 2];

  return (
    <div style={{
      background: "#000000",
      border: "1px solid #0d1824",
      borderRadius: 6,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 10px",
        borderBottom: "1px solid #07121c",
        background: "#010608",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#00f0ff",
            boxShadow: "0 0 4px #00f0ff", flexShrink: 0 }} className="live-dot" />
          <span style={{ fontSize: 8, fontFamily: "monospace", fontWeight: 700,
            color: "#00f0ff88", letterSpacing: "0.22em", textTransform: "uppercase" }}>
            AI MICROSTRUCTURE
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 7, fontFamily: "monospace",
            color: pressureLast > 50 ? "#00f0ff50" : "#ff9d3a50",
            letterSpacing: "0.1em" }}>
            {pressureDir}
          </span>
          <span style={{
            fontSize: 22, fontFamily: "monospace", fontWeight: 700,
            color: "#e8f8ff",
            letterSpacing: "0.06em",
            textShadow: "0 0 9px #00f0ff60, 0 0 4px #00f0ff40",
            lineHeight: 1,
          }}>
            {activeSym}
          </span>
        </div>
      </div>

      {/* ── Main wave panel ──────────────────────────────────────────────────── */}
      <div style={{ position: "relative", flex: 1 }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none" style={{ display: "block" }}>
          <defs>
            {/* Cyan flow gradient */}
            <linearGradient id="ms-flow-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#00f0ff" stopOpacity="0.18" />
              <stop offset="55%"  stopColor="#00f0ff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.00" />
            </linearGradient>
            {/* Horizontal pressure gradient (left=sell, right=buy) */}
            <linearGradient id="ms-pressure-bg" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#ff3355" stopOpacity="0.04" />
              <stop offset="50%"  stopColor="#000000" stopOpacity="0.00" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.05" />
            </linearGradient>
            {/* Glow filter for execution events */}
            <filter id="ms-exec-glow">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Directional pressure background */}
          <rect x={0} y={0} width={W} height={H} fill="url(#ms-pressure-bg)" />

          {/* Subtle horizontal grid lines */}
          {[25, 50, 75].map(pct => {
            const y = toPt(pct, H);
            return (
              <line key={pct} x1={0} y1={y} x2={W} y2={y}
                stroke="#0c1e2a" strokeWidth={0.5} strokeDasharray="3,12" />
            );
          })}

          {/* Volume depth bars (bottom, translucent) */}
          {volBars.map((v, i) => {
            const bw  = (W / N) * 0.72;
            const bx  = (i / N) * W;
            const bh  = (v / 100) * (H * 0.28);
            const age = i / N;
            return (
              <rect key={i} x={bx} y={H - bh} width={bw} height={bh}
                fill={`rgba(0,180,255,${0.06 + age * 0.10})`} rx={1} />
            );
          })}

          {/* Pressure wave (secondary — amber, dim, smooth) */}
          <path d={pressurePath} fill="none"
            stroke="#ff9d3a" strokeWidth={1}
            strokeOpacity={0.22}
            strokeDasharray="none"
            style={{ filter: "drop-shadow(0 0 3px #ff9d3a30)" }} />

          {/* Flow area fill */}
          <path d={flowAreaPath} fill="url(#ms-flow-fill)" />

          {/* Primary flow line (cyan, glowing) */}
          <path d={flowPath} fill="none" stroke="#00f0ff" strokeWidth={1.6}
            style={{ filter: "drop-shadow(0 0 4px #00f0ff55)" }} />

          {/* Execution heat events (vertical glow spikes) */}
          {execEvents.map((idx, i) => {
            if (idx < 0 || idx >= N) return null;
            const ex = (idx / (N - 1)) * W;
            return (
              <g key={i} filter="url(#ms-exec-glow)">
                <line x1={ex} y1={H} x2={ex} y2={H * 0.35}
                  stroke="#00ff8a" strokeWidth={1.5} opacity={0.7} />
                <circle cx={ex} cy={H * 0.35} r={2} fill="#00ff8a" opacity={0.9} />
              </g>
            );
          })}

          {/* Confidence pulse dots at signal peaks */}
          {pulseDots.map((idx, i) => {
            if (idx < 0 || idx >= flowCoords.length) return null;
            const [px, py] = flowCoords[idx] ?? [0, 0];
            return (
              <circle key={i} cx={px} cy={py} r={2.8} fill="#00f0ff" opacity={0.8}
                style={{ filter: "drop-shadow(0 0 3px #00f0ff)" }} />
            );
          })}

          {/* Live tip dot */}
          <circle cx={lastFX} cy={lastFY} r={3} fill="#00f0ff"
            style={{ filter: "drop-shadow(0 0 5px #00f0ff)" }} className="live-dot" />

          {/* Scanning sweep line */}
          <line x1={scanX} y1={0} x2={scanX} y2={H}
            stroke="#00f0ff" strokeWidth={0.6} opacity={0.14} />

          {/* Legend: top-left stream labels */}
          <text x={6} y={11} fontSize={6} fontFamily="monospace"
            fill="#00f0ff40" letterSpacing="0.1em" textAnchor="start">AI FLOW</text>
          <text x={6} y={21} fontSize={6} fontFamily="monospace"
            fill="#ff9d3a30" letterSpacing="0.1em" textAnchor="start">MKT PRESSURE</text>
        </svg>
      </div>

      {/* ── Volume bar mini-strip ─────────────────────────────────────────────── */}
      <svg width="100%" height={VH} viewBox={`0 0 ${W} ${VH}`}
        preserveAspectRatio="none" style={{ display: "block", marginTop: -1 }}>
        {volBars.map((v, i) => {
          const bw  = (W / N) * 0.7;
          const bx  = (i / N) * W;
          const bh  = (v / 100) * VH;
          const age = i / N;
          return (
            <rect key={i} x={bx} y={VH - bh} width={bw} height={bh}
              fill={`rgba(0,160,220,${0.10 + age * 0.20})`} rx={0.5} />
          );
        })}
      </svg>

      {/* ── Bottom metrics row ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        padding: "6px 10px 7px",
        borderTop: "1px solid #07121c",
        background: "#010608",
      }}>
        {[
          { label: "FLOW",  value: `${liveConf.toFixed(0)}%`,             color: confColor  },
          { label: "SIG",   value: String(engine?.signalsGenerated ?? 0),  color: "#00aaff"  },
          { label: "EXEC",  value: String(engine?.tradesExecuted ?? 0),    color: "#00ff8a"  },
          { label: "BLK",   value: String(engine?.tradesBlocked ?? 0),     color: "#ff4455"  },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
            <span style={{
              fontSize: 14, fontFamily: "monospace", fontWeight: 700,
              color, lineHeight: 1, textShadow: `0 0 8px ${color}60`,
            }}>{value}</span>
            <span style={{ fontSize: 6, fontFamily: "monospace", color: "#1a3040",
              textTransform: "uppercase", letterSpacing: "0.14em" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Active Trade Card ─────────────────────────────────────────────────────────

function ActiveTradeCard({ openTrade, simPos }: {
  openTrade: Trade | undefined;
  simPos:    SimAccount["positions"][0] | undefined;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const trade = openTrade;
  const pos   = simPos;

  if (!trade && !pos) {
    return <SignalWaitingViz />;
  }

  const symbol    = trade?.symbol  ?? pos?.symbol  ?? "—";
  const side      = trade?.side    ?? pos?.side.toUpperCase() ?? "—";
  const entry     = trade?.price   ?? pos?.entryPrice ?? 0;
  const current   = pos?.currentPrice ?? 0;
  const pnl       = trade?.pnl     ?? pos?.unrealizedPnL ?? 0;
  const pnlPct    = trade?.pnlPercent ?? pos?.unrealizedPnLPct ?? 0;
  const sl        = trade?.stopLoss ?? null;
  const tp        = trade?.takeProfit ?? null;
  const startMs   = pos ? pos.entryTime : new Date(trade?.timestamp ?? Date.now()).getTime();
  const dur       = tradeDuration(startMs);
  const reason    = trade?.reason ?? "—";
  const isBuy     = side.toUpperCase() === "BUY";
  const sideColor = isBuy ? "#00ff8a" : "#ff3355";

  return (
    <div className="border-t" style={{ borderTopColor: "#0d1e2e", background: "#000508" }}>
      {/* Trade header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0 live-dot"
            style={{ background: sideColor, boxShadow: `0 0 4px ${sideColor}` }} />
          <span className="text-[13px] font-bold font-mono" style={{ color: "#EAF2FF" }}>
            {symbol}
          </span>
          <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded"
            style={{ background: `${sideColor}18`, color: sideColor, border: `1px solid ${sideColor}40` }}>
            {side}
          </span>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ background: "#00ff8a10", color: "#00ff8a60", border: "1px solid #00ff8a20" }}>
            OPEN
          </span>
        </div>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 text-[10px] font-mono font-medium"
          style={{ color: "#4a6070" }}>
          <Clock className="w-3 h-3" /> {tick >= 0 ? dur : dur}
        </span>
      </div>

      {/* Price grid */}
      <div className="grid px-4 pb-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: "2px 16px" }}>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>ENTRY</span>
          <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "#9FB3C8" }}>
            ${entry.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {current > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>CURRENT</span>
            <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "#EAF2FF" }}>
              ${current.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>UNREALIZED P&L</span>
          <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: pctColor(pnl) }}>
            {pnl >= 0 ? "+" : ""}{fmt$(pnl)}
            <span className="text-[10px] ml-1 opacity-70">({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</span>
          </span>
        </div>
        {tp != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>TAKE PROFIT</span>
            <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "#00ff8a" }}>
              ${Number(tp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
        {sl != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: "#4a6070" }}>STOP LOSS</span>
            <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: "#ff5555" }}>
              ${Number(sl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Signal reason */}
      {reason && reason !== "—" && (
        <div className="px-4 pb-2.5 flex items-center gap-2">
          <Zap className="w-3 h-3 flex-shrink-0" style={{ color: "#00aaff60" }} />
          <span className="text-[9px] font-mono" style={{ color: "#4a7a94" }}>
            SIGNAL: {String(reason).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LiveTradingConsole({
  engine, settings, exchangeStatus, trades, simAccount, liveBalance,
  activeId, liveActive,
  onToggleKill, onTogglePause, onStartEngine, onStopEngine,
  onSettingsPatch, onSelectSim, onSelectLive,
  switchError, onClearSwitchError, onCloseAllPositions, closingAll,
}: Props) {
  const isRunning  = engine?.running ?? false;
  const isKill     = exchangeStatus?.killSwitch ?? false;
  const isPaused   = exchangeStatus?.paused     ?? false;
  const exName     = exchangeStatus?.exchangeName ?? "Alpaca";

  // Confidence slider with local state + debounced save
  const [confidence, setConfidence] = useState(settings?.minConfidence ?? 45);
  const [maxPos,     setMaxPos]     = useState(settings?.allocation    ?? 0.01);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (settings?.minConfidence != null) setConfidence(settings.minConfidence);
  }, [settings?.minConfidence]);
  useEffect(() => {
    if (settings?.allocation != null) setMaxPos(settings.allocation);
  }, [settings?.allocation]);

  function debouncedSave(patch: Record<string, number | boolean>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSettingsPatch(patch), 600);
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const closedTrades = (trades ?? []).filter(t => t.status === "closed");
  const openTrades   = (trades ?? []).filter(t => t.status === "open");
  const wins         = closedTrades.filter(t => (t.pnl ?? 0) > 0);
  const losses       = closedTrades.filter(t => (t.pnl ?? 0) < 0);
  const winRate      = closedTrades.length > 0 ? Math.round(wins.length / closedTrades.length * 100) : null;
  const totalRealized = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

  const todayStr   = new Date().toISOString().slice(0, 10);
  const todayTrades = closedTrades.filter(t => (t.timestamp ?? "").startsWith(todayStr));
  const sessionPnL  = todayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const tradesLeft  = Math.max(0, (settings?.maxTradesPerDay ?? 5) - todayTrades.length);

  const simPos     = simAccount?.positions?.[0];
  const openTrade  = openTrades[0];

  // In LIVE mode: show real exchange USD balance. In SIM mode: show simulation equity.
  // Strict exchange-scope: never fall back to sim balance when in live mode
  const liveUSD      = liveActive && liveBalance?.source === "live" ? (liveBalance.balances?.USD ?? null) : null;
  const balance      = liveActive ? liveUSD : (simAccount?.equity ?? simAccount?.account?.cashBalance ?? null);
  const balanceLabel = liveActive
    ? (liveUSD != null ? `${exName.toUpperCase()} LIVE USD` : "CONNECTING…")
    : "ACCOUNT EQUITY";
  const unrealPnL  = simAccount?.unrealizedPnL ?? 0;

  // ── Status banner color ───────────────────────────────────────────────────

  let bannerBg = "#000508";
  let bannerBorder = "#0d1e2e";
  let modeLabel = "SIMULATION MODE";
  let modeBadgeColor = "#ffaa00";

  if (isKill) {
    bannerBg = "#160008";
    bannerBorder = "#ff225540";
    modeLabel = "KILL SWITCH ACTIVE — ALL TRADING HALTED";
    modeBadgeColor = "#ff2255";
  } else if (liveActive && isRunning && !isPaused) {
    bannerBg = "#001208";
    bannerBorder = "#00ff8a30";
    modeLabel = `LIVE TRADING — ${exName.toUpperCase()} — SPOT ONLY`;
    modeBadgeColor = "#00ff8a";
  } else if (liveActive) {
    bannerBg = "#060010";
    bannerBorder = "#5741d940";
    modeLabel = `LIVE MODE — ${exName.toUpperCase()} — AI PAUSED`;
    modeBadgeColor = "#5741d9";
  } else if (isRunning && !isPaused) {
    bannerBg = "#000a18";
    bannerBorder = "#00aaff30";
    modeLabel = "SIMULATION MODE — AI TRADING ACTIVE";
    modeBadgeColor = "#00aaff";
  }

  return (
    <div className="flex-shrink-0" style={{ background: "#000000", borderBottom: `2px solid ${bannerBorder}` }}>

      {/* ── Exchange switch error banner ────────────────────────────────────── */}
      {switchError && (
        <div className="flex items-center gap-3 px-4 py-2"
          style={{ background: "#1a0008", borderBottom: "1px solid #ff225540" }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#ff2255" }} />
          <span className="text-[10px] font-mono font-bold flex-1" style={{ color: "#ff6688" }}>
            EXCHANGE SWITCH FAILED — {switchError.toUpperCase()}
          </span>
          <span className="text-[9px] font-mono" style={{ color: "#ff225560" }}>
            ADD API KEYS IN SETTINGS → EXCHANGE CONNECTIONS
          </span>
          <button onClick={onClearSwitchError}
            className="flex-shrink-0 rounded p-0.5 transition-all"
            style={{ color: "#ff225580", background: "transparent", border: "none" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Status Banner ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2.5"
        style={{ background: bannerBg, borderBottom: "1px solid #0a1520" }}>

        {/* Pulse + Mode label */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(isRunning && !isKill) && (
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 live-dot"
              style={{ background: modeBadgeColor, boxShadow: `0 0 5px ${modeBadgeColor}` }} />
          )}
          {isKill && <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#ff2255" }} />}
          <span className="text-[11px] font-bold font-mono tracking-[0.15em]"
            style={{ color: modeBadgeColor }}>
            {modeLabel}
          </span>
        </div>

        <div className="flex-1" />

        {/* Quick status chips */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusChip label="AI ENGINE" value={isRunning ? (isPaused ? "PAUSED" : "RUNNING") : "STOPPED"}
            color={isRunning && !isPaused ? "#00ff8a" : isPaused ? "#ffaa00" : "#ff3355"} />
          <StatusChip label="KILL SWITCH" value={isKill ? "ACTIVE" : "SAFE"}
            color={isKill ? "#ff2255" : "#00ff8a"} />
          <StatusChip label="MODE" value={liveActive ? `LIVE · ${exName.toUpperCase()}` : "SIMULATION"}
            color={liveActive ? "#00ff8a" : "#ffaa00"} />
          <StatusChip label="OPEN POSITIONS" value={String((openTrades.length) + (simPos ? 1 : 0))}
            color="#9FB3C8" />
          {(sessionPnL !== 0) && (
            <StatusChip label="SESSION P&L" value={`${sessionPnL >= 0 ? "+" : ""}${fmt$(sessionPnL)}`}
              color={pctColor(sessionPnL)} />
          )}
        </div>
      </div>

      {/* ── Main control panel ─────────────────────────────────────────────── */}
      <div className="flex" style={{ minHeight: 160 }}>

        {/* LEFT: Primary Action Buttons */}
        <div className="flex flex-col gap-2 p-4 flex-shrink-0"
          style={{ width: 230, borderRight: "1px solid #0d1e2e", background: "#000305" }}>
          <div className="text-[8px] font-bold font-mono tracking-[0.2em] mb-1" style={{ color: "#2a4050" }}>
            PRIMARY CONTROLS
          </div>

          {!isRunning ? (
            <LargeButton
              onClick={onStartEngine}
              label="START AI TRADER"
              sub="Begin signal monitoring"
              icon={Play}
              color="#00ff8a"
              bgColor="#00ff8a14"
              borderColor="#00ff8a40"
              disabled={isKill}
            />
          ) : (
            <LargeButton
              onClick={onStopEngine}
              label="STOP AI TRADER"
              sub="Halt signal loop"
              icon={Square}
              color="#ff9900"
              bgColor="#ff990014"
              borderColor="#ff990040"
            />
          )}

          <LargeButton
            onClick={onTogglePause}
            label={isPaused ? "RESUME TRADING" : "PAUSE TRADING"}
            sub={isPaused ? "Resume order execution" : "Hold — keep monitoring"}
            icon={isPaused ? Play : Pause}
            color={isPaused ? "#00aaff" : "#ffaa00"}
            bgColor={isPaused ? "#00aaff14" : "#ffaa0014"}
            borderColor={isPaused ? "#00aaff40" : "#ffaa0040"}
            disabled={!isRunning}
          />

          <LargeButton
            onClick={onToggleKill}
            label={isKill ? "KILL SWITCH: ON" : "KILL SWITCH"}
            sub={isKill ? "Click to re-enable trading" : "Emergency stop all trades"}
            icon={isKill ? ShieldOff : Shield}
            color={isKill ? "#ff2255" : "#9FB3C8"}
            bgColor={isKill ? "#ff225514" : "transparent"}
            borderColor={isKill ? "#ff225560" : "#1c2a36"}
          />

          {/* Close All Positions — unblocks the max-positions gate */}
          <LargeButton
            onClick={onCloseAllPositions ?? (() => {})}
            label={closingAll ? "CLOSING…" : "CLOSE ALL POSITIONS"}
            sub="Force-close all open trades & reset sim"
            icon={Trash2}
            color="#ff6600"
            bgColor="#ff660010"
            borderColor="#ff660035"
            disabled={closingAll}
          />
        </div>

        {/* CENTER: Stats + Active Trade */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Stats row */}
          <div className="flex border-b" style={{ borderBottomColor: "#0d1e2e" }}>
            <StatCard
              label={balanceLabel}
              value={balance != null ? fmt$(balance, 0) : "—"}
              big
              valueColor={liveUSD != null ? "#00ff8a" : "#EAF2FF"}
            />
            <StatCard
              label="TOTAL REALIZED P&L"
              value={closedTrades.length > 0 ? `${totalRealized >= 0 ? "+" : ""}${fmt$(totalRealized)}` : "—"}
              valueColor={pctColor(totalRealized)}
            />
            <StatCard
              label="UNREALIZED P&L"
              value={unrealPnL !== 0 ? `${unrealPnL >= 0 ? "+" : ""}${fmt$(unrealPnL)}` : "—"}
              valueColor={pctColor(unrealPnL)}
            />
            <StatCard
              label="WIN RATE"
              value={winRate != null ? `${winRate}%` : "—"}
              sub={closedTrades.length > 0 ? `${wins.length}W / ${losses.length}L` : undefined}
              valueColor={winRate != null ? (winRate >= 50 ? "#00ff8a" : "#ff5555") : "#9FB3C8"}
            />
            <StatCard
              label="TRADES TODAY"
              value={String(todayTrades.length)}
              sub={`of ${settings?.maxTradesPerDay ?? 5} limit · ${tradesLeft > 0 ? `${tradesLeft} left` : "maxed"}`}
              valueColor={tradesLeft === 0 ? "#ffaa00" : "#9FB3C8"}
            />
            <StatCard
              label="SESSION P&L"
              value={todayTrades.length > 0 ? `${sessionPnL >= 0 ? "+" : ""}${fmt$(sessionPnL)}` : "—"}
              valueColor={pctColor(sessionPnL)}
            />
          </div>

          {/* Activity panel is ALWAYS mounted — chart never unmounts on data hydration.
              Trade data is passed as props and shown as an inline overlay strip. */}
          <LiveUserActivityPanel engine={engine} openTrade={openTrade} simPos={simPos} />
        </div>

        {/* RIGHT: Configuration Panel */}
        <div className="flex flex-col gap-4 p-4 flex-shrink-0"
          style={{ width: 280, borderLeft: "1px solid #0d1e2e", background: "#000305" }}>

          {/* Header + Test mode badge */}
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-bold font-mono tracking-[0.2em]" style={{ color: "#2a4050" }}>
              LIVE TEST CONFIG
            </span>
            {liveActive && exName !== "Alpaca" && (
              <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded"
                style={{ background: "#ff990018", color: "#ff9900", border: "1px solid #ff990040" }}>
                {exName.toUpperCase()} · SPOT ONLY
              </span>
            )}
          </div>

          {/* Confidence slider */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold font-mono" style={{ color: "#9FB3C8" }}>
                AI CONFIDENCE THRESHOLD
              </label>
              <span className="font-bold font-mono tabular-nums" style={{
                fontSize: 36,
                lineHeight: 1,
                color: "#00f0ff",
                textShadow: "0 0 9px #00f0ffaa, 0 0 21px #00f0ff44, 0 0 2px #00f0ff",
                letterSpacing: "-0.02em",
              }}>
                {confidence}
              </span>
            </div>
            <input
              type="range" min={30} max={95} step={5}
              value={confidence}
              onChange={e => {
                const v = Number(e.target.value);
                setConfidence(v);
                debouncedSave({ minConfidence: v });
              }}
              className="w-full accent-blue-500"
              style={{ accentColor: "#00aaff", height: 6, cursor: "pointer" }}
            />
            <div className="flex justify-between text-[8px] font-mono" style={{ color: "#2a4050" }}>
              <span>30 · AGGRESSIVE</span>
              <span>95 · STRICT</span>
            </div>
            <div className="text-[8px] font-mono px-2 py-1.5 rounded" style={{ background: "#00aaff0a", color: "#00aaff60", border: "1px solid #00aaff18" }}>
              TESTING RANGE: 40–55 recommended for Alpaca spot
            </div>
          </div>

          {/* Position size */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold font-mono" style={{ color: "#9FB3C8" }}>
              MAX POSITION SIZE (% of balance)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.001} max={2} step={0.001}
                value={maxPos}
                onChange={e => {
                  const v = parseFloat(e.target.value) || 0.01;
                  setMaxPos(v);
                  debouncedSave({ allocation: v });
                }}
                className="font-mono font-bold text-[16px] tabular-nums rounded px-3 py-1.5 w-24"
                style={{ background: "#050d18", color: "#EAF2FF", border: "1px solid #1a2a36" }}
              />
              <span className="text-[10px] font-mono" style={{ color: "#4a6070" }}>% ≈ $10 test size</span>
            </div>
            <div className="text-[8px] font-mono" style={{ color: "#4a6070" }}>
              Stop loss: {settings?.stopLossPercent ?? 2}%  ·  Take profit: {settings?.takeProfitPercent ?? 4}%
            </div>
          </div>

          {/* Live Asset Intelligence — replaces duplicate exchange selector */}
          <LiveAssetIntelPanel engine={engine} />
        </div>
      </div>
    </div>
  );
}

// ── StatusChip helper (inline to avoid extra file) ────────────────────────────

function StatusChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-1 rounded"
      style={{ background: `${color}0c`, border: `1px solid ${color}28` }}>
      <span className="text-[8px] font-mono font-bold uppercase tracking-[0.12em]" style={{ color: `${color}90` }}>
        {label}
      </span>
      <span className="text-[10px] font-bold font-mono" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
