import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";
import { BrokerStatusCard } from "@/components/BrokerStatusCard";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import aicandlezLogoMaster from "../assets/aicandlez-logo-master.png";
import aicandlezIconMaster from "../assets/aicandlez-icon-master.png";
import {
  api,
  type MobileStatus, type Portfolio, type SimAccount,
  type Subscription, type SignalBreakdown, type MobileSignalsResponse,
  type MobileTickersResponse, type MobileTicker,
} from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
// AICandlez — Premium Neon-Green Trading OS · Home Screen
// Cinematic dark · radar scanner core UI · real crypto icons · glowing BUY/SELL
// Visual benchmark: Apple keynote + Bloomberg Terminal + futuristic AI OS
// ═══════════════════════════════════════════════════════════════════════════

const SANS = "Inter, 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

// Brand
const BRAND       = "#66FF66";
const BRAND_DEEP  = "#00C853";
const BRAND_BRGT  = "#7CFF00";
const BRAND_BLOOM = "rgba(102,255,102,0.18)";
const BRAND_GLOW  = "rgba(102,255,102,0.45)";

// Surfaces
const BG        = "#000000";
const SURFACE   = "#0A1410";
const SURFACE_2 = "#0F1F18";
const BORDER    = "rgba(255,255,255,0.08)";
const BORDER_HI = "rgba(102,255,102,0.22)";

// Text
const TEXT     = "#F2FFF6";
const TEXT_SUB = "#B4D9C0";
const TEXT_DIM = "#6F8C7A";

const POS = BRAND;
const NEG = "#FF4060";
const WARN = "#FFB94A";

// ═══════════════════════════════════════════════════════════════════════════
// Real branded crypto asset icons (inline SVG, recognizable, premium)
// ═══════════════════════════════════════════════════════════════════════════

type CryptoIconProps = { size?: number; glow?: boolean };

function BTCIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #F7931A 0%, #C76E0F 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(247,147,26,0.45), inset 0 0 10px rgba(255,255,255,0.10)" : "none",
    }}>
      <svg width={size*0.62} height={size*0.62} viewBox="0 0 32 32" fill="none">
        <path d="M21.34 14.4c.3-1.98-1.21-3.04-3.27-3.75l.67-2.68-1.63-.41-.65 2.61c-.43-.11-.87-.21-1.31-.31l.66-2.63-1.63-.41-.67 2.68c-.36-.08-.71-.16-1.05-.25v-.01l-2.25-.56-.43 1.74s1.21.28 1.18.3c.66.16.78.6.76.95l-.77 3.05c.05.01.11.03.17.05l-.17-.04-1.07 4.28c-.08.2-.28.5-.74.38.02.02-1.18-.3-1.18-.3l-.81 1.87 2.13.53c.4.1.78.21 1.16.3l-.68 2.71 1.63.41.67-2.68c.44.12.88.23 1.3.34l-.67 2.66 1.63.41.68-2.71c2.78.53 4.86.32 5.74-2.2.71-2.03-.04-3.21-1.51-3.97 1.07-.25 1.87-.95 2.09-2.4zm-3.74 5.24c-.5 2.03-3.91.93-5.01.66l.9-3.59c1.1.27 4.64.82 4.11 2.93zm.5-5.27c-.46 1.84-3.3.91-4.21.68l.81-3.25c.91.23 3.88.65 3.4 2.57z" fill="white"/>
      </svg>
    </div>
  );
}

function ETHIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #6F7DEE 0%, #3A4DB5 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(98,126,234,0.45), inset 0 0 10px rgba(255,255,255,0.10)" : "none",
    }}>
      <svg width={size*0.50} height={size*0.62} viewBox="0 0 32 32" fill="none">
        <path d="M16 2 L16 11.7 L24.5 15.5 Z" fill="white" opacity="0.95"/>
        <path d="M16 2 L16 11.7 L7.5 15.5 Z" fill="white" opacity="0.65"/>
        <path d="M16 14 L16 22 L24.5 17 Z" fill="white" opacity="0.85"/>
        <path d="M16 14 L16 22 L7.5 17 Z" fill="white" opacity="0.55"/>
        <path d="M16 23.5 L16 30 L24.5 18.5 Z" fill="white" opacity="0.85"/>
        <path d="M16 23.5 L16 30 L7.5 18.5 Z" fill="white" opacity="0.55"/>
      </svg>
    </div>
  );
}

function SOLIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #0A0F1E 0%, #1A2640 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(20,241,149,0.40), inset 0 0 10px rgba(20,241,149,0.10)" : "none",
    }}>
      <svg width={size*0.62} height={size*0.42} viewBox="0 0 32 22" fill="none">
        <defs>
          <linearGradient id="sol-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14F195"/><stop offset="100%" stopColor="#9945FF"/>
          </linearGradient>
        </defs>
        <path d="M6 4 L26 4 L24 0 L4 0 Z" fill="url(#sol-g)"/>
        <path d="M6 13 L26 13 L24 9 L4 9 Z" fill="url(#sol-g)" opacity="0.85"/>
        <path d="M6 22 L26 22 L24 18 L4 18 Z" fill="url(#sol-g)" opacity="0.7"/>
      </svg>
    </div>
  );
}

function ADAIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #1259D6 0%, #0033AD 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
      boxShadow: glow ? "0 0 14px rgba(18,89,214,0.45), inset 0 0 10px rgba(255,255,255,0.08)" : "none",
    }}>
      <svg width={size*0.7} height={size*0.7} viewBox="0 0 32 32" fill="none">
        {/* Cardano stylized atomic dots */}
        <circle cx="16" cy="16" r="1.6" fill="white"/>
        <circle cx="16" cy="7"  r="1.2" fill="white"/>
        <circle cx="16" cy="25" r="1.2" fill="white"/>
        <circle cx="8"  cy="11.5" r="1.2" fill="white"/>
        <circle cx="24" cy="11.5" r="1.2" fill="white"/>
        <circle cx="8"  cy="20.5" r="1.2" fill="white"/>
        <circle cx="24" cy="20.5" r="1.2" fill="white"/>
        <circle cx="6"  cy="16" r="0.9" fill="white" opacity="0.7"/>
        <circle cx="26" cy="16" r="0.9" fill="white" opacity="0.7"/>
      </svg>
    </div>
  );
}

function AVAXIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #E84142 0%, #B0282A 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(232,65,66,0.45), inset 0 0 10px rgba(255,255,255,0.08)" : "none",
    }}>
      <svg width={size*0.58} height={size*0.58} viewBox="0 0 32 32" fill="none">
        <path d="M16 6 L26 24 L20 24 L17.6 19.6 L14.4 19.6 L16 16.6 L17 18.6 L19 18.6 L16 12.6 L11 24 L6 24 Z" fill="white"/>
      </svg>
    </div>
  );
}

function DOGEIcon({ size = 36, glow = true }: CryptoIconProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #D9B848 0%, #A38525 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: glow ? "0 0 14px rgba(217,184,72,0.45), inset 0 0 10px rgba(255,255,255,0.10)" : "none",
    }}>
      <svg width={size*0.6} height={size*0.65} viewBox="0 0 24 26" fill="none">
        <path d="M5 2 L13 2 C18.5 2 22 6 22 13 C22 20 18.5 24 13 24 L5 24 Z M9 6 L9 11 L7 11 L7 15 L9 15 L9 20 L13 20 C16 20 18 17.5 18 13 C18 8.5 16 6 13 6 Z" fill="white"/>
      </svg>
    </div>
  );
}

function GenericTokenIcon({ sym, size = 36 }: { sym: string; size?: number }) {
  const letter = sym.replace("USD","").replace("USDT","").slice(0,3)[0] ?? "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${BRAND_DEEP}55, ${BRAND}22)`,
      border: `1px solid ${BORDER_HI}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: BRAND, fontFamily: SANS, fontWeight: 800, fontSize: size*0.36,
      boxShadow: `0 0 12px ${BRAND_BLOOM}`,
    }}>{letter}</div>
  );
}

function CryptoIcon({ sym, size = 36, glow = true }: { sym: string; size?: number; glow?: boolean }) {
  const s = sym.replace("USDT","").replace("USD","");
  switch (s) {
    case "BTC":  return <BTCIcon size={size} glow={glow}/>;
    case "ETH":  return <ETHIcon size={size} glow={glow}/>;
    case "SOL":  return <SOLIcon size={size} glow={glow}/>;
    case "ADA":  return <ADAIcon size={size} glow={glow}/>;
    case "AVAX": return <AVAXIcon size={size} glow={glow}/>;
    case "DOGE": return <DOGEIcon size={size} glow={glow}/>;
    default:     return <GenericTokenIcon sym={sym} size={size}/>;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RADAR SCANNER — core UI system for AI scanning / signals / confidence
// ═══════════════════════════════════════════════════════════════════════════

type RadarBlip = { sym: string; angle: number; r: number; strong?: boolean };

function RadarScanner({
  size = 260,
  blips = [],
  status = "SCANNING",
}: {
  size?: number;
  blips?: RadarBlip[];
  status?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 12;

  return (
    <div style={{
      position: "relative", width: size, height: size,
      margin: "0 auto",
    }}>
      {/* Outer atmospheric glow */}
      <div style={{
        position: "absolute", inset: -20, borderRadius: "50%",
        background: `radial-gradient(circle, ${BRAND_BLOOM} 0%, transparent 70%)`,
        animation: "orb-breathe 6s ease-in-out infinite",
        pointerEvents: "none",
      }}/>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", inset: 0 }}>
        <defs>
          {/* Sweep gradient */}
          <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
            <stop offset="0%"  stopColor={BRAND_BRGT} stopOpacity="0"/>
            <stop offset="70%" stopColor={BRAND}      stopOpacity="0.4"/>
            <stop offset="100%" stopColor={BRAND_BRGT} stopOpacity="0.95"/>
          </linearGradient>
          <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#000000" stopOpacity="0.0"/>
            <stop offset="60%" stopColor="#031309" stopOpacity="0.55"/>
            <stop offset="100%" stopColor="#000000" stopOpacity="0.85"/>
          </radialGradient>
          <filter id="radar-glow">
            <feGaussianBlur stdDeviation="2"/>
          </filter>
        </defs>

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={maxR} fill="url(#radar-fill)"
          stroke={BRAND} strokeWidth="0.8" strokeOpacity="0.55"/>
        {/* Concentric rings */}
        {[0.78, 0.56, 0.34].map((f, i) => (
          <circle key={i} cx={cx} cy={cy} r={maxR*f}
            fill="none" stroke={BRAND} strokeOpacity={0.18 + i*0.05}
            strokeDasharray={i === 0 ? "0" : "2 4"} strokeWidth="0.6"/>
        ))}
        {/* Cross-hairs */}
        <line x1={cx} y1={cy-maxR} x2={cx} y2={cy+maxR}
          stroke={BRAND} strokeOpacity="0.16" strokeWidth="0.6" strokeDasharray="3 5"/>
        <line x1={cx-maxR} y1={cy} x2={cx+maxR} y2={cy}
          stroke={BRAND} strokeOpacity="0.16" strokeWidth="0.6" strokeDasharray="3 5"/>

        {/* Sweep arm — rotating */}
        <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: "radar-sweep-rotate 4s linear infinite" }}>
          <path
            d={`M ${cx} ${cy} L ${cx + maxR} ${cy} A ${maxR} ${maxR} 0 0 0 ${cx + Math.cos(-Math.PI/3)*maxR} ${cy + Math.sin(-Math.PI/3)*maxR} Z`}
            fill="url(#radar-sweep)"
            opacity="0.85"
          />
          {/* Bright leading edge */}
          <line x1={cx} y1={cy} x2={cx+maxR} y2={cy}
            stroke={BRAND_BRGT} strokeWidth="1.2" strokeOpacity="0.95"
            filter="url(#radar-glow)"/>
        </g>

        {/* Blips with labels */}
        {blips.map((b, i) => {
          const px = cx + Math.cos(b.angle) * maxR * b.r;
          const py = cy + Math.sin(b.angle) * maxR * b.r;
          return (
            <g key={i}>
              <circle cx={px} cy={py} r={b.strong ? 8 : 6}
                fill="none" stroke={BRAND} strokeOpacity="0.55"
                style={{ animation: `radar-ping ${2 + (i%3)*0.4}s ease-out infinite` }}/>
              <circle cx={px} cy={py} r={b.strong ? 2.6 : 2}
                fill={BRAND_BRGT}
                style={{ filter: `drop-shadow(0 0 6px ${BRAND_GLOW})`, animation: "dot-pulse 1.8s ease-in-out infinite" }}/>
            </g>
          );
        })}
      </svg>

      {/* Center: AICandlez icon logo */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: size*0.30, height: size*0.30,
        borderRadius: "50%",
        background: `radial-gradient(circle, #051208 0%, #000 70%)`,
        border: `1px solid ${BORDER_HI}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 22px ${BRAND_GLOW}, inset 0 0 12px ${BRAND_BLOOM}`,
        animation: "brand-pulse 3.5s ease-in-out infinite",
      }}>
        <img src={aicandlezIconMaster} alt=""
          style={{ width: "76%", height: "76%", objectFit: "contain",
            filter: `drop-shadow(0 0 8px ${BRAND_BLOOM})` }}/>
      </div>

      {/* Status label below */}
      <div style={{
        position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 7,
        padding: "5px 11px", borderRadius: 999,
        background: "rgba(0,0,0,0.7)",
        border: `1px solid ${BORDER_HI}`,
        backdropFilter: "blur(8px)",
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: BRAND,
          boxShadow: `0 0 8px ${BRAND}`,
          animation: "dot-pulse 1.4s ease-in-out infinite",
        }}/>
        <span style={{
          fontSize: 9, fontFamily: SANS, fontWeight: 700, color: BRAND,
          letterSpacing: 1.6, textTransform: "uppercase",
        }}>{status}</span>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes radar-sweep-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes radar-ping {
          0%   { transform: scale(0.6); opacity: 0.9; }
          80%  { transform: scale(1.6); opacity: 0;   }
          100% { transform: scale(1.6); opacity: 0;   }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility formatters
// ═══════════════════════════════════════════════════════════════════════════
function fmt$(n: number, dp = 2) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n/1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtPx(p: number) {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

const SYM_LABEL: Record<string,string> = {
  BTCUSD:"Bitcoin", ETHUSD:"Ethereum", SOLUSD:"Solana",
  ADAUSD:"Cardano", AVAXUSD:"Avalanche", DOGEUSD:"Dogecoin",
};
const SYM_SHORT: Record<string,string> = {
  BTCUSD:"BTC", ETHUSD:"ETH", SOLUSD:"SOL", ADAUSD:"ADA", AVAXUSD:"AVAX", DOGEUSD:"DOGE",
};

// ═══════════════════════════════════════════════════════════════════════════
// Deterministic chart points
// ═══════════════════════════════════════════════════════════════════════════
function genPts(seed: string, trend: "up"|"down"|"flat", count = 36) {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s<<5)+s) ^ seed.charCodeAt(i)) >>> 0;
  const rand = () => { s ^= s<<13; s ^= s>>17; s ^= s<<5; return (s>>>0)/0x100000000; };
  const dir = trend === "up" ? 1.4 : trend === "down" ? -1.4 : 0.05;
  const pts: number[] = []; let v = 50;
  for (let i = 0; i < count; i++) {
    v = Math.max(8, Math.min(92, v + (rand()-0.5)*7 + dir));
    pts.push(v);
  }
  return pts;
}
function smoothPath(pts: {x:number;y:number}[]) {
  const t = 0.33;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length-1; i++) {
    const p0 = pts[Math.max(0,i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1,i+2)];
    const cp1x = p1.x + (p2.x-p0.x)*t, cp1y = p1.y + (p2.y-p0.y)*t;
    const cp2x = p2.x - (p3.x-p1.x)*t, cp2y = p2.y - (p3.y-p1.y)*t;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function Sparkline({ seed, trend, w = 80, h = 32, color = BRAND }: {
  seed: string; trend: "up"|"down"|"flat"; w?: number; h?: number; color?: string;
}) {
  const raw = genPts(seed, trend, 28);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn || 1;
  const pts = raw.map((p, i) => ({ x: (i/(raw.length-1))*w, y: h-3-((p-mn)/rng)*(h-6) }));
  const d = smoothPath(pts);
  const last = pts[pts.length-1];
  const gid = `spark-${seed.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow: "visible", filter: `drop-shadow(0 0 6px ${color}55)` }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.32"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${d} L ${last.x},${h} L 0,${h} Z`} fill={`url(#${gid})`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last.x} cy={last.y} r="2.2" fill={color}
        style={{ animation: "dot-pulse 2.2s ease-in-out infinite" }}/>
    </svg>
  );
}

function HeroChart({ seed, isUp }: { seed: string; isUp: boolean }) {
  const w = 320, h = 110;
  const color = isUp ? BRAND : NEG;
  const raw = genPts(seed, isUp ? "up" : "down", 56);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn || 1;
  const pts = raw.map((p, i) => ({ x: (i/(raw.length-1))*w, y: h-4-((p-mn)/rng)*(h-8) }));
  const d = smoothPath(pts);
  const last = pts[pts.length-1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      shapeRendering="geometricPrecision"
      style={{ overflow: "visible", filter: `drop-shadow(0 8px 28px ${color}38)` }}>
      <defs>
        <linearGradient id="hero-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.42"/>
          <stop offset="55%" stopColor={color} stopOpacity="0.08"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor={BRAND_DEEP}/>
          <stop offset="50%" stopColor={color}/>
          <stop offset="100%" stopColor={BRAND_BRGT}/>
        </linearGradient>
      </defs>
      <path d={`${d} L ${last.x},${h} L 0,${h} Z`} fill="url(#hero-grad)"/>
      <path d={d} fill="none" stroke="url(#hero-line)" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}/>
      <circle cx={last.x} cy={last.y} r="3.4" fill={color}
        style={{ filter: `drop-shadow(0 0 10px ${color})`, animation: "dot-pulse 2s ease-in-out infinite" }}/>
    </svg>
  );
}

function ConfidenceBar({ value, color = BRAND }: { value: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${Math.min(100, Math.max(0, value))}%`,
        borderRadius: 999,
        background: `linear-gradient(90deg, ${BRAND_DEEP}, ${color} 60%, ${BRAND_BRGT})`,
        boxShadow: `0 0 14px ${color}88`,
        animation: "bar-in 0.9s ease-out both, bar-breathe 4.5s ease-in-out 0.9s infinite",
      }}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Atmospheric background — deep cinematic with light rays + ambient orbs
// ═══════════════════════════════════════════════════════════════════════════
function CinematicBackground() {
  return (
    <div aria-hidden style={{
      position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0,
    }}>
      {/* Ambient orbs */}
      <div style={{
        position: "absolute", top: -160, left: -100, width: 460, height: 460, borderRadius: "50%",
        background: `radial-gradient(circle, ${BRAND_BLOOM} 0%, transparent 65%)`,
        animation: "orb-breathe 14s ease-in-out infinite",
        filter: "blur(8px)",
      }}/>
      <div style={{
        position: "absolute", top: 380, right: -140, width: 520, height: 520, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(0,200,83,0.13) 0%, transparent 70%)`,
        animation: "orb-breathe 18s ease-in-out 4s infinite",
        filter: "blur(8px)",
      }}/>
      <div style={{
        position: "absolute", bottom: -200, left: "20%", width: 380, height: 380, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(124,255,0,0.10) 0%, transparent 65%)`,
        animation: "orb-breathe 16s ease-in-out 2s infinite",
        filter: "blur(8px)",
      }}/>
      {/* Vertical light ray (top-left → bottom-right) */}
      <div style={{
        position: "absolute", top: -100, left: "30%", width: 2, height: "70%",
        background: `linear-gradient(180deg, transparent 0%, ${BRAND_BLOOM} 30%, transparent 100%)`,
        transform: "rotate(18deg)", filter: "blur(2px)", opacity: 0.6,
      }}/>
      <div style={{
        position: "absolute", top: 100, right: "20%", width: 2, height: "60%",
        background: `linear-gradient(180deg, transparent 0%, ${BRAND_BLOOM} 30%, transparent 100%)`,
        transform: "rotate(-12deg)", filter: "blur(2px)", opacity: 0.4,
      }}/>
      {/* Fine grid */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.45,
        backgroundImage: `linear-gradient(90deg, rgba(102,255,102,0.035) 1px, transparent 1px)`,
        backgroundSize: "64px 100%",
      }}/>
      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)",
      }}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Icons (small Feather-style)
// ═══════════════════════════════════════════════════════════════════════════
const IconScan    = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>;
const IconTrade   = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>;
const IconAuto    = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>;
const IconDeposit = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconBell    = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const IconEye     = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconChevron = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IconSparkle = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>;
const IconArrowUp = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
const IconArrowDn = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;

// ═══════════════════════════════════════════════════════════════════════════
// Quick action tile
// ═══════════════════════════════════════════════════════════════════════════
function QuickAction({ icon, label, onClick, accent = BRAND }: {
  icon: React.ReactNode; label: string; onClick: () => void; accent?: string;
}) {
  return (
    <button onClick={onClick} className="hover-elevate active-elevate"
      style={{
        flex: 1, padding: "18px 6px 14px", borderRadius: 18,
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${BORDER}`,
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        cursor: "pointer", transition: "all 0.2s ease",
      }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: `linear-gradient(135deg, ${accent}28, ${accent}10)`,
        border: `1px solid ${accent}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent,
        boxShadow: `0 0 16px ${accent}30`,
      }}>{icon}</div>
      <span style={{
        fontSize: 11, fontFamily: SANS, fontWeight: 600, color: TEXT_SUB, letterSpacing: 0.1,
      }}>{label}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HOME COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function Home() {
  const [, setLocation] = useLocation();
  const { openOnboarding, status: brokerStatus, equity: alpacaEquity, buyingPower: alpacaBP } =
    useBrokerConnection();
  const { user } = useUser();

  const { data: status }    = useQuery<MobileStatus>({
    queryKey: ["mobile-status"], queryFn: () => api.get("/mobile/status"), refetchInterval: 5_000 });
  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["mobile-portfolio"], queryFn: () => api.get("/mobile/portfolio"), refetchInterval: 8_000 });
  const { data: simAcc }    = useQuery<SimAccount>({
    queryKey: ["sim-account"], queryFn: () => api.get("/account"), retry: false, staleTime: 60_000 });
  const { data: sub }       = useQuery<Subscription>({
    queryKey: ["subscription"], queryFn: () => api.get("/billing/subscription"), staleTime: 120_000, retry: false });
  const { data: signalsData } = useQuery<MobileSignalsResponse>({
    queryKey: ["mobile-signals"], queryFn: () => api.get("/mobile/signals"), refetchInterval: 8_000, retry: false });
  const { data: tickersData } = useQuery<MobileTickersResponse>({
    queryKey: ["mobile-tickers"], queryFn: () => api.get("/mobile/tickers"), refetchInterval: 15_000, retry: false });

  // ── Derived state ────────────────────────────────────────────────────────
  const engine   = status?.engine;
  const isLive   = engine?.mode === "live";
  const brokerConnected = brokerStatus === "paper_active" || brokerStatus === "live_active";
  const tv       = brokerConnected
    ? (alpacaEquity > 0 ? alpacaEquity : (portfolio?.totalValue ?? 100_000))
    : (portfolio?.totalValue ?? 100_000);
  const pnl      = portfolio?.openPnL     ?? 0;
  const pnlPct   = tv > 0 ? (pnl/tv*100) : 0;
  const cashAvail = brokerConnected && alpacaBP > 0 ? alpacaBP : tv * 0.855;
  const portfolioSourceLabel = brokerConnected
    ? (brokerStatus === "live_active" ? "Alpaca · Live" : "Alpaca · Paper")
    : "AI Sim Allocation";
  const plan = (sub?.plan ?? "free").toLowerCase();
  const planLabel = (plan.includes("active") || plan.includes("paid") || plan.includes("live"))
    ? "Pro" : "Trial";

  const breakdowns: Record<string, SignalBreakdown> = signalsData?.breakdowns ?? {};
  const tickerMap: Record<string, MobileTicker> = useMemo(() => {
    const m: Record<string, MobileTicker> = {};
    for (const t of tickersData?.tickers ?? []) m[t.symbol] = t;
    return m;
  }, [tickersData]);

  const topInsight = useMemo(() => {
    const candidates = Object.values(breakdowns)
      .filter(b => b.action && b.action !== "HOLD")
      .sort((a,b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const pick = candidates[0];
    if (!pick) return null;
    const tk = tickerMap[pick.symbol];
    // Normalize backend action: BUY/LONG → bullish, SELL/SHORT → bearish
    const a = pick.action.toUpperCase();
    const isBullish = a === "BUY" || a === "LONG";
    return {
      symbol: pick.symbol,
      isBullish,
      confidence: pick.confidence ?? 0,
      price: tk?.price ?? null,
      pct: tk?.changePercent24h ?? null,
    };
  }, [breakdowns, tickerMap]);

  const topGainers = useMemo(() => {
    return (tickersData?.tickers ?? [])
      .filter(t => t.changePercent24h > 0)
      .sort((a,b) => b.changePercent24h - a.changePercent24h)
      .slice(0, 3);
  }, [tickersData]);

  const positions = portfolio?.positions ?? [];

  const firstName = user?.firstName
    ?? user?.emailAddresses?.[0]?.emailAddress?.split("@")[0]
    ?? "Trader";
  const initial = firstName[0]?.toUpperCase() ?? "T";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Radar blips — fixed scattered positions for visual consistency
  const radarBlips: RadarBlip[] = [
    { sym: "BTC",  angle: -Math.PI*0.30, r: 0.62, strong: true },
    { sym: "ETH",  angle:  Math.PI*0.15, r: 0.78 },
    { sym: "SOL",  angle:  Math.PI*0.55, r: 0.48 },
    { sym: "ADA",  angle: -Math.PI*0.75, r: 0.86 },
    { sym: "AVAX", angle:  Math.PI*0.90, r: 0.72 },
    { sym: "DOGE", angle: -Math.PI*0.05, r: 0.36 },
  ];

  return (
    <div className="page-enter" style={{
      position: "relative", background: BG, minHeight: "100%",
      paddingBottom: 36, overflow: "hidden",
    }}>
      <CinematicBackground />

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* PROMINENT BRAND HEADER — centered AICandlez logo with green glow  */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <div style={{
          position: "relative",
          padding: "22px 20px 6px",
          display: "flex", justifyContent: "center", alignItems: "center",
        }}>
          <div style={{
            position: "absolute", inset: "10px 30% auto 30%", height: 60,
            background: `radial-gradient(ellipse, ${BRAND_BLOOM} 0%, transparent 70%)`,
            filter: "blur(14px)", pointerEvents: "none",
          }}/>
          <img src={aicandlezLogoMaster} alt="AICandlez"
            style={{
              height: 38, width: "auto", objectFit: "contain",
              filter: `drop-shadow(0 0 14px ${BRAND_BLOOM}) drop-shadow(0 4px 16px rgba(0,0,0,0.6))`,
              position: "relative", zIndex: 1,
            }}/>
        </div>

        {/* ── Greeting row (avatar + bell) ─────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 20px 18px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div onClick={() => setLocation("/profile")} style={{
              position: "relative", width: 38, height: 38, borderRadius: "50%", cursor: "pointer",
              background: `linear-gradient(135deg, ${BRAND}38, ${BRAND_DEEP}22)`,
              border: `1.5px solid ${BORDER_HI}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: BRAND, fontFamily: SANS, fontWeight: 700, fontSize: 14,
              boxShadow: `0 0 14px ${BRAND_BLOOM}`,
            }}>
              {initial}
              <div style={{
                position: "absolute", bottom: -1, right: -1, width: 10, height: 10, borderRadius: "50%",
                background: BRAND, border: `2px solid ${BG}`,
                boxShadow: `0 0 6px ${BRAND}`,
                animation: "dot-pulse 2.5s ease-in-out infinite",
              }}/>
            </div>
            <div>
              <div style={{ fontSize: 10, fontFamily: SANS, fontWeight: 500, color: TEXT_DIM, letterSpacing: 0.2 }}>
                {greeting},
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                <span style={{ fontSize: 15, fontFamily: SANS, fontWeight: 700, color: TEXT, letterSpacing: -0.2 }}>
                  {firstName}
                </span>
                <span style={{
                  padding: "2px 8px", borderRadius: 999,
                  background: `linear-gradient(135deg, ${BRAND}22, ${BRAND_DEEP}18)`,
                  border: `1px solid ${BORDER_HI}`,
                  fontSize: 9, fontFamily: SANS, fontWeight: 700, color: BRAND,
                  letterSpacing: 1, textTransform: "uppercase",
                }}>{planLabel}</span>
              </div>
            </div>
          </div>

          <div style={{
            position: "relative", width: 38, height: 38, borderRadius: 12,
            background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            color: TEXT_SUB,
          }}>
            {IconBell}
            <div style={{
              position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: "50%",
              background: NEG, boxShadow: `0 0 8px ${NEG}`,
            }}/>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* PORTFOLIO HERO CARD — cinematic, big number, deep glow             */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <div style={{
          position: "relative", margin: "0 16px 0", borderRadius: 28, overflow: "hidden",
          background: `
            radial-gradient(circle at 0% 0%, rgba(102,255,102,0.12) 0%, transparent 50%),
            radial-gradient(circle at 100% 100%, rgba(0,200,83,0.10) 0%, transparent 50%),
            linear-gradient(160deg, ${SURFACE_2} 0%, ${SURFACE} 60%, #050A07 100%)
          `,
          border: `1px solid ${BORDER_HI}`,
          padding: "22px 22px 20px",
          boxShadow: `0 28px 80px rgba(0,0,0,0.75), 0 0 70px rgba(102,255,102,0.10)`,
        }}>
          {/* Top edge sweep */}
          <div aria-hidden style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1.5,
            background: `linear-gradient(90deg, transparent, ${BRAND}88, ${BRAND_BRGT}, ${BRAND}88, transparent)`,
            backgroundSize: "200% 100%",
            animation: "edge-sweep 10s ease-in-out infinite",
          }}/>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{
                fontSize: 10, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
                letterSpacing: 2, textTransform: "uppercase",
              }}>Total Portfolio Value</span>
              <div style={{ color: TEXT_DIM, opacity: 0.7 }}>{IconEye}</div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 8,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
              cursor: "pointer",
              fontSize: 10, fontFamily: SANS, fontWeight: 600, color: TEXT_SUB,
              letterSpacing: 0.5,
            }}>
              24H {IconChevron}
            </div>
          </div>

          {/* BIG hero number — cinematic */}
          <div style={{
            fontSize: 48, fontFamily: SANS, fontWeight: 700, color: TEXT,
            letterSpacing: -1.6, lineHeight: 1.05, marginTop: 12,
            textShadow: `0 0 32px rgba(255,255,255,0.10), 0 2px 8px rgba(0,0,0,0.5)`,
            fontVariantNumeric: "tabular-nums",
          }}>
            {fmt$(tv)}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8 }}>
            <span style={{
              fontSize: 15, fontFamily: SANS, fontWeight: 700,
              color: pnl >= 0 ? POS : NEG, letterSpacing: -0.1,
              textShadow: pnl >= 0 ? `0 0 12px ${BRAND_BLOOM}` : "none",
            }}>
              {pnl >= 0 ? "+" : ""}{fmt$(Math.abs(pnl))}
            </span>
            <span style={{
              fontSize: 13, fontFamily: SANS, fontWeight: 600,
              color: pnl >= 0 ? POS : NEG, opacity: 0.85,
            }}>
              ({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
            </span>
            <span style={{ fontSize: 11, fontFamily: SANS, color: TEXT_DIM, marginLeft: 2 }}>Today</span>
            <span style={{
              marginLeft: "auto", fontSize: 9, fontFamily: SANS, fontWeight: 700,
              color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase",
            }}>{portfolioSourceLabel}</span>
          </div>

          <div style={{ marginTop: 18, marginBottom: 6 }}>
            <HeroChart seed={`pf-${Math.floor(tv)}`} isUp={pnl >= 0}/>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16,
            paddingTop: 16, borderTop: `1px solid ${BORDER}`,
          }}>
            {([
              { l: "Available", v: fmtShort(cashAvail) },
              { l: "Positions", v: String(positions.length) },
              { l: "Win Rate",  v: `${(simAcc?.winRate ?? 0).toFixed(0)}%`, c: (simAcc?.winRate ?? 0) >= 55 ? POS : WARN },
            ] as { l: string; v: string; c?: string }[]).map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM, letterSpacing: 1.3, textTransform: "uppercase" }}>{s.l}</div>
                <div style={{ fontSize: 16, fontFamily: SANS, fontWeight: 700, color: s.c ?? TEXT, marginTop: 4, letterSpacing: -0.2 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* QUICK ACTIONS                                                     */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <div style={{ display: "flex", gap: 10, padding: "18px 16px 0" }}>
          <QuickAction icon={IconScan}    label="AI Scan"     onClick={() => setLocation("/markets")} accent={BRAND}/>
          <QuickAction icon={IconTrade}   label="Open Trades" onClick={() => setLocation("/trade")}   accent={BRAND_BRGT}/>
          <QuickAction icon={IconAuto}    label="Auto Trade"  onClick={() => setLocation("/profile")} accent={BRAND_DEEP}/>
          <QuickAction icon={IconDeposit} label="Deposit"     onClick={openOnboarding} accent={BRAND}/>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* AI MARKET SCANNER — RADAR HERO + glowing BUY/SELL                 */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <SectionHeader label="AI Market Scanner" right="Live · 247 pairs"/>
        <div style={{
          position: "relative", margin: "0 16px", borderRadius: 24, overflow: "hidden",
          background: `
            radial-gradient(circle at 50% 0%, rgba(102,255,102,0.12) 0%, transparent 60%),
            linear-gradient(180deg, #06120A 0%, ${BG} 100%)
          `,
          border: `1px solid ${BORDER_HI}`,
          padding: "22px 18px 20px",
          boxShadow: `0 24px 60px rgba(0,0,0,0.65), 0 0 60px rgba(102,255,102,0.06)`,
        }}>
          {/* RADAR */}
          <RadarScanner size={260} blips={radarBlips} status="AI ACTIVE · SCANNING"/>

          {/* Top signal callout — only when AI has a real signal */}
          {topInsight ? (
            <>
              <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 12 }}>
                <CryptoIcon sym={topInsight.symbol} size={44}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontFamily: SANS, fontWeight: 700, color: TEXT, letterSpacing: -0.2 }}>
                      {SYM_SHORT[topInsight.symbol] ?? topInsight.symbol.replace("USD","")}/USDT
                    </span>
                    <span style={{
                      padding: "3px 8px", borderRadius: 6,
                      background: topInsight.isBullish ? `${BRAND}1F` : `${NEG}1F`,
                      border: `1px solid ${topInsight.isBullish ? BORDER_HI : "rgba(255,64,96,0.30)"}`,
                      fontSize: 9, fontFamily: SANS, fontWeight: 800,
                      color: topInsight.isBullish ? BRAND : NEG,
                      letterSpacing: 1, textTransform: "uppercase",
                    }}>
                      {topInsight.isBullish ? "Bullish" : "Bearish"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: SANS, color: TEXT_DIM, marginTop: 2 }}>
                    {SYM_LABEL[topInsight.symbol] ?? topInsight.symbol}
                  </div>
                </div>
                {topInsight.price !== null && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontFamily: SANS, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>
                      {fmtPx(topInsight.price)}
                    </div>
                    {topInsight.pct !== null && (
                      <div style={{
                        fontSize: 12, fontFamily: SANS, fontWeight: 600,
                        color: topInsight.pct >= 0 ? POS : NEG, marginTop: 2,
                      }}>
                        {topInsight.pct >= 0 ? "+" : ""}{topInsight.pct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 10, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM, letterSpacing: 1.2, textTransform: "uppercase" }}>
                    AI Confidence
                  </span>
                  <span style={{ fontSize: 14, fontFamily: SANS, fontWeight: 800, color: BRAND, letterSpacing: -0.1 }}>
                    {topInsight.confidence}%
                  </span>
                </div>
                <ConfidenceBar value={topInsight.confidence}/>
              </div>

              <div style={{
                marginTop: 14, padding: "11px 13px", borderRadius: 12,
                background: "rgba(102,255,102,0.05)",
                border: `1px solid ${BORDER_HI}`,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <div style={{ color: BRAND, marginTop: 1 }}>{IconSparkle}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontFamily: SANS, fontWeight: 600, color: TEXT, lineHeight: 1.45 }}>
                      Strong {topInsight.isBullish ? "buying" : "selling"} momentum detected
                    </div>
                    <div style={{ fontSize: 11, fontFamily: SANS, color: TEXT_SUB, marginTop: 3, lineHeight: 1.45 }}>
                      High probability of {topInsight.isBullish ? "upward" : "downward"} movement
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{
              marginTop: 24, padding: "20px 16px", textAlign: "center",
              borderRadius: 12, background: "rgba(102,255,102,0.04)",
              border: `1px dashed ${BORDER_HI}`,
            }}>
              <div style={{ fontSize: 12, fontFamily: SANS, fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>
                AI is scanning the market
              </div>
              <div style={{ fontSize: 11, fontFamily: SANS, color: TEXT_SUB, marginTop: 4 }}>
                No high-confidence signals right now. Sit tight.
              </div>
            </div>
          )}

          {/* GLOWING BUY / SELL CTA PAIR */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            <button onClick={() => setLocation("/trade")} style={{
              position: "relative", padding: "14px 0", borderRadius: 14, cursor: "pointer",
              background: `linear-gradient(180deg, ${BRAND} 0%, ${BRAND_DEEP} 100%)`,
              border: `1px solid ${BRAND_BRGT}`,
              color: "#031309", fontFamily: SANS, fontWeight: 800, fontSize: 14,
              letterSpacing: 0.6, textTransform: "uppercase",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              boxShadow: `0 0 24px ${BRAND_GLOW}, 0 8px 20px rgba(0,200,83,0.35), inset 0 1px 0 rgba(255,255,255,0.25)`,
              transition: "all 0.15s ease",
            }} onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
               onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}>
              {IconArrowUp} Buy
            </button>
            <button onClick={() => setLocation("/trade")} style={{
              position: "relative", padding: "14px 0", borderRadius: 14, cursor: "pointer",
              background: `linear-gradient(180deg, #2A0C12 0%, #1A0509 100%)`,
              border: `1px solid rgba(255,64,96,0.45)`,
              color: NEG, fontFamily: SANS, fontWeight: 800, fontSize: 14,
              letterSpacing: 0.6, textTransform: "uppercase",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              boxShadow: `0 0 18px rgba(255,64,96,0.30), 0 8px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`,
              transition: "all 0.15s ease",
            }} onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
               onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}>
              {IconArrowDn} Sell
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TOP GAINERS — real crypto icons + sparklines                      */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <SectionHeader label="Top Gainers" onMore={() => setLocation("/markets")}/>
        <div style={{
          margin: "0 16px", borderRadius: 20, overflow: "hidden",
          background: `linear-gradient(180deg, ${SURFACE} 0%, ${BG} 100%)`,
          border: `1px solid ${BORDER}`,
          boxShadow: `0 12px 32px rgba(0,0,0,0.5)`,
        }}>
          {topGainers.length === 0 ? (
            <div style={{ padding: "22px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 12, fontFamily: SANS, color: TEXT_DIM }}>
                Loading live market data…
              </div>
            </div>
          ) : topGainers.map((t, i) => {
            // Live AI signal lookup from real breakdowns (no fabrication)
            const bd = breakdowns[t.symbol];
            const sigAction = bd?.action?.toUpperCase();
            const sigBullish = sigAction === "BUY" || sigAction === "LONG";
            const showSignal = bd && sigAction && sigAction !== "HOLD";
            return (
              <div key={t.symbol} onClick={() => setLocation("/markets")} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "15px 18px",
                borderBottom: i < topGainers.length - 1 ? `1px solid ${BORDER}` : "none",
                cursor: "pointer",
                transition: "background 0.2s ease",
              }}>
                <CryptoIcon sym={t.symbol} size={38}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontFamily: SANS, fontWeight: 700, color: TEXT, letterSpacing: -0.1 }}>
                      {t.short ?? SYM_SHORT[t.symbol] ?? t.symbol.replace("USD","")}/USDT
                    </span>
                    {showSignal && (
                      <span style={{
                        padding: "2px 6px", borderRadius: 4,
                        background: sigBullish ? `${BRAND}1F` : `${NEG}1F`,
                        border: `1px solid ${sigBullish ? BORDER_HI : "rgba(255,64,96,0.30)"}`,
                        fontSize: 8, fontFamily: SANS, fontWeight: 800,
                        color: sigBullish ? BRAND : NEG,
                        letterSpacing: 0.8, textTransform: "uppercase",
                      }}>{sigAction}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, fontFamily: SANS, color: TEXT_DIM }}>
                      {SYM_LABEL[t.symbol] ?? t.symbol}
                    </span>
                    {showSignal && (
                      <span style={{ fontSize: 10, fontFamily: SANS, fontWeight: 700, color: BRAND, letterSpacing: 0.3 }}>
                        · AI {bd!.confidence}%
                      </span>
                    )}
                  </div>
                </div>
                <Sparkline seed={`gain-${t.symbol}`} trend="up" w={64} h={28}
                  color={showSignal ? (sigBullish ? BRAND : NEG) : BRAND}/>
                <div style={{ textAlign: "right", minWidth: 84 }}>
                  <div style={{ fontSize: 14, fontFamily: SANS, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>
                    {fmtPx(t.price)}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: SANS, fontWeight: 600, color: POS, marginTop: 2 }}>
                    +{t.changePercent24h.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* ACTIVE TRADES — real crypto icons + LONG/SHORT pills              */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <SectionHeader label="Active Trades" right={`${positions.length} open`} onMore={() => setLocation("/trade")}/>
        <div style={{ margin: "0 16px" }}>
          {positions.length === 0 ? (
            <div style={{
              padding: "26px 18px", borderRadius: 20,
              background: SURFACE, border: `1px dashed ${BORDER}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 12, fontFamily: SANS, color: TEXT_DIM, lineHeight: 1.5 }}>
                No open positions.<br/>
                <span style={{ color: BRAND, fontWeight: 600 }}>AI is scanning the market.</span>
              </div>
            </div>
          ) : (
            positions.slice(0, 3).map((p, i) => {
              const isLong = (p.side ?? "long").toLowerCase() === "long";
              const upnl = p.unrealizedPnL ?? 0;
              const notional = (p.size ?? 0) * (p.entryPrice ?? 0);
              const roe = notional > 0 ? (upnl / notional) * 100 : 0;
              return (
                <div key={i} style={{
                  marginBottom: 10, padding: "16px 18px", borderRadius: 18,
                  background: `linear-gradient(140deg, ${SURFACE} 0%, ${BG} 100%)`,
                  border: `1px solid ${BORDER}`,
                  boxShadow: `0 8px 22px rgba(0,0,0,0.4)`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                    <CryptoIcon sym={p.symbol} size={34}/>
                    <span style={{ fontSize: 14, fontFamily: SANS, fontWeight: 700, color: TEXT }}>
                      {SYM_SHORT[p.symbol] ?? p.symbol?.replace("USD","")}/USDT
                    </span>
                    <span style={{
                      padding: "3px 9px", borderRadius: 6,
                      background: isLong ? `${BRAND}1F` : `${NEG}1F`,
                      border: `1px solid ${isLong ? BORDER_HI : "rgba(255,64,96,0.30)"}`,
                      fontSize: 9, fontFamily: SANS, fontWeight: 800,
                      color: isLong ? BRAND : NEG, letterSpacing: 1, textTransform: "uppercase",
                    }}>{isLong ? "Long" : "Short"}</span>
                    <span style={{ fontSize: 10, fontFamily: SANS, color: TEXT_DIM, marginLeft: "auto" }}>
                      Spot
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase" }}>
                        Unrealized P&amp;L
                      </div>
                      <div style={{
                        fontSize: 22, fontFamily: SANS, fontWeight: 700,
                        color: upnl >= 0 ? POS : NEG, marginTop: 4, letterSpacing: -0.4,
                        textShadow: upnl >= 0 ? `0 0 12px ${BRAND_BLOOM}` : "none",
                      }}>
                        {upnl >= 0 ? "+" : ""}{fmt$(Math.abs(upnl))}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase" }}>
                        ROE
                      </div>
                      <div style={{ fontSize: 15, fontFamily: SANS, fontWeight: 700, color: upnl >= 0 ? POS : NEG, marginTop: 4 }}>
                        {upnl >= 0 ? "+" : ""}{roe.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Broker connection */}
        <div style={{ padding: "18px 16px 0" }}>
          <BrokerStatusCard/>
        </div>

        <UpgradeBanner/>

        {/* Status footer (no old logo — logo is now at top) */}
        <div style={{
          textAlign: "center", padding: "22px 16px 8px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: isLive ? NEG : BRAND,
            boxShadow: `0 0 8px ${isLive ? NEG : BRAND}`,
            animation: "dot-pulse 1.8s ease-in-out infinite",
          }}/>
          <span style={{
            fontSize: 9, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
            letterSpacing: 1.6, textTransform: "uppercase",
          }}>
            {isLive ? "Live Mode · Real Capital" : "Simulation · No Real Funds"}
          </span>
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Section header
// ═══════════════════════════════════════════════════════════════════════════
function SectionHeader({ label, right, onMore }: {
  label: string; right?: string; onMore?: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "28px 18px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 3, height: 16, borderRadius: 2,
          background: `linear-gradient(180deg, ${BRAND}, ${BRAND_DEEP})`,
          boxShadow: `0 0 10px ${BRAND_BLOOM}`,
        }}/>
        <span style={{
          fontSize: 15, fontFamily: SANS, fontWeight: 700, color: TEXT,
          letterSpacing: -0.2,
        }}>{label}</span>
        {right && (
          <span style={{
            fontSize: 10, fontFamily: SANS, fontWeight: 600, color: TEXT_DIM, marginLeft: 6,
            letterSpacing: 0.5, textTransform: "uppercase",
          }}>
            · {right}
          </span>
        )}
      </div>
      {onMore && (
        <button onClick={onMore} style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: 11, fontFamily: SANS, fontWeight: 600, color: BRAND,
          letterSpacing: 0.1, display: "flex", alignItems: "center", gap: 3,
        }}>
          View All →
        </button>
      )}
    </div>
  );
}
