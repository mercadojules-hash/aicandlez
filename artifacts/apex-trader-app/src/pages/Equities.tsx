import { useState } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const G    = "#00ff88";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#647385";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

// ── Signal color system ───────────────────────────────────────────────────────
const SIG_COLOR: Record<string, string>  = {
  LONG:  "rgba(0,230,120,0.92)",
  SHORT: "rgba(255,51,85,0.90)",
  HOLD:  "rgba(0,229,255,0.78)",
};
const SIG_BG: Record<string, string> = {
  LONG:  "rgba(0,230,120,0.07)",
  SHORT: "rgba(255,51,85,0.07)",
  HOLD:  "rgba(0,229,255,0.05)",
};
const SIG_BORDER: Record<string, string> = {
  LONG:  "rgba(0,230,120,0.26)",
  SHORT: "rgba(255,51,85,0.26)",
  HOLD:  "rgba(0,229,255,0.20)",
};

// ── Sparkline ─────────────────────────────────────────────────────────────────
function seededPts(seed: string, action: string): number[] {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s << 5) + s) ^ seed.charCodeAt(i)) >>> 0;
  const rand = () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
  const trend = action === "LONG" ? 1.2 : action === "SHORT" ? -1.2 : 0.05;
  let v = 48;
  const pts: number[] = [];
  for (let i = 0; i < 20; i++) {
    v = Math.max(8, Math.min(92, v + (rand() - 0.5) * 12 + trend));
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
    const cx = ((xs[i - 1] + xs[i]) / 2).toFixed(1);
    d += ` C ${cx} ${ys[i-1].toFixed(1)} ${cx} ${ys[i].toFixed(1)} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  return d;
}

function MiniSpark({ sym, action, w = 68, h = 26 }: { sym: string; action: string; w?: number; h?: number }) {
  const pts = seededPts(sym, action);
  const d   = bezierPath(pts, w, h);
  const col = SIG_COLOR[action] ?? GR;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow: "visible", flexShrink: 0 }}>
      <path d={d} fill="none" stroke={col} strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Mock data ─────────────────────────────────────────────────────────────────
type EquityMeta = {
  name: string; price: string; change: string; mktCap: string;
  action: string; confidence: number; sector: string;
};

const MOCK_EQUITIES: Record<string, EquityMeta> = {
  NVDA: { name:"NVIDIA",    price:"$875.30", change:"+1.84%", mktCap:"$2.15T", action:"LONG",  confidence:91, sector:"Tech"    },
  META: { name:"Meta",      price:"$512.80", change:"+2.33%", mktCap:"$1.30T", action:"LONG",  confidence:86, sector:"Tech"    },
  TSLA: { name:"Tesla",     price:"$177.50", change:"+3.21%", mktCap:"$565B",  action:"LONG",  confidence:82, sector:"EV"      },
  PLTR: { name:"Palantir",  price:"$24.80",  change:"+4.12%", mktCap:"$54B",   action:"LONG",  confidence:78, sector:"Tech"    },
  MSFT: { name:"Microsoft", price:"$414.20", change:"+1.15%", mktCap:"$3.07T", action:"LONG",  confidence:74, sector:"Tech"    },
  AMZN: { name:"Amazon",    price:"$184.60", change:"+0.92%", mktCap:"$1.93T", action:"LONG",  confidence:69, sector:"Tech"    },
  NFLX: { name:"Netflix",   price:"$643.20", change:"+1.89%", mktCap:"$278B",  action:"LONG",  confidence:67, sector:"Media"   },
  QQQ:  { name:"Nasdaq ETF",price:"$443.20", change:"+0.94%", mktCap:"ETF",    action:"LONG",  confidence:61, sector:"ETF"     },
  AAPL: { name:"Apple",     price:"$189.40", change:"-0.42%", mktCap:"$2.90T", action:"HOLD",  confidence:55, sector:"Tech"    },
  SPY:  { name:"S&P 500",   price:"$521.40", change:"+0.68%", mktCap:"ETF",    action:"HOLD",  confidence:52, sector:"ETF"     },
  GOOG: { name:"Alphabet",  price:"$173.40", change:"+0.57%", mktCap:"$2.18T", action:"HOLD",  confidence:48, sector:"Tech"    },
  COIN: { name:"Coinbase",  price:"$219.50", change:"-2.88%", mktCap:"$56B",   action:"SHORT", confidence:71, sector:"Finance" },
  AMD:  { name:"AMD",       price:"$162.30", change:"-1.45%", mktCap:"$262B",  action:"SHORT", confidence:65, sector:"Tech"    },
};

const SECTORS = [
  { name:"Technology", chg:"+2.4%", up:true,  strong:true  },
  { name:"Financial",  chg:"+1.1%", up:true,  strong:false },
  { name:"Consumer",   chg:"+0.5%", up:true,  strong:false },
  { name:"Industrial", chg:"+0.3%", up:true,  strong:false },
  { name:"Healthcare", chg:"-0.8%", up:false, strong:false },
  { name:"Energy",     chg:"-1.2%", up:false, strong:true  },
];

const TOP_SIGNALS = [
  { sym:"NVDA", action:"LONG",  conf:91, reason:"Momentum breakout · AI infrastructure demand surge" },
  { sym:"META", action:"LONG",  conf:86, reason:"Earnings catalyst · AI advertising revenue momentum" },
  { sym:"COIN", action:"SHORT", conf:71, reason:"Bearish RSI divergence · Volume distribution"       },
];

type EqFilter = "ALL" | "LONG" | "SHORT" | "HIGH_CONF";

// ── Sector heat cell ──────────────────────────────────────────────────────────
function SectorCell({ name, chg, up, strong }: { name:string; chg:string; up:boolean; strong:boolean }) {
  const col = up
    ? (strong ? "rgba(0,230,120,0.92)" : "rgba(0,200,100,0.72)")
    : (strong ? "rgba(255,51,85,0.88)" : "rgba(255,100,50,0.72)");
  const bg  = up ? (strong ? "rgba(0,230,120,0.07)" : "rgba(0,200,100,0.04)")
                 : (strong ? "rgba(255,51,85,0.07)"  : "rgba(255,100,50,0.04)");
  const bd  = up ? (strong ? "rgba(0,230,120,0.22)" : "rgba(0,200,100,0.14)")
                 : (strong ? "rgba(255,51,85,0.22)"  : "rgba(255,100,50,0.14)");
  return (
    <div style={{ background:bg, border:`1px solid ${bd}`, borderRadius:8, padding:"9px 10px" }}>
      <div style={{ fontSize:7, fontFamily:SANS, fontWeight:600, color:GR,
        letterSpacing:"0.08em", textTransform:"uppercase" as const, marginBottom:5 }}>
        {name}
      </div>
      <div style={{ fontSize:14, fontFamily:MONO, fontWeight:700, color:col }}>{chg}</div>
    </div>
  );
}

// ── Top signal row ────────────────────────────────────────────────────────────
function TopSignalRow({ sym, action, conf, reason }: {
  sym:string; action:string; conf:number; reason:string;
}) {
  const col   = SIG_COLOR[action] ?? GR;
  const arrow = action === "LONG" ? "↑" : action === "SHORT" ? "↓" : "→";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0",
      borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{
        width:24, height:24, borderRadius:6, flexShrink:0,
        background:SIG_BG[action],
        border:`1px solid ${SIG_BORDER[action]}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:14, color:col, fontWeight:700, fontFamily:MONO,
      }}>
        {arrow}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:2 }}>
          <span style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color:W }}>{sym}</span>
          <span style={{
            padding:"1px 7px",
            background:SIG_BG[action], border:`1px solid ${SIG_BORDER[action]}`,
            borderRadius:3, fontSize:7, fontFamily:SANS, fontWeight:700,
            color:col, letterSpacing:"0.08em",
          }}>{action}</span>
          <span style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color:col, marginLeft:"auto" }}>
            {conf}%
          </span>
        </div>
        <div style={{ fontSize:9, fontFamily:SANS, color:GR, lineHeight:1.5 }}>{reason}</div>
      </div>
    </div>
  );
}

// ── Regime bar ────────────────────────────────────────────────────────────────
function RegimeBar({ longs, shorts, holds }: { longs:number; shorts:number; holds:number }) {
  const total    = longs + shorts + holds || 1;
  const longPct  = (longs  / total) * 100;
  const holdPct  = (holds  / total) * 100;
  const shortPct = (shorts / total) * 100;
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ display:"flex", height:5, borderRadius:3, overflow:"hidden", gap:1.5 }}>
        <div style={{ width:`${longPct}%`,  background:"rgba(0,230,120,0.75)", transition:"width 0.6s" }}/>
        <div style={{ width:`${holdPct}%`,  background:"rgba(0,185,215,0.55)", transition:"width 0.6s" }}/>
        <div style={{ width:`${shortPct}%`, background:"rgba(255,51,85,0.70)", transition:"width 0.6s" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
        <span style={{ fontSize:7, fontFamily:SANS, color:"rgba(0,230,120,0.80)" }}>LONG {longs}</span>
        <span style={{ fontSize:7, fontFamily:SANS, color:"rgba(0,185,215,0.60)" }}>HOLD {holds}</span>
        <span style={{ fontSize:7, fontFamily:SANS, color:"rgba(255,51,85,0.80)" }}>SHORT {shorts}</span>
      </div>
    </div>
  );
}

// ── Equity row ────────────────────────────────────────────────────────────────
function EquityRow({ sym, meta }: { sym:string; meta:EquityMeta }) {
  const col   = SIG_COLOR[meta.action] ?? GR;
  const chUp  = meta.change.startsWith("+");
  const chCol = chUp ? "rgba(0,210,100,0.85)" : "rgba(230,70,70,0.82)";
  return (
    <div style={{ background:CARD, borderRadius:11, overflow:"hidden",
      border:`1px solid ${SIG_BORDER[meta.action] ?? E}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px" }}>
        {/* Ticker + sector */}
        <div style={{ width:58, flexShrink:0 }}>
          <div style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color:W }}>{sym}</div>
          <div style={{ fontSize:7, fontFamily:SANS, color:DIM, marginTop:2 }}>{meta.sector}</div>
        </div>
        {/* Price + change */}
        <div style={{ width:70, flexShrink:0 }}>
          <div style={{ fontSize:11, fontFamily:MONO, fontWeight:600, color:W }}>{meta.price}</div>
          <div style={{ fontSize:9, fontFamily:MONO, fontWeight:500, color:chCol, marginTop:2 }}>
            {meta.change}
          </div>
        </div>
        {/* Sparkline */}
        <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center" }}>
          <MiniSpark sym={sym} action={meta.action}/>
        </div>
        {/* Signal + confidence */}
        <div style={{ flexShrink:0, textAlign:"right" as const, minWidth:58 }}>
          <div style={{ display:"inline-block", padding:"2px 8px",
            background:SIG_BG[meta.action], border:`1px solid ${SIG_BORDER[meta.action]}`,
            borderRadius:4, fontSize:7, fontFamily:SANS, fontWeight:700,
            color:col, letterSpacing:"0.08em" }}>
            {meta.action}
          </div>
          <div style={{ fontSize:11, fontFamily:MONO, fontWeight:700, color:col, marginTop:4 }}>
            {meta.confidence}%
          </div>
        </div>
      </div>
      {/* Confidence strip */}
      <div style={{ height:2, background:"rgba(255,255,255,0.04)" }}>
        <div style={{ height:"100%", width:`${meta.confidence}%`, background:col,
          opacity:0.55, transition:"width 0.5s ease" }}/>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Equities() {
  const [filter, setFilter] = useState<EqFilter>("ALL");

  const entries  = Object.entries(MOCK_EQUITIES);
  const longs    = entries.filter(([, m]) => m.action === "LONG").length;
  const shorts   = entries.filter(([, m]) => m.action === "SHORT").length;
  const holds    = entries.filter(([, m]) => m.action === "HOLD").length;
  const highConf = entries.filter(([, m]) => m.confidence >= 65).length;
  const regime   = longs > shorts + 2 ? "BULLISH" : shorts > longs + 2 ? "BEARISH" : "MIXED";
  const regCol   = regime === "BULLISH" ? "rgba(0,210,100,0.85)"
                 : regime === "BEARISH" ? "rgba(230,70,70,0.85)"
                 : "rgba(0,185,215,0.75)";

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

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ padding:"18px 20px 14px",
        display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:W, fontFamily:SANS,
            letterSpacing:"-0.01em" }}>Equities</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
            <div style={{ width:5, height:5, borderRadius:"50%",
              background:"rgba(255,210,0,0.92)", flexShrink:0,
              animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
            <span style={{ fontSize:9, fontFamily:SANS, fontWeight:500, color:GR,
              letterSpacing:"0.12em", textTransform:"uppercase" as const }}>
              AI · {entries.length} Assets · Real-Time
            </span>
          </div>
        </div>
        <div style={{
          padding:"3px 11px", borderRadius:4, marginTop:4,
          background: regime === "BULLISH" ? "rgba(0,210,100,0.07)"
                    : regime === "BEARISH" ? "rgba(230,70,70,0.07)" : "rgba(0,185,215,0.06)",
          border:`1px solid ${regime === "BULLISH" ? "rgba(0,210,100,0.28)"
                              : regime === "BEARISH" ? "rgba(230,70,70,0.28)" : "rgba(0,185,215,0.22)"}`,
          fontSize:9, fontFamily:SANS, fontWeight:600, color:regCol, letterSpacing:"0.06em",
        }}>
          {regime}
        </div>
      </div>

      <div style={{ padding:"0 16px" }}>

        {/* ── Market intelligence ──────────────────────────────────────────── */}
        <div style={{ background:CARD, border:`1px solid ${E}`,
          borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:DIM,
            letterSpacing:"0.14em", textTransform:"uppercase" as const, marginBottom:10 }}>
            Market Intelligence
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr",
            borderBottom:"1px solid rgba(255,255,255,0.05)", paddingBottom:12, marginBottom:12 }}>
            {([
              { val:longs,    label:"Long",      col:"rgba(0,230,120,0.90)" },
              { val:shorts,   label:"Short",     col:"rgba(255,51,85,0.88)" },
              { val:holds,    label:"Hold",      col:"rgba(0,185,215,0.75)" },
              { val:highConf, label:"High Conf", col:"rgba(255,255,255,0.82)" },
            ] as { val:number; label:string; col:string }[]).map(({ val, label, col }) => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ fontSize:20, fontFamily:MONO, fontWeight:700, color:col }}>{val}</div>
                <div style={{ fontSize:7, fontFamily:SANS, color:GR,
                  letterSpacing:"0.08em", marginTop:2,
                  textTransform:"uppercase" as const }}>{label}</div>
              </div>
            ))}
          </div>
          <RegimeBar longs={longs} shorts={shorts} holds={holds}/>
        </div>

        {/* ── Sector heat ──────────────────────────────────────────────────── */}
        <div style={{ background:CARD, border:`1px solid ${E}`,
          borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:DIM,
            letterSpacing:"0.14em", textTransform:"uppercase" as const, marginBottom:10 }}>
            Sector Heat
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {SECTORS.map(s => <SectorCell key={s.name} {...s}/>)}
          </div>
        </div>

        {/* ── Top AI signals ───────────────────────────────────────────────── */}
        <div style={{ background:CARD, border:`1px solid ${E}`,
          borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:DIM,
            letterSpacing:"0.14em", textTransform:"uppercase" as const, marginBottom:2 }}>
            Top AI Signals
          </div>
          {TOP_SIGNALS.map(s => <TopSignalRow key={s.sym} {...s}/>)}
        </div>

        {/* ── Filter tabs ──────────────────────────────────────────────────── */}
        <div style={{ display:"flex", gap:7, marginBottom:12, flexWrap:"wrap" as const }}>
          {([
            ["ALL",       `All (${entries.length})`],
            ["LONG",      `Long (${longs})`],
            ["SHORT",     `Short (${shorts})`],
            ["HIGH_CONF", `High Conf (${highConf})`],
          ] as [EqFilter, string][]).map(([key, label]) => {
            const active = filter === key;
            return (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding:"6px 14px",
                background: active ? "rgba(0,229,255,0.08)" : "rgba(255,255,255,0.03)",
                border:`1px solid ${active ? "rgba(0,229,255,0.28)" : "rgba(255,255,255,0.10)"}`,
                borderRadius:20, color: active ? C : GR,
                fontFamily:SANS, fontSize:10, fontWeight: active ? 600 : 400,
                letterSpacing:"0.03em", cursor:"pointer", transition:"all 0.15s ease",
              }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Asset rows ───────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(([sym, meta]) => <EquityRow key={sym} sym={sym} meta={meta}/>)}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop:16, padding:"11px 14px", background:CARD,
          border:`1px solid ${E}`, borderRadius:8,
          fontSize:8, fontFamily:SANS, color:GR, lineHeight:1.7 }}>
          AI signals are informational only and do not constitute financial advice.
          Paper trading always free · Live AI trading $5.99/mo + 2% performance fee.
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.4; transform: scale(0.80); }
        }
      `}</style>
    </div>
  );
}
