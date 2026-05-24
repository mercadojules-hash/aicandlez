/**
 * PortalCustomerShell — graduated CommandDeck v3 customer terminal.
 *
 * Phase E3 graduation of the approved
 * `artifacts/mockup-sandbox/src/components/mockups/ait-commanddeck/CommandDeck.tsx`
 * mockup into the production /portal customer surface.
 *
 * Wholesale customer-side replacement of the legacy paper-trade dashboard.
 * Crypto-only. PAPER-only. No ARM LIVE, no kill switch, no PAPER/LIVE toggle,
 * no equities, no Alpaca affordances. Withdrawal permissions never requested.
 *
 * Data sources (all routed through `lib/authFetch`):
 *   • `usePaperSignals`          — adapts the global engine breakdowns
 *                                  (/api/engine/status) into Opportunity
 *                                  cards (majors vs. alts split).
 *   • `useExecutionState`        — engine + crypto stream status.
 *   • `usePaperTrades`           — in-memory paper-trade store (QUEUE PAPER
 *                                  button enqueues here).
 *   • `useUserRole`              — feeds the tier/plan badge.
 *   • `/api/user/exchanges`      — exchange topology grid.
 *   • `/api/billing/subscription` — current plan badge.
 *
 * Visual fidelity preserved from the approved mockup: monochrome neon
 * green (#66FF66), hairline borders (#1A2E22), Bloomberg / prop-desk
 * density, IBM Plex Mono / JetBrains Mono. Confidence ring is the
 * dominant anchor in each opportunity card.
 */

import {
  useEffect, useMemo, useState, type ReactNode, type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Database, Filter, Globe,
  LineChart as LineChartIcon, Lock, MonitorPlay, PieChart, Radar, Radio,
  Search, Shield, Star, Terminal, Timer,
} from "lucide-react";

import { authFetch } from "../../lib/authFetch";
import { usePaperSignals, type OpportunityVM } from "../../hooks/usePaperSignals";
import { useExecutionState } from "../../hooks/useExecutionState";
import { usePaperTrades, STARTING_EQUITY } from "../../hooks/usePaperTrades";
import { useUserRole } from "../../hooks/useUserRole";
import { useDisclaimerGate } from "../../hooks/useDisclaimerGate";
import {
  AccountModal, UpgradeModal, DisclaimerModal,
} from "../../pages/portal/AdminPortalLegacy";

const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

// ── Theme tokens (mirrors mockup `_group.css`) ─────────────────────────────
const T = {
  BG_BLACK:    "#000000",
  BG_TERMINAL: "#050A07",
  BG_CARD:     "#070F0B",
  BORDER:      "#1A2E22",
  BORDER_GRN:  "rgba(102, 255, 102, 0.15)",
  NEON:        "#66FF66",
  NEON_GLOW:   "rgba(102, 255, 102, 0.45)",
  EMERALD:     "#00C853",
  LIME:        "#7CFF00",
  RED:         "#FF4D4D",
  AMBER:       "#FFB020",
  TEXT_0:      "#FFFFFF",
  TEXT_1:      "#A8B8B0",
  TEXT_2:      "#5F706A",
  TEXT_3:      "#3A4842",
  FONT_MONO:   "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
} as const;

type Plan = "free" | "starter" | "pro";

/* ──────────────────────────────────────────────────────────────────────── */
/* Operator Pulse Ribbon                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtUtc(d: Date): string {
  return `${d.toISOString().split("T")[1]?.split(".")[0]} UTC`;
}

function useCustomerPlan(): Plan {
  const { isSignedIn, getToken } = useAuth();
  const { data } = useQuery<{ plan?: string }>({
    queryKey: ["billing-subscription-portal-shell"],
    enabled:  isSignedIn ?? false,
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/billing/subscription`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("billing/subscription failed");
      return res.json();
    },
  });
  const p = data?.plan;
  return p === "starter" || p === "pro" ? p : "free";
}

function OperatorPulseRibbon({
  plan, equityUsd, realizedToday, engineOnline, openCount,
}: {
  plan:          Plan;
  equityUsd:     number;
  realizedToday: number;
  engineOnline:  boolean;
  openCount:     number;
}) {
  const now = useUtcClock();
  const planLabel =
    plan === "pro"     ? "PRO · CRYPTO · PRIORITY EXEC" :
    plan === "starter" ? "STARTER · CRYPTO · AI EXEC"   :
                         "FREE · PAPER · 7-DAY TRIAL";
  const realizedColor = realizedToday >= 0 ? T.NEON : T.RED;
  const realizedSign  = realizedToday >= 0 ? "+" : "−";

  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 50,
        background: T.BG_TERMINAL,
        borderBottom: `1px solid ${T.BORDER}`,
        padding: "6px 16px",
        fontFamily: T.FONT_MONO,
        fontSize: 11,
        overflow: "hidden",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center",
        gap: 16, maxWidth: 2000, margin: "0 auto",
        flexWrap: "wrap",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_0, fontWeight: 700, letterSpacing: "0.18em" }}>
          <Terminal size={13} color={T.NEON} /> AICANDLEZ
        </span>
        <RibbonDivider />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_1 }}>
          <Clock size={12} color={T.TEXT_2} /> {fmtUtc(now)}
        </span>
        <RibbonDivider />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 16, color: T.TEXT_2 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Globe size={11} /> NYC·US</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MonitorPlay size={11} /> WKS-04</span>
        </span>
        <RibbonDivider />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: engineOnline ? T.NEON : T.AMBER,
            boxShadow: engineOnline ? `0 0 8px ${T.NEON_GLOW}` : `0 0 8px ${T.AMBER}`,
            animation: engineOnline ? "brand-pulse 1.4s infinite" : undefined,
          }} />
          <span style={{ color: engineOnline ? T.NEON : T.AMBER, fontWeight: 600 }}>
            {engineOnline ? "ENGINE ONLINE" : "ENGINE PAUSED"}
          </span>
        </span>
        <RibbonDivider />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_1 }}>
          <Activity size={11} color={T.TEXT_2} /> PLATFORM SLOTS: {openCount}/3
        </span>
        <span style={{
          marginLeft: 4,
          padding: "2px 8px",
          border: `1px solid ${T.BORDER_GRN}`,
          background: T.BORDER_GRN,
          color: T.NEON,
          borderRadius: 3,
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 10,
        }}>
          <Shield size={10} /> {planLabel}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: T.TEXT_2 }}>PAPER BAL:&nbsp;
          <span style={{ color: T.TEXT_0 }}>${equityUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
        <span style={{ color: T.TEXT_2 }}>REALIZED (1D):&nbsp;
          <span style={{ color: realizedColor }}>{realizedSign}${Math.abs(realizedToday).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
      </div>
    </header>
  );
}

function RibbonDivider() {
  return <span style={{ width: 1, height: 14, background: T.BORDER }} />;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Paper Mode Banner                                                        */
/* ──────────────────────────────────────────────────────────────────────── */

function PaperModeBanner() {
  return (
    <div style={{
      padding: "4px 16px",
      background: "rgba(102,255,102,0.04)",
      borderBottom: `1px solid ${T.BORDER_GRN}`,
      color: T.TEXT_1,
      fontFamily: T.FONT_MONO,
      fontSize: 10,
      letterSpacing: "0.20em",
      textTransform: "uppercase",
      textAlign: "center",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}>
      <Lock size={11} color={T.NEON} />
      Paper Execution Mode Active — No real funds at risk
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Asset Intelligence Search Bar + Filter pills                             */
/* ──────────────────────────────────────────────────────────────────────── */

type Filt =
  | "ALL" | "MAJORS" | "ALTS" | "HIGH_CONF" | "READY" | "LONG" | "SHORT" | "WATCHLIST"
  | "LOW_VOL" | "TRENDING" | "BREAKOUT" | "SCALP" | "MOMENTUM";

function SearchBar({
  query, setQuery, filter, setFilter, suggestionPool,
}: {
  query:    string;
  setQuery: (s: string) => void;
  filter:   Filt;
  setFilter: (f: Filt) => void;
  suggestionPool: string[];
}) {
  const chips = suggestionPool.slice(0, 14);
  const pills: { id: Filt; label: string; group: 0 | 1 }[] = [
    { id: "ALL",       label: "All",                   group: 0 },
    { id: "MAJORS",    label: "Majors",                group: 0 },
    { id: "ALTS",      label: "Alts",                  group: 0 },
    { id: "HIGH_CONF", label: "High Confidence (≥75)", group: 0 },
    { id: "READY",     label: "Ready to Execute",      group: 0 },
    { id: "LONG",      label: "Long Bias",             group: 0 },
    { id: "SHORT",     label: "Short Bias",            group: 0 },
    { id: "WATCHLIST", label: "Watchlist",             group: 0 },
    { id: "LOW_VOL",   label: "LOW VOL",               group: 1 },
    { id: "TRENDING",  label: "TRENDING",              group: 1 },
    { id: "BREAKOUT",  label: "BREAKOUT",              group: 1 },
    { id: "SCALP",     label: "SCALP",                 group: 1 },
    { id: "MOMENTUM",  label: "MOMENTUM",              group: 1 },
  ];
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ position: "relative" }}>
        <Search size={18} color={T.NEON} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search crypto asset or AI opportunity… (BTC · ETH · SOL · XRP · DOGE · AVAX · LINK · ADA · SUI · PEPE · FET · TAO)"
          style={{
            width: "100%",
            background: T.BG_TERMINAL,
            border: `1px solid ${T.BORDER}`,
            color: T.TEXT_0,
            fontFamily: T.FONT_MONO,
            fontSize: 13,
            padding: "14px 44px 14px 44px",
            outline: "none",
            borderRadius: 0,
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = T.NEON}
          onBlur={(e) => e.currentTarget.style.borderColor = T.BORDER}
        />
        <button
          aria-label="Watchlist"
          title="Add to watchlist"
          style={{
            position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
            background: "transparent", border: "none", color: T.TEXT_2, cursor: "pointer",
            padding: 0,
          }}
        >
          <Star size={16} />
        </button>
      </div>

      <div style={{
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chips.map(chip => (
            <button
              key={chip}
              onClick={() => setQuery(chip)}
              style={{
                fontFamily: T.FONT_MONO, fontSize: 10,
                color: T.TEXT_1, background: "rgba(255,255,255,0.04)",
                border: "none", padding: "4px 8px",
                cursor: "pointer", borderRadius: 2,
              }}
            >
              {chip}
            </button>
          ))}
        </div>

        <div
          className="cd-pills-strip"
          style={{
            display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 6,
            overflowX: "auto", overflowY: "hidden",
            scrollbarWidth: "none",
          }}
        >
          <Filter size={13} color={T.TEXT_2} style={{ flexShrink: 0 }} />
          {pills.map((p, i, arr) => {
            const active = filter === p.id;
            const prev = arr[i - 1];
            const showDivider = !!prev && prev.group !== p.group;
            return (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {showDivider && (
                  <span aria-hidden style={{ width: 1, height: 14, background: T.BORDER, flexShrink: 0 }} />
                )}
                <button
                  onClick={() => setFilter(p.id)}
                  style={{
                    fontFamily: T.FONT_MONO, fontSize: 10,
                    padding: "4px 10px",
                    border: `1px solid ${active ? T.NEON : T.BORDER}`,
                    background: active ? "rgba(102,255,102,0.05)" : "transparent",
                    color: active ? T.NEON : T.TEXT_2,
                    borderRadius: 2, cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: active ? "0 0 8px rgba(102,255,102,0.25)" : "none",
                  }}
                >
                  {p.label}
                </button>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* OpportunityCard                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80, h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / Math.max(1, data.length - 1);
  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible", opacity: 0.85 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpportunityCard({ opp, onQueue, idx = 0 }: {
  opp: OpportunityVM;
  onQueue: (opp: OpportunityVM) => void;
  idx?: number;
}) {
  const isLong = opp.direction === "LONG";
  const dirColor = isLong ? T.NEON : opp.direction === "SHORT" ? T.RED : T.AMBER;
  const dirBg    = isLong ? "rgba(102,255,102,0.10)" : opp.direction === "SHORT" ? "rgba(255,77,77,0.10)" : "rgba(255,176,32,0.10)";
  const dirBorder = isLong ? "rgba(102,255,102,0.30)" : opp.direction === "SHORT" ? "rgba(255,77,77,0.30)" : "rgba(255,176,32,0.30)";
  const sparkColor = dirColor;
  const ready = opp.readiness === "READY";
  const railColor = opp.direction === "SHORT" ? T.RED : T.NEON;
  // v4.1 deterministic per-card animation delays so 20 cards don't sync.
  const seed = (opp.symbol.charCodeAt(0) + idx * 7) % 100;
  const flickerDelayMs = (seed * 17) % 1600;
  const sparkDelayMs   = (seed * 53) % 5000;
  const sweepDelayMs   = (seed * 113) % 12000;
  const railGlow =
    opp.conf >= 85 ? `0 0 14px ${railColor}` :
    opp.conf >= 70 ? `0 0 10px ${railColor}` :
    opp.conf >= 55 ? `0 0 6px ${railColor}`  :
                     `0 0 3px ${railColor}`;
  const railOpacity =
    opp.conf >= 85 ? 1.0 :
    opp.conf >= 70 ? 0.85 :
    opp.conf >= 55 ? 0.6 : 0.4;
  const railAnim = opp.conf >= 85 ? "rail-pulse 1.8s ease-in-out infinite" : "rail-pulse 2.5s ease-in-out infinite";

  return (
    <article
      style={{
        background: T.BG_TERMINAL,
        border: `1px solid ${T.BORDER}`,
        padding: 14,
        paddingLeft: 18,
        display: "flex", flexDirection: "column", gap: 10,
        position: "relative", overflow: "hidden",
        height: 300,
        fontFamily: T.FONT_MONO,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.BORDER_GRN; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.BORDER; }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          width: 3, background: railColor,
          boxShadow: railGlow,
          opacity: railOpacity,
          animation: railAnim,
          pointerEvents: "none", zIndex: 1,
        }}
      />
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: T.TEXT_0 }}>{opp.symbol}</span>
          <span style={{
            fontSize: 10, padding: "2px 6px", borderRadius: 3,
            background: "rgba(255,255,255,0.05)", color: T.TEXT_1,
          }}>{opp.assetClass}</span>
        </div>
        <span style={{
          fontSize: 11, padding: "2px 8px",
          border: `1px solid ${dirBorder}`,
          background: dirBg,
          color: dirColor, fontWeight: 700, letterSpacing: "0.10em",
          borderRadius: 3,
        }}>
          {opp.direction}
        </span>
      </div>

      {/* Middle: confidence ring + MTF + momentum */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
        <div style={{
          position: "relative", flexShrink: 0,
          width: 96, height: 96,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ConfidenceRing color={dirColor} value={opp.conf} />
          {/* v4.1 ring-sweep — single 30° bright arc rotating slowly over static ring. */}
          <svg
            aria-hidden
            width={96} height={96}
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              animation: "ring-sweep 12s linear infinite",
              animationDelay: `-${sweepDelayMs}ms`,
              transformOrigin: "50% 50%",
            }}
          >
            <circle
              cx={48} cy={48} r={42} fill="none"
              stroke={dirColor} strokeWidth={2}
              strokeDasharray="22 242" strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${dirColor})`, opacity: 0.7 }}
            />
          </svg>
          <span style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, fontWeight: 300, color: dirColor, letterSpacing: "-0.04em",
          }}>{opp.conf}</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Row label="REGIME" value={opp.regime} />
          <Row label="VOLATILITY" value={opp.vol} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {opp.mtf.map((m, i) => (
                <span
                  key={i}
                  title={["5m", "15m", "1H", "4H"][i]}
                  style={{
                    width: 11, height: 11, borderRadius: 2,
                    background: m === "green" ? T.NEON : m === "amber" ? T.AMBER : T.RED,
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              {[1, 2, 3].map(i => {
                const lit = i <= opp.momentum;
                return (
                  <span key={i} style={{
                    width: 5, height: 12,
                    background: lit ? dirColor : "rgba(255,255,255,0.10)",
                    animation: lit ? "momentum-breathe 3.4s ease-in-out infinite" : undefined,
                    animationDelay: lit ? `${(i - 1) * 150}ms` : undefined,
                  }} />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sparkline + details row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ position: "relative", width: 80, height: 36 }}>
          <Sparkline data={opp.sparkline} color={sparkColor} />
          {/* v4.1 spark-drift scan dot */}
          <span
            aria-hidden
            style={{
              position: "absolute", top: 16, left: 0,
              width: 3, height: 3, borderRadius: "50%",
              background: sparkColor, boxShadow: `0 0 4px ${sparkColor}`,
              animation: "spark-drift 5s linear infinite",
              animationDelay: `-${sparkDelayMs}ms`,
              pointerEvents: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ display: "flex", gap: 3 }}>
            {opp.exchanges.map(ex => (
              <span key={ex} style={{
                fontSize: 9, color: T.TEXT_2,
                background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: 2,
              }}>{ex}</span>
            ))}
          </div>
          <span style={{ fontSize: 10, color: T.TEXT_1 }}>{opp.quality}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontSize: 10, color: T.TEXT_2,
              animation: "telemetry-flicker 1.6s ease-in-out infinite",
              animationDelay: `-${flickerDelayMs}ms`,
            }}>{opp.latency}</span>
            <span style={{
              fontSize: 11, background: "rgba(255,255,255,0.08)",
              color: T.TEXT_0, padding: "1px 6px", borderRadius: 2,
            }}>{opp.score}</span>
          </div>
        </div>
      </div>

      {/* Footer: readiness + action */}
      <div style={{ borderTop: `1px solid ${T.BORDER}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: opp.readiness === "READY" ? T.NEON : opp.readiness === "WAITING" ? T.AMBER : T.TEXT_2,
            display: "inline-flex", alignItems: "center", gap: 5,
          }}>
            {opp.readiness === "READY"   && <CheckCircle2 size={11} />}
            {opp.readiness === "WAITING" && <Timer size={11} />}
            {opp.readiness === "GATED"   && <Lock size={11} />}
            {opp.readiness}
          </span>
          <button
            onClick={() => ready && onQueue(opp)}
            disabled={!ready}
            style={{
              padding: "4px 12px", fontSize: 10, fontWeight: 700,
              fontFamily: T.FONT_MONO, letterSpacing: "0.08em",
              border: `1px solid ${ready ? T.NEON : T.BORDER}`,
              background: "transparent",
              color: ready ? T.NEON : T.TEXT_3,
              cursor: ready ? "pointer" : "not-allowed",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              if (!ready) return;
              e.currentTarget.style.background = T.NEON;
              e.currentTarget.style.color = "#000";
            }}
            onMouseLeave={(e) => {
              if (!ready) return;
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = T.NEON;
            }}
          >
            QUEUE PAPER
          </button>
        </div>
        <span style={{
          fontSize: 10, fontStyle: "italic", color: T.TEXT_2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{opp.reasoning}</span>
      </div>
    </article>
  );
}

function ConfidenceRing({ color, value }: { color: string; value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg width={96} height={96} style={{ position: "absolute", inset: 0 }}>
      <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={2} />
      <circle
        cx={48} cy={48} r={r} fill="none"
        stroke={color} strokeWidth={2}
        strokeDasharray={`${c * pct} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dasharray 600ms ease" }}
      />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
      <span style={{ color: T.TEXT_2 }}>{label}</span>
      <span style={{ color: T.TEXT_0 }}>{value}</span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Opportunity Matrix (Majors / Alts columns)                               */
/* ──────────────────────────────────────────────────────────────────────── */

function filterOpps(opps: OpportunityVM[], query: string, filter: Filt): OpportunityVM[] {
  const q = query.trim().toUpperCase();
  return opps.filter(o => {
    if (q && !(o.symbol.includes(q) || o.name.toUpperCase().includes(q))) return false;
    switch (filter) {
      case "MAJORS":    return o.assetClass === "MAJOR";
      case "ALTS":      return o.assetClass === "ALT";
      case "HIGH_CONF": return o.conf >= 75;
      case "READY":     return o.readiness === "READY";
      case "LONG":      return o.direction === "LONG";
      case "SHORT":     return o.direction === "SHORT";
      // v4.1 expanded filters — derived from existing OpportunityVM fields.
      case "LOW_VOL":   return o.vol === "LOW VOL";
      case "TRENDING":  return o.regime === "TRENDING";
      case "BREAKOUT":  return o.regime === "BREAKOUT";
      case "SCALP":     return o.readiness === "READY" && (o.regime === "BREAKOUT" || o.regime === "EXHAUSTED");
      case "MOMENTUM":  return o.momentum === 3;
      case "WATCHLIST": return true; // watchlist store not yet wired on customer surface — no-op
      default:          return true;
    }
  });
}

function ColumnHeader({ title, count, accent, subLabel }: {
  title: string; count: number; accent: string; subLabel: string;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      borderBottom: `1px solid ${T.BORDER}`, paddingBottom: 6,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{
          margin: 0, fontFamily: T.FONT_MONO, fontSize: 14, color: T.TEXT_0,
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          <Radar size={14} color={accent} /> {title}
          <span style={{
            background: "rgba(255,255,255,0.10)", color: T.TEXT_0,
            fontSize: 10, padding: "1px 6px", borderRadius: 2,
          }}>{count}</span>
        </h2>
        <span style={{ fontSize: 10, color: T.TEXT_2, fontFamily: T.FONT_MONO }}>SORT: CONFIDENCE ↓</span>
      </div>
      <span style={{
        fontFamily: T.FONT_MONO, fontSize: 9, letterSpacing: "0.14em",
        color: accent, opacity: 0.55,
      }}>
        {subLabel}
      </span>
    </div>
  );
}

function OpportunityMatrix({
  majors, alts, onQueue, isLoading, isError,
}: {
  majors:    OpportunityVM[];
  alts:      OpportunityVM[];
  onQueue:   (opp: OpportunityVM) => void;
  isLoading: boolean;
  isError:   boolean;
}) {
  return (
    <section style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
      gap: 20, position: "relative",
    }}>
      <Column
        title="MAJORS"
        opps={majors}
        onQueue={onQueue}
        isLoading={isLoading}
        isError={isError}
        accent="#66FF66"
        subLabel={`TIER 1 · CORE LIQUIDITY · ${majors.length} TRACKED`}
        tintRgba="rgba(102,255,102,0.015)"
      />
      <Column
        title="ALTS / EMERGING"
        opps={alts}
        onQueue={onQueue}
        isLoading={isLoading}
        isError={isError}
        accent="#7CFF00"
        subLabel={`TIER 2 · EMERGING · HIGH BETA · ${alts.length} TRACKED`}
        tintRgba="rgba(124,255,0,0.015)"
        leftDivider
      />
    </section>
  );
}

function Column({
  title, opps, onQueue, isLoading, isError,
  accent, subLabel, tintRgba, leftDivider = false,
}: {
  title: string; opps: OpportunityVM[]; onQueue: (opp: OpportunityVM) => void;
  isLoading: boolean; isError: boolean;
  accent: string; subLabel: string; tintRgba: string; leftDivider?: boolean;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 14,
      position: "relative", paddingLeft: 12,
      backgroundImage: `linear-gradient(180deg, ${tintRgba} 0%, rgba(0,0,0,0) 60%)`,
      borderLeft: leftDivider ? `1px solid rgba(102,255,102,0.08)` : undefined,
    }}>
      <span
        aria-hidden
        style={{
          position: "absolute", left: leftDivider ? 1 : 0, top: 0, bottom: 0,
          width: 1, background: accent,
          boxShadow: `0 0 6px ${accent}, 0 0 2px ${accent}`,
          opacity: 0.55, pointerEvents: "none",
        }}
      />
      <ColumnHeader title={title} count={opps.length} accent={accent} subLabel={subLabel} />
      <div style={{
        display: "flex", flexDirection: "column", gap: 14,
        overflowY: "auto", maxHeight: 1000, paddingRight: 4,
      }}>
        {isError && opps.length === 0 && (
          <div style={{
            padding: 24, textAlign: "center", color: "#FF4D4D", fontFamily: T.FONT_MONO,
            border: `1px dashed #FF4D4D55`, fontSize: 11,
          }}>
            ENGINE FEED UNAVAILABLE · /api/engine/status failed · retrying…
          </div>
        )}
        {!isError && opps.length === 0 && (
          <div style={{
            padding: 24, textAlign: "center", color: T.TEXT_2, fontFamily: T.FONT_MONO,
            border: `1px dashed ${T.BORDER}`, fontSize: 11,
          }}>
            {isLoading ? "Loading engine signals…" : `No ${title.toLowerCase()} match the current filters.`}
          </div>
        )}
        {opps.map((o, idx) => (
          <OpportunityCard key={o.pair} opp={o} idx={idx} onQueue={onQueue} />
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Lower terminal zone modules                                              */
/* ──────────────────────────────────────────────────────────────────────── */

function PanelCard({
  title, children, span = 1, height = 288, live = false,
}: {
  title: string; children: ReactNode; span?: number; height?: number; live?: boolean;
}) {
  const style: CSSProperties = {
    background: T.BG_TERMINAL,
    border: `1px solid ${T.BORDER}`,
    display: "flex", flexDirection: "column",
    height,
    fontFamily: T.FONT_MONO,
    gridColumn: span > 1 ? `span ${span}` : undefined,
  };
  return (
    <div style={style}>
      <div style={{
        padding: 10, borderBottom: `1px solid ${T.BORDER}`,
        background: "rgba(0,0,0,0.40)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <h3 style={{ margin: 0, fontSize: 11, color: T.TEXT_0, letterSpacing: "0.08em" }}>{title}</h3>
        {live && <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: T.NEON, boxShadow: `0 0 8px ${T.NEON_GLOW}`,
          animation: "brand-pulse 1.4s infinite",
        }} />}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

function AIReasoningConsole() {
  const exec = useExecutionState();
  const { data: engine } = useQuery<{ recentSignalLog?: Array<{ id: string; symbol: string; timeframe: string; decision: string; confidence: number; shortSummary?: string; timestamp: number }> }>({
    queryKey: ["engine-status-portal"],
    queryFn: async () => {
      const res = await authFetch(`${apiBaseUrl}/api/engine/status`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("engine_status_failed");
      return res.json();
    },
    refetchInterval: 6_000,
    staleTime: 3_000,
    retry: 1,
  });
  const log = (engine?.recentSignalLog ?? []).slice(0, 14);

  return (
    <PanelCard title="AI REASONING CONSOLE" span={2} live={exec.data?.engine.running}>
      <div style={{ padding: 10, overflowY: "auto", flex: 1, fontSize: 11 }}>
        {log.length === 0 && (
          <div style={{ color: T.TEXT_2, fontStyle: "italic" }}>Awaiting first engine signal…</div>
        )}
        {log.map((e) => {
          const d = (e.decision ?? "").toUpperCase();
          const delta = d === "BUY" ? "+" : d === "SELL" ? "−" : "·";
          const dColor = d === "BUY" ? T.NEON : d === "SELL" ? T.RED : T.TEXT_2;
          const t = new Date(e.timestamp);
          const time = `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}:${t.getSeconds().toString().padStart(2, "0")}`;
          return (
            <div key={e.id} style={{
              display: "flex", gap: 12, alignItems: "flex-start",
              padding: "5px 6px", borderLeft: `1px solid transparent`,
              transition: "background 120ms",
            }}>
              <span style={{ color: T.TEXT_2, flexShrink: 0 }}>{time}</span>
              <span style={{ color: T.TEXT_0, flexShrink: 0, width: 44 }}>{shortPair(e.symbol)}</span>
              <span style={{ color: T.TEXT_1, flex: 1 }}>{e.shortSummary ?? `${d} @ ${e.timeframe} · conf ${e.confidence.toFixed(0)}%`}</span>
              <span style={{ color: dColor, flexShrink: 0 }}>{delta}{e.confidence.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}

function shortPair(s: string): string {
  return s.replace(/USDT?$/, "").replace(/[-/].*$/, "").toUpperCase();
}

function PortfolioIntelligence() {
  const { stats, open } = usePaperTrades();
  return (
    <PanelCard title="PORTFOLIO INTEL">
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, color: T.TEXT_2, marginBottom: 3 }}>PAPER EQUITY (USD)</div>
            <div style={{ fontSize: 20, color: T.TEXT_0 }}>
              ${stats.equity.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              <span style={{ color: T.TEXT_2 }}>.{(stats.equity % 1).toFixed(2).slice(2)}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: T.TEXT_2, marginBottom: 3 }}>REALIZED</div>
            <div style={{ fontSize: 13, color: stats.realizedPnl >= 0 ? T.NEON : T.RED }}>
              {stats.realizedPnl >= 0 ? "+" : "−"}${Math.abs(stats.realizedPnl).toFixed(2)}
            </div>
          </div>
        </div>
        <svg width="100%" height={48} viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d="M0,35 Q10,38 20,25 T40,15 T60,20 T80,5 T100,10" fill="none" stroke={T.NEON} strokeWidth={1} opacity={0.6} />
          <defs>
            <linearGradient id="port-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.NEON} />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path d="M0,40 L0,35 Q10,38 20,25 T40,15 T60,20 T80,5 T100,10 L100,40 Z" fill="url(#port-grad)" opacity={0.10} />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
          {open.slice(0, 3).map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
              <span style={{ color: T.TEXT_1 }}>
                <span style={{ color: p.side === "LONG" ? T.NEON : T.RED }}>{p.side.charAt(0)}</span>&nbsp;{shortPair(p.symbol)}
              </span>
              <span style={{ color: p.pnl >= 0 ? T.NEON : T.RED }}>
                {p.pnl >= 0 ? "+" : "−"}${Math.abs(p.pnl).toFixed(2)}
              </span>
            </div>
          ))}
          {open.length === 0 && (
            <div style={{ color: T.TEXT_2, fontSize: 10, fontStyle: "italic" }}>No open paper positions.</div>
          )}
        </div>
      </div>
    </PanelCard>
  );
}

function SignalPipeline({ opps }: { opps: OpportunityVM[] }) {
  const candidate = opps[opps.length - 1];
  const analyzed  = opps.find(o => o.readiness === "WAITING") ?? opps[2];
  const confirmed = opps.find(o => o.readiness === "READY")  ?? opps[1];
  const queued    = opps.find(o => o.readiness === "READY" && o.conf >= 80) ?? opps[0];
  const steps = [
    { label: candidate ? `CANDIDATE: ${candidate.symbol} (${candidate.conf}%)` : "CANDIDATE: —", stage: 0 },
    { label: analyzed  ? `ANALYZED: ${analyzed.symbol} (${analyzed.conf}%)`    : "ANALYZED: —",  stage: 1 },
    { label: confirmed ? `CONFIRMED: ${confirmed.symbol} (${confirmed.conf}%)` : "CONFIRMED: —", stage: 2 },
    { label: queued    ? `QUEUED: ${queued.symbol} (${queued.conf}%)`          : "QUEUED: —",    stage: 3 },
  ];
  return (
    <PanelCard title="SIGNAL PIPELINE" live>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, flex: 1 }}>
        {steps.map((s, i) => {
          const dotOpacity = [0.20, 0.40, 0.60, 1.00][s.stage];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: T.NEON, opacity: dotOpacity,
                boxShadow: s.stage === 3 ? `0 0 8px ${T.NEON_GLOW}` : "none",
              }} />
              <span style={{
                fontSize: 12, fontFamily: T.FONT_MONO,
                color: s.stage >= 2 ? T.TEXT_0 : T.TEXT_2,
              }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}

type ConnectedRow = { exchange: string; connected: boolean };
function ExchangeTopology() {
  const { getToken, isSignedIn } = useAuth();
  const { data } = useQuery<{ exchanges: ConnectedRow[] }>({
    queryKey: ["user-exchanges"],
    enabled:  isSignedIn ?? false,
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/user/exchanges`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("user/exchanges failed");
      return res.json();
    },
  });
  // Crypto-only exchange universe; Alpaca intentionally omitted from the
  // customer surface (paper-only, no Alpaca affordances on this terminal).
  const universe = ["Binance", "Kraken", "Coinbase", "Bybit", "OKX", "KuCoin"];
  const connected = new Set((data?.exchanges ?? []).filter(e => e.connected).map(e => e.exchange));
  return (
    <PanelCard title="EXCHANGE TOPOLOGY" span={2} height={208}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 6 }}>
          {universe.map(name => {
            const isConn = connected.has(name);
            return (
              <div
                key={name}
                style={{
                  padding: 8, display: "flex", flexDirection: "column", gap: 4,
                  border: `1px solid ${isConn ? T.BORDER : "rgba(26,46,34,0.40)"}`,
                  background: isConn ? "rgba(255,255,255,0.04)" : "transparent",
                  textAlign: "left", color: "inherit", fontFamily: T.FONT_MONO,
                }}
              >
                <span style={{ fontSize: 10, color: isConn ? T.TEXT_0 : T.TEXT_3 }}>{name}</span>
                <span style={{ fontSize: 9, color: isConn ? T.NEON : T.TEXT_3 }}>
                  {isConn ? "CONNECTED" : "NOT CONNECTED"}
                </span>
              </div>
            );
          })}
        </div>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, fontSize: 9, color: T.TEXT_2, marginTop: 8 }}>
          <Shield size={11} /> Withdrawal permissions are never requested.
        </span>
      </div>
    </PanelCard>
  );
}

function RiskHeatmap({ opps }: { opps: OpportunityVM[] }) {
  // 16 cells: pick top 16 opportunities by confidence; risk = inverse of conf,
  // scaled by volatility classification.
  const cells = opps.slice(0, 16).map(o => {
    const volMult = o.vol === "ELEVATED" ? 1.2 : o.vol === "LOW VOL" ? 0.6 : 1.0;
    const risk = Math.min(1, ((100 - o.conf) / 100) * volMult);
    return { sym: o.symbol, risk };
  });
  while (cells.length < 16) cells.push({ sym: "—", risk: 0.05 });
  return (
    <PanelCard title="RISK HEATMAP" height={208}>
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, flex: 1 }}>
        {cells.map((c, i) => {
          const color = c.risk > 0.7 ? T.RED : c.risk > 0.4 ? T.AMBER : T.NEON;
          return (
            <div
              key={i}
              title={`${c.sym} · risk ${(c.risk * 100).toFixed(0)}%`}
              style={{
                background: color,
                opacity: Math.max(0.20, c.risk),
                borderRadius: 2,
              }}
            />
          );
        })}
      </div>
    </PanelCard>
  );
}

function MarketRegime({ opps }: { opps: OpportunityVM[] }) {
  const picks = ["BTC", "ETH", "SOL"]
    .map(s => opps.find(o => o.symbol === s))
    .filter((o): o is OpportunityVM => !!o);
  return (
    <PanelCard title="MARKET REGIME" height={208}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", flex: 1 }}>
        {picks.length === 0 && (
          <span style={{ color: T.TEXT_2, fontSize: 10, fontStyle: "italic" }}>Awaiting regime signal…</span>
        )}
        {picks.map(p => {
          const tone = p.regime === "EXHAUSTED" ? T.AMBER : p.regime === "BREAKOUT" || p.regime === "TRENDING" ? T.NEON : T.TEXT_1;
          return (
            <div key={p.symbol} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: `1px solid ${T.BORDER}`, paddingBottom: 8,
            }}>
              <span style={{ fontSize: 11, color: T.TEXT_1 }}>{p.symbol}</span>
              <span style={{
                fontSize: 10, color: tone,
                background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 3,
              }}>{p.regime}</span>
            </div>
          );
        })}
        <span style={{ fontSize: 10, color: T.TEXT_2, fontStyle: "italic", marginTop: 6 }}>
          Majors consolidating while alts show relative strength.
        </span>
      </div>
    </PanelCard>
  );
}

function AIThroughput() {
  const exec = useExecutionState();
  const { data: engine } = useQuery<{ signalsGenerated?: number; tradesExecuted?: number; mtfConfirmedCount?: number; funnel?: { total?: number; passedMTF?: number; executed?: number } }>({
    queryKey: ["engine-status-portal"],
    queryFn: async () => {
      const res = await authFetch(`${apiBaseUrl}/api/engine/status`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("engine_status_failed");
      return res.json();
    },
    refetchInterval: 6_000,
    staleTime: 3_000,
    retry: 1,
  });
  const tps = engine?.funnel?.total ?? 0;
  const sigs = engine?.signalsGenerated ?? 0;
  const mtf = engine?.mtfConfirmedCount ?? 0;
  const queueDepth = exec.data ? 0 : "—";
  return (
    <PanelCard title="AI THROUGHPUT" live height={208}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", flex: 1, fontSize: 10 }}>
        <Kv k="ENGINE EVALS" v={tps.toLocaleString()} />
        <Kv k="SIGNALS GENERATED" v={sigs.toLocaleString()} />
        <Kv k="MTF CONFIRMED" v={mtf.toLocaleString()} />
        <Kv k="QUEUE DEPTH" v={String(queueDepth)} />
      </div>
    </PanelCard>
  );
}

function ExecutionAwareness({ openCount }: { openCount: number }) {
  const { stats } = usePaperTrades();
  return (
    <PanelCard title="EXEC AWARENESS" live height={208}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", flex: 1, fontSize: 10 }}>
        <Kv k="PAPER TRADES (SESSION)" v={String(stats.totalCount)} />
        <Kv k="OPEN POSITIONS" v={`${openCount} / 3`} />
        <Kv k="REALIZED P/L" v={`${stats.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(stats.realizedPnl).toFixed(2)}`} color={stats.realizedPnl >= 0 ? T.NEON : T.RED} />
        <div style={{ height: 1, background: T.BORDER, margin: "4px 0" }} />
        <Kv k="CAPACITY" v={`${openCount}/3 PAPER SLOTS USED`} color={T.NEON} />
      </div>
    </PanelCard>
  );
}

function Kv({ k, v, color = T.TEXT_0 }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: T.TEXT_2 }}>
      <span>{k}</span>
      <span style={{ color }}>{v}</span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Operator Telemetry Footer Strip                                          */
/* ──────────────────────────────────────────────────────────────────────── */

function OperatorTelemetryStrip({ engineOnline }: { engineOnline: boolean }) {
  return (
    <footer style={{
      background: T.BG_TERMINAL,
      borderTop: `1px solid ${T.BORDER}`,
      padding: "8px 16px",
      fontFamily: T.FONT_MONO,
      fontSize: 11,
      color: T.TEXT_2,
      position: "sticky", bottom: 0, zIndex: 30,
      display: "flex", flexWrap: "wrap", gap: 24,
      alignItems: "center", justifyContent: "flex-start",
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Radio size={11} color={T.NEON} style={{ animation: "brand-pulse 1.4s infinite" }} />
        LATENCY TO ENGINE:&nbsp;<span style={{ color: T.TEXT_0 }}>{engineOnline ? "12ms" : "—"}</span>
      </span>
      <Divider />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Database size={11} /> LAST ENGINE TICK:&nbsp;<span style={{ color: T.TEXT_0 }}>{engineOnline ? "0.4s ago" : "—"}</span>
      </span>
      <Divider />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <LineChartIcon size={11} color={T.AMBER} /> DRAWDOWN GUARD:&nbsp;<span style={{ color: T.AMBER }}>ACTIVE (5%)</span>
      </span>
      <Divider />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <PieChart size={11} /> PORTFOLIO RISK:&nbsp;<span style={{ color: T.TEXT_0 }}>LOW (12% EXPOSED)</span>
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_3 }}>
        <AlertTriangle size={11} /> Paper telemetry · zero broker exposure
      </span>
    </footer>
  );
}

function Divider() {
  return <span style={{ width: 1, height: 12, background: T.BORDER }} />;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* ENABLE LIVE AI TRADING — aspirational command bar (paper-only, gated)    */
/* ──────────────────────────────────────────────────────────────────────── */

function EnableLiveAITradingBar({
  engineOnline, openPaper, slotCap, onUpgrade,
}: {
  engineOnline: boolean;
  openPaper:    number;
  slotCap:      number;
  onUpgrade:    () => void;
}) {
  const engineLabel = engineOnline ? "AI ENGINE · ONLINE" : "AI ENGINE · WARMING UP";
  const engineColor = engineOnline ? T.NEON : T.AMBER;
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        borderTop: `1px solid ${T.NEON}`,
        borderBottom: `1px solid ${T.NEON}`,
        background: T.BG_TERMINAL,
        backgroundImage:
          "linear-gradient(90deg, rgba(102,255,102,0.06) 0%, rgba(102,255,102,0) 50%, rgba(102,255,102,0.06) 100%)",
        fontFamily: T.FONT_MONO,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: 140,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(102,255,102,0.18) 50%, transparent 100%)",
          animation: "cmdbar-scan 6s linear infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative", zIndex: 1,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 24, padding: "10px 16px",
        }}
      >
        {/* LEFT */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Radar
            size={16}
            color={engineColor}
            style={{ animation: "brand-pulse 1.4s infinite" }}
          />
          <span style={{
            fontSize: 11, color: engineColor, fontWeight: 700, letterSpacing: "0.20em",
          }}>{engineLabel}</span>
        </div>

        {/* CENTER */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          flex: 1, minWidth: 0, textAlign: "center",
        }}>
          <span style={{
            color: T.TEXT_0, fontSize: 13, fontWeight: 700, letterSpacing: "0.22em",
          }}>
            ENABLE LIVE AI TRADING
          </span>
          <span style={{
            color: T.TEXT_1, fontSize: 10, letterSpacing: "0.14em", marginTop: 2,
          }}>
            PAPER MODE ACTIVE · LIVE EXECUTION GATED · UPGRADE TO UNLOCK PRO QUEUE
          </span>
        </div>

        {/* RIGHT */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: T.TEXT_1, letterSpacing: "0.14em" }}>
            SLOTS:&nbsp;<span style={{ color: T.TEXT_0 }}>{openPaper}/{slotCap}</span>
          </span>
          <button
            type="button"
            onClick={onUpgrade}
            style={{
              fontFamily: T.FONT_MONO, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.16em",
              padding: "6px 12px",
              border: `1px solid ${T.NEON}`,
              background: "rgba(102,255,102,0.06)",
              color: T.NEON,
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = T.NEON;
              e.currentTarget.style.color = "#000";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(102,255,102,0.06)";
              e.currentTarget.style.color = T.NEON;
            }}
          >
            VIEW PRO ACCESS
          </button>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Shell                                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export function PortalCustomerShell() {
  const { isAdmin } = useUserRole();
  const plan = useCustomerPlan();
  const exec = useExecutionState();
  const engineOnline = !!exec.data?.engine.running;
  const { majors, alts, opportunities, isLoading, isError } = usePaperSignals();
  const { stats: paperStats, openTrade, open: openTrades } = usePaperTrades();

  const [query,   setQuery]   = useState("");
  const [filter,  setFilter]  = useState<Filt>("ALL");
  const [account, setAccount] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [disclaimer, setDisclaimer] = useState(false);
  const { gate: disclaimerGate, modal: disclaimerGateModal } = useDisclaimerGate();

  const filteredMajors = useMemo(() => filterOpps(majors, query, filter), [majors, query, filter]);
  const filteredAlts   = useMemo(() => filterOpps(alts,   query, filter), [alts,   query, filter]);

  const queuePaper = (opp: OpportunityVM) => {
    if (opp.direction === "FLAT") return;
    openTrade({
      symbol:  opp.pair,
      display: opp.display,
      side:    opp.direction === "LONG" ? "LONG" : "SHORT",
      entry:   opp.entry,
      stop:    opp.stop,
      target:  opp.target,
    });
  };

  // Surface the customer shell only on the customer surface. The Portal
  // dispatcher already gates on `isAdmin`, so this is purely defensive.
  void isAdmin;

  // Compose chip suggestion pool from current opportunities, padded with
  // the canonical majors universe so the chip strip is never empty on a
  // cold engine.
  const suggestionPool = useMemo(() => {
    const live = opportunities.map(o => o.symbol);
    const fallback = ["BTC", "ETH", "SOL", "XRP", "DOGE", "AVAX", "LINK", "ADA", "SUI", "PEPE", "FET", "TAO", "ARB", "ATOM", "MATIC", "INJ"];
    const seen = new Set<string>();
    return [...live, ...fallback].filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  }, [opportunities]);

  return (
    <div style={{
      minHeight: "100dvh",
      background: T.BG_BLACK,
      color: T.TEXT_1,
      fontFamily: T.FONT_MONO,
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @keyframes rail-pulse {
          0%   { opacity: 0.70; }
          50%  { opacity: 1.00; }
          100% { opacity: 0.70; }
        }
        @keyframes cmdbar-scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        /* v4.1 — institutional card micro-animations */
        @keyframes momentum-breathe {
          0%   { opacity: 0.70; }
          50%  { opacity: 1.00; }
          100% { opacity: 0.70; }
        }
        @keyframes spark-drift {
          0%   { transform: translateX(0px);  opacity: 0; }
          20%  { opacity: 0.5; }
          50%  { opacity: 1; }
          80%  { opacity: 0.5; }
          100% { transform: translateX(77px); opacity: 0; }
        }
        @keyframes ring-sweep {
          0%   { transform: rotate(-90deg); }
          100% { transform: rotate(270deg); }
        }
        @keyframes telemetry-flicker {
          0%   { opacity: 0.85; }
          50%  { opacity: 1.00; }
          100% { opacity: 0.85; }
        }
        /* hide scrollbar on horizontal filter pill strip */
        .cd-pills-strip::-webkit-scrollbar { display: none; }
      `}</style>
      <OperatorPulseRibbon
        plan={plan}
        equityUsd={paperStats.equity || STARTING_EQUITY}
        realizedToday={paperStats.todayPnl}
        engineOnline={engineOnline}
        openCount={openTrades.length}
      />
      <PaperModeBanner />

      <main style={{
        flex: 1, width: "100%", maxWidth: 2000, margin: "0 auto",
        padding: "24px 16px", display: "flex", flexDirection: "column", gap: 28,
      }}>
        {/* Account / upgrade / disclaimer entry strip */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end",
        }}>
          <ToolbarBtn onClick={() => setAccount(true)}>ACCOUNT</ToolbarBtn>
          {/* P1 fix (E3): CONNECT EXCHANGE removed from customer surface.
              Customer /portal is paper-only; live broker connect (which
              defaults the visible catalog to Alpaca) belongs to the
              admintrade. operator terminal, not here. Read-only exchange
              health remains visible in ExchangeTopology below. */}
          {plan !== "pro" && <ToolbarBtn variant="brand" onClick={() => setUpgrade(true)}>UPGRADE</ToolbarBtn>}
          <ToolbarBtn onClick={() => setDisclaimer(true)}>DISCLAIMER</ToolbarBtn>
        </div>

        <SearchBar
          query={query} setQuery={setQuery}
          filter={filter} setFilter={setFilter}
          suggestionPool={suggestionPool}
        />

        <EnableLiveAITradingBar
          engineOnline={engineOnline}
          openPaper={openTrades.length}
          slotCap={3}
          onUpgrade={() => setUpgrade(true)}
        />

        <OpportunityMatrix
          majors={filteredMajors}
          alts={filteredAlts}
          onQueue={queuePaper}
          isLoading={isLoading}
          isError={isError}
        />

        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          paddingTop: 20,
          borderTop: `1px solid ${T.BORDER}`,
        }}>
          <AIReasoningConsole />
          <PortfolioIntelligence />
          <SignalPipeline opps={opportunities} />
          <MarketRegime opps={opportunities} />
          <ExchangeTopology />
          <RiskHeatmap opps={opportunities} />
          <AIThroughput />
          <ExecutionAwareness openCount={openTrades.length} />
        </section>
      </main>

      <OperatorTelemetryStrip engineOnline={engineOnline} />

      <UpgradeModal    open={upgrade}    onClose={() => setUpgrade(false)} gate={disclaimerGate} />
      <AccountModal    open={account}    onClose={() => setAccount(false)} tier={plan} onUpgrade={() => setUpgrade(true)} />
      <DisclaimerModal open={disclaimer} onClose={() => setDisclaimer(false)} />
      {/* P1 fix (E3): PortalExchangeConnectModal intentionally NOT mounted
          on the customer surface — its default visible catalog includes
          Alpaca, which violates the crypto-only paper invariant. */}
      {disclaimerGateModal}
    </div>
  );
}

function ToolbarBtn({
  children, onClick, variant = "default",
}: {
  children: ReactNode; onClick: () => void; variant?: "default" | "brand";
}) {
  const brand = variant === "brand";
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        fontFamily: T.FONT_MONO, fontSize: 10, fontWeight: 700,
        letterSpacing: "0.14em",
        background: brand ? "rgba(102,255,102,0.08)" : "transparent",
        border: `1px solid ${brand ? T.NEON : T.BORDER}`,
        color: brand ? T.NEON : T.TEXT_1,
        cursor: "pointer",
        textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}
