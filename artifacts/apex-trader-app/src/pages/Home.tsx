import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  api,
  type MobileStatus, type Portfolio, type SimAccount,
  type SignalBreakdown, type Subscription,
} from "@/lib/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C    = "#00e5ff";   // cyan neon
const G    = "#00ff88";   // emerald
const P    = "#9b5cf5";   // purple
const O    = "#ff9400";   // amber
const R    = "#ff3355";   // red
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#3a3f5c";
const GOLD = "#ffd200";

// ── Surface tokens — true OLED hierarchy ─────────────────────────────────────
const BG    = "#000000";   // void — page disappears into OLED
const CARD  = "#0e0e18";   // card surface — barely lifted off void
const CARD2 = "#0b0b14";   // secondary surface
const E     = "rgba(255,255,255,0.08)"; // card edge

// ── Smooth bezier sparkline (TradingView quality) ─────────────────────────────
function genPts(seed: string, trend: "up"|"down"|"flat") {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) { s = (((s<<5)+s)^seed.charCodeAt(i))>>>0; }
  const rand = () => { s^=s<<13; s^=s>>17; s^=s<<5; return (s>>>0)/0x100000000; };
  const dir = trend==="up" ? 1.4 : trend==="down" ? -1.4 : 0.1;
  const pts: number[] = []; let v = 50;
  for (let i = 0; i < 22; i++) { v = Math.max(8,Math.min(92,v+(rand()-0.5)*9+dir)); pts.push(v); }
  return pts;
}
function Sparkline({ seed, trend, w=78, h=30, animDelay="0s" }: {
  seed:string; trend:"up"|"down"|"flat"; w?:number; h?:number; animDelay?:string;
}) {
  const col = trend==="up" ? G : trend==="down" ? R : C;
  const raw = genPts(seed, trend);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn||1;
  const pts = raw.map((p, i) => ({
    x: (i/(raw.length-1))*w,
    y: h-3-((p-mn)/rng)*(h-6),
  }));
  const t = 0.35;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length-1; i++) {
    const p0 = pts[Math.max(0,i-1)], p1 = pts[i];
    const p2 = pts[i+1],             p3 = pts[Math.min(pts.length-1,i+2)];
    const cp1x = p1.x+(p2.x-p0.x)*t, cp1y = p1.y+(p2.y-p0.y)*t;
    const cp2x = p2.x-(p3.x-p1.x)*t, cp2y = p2.y-(p3.y-p1.y)*t;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      shapeRendering="geometricPrecision"
      style={{ overflow:"visible", animation:`chart-drift 12s ease-in-out ${animDelay} infinite` }}>
      <path d={d} fill="none" stroke={col} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── AI waveform — restrained ───────────────────────────────────────────────────
function AIWave({ color=G, bars=12 }: { color?:string; bars?:number }) {
  const H = [4,8,14,10,6,18,22,13,8,17,11,6];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:2, height:22 }}>
      {H.slice(0,bars).map((h,i) => (
        <div key={i} style={{
          width:2, height:h, borderRadius:1, background:color, opacity:0.75,
          animation:`wave-bar 1.8s ease-in-out ${(i*0.1).toFixed(2)}s infinite alternate`,
        }}/>
      ))}
    </div>
  );
}

// ── Precision confidence bar ───────────────────────────────────────────────────
function ConfBar({ value, color, delay="0s" }: { value:number; color:string; delay?:string }) {
  return (
    <div style={{ height:2.5, background:"#06060c", borderRadius:2, overflow:"hidden" }}>
      <div style={{
        height:"100%", background:color, borderRadius:2,
        width:`${value}%`, boxShadow:`0 0 6px ${color}70`,
        animation:`bar-in 0.7s ${delay} ease-out both, bar-breathe 4s ${delay} ease-in-out 0.7s infinite`,
      }}/>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SH({ label, right, color=P }: { label:string; right?:string; color?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
      <div style={{ width:2, height:12, background:color, borderRadius:1, flexShrink:0 }}/>
      <span style={{ fontSize:9, color:DIM, letterSpacing:"0.2em", fontFamily:"monospace", fontWeight:700 }}>
        {label}
      </span>
      {right && <span style={{ marginLeft:"auto", fontSize:8, fontFamily:"monospace", color:DIM }}>{right}</span>}
    </div>
  );
}

function fmt(n: number) {
  return Math.abs(n) >= 1_000 ? `$${(n/1_000).toFixed(1)}K` : `$${n.toFixed(2)}`;
}
function planColor(p: string) {
  if (p.includes("live")||p.includes("pro"))     return G;
  if (p.includes("starter")||p.includes("paid")) return C;
  return DIM;
}
function planLabel(p: string) {
  if (p.includes("live"))    return "LIVE AI";
  if (p.includes("pro"))     return "PRO";
  if (p.includes("starter")) return "STARTER";
  return "FREE";
}

const MARKETS = [
  { sym:"BTC", price:"$68,120", action:"BUY",  trend:"up"   as const },
  { sym:"ETH", price:"$3,512",  action:"BUY",  trend:"up"   as const },
  { sym:"SOL", price:"$188",    action:"HOLD", trend:"flat" as const },
];
const AC: Record<string,string> = { BUY:G, SELL:R, HOLD:C };

// ── Minimal ticker ─────────────────────────────────────────────────────────────
function Ticker({ items }: { items:string[] }) {
  const t = items.join("   ·   ") + "   ·   " + items.join("   ·   ");
  return (
    <div style={{ overflow:"hidden", height:16, background:BG, borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
      <div style={{
        display:"inline-flex", whiteSpace:"nowrap", paddingLeft:"100%",
        animation:"ticker-scroll 32s linear infinite",
        fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.1em", lineHeight:"16px",
      }}>
        {t}
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useUser();

  const { data: status }    = useQuery<MobileStatus>({
    queryKey:["mobile-status"],    queryFn:()=>api.get("/mobile/status"),    refetchInterval:5_000,
  });
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey:["mobile-portfolio"], queryFn:()=>api.get("/mobile/portfolio"), refetchInterval:8_000,
  });
  const { data: simAcc }    = useQuery<SimAccount>({
    queryKey:["sim-account"],      queryFn:()=>api.get("/account"),          retry:false, staleTime:60_000,
  });
  const { data: signals }   = useQuery<{ breakdowns: Record<string,SignalBreakdown> }>({
    queryKey:["mobile-signals"],   queryFn:()=>api.get("/mobile/signals"),   refetchInterval:5_000,
  });
  const { data: sub } = useQuery<Subscription>({
    queryKey:["subscription"], queryFn:()=>api.get("/billing/subscription"), staleTime:120_000, retry:false,
  });

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
  const sigList  = signals?.breakdowns ? Object.entries(signals.breakdowns).slice(0,6) : [];
  const plan     = (sub?.plan ?? "free").toLowerCase();
  const pColor   = planColor(plan);
  const pLabel   = planLabel(plan);
  const exchange = engine?.exchange?.toUpperCase() ?? "KRAKEN";
  const initials = (user?.firstName?.[0]??"A")+(user?.lastName?.[0]??"T");
  const name     = user?.firstName ?? "Apex Trader";

  const tickerItems = [
    `BTC $68,120 ▲`, `ETH $3,512 ▲`, `SOL $188 ▼`,
    `SIG ${sigList.length}`, `ENG ${engine?.running?"RUNNING":"IDLE"}`,
    `EXC ${exchange}`, `POS ${posCount}`, `WIN ${winRate}%`,
  ];

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:32 }}>

      {/* ── Ticker ──────────────────────────────────────────────────────────── */}
      <Ticker items={tickerItems}/>

      {/* ── Identity control strip ──────────────────────────────────────────── */}
      <div style={{
        display:"flex", alignItems:"center", gap:12,
        padding:"12px 14px 10px",
        borderBottom:`1px solid rgba(255,255,255,0.05)`,
      }}>
        {/* Avatar */}
        <div onClick={()=>setLocation("/profile")} style={{
          width:38, height:38, borderRadius:"50%", flexShrink:0, cursor:"pointer",
          background:"#08080e", border:`1.5px solid ${C}50`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:11, fontFamily:"monospace", fontWeight:900, color:C,
          boxShadow:`0 0 14px ${C}20`, position:"relative",
        }}>
          {initials.toUpperCase()}
          <div style={{
            position:"absolute", bottom:1, right:1, width:9, height:9,
            borderRadius:"50%", background:G, border:`2px solid ${BG}`,
            boxShadow:`0 0 8px ${G}`,
          }}/>
        </div>

        {/* Name + plan */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontFamily:"monospace", fontWeight:800, color:W,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {name}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
            <span style={{
              padding:"1px 7px", borderRadius:3,
              background:`${pColor}14`, border:`1px solid ${pColor}40`,
              fontSize:7, fontFamily:"monospace", fontWeight:800,
              color:pColor, letterSpacing:"0.12em",
            }}>
              {pLabel}
            </span>
            <span style={{ fontSize:7, fontFamily:"monospace", color:DIM }}>{exchange}</span>
          </div>
        </div>

        {/* Mode badge + heartbeat */}
        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <div style={{
            padding:"3px 10px", borderRadius:3,
            border:`1px solid ${isLive ? G+"50" : C+"38"}`,
            background: isLive ? "#001508" : "#001018",
            fontSize:8, fontFamily:"monospace", fontWeight:800,
            color: isLive ? G : C, letterSpacing:"0.14em",
            animation:"badge-glow 4s ease-in-out infinite",
          }}>
            {isLive ? "LIVE" : "SIM"}
          </div>
          {/* Heartbeat */}
          <div style={{ position:"relative", width:18, height:18, flexShrink:0 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:G, margin:"5px",
              boxShadow:`0 0 10px ${G}`, animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%",
              border:`1px solid ${G}40`, animation:"ring-out 3s ease-out infinite" }}/>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%",
              border:`1px solid ${G}18`, animation:"ring-out 3s ease-out 0.8s infinite" }}/>
          </div>
        </div>
      </div>

      {/* ── Brand ───────────────────────────────────────────────────────────── */}
      <div style={{ padding:"10px 14px 12px" }}>
        <div style={{
          fontSize:34, fontWeight:900, fontFamily:"monospace", letterSpacing:"-0.02em",
          background:`linear-gradient(90deg, ${W} 0%, ${W} 30%, ${C} 50%, ${G} 100%)`,
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          animation:"title-glow 6s ease-in-out infinite",
        }}>
          APEX TRADER
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
          <div style={{ width:5, height:5, borderRadius:"50%", background:G, flexShrink:0,
            boxShadow:`0 0 6px ${G}`, animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
          <span style={{ fontSize:8, fontFamily:"monospace", color:DIM, letterSpacing:"0.12em" }}>
            AI ENGINE ACTIVE · {isLive?"LIVE MODE":"SIMULATION MODE"} · {exchange}
          </span>
        </div>
      </div>

      <div style={{ padding:"0 12px" }}>

        {/* ── Portfolio Equity — cinematic hero ────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden", borderRadius:16,
          marginBottom:10, padding:"20px 20px 18px",
          background:"linear-gradient(155deg, #0b0b16 0%, #060610 100%)",
          border:`1px solid rgba(0,229,255,0.20)`,
          boxShadow:`0 20px 60px rgba(0,0,0,0.95), 0 0 0 1px rgba(0,229,255,0.06)`,
          animation:"card-glow 7s ease-in-out infinite",
        }}>
          {/* Precision top laser */}
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1,
            background:`linear-gradient(90deg, transparent 8%, ${C}90 38%, ${G}70 55%, ${C}85 72%, transparent 92%)`,
            animation:"edge-sweep 6s ease-in-out infinite",
          }}/>
          {/* Feathered glow band below laser — very tight */}
          <div aria-hidden style={{
            position:"absolute", top:0, left:"10%", right:"10%", height:4,
            background:`linear-gradient(180deg, ${C}10, transparent)`,
          }}/>
          {/* Subtle background wave */}
          <div aria-hidden style={{
            position:"absolute", bottom:0, left:0, right:0,
            height:36, overflow:"hidden", opacity:0.05, pointerEvents:"none",
          }}>
            <svg viewBox="0 0 800 36" width="200%" height="36" preserveAspectRatio="none"
              style={{ animation:"wave-scroll 10s linear infinite" }}>
              <path d="M0,18 C80,6 160,30 240,18 C320,6 400,30 480,18 C560,6 640,30 720,18 C800,6 880,30 960,18 C1040,6 1120,30 1200,18 C1280,6 1360,30 1440,18 L1440,36 L0,36Z" fill={G}/>
            </svg>
          </div>
          {/* Tight corner accent */}
          <div aria-hidden style={{
            position:"absolute", top:-16, right:-16, width:70, height:70,
            background:`radial-gradient(circle, ${C}10 0%, transparent 70%)`,
            animation:"glow-breathe 8s ease-in-out infinite",
            pointerEvents:"none",
          }}/>

          <div style={{ position:"relative" }}>
            <div style={{ fontSize:8, fontFamily:"monospace", color:DIM,
              letterSpacing:"0.22em", marginBottom:10, fontWeight:600 }}>
              PORTFOLIO EQUITY
            </div>

            {/* Big number */}
            <div style={{
              fontSize:46, fontWeight:900, color:W, fontFamily:"monospace",
              letterSpacing:"-0.03em", lineHeight:1,
              textShadow:`0 0 30px rgba(255,255,255,0.12)`,
              animation:"num-pop 0.5s ease-out both",
            }}>
              {fmt(tv)}
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, flexWrap:"wrap" }}>
              <span style={{
                fontSize:13, fontFamily:"monospace", fontWeight:700,
                color: pnl>=0 ? G : R,
                textShadow: pnl>=0 ? `0 0 12px ${G}80` : `0 0 12px ${R}80`,
                animation:"pnl-pulse 4s ease-in-out infinite",
              }}>
                {pnl>=0?"+":""}{pnl.toFixed(2)} unrealized
              </span>
              <span style={{ fontSize:9, color:DIM }}>·</span>
              <span style={{ fontSize:12, fontFamily:"monospace", color:pnlPct>=0?G:R, fontWeight:700 }}>
                {pnlPct>=0?"+":""}{pnlPct.toFixed(2)}%
              </span>
            </div>

            <div style={{
              display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
              marginTop:16, borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:13,
            }}>
              {[
                { label:"CASH",      val:fmt(tv*0.855), color:W    },
                { label:"REALIZED",  val:realized>=0?`+${fmt(realized)}`:fmt(realized), color:G },
                { label:"FEES PAID", val:`$${fees.toFixed(2)}`, color:GOLD },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.14em", marginBottom:5 }}>{label}</div>
                  <div style={{ fontSize:13, fontFamily:"monospace", fontWeight:700, color }}>{val}</div>
                </div>
              ))}
            </div>

            {!isLive && (
              <div style={{
                marginTop:12, padding:"6px 10px", borderRadius:6,
                background:"#000f06", border:`1px solid ${G}1e`,
                fontSize:8, fontFamily:"monospace", color:G, letterSpacing:"0.08em",
                display:"flex", alignItems:"center", gap:8,
              }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:G, flexShrink:0,
                  boxShadow:`0 0 6px ${G}`, animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
                PAPER TRADING · NO REAL FUNDS AT RISK · ALWAYS FREE
              </div>
            )}
          </div>
        </div>

        {/* ── Stats Trio ──────────────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:18 }}>
          {[
            { val:`${winRate}%`, label:"WIN RATE",     color:G, sub:"4W · 1L" },
            { val:String(posCount),  label:"POSITIONS",    color:C, sub:"open" },
            { val:String(trades),    label:"TOTAL TRADES", color:W, sub:"all time" },
          ].map(({ val, label, color, sub }, i) => (
            <div key={label} style={{
              position:"relative", overflow:"hidden",
              background:CARD2, border:`1px solid ${E}`,
              borderRadius:12, padding:"14px 8px", textAlign:"center",
              boxShadow:`0 8px 32px rgba(0,0,0,0.9)`,
              animation:`card-in 0.4s ${(i*0.08).toFixed(2)}s ease-out both`,
            }}>
              {/* Top edge accent */}
              <div aria-hidden style={{
                position:"absolute", top:0, left:"20%", right:"20%", height:1,
                background:`linear-gradient(90deg, transparent, ${color}45, transparent)`,
              }}/>
              <div style={{
                fontSize:28, fontWeight:900, color, fontFamily:"monospace",
                lineHeight:1, marginBottom:4,
                textShadow:`0 0 20px ${color}60`,
                animation:`stat-glow 5s ease-in-out ${i*1.6}s infinite`,
              }}>
                {val}
              </div>
              <div style={{ fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.14em" }}>
                {label}
              </div>
              <div style={{ fontSize:7, fontFamily:"monospace", color:`${color}50`, marginTop:2 }}>
                {sub}
              </div>
            </div>
          ))}
        </div>

        {/* ── AI Engine Status ─────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SH label="AI ENGINE STATUS"/>
          <div style={{
            position:"relative", overflow:"hidden",
            background:`linear-gradient(145deg, ${CARD} 0%, #080814 100%)`,
            borderRadius:13, padding:"15px 16px",
            border:`1px solid rgba(155,92,245,0.22)`,
            boxShadow:`0 8px 32px rgba(0,0,0,0.9)`,
          }}>
            {/* Top edge */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent, ${P}55, ${C}35, transparent)`,
            }}/>
            {/* Corner accent */}
            <div aria-hidden style={{
              position:"absolute", bottom:-12, right:-12, width:60, height:60,
              background:`radial-gradient(circle, ${P}14 0%, transparent 70%)`,
              pointerEvents:"none",
            }}/>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <div style={{ position:"relative", flexShrink:0, width:18, height:18 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:G,
                      margin:"5px", boxShadow:`0 0 12px ${G}` }}/>
                    <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                      border:`1px solid ${G}45`, animation:"ring-out 3s ease-out infinite" }}/>
                    <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                      border:`1px solid ${G}18`, animation:"ring-out 3s ease-out 0.9s infinite" }}/>
                  </div>
                  <span style={{
                    fontSize:14, fontFamily:"monospace", fontWeight:900, color:G,
                    letterSpacing:"0.08em", textShadow:`0 0 16px ${G}`,
                  }}>
                    {engine?.running ? "RUNNING" : "STOPPED"}
                  </span>
                </div>

                <div style={{ fontSize:9, fontFamily:"monospace", color:DIM, lineHeight:1.9, marginBottom:10 }}>
                  BTCUSD · {engine?.signalsGenerated??0} signals generated<br/>
                  ETHUSD · SOLUSD — monitoring
                </div>
                <AIWave color={G}/>
              </div>

              <div style={{ textAlign:"right" }}>
                <div style={{
                  fontSize:13, fontFamily:"monospace", fontWeight:900, color:C,
                  letterSpacing:"0.1em", marginBottom:8, textShadow:`0 0 14px ${C}`,
                }}>
                  {exchange}
                </div>
                <div style={{
                  padding:"2px 7px", borderRadius:3,
                  background:"#090600", border:`1px solid ${O}45`,
                  fontSize:7, fontFamily:"monospace", fontWeight:800,
                  color:O, letterSpacing:"0.1em", marginBottom:8,
                }}>
                  VOL FILTER
                </div>
                <div style={{ fontSize:7, fontFamily:"monospace", color:DIM,
                  animation:"scan-text 2.5s ease-in-out infinite" }}>
                  SCANNING...
                </div>
              </div>
            </div>

            <div style={{ marginTop:10, borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:9 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.14em" }}>
                  AI SIGNAL STRENGTH
                </span>
                <span style={{ fontSize:7, fontFamily:"monospace", color:G,
                  animation:"scan-text 3s ease-in-out infinite" }}>ACTIVE</span>
              </div>
              <ConfBar value={engine?.running ? 72 : 10} color={G}/>
            </div>
          </div>
        </div>

        {/* ── Live Markets ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SH label="LIVE MARKETS" color={C}/>
          <div style={{
            background:CARD, border:`1px solid ${E}`,
            borderRadius:13, overflow:"hidden",
            boxShadow:`0 8px 32px rgba(0,0,0,0.9)`,
          }}>
            {MARKETS.map(({ sym, price, action, trend }, i) => {
              const ac = AC[action]??W;
              return (
                <div key={sym} style={{
                  display:"flex", alignItems:"center", gap:10, padding:"13px 14px",
                  borderBottom: i<2 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  position:"relative",
                  animation:`card-in 0.3s ${(i*0.07).toFixed(2)}s ease-out both`,
                }}>
                  {/* Minimal left accent bar */}
                  <div style={{ width:2, height:34, background:ac, borderRadius:1, flexShrink:0 }}/>
                  <div style={{ flex:"0 0 78px" }}>
                    <div style={{ fontSize:8, fontFamily:"monospace", color:DIM, letterSpacing:"0.1em", marginBottom:3 }}>{sym}</div>
                    <div style={{ fontSize:15, fontFamily:"monospace", fontWeight:800, color:W }}>{price}</div>
                  </div>
                  <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
                    <Sparkline seed={sym+"mkt"} trend={trend} w={82} h={30} animDelay={`${i*3}s`}/>
                  </div>
                  {/* Institutional button — tight, dark, precise */}
                  <div style={{
                    padding:"3px 9px",
                    background:"#000",
                    border:`1px solid ${ac}32`,
                    borderRadius:3,
                    fontSize:8, fontFamily:"monospace", fontWeight:700,
                    color:ac, letterSpacing:"0.08em",
                  }}>
                    {action}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent AI Signals ────────────────────────────────────────────── */}
        <div style={{ marginBottom:22 }}>
          <SH label="RECENT AI SIGNALS" right={`${sigList.length} recent`}/>
          <div style={{
            background:CARD, border:`1px solid ${E}`,
            borderRadius:13, overflow:"hidden",
            boxShadow:`0 8px 32px rgba(0,0,0,0.9)`,
          }}>
            {/* Live feed header */}
            <div style={{
              padding:"7px 14px", background:"#00100600",
              borderBottom:"1px solid rgba(255,255,255,0.05)",
              display:"flex", alignItems:"center", gap:8,
            }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:G,
                boxShadow:`0 0 7px ${G}`, animation:"dot-pulse 2s ease-in-out infinite" }}/>
              <span style={{ fontSize:8, fontFamily:"monospace", color:G, letterSpacing:"0.14em" }}>
                LIVE SIGNAL FEED
              </span>
              <span style={{ marginLeft:"auto", fontSize:7, fontFamily:"monospace", color:DIM,
                animation:"scan-text 2.5s ease-in-out infinite" }}>SCANNING</span>
            </div>

            {sigList.length === 0 ? (
              <div style={{ padding:"24px 0", textAlign:"center" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}>
                  <AIWave color={C} bars={9}/>
                </div>
                <div style={{ fontSize:9, fontFamily:"monospace", color:DIM }}>ENGINE WARMING UP...</div>
              </div>
            ) : sigList.map(([sym, bd], i) => {
              const conf  = bd.confidence ?? 0;
              const age   = Math.floor((Date.now()-bd.lastUpdated)/1000);
              const ageT  = age<60 ? `${age}s ago` : `${Math.floor(age/60)}m ago`;
              const color = AC[bd.action]??GR;
              return (
                <div key={sym} style={{
                  display:"flex", alignItems:"stretch",
                  borderBottom: i<sigList.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  position:"relative",
                  animation:`card-in 0.3s ${(i*0.06).toFixed(2)}s ease-out both`,
                }}>
                  <div style={{ width:2.5, background:color, flexShrink:0 }}/>
                  <div style={{ flex:"0 0 74px", padding:"11px 10px 11px 11px" }}>
                    <div style={{ fontSize:13, fontFamily:"monospace", fontWeight:900, color:W }}>
                      {sym.replace("USD","")}
                    </div>
                    <div style={{ fontSize:7, fontFamily:"monospace", color:DIM, marginTop:3 }}>{ageT}</div>
                  </div>
                  <div style={{ flex:1, padding:"11px 8px" }}>
                    <div style={{ fontSize:9, fontFamily:"monospace", color:DIM, marginBottom:6 }}>
                      EMA+RSI confluence
                    </div>
                    <ConfBar value={conf} color={color} delay={`${i*0.1}s`}/>
                  </div>
                  <div style={{ padding:"11px 14px 11px 4px", textAlign:"right" }}>
                    <div style={{ fontSize:11, fontFamily:"monospace", fontWeight:700, color:GR, marginBottom:3 }}>
                      {conf.toFixed(1)}%
                    </div>
                    <div style={{ fontSize:7, color, opacity:0.7 }}>◉</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Go Live CTA — institutional black glass ──────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:"linear-gradient(155deg, #08081a 0%, #060616 100%)",
          border:`1px solid rgba(155,92,245,0.22)`,
          borderRadius:16, padding:"20px 18px",
          boxShadow:`0 20px 60px rgba(0,0,0,0.95), 0 0 0 1px rgba(155,92,245,0.07)`,
        }}>
          {/* Top laser */}
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1,
            background:`linear-gradient(90deg, transparent 8%, ${P}65 40%, ${C}50 60%, transparent 92%)`,
            animation:"edge-sweep 7s ease-in-out infinite",
          }}/>
          {/* Corner accents — tight */}
          <div aria-hidden style={{
            position:"absolute", top:-16, right:-16, width:70, height:70,
            background:`radial-gradient(circle, ${C}08 0%, transparent 70%)`,
            animation:"glow-breathe 10s ease-in-out 2s infinite",
          }}/>
          <div aria-hidden style={{
            position:"absolute", bottom:-16, left:-16, width:70, height:70,
            background:`radial-gradient(circle, ${P}10 0%, transparent 70%)`,
            animation:"glow-breathe 12s ease-in-out infinite",
          }}/>

          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:15 }}>
              <div style={{
                width:38, height:38, borderRadius:9, flexShrink:0,
                background:"#08001a", border:`1px solid ${P}38`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:17, boxShadow:`0 0 16px ${P}20`,
              }}>⚡</div>
              <div>
                <div style={{ fontSize:14, fontFamily:"monospace", fontWeight:900, color:W, letterSpacing:"0.02em" }}>
                  ACTIVATE LIVE AI TRADING
                </div>
                <div style={{ fontSize:8, fontFamily:"monospace", color:DIM, marginTop:2 }}>
                  Real funds · AI-managed · Fully transparent
                </div>
              </div>
            </div>

            {/* Fee model */}
            <div style={{
              background:"rgba(0,0,0,0.6)", borderRadius:10,
              padding:"12px 14px", marginBottom:13,
              border:"1px solid rgba(255,255,255,0.05)",
            }}>
              <div style={{ fontSize:7, fontFamily:"monospace", color:DIM,
                letterSpacing:"0.18em", marginBottom:9 }}>TRANSPARENT FEE STRUCTURE</div>
              {[
                { icon:"◈", text:"$5.99 / month platform fee",          color:C },
                { icon:"◈", text:"2% on profitable CLOSED trades only",  color:C },
                { icon:"◉", text:"Zero fee on losing trades — ever",     color:G },
                { icon:"◉", text:"Paper trading remains free forever",    color:G },
                { icon:"◉", text:"Cancel anytime — no lock-in",          color:G },
              ].map(({ icon, text, color }, idx, arr) => (
                <div key={text} style={{
                  display:"flex", gap:10, alignItems:"flex-start",
                  marginBottom: idx<arr.length-1 ? 8 : 0,
                }}>
                  <span style={{ fontSize:9, color, flexShrink:0, marginTop:1 }}>{icon}</span>
                  <span style={{ fontSize:11, fontFamily:"monospace", color:GR, lineHeight:1.6 }}>{text}</span>
                </div>
              ))}
            </div>

            {/* Exchanges */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:7, fontFamily:"monospace", color:DIM,
                letterSpacing:"0.18em", marginBottom:8 }}>SUPPORTED LIVE EXCHANGES</div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {["Kraken","Coinbase","Binance","Crypto.com","Gemini"].map(e => (
                  <span key={e} style={{
                    padding:"2px 10px", background:"#000",
                    border:`1px solid rgba(0,229,255,0.20)`, borderRadius:20,
                    fontSize:8, fontFamily:"monospace", color:DIM,
                  }}>{e}</span>
                ))}
                <span style={{
                  padding:"2px 10px", background:"transparent",
                  border:"1px solid rgba(255,255,255,0.06)", borderRadius:20,
                  fontSize:8, fontFamily:"monospace", color:DIM,
                }}>+ more</span>
              </div>
            </div>

            {/* CTA */}
            <button onClick={()=>setLocation("/subscribe")} style={{
              width:"100%", padding:"14px 0",
              background:"#02020e",
              border:`1px solid ${C}45`, borderRadius:10,
              color:C, fontFamily:"monospace", fontSize:12,
              fontWeight:900, letterSpacing:"0.12em", cursor:"pointer",
              boxShadow:`0 0 20px ${C}12, inset 0 1px 0 rgba(0,229,255,0.12)`,
              animation:"cta-glow 4s ease-in-out infinite",
            }}>
              ACTIVATE LIVE AI TRADING →
            </button>
            <div style={{ marginTop:9, textAlign:"center", fontSize:7,
              fontFamily:"monospace", color:DIM }}>
              Institutional-grade AI · Withdrawal permissions never requested
            </div>
          </div>
        </div>

      </div>

      {/* ── Keyframes — restrained, intelligent ──────────────────────────────── */}
      <style>{`
        @keyframes glow-breathe  { 0%,100%{opacity:.5} 50%{opacity:.9} }
        @keyframes dot-pulse     { 0%,100%{box-shadow:0 0 6px ${G};transform:scale(1)} 50%{box-shadow:0 0 14px ${G};transform:scale(1.25)} }
        @keyframes badge-glow    { 0%,100%{opacity:.8} 50%{opacity:1} }
        @keyframes title-glow    { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.15)} }
        @keyframes card-glow     {
          0%,100%{box-shadow:0 20px 60px rgba(0,0,0,.95),0 0 0 1px rgba(0,229,255,.06)}
          50%    {box-shadow:0 20px 60px rgba(0,0,0,.95),0 0 0 1px rgba(0,229,255,.11),0 0 40px rgba(0,229,255,.04)}
        }
        @keyframes edge-sweep    { 0%{opacity:.2;transform:scaleX(.4) translateX(-50%)} 50%{opacity:1;transform:scaleX(1) translateX(0)} 100%{opacity:.2;transform:scaleX(.4) translateX(50%)} }
        @keyframes wave-scroll   { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes ring-out      { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.2);opacity:0} }
        @keyframes wave-bar      { from{transform:scaleY(.3);opacity:.35} to{transform:scaleY(1);opacity:.8} }
        @keyframes scan-text     { 0%,100%{opacity:.3} 50%{opacity:.9} }
        @keyframes bar-in        { from{width:0%;opacity:0} to{opacity:1} }
        @keyframes bar-breathe   { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.45)} }
        @keyframes pnl-pulse     { 0%,100%{opacity:1} 50%{opacity:.72} }
        @keyframes card-in       { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes num-pop       { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:scale(1)} }
        @keyframes stat-glow     { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.22)} }
        @keyframes cta-glow      { 0%,100%{box-shadow:0 0 20px ${C}12,inset 0 1px 0 rgba(0,229,255,.12)} 50%{box-shadow:0 0 32px ${C}22,inset 0 1px 0 rgba(0,229,255,.20)} }
        @keyframes ticker-scroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes chart-drift   { 0%,100%{transform:translateY(0)} 35%{transform:translateY(-0.8px)} 70%{transform:translateY(0.4px)} }
      `}</style>
    </div>
  );
}
