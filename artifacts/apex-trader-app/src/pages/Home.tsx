import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import apexLogo from "@assets/Apex_AI_Logo_300x68_1778889006762.png";
import {
  api,
  type MobileStatus, type Portfolio, type SimAccount,
  type SignalBreakdown, type Subscription,
} from "@/lib/api";

// ── Typography ─────────────────────────────────────────────────────────────────
// SANS for all labels, text, buttons, badges — premium fintech feel
// MONO only for raw financial numbers: prices, percentages, amounts
const SANS = "Inter, 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', Consolas, monospace";

// ── Color tokens ───────────────────────────────────────────────────────────────
const C    = "#00e5ff";
const G    = "#00ff88";
const P    = "#9b5cf5";
const O    = "#ff9400";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#3a3f5c";
const GOLD = "#ffd200";

// ── Surface tokens ─────────────────────────────────────────────────────────────
const BG   = "#000000";                       // pure OLED void
const CARD = "#0d151e";                       // mandatory card fill
const E    = "rgba(255,255,255,0.07)";        // neutral card hairline — no color tint
const ESUB = "rgba(255,255,255,0.04)";        // inner dividers

// ── Smooth bezier sparkline ────────────────────────────────────────────────────
function genPts(seed: string, trend: "up"|"down"|"flat") {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) { s = (((s<<5)+s)^seed.charCodeAt(i))>>>0; }
  const rand = () => { s^=s<<13; s^=s>>17; s^=s<<5; return (s>>>0)/0x100000000; };
  const dir = trend==="up" ? 1.4 : trend==="down" ? -1.4 : 0.1;
  const pts: number[] = []; let v = 50;
  for (let i = 0; i < 22; i++) { v = Math.max(8,Math.min(92,v+(rand()-0.5)*9+dir)); pts.push(v); }
  return pts;
}
function Sparkline({ seed, trend, w=78, h=28, animDelay="0s" }: {
  seed:string; trend:"up"|"down"|"flat"; w?:number; h?:number; animDelay?:string;
}) {
  const col = trend==="up" ? G : trend==="down" ? R : C;
  const raw = genPts(seed, trend);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn||1;
  const pts = raw.map((p,i) => ({ x:(i/(raw.length-1))*w, y:h-2-((p-mn)/rng)*(h-5) }));
  const t = 0.35;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length-1; i++) {
    const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
    const cp1x=p1.x+(p2.x-p0.x)*t, cp1y=p1.y+(p2.y-p0.y)*t;
    const cp2x=p2.x-(p3.x-p1.x)*t, cp2y=p2.y-(p3.y-p1.y)*t;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow:"visible", animation:`chart-drift 14s ease-in-out ${animDelay} infinite` }}>
      <path d={d} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── AI waveform ────────────────────────────────────────────────────────────────
function AIWave({ color=G, bars=12 }: { color?:string; bars?:number }) {
  const H = [4,8,14,10,6,18,22,13,8,17,11,6];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:2, height:22 }}>
      {H.slice(0,bars).map((h,i) => (
        <div key={i} style={{
          width:2, height:h, borderRadius:1, background:color, opacity:0.6,
          animation:`wave-bar 2s ease-in-out ${(i*0.1).toFixed(2)}s infinite alternate`,
        }}/>
      ))}
    </div>
  );
}

// ── Confidence bar ─────────────────────────────────────────────────────────────
function ConfBar({ value, color, delay="0s" }: { value:number; color:string; delay?:string }) {
  return (
    <div style={{ height:2, background:"rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden" }}>
      <div style={{
        height:"100%", background:color, borderRadius:2, width:`${value}%`,
        animation:`bar-in 0.7s ${delay} ease-out both, bar-breathe 5s ${delay} ease-in-out 0.7s infinite`,
      }}/>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SH({ label, right, color=P }: { label:string; right?:string; color?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
      <div style={{ width:2, height:11, background:color, borderRadius:1, flexShrink:0, opacity:0.8 }}/>
      <span style={{ fontSize:10, fontFamily:SANS, fontWeight:600, color:GR,
        letterSpacing:"0.12em", textTransform:"uppercase" as const }}>
        {label}
      </span>
      {right && <span style={{ marginLeft:"auto", fontSize:9, fontFamily:SANS, color:DIM }}>{right}</span>}
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
  if (p.includes("live"))    return "Live AI";
  if (p.includes("pro"))     return "Pro";
  if (p.includes("starter")) return "Starter";
  return "Free";
}

const MKTS = [
  { sym:"BTC", price:"$68,120", action:"BUY",  trend:"up"   as const },
  { sym:"ETH", price:"$3,512",  action:"BUY",  trend:"up"   as const },
  { sym:"SOL", price:"$188",    action:"HOLD", trend:"flat" as const },
];
const AC: Record<string,string> = { BUY:G, SELL:R, HOLD:C };

// ── Minimal ticker ─────────────────────────────────────────────────────────────
function Ticker({ items }: { items:string[] }) {
  const t = items.join("   ·   ") + "   ·   " + items.join("   ·   ");
  return (
    <div style={{ overflow:"hidden", height:16, background:BG, borderBottom:`1px solid ${ESUB}` }}>
      <div style={{
        display:"inline-flex", whiteSpace:"nowrap", paddingLeft:"100%",
        animation:"ticker-scroll 34s linear infinite",
        fontSize:7, fontFamily:MONO, color:DIM, letterSpacing:"0.08em", lineHeight:"16px",
      }}>
        {t}
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useUser();

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

      {/* ── Identity strip ──────────────────────────────────────────────────── */}
      <div style={{
        display:"flex", alignItems:"center", gap:12, padding:"11px 14px 10px",
        borderBottom:`1px solid ${ESUB}`,
      }}>
        {/* Avatar — neutral border, no cyan glow */}
        <div onClick={()=>setLocation("/profile")} style={{
          width:38, height:38, borderRadius:"50%", flexShrink:0, cursor:"pointer",
          background:CARD, border:`1px solid ${E}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:13, fontFamily:SANS, fontWeight:600, color:GR,
          position:"relative",
        }}>
          {initials.toUpperCase()}
          <div style={{ position:"absolute", bottom:1, right:1, width:9, height:9,
            borderRadius:"50%", background:G, border:`2px solid ${BG}`,
          }}/>
        </div>

        {/* Name + plan */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontFamily:SANS, fontWeight:600, color:W, letterSpacing:"-0.01em",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {name}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
            <span style={{
              padding:"1px 7px", borderRadius:3,
              background:`${pColor}12`, border:`1px solid ${pColor}30`,
              fontSize:8, fontFamily:SANS, fontWeight:600,
              color:pColor, letterSpacing:"0.08em",
            }}>
              {pLabel}
            </span>
            <span style={{ fontSize:8, fontFamily:SANS, color:DIM }}>{exchange}</span>
          </div>
        </div>

        {/* Mode badge + heartbeat */}
        <div style={{ display:"flex", alignItems:"center", gap:9, flexShrink:0 }}>
          <div style={{
            padding:"3px 10px", borderRadius:3,
            border:`1px solid ${E}`,
            background: isLive ? "#001508" : "#00101a",
            fontSize:8, fontFamily:SANS, fontWeight:600,
            color: isLive ? G : C, letterSpacing:"0.06em",
          }}>
            {isLive ? "Live" : "Simulation"}
          </div>
          {/* Heartbeat — double ring */}
          <div style={{ position:"relative", width:18, height:18, flexShrink:0 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:G, margin:"5px",
              animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%",
              border:`1px solid rgba(0,255,136,0.30)`, animation:"ring-out 3s ease-out infinite" }}/>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%",
              border:`1px solid rgba(0,255,136,0.12)`, animation:"ring-out 3s ease-out 0.9s infinite" }}/>
          </div>
        </div>
      </div>

      {/* ── Logo header ─────────────────────────────────────────────────────── */}
      <div style={{ padding:"13px 16px 11px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          {/* New 300×68 logo — crisp, no heavy glow */}
          <img src={apexLogo} alt="Apex AI Trader"
            style={{ height:42, width:"auto", objectFit:"contain", imageRendering:"crisp-edges" }}/>

          {/* Live/Sim indicator pill */}
          <div style={{
            padding:"4px 11px", borderRadius:6, border:`1px solid ${E}`,
            background: isLive ? "#001508" : "#00101a",
            display:"flex", alignItems:"center", gap:6,
          }}>
            <div style={{ width:5, height:5, borderRadius:"50%",
              background: isLive ? G : C, flexShrink:0,
              animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
            <span style={{ fontSize:8, fontFamily:SANS, fontWeight:500,
              color: isLive ? G : C, letterSpacing:"0.06em" }}>
              {isLive ? "Live" : "Simulation"}
            </span>
          </div>
        </div>
        {/* Status subtitle */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8 }}>
          <div style={{ width:4, height:4, borderRadius:"50%", background:G, flexShrink:0,
            animation:"dot-pulse 2.5s ease-in-out 0.4s infinite" }}/>
          <span style={{ fontSize:10, fontFamily:SANS, fontWeight:400, color:DIM }}>
            AI Engine Active · {isLive ? "Live Mode" : "Simulation Mode"} · {exchange}
          </span>
        </div>
      </div>

      <div style={{ padding:"0 12px" }}>

        {/* ── Portfolio Equity — hero card ──────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden", borderRadius:16,
          marginBottom:10, padding:"20px 20px 18px",
          background:CARD,
          border:`1px solid ${E}`,              // neutral white hairline — no color bleed
          boxShadow:`0 16px 48px rgba(0,0,0,0.95)`,
        }}>
          {/* Precision top laser — only meaningful glow on this card */}
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1,
            background:`linear-gradient(90deg, transparent 8%, ${C}80 38%, ${G}55 56%, ${C}75 72%, transparent 92%)`,
            animation:"edge-sweep 7s ease-in-out infinite",
          }}/>
          {/* Micro wave at bottom — opacity 0.04 — barely a hint */}
          <div aria-hidden style={{
            position:"absolute", bottom:0, left:0, right:0, height:24,
            overflow:"hidden", opacity:0.04, pointerEvents:"none",
          }}>
            <svg viewBox="0 0 800 24" width="200%" height="24" preserveAspectRatio="none"
              style={{ animation:"wave-scroll 12s linear infinite" }}>
              <path d="M0,12 C80,3 160,21 240,12 C320,3 400,21 480,12 C560,3 640,21 720,12 C800,3 880,21 960,12 L960,24 L0,24Z" fill={G}/>
            </svg>
          </div>

          <div style={{ position:"relative" }}>
            <div style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:DIM,
              letterSpacing:"0.18em", textTransform:"uppercase" as const, marginBottom:10 }}>
              Portfolio Equity
            </div>

            {/* Big number — MONO for financial figure */}
            <div style={{
              fontSize:48, fontWeight:900, color:W, fontFamily:MONO,
              letterSpacing:"-0.03em", lineHeight:1,
              animation:"num-pop 0.5s ease-out both",
            }}>
              {fmt(tv)}
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:13, fontFamily:MONO, fontWeight:600, color: pnl>=0 ? G : R }}>
                {pnl>=0?"+":""}{pnl.toFixed(2)} unrealized
              </span>
              <span style={{ fontSize:9, color:DIM }}>·</span>
              <span style={{ fontSize:12, fontFamily:MONO, color:pnlPct>=0?G:R, fontWeight:600 }}>
                {pnlPct>=0?"+":""}{pnlPct.toFixed(2)}%
              </span>
            </div>

            {/* Sub-stats */}
            <div style={{
              display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
              marginTop:16, borderTop:`1px solid ${ESUB}`, paddingTop:13,
            }}>
              {[
                { label:"Cash",      val:fmt(tv*0.855), color:W    },
                { label:"Realized",  val:realized>=0?`+${fmt(realized)}`:fmt(realized), color:G },
                { label:"Fees Paid", val:`$${fees.toFixed(2)}`, color:GOLD },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:8, fontFamily:SANS, color:DIM, letterSpacing:"0.08em", marginBottom:5 }}>
                    {label}
                  </div>
                  <div style={{ fontSize:14, fontFamily:MONO, fontWeight:700, color }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Paper mode notice */}
            {!isLive && (
              <div style={{
                marginTop:12, padding:"6px 10px", borderRadius:6,
                background:"rgba(0,255,136,0.04)", border:`1px solid rgba(0,255,136,0.10)`,
                fontSize:9, fontFamily:SANS, color:G,
                display:"flex", alignItems:"center", gap:8,
              }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:G, flexShrink:0,
                  animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
                Paper trading · No real funds at risk · Always free
              </div>
            )}
          </div>
        </div>

        {/* ── Stats Trio ──────────────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:18 }}>
          {[
            { val:`${winRate}%`, label:"Win Rate",    color:G, sub:"4W · 1L" },
            { val:String(posCount), label:"Positions",color:C, sub:"open"    },
            { val:String(trades),   label:"Trades",   color:W, sub:"all time"},
          ].map(({ val, label, color, sub }, i) => (
            <div key={label} style={{
              position:"relative", overflow:"hidden",
              background:CARD, border:`1px solid ${E}`,
              borderRadius:12, padding:"14px 8px 12px", textAlign:"center",
              boxShadow:`0 8px 28px rgba(0,0,0,0.9)`,
              animation:`card-in 0.4s ${(i*0.08).toFixed(2)}s ease-out both`,
            }}>
              {/* Hairline top accent — very faint color hint */}
              <div aria-hidden style={{
                position:"absolute", top:0, left:"20%", right:"20%", height:1,
                background:`linear-gradient(90deg, transparent, ${color}28, transparent)`,
              }}/>
              <div style={{
                fontSize:28, fontWeight:800, color, fontFamily:MONO, lineHeight:1, marginBottom:4,
                animation:`stat-glow 6s ease-in-out ${i*1.6}s infinite`,
              }}>
                {val}
              </div>
              <div style={{ fontSize:8, fontFamily:SANS, fontWeight:500, color:DIM, letterSpacing:"0.06em" }}>
                {label}
              </div>
              <div style={{ fontSize:7, fontFamily:SANS, color:`${color}40`, marginTop:2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* ── AI Engine Status ─────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SH label="AI Engine Status"/>
          <div style={{
            position:"relative", overflow:"hidden",
            background:CARD, borderRadius:13, padding:"15px 16px",
            border:`1px solid ${E}`,             // neutral — no purple/cyan bleed
            boxShadow:`0 8px 28px rgba(0,0,0,0.9)`,
          }}>
            {/* Hairline top accent only */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent, rgba(155,92,245,0.35), rgba(0,229,255,0.20), transparent)`,
            }}/>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <div style={{ position:"relative", flexShrink:0, width:18, height:18 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:G, margin:"5px" }}/>
                    <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                      border:`1px solid rgba(0,255,136,0.30)`, animation:"ring-out 3s ease-out infinite" }}/>
                    <div style={{ position:"absolute", inset:0, borderRadius:"50%",
                      border:`1px solid rgba(0,255,136,0.12)`, animation:"ring-out 3s ease-out 0.9s infinite" }}/>
                  </div>
                  {/* Status label — SANS, not mono */}
                  <span style={{ fontSize:14, fontFamily:SANS, fontWeight:700, color:G, letterSpacing:"0.02em" }}>
                    {engine?.running ? "Running" : "Stopped"}
                  </span>
                </div>

                <div style={{ fontSize:10, fontFamily:SANS, color:DIM, lineHeight:1.8, marginBottom:10 }}>
                  BTCUSD · {engine?.signalsGenerated??0} signals<br/>
                  ETHUSD · SOLUSD — monitoring
                </div>
                <AIWave color={G}/>
              </div>

              <div style={{ textAlign:"right" }}>
                {/* Exchange name — SANS */}
                <div style={{ fontSize:13, fontFamily:SANS, fontWeight:700, color:W,
                  letterSpacing:"0.04em", marginBottom:8 }}>
                  {exchange}
                </div>
                <div style={{
                  padding:"2px 8px", borderRadius:3,
                  background:"rgba(255,148,0,0.06)", border:`1px solid rgba(255,148,0,0.25)`,
                  fontSize:8, fontFamily:SANS, fontWeight:600,
                  color:O, letterSpacing:"0.08em", marginBottom:8,
                }}>
                  Vol Filter
                </div>
                <div style={{ fontSize:8, fontFamily:SANS, color:DIM,
                  animation:"scan-text 3s ease-in-out infinite" }}>
                  Scanning...
                </div>
              </div>
            </div>

            <div style={{ marginTop:10, borderTop:`1px solid ${ESUB}`, paddingTop:9 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:9, fontFamily:SANS, color:DIM }}>Signal Strength</span>
                <span style={{ fontSize:9, fontFamily:SANS, color:G,
                  animation:"scan-text 3s ease-in-out infinite" }}>Active</span>
              </div>
              <ConfBar value={engine?.running ? 72 : 10} color={G}/>
            </div>
          </div>
        </div>

        {/* ── Live Markets ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SH label="Live Markets" color={C}/>
          <div style={{
            background:CARD, border:`1px solid ${E}`,
            borderRadius:13, overflow:"hidden",
            boxShadow:`0 8px 28px rgba(0,0,0,0.9)`,
          }}>
            {MKTS.map(({ sym, price, action, trend }, i) => {
              const ac = AC[action]??W;
              return (
                <div key={sym} style={{
                  display:"flex", alignItems:"center", gap:10, padding:"13px 14px",
                  borderBottom: i<2 ? `1px solid ${ESUB}` : "none",
                  animation:`card-in 0.3s ${(i*0.07).toFixed(2)}s ease-out both`,
                }}>
                  {/* Accent bar — low opacity */}
                  <div style={{ width:2, height:32, background:ac, borderRadius:1,
                    flexShrink:0, opacity:0.55 }}/>

                  <div style={{ flex:"0 0 78px" }}>
                    {/* Symbol — SANS */}
                    <div style={{ fontSize:11, fontFamily:SANS, fontWeight:600, color:W,
                      letterSpacing:"0.02em", marginBottom:2 }}>
                      {sym}
                    </div>
                    {/* Price — MONO */}
                    <div style={{ fontSize:14, fontFamily:MONO, fontWeight:700, color:GR }}>{price}</div>
                  </div>

                  <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
                    <Sparkline seed={sym+"mkt"} trend={trend} w={82} h={28} animDelay={`${i*4}s`}/>
                  </div>

                  {/* Pill execution control — SANS, compact, restrained */}
                  <div style={{
                    padding:"4px 13px",
                    background:`${ac}0a`,
                    border:`1px solid ${ac}30`,
                    borderRadius:20,
                    fontSize:9, fontFamily:SANS, fontWeight:600,
                    color:ac, letterSpacing:"0.04em",
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
          <SH label="Recent AI Signals" right={`${sigList.length} recent`}/>
          <div style={{
            background:CARD, border:`1px solid ${E}`,
            borderRadius:13, overflow:"hidden",
            boxShadow:`0 8px 28px rgba(0,0,0,0.9)`,
          }}>
            <div style={{
              padding:"7px 14px", borderBottom:`1px solid ${ESUB}`,
              display:"flex", alignItems:"center", gap:8,
            }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:G,
                animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
              <span style={{ fontSize:9, fontFamily:SANS, fontWeight:500, color:G }}>
                Live Signal Feed
              </span>
              <span style={{ marginLeft:"auto", fontSize:8, fontFamily:SANS, color:DIM,
                animation:"scan-text 3s ease-in-out infinite" }}>Scanning</span>
            </div>

            {sigList.length === 0 ? (
              <div style={{ padding:"24px 0", textAlign:"center" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}>
                  <AIWave color={C} bars={9}/>
                </div>
                <div style={{ fontSize:10, fontFamily:SANS, color:DIM }}>Engine warming up...</div>
              </div>
            ) : sigList.map(([sym, bd], i) => {
              const conf  = bd.confidence ?? 0;
              const age   = Math.floor((Date.now()-bd.lastUpdated)/1000);
              const ageT  = age<60 ? `${age}s ago` : `${Math.floor(age/60)}m ago`;
              const color = AC[bd.action]??GR;
              return (
                <div key={sym} style={{
                  display:"flex", alignItems:"stretch",
                  borderBottom: i<sigList.length-1 ? `1px solid ${ESUB}` : "none",
                  animation:`card-in 0.3s ${(i*0.06).toFixed(2)}s ease-out both`,
                }}>
                  <div style={{ width:2.5, background:color, opacity:0.55, flexShrink:0 }}/>
                  {/* Symbol — SANS */}
                  <div style={{ flex:"0 0 70px", padding:"11px 10px 11px 10px" }}>
                    <div style={{ fontSize:13, fontFamily:SANS, fontWeight:700, color:W }}>
                      {sym.replace("USD","")}
                    </div>
                    <div style={{ fontSize:8, fontFamily:SANS, color:DIM, marginTop:3 }}>{ageT}</div>
                  </div>
                  <div style={{ flex:1, padding:"11px 8px" }}>
                    <div style={{ fontSize:10, fontFamily:SANS, color:DIM, marginBottom:7 }}>
                      EMA+RSI confluence
                    </div>
                    <ConfBar value={conf} color={color} delay={`${i*0.1}s`}/>
                  </div>
                  {/* Confidence % — MONO */}
                  <div style={{ padding:"11px 14px 11px 4px", textAlign:"right" }}>
                    <div style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color:GR, marginBottom:3 }}>
                      {conf.toFixed(1)}%
                    </div>
                    <div style={{ fontSize:7, color, opacity:0.55 }}>◉</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Go Live CTA ──────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:CARD,
          border:`1px solid ${E}`,               // neutral — no purple bleed
          borderRadius:16, padding:"20px 18px",
          boxShadow:`0 16px 48px rgba(0,0,0,0.95)`,
        }}>
          {/* Top laser — only color accent allowed */}
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1,
            background:`linear-gradient(90deg, transparent 8%, rgba(155,92,245,0.55) 40%, rgba(0,229,255,0.40) 60%, transparent 92%)`,
            animation:"edge-sweep 7s ease-in-out infinite",
          }}/>

          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <div style={{
                width:40, height:40, borderRadius:10, flexShrink:0,
                background:"rgba(155,92,245,0.08)", border:`1px solid ${E}`,
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
              }}>⚡</div>
              <div>
                <div style={{ fontSize:16, fontFamily:SANS, fontWeight:700, color:W, letterSpacing:"-0.01em" }}>
                  Activate Live AI Trading
                </div>
                <div style={{ fontSize:10, fontFamily:SANS, color:DIM, marginTop:2 }}>
                  Real funds · AI-managed · Fully transparent
                </div>
              </div>
            </div>

            {/* Fee structure */}
            <div style={{
              background:"rgba(0,0,0,0.4)", borderRadius:10, padding:"12px 14px", marginBottom:14,
              border:`1px solid ${ESUB}`,
            }}>
              <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:DIM,
                letterSpacing:"0.14em", textTransform:"uppercase" as const, marginBottom:10 }}>
                Transparent Fee Structure
              </div>
              {[
                { icon:"◈", text:"$5.99 / month platform fee",         color:C },
                { icon:"◈", text:"2% on profitable closed trades only", color:C },
                { icon:"◉", text:"Zero fee on losing trades — ever",    color:G },
                { icon:"◉", text:"Paper trading remains free forever",   color:G },
                { icon:"◉", text:"Cancel anytime — no lock-in",         color:G },
              ].map(({ icon, text, color }, idx, arr) => (
                <div key={text} style={{
                  display:"flex", gap:10, alignItems:"flex-start",
                  marginBottom: idx<arr.length-1 ? 8 : 0,
                }}>
                  <span style={{ fontSize:9, color, flexShrink:0, marginTop:1 }}>{icon}</span>
                  <span style={{ fontSize:11, fontFamily:SANS, fontWeight:400, color:GR, lineHeight:1.6 }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>

            {/* Supported exchanges */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:DIM,
                letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:8 }}>
                Supported Live Exchanges
              </div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const }}>
                {["Kraken","Coinbase","Binance","Crypto.com","Gemini"].map(e => (
                  <span key={e} style={{
                    padding:"3px 10px",
                    background:"rgba(255,255,255,0.03)",
                    border:`1px solid ${E}`,
                    borderRadius:20,
                    fontSize:9, fontFamily:SANS, fontWeight:400, color:DIM,
                  }}>{e}</span>
                ))}
              </div>
            </div>

            {/* CTA button */}
            <button onClick={()=>setLocation("/subscribe")} style={{
              width:"100%", padding:"14px 0",
              background:"rgba(0,229,255,0.06)",
              border:`1px solid rgba(0,229,255,0.25)`,
              borderRadius:10,
              color:C, fontFamily:SANS, fontSize:13,
              fontWeight:700, letterSpacing:"0.03em", cursor:"pointer",
              animation:"cta-glow 5s ease-in-out infinite",
            }}>
              Activate Live AI Trading →
            </button>
            <div style={{ marginTop:8, textAlign:"center" as const,
              fontSize:9, fontFamily:SANS, color:DIM }}>
              Institutional-grade AI · Withdrawal permissions never requested
            </div>
          </div>
        </div>

      </div>

      {/* ── Keyframes — minimal, intelligent ─────────────────────────────────── */}
      <style>{`
        @keyframes dot-pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.55;transform:scale(1.2)} }
        @keyframes ring-out     { 0%{transform:scale(1);opacity:.45} 100%{transform:scale(2.2);opacity:0} }
        @keyframes wave-bar     { from{transform:scaleY(.3);opacity:.2} to{transform:scaleY(1);opacity:.65} }
        @keyframes edge-sweep   { 0%{opacity:.15;transform:scaleX(.3) translateX(-70%)} 50%{opacity:1;transform:scaleX(1) translateX(0)} 100%{opacity:.15;transform:scaleX(.3) translateX(70%)} }
        @keyframes wave-scroll  { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes scan-text    { 0%,100%{opacity:.3} 50%{opacity:.75} }
        @keyframes bar-in       { from{width:0%;opacity:0} to{opacity:1} }
        @keyframes bar-breathe  { 0%,100%{opacity:1} 50%{opacity:.6} }
        @keyframes card-in      { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes num-pop      { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
        @keyframes stat-glow    { 0%,100%{opacity:1} 50%{opacity:.7} }
        @keyframes cta-glow     { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 14px rgba(0,229,255,0.07)} }
        @keyframes ticker-scroll{ from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes chart-drift  { 0%,100%{transform:translateY(0)} 35%{transform:translateY(-.6px)} 70%{transform:translateY(.3px)} }
      `}</style>
    </div>
  );
}
