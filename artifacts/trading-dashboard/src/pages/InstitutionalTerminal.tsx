/**
 * InstitutionalTerminal.tsx — AICandlez Desktop / Web Institutional AI Terminal
 *
 * The flagship desktop UX for the platform. NOT a redesign of the mobile app —
 * this is the institutional command-center version of the same visual system.
 *
 * Layout (top → bottom, each section scrolls independently):
 *   TOP    Bloomberg-style chart + AI radar + scanner widgets (analytics zone)
 *   MIDDLE Live Active Trades (left)  ·  Trade History (right)
 *   BOTTOM Top Crypto Signals (left)  ·  Top Equity Signals (right)
 *
 * Visual system mirrors the mobile AICandlez:
 *   • Black interiors, neon-green highlights
 *   • Confidence rings, BUY/SELL pills, AI AUTO TRADE bars, sparklines
 *   • Compact density, cinematic glow, no arcade / no flat saas
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Radar, TrendingUp, TrendingDown, Activity, Cpu, Zap, Pause,
  ChevronRight, Bot, Layers, Crosshair, Wifi, Clock,
} from "lucide-react";

// ── Design tokens (locked — mirrors aicandlez-app/src/index.css) ────────────
const BG         = "#000000";
const SURFACE    = "#050A07";
const CARD       = "#0A1410";
const CARD_HI    = "#0F1F18";
const E          = "rgba(255,255,255,0.07)";
const E_HI       = "rgba(255,255,255,0.11)";
const BRAND      = "#66FF66";
const BRAND_DEEP = "#00C853";
const BRAND_BRGT = "#7CFF00";
const BRAND_GLOW = "rgba(102,255,102,0.22)";
const POS        = "#00ff8a";
const NEG        = "#ff4466";
const WARN       = "#ffaa00";
const W          = "#E8F5EC";
const GR         = "#8A9C94";
const DIM        = "#5A726A";
const SANS       = "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif";
const MONO       = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

// ── Domain types (compatible with aicandlez-app types) ─────────────────────
interface SignalBreakdown {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD" | string;
  confidence: number;
  mtfConfirmed: boolean;
  volumeConfirmed: boolean;
  marketCondition: string;
  trend1H: string;
  blockReason: string | null;
  lastUpdated: number;
}
interface MobileSignalsResponse { breakdowns: Record<string, SignalBreakdown> }
interface MobileTicker {
  symbol: string; short: string; price: number;
  change24h: number; changePercent24h: number; up: boolean;
}
interface MobileTickersResponse { tickers: MobileTicker[]; ts: number }
interface Position {
  symbol: string; side: string; quantity: number; entryPrice: number;
  currentPrice: number; pnl: number; pnlPercent: number;
  openedAt?: string;
}
interface Portfolio { positions: Position[]; totalValue: number; openPnL: number; mode: string }
interface SimTrade {
  id: string; symbol: string; side: string; pnl: number; pnlPct: number;
  score?: number; closedAt: string; entryPrice: number; exitPrice: number;
}
interface CandlePoint { time: number; close: number; high: number; low: number; volume?: number }

// ── Known asset universes (used to split signals into crypto vs equities) ──
const CRYPTO_HINT  = /USDT?$|^X?BTC|^ETH|^SOL|^ADA|^AVAX|^XRP|^LINK|^SUI|^HBAR|^DOGE|^MATIC|^DOT|^ATOM|^NEAR/i;
const EQUITY_HINT  = /^(CRM|MU|INTC|AAPL|MSFT|NVDA|META|AMZN|AMD|TSLA|GOOGL|GOOG|NFLX|JPM|BAC|XOM|WMT|DIS|UBER|SHOP|PYPL|COIN|SQ|ABNB|PLTR|ARM|ORCL|CSCO|QCOM|TXN|ADBE|CRWD|SNOW|ZM)$/i;

function isCrypto(sym: string)  { return CRYPTO_HINT.test(sym); }
function isEquity(sym: string)  { return EQUITY_HINT.test(sym); }

// ── Data fetching helpers ──────────────────────────────────────────────────
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

// ───────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ───────────────────────────────────────────────────────────────────────────
export default function InstitutionalTerminal() {
  // Pulse clock for live "alive" feel
  const [tick, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(i); }, []);

  const signals   = useQuery<MobileSignalsResponse>({
    queryKey: ["it-signals"],
    queryFn:  () => getJson("/api/mobile/signals"),
    refetchInterval: 4_000,
  });
  const tickers   = useQuery<MobileTickersResponse>({
    queryKey: ["it-tickers"],
    queryFn:  () => getJson("/api/mobile/tickers"),
    refetchInterval: 4_000,
  });
  const portfolio = useQuery<Portfolio>({
    queryKey: ["it-portfolio"],
    queryFn:  () => getJson("/api/portfolio"),
    refetchInterval: 6_000,
  });
  const trades    = useQuery<SimTrade[]>({
    queryKey: ["it-trades"],
    queryFn:  () => getJson("/api/simulation/trades"),
    refetchInterval: 8_000,
  });

  const breakdowns = signals.data?.breakdowns ?? {};
  const cryptoSignals = useMemo(
    () => Object.values(breakdowns)
      .filter(b => isCrypto(b.symbol))
      .sort((a, b) => b.confidence - a.confidence),
    [breakdowns],
  );
  const equitySignals = useMemo(
    () => Object.values(breakdowns)
      .filter(b => isEquity(b.symbol))
      .sort((a, b) => b.confidence - a.confidence),
    [breakdowns],
  );
  const positions = portfolio.data?.positions ?? [];
  // Defensive: tolerate non-array shapes from /api/simulation/trades.
  const history   = Array.isArray(trades.data) ? trades.data : [];

  return (
    <div style={{
      background: BG, color: W, fontFamily: SANS,
      minHeight: "100vh",
      display: "grid",
      gridTemplateRows: "44px minmax(0,1fr)",
    }}>

      {/* Inline keyframes — page-local, no global-CSS dependency */}
      <style>{`
        @keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes it-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>

      {/* ── Status bar (sticky top) ────────────────────────────────────── */}
      <StatusBar tick={tick} tickers={tickers.data?.tickers ?? []} />

      {/* ── Workspace (3 vertical zones) ───────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateRows: "minmax(360px, 38vh) minmax(280px, 28vh) minmax(360px, 1fr)",
        gap: 10,
        padding: 10,
        overflow: "hidden",
      }}>

        {/* TOP — Charts + AI Radar + Analytics widgets */}
        <ChartsAnalyticsZone
          tickers={tickers.data?.tickers ?? []}
          breakdowns={breakdowns}
          tick={tick}
        />

        {/* MIDDLE — Active Trades · Trade History */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, overflow: "hidden" }}>
          <ActiveTradesPanel positions={positions} mode={portfolio.data?.mode ?? "paper"} />
          <TradeHistoryPanel trades={history} />
        </div>

        {/* BOTTOM — Top Crypto Signals · Top Equity Signals */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, overflow: "hidden" }}>
          <SignalColumn
            title="TOP CRYPTO SIGNALS"
            kind="crypto"
            signals={cryptoSignals}
            tickers={tickers.data?.tickers ?? []}
          />
          <SignalColumn
            title="TOP EQUITY SIGNALS"
            kind="equity"
            signals={equitySignals}
            tickers={tickers.data?.tickers ?? []}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS BAR
// ═══════════════════════════════════════════════════════════════════════════
function StatusBar({ tick, tickers }: { tick: number; tickers: MobileTicker[] }) {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      gap: 16,
      padding: "0 14px",
      background: SURFACE,
      borderBottom: `1px solid ${E}`,
      fontFamily: MONO, fontSize: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: BRAND,
          boxShadow: `0 0 5px ${BRAND}`,
          animation: tick % 2 ? "none" : "none",
        }}/>
        <span style={{ color: BRAND, fontWeight: 800, letterSpacing: "0.18em" }}>LIVE · AI TERMINAL</span>
        <span style={{ color: DIM }}>·</span>
        <span style={{ color: GR, letterSpacing: "0.12em" }}>SCANNING 24/7</span>
        <span style={{ color: DIM }}>·</span>
        <span style={{ color: GR }}><Wifi size={10} style={{ verticalAlign: -1 }}/> WS</span>
      </div>

      {/* Inline ticker tape */}
      <div style={{ overflow: "hidden", whiteSpace: "nowrap", maskImage:
        "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)" }}>
        <div style={{ display: "inline-flex", gap: 26, animation: "ticker-scroll 60s linear infinite" }}>
          {[...tickers, ...tickers].map((t, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: W, fontWeight: 700 }}>{t.short || t.symbol}</span>
              <span style={{ color: GR }}>${t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              <span style={{ color: t.up ? POS : NEG, fontWeight: 700 }}>
                {t.up ? "▲" : "▼"} {Math.abs(t.changePercent24h).toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, color: GR }}>
        <span><Clock size={10} style={{ verticalAlign: -1 }}/> {hh}:{mm}:{ss} UTC</span>
        <span style={{ color: DIM }}>·</span>
        <span style={{ color: BRAND_BRGT, fontWeight: 700, letterSpacing: "0.14em" }}>v1.0 · INSTITUTIONAL</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP ZONE — Charts + AI Radar + Analytics
// ═══════════════════════════════════════════════════════════════════════════
function ChartsAnalyticsZone({
  tickers, breakdowns, tick,
}: { tickers: MobileTicker[]; breakdowns: Record<string, SignalBreakdown>; tick: number }) {
  // Pick hero symbol = first crypto ticker
  const heroSymbol = tickers.find(t => isCrypto(t.symbol))?.symbol
                   ?? tickers[0]?.symbol ?? "BTCUSDT";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.65fr 1fr", gap: 10, minHeight: 0 }}>
      {/* Hero chart card */}
      <HeroChartCard symbol={heroSymbol} tickers={tickers} />

      {/* Right-side analytics stack — 3 widgets in a column grid */}
      <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 10, minHeight: 0 }}>
        <AIRadarCard breakdowns={breakdowns} tick={tick}/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minHeight: 0 }}>
          <ConfidenceDistributionCard breakdowns={breakdowns}/>
          <SectorMomentumCard tickers={tickers}/>
        </div>
      </div>
    </div>
  );
}

function HeroChartCard({ symbol, tickers }: { symbol: string; tickers: MobileTicker[] }) {
  const candles = useQuery<CandlePoint[]>({
    queryKey: ["it-hero-candles", symbol],
    queryFn:  () => getJson(`/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=15m&limit=120`),
    refetchInterval: 10_000,
    enabled:  !!symbol,
  });

  const t = tickers.find(x => x.symbol === symbol);
  const arr = candles.data ?? [];
  const closes = arr.map(c => c.close);
  const min = Math.min(...closes, t?.price ?? 0);
  const max = Math.max(...closes, t?.price ?? 0);

  return (
    <Card>
      <CardHeader
        title="BTC · 15M · LIVE"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {t && (
              <>
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: W,
                  letterSpacing: -0.4 }}>
                  ${t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                  color: t.up ? POS : NEG, padding: "2px 8px",
                  background: (t.up ? POS : NEG) + "14",
                  border: `1px solid ${(t.up ? POS : NEG)}40`, borderRadius: 4 }}>
                  {t.up ? "▲" : "▼"} {Math.abs(t.changePercent24h).toFixed(2)}%
                </span>
              </>
            )}
          </div>
        }
      />
      <div style={{ position: "relative", flex: 1, padding: "8px 14px 14px", minHeight: 0 }}>
        <CandleAreaChart closes={closes} min={min} max={max}/>

        {/* Floating AI overlays */}
        <div style={{ position: "absolute", top: 16, left: 22, display: "flex", flexDirection: "column", gap: 4 }}>
          <ChipLine label="AI BIAS"    value="BULLISH"  color={POS}/>
          <ChipLine label="MTF ALIGN"  value="3/3"      color={BRAND}/>
          <ChipLine label="VOLATILITY" value="ELEVATED" color={WARN}/>
        </div>
        <div style={{ position: "absolute", top: 16, right: 22, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <ChipLine label="SCANNER" value="ACTIVE" color={BRAND_BRGT}/>
          <ChipLine label="DEPTH"   value="HIGH"   color={BRAND}/>
        </div>
      </div>
    </Card>
  );
}

function CandleAreaChart({ closes, min, max }: { closes: number[]; min: number; max: number }) {
  if (!closes.length) {
    return <div style={{ height: "100%", display: "grid", placeItems: "center",
      color: DIM, fontFamily: MONO, fontSize: 11 }}>Loading market data…</div>;
  }
  const W_ = 800, H_ = 220, pad = 10;
  const range = Math.max(max - min, 0.0001);
  const x = (i: number) => pad + (i / (closes.length - 1 || 1)) * (W_ - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / range) * (H_ - pad * 2);
  const linePath = closes.map((c, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(closes.length - 1).toFixed(1)} ${H_ - pad} L ${pad} ${H_ - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W_} ${H_}`} preserveAspectRatio="none"
         style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={BRAND} stopOpacity={0.32}/>
          <stop offset="100%" stopColor={BRAND} stopOpacity={0}/>
        </linearGradient>
        <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={BRAND_DEEP}/>
          <stop offset="50%"  stopColor={BRAND}/>
          <stop offset="100%" stopColor={BRAND_BRGT}/>
        </linearGradient>
      </defs>
      {/* Grid */}
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={pad} x2={W_ - pad} y1={pad + p * (H_ - pad * 2)} y2={pad + p * (H_ - pad * 2)}
          stroke="rgba(255,255,255,0.04)" strokeWidth={1}/>
      ))}
      <path d={areaPath} fill="url(#hero-area)"/>
      <path d={linePath} fill="none" stroke="url(#hero-line)" strokeWidth={1.6}
        style={{ filter: `drop-shadow(0 0 3px ${BRAND_GLOW})` }}/>
      <circle cx={x(closes.length - 1)} cy={y(closes[closes.length - 1])} r={3} fill={BRAND_BRGT}
        style={{ filter: `drop-shadow(0 0 4px ${BRAND_BRGT})` }}/>
    </svg>
  );
}

function ChipLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 8px", background: "rgba(0,0,0,0.55)",
      border: `1px solid ${color}33`, borderRadius: 4,
      fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.1em",
    }}>
      <span style={{ color: GR }}>{label}</span>
      <span style={{ color, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

// ── AI Radar Card (circular scanner) ────────────────────────────────────────
function AIRadarCard({ breakdowns, tick }: { breakdowns: Record<string, SignalBreakdown>; tick: number }) {
  const all = Object.values(breakdowns);
  const buys  = all.filter(b => b.action === "BUY").length;
  const sells = all.filter(b => b.action === "SELL").length;
  const holds = all.filter(b => b.action === "HOLD").length;
  const avgConf = all.length ? Math.round(all.reduce((s,b)=>s+b.confidence,0)/all.length) : 0;
  const sweepDeg = (tick * 6) % 360; // 60s full sweep

  // Position up to 8 blips on rings keyed by confidence
  const blips = all.slice(0, 8).map((b, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const r = 30 + (b.confidence / 100) * 55;
    return { x: 100 + Math.cos(angle) * r, y: 100 + Math.sin(angle) * r, b };
  });

  return (
    <Card>
      <CardHeader
        title="AI MARKET RADAR"
        right={<span style={{ fontFamily: MONO, fontSize: 9, color: BRAND, letterSpacing: "0.14em" }}>
          {all.length} ASSETS
        </span>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14, padding: "10px 14px 14px", minHeight: 0, flex: 1 }}>
        <div style={{ position: "relative", aspectRatio: "1/1" }}>
          <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
            <defs>
              <radialGradient id="radar-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor={BRAND} stopOpacity={0.12}/>
                <stop offset="70%"  stopColor={BRAND} stopOpacity={0.02}/>
                <stop offset="100%" stopColor={BRAND} stopOpacity={0}/>
              </radialGradient>
              <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={BRAND_BRGT} stopOpacity={0.55}/>
                <stop offset="100%" stopColor={BRAND}      stopOpacity={0}/>
              </linearGradient>
            </defs>
            {/* Backdrop glow */}
            <circle cx={100} cy={100} r={94} fill="url(#radar-grad)"/>
            {/* Concentric rings */}
            {[30, 55, 80].map(r => (
              <circle key={r} cx={100} cy={100} r={r}
                fill="none" stroke={BRAND} strokeOpacity={0.22} strokeWidth={1}/>
            ))}
            {/* Crosshairs */}
            <line x1={10} x2={190} y1={100} y2={100} stroke={BRAND} strokeOpacity={0.16} strokeWidth={1}/>
            <line x1={100} x2={100} y1={10} y2={190} stroke={BRAND} strokeOpacity={0.16} strokeWidth={1}/>
            {/* Rotating sweep arm */}
            <g transform={`rotate(${sweepDeg} 100 100)`}>
              <path d="M 100 100 L 188 100 A 88 88 0 0 0 153 31 Z" fill="url(#radar-sweep)"/>
              <line x1={100} y1={100} x2={188} y2={100} stroke={BRAND_BRGT} strokeWidth={1.2}
                style={{ filter: `drop-shadow(0 0 4px ${BRAND_BRGT})` }}/>
            </g>
            {/* Asset blips */}
            {blips.map((bl, i) => {
              const c = bl.b.action === "BUY" ? POS : bl.b.action === "SELL" ? NEG : WARN;
              return (
                <g key={i}>
                  <circle cx={bl.x} cy={bl.y} r={3} fill={c}
                    style={{ filter: `drop-shadow(0 0 3px ${c})` }}/>
                  <circle cx={bl.x} cy={bl.y} r={6 + (tick % 3) * 2}
                    fill="none" stroke={c} strokeOpacity={0.4 - (tick % 3) * 0.12}/>
                </g>
              );
            })}
            {/* Center medallion */}
            <circle cx={100} cy={100} r={6} fill={BRAND}
              style={{ filter: `drop-shadow(0 0 5px ${BRAND})` }}/>
          </svg>
        </div>
        <div style={{ display: "grid", gridTemplateRows: "auto auto auto auto", gap: 8, alignContent: "center" }}>
          <RadarStat label="AVG CONFIDENCE" value={`${avgConf}%`} color={BRAND}/>
          <RadarStat label="BUY SIGNALS"    value={String(buys)}  color={POS}/>
          <RadarStat label="SELL SIGNALS"   value={String(sells)} color={NEG}/>
          <RadarStat label="HOLDS"          value={String(holds)} color={WARN}/>
        </div>
      </div>
    </Card>
  );
}

function RadarStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 12px", background: CARD_HI,
      border: `1px solid ${E}`, borderRadius: 6 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, color: GR, letterSpacing: "0.14em" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 15, color, fontWeight: 800, letterSpacing: -0.4,
        textShadow: `0 0 5px ${color}55` }}>{value}</span>
    </div>
  );
}

// ── Confidence distribution ────────────────────────────────────────────────
function ConfidenceDistributionCard({ breakdowns }: { breakdowns: Record<string, SignalBreakdown> }) {
  const all = Object.values(breakdowns);
  const bins = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
  for (const b of all) {
    const i = Math.min(4, Math.floor(b.confidence / 20));
    bins[i]++;
  }
  const maxBin = Math.max(...bins, 1);
  const colors = [DIM, GR, WARN, BRAND, BRAND_BRGT];
  return (
    <Card>
      <CardHeader title="CONFIDENCE DIST"/>
      <div style={{ padding: "10px 14px 14px", display: "flex", alignItems: "flex-end",
        gap: 8, flex: 1, minHeight: 0 }}>
        {bins.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%",
                height: `${(v / maxBin) * 100}%`,
                minHeight: v ? 4 : 0,
                background: `linear-gradient(180deg, ${colors[i]} 0%, ${colors[i]}55 100%)`,
                borderRadius: "4px 4px 0 0",
                boxShadow: i >= 3 ? `0 0 5px ${colors[i]}88` : "none",
                transition: "height 0.4s",
              }}/>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 8, color: GR }}>{i * 20}+</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: colors[i], fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Sector momentum (sparkbars by % change) ────────────────────────────────
function SectorMomentumCard({ tickers }: { tickers: MobileTicker[] }) {
  const sorted = [...tickers].sort((a, b) => b.changePercent24h - a.changePercent24h).slice(0, 6);
  const maxAbs = Math.max(...sorted.map(t => Math.abs(t.changePercent24h)), 1);
  return (
    <Card>
      <CardHeader title="MOMENTUM"/>
      <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0 }}>
        {sorted.map(t => {
          const pct = t.changePercent24h;
          const w = Math.abs(pct) / maxAbs;
          const c = pct >= 0 ? POS : NEG;
          return (
            <div key={t.symbol} style={{ display: "grid", gridTemplateColumns: "44px 1fr 50px",
              gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: W, fontWeight: 700 }}>{t.short}</span>
              <div style={{ height: 6, background: CARD_HI, borderRadius: 3, position: "relative" }}>
                <div style={{
                  position: "absolute", left: pct >= 0 ? "50%" : `${50 - w * 50}%`,
                  width: `${w * 50}%`, height: "100%",
                  background: `linear-gradient(90deg, ${c}33, ${c})`,
                  borderRadius: 3, boxShadow: `0 0 3px ${c}66`,
                }}/>
                <div style={{ position: "absolute", left: "50%", top: -1, bottom: -1,
                  width: 1, background: "rgba(255,255,255,0.12)" }}/>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: c, fontWeight: 700, textAlign: "right" }}>
                {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLE ZONE — Active Trades · Trade History
// ═══════════════════════════════════════════════════════════════════════════
function ActiveTradesPanel({ positions, mode }: { positions: Position[]; mode: string }) {
  return (
    <Card>
      <CardHeader
        title="LIVE ACTIVE TRADES"
        right={
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }}>
            <span style={{ color: GR }}>MODE</span>
            <span style={{ color: mode === "live" ? BRAND_BRGT : BRAND, fontWeight: 800 }}>{mode.toUpperCase()}</span>
            <span style={{ color: DIM }}>·</span>
            <span style={{ color: W, fontWeight: 700 }}>{positions.length} OPEN</span>
          </span>
        }
      />
      <ColumnHeader cols={[
        { label: "ASSET",    w: "16%" },
        { label: "SIDE",     w: "10%" },
        { label: "ENTRY",    w: "13%" },
        { label: "MARK",     w: "13%" },
        { label: "PNL",      w: "13%" },
        { label: "ROE %",    w: "11%" },
        { label: "AI",       w: "10%" },
        { label: "ACTION",   w: "14%", align: "right" },
      ]}/>
      <ScrollArea>
        {positions.length === 0 ? (
          <EmptyState icon={Pause} title="No open positions"
            sub="AI scanner is monitoring. Auto Trade will open positions when confidence threshold is met."/>
        ) : positions.map((p, i) => <ActiveTradeRow key={i} p={p}/>)}
      </ScrollArea>
    </Card>
  );
}

function ActiveTradeRow({ p }: { p: Position }) {
  const isLong = p.side?.toUpperCase() === "LONG" || p.side?.toUpperCase() === "BUY";
  const c = p.pnl >= 0 ? POS : NEG;
  return (
    <Row>
      <Cell w="16%"><AssetCell symbol={p.symbol}/></Cell>
      <Cell w="10%"><Pill label={isLong ? "LONG" : "SHORT"} color={isLong ? POS : NEG}/></Cell>
      <Cell w="13%" mono>${p.entryPrice?.toFixed(2)}</Cell>
      <Cell w="13%" mono>${p.currentPrice?.toFixed(2)}</Cell>
      <Cell w="13%" mono><span style={{ color: c, fontWeight: 700 }}>
        {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
      </span></Cell>
      <Cell w="11%" mono><span style={{ color: c, fontWeight: 700 }}>
        {p.pnlPercent >= 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%
      </span></Cell>
      <Cell w="10%"><Pill label="AUTO" color={BRAND}/></Cell>
      <Cell w="14%" align="right">
        <button style={{
          padding: "5px 11px", background: "rgba(255,68,102,0.10)",
          border: `1px solid ${NEG}55`, borderRadius: 4,
          color: NEG, fontFamily: MONO, fontSize: 9.5, fontWeight: 800,
          letterSpacing: "0.1em", cursor: "pointer",
        }}>CLOSE</button>
      </Cell>
    </Row>
  );
}

function TradeHistoryPanel({ trades: tradesInput }: { trades: SimTrade[] }) {
  // Defensive: tolerate non-array payloads from /api/simulation/trades.
  const trades = Array.isArray(tradesInput) ? tradesInput : [];
  if (!Array.isArray(tradesInput) && import.meta.env.DEV) {
    console.warn("[institutional-terminal] TradeHistoryPanel: trades not an array", tradesInput);
  }
  const wins   = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  const wr     = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  return (
    <Card>
      <CardHeader
        title="TRADE HISTORY"
        right={
          <span style={{ display: "flex", gap: 10, alignItems: "center", fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }}>
            <span style={{ color: GR }}>WIN RATE</span>
            <span style={{ color: BRAND, fontWeight: 800 }}>{wr}%</span>
            <span style={{ color: DIM }}>·</span>
            <span style={{ color: POS }}>{wins}W</span>
            <span style={{ color: NEG }}>{losses}L</span>
          </span>
        }
      />
      <ColumnHeader cols={[
        { label: "ASSET",    w: "16%" },
        { label: "SIDE",     w: "10%" },
        { label: "ENTRY",    w: "13%" },
        { label: "EXIT",     w: "13%" },
        { label: "PNL",      w: "13%" },
        { label: "ROE %",    w: "11%" },
        { label: "SCORE",    w: "10%" },
        { label: "CLOSED",   w: "14%", align: "right" },
      ]}/>
      <ScrollArea>
        {trades.length === 0 ? (
          <EmptyState icon={Clock} title="No closed trades yet"
            sub="Closed positions appear here with AI execution quality and outcome scoring."/>
        ) : trades.slice(0, 60).map((t, i) => <HistoryRow key={t.id ?? i} t={t}/>)}
      </ScrollArea>
    </Card>
  );
}

function HistoryRow({ t }: { t: SimTrade }) {
  const isLong = t.side?.toUpperCase() === "LONG" || t.side?.toUpperCase() === "BUY";
  const c = t.pnl >= 0 ? POS : NEG;
  const closed = t.closedAt ? new Date(t.closedAt) : null;
  const stamp = closed ? `${String(closed.getUTCHours()).padStart(2,"0")}:${String(closed.getUTCMinutes()).padStart(2,"0")}` : "—";
  return (
    <Row>
      <Cell w="16%"><AssetCell symbol={t.symbol}/></Cell>
      <Cell w="10%"><Pill label={isLong ? "LONG" : "SHORT"} color={isLong ? POS : NEG}/></Cell>
      <Cell w="13%" mono>${t.entryPrice?.toFixed(2)}</Cell>
      <Cell w="13%" mono>${t.exitPrice?.toFixed(2)}</Cell>
      <Cell w="13%" mono><span style={{ color: c, fontWeight: 700 }}>
        {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
      </span></Cell>
      <Cell w="11%" mono><span style={{ color: c, fontWeight: 700 }}>
        {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
      </span></Cell>
      <Cell w="10%"><Pill
        label={typeof t.score === "number" ? `${t.score}` : "—"}
        color={typeof t.score === "number" && t.score >= 70 ? BRAND : t.score && t.score >= 50 ? WARN : DIM}/>
      </Cell>
      <Cell w="14%" align="right" mono>{stamp}</Cell>
    </Row>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOTTOM ZONE — Signal columns
// ═══════════════════════════════════════════════════════════════════════════
function SignalColumn({
  title, kind, signals, tickers,
}: {
  title: string; kind: "crypto" | "equity";
  signals: SignalBreakdown[]; tickers: MobileTicker[];
}) {
  // Optional pre-defined equity universe if backend has no data yet
  const visible = signals.length ? signals : (kind === "equity"
    ? ["CRM","MU","INTC","AAPL","MSFT","NVDA","META","AMZN","AMD","TSLA"].map((s, i): SignalBreakdown => ({
        symbol: s, action: i % 2 ? "SELL" : "BUY", confidence: 0,
        mtfConfirmed: false, volumeConfirmed: false, marketCondition: "neutral",
        trend1H: "neutral", blockReason: "AI scanner initializing", lastUpdated: Date.now(),
      }))
    : []);

  return (
    <Card>
      <CardHeader
        title={title}
        right={
          <span style={{ display: "flex", gap: 10, alignItems: "center", fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }}>
            <span style={{ color: GR }}>SORTED BY</span>
            <span style={{ color: BRAND_BRGT, fontWeight: 800 }}>AI CONFIDENCE</span>
            <span style={{ color: DIM }}>·</span>
            <span style={{ color: W, fontWeight: 700 }}>{visible.length}</span>
          </span>
        }
      />
      <ScrollArea>
        {visible.length === 0 ? (
          <EmptyState icon={Crosshair} title={`No ${kind} signals yet`}
            sub="AI scanner is profiling assets. High-confidence setups will appear here ranked by confidence."/>
        ) : visible.map((b, i) => (
          <SignalCardWide
            key={b.symbol}
            rank={i + 1}
            breakdown={b}
            ticker={tickers.find(t => t.symbol === b.symbol)}
          />
        ))}
      </ScrollArea>
    </Card>
  );
}

function SignalCardWide({
  rank, breakdown, ticker,
}: { rank: number; breakdown: SignalBreakdown; ticker?: MobileTicker }) {
  const action = breakdown.action;
  const c = action === "BUY" ? POS : action === "SELL" ? NEG : WARN;
  const isBlocked = !!breakdown.blockReason;
  const price = ticker?.price ?? 0;
  const tp = price ? price * (action === "SELL" ? 0.96 : 1.04) : 0;
  const sl = price ? price * (action === "SELL" ? 1.02 : 0.98) : 0;

  // Tiny synthetic sparkline based on confidence + 24h move
  const sparkPoints = useMemo(() => {
    const seed = (breakdown.confidence + (ticker?.changePercent24h ?? 0)) || 1;
    const arr: number[] = [];
    for (let i = 0; i < 24; i++) {
      arr.push(Math.sin(i * 0.5 + seed) * 0.5 + (ticker?.changePercent24h ?? 0) * 0.1 + i * 0.02);
    }
    return arr;
  }, [breakdown.confidence, ticker?.changePercent24h]);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "32px 110px 1fr 130px 100px 92px",
      gap: 12, alignItems: "center",
      padding: "11px 14px",
      borderBottom: `1px solid ${E}`,
      opacity: isBlocked ? 0.55 : 1,
      transition: "background 0.12s",
    }}
    onMouseEnter={e => (e.currentTarget.style.background = "rgba(102,255,102,0.025)")}
    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {/* Rank */}
      <span style={{ fontFamily: MONO, fontSize: 11, color: rank <= 3 ? BRAND : DIM,
        fontWeight: 800, letterSpacing: 0.4 }}>
        {String(rank).padStart(2, "0")}
      </span>

      {/* Asset */}
      <div>
        <AssetCell symbol={breakdown.symbol}/>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <Pill label={action === "BUY" ? "LONG" : action === "SELL" ? "SHORT" : "FLAT"} color={c}/>
        </div>
      </div>

      {/* Price + ENTRY/TP/SL inline */}
      <div>
        <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 11, color: GR }}>
          <span><span style={{ color: DIM }}>ENTRY </span><span style={{ color: W }}>${price.toFixed(2)}</span></span>
          <span><span style={{ color: DIM }}>TP </span><span style={{ color: POS }}>${tp.toFixed(2)}</span></span>
          <span><span style={{ color: DIM }}>SL </span><span style={{ color: NEG }}>${sl.toFixed(2)}</span></span>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {breakdown.volumeConfirmed && <MicroTag label="VOL ✓" color={POS}/>}
          {breakdown.mtfConfirmed    && <MicroTag label="MTF ✓" color={BRAND}/>}
          {ticker && (
            <MicroTag
              label={`24H ${ticker.up ? "+" : ""}${ticker.changePercent24h.toFixed(2)}%`}
              color={ticker.up ? POS : NEG}/>
          )}
          {isBlocked && <MicroTag label={breakdown.blockReason!.slice(0, 22)} color={DIM}/>}
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline points={sparkPoints} color={c}/>

      {/* BUY / SELL inline */}
      <div style={{ display: "flex", gap: 4 }}>
        <button style={{
          flex: 1, padding: "7px 0", background: POS + "14",
          border: `1px solid ${POS}55`, borderRadius: 4,
          color: POS, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
          cursor: "pointer",
        }}>BUY</button>
        <button style={{
          flex: 1, padding: "7px 0", background: NEG + "14",
          border: `1px solid ${NEG}55`, borderRadius: 4,
          color: NEG, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
          cursor: "pointer",
        }}>SELL</button>
      </div>

      {/* Confidence ring */}
      <ConfidenceRing pct={breakdown.confidence} color={c}/>
    </div>
  );
}

function MicroTag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: "1px 6px", background: color + "12",
      border: `1px solid ${color}33`, borderRadius: 3,
      fontFamily: MONO, fontSize: 8, fontWeight: 700,
      color, letterSpacing: 0.4, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (!points.length) return null;
  const min = Math.min(...points), max = Math.max(...points);
  const range = Math.max(max - min, 0.0001);
  const W_ = 120, H_ = 32, pad = 2;
  const path = points
    .map((v, i) => {
      const x = pad + (i / (points.length - 1)) * (W_ - pad * 2);
      const y = pad + (1 - (v - min) / range) * (H_ - pad * 2);
      return `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W_} ${H_}`} style={{ width: "100%", height: 32, display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.4}
        style={{ filter: `drop-shadow(0 0 3px ${color}99)` }}/>
    </svg>
  );
}

function ConfidenceRing({ pct, color }: { pct: number; color: string }) {
  const R = 22, C_ = 2 * Math.PI * R;
  const offset = C_ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div style={{ position: "relative", width: 56, height: 56, margin: "0 auto" }}>
      <svg viewBox="0 0 56 56" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
        <circle cx={28} cy={28} r={R} fill="none" stroke={CARD_HI} strokeWidth={3}/>
        <circle cx={28} cy={28} r={R} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={C_} strokeDashoffset={offset} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${color}88)`, transition: "stroke-dashoffset 0.4s" }}/>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center",
        fontFamily: MONO, fontSize: 13, color, fontWeight: 800, letterSpacing: -0.4 }}>
        {pct}%
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: "100%",
        textAlign: "center", fontFamily: MONO, fontSize: 7, color: DIM,
        letterSpacing: "0.16em", marginTop: 2 }}>
        AI CONFIDENCE
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED LAYOUT PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: CARD,
      border: `1px solid ${E}`,
      borderRadius: 10,
      display: "flex", flexDirection: "column",
      minHeight: 0,
      overflow: "hidden",
      boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
    }}>{children}</div>
  );
}

function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 14px",
      borderBottom: `1px solid ${E}`,
      background: SURFACE,
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: MONO, fontSize: 10.5, fontWeight: 800,
        color: W, letterSpacing: "0.16em",
      }}>{title}</span>
      {right}
    </div>
  );
}

function ColumnHeader({ cols }: { cols: { label: string; w: string; align?: "right" }[] }) {
  return (
    <div style={{
      display: "flex",
      padding: "8px 14px",
      borderBottom: `1px solid ${E}`,
      background: "rgba(255,255,255,0.015)",
      fontFamily: MONO, fontSize: 8.5, color: DIM,
      letterSpacing: "0.16em", fontWeight: 700,
      flexShrink: 0,
    }}>
      {cols.map(c => (
        <span key={c.label} style={{ width: c.w, textAlign: c.align ?? "left" }}>{c.label}</span>
      ))}
    </div>
  );
}

function ScrollArea({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0,
      scrollbarWidth: "thin",
      scrollbarColor: `${E_HI} transparent`,
    }}>{children}</div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "9px 14px",
      borderBottom: `1px solid ${E}`,
      transition: "background 0.12s",
    }}
    onMouseEnter={e => (e.currentTarget.style.background = "rgba(102,255,102,0.025)")}
    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >{children}</div>
  );
}

function Cell({
  children, w, align, mono,
}: { children: React.ReactNode; w: string; align?: "right"; mono?: boolean }) {
  return (
    <span style={{
      width: w, textAlign: align ?? "left",
      fontFamily: mono ? MONO : SANS,
      fontSize: 11, color: W,
    }}>{children}</span>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      background: color + "16",
      border: `1px solid ${color}45`,
      borderRadius: 4,
      fontFamily: MONO, fontSize: 9, fontWeight: 800,
      color, letterSpacing: 0.6,
    }}>{label}</span>
  );
}

function AssetCell({ symbol }: { symbol: string }) {
  const short = symbol.replace(/USDT?$/, "");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        background: `linear-gradient(135deg, ${BRAND_DEEP}, ${BRAND})`,
        display: "grid", placeItems: "center",
        fontFamily: MONO, fontSize: 8, fontWeight: 800, color: "#001b06",
        boxShadow: `0 0 4px ${BRAND_GLOW}`,
      }}>{short.slice(0, 3)}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, color: W, fontWeight: 700 }}>{symbol}</span>
    </span>
  );
}

function EmptyState({
  icon: Icon, title, sub,
}: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 10, color: GR }}>
      <Icon size={28} style={{ opacity: 0.4 }}/>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: W,
        letterSpacing: "0.1em" }}>{title}</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: GR, textAlign: "center",
        maxWidth: 360, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}
