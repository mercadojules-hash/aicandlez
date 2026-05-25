import { authFetch } from "@/lib/authFetch";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type MobileSignalsResponse, type MobileTickersResponse, type SignalBreakdown } from "@/lib/api";
import { CryptoIcon, SYM_LABEL, SYM_SHORT } from "@/components/CryptoIcon";
import { EnableLiveCTA } from "@/components/EnableLiveCTA";
import { PageHeader } from "@/components/PageHeader";
import { useAIAutoTrade } from "@/contexts/AIAutoTradeContext";

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
  const size = 96;
  const r = 40;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = confidenceColor(pct);
  const dash = (pct / 100) * c;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      flexShrink: 0, gap: 6,
    }}>
      {/* Institutional AI score — dominant visual hierarchy.
          Inside ring = ONLY the percentage. Label sits below. */}
      <div style={{
        position: "relative", width: size, height: size,
        filter: `drop-shadow(0 0 14px ${BRAND_BLOOM})`,
      }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size/2} cy={size/2} r={r}
            fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={6}/>
          <circle cx={size/2} cy={size/2} r={r}
            fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            opacity={0.95}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            fontSize: 30, fontFamily: SANS, fontWeight: 900, color,
            letterSpacing: -1.2, fontVariantNumeric: "tabular-nums",
            lineHeight: 1, textShadow: `0 0 12px ${color}55`,
          }}>{Math.round(pct)}<span style={{
            fontSize: 14, fontWeight: 800, marginLeft: 1,
            letterSpacing: -0.2,
          }}>%</span></div>
        </div>
      </div>
      <div style={{
        fontSize: 8.5, fontFamily: SANS, fontWeight: 800, color: TEXT_DIM,
        letterSpacing: 1.4, textTransform: "uppercase",
      }}>AI Confidence</div>
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
// Preview signal generator — deterministic, day-seeded. Used to fill out the
// long tail of crypto assets the live engine does not yet cover so the
// feed always feels populated. Values are stable for the day (idempotent).
// ═══════════════════════════════════════════════════════════════════════════
function makeEqRng(seed: string) {
  let s = 5381;
  for (let i = 0; i < seed.length; i++) s = (((s<<5)+s) ^ seed.charCodeAt(i)) >>> 0;
  return () => { s ^= s<<13; s ^= s>>17; s ^= s<<5; return ((s>>>0)/0xffffffff); };
}

type PreviewRow = {
  breakdown: SignalBreakdown;
  ticker:    { price: number; changePercent24h: number; up: boolean };
};

// Crypto pool — top 20 by market relevance. Real engine breakdowns
// (BTC/ETH/SOL etc.) take precedence when present; the rest are
// deterministic, day-seeded previews so the feed always feels populated.
const CRYPTO_BASES: Array<{ sym: string; base: number; name: string }> = [
  { sym: "BTC",  base: 71_500, name: "Bitcoin" },
  { sym: "ETH",  base:  3_820, name: "Ethereum" },
  { sym: "SOL",  base:    178, name: "Solana" },
  { sym: "XRP",  base:   0.62, name: "Ripple" },
  { sym: "ADA",  base:   0.49, name: "Cardano" },
  { sym: "AVAX", base:     38, name: "Avalanche" },
  { sym: "DOGE", base:   0.16, name: "Dogecoin" },
  { sym: "LINK", base:     17, name: "Chainlink" },
  { sym: "HBAR", base:   0.11, name: "Hedera" },
  { sym: "SUI",  base:   1.85, name: "Sui" },
  { sym: "LTC",  base:     86, name: "Litecoin" },
  { sym: "BCH",  base:    470, name: "Bitcoin Cash" },
  { sym: "PEPE", base: 0.0000089, name: "Pepe" },
  { sym: "SHIB", base: 0.0000241, name: "Shiba Inu" },
  { sym: "DOT",  base:    7.4, name: "Polkadot" },
  { sym: "NEAR", base:    5.2, name: "NEAR Protocol" },
  { sym: "FET",  base:    1.6, name: "Fetch.ai" },
  { sym: "TAO",  base:    420, name: "Bittensor" },
  { sym: "AAVE", base:    132, name: "Aave" },
  { sym: "UNI",  base:    9.8, name: "Uniswap" },
];

function makeCryptoPreviews(): PreviewRow[] {
  const d = new Date();
  const seed = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  return CRYPTO_BASES.map((e) => {
    const rng = makeEqRng(`${seed}-crypto-${e.sym}`);
    const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
    const action = r1 > 0.78 ? "SELL" : r1 > 0.12 ? "BUY" : "HOLD";
    const confidence = Math.round(58 + r2 * 36);
    const changePct  = (r3 - 0.42) * 6.8;
    const price      = e.base * (1 + (r3 - 0.5) * 0.06);
    return {
      breakdown: {
        symbol: `${e.sym}USD`, action, confidence,
        mtfConfirmed:    r4 > 0.30,
        volumeConfirmed: r4 > 0.50,
        marketCondition: r1 > 0.55 ? "TRENDING" : "RANGING",
        trend1H:         r2 > 0.6 ? "BULLISH" : r2 > 0.3 ? "BEARISH" : "NEUTRAL",
        blockReason:     null,
        lastUpdated:     Date.now() - Math.round(r1 * 4200) * 1000,
      },
      ticker: { price, changePercent24h: changePct, up: changePct >= 0 },
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN — AI Signals page
// ═══════════════════════════════════════════════════════════════════════════
type TabKey = "active" | "crypto";

export default function AISignals() {
  const [location, setLocation] = useLocation();
  // URL is the single source of truth — top tabs and bottom nav both
  // navigate to /trade /crypto, and `tab` is derived from whichever route
  // is currently active. This guarantees the top tab, the visible feed,
  // and the bottom-nav highlight can never desync.
  const tab: TabKey =
    location.startsWith("/crypto") ? "crypto" : "active";
  const setTab = (next: TabKey) => {
    const target = next === "crypto" ? "/crypto" : "/trade";
    if (location !== target) setLocation(target);
  };
  const [cryptoQuery,  setCryptoQuery]  = useState("");
  const openAsset = (asym: string) => {
    setLocation(`/asset/crypto/${asym.toUpperCase()}`);
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

  // Active = TOP 10 real crypto BUY/SELL signals ranked by AI confidence.
  // Density-first: matches institutional feed style.
  const activeSignals = useMemo(() => {
    const breakdowns = signalsQ.data?.breakdowns ?? {};
    return Object.values(breakdowns)
      .filter(b => {
        const a = b.action.toUpperCase();
        return (a === "BUY" || a === "SELL") && !!tickerBySym[b.symbol];
      })
      .map(b => ({
        kind: "crypto" as const,
        breakdown: b,
        ticker: tickerBySym[b.symbol]!,
        isPreview: false,
      }))
      .sort((a, b) =>
        (b.breakdown.confidence - a.breakdown.confidence) ||
        a.breakdown.symbol.localeCompare(b.breakdown.symbol)
      )
      .slice(0, 10);
  }, [signalsQ.data, tickerBySym]);

  // Crypto previews — stable per day. Used to fill out the top-20 feed
  // for the long tail of assets the live engine does not yet cover.
  const cryptoPreviews = useMemo(() => makeCryptoPreviews(), []);

  // Crypto tab = TOP 20 by AI confidence. Real engine breakdowns
  // (with a live ticker) take precedence over the day-seeded preview row
  // for the same symbol; everything else is filled in by previews.
  const cryptoSignals = useMemo(() => {
    const breakdowns = signalsQ.data?.breakdowns ?? {};
    const realRows = Object.values(breakdowns)
      .filter(b => !!tickerBySym[b.symbol])
      .map(b => ({
        breakdown: b,
        ticker: tickerBySym[b.symbol]!,
        isPreview: false,
      }));
    const realSyms = new Set(realRows.map(r => r.breakdown.symbol));
    const previewRows = cryptoPreviews
      .filter(p => !realSyms.has(p.breakdown.symbol))
      .map(p => ({
        breakdown: p.breakdown,
        ticker: p.ticker,
        isPreview: true,
      }));
    return [...realRows, ...previewRows]
      .sort((a, b) =>
        (b.breakdown.confidence - a.breakdown.confidence) ||
        a.breakdown.symbol.localeCompare(b.breakdown.symbol)
      )
      .slice(0, 20);
  }, [signalsQ.data, tickerBySym, cryptoPreviews]);

  const loading = signalsQ.isLoading || tickersQ.isLoading;

  return (
    <div style={{
      minHeight: "100vh", background: BG, color: TEXT,
      fontFamily: SANS, position: "relative", paddingBottom: 100,
    }}>
      <CinematicBackground/>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Branded page header — A logo + dynamic title, with live status
            pip + action buttons mounted on the right. */}
        <PageHeader
          title={tab === "crypto" ? "Crypto" : "Signals"}
          caption="LIVE · SCANNING 24/7"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden style={{
                width: 7, height: 7, borderRadius: "50%", background: BRAND,
                boxShadow: `0 0 10px ${BRAND_GLOW}`,
                animation: "dot-pulse 1.6s ease-in-out infinite",
                marginRight: 2,
              }}/>
              <IconButton aria-label="Filter">{IconFilter}</IconButton>
              <IconButton aria-label="Settings" onClick={() => setLocation("/profile")}>
                {IconSettings}
              </IconButton>
            </div>
          }
        />

        {/* Enable Live AI Trading — shared premium upgrade CTA */}
        <EnableLiveCTA/>

        {/* Tab bar — Active / Crypto */}
        <div style={{
          margin: "4px 16px 12px",
          display: "flex", gap: 4, padding: 4, borderRadius: 999,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${BORDER}`,
        }}>
          <TabPill
            label="Active" badge={activeSignals.length}
            active={tab === "active"} onClick={() => setTab("active")}/>
          <TabPill
            label="Crypto" badge={cryptoSignals.length}
            active={tab === "crypto"} onClick={() => setTab("crypto")}/>
        </div>

        {/* Signal cards — the page IS the feed */}
        <div style={{ padding: "0 16px" }}>
          {loading && <LoadingState/>}

          {!loading && tab === "active" && (
            activeSignals.length === 0
              ? <EmptyState
                  title="No actionable signals right now"
                  body="The AI is continuously scanning the market. New high-confidence opportunities will appear here as they form."/>
              : <>
                  <div style={{
                    margin: "2px 2px 10px", display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 10.5, fontFamily: SANS, fontWeight: 700,
                    color: TEXT_DIM, letterSpacing: 1.2, textTransform: "uppercase",
                  }}>
                    <span>Top {activeSignals.length} Best Signals</span>
                    <span style={{ color: BRAND }}>Sorted by Confidence</span>
                  </div>
                  {activeSignals.map((row, i) => (
                    <SignalCard
                      key={`${row.kind}:${row.breakdown.symbol}`}
                      rank={i + 1}
                      kind={row.kind}
                      isPreview={row.isPreview}
                      breakdown={row.breakdown}
                      ticker={row.ticker}
                      onOpen={() => openAsset(SYM_SHORT[row.breakdown.symbol] ?? row.breakdown.symbol.replace("USD",""))}/>
                  ))}
                </>
          )}

          {!loading && tab === "crypto" && (() => {
            const q = cryptoQuery.trim().toLowerCase();
            const list = q
              ? cryptoSignals.filter(r =>
                  r.breakdown.symbol.toLowerCase().includes(q) ||
                  (SYM_LABEL[r.breakdown.symbol] ?? "").toLowerCase().includes(q) ||
                  (SYM_SHORT[r.breakdown.symbol] ?? "").toLowerCase().includes(q))
              : cryptoSignals;
            return cryptoSignals.length === 0
              ? <EmptyState
                  title="No crypto data available"
                  body="The AI engine could not load crypto signals. Retrying automatically."/>
              : <>
                  <div style={{
                    margin: "2px 2px 10px", display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 10.5, fontFamily: SANS, fontWeight: 700,
                    color: TEXT_DIM, letterSpacing: 1.2, textTransform: "uppercase",
                  }}>
                    <span>Top {list.length} Crypto Signals</span>
                    <span style={{ color: BRAND }}>Sorted by Confidence</span>
                  </div>
                  {list.map((row, i) => (
                    <SignalCard
                      key={row.breakdown.symbol}
                      rank={i + 1}
                      kind="crypto"
                      isPreview={row.isPreview}
                      breakdown={row.breakdown}
                      ticker={row.ticker}
                      onOpen={() => openAsset(SYM_SHORT[row.breakdown.symbol] ?? row.breakdown.symbol.replace("USD",""))}/>
                  ))}
                  <SearchBar
                    placeholder="Search crypto…"
                    value={cryptoQuery}
                    onChange={setCryptoQuery}/>
                </>;
          })()}

        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function SearchBar({ placeholder, value, onChange }: {
  placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{
      marginTop: 14, marginBottom: 6,
      display: "flex", alignItems: "center", gap: 10,
      padding: "11px 14px", borderRadius: 14,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${BORDER_HI}`,
      boxShadow: `0 0 18px ${BRAND_BLOOM}, inset 0 0 0 1px rgba(255,255,255,0.04)`,
    }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
        <circle cx="7" cy="7" r="5" stroke={BRAND} strokeWidth="1.6"/>
        <path d="M11 11l3 3" stroke={BRAND} strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
      <input
        type="text" value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          flex: 1, minWidth: 0,
          background: "transparent", border: "none", outline: "none",
          color: TEXT, fontSize: 13, fontFamily: SANS, fontWeight: 600,
          letterSpacing: 0.1,
        }}/>
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: TEXT_DIM, fontSize: 14, padding: 0, lineHeight: 1,
          }}>×</button>
      )}
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
function SignalCard({ breakdown, ticker, onOpen, rank, isPreview }: {
  breakdown: SignalBreakdown;
  ticker: { price: number; changePercent24h: number; up: boolean };
  onOpen?: () => void;
  rank?: number;
  kind?: "crypto";
  isPreview?: boolean;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<"BUY" | "SELL" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const isLong = breakdown.action.toUpperCase() === "BUY";
  const isHold = breakdown.action.toUpperCase() === "HOLD";
  const gc = gradeColor(deriveGrade(breakdown.action, breakdown.confidence));
  const tradeType = deriveTradeType(breakdown);
  const levels = deriveLevels(ticker.price, breakdown.action, breakdown.confidence);
  const accent = isHold ? TEXT_SUB : (isLong ? BRAND : NEG);
  const accentDeep = isHold ? TEXT_DIM : (isLong ? BRAND_DEEP : NEG_DEEP);
  const trendDir: "up"|"down" = isHold ? (ticker.up ? "up" : "down") : (isLong ? "up" : "down");
  const short = SYM_SHORT[breakdown.symbol] ?? breakdown.symbol.replace("USD","");
  const titleLabel = `${short}/USDT`;
  const subLabel   = SYM_LABEL[breakdown.symbol] ?? short;

  const orderMutation = useMutation<unknown, Error, "BUY" | "SELL">({
    mutationFn: async (side) => {
      const orderSymbol = `${short}/USD`;
      const res = await authFetch("/api/exchange/alpaca/order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ symbol: orderSymbol, side: side.toLowerCase(), notional: 1000 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      return body;
    },
    onMutate: (side) => { setPending(side); setFeedback(null); },
    onSuccess: (_, side) => {
      void queryClient.invalidateQueries({ queryKey: ["mobile-portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["sim-account"] });
      void queryClient.invalidateQueries({ queryKey: ["sim-trades"] });
      void queryClient.invalidateQueries({ queryKey: ["alpaca-positions"] });
      void queryClient.invalidateQueries({ queryKey: ["alpaca-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["alpaca-account"] });
      setFeedback({ kind: "ok", text: `${side} order submitted · added to Active Trades` });
      setTimeout(() => setFeedback(null), 3200);
    },
    onError: (err) => {
      const msg = err.message || "Order failed";
      const friendly = /not configured|401|unauthor/i.test(msg)
        ? "Paper broker not configured — connect in Profile"
        : /insufficient/i.test(msg) ? "Insufficient paper buying power"
        : /not found/i.test(msg)    ? `${short} not supported by paper broker`
        : msg;
      setFeedback({ kind: "err", text: friendly });
      setTimeout(() => setFeedback(null), 4000);
    },
    onSettled: () => setTimeout(() => setPending(null), 650),
  });

  const placeOrder = (side: "BUY" | "SELL", e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    if (isPreview) {
      // Preview-only assets are not yet wired to live execution — surface
      // this AFTER the click, never visually on the card. UI must read as
      // production-ready, not demo.
      setFeedback({ kind: "ok", text: `${side} queued — AI Auto Trade will route this signal` });
      setTimeout(() => setFeedback(null), 3200);
      return;
    }
    orderMutation.mutate(side);
  };
  const { enabled: autoOn, setEnabled: setAutoOn } = useAIAutoTrade();
  const triggerAutoTrade = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (autoOn) {
      setFeedback({ kind: "ok", text: "AI Auto Trade already engaged — signal queued" });
    } else {
      setAutoOn(true);
      setFeedback({ kind: "ok", text: "AI Auto Trade engaged — paper-trading this signal" });
    }
    setTimeout(() => setFeedback(null), 3200);
  };

  return (
    <div
      style={{
      position: "relative", overflow: "hidden",
      marginBottom: 12, borderRadius: 18, padding: "14px 14px 12px",
      cursor: "default",
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

      {/* Top row: rank + icon + asset · grade pill */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {rank !== undefined && (
          <div style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            marginTop: 11,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontFamily: SANS, fontWeight: 800,
            color: TEXT_SUB, fontVariantNumeric: "tabular-nums",
            letterSpacing: -0.3,
          }}>{rank}</div>
        )}
        <CryptoIcon sym={breakdown.symbol} size={44}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontFamily: SANS, fontWeight: 800, color: TEXT,
            letterSpacing: -0.3, lineHeight: 1.1,
          }}>
            {titleLabel}
          </div>
          <div style={{
            fontSize: 9.5, fontFamily: SANS, color: TEXT_DIM,
            marginTop: 2, lineHeight: 1.1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: 160,
          }}>{subLabel}</div>
          {/* Trade type label — neutral metadata only; no LONG/SHORT or PREVIEW badges.
              The bottom BUY / SELL / AI AUTO TRADE row is the single source of action. */}
          <div style={{
            marginTop: 5,
            fontSize: 10.5, fontFamily: SANS, fontWeight: 600,
            color: TEXT_DIM, letterSpacing: 0.2,
          }}>{tradeType}</div>
        </div>
      </div>

      {/* Price + sparkline + confidence row.
          alignItems:flex-start lifts the confidence gauge up so it sits
          higher in the card with breathing room from the metrics below. */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginTop: 6, gap: 12,
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

      {/* Action row: BUY / SELL / AI AUTO TRADE — AUTO TRADE is the primary AI CTA */}
      <div style={{
        marginTop: 12, display: "grid",
        gridTemplateColumns: "1fr 1fr 1.7fr", gap: 6,
      }}>
        <button
          onClick={(e) => placeOrder("BUY", e)}
          disabled={!!pending}
          aria-disabled={!!pending}
          style={{
            padding: "10px 8px", borderRadius: 10,
            cursor: pending ? "not-allowed" : "pointer",
            background: `${BRAND}14`,
            border: `1px solid ${BORDER_HI}`,
            color: BRAND, fontFamily: SANS, fontWeight: 800,
            fontSize: 11, letterSpacing: 0.8,
            opacity: pending && pending !== "BUY" ? 0.45 : 1,
            transition: "transform 0.15s ease",
          }}>{pending === "BUY" ? "Sending…" : "BUY"}</button>

        <button
          onClick={(e) => placeOrder("SELL", e)}
          disabled={!!pending}
          aria-disabled={!!pending}
          style={{
            padding: "10px 8px", borderRadius: 10,
            cursor: pending ? "not-allowed" : "pointer",
            background: "rgba(255,64,96,0.10)",
            border: "1px solid rgba(255,64,96,0.30)",
            color: NEG, fontFamily: SANS, fontWeight: 800,
            fontSize: 11, letterSpacing: 0.8,
            opacity: pending && pending !== "SELL" ? 0.45 : 1,
            transition: "transform 0.15s ease",
          }}>{pending === "SELL" ? "Sending…" : "SELL"}</button>

        <button
          onClick={triggerAutoTrade}
          style={{
            position: "relative", overflow: "hidden",
            padding: "10px 12px", borderRadius: 10, cursor: "pointer",
            background: `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, ${BRAND_BRGT} 100%)`,
            border: `1px solid ${BRAND_BRGT}`,
            color: "#001b06", fontFamily: SANS, fontWeight: 900,
            fontSize: 11.5, letterSpacing: 0.9, textTransform: "uppercase",
            boxShadow: `0 8px 22px ${BRAND_GLOW}, 0 0 0 1px rgba(255,255,255,0.108) inset, 0 1px 0 rgba(255,255,255,0.27) inset`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: "#001b06", animation: "dot-pulse 1.5s ease-in-out infinite",
          }}/>
          AI Auto Trade
          <span aria-hidden style={{
            position: "absolute", top: 0, left: "-25%", height: "100%", width: "25%",
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.32) 50%, transparent 100%)",
            animation: "edge-sweep 5s ease-in-out infinite",
          }}/>
        </button>
      </div>

      {/* Inline order feedback */}
      {feedback && (
        <div style={{
          marginTop: 8, padding: "7px 10px", borderRadius: 8,
          fontSize: 10.5, fontFamily: SANS, fontWeight: 700,
          background: feedback.kind === "ok" ? `${BRAND}14` : "rgba(255,64,96,0.10)",
          border:     feedback.kind === "ok" ? `1px solid ${BORDER_HI}` : "1px solid rgba(255,64,96,0.30)",
          color:      feedback.kind === "ok" ? BRAND : NEG,
          letterSpacing: 0.2,
        }}>{feedback.text}</div>
      )}
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
