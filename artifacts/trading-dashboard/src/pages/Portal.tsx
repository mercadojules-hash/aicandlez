// ─────────────────────────────────────────────────────────────────────────────
// Portal — AICandlez Customer Dashboard
// ─────────────────────────────────────────────────────────────────────────────
// Premium black + neon-green customer-facing dashboard.
// Alpaca-only. No Kraken. No operator controls. No admin left panel.
//
// Layout:
//   • Top utility bar — Sign In / Account · Upgrade · Disclaimer · Manage
//     Account · Social share buttons · user pill · tier badge
//   • Centered AICandlez logo
//   • 8-metric row — Total P/L, Win Rate, Active Trades, Today, Monthly,
//     AI Confidence, Best Asset, Equity
//   • 6 live mini-charts grid — BTC/ETH/SOL/ADA/AVAX/DOGE
//   • Panels grid — Active Trades, Trade History, AI Signals, Top Gainers,
//     Subscription Status, AI Auto Trade Queue
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useUserRole } from "@/hooks/useUserRole";

// ── Brand palette ────────────────────────────────────────────────────────────
const BG       = "#000508";
const SURFACE  = "#040A0F";
const SURFACE2 = "#08120E";
const LINE     = "rgba(0,255,138,0.10)";
const LINE2    = "rgba(0,255,138,0.22)";
const GREEN    = "#00ff8a";
const GREEN_D  = "#00c853";
const GREEN_GL = "rgba(0,255,138,0.32)";
const TEXT     = "#EAF2EA";
const MUTED    = "#5a8068";
const RED      = "#ff4d6d";
const FONT     = "ui-monospace, SFMono-Regular, Menlo, monospace";

const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Social placeholders (replaceable after launch) ───────────────────────────
const SOCIAL = [
  { id: "x",        label: "X",        url: "https://x.com/aicandlez"        },
  { id: "ig",       label: "IG",       url: "https://instagram.com/aicandlez" },
  { id: "tt",       label: "TT",       url: "https://tiktok.com/@aicandlez"   },
  { id: "fb",       label: "FB",       url: "https://facebook.com/aicandlez"  },
  { id: "dc",       label: "DC",       url: "https://discord.gg/aicandlez"    },
  { id: "tg",       label: "TG",       url: "https://t.me/aicandlez"          },
] as const;

// ── Top utility bar ──────────────────────────────────────────────────────────
function TopBar() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const display = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || "Account";

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(0,5,8,0.92)",
      backdropFilter: "blur(8px)",
      borderBottom: `1px solid ${LINE}`,
      padding: "10px 24px",
      display: "flex", alignItems: "center", gap: 20,
      fontFamily: FONT, fontSize: 11, letterSpacing: "0.08em",
    }}>
      <span style={{ color: GREEN, fontWeight: 700 }}>AICANDLEZ</span>
      <span style={{ color: MUTED }}>· LIVE PORTAL</span>

      <div style={{ flex: 1 }} />

      <NavLink href="/account">MANAGE ACCOUNT</NavLink>
      <NavLink href="/billing">UPGRADE</NavLink>
      <NavLink href="/disclaimer">DISCLAIMER</NavLink>

      <div style={{ width: 1, height: 16, background: LINE2 }} />

      {SOCIAL.map((s) => (
        <a key={s.id} href={s.url} target="_blank" rel="noreferrer"
           title={s.label}
           style={{
             width: 22, height: 22, borderRadius: 3,
             border: `1px solid ${LINE2}`,
             background: SURFACE,
             color: GREEN, textDecoration: "none",
             display: "inline-flex", alignItems: "center", justifyContent: "center",
             fontSize: 9, fontWeight: 700,
           }}>
          {s.label}
        </a>
      ))}

      <div style={{ width: 1, height: 16, background: LINE2 }} />

      <span style={{
        padding: "4px 10px",
        background: SURFACE2,
        border: `1px solid ${LINE2}`,
        borderRadius: 3,
        color: TEXT, fontSize: 10,
      }}>
        {display}
      </span>

      <button
        onClick={() => signOut()}
        style={{
          padding: "4px 10px",
          background: "transparent",
          border: `1px solid ${LINE2}`,
          borderRadius: 3,
          color: MUTED, fontSize: 10, fontFamily: FONT, cursor: "pointer",
          letterSpacing: "0.08em",
        }}>
        SIGN OUT
      </button>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <a style={{
        color: MUTED, textDecoration: "none", fontSize: 10, fontWeight: 600,
        letterSpacing: "0.12em", padding: "4px 0",
        borderBottom: "1px solid transparent",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = GREEN)}
      onMouseLeave={(e) => (e.currentTarget.style.color = MUTED)}>
        {children}
      </a>
    </Link>
  );
}

// ── Centered logo banner ─────────────────────────────────────────────────────
function LogoBanner({ tier }: { tier: string }) {
  return (
    <div style={{
      padding: "40px 24px 24px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      position: "relative",
    }}>
      {/* Glow halo */}
      <div style={{
        position: "absolute",
        top: 60, left: "50%", transform: "translateX(-50%)",
        width: 360, height: 90,
        background: `radial-gradient(ellipse at center, ${GREEN_GL} 0%, transparent 70%)`,
        filter: "blur(20px)",
        pointerEvents: "none",
      }} />

      <img
        src={`${basePath}/aicandlez-logo.png`}
        alt="AICandlez"
        style={{ height: 56, position: "relative", zIndex: 1 }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
      <div style={{
        fontFamily: FONT, fontSize: 10, letterSpacing: "0.4em",
        color: GREEN, fontWeight: 600, position: "relative", zIndex: 1,
      }}>
        AI · CANDLEZ · TRADING
      </div>
      <div style={{
        marginTop: 8,
        padding: "4px 14px",
        background: SURFACE2,
        border: `1px solid ${LINE2}`,
        borderRadius: 999,
        fontFamily: FONT, fontSize: 10, color: GREEN,
        letterSpacing: "0.18em", fontWeight: 700,
        position: "relative", zIndex: 1,
      }}>
        TIER · {tier.toUpperCase()}
      </div>
    </div>
  );
}

// ── Metric tile ──────────────────────────────────────────────────────────────
interface MetricTileProps {
  label:    string;
  value:    string;
  delta?:   string;
  positive?: boolean;
  accent?:   string;
}
function MetricTile({ label, value, delta, positive = true, accent = GREEN }: MetricTileProps) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${LINE}`,
      borderRadius: 6,
      padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 6,
      minHeight: 92,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        opacity: 0.5,
      }} />
      <div style={{
        fontFamily: FONT, fontSize: 9, color: MUTED,
        letterSpacing: "0.16em", fontWeight: 600,
      }}>{label}</div>
      <div style={{
        fontFamily: FONT, fontSize: 22, color: TEXT, fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      {delta && (
        <div style={{
          fontFamily: FONT, fontSize: 10,
          color: positive ? GREEN : RED, fontWeight: 600,
        }}>{positive ? "▲" : "▼"} {delta}</div>
      )}
    </div>
  );
}

// ── Mini chart (synthetic walk — replace with live candles post-launch) ─────
function MiniChart({ symbol, price, change }: { symbol: string; price: string; change: number }) {
  const path = useMemo(() => {
    // Deterministic per-symbol pseudo-random walk
    let seed = 0;
    for (let i = 0; i < symbol.length; i++) seed = (seed * 31 + symbol.charCodeAt(i)) & 0xffff;
    const N = 80;
    const pts: number[] = [];
    let v = 0.5;
    for (let i = 0; i < N; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const r = (seed / 0x7fffffff) - 0.5;
      v = Math.max(0.05, Math.min(0.95, v + r * 0.07));
      pts.push(v);
    }
    const W = 100, H = 38;
    return pts.map((p, i) =>
      `${i === 0 ? "M" : "L"}${((i / (N - 1)) * W).toFixed(2)},${(H - p * H).toFixed(2)}`
    ).join(" ");
  }, [symbol]);

  const up = change >= 0;
  const col = up ? GREEN : RED;

  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${LINE}`,
      borderRadius: 6,
      padding: 14,
      display: "flex", flexDirection: "column", gap: 8,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{
          fontFamily: FONT, fontSize: 11, color: TEXT, fontWeight: 700, letterSpacing: "0.06em",
        }}>{symbol}</div>
        <div style={{
          fontFamily: FONT, fontSize: 9, color: col, fontWeight: 700,
        }}>{up ? "+" : ""}{change.toFixed(2)}%</div>
      </div>
      <div style={{
        fontFamily: FONT, fontSize: 16, color: TEXT, fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}>{price}</div>
      <svg viewBox="0 0 100 38" preserveAspectRatio="none"
           style={{ width: "100%", height: 48 }}>
        <defs>
          <linearGradient id={`g-${symbol}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor={col} stopOpacity="0.30" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L100,38 L0,38 Z`} fill={`url(#g-${symbol})`} />
        <path d={path} fill="none" stroke={col} strokeWidth="1.2" />
      </svg>
    </div>
  );
}

// ── Panel scaffold ───────────────────────────────────────────────────────────
function Panel({ title, accent = GREEN, children, height = 280 }: {
  title:   string;
  accent?: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${LINE}`,
      borderRadius: 6,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px",
        borderBottom: `1px solid ${LINE}`,
        display: "flex", alignItems: "center", gap: 10,
        background: SURFACE2,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: accent, boxShadow: `0 0 8px ${accent}`,
        }} />
        <span style={{
          fontFamily: FONT, fontSize: 10, letterSpacing: "0.18em",
          color: TEXT, fontWeight: 700,
        }}>{title}</span>
      </div>
      <div style={{
        flex: 1, padding: 14, height,
        overflowY: "auto", overflowX: "hidden",
        fontFamily: FONT,
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Row helpers for panels ──────────────────────────────────────────────────
function Row({ left, right, color = TEXT, sub }: {
  left: string; right: string; color?: string; sub?: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0",
      borderBottom: `1px solid ${LINE}`,
      fontSize: 11,
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ color: TEXT, fontWeight: 600 }}>{left}</span>
        {sub && <span style={{ color: MUTED, fontSize: 9, marginTop: 2 }}>{sub}</span>}
      </div>
      <span style={{ color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{right}</span>
    </div>
  );
}

// ── Synthetic data (replaceable with /api/portfolio/overview etc.) ──────────
const ACTIVE_TRADES = [
  { sym: "BTC/USD",  side: "LONG",  pnl: "+$248.14", up: true,  sub: "Entry 67,420.00 · 0.0150 BTC" },
  { sym: "ETH/USD",  side: "LONG",  pnl: "+$54.92",  up: true,  sub: "Entry 3,240.50 · 0.4000 ETH" },
  { sym: "SOL/USD",  side: "SHORT", pnl: "-$12.40",  up: false, sub: "Entry 182.10 · 2.5000 SOL" },
];

const TRADE_HISTORY = [
  { sym: "BTC/USD", pnl: "+$420.00", up: true,  sub: "Closed · 18:02 · LONG" },
  { sym: "ETH/USD", pnl: "+$112.50", up: true,  sub: "Closed · 14:38 · LONG" },
  { sym: "AVAX/USD", pnl: "-$48.20", up: false, sub: "Closed · 11:15 · LONG" },
  { sym: "DOGE/USD", pnl: "+$22.80", up: true,  sub: "Closed · 09:50 · LONG" },
  { sym: "ADA/USD",  pnl: "+$8.40",  up: true,  sub: "Closed · 08:12 · LONG" },
];

const SIGNALS = [
  { sym: "BTC/USD", side: "BUY",  conf: "84%", sub: "EMA bull · RSI 58 · vol +12%" },
  { sym: "ETH/USD", side: "BUY",  conf: "78%", sub: "Breakout · MTF aligned" },
  { sym: "SOL/USD", side: "WATCH",conf: "62%", sub: "Compression · low conf" },
  { sym: "ADA/USD", side: "BUY",  conf: "71%", sub: "Trend continuation" },
];

const TOP_GAINERS = [
  { sym: "DOGE/USD", chg: "+8.42%", sub: "$0.1240" },
  { sym: "AVAX/USD", chg: "+5.18%", sub: "$36.40" },
  { sym: "SOL/USD",  chg: "+3.92%", sub: "$185.20" },
  { sym: "ETH/USD",  chg: "+2.40%", sub: "$3,318.10" },
  { sym: "BTC/USD",  chg: "+1.18%", sub: "$68,140.00" },
];

const QUEUE = [
  { sym: "BTC/USD", side: "BUY",  conf: "84%", state: "QUEUED · executes when slot frees" },
  { sym: "ETH/USD", side: "BUY",  conf: "78%", state: "QUEUED · awaiting confirmation" },
  { sym: "ADA/USD", side: "BUY",  conf: "71%", state: "QUEUED · capacity limit reached" },
];

// ── Charts ───────────────────────────────────────────────────────────────────
const CHARTS = [
  { symbol: "BTC/USD",  price: "$68,140.00", change:  1.18 },
  { symbol: "ETH/USD",  price: "$3,318.10",  change:  2.40 },
  { symbol: "SOL/USD",  price: "$185.20",    change:  3.92 },
  { symbol: "ADA/USD",  price: "$0.4820",    change: -0.62 },
  { symbol: "AVAX/USD", price: "$36.40",     change:  5.18 },
  { symbol: "DOGE/USD", price: "$0.1240",    change:  8.42 },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Portal() {
  const { isAdmin } = useUserRole();
  const [tier, setTier] = useState<string>("free");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}/api/billing/subscription`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { plan?: string };
        if (!cancelled && data.plan) setTier(data.plan);
      } catch { /* leave default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      minHeight: "100dvh",
      background: BG,
      color: TEXT,
      fontFamily: FONT,
    }}>
      <TopBar />

      {isAdmin && (
        <div style={{
          padding: "8px 24px",
          background: "rgba(0,255,138,0.08)",
          borderBottom: `1px solid ${LINE2}`,
          fontFamily: FONT, fontSize: 10, letterSpacing: "0.16em",
          color: GREEN, display: "flex", alignItems: "center", gap: 12,
        }}>
          <span>▲ ADMIN VIEW — VIEWING CUSTOMER PORTAL</span>
          <Link href="/command">
            <a style={{ color: GREEN, textDecoration: "underline" }}>OPEN COMMAND CENTER →</a>
          </Link>
        </div>
      )}

      <LogoBanner tier={tier} />

      {/* Metrics row */}
      <div style={{
        padding: "12px 24px 0",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}>
        <MetricTile label="TOTAL P/L"        value="+$1,284.42" delta="+1.28%"    positive />
        <MetricTile label="WIN RATE"         value="68.4%"      delta="+2.1%"     positive />
        <MetricTile label="ACTIVE AI TRADES" value="3 / 3"      delta="STARTER"   positive />
        <MetricTile label="TODAY"            value="+$184.20"   delta="+0.18%"    positive />
        <MetricTile label="MONTHLY"          value="+$2,940.80" delta="+2.94%"    positive />
        <MetricTile label="AI CONFIDENCE"    value="78%"        delta="STRONG"    positive />
        <MetricTile label="BEST ASSET"       value="BTC/USD"    delta="+$420.00"  positive />
        <MetricTile label="EQUITY"           value="$101,284.42" />
      </div>

      {/* 6 live charts */}
      <div style={{
        padding: "16px 24px 0",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10,
      }}>
        {CHARTS.map((c) => (
          <MiniChart key={c.symbol} symbol={c.symbol} price={c.price} change={c.change} />
        ))}
      </div>

      {/* Panels */}
      <div style={{
        padding: "16px 24px 32px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 10,
      }}>
        <Panel title="ACTIVE TRADES">
          {ACTIVE_TRADES.map((t) => (
            <Row key={t.sym} left={`${t.sym}  ${t.side}`} right={t.pnl}
                 color={t.up ? GREEN : RED} sub={t.sub} />
          ))}
        </Panel>

        <Panel title="TRADE HISTORY">
          {TRADE_HISTORY.map((t, i) => (
            <Row key={`${t.sym}-${i}`} left={t.sym} right={t.pnl}
                 color={t.up ? GREEN : RED} sub={t.sub} />
          ))}
        </Panel>

        <Panel title="AI SIGNALS">
          {SIGNALS.map((s) => (
            <Row key={s.sym} left={`${s.sym}  ${s.side}`} right={s.conf}
                 color={s.side === "BUY" ? GREEN : s.side === "WATCH" ? "#ffaa33" : RED}
                 sub={s.sub} />
          ))}
        </Panel>

        <Panel title="TOP GAINERS">
          {TOP_GAINERS.map((t) => (
            <Row key={t.sym} left={t.sym} right={t.chg} color={GREEN} sub={t.sub} />
          ))}
        </Panel>

        <Panel title="SUBSCRIPTION STATUS">
          <Row left="Current Plan"    right={tier.toUpperCase()} color={GREEN} />
          <Row left="Concurrent Cap"  right={tier === "pro" ? "12 trades" : tier === "starter" ? "3 trades" : "Paper only"} />
          <Row left="Billing"         right={tier === "free" ? "—" : "Monthly"} sub="Cancel anytime · Stripe portal" />
          <Row left="Performance Fee" right="3% (profitable trades only)" sub="Never charged on losses" />
          <div style={{ marginTop: 14 }}>
            <Link href="/billing">
              <a style={{
                display: "block",
                textAlign: "center",
                padding: "10px 14px",
                background: `linear-gradient(180deg, ${GREEN} 0%, ${GREEN_D} 100%)`,
                border: `1px solid ${GREEN}`,
                borderRadius: 4,
                color: "#001a0d", fontWeight: 800, fontSize: 11,
                letterSpacing: "0.16em",
                textDecoration: "none",
                boxShadow: `0 0 18px ${GREEN_GL}`,
              }}>
                {tier === "pro" ? "MANAGE BILLING" : tier === "starter" ? "UPGRADE TO PRO" : "START AI TRADING"}
              </a>
            </Link>
          </div>
        </Panel>

        <Panel title="AI AUTO TRADE QUEUE">
          {QUEUE.map((q) => (
            <Row key={q.sym} left={`${q.sym}  ${q.side}`} right={q.conf}
                 color={GREEN} sub={q.state} />
          ))}
          <div style={{ marginTop: 10, color: MUTED, fontSize: 9, letterSpacing: "0.12em" }}>
            AI EXECUTES IN ORDER OF CONFIDENCE · CAPACITY GATED BY PLAN
          </div>
        </Panel>
      </div>

      <footer style={{
        padding: "20px 24px",
        borderTop: `1px solid ${LINE}`,
        textAlign: "center",
        color: MUTED, fontSize: 9, letterSpacing: "0.20em",
      }}>
        AICANDLEZ · ALPACA-ROUTED LIVE EXECUTION · 3% FEE ON PROFITABLE TRADES ONLY
      </footer>
    </div>
  );
}
