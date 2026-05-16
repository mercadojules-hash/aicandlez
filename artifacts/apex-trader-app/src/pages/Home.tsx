import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";
import { BrokerStatusCard } from "@/components/BrokerStatusCard";
import aicandlezLogo from "@assets/AICandlez_Final_Logo_3_1778962760188.png";
import {
  api,
  type MobileStatus, type Portfolio, type SimAccount,
  type SignalBreakdown, type Subscription,
} from "@/lib/api";

const SANS = "Inter, 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', Consolas, monospace";
const C    = "#00e5ff";
const G    = "#00ff88";
const P    = "#9b5cf5";
const O    = "#ff9400";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#647385";
const GOLD = "#ffd200";
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const ESUB = "rgba(255,255,255,0.04)";

function fmt(n: number) {
  return Math.abs(n) >= 1_000 ? `$${(n/1_000).toFixed(1)}K` : `$${n.toFixed(2)}`;
}
function planColor(p: string) {
  if (p.includes("active")||p.includes("paid")||p.includes("live")) return G;
  return C;
}
function planLabel(p: string) {
  if (p.includes("active")||p.includes("paid")||p.includes("live")) return "Active";
  return "Trial";
}

const MKTS = [
  { sym:"BTC",  label:"Bitcoin",   price:"$68,120", pct:"+2.4%", action:"LONG",  trend:"up"   as const },
  { sym:"ETH",  label:"Ethereum",  price:"$3,512",  pct:"+1.8%", action:"LONG",  trend:"up"   as const },
  { sym:"SOL",  label:"Solana",    price:"$188",    pct:"-0.3%", action:"HOLD",  trend:"flat" as const },
  { sym:"NVDA", label:"Nvidia",    price:"$875",    pct:"+3.1%", action:"LONG",  trend:"up"   as const },
  { sym:"TSLA", label:"Tesla",     price:"$177",    pct:"+1.2%", action:"LONG",  trend:"up"   as const },
  { sym:"SPY",  label:"S&P 500",   price:"$521",    pct:"+0.6%", action:"LONG",  trend:"up"   as const },
];
const AC: Record<string,string> = { LONG:G, SHORT:R, HOLD:C };
const MKTS_CONF: Record<string,number> = { BTC:74, ETH:68, SOL:45, NVDA:81, TSLA:63, SPY:72 };

const AI_LINES = [
  "AI detected bullish momentum on BTC…",
  "BTCUSD breakout probability: 74%",
  "ETH volatility compression identified…",
  "Analyzing 1H EMA alignment across 6 assets",
  "SOL holding key support zone — monitoring",
  "NVDA momentum confirmation in progress…",
  "Signal quality threshold: PASSED",
  "Multi-timeframe confluence detected on ETH",
  "BTC 4H EMA9 crossed above EMA21…",
  "Risk parameters verified — position sizing OK",
];

function useTypewriter(text: string, speed = 36) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const t = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return displayed;
}

function genPts(seed: string, trend: "up"|"down"|"flat") {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) { s = (((s<<5)+s)^seed.charCodeAt(i))>>>0; }
  const rand = () => { s^=s<<13; s^=s>>17; s^=s<<5; return (s>>>0)/0x100000000; };
  const dir = trend==="up" ? 1.6 : trend==="down" ? -1.6 : 0.1;
  const pts: number[] = []; let v = 50;
  for (let i = 0; i < 24; i++) { v = Math.max(8,Math.min(92,v+(rand()-0.5)*8+dir)); pts.push(v); }
  return pts;
}

function Sparkline({ seed, trend, w=88, h=34, animDelay="0s" }: {
  seed:string; trend:"up"|"down"|"flat"; w?:number; h?:number; animDelay?:string;
}) {
  const col = trend==="up" ? G : trend==="down" ? R : C;
  const raw = genPts(seed, trend);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn||1;
  const pts = raw.map((p,i) => ({ x:(i/(raw.length-1))*w, y:h-3-((p-mn)/rng)*(h-6) }));
  const t = 0.33;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length-1; i++) {
    const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
    const cp1x=p1.x+(p2.x-p0.x)*t, cp1y=p1.y+(p2.y-p0.y)*t;
    const cp2x=p2.x-(p3.x-p1.x)*t, cp2y=p2.y-(p3.y-p1.y)*t;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const lastPt = pts[pts.length-1];
  const fillD = `${d} L ${lastPt.x},${h} L 0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow:"visible", animation:`chart-drift 14s ease-in-out ${animDelay} infinite` }}>
      <defs>
        <linearGradient id={`sg-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#sg-${seed})`}/>
      <path d={d} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={lastPt.x} cy={lastPt.y} r="2.5" fill={col} opacity="0.9"
        style={{ animation:"dot-pulse 2s ease-in-out infinite" }}/>
    </svg>
  );
}

function AIWave({ color=G, bars=14 }: { color?:string; bars?:number }) {
  const H = [3,7,13,9,5,17,22,14,8,18,12,6,10,4];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:2, height:22 }}>
      {H.slice(0,bars).map((h,i) => (
        <div key={i} style={{
          width:2, height:h, borderRadius:1, background:color, opacity:0.55,
          animation:`wave-bar 2.2s ease-in-out ${(i*0.09).toFixed(2)}s infinite alternate`,
        }}/>
      ))}
    </div>
  );
}

function ConfBar({ value, color, delay="0s" }: { value:number; color:string; delay?:string }) {
  return (
    <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:4, overflow:"hidden" }}>
      <div style={{
        height:"100%", background:`linear-gradient(90deg, ${color}88, ${color})`,
        borderRadius:4, width:`${value}%`,
        boxShadow:`0 0 6px ${color}44`,
        animation:`bar-in 0.8s ${delay} ease-out both, bar-breathe 5s ${delay} ease-in-out 0.8s infinite`,
      }}/>
    </div>
  );
}

function SH({ label, right, color=P }: { label:string; right?:string; color?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12 }}>
      <div style={{ width:3, height:12, background:`linear-gradient(180deg, ${color}, ${color}55)`,
        borderRadius:2, flexShrink:0,
        boxShadow:`0 0 8px ${color}40`,
      }}/>
      <span style={{ fontSize:10, fontFamily:SANS, fontWeight:700, color:GR,
        letterSpacing:"0.14em", textTransform:"uppercase" as const }}>
        {label}
      </span>
      {right && <span style={{ marginLeft:"auto", fontSize:9, fontFamily:SANS, color:DIM }}>{right}</span>}
    </div>
  );
}

function ParticleField() {
  const pts = [
    { x:8,  y:18, s:1.5, d:"0s",   dr:"8s"  },
    { x:33, y:62, s:1,   d:"1.3s", dr:"11s" },
    { x:58, y:12, s:2,   d:"0.6s", dr:"9s"  },
    { x:78, y:72, s:1.5, d:"2.1s", dr:"7s"  },
    { x:48, y:44, s:1,   d:"1.9s", dr:"10s" },
    { x:20, y:85, s:1.5, d:"0.9s", dr:"13s" },
    { x:88, y:28, s:1,   d:"1.6s", dr:"8.5s"},
    { x:65, y:55, s:2,   d:"0.3s", dr:"12s" },
  ];
  return (
    <div aria-hidden style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
      {pts.map((p,i) => (
        <div key={i} style={{
          position:"absolute", left:`${p.x}%`, top:`${p.y}%`,
          width:p.s, height:p.s, borderRadius:"50%",
          background:`radial-gradient(circle, ${C}, transparent)`,
          opacity:0.5,
          animation:`particle-float ${p.dr} ${p.d} ease-in-out infinite alternate`,
        }}/>
      ))}
    </div>
  );
}

function Ticker({ items }: { items:string[] }) {
  const t = items.join("   ·   ") + "   ·   " + items.join("   ·   ");
  return (
    <div style={{ overflow:"hidden", height:18, background:`${BG}`,
      borderBottom:`1px solid ${ESUB}`, position:"relative" }}>
      <div style={{
        display:"inline-flex", whiteSpace:"nowrap", paddingLeft:"100%",
        animation:"ticker-scroll 36s linear infinite",
        fontSize:7.5, fontFamily:MONO, color:DIM, letterSpacing:"0.08em", lineHeight:"18px",
      }}>
        {t}
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { openOnboarding, status: brokerStatus } = useBrokerConnection();
  const [lineIdx, setLineIdx] = useState(0);
  const [launching, setLaunching] = useState(false);
  const typedLine = useTypewriter(AI_LINES[lineIdx]);

  useEffect(() => {
    const t = setInterval(() => setLineIdx(i => (i+1) % AI_LINES.length), 3800);
    return () => clearInterval(t);
  }, []);

  const { data:status }    = useQuery<MobileStatus>({
    queryKey:["mobile-status"],    queryFn:()=>api.get("/mobile/status"),    refetchInterval:5_000 });
  const { data:portfolio } = useQuery<Portfolio>({
    queryKey:["mobile-portfolio"], queryFn:()=>api.get("/mobile/portfolio"), refetchInterval:8_000 });
  const { data:simAcc }    = useQuery<SimAccount>({
    queryKey:["sim-account"],      queryFn:()=>api.get("/account"),          retry:false, staleTime:60_000 });
  const { data:signals }   = useQuery<{ breakdowns:Record<string,SignalBreakdown> }>({
    queryKey:["mobile-signals"],   queryFn:()=>api.get("/mobile/signals"),   refetchInterval:5_000 });
  const { data:sub }       = useQuery<Subscription>({
    queryKey:["subscription"],     queryFn:()=>api.get("/billing/subscription"), staleTime:120_000, retry:false });

  const engine   = status?.engine;
  const isLive   = engine?.mode === "live";
  const tv       = portfolio?.totalValue  ?? 100_000;
  const pnl      = portfolio?.openPnL     ?? 0;
  const pnlPct   = tv > 0 ? (pnl/tv*100) : 0;
  const posCount = portfolio?.positions?.length ?? 0;
  const winRate  = simAcc?.winRate     ?? 63;
  const trades   = simAcc?.totalTrades ?? 41;
  const realized = simAcc?.realizedPnL ?? 3800;
  const fees     = simAcc?.feesPaid    ?? 142.88;
  const sigList  = signals?.breakdowns ? Object.entries(signals.breakdowns).slice(0,5) : [];
  const plan     = (sub?.plan ?? "free").toLowerCase();
  const pColor   = planColor(plan);
  const pLabel   = planLabel(plan);
  const exchange = engine?.exchange?.toUpperCase() ?? "ALPACA";
  const initials = "AM";
  const name     = "Alex Morgan";

  const tickerItems = [
    `BTC $68,120 ▲2.4%`, `ETH $3,512 ▲1.8%`, `SOL $188 ▼0.3%`,
    `NVDA $875 ▲3.1%`, `TSLA $177 ▲1.2%`, `SPY $521 ▲0.6%`,
    `AI SIG ${sigList.length}`, `ENGINE ${engine?.running?"LIVE":"IDLE"}`,
    `POSITIONS ${posCount}`, `WIN RATE ${winRate}%`,
  ];

  function handleLaunch() {
    if (launching || brokerStatus !== "idle") return;
    setLaunching(true);
    setTimeout(() => { setLaunching(false); openOnboarding(); }, 1600);
  }

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:24 }}>

      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 16px 10px",
        background:`linear-gradient(180deg, rgba(0,8,20,0.98) 0%, rgba(0,0,0,0) 100%)`,
        position:"sticky", top:0, zIndex:10,
        backdropFilter:"blur(12px)",
        WebkitBackdropFilter:"blur(12px)",
        borderBottom:`1px solid ${ESUB}`,
      }}>
        {/* Brand logo — horizontal full version */}
        <img src={aicandlezLogo} alt="AICandlez"
          style={{
            height:50, width:"auto", objectFit:"contain", maxWidth:230,
            filter:"drop-shadow(0 0 22px rgba(0,229,255,0.38)) brightness(1.09)",
          }}/>

        {/* Right side: mode pill + avatar */}
        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <div style={{
            padding:"3px 10px", borderRadius:20,
            background: isLive ? "rgba(0,255,136,0.08)" : "rgba(0,229,255,0.06)",
            border:`1px solid ${isLive ? "rgba(0,255,136,0.25)" : "rgba(0,229,255,0.20)"}`,
            display:"flex", alignItems:"center", gap:5,
          }}>
            <div style={{
              width:5, height:5, borderRadius:"50%",
              background: isLive ? G : C,
              animation:"dot-pulse 2.5s ease-in-out infinite",
            }}/>
            <span style={{ fontSize:8, fontFamily:SANS, fontWeight:600,
              color: isLive ? G : C, letterSpacing:"0.06em" }}>
              {isLive ? "LIVE" : "SIM"}
            </span>
          </div>

          <div onClick={()=>setLocation("/profile")} style={{
            width:34, height:34, borderRadius:"50%", flexShrink:0, cursor:"pointer",
            background:`linear-gradient(135deg, #0d1f30, #0a1520)`,
            border:`1.5px solid rgba(0,229,255,0.20)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, fontFamily:SANS, fontWeight:700, color:C,
            position:"relative",
            boxShadow:`0 0 0 2px rgba(0,229,255,0.06)`,
          }}>
            {initials}
            <div style={{
              position:"absolute", bottom:0, right:0, width:9, height:9,
              borderRadius:"50%", background:G, border:`2px solid ${BG}`,
            }}/>
          </div>
        </div>
      </div>

      {/* ── Ticker ──────────────────────────────────────────────────────────── */}
      <Ticker items={tickerItems}/>

      {/* ── Hero — AI Engine Status ──────────────────────────────────────────── */}
      <div style={{
        position:"relative", overflow:"hidden",
        margin:"12px 12px 0",
        borderRadius:20,
        background:`linear-gradient(160deg, #000d1a 0%, #020a14 50%, #000812 100%)`,
        border:`1px solid rgba(0,229,255,0.10)`,
        padding:"22px 18px 18px",
        boxShadow:`0 20px 60px rgba(0,0,0,0.95), 0 0 80px rgba(0,229,255,0.03) inset`,
      }}>

        {/* Ambient glow orbs — breathing */}
        <div aria-hidden style={{
          position:"absolute", top:-50, left:-30, width:260, height:260, borderRadius:"50%",
          background:`radial-gradient(circle, rgba(0,229,255,0.09) 0%, transparent 70%)`,
          pointerEvents:"none",
          animation:"orb-breathe 9s ease-in-out infinite",
        }}/>
        <div aria-hidden style={{
          position:"absolute", bottom:-40, right:-20, width:200, height:200, borderRadius:"50%",
          background:`radial-gradient(circle, rgba(155,92,245,0.10) 0%, transparent 70%)`,
          pointerEvents:"none",
          animation:"orb-breathe 9s ease-in-out 4.5s infinite",
        }}/>
        <div aria-hidden style={{
          position:"absolute", top:"38%", right:"18%", width:90, height:90, borderRadius:"50%",
          background:`radial-gradient(circle, rgba(0,255,136,0.07) 0%, transparent 70%)`,
          pointerEvents:"none",
          animation:"orb-breathe 6s ease-in-out 2s infinite",
        }}/>
        {/* Top laser edge */}
        <div aria-hidden style={{
          position:"absolute", top:0, left:0, right:0, height:1.5,
          background:`linear-gradient(90deg, transparent 8%, ${C}70 38%, ${G}50 56%, ${C}65 74%, transparent 92%)`,
          animation:"edge-sweep 8s ease-in-out infinite",
        }}/>
        {/* Horizontal scan line */}
        <div aria-hidden style={{
          position:"absolute", left:0, right:0, height:1,
          background:`linear-gradient(90deg, transparent, rgba(0,229,255,0.15), transparent)`,
          animation:"scan-line 5s linear infinite",
          pointerEvents:"none",
        }}/>

        <ParticleField />

        <div style={{ position:"relative" }}>
          {/* Status row */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ position:"relative", width:22, height:22, flexShrink:0 }}>
                <div style={{
                  width:9, height:9, borderRadius:"50%", background:G,
                  margin:"6.5px", animation:"dot-pulse 2s ease-in-out infinite",
                  boxShadow:`0 0 10px ${G}88`,
                }}/>
                <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                  border:`1.5px solid rgba(0,255,136,0.35)`,
                  animation:"ring-out 3s ease-out infinite" }}/>
                <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                  border:`1px solid rgba(0,255,136,0.12)`,
                  animation:"ring-out 3s ease-out 1s infinite" }}/>
              </div>
              <div>
                <div style={{ fontSize:15, fontFamily:SANS, fontWeight:700, color:G,
                  letterSpacing:"0.01em" }}>
                  {engine?.running ? "AI Active" : "AI Standby"}
                </div>
                <div style={{ fontSize:9, fontFamily:SANS, color:DIM, marginTop:1 }}>
                  {exchange} · {engine?.signalsGenerated??0} signals generated
                </div>
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:DIM,
                letterSpacing:"0.10em", textTransform:"uppercase" as const, marginBottom:5 }}>
                Signal Strength
              </div>
              <ConfBar value={engine?.running ? 74 : 12} color={G}/>
            </div>
          </div>

          {/* Waveform */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <AIWave color={C} bars={14}/>
            <div style={{
              fontSize:8, fontFamily:SANS, color:DIM,
              animation:"scan-text 3s ease-in-out infinite",
            }}>
              SCANNING MARKETS
            </div>
          </div>

          {/* Typewriter AI line */}
          <div style={{
            background:"rgba(0,229,255,0.04)",
            border:`1px solid rgba(0,229,255,0.10)`,
            borderRadius:8, padding:"9px 12px",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <div style={{
              width:5, height:5, borderRadius:"50%",
              background:C, flexShrink:0,
              animation:"dot-pulse 2s ease-in-out infinite",
            }}/>
            <span style={{
              fontSize:10, fontFamily:MONO, color:C,
              letterSpacing:"0.02em", minHeight:14,
            }}>
              {typedLine}
              <span style={{ animation:"cursor-blink 0.9s step-end infinite", opacity:0.8 }}>|</span>
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding:"12px 12px 0" }}>

        {/* ── Portfolio Hero Card ──────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden", borderRadius:20,
          marginBottom:12, padding:"22px 20px 20px",
          background:`linear-gradient(145deg, #0d1c2e 0%, #0a1622 60%, #080f1c 100%)`,
          border:`1px solid rgba(0,229,255,0.12)`,
          boxShadow:[
            "0 24px 70px rgba(0,0,0,0.97)",
            "0 0 0 0.5px rgba(0,229,255,0.06) inset",
            "0 2px 4px rgba(0,229,255,0.04) inset",
          ].join(", "),
        }}>
          {/* Laser top edge */}
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1.5,
            background:`linear-gradient(90deg, transparent 5%, ${C}70 35%, ${G}55 55%, ${C}65 75%, transparent 95%)`,
            animation:"edge-sweep 7s ease-in-out infinite",
          }}/>
          {/* Bottom ambient glow — breathing */}
          <div aria-hidden style={{
            position:"absolute", bottom:0, left:"15%", right:"15%", height:60,
            background:`radial-gradient(ellipse, rgba(0,255,136,0.08) 0%, transparent 70%)`,
            pointerEvents:"none",
            animation:"orb-breathe 6s ease-in-out infinite",
          }}/>
          {/* Shimmer sweep */}
          <div aria-hidden style={{
            position:"absolute", top:0, bottom:0, width:"30%",
            background:`linear-gradient(90deg, transparent, rgba(255,255,255,0.015), transparent)`,
            animation:"shimmer-sweep 8s ease-in-out infinite",
            pointerEvents:"none",
          }}/>

          <div style={{ position:"relative" }}>
            <div style={{
              display:"flex", alignItems:"flex-start", justifyContent:"space-between",
              marginBottom:6,
            }}>
              <div style={{ fontSize:9, fontFamily:SANS, fontWeight:700, color:DIM,
                letterSpacing:"0.18em", textTransform:"uppercase" as const }}>
                Portfolio Value
              </div>
              <div style={{
                fontSize:8, fontFamily:SANS, fontWeight:600,
                padding:"2px 8px", borderRadius:4,
                background:`${pColor}12`, border:`1px solid ${pColor}30`,
                color:pColor, letterSpacing:"0.07em",
              }}>
                {pLabel.toUpperCase()}
              </div>
            </div>

            {/* Big balance */}
            <div style={{
              fontSize:52, fontWeight:900, color:W, fontFamily:MONO,
              letterSpacing:"-0.04em", lineHeight:1,
              animation:"num-pop 0.6s ease-out both",
              textShadow:`0 0 40px rgba(255,255,255,0.08)`,
            }}>
              {fmt(tv)}
            </div>

            {/* PnL row */}
            <div style={{
              display:"flex", alignItems:"center", gap:10, marginTop:10,
              flexWrap:"wrap",
            }}>
              <div style={{
                display:"flex", alignItems:"center", gap:6,
                padding:"4px 10px", borderRadius:20,
                background: pnl>=0 ? "rgba(0,255,136,0.07)" : "rgba(255,51,85,0.07)",
                border:`1px solid ${pnl>=0 ? "rgba(0,255,136,0.20)" : "rgba(255,51,85,0.20)"}`,
                animation:"pnl-flash 3s ease-in-out infinite",
              }}>
                <span style={{ fontSize:9, color: pnl>=0?G:R }}>
                  {pnl>=0?"▲":"▼"}
                </span>
                <span style={{ fontSize:13, fontFamily:MONO, fontWeight:700,
                  color:pnl>=0?G:R }}>
                  {pnl>=0?"+":""}{pnl.toFixed(2)}
                </span>
              </div>
              <span style={{ fontSize:12, fontFamily:MONO, color:pnlPct>=0?G:R, fontWeight:600 }}>
                {pnlPct>=0?"+":""}{pnlPct.toFixed(2)}%
              </span>
              <span style={{ fontSize:9, fontFamily:SANS, color:DIM, marginLeft:"auto",
                animation:"scan-text 5s ease-in-out infinite" }}>
                Unrealized P&L
              </span>
            </div>

            {/* Mini sparkline chart */}
            <div style={{ marginTop:12 }}>
              <Sparkline seed="portfolio-equity" trend={pnl>=0?"up":"down"} w={300} h={44} animDelay="0s"/>
            </div>

            {/* Sub-stats */}
            <div style={{
              display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
              marginTop:14, borderTop:`1px solid ${ESUB}`, paddingTop:14, gap:8,
            }}>
              {[
                { label:"Cash",      val:fmt(tv*0.855), color:W,    sub:"available" },
                { label:"Realized",  val:realized>=0?`+${fmt(realized)}`:fmt(realized), color:G, sub:"closed trades" },
                { label:"Fees",      val:`$${fees.toFixed(2)}`, color:GOLD, sub:"total paid" },
              ].map(({ label, val, color, sub }) => (
                <div key={label} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:8, fontFamily:SANS, color:DIM,
                    letterSpacing:"0.08em", marginBottom:4, textTransform:"uppercase" as const }}>
                    {label}
                  </div>
                  <div style={{ fontSize:15, fontFamily:MONO, fontWeight:700, color }}>{val}</div>
                  <div style={{ fontSize:7.5, fontFamily:SANS, color:`${color}40`, marginTop:2 }}>{sub}</div>
                </div>
              ))}
            </div>

            {!isLive && (
              <div style={{
                marginTop:14, padding:"7px 12px", borderRadius:8,
                background:"rgba(0,229,255,0.04)", border:`1px solid rgba(0,229,255,0.10)`,
                fontSize:9, fontFamily:SANS, color:C,
                display:"flex", alignItems:"center", gap:8,
              }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:C, flexShrink:0,
                  animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
                Paper trading mode · No real funds at risk · Always free
              </div>
            )}
          </div>
        </div>

        {/* ── Stats Trio ───────────────────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:18 }}>
          {[
            { val:`${winRate}%`, label:"Win Rate", color:G, sub:"4W · 1L",     icon:"↑" },
            { val:String(posCount), label:"Positions", color:C, sub:"open",    icon:"◈" },
            { val:String(trades),   label:"Trades",   color:W, sub:"all time", icon:"◉" },
          ].map(({ val, label, color, sub, icon }, i) => (
            <div key={label} style={{
              position:"relative", overflow:"hidden",
              background:`linear-gradient(160deg, #0d1a28, #080f1a)`,
              border:`1px solid rgba(255,255,255,0.07)`,
              borderRadius:14, padding:"16px 10px 14px", textAlign:"center",
              boxShadow:`0 8px 28px rgba(0,0,0,0.9)`,
              animation:`card-in 0.4s ${(i*0.09).toFixed(2)}s ease-out both`,
            }}>
              <div aria-hidden style={{
                position:"absolute", top:0, left:"25%", right:"25%", height:1,
                background:`linear-gradient(90deg, transparent, ${color}30, transparent)`,
              }}/>
              <div style={{ fontSize:9, color:`${color}60`, marginBottom:4, fontFamily:SANS }}>
                {icon}
              </div>
              <div style={{
                fontSize:30, fontWeight:800, color, fontFamily:MONO, lineHeight:1, marginBottom:4,
                animation:`stat-glow 6s ease-in-out ${i*1.8}s infinite`,
                textShadow:`0 0 20px ${color}30`,
              }}>
                {val}
              </div>
              <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:DIM,
                letterSpacing:"0.08em", textTransform:"uppercase" as const }}>
                {label}
              </div>
              <div style={{ fontSize:7.5, fontFamily:SANS, color:`${color}35`, marginTop:2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Live Markets ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SH label="Live Markets" color={C}/>
          <div style={{
            background:`linear-gradient(160deg, #0a1520, #080f1a)`,
            border:`1px solid ${E}`,
            borderRadius:16, overflow:"hidden",
            boxShadow:`0 8px 32px rgba(0,0,0,0.9)`,
          }}>
            {MKTS.map(({ sym, label: symLabel, price, pct, action, trend }, i) => {
              const ac = AC[action]??W;
              const pctPos = !pct.startsWith("-");
              return (
                <div key={sym} style={{
                  display:"flex", alignItems:"center", gap:10, padding:"12px 14px",
                  borderBottom: i<MKTS.length-1 ? `1px solid ${ESUB}` : "none",
                  animation:`card-in 0.3s ${(i*0.06).toFixed(2)}s ease-out both`,
                  background:`${ac}02`,
                  position:"relative", overflow:"hidden",
                }}>
                  {/* Subtle row scan sweep */}
                  <div aria-hidden style={{
                    position:"absolute", inset:0,
                    background:`linear-gradient(90deg, transparent 0%, ${ac}06 50%, transparent 100%)`,
                    animation:`row-shimmer 12s ease-in-out ${i*2}s infinite`,
                    pointerEvents:"none",
                  }}/>
                  <div style={{
                    width:3, height:36, borderRadius:2, flexShrink:0,
                    background:`linear-gradient(180deg, ${ac}, ${ac}44)`,
                    boxShadow:`0 0 6px ${ac}44`,
                  }}/>

                  <div style={{ flex:"0 0 74px" }}>
                    <div style={{ fontSize:12, fontFamily:SANS, fontWeight:700, color:W,
                      letterSpacing:"0.01em", marginBottom:2 }}>
                      {sym}
                    </div>
                    <div style={{ fontSize:8, fontFamily:SANS, color:DIM }}>{symLabel}</div>
                  </div>

                  <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
                    <Sparkline seed={sym+"mkt"} trend={trend} w={88} h={34}
                      animDelay={`${i*3.5}s`}/>
                  </div>

                  <div style={{ textAlign:"right", flex:"0 0 70px" }}>
                    <div style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color:W,
                      marginBottom:3 }}>
                      {price}
                    </div>
                    <div style={{
                      fontSize:9, fontFamily:MONO, fontWeight:600,
                      color: pctPos ? G : R,
                    }}>
                      {pct}
                    </div>
                  </div>

                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, flexShrink:0 }}>
                    <div style={{
                      padding:"4px 12px",
                      background:`${ac}0a`,
                      border:`1px solid ${ac}30`,
                      borderRadius:20,
                      fontSize:8, fontFamily:SANS, fontWeight:700,
                      color:ac, letterSpacing:"0.05em",
                      boxShadow: `0 0 10px ${ac}18`,
                    }}>
                      {action}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <div style={{
                        width:32, height:2, background:"rgba(255,255,255,0.05)",
                        borderRadius:2, overflow:"hidden",
                      }}>
                        <div style={{
                          width:`${MKTS_CONF[sym]??60}%`, height:"100%",
                          background:`linear-gradient(90deg, ${ac}66, ${ac})`,
                          borderRadius:2,
                          boxShadow:`0 0 4px ${ac}55`,
                        }}/>
                      </div>
                      <span style={{ fontSize:7, fontFamily:MONO, color:DIM }}>
                        {MKTS_CONF[sym]??60}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── AI Signal Feed ───────────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SH label="AI Signal Feed" right={`${sigList.length} active`} color={G}/>
          <div style={{
            position:"relative",
            background:`linear-gradient(160deg, #0a1622, #080f1c)`,
            border:`1px solid rgba(0,255,136,0.10)`,
            borderRadius:16, overflow:"hidden",
            boxShadow:`0 8px 32px rgba(0,0,0,0.9), 0 0 0 0.5px rgba(0,255,136,0.05) inset`,
          }}>
            {/* Card-level scan sweep */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent 10%, ${G}50 45%, ${G}40 55%, transparent 90%)`,
              animation:"edge-sweep 10s ease-in-out 2s infinite",
              pointerEvents:"none",
            }}/>
            {/* Feed header with live typewriter */}
            <div style={{
              padding:"10px 14px", borderBottom:`1px solid ${ESUB}`,
              background:"rgba(0,255,136,0.03)",
              display:"flex", alignItems:"center", gap:8,
            }}>
              <div style={{ display:"flex", gap:3 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width:2, height:[8,14,10][i], background:G, borderRadius:1,
                    animation:`wave-bar 1.8s ease-in-out ${(i*0.25).toFixed(2)}s infinite alternate`,
                  }}/>
                ))}
              </div>
              <span style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:G }}>
                Live Signal Feed
              </span>
              <div style={{ marginLeft:"auto", fontSize:8, fontFamily:MONO, color:DIM,
                animation:"scan-text 3s ease-in-out infinite" }}>
                SCANNING
              </div>
            </div>

            {sigList.length === 0 ? (
              <div style={{ padding:"24px 0", textAlign:"center" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
                  <AIWave color={C} bars={10}/>
                </div>
                <div style={{ fontSize:10, fontFamily:SANS, color:DIM }}>Engine warming up…</div>
              </div>
            ) : sigList.map(([sym, bd], i) => {
              const conf  = bd.confidence ?? 0;
              const age   = Math.floor((Date.now()-bd.lastUpdated)/1000);
              const ageT  = age<60 ? `${age}s` : `${Math.floor(age/60)}m`;
              const color = AC[bd.action]??GR;
              return (
                <div key={sym} style={{
                  display:"flex", alignItems:"stretch",
                  borderBottom: i<sigList.length-1 ? `1px solid ${ESUB}` : "none",
                  animation:`card-in 0.3s ${(i*0.07).toFixed(2)}s ease-out both`,
                }}>
                  <div style={{
                    width:3, background:`linear-gradient(180deg, ${color}, ${color}44)`,
                    boxShadow:`0 0 4px ${color}33`, flexShrink:0,
                  }}/>
                  <div style={{ flex:"0 0 68px", padding:"12px 10px" }}>
                    <div style={{ fontSize:13, fontFamily:SANS, fontWeight:700, color:W }}>
                      {sym.replace("USD","")}
                    </div>
                    <div style={{ fontSize:8, fontFamily:MONO, color:DIM, marginTop:3 }}>{ageT} ago</div>
                  </div>
                  <div style={{ flex:1, padding:"12px 8px" }}>
                    <div style={{ fontSize:9, fontFamily:SANS, color:DIM, marginBottom:6 }}>
                      EMA+RSI confluence
                    </div>
                    <ConfBar value={conf} color={color} delay={`${i*0.1}s`}/>
                  </div>
                  <div style={{ padding:"12px 14px 12px 8px", textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color,
                      marginBottom:2 }}>
                      {conf.toFixed(1)}%
                    </div>
                    <div style={{ fontSize:8, fontFamily:SANS, fontWeight:700,
                      color, letterSpacing:"0.04em" }}>
                      {bd.action}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Broker Status ────────────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SH label="Trading Account" color={P}/>
          <BrokerStatusCard />
        </div>

        {/* ── Launch AI Trading CTA ────────────────────────────────────────────── */}
        {brokerStatus === "idle" && (
          <div style={{
            position:"relative", overflow:"hidden",
            background:`linear-gradient(145deg, #080f1a 0%, #0a1220 50%, #060d16 100%)`,
            border:`1px solid rgba(155,92,245,0.18)`,
            borderRadius:20, padding:"24px 20px",
            boxShadow:`0 20px 60px rgba(0,0,0,0.95), 0 0 40px rgba(155,92,245,0.04) inset`,
          }}>
            {/* Animated laser edge */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1.5,
              background:`linear-gradient(90deg, transparent 5%, rgba(155,92,245,0.60) 38%, rgba(0,229,255,0.45) 60%, transparent 95%)`,
              animation:"edge-sweep 6s ease-in-out infinite",
            }}/>
            {/* Ambient glow — breathing with energy buildup on launch */}
            <div aria-hidden style={{
              position:"absolute", top:-50, right:-30, width:200, height:200, borderRadius:"50%",
              background:`radial-gradient(circle, rgba(155,92,245,0.10), transparent 70%)`,
              pointerEvents:"none",
              animation: launching ? "orb-breathe 1.5s ease-in-out infinite" : "orb-breathe 7s ease-in-out infinite",
            }}/>
            <div aria-hidden style={{
              position:"absolute", bottom:-30, left:-20, width:140, height:140, borderRadius:"50%",
              background:`radial-gradient(circle, rgba(0,229,255,0.07), transparent 70%)`,
              pointerEvents:"none",
              animation: launching ? "orb-breathe 1s ease-in-out 0.5s infinite" : "orb-breathe 9s ease-in-out 3s infinite",
            }}/>

            {/* Rocket launch overlay */}
            {launching && (
              <div style={{
                position:"absolute", inset:0, zIndex:10,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                background:"rgba(0,0,0,0.88)",
                backdropFilter:"blur(8px)",
                WebkitBackdropFilter:"blur(8px)",
              }}>
                <div style={{
                  fontSize:48, lineHeight:1,
                  animation:"rocket-launch 1.5s ease-in forwards",
                  filter:`drop-shadow(0 0 20px ${C})`,
                }}>
                  🚀
                </div>
                <div style={{
                  marginTop:12, fontSize:11, fontFamily:SANS, fontWeight:700,
                  color:C, letterSpacing:"0.12em",
                  animation:"fade-in 0.3s 0.2s ease-out both",
                }}>
                  IGNITING AI ENGINE
                </div>
                <div aria-hidden style={{
                  marginTop:8, width:2, height:30,
                  background:`linear-gradient(180deg, ${C}88, transparent)`,
                  animation:"trail-fade 1.5s ease-in forwards",
                }}/>
              </div>
            )}

            <div style={{ position:"relative" }}>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
                <div style={{
                  width:48, height:48, borderRadius:14, flexShrink:0,
                  background:"rgba(155,92,245,0.08)",
                  border:`1px solid rgba(155,92,245,0.20)`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:22,
                  boxShadow:`0 0 20px rgba(155,92,245,0.12)`,
                }}>
                  🚀
                </div>
                <div>
                  <div style={{ fontSize:18, fontFamily:SANS, fontWeight:800, color:W,
                    letterSpacing:"-0.02em" }}>
                    Activate Live AI Trading
                  </div>
                  <div style={{ fontSize:10, fontFamily:SANS, color:DIM, marginTop:3 }}>
                    Real funds · AI-managed · Fully transparent
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div style={{
                background:"rgba(0,0,0,0.40)", borderRadius:12, padding:"14px 16px",
                marginBottom:16, border:`1px solid ${ESUB}`,
              }}>
                <div style={{ fontSize:8, fontFamily:SANS, fontWeight:700, color:DIM,
                  letterSpacing:"0.16em", textTransform:"uppercase" as const, marginBottom:12 }}>
                  Transparent Fee Structure
                </div>
                {[
                  { icon:"◈", text:"$5.99 / month platform fee",          color:C  },
                  { icon:"◈", text:"2% on profitable closed trades only",  color:C  },
                  { icon:"◉", text:"Zero fee on losing trades — ever",     color:G  },
                  { icon:"◉", text:"Paper trading remains free forever",    color:G  },
                  { icon:"◉", text:"Cancel anytime — no lock-in",          color:G  },
                ].map(({ icon, text, color }, idx, arr) => (
                  <div key={text} style={{
                    display:"flex", gap:10, alignItems:"flex-start",
                    marginBottom: idx<arr.length-1 ? 9 : 0,
                  }}>
                    <span style={{ fontSize:9, color, flexShrink:0, marginTop:1 }}>{icon}</span>
                    <span style={{ fontSize:11, fontFamily:SANS, color:GR, lineHeight:1.7 }}>
                      {text}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA button */}
              <button
                onClick={handleLaunch}
                disabled={launching}
                style={{
                  width:"100%", padding:"16px 0",
                  background: launching
                    ? `linear-gradient(135deg, rgba(0,229,255,0.25), rgba(155,92,245,0.20))`
                    : `linear-gradient(135deg, rgba(0,229,255,0.14), rgba(155,92,245,0.10))`,
                  border:`1px solid rgba(0,229,255,0.42)`,
                  borderRadius:12,
                  color:C, fontFamily:SANS, fontSize:14,
                  fontWeight:800, letterSpacing:"0.03em", cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                  boxShadow:`0 0 ${launching?"28px":"14px"} rgba(0,229,255,${launching?"0.16":"0.06"})`,
                  transition:"all 0.3s ease",
                  animation: launching ? "none" : "cta-breathe 4s ease-in-out infinite",
                }}>
                <span style={{
                  display:"inline-block",
                  animation: launching ? "rocket-button 1.5s ease-in forwards" : "none",
                }}>🚀</span>
                {launching ? "Launching…" : "Start AI Trading →"}
              </button>

              <div style={{ marginTop:10, textAlign:"center" as const,
                fontSize:9, fontFamily:SANS, color:DIM }}>
                Open your AI-powered account in minutes
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Keyframes ─────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes dot-pulse       { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.25)} }
        @keyframes ring-out        { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(2.4);opacity:0} }
        @keyframes wave-bar        { from{transform:scaleY(.25);opacity:.2} to{transform:scaleY(1);opacity:.65} }
        @keyframes edge-sweep      { 0%{opacity:.1;transform:scaleX(.25) translateX(-80%)} 50%{opacity:1;transform:scaleX(1) translateX(0)} 100%{opacity:.1;transform:scaleX(.25) translateX(80%)} }
        @keyframes wave-scroll     { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes scan-text       { 0%,100%{opacity:.25} 50%{opacity:.75} }
        @keyframes bar-in          { from{width:0%;opacity:0} to{opacity:1} }
        @keyframes bar-breathe     { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes card-in         { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes num-pop         { from{opacity:0;transform:scale(.92)} to{opacity:1;transform:scale(1)} }
        @keyframes stat-glow       { 0%,100%{opacity:1;text-shadow:inherit} 50%{opacity:.65} }
        @keyframes cta-breathe     { 0%,100%{box-shadow:0 0 12px rgba(0,229,255,0.06)} 50%{box-shadow:0 0 28px rgba(0,229,255,0.14)} }
        @keyframes ticker-scroll   { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes chart-drift     { 0%,100%{transform:translateY(0)} 35%{transform:translateY(-.8px)} 70%{transform:translateY(.4px)} }
        @keyframes pnl-flash       { 0%,100%{opacity:1} 50%{opacity:.7} }
        @keyframes cursor-blink    { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes particle-float  { from{transform:translate(0,0) scale(1);opacity:.3} to{transform:translate(8px,-12px) scale(1.4);opacity:.6} }
        @keyframes rocket-launch   { 0%{transform:translateY(0) scale(1)} 20%{transform:translateY(4px) scale(0.95)} 40%{transform:translateY(-8px) scale(1.1)} 100%{transform:translateY(-140px) scale(0.5);opacity:0} }
        @keyframes rocket-button   { 0%{transform:translateY(0)} 30%{transform:translateY(2px)} 100%{transform:translateY(-20px);opacity:0} }
        @keyframes trail-fade      { 0%{opacity:0;height:4px} 40%{opacity:1;height:40px} 100%{opacity:0;height:80px} }
        @keyframes fade-in         { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes orb-breathe     { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.18)} }
        @keyframes scan-line       { 0%{top:-2px;opacity:0} 5%{opacity:1} 95%{opacity:0.5} 100%{top:100%;opacity:0} }
        @keyframes shimmer-sweep   { 0%{left:-30%;opacity:0} 20%{opacity:1} 80%{opacity:0.4} 100%{left:130%;opacity:0} }
        @keyframes row-shimmer     { 0%,100%{opacity:0} 50%{opacity:1} }
        @keyframes glow-pulse      { 0%,100%{box-shadow:0 0 14px rgba(0,229,255,0.06)} 50%{box-shadow:0 0 36px rgba(0,229,255,0.18),0 0 60px rgba(0,229,255,0.06)} }
        .page-enter                { animation: card-in 0.35s ease-out both; }
      `}</style>
    </div>
  );
}
