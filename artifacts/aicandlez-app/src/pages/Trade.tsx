import { useState, useEffect } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type MobileStatus, type Portfolio, type SimTrade, type AlpacaPosition, type SignalBreakdown } from "@/lib/api";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";
import { useStrictRuntimeMode } from "@/hooks/useStrictRuntimeMode";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { BrokerStatusCard } from "@/components/BrokerStatusCard";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { EnableLiveCTA } from "@/components/EnableLiveCTA";
import { MetricTooltip } from "@/components/help/MetricTooltip";
import { TradeDetailSheet } from "@/components/TradeDetailSheet";

// ── Design tokens ────────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const ESUB = "rgba(255,255,255,0.04)";
const C    = "#00e5ff";
const G    = "#00ff88";
const P    = "#9b5cf5";
const O    = "#ff9400";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#647385";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif";
const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

// ── Constants ────────────────────────────────────────────────────────────────────
const AI_STRATEGIES = ["EMA+RSI", "MTF TREND", "BREAKOUT", "MOMENTUM", "CONFLUENCE"];


// ── Live ticker hook ─────────────────────────────────────────────────────────────
function useLiveTimer() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(i => i + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return tick;
}

function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ── Spark data helpers ───────────────────────────────────────────────────────────
function sparkPath(pts: number[], w: number, h: number): string {
  if (pts.length < 2) return "";
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const pad = h * 0.08;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(p => h - pad - ((p - min) / range) * (h - pad * 2));
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((xs[i-1] + xs[i]) / 2).toFixed(1);
    d += ` C ${cpx} ${ys[i-1].toFixed(1)} ${cpx} ${ys[i].toFixed(1)} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  return d;
}

// ── Sparkline placeholder (when no real data is available) ──────────────────────
function SparklinePlaceholder({ w, h, label = "—" }: { w: number; h: number; label?: string }) {
  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "1px dashed rgba(255,255,255,0.08)",
      borderRadius: 4,
      fontSize: 8, fontFamily: MONO, color: DIM,
      letterSpacing: "0.08em",
    }}>
      {label}
    </div>
  );
}

// ── Premium sparkline ────────────────────────────────────────────────────────────
function PremiumSparkline({ symbol, up, points, w = 100, h = 44, animDelay = "0s" }: {
  symbol: string; up: boolean; points?: number[]; w?: number; h?: number; animDelay?: string;
}) {
  if (!points || points.length < 2) {
    return <SparklinePlaceholder w={w} h={h}/>;
  }
  const pts  = points;
  const d    = sparkPath(pts, w, h);
  const col  = up ? "#00eb78" : "#ff3c3c";
  const gid  = `spk-${symbol.replace(/[^a-z0-9]/gi,"")}-${up ? "u" : "d"}`;
  const min  = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const pad  = h * 0.08;
  const endY = h - pad - ((pts[pts.length-1] - min) / range) * (h - pad * 2);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow:"visible", flexShrink:0,
        animation:`chart-drift 8s ease-in-out ${animDelay} infinite` }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={col} stopOpacity="0.22"/>
          <stop offset="55%"  stopColor={col} stopOpacity="0.05"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
        <filter id={`gf-${gid}`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Faint grid */}
      {[0.3, 0.5, 0.7].map((t, i) => (
        <line key={i} x1={0} y1={h*t} x2={w} y2={h*t}
          stroke="rgba(255,255,255,0.035)" strokeWidth="0.5" strokeDasharray="2 4"/>
      ))}
      {/* Area fill */}
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${gid})`}/>
      {/* Glow undercoat */}
      <path d={d} fill="none" stroke={col} strokeWidth="3.5"
        strokeOpacity="0.14" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Crisp main line with glow filter */}
      <path d={d} fill="none" stroke={col} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" filter={`url(#gf-${gid})`}/>
      {/* End-cap: outer halo */}
      <circle cx={w} cy={endY} r="5" fill={col} opacity="0.12"/>
      {/* End-cap: mid glow */}
      <circle cx={w} cy={endY} r="3" fill={col} opacity="0.65"/>
      {/* End-cap: bright core */}
      <circle cx={w} cy={endY} r="1.4" fill="white" opacity="0.95"/>
    </svg>
  );
}

// ── Donut ring metric ────────────────────────────────────────────────────────────
function Donut({ value, color, label, sub, size = 78, tooltipTerm }: {
  value: number; color: string; label: string; sub?: string; size?: number; tooltipTerm?: string;
}) {
  const r    = (size - 14) / 2;
  const cx   = size / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(value / 100, 1) * circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
      <svg width={size} height={size} shapeRendering="geometricPrecision"
        style={{ overflow:"visible" }}>
        {/* Ambient outer ring */}
        <circle cx={cx} cy={cx} r={r + 5} fill="none"
          stroke={color} strokeWidth="0.5" strokeOpacity="0.12"/>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth="5.5"/>
        {/* Value arc */}
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth="5.5"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{
            transition:"stroke-dasharray 0.8s ease",
            filter:`drop-shadow(0 0 5px ${color}55)`,
          }}/>
        {/* Center value */}
        <text x={cx} y={cx - 4} textAnchor="middle" dominantBaseline="central"
          fill="rgba(255,255,255,0.92)" fontSize="16" fontWeight="800"
          fontFamily="'SF Pro Display','Inter',sans-serif">{value}</text>
        {/* Center % */}
        <text x={cx} y={cx + 11} textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize="7.5" fontWeight="700"
          fontFamily="'SF Pro Display','Inter',sans-serif"
          style={{ letterSpacing:"0.06em" }}>%</text>
      </svg>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:8, fontFamily:SANS, fontWeight:700,
          color:"rgba(255,255,255,0.55)", letterSpacing:"0.14em",
          textTransform:"uppercase" as const,
          display:"flex", alignItems:"center", justifyContent:"center", gap:3,
        }}>
          {label}
          {tooltipTerm && <MetricTooltip term={tooltipTerm} inline />}
        </div>
        {sub && (
          <div style={{ fontSize:7, fontFamily:SANS, color:DIM, marginTop:2,
            letterSpacing:"0.06em" }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

// ── TP / SL progress bar ─────────────────────────────────────────────────────────
function TpSlBar({ sl, tp, current, up }: { sl:number; tp:number; current:number; up:boolean }) {
  const pct = Math.max(0, Math.min(100, ((current - sl) / (tp - sl)) * 100));
  const barCol = up
    ? "linear-gradient(90deg, rgba(255,51,85,0.45), rgba(0,255,136,0.85))"
    : "linear-gradient(90deg, rgba(255,51,85,0.45), rgba(255,148,0,0.75))";
  return (
    <div style={{ marginTop:10 }}>
      <div style={{
        position:"relative", height:3,
        background:"rgba(255,255,255,0.05)", borderRadius:2,
      }}>
        <div style={{
          position:"absolute", left:0, width:`${pct}%`, height:"100%",
          background:barCol, borderRadius:2,
          transition:"width 1.2s ease",
        }}/>
        <div style={{
          position:"absolute", left:`${pct}%`, top:-1.5,
          width:2, height:6,
          background:"white", borderRadius:1,
          transform:"translateX(-50%)",
          boxShadow: "0 0 5px rgba(255,255,255,0.51)",
        }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
        <span style={{ fontSize:7.5, fontFamily:MONO, color:"rgba(255,51,85,0.65)" }}>
          SL ${sl.toFixed(0)}
        </span>
        <span style={{ fontSize:7.5, fontFamily:MONO, color:GR }}>
          ${current.toLocaleString("en-US",{maximumFractionDigits:0})}
        </span>
        <span style={{ fontSize:7.5, fontFamily:MONO, color:"rgba(0,255,136,0.65)" }}>
          TP ${tp.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

// ── Position card ─────────────────────────────────────────────────────────────────
function PositionCard({ pos, tick, sparkPoints }: { pos: Portfolio["positions"][number]; tick: number; sparkPoints?: number[] }) {
  // Phase 3 Step 2b — gate SIMULATION chip on the CANONICAL runtime
  // mode from the server aggregator (`/api/user/runtime-state`), NOT
  // broker connection status (which is orthogonal — a user can have
  // a connected broker while still resolved to PAPER by the
  // aggregator). With the strict flag off (default), legacy behavior
  // preserved regardless of runtime mode.
  const strictRuntimeMode = useStrictRuntimeMode();
  const { data: runtimeState } = useRuntimeState();
  const isLiveRuntime = runtimeState?.mode === "live";
  const pnl     = pos.unrealizedPnL ?? 0;
  const up      = pnl >= 0;
  const col     = up ? G : R;
  const current = pos.currentPrice ?? pos.entryPrice;
  const sl      = pos.entryPrice * (pos.side === "LONG" ? 0.965 : 1.035);
  const tp      = pos.entryPrice * (pos.side === "LONG" ? 1.042 : 0.958);
  const pnlPct  = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * pos.size)) * 100 : 0;
  const symHash = pos.symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const strategy = AI_STRATEGIES[symHash % AI_STRATEGIES.length];
  const elapsed  = 1800 + (symHash % 5400) + tick;
  const duration = fmtDuration(elapsed);

  return (
    <div style={{
      position:"relative", overflow:"hidden",
      background:`linear-gradient(160deg, #0e1c2e 0%, #0a1520 100%)`,
      border:`1px solid ${up ? "rgba(0,255,136,0.14)" : "rgba(255,51,85,0.12)"}`,
      borderRadius:14, padding:"14px 16px", marginBottom:10,
      boxShadow: [
        "0 8px 32px rgba(0,0,0,0.90)",
        `0 0 0 0.5px ${up ? "rgba(0,255,136,0.06)" : "rgba(255,51,85,0.05)"} inset`,
      ].join(","),
    }}>
      {/* Top laser edge */}
      <div aria-hidden style={{
        position:"absolute", top:0, left:0, right:0, height:1.5,
        background:`linear-gradient(90deg, transparent 8%, ${col}65 38%, ${col}50 60%, transparent 92%)`,
        animation:`edge-sweep ${5 + (symHash % 4)}s ease-in-out infinite`,
      }}/>
      {/* Ambient corner glow */}
      <div aria-hidden style={{
        position:"absolute", top:-20, right:-10, width:110, height:110, borderRadius:"50%",
        background:`radial-gradient(circle, ${col}07 0%, transparent 70%)`,
        pointerEvents:"none",
        animation:"orb-breathe 7s ease-in-out infinite",
      }}/>

      <div style={{ position:"relative" }}>
        {/* Row 1: symbol + badges + PnL */}
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"flex-start", marginBottom:10 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {/* Live pulse dot */}
              <div style={{
                width:5, height:5, borderRadius:"50%", background:col, flexShrink:0,
                boxShadow: `0 0 7px ${col}99`,
                animation:"dot-pulse 2s ease-in-out infinite",
              }}/>
              <span style={{ fontSize:16, fontFamily:SANS, fontWeight:800, color:W,
                letterSpacing:"-0.01em" }}>
                {pos.symbol.replace("USD","")}
              </span>
              <span style={{
                padding:"2px 8px",
                background: up ? "rgba(0,255,136,0.08)" : "rgba(255,51,85,0.08)",
                border:`1px solid ${up ? "rgba(0,255,136,0.22)" : "rgba(255,51,85,0.22)"}`,
                borderRadius:4,
                fontSize:8, fontFamily:SANS, fontWeight:700, color:col,
                letterSpacing:"0.08em",
              }}>{pos.side}</span>
            </div>
            {/* Strategy + timer */}
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <span style={{
                padding:"2px 7px",
                background:"rgba(155,92,245,0.08)",
                border:"1px solid rgba(155,92,245,0.20)",
                borderRadius:4,
                fontSize:7.5, fontFamily:MONO, fontWeight:600, color:P,
                letterSpacing:"0.05em",
              }}>{strategy}</span>
              <span style={{ fontSize:8, fontFamily:MONO, color:DIM,
                animation:"timer-tick 1s step-end infinite" }}>
                ⏱ {duration}
              </span>
            </div>
          </div>
          {/* PnL */}
          <div style={{ textAlign:"right" }}>
            <div style={{
              fontSize:20, fontFamily:SANS, fontWeight:800,
              color:col, letterSpacing:"-0.02em",
              animation:"pnl-flash 3s ease-in-out infinite",
            }}>
              {up ? "+" : ""}${Math.abs(pnl).toFixed(2)}
            </div>
            <div style={{ fontSize:10, fontFamily:MONO, color:col, opacity:0.75, marginTop:1 }}>
              {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Row 2: size + entry + AI confidence */}
        <div style={{ display:"flex", alignItems:"center",
          justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ fontSize:9, fontFamily:SANS, color:GR }}>
            <span style={{ fontFamily:MONO }}>{pos.size}</span>
            {" @ "}
            <span style={{ fontFamily:MONO }}>
              ${pos.entryPrice.toLocaleString("en-US",{maximumFractionDigits:0})}
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            {/* Phase 3 Step 2b — under strict runtime mode, the SIMULATION
                chip is suppressed when the user is on a live-active broker
                so PAPER affordances don't mislabel a LIVE-routed surface.
                With the flag off (default), legacy behavior preserved. */}
            {!(strictRuntimeMode && isLiveRuntime) && (
              <span style={{
                padding:"2px 8px",
                background:"rgba(0,229,255,0.06)",
                border:"1px solid rgba(0,229,255,0.18)",
                borderRadius:4,
                fontSize:7.5, fontFamily:SANS, fontWeight:700,
                color:"rgba(0,229,255,0.75)", letterSpacing:"0.10em",
              }}>SIMULATION</span>
            )}
          </div>
        </div>

        {/* Row 3: TP/SL bar + chart */}
        <div style={{ display:"flex", alignItems:"flex-end", gap:12 }}>
          <div style={{ flex:1 }}>
            <TpSlBar sl={sl} tp={tp} current={current} up={up}/>
          </div>
          <div style={{ flexShrink:0, marginBottom:2, opacity:0.88 }}>
            <PremiumSparkline symbol={pos.symbol} up={up} points={sparkPoints} w={96} h={40}
              animDelay={`${symHash % 8}s`}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trade history row ─────────────────────────────────────────────────────────────
function TradeRow({ trade, onOpen }: { trade: SimTrade; onOpen: (t: SimTrade) => void }) {
  const up      = trade.pnl >= 0;
  const pnlCol  = up ? G : R;
  const scoreCol = trade.score !== undefined
    ? (trade.score >= 70 ? G : trade.score >= 50 ? O : R) : GR;
  return (
    <div
      onClick={() => onOpen(trade)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(trade); } }}
      style={{
        display:"flex", alignItems:"center",
        padding:"10px 16px",
        borderBottom:`1px solid ${ESUB}`,
        cursor: "pointer",
      }}>
      <div style={{
        width:2.5, height:36, flexShrink:0, marginRight:12, borderRadius:2,
        background:`linear-gradient(180deg, ${pnlCol}, ${pnlCol}44)`,
        boxShadow: `0 0 5px ${pnlCol}33`,
      }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontFamily:SANS, fontWeight:700, color:W,
          letterSpacing:"-0.01em" }}>
          {trade.symbol.replace("USD","")}
        </div>
        <div style={{ fontSize:8, fontFamily:SANS, color:GR, marginTop:2 }}>
          <span style={{ color:pnlCol, fontWeight:600 }}>{trade.side}</span>
          {" · "}
          <span style={{ fontFamily:MONO }}>${trade.entryPrice.toLocaleString("en-US",{maximumFractionDigits:0})}</span>
          <span style={{ color:DIM }}> → </span>
          <span style={{ fontFamily:MONO }}>${trade.exitPrice.toLocaleString("en-US",{maximumFractionDigits:0})}</span>
          {" · "}
          <span style={{ color:DIM }}>{trade.closedAt}</span>
          {trade.exchange && (
            <>
              {" · "}
              <span
                title={
                  trade.exchangeOrderId || trade.exchangeCloseOrderId
                    ? [
                        trade.exchangeOrderId      ? `Open order: ${trade.exchangeOrderId}`        : null,
                        trade.exchangeCloseOrderId ? `Close order: ${trade.exchangeCloseOrderId}` : null,
                      ].filter(Boolean).join("\n")
                    : undefined
                }
                style={{
                  display:"inline-block",
                  padding:"1px 5px",
                  marginLeft:2,
                  border:`1px solid ${G}55`,
                  background:`${G}10`,
                  color:G, fontFamily:MONO, fontWeight:700,
                  fontSize:7.5, letterSpacing:"0.10em",
                  borderRadius:3, textTransform:"uppercase" as const,
                }}
              >
                LIVE · {trade.exchange}
              </span>
            </>
          )}
        </div>
      </div>
      <div style={{ flexShrink:0, marginRight:10, opacity:0.65 }}>
        <PremiumSparkline
          symbol={trade.symbol + trade.id} up={up} w={52} h={24}
          points={(() => {
            // Build a real entry→exit line with light interpolation
            const a = trade.entryPrice, b = trade.exitPrice;
            if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
            const N = 10;
            return Array.from({ length: N }, (_, i) => a + ((b - a) * i) / (N - 1));
          })()}/>
      </div>
      <div style={{ textAlign:"right", marginRight:10, flexShrink:0 }}>
        <div style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color:pnlCol }}>
          {up ? "+" : ""}${Math.abs(trade.pnl).toFixed(2)}
        </div>
        <div style={{ fontSize:9, fontFamily:MONO, color:pnlCol, opacity:0.72, marginTop:1 }}>
          {up ? "+" : ""}{trade.pnlPct.toFixed(2)}%
        </div>
      </div>
      {trade.score !== undefined && (
        <div style={{
          width:28, height:28, borderRadius:6, flexShrink:0,
          background:`${scoreCol}08`, border:`1px solid ${scoreCol}22`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:9.5, fontFamily:MONO, fontWeight:700, color:scoreCol,
        }}>{trade.score}</div>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────────
function SectionHead({ label, count, color = GR }: {
  label: string; count?: number; color?: string;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
      <div style={{
        width:2.5, height:14, background:color, borderRadius:2, flexShrink:0,
        opacity:0.60, boxShadow: `0 0 6px ${color}55`,
      }}/>
      <span style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
        color:"rgba(255,255,255,0.50)",
        letterSpacing:"0.18em", textTransform:"uppercase" as const }}>
        {label}
      </span>
      {count !== undefined && (
        <div style={{
          marginLeft:"auto", minWidth:22, height:20, borderRadius:4,
          background:"rgba(255,255,255,0.04)", border:`1px solid ${E}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:10, fontFamily:MONO, fontWeight:600, color:GR, padding:"0 5px",
        }}>{count}</div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────────
export default function Trade() {
  const qc = useQueryClient();
  const { openOnboarding, status: brokerStatus } = useBrokerConnection();
  const strictRuntimeMode = useStrictRuntimeMode();
  const tick = useLiveTimer();
  const [openTrade, setOpenTrade] = useState<SimTrade | null>(null);

  const isAlpacaActive = brokerStatus === "paper_active" || brokerStatus === "live_active";

  const { data: status } = useQuery<MobileStatus>({
    queryKey: ["mobile-status"],
    queryFn:  () => api.get("/mobile/status"),
    refetchInterval: 5_000,
  });
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["mobile-portfolio"],
    queryFn:  () => api.get("/mobile/portfolio"),
    refetchInterval: 8_000,
  });
  const { data: tradeHistory } = useQuery<{ trades: SimTrade[] }>({
    queryKey: ["sim-trades"],
    queryFn:  () => api.get("/simulation/trades"),
    retry: false, staleTime: 30_000,
  });
  const { data: alpacaPositions } = useQuery<AlpacaPosition[]>({
    queryKey: ["alpaca-positions"],
    queryFn:  () => api.get<AlpacaPosition[]>("/exchange/alpaca/positions"),
    enabled:  isAlpacaActive,
    refetchInterval: 10_000,
    retry: false,
  });
  const { data: symbolsData } = useQuery<{ symbols: SignalBreakdown[] }>({
    queryKey: ["mobile-symbols"],
    queryFn:  () => api.get("/mobile/symbols"),
    refetchInterval: 8_000,
    retry: false,
  });

  const engine    = status?.engine;
  const isLive    = engine?.mode === "live";

  // Use real Alpaca positions when broker is active, otherwise fall back to sim
  const alpacaMapped: Portfolio["positions"] = (alpacaPositions ?? []).map(p => ({
    id:            p.id,
    symbol:        p.symbol,
    side:          p.side,
    size:          p.qty,
    entryPrice:    p.entryPrice,
    currentPrice:  p.currentPrice,
    unrealizedPnL: p.pnl,
  }));
  const positions = isAlpacaActive && alpacaMapped.length > 0
    ? alpacaMapped
    : (portfolio?.positions ?? []);
  const openPnL = isAlpacaActive && alpacaMapped.length > 0
    ? alpacaMapped.reduce((sum, p) => sum + (p.unrealizedPnL ?? 0), 0)
    : (portfolio?.openPnL ?? 0);
  const history = tradeHistory?.trades ?? [];
  const isMockHistory = false;
    const wins    = history.filter(t => t.pnl > 0).length;
    const winPct  = history.length > 0 ? Math.round((wins / history.length) * 100) : 0;

  // ── [CONVERGENCE_TRACE] ─────────────────────────────────────────────────
  // Phase 5 client-side source-of-truth probe. After the convergence fix
  // (api-server `/api/mobile/portfolio` now reads
  // `userSimRegistry.getUserAccountSummary(userId)`), Live Trades + OPEN
  // count + Trade History all read PER_USER stores backed by the same
  // `sim_positions`/`sim_trades` tables that `registerLiveUserFill`
  // writes to. Emits one console.debug per render so on-call can verify
  // counts agree across panels after a customer BUY.
  //
  // Alpaca branch is unchanged (broker-direct positions when an Alpaca
  // broker session is active). For all other customers, scope is
  // PER_USER on every read.
  //
  // See .local/docs/execution-lifecycle-convergence.md (Convergence Fix).
  if (typeof window !== "undefined") {
    const livePanelSource = isAlpacaActive && alpacaMapped.length > 0
      ? {
          source:   "/api/exchange/alpaca/positions (broker direct)",
          queryKey: ["alpaca-positions"] as const,
          scope:    "BROKER" as const,
        }
      : {
          source:   "/api/mobile/portfolio (per-user userSimRegistry)",
          queryKey: ["mobile-portfolio"] as const,
          scope:    "PER_USER" as const,
        };
    // eslint-disable-next-line no-console
    console.debug("[CONVERGENCE_TRACE]", {
      tag:           "CONVERGENCE_TRACE",
      runtimeMode:   isLive ? "live" : "paper",
      brokerActive:  isAlpacaActive,
      liveTrades: {
        ...livePanelSource,
        renderedCount: positions.length,
      },
      openCount: {
        ...livePanelSource,
        renderedCount: positions.length,
      },
      tradeHistory: {
        source:         "/api/simulation/trades (per-user sim_trades)",
        queryKey:       ["sim-trades"] as const,
        renderedCount:  history.length,
        scope:          "PER_USER" as const,
      },
      unrealizedPnL: {
        source:         livePanelSource.source,
        renderedValue:  openPnL,
        scope:          livePanelSource.scope,
      },
      convergence: {
        liveTradesReadsFromSameSourceAsOpenCount: true,
        liveTradesReadsFromSameSourceAsHistory:
          livePanelSource.scope === "PER_USER",
        note: "Post-fix: /api/mobile/portfolio is per-user-aware. " +
              "Live Trades, OPEN, unrealized PnL, and Trade History all " +
              "derive from per-user sim_positions / sim_trades.",
      },
    });
  }

  // ── Live AI confidence: avg confidence across symbols currently scored by engine
  const breakdowns = symbolsData?.symbols ?? [];
  const confidence = breakdowns.length > 0
    ? Math.round(breakdowns.reduce((s, b) => s + (b.confidence ?? 0), 0) / breakdowns.length)
    : null;

  // ── Live exposure: capital deployed in open positions vs. total portfolio value
  const totalValue = portfolio?.totalValue ?? 0;
  const deployed   = positions.reduce(
    (s, p) => s + Math.abs((p.currentPrice ?? p.entryPrice) * p.size),
    0,
  );
  const exposure = totalValue > 0
    ? Math.min(100, Math.round((deployed / totalValue) * 100))
    : null;

  // ── Live candle data per open-position symbol (for real sparklines) ──────────
  const uniqueSymbols = Array.from(new Set(positions.map(p => p.symbol)));
  const candleQueries = useQueries({
    queries: uniqueSymbols.map(sym => ({
      queryKey: ["candles", sym, "5m"],
      queryFn:  () => api.get<{ close: number }[]>(`/candles?symbol=${sym}&timeframe=5m&limit=30`),
      refetchInterval: 60_000,
      staleTime: 30_000,
      retry: false,
    })),
  });
  const candleClosesBySymbol: Record<string, number[]> = {};
  uniqueSymbols.forEach((sym, i) => {
    const q = candleQueries[i];
    const data = q?.data;
    if (Array.isArray(data) && data.length >= 2) {
      candleClosesBySymbol[sym] = data.map(c => c.close).filter(n => Number.isFinite(n));
    }
  });

  const killMutation  = useMutation({
    mutationFn: () => api.post("/engine/kill-switch", { active: true }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });
  const pauseMutation = useMutation({
    mutationFn: () => api.post("/engine/pause", {}),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });
  const autoMutation  = useMutation({
    mutationFn: () => api.put("/user/settings", { autoMode: !engine?.autoMode }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mobile-status"] }),
  });

  // ── AI trade-size + liquidity guard ───────────────────────────────────────
  // Server-side truth from `GET /api/user/ai-trading/liquidity` (see
  // `routes/userAiLiquidity.ts`). The picker writes `preferredLiveOrderSizeUsd`
  // back to `/api/user/settings`; the backend `liveUserExecution.ts` gate
  // 0LIQ enforces both the plan-tier max-open and the cash cushion against
  // the same numbers — the UI just mirrors what the server already knows.
  type LiquidityStatus = {
    plan:                "free" | "starter" | "pro";
    isAdmin:             boolean;
    tradeSizeUsd:        number;
    allowedTradeSizes:   readonly number[];
    planMaxOpen:         number;
    openLiveCount:       number;
    remainingSlots:      number;
    availableCashUsd:    number;
    requiredCashUsd:     number;
    liquidityProtected:  boolean;
    planCapacityReached: boolean;
    message:             string | null;
  };
  const { data: liquidity } = useQuery<LiquidityStatus>({
    queryKey:        ["user-ai-liquidity"],
    queryFn:         () => api.get("/user/ai-trading/liquidity"),
    refetchInterval: 10_000,
    staleTime:       5_000,
  });
  const tradeSizeMutation = useMutation({
    mutationFn: (n: number) => api.put("/user/settings", { preferredLiveOrderSizeUsd: n }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ["user-ai-liquidity"] });
      qc.invalidateQueries({ queryKey: ["mobile-status"] });
    },
  });
  const SIZE_PRESETS = [10, 20, 50, 100] as const;
  const activeSize   = liquidity?.tradeSizeUsd ?? 10;
  const planLabel    = liquidity?.plan === "pro" ? "PRO" : liquidity?.plan === "starter" ? "STARTER" : "FREE";

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:28 }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{ padding:"18px 20px 14px",
        display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:W,
            fontFamily:SANS, letterSpacing:"-0.02em" }}>
            {isLive ? "Live Trading" : "Paper Trading"}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
            <div style={{
              width:5, height:5, borderRadius:"50%", background:G, flexShrink:0,
              boxShadow: `0 0 8px ${G}99`,
              animation:"dot-pulse 2.5s ease-in-out infinite",
            }}/>
            <span style={{ fontSize:9, fontFamily:SANS, fontWeight:500, color:GR,
              letterSpacing:"0.12em", textTransform:"uppercase" as const }}>
              AI Engine {engine?.running ? "Active" : "Standby"}
            </span>
          </div>
        </div>
        <div style={{
          padding:"4px 12px",
          border:`1px solid ${isLive ? "rgba(0,255,136,0.25)" : "rgba(0,229,255,0.20)"}`,
          background: isLive ? "rgba(0,255,136,0.06)" : "rgba(0,229,255,0.04)",
          borderRadius:20, marginTop:4,
          display:"flex", alignItems:"center", gap:5,
        }}>
          <div style={{ width:4, height:4, borderRadius:"50%",
            background: isLive ? G : C,
            animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
          <span style={{ fontSize:8, fontFamily:SANS, fontWeight:700,
            color: isLive ? G : C, letterSpacing:"0.06em" }}>
            {isLive ? "LIVE" : "PAPER"}
          </span>
        </div>
      </div>

      <UpgradeBanner />
      <EnableLiveCTA style={{ padding: "4px 12px 10px" }}/>

      <div style={{ padding:"0 12px" }}>

        {/* ── AI Trade Size picker + Liquidity Guard status ────────────────── */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${E}`,
          borderRadius: 12,
          padding: "12px 14px",
          marginBottom: 12,
        }}>
          <div style={{
            display:"flex", justifyContent:"space-between", alignItems:"center",
            marginBottom: 10,
          }}>
            <span style={{ fontSize:9, color:GR, fontFamily:SANS, fontWeight:700,
              letterSpacing:"0.14em", textTransform:"uppercase" as const }}>
              AI Trade Size
            </span>
            <span style={{ fontSize:9, color:DIM, fontFamily:MONO,
              letterSpacing:"0.08em" }}>
              {planLabel} · {liquidity?.openLiveCount ?? 0}/{liquidity?.planMaxOpen ?? 0} OPEN
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6 }}>
            {SIZE_PRESETS.map(n => {
              const selected = activeSize === n;
              return (
                <button
                  key={n}
                  onClick={() => tradeSizeMutation.mutate(n)}
                  disabled={tradeSizeMutation.isPending}
                  style={{
                    padding:"10px 0",
                    borderRadius:10,
                    cursor: tradeSizeMutation.isPending ? "wait" : "pointer",
                    fontFamily:MONO, fontSize:13, fontWeight:700,
                    color: selected ? "#000" : W,
                    background: selected ? G : "rgba(255,255,255,0.03)",
                    border: `1px solid ${selected ? G : E}`,
                    transition:"all 120ms ease",
                  }}
                >
                  ${n}
                </button>
              );
            })}
          </div>
          {(liquidity?.liquidityProtected || liquidity?.planCapacityReached) && (
            <div style={{
              marginTop:10,
              padding:"8px 10px",
              borderRadius:8,
              border:`1px solid ${liquidity.liquidityProtected ? "rgba(255,148,0,0.30)" : "rgba(255,51,85,0.30)"}`,
              background: liquidity.liquidityProtected ? "rgba(255,148,0,0.06)" : "rgba(255,51,85,0.06)",
              display:"flex", alignItems:"flex-start", gap:8,
            }}>
              <div style={{
                width:6, height:6, borderRadius:"50%", marginTop:5,
                background: liquidity.liquidityProtected ? O : R, flexShrink:0,
              }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, fontFamily:SANS, fontWeight:800,
                  letterSpacing:"0.12em", textTransform:"uppercase" as const,
                  color: liquidity.liquidityProtected ? O : R, marginBottom:3 }}>
                  {liquidity.liquidityProtected ? "Liquidity Protected" : "Plan Capacity Reached"}
                </div>
                <div style={{ fontSize:11, fontFamily:SANS, color:GR, lineHeight:1.35 }}>
                  {liquidity.message ?? "AI paused new entries to preserve fee/cash cushion."}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Control buttons ──────────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
          <button onClick={() => killMutation.mutate()} style={{
            background:"rgba(255,51,85,0.05)",
            border:"1px solid rgba(255,51,85,0.18)",
            borderRadius:12, padding:"13px 0", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:7,
          }}>
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="8.5" stroke="rgba(255,51,85,0.70)" strokeWidth="1.4"/>
              <path d="M7.5 7.5l7 7M14.5 7.5l-7 7" stroke="rgba(255,51,85,0.80)"
                strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
              color:"rgba(255,51,85,0.85)", letterSpacing:"0.09em" }}>KILL</span>
          </button>

          <button onClick={() => pauseMutation.mutate()} style={{
            background:"rgba(255,148,0,0.05)",
            border:"1px solid rgba(255,148,0,0.18)",
            borderRadius:12, padding:"13px 0", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:7,
          }}>
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <rect x="6.5" y="5.5" width="3" height="11" rx="1.5" fill="rgba(255,148,0,0.75)"/>
              <rect x="12.5" y="5.5" width="3" height="11" rx="1.5" fill="rgba(255,148,0,0.75)"/>
            </svg>
            <span style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
              color:"rgba(255,148,0,0.85)", letterSpacing:"0.09em" }}>PAUSE</span>
          </button>

          <button onClick={() => autoMutation.mutate()} style={{
            background: engine?.autoMode ? "rgba(0,229,255,0.07)" : "rgba(255,255,255,0.02)",
            border:`1px solid ${engine?.autoMode ? "rgba(0,229,255,0.25)" : "rgba(0,229,255,0.12)"}`,
            borderRadius:12, padding:"13px 0", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:7,
          }}>
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <rect x="3.5" y="3.5" width="15" height="15" rx="2.5"
                stroke={engine?.autoMode ? "rgba(0,229,255,0.85)" : "rgba(0,229,255,0.40)"}
                strokeWidth="1.4"/>
              <path d="M7 11h4m4 0h-4m0 0V7m0 4v4"
                stroke={engine?.autoMode ? "rgba(0,229,255,0.85)" : "rgba(0,229,255,0.40)"}
                strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
              color: engine?.autoMode ? "rgba(0,229,255,0.90)" : "rgba(0,229,255,0.55)",
              letterSpacing:"0.09em" }}>AUTO</span>
          </button>
        </div>

        {/* ── Metrics panel — centered donuts ──────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:`linear-gradient(160deg, #0d1822 0%, #090f1c 100%)`,
          border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:16, padding:"22px 10px 18px", marginBottom:12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.54)",
        }}>
          {/* Laser top edge */}
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1.5,
            background:`linear-gradient(90deg, transparent 8%, rgba(155,92,245,0.55) 38%, rgba(0,229,255,0.40) 60%, transparent 92%)`,
            animation:"edge-sweep 10s ease-in-out infinite",
          }}/>

          {/* Donut trio — perfectly centered, equal columns */}
          <div style={{
            display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
            justifyItems:"center", alignItems:"start",
            columnGap:0, marginBottom:20,
          }}>
            <Donut value={winPct}     color="rgba(0,230,120,0.90)"  label="Win/Loss"  sub={`${wins}W · ${history.length - wins}L`} tooltipTerm="Win Rate"/>
            <Donut value={confidence ?? 0} color="rgba(155,92,245,0.90)" label="AI Conf"   sub={confidence === null ? "no signals yet" : "avg confidence"}   tooltipTerm="AI Confidence"/>
            <Donut value={exposure   ?? 0} color="rgba(0,229,255,0.88)"  label="Exposure"  sub={exposure === null ? "no positions"   : "capital deployed"}  tooltipTerm="Exposure"/>
          </div>

          {/* Stats row */}
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(4, 1fr)",
            borderTop:"1px solid rgba(255,255,255,0.05)",
            paddingTop:14, textAlign:"center",
          }}>
            {([
              { val:"+2 wins",     label:"Streak",   color:G },
              { val:"47m",         label:"Avg Hold", color:C },
              { val:`${history.length}`, label:"Trades",   color:W },
              { val:`${engine?.signalsGenerated ?? 0}`, label:"Signals",  color:P },
            ] as { val:string; label:string; color:string }[]).map(({ val, label, color }) => (
              <div key={label}>
                <div style={{ fontSize:13, fontFamily:SANS, fontWeight:800, color,
                  letterSpacing:"-0.01em" }}>{val}</div>
                <div style={{ fontSize:7.5, fontFamily:SANS, fontWeight:500, color:DIM,
                  letterSpacing:"0.10em", marginTop:3, textTransform:"uppercase" as const }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Total unrealized P&L ─────────────────────────────────────────── */}
        <div style={{
          background:CARD,
          border:`1px solid ${openPnL >= 0 ? "rgba(0,255,136,0.16)" : "rgba(255,51,85,0.14)"}`,
          borderRadius:12, padding:"13px 18px", marginBottom:14,
          display:"flex", justifyContent:"space-between", alignItems:"center",
          boxShadow: `0 0 0 0.5px ${openPnL >= 0 ? "rgba(0,255,136,0.04)" : "rgba(255,51,85,0.04)"} inset`,
        }}>
          <div>
            <div style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:GR,
              letterSpacing:"0.14em", textTransform:"uppercase" as const, marginBottom:4 }}>
              Unrealized P&L
            </div>
            <div style={{ fontSize:9, fontFamily:SANS, color:GR }}>
              <span style={{ fontFamily:MONO }}>{positions.length}</span>
              {" open position"}{positions.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{
            fontSize:26, fontFamily:SANS, fontWeight:800,
            color: openPnL >= 0 ? G : R, letterSpacing:"-0.02em",
            animation:"pnl-flash 3s ease-in-out infinite",
          }}>
            {openPnL >= 0 ? "+" : ""}${Math.abs(openPnL).toFixed(2)}
          </div>
        </div>

        {/* ── Open positions — scrollable ───────────────────────────────────── */}
        <div style={{ marginBottom:16 }}>
          <SectionHead label="Open Positions" count={positions.length} color={G}/>

          {positions.length === 0 ? (
            <div style={{
              background:CARD, border:`1px solid ${E}`,
              borderRadius:14, padding:"30px 0", textAlign:"center",
            }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{
                    width:2, height:[8,14,10,12,7][i],
                    background:GR, borderRadius:1, margin:"0 2px",
                    animation:`wave-bar 1.8s ease-in-out ${(i*0.22).toFixed(2)}s infinite alternate`,
                    opacity:0.35,
                  }}/>
                ))}
              </div>
              <div style={{ fontSize:10, fontFamily:SANS, color:GR, letterSpacing:"0.06em" }}>
                No open positions
              </div>
              <div style={{ fontSize:8, fontFamily:SANS, color:DIM, marginTop:4 }}>
                AI monitoring markets in real time
              </div>
            </div>
          ) : (
            <div style={{ position:"relative" }}>
              <div className="positions-scroll" style={{
                maxHeight:460,
                overflowY:"auto", overflowX:"hidden",
                scrollBehavior:"smooth",
                WebkitOverflowScrolling:"touch",
                paddingRight:2,
              }}>
                {positions.map(pos => (
                  <PositionCard key={pos.id} pos={pos} tick={tick} sparkPoints={candleClosesBySymbol[pos.symbol]}/>
                ))}
              </div>
              {positions.length > 2 && (
                <>
                  <div style={{
                    position:"absolute", top:0, left:0, right:4, height:18,
                    background:"linear-gradient(180deg, #000, transparent)",
                    pointerEvents:"none", zIndex:1,
                  }}/>
                  <div style={{
                    position:"absolute", bottom:0, left:0, right:4, height:32,
                    background:"linear-gradient(0deg, #000 0%, transparent 100%)",
                    pointerEvents:"none", zIndex:1,
                  }}/>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Trade history — scrollable terminal ──────────────────────────── */}
        <div style={{ marginBottom:16 }}>
          <SectionHead
            label={isMockHistory ? "Recent Trades (Sample Data)" : `Trade History · ${history.length} closed`}
            color={isMockHistory ? "rgba(255,148,0,0.75)" : C}
          />
          <div style={{
            position:"relative",
            background:`linear-gradient(160deg, #0a1620, #080f1a)`,
            border:`1px solid rgba(0,229,255,0.09)`,
            borderRadius:14, overflow:"hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.54), 0 0 0 0.5px rgba(0,229,255,0.04) inset",
          }}>
            {/* Card top edge */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent 10%, ${C}45 45%, transparent 90%)`,
              animation:"edge-sweep 12s ease-in-out 3s infinite",
              pointerEvents:"none", zIndex:1,
            }}/>
            {isMockHistory && (
              <div style={{
                padding:"8px 14px 6px",
                background:"rgba(255,148,0,0.05)",
                borderBottom:"1px solid rgba(255,148,0,0.12)",
                fontSize:9, fontFamily:SANS, color:"rgba(255,148,0,0.75)",
                display:"flex", alignItems:"center", gap:6,
              }}>
                <span>⚠</span>
                <span>Showing sample trades — your closed trades will appear here once AI executes</span>
              </div>
            )}
            <div className="history-scroll" style={{
              maxHeight:300,
              overflowY:"auto", overflowX:"hidden",
              scrollBehavior:"smooth",
              WebkitOverflowScrolling:"touch",
            }}>
              {history.length === 0 ? (
                <div style={{
                  padding:"32px 16px", textAlign:"center",
                  fontFamily:SANS, fontSize:11, color:"rgba(255,255,255,0.45)",
                  letterSpacing:"0.04em",
                }}>
                  No closed trades yet — your AI trade history will appear here.
                </div>
              ) : (
                history.map(t => <TradeRow key={t.id} trade={t} onOpen={setOpenTrade}/>)
              )}
            </div>
            {/* Bottom fade */}
            <div style={{
              position:"absolute", bottom:0, left:0, right:0, height:28,
              background:"linear-gradient(0deg, rgba(8,15,26,1) 0%, transparent 100%)",
              pointerEvents:"none",
            }}/>
          </div>
        </div>

        {/* ── Broker account status ─────────────────────────────────────────── */}
        <BrokerStatusCard/>
        {brokerStatus === "idle" && (
          <button onClick={openOnboarding} style={{
            width:"100%", padding:"15px 0", marginTop:10,
            background:"linear-gradient(135deg, rgba(0,229,255,0.13), rgba(155,92,245,0.09))",
            border:"1px solid rgba(0,229,255,0.40)",
            borderRadius:12, color:C,
            fontFamily:SANS, fontSize:13, fontWeight:700,
            letterSpacing:"0.02em", cursor:"pointer",
            animation:"cta-breathe 4s ease-in-out infinite",
          }}>
            Start with AICandlez →
          </button>
        )}
      </div>

      {/* ── Keyframes + scrollbar styles ────────────────────────────────────── */}
      <style>{`
        @keyframes dot-pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.40;transform:scale(0.80)} }
        @keyframes pnl-flash   { 0%,100%{opacity:1} 50%{opacity:.68} }
        @keyframes wave-bar    { from{transform:scaleY(.25);opacity:.2} to{transform:scaleY(1);opacity:.65} }
        @keyframes edge-sweep  { 0%{opacity:.1;transform:scaleX(.25) translateX(-80%)} 50%{opacity:1;transform:scaleX(1) translateX(0)} 100%{opacity:.1;transform:scaleX(.25) translateX(80%)} }
        @keyframes chart-drift { 0%,100%{transform:translateY(0)} 35%{transform:translateY(-.55px)} 70%{transform:translateY(.28px)} }
        @keyframes timer-tick  { 0%,49%{opacity:1} 50%,100%{opacity:.55} }
        @keyframes orb-breathe { 0%,100%{opacity:.55;transform:scale(1)} 50%{opacity:1;transform:scale(1.20)} }
        @keyframes cta-breathe { 0%,100%{box-shadow: 0 0 12px rgba(0,229,255,0.06)} 50%{box-shadow: 0 0 28px rgba(0,229,255,0.14)} }
        @keyframes page-in     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .page-enter            { animation: page-in 0.35s ease-out both; }

        .positions-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(0,255,136,0.24) transparent;
        }
        .positions-scroll::-webkit-scrollbar { width: 2px; }
        .positions-scroll::-webkit-scrollbar-track { background: transparent; }
        .positions-scroll::-webkit-scrollbar-thumb {
          background: rgba(0,255,136,0.28); border-radius: 2px;
        }

        .history-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(0,229,255,0.20) transparent;
        }
        .history-scroll::-webkit-scrollbar { width: 2px; }
        .history-scroll::-webkit-scrollbar-track { background: transparent; }
        .history-scroll::-webkit-scrollbar-thumb {
          background: rgba(0,229,255,0.22); border-radius: 2px;
        }
      `}</style>

      <TradeDetailSheet trade={openTrade} onClose={() => setOpenTrade(null)}/>
    </div>
  );
}
