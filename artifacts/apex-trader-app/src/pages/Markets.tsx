import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type SignalBreakdown } from "@/lib/api";

// ── Design tokens ────────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const ESUB = "rgba(255,255,255,0.04)";
const C    = "#00e5ff";
const G    = "#00ff88";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#647385";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif";
const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

const SIG_COLOR: Record<string,string>  = { LONG:"rgba(0,230,120,0.92)", SHORT:"rgba(255,51,85,0.90)", HOLD:"rgba(0,185,215,0.78)" };
const SIG_BG: Record<string,string>    = { LONG:"rgba(0,230,120,0.07)", SHORT:"rgba(255,51,85,0.07)", HOLD:"rgba(0,185,215,0.05)" };
const SIG_BORDER: Record<string,string>= { LONG:"rgba(0,230,120,0.26)", SHORT:"rgba(255,51,85,0.26)", HOLD:"rgba(0,185,215,0.20)" };

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
  const gid = `mspk-${sym.replace(/[^a-z0-9]/gi,"")}`;
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

// ── Crypto mock data ─────────────────────────────────────────────────────────────
type AssetMeta = { name:string; price:string; change:string; vol:string; action:string; confidence:number };
const CRYPTO_ASSETS: Record<string, AssetMeta> = {
  BTCUSD:  { name:"Bitcoin",   price:"$68,450", change:"+2.34%", vol:"$132B", action:"LONG",  confidence:79 },
  ETHUSD:  { name:"Ethereum",  price:"$3,524",  change:"+1.87%", vol:"$421B", action:"LONG",  confidence:72 },
  SOLUSD:  { name:"Solana",    price:"$188.40", change:"-0.42%", vol:"$84B",  action:"HOLD",  confidence:61 },
  XRPUSD:  { name:"XRP",       price:"$0.624",  change:"+3.12%", vol:"$35B",  action:"LONG",  confidence:71 },
  ADAUSD:  { name:"Cardano",   price:"$0.451",  change:"+1.45%", vol:"$12B",  action:"LONG",  confidence:54 },
  DOGEUSD: { name:"Dogecoin",  price:"$0.143",  change:"-2.11%", vol:"$31B",  action:"SHORT", confidence:66 },
  LINKUSD: { name:"Chainlink", price:"$17.45",  change:"+2.55%", vol:"$22B",  action:"LONG",  confidence:68 },
  AVAXUSD: { name:"Avalanche", price:"$37.80",  change:"+4.21%", vol:"$28B",  action:"LONG",  confidence:74 },
  MATICUSD:{ name:"Polygon",   price:"$0.881",  change:"+1.78%", vol:"$18B",  action:"LONG",  confidence:61 },
  DOTUSD:  { name:"Polkadot",  price:"$8.92",   change:"-0.88%", vol:"$15B",  action:"HOLD",  confidence:49 },
  INJUSD:  { name:"Injective", price:"$32.20",  change:"+5.44%", vol:"$11B",  action:"LONG",  confidence:76 },
  UNIUSD:  { name:"Uniswap",   price:"$10.85",  change:"+3.88%", vol:"$14B",  action:"LONG",  confidence:67 },
  ATOMUSD: { name:"Cosmos",    price:"$9.74",   change:"-1.55%", vol:"$9B",   action:"SHORT", confidence:58 },
  NEARUSD: { name:"NEAR",      price:"$7.18",   change:"+2.94%", vol:"$10B",  action:"LONG",  confidence:65 },
  BNBUSD:  { name:"BNB",       price:"$594.20", change:"-1.23%", vol:"$86B",  action:"SHORT", confidence:63 },
};

type Filter = "ALL" | "LONG" | "SHORT" | "HIGH_CONF";

// ── Asset row (premium, clickable) ───────────────────────────────────────────────
function AssetRow({ sym, bd, meta, onClick }: {
  sym: string;
  bd: SignalBreakdown;
  meta: Partial<AssetMeta>;
  onClick: () => void;
}) {
  const action  = bd.action;
  const col     = SIG_COLOR[action]    ?? GR;
  const bg      = SIG_BG[action]      ?? ESUB;
  const border  = SIG_BORDER[action]  ?? E;
  const chUp    = (meta.change ?? "").startsWith("+");
  const chCol   = chUp ? "rgba(0,210,100,0.85)" : "rgba(230,70,70,0.82)";
  const label   = sym.replace("USD","");
  const conf    = bd.confidence;
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
          fontSize:13, fontFamily:MONO, fontWeight:800, color:col,
        }}>{label[0]}</div>

        {/* Symbol + Name */}
        <div style={{ minWidth:0, flex:"0 0 56px" }}>
          <div style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color:W,
            letterSpacing:"-0.01em" }}>{label}</div>
          <div style={{ fontSize:8, fontFamily:SANS, color:GR, marginTop:2,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
            {meta.name ?? label}
          </div>
        </div>

        {/* Price + change */}
        <div style={{ flex:"0 0 72px" }}>
          <div style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color:W }}>
            {meta.price ?? "—"}
          </div>
          <div style={{ fontSize:9, fontFamily:MONO, fontWeight:600, color:chCol, marginTop:2 }}>
            {meta.change ?? ""}
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
          <div style={{ display:"flex", alignItems:"center",
            justifyContent:"flex-end", gap:4, marginTop:5 }}>
            {bd.volumeConfirmed && (
              <span style={{ fontSize:7, fontFamily:SANS,
                color:"rgba(0,210,100,0.65)", letterSpacing:"0.05em" }}>VOL✓</span>
            )}
            <span style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color:col }}>{conf}%</span>
          </div>
        </div>

        {/* Arrow chevron */}
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

// ── Main page ─────────────────────────────────────────────────────────────────────
export default function Markets() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{
    breakdowns: Record<string, SignalBreakdown>;
    signalFilter: { volumeFilter: boolean; require1HTrend: boolean };
  }>({
    queryKey:        ["mobile-signals"],
    queryFn:         () => api.get("/mobile/signals"),
    refetchInterval: 5_000,
  });

  const normalizeAction = (a: string) => a === "BUY" ? "LONG" : a === "SELL" ? "SHORT" : a;
  const normalizedLive  = Object.fromEntries(
    Object.entries(data?.breakdowns ?? {}).map(([k, v]) => [k, { ...v, action: normalizeAction(v.action) }])
  );

  const allBreakdowns: Record<string, SignalBreakdown> = {
    ...normalizedLive,
    ...Object.entries(CRYPTO_ASSETS).reduce((acc, [sym, m]) => {
      if (!normalizedLive[sym]) {
        acc[sym] = {
          symbol: sym, action: m.action, confidence: m.confidence,
          mtfConfirmed: m.confidence >= 65, volumeConfirmed: m.confidence >= 65,
          marketCondition: "neutral", trend1H: "neutral",
          blockReason: null, lastUpdated: Date.now(),
        };
      }
      return acc;
    }, {} as Record<string, SignalBreakdown>),
  };

  const entries  = Object.entries(allBreakdowns);
  const longs    = entries.filter(([, b]) => b.action === "LONG").length;
  const shorts   = entries.filter(([, b]) => b.action === "SHORT").length;
  const holds    = entries.filter(([, b]) => b.action === "HOLD").length;
  const highConf = entries.filter(([, b]) => b.confidence >= 65).length;
  const regime   = longs > shorts + 2 ? "BULLISH" : shorts > longs + 2 ? "BEARISH" : "MIXED";
  const regCol   = regime === "BULLISH" ? "rgba(0,230,120,0.88)"
                 : regime === "BEARISH" ? "rgba(255,51,85,0.88)"
                 : "rgba(0,185,215,0.78)";

  const strongest = entries.length
    ? entries.reduce((best, curr) => curr[1].confidence > best[1].confidence ? curr : best, entries[0])
    : null;

  const filtered = entries
    .filter(([, b]) => {
      if (filter === "LONG")      return b.action === "LONG";
      if (filter === "SHORT")     return b.action === "SHORT";
      if (filter === "HIGH_CONF") return b.confidence >= 65;
      return true;
    })
    .sort((a, b) => b[1].confidence - a[1].confidence);

  const navigate = (sym: string) => {
    const label = sym.replace("USD","");
    setLocation(`/asset?sym=${label}&type=crypto`);
  };

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:28 }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{ padding:"18px 20px 14px",
        display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:W,
            fontFamily:SANS, letterSpacing:"-0.02em" }}>Crypto</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:G, flexShrink:0,
              boxShadow:`0 0 7px rgba(0,255,136,0.80)`,
              animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
            <span style={{ fontSize:9, fontFamily:SANS, fontWeight:500, color:GR,
              letterSpacing:"0.12em", textTransform:"uppercase" as const }}>
              AI · {entries.length} Assets · Live
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
            background:`linear-gradient(90deg, transparent 8%, rgba(0,230,120,0.45) 40%, rgba(0,229,255,0.35) 60%, transparent 92%)`,
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

          {/* Strongest + AI sentiment */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:7.5, fontFamily:SANS, fontWeight:500, color:DIM,
                letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:4 }}>
                Strongest Setup
              </div>
              {strongest ? (
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <span style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color:W }}>
                    {strongest[0].replace("USD","")}
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
              ) : (
                <span style={{ fontSize:11, fontFamily:MONO, color:DIM }}>—</span>
              )}
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
                letterSpacing:"0.03em", cursor:"pointer",
                transition:"all 0.15s ease",
              }}>{label}</button>
            );
          })}
        </div>

        {/* ── Scanning indicator ───────────────────────────────────────────── */}
        {isLoading && (
          <div style={{ textAlign:"center", padding:"24px 0",
            fontFamily:SANS, fontSize:10, color:GR, letterSpacing:"0.08em" }}>
            Scanning markets…
          </div>
        )}

        {/* ── Asset rows ───────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(([sym, bd]) => {
            const meta = CRYPTO_ASSETS[sym] ?? {};
            return (
              <AssetRow key={sym} sym={sym} bd={bd} meta={meta}
                onClick={() => navigate(sym)}/>
            );
          })}
        </div>

        {filtered.length === 0 && !isLoading && (
          <div style={{ textAlign:"center", padding:"28px 0",
            fontFamily:SANS, fontSize:10, color:GR, letterSpacing:"0.06em" }}>
            No signals match this filter
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop:16, padding:"11px 14px",
          background:CARD, border:`1px solid ${E}`, borderRadius:8,
          fontSize:8, fontFamily:SANS, color:GR, lineHeight:1.7 }}>
          Tap any asset to view AI analysis and execution options.
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
