import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type MobileSignalsResponse, type MobileTickersResponse, type SignalBreakdown } from "@/lib/api";
import { CryptoIcon, SYM_LABEL, SYM_SHORT } from "@/components/CryptoIcon";
import { EquityIcon, EQUITY_NAME, SUPPORTED_EQUITIES } from "@/components/EquityIcon";
import logoMaster from "@/assets/aicandlez-logo-master.png";

// ── Design tokens ────────────────────────────────────────────────────────────
const BG          = "#000000";
const SURFACE     = "#0A1410";
const SURFACE_2   = "#0F1F18";
const TEXT        = "#ECFFF1";
const TEXT_SUB    = "#9BB3A2";
const TEXT_DIM    = "#5A726A";
const BRAND       = "#66FF66";
const BRAND_DEEP  = "#00C853";
const BRAND_BRGT  = "#7CFF00";
const BRAND_GLOW  = "rgba(102,255,102,0.32)";
const BRAND_BLOOM = "rgba(102,255,102,0.18)";
const BORDER      = "rgba(255,255,255,0.06)";
const BORDER_HI   = "rgba(102,255,102,0.22)";
const NEG         = "#FF4060";
const NEG_DEEP    = "#C8132F";
const WARN        = "#FFB94A";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — derive deterministic AI levels from REAL price + signal
// ═══════════════════════════════════════════════════════════════════════════
function fmtPx(p: number) {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function fmtRange(a: number, b: number) {
  return `${fmtPx(Math.min(a,b))} – ${fmtPx(Math.max(a,b))}`;
}

function fmtRelTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Trade type derived from real signal data — deterministic, not fabricated
type TradeType = "Scalp" | "Swing Trade" | "Position Trade";
function deriveTradeType(b: SignalBreakdown): TradeType {
  // mtfConfirmed + 1H trend aligned → position trade (multi-day conviction)
  // mtfConfirmed only → swing trade
  // neither → scalp
  if (b.mtfConfirmed && (b.trend1H === "BULLISH" || b.trend1H === "BEARISH")) return "Position Trade";
  if (b.mtfConfirmed) return "Swing Trade";
  return "Scalp";
}

type SignalGrade = "STRONG BUY" | "BUY" | "STRONG SELL" | "SELL" | "HOLD";
function deriveGrade(action: string, confidence: number): SignalGrade {
  const a = action.toUpperCase();
  if (a === "BUY"  && confidence >= 80) return "STRONG BUY";
  if (a === "BUY")                       return "BUY";
  if (a === "SELL" && confidence >= 80) return "STRONG SELL";
  if (a === "SELL")                      return "SELL";
  return "HOLD";
}

function gradeColor(g: SignalGrade) {
  if (g === "STRONG BUY")  return { bg: `${BRAND}1A`,    fg: BRAND, border: BORDER_HI,                bloom: BRAND_GLOW };
  if (g === "BUY")          return { bg: `${BRAND}10`,    fg: BRAND, border: "rgba(102,255,102,0.18)", bloom: BRAND_BLOOM };
  if (g === "STRONG SELL") return { bg: "rgba(255,64,96,0.18)", fg: NEG, border: "rgba(255,64,96,0.32)", bloom: "rgba(255,64,96,0.32)" };
  if (g === "SELL")         return { bg: "rgba(255,64,96,0.10)", fg: NEG, border: "rgba(255,64,96,0.22)", bloom: "rgba(255,64,96,0.18)" };
  return { bg: "rgba(255,255,255,0.05)", fg: TEXT_SUB, border: BORDER, bloom: "rgba(255,255,255,0.04)" };
}

function confidenceColor(c: number) {
  if (c >= 75) return BRAND;
  if (c >= 55) return WARN;
  return NEG;
}

// Derive entry/TP/SL strictly from real price scaled by confidence.
// Higher confidence → tighter entry zone, wider TP, tighter SL.
function deriveLevels(price: number, action: string, confidence: number) {
  const isLong = action.toUpperCase() === "BUY";
  // confidence-scaled buffers (clamped to sane bounds)
  const c = Math.max(40, Math.min(95, confidence)) / 100;
  const entryHalf = 0.012 - c * 0.005;   // 1.2%→0.7% half-width
  const tpDist    = 0.035 + c * 0.04;    // 3.5%→7.5%
  const slDist    = 0.04  - c * 0.015;   // 4%→2.5%
  if (isLong) {
    return {
      entryLo: price * (1 - entryHalf),
      entryHi: price * (1 + entryHalf * 0.4),
      tp1:     price * (1 + tpDist * 0.55),
      tp2:     price * (1 + tpDist),
      sl:      price * (1 - slDist),
    };
  }
  return {
    entryLo: price * (1 - entryHalf * 0.4),
    entryHi: price * (1 + entryHalf),
    tp1:     price * (1 - tpDist * 0.55),
    tp2:     price * (1 - tpDist),
    sl:      price * (1 + slDist),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Deterministic sparkline (seeded by symbol — kept consistent across renders)
// ═══════════════════════════════════════════════════════════════════════════
function genPts(seed: string, trend: "up"|"down"|"flat", count = 32) {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s<<5)+s) ^ seed.charCodeAt(i)) >>> 0;
  const rand = () => { s ^= s<<13; s ^= s>>17; s ^= s<<5; return (s>>>0)/0x100000000; };
  const dir = trend === "up" ? 1.2 : trend === "down" ? -1.2 : 0.05;
  const pts: number[] = []; let v = 50;
  for (let i = 0; i < count; i++) {
    v = Math.max(8, Math.min(92, v + (rand()-0.5)*6.5 + dir));
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

function SignalSparkline({ seed, trend, w = 110, h = 38, color }: {
  seed: string; trend: "up"|"down"|"flat"; w?: number; h?: number; color: string;
}) {
  const raw = genPts(seed, trend, 32);
  const mn = Math.min(...raw), mx = Math.max(...raw), rng = mx-mn || 1;
  const pts = raw.map((p, i) => ({ x: (i/(raw.length-1))*w, y: h-3-((p-mn)/rng)*(h-6) }));
  const d = smoothPath(pts);
  const last = pts[pts.length-1];
  const gid = `sig-spark-${seed.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="geometricPrecision"
      style={{ overflow: "visible", filter: `drop-shadow(0 0 8px ${color}66)` }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.38"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${d} L ${last.x},${h} L 0,${h} Z`} fill={`url(#${gid})`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last.x} cy={last.y} r="2.4" fill={color}
        style={{ animation: "dot-pulse 2.2s ease-in-out infinite" }}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Confidence ring — large prominent gauge, color-state, animated pulse
// ═══════════════════════════════════════════════════════════════════════════
function ConfidenceGauge({ value }: { value: number }) {
  const size = 56;
  const r = 23;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = confidenceColor(pct);
  const dash = (pct / 100) * c;
  return (
    <div style={{
      position: "relative", width: size, height: size, flexShrink: 0,
    }}>
      {/* Outer bloom */}
      <div style={{
        position: "absolute", inset: -8, borderRadius: "50%",
        background: `radial-gradient(circle, ${color}33 0%, transparent 70%)`,
        animation: "orb-breathe 3.2s ease-in-out infinite",
        pointerEvents: "none",
      }}/>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4}/>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", lineHeight: 1,
      }}>
        <div style={{
          fontSize: 16, fontFamily: SANS, fontWeight: 800, color,
          letterSpacing: -0.4, fontVariantNumeric: "tabular-nums",
          textShadow: `0 0 10px ${color}`,
        }}>{Math.round(pct)}%</div>
        <div style={{
          fontSize: 7, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
          letterSpacing: 0.8, textTransform: "uppercase", marginTop: 2,
        }}>AI Conf</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Cinematic background — same atmospheric depth as Home
// ═══════════════════════════════════════════════════════════════════════════
function CinematicBackground() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: "-15%", left: "-10%", width: "70%", height: "60%",
        background: `radial-gradient(circle, ${BRAND_GLOW} 0%, transparent 65%)`,
        animation: "orb-breathe 9s ease-in-out infinite",
        filter: "blur(40px)", opacity: 0.45,
      }}/>
      <div style={{
        position: "absolute", bottom: "-10%", right: "-15%", width: "65%", height: "55%",
        background: `radial-gradient(circle, rgba(0,200,83,0.18) 0%, transparent 65%)`,
        animation: "orb-breathe 11s ease-in-out infinite 2s",
        filter: "blur(50px)", opacity: 0.55,
      }}/>
      <div style={{
        position: "absolute", top: "30%", right: "20%", width: "30%", height: "30%",
        background: `radial-gradient(circle, rgba(124,255,0,0.14) 0%, transparent 60%)`,
        animation: "orb-breathe 13s ease-in-out infinite 4s",
        filter: "blur(35px)", opacity: 0.5,
      }}/>
      {/* Vertical grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(90deg, rgba(102,255,102,0.04) 1px, transparent 1px)`,
        backgroundSize: "32px 100%", opacity: 0.5,
      }}/>
      {/* Edge vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)",
      }}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN — AI Signals page
// ═══════════════════════════════════════════════════════════════════════════
type TabKey = "active" | "crypto" | "equities";

export default function AISignals() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<TabKey>("active");
  const openAsset = (atype: "crypto" | "equity", asym: string) => {
    setLocation(`/asset/${atype}/${asym.toUpperCase()}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  // Real-data sources
  const signalsQ = useQuery<MobileSignalsResponse>({
    queryKey: ["mobile-signals"],
    queryFn:  () => api.get<MobileSignalsResponse>("/mobile/signals"),
    refetchInterval: 8_000,
  });

  const tickersQ = useQuery<MobileTickersResponse>({
    queryKey: ["mobile-tickers"],
    queryFn:  () => api.get<MobileTickersResponse>("/mobile/tickers"),
    refetchInterval: 6_000,
  });

  // Index ticker by symbol for quick lookup
  const tickerBySym = useMemo(() => {
    const m: Record<string, { price: number; changePercent24h: number; up: boolean }> = {};
    for (const t of (tickersQ.data?.tickers ?? [])) {
      m[t.symbol] = { price: t.price, changePercent24h: t.changePercent24h, up: t.up };
    }
    return m;
  }, [tickersQ.data]);

  // Build active signals list: only actionable BUY/SELL from real engine, joined
  // with real ticker price. Anything without a price is excluded (no fakes).
  // Active = top-N highest-conviction signals (ranked by confidence).
  const activeSignals = useMemo(() => {
    const breakdowns = signalsQ.data?.breakdowns ?? {};
    return Object.values(breakdowns)
      .filter(b => {
        const a = b.action.toUpperCase();
        return (a === "BUY" || a === "SELL") && !!tickerBySym[b.symbol];
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }, [signalsQ.data, tickerBySym]);

  // Crypto tab = ALL crypto signals (BUY/SELL/HOLD) ranked by confidence.
  // Real data only — any breakdown missing a live ticker is excluded.
  const cryptoSignals = useMemo(() => {
    const breakdowns = signalsQ.data?.breakdowns ?? {};
    return Object.values(breakdowns)
      .filter(b => !!tickerBySym[b.symbol])
      .sort((a, b) => b.confidence - a.confidence);
  }, [signalsQ.data, tickerBySym]);

  const loading = signalsQ.isLoading || tickersQ.isLoading;

  return (
    <div style={{
      minHeight: "100vh", background: BG, color: TEXT,
      fontFamily: SANS, position: "relative", paddingBottom: 100,
    }}>
      <CinematicBackground/>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* HERO HEADER — large glowing logo + tagline                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div style={{
          position: "relative", padding: "20px 16px 12px",
          textAlign: "center",
        }}>
          {/* logo glow under-layer */}
          <div style={{
            position: "absolute", top: 12, left: "50%",
            transform: "translateX(-50%)",
            width: 240, height: 90,
            background: `radial-gradient(ellipse, ${BRAND_GLOW} 0%, transparent 70%)`,
            filter: "blur(20px)", pointerEvents: "none",
            animation: "orb-breathe 5s ease-in-out infinite",
          }}/>
          <img src={logoMaster} alt="AICandlez"
            style={{
              position: "relative",
              height: 44, maxWidth: "70%", objectFit: "contain",
              filter: `drop-shadow(0 0 18px ${BRAND_GLOW}) drop-shadow(0 4px 22px rgba(0,200,83,0.45))`,
            }}/>
          <div style={{
            marginTop: 14,
            fontSize: 24, fontFamily: SANS, fontWeight: 800,
            letterSpacing: -0.8, lineHeight: 1.15, color: TEXT,
          }}>
            AI Signals.<br/>
            <span style={{
              background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_BRGT} 100%)`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text", filter: `drop-shadow(0 0 14px ${BRAND_GLOW})`,
            }}>Smarter Decisions.</span>
          </div>

          {/* Feature pills — three quick-trust indicators */}
          <div style={{
            marginTop: 14, display: "flex", justifyContent: "center", gap: 12,
            padding: "0 4px", flexWrap: "wrap",
          }}>
            <FeaturePill icon={IconCrosshair} title="High Accuracy"
              subtitle="Proven AI · historical performance"/>
            <FeaturePill icon={IconBolt}      title="Real-Time Alerts"
              subtitle="High-probability setups"/>
            <FeaturePill icon={IconChart}     title="Actionable"
              subtitle="Entry · targets · risk"/>
          </div>

          {/* Title row with filter / settings */}
          <div style={{
            marginTop: 22, display: "flex", alignItems: "center",
            justifyContent: "space-between", padding: "0 4px",
          }}>
            <span style={{
              fontSize: 22, fontFamily: SANS, fontWeight: 800,
              letterSpacing: -0.5, color: TEXT,
              textShadow: `0 0 18px ${BRAND_BLOOM}`,
            }}>AI Signals</span>
            <div style={{ display: "flex", gap: 8 }}>
              <IconButton aria-label="Filter">{IconFilter}</IconButton>
              <IconButton aria-label="Settings" onClick={() => setLocation("/profile")}>
                {IconSettings}
              </IconButton>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB BAR — Active / Watchlist / History                           */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div style={{
          margin: "4px 16px 16px",
          display: "flex", gap: 4, padding: 4, borderRadius: 999,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${BORDER}`,
        }}>
          <TabPill
            label="Active Signals" badge={activeSignals.length}
            active={tab === "active"} onClick={() => setTab("active")}/>
          <TabPill
            label="Crypto" badge={cryptoSignals.length}
            active={tab === "crypto"} onClick={() => setTab("crypto")}/>
          <TabPill
            label="Equities"
            active={tab === "equities"} onClick={() => setTab("equities")}/>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SIGNAL CARDS                                                     */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div style={{ padding: "0 16px" }}>
          {loading && (
            <LoadingState/>
          )}

          {!loading && tab === "active" && (
            activeSignals.length === 0
              ? <EmptyState
                  title="No actionable signals right now"
                  body="The AI is continuously scanning the market. New high-confidence opportunities will appear here as they form."/>
              : <>
                  <div style={{
                    margin: "2px 2px 12px", display: "flex", alignItems: "center",
                    gap: 8, fontSize: 10.5, fontFamily: SANS, fontWeight: 700,
                    color: TEXT_DIM, letterSpacing: 1.2, textTransform: "uppercase",
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", background: BRAND,
                      boxShadow: `0 0 10px ${BRAND_GLOW}`,
                      animation: "dot-pulse 1.8s ease-in-out infinite",
                    }}/>
                    Top {activeSignals.length} · ranked by AI confidence
                  </div>
                  {activeSignals.map(b => (
                    <SignalCard
                      key={b.symbol}
                      breakdown={b}
                      ticker={tickerBySym[b.symbol]}
                      onOpen={() => openAsset("crypto", SYM_SHORT[b.symbol] ?? b.symbol.replace("USD",""))}/>
                  ))}
                </>
          )}

          {!loading && tab === "crypto" && (
            cryptoSignals.length === 0
              ? <EmptyState
                  title="No crypto data available"
                  body="The AI engine could not load crypto signals. Retrying automatically."/>
              : cryptoSignals.map(b => (
                  <SignalCard
                    key={b.symbol}
                    breakdown={b}
                    ticker={tickerBySym[b.symbol]}
                    onOpen={() => openAsset("crypto", SYM_SHORT[b.symbol] ?? b.symbol.replace("USD",""))}/>
                ))
          )}

          {!loading && tab === "equities" && (
            <EquitiesScaffold onOpen={(s) => openAsset("equity", s)}/>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* BOTTOM CTA — AI Signal Engine                                    */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div style={{ padding: "20px 16px 0" }}>
          <AISignalEngineCard
            onLearnMore={() => setLocation("/subscribe")}/>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function FeaturePill({ icon, title, subtitle }: {
  icon: React.ReactNode; title: string; subtitle: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
      borderRadius: 12,
      background: `linear-gradient(135deg, ${SURFACE_2} 0%, ${SURFACE} 100%)`,
      border: `1px solid ${BORDER_HI}`,
      boxShadow: `0 4px 14px rgba(0,0,0,0.4), 0 0 18px -10px ${BRAND_GLOW}`,
      maxWidth: 160,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${BRAND}1A`, border: `1px solid ${BORDER_HI}`,
        color: BRAND, boxShadow: `0 0 10px ${BRAND_BLOOM}`,
      }}>{icon}</div>
      <div style={{ textAlign: "left", minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontFamily: SANS, fontWeight: 700, color: BRAND,
          letterSpacing: -0.1, lineHeight: 1.1,
        }}>{title}</div>
        <div style={{
          fontSize: 9, fontFamily: SANS, color: TEXT_DIM, marginTop: 2,
          lineHeight: 1.2, letterSpacing: 0.1,
        }}>{subtitle}</div>
      </div>
    </div>
  );
}

function IconButton({ children, onClick, "aria-label": aria }: {
  children: React.ReactNode; onClick?: () => void; "aria-label": string;
}) {
  return (
    <button onClick={onClick} aria-label={aria} style={{
      width: 36, height: 36, borderRadius: 10,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${BORDER_HI}`,
      color: BRAND, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 12px ${BRAND_BLOOM}`,
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
    }}>{children}</button>
  );
}

function TabPill({ label, badge, active, onClick }: {
  label: string; badge?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "9px 8px", borderRadius: 999,
      background: active
        ? `linear-gradient(135deg, ${BRAND}22 0%, ${BRAND_DEEP}18 100%)`
        : "transparent",
      border: active ? `1px solid ${BORDER_HI}` : "1px solid transparent",
      color: active ? BRAND : TEXT_SUB, cursor: "pointer",
      fontSize: 12, fontFamily: SANS, fontWeight: 700,
      letterSpacing: 0.1,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      boxShadow: active ? `0 0 14px ${BRAND_BLOOM}, inset 0 0 0 1px ${BORDER_HI}` : "none",
      transition: "all 0.15s ease",
    }}>
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span style={{
          minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
          background: active ? BRAND : "rgba(255,255,255,0.08)",
          color: active ? "#001b06" : TEXT_SUB,
          fontSize: 10, fontWeight: 800, fontVariantNumeric: "tabular-nums",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: active ? `0 0 8px ${BRAND_GLOW}` : "none",
        }}>{badge}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SignalCard — the marquee card matching the reference design exactly
// ─────────────────────────────────────────────────────────────────────────────
function SignalCard({ breakdown, ticker, onOpen }: {
  breakdown: SignalBreakdown;
  ticker: { price: number; changePercent24h: number; up: boolean };
  onOpen?: () => void;
}) {
  const isLong = breakdown.action.toUpperCase() === "BUY";
  const isHold = breakdown.action.toUpperCase() === "HOLD";
  const grade = deriveGrade(breakdown.action, breakdown.confidence);
  const gc = gradeColor(grade);
  const tradeType = deriveTradeType(breakdown);
  const levels = deriveLevels(ticker.price, breakdown.action, breakdown.confidence);
  const accent = isHold ? TEXT_SUB : (isLong ? BRAND : NEG);
  const accentDeep = isHold ? TEXT_DIM : (isLong ? BRAND_DEEP : NEG_DEEP);
  const trendDir: "up"|"down" = isHold ? (ticker.up ? "up" : "down") : (isLong ? "up" : "down");
  const short = SYM_SHORT[breakdown.symbol] ?? breakdown.symbol.replace("USD","");

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      style={{
      position: "relative", overflow: "hidden",
      marginBottom: 12, borderRadius: 18, padding: "14px 14px 12px",
      cursor: onOpen ? "pointer" : "default",
      background: `
        radial-gradient(circle at 0% 0%, ${isHold ? "rgba(255,255,255,0.05)" : isLong ? "rgba(102,255,102,0.10)" : "rgba(255,64,96,0.10)"} 0%, transparent 55%),
        linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 60%, ${BG} 100%)
      `,
      border: `1px solid ${isHold ? BORDER : (isLong ? BORDER_HI : "rgba(255,64,96,0.28)")}`,
      boxShadow: `
        0 10px 32px rgba(0,0,0,0.55),
        0 0 0 1px ${gc.bloom} inset,
        0 0 24px -10px ${gc.bloom}
      `,
      transition: "transform 0.18s ease, box-shadow 0.2s ease",
    }}>
      {/* Left accent rail */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 3,
        background: `linear-gradient(180deg, ${accent} 0%, ${accentDeep} 100%)`,
        boxShadow: `0 0 14px ${gc.bloom}`,
      }}/>
      {/* Top-edge sweep */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${gc.bloom} 50%, transparent 100%)`,
        animation: "edge-sweep 6s ease-in-out infinite",
      }}/>
      {/* Scan line overlay */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${accent}22 50%, transparent 100%)`,
        animation: "scan-line 4.5s linear infinite",
        pointerEvents: "none",
      }}/>

      {/* Top row: icon + asset · grade pill */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <CryptoIcon sym={breakdown.symbol} size={44}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontFamily: SANS, fontWeight: 800, color: TEXT,
            letterSpacing: -0.3, lineHeight: 1.1,
          }}>
            {short}/USDT
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
            {/* LONG / SHORT pill */}
            <span style={{
              padding: "2px 7px", borderRadius: 4,
              background: isLong ? `${BRAND}1F` : `${NEG}1F`,
              border: `1px solid ${isLong ? BORDER_HI : "rgba(255,64,96,0.30)"}`,
              fontSize: 9, fontFamily: SANS, fontWeight: 800,
              color: accent, letterSpacing: 0.8, textTransform: "uppercase",
            }}>{isHold ? "Hold" : isLong ? "Long" : "Short"}</span>
            <span style={{
              fontSize: 10.5, fontFamily: SANS, fontWeight: 600,
              color: TEXT_DIM, letterSpacing: 0.2,
            }}>{tradeType}</span>
          </div>
        </div>

        {/* Signal grade badge */}
        <div style={{
          padding: "5px 10px", borderRadius: 8,
          background: gc.bg, border: `1px solid ${gc.border}`,
          fontSize: 10, fontFamily: SANS, fontWeight: 800,
          color: gc.fg, letterSpacing: 0.8,
          boxShadow: `0 0 14px ${gc.bloom}`,
          whiteSpace: "nowrap",
        }}>{grade}</div>
      </div>

      {/* Price + sparkline + confidence row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 12, gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 22, fontFamily: SANS, fontWeight: 800, color: TEXT,
            letterSpacing: -0.6, fontVariantNumeric: "tabular-nums",
            textShadow: `0 0 16px ${BRAND_BLOOM}`,
          }}>{fmtPx(ticker.price)}</div>
          <div style={{
            display: "flex", alignItems: "center", gap: 4, marginTop: 2,
          }}>
            <span style={{
              fontSize: 12, fontFamily: SANS, fontWeight: 700,
              color: ticker.up ? BRAND : NEG,
              fontVariantNumeric: "tabular-nums",
            }}>
              {ticker.up ? "+" : ""}{ticker.changePercent24h.toFixed(2)}%
            </span>
            <span style={{
              fontSize: 9.5, fontFamily: SANS, color: TEXT_DIM,
              letterSpacing: 0.4,
            }}>(24H)</span>
          </div>
        </div>

        {/* Sparkline */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", minWidth: 0,
        }}>
          <SignalSparkline seed={`sig-${breakdown.symbol}`} trend={trendDir} color={accent} w={110} h={34}/>
          <div style={{
            fontSize: 9, fontFamily: SANS, color: TEXT_DIM,
            marginTop: 3, letterSpacing: 0.3,
          }}>{fmtRelTime(breakdown.lastUpdated)}</div>
        </div>

        {/* Confidence gauge */}
        <ConfidenceGauge value={breakdown.confidence}/>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* Trade levels grid — Entry · Take Profit · Stop Loss              */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 12, padding: "10px 0 0",
        borderTop: `1px solid ${BORDER}`,
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10,
      }}>
        <LevelCell
          label="Entry Zone" tone="neutral"
          value={fmtRange(levels.entryLo, levels.entryHi)}/>
        <LevelCell
          label="Take Profit" tone="positive"
          value={`${fmtPx(levels.tp1)} / ${fmtPx(levels.tp2)}`}/>
        <LevelCell
          label="Stop Loss" tone="negative"
          value={fmtPx(levels.sl)}/>
      </div>

      {/* Disclosure: levels are AI-suggested, derived from price + confidence */}
      <div style={{
        marginTop: 8, fontSize: 8.5, fontFamily: SANS,
        color: TEXT_DIM, letterSpacing: 0.2, lineHeight: 1.35,
      }}>
        AI-suggested levels derived from live price &amp; confidence. Not guaranteed fills · manage risk independently.
      </div>

      {/* Footer chips: signal quality flags from real engine */}
      <div style={{
        marginTop: 10, display: "flex", flexWrap: "wrap", gap: 5,
      }}>
        {breakdown.mtfConfirmed && (
          <QualityChip label="MTF Confirmed"/>
        )}
        {breakdown.volumeConfirmed && (
          <QualityChip label="Volume Confirmed"/>
        )}
        {(breakdown.trend1H === "BULLISH" || breakdown.trend1H === "BEARISH") && (
          <QualityChip label={`1H ${breakdown.trend1H}`}/>
        )}
        <QualityChip label={breakdown.marketCondition || "Active"}/>
      </div>
    </div>
  );
}

function LevelCell({ label, value, tone }: {
  label: string; value: string; tone: "neutral" | "positive" | "negative";
}) {
  const color = tone === "positive" ? BRAND : tone === "negative" ? NEG : TEXT;
  return (
    <div>
      <div style={{
        fontSize: 8.5, fontFamily: SANS, fontWeight: 700, color: TEXT_DIM,
        letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 3,
      }}>{label}</div>
      <div style={{
        fontSize: 11.5, fontFamily: SANS, fontWeight: 700, color,
        letterSpacing: -0.1, fontVariantNumeric: "tabular-nums",
        textShadow: tone !== "neutral" ? `0 0 8px ${color}55` : "none",
      }}>{value}</div>
    </div>
  );
}

function QualityChip({ label }: { label: string }) {
  return (
    <span style={{
      padding: "3px 8px", borderRadius: 999,
      background: "rgba(102,255,102,0.06)",
      border: `1px solid rgba(102,255,102,0.16)`,
      fontSize: 9, fontFamily: SANS, fontWeight: 700,
      color: BRAND, letterSpacing: 0.4, textTransform: "uppercase",
    }}>{label}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Signal Engine — bottom CTA card
// ─────────────────────────────────────────────────────────────────────────────
function AISignalEngineCard({ onLearnMore }: { onLearnMore: () => void }) {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      borderRadius: 18, padding: "14px 14px",
      background: `
        radial-gradient(circle at 100% 0%, ${BRAND_GLOW} 0%, transparent 55%),
        linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 100%)
      `,
      border: `1px solid ${BORDER_HI}`,
      boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 22px -8px ${BRAND_GLOW}`,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      {/* Top sweep */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${BRAND_GLOW} 50%, transparent 100%)`,
        animation: "edge-sweep 5s ease-in-out infinite",
      }}/>
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: `linear-gradient(135deg, ${BRAND}22 0%, ${BRAND_DEEP}30 100%)`,
        border: `1px solid ${BORDER_HI}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: BRAND, boxShadow: `0 0 16px ${BRAND_GLOW}`,
      }}>{IconSparkle}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontFamily: SANS, fontWeight: 800, color: TEXT,
          letterSpacing: -0.2,
        }}>AI Signal Engine</div>
        <div style={{
          fontSize: 10.5, fontFamily: SANS, color: TEXT_SUB,
          marginTop: 2, lineHeight: 1.35,
        }}>
          Analyzes 50+ indicators, market sentiment &amp; volume patterns 24/7.
        </div>
      </div>
      <button onClick={onLearnMore} style={{
        padding: "9px 14px", borderRadius: 999,
        background: `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 100%)`,
        border: `1px solid ${BRAND_BRGT}`,
        color: "#001b06", cursor: "pointer",
        fontSize: 11, fontFamily: SANS, fontWeight: 800,
        letterSpacing: 0.3, whiteSpace: "nowrap",
        boxShadow: `0 6px 18px ${BRAND_GLOW}, inset 0 1px 0 rgba(255,255,255,0.25)`,
        display: "flex", alignItems: "center", gap: 5,
      }}>Learn More <span style={{ fontSize: 13 }}>›</span></button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty + loading states
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      padding: "32px 18px", textAlign: "center", borderRadius: 18,
      background: `linear-gradient(160deg, ${SURFACE} 0%, ${BG} 100%)`,
      border: `1px dashed ${BORDER_HI}`,
      marginTop: 4,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, margin: "0 auto 12px",
        background: `${BRAND}10`, border: `1px solid ${BORDER_HI}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: BRAND, boxShadow: `0 0 16px ${BRAND_BLOOM}`,
      }}>{IconSparkle}</div>
      <div style={{
        fontSize: 14, fontFamily: SANS, fontWeight: 700, color: TEXT,
        marginBottom: 6, letterSpacing: -0.2,
      }}>{title}</div>
      <div style={{
        fontSize: 11.5, fontFamily: SANS, color: TEXT_SUB, lineHeight: 1.5,
        maxWidth: 280, margin: "0 auto",
      }}>{body}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EquitiesScaffold — honest "AI equity engine launching" state. Lists the
// supported equities as clickable cards (which route to their AssetDetail
// page) but does NOT fabricate prices, confidence values, or trade levels —
// the equity AI engine is not yet wired into the backend.
// ─────────────────────────────────────────────────────────────────────────────
function EquitiesScaffold({ onOpen }: { onOpen: (sym: string) => void }) {
  return (
    <div>
      {/* Headline status card */}
      <div style={{
        position: "relative", overflow: "hidden",
        marginBottom: 14, borderRadius: 18, padding: "18px 16px",
        background: `
          radial-gradient(circle at 100% 0%, ${BRAND_GLOW} 0%, transparent 60%),
          linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 60%, ${BG} 100%)
        `,
        border: `1px solid ${BORDER_HI}`,
        boxShadow: `0 10px 32px rgba(0,0,0,0.55), 0 0 24px -10px ${BRAND_GLOW}`,
      }}>
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${BRAND_GLOW} 50%, transparent 100%)`,
          animation: "edge-sweep 6s ease-in-out infinite",
        }}/>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "3px 8px", borderRadius: 999,
          background: `${BRAND}1A`, border: `1px solid ${BORDER_HI}`,
          fontSize: 9, fontFamily: SANS, fontWeight: 800, color: BRAND,
          letterSpacing: 1.4, textTransform: "uppercase",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: BRAND,
            boxShadow: `0 0 10px ${BRAND_GLOW}`,
            animation: "dot-pulse 1.8s ease-in-out infinite",
          }}/>
          Launching Soon
        </div>
        <div style={{
          marginTop: 12, fontSize: 18, fontFamily: SANS, fontWeight: 800,
          letterSpacing: -0.4, color: TEXT,
        }}>
          AI Equity Signal Engine
        </div>
        <div style={{
          marginTop: 6, fontSize: 11.5, fontFamily: SANS,
          color: TEXT_SUB, lineHeight: 1.55, maxWidth: 360,
        }}>
          Real-time AI signals for major US equities are entering final
          validation. Tap any ticker below to preview its asset profile.
          Live signals will activate automatically once the equity engine
          goes online.
        </div>
      </div>

      {/* Equity grid — supported tickers (real names, no fake prices) */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      }}>
        {SUPPORTED_EQUITIES.map((s) => (
          <div
            key={s}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(s)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(s); } }}
            style={{
              position: "relative", overflow: "hidden",
              padding: "14px 12px", borderRadius: 14, cursor: "pointer",
              background: `linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 100%)`,
              border: `1px solid ${BORDER}`,
              boxShadow: `0 8px 24px rgba(0,0,0,0.50), 0 0 0 1px rgba(102,255,102,0.04) inset`,
              transition: "transform 0.18s ease, box-shadow 0.2s ease",
              display: "flex", alignItems: "center", gap: 12,
            }}>
            <EquityIcon sym={s} size={40}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontFamily: SANS, fontWeight: 800,
                color: TEXT, letterSpacing: -0.2, lineHeight: 1.1,
              }}>{s}</div>
              <div style={{
                fontSize: 10, fontFamily: SANS, color: TEXT_DIM,
                marginTop: 3, lineHeight: 1.2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{EQUITY_NAME[s]}</div>
              <div style={{
                marginTop: 6, fontSize: 8, fontFamily: SANS, fontWeight: 700,
                color: BRAND, letterSpacing: 1.2,
                textTransform: "uppercase",
                opacity: 0.85,
              }}>Preview · Engine pending</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: "8px 0" }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          marginBottom: 12, borderRadius: 18, height: 160,
          background: `linear-gradient(140deg, ${SURFACE_2} 0%, ${SURFACE} 100%)`,
          border: `1px solid ${BORDER}`,
          opacity: 0.6,
          animation: `orb-breathe 2.5s ease-in-out infinite ${i*0.2}s`,
        }}/>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Inline icons
// ═══════════════════════════════════════════════════════════════════════════
const IconCrosshair = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/>
    <line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const IconBolt = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 2 L4 14 L11 14 L9 22 L20 9 L13 9 Z"/>
  </svg>
);
const IconChart = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17 L8 12 L13 15 L21 6"/><polyline points="15 6 21 6 21 12"/>
  </svg>
);
const IconFilter = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
);
const IconSettings = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IconSparkle = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2 L13.6 8.4 L20 10 L13.6 11.6 L12 18 L10.4 11.6 L4 10 L10.4 8.4 Z" opacity="0.9"/>
    <path d="M19 3 L19.8 5.2 L22 6 L19.8 6.8 L19 9 L18.2 6.8 L16 6 L18.2 5.2 Z" opacity="0.7"/>
  </svg>
);
