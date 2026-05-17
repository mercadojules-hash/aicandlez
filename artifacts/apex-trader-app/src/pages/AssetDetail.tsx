import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAIAutoTrade } from "@/contexts/AIAutoTradeContext";
import { ExecutionFeedback, type ExecutionFeedbackPayload } from "@/components/ExecutionFeedback";

// ── Design tokens ────────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const G    = "#00ff88";
const P    = "#9b5cf5";
const R    = "#ff3355";
const W    = "#ffffff";
const GR   = "#8892a4";
const DIM  = "#647385";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif";
const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

// ── Asset database ────────────────────────────────────────────────────────────────
interface AssetData {
  name: string; price: string; basePrice: number; change: string;
  vol: string; action: string; confidence: number; type: string;
}
const ASSET_DB: Record<string, AssetData> = {
  BTC:  { name:"Bitcoin",     price:"$68,450", basePrice:68450, change:"+2.34%", vol:"$132B",  action:"LONG",  confidence:79, type:"crypto" },
  ETH:  { name:"Ethereum",    price:"$3,524",  basePrice:3524,  change:"+1.87%", vol:"$421B",  action:"LONG",  confidence:72, type:"crypto" },
  SOL:  { name:"Solana",      price:"$188.40", basePrice:188.4, change:"-0.42%", vol:"$84B",   action:"HOLD",  confidence:61, type:"crypto" },
  XRP:  { name:"XRP",         price:"$0.624",  basePrice:0.624, change:"+3.12%", vol:"$35B",   action:"LONG",  confidence:71, type:"crypto" },
  ADA:  { name:"Cardano",     price:"$0.451",  basePrice:0.451, change:"+1.45%", vol:"$12B",   action:"LONG",  confidence:54, type:"crypto" },
  DOGE: { name:"Dogecoin",    price:"$0.143",  basePrice:0.143, change:"-2.11%", vol:"$31B",   action:"SHORT", confidence:66, type:"crypto" },
  LINK: { name:"Chainlink",   price:"$17.45",  basePrice:17.45, change:"+2.55%", vol:"$22B",   action:"LONG",  confidence:68, type:"crypto" },
  AVAX: { name:"Avalanche",   price:"$37.80",  basePrice:37.8,  change:"+4.21%", vol:"$28B",   action:"LONG",  confidence:74, type:"crypto" },
  MATIC:{ name:"Polygon",     price:"$0.881",  basePrice:0.881, change:"+1.78%", vol:"$18B",   action:"LONG",  confidence:61, type:"crypto" },
  DOT:  { name:"Polkadot",    price:"$8.92",   basePrice:8.92,  change:"-0.88%", vol:"$15B",   action:"HOLD",  confidence:49, type:"crypto" },
  NVDA: { name:"NVIDIA",      price:"$875.30", basePrice:875.3, change:"+1.84%", vol:"$2.15T", action:"LONG",  confidence:91, type:"equity" },
  TSLA: { name:"Tesla",       price:"$177.50", basePrice:177.5, change:"+3.21%", vol:"$565B",  action:"LONG",  confidence:82, type:"equity" },
  AAPL: { name:"Apple",       price:"$189.40", basePrice:189.4, change:"-0.42%", vol:"$2.90T", action:"HOLD",  confidence:55, type:"equity" },
  META: { name:"Meta",        price:"$512.80", basePrice:512.8, change:"+2.33%", vol:"$1.30T", action:"LONG",  confidence:86, type:"equity" },
  MSFT: { name:"Microsoft",   price:"$414.20", basePrice:414.2, change:"+1.15%", vol:"$3.07T", action:"LONG",  confidence:74, type:"equity" },
  GOOGL:{ name:"Alphabet",    price:"$173.40", basePrice:173.4, change:"+0.57%", vol:"$2.18T", action:"HOLD",  confidence:48, type:"equity" },
  SPY:  { name:"S&P 500 ETF", price:"$521.40", basePrice:521.4, change:"+0.68%", vol:"ETF",    action:"HOLD",  confidence:52, type:"equity" },
  QQQ:  { name:"Nasdaq ETF",  price:"$443.20", basePrice:443.2, change:"+0.94%", vol:"ETF",    action:"LONG",  confidence:61, type:"equity" },
  AMD:  { name:"AMD",         price:"$162.30", basePrice:162.3, change:"-1.45%", vol:"$262B",  action:"SHORT", confidence:65, type:"equity" },
  AMZN: { name:"Amazon",      price:"$184.60", basePrice:184.6, change:"+0.92%", vol:"$1.93T", action:"LONG",  confidence:69, type:"equity" },
  PLTR: { name:"Palantir",    price:"$24.80",  basePrice:24.8,  change:"+4.12%", vol:"$54B",   action:"LONG",  confidence:78, type:"equity" },
  INJ:  { name:"Injective",   price:"$32.20",  basePrice:32.2,  change:"+5.44%", vol:"$11B",   action:"LONG",  confidence:76, type:"crypto" },
};

// ── Candle generation ─────────────────────────────────────────────────────────────
interface Candle { o: number; h: number; l: number; c: number; v: number; }

function makeRng(seed: string) {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s << 5) + s) ^ seed.charCodeAt(i)) >>> 0;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}

function genCandles(sym: string, tf: string, n = 110): Candle[] {
  const rng  = makeRng(sym + tf + "v3");
  const base = ASSET_DB[sym]?.basePrice ?? 100;
  const vols: Record<string,number> = { "1H":0.007, "4H":0.016, "1D":0.030, "1W":0.062 };
  const vol  = vols[tf] ?? 0.016;
  const action = ASSET_DB[sym]?.action ?? "HOLD";
  const bias = action === "LONG" ? 0.022 : action === "SHORT" ? -0.022 : 0;
  let price  = base * (0.87 + rng() * 0.07);
  return Array.from({ length: n }, () => {
    const spread = price * vol * (0.35 + rng() * 0.85);
    const move   = (rng() - 0.5 + bias * 0.5) * spread;
    const o = price;
    const c = price + move;
    const h = Math.max(o, c) + rng() * spread * 0.50;
    const l = Math.min(o, c) - rng() * spread * 0.50;
    price = c;
    return { o, h, l, c, v: 0.12 + rng() * 0.88 };
  });
}

function calcEma(prices: number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  const result = [prices[0]];
  for (let i = 1; i < prices.length; i++) result.push(prices[i] * alpha + result[i-1] * (1 - alpha));
  return result;
}

function formatPriceLabel(p: number, base: number): string {
  if (base >= 10000) return `${(p/1000).toFixed(1)}K`;
  if (base >= 1000)  return `${p.toFixed(0)}`;
  if (base >= 100)   return `${p.toFixed(1)}`;
  if (base >= 1)     return `${p.toFixed(2)}`;
  return `${p.toFixed(4)}`;
}

// ── Institutional candle chart (Bloomberg / TradingView aesthetic) ───────────
// Design principles:
//   • Deep black canvas with a faint horizontal price grid (no gradients)
//   • Many thin candles (n=110), 1px wicks, square bodies, no glow
//   • Restrained EMA palette: amber (EMA9) + steel-blue (EMA21), 1px lines
//   • Bullish/bearish: bullish = hollow body w/ green outline (TradingView OHLC)
//     bearish = solid red body. This is the canonical institutional convention.
//   • Volume pane separated by a thin divider; flat bars, no rounded corners
//   • TP / SL / SUP / RES are still annotated but at lower visual weight
function CandleChart({ sym, tf }: { sym: string; tf: string }) {
  const candles  = genCandles(sym, tf);
  const N        = candles.length;
  const VB_W     = 380;
  const CH       = 220;   // candle chart height (taller — more data density)
  const VOL_H    = 42;    // volume pane height
  const GAP      = 4;     // tight gap between price and volume panes
  const RIGHT_AXIS = 34;  // reserved area on the right for price labels
  const PLOT_W   = VB_W - RIGHT_AXIS;
  const cW       = PLOT_W / N;
  const bW       = Math.max(cW * 0.62, 1.4);  // thin bodies
  const base     = ASSET_DB[sym]?.basePrice ?? 100;

  const highs = candles.map(c => c.h);
  const lows  = candles.map(c => c.l);
  const maxP  = Math.max(...highs);
  const minP  = Math.min(...lows);
  const padP  = (maxP - minP) * 0.06;

  const py  = (p: number) => CH - ((p - minP + padP) / (maxP - minP + padP * 2)) * CH;
  const maxV = Math.max(...candles.map(c => c.v));

  const closes = candles.map(c => c.c);
  const ema9   = calcEma(closes, 9);
  const ema21  = calcEma(closes, 21);

  // Straight polylines for EMAs — institutional charts do NOT use bezier curves
  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${((i + 0.5) * cW).toFixed(2)} ${py(v).toFixed(2)}`).join(" ");
  const ema9Path  = linePath(ema9);
  const ema21Path = linePath(ema21);

  // S/R levels — kept but rendered at low weight
  const recentLows  = lows.slice(-40);
  const recentHighs = highs.slice(-40);
  const support = Math.min(...recentLows)  + (Math.max(...recentLows)  - Math.min(...recentLows))  * 0.10;
  const resist  = Math.max(...recentHighs) - (Math.max(...recentHighs) - Math.min(...recentHighs)) * 0.10;

  const action  = ASSET_DB[sym]?.action ?? "HOLD";
  const isLong  = action === "LONG";
  const curP    = candles[N - 1].c;
  const tpP     = curP * (isLong ? 1.045 : 0.955);
  const slP     = curP * (isLong ? 0.962 : 1.038);

  const entryIdxA = Math.floor(N * 0.54);
  const entryIdxB = Math.floor(N * 0.76);

  // 6 horizontal price levels — institutional charts use denser grids
  const priceLevels = [0.08, 0.24, 0.40, 0.56, 0.72, 0.88].map(t => ({
    y: CH * t,
    p: maxP + padP - t * (maxP - minP + padP * 2),
  }));

  // Time axis ticks — 5 evenly spaced markers across the bottom
  const timeIdxs = [0, Math.floor(N * 0.25), Math.floor(N * 0.50), Math.floor(N * 0.75), N - 1];
  const tfBars: Record<string, number> = { "1H": 1, "4H": 4, "1D": 24, "1W": 168 };
  const barsBack = tfBars[tf] ?? 1;
  const timeLabel = (idx: number) => {
    const hoursAgo = (N - 1 - idx) * barsBack;
    if (hoursAgo === 0) return "now";
    if (tf === "1W") return `${Math.round(hoursAgo / 168)}w`;
    if (tf === "1D") return `${Math.round(hoursAgo / 24)}d`;
    if (tf === "4H" || tf === "1H") return `${hoursAgo}h`;
    return `${hoursAgo}h`;
  };

  const lastCandle  = candles[N - 1];
  const lastCX      = (N - 0.5) * cW;
  const lastCloseY  = py(lastCandle.c);
  const lastIsGreen = lastCandle.c >= lastCandle.o;

  // Institutional palette
  const BULL = "#26a69a";   // teal-green (TradingView default)
  const BEAR = "#ef5350";   // muted red
  const EMA9_COL  = "#e0a317";   // amber
  const EMA21_COL = "#5b8def";   // steel blue
  const GRID_COL  = "rgba(255,255,255,0.045)";
  const AXIS_COL  = "rgba(255,255,255,0.35)";

  return (
    <svg viewBox={`0 0 ${VB_W} ${CH + GAP + VOL_H + 12}`} width="100%"
      shapeRendering="crispEdges" style={{ display:"block" }}>
      <defs>
        {/* Single subtle pulse for the live candle — no glow filters elsewhere */}
        <filter id="live-pulse" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.4"/>
        </filter>
      </defs>

      {/* Deep black background for the price pane */}
      <rect x={0} y={0} width={VB_W} height={CH} fill="#000"/>

      {/* Price grid + right-side axis labels */}
      {priceLevels.map((lvl, i) => (
        <g key={i}>
          <line x1={0} y1={lvl.y} x2={PLOT_W} y2={lvl.y} stroke={GRID_COL} strokeWidth="1"/>
          <text x={VB_W - 3} y={lvl.y + 2.5} textAnchor="end"
            fill={AXIS_COL} fontSize="7" fontFamily="'SF Mono',monospace">
            {formatPriceLabel(lvl.p, base)}
          </text>
        </g>
      ))}

      {/* SUP / RES — very low weight, dashed */}
      <line x1={0} y1={py(support)} x2={PLOT_W} y2={py(support)}
        stroke="rgba(38,166,154,0.40)" strokeWidth="0.8" strokeDasharray="3 5"/>
      <text x={3} y={py(support) - 2} fill="rgba(38,166,154,0.65)"
        fontSize="6" fontFamily="'SF Mono',monospace" letterSpacing="0.08em">SUP</text>

      <line x1={0} y1={py(resist)} x2={PLOT_W} y2={py(resist)}
        stroke="rgba(239,83,80,0.40)" strokeWidth="0.8" strokeDasharray="3 5"/>
      <text x={3} y={py(resist) - 2} fill="rgba(239,83,80,0.65)"
        fontSize="6" fontFamily="'SF Mono',monospace" letterSpacing="0.08em">RES</text>

      {/* TP / SL */}
      <line x1={0} y1={py(tpP)} x2={PLOT_W} y2={py(tpP)}
        stroke="rgba(38,166,154,0.55)" strokeWidth="0.7" strokeDasharray="2 4"/>
      <text x={3} y={py(tpP) - 2} fill="rgba(38,166,154,0.75)"
        fontSize="6" fontFamily="'SF Mono',monospace" letterSpacing="0.08em">TP</text>

      <line x1={0} y1={py(slP)} x2={PLOT_W} y2={py(slP)}
        stroke="rgba(239,83,80,0.55)" strokeWidth="0.7" strokeDasharray="2 4"/>
      <text x={3} y={py(slP) + 7} fill="rgba(239,83,80,0.75)"
        fontSize="6" fontFamily="'SF Mono',monospace" letterSpacing="0.08em">SL</text>

      {/* Volume pane background (slightly lifted from pure black for separation) */}
      <rect x={0} y={CH + GAP} width={VB_W} height={VOL_H} fill="rgba(255,255,255,0.015)"/>
      <line x1={0} y1={CH + GAP} x2={VB_W} y2={CH + GAP}
        stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"/>

      {/* Volume bars — flat fill, no gradient, no rounded corners */}
      {candles.map((c, i) => {
        const cx  = (i + 0.5) * cW;
        const bar = (c.v / maxV) * VOL_H * 0.92;
        const vY  = CH + GAP + VOL_H - bar;
        const isG = c.c >= c.o;
        return (
          <rect key={i} x={cx - bW / 2} y={vY} width={bW} height={bar}
            fill={isG ? "rgba(38,166,154,0.55)" : "rgba(239,83,80,0.55)"}/>
        );
      })}

      {/* EMA 21 — steel blue, 1px straight line */}
      <path d={ema21Path} fill="none" stroke={EMA21_COL} strokeWidth="1"
        strokeLinejoin="round" opacity="0.85"/>

      {/* EMA 9 — amber, 1px straight line */}
      <path d={ema9Path} fill="none" stroke={EMA9_COL} strokeWidth="1"
        strokeLinejoin="round" opacity="0.95"/>

      {/* Candles — TradingView convention:
            bullish = hollow body (stroke only) with bull color
            bearish = solid filled body with bear color
          Wicks are 1px straight lines, full opacity. */}
      {candles.map((c, i) => {
        const isGreen = c.c >= c.o;
        const col     = isGreen ? BULL : BEAR;
        const cx      = (i + 0.5) * cW;
        const bodyTop = py(Math.max(c.o, c.c));
        const bodyBot = py(Math.min(c.o, c.c));
        const bodyH   = Math.max(bodyBot - bodyTop, 0.8);
        return (
          <g key={i}>
            <line x1={cx} y1={py(c.h)} x2={cx} y2={py(c.l)}
              stroke={col} strokeWidth="1" shapeRendering="crispEdges"/>
            {isGreen ? (
              <rect x={cx - bW / 2 + 0.5} y={bodyTop + 0.5}
                width={Math.max(bW - 1, 0.8)} height={Math.max(bodyH - 1, 0.4)}
                fill="#000" stroke={col} strokeWidth="1" shapeRendering="crispEdges"/>
            ) : (
              <rect x={cx - bW / 2} y={bodyTop} width={bW} height={bodyH}
                fill={col} shapeRendering="crispEdges"/>
            )}
          </g>
        );
      })}

      {/* AI entry markers — small unobtrusive triangles below the bar */}
      {([entryIdxA, entryIdxB] as number[]).map((idx, k) => {
        if (!candles[idx]) return null;
        const cx   = (idx + 0.5) * cW;
        const tipY = py(candles[idx].l) + 6;
        const col  = isLong ? BULL : BEAR;
        return (
          <g key={k}>
            <polygon points={`${cx},${tipY - 5} ${cx - 3},${tipY + 1} ${cx + 3},${tipY + 1}`}
              fill={col} fillOpacity="0.85"/>
            <text x={cx} y={tipY + 8} textAnchor="middle"
              fill={col} fontSize="5" fontFamily="'SF Mono',monospace" fillOpacity="0.75"
              letterSpacing="0.05em">AI</text>
          </g>
        );
      })}

      {/* Current price marker — solid axis tag (Bloomberg-style) */}
      <line x1={0} y1={py(curP)} x2={PLOT_W} y2={py(curP)}
        stroke="rgba(255,255,255,0.20)" strokeWidth="0.6" strokeDasharray="2 3"/>
      <rect x={PLOT_W} y={py(curP) - 7} width={RIGHT_AXIS} height={14}
        fill={lastIsGreen ? BULL : BEAR}/>
      <text x={PLOT_W + RIGHT_AXIS / 2} y={py(curP) + 3} textAnchor="middle"
        fill="#000" fontSize="7" fontWeight="700" fontFamily="'SF Mono',monospace">
        {formatPriceLabel(curP, base)}
      </text>

      {/* Subtle live pulse on the most recent close */}
      <g filter="url(#live-pulse)" style={{ animation:"candle-live 1.8s ease-in-out infinite" }}>
        <circle cx={lastCX} cy={lastCloseY} r="2"
          fill={lastIsGreen ? BULL : BEAR} opacity="0.85"/>
      </g>

      {/* Top-left EMA legend — compact, monospaced */}
      <g>
        <rect x={4} y={4} width={8} height={1.5} fill={EMA9_COL}/>
        <text x={15} y={9} fill={EMA9_COL} fontSize="7"
          fontFamily="'SF Mono',monospace" letterSpacing="0.04em">EMA 9</text>
        <rect x={48} y={4} width={8} height={1.5} fill={EMA21_COL}/>
        <text x={59} y={9} fill={EMA21_COL} fontSize="7"
          fontFamily="'SF Mono',monospace" letterSpacing="0.04em">EMA 21</text>
        <text x={100} y={9} fill="rgba(255,255,255,0.40)" fontSize="7"
          fontFamily="'SF Mono',monospace" letterSpacing="0.04em">{tf} · {N} bars</text>
      </g>

      {/* Time axis labels at the bottom */}
      {timeIdxs.map((idx, k) => {
        const x = (idx + 0.5) * cW;
        const anchor = k === 0 ? "start" : k === timeIdxs.length - 1 ? "end" : "middle";
        return (
          <text key={k} x={x} y={CH + GAP + VOL_H + 9} textAnchor={anchor as any}
            fill={AXIS_COL} fontSize="6.5" fontFamily="'SF Mono',monospace"
            letterSpacing="0.04em">{timeLabel(idx)}</text>
        );
      })}
    </svg>
  );
}

// ── Ring metric ───────────────────────────────────────────────────────────────────
function Ring({ value, label, color, size = 64 }: {
  value: number; label: string; color: string; size?: number;
}) {
  const r  = (size - 10) / 2;
  const cx = size / 2;
  const c2 = 2 * Math.PI * r;
  const f  = Math.min(value / 100, 1) * c2;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
      <svg width={size} height={size} style={{ overflow:"visible" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5"/>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${f} ${c2 - f}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ filter:`drop-shadow(0 0 5px ${color}60)`, transition:"stroke-dasharray 0.8s" }}/>
        <text x={cx} y={cx + 5} textAnchor="middle"
          fill="rgba(255,255,255,0.90)" fontSize="14" fontWeight="800"
          fontFamily="'SF Pro Display','Inter',sans-serif">{value}</text>
      </svg>
      <div style={{ fontSize:7.5, fontFamily:SANS, fontWeight:700,
        color:"rgba(255,255,255,0.40)", letterSpacing:"0.13em",
        textTransform:"uppercase" as const }}>{label}</div>
    </div>
  );
}

// ── AI metric bar ─────────────────────────────────────────────────────────────────
function AiBar({ label, value, color }: { label:string; value:number; color:string }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <span style={{ fontSize:9, fontFamily:SANS, fontWeight:500, color:GR, letterSpacing:"0.06em" }}>{label}</span>
        <span style={{ fontSize:9, fontFamily:MONO, fontWeight:700, color }}>{value}%</span>
      </div>
      <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:2 }}>
        <div style={{ height:"100%", width:`${value}%`, borderRadius:2, background:color,
          boxShadow:`0 0 6px ${color}50`, transition:"width 0.8s ease" }}/>
      </div>
    </div>
  );
}

// ── Related asset micro sparkline ─────────────────────────────────────────────────
function MicroSpark({ sym, action, w = 60, h = 22 }: { sym:string; action:string; w?:number; h?:number }) {
  const rng = makeRng(sym + "ms2");
  const trend = action === "LONG" ? 1.1 : action === "SHORT" ? -1.1 : 0.0;
  const pts: number[] = [];
  let v = 48;
  for (let i = 0; i < 20; i++) {
    v = Math.max(8, Math.min(92, v + (rng() - 0.48) * 10 + trend));
    pts.push(v);
  }
  const min = Math.min(...pts), max = Math.max(...pts), rng2 = max - min || 1;
  const pad = h * 0.08;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(p => h - pad - ((p - min) / rng2) * (h - pad * 2));
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = ((xs[i-1] + xs[i]) / 2).toFixed(1);
    d += ` C ${cx} ${ys[i-1].toFixed(1)} ${cx} ${ys[i].toFixed(1)} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  const col = action === "LONG" ? "#00eb78" : action === "SHORT" ? "#ff3c3c" : C;
  const gid2 = `ms2-${sym.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow:"visible", flexShrink:0 }}>
      <defs>
        <linearGradient id={gid2} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.20"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${gid2})`}/>
      <path d={d} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── AI reasoning ──────────────────────────────────────────────────────────────────
function getReasoningLines(sym: string, action: string, confidence: number): string[] {
  const name = ASSET_DB[sym]?.name ?? sym;
  if (action === "LONG") return [
    `${name} maintains a bullish continuation structure on 4H and Daily. EMA9 is trending above EMA21, confirming intact momentum.`,
    `Volume expansion on recent sessions signals institutional accumulation. Above-average volume on breakout candles elevates continuation probability.`,
    `Multi-timeframe alignment confirmed: 1H, 4H, and 1D signals are directionally consistent. Risk-adjusted entry presents a favorable 1:2.6 reward-to-risk structure.`,
    `AI confidence at ${confidence}% — above execution threshold. Position sized at ${confidence > 80 ? "2.0" : "1.5"}% of portfolio per active risk parameters.`,
  ];
  if (action === "SHORT") return [
    `${name} exhibiting bearish technical structure. EMA21 crossing above EMA9 on 4H confirms downward momentum shift with high statistical reliability.`,
    `Bearish RSI divergence detected on 1H and 4H. Volume distribution pattern consistent with institutional selling pressure over recent sessions.`,
    `Resistance level holding with ${confidence > 70 ? "strong" : "moderate"} confirmation. Short entry calibrated to maintain maximum 2% single-position drawdown.`,
    `AI confidence at ${confidence}% — momentum metrics below neutral threshold. Downside probability elevated versus historical mean reversal baseline.`,
  ];
  return [
    `${name} entering a consolidation phase. EMA9 and EMA21 compressing — reduced directional momentum detected. AI monitoring for breakout catalyst.`,
    `Volume below 20-session average, confirming absence of directional conviction. HOLD designation protects capital during indeterminate conditions.`,
    `Current confidence ${confidence}% — below optimal execution threshold of 65%. AI requires additional confirmation before signal generation.`,
    `Re-evaluation triggers: volume spike above 150% of 20-session average, or EMA9/EMA21 divergence exceeding 0.3% spread on 4H.`,
  ];
}

// ── Signal colors ─────────────────────────────────────────────────────────────────
const SIG_COLOR:  Record<string,string> = { LONG:"rgba(0,230,120,0.92)", SHORT:"rgba(255,51,85,0.90)", HOLD:"rgba(0,229,255,0.78)" };
const SIG_BG:     Record<string,string> = { LONG:"rgba(0,230,120,0.07)", SHORT:"rgba(255,51,85,0.07)", HOLD:"rgba(0,229,255,0.05)" };
const SIG_BORDER: Record<string,string> = { LONG:"rgba(0,230,120,0.28)", SHORT:"rgba(255,51,85,0.28)", HOLD:"rgba(0,229,255,0.22)" };

const RELATED_CRYPTO  = ["BTC","ETH","SOL","AVAX","LINK","XRP","DOT","MATIC","INJ"];
const RELATED_EQUITY  = ["NVDA","TSLA","META","MSFT","AAPL","AMD","AMZN","QQQ","PLTR"];
const TFS = ["1H","4H","1D","1W"] as const;
type TF = typeof TFS[number];

// ── Setup quality grade ───────────────────────────────────────────────────────────
function setupGrade(conf: number): { grade:string; label:string; color:string } {
  if (conf >= 80) return { grade:"A+", label:"Institutional",  color:"rgba(0,230,120,0.92)" };
  if (conf >= 72) return { grade:"A",  label:"High Quality",   color:"rgba(0,230,120,0.82)" };
  if (conf >= 64) return { grade:"B+", label:"Strong Setup",   color:"rgba(0,229,255,0.88)" };
  if (conf >= 56) return { grade:"B",  label:"Moderate Setup", color:"rgba(0,229,255,0.72)" };
  return              { grade:"C",  label:"Developing",    color:"rgba(255,148,0,0.82)"  };
}

// ── Main page ─────────────────────────────────────────────────────────────────────
interface AssetDetailProps {
  routeSym?:  string;
  routeType?: string;
}

export default function AssetDetail({ routeSym, routeType }: AssetDetailProps = {}) {
  const [, setLocation] = useLocation();
  const [tf, setTf] = useState<TF>("4H");
  const [executing, setExecuting] = useState<"buy"|"sell"|"auto"|null>(null);
  const [feedback, setFeedback] = useState<ExecutionFeedbackPayload | null>(null);
  const pushFeedback = (p: Omit<ExecutionFeedbackPayload, "nonce">) =>
    setFeedback({ ...p, nonce: Date.now() });
  const { enabled: autoActive, setEnabled: setAutoActiveCtx } = useAIAutoTrade();
  const queryClient = useQueryClient();

  // sym/type come from route params (component is keyed on them in App.tsx → fresh mount per asset).
  // Fallback to ?sym=&type= query for legacy callers.
  const sym = (() => {
    if (routeSym) return routeSym.toUpperCase();
    if (typeof window !== "undefined") {
      return (new URLSearchParams(window.location.search).get("sym") ?? "BTC").toUpperCase();
    }
    return "BTC";
  })();
  const type = (() => {
    if (routeType) return routeType;
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("type") ?? "crypto";
    }
    return "crypto";
  })();

  const backRoute = type === "equity" ? "/equities" : "/markets";
  const asset  = ASSET_DB[sym];

  // Feedback auto-dismiss is owned by <ExecutionFeedback> itself.

  // ── Paper-trade execution mutation ───────────────────────────────────────────
  // Uses the Alpaca paper endpoint (same one AlpacaAutoTrader uses for AI auto-trades).
  // This is the canonical paper-trading path: no Clerk auth required, real orders
  // visible immediately on the Trade page and in Alpaca dashboards.
  interface AlpacaOrderResp {
    id:           string;
    symbol:       string;
    side:         string;
    status:       string;
    qty:          number;
    filledQty:    number;
    avgFillPrice: number;
    submittedAt:  string;
    filledAt:     string | null;
  }
  const orderMutation = useMutation<AlpacaOrderResp, Error, "BUY" | "SELL">({
    mutationFn: async (side) => {
      const notional = 1000;
      // BTC → BTC/USD for Alpaca crypto; equities (TSLA, AAPL…) stay bare
      const alpacaSymbol = type === "crypto" ? `${sym}/USD` : sym;
      const res = await fetch("/api/exchange/alpaca/order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ symbol: alpacaSymbol, side: side.toLowerCase(), notional }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (body as { error?: string }).error ?? `HTTP ${res.status}`;
        throw new Error(err);
      }
      return body as AlpacaOrderResp;
    },
    onSuccess: (order, side) => {
      // Refresh every screen that shows positions/orders
      void queryClient.invalidateQueries({ queryKey: ["mobile-portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["sim-account"] });
      void queryClient.invalidateQueries({ queryKey: ["alpaca-positions"] });
      void queryClient.invalidateQueries({ queryKey: ["alpaca-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["alpaca-account"] });
      const verb = side === "BUY" ? "LONG" : "SHORT";
      // Map raw Alpaca status → cinematic feedback state
      // filled              → "filled"   (TRADE EXECUTED chord)
      // partially_filled    → "filled"
      // accepted / pending_*→ "pending"  (PENDING FILL tick)
      // anything else       → "submitted"
      const s = (order.status ?? "").toLowerCase();
      const state: ExecutionFeedbackPayload["state"] =
        /^filled|partially_filled$/.test(s)        ? "filled"
        : /pending|accepted|new|held/.test(s)      ? "pending"
        : "submitted";
      pushFeedback({
        state,
        symbol:   sym,
        side:     verb,
        notional: 1000,
        orderId:  order.id,
        status:   order.status,
      });
    },
    onError: (err) => {
      const msg = err.message;
      console.warn("[ai-exec] error", msg);
      let friendly = msg;
      if (/not configured/i.test(msg))     friendly = "Paper broker not configured — contact admin";
      else if (/401|unauthor/i.test(msg))  friendly = "Paper broker rejected credentials";
      else if (/insufficient/i.test(msg))  friendly = "Insufficient paper buying power";
      else if (/not found/i.test(msg))     friendly = `${sym} not supported by paper broker`;
      pushFeedback({
        state:   "rejected",
        symbol:  sym,
        message: friendly,
      });
    },
    onSettled: () => {
      // Hold "EXECUTING…" ~750ms so the state change is perceptible even when the
      // request resolves in <300ms. Prevents the "glitchy flash" regression.
      setTimeout(() => setExecuting(null), 750);
    },
  });

  if (!asset) {
    return (
      <div style={{ background:BG, minHeight:"100%", padding:"80px 24px", textAlign:"center" }}>
        <div style={{ fontFamily:SANS, color:GR }}>Asset not found: {sym}</div>
        <button onClick={() => setLocation(backRoute)}
          style={{ marginTop:16, color:C, background:"none", border:"none",
            cursor:"pointer", fontFamily:SANS, fontSize:13 }}>← Back</button>
      </div>
    );
  }

  const action   = asset.action;
  const conf     = asset.confidence;
  const isUp     = asset.change.startsWith("+");
  const chCol    = isUp ? G : R;
  const sigCol   = SIG_COLOR[action] ?? GR;
  const reasons  = getReasoningLines(sym, action, conf);
  // Standard related list — filter out the current asset (you can't navigate to
  // the page you're already on). Matches the simple pattern in Markets/Equities.
  const related  = (type === "crypto" ? RELATED_CRYPTO : RELATED_EQUITY).filter(s => s !== sym).slice(0, 8);
  const sg       = setupGrade(conf);

  // Seeded metrics
  const h = sym.split("").reduce((a,c) => a + c.charCodeAt(0), 0);
  const momentum   = 50 + (h * 13 + 7) % 44;
  const volatility = 30 + (h * 7  + 11) % 54;
  const sentiment  = 50 + (h * 17 + 3) % 44;
  const trendStr   = 50 + (h * 11 + 19) % 46;
  const mtfConf    = conf - 5 + (h % 13);
  const volSignal  = 50 + (h * 5  + 23) % 44;
  const mtf1H = conf > 70;
  const mtf4H = conf > 60;
  const mtf1D = conf > 65;

  const handleExec = (type2: "buy"|"sell"|"auto") => {
    if (type2 === "auto") { setAutoActiveCtx(!autoActive); return; }
    if (orderMutation.isPending || executing) return;
    setExecuting(type2);
    setFeedback(null); // clear any stale feedback so the new result is unmistakable
    pushFeedback({ state: "submitted", symbol: sym }); // instant ack — fires the blip + cyan banner
    orderMutation.mutate(type2 === "buy" ? "BUY" : "SELL");
  };

  const navigateToAsset = (rsym: string, rtype: string) => {
    // Path-based route → wouter mounts a fresh AssetDetail (keyed on `${type}:${sym}` in App.tsx).
    // No state mutation here; the remount handles all symbol-specific state cleanly.
    setLocation(`/asset/${rtype}/${rsym.toUpperCase()}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:40 }}>

      {/* Cinematic execution feedback — banner, sound, and animations all owned
          by the component. Portaled to <body> internally. */}
      <ExecutionFeedback payload={feedback} onDismiss={() => setFeedback(null)} />

      {/* ── Sticky header ────────────────────────────────────────────────────── */}
      <div style={{
        position:"sticky", top:0, zIndex:10,
        background:"rgba(0,0,0,0.95)", backdropFilter:"blur(24px)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        padding:"13px 16px 11px",
        display:"flex", alignItems:"center", gap:12,
      }}>
        <button onClick={() => setLocation(backRoute)} style={{
          background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)",
          borderRadius:8, padding:"6px 10px", cursor:"pointer",
          display:"flex", alignItems:"center",
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
              <div style={{ fontSize:16, fontFamily:SANS, fontWeight:800, color:W, letterSpacing:"-0.01em" }}>{sym}</div>
              <div style={{ fontSize:9, fontFamily:SANS, color:GR }}>{asset.name}</div>
            </div>
          </div>
        </div>
        <div style={{
          padding:"4px 10px",
          background:SIG_BG[action], border:`1px solid ${SIG_BORDER[action]}`,
          borderRadius:6, fontSize:9, fontFamily:SANS, fontWeight:700,
          color:sigCol, letterSpacing:"0.06em",
        }}>
          {action === "LONG" ? "BULLISH" : action === "SHORT" ? "BEARISH" : "NEUTRAL"}
        </div>
      </div>

      <div style={{ padding:"0 14px" }}>

        {/* ── Price card ──────────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:`linear-gradient(160deg, #0e1c2e 0%, #090f1c 100%)`,
          border:`1px solid ${SIG_BORDER[action]}`,
          borderRadius:18, padding:"20px 18px 18px", marginTop:14, marginBottom:12,
          boxShadow:`0 8px 40px rgba(0,0,0,0.95), 0 0 0 0.5px ${sigCol}08 inset`,
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:2,
            background:`linear-gradient(90deg, transparent 8%, ${sigCol}65 38%, ${sigCol}50 62%, transparent 92%)`,
            animation:"edge-sweep 7s ease-in-out infinite",
          }}/>
          <div aria-hidden style={{
            position:"absolute", top:-30, right:-20, width:180, height:180, borderRadius:"50%",
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
                <div style={{ fontSize:36, fontFamily:SANS, fontWeight:800, color:W,
                  letterSpacing:"-0.03em", lineHeight:1,
                  animation:"pnl-flash 4s ease-in-out infinite" }}>{asset.price}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8 }}>
                  <span style={{ fontSize:14, fontFamily:MONO, fontWeight:700, color:chCol, letterSpacing:"-0.01em" }}>
                    {asset.change}
                  </span>
                  <span style={{ fontSize:9, fontFamily:SANS, color:GR }}>24H</span>
                  <span style={{ fontSize:9, fontFamily:SANS, color:"rgba(255,255,255,0.15)" }}>·</span>
                  <span style={{ fontSize:9, fontFamily:SANS, color:GR }}>Vol {asset.vol}</span>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:7, fontFamily:SANS, color:DIM,
                  letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:4 }}>AI Confidence</div>
                <div style={{ fontSize:30, fontFamily:SANS, fontWeight:800, color:sigCol, letterSpacing:"-0.02em" }}>{conf}%</div>
                <div style={{ display:"flex", alignItems:"center", gap:5, justifyContent:"flex-end", marginTop:4 }}>
                  <div style={{ padding:"2px 8px", background:SIG_BG[action], border:`1px solid ${SIG_BORDER[action]}`,
                    borderRadius:4, fontSize:8, fontFamily:SANS, fontWeight:700, color:sigCol,
                    letterSpacing:"0.06em" }}>{sg.grade}</div>
                  <span style={{ fontSize:8, fontFamily:SANS, color:sg.color }}>{sg.label}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Chart card ──────────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:"linear-gradient(160deg, #080f1c 0%, #05090f 100%)",
          border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:18, marginBottom:12,
          boxShadow:"0 8px 40px rgba(0,0,0,0.95)",
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1.5,
            background:`linear-gradient(90deg, transparent 10%, ${C}40 42%, transparent 90%)`,
            animation:"edge-sweep 11s ease-in-out 2s infinite",
          }}/>
          {/* TF tabs */}
          <div style={{ display:"flex", gap:6, padding:"14px 14px 10px", alignItems:"center" }}>
            {TFS.map(t => (
              <button key={t} onClick={() => setTf(t)} style={{
                padding:"5px 14px",
                background: tf === t ? "rgba(0,229,255,0.10)" : "rgba(255,255,255,0.03)",
                border:`1px solid ${tf === t ? "rgba(0,229,255,0.30)" : "rgba(255,255,255,0.08)"}`,
                borderRadius:20, fontSize:10, fontFamily:MONO, fontWeight: tf === t ? 700 : 400,
                color: tf === t ? C : GR, cursor:"pointer", letterSpacing:"0.03em",
                transition:"all 0.15s ease",
              }}>{t}</button>
            ))}
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:G,
                boxShadow:"0 0 7px rgba(0,255,136,0.80)",
                animation:"dot-pulse 2s ease-in-out infinite" }}/>
              <span style={{ fontSize:8, fontFamily:SANS, color:GR, letterSpacing:"0.10em" }}>LIVE</span>
            </div>
          </div>
          <div style={{ padding:"0 10px 14px" }}>
            <CandleChart sym={sym} tf={tf}/>
          </div>
        </div>

        {/* ── AI Analysis ─────────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:"linear-gradient(160deg, #0d1824 0%, #09101c 100%)",
          border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:18, padding:"18px 16px", marginBottom:12,
          boxShadow:"0 8px 40px rgba(0,0,0,0.90)",
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1.5,
            background:`linear-gradient(90deg, transparent 8%, rgba(155,92,245,0.50) 40%, rgba(0,229,255,0.35) 60%, transparent 92%)`,
            animation:"edge-sweep 13s ease-in-out 4s infinite",
          }}/>
          <div style={{ fontSize:8.5, fontFamily:SANS, fontWeight:700,
            color:"rgba(255,255,255,0.38)", letterSpacing:"0.20em",
            textTransform:"uppercase" as const, marginBottom:16 }}>AI Analysis</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", justifyItems:"center", marginBottom:20 }}>
            <Ring value={conf}       label="Confidence" color={sigCol}/>
            <Ring value={momentum}   label="Momentum"   color="rgba(0,229,255,0.88)"/>
            <Ring value={volatility} label="Volatility" color="rgba(255,148,0,0.88)"/>
          </div>
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:16 }}>
            <AiBar label="Trend Strength"   value={trendStr}  color="rgba(0,230,120,0.85)"/>
            <AiBar label="Volume Signal"    value={volSignal} color="rgba(0,229,255,0.80)"/>
            <AiBar label="Market Sentiment" value={sentiment} color="rgba(155,92,245,0.85)"/>
            <AiBar label="MTF Confirmation" value={mtfConf}   color="rgba(255,200,0,0.80)"/>
          </div>
        </div>

        {/* ── AI Reasoning ────────────────────────────────────────────────────── */}
        <div style={{
          position:"relative", overflow:"hidden",
          background:"linear-gradient(160deg, #080f1c 0%, #050b14 100%)",
          border:"1px solid rgba(0,229,255,0.09)",
          borderRadius:18, padding:"18px 16px", marginBottom:14,
          boxShadow:"0 8px 40px rgba(0,0,0,0.95)",
        }}>
          <div aria-hidden style={{
            position:"absolute", top:0, left:0, right:0, height:1,
            background:`linear-gradient(90deg, transparent 10%, ${C}38 45%, transparent 90%)`,
            animation:"edge-sweep 16s ease-in-out 6s infinite",
          }}/>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="3"
                stroke="rgba(0,229,255,0.60)" strokeWidth="1.2"/>
              <path d="M4.5 8h7M4.5 5.5h4M4.5 10.5h5.5"
                stroke="rgba(0,229,255,0.60)" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize:8.5, fontFamily:SANS, fontWeight:700,
              color:"rgba(255,255,255,0.38)", letterSpacing:"0.20em",
              textTransform:"uppercase" as const }}>AI Reasoning</span>
            <div style={{ marginLeft:"auto", padding:"2px 8px",
              background:SIG_BG[action], border:`1px solid ${SIG_BORDER[action]}`,
              borderRadius:4, fontSize:8, fontFamily:SANS, fontWeight:700,
              color:sigCol, letterSpacing:"0.07em" }}>{action}</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {reasons.map((line, i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                <div style={{
                  flexShrink:0, marginTop:4,
                  width:4, height:4, borderRadius:"50%",
                  background: i===0 ? sigCol : i===1 ? C : i===2 ? P : GR,
                  boxShadow:`0 0 4px ${i===0 ? sigCol : i===1 ? C : P}60`,
                }}/>
                <span style={{ fontSize:10, fontFamily:SANS, color:"rgba(255,255,255,0.72)",
                  lineHeight:1.65, letterSpacing:"0.005em" }}>{line}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Setup quality + MTF confirmation ────────────────────────────────── */}
        <div style={{
          background:CARD, border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:16, padding:"16px", marginBottom:14,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
            <div style={{
              width:52, height:52, borderRadius:14, flexShrink:0,
              background:`linear-gradient(135deg, ${sg.color}20, ${sg.color}08)`,
              border:`1px solid ${sg.color}35`,
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            }}>
              <span style={{ fontSize:18, fontFamily:SANS, fontWeight:800, color:sg.color,
                letterSpacing:"-0.02em", lineHeight:1 }}>{sg.grade}</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:7.5, fontFamily:SANS, color:DIM,
                letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:3 }}>Setup Quality</div>
              <div style={{ fontSize:15, fontFamily:SANS, fontWeight:800, color:W, letterSpacing:"-0.01em" }}>
                {sg.label}
              </div>
              <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:3 }}>
                Score {conf}/100 · {action === "HOLD" ? "Monitor for trigger" : "AI-eligible entry"}
              </div>
            </div>
          </div>
          {/* MTF confirmation checkboxes */}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:12 }}>
            <div style={{ fontSize:7.5, fontFamily:SANS, color:DIM,
              letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:8 }}>
              Multi-Timeframe Confirmation
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {[
                { label:"1H Trend", ok:mtf1H },
                { label:"4H Trend", ok:mtf4H },
                { label:"1D Trend", ok:mtf1D },
                { label:"Vol Conf", ok:conf > 64 },
              ].map(({ label, ok }) => (
                <div key={label} style={{
                  flex:1, padding:"7px 6px", textAlign:"center" as const,
                  background: ok ? `${sigCol}08` : "rgba(255,255,255,0.03)",
                  border:`1px solid ${ok ? `${sigCol}28` : "rgba(255,255,255,0.06)"}`,
                  borderRadius:8,
                }}>
                  <div style={{ fontSize:11, marginBottom:2 }}>{ok ? "✓" : "—"}</div>
                  <div style={{ fontSize:7, fontFamily:SANS, color: ok ? sigCol : GR,
                    letterSpacing:"0.06em" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            EXECUTION SECTION — AUTO TRADE is the HERO
        ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:8.5, fontFamily:SANS, fontWeight:700,
            color:"rgba(255,255,255,0.38)", letterSpacing:"0.20em",
            textTransform:"uppercase" as const, marginBottom:12 }}>Execute Trade</div>

          {/* AUTO TRADE — HERO button */}
          <button onClick={() => handleExec("auto")} style={{
            position:"relative", overflow:"hidden",
            width:"100%", padding:"22px 0", marginBottom:10,
            background: autoActive
              ? "linear-gradient(135deg, rgba(0,229,255,0.20), rgba(155,92,245,0.18))"
              : "linear-gradient(135deg, rgba(0,229,255,0.12), rgba(155,92,245,0.08))",
            border:`1px solid ${autoActive ? "rgba(0,229,255,0.55)" : "rgba(0,229,255,0.32)"}`,
            borderRadius:18, cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:7,
            boxShadow: autoActive
              ? "0 0 50px rgba(0,229,255,0.22), 0 0 100px rgba(155,92,245,0.12)"
              : "0 0 20px rgba(0,229,255,0.10)",
            transition:"all 0.35s ease",
            animation:"cta-breathe 4s ease-in-out infinite",
          }}>
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, height:2,
              background: autoActive
                ? "linear-gradient(90deg, transparent 5%, rgba(0,229,255,0.80) 35%, rgba(155,92,245,0.70) 65%, transparent 95%)"
                : "linear-gradient(90deg, transparent 5%, rgba(0,229,255,0.55) 38%, rgba(155,92,245,0.45) 62%, transparent 95%)",
              animation:"edge-sweep 5s ease-in-out infinite",
            }}/>
            <div aria-hidden style={{
              position:"absolute", top:0, left:0, right:0, bottom:0, borderRadius:18,
              background:"linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
              animation:"shimmer-sweep 3.5s ease-in-out infinite", pointerEvents:"none",
            }}/>
            <div style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke={autoActive ? C : "rgba(0,229,255,0.85)"} strokeWidth="1.7"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize:17, fontFamily:SANS, fontWeight:800,
                  color: autoActive ? W : C, letterSpacing:"0.05em",
                  textShadow: autoActive ? `0 0 20px ${C}80` : "none",
                  transition:"all 0.30s ease" }}>
                  {autoActive ? "AUTO TRADE ACTIVE" : "AUTO TRADE"}
                </span>
                {autoActive && (
                  <div style={{ width:8, height:8, borderRadius:"50%", background:C,
                    boxShadow:`0 0 14px ${C}`, animation:"dot-pulse 1.2s infinite" }}/>
                )}
              </div>
              <span style={{ fontSize:9, fontFamily:SANS,
                color: autoActive ? "rgba(0,229,255,0.70)" : "rgba(0,229,255,0.50)",
                letterSpacing:"0.12em", textTransform:"uppercase" as const }}>
                {autoActive
                  ? `AI managing ${sym} · ${conf}% confidence · Stop-loss active`
                  : `AI-managed · ${conf}% confidence · Risk-calibrated`}
              </span>
            </div>
          </button>

          {/* BUY / SELL — secondary row */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <button onClick={() => handleExec("buy")} style={{
              position:"relative", overflow:"hidden", padding:"15px 0",
              background: executing==="buy" ? "rgba(0,255,136,0.14)" : "linear-gradient(160deg, rgba(0,255,136,0.09), rgba(0,200,100,0.05))",
              border:"1px solid rgba(0,255,136,0.32)", borderRadius:14, cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:5,
              boxShadow:`0 0 ${executing==="buy" ? "22px" : "8px"} rgba(0,255,136,${executing==="buy" ? "0.18" : "0.07"})`,
              transition:"all 0.25s ease",
            }}>
              <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
                <path d="M11 4v14M5 10l6-6 6 6" stroke="rgba(0,255,136,0.88)"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize:11, fontFamily:SANS, fontWeight:800,
                color:"rgba(0,255,136,0.90)", letterSpacing:"0.04em" }}>
                {executing==="buy" ? "EXECUTING…" : "AI BUY"}
              </span>
              <span style={{ fontSize:7, fontFamily:SANS, color:"rgba(0,255,136,0.50)",
                letterSpacing:"0.08em" }}>LONG ENTRY</span>
            </button>

            <button onClick={() => handleExec("sell")} style={{
              position:"relative", overflow:"hidden", padding:"15px 0",
              background: executing==="sell" ? "rgba(255,51,85,0.14)" : "linear-gradient(160deg, rgba(255,51,85,0.09), rgba(200,40,60,0.05))",
              border:"1px solid rgba(255,51,85,0.32)", borderRadius:14, cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:5,
              boxShadow:`0 0 ${executing==="sell" ? "22px" : "8px"} rgba(255,51,85,${executing==="sell" ? "0.18" : "0.07"})`,
              transition:"all 0.25s ease",
            }}>
              <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
                <path d="M11 18V4M5 12l6 6 6-6" stroke="rgba(255,51,85,0.88)"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize:11, fontFamily:SANS, fontWeight:800,
                color:"rgba(255,51,85,0.90)", letterSpacing:"0.04em" }}>
                {executing==="sell" ? "EXECUTING…" : "AI SELL"}
              </span>
              <span style={{ fontSize:7, fontFamily:SANS, color:"rgba(255,51,85,0.50)",
                letterSpacing:"0.08em" }}>SHORT ENTRY</span>
            </button>
          </div>
        </div>

        {/* ── Risk panel ───────────────────────────────────────────────────────── */}
        <div style={{ background:CARD, border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:16, padding:"16px", marginBottom:14 }}>
          <div style={{ fontSize:8.5, fontFamily:SANS, fontWeight:700,
            color:"rgba(255,255,255,0.38)", letterSpacing:"0.20em",
            textTransform:"uppercase" as const, marginBottom:14 }}>Risk Parameters</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            {[
              { label:"Stop Loss",    val:"–3.8%",  color:"rgba(255,51,85,0.88)"  },
              { label:"Take Profit",  val:"+4.5%",  color:"rgba(0,255,136,0.88)"  },
              { label:"Max Exposure", val:"2.0%",   color:"rgba(0,229,255,0.82)"  },
              { label:"Risk Level",   val: conf>=75 ? "LOW" : conf>=60 ? "MED" : "HIGH",
                color: conf>=75 ? "rgba(0,255,136,0.88)" : conf>=60 ? "rgba(255,148,0,0.88)" : "rgba(255,51,85,0.88)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background:"rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, padding:"11px 12px" }}>
                <div style={{ fontSize:7.5, fontFamily:SANS, color:DIM,
                  letterSpacing:"0.10em", textTransform:"uppercase" as const, marginBottom:5 }}>{label}</div>
                <div style={{ fontSize:16, fontFamily:MONO, fontWeight:800, color }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ padding:"10px 12px",
            background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.12)",
            borderRadius:8, fontSize:9, fontFamily:SANS, color:"rgba(0,229,255,0.65)",
            lineHeight:1.55 }}>
            ⚡ Max 6 concurrent AI positions · Auto position sizing · Kill switch enabled · Paper trading mode
          </div>
        </div>

        {/* ── Related opportunities ────────────────────────────────────────────── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:8.5, fontFamily:SANS, fontWeight:700,
            color:"rgba(255,255,255,0.38)", letterSpacing:"0.20em",
            textTransform:"uppercase" as const, marginBottom:12 }}>Related Opportunities</div>
          <div style={{ display:"flex", gap:10, overflowX:"auto", overflowY:"hidden",
            paddingBottom:4, WebkitOverflowScrolling:"touch",
            scrollbarWidth:"none" as const }}>
            {related.map(rsym => {
              const ra = ASSET_DB[rsym];
              if (!ra) return null;
              const rcol  = SIG_COLOR[ra.action] ?? GR;
              const rHash = rsym.split("").reduce((a,c) => a + c.charCodeAt(0), 0);
              const rConf = 50 + (rHash * 7 + 13) % 44;
              return (
                <button key={rsym}
                  onClick={(e) => { e.stopPropagation(); navigateToAsset(rsym, ra.type); }}
                  style={{
                    flexShrink:0, width:100,
                    background:CARD, border:`1px solid ${SIG_BORDER[ra.action] ?? E}`,
                    borderRadius:13, padding:"11px 10px 9px", cursor:"pointer",
                    textAlign:"left" as const,
                  }}>
                  <div style={{ fontSize:11, fontFamily:MONO, fontWeight:700, color:W, marginBottom:3 }}>{rsym}</div>
                  <div style={{ marginBottom:7 }}>
                    <MicroSpark sym={rsym} action={ra.action} w={80} h={22}/>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:9, fontFamily:MONO, fontWeight:700, color:rcol }}>{rConf}%</span>
                    <span style={{ fontSize:7, fontFamily:SANS, fontWeight:700, color:rcol,
                      padding:"1px 5px", background:SIG_BG[ra.action],
                      border:`1px solid ${SIG_BORDER[ra.action]}`, borderRadius:3 }}>{ra.action}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.40;transform:scale(0.78)} }
        @keyframes pnl-flash    { 0%,100%{opacity:1} 50%{opacity:.74} }
        @keyframes edge-sweep   { 0%{opacity:.10;transform:scaleX(.25) translateX(-80%)} 50%{opacity:1;transform:scaleX(1) translateX(0)} 100%{opacity:.10;transform:scaleX(.25) translateX(80%)} }
        @keyframes orb-breathe  { 0%,100%{opacity:.50;transform:scale(1)} 50%{opacity:1;transform:scale(1.22)} }
        @keyframes cta-breathe  { 0%,100%{box-shadow:0 0 20px rgba(0,229,255,0.10)} 50%{box-shadow:0 0 45px rgba(0,229,255,0.22)} }
        @keyframes shimmer-sweep{ 0%{transform:translateX(-120%)} 100%{transform:translateX(120%)} }
        @keyframes candle-live  { 0%,100%{opacity:0.90;r:3} 50%{opacity:0.30} }
        @keyframes page-in      { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .page-enter             { animation: page-in 0.35s ease-out both; }
      `}</style>
    </div>
  );
}
