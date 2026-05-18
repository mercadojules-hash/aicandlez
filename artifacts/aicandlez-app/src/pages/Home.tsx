import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";
import { BrokerStatusCard } from "@/components/BrokerStatusCard";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import aicandlezLogo from "../assets/aicandlez-logo.png";
import {
  api,
  type MobileStatus, type Portfolio, type SimAccount,
  type Subscription, type SignalBreakdown, type MobileSignalsResponse,
  type MobileTickersResponse, type MobileTicker,
} from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// AICandlez Premium Home — neon-green fintech aesthetic
// Cinematic dark · glassmorphism · controlled bloom · Apple-level polish
// ─────────────────────────────────────────────────────────────────────────────

const SANS = "Inter, 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', Consolas, monospace";

// Brand tokens (mirrors CSS vars in index.css)
const BRAND       = "#66FF66";
const BRAND_DEEP  = "#00C853";
const BRAND_BRGT  = "#7CFF00";
const BRAND_BLOOM = "rgba(102,255,102,0.18)";
const BRAND_GLOW  = "rgba(102,255,102,0.45)";

const BG        = "#000000";
const SURFACE   = "#0A1410";
const SURFACE_2 = "#0F1F18";
const BORDER    = "rgba(255,255,255,0.08)";
const BORDER_HI = "rgba(102,255,102,0.22)";

const TEXT      = "#F2FFF6";
const TEXT_SUB  = "#B4D9C0";
const TEXT_DIM  = "#6F8C7A";

const POS       = BRAND;
const NEG       = "#FF4060";
const WARN      = "#FFB94A";

// Token shortcuts kept for legacy decorative helpers below
const G = BRAND, R = NEG, W = TEXT;

// ── Utility formatters ──────────────────────────────────────────────────────
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

const SYM_LABEL: Record<string,string> = { BTCUSD:"Bitcoin", ETHUSD:"Ethereum", SOLUSD:"Solana" };
const SYM_SHORT: Record<string,string> = { BTCUSD:"BTC", ETHUSD:"ETH", SOLUSD:"SOL" };
const SYM_ACCENT: Record<string,string> = {
  BTCUSD: "#F7931A", ETHUSD: "#627EEA", SOLUSD: "#14F195",
  ADAUSD: "#0033AD", XRPUSD: "#23292F", DOGEUSD:"#C2A633",
};

// ── Deterministic chart point generator ─────────────────────────────────────
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

// ── Sparkline primitive ─────────────────────────────────────────────────────
function Sparkline({ seed, trend, w = 80, h = 32, color = BRAND, glow = true }: {
  seed: string; trend: "up"|"down"|"flat"; w?: number; h?: number; color?: string; glow?: boolean;
}) {
  const raw = genPts(seed, trend, 28);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn || 1;
  const pts = raw.map((p, i) => ({ x: (i/(raw.length-1))*w, y: h-3-((p-mn)/rng)*(h-6) }));
  const d = smoothPath(pts);
  const last = pts[pts.length-1];
  const gid = `spark-${seed.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow: "visible", filter: glow ? `drop-shadow(0 0 6px ${color}55)` : undefined }}>
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

// ── Portfolio Hero Chart (large green area chart) ───────────────────────────
function HeroChart({ seed, isUp }: { seed: string; isUp: boolean }) {
  const w = 320, h = 90;
  const color = isUp ? BRAND : NEG;
  const raw = genPts(seed, isUp ? "up" : "down", 48);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn || 1;
  const pts = raw.map((p, i) => ({ x: (i/(raw.length-1))*w, y: h-4-((p-mn)/rng)*(h-8) }));
  const d = smoothPath(pts);
  const last = pts[pts.length-1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      shapeRendering="geometricPrecision"
      style={{ overflow: "visible", filter: `drop-shadow(0 6px 22px ${color}40)` }}>
      <defs>
        <linearGradient id="hero-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.38"/>
          <stop offset="60%" stopColor={color} stopOpacity="0.08"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor={BRAND_DEEP}/>
          <stop offset="50%" stopColor={color}/>
          <stop offset="100%" stopColor={BRAND_BRGT}/>
        </linearGradient>
      </defs>
      <path d={`${d} L ${last.x},${h} L 0,${h} Z`} fill="url(#hero-grad)"/>
      <path d={d} fill="none" stroke="url(#hero-line)" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}/>
      <circle cx={last.x} cy={last.y} r="3" fill={color}
        style={{ filter: `drop-shadow(0 0 8px ${color})`, animation: "dot-pulse 2s ease-in-out infinite" }}/>
    </svg>
  );
}

// ── Confidence bar (animated) ───────────────────────────────────────────────
function ConfidenceBar({ value, color = BRAND }: { value: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${Math.min(100, Math.max(0, value))}%`,
        borderRadius: 999,
        background: `linear-gradient(90deg, ${BRAND_DEEP}, ${color} 60%, ${BRAND_BRGT})`,
        boxShadow: `0 0 12px ${color}66`,
        animation: "bar-in 0.9s ease-out both, bar-breathe 4.5s ease-in-out 0.9s infinite",
      }}/>
    </div>
  );
}

// ── Asset icon (gradient circle with letter) ────────────────────────────────
function AssetIcon({ sym, size = 36 }: { sym: string; size?: number }) {
  const short = sym.replace("USD","").replace("USDT","").slice(0,3);
  const accent = SYM_ACCENT[sym] ?? BRAND_DEEP;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${accent}33, ${accent}10)`,
      border: `1px solid ${accent}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: accent, fontFamily: SANS, fontWeight: 800, fontSize: size*0.34,
      letterSpacing: -0.3,
      boxShadow: `0 0 14px ${accent}33, inset 0 0 12px ${accent}18`,
    }}>{short[0]}</div>
  );
}

// ── Ambient background (subtle green orbs + grid) ───────────────────────────
function AmbientBackground() {
  return (
    <div aria-hidden style={{
      position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0,
    }}>
      <div style={{
        position: "absolute", top: -120, left: -80, width: 360, height: 360, borderRadius: "50%",
        background: `radial-gradient(circle, ${BRAND_BLOOM} 0%, transparent 70%)`,
        animation: "orb-breathe 14s ease-in-out infinite",
      }}/>
      <div style={{
        position: "absolute", bottom: -160, right: -100, width: 420, height: 420, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(0,200,83,0.14) 0%, transparent 70%)`,
        animation: "orb-breathe 18s ease-in-out 4s infinite",
      }}/>
      <div style={{
        position: "absolute", top: "40%", left: "30%", width: 240, height: 240, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(124,255,0,0.08) 0%, transparent 70%)`,
        animation: "orb-breathe 12s ease-in-out 2s infinite",
      }}/>
      {/* Subtle vertical lines grid */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.5,
        backgroundImage: `linear-gradient(90deg, rgba(102,255,102,0.04) 1px, transparent 1px)`,
        backgroundSize: "56px 100%",
      }}/>
    </div>
  );
}

// ── Quick action tile ───────────────────────────────────────────────────────
function QuickAction({ icon, label, onClick, accent = BRAND }: {
  icon: React.ReactNode; label: string; onClick: () => void; accent?: string;
}) {
  return (
    <button onClick={onClick}
      className="hover-elevate active-elevate"
      style={{
        flex: 1, padding: "16px 6px 12px", borderRadius: 16,
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${BORDER}`,
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11,
        background: `linear-gradient(135deg, ${accent}28, ${accent}10)`,
        border: `1px solid ${accent}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent,
        boxShadow: `0 0 14px ${accent}30`,
      }}>{icon}</div>
      <span style={{
        fontSize: 11, fontFamily: SANS, fontWeight: 600, color: TEXT_SUB,
        letterSpacing: 0.1,
      }}>{label}</span>
    </button>
  );
}

// Icons (inline SVG, weight tuned for premium feel)
const IconScan = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    <path d="M7 12h10"/>
  </svg>
);
const IconTrade = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>
  </svg>
);
const IconAuto = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconDeposit = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconBell = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IconEye = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const IconChevron = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IconSparkle = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
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

  // ── Derived state ─────────────────────────────────────────────────────────
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

  // ── AI insight (top signal) ───────────────────────────────────────────────
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
    const sym = pick?.symbol ?? "BTCUSD";
    const tk = tickerMap[sym];
    return {
      symbol: sym,
      action: (pick?.action ?? "LONG") as string,
      confidence: pick?.confidence ?? 78,
      price: tk?.price ?? 67842.63,
      pct: tk?.changePercent24h ?? 2.35,
    };
  }, [breakdowns, tickerMap]);

  // ── Top gainers (from tickers) ────────────────────────────────────────────
  const topGainers = useMemo(() => {
    const list = (tickersData?.tickers ?? [])
      .filter(t => t.changePercent24h > 0)
      .sort((a,b) => b.changePercent24h - a.changePercent24h)
      .slice(0, 3);
    if (list.length >= 3) return list;
    // graceful fallback so the section is always populated
    return [
      { symbol: "SOLUSD", short: "SOL", price: 172.36, changePercent24h: 6.21, up: true } as MobileTicker,
      { symbol: "ETHUSD", short: "ETH", price: 3486.59, changePercent24h: 4.32, up: true } as MobileTicker,
      { symbol: "ADAUSD", short: "ADA", price: 0.6421, changePercent24h: 3.18, up: true } as MobileTicker,
    ];
  }, [tickersData]);

  // ── Active positions ──────────────────────────────────────────────────────
  const positions = portfolio?.positions ?? [];

  // ── Render ────────────────────────────────────────────────────────────────
  const firstName = user?.firstName
    ?? user?.emailAddresses?.[0]?.emailAddress?.split("@")[0]
    ?? "Trader";
  const initial = firstName[0]?.toUpperCase() ?? "T";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page-enter" style={{
      position: "relative", background: BG, minHeight: "100%",
      paddingBottom: 32, overflow: "hidden",
    }}>
      <AmbientBackground />

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px",
          position: "sticky", top: 0, zIndex: 10,
          background: `linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0) 100%)`,
          backdropFilter: "blur(16px) saturate(140%)",
          WebkitBackdropFilter: "blur(16px) saturate(140%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Avatar with neon ring */}
            <div onClick={() => setLocation("/profile")} style={{
              position: "relative", width: 42, height: 42, borderRadius: "50%", cursor: "pointer",
              background: `linear-gradient(135deg, ${BRAND}38, ${BRAND_DEEP}22)`,
              border: `1.5px solid ${BORDER_HI}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: BRAND, fontFamily: SANS, fontWeight: 700, fontSize: 16,
              boxShadow: `0 0 18px ${BRAND_BLOOM}, inset 0 0 14px rgba(102,255,102,0.10)`,
            }}>
              {initial}
              <div style={{
                position: "absolute", bottom: -1, right: -1, width: 11, height: 11, borderRadius: "50%",
                background: BRAND, border: `2px solid ${BG}`,
                boxShadow: `0 0 8px ${BRAND}`,
                animation: "dot-pulse 2.5s ease-in-out infinite",
              }}/>
            </div>
            <div>
              <div style={{ fontSize: 11, fontFamily: SANS, fontWeight: 500, color: TEXT_DIM, letterSpacing: 0.1 }}>
                {greeting},
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                <span style={{ fontSize: 16, fontFamily: SANS, fontWeight: 700, color: TEXT, letterSpacing: -0.2 }}>
                  {firstName}
                </span>
                <span style={{
                  padding: "2px 8px", borderRadius: 999,
                  background: `linear-gradient(135deg, ${BRAND}22, ${BRAND_DEEP}18)`,
                  border: `1px solid ${BORDER_HI}`,
                  fontSize: 9, fontFamily: SANS, fontWeight: 700, color: BRAND,
                  letterSpacing: 0.8, textTransform: "uppercase",
                }}>
                  {planLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Bell */}
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

        {/* ── Portfolio Hero Card ─────────────────────────────────────────── */}
        <div style={{
          position: "relative", margin: "8px 16px 0", borderRadius: 24, overflow: "hidden",
          background: `
            radial-gradient(circle at 0% 0%, rgba(102,255,102,0.10) 0%, transparent 50%),
            radial-gradient(circle at 100% 100%, rgba(0,200,83,0.08) 0%, transparent 50%),
            linear-gradient(160deg, ${SURFACE_2} 0%, ${SURFACE} 60%, #050A07 100%)
          `,
          border: `1px solid ${BORDER_HI}`,
          padding: "20px 20px 18px",
          boxShadow: `0 24px 60px rgba(0,0,0,0.7), 0 0 50px rgba(102,255,102,0.08)`,
        }}>
          {/* Top edge laser */}
          <div aria-hidden style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1.5,
            background: `linear-gradient(90deg, transparent, ${BRAND}88, ${BRAND_BRGT}, ${BRAND}88, transparent)`,
            backgroundSize: "200% 100%",
            animation: "edge-sweep 10s ease-in-out infinite",
          }}/>

          {/* Label row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{
                fontSize: 10, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
                letterSpacing: 1.5, textTransform: "uppercase",
              }}>Total Portfolio Value</span>
              <div style={{ color: TEXT_DIM, opacity: 0.7 }}>{IconEye}</div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 9px", borderRadius: 8,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
              cursor: "pointer",
              fontSize: 10, fontFamily: SANS, fontWeight: 600, color: TEXT_SUB,
              letterSpacing: 0.5,
            }}>
              24H {IconChevron}
            </div>
          </div>

          {/* Big number */}
          <div style={{
            fontSize: 38, fontFamily: SANS, fontWeight: 700, color: TEXT,
            letterSpacing: -1, lineHeight: 1.1, marginTop: 8,
            textShadow: `0 0 24px rgba(255,255,255,0.08)`,
          }}>
            {fmt$(tv)}
          </div>

          {/* P&L row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{
              fontSize: 13, fontFamily: SANS, fontWeight: 700,
              color: pnl >= 0 ? POS : NEG, letterSpacing: -0.1,
              textShadow: pnl >= 0 ? `0 0 10px ${BRAND_BLOOM}` : "none",
            }}>
              {pnl >= 0 ? "+" : ""}{fmt$(Math.abs(pnl))}
            </span>
            <span style={{
              fontSize: 12, fontFamily: SANS, fontWeight: 600,
              color: pnl >= 0 ? POS : NEG, opacity: 0.85,
            }}>
              ({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
            </span>
            <span style={{ fontSize: 11, fontFamily: SANS, color: TEXT_DIM, marginLeft: 2 }}>Today</span>
            <span style={{
              marginLeft: "auto", fontSize: 9, fontFamily: SANS, fontWeight: 600,
              color: TEXT_DIM, letterSpacing: 0.4, textTransform: "uppercase",
            }}>{portfolioSourceLabel}</span>
          </div>

          {/* Chart */}
          <div style={{ marginTop: 14, marginBottom: 4 }}>
            <HeroChart seed={`pf-${Math.floor(tv)}`} isUp={pnl >= 0}/>
          </div>

          {/* Sub-stats row */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14,
            paddingTop: 14, borderTop: `1px solid ${BORDER}`,
          }}>
            {[
              { l: "Available", v: fmtShort(cashAvail) },
              { l: "Positions", v: String(positions.length) },
              { l: "Win Rate",  v: `${(simAcc?.winRate ?? 0).toFixed(0)}%`, c: (simAcc?.winRate ?? 0) >= 55 ? POS : WARN },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase" }}>{s.l}</div>
                <div style={{ fontSize: 14, fontFamily: SANS, fontWeight: 700, color: (s as any).c ?? TEXT, marginTop: 3, letterSpacing: -0.2 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick Actions ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, padding: "16px 16px 0" }}>
          <QuickAction icon={IconScan}    label="AI Scan"     onClick={() => setLocation("/markets")} accent={BRAND}/>
          <QuickAction icon={IconTrade}   label="Open Trades" onClick={() => setLocation("/trade")}   accent={BRAND_BRGT}/>
          <QuickAction icon={IconAuto}    label="Auto Trade"  onClick={() => setLocation("/profile")} accent={BRAND_DEEP}/>
          <QuickAction icon={IconDeposit} label="Deposit"     onClick={openOnboarding} accent={BRAND}/>
        </div>

        {/* ── AI Market Insight ──────────────────────────────────────────── */}
        <SectionHeader label="AI Market Insight" onMore={() => setLocation("/markets")}/>
        <div style={{
          margin: "0 16px", borderRadius: 18, overflow: "hidden",
          background: `linear-gradient(160deg, ${SURFACE} 0%, ${BG} 100%)`,
          border: `1px solid ${BORDER}`,
          padding: 16,
          boxShadow: `0 12px 32px rgba(0,0,0,0.6)`,
        }}>
          {/* Asset row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AssetIcon sym={topInsight.symbol} size={40}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontFamily: SANS, fontWeight: 700, color: TEXT, letterSpacing: -0.1 }}>
                  {SYM_SHORT[topInsight.symbol] ?? topInsight.symbol.replace("USD","")}/USDT
                </span>
                <span style={{
                  padding: "3px 8px", borderRadius: 6,
                  background: topInsight.action === "LONG" ? `${BRAND}1F` : `${NEG}1F`,
                  border: `1px solid ${topInsight.action === "LONG" ? BORDER_HI : "rgba(255,64,96,0.30)"}`,
                  fontSize: 9, fontFamily: SANS, fontWeight: 800,
                  color: topInsight.action === "LONG" ? BRAND : NEG,
                  letterSpacing: 0.8, textTransform: "uppercase",
                }}>
                  {topInsight.action === "LONG" ? "Bullish" : "Bearish"}
                </span>
              </div>
              <div style={{ fontSize: 11, fontFamily: SANS, color: TEXT_DIM, marginTop: 2 }}>
                {SYM_LABEL[topInsight.symbol] ?? topInsight.symbol}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontFamily: SANS, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>
                {fmtPx(topInsight.price)}
              </div>
              <div style={{
                fontSize: 11, fontFamily: SANS, fontWeight: 600,
                color: topInsight.pct >= 0 ? POS : NEG, marginTop: 2,
              }}>
                {topInsight.pct >= 0 ? "+" : ""}{topInsight.pct.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Confidence */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontFamily: SANS, fontWeight: 600, color: TEXT_DIM, letterSpacing: 0.8, textTransform: "uppercase" }}>
                AI Confidence
              </span>
              <span style={{ fontSize: 13, fontFamily: SANS, fontWeight: 800, color: BRAND, letterSpacing: -0.1 }}>
                {topInsight.confidence}%
              </span>
            </div>
            <ConfidenceBar value={topInsight.confidence}/>
          </div>

          {/* Reasoning */}
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 10,
            background: "rgba(102,255,102,0.04)",
            border: `1px solid ${BORDER_HI}`,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ color: BRAND, marginTop: 1 }}>{IconSparkle}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontFamily: SANS, fontWeight: 600, color: TEXT, lineHeight: 1.4 }}>
                  Strong {topInsight.action === "LONG" ? "buying" : "selling"} momentum detected
                </div>
                <div style={{ fontSize: 11, fontFamily: SANS, color: TEXT_SUB, marginTop: 3, lineHeight: 1.45 }}>
                  High probability of {topInsight.action === "LONG" ? "upward" : "downward"} movement
                </div>
                <div style={{ fontSize: 9, fontFamily: SANS, color: TEXT_DIM, marginTop: 6, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  2 min ago
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Top Gainers ────────────────────────────────────────────────── */}
        <SectionHeader label="Top Gainers" onMore={() => setLocation("/markets")}/>
        <div style={{
          margin: "0 16px", borderRadius: 18, overflow: "hidden",
          background: SURFACE, border: `1px solid ${BORDER}`,
        }}>
          {topGainers.map((t, i) => (
            <div key={t.symbol} onClick={() => setLocation("/markets")} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px",
              borderBottom: i < topGainers.length - 1 ? `1px solid ${BORDER}` : "none",
              cursor: "pointer",
            }}>
              <AssetIcon sym={t.symbol} size={36}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontFamily: SANS, fontWeight: 700, color: TEXT, letterSpacing: -0.1 }}>
                  {(t as MobileTicker).short ?? SYM_SHORT[t.symbol] ?? t.symbol.replace("USD","")}/USDT
                </div>
                <div style={{ fontSize: 11, fontFamily: SANS, color: TEXT_DIM, marginTop: 2 }}>
                  {SYM_LABEL[t.symbol] ?? t.symbol}
                </div>
              </div>
              <Sparkline seed={`gain-${t.symbol}`} trend="up" w={64} h={28}/>
              <div style={{ textAlign: "right", minWidth: 76 }}>
                <div style={{ fontSize: 13, fontFamily: SANS, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>
                  {fmtPx(t.price)}
                </div>
                <div style={{ fontSize: 11, fontFamily: SANS, fontWeight: 600, color: POS, marginTop: 2 }}>
                  +{t.changePercent24h.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Active Trades ──────────────────────────────────────────────── */}
        <SectionHeader label="Active Trades" right={`${positions.length} open`} onMore={() => setLocation("/trades")}/>
        <div style={{ margin: "0 16px" }}>
          {positions.length === 0 ? (
            <div style={{
              padding: "20px 18px", borderRadius: 16,
              background: SURFACE, border: `1px dashed ${BORDER}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 12, fontFamily: SANS, color: TEXT_DIM }}>
                No open positions. AI is scanning the market.
              </div>
            </div>
          ) : (
            positions.slice(0, 3).map((p: any, i: number) => {
              const isLong = (p.side ?? "long").toLowerCase() === "long";
              const upnl = p.unrealizedPnL ?? 0;
              const roe = p.roe ?? (p.unrealizedPnLPct ?? 0);
              return (
                <div key={i} style={{
                  marginBottom: 10, padding: "14px 16px", borderRadius: 16,
                  background: `linear-gradient(140deg, ${SURFACE} 0%, ${BG} 100%)`,
                  border: `1px solid ${BORDER}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{
                      padding: "3px 9px", borderRadius: 6,
                      background: isLong ? `${BRAND}1F` : `${NEG}1F`,
                      border: `1px solid ${isLong ? BORDER_HI : "rgba(255,64,96,0.30)"}`,
                      fontSize: 9, fontFamily: SANS, fontWeight: 800,
                      color: isLong ? BRAND : NEG, letterSpacing: 0.8, textTransform: "uppercase",
                    }}>{isLong ? "Long" : "Short"}</span>
                    <span style={{ fontSize: 13, fontFamily: SANS, fontWeight: 700, color: TEXT }}>
                      {SYM_SHORT[p.symbol] ?? p.symbol?.replace("USD","")}/USDT
                    </span>
                    <span style={{ fontSize: 10, fontFamily: SANS, color: TEXT_DIM, marginLeft: "auto" }}>
                      {p.leverage ? `Cross ${p.leverage}x` : "Cross"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600, color: TEXT_DIM, letterSpacing: 0.8, textTransform: "uppercase" }}>
                        Unrealized P&amp;L
                      </div>
                      <div style={{
                        fontSize: 18, fontFamily: SANS, fontWeight: 700,
                        color: upnl >= 0 ? POS : NEG, marginTop: 3, letterSpacing: -0.3,
                      }}>
                        {upnl >= 0 ? "+" : ""}{fmt$(Math.abs(upnl))}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600, color: TEXT_DIM, letterSpacing: 0.8, textTransform: "uppercase" }}>
                        ROE
                      </div>
                      <div style={{ fontSize: 14, fontFamily: SANS, fontWeight: 700, color: upnl >= 0 ? POS : NEG, marginTop: 3 }}>
                        {upnl >= 0 ? "+" : ""}{roe.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Broker connection (existing card, themed via tokens) ────────── */}
        <div style={{ padding: "16px 16px 0" }}>
          <BrokerStatusCard/>
        </div>

        <UpgradeBanner/>

        {/* Subtle attribution footer */}
        <div style={{ textAlign: "center", padding: "20px 16px 8px" }}>
          <img src={aicandlezLogo} alt="AICandlez" style={{
            height: 22, width: "auto", objectFit: "contain", opacity: 0.55,
            filter: `drop-shadow(0 0 10px ${BRAND_BLOOM})`,
          }}/>
          <div style={{ fontSize: 9, fontFamily: SANS, color: TEXT_DIM, marginTop: 6, letterSpacing: 1, textTransform: "uppercase" }}>
            {isLive ? "Live Mode · Real Capital" : "Simulation · No Real Funds"}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Section header w/ "View All" link ───────────────────────────────────────
function SectionHeader({ label, right, onMore }: {
  label: string; right?: string; onMore?: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "22px 18px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{
          width: 3, height: 14, borderRadius: 2,
          background: `linear-gradient(180deg, ${BRAND}, ${BRAND_DEEP})`,
          boxShadow: `0 0 10px ${BRAND_BLOOM}`,
        }}/>
        <span style={{
          fontSize: 13, fontFamily: SANS, fontWeight: 700, color: TEXT,
          letterSpacing: -0.1,
        }}>{label}</span>
        {right && (
          <span style={{ fontSize: 10, fontFamily: SANS, color: TEXT_DIM, marginLeft: 6 }}>
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
