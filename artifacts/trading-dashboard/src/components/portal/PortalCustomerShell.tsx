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
  memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
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
} from "./modals";

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
  // Pass 4.9 — tertiary label lift. Old value (#3A4842) sank below
  // useful reading threshold on dense panels (stage labels, exchange
  // NOT-CONNECTED rows, Kv keys). Lifted to #586B63 to restore
  // hierarchy without crossing into secondary tone territory.
  TEXT_3:      "#586B63",
  FONT_MONO:   "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
  // ── Polish scale (institutional rhythm) ──────────────────────────────
  // Letter-spacing tracks: collapse to 3 tiers + 1 display exception.
  TRACK_LABEL:   "0.10em",  // short CAPS chips, telemetry labels, button text
  TRACK_TITLE:   "0.18em",  // section / brand / engine titles
  TRACK_DISPLAY: "-0.04em", // hero display digits (confidence ring)
  // Transitions: one cadence everywhere so hover/state changes feel uniform.
  TX_FAST:       "120ms ease",
  TX_MED:        "200ms ease",
} as const;

type Plan = "free" | "starter" | "pro";

/* ──────────────────────────────────────────────────────────────────────── */
/* Operator Pulse Ribbon                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

/* Pass 3.3: `useUtcClock` removed. The ribbon now derives its Date
 * from the shared shell-level `nowShell` (single 1Hz source) passed
 * as a prop, eliminating a redundant 1s setInterval at module load. */

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

const OperatorPulseRibbon = memo(function OperatorPulseRibbon({
  plan, equityUsd, realizedToday, engineOnline, openCount,
  pulse, signalsPerMin, now: nowMs,
}: {
  plan:          Plan;
  equityUsd:     number;
  realizedToday: number;
  engineOnline:  boolean;
  openCount:     number;
  pulse:         MarketPulse;
  signalsPerMin: number;
  /** Pass 3.3: shared 1Hz tick from shell. Was an internal
   *  `useUtcClock` setInterval; now a single source of truth. */
  now:           number;
}) {
  // Construct Date from shared tick — re-renders at the shell cadence
  // (paused when the tab is hidden via the visibility-aware `useNow1s`).
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const planLabel =
    plan === "pro"     ? "PRO · CRYPTO · PRIORITY EXEC" :
    plan === "starter" ? "STARTER · CRYPTO · AI EXEC"   :
                         "FREE · PAPER · 7-DAY TRIAL";
  const realizedColor = realizedToday >= 0 ? T.NEON : T.RED;
  const realizedSign  = realizedToday >= 0 ? "+" : "−";

  // Long/short imbalance — neutral if both arms close to 50%.
  const imbalance = Math.abs(pulse.longPct - pulse.shortPct);
  const imbalanceTone =
    imbalance < 20 ? T.TEXT_1 :
    pulse.longPct >= pulse.shortPct ? T.NEON : T.RED;

  const queueTone = pulse.ready > 0 ? T.NEON : T.TEXT_2;
  const confTone  = pulse.avgConf >= 70 ? T.NEON : pulse.avgConf >= 55 ? T.TEXT_0 : T.TEXT_2;

  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 50,
        // Pass 4.8 — institutional depth gradient on the operator
        // ribbon so the strip reads as a backlit hardware bezel rather
        // than a flat panel. Subtle enough to preserve text contrast,
        // strong enough to give the command center a "live console"
        // atmosphere on first scan.
        background: `linear-gradient(180deg, #050A07 0%, ${T.BG_TERMINAL} 60%, #030604 100%)`,
        borderBottom: `1px solid ${T.BORDER}`,
        padding: "7px 16px 8px",
        fontFamily: T.FONT_MONO,
        fontSize: 11,
        overflow: "hidden",
        // Bottom edge glow — single neon hairline that anchors the
        // ribbon visually to the workspace below. Always-on; reads as
        // a hardware power-rail indicator.
        boxShadow: `inset 0 -1px 0 rgba(102,255,102,0.12), 0 1px 0 rgba(102,255,102,0.06)`,
      }}
    >
      <div className="cd-ribbon" style={{
        display: "flex", alignItems: "center",
        gap: 14, maxWidth: 2000, margin: "0 auto",
        flexWrap: "nowrap", minWidth: 0, overflow: "hidden",
        whiteSpace: "nowrap",
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          color: T.TEXT_0, fontWeight: 700, letterSpacing: "0.20em",
          flexShrink: 0, textShadow: `0 0 6px rgba(102,255,102,0.30)`,
        }}>
          <Terminal size={13} color={T.NEON} style={{ filter: `drop-shadow(0 0 4px ${T.NEON_GLOW})` }} />
          AICANDLEZ
          <span style={{
            fontSize: 8, color: T.NEON, opacity: 0.65,
            letterSpacing: "0.18em", marginLeft: 2,
            padding: "1px 5px", border: `1px solid rgba(102,255,102,0.30)`,
            borderRadius: 2,
          }}>OPS</span>
        </span>
        <RibbonDivider />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_1, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          <Clock size={12} color={T.TEXT_2} /> {fmtUtc(now)}
        </span>
        <RibbonDivider />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: engineOnline ? T.NEON : T.AMBER,
            // Multi-layer beacon bloom — encodes "engine is live" as a
            // focal anchor in the ribbon. Paused state stays single-layer.
            boxShadow: engineOnline
              ? `0 0 6px ${T.NEON}, 0 0 14px ${T.NEON_GLOW}, 0 0 22px rgba(102,255,102,0.20)`
              : `0 0 8px ${T.AMBER}`,
            animation: engineOnline ? "brand-pulse 1.4s infinite" : undefined,
          }} />
          <span style={{
            color: engineOnline ? T.NEON : T.AMBER, fontWeight: 600,
            textShadow: engineOnline ? `0 0 8px ${T.NEON_GLOW}` : undefined,
          }}>
            {engineOnline ? "ENGINE ONLINE" : "ENGINE PAUSED"}
          </span>
        </span>

        <RibbonDivider prio={2} />
        {/* Pass 4.8 — AI INTEL cluster. The SIG/MIN → L/S → AVG CONF →
            QUEUE metrics already lived in the ribbon; this label
            promotes them as the "AI Intelligence Center" the operator
            scans first. Subtle bracket framing, no new data wiring. */}
        <span data-prio="2" aria-hidden style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          color: T.NEON, opacity: 0.55,
          fontSize: 8, letterSpacing: "0.22em",
          flexShrink: 0,
        }}>
          <span style={{ width: 1, height: 10, background: "rgba(102,255,102,0.40)" }} />
          AI INTEL
        </span>
        <span
          data-prio="2"
          title={`Signals generated per minute, since session start`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_2, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
        >
          <Activity size={11} color={T.TEXT_2} /> SIG/MIN:&nbsp;
          <span style={{ color: signalsPerMin > 0 ? T.TEXT_0 : T.TEXT_2 }}>
            {signalsPerMin >= 10 ? signalsPerMin.toFixed(0) : signalsPerMin.toFixed(1)}
          </span>
        </span>

        <RibbonDivider prio={2} />
        <span
          data-prio="2"
          title={`${pulse.long} long · ${pulse.short} short · ${pulse.flat} flat (of ${pulse.total})`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_2, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
        >
          L/S:&nbsp;
          <span style={{ color: imbalanceTone, fontWeight: 600 }}>
            {pulse.longPct}/{pulse.shortPct}
          </span>
        </span>

        <RibbonDivider prio={2} />
        <span
          data-prio="2"
          title={`Average AI confidence across ${pulse.total} watched symbols`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_2, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
        >
          AVG CONF:&nbsp;
          <span style={{ color: confTone, fontWeight: 600 }}>{pulse.avgConf}%</span>
        </span>

        <RibbonDivider prio={3} />
        <span
          data-prio="3"
          title={`${pulse.ready} READY · ${pulse.waiting} WAITING · ${pulse.gated} GATED`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_2, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
        >
          QUEUE:&nbsp;
          <span style={{ color: queueTone, fontWeight: 600 }}>{pulse.ready}</span>
          <span style={{ color: T.TEXT_3 }}>/</span>
          <span style={{ color: T.AMBER }}>{pulse.waiting}</span>
          <span style={{ color: T.TEXT_3 }}>/</span>
          <span style={{ color: T.RED }}>{pulse.gated}</span>
        </span>

        <RibbonDivider prio={3} />
        <span
          data-prio="3"
          title="Concurrent live trade cap (platform-wide, controlled beta)"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_1, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
        >
          SLOTS: {openCount}/3
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
        {/* Pass 4.8 — KPI anchor. Promoted with bracketed visual
            grouping + larger numeric weight so the operator's right-
            edge scan lands on capital state. */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "3px 10px",
          background: "linear-gradient(180deg, rgba(102,255,102,0.04) 0%, rgba(0,0,0,0) 100%)",
          border: `1px solid rgba(102,255,102,0.18)`,
          borderRadius: 2,
          flexShrink: 0,
        }}>
          <span style={{ color: T.TEXT_3, fontVariantNumeric: "tabular-nums", fontSize: 9, letterSpacing: "0.16em" }}>PAPER BAL</span>
          <span style={{
            color: T.TEXT_0, fontVariantNumeric: "tabular-nums",
            fontSize: 12, fontWeight: 700, letterSpacing: "-0.01em",
          }}>${equityUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span aria-hidden style={{ width: 1, height: 12, background: "rgba(102,255,102,0.20)" }} />
          <span style={{ color: T.TEXT_3, fontVariantNumeric: "tabular-nums", fontSize: 9, letterSpacing: "0.16em" }}>REALIZED 1D</span>
          <span style={{
            color: realizedColor, fontVariantNumeric: "tabular-nums",
            fontSize: 12, fontWeight: 700, letterSpacing: "-0.01em",
            textShadow: realizedToday !== 0 ? `0 0 6px ${realizedColor}33` : undefined,
          }}>
            {realizedSign}${Math.abs(realizedToday).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </span>
      </div>
    </header>
  );
});

void Globe; void MonitorPlay; // formerly rendered NYC·US / WKS-04 stub badges; retained as imports for parity with mockup palette

function RibbonDivider({ prio }: { prio?: 2 | 3 } = {}) {
  return (
    <span
      data-prio={prio}
      style={{ width: 1, height: 14, background: T.BORDER, flexShrink: 0 }}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Paper Mode Banner                                                        */
/* ──────────────────────────────────────────────────────────────────────── */

const PaperModeBanner = memo(function PaperModeBanner() {
  // Pass 4.8 — subtle status-strip shimmer + locked icon glow. Reads
  // as a live safety rail rather than a static label. Animation gated
  // by the global reduced-motion umbrella on `.cd-portal-root`.
  return (
    <div style={{
      position: "relative",
      padding: "5px 16px",
      background: "linear-gradient(90deg, rgba(102,255,102,0.02) 0%, rgba(102,255,102,0.06) 50%, rgba(102,255,102,0.02) 100%)",
      borderBottom: `1px solid ${T.BORDER_GRN}`,
      color: T.TEXT_1,
      fontFamily: T.FONT_MONO,
      fontSize: 10,
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      textAlign: "center",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      overflow: "hidden",
    }}>
      <span aria-hidden style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 120,
        background: "linear-gradient(90deg, transparent 0%, rgba(102,255,102,0.12) 50%, transparent 100%)",
        animation: "edge-sweep 8s linear infinite",
        pointerEvents: "none",
      }} />
      <Lock size={11} color={T.NEON} style={{ filter: `drop-shadow(0 0 4px ${T.NEON_GLOW})` }} />
      <span>Paper Execution Mode Active — No real funds at risk</span>
      <span aria-hidden style={{
        width: 5, height: 5, borderRadius: "50%",
        background: T.NEON,
        boxShadow: `0 0 6px ${T.NEON}, 0 0 12px ${T.NEON_GLOW}`,
        animation: "brand-pulse 2s ease-in-out infinite",
      }} />
    </div>
  );
});

/**
 * DataFeedBanner — explicit infra-event surfacing when the candle/ticker
 * pipeline is unhealthy. Replaces the prior failure mode where a stalled
 * data feed presented as a quietly-empty engine, which read as a UI bug
 * to operators. State-gated: only mounts when the server flags
 * `dataFeedHealth.healthy === false`. Source of truth = api-server
 * `lib/marketData.ts → getDataFeedHealth()`.
 */
const DataFeedBanner = memo(function DataFeedBanner({
  health,
}: {
  health: NonNullable<EngineLite["dataFeedHealth"]>;
}) {
  const ageSec = health.lastSuccessAt
    ? Math.floor((Date.now() - health.lastSuccessAt) / 1_000)
    : null;
  const ageText = ageSec == null
    ? "no successful candle fetch since boot"
    : ageSec < 60
      ? `last good candle ${ageSec}s ago`
      : ageSec < 3_600
        ? `last good candle ${Math.floor(ageSec / 60)}m ago`
        : `last good candle ${Math.floor(ageSec / 3_600)}h ago`;
  return (
    <div style={{
      padding: "6px 16px",
      background: "rgba(255,77,77,0.08)",
      borderBottom: `1px solid rgba(255,77,77,0.45)`,
      color: "#FF8888",
      fontFamily: T.FONT_MONO,
      fontSize: 10,
      letterSpacing: "0.20em",
      textTransform: "uppercase",
      textAlign: "center",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: "#FF4D4D", boxShadow: "0 0 6px rgba(255,77,77,0.8)",
        animation: "brand-pulse 1.4s infinite",
      }} />
      Candle Feed Degraded · Engine Paused · {ageText} · {health.primary}={health.primaryStatus} {health.fallback}={health.fallbackStatus}
    </div>
  );
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Asset Intelligence Search Bar + Filter pills                             */
/* ──────────────────────────────────────────────────────────────────────── */

type Filt =
  | "ALL" | "MAJORS" | "ALTS" | "MEME" | "HIGH_CONF" | "READY" | "LONG" | "SHORT" | "WATCHLIST"
  | "LOW_VOL" | "TRENDING" | "BREAKOUT" | "SCALP" | "MOMENTUM";

// Pass 4.8 — meme / high-volatility universe. Filter-only (no engine
// schema change). DOGE is also in MAJORS per usePaperSignals; that's
// fine — it surfaces in both depending on selected filter.
const MEME_UNIVERSE = new Set<string>([
  "DOGE", "PEPE", "BONK", "WIF", "FLOKI", "BRETT",
  "POPCAT", "MOG", "TURBO", "BOME", "SHIB", "MEME",
]);

const SearchBar = memo(function SearchBar({
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
    { id: "MEME",      label: "Meme / Hi-Vol",         group: 0 },
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
          placeholder="Search crypto asset or AI opportunity… (BTC · ETH · SOL · DOGE · PEPE · WIF · BONK · POPCAT · FLOKI · BRETT · MOG · TURBO)"
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
});

/* ──────────────────────────────────────────────────────────────────────── */
/* OpportunityCard                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000)  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1)     return `$${n.toFixed(2)}`;
  if (n >= 0.01)  return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

function rrRatio(entry: number, stop: number, target: number): string {
  const risk   = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (!Number.isFinite(risk) || !Number.isFinite(reward) || risk <= 0) return "—";
  return `1:${(reward / risk).toFixed(1)}`;
}

function pctDelta(from: number, to: number): string {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return "—";
  const pct = ((to - from) / from) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function signalAge(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60)  return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60)  return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/* Pass 3.3: visibility-aware 1Hz tick. The shell mounts ONE of these
 * (`nowShell`) and passes it down to every consumer (OperatorPulseRibbon,
 * OpportunityMatrix → Column → OpportunityCard, OperatorTelemetryStrip).
 * - Pauses its setInterval when `document.hidden` so background tabs
 *   stop spending cycles on relative-age repaints.
 * - On `visibilitychange` back to visible, immediately resyncs `now`
 *   to wall-clock then resumes ticking — no stale `42m` for `3s`
 *   while the user is re-focusing the tab. */
function useNow1s(): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id == null) id = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (id != null) { clearInterval(id); id = null; }
    };
    const onVis = () => {
      if (typeof document !== "undefined" && document.hidden) {
        stop();
      } else {
        setNow(Date.now());
        start();
      }
    };
    if (typeof document === "undefined" || !document.hidden) start();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
      stop();
    };
  }, []);
  return now;
}

/* Sub-second precision relative formatter for very fresh telemetry. */
function signalAgePrecise(ts: number | null | undefined, now: number): string {
  if (!ts) return "—";
  const ms = Math.max(0, now - ts);
  if (ms < 1000)   return `${ms}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.round(ms / 60_000);
  if (m < 60)      return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24)      return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/* Pass 3.4: ZERO internal timers. Track signals/min since first
 * non-zero observation; recompute happens naturally on the shell's
 * 1Hz `nowShell` re-render (which the shell already owns and which
 * pauses on hidden tab). The previous 5s `setInterval(force…)` was
 * the last surviving custom-interval source in the customer portal
 * surface; removing it leaves the shell with a single 1Hz timer plus
 * React Query's own per-query refetch schedulers and nothing else.
 *
 * Stabilizer behavior preserved: returns 0 until ≥0.25 min elapsed
 * since the first non-null observation (avoids "9000/min" spikes
 * from a single tick fired moments after mount). `now` is taken
 * inline via `Date.now()` rather than as a prop so callers can
 * trigger recompute by any means (currently: shell 1Hz tick). */
function useSignalRate(signalsGenerated: number | undefined): number {
  const anchorRef = useRef<{ value: number; ts: number } | null>(null);
  if (signalsGenerated == null) return 0;
  if (anchorRef.current == null) {
    anchorRef.current = { value: signalsGenerated, ts: Date.now() };
    return 0;
  }
  const anchor = anchorRef.current;
  const elapsedMin = (Date.now() - anchor.ts) / 60_000;
  if (elapsedMin < 0.25) return 0;
  const delta = Math.max(0, signalsGenerated - anchor.value);
  return delta / elapsedMin;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* MarketPulse — synchronized telemetry view-model                           */
/* ──────────────────────────────────────────────────────────────────────── */

type EngineLite = {
  running?:           boolean;
  signalsGenerated?:  number;
  tradesExecuted?:    number;
  tradesBlocked?:     number;
  mtfConfirmedCount?: number;
  mtfBlockCount?:     number;
  correlationBlocks?: number;
  lastTickAt?:        number | null;
  lastSignalAt?:      number | null;
  lastTradeAt?:       number | null;
  loopIntervalMs?:    number;
  signalCounts?:      { BUY?: number; SELL?: number; HOLD?: number };
  funnel?:            { total?: number; passedMTF?: number; blockedMTF?: number; executed?: number };
  recentSignalLog?:   ReadonlyArray<ReasoningEntry>;
  // Pass 4.2 — server-side candle feed health. When healthy === false
  // the shell renders <DataFeedBanner /> so the empty-engine state is
  // explicit (infra event) instead of ambiguous (apparent UI bug).
  dataFeedHealth?: {
    healthy:             boolean;
    primary:             string;
    fallback:            string;
    primaryStatus:       "ok" | "degraded" | "down";
    fallbackStatus:      "ok" | "degraded" | "down";
    lastSuccessAt:       number | null;
    lastSuccessSource:   string | null;
    lastFailureAt:       number | null;
    lastFailureSource:   string | null;
    lastFailureReason:   string | null;
    consecutiveFailures: number;
  };
};

type MarketPulse = {
  total:        number;
  long:         number;
  short:        number;
  flat:         number;
  longPct:      number;     // 0..100, of directional only
  shortPct:     number;     // 0..100, of directional only
  ready:        number;
  waiting:      number;
  gated:        number;
  readyPct:     number;     // 0..100, of total
  avgConf:      number;     // 0..100
  elevatedVolPct: number;   // 0..100
  lowVolPct:    number;     // 0..100
  momentumBreadthPct: number; // 0..100, share with momentum≥2
  regimeTop:    { label: string; pct: number } | null;
  blockRatePct: number;     // funnel MTF block rate
  execRatePct:  number;     // funnel execute / passedMTF
};

function computeMarketPulse(
  opps: ReadonlyArray<OpportunityVM>,
  engine: EngineLite | undefined,
): MarketPulse {
  const total = opps.length;
  let long = 0, short = 0, flat = 0;
  let ready = 0, waiting = 0, gated = 0;
  let confSum = 0;
  let elevated = 0, lowVol = 0;
  let momentumBreadth = 0;
  const regimeCounts = new Map<string, number>();

  for (const o of opps) {
    if (o.direction === "LONG")       long++;
    else if (o.direction === "SHORT") short++;
    else                              flat++;
    if (o.readiness === "READY")        ready++;
    else if (o.readiness === "WAITING") waiting++;
    else if (o.readiness === "GATED")   gated++;
    confSum += o.conf || 0;
    if (o.vol === "ELEVATED") elevated++;
    else if (o.vol === "LOW VOL") lowVol++;
    if (typeof o.momentum === "number" && o.momentum >= 2) momentumBreadth++;
    if (o.regime) regimeCounts.set(o.regime, (regimeCounts.get(o.regime) ?? 0) + 1);
  }

  const directional = long + short;
  const longPct  = directional ? Math.round((long  / directional) * 100) : 0;
  const shortPct = directional ? Math.round((short / directional) * 100) : 0;

  let regimeTop: { label: string; pct: number } | null = null;
  if (total > 0 && regimeCounts.size > 0) {
    let best: [string, number] = ["", 0];
    for (const entry of regimeCounts) if (entry[1] > best[1]) best = entry;
    if (best[1] > 0) regimeTop = { label: best[0], pct: Math.round((best[1] / total) * 100) };
  }

  const fTotal      = engine?.funnel?.total      ?? 0;
  const fBlocked    = engine?.funnel?.blockedMTF ?? 0;
  const fPassed     = engine?.funnel?.passedMTF  ?? 0;
  const fExecuted   = engine?.funnel?.executed   ?? 0;
  const blockRatePct = fTotal  ? Math.round((fBlocked  / fTotal)  * 100) : 0;
  const execRatePct  = fPassed ? Math.round((fExecuted / fPassed) * 100) : 0;

  return {
    total, long, short, flat,
    longPct, shortPct,
    ready, waiting, gated,
    readyPct: total ? Math.round((ready / total) * 100) : 0,
    avgConf:  total ? Math.round(confSum / total) : 0,
    elevatedVolPct: total ? Math.round((elevated / total) * 100) : 0,
    lowVolPct:      total ? Math.round((lowVol   / total) * 100) : 0,
    momentumBreadthPct: total ? Math.round((momentumBreadth / total) * 100) : 0,
    regimeTop,
    blockRatePct,
    execRatePct,
  };
}

/**
 * Sparkline — Pass 4.3 cinematic upgrade.
 *
 * Promoted from a tiny 80×36 boxed widget into a full-card-width
 * execution-telemetry band. Renders via viewBox so the SVG fluidly
 * stretches across whatever container it's dropped into (the card's
 * dedicated chart row is 100% wide). Three visual layers, all tied to
 * real telemetry — no decorative motion:
 *
 *  1. Mean-baseline reference line (institutional restraint cue —
 *     gives the line context against where the asset has been).
 *  2. Area fill gradient (stronger than v4.1: 0.55→0) so the chart
 *     reads as "filled volume", not "thin line on black".
 *  3. Stroke layered with multi-blur drop-shadow for cinematic neon
 *     glow without arcade tint.
 *
 * Live-mode (gated by `live` prop, set when tick <10s) adds:
 *  - leading-edge marker dot at the most recent point with a soft
 *    radial glow — visually anchors "this is the live tip of the tape"
 *  - tape-advance shimmer (a vertical light band that crosses the
 *    chart once every 6s) — communicates active market flow without
 *    crossing into arcade territory.
 */
function Sparkline({
  data, color, height = 62, live = false, seedDelayMs = 0,
}: {
  data: number[];
  color: string;
  height?: number;
  live?: boolean;
  seedDelayMs?: number;
}) {
  // viewBox coords — we'll scale via preserveAspectRatio=none so the
  // SVG stretches to any container width while the chart line stays
  // crisp (vector). VBW chosen large enough that per-bar steps don't
  // round-snap together on long series.
  const VBW = 320;
  const VBH = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const mean = data.reduce((a, b) => a + b, 0) / Math.max(1, data.length);
  const meanY = (VBH - ((mean - min) / range) * VBH).toFixed(1);
  const step = VBW / Math.max(1, data.length - 1);
  const pts  = data.map((v, i) => ({
    x: i * step,
    y: VBH - ((v - min) / range) * VBH,
  }));
  const lastPt  = pts[pts.length - 1];
  // Pass 4.5 — smooth Catmull-Rom → cubic bezier path. Replaces the
  // jagged polyline with organically-curved telemetry. Each segment's
  // control points are derived from neighbour-vector tangents so the
  // line flows like real market data instead of reading as
  // angular/geometric SVG. Tension factor (1/6) is the canonical
  // Catmull-Rom uniform-spline tightness — gives organic curvature
  // without overshoot artifacts on tight reversals.
  const smoothPath = (() => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  })();
  // Closed area path: smooth top edge + baseline-back-to-origin so the
  // gradient fills underneath the curve, not a polygon-of-vertices.
  const areaPath = smoothPath + ` L ${VBW} ${VBH} L 0 ${VBH} Z`;
  // Per-instance unique id — avoids duplicate-DOM-id coupling across many
  // sparklines (architect nit, Pass 4.1). useId() output contains ":" which
  // SVG url(#...) tolerates, but sanitize for safety against future XML
  // serializers.
  const rawId  = useId();
  const safe   = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `spark-grad-${safe}`;
  const tipId  = `spark-tip-${safe}`;
  // Pass 4.4 — total trace length, used as stroke-dasharray seed for the
  // continuous flow overlay. Approximate sum of segment lengths gives a
  // dash pattern that traces the line exactly so dashoffset animation
  // reads as "energy flowing along the tape" not arbitrary segments.
  let traceLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    traceLen += Math.sqrt(dx * dx + dy * dy);
  }
  // Sliding-window highlight = 18% of trace, gap = rest. Animation runs
  // a full dashoffset cycle every 4s when live, deterministic per-card
  // delay so the grid doesn't sync.
  // Pass 4.5 — widened highlight band (18%→25%) so the rolling tape is
  // visually obvious on tall sparklines, not a faint flicker.
  const flowDash = Math.max(30, traceLen * 0.25);
  const flowGap  = Math.max(30, traceLen - flowDash);
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${VBW} ${VBH}`}
      preserveAspectRatio="none"
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.55" />
          <stop offset="55%"  stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
        <radialGradient id={tipId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={color} stopOpacity="1"   />
          <stop offset="60%"  stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0"   />
        </radialGradient>
      </defs>
      {/* Faint background grid hairlines — 4 horizontal divisions for
          institutional chart vocabulary. Gives the eye reference rails
          for the trace's vertical excursions. */}
      {[0.25, 0.5, 0.75].map(t => (
        <line
          key={t}
          x1={0} x2={VBW} y1={VBH * t} y2={VBH * t}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Mean baseline — dashed reference rail, color-tinted */}
      <line
        x1={0} x2={VBW} y1={meanY} y2={meanY}
        stroke={color} strokeOpacity={0.22}
        strokeWidth={1} strokeDasharray="4 6"
        vectorEffect="non-scaling-stroke"
      />
      {/* Smooth area fill — bezier-curved underside reads as organic
          market envelope, not faceted polygon. */}
      <path
        d={areaPath}
        fill={`url(#${gradId})`}
      />
      {/* Soft outer glow stroke — smooth path */}
      <path
        d={smoothPath}
        fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity={0.28}
        vectorEffect="non-scaling-stroke"
        style={{ filter: `blur(3px)` }}
      />
      {/* Crisp inner stroke with multi-layer drop-shadow halo — Pass 6.1a
          bumped 2/5/12px → 3/7/14px so sparklines read as "live market
          telemetry" instead of a faint trace against the chassis. */}
      <path
        d={smoothPath}
        fill="none" stroke={color} strokeWidth={2.6}
        strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 7px ${color}) drop-shadow(0 0 14px ${color})` }}
      />
      {/* Pass 4.4 — CONTINUOUS FLOW OVERLAY (Pass 4.5: smooth-pathed).
          A duplicate of the trace stroked with a single bright dash
          that slides along the line via stroke-dashoffset animation.
          This is the dominant motion cue: the line itself appears to
          carry energy, not just sit there. Pass 4.5 tuned tempo:
          3s/cycle (was 4s) and a 25%-trace-length highlight (was 18%)
          give a more obviously-rolling tape without crossing into
          arcade speed. Gated on the live prop (signal updated <30s);
          stale cards keep static traces. */}
      {live && (
        <path
          d={smoothPath}
          fill="none" stroke={color} strokeWidth={2.8}
          strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray={`${flowDash} ${flowGap}`}
          style={{
            filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 10px ${color})`,
            animation: `spark-flow 3s linear infinite`,
            animationDelay: `-${seedDelayMs}ms`,
            opacity: 0.95,
          }}
        />
      )}
      {/* Leading-edge live marker — only when telemetry is fresh */}
      {live && lastPt && (
        <>
          <circle
            cx={lastPt.x} cy={lastPt.y} r={6}
            fill={`url(#${tipId})`}
            style={{
              animation: `spark-tip-breathe 1.6s ease-in-out infinite`,
              animationDelay: `-${seedDelayMs}ms`,
              transformOrigin: `${lastPt.x}px ${lastPt.y}px`,
            }}
          />
          <circle
            cx={lastPt.x} cy={lastPt.y} r={2}
            fill={color}
            style={{ filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})` }}
          />
        </>
      )}
    </svg>
  );
}

const OpportunityCard = memo(function OpportunityCard({ opp, onQueue, idx = 0, now }: {
  opp: OpportunityVM;
  onQueue: (opp: OpportunityVM) => void;
  idx?: number;
  now: number;
}) {
  const ageStr = signalAge(opp.lastUpdated, now);
  // Animation-gating derivations — every motion must answer
  // "what intelligence state is this communicating?". Idle cards stay still.
  const tickMs        = Math.max(0, now - opp.lastUpdated);
  // Pass 7a — TEMPORAL REALISM. Signals are living market events that
  // age out of relevance; the tier ladder modulates visual prominence
  // without ever removing the card abruptly. Continuous market-flow
  // perception. Tiers (institutional cadence, no arcade tint):
  //   FRESH    (0-30s)   — full intensity, all motion gates open
  //   SETTLING (30-90s)  — −8% opacity, animations still allowed
  //   AGING    (90-180s) — −22% opacity, telemetry animations OFF
  //   EXPIRED  (>180s)   — −45% opacity, fully static (graceful fade,
  //                        replaced by newer evaluations when engine
  //                        re-prioritizes the symbol)
  const ageTier: "FRESH" | "SETTLING" | "AGING" | "EXPIRED" =
    tickMs < 30_000  ? "FRESH"    :
    tickMs < 90_000  ? "SETTLING" :
    tickMs < 180_000 ? "AGING"    : "EXPIRED";
  const ageOpacity =
    ageTier === "FRESH"    ? 1.00 :
    ageTier === "SETTLING" ? 0.92 :
    ageTier === "AGING"    ? 0.78 : 0.55;
  // Existing motion gates rescoped onto the age ladder. `isFreshSignal`
  // was always meant to mean "FRESH tier" — now it literally does.
  // `isLiveTick` (<10s heartbeat) still requires FRESH so an AGING card
  // can never accidentally flicker.
  const isFreshSignal = ageTier === "FRESH";
  const isLiveTick    = tickMs < 10_000 && isFreshSignal;
  const isReady       = opp.readiness === "READY";        // ring-sweep crystallization cue
  const rr     = rrRatio(opp.entry, opp.stop, opp.target);
  const gatedReason = opp.readiness === "GATED" && opp.reason ? opp.reason : null;
  const isLong = opp.direction === "LONG";
  const dirColor = isLong ? T.NEON : opp.direction === "SHORT" ? T.RED : T.AMBER;
  // Pass 4.5 — conviction-tier semantic color. The confidence system is
  // now the "emotional heartbeat" of the platform: the eye reads signal
  // QUALITY (>=80 green / 60-79 amber / <60 red) before reading any
  // text. This decouples conviction from direction — a LOW-conf LONG
  // and a LOW-conf SHORT both flash RED on the ring even though their
  // direction pills stay green/red respectively.
  const confColor = opp.conf >= 80 ? T.NEON : opp.conf >= 60 ? T.AMBER : T.RED;
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
  // Pass 4.4 — rail animation state-gated. Only READY cards with fresh
  // telemetry pulse; WAITING / GATED / stale cards keep a static rail
  // honoring the "idle systems stay still" invariant. Glow + opacity
  // continue to encode conf tier without continuous motion.
  const railAnim = isReady && isFreshSignal
    ? (opp.conf >= 85 ? "rail-pulse 1.8s ease-in-out infinite" : "rail-pulse 2.5s ease-in-out infinite")
    : undefined;

  return (
    <article
      style={{
        background: T.BG_TERMINAL,
        border: `1px solid ${T.BORDER}`,
        padding: 8,
        paddingLeft: 18,
        paddingRight: 10,
        // Pass 4.7 — outer article is now a single horizontal row. The
        // inner flex split (left ring anchor | right telemetry+chart+
        // action) replaces the previous vertical stack so the chart
        // becomes the dominant horizontal movement surface.
        display: "flex", flexDirection: "row", gap: 0,
        position: "relative", overflow: "hidden",
        height: 142,
        fontFamily: T.FONT_MONO,
        // Pass 7a — age decay. ageOpacity collapses FRESH→SETTLING→
        // AGING→EXPIRED into a single multiplier so the whole card
        // (ring, sparkline, telemetry, action) fades together. 600ms
        // transition is slow enough to read as "aging", not "blink".
        opacity: ageOpacity,
        // Deterministic hover cadence — background + border tinted in lock-step.
        transition: `background-color ${T.TX_FAST}, border-color ${T.TX_FAST}, opacity 600ms ease`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.BORDER_GRN;
        e.currentTarget.style.background   = "rgba(102,255,102,0.015)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.BORDER;
        // Reset to base background (T.BG_TERMINAL) — must match the
        // initial style above or first hover causes permanent drift.
        e.currentTarget.style.background   = T.BG_TERMINAL;
      }}
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
      {/* ── Pass 4.7 horizontal row layout ─────────────────────────
          LEFT  = confidence anchor (symbol · ring · direction pill).
          RIGHT = telemetry meta row · dominant chart rail · inline
                  action strip (prices · readiness · reasoning · QUEUE).
          The chart now claims the entire right-side width and reads
          as the primary horizontal movement surface — restoring the
          original "live execution terminal" cadence while preserving
          Pass 4.4/4.5/4.6 visual upgrades (semantic conf color,
          bezier sparkline, layered ring, flow overlay).            */}
      {/* LEFT ANCHOR — symbol · ring · direction pill */}
      <div style={{
        width: 96, flexShrink: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "space-between",
        gap: 4,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.TEXT_0, letterSpacing: "-0.01em" }}>
          {opp.symbol}
        </span>
        <div style={{ position: "relative", width: 78, height: 78, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ConfidenceRing color={confColor} value={opp.conf} size={78} />
          {isReady && (
            <svg aria-hidden width={78} height={78} style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              animation: "ring-sweep 12s linear infinite",
              animationDelay: `-${sweepDelayMs}ms`,
              transformOrigin: "50% 50%",
            }}>
              <circle cx={39} cy={39} r={34} fill="none"
                stroke={confColor} strokeWidth={2}
                strokeDasharray="19 195" strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${confColor})`, opacity: 0.8 }} />
            </svg>
          )}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 0, lineHeight: 1,
          }}>
            <span style={{
              fontSize: 26,
              fontWeight: opp.conf >= 70 ? 700 : 600,
              color: confColor, letterSpacing: T.TRACK_DISPLAY,
              fontVariantNumeric: "tabular-nums",
              textShadow:
                opp.conf >= 85 ? `0 0 12px ${confColor}, 0 0 6px ${confColor}, 0 0 3px ${confColor}` :
                opp.conf >= 70 ? `0 0 8px ${confColor}, 0 0 4px ${confColor}` :
                opp.conf >= 55 ? `0 0 4px ${confColor}` :
                                 `0 0 2px ${confColor}`,
            }}>{opp.conf}</span>
            <span style={{
              fontSize: 7, fontWeight: 700, color: T.TEXT_2,
              letterSpacing: T.TRACK_LABEL, textTransform: "uppercase",
            }}>AI Conf</span>
          </div>
        </div>
        <span style={{
          fontSize: 9, padding: "2px 8px",
          border: `1px solid ${dirBorder}`,
          background: dirBg,
          color: dirColor, fontWeight: 700, letterSpacing: "0.10em",
          borderRadius: 2,
        }}>{opp.direction}</span>
      </div>

      {/* RIGHT MAIN — telemetry meta · chart rail · action strip */}
      <div style={{
        flex: 1, minWidth: 0,
        display: "flex", flexDirection: "column",
        gap: 4, paddingLeft: 12,
      }}>
        {/* Top meta — REGIME · VOL · MTF dots · momentum · age/latency · score */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 10, color: T.TEXT_2, lineHeight: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 9, color: T.TEXT_1, letterSpacing: T.TRACK_LABEL, textTransform: "uppercase", whiteSpace: "nowrap" }}>
              {opp.regime} <span style={{ opacity: 0.4 }}>·</span> {opp.vol}
            </span>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {opp.mtf.map((m, i) => (
                <span key={i} title={["5m","15m","1H","4H"][i]} style={{
                  width: 7, height: 7, borderRadius: 1,
                  background: m === "green" ? T.NEON : m === "amber" ? T.AMBER : T.RED,
                }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              {[1,2,3].map(i => {
                const lit = i <= opp.momentum;
                return (
                  <span key={i} style={{
                    width: 4, height: 10,
                    background: lit ? dirColor : "rgba(255,255,255,0.10)",
                    animation: lit && isFreshSignal ? "momentum-breathe 3.4s ease-in-out infinite" : undefined,
                    animationDelay: lit && isFreshSignal ? `${(i - 1) * 150}ms` : undefined,
                  }} />
                );
              })}
            </div>
          </div>
          <span
            title={`Signal age ${ageStr} · execution latency ${opp.latency}`}
            style={{
              fontSize: 10, fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              animation: isLiveTick ? "telemetry-flicker 1.6s ease-in-out infinite" : undefined,
              animationDelay: isLiveTick ? `-${flickerDelayMs}ms` : undefined,
            }}>
            <span style={{ color: T.TEXT_1 }}>{ageStr}</span>
            <span style={{ opacity: 0.45, margin: "0 3px" }}>·</span>
            {opp.latency}
            <span style={{ opacity: 0.45, margin: "0 5px" }}>·</span>
            <span style={{ background: "rgba(255,255,255,0.08)", color: T.TEXT_0, padding: "1px 5px", borderRadius: 2 }}>{opp.score}</span>
          </span>
        </div>

        {/* CHART RAIL — dominant horizontal flow */}
        <div style={{
          position: "relative", width: "100%", height: 70,
          background: "linear-gradient(180deg, rgba(255,255,255,0.022) 0%, rgba(0,0,0,0) 65%, rgba(255,255,255,0.014) 100%)",
          borderTop: `1px solid ${T.BORDER}`,
          borderBottom: `1px solid ${T.BORDER}`,
          overflow: "hidden",
        }}>
          <Sparkline
            data={opp.sparkline}
            color={sparkColor}
            height={70}
            live={isFreshSignal}
            seedDelayMs={sparkDelayMs}
          />
          {isLiveTick && (
            <span aria-hidden style={{
              position: "absolute", top: 0, bottom: 0, left: 0, width: 80,
              background: `linear-gradient(90deg, transparent 0%, ${sparkColor} 50%, transparent 100%)`,
              opacity: 0.10, pointerEvents: "none",
              animation: "tape-advance 6s linear infinite",
              animationDelay: `-${sparkDelayMs}ms`,
              willChange: "transform",
            }} />
          )}
        </div>

        {/* Inline action strip — prices · readiness · reasoning · QUEUE */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 10, color: T.TEXT_2,
          fontVariantNumeric: "tabular-nums", lineHeight: 1, minWidth: 0,
        }}>
          <span style={{ whiteSpace: "nowrap" }}>
            <span style={{ color: T.TEXT_3, marginRight: 3 }}>E</span>
            <span style={{ color: T.TEXT_0 }}>{fmtPrice(opp.entry)}</span>
          </span>
          <span
            title={`Stop ${fmtPrice(opp.stop)} (${pctDelta(opp.entry, opp.stop)} from entry)`}
            style={{ whiteSpace: "nowrap", cursor: "help" }}
          >
            <span style={{ color: T.TEXT_3, marginRight: 3 }}>S</span>
            <span style={{ color: T.RED }}>{fmtPrice(opp.stop)}</span>
          </span>
          <span
            title={`Target ${fmtPrice(opp.target)} (${pctDelta(opp.entry, opp.target)} from entry)`}
            style={{ whiteSpace: "nowrap", cursor: "help" }}
          >
            <span style={{ color: T.TEXT_3, marginRight: 3 }}>T</span>
            <span style={{ color: T.NEON }}>{fmtPrice(opp.target)}</span>
          </span>
          <span style={{ whiteSpace: "nowrap" }}>
            <span style={{ color: T.TEXT_3, marginRight: 3 }}>R:R</span>
            <span style={{ color: dirColor, fontWeight: 600 }}>{rr}</span>
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
            color: opp.readiness === "READY" ? T.NEON : opp.readiness === "WAITING" ? T.AMBER : T.TEXT_2,
            display: "inline-flex", alignItems: "center", gap: 3,
          }}>
            {opp.readiness === "READY"   && <CheckCircle2 size={10} />}
            {opp.readiness === "WAITING" && <Timer size={10} />}
            {opp.readiness === "GATED"   && <Lock size={10} />}
            {opp.readiness}
          </span>
          <span
            title={gatedReason ? `Gated: ${gatedReason}` : opp.reasoning}
            style={{
              flex: 1, minWidth: 0,
              fontStyle: "italic",
              color: gatedReason ? T.AMBER : T.TEXT_2,
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
            }}>
            {gatedReason ? `⛔ ${gatedReason}` : opp.reasoning}
          </span>
          <button
            onClick={() => ready && onQueue(opp)}
            disabled={!ready}
            style={{
              padding: "3px 10px", fontSize: 9, fontWeight: 700,
              fontFamily: T.FONT_MONO, letterSpacing: T.TRACK_LABEL,
              border: `1px solid ${ready ? T.NEON : T.BORDER}`,
              background: "transparent",
              color: ready ? T.NEON : T.TEXT_3,
              cursor: ready ? "pointer" : "not-allowed",
              transition: "all 120ms ease",
              flexShrink: 0,
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
          >QUEUE PAPER</button>
        </div>
      </div>

    </article>
  );
});

/**
 * ConfidenceRing — Pass 4.4 premium AI conviction ring.
 *
 * Scaled from 96×96 → 116×116 to dominate the focal grid alongside the
 * full-width chart band. Three concentric tiers of identity:
 *
 *  1. Outer bloom halo (always rendered, tiered opacity) — gives the
 *     ring a soft volumetric presence even at low conf.
 *  2. Static track ring (faint) — base reference rail.
 *  3. Dual progress arcs: a thick soft underlay (glow) + crisp inner
 *     stroke — reads as layered conviction, not a thin gauge.
 *  4. 12 tick marks around the perimeter (every 30°) — institutional
 *     dial vocabulary; subtle highlight on ticks below the progress
 *     boundary mirrors the conviction value.
 *  5. Inner "hairline" ring just inside the progress — gives depth
 *     without competing with the central numeric.
 *
 * Motion policy preserved: ring itself is static; the ring-sweep arc
 * (mounted by the parent on READY-only) provides the only motion.
 */
function ConfidenceRing({ color, value, size = 78 }: { color: string; value: number; size?: number }) {
  // Pass 4.6 — parameterized. Original SIZE=116 / r=51 (ratio 0.44)
  // preserved at the smaller default so glow + halo + ticks scale
  // proportionally without redesigning the geometry.
  const SIZE = size;
  const CX   = SIZE / 2;
  const r    = Math.round(SIZE * 0.44);
  const c    = 2 * Math.PI * r;
  const pct  = Math.max(0, Math.min(100, value)) / 100;
  // Conf-tiered glow intensity — high-conviction signals visibly bloom,
  // low-conviction stay restrained. State-gated motion policy: glow
  // amount encodes confidence tier.
  const glowPx =
    value >= 85 ? 18 :
    value >= 70 ? 13 :
    value >= 55 ? 8  : 4;
  const ringStroke = value >= 85 ? 4 : value >= 70 ? 3.5 : 3;
  // Pass 6.1a — halo tier nudged up (0.45/0.30/0.18/0.10 → 0.55/0.38/
  // 0.24/0.14) so the ring identity carries through alongside the
  // brighter sparklines without redesigning geometry.
  const haloOpacity =
    value >= 85 ? 0.55 :
    value >= 70 ? 0.38 :
    value >= 55 ? 0.24 : 0.14;
  // 12-tick dial. Each tick is a short radial mark; ticks beneath the
  // progress arc are tinted with the color, ticks beyond stay neutral.
  const ticks = Array.from({ length: 12 }, (_, i) => i);
  const tickBoundary = pct * 12;
  return (
    <svg width={SIZE} height={SIZE} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {/* Outer volumetric halo — always rendered, opacity tiered by conf. */}
      <circle
        cx={CX} cy={CX} r={r + 4} fill="none"
        stroke={color} strokeWidth={1}
        style={{ filter: `drop-shadow(0 0 7px ${color}) drop-shadow(0 0 13px ${color})`, opacity: haloOpacity }}
      />
      {/* Dial tick marks — institutional gauge vocabulary. */}
      {ticks.map(i => {
        const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
        const r1 = r + 5;
        const r2 = r + 8;
        const x1 = CX + Math.cos(angle) * r1;
        const y1 = CX + Math.sin(angle) * r1;
        const x2 = CX + Math.cos(angle) * r2;
        const y2 = CX + Math.sin(angle) * r2;
        const inside = i < tickBoundary;
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={inside ? color : "rgba(255,255,255,0.15)"}
            strokeWidth={inside ? 1.5 : 1}
            strokeLinecap="round"
            style={inside ? { filter: `drop-shadow(0 0 3px ${color})`, opacity: 0.85 } : undefined}
          />
        );
      })}
      {/* Static track ring — base reference. */}
      <circle cx={CX} cy={CX} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={ringStroke} />
      {/* Soft underlay progress — thick blurred glow band. */}
      <circle
        cx={CX} cy={CX} r={r} fill="none"
        stroke={color} strokeWidth={ringStroke + 4}
        strokeDasharray={`${c * pct} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CX})`}
        opacity={0.35}
        style={{ filter: `blur(3px)`, transition: "stroke-dasharray 600ms ease" }}
      />
      {/* Crisp inner progress — primary conviction arc. */}
      <circle
        cx={CX} cy={CX} r={r} fill="none"
        stroke={color} strokeWidth={ringStroke}
        strokeDasharray={`${c * pct} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CX})`}
        style={{
          filter: `drop-shadow(0 0 ${glowPx}px ${color}) drop-shadow(0 0 ${Math.round(glowPx / 2)}px ${color})`,
          transition: "stroke-dasharray 600ms ease",
        }}
      />
      {/* Inner depth hairline — gives the ring physical thickness. */}
      <circle
        cx={CX} cy={CX} r={r - ringStroke - 2} fill="none"
        stroke={color} strokeWidth={0.5}
        opacity={0.20}
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Opportunity Matrix (Longs / Shorts columns — Pass 4.7)                   */
/* ──────────────────────────────────────────────────────────────────────── */

function filterOpps(opps: OpportunityVM[], query: string, filter: Filt): OpportunityVM[] {
  const q = query.trim().toUpperCase();
  return opps.filter(o => {
    if (q && !(o.symbol.includes(q) || o.name.toUpperCase().includes(q))) return false;
    switch (filter) {
      case "MAJORS":    return o.assetClass === "MAJOR";
      case "ALTS":      return o.assetClass === "ALT";
      case "MEME":      return MEME_UNIVERSE.has(o.symbol);
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
        fontFamily: T.FONT_MONO, fontSize: 9, letterSpacing: T.TRACK_TITLE,
        color: accent, opacity: 0.55,
      }}>
        {subLabel}
      </span>
    </div>
  );
}

const OpportunityMatrix = memo(function OpportunityMatrix({
  longs, shorts, evaluatingLongs, evaluatingShorts,
  onQueue, isLoading, isError, now,
  idleSymbols, lastTickAt,
}: {
  longs:     OpportunityVM[];
  shorts:    OpportunityVM[];
  /** Pass 6.1 — FLAT/HOLD signals routed by `lean` into the LONGS
   *  and SHORTS columns as a dimmed EVALUATING tier. Surfaces the
   *  engine's in-progress cognition across every scanned asset. */
  evaluatingLongs:  OpportunityVM[];
  evaluatingShorts: OpportunityVM[];
  onQueue:   (opp: OpportunityVM) => void;
  isLoading: boolean;
  isError:   boolean;
  /** Pass 3.3: shell-level shared 1Hz tick. Previously this component
   *  spawned its own `useNow1s()` — now consolidated to a single shell
   *  source so the ribbon, matrix, and footer all tick in lock-step
   *  with zero observable drift and one timer instead of three. */
  now:       number;
  /** Pass 6.1 — symbol universe rotated by the IdleScanningPanel when
   *  a column has zero conviction + zero evaluating bias. */
  idleSymbols: string[];
  /** Engine `lastTickAt` (ms epoch) for the idle-panel "last scan" line. */
  lastTickAt:  number | null;
}) {
  // Pass 4.7 — split by DIRECTION (longs green / shorts red) instead
  // of asset class. Restores long/short market polarity tension across
  // the viewport.
  return (
    <section className="cd-matrix" style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(520px, 1fr))",
      gap: 20, position: "relative",
    }}>
      <Column
        title="TOP LONGS"
        opps={longs}
        evaluating={evaluatingLongs}
        onQueue={onQueue}
        isLoading={isLoading}
        isError={isError}
        accent="#66FF66"
        subLabel={`BULLISH BIAS · CONFIDENCE-RANKED · ${longs.length} TRACKED`}
        tintRgba="rgba(102,255,102,0.015)"
        now={now}
        idleSymbols={idleSymbols}
        lastTickAt={lastTickAt}
        idleLabel="LONG"
      />
      <Column
        title="TOP SHORTS"
        opps={shorts}
        evaluating={evaluatingShorts}
        onQueue={onQueue}
        isLoading={isLoading}
        isError={isError}
        accent="#FF4D4D"
        subLabel={`BEARISH BIAS · CONFIDENCE-RANKED · ${shorts.length} TRACKED`}
        tintRgba="rgba(255,77,77,0.015)"
        leftDivider
        now={now}
        idleSymbols={idleSymbols}
        lastTickAt={lastTickAt}
        idleLabel="SHORT"
      />
    </section>
  );
});

// Estimated card height (px) for the virtualizer pre-measure pass. Actual
// per-card height is observed via `measureElement` once mounted, so this
// only sets the initial scrollbar geometry. Dialed in against the
// approved CommandDeck mockup density: confidence ring + reasoning
// block + sparkline + exchange row ≈ 380px tall.
// Pass 4.7 — horizontal row layout. Cards re-architected from
// vertical stack (268px) into a wide row (142px) so the chart band
// becomes the dominant horizontal movement surface and 5-6 cards fit
// per ~900px column. Columns now split by DIRECTION (longs/shorts)
// instead of asset class (majors/alts) so the viewport reads as
// long/short market tension — the original platform's psychological
// signature. Every Pass 4.4/4.5/4.6 visual upgrade preserved
// (semantic confidence color, bezier sparkline, layered ring, flow
// overlay) at the tighter horizontal scale.
const CARD_ESTIMATE_PX = 142;
// Gap between cards, preserved from the pre-virtualization flex layout
// (was `gap: 14` on the scroll container). Absolute positioning means
// we now carry the gap as `paddingBottom` on each row wrapper so the
// virtualizer's `measureElement` includes it in the row's total height.
const CARD_ROW_GAP_PX = 8;

/* ──────────────────────────────────────────────────────────────────────── */
/* Pass 6.1 — Idle Scanning Intelligence Panel                              */
/* Replaces the dead "No <X> match the current filters." dashed box that    */
/* used to render when a column emitted zero LONG/SHORT signals. Instead    */
/* of communicating "broken / empty", this panel communicates "AI actively */
/* evaluating market structure, awaiting MTF alignment." Symbol rotation   */
/* + cadence dot + last-scan timestamp = institutional waiting-room tone,  */
/* not retail loading-spinner.                                              */
/* ──────────────────────────────────────────────────────────────────────── */
const IdleScanningPanel = memo(function IdleScanningPanel({
  accent, symbols, lastTickAt, now, label,
}: {
  accent: string;
  symbols: string[];
  lastTickAt: number | null;
  now: number;
  label: string;
}) {
  // Rotate through the symbol pool every 1.4s using the shell's shared
  // 1Hz tick — no extra timers, locks to the rest of the terminal cadence.
  const pool   = symbols.length > 0 ? symbols : ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "LINK"];
  const cursor = Math.floor(now / 1400) % pool.length;
  const focus  = pool[cursor] ?? pool[0];
  const peek1  = pool[(cursor + 1) % pool.length];
  const peek2  = pool[(cursor + 2) % pool.length];
  const peek3  = pool[(cursor + 3) % pool.length];

  const ageSec = lastTickAt ? Math.max(0, Math.floor((now - lastTickAt) / 1000)) : null;
  const ageStr = ageSec === null
    ? "—"
    : ageSec < 60 ? `${ageSec}s ago`
    : `${Math.floor(ageSec / 60)}m ${ageSec % 60}s ago`;

  return (
    <div style={{
      position: "relative",
      padding: "18px 16px",
      border: `1px solid ${accent}22`,
      borderRadius: 2,
      background: `linear-gradient(180deg, ${accent}05 0%, rgba(0,0,0,0) 70%)`,
      fontFamily: T.FONT_MONO,
      overflow: "hidden",
    }}>
      {/* Faint scan-line — communicates "actively scanning" without blinking */}
      <span aria-hidden style={{
        position: "absolute", left: 0, right: 0, top: 0, height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${accent}55 50%, transparent 100%)`,
        animation: "edge-sweep 4.2s linear infinite",
        opacity: 0.55,
      }} />

      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 9, letterSpacing: T.TRACK_TITLE, color: accent, opacity: 0.85,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: accent,
          boxShadow: `0 0 6px ${accent}`,
          animation: "brand-pulse 1.8s ease-in-out infinite",
        }} />
        AWAITING {label} ALIGNMENT
      </div>

      <div style={{
        marginTop: 14,
        fontSize: 11, color: T.TEXT_2, letterSpacing: T.TRACK_LABEL,
      }}>
        AI EVALUATING MARKET STRUCTURE
      </div>

      {/* Rotating symbol focus — the user sees the engine sweeping its
          universe in real time. */}
      <div style={{
        marginTop: 10,
        display: "flex", alignItems: "baseline", gap: 14,
        minHeight: 28,
      }}>
        <span
          key={focus}
          style={{
            fontSize: 22, fontWeight: 600, color: T.TEXT_0,
            letterSpacing: T.TRACK_DISPLAY,
            animation: "brand-pulse 1.4s ease-out",
          }}
        >
          {focus}
        </span>
        <span style={{ fontSize: 10, color: T.TEXT_2, opacity: 0.55 }}>
          NEXT · {peek1} · {peek2} · {peek3}
        </span>
      </div>

      <div style={{
        marginTop: 14,
        display: "flex", justifyContent: "space-between",
        fontSize: 9, color: T.TEXT_2, letterSpacing: T.TRACK_LABEL,
      }}>
        <span>POOL · {pool.length} ASSETS</span>
        <span>LAST SCAN · {ageStr}</span>
      </div>

      <div style={{
        marginTop: 6,
        fontSize: 9, color: T.TEXT_2, opacity: 0.45,
        letterSpacing: T.TRACK_LABEL,
      }}>
        NO QUALIFYING {label} OPPORTUNITY · CRITERIA NOT YET MET
      </div>
    </div>
  );
});

const Column = memo(function Column({
  title, opps, evaluating, onQueue, isLoading, isError,
  accent, subLabel, tintRgba, leftDivider = false, now,
  idleSymbols, lastTickAt, idleLabel,
}: {
  title: string; opps: OpportunityVM[]; onQueue: (opp: OpportunityVM) => void;
  /** Pass 6.1 — FLAT/HOLD signals routed into this column by `lean`.
   *  Rendered as a dimmed subordinate tier beneath the active opps so
   *  the user sees the AI's in-progress cognition (every symbol it is
   *  currently evaluating) instead of a void when no conviction exists. */
  evaluating: OpportunityVM[];
  isLoading: boolean; isError: boolean;
  accent: string; subLabel: string; tintRgba: string; leftDivider?: boolean;
  now: number;
  /** Symbols cycled in the IdleScanningPanel — typically the full
   *  opportunity universe so the user sees the engine sweeping every
   *  asset it knows about. */
  idleSymbols: string[];
  /** Engine `lastTickAt` from `/api/engine/status`, ms epoch. */
  lastTickAt: number | null;
  /** Column polarity label for the idle panel ("LONG" / "SHORT"). */
  idleLabel: string;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  // Stable key per opportunity → preserves card identity (and its
  // animation gating state) across re-rank reorders and search filter
  // changes. Without this, the virtualizer would key by index and any
  // ranking shuffle would reset card mounts.
  const getItemKey = useCallback(
    (i: number) => opps[i]?.pair ?? `row-${i}`,
    [opps],
  );

  const virtualizer = useVirtualizer({
    count: opps.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_ESTIMATE_PX + CARD_ROW_GAP_PX,
    // Keep ~10 cards alive in the DOM (≈2-3 visible at maxHeight 1000
    // + 7-8 above/below) so scroll never reveals a frame of unmounted
    // whitespace and so freshly-arrived signals at the rank edge stay
    // animation-eligible. Same total render budget as the "10-visible
    // design intent" while bounding the 1Hz tick cost.
    overscan: 7,
    getItemKey,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const showList  = opps.length > 0;

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
      <div
        ref={parentRef}
        className="cd-scroll"
        style={{
          // No `display: flex / gap` here — virtualized children are
          // absolutely positioned inside the inner spacer below.
          overflowY: "auto",
          maxHeight: 1000,
          paddingRight: 4,
          // `contain: strict` would clip the card hover/glow overlays;
          // `layout` alone gets the perf benefit (paint isolation, no
          // forced reflow into ancestors) without cropping shadows.
          contain: "layout",
        }}
      >
        {isError && !showList && evaluating.length === 0 && (
          <div style={{
            padding: 24, textAlign: "center", color: "#FF4D4D", fontFamily: T.FONT_MONO,
            border: `1px dashed #FF4D4D55`, fontSize: 11,
          }}>
            ENGINE FEED UNAVAILABLE · /api/engine/status failed · retrying…
          </div>
        )}
        {/* Pass 6.1 — when no active LONG/SHORT exists in this column
            AND no evaluating bias is leaning this way, surface the
            institutional idle-scan intelligence panel instead of a
            dead box. The engine being healthy + waiting is the most
            common state; communicate it as such. */}
        {!isError && !showList && evaluating.length === 0 && (
          isLoading ? (
            <div style={{
              padding: 24, textAlign: "center", color: T.TEXT_2, fontFamily: T.FONT_MONO,
              border: `1px dashed ${T.BORDER}`, fontSize: 11,
            }}>
              Loading engine signals…
            </div>
          ) : (
            <IdleScanningPanel
              accent={accent}
              symbols={idleSymbols}
              lastTickAt={lastTickAt}
              now={now}
              label={idleLabel}
            />
          )
        )}
        {showList && (
          <div style={{
            position: "relative",
            height: totalSize,
            width: "100%",
          }}>
            {items.map(vi => {
              const o = opps[vi.index];
              if (!o) return null;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                    // Row gap preserved as bottom padding so the next
                    // row's `start` lands with the same visual rhythm
                    // as the pre-virtualization flex `gap: 14`.
                    paddingBottom: CARD_ROW_GAP_PX,
                  }}
                >
                  <OpportunityCard opp={o} idx={vi.index} onQueue={onQueue} now={now} />
                </div>
              );
            })}
          </div>
        )}

        {/* Pass 6.1 — EVALUATING tier. Engine HOLDs with a directional
            lean rendered subordinate to active conviction. Wrapped in a
            dim/desaturate layer with pointer-events disabled so QUEUE
            chips can't be pressed (FLAT direction is rejected by
            `queuePaper` anyway). Communicates "AI is processing these
            assets but has not committed yet" — exactly how institutional
            systems behave. */}
        {evaluating.length > 0 && (
          <>
            <div style={{
              marginTop: showList ? 14 : 0,
              display: "flex", alignItems: "center", gap: 10,
              fontFamily: T.FONT_MONO, fontSize: 9,
              letterSpacing: T.TRACK_TITLE,
              color: T.TEXT_2,
              paddingTop: 10, paddingBottom: 6,
              borderTop: showList ? `1px dashed ${accent}1A` : "none",
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: accent, opacity: 0.55,
                boxShadow: `0 0 4px ${accent}80`,
              }} />
              EVALUATING · {evaluating.length} ASSETS · AWAITING CONFIRMATION
            </div>
            <div
              aria-label="evaluating-tier"
              aria-hidden
              inert={"" as unknown as boolean}
              style={{
                // Pass 6.1a / 6.2 — calibrated up from 0.42/sat(0.55).
                // 0.70 + sat(0.90) keeps the tier clearly subordinate
                // to active rows while preserving neon energy +
                // sparkline luminance.
                opacity: 0.70,
                filter: "saturate(0.90)",
                pointerEvents: "none",
                display: "flex", flexDirection: "column",
                gap: CARD_ROW_GAP_PX,
              }}
            >
              {evaluating.map((o, i) => (
                <OpportunityCard
                  key={`eval-${o.pair}`}
                  opp={o}
                  idx={opps.length + i}
                  onQueue={onQueue}
                  now={now}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Lower terminal zone modules                                              */
/* ──────────────────────────────────────────────────────────────────────── */

function PanelCard({
  title, children, span = 1, height = 288, live = false,
}: {
  title: string; children: ReactNode; span?: number; height?: number; live?: boolean;
}) {
  // Pass 4.9 — physical bezel depth. Layered effects:
  //   • subtle top→bottom gradient on the panel body (lit-from-above)
  //   • inset top hairline highlight (edge lighting / chrome bevel)
  //   • inset bottom shadow (anchors the panel to its plane)
  //   • outer 1px down-shadow (separates from the workspace)
  //   • live panels carry a very faint inner neon bloom (cycles
  //     `panel-breathe` over 9s); reduced-motion umbrella halts it
  const style: CSSProperties = {
    background: `linear-gradient(180deg, #0B1612 0%, ${T.BG_TERMINAL} 55%, #050C09 100%)`,
    border: `1px solid ${T.BORDER}`,
    display: "flex", flexDirection: "column",
    height,
    fontFamily: T.FONT_MONO,
    gridColumn: span > 1 ? `span ${span}` : undefined,
    boxShadow: live
      ? `inset 0 1px 0 rgba(102,255,102,0.08), inset 0 -1px 0 rgba(0,0,0,0.50), 0 1px 0 rgba(0,0,0,0.60), inset 0 0 24px rgba(102,255,102,0.04)`
      : `inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.50), 0 1px 0 rgba(0,0,0,0.60)`,
    animation: live ? "panel-breathe 9s ease-in-out infinite" : undefined,
    position: "relative",
  };
  return (
    <div style={style}>
      <div style={{
        padding: 10,
        borderBottom: `1px solid ${T.BORDER}`,
        // Pass 4.9 — title bar reads as a slightly darker bezel cap
        // with a faint neon hairline at its base; reinforces the
        // "panel bonded to its lit border" feel.
        background: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.30) 100%)`,
        boxShadow: `inset 0 -1px 0 rgba(102,255,102,0.05)`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <h3 style={{
          margin: 0, fontSize: 11, color: T.TEXT_0,
          letterSpacing: T.TRACK_LABEL,
          // Pass 4.9 — micro text shadow on titles for crispness on
          // the new gradient bezel; intensity tuned to preserve
          // monospaced glyph sharpness.
          textShadow: live ? `0 0 6px rgba(102,255,102,0.18)` : undefined,
        }}>{title}</h3>
        {live && <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: T.NEON,
          boxShadow: `0 0 6px ${T.NEON}, 0 0 12px ${T.NEON_GLOW}`,
          animation: "brand-pulse 1.4s infinite",
        }} />}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

type ReasoningEntry = { id: string; symbol: string; timeframe: string; decision: string; confidence: number; shortSummary?: string; timestamp: number };
const AIReasoningConsole = memo(function AIReasoningConsole({
  log: rawLog, live,
}: {
  // Source-of-truth lifted to PortalCustomerShell so this surface no
  // longer fires its own duplicate `/api/engine/status` query. React
  // Query was de-duping the network round-trip but each surface still
  // owned a redundant hook execution + interval handler.
  log:  ReadonlyArray<ReasoningEntry> | undefined;
  live: boolean;
}) {
  const log = useMemo(() => (rawLog ?? []).slice(0, 14), [rawLog]);

  return (
    <PanelCard title="AI REASONING CONSOLE" span={2} live={live}>
      <div className="cd-scroll" style={{ padding: 10, overflowY: "auto", flex: 1, fontSize: 11 }}>
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
});

function shortPair(s: string): string {
  return s.replace(/USDT?$/, "").replace(/[-/].*$/, "").toUpperCase();
}

// Pass 7 — TRADE LIFECYCLE REALISM. The portfolio panel becomes the
// commitment/consequence surface: real equity curve driven by stats,
// position rows aware of ENTRY/ACTIVE lifecycle phases, and a fading
// EXIT acknowledgment when a position closes. Institutional restraint
// throughout — no flashy effects, no arcade tints, no PnL flicker.
const EQUITY_HISTORY_LEN = 60;  // 60 samples × 1Hz = 60s rolling window

function formatPositionAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m}m${(s % 60).toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h${(m % 60).toString().padStart(2, "0")}m`;
}

function buildEquityPath(buf: number[], w: number, h: number): { stroke: string; fill: string } {
  if (buf.length < 2) return { stroke: "", fill: "" };
  const min = Math.min(...buf);
  const max = Math.max(...buf);
  // Pad the range so a flat line sits in the middle instead of hugging
  // an edge. 0.0002 = 2bps — invisible jitter floor preserves dignity
  // on a still curve while letting real PnL movement read clearly.
  const range = Math.max(max - min, min * 0.0002);
  const pad = 2;  // px top/bottom padding so the line never touches the edge
  const pts = buf.map((v, i) => {
    const x = (i / (buf.length - 1)) * w;
    const y = pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const stroke = "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
  const fill   = stroke + ` L${w.toFixed(1)},${h} L0,${h} Z`;
  return { stroke, fill };
}

const PortfolioIntelligence = memo(function PortfolioIntelligence({ now }: { now: number }) {
  const { stats, open, history } = usePaperTrades();

  // Rolling 60-sample equity buffer, advanced by the shell's 1Hz tick.
  // Survives across rerenders via useRef; written in useEffect to avoid
  // render-side mutation. First sample is the current equity so the
  // curve starts as a flat baseline instead of an empty void.
  const equityBufRef = useRef<number[]>([stats.equity]);
  useEffect(() => {
    const buf = equityBufRef.current;
    buf.push(stats.equity);
    if (buf.length > EQUITY_HISTORY_LEN) buf.shift();
  }, [now, stats.equity]);

  // Curve color tracks net direction from the starting baseline. Above
  // → neon, below → red, flat → neutral. The fill gradient matches.
  const curveDelta = stats.equity - STARTING_EQUITY;
  const curveColor = Math.abs(curveDelta) < 0.01 ? T.TEXT_2 : curveDelta > 0 ? T.NEON : T.RED;
  const gradId = useId();
  const { stroke: curveStroke, fill: curveFill } = buildEquityPath(equityBufRef.current, 100, 40);

  // EXIT acknowledgment — surface the most recent close for 8s, then
  // fade to nothing. Operator gets a brief financial "this just
  // happened" moment, then the panel returns to forward-looking state.
  const lastClose  = history[0];
  const closeAgeMs = lastClose ? Math.max(0, now - lastClose.closedAt) : Infinity;
  const exitFresh  = lastClose && closeAgeMs < 8_000;
  const exitOpacity = exitFresh ? Math.max(0, 1 - closeAgeMs / 8_000) : 0;
  const exitColor   = lastClose && lastClose.pnl >= 0 ? T.NEON : T.RED;

  return (
    <PanelCard title="PORTFOLIO INTEL" height={272}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, color: T.TEXT_2, marginBottom: 3 }}>PAPER EQUITY (USD)</div>
            <div style={{ fontSize: 20, color: T.TEXT_0, fontVariantNumeric: "tabular-nums" }}>
              ${stats.equity.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              <span style={{ color: T.TEXT_2 }}>.{(stats.equity % 1).toFixed(2).slice(2)}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: T.TEXT_2, marginBottom: 3 }}>REALIZED</div>
            <div style={{ fontSize: 13, color: stats.realizedPnl >= 0 ? T.NEON : T.RED, fontVariantNumeric: "tabular-nums" }}>
              {stats.realizedPnl >= 0 ? "+" : "−"}${Math.abs(stats.realizedPnl).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Real equity curve — 60s rolling, redraws each shell tick. */}
        <svg width="100%" height={40} viewBox="0 0 100 40" preserveAspectRatio="none"
             style={{ transition: "color 600ms ease" }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={curveColor} stopOpacity={0.28} />
              <stop offset="100%" stopColor={curveColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          {curveFill   && <path d={curveFill}   fill={`url(#${gradId})`} />}
          {curveStroke && <path d={curveStroke} fill="none" stroke={curveColor} strokeWidth={1.2}
                                strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
                                style={{ filter: `drop-shadow(0 0 2px ${curveColor}80)` }} />}
        </svg>

        {/* Position lifecycle rows — ENTRY phase glows for first 10s,
            then settles into ACTIVE. TP/SL distance + position age make
            commitment and risk legible. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: "auto" }}>
          {exitFresh && lastClose && (
            <div key={lastClose.id} style={{
              border: `1px solid ${exitColor}55`,
              background: `${exitColor}10`,
              padding: "4px 8px",
              opacity: exitOpacity,
              transition: "opacity 320ms ease",
              fontVariantNumeric: "tabular-nums",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: T.TEXT_1, letterSpacing: "0.10em" }}>
                  EXIT · {shortPair(lastClose.symbol)} · <span style={{ color: T.TEXT_2 }}>{lastClose.reason}</span>
                </span>
                <span style={{ color: exitColor }}>
                  {lastClose.pnl >= 0 ? "+" : "−"}${Math.abs(lastClose.pnl).toFixed(2)}
                </span>
              </div>
            </div>
          )}
          {open.slice(0, 3).map(p => {
            const ageMs   = Math.max(0, now - p.openedAt);
            const isEntry = ageMs < 10_000;
            const sideCol = p.side === "LONG" ? T.NEON : T.RED;
            // Distance to target/stop as % of current mark. Positive
            // toTarget = "moving with you"; positive toStop = "still
            // have room". Both clamped to two decimals so the row never
            // jitters from sub-bp moves.
            const dir       = p.side === "LONG" ? 1 : -1;
            const toTargetPct = ((p.target - p.last) / p.last) * 100 * dir;
            const toStopPct   = ((p.last   - p.stop) / p.last) * 100 * dir;
            const phaseLabel = isEntry ? "ENTRY" : "ACTIVE";
            return (
              <div key={p.id} style={{
                padding: "4px 8px",
                display: "flex", flexDirection: "column", gap: 2,
                border: `1px solid ${isEntry ? `${sideCol}55` : "transparent"}`,
                background: isEntry ? `${sideCol}08` : "transparent",
                // 800ms fade from ENTRY → ACTIVE so the phase change is
                // perceptible without ever feeling abrupt.
                transition: "border-color 800ms ease, background-color 800ms ease",
                fontVariantNumeric: "tabular-nums",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <span style={{ color: T.TEXT_1 }}>
                    <span style={{ color: sideCol }}>{p.side.charAt(0)}</span>
                    &nbsp;{shortPair(p.symbol)}
                    <span style={{ color: T.TEXT_3, marginLeft: 6 }}>{formatPositionAge(ageMs)}</span>
                  </span>
                  <span style={{ color: p.pnl >= 0 ? T.NEON : T.RED }}>
                    {p.pnl >= 0 ? "+" : "−"}${Math.abs(p.pnl).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.TEXT_3, letterSpacing: "0.06em" }}>
                  <span>TP {toTargetPct >= 0 ? "+" : ""}{toTargetPct.toFixed(2)}% · SL {toStopPct >= 0 ? "+" : ""}{toStopPct.toFixed(2)}%</span>
                  <span style={{ color: isEntry ? sideCol : T.TEXT_3, letterSpacing: "0.10em" }}>{phaseLabel}</span>
                </div>
              </div>
            );
          })}
          {open.length === 0 && !exitFresh && (
            <div style={{ color: T.TEXT_2, fontSize: 10, fontStyle: "italic", paddingLeft: 2 }}>No open paper positions.</div>
          )}
        </div>
      </div>
    </PanelCard>
  );
});

const SignalPipeline = memo(function SignalPipeline({
  opps, pulse, engine,
}: {
  opps:   OpportunityVM[];
  pulse:  MarketPulse;
  engine: EngineLite | undefined;
}) {
  // Top-of-stack representative per stage (still useful as a "what's in
  // the chamber" cue), with live funnel counts driving the bar.
  const candidate = opps[opps.length - 1];
  const analyzed  = opps.find(o => o.readiness === "WAITING") ?? opps[2];
  const confirmed = opps.find(o => o.readiness === "READY")   ?? opps[1];
  const queued    = opps.find(o => o.readiness === "READY" && o.conf >= 80) ?? opps[0];

  const fTotal    = engine?.funnel?.total      ?? pulse.total;
  const fPassed   = engine?.funnel?.passedMTF  ?? (pulse.ready + pulse.waiting);
  const fExecuted = engine?.funnel?.executed   ?? 0;

  const steps: Array<{ tag: string; sample: OpportunityVM | undefined; count: number; stage: 0|1|2|3 }> = [
    { tag: "CANDIDATE", sample: candidate, count: fTotal,        stage: 0 },
    { tag: "ANALYZED",  sample: analyzed,  count: pulse.waiting, stage: 1 },
    { tag: "CONFIRMED", sample: confirmed, count: fPassed,       stage: 2 },
    { tag: "QUEUED",    sample: queued,    count: pulse.ready,   stage: 3 },
  ];

  return (
    <PanelCard title="SIGNAL PIPELINE" live>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, flex: 1 }}>
        {steps.map((s) => {
          const dotOpacity = [0.20, 0.40, 0.60, 1.00][s.stage];
          const labelTone = s.stage >= 2 ? T.TEXT_0 : T.TEXT_2;
          return (
            <div key={s.tag} style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: T.FONT_MONO, fontVariantNumeric: "tabular-nums" }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: T.NEON, opacity: dotOpacity,
                boxShadow: s.stage === 3 ? `0 0 8px ${T.NEON_GLOW}` : "none",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 10, color: T.TEXT_3, letterSpacing: "0.10em", width: 72 }}>{s.tag}</span>
              <span style={{ fontSize: 11, color: labelTone, fontWeight: 600, minWidth: 28, textAlign: "right" }}>
                {s.count.toLocaleString()}
              </span>
              <span style={{ fontSize: 11, color: T.TEXT_2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.sample ? `${s.sample.symbol} · ${s.sample.conf}%` : "—"}
              </span>
            </div>
          );
        })}
        <div style={{
          marginTop: 4, paddingTop: 8, borderTop: `1px solid ${T.BORDER}`,
          display: "flex", justifyContent: "space-between",
          fontSize: 10, color: T.TEXT_2, fontVariantNumeric: "tabular-nums",
        }}>
          <span>MTF BLOCK <span style={{ color: pulse.blockRatePct >= 60 ? T.AMBER : T.TEXT_1 }}>{pulse.blockRatePct}%</span></span>
          <span>EXEC RATE <span style={{ color: pulse.execRatePct  >  0 ? T.NEON  : T.TEXT_1 }}>{pulse.execRatePct}%</span></span>
          <span>FILLED <span style={{ color: T.TEXT_0 }}>{fExecuted.toLocaleString()}</span></span>
        </div>
      </div>
    </PanelCard>
  );
});

type ConnectedRow = { exchange: string; connected: boolean };
const ExchangeTopology = memo(function ExchangeTopology() {
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
});

const RiskHeatmap = memo(function RiskHeatmap({ opps }: { opps: OpportunityVM[] }) {
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
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 4, flex: 1 }}>
        {cells.map((c, i) => {
          const color = c.risk > 0.7 ? T.RED : c.risk > 0.4 ? T.AMBER : T.NEON;
          // Hot cells (>0.7) get a pulsing bloom — communicates "this
          // symbol is in a danger band right now". Calm cells stay
          // static. Deterministic per-cell delay so 16 cells don't sync.
          const isHot = c.risk > 0.7;
          const delayMs = (i * 137) % 1800;
          return (
            <div
              key={i}
              title={`${c.sym} · risk ${(c.risk * 100).toFixed(0)}%`}
              style={{
                background: color,
                opacity: isHot ? undefined : Math.max(0.20, c.risk),
                borderRadius: 2,
                boxShadow: isHot ? `0 0 8px ${color}, inset 0 0 4px ${color}` : undefined,
                animation: isHot ? "risk-pulse 1.8s ease-in-out infinite" : undefined,
                animationDelay: isHot ? `-${delayMs}ms` : undefined,
              }}
            />
          );
        })}
      </div>
    </PanelCard>
  );
});

const MarketRegime = memo(function MarketRegime({ opps }: { opps: OpportunityVM[] }) {
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
});

const AIThroughput = memo(function AIThroughput({
  engine, pulse, signalsPerMin,
}: {
  engine:        EngineLite | undefined;
  pulse:         MarketPulse;
  signalsPerMin: number;
}) {
  const evals = engine?.funnel?.total      ?? 0;
  const sigs  = engine?.signalsGenerated   ?? 0;
  const mtf   = engine?.mtfConfirmedCount  ?? 0;
  const corr  = engine?.correlationBlocks  ?? 0;
  const loopMs = engine?.loopIntervalMs    ?? 0;

  // Engine load = share of evaluated symbols that passed MTF (i.e. how
  // much real signal yield the loop is producing per cycle). Capped 100.
  const loadPct = evals > 0 ? Math.min(100, Math.round((mtf / evals) * 100)) : 0;
  const loadTone = loadPct >= 40 ? T.NEON : loadPct >= 15 ? T.TEXT_0 : T.TEXT_1;

  return (
    <PanelCard title="AI THROUGHPUT" live height={208}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9, justifyContent: "center", flex: 1, fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
        <Kv k="ENGINE EVALS"     v={evals.toLocaleString()} />
        <Kv k="SIGNALS / MIN"    v={signalsPerMin >= 10 ? signalsPerMin.toFixed(0) : signalsPerMin.toFixed(1)} color={signalsPerMin > 0 ? T.TEXT_0 : T.TEXT_2} />
        <Kv k="SIGNALS GEN"      v={sigs.toLocaleString()} />
        <Kv k="MTF CONFIRMED"    v={mtf.toLocaleString()} />
        <Kv k="EXEC RATE"        v={`${pulse.execRatePct}%`} color={pulse.execRatePct > 0 ? T.NEON : T.TEXT_1} />
        <Kv k="ENGINE LOAD"      v={`${loadPct}%`} color={loadTone} />
        <Kv k="CORRELATION BLKS" v={corr.toLocaleString()} color={corr > 0 ? T.AMBER : T.TEXT_1} />
        <Kv k="LOOP INTERVAL"    v={loopMs ? `${loopMs}ms` : "—"} />
      </div>
    </PanelCard>
  );
});

// Pass 7a — EXECUTION TELEMETRY CADENCE. The panel detects deltas on
// session counters (totalCount / openCount / realizedPnl) and surfaces
// a brief, restrained acknowledgment that "the system just witnessed
// an event". Institutional event acknowledgment — single pulse fades
// after 1.6s. NOT continuous animation, NOT gaming notification.
type ExecEventKind = "OPEN" | "CLOSE" | "PROFIT" | "LOSS";
interface ExecEvent { label: string; at: number; kind: ExecEventKind; }

const ExecutionAwareness = memo(function ExecutionAwareness({
  openCount, now,
}: {
  openCount: number;
  now: number;
}) {
  const { stats } = usePaperTrades();
  const prevRef = useRef({
    totalCount:  stats.totalCount,
    openCount,
    realizedPnl: stats.realizedPnl,
  });
  const [event, setEvent] = useState<ExecEvent | null>(null);
  const [pulse, setPulse] = useState(false);

  // Delta detector. Priority: open (new entry) > close (exit) > pnl
  // realization (close already counted, this is the financial readout).
  useEffect(() => {
    const prev = prevRef.current;
    let next: ExecEvent | null = null;
    if (stats.totalCount > prev.totalCount) {
      next = { label: "PAPER ORDER QUEUED", at: Date.now(), kind: "OPEN" };
    } else if (openCount < prev.openCount) {
      const n = prev.openCount - openCount;
      next = { label: `POSITION CLOSED${n > 1 ? ` ×${n}` : ""}`, at: Date.now(), kind: "CLOSE" };
    } else if (Math.abs(stats.realizedPnl - prev.realizedPnl) > 0.001) {
      const gained = stats.realizedPnl > prev.realizedPnl;
      next = { label: gained ? "PROFIT REALIZED" : "LOSS REALIZED", at: Date.now(), kind: gained ? "PROFIT" : "LOSS" };
    }
    prevRef.current = { totalCount: stats.totalCount, openCount, realizedPnl: stats.realizedPnl };
    if (!next) return undefined;
    setEvent(next);
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1600);
    return () => clearTimeout(t);
  }, [stats.totalCount, stats.realizedPnl, openCount]);

  const eventColor =
    event?.kind === "OPEN"   ? T.NEON  :
    event?.kind === "CLOSE"  ? T.AMBER :
    event?.kind === "PROFIT" ? T.NEON  :
    event?.kind === "LOSS"   ? T.RED   : T.TEXT_2;

  const eventAgeStr = event ? signalAge(event.at, now) : "—";

  return (
    <PanelCard title="EXEC AWARENESS" live height={208}>
      <div style={{
        padding: 14, display: "flex", flexDirection: "column", gap: 10,
        justifyContent: "center", flex: 1, fontSize: 10,
        // Restrained event acknowledgment: 1px inset stroke in the
        // event's semantic color, fades over 320ms. The panel says
        // "noted" — it does not celebrate.
        boxShadow: pulse ? `inset 0 0 0 1px ${eventColor}55, inset 0 0 24px ${eventColor}18` : "none",
        transition: "box-shadow 320ms ease",
      }}>
        <Kv k="PAPER TRADES (SESSION)" v={String(stats.totalCount)} />
        <Kv k="OPEN POSITIONS" v={`${openCount} / 3`} />
        <Kv k="REALIZED P/L"
            v={`${stats.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(stats.realizedPnl).toFixed(2)}`}
            color={stats.realizedPnl >= 0 ? T.NEON : T.RED} />
        <div style={{ height: 1, background: T.BORDER, margin: "4px 0" }} />
        <Kv k="LAST EVENT"
            v={event ? `${event.label} · ${eventAgeStr}` : "AWAITING ACTIVITY"}
            color={event ? eventColor : T.TEXT_2} />
      </div>
    </PanelCard>
  );
});

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

function OperatorTelemetryStrip({
  engineOnline, pulse, engine, now,
}: {
  engineOnline: boolean;
  pulse:        MarketPulse;
  engine:       EngineLite | undefined;
  now:          number;
}) {
  const tickAge = engineOnline ? signalAgePrecise(engine?.lastTickAt ?? null, now) : "—";
  const sigAge  = engineOnline ? signalAgePrecise(engine?.lastSignalAt ?? null, now) : "—";
  const loopMs  = engine?.loopIntervalMs ?? 0;
  // Tick freshness color: green within 2× loop interval, amber up to 5×,
  // red beyond. Falls back to neutral if loop interval unknown.
  const tickMs  = engine?.lastTickAt ? Math.max(0, now - engine.lastTickAt) : Infinity;
  const tickTone =
    !engineOnline ? T.TEXT_3 :
    loopMs <= 0   ? T.TEXT_0 :
    tickMs <= loopMs * 2 ? T.NEON :
    tickMs <= loopMs * 5 ? T.AMBER : T.RED;

  // Volatility pulse: tilt toward ELEVATED tone if elevated > low,
  // else lean calm (TEXT_1).
  const volTone =
    pulse.elevatedVolPct >= 50 ? T.AMBER :
    pulse.elevatedVolPct >= 25 ? T.TEXT_0 : T.TEXT_1;

  const momTone =
    pulse.momentumBreadthPct >= 50 ? T.NEON :
    pulse.momentumBreadthPct >= 25 ? T.TEXT_0 : T.TEXT_1;

  const regimeLabel = pulse.regimeTop
    ? `${pulse.regimeTop.label} ${pulse.regimeTop.pct}%`
    : "—";

  return (
    <footer className="cd-footer" style={{
      background: T.BG_TERMINAL,
      borderTop: `1px solid ${T.BORDER}`,
      padding: "8px 16px",
      fontFamily: T.FONT_MONO,
      fontSize: 11,
      color: T.TEXT_2,
      position: "sticky", bottom: 0, zIndex: 30,
      display: "flex", flexWrap: "nowrap", gap: 20,
      alignItems: "center", justifyContent: "flex-start",
      fontVariantNumeric: "tabular-nums",
      minWidth: 0, overflow: "hidden", whiteSpace: "nowrap",
    }}>
      <span
        title={`Last engine tick · loop ${loopMs || "—"}ms`}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
      >
        {/* Radio cadence tied to tick freshness:
            NEON tick (fresh)   → fast 1.4s pulse  → "engine is talking to us"
            AMBER tick (stale)  → slow 3s pulse    → "still alive but lagging"
            RED tick (silent)   → no animation     → "no recent heartbeat" */}
        <Radio
          size={11}
          color={engineOnline ? tickTone : T.TEXT_3}
          style={
            engineOnline && tickTone === T.NEON  ? { animation: "brand-pulse 1.4s infinite" } :
            engineOnline && tickTone === T.AMBER ? { animation: "brand-pulse 3s infinite"   } :
            undefined
          }
        />
        LAST TICK:&nbsp;<span style={{ color: tickTone }}>{tickAge}</span>
      </span>
      <Divider prio={2} />
      <span
        data-prio="2"
        title="Most recent AI signal emitted by the engine"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
      >
        <Database size={11} /> LAST SIGNAL:&nbsp;<span style={{ color: T.TEXT_0 }}>{sigAge}</span>
      </span>
      <Divider prio={2} />
      <span
        data-prio="2"
        title={`Share of watched symbols flagged ELEVATED volatility (${pulse.elevatedVolPct}% elevated · ${pulse.lowVolPct}% low)`}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
      >
        <LineChartIcon size={11} color={volTone} /> VOL PULSE:&nbsp;<span style={{ color: volTone }}>{pulse.elevatedVolPct}% ELEVATED</span>
      </span>
      <Divider prio={3} />
      <span
        data-prio="3"
        title={`Share of symbols with momentum strength ≥ 2 (of 3)`}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
      >
        <Activity size={11} color={momTone} /> MOMENTUM:&nbsp;<span style={{ color: momTone }}>{pulse.momentumBreadthPct}% BREADTH</span>
      </span>
      <Divider prio={3} />
      <span
        data-prio="3"
        title="Dominant market regime across watched universe"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
      >
        <PieChart size={11} /> REGIME:&nbsp;<span style={{ color: T.TEXT_0 }}>{regimeLabel}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0 }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_3, flexShrink: 0 }}>
        <AlertTriangle size={11} /> Paper telemetry · zero broker exposure
      </span>
    </footer>
  );
}

function Divider({ prio }: { prio?: 2 | 3 } = {}) {
  // Matches RibbonDivider height for cross-strip rhythm consistency.
  return (
    <span
      data-prio={prio}
      style={{ width: 1, height: 14, background: T.BORDER, flexShrink: 0 }}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* ENABLE LIVE AI TRADING — aspirational command bar (paper-only, gated)    */
/* ──────────────────────────────────────────────────────────────────────── */

const EnableLiveAITradingBar = memo(function EnableLiveAITradingBar({
  engineOnline, openPaper, slotCap, onUpgrade,
}: {
  engineOnline: boolean;
  openPaper:    number;
  slotCap:      number;
  onUpgrade:    () => void;
}) {
  const engineLabel = engineOnline ? "AI ENGINE · ONLINE" : "AI ENGINE · WARMING UP";
  const engineColor = engineOnline ? T.NEON : T.AMBER;
  // Scan sweep only when there is paper-slot headroom AND the engine is alive
  // — i.e. only when this CTA actually represents an actionable upgrade.
  // At capacity or offline, the bar stays still (no decorative scrolling glow).
  const hasHeadroom = engineOnline && openPaper < slotCap;
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
      {hasHeadroom && (
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
      )}
      <div
        style={{
          position: "relative", zIndex: 1,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 24, padding: "10px 16px",
        }}
      >
        {/* LEFT */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Static Radar — engine liveness is already pulsing in the top ribbon
              and in the footer Radio. A third pulse here would be glow spam. */}
          <Radar size={16} color={engineColor} />
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
            color: T.TEXT_0, fontSize: 13, fontWeight: 700, letterSpacing: T.TRACK_TITLE,
          }}>
            ENABLE LIVE AI TRADING
          </span>
          <span style={{
            color: T.TEXT_1, fontSize: 10, letterSpacing: T.TRACK_LABEL, marginTop: 2,
          }}>
            PAPER MODE ACTIVE · LIVE EXECUTION GATED · UPGRADE TO UNLOCK PRO QUEUE
          </span>
        </div>

        {/* RIGHT */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: T.TEXT_1, letterSpacing: T.TRACK_LABEL }}>
            SLOTS:&nbsp;<span style={{ color: T.TEXT_0 }}>{openPaper}/{slotCap}</span>
          </span>
          <button
            type="button"
            onClick={onUpgrade}
            style={{
              fontFamily: T.FONT_MONO, fontSize: 10, fontWeight: 700,
              letterSpacing: T.TRACK_TITLE,
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
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Shell                                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export function PortalCustomerShell() {
  const { isAdmin } = useUserRole();
  const plan = useCustomerPlan();
  const exec = useExecutionState();
  const engineOnline = !!exec.data?.engine.running;
  const { majors, alts, opportunities, engine, isLoading, isError } = usePaperSignals();
  const { stats: paperStats, openTrade, open: openTrades } = usePaperTrades();

  // Pass 3.3: ONE shell-level 1Hz tick — passed as a prop to
  // `OperatorPulseRibbon`, `OpportunityMatrix`, and
  // `OperatorTelemetryStrip` (which already accepts `now`). The ribbon
  // no longer spawns its own `useUtcClock`, and the matrix no longer
  // spawns its own `useNow1s`. Visibility-aware: pauses on hidden tab.
  const nowShell = useNow1s();

  // Pass 3.3: engine status now comes from `usePaperSignals` directly
  // (single observer instead of two). The hook already fetches
  // `/api/engine/status` with key `["engine-status-portal"]`; the
  // previously-lifted shell-level `useQuery` was a duplicate observer
  // (same key, same interval, same staleTime) that registered a second
  // refetch timer for no additional information. EngineStatus is a
  // structural superset of EngineLite — the cast is a narrowing
  // documentation hint, not a coercion.
  const engineStatus: EngineLite | undefined = engine ?? undefined;

  const signalsPerMin = useSignalRate(engineStatus?.signalsGenerated);
  const pulse = useMemo(
    () => computeMarketPulse(opportunities, engineStatus),
    [opportunities, engineStatus],
  );

  const [query,   setQuery]   = useState("");
  const [filter,  setFilter]  = useState<Filt>("ALL");
  const [account, setAccount] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [disclaimer, setDisclaimer] = useState(false);
  const { gate: disclaimerGate, modal: disclaimerGateModal } = useDisclaimerGate();

  // Pass 4.7 — re-split by direction (LONG/SHORT) from the combined
  // opportunity stream, then take top 10 by inbound confidence rank
  // (engine already sorts by score). MAJORS/ALTS asset-class filter
  // pills still narrow within each column via `filterOpps`.
  const filteredOpps = useMemo(
    () => filterOpps(opportunities, query, filter),
    [opportunities, query, filter],
  );
  // Pass 6.1a — caps lifted 10 → 20 per side so each column reads
  // dense / continuously-evaluating instead of sparse. Engine still
  // ranks by confidence; we just surface more of the depth.
  const filteredLongs  = useMemo(
    () => filteredOpps.filter(o => o.direction === "LONG").slice(0, 20),
    [filteredOpps],
  );
  const filteredShorts = useMemo(
    () => filteredOpps.filter(o => o.direction === "SHORT").slice(0, 20),
    [filteredOpps],
  );

  // Pass 6.1 — EVALUATING tier derivation. FLAT (engine HOLD) opps
  // routed into a column by their fast/slow TF `lean`. NEUTRAL leans
  // render in BOTH columns (true "we don't know yet" state). Capped
  // at 8 per column to keep the dimmed tier subordinate to active
  // conviction while still feeling substantial. Sorted by confidence.
  const evaluatingLongs = useMemo(
    () => filteredOpps
      .filter(o => o.direction === "FLAT" && (o.lean === "LONG" || o.lean === "NEUTRAL"))
      .slice(0, 8),
    [filteredOpps],
  );
  const evaluatingShorts = useMemo(
    () => filteredOpps
      .filter(o => o.direction === "FLAT" && (o.lean === "SHORT" || o.lean === "NEUTRAL"))
      .slice(0, 8),
    [filteredOpps],
  );

  // Pass 6.1 — symbol universe for the IdleScanningPanel rotation.
  // Pulled from `opportunities` (not `filteredOpps`) so the user sees
  // the engine sweeping its entire scan pool regardless of active
  // filter chips — communicates total surveillance, not filter scope.
  const idleSymbols = useMemo(
    () => Array.from(new Set(opportunities.map(o => o.symbol))),
    [opportunities],
  );
  const engineLastTickAt = engineStatus?.lastTickAt
    ? new Date(engineStatus.lastTickAt).getTime()
    : null;

  // Stable identity — keeps `OpportunityMatrix` / `OpportunityCard`
  // memoization effective across the shell's 1Hz tick. `openTrade`
  // identity is provided by `usePaperTrades`; safe to depend on.
  const queuePaper = useCallback((opp: OpportunityVM) => {
    if (opp.direction === "FLAT") return;
    openTrade({
      symbol:  opp.pair,
      display: opp.display,
      side:    opp.direction === "LONG" ? "LONG" : "SHORT",
      entry:   opp.entry,
      stop:    opp.stop,
      target:  opp.target,
    });
  }, [openTrade]);

  // Stable handler refs for memo'd CTAs.
  const openUpgrade = useCallback(() => setUpgrade(true), []);

  // Surface the customer shell only on the customer surface. The Portal
  // dispatcher already gates on `isAdmin`, so this is purely defensive.
  void isAdmin;

  // Compose chip suggestion pool from current opportunities, padded with
  // the canonical majors universe so the chip strip is never empty on a
  // cold engine.
  const suggestionPool = useMemo(() => {
    const live = opportunities.map(o => o.symbol);
    // Pass 4.8 — chip suggestions skew toward meme / high-volatility
    // assets alongside majors so the search surface mirrors the new
    // universe positioning without touching the engine watchlist.
    const fallback = [
      "BTC", "ETH", "SOL", "XRP", "AVAX", "LINK", "ADA", "ATOM",
      "DOGE", "PEPE", "WIF", "BONK", "FLOKI", "BRETT",
      "POPCAT", "MOG", "TURBO", "BOME", "SHIB",
    ];
    const seen = new Set<string>();
    return [...live, ...fallback].filter(s => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  }, [opportunities]);

  return (
    <div className="cd-portal-root" style={{
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
        /* Pass 4.3 — leading-edge marker pulse on the live tip of the
           chart tape. Gated on isFreshSignal (under 30s) via the live
           prop on Sparkline. */
        @keyframes spark-tip-breathe {
          0%   { transform: scale(0.85); opacity: 0.65; }
          50%  { transform: scale(1.25); opacity: 1.00; }
          100% { transform: scale(0.85); opacity: 0.65; }
        }
        /* Pass 4.3 — tape-advance: subtle vertical light band that
           crosses the chart left→right over 6s, communicating active
           market flow without arcade tint. Gated on isLiveTick (<10s)
           via the OpportunityCard render condition. */
        @keyframes tape-advance {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(1200%); }
        }
        /* Pass 4.4 — spark-flow: continuous energy traveling along the
           sparkline trace itself via stroke-dashoffset. Cycle length
           (1200) traverses the full viewBox-width trace per 4s loop,
           giving the line a live "tape rolling" feel without arcade
           tint. Gated on the live prop in Sparkline (isFreshSignal,
           under 30s). */
        @keyframes spark-flow {
          0%   { stroke-dashoffset: 0;     }
          100% { stroke-dashoffset: -1200; }
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
        /* Pass 4.1 — RiskHeatmap hot-cell pulse. State-gated: only cells
           with risk > 0.7 receive this; calm cells stay static. Floor
           kept >= amber's static ceiling (0.70) so hot cells never
           visually under-rank amber at trough. */
        @keyframes risk-pulse {
          0%   { opacity: 0.75; }
          50%  { opacity: 1.00; }
          100% { opacity: 0.75; }
        }
        /* Pass 4.9 — panel-breathe: ultra-slow ambient inner-glow
           oscillation on LIVE panels (AIReasoningConsole,
           SignalPipeline, AIThroughput, ExecAwareness). Communicates
           "this surface is actively listening" without arcade tint.
           Trough is set high (0.96) so the effect reads as a faint
           idle rhythm, not a status pulse. Reduced-motion umbrella
           below halts it. */
        /* Pass 5.0 — 0% / 100% frames now match the live panel's
           static base shadow exactly (architect note from 4.9), so
           the first animation frame doesn't visibly step up from
           the inline boxShadow. */
        @keyframes panel-breathe {
          0%   { box-shadow: inset 0 1px 0 rgba(102,255,102,0.08), inset 0 -1px 0 rgba(0,0,0,0.50), 0 1px 0 rgba(0,0,0,0.60), inset 0 0 24px rgba(102,255,102,0.04); }
          50%  { box-shadow: inset 0 1px 0 rgba(102,255,102,0.10), inset 0 -1px 0 rgba(0,0,0,0.50), 0 1px 0 rgba(0,0,0,0.60), inset 0 0 32px rgba(102,255,102,0.07); }
          100% { box-shadow: inset 0 1px 0 rgba(102,255,102,0.08), inset 0 -1px 0 rgba(0,0,0,0.50), 0 1px 0 rgba(0,0,0,0.60), inset 0 0 24px rgba(102,255,102,0.04); }
        }
        /* Pass 5.0 — workspace-scan: ultra-slow horizontal sweep that
           crosses the customer workspace every 22s. Communicates
           "the engine is always scanning" even when zero trades are
           open and no fills are occurring. Opacity capped at 0.06
           so the line reads as ambient terminal phosphor, not motion.
           Reduced-motion umbrella below halts it. */
        @keyframes workspace-scan {
          0%   { transform: translateX(-30%); opacity: 0; }
          10%  { opacity: 0.06; }
          90%  { opacity: 0.06; }
          100% { transform: translateX(130%); opacity: 0; }
        }
        /* Pass 5.0 — chassis vignette overlay. Pseudo-element on
           cd-portal-root that darkens the four corners with a soft
           radial gradient, giving the workspace a backlit terminal
           bezel feel. Static (no animation) — pure depth. */
        .cd-portal-root::before {
          content: "";
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%),
            radial-gradient(ellipse at top, rgba(102,255,102,0.020) 0%, transparent 60%);
        }
        .cd-portal-root > * { position: relative; z-index: 1; }
        /* Pass 5.0 — ambient ultra-wide breathing room. Above 1800px
           the workspace already centers via maxWidth; this rule adds
           a touch more horizontal padding so the cards don't feel
           glued to the chassis edge on 4K / 27" displays. */
        @media (min-width: 1800px) {
          .cd-workspace { padding-left: 32px !important; padding-right: 32px !important; }
        }
        /* Pass 5.1 — ULTRA-WIDE CENTER GRAVITY. Above 1900px the
           workspace was free to grow to its full 2000px maxWidth; on
           4K/5K monitors this began to drift toward a "stretched
           dashboard" feel and diluted operator focus. Cap effective
           width at 1880px to preserve command-center density and
           keep the telemetry clusters visually connected. The 1800px
           rule above still applies for 1800-1899px (intermediate
           ultra-wides where 2000px still reads as cohesive). */
        @media (min-width: 1900px) {
          .cd-workspace {
            max-width: 1880px !important;
            padding-left: 28px !important;
            padding-right: 28px !important;
          }
        }
        /* Pass 5.1 — LAPTOP DENSITY TIGHTENING. Between 1280-1440px
           (13"-15" laptop typical widths) the main 24px/28px padding
           + section gap left the cards feeling slightly under-dense
           relative to the available chassis. Tighten to 14px/22px so
           sparklines stay prominent and telemetry preserves its
           scanning cadence without crossing into cramped territory.
           Above 1440 returns to the comfortable default. */
        @media (min-width: 1280px) and (max-width: 1440px) {
          .cd-workspace {
            padding-left: 14px !important;
            padding-right: 14px !important;
            gap: 22px !important;
          }
        }
        /* Pass 5.1 — OPPORTUNITY MATRIX COHESION. At laptop widths
           the 20px column gap read as two detached panels rather
           than one execution matrix. Tighten to 16px so the LONGS /
           SHORTS pair reads as a single bipolar surface. */
        @media (max-width: 1440px) {
          /* column-gap (not gap) so when the matrix collapses to a
             single stacked column below ~1040px the vertical breathing
             between LONGS and SHORTS is preserved at the original 20px. */
          .cd-matrix { column-gap: 16px !important; }
        }
        /* Pass 4.4 — reduced-motion umbrella expanded to TRUE portal-
           wide scope. Holds at the bright phase so state semantics
           (hot/online/fresh) remain legible without continuous motion.
           cd-portal-root wraps the entire customer shell; the
           descendant selector catches every animated surface
           (DataFeedBanner pulse, command-bar scan, cards, charts, etc.)
           without requiring each surface to opt-in by classname. */
        @media (prefers-reduced-motion: reduce) {
          .cd-portal-root *,
          .cd-ribbon *,
          .cd-footer *,
          .cd-scroll * {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
        /* hide scrollbar on horizontal filter pill strip */
        .cd-pills-strip::-webkit-scrollbar { display: none; }
        /* Institutional scrollbar — thin, neon-tinted, only on hover.
           Applied to portal vertical scroll containers (columns + panel bodies)
           so the chrome doesn't visually compete with the data. */
        .cd-scroll::-webkit-scrollbar              { width: 6px; }
        .cd-scroll::-webkit-scrollbar-track        { background: transparent; }
        .cd-scroll::-webkit-scrollbar-thumb        {
          background: rgba(102,255,102,0.10);
          border-radius: 3px;
          transition: background 200ms ease;
        }
        .cd-scroll:hover::-webkit-scrollbar-thumb  { background: rgba(102,255,102,0.22); }
        .cd-scroll                                 { scrollbar-width: thin; scrollbar-color: rgba(102,255,102,0.18) transparent; }
        /* Operator strip progressive collapse — institutional single-line
           preservation. Priority numbering matches operator importance:
           P1 > P2 > P3. Lower-priority chips drop at LARGER viewport
           widths (i.e. drop sooner). Below ~1280px we drop the tertiary
           detail chips (QUEUE breakdown, SLOTS counter · MOMENTUM,
           REGIME); below ~1100px we additionally drop the secondary
           throughput chips (SIG/MIN, L/S, AVG CONF · LAST SIGNAL,
           VOL PULSE). P1 chips (brand, clock, ENGINE, plan, BAL,
           REALIZED, LAST TICK, paper tagline) always render.
           Preserves dense terminal aesthetic on standard laptop widths
           without flexWrap row-collapse. */
        @media (max-width: 1280px) {
          .cd-ribbon [data-prio="3"],
          .cd-footer [data-prio="3"] { display: none !important; }
        }
        @media (max-width: 1100px) {
          .cd-ribbon [data-prio="2"],
          .cd-footer [data-prio="2"] { display: none !important; }
        }
      `}</style>
      <OperatorPulseRibbon
        plan={plan}
        equityUsd={paperStats.equity || STARTING_EQUITY}
        realizedToday={paperStats.todayPnl}
        engineOnline={engineOnline}
        openCount={openTrades.length}
        pulse={pulse}
        signalsPerMin={signalsPerMin}
        now={nowShell}
      />
      <PaperModeBanner />
      {engineStatus?.dataFeedHealth && !engineStatus.dataFeedHealth.healthy && (
        <DataFeedBanner health={engineStatus.dataFeedHealth} />
      )}

      <main className="cd-workspace" style={{
        flex: 1, width: "100%", maxWidth: 2000, margin: "0 auto",
        padding: "24px 16px", display: "flex", flexDirection: "column", gap: 28,
        position: "relative",
      }}>
        {/* Pass 5.0 — ambient workspace scan. A 1px neon hairline
            sweeps left→right across the workspace every 22s at
            ~6% opacity, reinforcing "system continuously scanning"
            even when no trades are open. State-agnostic ambient
            motion; reduced-motion umbrella halts it. */}
        <span aria-hidden style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: "8%",
          background: "linear-gradient(90deg, transparent 0%, rgba(102,255,102,0.40) 50%, transparent 100%)",
          animation: "workspace-scan 22s linear infinite",
          pointerEvents: "none", zIndex: 0,
        }} />
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
          onUpgrade={openUpgrade}
        />

        <OpportunityMatrix
          longs={filteredLongs}
          shorts={filteredShorts}
          evaluatingLongs={evaluatingLongs}
          evaluatingShorts={evaluatingShorts}
          onQueue={queuePaper}
          isLoading={isLoading}
          isError={isError}
          now={nowShell}
          idleSymbols={idleSymbols}
          lastTickAt={engineLastTickAt}
        />

        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          paddingTop: 20,
          borderTop: `1px solid ${T.BORDER}`,
        }}>
          <AIReasoningConsole log={engineStatus?.recentSignalLog} live={engineOnline} />
          <PortfolioIntelligence now={nowShell} />
          <SignalPipeline opps={opportunities} pulse={pulse} engine={engineStatus} />
          <MarketRegime opps={opportunities} />
          <ExchangeTopology />
          <RiskHeatmap opps={opportunities} />
          <AIThroughput engine={engineStatus} pulse={pulse} signalsPerMin={signalsPerMin} />
          <ExecutionAwareness openCount={openTrades.length} now={nowShell} />
        </section>
      </main>

      <OperatorTelemetryStrip engineOnline={engineOnline} pulse={pulse} engine={engineStatus} now={nowShell} />

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
        letterSpacing: T.TRACK_LABEL,
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
