import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { api, type MobileStatus, type Portfolio, type SimAccount, type SignalBreakdown, type Subscription } from "@/lib/api";

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = "#00e5ff", G = "#00ff88", P = "#9b5cf5",
      O = "#ff9400", R = "#ff3355", W = "#ffffff",
      GR = "#8892a4", DIM = "#3a3f5c", GOLD = "#ffd200";

// ── Seeded sparkline ───────────────────────────────────────────────────────────
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

// ── AI Waveform ────────────────────────────────────────────────────────────────
function AIWave({ color=G, bars=14 }: { color?:string; bars?:number }) {
  const H = [5,10,16,12,7,20,24,15,9,19,13,7,15,11];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:2, height:24 }}>
      {H.slice(0,bars).map((h,i) => (
        <div key={i} style={{
          width:2, height:h, borderRadius:1, background:color, opacity:0.8,
          animation:`wave-bar 1.4s ease-in-out ${(i*0.09).toFixed(2)}s infinite alternate`,
        }}/>
      ))}
    </div>
  );
}

// ── Confidence bar (animated fill) ────────────────────────────────────────────
function ConfBar({ value, color, delay="0s" }: { value:number; color:string; delay?:string }) {
  return (
    <div style={{ height:2.5, background:"#1a1d2e", borderRadius:2, overflow:"hidden" }}>
      <div style={{
        height:"100%", background:color, borderRadius:2,
        width:`${value}%`, boxShadow:`0 0 6px ${color}60`,
        animation:`bar-in 0.8s ${delay} ease-out both`,
      }}/>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SH({ label, right, color=P }: { label:string; right?:string; color?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <div style={{ width:3, height:14, background:color, borderRadius:2, flexShrink:0 }}/>
      <span style={{ fontSize:9, color:GR, letterSpacing:"0.2em", fontFamily:"monospace", fontWeight:700 }}>
        {label}
      </span>
      {right && <span style={{ marginLeft:"auto", fontSize:9, fontFamily:"monospace", color:DIM }}>{right}</span>}
    </div>
  );
}

// ── Format currency ────────────────────────────────────────────────────────────
function fmt(n: number) {
  return Math.abs(n) >= 1_000 ? `$${(n/1_000).toFixed(1)}K` : `$${n.toFixed(2)}`;
}

// ── Plan badge color ───────────────────────────────────────────────────────────
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

// ── Markets list ───────────────────────────────────────────────────────────────
const MARKETS = [
  { sym:"BTC", price:"$68,120", action:"BUY",  trend:"up"   as const },
  { sym:"ETH", price:"$3,512",  action:"BUY",  trend:"up"   as const },
  { sym:"SOL", price:"$188",    action:"HOLD", trend:"flat" as const },
];
const AC: Record<string,string> = { BUY:G, SELL:R, HOLD:C };

// ── Scrolling telemetry ticker ─────────────────────────────────────────────────
function Ticker({ items }: { items: string[] }) {
  const text = items.join("  ·  ") + "  ·  " + items.join("  ·  ");
  return (
    <div style={{ overflow:"hidden", height:18, background:"#06070f", borderBottom:"1px solid #1a1d2e" }}>
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
    <div className="page-enter" style={{ background:"#080810", minHeight:"100%", paddingBottom:28, position:"relative" }}>

      {/* ── Ambient glow layer (fixed, behind everything) ───────────────────── */}
      <div aria-hidden style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0 }}>
        <div style={{
          position:"absolute", top:-60, left:"20%", width:340, height:340,
          background:`radial-gradient(ellipse, ${C}07 0%, transparent 70%)`,
          animation:"glow-breathe 7s ease-in-out infinite",
        }}/>
        <div style={{
          position:"absolute", top:"25%", right:-40, width:280, height:280,
          background:`radial-gradient(ellipse, ${P}06 0%, transparent 70%)`,
          animation:"glow-breathe 9s ease-in-out 3s infinite",
        }}/>
        <div style={{
          position:"absolute", bottom:"20%", left:-30, width:220, height:220,
          background:`radial-gradient(ellipse, ${G}04 0%, transparent 70%)`,
          animation:"glow-breathe 11s ease-in-out 6s infinite",
        }}/>
      </div>

      <div style={{ position:"relative", zIndex:1 }}>

        {/* ── Telemetry ticker ────────────────────────────────────────────────── */}
        <Ticker items={tickerItems}/>

        {/* ── User identity bar ───────────────────────────────────────────────── */}
        <div style={{
          display:"flex", alignItems:"center", gap:12,
          padding:"10px 18px 0",
        }}>
          {/* Avatar */}
          <div onClick={()=>setLocation("/profile")} style={{
            width:36, height:36, borderRadius:"50%", flexShrink:0, cursor:"pointer",
            background:`linear-gradient(135deg, ${C}28, ${P}22)`,
            border:`1.5px solid ${C}45`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, fontFamily:"monospace", fontWeight:900, color:C,
            boxShadow:`0 0 12px ${C}20`,
            position:"relative",
          }}>
            {initials.toUpperCase()}
            {/* Online dot */}
            <div style={{
              position:"absolute", bottom:0, right:0,
              width:8, height:8, borderRadius:"50%", background:G,
              border:"1.5px solid #080810", boxShadow:`0 0 6px ${G}`,
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
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
              <span style={{
                padding:"1px 7px", borderRadius:3,
                background:`${pColor}14`, border:`1px solid ${pColor}35`,
                fontSize:7, fontFamily:"monospace", fontWeight:800,
                color:pColor, letterSpacing:"0.12em",
              }}>
                {pLabel}
              </span>
              <span style={{ fontSize:7, fontFamily:"monospace", color:DIM }}>
                {exchange}
              </span>
            </div>
          </div>

          {/* Mode + AI pulse */}
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{
                padding:"2px 9px",
                border:`1px solid ${isLive ? G+"55" : C+"40"}`,
                borderRadius:4,
                background: isLive ? G+"10" : C+"07",
                fontSize:8, fontFamily:"monospace", fontWeight:800,
                color: isLive ? G : C, letterSpacing:"0.12em",
                animation:"badge-glow 3s ease-in-out infinite",
              }}>
                {isLive ? "LIVE" : "SIM"}
              </div>
            </div>
            {/* AI heartbeat pulse */}
            <div style={{ position:"relative", width:14, height:14, flexShrink:0 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:G, margin:"3px",
                boxShadow:`0 0 8px ${G}`, animation:"dot-pulse 2s ease-in-out infinite" }}/>
              <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                border:`1px solid ${G}30`, animation:"ring-out 2.5s ease-out infinite" }}/>
            </div>
          </div>
        </div>

        {/* ── Brand header ────────────────────────────────────────────────────── */}
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

          {/* ── PORTFOLIO EQUITY — visual centrepiece ────────────────────────── */}
          <div style={{
            position:"relative", overflow:"hidden", borderRadius:18,
            marginBottom:12, padding:"22px 22px 18px",
            background:"linear-gradient(145deg, rgba(10,11,22,0.99) 0%, rgba(8,9,18,0.97) 100%)",
            border:`1px solid rgba(0,229,255,0.20)`,
            boxShadow:[
              "0 0 0 1px rgba(0,229,255,0.07)",
              "0 12px 40px rgba(0,0,0,0.6)",
              `0 0 80px rgba(0,229,255,0.06)`,
              `inset 0 1px 0 rgba(255,255,255,0.05)`,
              `inset 0 0 40px rgba(0,229,255,0.02)`,
            ].join(", "),
            backdropFilter:"blur(24px)",
            animation:"card-glow 6s ease-in-out infinite",
          }}>

            {/* Holographic shimmer layer */}
            <div aria-hidden style={{
              position:"absolute", inset:0, borderRadius:18,
              background:`linear-gradient(105deg,
                transparent 0%, transparent 28%,
                rgba(0,229,255,0.025) 30%, rgba(0,229,255,0.025) 34%,
                transparent 36%, transparent 62%,
                rgba(155,92,245,0.018) 64%, rgba(155,92,245,0.018) 68%,
                transparent 70%)`,
              backgroundSize:"200% 200%",
              animation:"holo-shift 8s ease-in-out infinite",
              pointerEvents:"none",
            }}/>

            {/* Top edge laser glow */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent 0%, ${C}60 40%, ${G}45 60%, transparent 100%)`,
              animation:"edge-sweep 4.5s ease-in-out infinite",
            }}/>

            {/* Bottom wave (subtle scrolling) */}
            <div aria-hidden style={{
              position:"absolute", bottom:0, left:0, right:0,
              height:50, overflow:"hidden", opacity:0.07, pointerEvents:"none",
            }}>
              <svg viewBox="0 0 800 50" width="200%" height="50" preserveAspectRatio="none"
                style={{ animation:"wave-scroll 8s linear infinite" }}>
                <path d="M0,25 C80,10 160,40 240,25 C320,10 400,40 480,25 C560,10 640,40 720,25 C800,10 880,40 960,25 C1040,10 1120,40 1200,25 C1280,10 1360,40 1440,25 L1440,50 L0,50Z"
                  fill={G}/>
              </svg>
            </div>

            {/* Corner glow */}
            <div aria-hidden style={{
              position:"absolute", top:-60, right:-30, width:220, height:220,
              background:`radial-gradient(ellipse, ${C}07 0%, transparent 70%)`,
              animation:"glow-breathe 5s ease-in-out infinite",
              pointerEvents:"none",
            }}/>

            {/* Scanning band */}
            <div aria-hidden style={{
              position:"absolute", left:0, right:0, height:80, opacity:0.4,
              background:`linear-gradient(180deg, transparent, ${C}04, transparent)`,
              animation:"scan-card 7s linear infinite",
              pointerEvents:"none",
            }}/>

            {/* Floating telemetry particles */}
            {[
              { top:"15%", left:"7%",  sz:2,   dur:"5.5s", del:"0s"   },
              { top:"60%", left:"83%", sz:1.5, dur:"6.5s", del:"2s"   },
              { top:"35%", left:"91%", sz:2,   dur:"4.5s", del:"1s"   },
              { top:"78%", left:"15%", sz:1,   dur:"7s",   del:"3.5s" },
            ].map((p,i) => (
              <div aria-hidden key={i} style={{
                position:"absolute", width:p.sz, height:p.sz,
                borderRadius:"50%", background:C,
                top:p.top, left:p.left, opacity:0,
                boxShadow:`0 0 4px ${C}`, pointerEvents:"none",
                animation:`float-part ${p.dur} ${p.del} ease-in-out infinite`,
              }}/>
            ))}

            {/* ── CONTENT ───────────────────────────────────────────────────── */}
            <div style={{ position:"relative", zIndex:1 }}>
              <div style={{
                fontSize:8, fontFamily:"monospace", color:GR,
                letterSpacing:"0.22em", marginBottom:12, fontWeight:600,
              }}>
                PORTFOLIO EQUITY
              </div>

              {/* THE BIG NUMBER */}
              <div style={{
                fontSize:46, fontWeight:900, color:W, fontFamily:"monospace",
                letterSpacing:"-0.03em", lineHeight:1,
                textShadow:`0 0 30px rgba(255,255,255,0.15), 0 0 60px ${C}10`,
                animation:"num-pop 0.6s ease-out both",
              }}>
                {fmt(tv)}
              </div>

              {/* Unrealized P&L */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, flexWrap:"wrap" }}>
                <span style={{
                  fontSize:13, fontFamily:"monospace", fontWeight:700,
                  color: pnl >= 0 ? G : R,
                  textShadow: pnl >= 0 ? `0 0 12px ${G}50` : `0 0 12px ${R}50`,
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
                marginTop:18, borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:14,
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

              {/* Paper trading badge */}
              {!isLive && (
                <div style={{
                  marginTop:14, padding:"7px 12px", borderRadius:7,
                  background:`${G}07`, border:`1px solid ${G}18`,
                  fontSize:8, fontFamily:"monospace", color:G, letterSpacing:"0.08em",
                  display:"flex", alignItems:"center", gap:8,
                }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:G,
                    boxShadow:`0 0 6px ${G}`, animation:"dot-pulse 2s ease-in-out infinite", flexShrink:0 }}/>
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
                background:"linear-gradient(160deg, #0d0e1a 0%, #0a0b16 100%)",
                border:`1px solid rgba(255,255,255,0.07)`,
                borderRadius:13, padding:"15px 10px", textAlign:"center",
                boxShadow:`0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`,
                animation:`card-in 0.4s ${(i*0.08).toFixed(2)}s ease-out both`,
              }}>
                <div style={{
                  position:"absolute", inset:0,
                  background:`radial-gradient(ellipse at 50% -10%, ${color}09 0%, transparent 65%)`,
                }}/>
                <div style={{
                  position:"absolute", bottom:0, left:0, right:0, height:1,
                  background:`linear-gradient(90deg, transparent, ${color}20, transparent)`,
                }}/>
                <div style={{
                  fontSize:28, fontWeight:900, color, fontFamily:"monospace",
                  lineHeight:1, marginBottom:4, position:"relative",
                  textShadow:`0 0 24px ${color}50`,
                  animation:`stat-glow 4s ease-in-out ${i*1.3}s infinite`,
                }}>
                  {val}
                </div>
                <div style={{ fontSize:7, fontFamily:"monospace", color:DIM, letterSpacing:"0.14em", position:"relative" }}>
                  {label}
                </div>
                <div style={{ fontSize:7, fontFamily:"monospace", color:`${color}55`, marginTop:2, position:"relative" }}>
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
              background:"linear-gradient(140deg, #0b0c1b 0%, #0e0f20 100%)",
              borderRadius:14, padding:"16px 16px",
              border:`1px solid ${P}28`,
              boxShadow:`0 0 40px ${P}07, inset 0 1px 0 rgba(255,255,255,0.03)`,
            }}>
              <div aria-hidden style={{
                position:"absolute", bottom:-30, right:-30, width:160, height:160,
                background:`radial-gradient(circle, ${P}12 0%, transparent 70%)`,
                animation:"glow-breathe 6s ease-in-out 1s infinite",
              }}/>
              <div aria-hidden style={{
                position:"absolute", top:-20, left:-20, width:120, height:120,
                background:`radial-gradient(circle, ${G}06 0%, transparent 70%)`,
              }}/>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", position:"relative" }}>
                <div>
                  {/* Running indicator */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ position:"relative", flexShrink:0, width:16, height:16 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:G,
                        margin:3, boxShadow:`0 0 12px ${G}` }}/>
                      <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                        border:`1px solid ${G}45`, animation:"ring-out 2s ease-out infinite" }}/>
                      <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                        border:`1px solid ${G}20`, animation:"ring-out 2s ease-out 0.6s infinite" }}/>
                    </div>
                    <span style={{
                      fontSize:14, fontFamily:"monospace", fontWeight:900, color:G,
                      letterSpacing:"0.08em", textShadow:`0 0 20px ${G}90`,
                    }}>
                      {engine?.running ? "RUNNING" : "STOPPED"}
                    </span>
                  </div>

                  <div style={{ fontSize:9, fontFamily:"monospace", color:DIM, lineHeight:1.9, marginBottom:10 }}>
                    BTCUSD · {engine?.signalsGenerated ?? 0} signals generated<br/>
                    ETHUSD · SOLUSD — monitoring
                  </div>

                  <AIWave color={G}/>
                </div>

                <div style={{ textAlign:"right" }}>
                  <div style={{
                    fontSize:13, fontFamily:"monospace", fontWeight:900, color:C,
                    letterSpacing:"0.1em", marginBottom:8,
                    textShadow:`0 0 14px ${C}70`,
                  }}>
                    {exchange}
                  </div>
                  <div style={{
                    padding:"2px 8px", borderRadius:4,
                    background:`${O}14`, border:`1px solid ${O}40`,
                    fontSize:8, fontFamily:"monospace", fontWeight:800,
                    color:O, letterSpacing:"0.1em", marginBottom:8,
                  }}>
                    VOL FILTER
                  </div>
                  <div style={{ fontSize:7, fontFamily:"monospace", color:DIM,
                    animation:"scan-text 2s ease-in-out infinite" }}>
                    SCANNING...
                  </div>
                </div>
              </div>

              <div style={{ marginTop:12, borderTop:"1px solid rgba(255,255,255,0.04)", paddingTop:10 }}>
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
              background:"linear-gradient(145deg, #0d0e1a 0%, #0b0c18 100%)",
              border:"1px solid rgba(255,255,255,0.06)",
              borderRadius:14, overflow:"hidden",
              boxShadow:"0 4px 20px rgba(0,0,0,0.4)",
            }}>
              {MARKETS.map(({ sym, price, action, trend }, i) => {
                const ac = AC[action] ?? W;
                return (
                  <div key={sym} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"14px 16px",
                    borderBottom: i<2 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    position:"relative", overflow:"hidden",
                    animation:`card-in 0.35s ${(i*0.07).toFixed(2)}s ease-out both`,
                  }}>
                    <div aria-hidden style={{
                      position:"absolute", inset:0,
                      background:`radial-gradient(ellipse at 0% 50%, ${ac}04 0%, transparent 55%)`,
                    }}/>
                    <div style={{ width:2.5, height:38, background:ac, borderRadius:2, flexShrink:0,
                      boxShadow:`0 0 8px ${ac}50`, animation:`bar-glow-${i} 3s ease-in-out ${i*0.8}s infinite` }}/>
                    <div style={{ flex:"0 0 80px" }}>
                      <div style={{ fontSize:9, fontFamily:"monospace", color:GR, letterSpacing:"0.1em", marginBottom:3 }}>{sym}</div>
                      <div style={{ fontSize:15, fontFamily:"monospace", fontWeight:800, color:W }}>{price}</div>
                    </div>
                    <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
                      <Sparkline seed={sym+"mkt"} trend={trend} w={80} h={30}/>
                    </div>
                    <div>
                      <div style={{
                        padding:"4px 13px", background:ac+"18",
                        border:`1px solid ${ac}45`, borderRadius:5,
                        fontSize:9, fontFamily:"monospace", fontWeight:800,
                        color:ac, letterSpacing:"0.1em",
                        boxShadow:`0 0 12px ${ac}25`,
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
              background:"linear-gradient(160deg, #0d0e1a 0%, #0a0b16 100%)",
              border:"1px solid rgba(255,255,255,0.06)",
              borderRadius:14, overflow:"hidden",
            }}>
              {/* Live feed header */}
              <div style={{
                padding:"8px 16px",
                background:`${G}06`, borderBottom:"1px solid rgba(255,255,255,0.04)",
                display:"flex", alignItems:"center", gap:8,
              }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:G,
                  boxShadow:`0 0 6px ${G}`, animation:"dot-pulse 1.5s ease-in-out infinite" }}/>
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
                    background: isTop ? `${color}03` : "transparent",
                    animation:`card-in 0.3s ${(i*0.06).toFixed(2)}s ease-out both`,
                  }}>
                    {isTop && (
                      <div aria-hidden style={{
                        position:"absolute", inset:0,
                        background:`radial-gradient(ellipse at 20% 50%, ${color}05, transparent 60%)`,
                        animation:"row-scan 4s ease-in-out infinite",
                      }}/>
                    )}
                    {/* Action bar */}
                    <div style={{
                      width:3, background:color, flexShrink:0,
                      boxShadow: isTop ? `0 0 10px ${color}` : "none",
                    }}/>
                    {/* Symbol */}
                    <div style={{ flex:"0 0 76px", padding:"12px 10px 12px 12px" }}>
                      <div style={{
                        fontSize:13, fontFamily:"monospace", fontWeight:900, color:W,
                        textShadow: isTop ? `0 0 12px ${color}50` : "none",
                      }}>
                        {sym.replace("USD","")}
                      </div>
                      <div style={{ fontSize:7, fontFamily:"monospace", color:DIM, marginTop:3 }}>{ageT}</div>
                    </div>
                    {/* Reason + bar */}
                    <div style={{ flex:1, padding:"12px 8px" }}>
                      <div style={{ fontSize:9, fontFamily:"monospace", color:GR, marginBottom:7 }}>
                        EMA+RSI confluence
                      </div>
                      <ConfBar value={conf} color={color} delay={`${i*0.1}s`}/>
                    </div>
                    {/* Confidence % */}
                    <div style={{ padding:"12px 14px 12px 4px", textAlign:"right" }}>
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

          {/* ── Go Live CTA — premium institutional ─────────────────────────── */}
          <div style={{
            position:"relative", overflow:"hidden",
            background:"linear-gradient(145deg, #09091e 0%, #0c0d22 50%, #090916 100%)",
            border:`1px solid rgba(155,92,245,0.25)`,
            borderRadius:18, padding:"22px 20px",
            boxShadow:[
              `0 0 0 1px ${P}10`,
              `0 12px 40px rgba(0,0,0,0.5)`,
              `0 0 60px ${P}07`,
              `inset 0 1px 0 rgba(255,255,255,0.04)`,
            ].join(", "),
          }}>
            {/* Background depth */}
            <div aria-hidden style={{
              position:"absolute", top:-60, right:-40, width:240, height:240,
              background:`radial-gradient(ellipse, ${C}07 0%, transparent 65%)`,
              animation:"glow-breathe 7s ease-in-out 2s infinite",
            }}/>
            <div aria-hidden style={{
              position:"absolute", bottom:-40, left:-40, width:200, height:200,
              background:`radial-gradient(ellipse, ${P}08 0%, transparent 65%)`,
              animation:"glow-breathe 9s ease-in-out infinite",
            }}/>

            {/* Top laser edge */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent, ${P}60, ${C}50, transparent)`,
              animation:"edge-sweep 5s ease-in-out infinite",
            }}/>

            <div style={{ position:"relative" }}>
              {/* Header */}
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                <div style={{
                  width:40, height:40, borderRadius:10, flexShrink:0,
                  background:`linear-gradient(135deg, ${P}25, ${C}18)`,
                  border:`1px solid ${P}40`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:18,
                  boxShadow:`0 0 20px ${P}20`,
                }}>⚡</div>
                <div>
                  <div style={{ fontSize:14, fontFamily:"monospace", fontWeight:900, color:W,
                    letterSpacing:"0.02em", textShadow:`0 0 20px rgba(255,255,255,0.15)` }}>
                    ACTIVATE LIVE AI TRADING
                  </div>
                  <div style={{ fontSize:8, fontFamily:"monospace", color:GR, marginTop:3 }}>
                    Real funds · AI-managed · Fully transparent
                  </div>
                </div>
              </div>

              {/* Fee model — clean institutional layout */}
              <div style={{
                background:"rgba(0,0,0,0.35)", borderRadius:11,
                padding:"14px 16px", marginBottom:14,
                border:"1px solid rgba(255,255,255,0.04)",
              }}>
                <div style={{ fontSize:7, fontFamily:"monospace", color:DIM,
                  letterSpacing:"0.18em", marginBottom:10 }}>TRANSPARENT FEE STRUCTURE</div>
                {[
                  { icon:"◈", text:"$5.99 / month platform fee",         color:C },
                  { icon:"◈", text:"2% on profitable CLOSED trades only",  color:C },
                  { icon:"◉", text:"Zero fee on losing trades — ever",    color:G },
                  { icon:"◉", text:"Paper trading remains free forever",   color:G },
                  { icon:"◉", text:"Cancel anytime — no lock-in",         color:G },
                ].map(({ icon, text, color }, idx, arr) => (
                  <div key={text} style={{
                    display:"flex", gap:10, alignItems:"flex-start",
                    marginBottom: idx < arr.length-1 ? 9 : 0,
                  }}>
                    <span style={{ fontSize:9, color, flexShrink:0, marginTop:1, lineHeight:1.5 }}>{icon}</span>
                    <span style={{ fontSize:11, fontFamily:"monospace", color: color===G ? GR+"cc" : GR,
                      lineHeight:1.6, fontWeight: color===G ? 400 : 500 }}>{text}</span>
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
                      background:`${C}09`, border:`1px solid ${C}22`, borderRadius:20,
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

              {/* CTA button */}
              <button onClick={()=>setLocation("/subscribe")} style={{
                width:"100%", padding:"15px 0",
                background:`linear-gradient(90deg, ${P}28, ${C}20, ${P}28)`,
                backgroundSize:"200% 100%",
                border:`1px solid ${C}45`, borderRadius:12,
                color:C, fontFamily:"monospace", fontSize:12,
                fontWeight:900, letterSpacing:"0.12em", cursor:"pointer",
                boxShadow:`0 0 24px ${C}12, inset 0 1px 0 rgba(255,255,255,0.06)`,
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

      {/* ── Keyframes ─────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes glow-breathe  { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.18)} }
        @keyframes dot-pulse     { 0%,100%{box-shadow:0 0 6px ${G};transform:scale(1)} 50%{box-shadow:0 0 16px ${G};transform:scale(1.25)} }
        @keyframes badge-glow    { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 14px ${C}25} }
        @keyframes title-glow    { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.18)} }
        @keyframes card-glow     {
          0%,100%{box-shadow:0 0 0 1px rgba(0,229,255,.07),0 12px 40px rgba(0,0,0,.6),0 0 80px rgba(0,229,255,.05)}
          50%    {box-shadow:0 0 0 1px rgba(0,229,255,.14),0 12px 40px rgba(0,0,0,.6),0 0 100px rgba(0,229,255,.09)}
        }
        @keyframes edge-sweep    { 0%{opacity:.3;transform:scaleX(.5) translateX(-40%)} 50%{opacity:1;transform:scaleX(1) translateX(0)} 100%{opacity:.3;transform:scaleX(.5) translateX(40%)} }
        @keyframes holo-shift    { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes wave-scroll   { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes scan-card     { 0%{top:-80px;opacity:0} 15%{opacity:1} 85%{opacity:.6} 100%{top:250px;opacity:0} }
        @keyframes float-part    { 0%{opacity:0;transform:translateY(0) scale(1)} 30%{opacity:.9;transform:translateY(-12px) scale(1.3)} 70%{opacity:.5;transform:translateY(-20px) scale(.9)} 100%{opacity:0;transform:translateY(0) scale(1)} }
        @keyframes ring-out      { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(3);opacity:0} }
        @keyframes wave-bar      { from{transform:scaleY(.3);opacity:.45} to{transform:scaleY(1);opacity:.9} }
        @keyframes scan-text     { 0%,100%{opacity:.35} 50%{opacity:1} }
        @keyframes bar-in        { from{width:0%;opacity:0} to{opacity:1} }
        @keyframes pnl-pulse     { 0%,100%{opacity:1} 50%{opacity:.7} }
        @keyframes card-in       { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes num-pop       { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
        @keyframes row-scan      { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes stat-glow     { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.2)} }
        @keyframes cta-glow      { 0%,100%{box-shadow:0 0 24px ${C}12,inset 0 1px 0 rgba(255,255,255,.06)} 50%{box-shadow:0 0 40px ${C}25,inset 0 1px 0 rgba(255,255,255,.08)} }
        @keyframes ticker-scroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
      `}</style>
    </div>
  );
}
