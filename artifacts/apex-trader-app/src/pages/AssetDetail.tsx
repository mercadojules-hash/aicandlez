import { useState } from "react";
import { useLocation } from "wouter";

// ── Design tokens ────────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
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

// ── Asset database (crypto + equities) ──────────────────────────────────────────
interface AssetData {
  name: string; price: string; basePrice: number; change: string;
  vol: string; action: string; confidence: number; type: string;
}
const ASSET_DB: Record<string, AssetData> = {
  BTC:  { name:"Bitcoin",      price:"$68,450", basePrice:68450, change:"+2.34%", vol:"$132B",  action:"LONG",  confidence:79, type:"crypto" },
  ETH:  { name:"Ethereum",     price:"$3,524",  basePrice:3524,  change:"+1.87%", vol:"$421B",  action:"LONG",  confidence:72, type:"crypto" },
  SOL:  { name:"Solana",       price:"$188.40", basePrice:188.4, change:"-0.42%", vol:"$84B",   action:"HOLD",  confidence:61, type:"crypto" },
  XRP:  { name:"XRP",          price:"$0.624",  basePrice:0.624, change:"+3.12%", vol:"$35B",   action:"LONG",  confidence:71, type:"crypto" },
  ADA:  { name:"Cardano",      price:"$0.451",  basePrice:0.451, change:"+1.45%", vol:"$12B",   action:"LONG",  confidence:54, type:"crypto" },
  DOGE: { name:"Dogecoin",     price:"$0.143",  basePrice:0.143, change:"-2.11%", vol:"$31B",   action:"SHORT", confidence:66, type:"crypto" },
  LINK: { name:"Chainlink",    price:"$17.45",  basePrice:17.45, change:"+2.55%", vol:"$22B",   action:"LONG",  confidence:68, type:"crypto" },
  AVAX: { name:"Avalanche",    price:"$37.80",  basePrice:37.8,  change:"+4.21%", vol:"$28B",   action:"LONG",  confidence:74, type:"crypto" },
  MATIC:{ name:"Polygon",      price:"$0.881",  basePrice:0.881, change:"+1.78%", vol:"$18B",   action:"LONG",  confidence:61, type:"crypto" },
  DOT:  { name:"Polkadot",     price:"$8.92",   basePrice:8.92,  change:"-0.88%", vol:"$15B",   action:"HOLD",  confidence:49, type:"crypto" },
  NVDA: { name:"NVIDIA",       price:"$875.30", basePrice:875.3, change:"+1.84%", vol:"$2.15T", action:"LONG",  confidence:91, type:"equity" },
  TSLA: { name:"Tesla",        price:"$177.50", basePrice:177.5, change:"+3.21%", vol:"$565B",  action:"LONG",  confidence:82, type:"equity" },
  AAPL: { name:"Apple",        price:"$189.40", basePrice:189.4, change:"-0.42%", vol:"$2.90T", action:"HOLD",  confidence:55, type:"equity" },
  META: { name:"Meta",         price:"$512.80", basePrice:512.8, change:"+2.33%", vol:"$1.30T", action:"LONG",  confidence:86, type:"equity" },
  MSFT: { name:"Microsoft",    price:"$414.20", basePrice:414.2, change:"+1.15%", vol:"$3.07T", action:"LONG",  confidence:74, type:"equity" },
  GOOGL:{ name:"Alphabet",     price:"$173.40", basePrice:173.4, change:"+0.57%", vol:"$2.18T", action:"HOLD",  confidence:48, type:"equity" },
  SPY:  { name:"S&P 500 ETF",  price:"$521.40", basePrice:521.4, change:"+0.68%", vol:"ETF",    action:"HOLD",  confidence:52, type:"equity" },
  QQQ:  { name:"Nasdaq ETF",   price:"$443.20", basePrice:443.2, change:"+0.94%", vol:"ETF",    action:"LONG",  confidence:61, type:"equity" },
  AMD:  { name:"AMD",          price:"$162.30", basePrice:162.3, change:"-1.45%", vol:"$262B",  action:"SHORT", confidence:65, type:"equity" },
  AMZN: { name:"Amazon",       price:"$184.60", basePrice:184.6, change:"+0.92%", vol:"$1.93T", action:"LONG",  confidence:69, type:"equity" },
};

// ── Candle generation ────────────────────────────────────────────────────────────
interface Candle { o: number; h: number; l: number; c: number; v: number; }

function makeRng(seed: string) {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s << 5) + s) ^ seed.charCodeAt(i)) >>> 0;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}

function genCandles(sym: string, tf: string, n = 52): Candle[] {
  const rng = makeRng(sym + tf + "v2");
  const base = ASSET_DB[sym]?.basePrice ?? 100;
  const vols: Record<string, number> = { "1H":0.007, "4H":0.016, "1D":0.030, "1W":0.062 };
  const vol = vols[tf] ?? 0.016;
  const action = ASSET_DB[sym]?.action ?? "HOLD";
  const bias = action === "LONG" ? 0.020 : action === "SHORT" ? -0.020 : 0;
  let price = base * (0.88 + rng() * 0.08);
  return Array.from({ length: n }, () => {
    const spread = price * vol * (0.4 + rng() * 0.8);
    const move   = (rng() - 0.5 + bias * 0.5) * spread;
    const o = price;
    const c = price + move;
    const h = Math.max(o, c) + rng() * spread * 0.45;
    const l = Math.min(o, c) - rng() * spread * 0.45;
    price = c;
    return { o, h, l, c, v: 0.15 + rng() * 0.85 };
  });
}

function calcEma(prices: number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  const result = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * alpha + result[i - 1] * (1 - alpha));
  }
  return result;
}

// ── Cinematic Chart ──────────────────────────────────────────────────────────────
function CandleChart({ sym, tf }: { sym: string; tf: string }) {
  const candles = genCandles(sym, tf);
  const N = candles.length;
  const VB_W = 370, CH = 185, VOL_H = 32;
  const cW = VB_W / N;
  const bW = Math.max(cW * 0.55, 2);

  const highs = candles.map(c => c.h);
  const lows  = candles.map(c => c.l);
  const maxP  = Math.max(...highs);
  const minP  = Math.min(...lows);
  const padP  = (maxP - minP) * 0.08;

  const py = (p: number) => CH - ((p - minP + padP) / (maxP - minP + padP * 2)) * CH;
  const maxV = Math.max(...candles.map(c => c.v));

  const closes = candles.map(c => c.c);
  const ema9   = calcEma(closes, 9);
  const ema21  = calcEma(closes, 21);

  const linePath = (vals: number[]) =>
    vals.map((v, i) => {
      const x = (i + 0.5) * cW;
      const y = py(v);
      if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      const px = (i - 0.5 + 0.5) * cW; // prev x
      const cx = ((px + x) / 2).toFixed(1);
      return `C ${cx} ${py(vals[i-1]).toFixed(1)} ${cx} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");

  const recent = lows.slice(-28);
  const recentH = highs.slice(-28);
  const support = Math.min(...recent) + (Math.max(...recent) - Math.min(...recent)) * 0.12;
  const resist  = Math.max(...recentH) - (Math.max(...recentH) - Math.min(...recentH)) * 0.12;
  const action  = ASSET_DB[sym]?.action ?? "HOLD";
  const isLong  = action === "LONG";
  const curP    = candles[N - 1].c;
  const tpP     = curP * (isLong ? 1.045 : 0.955);
  const slP     = curP * (isLong ? 0.962 : 1.038);
  const gid     = sym.toLowerCase().replace(/[^a-z0-9]/g, "");
  const entryIdxA = Math.floor(N * 0.56);
  const entryIdxB = Math.floor(N * 0.79);

  return (
    <svg viewBox={`0 0 ${VB_W} ${CH + VOL_H + 10}`} width="100%"
      shapeRendering="geometricPrecision" style={{ display:"block" }}>
      <defs>
        <radialGradient id={`bg-${gid}`} cx="50%" cy="50%" r="70%">
          <stop offset="0%"   stopColor="rgba(0,40,80,0.15)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0)"/>
        </radialGradient>
        <filter id={`glow-${gid}`} x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="1.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id={`candle-glow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.0" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Subtle bg gradient */}
      <rect x={0} y={0} width={VB_W} height={CH} fill={`url(#bg-${gid})`}/>

      {/* Grid lines */}
      {[0.2, 0.4, 0.6, 0.8].map((t, i) => (
        <line key={i} x1={0} y1={CH * t} x2={VB_W} y2={CH * t}
          stroke="rgba(255,255,255,0.04)" strokeWidth="0.8" strokeDasharray="3 7"/>
      ))}

      {/* Support zone */}
      <rect x={0} y={py(support * 1.004)} width={VB_W}
        height={Math.max(Math.abs(py(support * 0.996) - py(support * 1.004)), 1)}
        fill="rgba(0,255,136,0.055)"/>
      <line x1={0} y1={py(support)} x2={VB_W} y2={py(support)}
        stroke="rgba(0,255,136,0.40)" strokeWidth="0.8" strokeDasharray="4 6"/>
      <text x={VB_W - 2} y={py(support) - 3} textAnchor="end"
        fill="rgba(0,255,136,0.55)" fontSize="6" fontFamily="'SF Mono',monospace">SUP</text>

      {/* Resistance zone */}
      <rect x={0} y={py(resist * 1.004)} width={VB_W}
        height={Math.max(Math.abs(py(resist * 0.996) - py(resist * 1.004)), 1)}
        fill="rgba(255,51,85,0.055)"/>
      <line x1={0} y1={py(resist)} x2={VB_W} y2={py(resist)}
        stroke="rgba(255,51,85,0.40)" strokeWidth="0.8" strokeDasharray="4 6"/>
      <text x={VB_W - 2} y={py(resist) - 3} textAnchor="end"
        fill="rgba(255,51,85,0.55)" fontSize="6" fontFamily="'SF Mono',monospace">RES</text>

      {/* TP line */}
      <line x1={0} y1={py(tpP)} x2={VB_W} y2={py(tpP)}
        stroke="rgba(0,255,136,0.50)" strokeWidth="0.7" strokeDasharray="2 4"/>
      <text x={3} y={py(tpP) - 3}
        fill="rgba(0,255,136,0.60)" fontSize="6" fontFamily="'SF Mono',monospace">TP</text>

      {/* SL line */}
      <line x1={0} y1={py(slP)} x2={VB_W} y2={py(slP)}
        stroke="rgba(255,51,85,0.50)" strokeWidth="0.7" strokeDasharray="2 4"/>
      <text x={3} y={py(slP) + 9}
        fill="rgba(255,51,85,0.60)" fontSize="6" fontFamily="'SF Mono',monospace">SL</text>

      {/* Volume bars */}
      {candles.map((c, i) => {
        const cx  = (i + 0.5) * cW;
        const bar = (c.v / maxV) * VOL_H * 0.90;
        const vY  = CH + 8 + VOL_H - bar;
        const col = c.c >= c.o ? "rgba(0,235,120,0.30)" : "rgba(255,60,60,0.28)";
        return <rect key={i} x={cx - bW / 2} y={vY} width={bW} height={bar} fill={col} rx="0.5"/>;
      })}

      {/* EMA 21 — purple */}
      <path d={linePath(ema21)} fill="none"
        stroke="rgba(155,92,245,0.65)" strokeWidth="1.3" strokeLinecap="round"
        filter={`url(#glow-${gid})`}/>

      {/* EMA 9 — cyan */}
      <path d={linePath(ema9)} fill="none"
        stroke="rgba(0,229,255,0.80)" strokeWidth="1.5" strokeLinecap="round"
        filter={`url(#glow-${gid})`}/>

      {/* Candles */}
      {candles.map((c, i) => {
        const cx      = (i + 0.5) * cW;
        const isGreen = c.c >= c.o;
        const col     = isGreen ? "#00eb78" : "#ff3c3c";
        const bodyTop = py(Math.max(c.o, c.c));
        const bodyBot = py(Math.min(c.o, c.c));
        const bodyH   = Math.max(bodyBot - bodyTop, 1.0);
        return (
          <g key={i} filter={`url(#candle-glow-${gid})`}>
            <line x1={cx} y1={py(c.h)} x2={cx} y2={py(c.l)}
              stroke={col} strokeWidth="0.65" strokeOpacity="0.55"/>
            <rect x={cx - bW / 2} y={bodyTop} width={bW} height={bodyH}
              fill={col} fillOpacity={isGreen ? 0.82 : 0.78} rx="0.5"/>
          </g>
        );
      })}

      {/* AI entry markers */}
      {([entryIdxA, entryIdxB] as number[]).map((idx, k) => {
        if (!candles[idx]) return null;
        const cx    = (idx + 0.5) * cW;
        const tipY  = py(candles[idx].l) + 6;
        const col   = isLong ? "#00ff88" : "#ff3355";
        return (
          <g key={k} filter={`url(#glow-${gid})`}>
            <polygon points={`${cx},${tipY - 7} ${cx - 4.5},${tipY + 2} ${cx + 4.5},${tipY + 2}`}
              fill={col} fillOpacity={0.88}/>
            <text x={cx} y={tipY + 11} textAnchor="middle"
              fill={col} fontSize="5.5" fontFamily="'SF Mono',monospace" fillOpacity="0.80">AI</text>
          </g>
        );
      })}

      {/* Current price line */}
      <line x1={0} y1={py(curP)} x2={VB_W} y2={py(curP)}
        stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" strokeDasharray="2 5"/>

      {/* EMA legend */}
      <g>
        <rect x={4} y={4} width={6} height={2} rx={1} fill="rgba(0,229,255,0.80)"/>
        <text x={13} y={9} fill="rgba(0,229,255,0.65)" fontSize="6"
          fontFamily="'SF Mono',monospace">EMA9</text>
        <rect x={42} y={4} width={6} height={2} rx={1} fill="rgba(155,92,245,0.70)"/>
        <text x={51} y={9} fill="rgba(155,92,245,0.65)" fontSize="6"
          fontFamily="'SF Mono',monospace">EMA21</text>
      </g>
    </svg>
  );
}

// ── Metric ring ──────────────────────────────────────────────────────────────────
function Ring({ value, label, color, size = 64 }: {
  value: number; label: string; color: string; size?: number;
}) {
  const r  = (size - 10) / 2;
  const cx = size / 2;
  const c  = 2 * Math.PI * r;
  const f  = Math.min(value / 100, 1) * c;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
      <svg width={size} height={size} style={{ overflow:"visible" }}>
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth="4.5"/>
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth="4.5"
          strokeDasharray={`${f} ${c - f}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ filter:`drop-shadow(0 0 4px ${color}60)`, transition:"stroke-dasharray 0.8s" }}/>
        <text x={cx} y={cx + 4} textAnchor="middle" dominantBaseline="central"
          fill="rgba(255,255,255,0.88)" fontSize="13" fontWeight="800"
          fontFamily="'SF Pro Display','Inter',sans-serif">{value}</text>
      </svg>
      <div style={{ fontSize:7, fontFamily:SANS, fontWeight:700,
        color:"rgba(255,255,255,0.45)", letterSpacing:"0.13em",
        textTransform:"uppercase" as const }}>{label}</div>
    </div>
  );
}

// ── AI metric bar ─────────────────────────────────────────────────────────────────
function AiBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <span style={{ fontSize:9, fontFamily:SANS, fontWeight:500, color:GR,
          letterSpacing:"0.08em" }}>{label}</span>
        <span style={{ fontSize:9, fontFamily:MONO, fontWeight:700, color }}>{value}%</span>
      </div>
      <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:2 }}>
        <div style={{
          height:"100%", width:`${value}%`, borderRadius:2,
          background:color,
          boxShadow:`0 0 6px ${color}55`,
          transition:"width 0.8s ease",
        }}/>
      </div>
    </div>
  );
}

// ── Seeded micro sparkline for related assets ────────────────────────────────────
function MicroSpark({ sym, action, w = 56, h = 22 }: { sym:string; action:string; w?:number; h?:number }) {
  const rng = makeRng(sym + "ms");
  const trend = action === "LONG" ? 1.1 : action === "SHORT" ? -1.1 : 0.0;
  const pts: number[] = [];
  let v = 48;
  for (let i = 0; i < 20; i++) {
    v = Math.max(8, Math.min(92, v + (rng() - 0.48) * 10 + trend));
    pts.push(v);
  }
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const pad = h * 0.08;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(p => h - pad - ((p - min) / range) * (h - pad * 2));
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = ((xs[i-1] + xs[i]) / 2).toFixed(1);
    d += ` C ${cx} ${ys[i-1].toFixed(1)} ${cx} ${ys[i].toFixed(1)} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  const col = action === "LONG" ? "#00eb78" : action === "SHORT" ? "#ff3c3c" : C;
  const gid2 = `ms-${sym.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow:"visible", flexShrink:0 }}>
      <defs>
        <linearGradient id={gid2} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${gid2})`}/>
      <path d={d} fill="none" stroke={col} strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── AI Reasoning ─────────────────────────────────────────────────────────────────
function getReasoningLines(sym: string, action: string, confidence: number): string[] {
  const name = ASSET_DB[sym]?.name ?? sym;
  if (action === "LONG") return [
    `${name} maintains a bullish continuation structure across 4H and Daily timeframes. EMA9 is trending above EMA21, confirming intact trend momentum.`,
    `Volume expansion on recent sessions signals institutional accumulation. Above-average volume on breakout candles elevates continuation probability.`,
    `Multi-timeframe alignment confirmed: 1H, 4H, and 1D signals directionally consistent. Risk-adjusted entry presents a favorable 1:2.6 reward-to-risk structure.`,
    `AI confidence at ${confidence}% — above execution threshold. Position sizing optimized to ${confidence > 80 ? "2.0" : "1.5"}% of portfolio per active risk parameters.`,
  ];
  if (action === "SHORT") return [
    `${name} exhibiting bearish technical structure. EMA21 crossing above EMA9 on 4H confirms downward momentum shift with high statistical reliability.`,
    `Bearish RSI divergence detected across 1H and 4H. Volume distribution pattern indicates consistent institutional selling pressure over recent sessions.`,
    `Resistance level holding with ${confidence > 70 ? "strong" : "moderate"} confirmation. Short entry risk-calibrated to maintain maximum 2% single-position drawdown.`,
    `AI confidence at ${confidence}% — momentum metrics remain below neutral threshold. Downside probability elevated versus historical mean reversal baseline.`,
  ];
  return [
    `${name} entering a consolidation phase. EMA9 and EMA21 compressing, indicating reduced directional momentum. AI monitoring for breakout catalyst.`,
    `Volume below 20-session average — confirming absence of directional conviction. HOLD designation protects capital during indeterminate market conditions.`,
    `AI requires additional confirmation before signal generation. Current confidence ${confidence}% — below optimal execution threshold of 65%.`,
    `Re-evaluation triggers: volume spike above 150% of 20-session average, or EMA9/EMA21 divergence exceeding 0.3% spread on 4H timeframe.`,
  ];
}

// ── Related assets ────────────────────────────────────────────────────────────────
const RELATED_CRYPTO  = ["BTC","ETH","SOL","AVAX","LINK","XRP","DOT","MATIC"];
const RELATED_EQUITY  = ["NVDA","TSLA","META","MSFT","AAPL","AMD","AMZN","QQQ"];

function getRelated(sym: string, type: string): string[] {
  const pool = type === "crypto" ? RELATED_CRYPTO : RELATED_EQUITY;
  return pool.filter(s => s !== sym).slice(0, 7);
}

// ── Main page ─────────────────────────────────────────────────────────────────────
const TIMEFRAMES = ["1H","4H","1D","1W"] as const;
type TF = typeof TIMEFRAMES[number];

const SIG_COLOR: Record<string,string> = {
  LONG:"rgba(0,230,120,0.92)", SHORT:"rgba(255,51,85,0.90)", HOLD:"rgba(0,229,255,0.78)"
};
const SIG_BG: Record<string,string> = {
  LONG:"rgba(0,230,120,0.07)", SHORT:"rgba(255,51,85,0.07)", HOLD:"rgba(0,229,255,0.05)"
};
const SIG_BORDER: Record<string,string> = {
  LONG:"rgba(0,230,120,0.28)", SHORT:"rgba(255,51,85,0.28)", HOLD:"rgba(0,229,255,0.22)"
};

export default function AssetDetail() {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<TF>("4H");
  const [executing, setExecuting] = useState<"buy"|"sell"|"auto"|null>(null);

  const params = new URLSearchParams(window.location.search);
  const sym    = (params.get("sym") ?? "BTC").toUpperCase();
  const type   = params.get("type") ?? "crypto";
  const asset  = ASSET_DB[sym];

  if (!asset) {
    return (
      <div style={{ background:BG, minHeight:"100%", padding:"80px 24px", textAlign:"center" }}>
        <div style={{ fontFamily:SANS, color:GR }}>Asset not found: {sym}</div>
        <button onClick={() => setLocation(-1 as unknown as string)}
          style={{ marginTop:16, color:C, background:"none", border:"none", cursor:"pointer",
            fontFamily:SANS, fontSize:13 }}>← Back</button>
      </div>
    );
  }

  const action  = asset.action;
  const conf    = asset.confidence;
  const isUp    = asset.change.startsWith("+");
  const chCol   = isUp ? G : R;
  const sigCol  = SIG_COLOR[action] ?? GR;
  const reasons = getReasoningLines(sym, action, conf);
  const related = getRelated(sym, type);
  const symHash = sym.split("").reduce((a,c) => a + c.charCodeAt(0), 0);
  const momentum  = 50 + (symHash * 13 + 7) % 45;
  const volatility = 30 + (symHash * 7 + 11) % 55;
  const sentiment = 50 + (symHash * 17 + 3) % 45;
  const trendStr  = 50 + (symHash * 11 + 19) % 48;
  const mtfConf   = conf - 5 + (symHash % 14);
  const volSignal = 50 + (symHash * 5 + 23) % 45;

  const handleExec = (type: "buy"|"sell"|"auto") => {
    setExecuting(type);
    setTimeout(() => setExecuting(null), 2200);
  };

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:40 }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{
        position:"sticky", top:0, zIndex:10,
        background:"rgba(0,0,0,0.94)",
        backdropFilter:"blur(20px)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        padding:"14px 16px 12px",
        display:"flex", alignItems:"center", gap:12,
      }}>
        <button onClick={() => setLocation(-1 as unknown as string)} style={{
          background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)",
          borderRadius:8, padding:"6px 10px", cursor:"pointer",
          display:"flex", alignItems:"center", gap:4,
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="rgba(255,255,255,0.70)" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{
              width:28, height:28, borderRadius:8, flexShrink:0,
              background:`linear-gradient(135deg, ${sigCol}25, ${sigCol}10)`,
              border:`1px solid ${sigCol}35`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:11, fontFamily:MONO, fontWeight:700, color:sigCol,
            }}>{sym[0]}</div>
            <div>
              <div style={{ fontSize:16, fontFamily:SANS, fontWeight:800, color:W,
                letterSpacing:"-0.01em" }}>{sym}</div>
              <div style={{ fontSize:9, fontFamily:SANS, color:GR }}>{asset.name}</div>
            </div>
          </div>
        </div>

        {/* AI status badge */}
        <div style={{
          padding:"4px 10px",
          background:SIG_BG[action], border:`1px solid ${SIG_BORDER[action]}`,
          borderRadius:6,
          fontSize:9, fontFamily:SANS, fontWeight:700, color:sigCol,
          letterSpacing:"0.06em",
        }}>
          {action === "LONG" ? "BULLISH" : action === "SHORT" ? "BEARISH" : "NEUTRAL"}
        </div>
      </div>

      <div style={{ padding:"0 14px" }}>

        {/* ── Price card ───────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:`linear-gradient(160deg, #0e1c2e 0%, #090f1c 100%)`,
          border:`1px solid ${SIG_BORDER[action]}`,
          borderRadius:16, padding:"20px 18px 18px", marginTop:14, marginBottom:12,
          boxShadow:`0 8px 40px rgba(0,0,0,0.95), 0 0 0 0.5px ${sigCol}08 inset`,
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1.5,
            background:`linear-gradient(90deg, transparent 8%, ${sigCol}60 38%, ${sigCol}45 62%, transparent 92%)`,
            animation:"edge-sweep 7s ease-in-out infinite",
          }}/>
          <div aria-hidden style={{
            position:"absolute", top:-30, right:-20, width:160, height:160, borderRadius:"50%",
            background:`radial-gradient(circle, ${sigCol}06 0%, transparent 70%)`,
            pointerEvents:"none", animation:"orb-breathe 8s ease-in-out infinite",
          }}/>
          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:9, fontFamily:SANS, color:GR,
                  letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:6 }}>
                  {type === "crypto" ? "Crypto" : "Equity"} · Live Price
                </div>
                <div style={{
                  fontSize:36, fontFamily:SANS, fontWeight:800, color:W,
                  letterSpacing:"-0.03em", lineHeight:1,
                  animation:"pnl-flash 4s ease-in-out infinite",
                }}>{asset.price}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8 }}>
                  <span style={{
                    fontSize:14, fontFamily:MONO, fontWeight:700, color:chCol,
                    letterSpacing:"-0.01em",
                  }}>{asset.change}</span>
                  <span style={{ fontSize:9, fontFamily:SANS, color:GR }}>24H</span>
                  <span style={{ fontSize:9, fontFamily:SANS, color:GR }}>·</span>
                  <span style={{ fontSize:9, fontFamily:SANS, color:GR }}>Vol {asset.vol}</span>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:7, fontFamily:SANS, color:DIM,
                  letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:4 }}>
                  AI Confidence
                </div>
                <div style={{ fontSize:28, fontFamily:SANS, fontWeight:800, color:sigCol,
                  letterSpacing:"-0.02em" }}>{conf}%</div>
                <div style={{ fontSize:8, fontFamily:SANS, color:GR, marginTop:3 }}>
                  {conf >= 75 ? "HIGH" : conf >= 60 ? "MEDIUM" : "LOW"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Chart card ──────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:`linear-gradient(160deg, #0a1620 0%, #07101a 100%)`,
          border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:16, marginBottom:12,
          boxShadow:"0 8px 40px rgba(0,0,0,0.95)",
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1.5,
            background:`linear-gradient(90deg, transparent 10%, ${C}40 42%, transparent 90%)`,
            animation:"edge-sweep 11s ease-in-out 2s infinite",
          }}/>

          {/* Timeframe tabs */}
          <div style={{ display:"flex", gap:6, padding:"14px 14px 10px" }}>
            {TIMEFRAMES.map(t => (
              <button key={t} onClick={() => setTf(t)} style={{
                padding:"5px 14px",
                background: tf === t ? "rgba(0,229,255,0.10)" : "rgba(255,255,255,0.03)",
                border:`1px solid ${tf === t ? "rgba(0,229,255,0.30)" : "rgba(255,255,255,0.08)"}`,
                borderRadius:20,
                fontSize:10, fontFamily:MONO, fontWeight: tf === t ? 700 : 400,
                color: tf === t ? C : GR, cursor:"pointer",
                letterSpacing:"0.03em",
                transition:"all 0.15s ease",
              }}>{t}</button>
            ))}
            <div style={{ marginLeft:"auto", fontSize:8, fontFamily:SANS, color:DIM,
              display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:G,
                animation:"dot-pulse 2s ease-in-out infinite" }}/>
              LIVE
            </div>
          </div>

          {/* Chart */}
          <div style={{ padding:"0 10px 14px" }}>
            <CandleChart sym={sym} tf={tf}/>
          </div>
        </div>

        {/* ── AI Analysis ─────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:`linear-gradient(160deg, #0d1824 0%, #09101c 100%)`,
          border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:16, padding:"18px 16px", marginBottom:12,
          boxShadow:"0 8px 40px rgba(0,0,0,0.90)",
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1.5,
            background:`linear-gradient(90deg, transparent 8%, rgba(155,92,245,0.50) 40%, rgba(0,229,255,0.35) 60%, transparent 92%)`,
            animation:"edge-sweep 13s ease-in-out 4s infinite",
          }}/>

          <div style={{ fontSize:9, fontFamily:SANS, fontWeight:700, color:"rgba(255,255,255,0.40)",
            letterSpacing:"0.18em", textTransform:"uppercase" as const, marginBottom:16 }}>
            AI Analysis
          </div>

          {/* Ring metrics */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
            justifyItems:"center", marginBottom:20 }}>
            <Ring value={conf}       label="Confidence" color={sigCol}/>
            <Ring value={momentum}   label="Momentum"   color="rgba(0,229,255,0.88)"/>
            <Ring value={volatility} label="Volatility" color="rgba(255,148,0,0.88)"/>
          </div>

          {/* Bar metrics */}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:16 }}>
            <AiBar label="Trend Strength"      value={trendStr}  color="rgba(0,230,120,0.85)"/>
            <AiBar label="Volume Signal"       value={volSignal} color="rgba(0,229,255,0.80)"/>
            <AiBar label="Market Sentiment"    value={sentiment} color="rgba(155,92,245,0.85)"/>
            <AiBar label="MTF Confirmation"    value={mtfConf}   color="rgba(255,200,0,0.80)"/>
          </div>
        </div>

        {/* ── AI Reasoning ────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:`linear-gradient(160deg, #080f1c 0%, #050b14 100%)`,
          border:"1px solid rgba(0,229,255,0.09)",
          borderRadius:16, padding:"18px 16px", marginBottom:14,
          boxShadow:"0 8px 40px rgba(0,0,0,0.95), 0 0 0 0.5px rgba(0,229,255,0.04) inset",
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1,
            background:`linear-gradient(90deg, transparent 10%, ${C}35 45%, transparent 90%)`,
            animation:"edge-sweep 16s ease-in-out 6s infinite",
          }}/>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="3"
                stroke="rgba(0,229,255,0.60)" strokeWidth="1.2"/>
              <path d="M4.5 8h7M4.5 5.5h4M4.5 10.5h5.5"
                stroke="rgba(0,229,255,0.60)" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
              color:"rgba(255,255,255,0.40)", letterSpacing:"0.18em",
              textTransform:"uppercase" as const }}>AI Reasoning</span>
            <div style={{ marginLeft:"auto", padding:"2px 8px",
              background:SIG_BG[action], border:`1px solid ${SIG_BORDER[action]}`,
              borderRadius:4, fontSize:8, fontFamily:SANS, fontWeight:700, color:sigCol,
              letterSpacing:"0.07em" }}>{action}</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {reasons.map((line, i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                <div style={{
                  flexShrink:0, marginTop:3,
                  width:4, height:4, borderRadius:"50%",
                  background: i === 0 ? sigCol : i === 1 ? C : i === 2 ? P : GR,
                  opacity: 1 - i * 0.1,
                  boxShadow:`0 0 4px ${i === 0 ? sigCol : i === 1 ? C : P}66`,
                }}/>
                <span style={{ fontSize:10, fontFamily:SANS, color:"rgba(255,255,255,0.72)",
                  lineHeight:1.65, letterSpacing:"0.005em" }}>{line}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Execution buttons ────────────────────────────────────────────── */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
            color:"rgba(255,255,255,0.40)", letterSpacing:"0.18em",
            textTransform:"uppercase" as const, marginBottom:12 }}>Execute Trade</div>

          {/* BUY / SELL row */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <button onClick={() => handleExec("buy")} style={{
              position:"relative", overflow:"hidden",
              padding:"16px 0",
              background: executing === "buy"
                ? "rgba(0,255,136,0.15)"
                : "linear-gradient(160deg, rgba(0,255,136,0.10), rgba(0,200,100,0.06))",
              border:"1px solid rgba(0,255,136,0.35)",
              borderRadius:14, cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:6,
              boxShadow:`0 0 ${executing === "buy" ? "20px" : "8px"} rgba(0,255,136,${executing === "buy" ? "0.20" : "0.08"})`,
              transition:"all 0.3s ease",
            }}>
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                <path d="M11 4v14M5 10l6-6 6 6" stroke="rgba(0,255,136,0.88)"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize:12, fontFamily:SANS, fontWeight:800,
                color:"rgba(0,255,136,0.92)", letterSpacing:"0.04em" }}>
                {executing === "buy" ? "EXECUTING…" : "AI BUY"}
              </span>
              <span style={{ fontSize:7.5, fontFamily:SANS, color:"rgba(0,255,136,0.55)",
                letterSpacing:"0.08em" }}>LONG ENTRY</span>
            </button>

            <button onClick={() => handleExec("sell")} style={{
              position:"relative", overflow:"hidden",
              padding:"16px 0",
              background: executing === "sell"
                ? "rgba(255,51,85,0.15)"
                : "linear-gradient(160deg, rgba(255,51,85,0.10), rgba(200,40,60,0.06))",
              border:"1px solid rgba(255,51,85,0.35)",
              borderRadius:14, cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:6,
              boxShadow:`0 0 ${executing === "sell" ? "20px" : "8px"} rgba(255,51,85,${executing === "sell" ? "0.20" : "0.08"})`,
              transition:"all 0.3s ease",
            }}>
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                <path d="M11 18V4M5 12l6 6 6-6" stroke="rgba(255,51,85,0.88)"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize:12, fontFamily:SANS, fontWeight:800,
                color:"rgba(255,51,85,0.92)", letterSpacing:"0.04em" }}>
                {executing === "sell" ? "EXECUTING…" : "AI SELL"}
              </span>
              <span style={{ fontSize:7.5, fontFamily:SANS, color:"rgba(255,51,85,0.55)",
                letterSpacing:"0.08em" }}>SHORT ENTRY</span>
            </button>
          </div>

          {/* AUTO TRADE — full width premium button */}
          <button onClick={() => handleExec("auto")} style={{
            position:"relative", overflow:"hidden",
            width:"100%", padding:"18px 0",
            background: executing === "auto"
              ? "linear-gradient(135deg, rgba(0,229,255,0.25), rgba(155,92,245,0.22))"
              : "linear-gradient(135deg, rgba(0,229,255,0.13), rgba(155,92,245,0.09))",
            border:`1px solid ${executing === "auto" ? "rgba(0,229,255,0.55)" : "rgba(0,229,255,0.35)"}`,
            borderRadius:14, cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:6,
            boxShadow:`0 0 ${executing === "auto" ? "32px" : "16px"} rgba(0,229,255,${executing === "auto" ? "0.22" : "0.10"})`,
            transition:"all 0.3s ease",
            animation:"cta-breathe 4s ease-in-out infinite",
          }}>
            {/* Shimmer overlay */}
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, bottom:0, borderRadius:14,
              background:"linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
              animation:"shimmer-sweep 3s ease-in-out infinite",
              pointerEvents:"none",
            }}/>
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:1.5,
              background:`linear-gradient(90deg, transparent 8%, rgba(0,229,255,0.60) 38%, rgba(155,92,245,0.50) 62%, transparent 92%)`,
              animation:"edge-sweep 5s ease-in-out infinite",
            }}/>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke={executing === "auto" ? "rgba(0,229,255,1)" : "rgba(0,229,255,0.85)"}
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{
                fontSize:15, fontFamily:SANS, fontWeight:800,
                color: executing === "auto" ? W : C,
                letterSpacing:"0.06em",
              }}>
                {executing === "auto" ? "AI ACTIVATING…" : "AUTO TRADE"}
              </span>
            </div>
            <span style={{ fontSize:8, fontFamily:SANS, color:"rgba(0,229,255,0.55)",
              letterSpacing:"0.12em", textTransform:"uppercase" as const }}>
              AI-managed · {conf}% confidence · Risk-calibrated
            </span>
          </button>
        </div>

        {/* ── Risk management ──────────────────────────────────────────────── */}
        <div style={{
          background:CARD, border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:14, padding:"16px", marginBottom:14,
        }}>
          <div style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
            color:"rgba(255,255,255,0.40)", letterSpacing:"0.18em",
            textTransform:"uppercase" as const, marginBottom:14 }}>
            Risk Parameters
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            {[
              { label:"Stop Loss",     val:"–3.8%",  color:"rgba(255,51,85,0.85)"  },
              { label:"Take Profit",   val:"+4.5%",  color:"rgba(0,255,136,0.85)"  },
              { label:"Max Exposure",  val:"2.0%",   color:"rgba(0,229,255,0.80)"  },
              { label:"Risk Level",    val: conf >= 75 ? "LOW" : conf >= 60 ? "MED" : "HIGH",
                color: conf >= 75 ? "rgba(0,255,136,0.85)" : conf >= 60 ? "rgba(255,148,0,0.85)" : "rgba(255,51,85,0.85)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)",
                borderRadius:10, padding:"11px 12px",
              }}>
                <div style={{ fontSize:7.5, fontFamily:SANS, color:DIM,
                  letterSpacing:"0.10em", textTransform:"uppercase" as const, marginBottom:5 }}>
                  {label}
                </div>
                <div style={{ fontSize:16, fontFamily:MONO, fontWeight:800, color }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{
            padding:"10px 12px",
            background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.12)",
            borderRadius:8,
            fontSize:9, fontFamily:SANS, color:"rgba(0,229,255,0.65)",
            lineHeight:1.55, letterSpacing:"0.02em",
          }}>
            ⚡ Maximum 5 concurrent AI positions · Auto position sizing active ·
            Kill switch enabled · Paper trading mode
          </div>
        </div>

        {/* ── Related opportunities ────────────────────────────────────────── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:9, fontFamily:SANS, fontWeight:700,
            color:"rgba(255,255,255,0.40)", letterSpacing:"0.18em",
            textTransform:"uppercase" as const, marginBottom:12 }}>
            Related Opportunities
          </div>
          <div className="related-scroll" style={{
            display:"flex", gap:10,
            overflowX:"auto", overflowY:"hidden",
            paddingBottom:4, WebkitOverflowScrolling:"touch",
          }}>
            {related.map(rsym => {
              const ra = ASSET_DB[rsym];
              if (!ra) return null;
              const rcol = SIG_COLOR[ra.action] ?? GR;
              const rHash = rsym.split("").reduce((a,c) => a + c.charCodeAt(0), 0);
              const rConf = 50 + (rHash * 7 + 13) % 44;
              return (
                <button key={rsym} onClick={() => setLocation(`/asset?sym=${rsym}&type=${ra.type}`)}
                  style={{
                    flexShrink:0, width:96,
                    background:CARD, border:`1px solid ${SIG_BORDER[ra.action] ?? E}`,
                    borderRadius:12, padding:"10px 10px 8px",
                    cursor:"pointer", textAlign:"left" as const,
                  }}>
                  <div style={{ fontSize:11, fontFamily:MONO, fontWeight:700, color:W,
                    marginBottom:2 }}>{rsym}</div>
                  <div style={{ marginBottom:6, opacity:0.80 }}>
                    <MicroSpark sym={rsym} action={ra.action} w={76} h={22}/>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:8, fontFamily:MONO, fontWeight:700, color:rcol }}>
                      {rConf}%
                    </span>
                    <span style={{
                      fontSize:7, fontFamily:SANS, fontWeight:700, color:rcol,
                      padding:"1px 5px",
                      background:SIG_BG[ra.action], border:`1px solid ${SIG_BORDER[ra.action]}`,
                      borderRadius:3,
                    }}>{ra.action}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.40;transform:scale(0.80)} }
        @keyframes pnl-flash    { 0%,100%{opacity:1} 50%{opacity:.72} }
        @keyframes edge-sweep   { 0%{opacity:.10;transform:scaleX(.25) translateX(-80%)} 50%{opacity:1;transform:scaleX(1) translateX(0)} 100%{opacity:.10;transform:scaleX(.25) translateX(80%)} }
        @keyframes orb-breathe  { 0%,100%{opacity:.50;transform:scale(1)} 50%{opacity:1;transform:scale(1.22)} }
        @keyframes cta-breathe  { 0%,100%{box-shadow:0 0 16px rgba(0,229,255,0.10)} 50%{box-shadow:0 0 36px rgba(0,229,255,0.22)} }
        @keyframes shimmer-sweep{ 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes page-in      { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .page-enter             { animation: page-in 0.35s ease-out both; }

        .related-scroll { scrollbar-width: none; }
        .related-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
