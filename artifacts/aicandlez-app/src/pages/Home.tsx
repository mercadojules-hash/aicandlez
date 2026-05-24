import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";
import { BrokerStatusCard } from "@/components/BrokerStatusCard";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { EnableLiveCTA } from "@/components/EnableLiveCTA";
import aicandlezLogoMaster from "../assets/aicandlez-logo-master.png";
import aicandlezIconMaster from "../assets/aicandlez-icon-master.png";
import {
  api,
  type MobileStatus, type Portfolio, type SimAccount,
  type Subscription, type SignalBreakdown, type MobileSignalsResponse,
  type MobileTickersResponse, type MobileTicker,
  type SimTrade,
} from "@/lib/api";
import { CryptoIcon } from "@/components/CryptoIcon";
import { OnboardingPanel } from "@/components/OnboardingPanel";
import { TradeDetailSheet } from "@/components/TradeDetailSheet";

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
// Real branded crypto asset icons live in `@/components/CryptoIcon` so the
// same SVG marks are used everywhere (Home, Signals, Portfolio, Trade, etc).
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// RADAR SCANNER — core UI system for AI scanning / signals / confidence
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// EXCHANGE WARNING CARD
// Surfaces per-connection failures returned by /api/user/exchanges/balances
// (auth failure, network timeout, revoked key, etc). Dismissible per
// error-set: dismissal is keyed on a fingerprint of the failing exchanges
// and their error strings so the card reappears the moment a new failure
// occurs and disappears the moment a retry succeeds.
// ═══════════════════════════════════════════════════════════════════════════

function ExchangeWarningCard({
  failing,
  onReconnect,
}: {
  failing: Array<{ exchange: string; error?: string }>;
  onReconnect: () => void;
}) {
  const fingerprint = failing.map(f => `${f.exchange}::${f.error ?? ""}`).sort().join("|");
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Reset dismissal whenever the underlying failure set changes so a new
  // problem (e.g. a *different* exchange now failing) re-surfaces the card.
  useEffect(() => {
    if (dismissed && dismissed !== fingerprint) setDismissed(null);
  }, [fingerprint, dismissed]);
  if (failing.length === 0 || dismissed === fingerprint) return null;
  const WARN_COLOR = "#FFB020";
  const WARN_DIM   = "rgba(255,176,32,0.14)";
  return (
    <div style={{
      margin: "0 16px 14px",
      padding: "14px 16px",
      borderRadius: 18,
      border: `1px solid rgba(255,176,32,0.45)`,
      background: `linear-gradient(160deg, ${WARN_DIM}, rgba(255,176,32,0.04) 60%, rgba(10,20,16,0.85) 100%)`,
      boxShadow: `0 14px 36px rgba(0,0,0,0.55), inset 0 0 30px rgba(255,176,32,0.08)`,
      fontFamily: SANS,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0,
        }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8,
            background: "rgba(255,176,32,0.18)",
            border: `1px solid rgba(255,176,32,0.6)`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: WARN_COLOR, fontWeight: 800, fontSize: 14, lineHeight: 1,
            flexShrink: 0,
          }}>!</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: WARN_COLOR,
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              Exchange connection issue
            </div>
            <div style={{
              fontSize: 10, color: TEXT_DIM, marginTop: 2,
            }}>
              Showing simulated balances until your exchange responds.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(fingerprint)}
          aria-label="Dismiss warning"
          style={{
            background: "transparent", border: "none", color: TEXT_DIM,
            fontSize: 16, lineHeight: 1, cursor: "pointer", padding: 4,
          }}
        >✕</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {failing.map(f => (
          <div key={f.exchange} style={{
            padding: "8px 10px", borderRadius: 10,
            background: "rgba(0,0,0,0.35)",
            border: `1px solid rgba(255,176,32,0.22)`,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 800, color: TEXT,
              letterSpacing: 0.6, minWidth: 70,
            }}>{f.exchange}</span>
            <span style={{
              flex: 1, fontSize: 10.5, color: TEXT_SUB, lineHeight: 1.5,
              wordBreak: "break-word",
            }}>
              {f.error ?? "Connection failed — exchange did not respond."}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onReconnect}
        style={{
          alignSelf: "stretch",
          padding: "10px 14px",
          background: `linear-gradient(180deg, ${WARN_COLOR}, #cc8a10)`,
          border: `1px solid ${WARN_COLOR}`,
          borderRadius: 10,
          color: "#1a1100",
          fontFamily: SANS, fontWeight: 800, fontSize: 12, letterSpacing: 1.2,
          textTransform: "uppercase", cursor: "pointer",
          boxShadow: `0 0 18px rgba(255,176,32,0.35)`,
        }}
      >
        Reconnect Exchange →
      </button>
    </div>
  );
}

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
  const { data: tradesData }  = useQuery<{ trades: SimTrade[] }>({
    queryKey: ["sim-trades"], queryFn: () => api.get("/simulation/trades"), refetchInterval: 12_000, retry: false });
  const { data: notifData } = useQuery<{ notifications: unknown[]; unread: number }>({
    queryKey: ["pwa-notifications"],
    queryFn:  () => api.get("/user/notifications"),
    refetchInterval: 15_000,
    retry:    false,
  });
  const unreadNotifications = notifData?.unread ?? 0;

  // Live balances across any per-user connected exchanges (Kraken/Coinbase/
  // Binance/etc — distinct from the Alpaca broker which goes through
  // BrokerConnectionContext). Refetches on focus + every 30s. Falls back to
  // sim when no okConnections exist.
  const { data: liveExchangeBalances } = useQuery<{
    connections: Array<{
      exchange:       string;
      ok:             boolean;
      totalEquityUSD: number;
      balances:       Record<string, { free: number; locked: number; total: number }>;
      error?:         string;
    }>;
    totalEquityUSD: number;
  }>({
    queryKey: ["user-exchanges-balances"],
    queryFn: () => api.get("/user/exchanges/balances"),
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
    staleTime:            10_000,
    retry: false,
  });
  const liveExchangeOk = (liveExchangeBalances?.connections ?? []).filter(c => c.ok);
  // Connections the API flagged as unhealthy (auth failed, network timeout,
  // revoked key, etc). Surfaced to the user in a dismissible inline card so
  // they aren't silently dropped to simulated balances.
  const liveExchangeFailing = (liveExchangeBalances?.connections ?? [])
    .filter(c => !c.ok)
    .map(c => ({ exchange: c.exchange, error: c.error }));
  const liveExchangeEquity = liveExchangeOk.length > 0 ? liveExchangeBalances!.totalEquityUSD : 0;
  const liveExchangeUsdFree = liveExchangeOk.reduce(
    (s, c) => s + (c.balances?.["USD"]?.free ?? c.balances?.["USDT"]?.free ?? c.balances?.["USDC"]?.free ?? 0), 0,
  );
  const liveExchangePrimary = liveExchangeOk[0]?.exchange ?? null;

  // ── Derived state ────────────────────────────────────────────────────────
  const engine   = status?.engine;
  const isLive   = engine?.mode === "live";
  const brokerConnected = brokerStatus === "paper_active" || brokerStatus === "live_active";
  const exchangeConnected = liveExchangeOk.length > 0;
  // Real-money priority: connected exchange balances first (Kraken etc),
  // then Alpaca, then simulated portfolio.
  const tv       = exchangeConnected
    ? liveExchangeEquity
    : brokerConnected
      ? (alpacaEquity > 0 ? alpacaEquity : (portfolio?.totalValue ?? 100_000))
      : (portfolio?.totalValue ?? 100_000);
  const pnl      = portfolio?.openPnL     ?? 0;
  const pnlPct   = tv > 0 ? (pnl/tv*100) : 0;
  const cashAvail = exchangeConnected && liveExchangeUsdFree > 0
    ? liveExchangeUsdFree
    : brokerConnected && alpacaBP > 0
      ? alpacaBP
      : tv * 0.855;
  const portfolioSourceLabel = exchangeConnected && liveExchangePrimary
    ? `${liveExchangePrimary} · Live`
    : brokerConnected
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

  // Top Gainers — elite AI-selected opportunities, not raw % movers.
  // Ranking score blends:
  //   • realized 24h move (momentum)
  //   • AI confidence on this symbol (from breakdowns)
  //   • directional alignment (BUY/LONG bonus, HOLD penalty)
  // Up to 10 of the strongest profitable performers.
  const topGainers = useMemo(() => {
    const tickers = (tickersData?.tickers ?? []).filter(t => t.changePercent24h > 0);
    const scored = tickers.map(t => {
      const bd = breakdowns[t.symbol];
      const conf = bd?.confidence ?? 0;
      const a = bd?.action?.toUpperCase();
      const isBuy = a === "BUY" || a === "LONG";
      const directionBonus = isBuy ? 25 : a === "HOLD" ? -10 : a ? -8 : 0;
      // Weighted: confidence dominates (×1.0), momentum amplifies (×3 per %),
      // direction tilts the ranking, ai-tracked symbols get a small floor bonus.
      const score = conf * 1.0
        + t.changePercent24h * 3
        + directionBonus
        + (bd ? 4 : 0);
      return { t, bd, score };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(x => x.t);
  }, [tickersData, breakdowns]);

  // ── Crypto Signals preview — top 4 actionable signals, sorted by AI confidence
  //    Lives above the Live Trades section as a compact AI shortlist.
  const cryptoSignalRows = useMemo(() => {
    return Object.entries(breakdowns)
      .map(([sym, b]) => ({ sym, ...b }))
      .filter(b => {
        const a = (b.action ?? "").toUpperCase();
        return a === "LONG" || a === "SHORT" || a === "BUY" || a === "SELL";
      })
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 4);
  }, [breakdowns]);

  // ── AI Market Scanner intelligence message ─────────────────────────────────
  // Rotates dynamically based on live signal density, volatility, AI confidence,
  // bullish/bearish ratios, momentum, and volume trends.
  const scannerStatus = useMemo(() => {
    const bdList = Object.values(breakdowns);
    const tickers = tickersData?.tickers ?? [];

    if (bdList.length === 0 && tickers.length === 0) {
      return { label: "Initializing market feed", tone: "neutral" as const };
    }

    const active = bdList.filter(b => b.action && b.action.toUpperCase() !== "HOLD");
    const buys = bdList.filter(b => { const a = b.action?.toUpperCase(); return a === "BUY" || a === "LONG"; }).length;
    const sells = bdList.filter(b => { const a = b.action?.toUpperCase(); return a === "SELL" || a === "SHORT"; }).length;
    const avgConf = bdList.length
      ? bdList.reduce((s, b) => s + (b.confidence ?? 0), 0) / bdList.length
      : 0;
    const topConf = bdList.reduce((m, b) => Math.max(m, b.confidence ?? 0), 0);

    const moves = tickers.map(t => t.changePercent24h);
    const upRatio = tickers.length ? tickers.filter(t => t.changePercent24h > 0).length / tickers.length : 0.5;
    const avgAbsMove = moves.length ? moves.reduce((s, m) => s + Math.abs(m), 0) / moves.length : 0;
    const maxMove = moves.length ? Math.max(...moves.map(Math.abs)) : 0;
    const avgMove = moves.length ? moves.reduce((s, m) => s + m, 0) / moves.length : 0;

    // Decision tree — most-specific first, falls back to ambient states.
    if (topConf >= 80 && buys >= sells) {
      return { label: "Strong breakout activity detected", tone: "pos" as const };
    }
    if (avgAbsMove >= 4.5 || maxMove >= 9) {
      return { label: "High volatility detected — proceed with caution", tone: "warn" as const };
    }
    if (upRatio >= 0.7 && avgMove > 1.5) {
      return { label: "Momentum increasing across crypto markets", tone: "pos" as const };
    }
    if (buys >= sells + 2 && avgConf >= 70 && upRatio >= 0.55) {
      return { label: "Bullish momentum strengthening", tone: "pos" as const };
    }
    if (upRatio <= 0.3 && avgMove < -1.5) {
      return { label: "Bearish pressure increasing", tone: "neg" as const };
    }
    if (buys >= sells * 2 && active.length >= 2) {
      return { label: "Market sentiment: Bullish", tone: "pos" as const };
    }
    if (sells >= buys * 2 && active.length >= 2) {
      return { label: "Market sentiment: Bearish", tone: "neg" as const };
    }
    if (active.length >= 2 && avgConf >= 70 && avgAbsMove <= 2 && upRatio >= 0.5) {
      return { label: "AI detecting institutional accumulation", tone: "pos" as const };
    }
    if (active.length >= 3 && avgConf >= 65) {
      return { label: "Trend continuation likely", tone: "pos" as const };
    }
    if (avgAbsMove >= 2.5 && Math.abs(buys - sells) <= 1) {
      return { label: "Risk elevated — choppy market", tone: "warn" as const };
    }
    if (avgAbsMove < 1.2 && active.length <= 1 && bdList.length >= 2) {
      return { label: "Volatility compression detected", tone: "neutral" as const };
    }
    if (active.length === 0 && avgAbsMove < 0.8) {
      return { label: "Accumulation patterns forming", tone: "neutral" as const };
    }
    if (avgConf < 50 && active.length <= 1) {
      return { label: "Low-confidence market conditions", tone: "neutral" as const };
    }
    if (avgConf >= 60 && upRatio >= 0.5 && avgAbsMove >= 1) {
      return { label: "Market conditions favorable", tone: "pos" as const };
    }
    if (upRatio > 0.55 && avgAbsMove < 2) {
      return { label: "Equity market cooling — crypto holding steady", tone: "neutral" as const };
    }
    if (active.length >= 1) {
      return { label: "AI tracking emerging opportunities", tone: "pos" as const };
    }
    return { label: "Scanning for high-confidence setups", tone: "neutral" as const };
  }, [breakdowns, tickersData]);

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

        {/* First-run onboarding (dismissible · localStorage-persisted) */}
        <OnboardingPanel />

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

          <div
            onClick={() => setLocation("/notifications")}
            style={{
              position: "relative", width: 38, height: 38, borderRadius: 12,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              color: TEXT_SUB,
            }}>
            {IconBell}
            {unreadNotifications > 0 && (
              <div style={{
                position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: "50%",
                background: NEG, boxShadow: `0 0 8px ${NEG}`,
              }}/>
            )}
          </div>
        </div>

        {/* Unhealthy exchange connection warning — non-blocking, dismissible.
            Renders only when /api/user/exchanges/balances reports ok:false
            for at least one connection so users aren't silently dropped to
            simulated balances without notice. Reconnect deep-links to the
            Connected Accounts section on the Profile page. */}
        <ExchangeWarningCard
          failing={liveExchangeFailing}
          onReconnect={() => setLocation("/profile")}
        />

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
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginTop: 16,
            paddingTop: 16, borderTop: `1px solid ${BORDER}`,
          }}>
            {([
              { l: "Available", v: fmtShort(cashAvail) },
              { l: "Positions", v: String(positions.length) },
              { l: "Win Rate",  v: `${(simAcc?.winRate ?? 0).toFixed(0)}%`, c: (simAcc?.winRate ?? 0) >= 55 ? POS : WARN },
              { l: "Fees Paid", v: `$${(simAcc?.totalFeesPaid ?? 0).toFixed(2)}`, c: (simAcc?.totalFeesPaid ?? 0) > 0 ? TEXT : TEXT_DIM },
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
          <QuickAction icon={IconDeposit} label="Fund Account" onClick={openOnboarding} accent={BRAND}/>
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
            (() => {
              const toneColor =
                scannerStatus.tone === "pos"  ? BRAND :
                scannerStatus.tone === "neg"  ? NEG   :
                scannerStatus.tone === "warn" ? WARN  : TEXT;
              const toneBg =
                scannerStatus.tone === "pos"  ? "rgba(102,255,102,0.05)" :
                scannerStatus.tone === "neg"  ? "rgba(255,64,96,0.06)"   :
                scannerStatus.tone === "warn" ? "rgba(255,185,74,0.06)"  : "rgba(255,255,255,0.03)";
              const toneBorder =
                scannerStatus.tone === "pos"  ? BORDER_HI :
                scannerStatus.tone === "neg"  ? "rgba(255,64,96,0.30)" :
                scannerStatus.tone === "warn" ? "rgba(255,185,74,0.30)" : BORDER;
              return (
                <div style={{
                  marginTop: 24, padding: "20px 16px", textAlign: "center",
                  borderRadius: 12, background: toneBg,
                  border: `1px dashed ${toneBorder}`,
                }}>
                  <div style={{
                    fontSize: 9, fontFamily: SANS, fontWeight: 800,
                    color: toneColor, letterSpacing: 1.4, textTransform: "uppercase",
                    marginBottom: 6, opacity: 0.85,
                  }}>
                    AI Market Pulse
                  </div>
                  <div style={{ fontSize: 13, fontFamily: SANS, fontWeight: 700, color: TEXT, lineHeight: 1.4, letterSpacing: -0.2 }}>
                    {scannerStatus.label}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: SANS, color: TEXT_SUB, marginTop: 5, letterSpacing: 0.2 }}>
                    Scanning 247 pairs · awaiting high-confidence setup
                  </div>
                </div>
              );
            })()
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
        <SectionHeader label="Top Gainers" right="AI-ranked" onMore={() => setLocation("/markets")}/>
        <div style={{
          margin: "0 16px", borderRadius: 20, overflow: "hidden",
          background: `linear-gradient(180deg, ${SURFACE} 0%, ${BG} 100%)`,
          border: `1px solid ${BORDER}`,
          boxShadow: `0 12px 32px rgba(0,0,0,0.5)`,
          maxHeight: 360,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
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
        {/* CRYPTO SIGNALS — compact AI shortlist (light-touch preview block) */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <SectionHeader label="Crypto Signals" right="AI Live" onMore={() => setLocation("/crypto")}/>
        <div style={{
          margin: "0 16px", borderRadius: 18, overflow: "hidden",
          background: `linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 60%, ${BG} 100%)`,
          border: `1px solid ${BORDER_HI}`,
          boxShadow: `0 8px 22px rgba(0,0,0,0.4)`,
        }}>
          {cryptoSignalRows.length === 0 ? (
            <div style={{ padding: "22px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontFamily: SANS, color: TEXT_DIM, lineHeight: 1.5 }}>
                Scanning for high-confidence setups.
              </div>
            </div>
          ) : (
            cryptoSignalRows.map((s, i) => (
              <SignalsPreviewRow
                key={s.sym}
                icon={<CryptoIcon sym={s.sym} size={28}/>}
                label={`${SYM_SHORT[s.sym] ?? s.sym?.replace("USD","")}/USDT`}
                sub={(() => {
                  const a = (s.action ?? "").toUpperCase();
                  return a === "LONG" || a === "BUY" ? "Bullish momentum"
                       : a === "SHORT" || a === "SELL" ? "Bearish pressure"
                       : "AI tracking";
                })()}
                action={(s.action ?? "").toUpperCase()}
                confidence={s.confidence ?? 0}
                last={i === cryptoSignalRows.length - 1}
              />
            ))
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* ACTIVE TRADES — real crypto icons + LONG/SHORT pills              */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <SectionHeader label="Live Trades" right={`${positions.length} open`} onMore={() => setLocation("/trade")}/>
        <div className="neon-scroll" style={{
          margin: "0 16px",
          maxHeight: 460,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          paddingRight: 6,
        }}>
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
            positions.slice(0, 15).map((p, i) => {
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

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TRADE HISTORY — cinematic AI execution log                        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <TradeHistorySection
          trades={tradesData?.trades ?? []}
          onMore={() => setLocation("/trade")}
        />

        {/* Broker connection */}
        <div style={{ padding: "18px 16px 0" }}>
          <BrokerStatusCard/>
        </div>

        <UpgradeBanner/>

        {/* Enable Live AI Trading — premium upgrade CTA above footer */}
        <EnableLiveCTA style={{ padding: "10px 16px 6px" }}/>

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

// ═══════════════════════════════════════════════════════════════════════════
// SIGNALS PREVIEW — shared compact row used by Crypto + Equity preview blocks
// Premium institutional row: icon · label · subtle context · action pill · %
// ═══════════════════════════════════════════════════════════════════════════
function SignalsPreviewRow({
  icon, label, sub, action, confidence, last,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  action: string;
  confidence: number;
  last: boolean;
}) {
  const a = (action ?? "").toUpperCase();
  const isLong  = a === "LONG"  || a === "BUY";
  const isShort = a === "SHORT" || a === "SELL";
  const color   = isLong ? BRAND : isShort ? NEG : TEXT_DIM;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      borderBottom: last ? "none" : `1px solid ${BORDER}`,
    }}>
      <div style={{ flex: "0 0 auto" }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontFamily: SANS, fontWeight: 700, color: TEXT,
          letterSpacing: -0.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{label}</div>
        <div style={{
          fontSize: 10, fontFamily: SANS, color: TEXT_DIM, marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          padding: "3px 8px", borderRadius: 5,
          background: `${color}1F`,
          border: `1px solid ${isLong ? BORDER_HI : isShort ? "rgba(255,64,96,0.30)" : BORDER}`,
          fontSize: 9, fontFamily: SANS, fontWeight: 800,
          color, letterSpacing: 1, textTransform: "uppercase",
        }}>{a}</span>
        <span style={{
          fontSize: 13, fontFamily: SANS, fontWeight: 700, color,
          minWidth: 38, textAlign: "right", fontVariantNumeric: "tabular-nums",
        }}>{Math.round(confidence)}%</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRADE HISTORY — cinematic AI execution log
// Glow-state cards · expandable details · AI reasoning tags · profit bars
// ═══════════════════════════════════════════════════════════════════════════
function TradeHistorySection({ trades: tradesInput, onMore }: {
  trades: SimTrade[]; onMore: () => void;
}) {
  const [openTrade, setOpenTrade] = useState<SimTrade | null>(null);

  // Defensive: tolerate non-array payloads (e.g. server returning {trades:[]}
  // vs raw array, or transient telemetry reshape). Preserves diagnostics.
  const trades = Array.isArray(tradesInput) ? tradesInput : [];
  if (!Array.isArray(tradesInput) && import.meta.env.DEV) {
    console.warn("[home] TradeHistorySection: trades not an array", tradesInput);
  }

  // Aggregate stats from REAL trades only — no fabrication
  const stats = useMemo(() => {
    if (trades.length === 0) return null;
    const wins = trades.filter(t => t.pnl > 0).length;
    const total = trades.length;
    const winRate = (wins / total) * 100;
    const netPnL = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const bestPct = trades.reduce((m, t) => Math.max(m, t.pnlPct ?? 0), 0);
    return { wins, total, winRate, netPnL, bestPct };
  }, [trades]);

  const recent = trades.slice(0, 15);

  return (
    <>
      <SectionHeader
        label="Trade History"
        right={stats ? `${stats.total} executed · ${stats.winRate.toFixed(0)}% win` : "AI Execution Log"}
        onMore={trades.length > 0 ? onMore : undefined}
      />

      <div className="neon-scroll" style={{
        margin: "0 16px",
        maxHeight: 520,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        paddingRight: 6,
      }}>
        {/* Aggregate banner — derived strictly from real trade records */}
        {stats && (
          <div style={{
            position: "relative", overflow: "hidden",
            padding: "14px 16px", borderRadius: 18, marginBottom: 12,
            background: `
              radial-gradient(circle at 0% 0%, rgba(102,255,102,0.10) 0%, transparent 55%),
              linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 60%, ${BG} 100%)
            `,
            border: `1px solid ${BORDER_HI}`,
            boxShadow: `0 8px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)`,
          }}>
            {/* sweep accent */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${BRAND_GLOW} 50%, transparent 100%)`,
              animation: "edge-sweep 6s ease-in-out infinite",
            }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: `linear-gradient(135deg, ${BRAND}22, ${BRAND_DEEP}18)`,
                border: `1px solid ${BORDER_HI}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: BRAND, boxShadow: `0 0 14px ${BRAND_BLOOM}`,
              }}>{IconSparkle}</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 9, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
                  letterSpacing: 1.2, textTransform: "uppercase",
                }}>AI Realized P&amp;L</div>
                <div style={{
                  fontSize: 22, fontFamily: SANS, fontWeight: 800,
                  color: stats.netPnL >= 0 ? POS : NEG,
                  letterSpacing: -0.6, fontVariantNumeric: "tabular-nums",
                  textShadow: `0 0 18px ${stats.netPnL >= 0 ? "rgba(102,255,102,0.35)" : "rgba(255,64,96,0.30)"}`,
                  marginTop: 2,
                }}>
                  {stats.netPnL >= 0 ? "+" : ""}${Math.abs(stats.netPnL).toFixed(2)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: 9, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
                  letterSpacing: 1.2, textTransform: "uppercase",
                }}>Best Trade</div>
                <div style={{
                  fontSize: 14, fontFamily: SANS, fontWeight: 700, color: POS,
                  marginTop: 2, fontVariantNumeric: "tabular-nums",
                }}>+{stats.bestPct.toFixed(2)}%</div>
              </div>
            </div>
            {/* mini win-rate bar */}
            <div style={{ marginTop: 10 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 5,
              }}>
                <span style={{
                  fontSize: 9, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
                  letterSpacing: 1.1, textTransform: "uppercase",
                }}>Win Rate · {stats.wins}/{stats.total}</span>
                <span style={{
                  fontSize: 11, fontFamily: SANS, fontWeight: 700, color: BRAND,
                  fontVariantNumeric: "tabular-nums",
                }}>{stats.winRate.toFixed(0)}%</span>
              </div>
              <div style={{
                position: "relative", height: 4, borderRadius: 999,
                background: "rgba(255,255,255,0.05)", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  width: `${Math.min(100, stats.winRate)}%`,
                  background: `linear-gradient(90deg, ${BRAND_DEEP} 0%, ${BRAND} 70%, ${BRAND_BRGT} 100%)`,
                  boxShadow: `0 0 10px ${BRAND_GLOW}`,
                  borderRadius: 999,
                  animation: "bar-in 1.2s ease-out",
                }}/>
              </div>
            </div>
          </div>
        )}

        {/* Trade cards */}
        {recent.length === 0 ? (
          <div style={{
            padding: "26px 18px", textAlign: "center", borderRadius: 18,
            background: `linear-gradient(160deg, ${SURFACE} 0%, ${BG} 100%)`,
            border: `1px dashed ${BORDER_HI}`,
          }}>
            <div style={{ fontSize: 13, fontFamily: SANS, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
              No closed trades yet
            </div>
            <div style={{ fontSize: 11, fontFamily: SANS, color: TEXT_SUB, lineHeight: 1.5 }}>
              The AI is scanning the market.<br/>
              Executed trades will appear here as they close.
            </div>
          </div>
        ) : (
          recent.map((t, i) => (
            <TradeHistoryCard key={t.id ?? i} trade={t} onOpen={setOpenTrade}/>
          ))
        )}
      </div>

      <TradeDetailSheet trade={openTrade} onClose={() => setOpenTrade(null)}/>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Broker-fee resolver — prefers the exchange-reported commission over the
// catalog estimate when available, mirroring `TradeDetailSheet.tsx` and the
// desktop Portal trade history panel. USD-stable broker fees feed PnL math
// directly; native-asset fees (BTC, BNB, …) are surfaced verbatim in the
// tooltip but USD totals fall back to the catalog estimate so receipts
// match account equity to the cent.
// ─────────────────────────────────────────────────────────────────────────────
const USD_STABLE_FEE_CCY = new Set([
  "USD","USDT","USDC","BUSD","DAI","TUSD","USDP","FDUSD","ZUSD",
]);
// Extract the base asset from a trading symbol so we can convert a broker
// fee quoted in the base currency (e.g. BTC on a BTC/USDT trade) to USD
// using the trade's exit price. Handles "BTC/USDT", "BTCUSDT", "BTC-USD",
// "XBTUSD" (Kraken) shapes. Returns null when no base asset can be derived.
function extractBaseAsset(symbol: string): string | null {
  if (!symbol) return null;
  const s = symbol.toUpperCase().replace(/[/\-_]/g, "");
  const quotes = ["USDT","USDC","BUSD","FDUSD","TUSD","USDP","DAI","ZUSD","USD"];
  for (const q of quotes) {
    if (s.endsWith(q) && s.length > q.length) {
      const base = s.slice(0, s.length - q.length);
      return base === "XBT" ? "BTC" : base;
    }
  }
  return null;
}
function resolveFeeLeg(
  brokerRaw:   number | string | null | undefined,
  brokerCcy:   string | null | undefined,
  estimateRaw: number | string | null | undefined,
  exitPrice?:  number,
  baseAsset?:  string | null,
): {
  /** Effective USD value to use in math + row display. */
  usd: number;
  /** True when the displayed USD amount came from broker data (either
   *  broker-quoted in a USD-stable currency, or converted from a native
   *  fee using the trade's exit price). */
  displayFromBroker: boolean;
  /** True when the broker reported any fee (regardless of currency). */
  fromBroker: boolean;
  /** True when the broker fee is in a USD-stable currency. */
  brokerIsUsd: boolean;
  /** Raw broker amount in the broker's quoted currency (when available). */
  brokerAmount?: number;
  /** Broker-quoted currency (when available). */
  brokerCcy?: string;
  /** Catalog estimate USD (when available). */
  estimate?: number;
} {
  const toN = (v: number | string | null | undefined): number | undefined => {
    if (v == null) return undefined;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : undefined;
  };
  const broker   = toN(brokerRaw);
  const estimate = toN(estimateRaw);
  const ccy      = brokerCcy ?? undefined;
  const fromBroker  = typeof broker === "number";
  const brokerIsUsd = fromBroker && (!ccy || USD_STABLE_FEE_CCY.has(ccy.toUpperCase()));
  // Convert native broker fee → USD when the fee currency matches the
  // trade's base asset and we have an exit price (e.g. a BTC fee on a
  // BTC/USDT trade can be priced via exitPrice).
  const ccyMatchesBase = !!(ccy && baseAsset && ccy.toUpperCase() === baseAsset.toUpperCase());
  const convertible = fromBroker && !brokerIsUsd && ccyMatchesBase
    && typeof exitPrice === "number" && exitPrice > 0;
  const brokerUsd = brokerIsUsd
    ? broker!
    : (convertible ? (broker! * exitPrice!) : undefined);
  const displayFromBroker = typeof brokerUsd === "number";
  const usd = displayFromBroker ? brokerUsd! : (estimate ?? 0);
  return { usd, displayFromBroker, fromBroker, brokerIsUsd,
           brokerAmount: broker, brokerCcy: ccy, estimate };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single expandable trade card with glow state + AI reasoning tags
// ─────────────────────────────────────────────────────────────────────────────
function TradeHistoryCard({ trade, onOpen }: { trade: SimTrade; onOpen: (t: SimTrade) => void }) {
  const isWin   = (trade.pnl ?? 0) >= 0;
  const sideUp  = (trade.side ?? "").toLowerCase();
  const isLong  = sideUp === "long" || sideUp === "buy";
  const pnl     = trade.pnl ?? 0;
  const pnlPct  = trade.pnlPct ?? 0;
  // Confidence: prefer real `score` if present, else derive from magnitude
  const confidence = typeof trade.score === "number"
    ? Math.max(0, Math.min(100, trade.score))
    : null;

  // Glow palette — green for wins, red for losses
  const accent = isWin ? BRAND : NEG;
  const accentDeep = isWin ? BRAND_DEEP : "#C8132F";
  const glowRgba = isWin ? "rgba(102,255,102,0.22)" : "rgba(255,64,96,0.22)";
  const glowSoft = isWin ? "rgba(102,255,102,0.10)" : "rgba(255,64,96,0.10)";

  // Profit bar magnitude (0-100% mapped from |pnlPct|, capped at 10%)
  const barPct = Math.min(100, Math.abs(pnlPct) * 10);

  // AI reasoning tags — derived strictly from real trade data
  const tags: string[] = [];
  if (confidence !== null) {
    tags.push(confidence >= 70 ? "High Confidence" : confidence >= 50 ? "Confirmed" : "Speculative");
  }
  if (isWin && pnlPct >= 3) tags.push("Target Hit");
  else if (!isWin && pnlPct <= -2) tags.push("Stop Out");
  else if (!isWin) tags.push("Scratched");
  else tags.push("Closed in Profit");
  tags.push(isLong ? "Trend Long" : "Trend Short");

  // Timestamp display
  const closedDate = useMemo(() => {
    if (!trade.closedAt) return "—";
    const d = new Date(trade.closedAt);
    if (Number.isNaN(d.getTime())) return trade.closedAt;
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30)  return `${days}d ago`;
    return d.toLocaleDateString();
  }, [trade.closedAt]);

  return (
    <div
      onClick={() => onOpen(trade)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(trade); } }}
      style={{
        position: "relative", overflow: "hidden", cursor: "pointer",
        marginBottom: 10, borderRadius: 18, padding: "14px 16px",
        background: `
          radial-gradient(circle at 0% 0%, ${glowSoft} 0%, transparent 55%),
          linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 55%, ${BG} 100%)
        `,
        border: `1px solid ${isWin ? BORDER_HI : "rgba(255,64,96,0.28)"}`,
        boxShadow: `
          0 10px 30px rgba(0,0,0,0.5),
          0 0 0 1px ${glowRgba} inset,
          0 0 22px -8px ${glowRgba}
        `,
        transition: "transform 0.18s ease, box-shadow 0.2s ease",
      }}
    >
      {/* Left accent rail */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 3,
        background: `linear-gradient(180deg, ${accent} 0%, ${accentDeep} 100%)`,
        boxShadow: `0 0 12px ${glowRgba}`,
      }}/>

      {/* Top-edge animated sweep */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${glowRgba} 50%, transparent 100%)`,
        animation: "edge-sweep 7s ease-in-out infinite",
      }}/>

      {/* Header row: icon + symbol + BUY/SELL + LONG/SHORT + PnL */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, position: "relative" }}>
        <CryptoIcon sym={trade.symbol} size={40}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 14, fontFamily: SANS, fontWeight: 700, color: TEXT,
              letterSpacing: -0.1,
            }}>
              {SYM_SHORT[trade.symbol] ?? trade.symbol.replace("USD","")}/USDT
            </span>
            {/* BUY / SELL pill */}
            <span style={{
              padding: "2px 7px", borderRadius: 4,
              background: isLong ? `${BRAND}1F` : `${NEG}1F`,
              border: `1px solid ${isLong ? BORDER_HI : "rgba(255,64,96,0.30)"}`,
              fontSize: 8.5, fontFamily: SANS, fontWeight: 800,
              color: isLong ? BRAND : NEG,
              letterSpacing: 0.8, textTransform: "uppercase",
            }}>{isLong ? "Buy" : "Sell"}</span>
            {/* LONG / SHORT pill */}
            <span style={{
              padding: "2px 7px", borderRadius: 4,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`,
              fontSize: 8.5, fontFamily: SANS, fontWeight: 700,
              color: TEXT_SUB, letterSpacing: 0.8, textTransform: "uppercase",
            }}>{isLong ? "Long" : "Short"}</span>
          </div>
          <div style={{
            fontSize: 10.5, fontFamily: SANS, color: TEXT_DIM,
            marginTop: 3, letterSpacing: 0.2,
          }}>
            {SYM_LABEL[trade.symbol] ?? trade.symbol} · {closedDate}
            {trade.exchange && (
              <>
                {" · "}
                <span
                  title={
                    trade.exchangeOrderId || trade.exchangeCloseOrderId
                      ? [
                          trade.exchangeOrderId      ? `Open order: ${trade.exchangeOrderId}`        : null,
                          trade.exchangeCloseOrderId ? `Close order: ${trade.exchangeCloseOrderId}` : null,
                        ].filter(Boolean).join("\n")
                      : undefined
                  }
                  style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    marginLeft: 2,
                    border: `1px solid ${BRAND}55`,
                    background: `${BRAND}14`,
                    color: BRAND,
                    fontFamily: SANS, fontWeight: 800,
                    fontSize: 8.5, letterSpacing: 0.8,
                    textTransform: "uppercase",
                    borderRadius: 3,
                  }}
                >
                  Live · {trade.exchange}
                </span>
              </>
            )}
          </div>
        </div>

        {/* AI confidence ring */}
        {confidence !== null && (
          <ConfidenceRing value={confidence} accent={accent}/>
        )}

        {/* PnL */}
        <div style={{ textAlign: "right", minWidth: 78 }}>
          <div style={{
            fontSize: 16, fontFamily: SANS, fontWeight: 800,
            color: accent, fontVariantNumeric: "tabular-nums",
            letterSpacing: -0.3,
            textShadow: `0 0 14px ${glowRgba}`,
          }}>
            {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(2)}
          </div>
          <div style={{
            fontSize: 11, fontFamily: SANS, fontWeight: 600, color: accent,
            marginTop: 1, fontVariantNumeric: "tabular-nums",
          }}>
            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
          </div>
          {(() => {
            // Prefer broker-reported commissions when present; fall back to
            // the catalog estimate otherwise. Native-currency broker fees
            // (e.g. BTC, BNB) are shown in the tooltip and don't override
            // the USD estimate used for math, so this row matches the
            // expanded receipt + desktop Portal trade history to the cent.
            const baseAsset = extractBaseAsset(trade.symbol);
            const entryLeg = resolveFeeLeg(
              trade.entryFeeBroker, trade.entryFeeBrokerCurrency, trade.entryFee,
              trade.exitPrice, baseAsset,
            );
            const exitLeg  = resolveFeeLeg(
              trade.exitFeeBroker,  trade.exitFeeBrokerCurrency,  trade.exitFee,
              trade.exitPrice, baseAsset,
            );
            const haveLeg  = entryLeg.fromBroker || entryLeg.estimate != null
                          || exitLeg.fromBroker  || exitLeg.estimate  != null;
            const fees     = haveLeg
              ? entryLeg.usd + exitLeg.usd
              : (typeof trade.netFees === "number" ? trade.netFees : 0);
            if (!(fees > 0)) return null;
            // "Actual" pill only when BOTH legs' displayed USD amount came
            // from real broker data (either broker quoted in a USD-stable
            // currency, or a native fee converted via the trade's exit
            // price). Any leg that fell back to the catalog estimate
            // demotes the row to "Est." so the label always matches what
            // the user is actually reading.
            const bothActual = entryLeg.displayFromBroker && exitLeg.displayFromBroker;
            const pillLabel  = bothActual ? "Actual" : "Est.";
            const pillColor  = bothActual ? BRAND : TEXT_DIM;
            const fmtLeg = (legName: string, leg: ReturnType<typeof resolveFeeLeg>): string | null => {
              if (leg.fromBroker) {
                const ccy = leg.brokerCcy && !leg.brokerIsUsd ? ` ${leg.brokerCcy}` : "";
                const dp  = leg.brokerIsUsd ? 2 : ((leg.brokerAmount ?? 0) < 1 ? 6 : 4);
                const sym = leg.brokerIsUsd ? "$" : "";
                return `${legName}: ${sym}${(leg.brokerAmount ?? 0).toFixed(dp)}${ccy} · charged by broker`;
              }
              if (leg.estimate != null) {
                return `${legName}: $${leg.estimate.toFixed(2)} (est.)`;
              }
              return null;
            };
            const tipLines: string[] = [];
            const eTip = fmtLeg("Opening commission", entryLeg);
            const xTip = fmtLeg("Closing commission", exitLeg);
            if (eTip) tipLines.push(eTip);
            if (xTip) tipLines.push(xTip);
            tipLines.push(`Net P&L after fees: ${(pnl - fees) >= 0 ? "+" : "−"}$${Math.abs(pnl - fees).toFixed(2)}`);
            const tip = tipLines.join("\n");
            return (
              <div
                title={tip}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "flex-end",
                  gap: 4, marginTop: 3,
                }}
              >
                <span style={{
                  padding: "1px 5px", borderRadius: 3,
                  background: `${pillColor}1F`,
                  border: `1px solid ${pillColor}55`,
                  fontSize: 7.5, fontFamily: SANS, fontWeight: 800,
                  color: pillColor, letterSpacing: 0.8, textTransform: "uppercase",
                  lineHeight: 1.2,
                }}>{pillLabel}</span>
                <span style={{
                  fontSize: 9, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
                  letterSpacing: 0.4,
                  fontVariantNumeric: "tabular-nums", textTransform: "uppercase",
                }}>
                  −${fees.toFixed(2)} fees
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Animated profit/loss bar */}
      <div style={{ marginTop: 12, position: "relative" }}>
        <div style={{
          height: 5, borderRadius: 999, overflow: "hidden",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid rgba(255,255,255,0.03)`,
        }}>
          <div style={{
            height: "100%", width: `${barPct}%`,
            background: `linear-gradient(90deg, ${accentDeep} 0%, ${accent} 100%)`,
            boxShadow: `0 0 12px ${glowRgba}`,
            borderRadius: 999,
            animation: "bar-in 1s ease-out",
          }}/>
        </div>
      </div>

      {/* AI reasoning tags */}
      <div style={{ marginTop: 11, display: "flex", flexWrap: "wrap", gap: 5 }}>
        {tags.map(tag => (
          <span key={tag} style={{
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(102,255,102,0.06)",
            border: `1px solid rgba(102,255,102,0.16)`,
            fontSize: 9.5, fontFamily: SANS, fontWeight: 700,
            color: BRAND, letterSpacing: 0.4, textTransform: "uppercase",
          }}>{tag}</span>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            fontSize: 9, fontFamily: SANS, fontWeight: 700, color: BRAND,
            letterSpacing: 0.8, textTransform: "uppercase",
          }}>View Receipt</span>
          <span style={{
            color: BRAND, display: "inline-flex",
            transform: "rotate(-90deg)",
          }}>{IconChevron}</span>
        </span>
      </div>
    </div>
  );
}

// ── AI confidence ring (small circular gauge for the trade card) ────────────
function ConfidenceRing({ value, accent }: { value: number; accent: string }) {
  const size = 36;
  const r = 14;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3}/>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ filter: `drop-shadow(0 0 4px ${accent})` }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontFamily: SANS, fontWeight: 800, color: accent,
        letterSpacing: -0.2,
      }}>{Math.round(pct)}</div>
    </div>
  );
}

// ── Small labelled cell used in the expandable detail panel ─────────────────
function DetailCell({ label, value, accent }: {
  label: string; value: string; accent?: string;
}) {
  return (
    <div>
      <div style={{
        fontSize: 8.5, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
        letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 3,
      }}>{label}</div>
      <div style={{
        fontSize: 12, fontFamily: SANS, fontWeight: 700,
        color: accent ?? TEXT, letterSpacing: -0.1,
        fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
    </div>
  );
}
