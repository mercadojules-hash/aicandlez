import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { api, type MobileStatus, type Portfolio, type SimAccount, type SignalBreakdown, type Subscription } from "@/lib/api";

// ── Design tokens — OLED black + isolated neon ────────────────────────────────
const C    = "#00e5ff";   // cyan neon
const G    = "#00ff88";   // emerald green
const P    = "#9b5cf5";   // electric purple
const O    = "#ff9400";   // amber warning
const R    = "#ff3355";   // sharp red
const W    = "#ffffff";   // pure white
const GR   = "#8892a4";   // muted grey text
const DIM  = "#3a3f5c";   // dim separator
const GOLD = "#ffd200";   // gold accent

// ── Surface / background tokens ───────────────────────────────────────────────
const BG      = "#050508";   // OLED page black
const CARD    = "#08080e";   // card surface — barely lifted off BG
const CARD2   = "#060609";   // secondary card surface
const BORDER  = "rgba(255,255,255,0.07)";

// ── Sparkline ─────────────────────────────────────────────────────────────────
function genPts(seed: string, trend: "up"|"down"|"flat") {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) { s = (((s << 5) + s) ^ seed.charCodeAt(i)) >>> 0; }
  const rand = () => { s ^= s<<13; s ^= s>>17; s ^= s<<5; return (s>>>0)/0x100000000; };
  const dir = trend==="up" ? 1.3 : trend==="down" ? -1.3 : 0.1;
  const pts: number[] = []; let v = 50;
  for (let i = 0; i < 20; i++) { v = Math.max(8,Math.min(92,v+(rand()-0.5)*10+dir)); pts.push(v); }
  return pts;
}
function Sparkline({ seed, trend, w=74, h=28 }: { seed:string; trend:"up"|"down"|"flat"; w?:number; h?:number }) {
  const col = trend==="up" ? G : trend==="down" ? R : C;
  const pts = genPts(seed, trend);
  const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx-mn||1;
  const path = pts.map((p,i)=>`${((i/(pts.length-1))*w).toFixed(1)},${(h-3-((p-mn)/rng)*(h-6)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow:"visible" }}>
      <polyline points={path} fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── AI waveform bars ──────────────────────────────────────────────────────────
function AIWave({ color=G, bars=14 }: { color?:string; bars?:number }) {
  const H = [5,10,16,12,7,20,24,15,9,19,13,7,15,11];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:2, height:24 }}>
      {H.slice(0,bars).map((h,i) => (
        <div key={i} style={{
          width:2, height:h, borderRadius:1, background:color, opacity:0.85,
          animation:`wave-bar 1.4s ease-in-out ${(i*0.09).toFixed(2)}s infinite alternate`,
        }}/>
      ))}
    </div>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfBar({ value, color, delay="0s" }: { value:number; color:string; delay?:string }) {
  return (
    <div style={{ height:2.5, background:"#0e0e14", borderRadius:2, overflow:"hidden" }}>
      <div style={{
        height:"100%", background:color, borderRadius:2,
        width:`${value}%`, boxShadow:`0 0 8px ${color}80`,
        animation:`bar-in 0.8s ${delay} ease-out both`,
      }}/>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SH({ label, right, color=P }: { label:string; right?:string; color?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <div style={{ width:3, height:14, background:color, borderRadius:2, flexShrink:0, boxShadow:`0 0 8px ${color}` }}/>
      <span style={{ fontSize:9, color:GR, letterSpacing:"0.2em", fontFamily:"monospace", fontWeight:700 }}>
        {label}
      </span>
      {right && <span style={{ marginLeft:"auto", fontSize:9, fontFamily:"monospace", color:DIM }}>{right}</span>}
    </div>
  );
}

// ── Format ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return Math.abs(n) >= 1_000 ? `$${(n/1_000).toFixed(1)}K` : `$${n.toFixed(2)}`;
}

// ── Plan helpers ──────────────────────────────────────────────────────────────
function planColor(plan: string) {
  const p = plan.toLowerCase();
  if (p.includes("live") || p.includes("pro"))     return G;
  if (p.includes("starter") || p.includes("paid")) return C;
  return DIM;
}
function planLabel(plan: string) {
  const p = plan.toLowerCase();
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

// ── Scrolling ticker ──────────────────────────────────────────────────────────
function Ticker({ items }: { items:string[] }) {
  const text = items.join("  ·  ") + "  ·  " + items.join("  ·  ");
  return (
    <div style={{ overflow:"hidden", height:18, background:"#020204", borderBottom:`1px solid #0e0e14` }}>
      <div style={{
        display:"inline-flex", whiteSpace:"nowrap",
        animation:"ticker-scroll 28s linear infinite",
        fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.1em",
        lineHeight:"18px", paddingLeft:"100%",
      }}>
        {text}
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { user }        = useUser();

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
  const { data: sub }       = useQuery<Subscription>({
    queryKey:["subscription"],     queryFn:()=>api.get("/billing/subscription"), staleTime:120_000, retry:false,
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

  const plan     = sub?.plan ?? "free";
  const pColor   = planColor(plan);
  const pLabel   = planLabel(plan);
  const exchange = engine?.exchange?.toUpperCase() ?? "KRAKEN";
  const initials = (user?.firstName?.[0] ?? "A") + (user?.lastName?.[0] ?? "T");
  const displayName = user?.firstName ?? "Apex Trader";

  const tickerItems = [
    `BTC $68,120 ▲`, `ETH $3,512 ▲`, `SOL $188 ▼`,
    `AI SIGNALS: ${sigList.length}`, `ENGINE: ${engine?.running ? "RUNNING" : "IDLE"}`,
    `EXCHANGE: ${exchange}`, `POSITIONS: ${posCount}`, `WIN RATE: ${winRate}%`,
  ];

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:32, position:"relative" }}>

      <div style={{ position:"relative", zIndex:1 }}>

        {/* ── Telemetry ticker ────────────────────────────────────────────────── */}
        <Ticker items={tickerItems}/>

        {/* ── User identity bar ───────────────────────────────────────────────── */}
        <div style={{
          display:"flex", alignItems:"center", gap:12, padding:"12px 18px 0",
        }}>
          {/* Avatar */}
          <div onClick={()=>setLocation("/profile")} style={{
            width:38, height:38, borderRadius:"50%", flexShrink:0, cursor:"pointer",
            background:"#0a0a14",
            border:`1.5px solid ${C}55`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, fontFamily:"monospace", fontWeight:900, color:C,
            boxShadow:`0 0 16px ${C}25, inset 0 0 8px ${C}08`,
            position:"relative",
          }}>
            {initials.toUpperCase()}
            <div style={{
              position:"absolute", bottom:0, right:0,
              width:9, height:9, borderRadius:"50%", background:G,
              border:`2px solid ${BG}`, boxShadow:`0 0 8px ${G}`,
            }}/>
          </div>

          {/* Name + plan */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{
              fontSize:13, fontFamily:"monospace", fontWeight:800, color:W,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
            }}>
              {displayName}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
              <span style={{
                padding:"1px 7px", borderRadius:3,
                background:`${pColor}18`, border:`1px solid ${pColor}45`,
                fontSize:7, fontFamily:"monospace", fontWeight:800,
                color:pColor, letterSpacing:"0.12em",
                boxShadow:`0 0 8px ${pColor}20`,
              }}>
                {pLabel}
              </span>
              <span style={{ fontSize:7, fontFamily:"monospace", color:DIM }}>{exchange}</span>
            </div>
          </div>

          {/* Mode + heartbeat */}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <div style={{
              padding:"3px 10px",
              border:`1px solid ${isLive ? G+"55" : C+"40"}`,
              borderRadius:4,
              background: isLive ? "#002210" : "#001a22",
              fontSize:8, fontFamily:"monospace", fontWeight:800,
              color: isLive ? G : C, letterSpacing:"0.12em",
              boxShadow: isLive ? `0 0 10px ${G}20` : `0 0 10px ${C}15`,
              animation:"badge-glow 3s ease-in-out infinite",
            }}>
              {isLive ? "LIVE" : "SIM"}
            </div>
            {/* AI heartbeat */}
            <div style={{ position:"relative", width:16, height:16, flexShrink:0 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:G, margin:"4px",
                boxShadow:`0 0 10px ${G}`, animation:"dot-pulse 2s ease-in-out infinite" }}/>
              <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                border:`1px solid ${G}40`, animation:"ring-out 2.5s ease-out infinite" }}/>
            </div>
          </div>
        </div>

        {/* ── Brand ───────────────────────────────────────────────────────────── */}
        <div style={{ padding:"8px 20px 14px" }}>
          <div style={{
            fontSize:28, fontWeight:900, fontFamily:"monospace", letterSpacing:"-0.01em",
            background:`linear-gradient(90deg, ${W} 0%, ${C} 55%, ${G} 100%)`,
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            animation:"title-glow 5s ease-in-out infinite",
          }}>
            APEX TRADER
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
            <span style={{ fontSize:8, fontFamily:"monospace", color:DIM, letterSpacing:"0.12em" }}>
              AI ENGINE ACTIVE · {isLive ? "LIVE MODE" : "SIMULATION MODE"} · {exchange}
            </span>
          </div>
        </div>

        <div style={{ padding:"0 16px" }}>

          {/* ── PORTFOLIO EQUITY — cinematic hero card ───────────────────────── */}
          <div style={{
            position:"relative", overflow:"hidden", borderRadius:18,
            marginBottom:12, padding:"22px 22px 18px",
            // Pure black glass — no blue
            background:"linear-gradient(160deg, #070710 0%, #04040a 100%)",
            border:`1px solid rgba(0,229,255,0.22)`,
            boxShadow:[
              `0 0 0 1px rgba(0,229,255,0.08)`,
              `0 16px 48px rgba(0,0,0,0.9)`,
              `0 0 60px rgba(0,229,255,0.06)`,
              `inset 0 1px 0 rgba(0,229,255,0.12)`,
              `inset 0 0 30px rgba(0,0,0,0.5)`,
            ].join(", "),
            animation:"card-glow 6s ease-in-out infinite",
          }}>

            {/* Top edge laser — most prominent glow element */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent 5%, ${C}80 40%, ${G}60 60%, transparent 95%)`,
              animation:"edge-sweep 5s ease-in-out infinite",
            }}/>

            {/* Holographic shimmer */}
            <div aria-hidden style={{
              position:"absolute", inset:0, borderRadius:18, pointerEvents:"none",
              background:`linear-gradient(105deg,
                transparent 0%, transparent 28%,
                rgba(0,229,255,0.025) 30%, rgba(0,229,255,0.025) 33%,
                transparent 35%, transparent 64%,
                rgba(155,92,245,0.018) 66%, rgba(155,92,245,0.018) 69%,
                transparent 71%)`,
              animation:"holo-shift 10s ease-in-out infinite",
            }}/>

            {/* Bottom wave — barely visible, purely atmospheric */}
            <div aria-hidden style={{
              position:"absolute", bottom:0, left:0, right:0,
              height:44, overflow:"hidden", opacity:0.05, pointerEvents:"none",
            }}>
              <svg viewBox="0 0 800 44" width="200%" height="44" preserveAspectRatio="none"
                style={{ animation:"wave-scroll 9s linear infinite" }}>
                <path d="M0,22 C80,8 160,36 240,22 C320,8 400,36 480,22 C560,8 640,36 720,22 C800,8 880,36 960,22 C1040,8 1120,36 1200,22 C1280,8 1360,36 1440,22 L1440,44 L0,44Z"
                  fill={G}/>
              </svg>
            </div>

            {/* Tight cyan corner glow — NOT a large ambient wash */}
            <div aria-hidden style={{
              position:"absolute", top:-20, right:-20, width:100, height:100,
              background:`radial-gradient(circle, ${C}12 0%, transparent 70%)`,
              animation:"glow-breathe 5s ease-in-out infinite",
              pointerEvents:"none",
            }}/>

            {/* Scan band */}
            <div aria-hidden style={{
              position:"absolute", left:0, right:0, height:60, opacity:0.3,
              background:`linear-gradient(180deg, transparent, ${C}04, transparent)`,
              animation:"scan-card 7s linear infinite",
              pointerEvents:"none",
            }}/>

            {/* Telemetry particles */}
            {[
              { top:"15%", left:"7%",  sz:2,   dur:"5.5s", del:"0s"   },
              { top:"62%", left:"83%", sz:1.5, dur:"6.5s", del:"2s"   },
              { top:"35%", left:"90%", sz:2,   dur:"4.5s", del:"1s"   },
            ].map((p,i) => (
              <div aria-hidden key={i} style={{
                position:"absolute", width:p.sz, height:p.sz,
                borderRadius:"50%", background:C,
                top:p.top, left:p.left, opacity:0,
                boxShadow:`0 0 5px ${C}`, pointerEvents:"none",
                animation:`float-part ${p.dur} ${p.del} ease-in-out infinite`,
              }}/>
            ))}

            {/* ── Content ──────────────────────────────────────────────────── */}
            <div style={{ position:"relative", zIndex:1 }}>
              <div style={{ fontSize:8, fontFamily:"monospace", color:GR,
                letterSpacing:"0.22em", marginBottom:12, fontWeight:600 }}>
                PORTFOLIO EQUITY
              </div>

              {/* THE NUMBER — dominant */}
              <div style={{
                fontSize:46, fontWeight:900, color:W, fontFamily:"monospace",
                letterSpacing:"-0.03em", lineHeight:1,
                textShadow:`0 0 40px rgba(255,255,255,0.2), 0 2px 0 rgba(0,0,0,0.8)`,
                animation:"num-pop 0.6s ease-out both",
              }}>
                {fmt(tv)}
              </div>

              {/* Unrealized P&L */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, flexWrap:"wrap" }}>
                <span style={{
                  fontSize:13, fontFamily:"monospace", fontWeight:700,
                  color: pnl >= 0 ? G : R,
                  textShadow: pnl >= 0 ? `0 0 16px ${G}` : `0 0 16px ${R}`,
                  animation:"pnl-pulse 3s ease-in-out infinite",
                }}>
                  {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} unrealized
                </span>
                <span style={{ fontSize:9, color:DIM }}>·</span>
                <span style={{ fontSize:12, fontFamily:"monospace", color:pnlPct>=0?G:R, fontWeight:700 }}>
                  {pnlPct>=0?"+":""}{pnlPct.toFixed(2)}%
                </span>
              </div>

              {/* Sub-stats */}
              <div style={{
                display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
                marginTop:18, borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:14,
              }}>
                {[
                  { label:"CASH",      val:fmt(tv*0.855), color:W    },
                  { label:"REALIZED",  val:realized>=0?`+${fmt(realized)}`:fmt(realized), color:G },
                  { label:"FEES PAID", val:`$${fees.toFixed(2)}`, color:GOLD },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.14em", marginBottom:5 }}>{label}</div>
                    <div style={{ fontSize:13, fontFamily:"monospace", fontWeight:700, color,
                      textShadow:`0 0 12px ${color}60` }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Simulation badge */}
              {!isLive && (
                <div style={{
                  marginTop:14, padding:"7px 12px", borderRadius:7,
                  background:"#001a0a", border:`1px solid ${G}22`,
                  fontSize:8, fontFamily:"monospace", color:G, letterSpacing:"0.08em",
                  display:"flex", alignItems:"center", gap:8,
                }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:G, flexShrink:0,
                    boxShadow:`0 0 8px ${G}`, animation:"dot-pulse 2s ease-in-out infinite" }}/>
                  PAPER TRADING · NO REAL FUNDS AT RISK · ALWAYS FREE
                </div>
              )}
            </div>
          </div>

          {/* ── Stats Trio ──────────────────────────────────────────────────── */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:20 }}>
            {[
              { val:`${winRate}%`, label:"WIN RATE",     color:G, sub:"4W · 1L" },
              { val:String(posCount),  label:"POSITIONS",    color:C, sub:"open" },
              { val:String(trades),    label:"TOTAL TRADES", color:W, sub:"all time" },
            ].map(({ val, label, color, sub }, i) => (
              <div key={label} style={{
                position:"relative", overflow:"hidden",
                background:CARD2,
                border:`1px solid rgba(255,255,255,0.08)`,
                borderRadius:13, padding:"15px 10px", textAlign:"center",
                boxShadow:`0 8px 24px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05)`,
                animation:`card-in 0.4s ${(i*0.08).toFixed(2)}s ease-out both`,
              }}>
                {/* Top edge glow */}
                <div aria-hidden style={{
                  position:"absolute", top:0, left:0, right:0, height:1,
                  background:`linear-gradient(90deg, transparent, ${color}50, transparent)`,
                }}/>
                {/* Subtle inner glow from top */}
                <div aria-hidden style={{
                  position:"absolute", inset:0,
                  background:`radial-gradient(ellipse at 50% -20%, ${color}10 0%, transparent 60%)`,
                }}/>
                <div style={{
                  fontSize:28, fontWeight:900, color, fontFamily:"monospace",
                  lineHeight:1, marginBottom:4, position:"relative",
                  textShadow:`0 0 24px ${color}80`,
                  animation:`stat-glow 4s ease-in-out ${i*1.4}s infinite`,
                }}>
                  {val}
                </div>
                <div style={{ fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.14em", position:"relative" }}>
                  {label}
                </div>
                <div style={{ fontSize:7, fontFamily:"monospace", color:`${color}60`, marginTop:2, position:"relative" }}>
                  {sub}
                </div>
              </div>
            ))}
          </div>

          {/* ── AI Engine Status ─────────────────────────────────────────────── */}
          <div style={{ marginBottom:20 }}>
            <SH label="AI ENGINE STATUS"/>
            <div style={{
              position:"relative", overflow:"hidden",
              background:`linear-gradient(140deg, ${CARD} 0%, #060610 100%)`,
              borderRadius:14, padding:"16px 16px",
              border:`1px solid ${P}30`,
              boxShadow:`0 8px 24px rgba(0,0,0,0.8), 0 0 40px ${P}08, inset 0 1px 0 rgba(155,92,245,0.1)`,
            }}>
              {/* Top edge */}
              <div aria-hidden style={{
                position:"absolute", top:0, left:0, right:0, height:1,
                background:`linear-gradient(90deg, transparent, ${P}60, ${C}40, transparent)`,
              }}/>
              {/* Corner glow — tight */}
              <div aria-hidden style={{
                position:"absolute", bottom:-20, right:-20, width:100, height:100,
                background:`radial-gradient(circle, ${P}18 0%, transparent 70%)`,
                animation:"glow-breathe 6s ease-in-out 1s infinite",
              }}/>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", position:"relative" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ position:"relative", flexShrink:0, width:18, height:18 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:G,
                        margin:"4px", boxShadow:`0 0 14px ${G}` }}/>
                      <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                        border:`1px solid ${G}50`, animation:"ring-out 2s ease-out infinite" }}/>
                      <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                        border:`1px solid ${G}20`, animation:"ring-out 2s ease-out 0.7s infinite" }}/>
                    </div>
                    <span style={{
                      fontSize:14, fontFamily:"monospace", fontWeight:900, color:G,
                      letterSpacing:"0.08em", textShadow:`0 0 20px ${G}`,
                    }}>
                      {engine?.running ? "RUNNING" : "STOPPED"}
                    </span>
                  </div>

                  <div style={{ fontSize:9, fontFamily:"monospace", color:DIM, lineHeight:2, marginBottom:10 }}>
                    BTCUSD · {engine?.signalsGenerated ?? 0} signals generated<br/>
                    ETHUSD · SOLUSD — monitoring
                  </div>

                  <AIWave color={G}/>
                </div>

                <div style={{ textAlign:"right" }}>
                  <div style={{
                    fontSize:13, fontFamily:"monospace", fontWeight:900, color:C,
                    letterSpacing:"0.1em", marginBottom:8,
                    textShadow:`0 0 16px ${C}`,
                  }}>
                    {exchange}
                  </div>
                  <div style={{
                    padding:"2px 8px", borderRadius:4,
                    background:"#0e0800", border:`1px solid ${O}50`,
                    fontSize:8, fontFamily:"monospace", fontWeight:800,
                    color:O, letterSpacing:"0.1em", marginBottom:8,
                    boxShadow:`0 0 8px ${O}20`,
                  }}>
                    VOL FILTER
                  </div>
                  <div style={{ fontSize:7, fontFamily:"monospace", color:DIM,
                    animation:"scan-text 2s ease-in-out infinite" }}>
                    SCANNING...
                  </div>
                </div>
              </div>

              <div style={{ marginTop:12, borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.14em" }}>
                    AI SIGNAL STRENGTH
                  </span>
                  <span style={{ fontSize:7, fontFamily:"monospace", color:G,
                    animation:"scan-text 2.5s ease-in-out infinite" }}>ACTIVE</span>
                </div>
                <ConfBar value={engine?.running ? 72 : 10} color={G}/>
              </div>
            </div>
          </div>

          {/* ── Live Markets ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom:20 }}>
            <SH label="LIVE MARKETS" color={C}/>
            <div style={{
              background:CARD,
              border:`1px solid ${BORDER}`,
              borderRadius:14, overflow:"hidden",
              boxShadow:`0 8px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}>
              {MARKETS.map(({ sym, price, action, trend }, i) => {
                const ac = AC[action] ?? W;
                return (
                  <div key={sym} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"14px 16px",
                    borderBottom: i<2 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    position:"relative", overflow:"hidden",
                    animation:`card-in 0.35s ${(i*0.07).toFixed(2)}s ease-out both`,
                  }}>
                    <div aria-hidden style={{
                      position:"absolute", inset:0,
                      background:`radial-gradient(ellipse at 0% 50%, ${ac}05 0%, transparent 50%)`,
                    }}/>
                    <div style={{ width:2.5, height:38, background:ac, borderRadius:2, flexShrink:0,
                      boxShadow:`0 0 10px ${ac}` }}/>
                    <div style={{ flex:"0 0 80px" }}>
                      <div style={{ fontSize:9, fontFamily:"monospace", color:GR, letterSpacing:"0.1em", marginBottom:3 }}>{sym}</div>
                      <div style={{ fontSize:15, fontFamily:"monospace", fontWeight:800, color:W,
                        textShadow:`0 0 10px rgba(255,255,255,0.15)` }}>{price}</div>
                    </div>
                    <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
                      <Sparkline seed={sym+"mkt"} trend={trend} w={80} h={30}/>
                    </div>
                    <div>
                      <div style={{
                        padding:"4px 13px", background:"#000000",
                        border:`1px solid ${ac}55`, borderRadius:5,
                        fontSize:9, fontFamily:"monospace", fontWeight:800,
                        color:ac, letterSpacing:"0.1em",
                        boxShadow:`0 0 14px ${ac}40`,
                      }}>
                        {action}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Recent AI Signals ────────────────────────────────────────────── */}
          <div style={{ marginBottom:24 }}>
            <SH label="RECENT AI SIGNALS" right={`${sigList.length} recent`}/>

            <div style={{
              background:CARD,
              border:`1px solid ${BORDER}`,
              borderRadius:14, overflow:"hidden",
              boxShadow:`0 8px 24px rgba(0,0,0,0.8)`,
            }}>
              {/* Live feed banner */}
              <div style={{
                padding:"8px 16px", background:"#001a0a",
                borderBottom:"1px solid rgba(255,255,255,0.05)",
                display:"flex", alignItems:"center", gap:8,
              }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:G,
                  boxShadow:`0 0 8px ${G}`, animation:"dot-pulse 1.5s ease-in-out infinite" }}/>
                <span style={{ fontSize:8, fontFamily:"monospace", color:G, letterSpacing:"0.14em" }}>
                  LIVE SIGNAL FEED · AI MONITORING
                </span>
                <span style={{ marginLeft:"auto", fontSize:7, fontFamily:"monospace", color:DIM,
                  animation:"scan-text 2s ease-in-out infinite" }}>SCANNING</span>
              </div>

              {sigList.length === 0 ? (
                <div style={{ padding:"28px 0", textAlign:"center" }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
                    <AIWave color={C} bars={10}/>
                  </div>
                  <div style={{ fontSize:9, fontFamily:"monospace", color:DIM }}>ENGINE WARMING UP...</div>
                </div>
              ) : sigList.map(([sym, bd], i) => {
                const conf  = bd.confidence ?? 0;
                const age   = Math.floor((Date.now() - bd.lastUpdated) / 1000);
                const ageT  = age < 60 ? `${age}s ago` : `${Math.floor(age/60)}m ago`;
                const color = AC[bd.action] ?? GR;
                const isTop = i === 0;
                return (
                  <div key={sym} style={{
                    display:"flex", alignItems:"stretch",
                    borderBottom: i<sigList.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    position:"relative", overflow:"hidden",
                    background: isTop ? "#00110a" : "transparent",
                    animation:`card-in 0.3s ${(i*0.06).toFixed(2)}s ease-out both`,
                  }}>
                    {isTop && (
                      <div aria-hidden style={{
                        position:"absolute", inset:0,
                        background:`radial-gradient(ellipse at 20% 50%, ${color}06, transparent 60%)`,
                        animation:"row-scan 4s ease-in-out infinite",
                      }}/>
                    )}
                    <div style={{
                      width:3, background:color, flexShrink:0,
                      boxShadow: isTop ? `0 0 12px ${color}` : "none",
                    }}/>
                    <div style={{ flex:"0 0 76px", padding:"12px 10px 12px 12px" }}>
                      <div style={{
                        fontSize:13, fontFamily:"monospace", fontWeight:900, color:W,
                        textShadow: isTop ? `0 0 16px ${color}` : "none",
                      }}>
                        {sym.replace("USD","")}
                      </div>
                      <div style={{ fontSize:7, fontFamily:"monospace", color:DIM, marginTop:3 }}>{ageT}</div>
                    </div>
                    <div style={{ flex:1, padding:"12px 8px" }}>
                      <div style={{ fontSize:9, fontFamily:"monospace", color:GR, marginBottom:7 }}>
                        EMA+RSI confluence
                      </div>
                      <ConfBar value={conf} color={color} delay={`${i*0.1}s`}/>
                    </div>
                    <div style={{ padding:"12px 14px 12px 4px", textAlign:"right" }}>
                      <div style={{ fontSize:11, fontFamily:"monospace", fontWeight:700, color:GR, marginBottom:3 }}>
                        {conf.toFixed(1)}%
                      </div>
                      <div style={{ fontSize:7, color, opacity:0.8, textShadow:`0 0 6px ${color}` }}>◉</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Go Live CTA — institutional black glass ──────────────────────── */}
          <div style={{
            position:"relative", overflow:"hidden",
            background:"linear-gradient(155deg, #06060f 0%, #080818 50%, #060610 100%)",
            border:`1px solid rgba(155,92,245,0.28)`,
            borderRadius:18, padding:"22px 20px",
            boxShadow:[
              `0 0 0 1px rgba(155,92,245,0.10)`,
              `0 16px 48px rgba(0,0,0,0.9)`,
              `0 0 60px rgba(155,92,245,0.08)`,
              `inset 0 1px 0 rgba(155,92,245,0.15)`,
            ].join(", "),
          }}>
            {/* Top laser edge */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent 5%, ${P}70 40%, ${C}60 60%, transparent 95%)`,
              animation:"edge-sweep 5s ease-in-out infinite",
            }}/>
            {/* Tight corner glows — not large washes */}
            <div aria-hidden style={{
              position:"absolute", top:-30, right:-30, width:110, height:110,
              background:`radial-gradient(circle, ${C}10 0%, transparent 70%)`,
              animation:"glow-breathe 7s ease-in-out 2s infinite",
            }}/>
            <div aria-hidden style={{
              position:"absolute", bottom:-30, left:-30, width:110, height:110,
              background:`radial-gradient(circle, ${P}12 0%, transparent 70%)`,
              animation:"glow-breathe 9s ease-in-out infinite",
            }}/>

            <div style={{ position:"relative" }}>
              {/* Header */}
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                <div style={{
                  width:40, height:40, borderRadius:10, flexShrink:0,
                  background:"#0a0014",
                  border:`1px solid ${P}45`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:18, boxShadow:`0 0 24px ${P}30, inset 0 0 12px ${P}10`,
                }}>⚡</div>
                <div>
                  <div style={{ fontSize:14, fontFamily:"monospace", fontWeight:900, color:W,
                    letterSpacing:"0.02em", textShadow:`0 0 20px rgba(255,255,255,0.2)` }}>
                    ACTIVATE LIVE AI TRADING
                  </div>
                  <div style={{ fontSize:8, fontFamily:"monospace", color:GR, marginTop:3 }}>
                    Real funds · AI-managed · Fully transparent
                  </div>
                </div>
              </div>

              {/* Fee model */}
              <div style={{
                background:"rgba(0,0,0,0.5)", borderRadius:11,
                padding:"14px 16px", marginBottom:14,
                border:"1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{ fontSize:7, fontFamily:"monospace", color:DIM,
                  letterSpacing:"0.18em", marginBottom:10 }}>TRANSPARENT FEE STRUCTURE</div>
                {[
                  { icon:"◈", text:"$5.99 / month platform fee",          color:C },
                  { icon:"◈", text:"2% on profitable CLOSED trades only",  color:C },
                  { icon:"◉", text:"Zero fee on losing trades — ever",     color:G },
                  { icon:"◉", text:"Paper trading remains free forever",    color:G },
                  { icon:"◉", text:"Cancel anytime — no lock-in",          color:G },
                ].map(({ icon, text, color }, idx, arr) => (
                  <div key={text} style={{
                    display:"flex", gap:10, alignItems:"flex-start",
                    marginBottom: idx < arr.length-1 ? 9 : 0,
                  }}>
                    <span style={{ fontSize:9, color, flexShrink:0, marginTop:1,
                      textShadow:`0 0 8px ${color}` }}>{icon}</span>
                    <span style={{ fontSize:11, fontFamily:"monospace", color:GR, lineHeight:1.6 }}>{text}</span>
                  </div>
                ))}
              </div>

              {/* Exchange support */}
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:7, fontFamily:"monospace", color:DIM,
                  letterSpacing:"0.18em", marginBottom:9 }}>SUPPORTED LIVE EXCHANGES</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {["Kraken","Coinbase","Binance","Crypto.com","Gemini"].map(e => (
                    <span key={e} style={{
                      padding:"3px 11px",
                      background:"#00080d", border:`1px solid ${C}28`, borderRadius:20,
                      fontSize:9, fontFamily:"monospace", color:GR,
                    }}>{e}</span>
                  ))}
                  <span style={{
                    padding:"3px 11px",
                    background:"transparent", border:"1px solid rgba(255,255,255,0.06)", borderRadius:20,
                    fontSize:9, fontFamily:"monospace", color:DIM,
                  }}>+ more coming</span>
                </div>
              </div>

              {/* CTA */}
              <button onClick={()=>setLocation("/subscribe")} style={{
                width:"100%", padding:"15px 0",
                background:"#040418",
                border:`1px solid ${C}55`, borderRadius:12,
                color:C, fontFamily:"monospace", fontSize:12,
                fontWeight:900, letterSpacing:"0.12em", cursor:"pointer",
                boxShadow:`0 0 28px ${C}18, inset 0 1px 0 rgba(0,229,255,0.15)`,
                animation:"cta-glow 3.5s ease-in-out infinite",
              }}>
                ACTIVATE LIVE AI TRADING →
              </button>

              <div style={{ marginTop:10, textAlign:"center", fontSize:8,
                fontFamily:"monospace", color:DIM, lineHeight:1.8 }}>
                Institutional-grade AI · Withdrawal permissions never requested
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── All keyframes ─────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes glow-breathe  { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes dot-pulse     { 0%,100%{box-shadow:0 0 8px ${G};transform:scale(1)} 50%{box-shadow:0 0 18px ${G};transform:scale(1.3)} }
        @keyframes badge-glow    { 0%,100%{opacity:.85} 50%{opacity:1} }
        @keyframes title-glow    { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.2)} }
        @keyframes card-glow     {
          0%,100%{box-shadow:0 0 0 1px rgba(0,229,255,.08),0 16px 48px rgba(0,0,0,.9),0 0 60px rgba(0,229,255,.05),inset 0 1px 0 rgba(0,229,255,.12),inset 0 0 30px rgba(0,0,0,.5)}
          50%    {box-shadow:0 0 0 1px rgba(0,229,255,.14),0 16px 48px rgba(0,0,0,.9),0 0 80px rgba(0,229,255,.10),inset 0 1px 0 rgba(0,229,255,.18),inset 0 0 30px rgba(0,0,0,.5)}
        }
        @keyframes edge-sweep    { 0%{opacity:.3;transform:scaleX(.5) translateX(-40%)} 50%{opacity:1;transform:scaleX(1)} 100%{opacity:.3;transform:scaleX(.5) translateX(40%)} }
        @keyframes holo-shift    { 0%{opacity:.6} 50%{opacity:1} 100%{opacity:.6} }
        @keyframes wave-scroll   { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes scan-card     { 0%{top:-80px;opacity:0} 15%{opacity:1} 85%{opacity:.5} 100%{top:260px;opacity:0} }
        @keyframes float-part    { 0%{opacity:0;transform:translateY(0) scale(1)} 30%{opacity:.9;transform:translateY(-10px) scale(1.4)} 70%{opacity:.5;transform:translateY(-18px) scale(.8)} 100%{opacity:0;transform:translateY(0) scale(1)} }
        @keyframes ring-out      { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(3.5);opacity:0} }
        @keyframes wave-bar      { from{transform:scaleY(.3);opacity:.4} to{transform:scaleY(1);opacity:.9} }
        @keyframes scan-text     { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes bar-in        { from{width:0%;opacity:0} to{opacity:1} }
        @keyframes pnl-pulse     { 0%,100%{opacity:1} 50%{opacity:.65} }
        @keyframes card-in       { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes num-pop       { from{opacity:0;transform:scale(.92)} to{opacity:1;transform:scale(1)} }
        @keyframes row-scan      { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes stat-glow     { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.25)} }
        @keyframes cta-glow      { 0%,100%{box-shadow:0 0 28px ${C}18,inset 0 1px 0 rgba(0,229,255,.15)} 50%{box-shadow:0 0 44px ${C}35,inset 0 1px 0 rgba(0,229,255,.25)} }
        @keyframes ticker-scroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
      `}</style>
    </div>
  );
}
