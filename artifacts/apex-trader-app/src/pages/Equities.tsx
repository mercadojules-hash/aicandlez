import { useState } from "react";
import { useLocation } from "wouter";

// ── Design tokens ────────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const ESUB = "rgba(255,255,255,0.04)";
const C    = "#00e5ff";
const O    = "#ff9400";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#647385";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif";
const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

const SIG_COLOR: Record<string,string>  = { LONG:"rgba(0,230,120,0.92)", SHORT:"rgba(255,51,85,0.90)", HOLD:"rgba(0,229,255,0.78)" };
const SIG_BG: Record<string,string>    = { LONG:"rgba(0,230,120,0.07)", SHORT:"rgba(255,51,85,0.07)", HOLD:"rgba(0,229,255,0.05)" };
const SIG_BORDER: Record<string,string>= { LONG:"rgba(0,230,120,0.26)", SHORT:"rgba(255,51,85,0.26)", HOLD:"rgba(0,229,255,0.20)" };

// ── Seeded sparkline ─────────────────────────────────────────────────────────────
function seededPts(seed: string, action: string): number[] {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s << 5) + s) ^ seed.charCodeAt(i)) >>> 0;
  const rng = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
  const trend = action === "LONG" ? 1.15 : action === "SHORT" ? -1.15 : 0.05;
  const pts: number[] = [];
  let v = 48;
  for (let i = 0; i < 24; i++) {
    v = Math.max(8, Math.min(92, v + (rng() - 0.5) * 11 + trend));
    pts.push(v);
  }
  return pts;
}

function bezierPath(pts: number[], w: number, h: number): string {
  if (pts.length < 2) return "";
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const pad = h * 0.08;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(p => h - pad - ((p - min) / range) * (h - pad * 2));
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = ((xs[i-1] + xs[i]) / 2).toFixed(1);
    d += ` C ${cx} ${ys[i-1].toFixed(1)} ${cx} ${ys[i].toFixed(1)} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  return d;
}

function PremiumSpark({ sym, action, w = 80, h = 30 }: { sym:string; action:string; w?:number; h?:number }) {
  const pts = seededPts(sym, action);
  const d   = bezierPath(pts, w, h);
  const col = SIG_COLOR[action] ?? GR;
  const gid = `espk-${sym.replace(/[^a-z0-9]/gi,"")}`;
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const pad = h * 0.08;
  const endY = h - pad - ((pts[pts.length-1] - min) / range) * (h - pad * 2);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow:"visible", flexShrink:0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={col} stopOpacity="0.20"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
        <filter id={`gf-${gid}`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${gid})`}/>
      <path d={d} fill="none" stroke={col} strokeWidth="3" strokeOpacity="0.12"
        strokeLinecap="round" strokeLinejoin="round"/>
      <path d={d} fill="none" stroke={col} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" filter={`url(#gf-${gid})`}/>
      <circle cx={w} cy={endY} r="4" fill={col} opacity="0.14"/>
      <circle cx={w} cy={endY} r="2.2" fill={col} opacity="0.80"/>
      <circle cx={w} cy={endY} r="1"   fill="white" opacity="0.90"/>
    </svg>
  );
}

// ── Equities mock data ────────────────────────────────────────────────────────────
type EquityMeta = { name:string; price:string; change:string; vol:string; action:string; confidence:number; sector:string };
const EQUITY_ASSETS: Record<string, EquityMeta> = {
  NVDA: { name:"NVIDIA",     price:"$875.30", change:"+1.84%", vol:"$2.15T", action:"LONG",  confidence:91, sector:"Technology" },
  META: { name:"Meta",       price:"$512.80", change:"+2.33%", vol:"$1.30T", action:"LONG",  confidence:86, sector:"Technology" },
  TSLA: { name:"Tesla",      price:"$177.50", change:"+3.21%", vol:"$565B",  action:"LONG",  confidence:82, sector:"EV"         },
  MSFT: { name:"Microsoft",  price:"$414.20", change:"+1.15%", vol:"$3.07T", action:"LONG",  confidence:74, sector:"Technology" },
  AMZN: { name:"Amazon",     price:"$184.60", change:"+0.92%", vol:"$1.93T", action:"LONG",  confidence:69, sector:"Technology" },
  QQQ:  { name:"Nasdaq ETF", price:"$443.20", change:"+0.94%", vol:"ETF",    action:"LONG",  confidence:61, sector:"ETF"        },
  AAPL: { name:"Apple",      price:"$189.40", change:"-0.42%", vol:"$2.90T", action:"HOLD",  confidence:55, sector:"Technology" },
  SPY:  { name:"S&P 500 ETF",price:"$521.40", change:"+0.68%", vol:"ETF",    action:"HOLD",  confidence:52, sector:"ETF"        },
  GOOGL:{ name:"Alphabet",   price:"$173.40", change:"+0.57%", vol:"$2.18T", action:"HOLD",  confidence:48, sector:"Technology" },
  COIN: { name:"Coinbase",   price:"$219.50", change:"-2.88%", vol:"$56B",   action:"SHORT", confidence:71, sector:"Finance"    },
  AMD:  { name:"AMD",        price:"$162.30", change:"-1.45%", vol:"$262B",  action:"SHORT", confidence:65, sector:"Technology" },
  NFLX: { name:"Netflix",    price:"$643.20", change:"+1.89%", vol:"$278B",  action:"LONG",  confidence:67, sector:"Media"      },
  PLTR: { name:"Palantir",   price:"$24.80",  change:"+4.12%", vol:"$54B",   action:"LONG",  confidence:78, sector:"Technology" },
};

const SECTORS = [
  { name:"Technology", chg:"+2.4%", up:true  },
  { name:"Finance",    chg:"+1.1%", up:true  },
  { name:"Consumer",   chg:"+0.5%", up:true  },
  { name:"Industrial", chg:"+0.3%", up:true  },
  { name:"Healthcare", chg:"-0.8%", up:false },
  { name:"Energy",     chg:"-1.2%", up:false },
];

type Filter = "ALL" | "LONG" | "SHORT" | "HIGH_CONF";

// ── Sector heat cell ──────────────────────────────────────────────────────────────
function SectorCell({ name, chg, up }: { name:string; chg:string; up:boolean }) {
  const col = up ? "rgba(0,230,120,0.85)" : "rgba(255,51,85,0.82)";
  const bg  = up ? "rgba(0,230,120,0.06)" : "rgba(255,51,85,0.06)";
  const bd  = up ? "rgba(0,230,120,0.18)" : "rgba(255,51,85,0.18)";
  return (
    <div style={{ background:bg, border:`1px solid ${bd}`, borderRadius:10, padding:"9px 10px" }}>
      <div style={{ fontSize:7, fontFamily:SANS, fontWeight:600, color:GR,
        letterSpacing:"0.08em", textTransform:"uppercase" as const, marginBottom:5 }}>{name}</div>
      <div style={{ fontSize:14, fontFamily:MONO, fontWeight:800, color:col }}>{chg}</div>
    </div>
  );
}

// ── Asset row (identical to Markets.tsx) ─────────────────────────────────────────
function AssetRow({ sym, meta, onClick }: {
  sym: string;
  meta: EquityMeta;
  onClick: () => void;
}) {
  const action  = meta.action;
  const col     = SIG_COLOR[action]    ?? GR;
  const bg      = SIG_BG[action]      ?? "rgba(255,255,255,0.04)";
  const border  = SIG_BORDER[action]  ?? E;
  const chUp    = meta.change.startsWith("+");
  const chCol   = chUp ? "rgba(0,210,100,0.85)" : "rgba(230,70,70,0.82)";
  const conf    = meta.confidence;
  const symHash = sym.split("").reduce((a,c) => a + c.charCodeAt(0), 0);

  return (
    <div onClick={onClick} style={{
      position:"relative", overflow:"hidden",
      background:`linear-gradient(160deg, #0d1a28 0%, #0a1420 100%)`,
      border:`1px solid ${border}`,
      borderRadius:14, cursor:"pointer",
      boxShadow:`0 4px 20px rgba(0,0,0,0.85), 0 0 0 0.5px ${col}06 inset`,
      transition:"transform 0.12s ease, box-shadow 0.12s ease",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 28px rgba(0,0,0,0.90), 0 0 0 0.5px ${col}12 inset`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px rgba(0,0,0,0.85), 0 0 0 0.5px ${col}06 inset`;
      }}>

      {/* Top laser edge */}
      <div aria-hidden style={{
        position:"absolute", top:0, left:0, right:0, height:1.5,
        background:`linear-gradient(90deg, transparent 8%, ${col}55 35%, ${col}45 65%, transparent 92%)`,
        animation:`edge-sweep ${5 + (symHash % 4)}s ease-in-out infinite`,
      }}/>

      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 14px" }}>

        {/* Avatar */}
        <div style={{
          width:38, height:38, borderRadius:10, flexShrink:0,
          background:`linear-gradient(135deg, ${col}20, ${col}08)`,
          border:`1px solid ${col}28`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:11, fontFamily:MONO, fontWeight:800, color:col,
        }}>{sym[0]}</div>

        {/* Symbol + Name + Sector */}
        <div style={{ minWidth:0, flex:"0 0 64px" }}>
          <div style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color:W,
            letterSpacing:"-0.01em" }}>{sym}</div>
          <div style={{ fontSize:8, fontFamily:SANS, color:GR, marginTop:1 }}>{meta.name}</div>
          <div style={{ fontSize:7, fontFamily:SANS, color:DIM, marginTop:1,
            letterSpacing:"0.04em" }}>{meta.sector}</div>
        </div>

        {/* Price + change */}
        <div style={{ flex:"0 0 68px" }}>
          <div style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color:W }}>{meta.price}</div>
          <div style={{ fontSize:9, fontFamily:MONO, fontWeight:600, color:chCol, marginTop:2 }}>
            {meta.change}
          </div>
        </div>

        {/* Sparkline */}
        <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
          <PremiumSpark sym={sym} action={action} w={72} h={28}/>
        </div>

        {/* Confidence + action */}
        <div style={{ flexShrink:0, textAlign:"right" as const, minWidth:54 }}>
          <div style={{
            display:"inline-block", padding:"2px 9px",
            background:bg, border:`1px solid ${border}`,
            borderRadius:4,
            fontSize:8, fontFamily:SANS, fontWeight:700, color:col,
            letterSpacing:"0.07em",
          }}>{action}</div>
          <div style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color:col, marginTop:5 }}>
            {conf}%
          </div>
        </div>

        {/* Chevron */}
        <div style={{ flexShrink:0, opacity:0.35, marginLeft:2 }}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l4 4-4 4" stroke={W} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Confidence strip */}
      <div style={{ height:2, background:"rgba(255,255,255,0.04)" }}>
        <div style={{
          height:"100%", width:`${conf}%`, background:col,
          opacity:0.55, transition:"width 0.5s ease",
          boxShadow:`0 0 4px ${col}55`,
        }}/>
      </div>
    </div>
  );
}

// ── Regime bar ────────────────────────────────────────────────────────────────────
function RegimeBar({ longs, shorts, holds }: { longs:number; shorts:number; holds:number }) {
  const total    = longs + shorts + holds || 1;
  const longPct  = (longs  / total) * 100;
  const holdPct  = (holds  / total) * 100;
  const shortPct = (shorts / total) * 100;
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ display:"flex", height:5, borderRadius:3, overflow:"hidden", gap:1.5 }}>
        <div style={{ width:`${longPct}%`,  background:"rgba(0,230,120,0.75)", borderRadius:"2px 0 0 2px", transition:"width 0.6s" }}/>
        <div style={{ width:`${holdPct}%`,  background:"rgba(0,185,215,0.55)", transition:"width 0.6s" }}/>
        <div style={{ width:`${shortPct}%`, background:"rgba(255,51,85,0.70)", borderRadius:"0 2px 2px 0", transition:"width 0.6s" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
        <span style={{ fontSize:7.5, fontFamily:SANS, color:"rgba(0,230,120,0.75)" }}>LONG {longs}</span>
        <span style={{ fontSize:7.5, fontFamily:SANS, color:"rgba(0,185,215,0.60)" }}>HOLD {holds}</span>
        <span style={{ fontSize:7.5, fontFamily:SANS, color:"rgba(255,51,85,0.75)" }}>SHORT {shorts}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────────
export default function Equities() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [, setLocation] = useLocation();

  const entries  = Object.entries(EQUITY_ASSETS);
  const longs    = entries.filter(([, m]) => m.action === "LONG").length;
  const shorts   = entries.filter(([, m]) => m.action === "SHORT").length;
  const holds    = entries.filter(([, m]) => m.action === "HOLD").length;
  const highConf = entries.filter(([, m]) => m.confidence >= 65).length;
  const regime   = longs > shorts + 2 ? "BULLISH" : shorts > longs + 2 ? "BEARISH" : "MIXED";
  const regCol   = regime === "BULLISH" ? "rgba(0,230,120,0.88)"
                 : regime === "BEARISH" ? "rgba(255,51,85,0.88)"
                 : "rgba(0,185,215,0.78)";

  const strongest = entries.reduce(
    (best, curr) => curr[1].confidence > best[1].confidence ? curr : best,
    entries[0]
  );

  const filtered = entries
    .filter(([, m]) => {
      if (filter === "LONG")      return m.action === "LONG";
      if (filter === "SHORT")     return m.action === "SHORT";
      if (filter === "HIGH_CONF") return m.confidence >= 65;
      return true;
    })
    .sort((a, b) => b[1].confidence - a[1].confidence);

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:28 }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{ padding:"18px 20px 14px",
        display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:W,
            fontFamily:SANS, letterSpacing:"-0.02em" }}>Equities</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
            <div style={{ width:5, height:5, borderRadius:"50%",
              background:"rgba(255,180,0,0.90)", flexShrink:0,
              boxShadow:"0 0 7px rgba(255,180,0,0.70)",
              animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
            <span style={{ fontSize:9, fontFamily:SANS, fontWeight:500, color:GR,
              letterSpacing:"0.12em", textTransform:"uppercase" as const }}>
              AI · {entries.length} Assets · Real-Time
            </span>
          </div>
        </div>
        <div style={{
          padding:"4px 12px", borderRadius:20, marginTop:4,
          display:"flex", alignItems:"center", gap:5,
          background: regime === "BULLISH" ? "rgba(0,210,100,0.07)"
                    : regime === "BEARISH" ? "rgba(230,70,70,0.07)" : "rgba(0,185,215,0.06)",
          border:`1px solid ${regime === "BULLISH" ? "rgba(0,210,100,0.26)"
                              : regime === "BEARISH" ? "rgba(230,70,70,0.26)" : "rgba(0,185,215,0.22)"}`,
        }}>
          <div style={{ width:4, height:4, borderRadius:"50%", background:regCol,
            animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
          <span style={{ fontSize:8, fontFamily:SANS, fontWeight:700, color:regCol,
            letterSpacing:"0.06em" }}>{regime}</span>
        </div>
      </div>

      <div style={{ padding:"0 14px" }}>

        {/* ── Market intelligence ──────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:`linear-gradient(160deg, #0d1824 0%, #09101c 100%)`,
          border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:16, padding:"16px 16px 14px", marginBottom:12,
          boxShadow:"0 8px 32px rgba(0,0,0,0.90)",
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1.5,
            background:`linear-gradient(90deg, transparent 8%, rgba(255,180,0,0.45) 38%, rgba(0,229,255,0.35) 62%, transparent 92%)`,
            animation:"edge-sweep 9s ease-in-out infinite",
          }}/>

          {/* KPI strip */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr",
            borderBottom:"1px solid rgba(255,255,255,0.05)",
            paddingBottom:14, marginBottom:14 }}>
            {([
              { val:longs,    label:"Long",      color:"rgba(0,230,120,0.90)"   },
              { val:shorts,   label:"Short",     color:"rgba(255,51,85,0.88)"   },
              { val:holds,    label:"Hold",      color:"rgba(0,185,215,0.78)"   },
              { val:highConf, label:"High Conf", color:"rgba(255,255,255,0.82)" },
            ] as { val:number; label:string; color:string }[]).map(({ val, label, color }) => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ fontSize:22, fontFamily:SANS, fontWeight:800, color,
                  letterSpacing:"-0.02em" }}>{val}</div>
                <div style={{ fontSize:7.5, fontFamily:SANS, fontWeight:500, color:GR,
                  letterSpacing:"0.10em", marginTop:3, textTransform:"uppercase" as const }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Strongest + regime bar */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:7.5, fontFamily:SANS, fontWeight:500, color:DIM,
                letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:4 }}>
                Strongest Setup
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <span style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color:W }}>
                  {strongest[0]}
                </span>
                <span style={{
                  fontSize:8, fontFamily:SANS, fontWeight:700,
                  color:SIG_COLOR[strongest[1].action],
                  padding:"2px 8px",
                  background:SIG_BG[strongest[1].action],
                  border:`1px solid ${SIG_BORDER[strongest[1].action]}`,
                  borderRadius:4,
                }}>{strongest[1].action}</span>
                <span style={{ fontSize:13, fontFamily:MONO, fontWeight:700,
                  color:SIG_COLOR[strongest[1].action] }}>
                  {strongest[1].confidence}%
                </span>
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:7.5, fontFamily:SANS, color:DIM,
                letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:4 }}>
                AI Sentiment
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:5, justifyContent:"flex-end" }}>
                <div style={{ width:6, height:6, borderRadius:"50%",
                  background:regCol, animation:"dot-pulse 2s ease-in-out 0.8s infinite" }}/>
                <span style={{ fontSize:11, fontFamily:SANS, fontWeight:600, color:regCol }}>
                  {regime === "BULLISH" ? "Risk On" : regime === "BEARISH" ? "Risk Off" : "Neutral"}
                </span>
              </div>
            </div>
          </div>
          <RegimeBar longs={longs} shorts={shorts} holds={holds}/>
        </div>

        {/* ── Sector heat ──────────────────────────────────────────────────── */}
        <div style={{
          background:CARD, border:`1px solid ${E}`,
          borderRadius:14, padding:"14px 14px", marginBottom:12,
        }}>
          <div style={{ fontSize:8, fontFamily:SANS, fontWeight:700, color:"rgba(255,255,255,0.40)",
            letterSpacing:"0.18em", textTransform:"uppercase" as const, marginBottom:12 }}>
            Sector Heat
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {SECTORS.map(s => <SectorCell key={s.name} {...s}/>)}
          </div>
        </div>

        {/* ── Filter tabs ──────────────────────────────────────────────────── */}
        <div style={{ display:"flex", gap:7, marginBottom:12, flexWrap:"wrap" as const }}>
          {([
            ["ALL",       `All (${entries.length})`],
            ["LONG",      `Long (${longs})`],
            ["SHORT",     `Short (${shorts})`],
            ["HIGH_CONF", `High Conf (${highConf})`],
          ] as [Filter, string][]).map(([key, label]) => {
            const active = filter === key;
            return (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding:"6px 14px",
                background: active ? "rgba(0,229,255,0.08)" : "rgba(255,255,255,0.03)",
                border:`1px solid ${active ? "rgba(0,229,255,0.28)" : "rgba(255,255,255,0.10)"}`,
                borderRadius:20, color: active ? C : GR,
                fontFamily:SANS, fontSize:10, fontWeight: active ? 600 : 400,
                letterSpacing:"0.03em", cursor:"pointer", transition:"all 0.15s ease",
              }}>{label}</button>
            );
          })}
        </div>

        {/* ── Asset rows ───────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(([sym, meta]) => (
            <AssetRow key={sym} sym={sym} meta={meta}
              onClick={() => setLocation(`/asset?sym=${sym}&type=equity`)}/>
          ))}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop:16, padding:"11px 14px",
          background:CARD, border:`1px solid ${E}`, borderRadius:8,
          fontSize:8, fontFamily:SANS, color:GR, lineHeight:1.7 }}>
          Tap any stock or ETF to view AI analysis and execution options.
          Paper trading always free · Live AI trading $5.99/mo + 2% performance fee.
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.40;transform:scale(0.80)} }
        @keyframes edge-sweep { 0%{opacity:.10;transform:scaleX(.25) translateX(-80%)} 50%{opacity:1;transform:scaleX(1) translateX(0)} 100%{opacity:.10;transform:scaleX(.25) translateX(80%)} }
        @keyframes page-in    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .page-enter           { animation: page-in 0.35s ease-out both; }
      `}</style>
    </div>
  );
}
