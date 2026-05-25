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
  TEXT_3:      "#3A4842",
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
        background: T.BG_TERMINAL,
        borderBottom: `1px solid ${T.BORDER}`,
        padding: "6px 16px",
        fontFamily: T.FONT_MONO,
        fontSize: 11,
        overflow: "hidden",
      }}
    >
      <div className="cd-ribbon" style={{
        display: "flex", alignItems: "center",
        gap: 14, maxWidth: 2000, margin: "0 auto",
        flexWrap: "nowrap", minWidth: 0, overflow: "hidden",
        whiteSpace: "nowrap",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.TEXT_0, fontWeight: 700, letterSpacing: "0.18em", flexShrink: 0 }}>
          <Terminal size={13} color={T.NEON} /> AICANDLEZ
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
        <span style={{ color: T.TEXT_2, fontVariantNumeric: "tabular-nums" }}>PAPER BAL:&nbsp;
          <span style={{ color: T.TEXT_0 }}>${equityUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
        <span style={{ color: T.TEXT_2, fontVariantNumeric: "tabular-nums" }}>REALIZED (1D):&nbsp;
          <span style={{ color: realizedColor }}>{realizedSign}${Math.abs(realizedToday).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Asset Intelligence Search Bar + Filter pills                             */
/* ──────────────────────────────────────────────────────────────────────── */

type Filt =
  | "ALL" | "MAJORS" | "ALTS" | "HIGH_CONF" | "READY" | "LONG" | "SHORT" | "WATCHLIST"
  | "LOW_VOL" | "TRENDING" | "BREAKOUT" | "SCALP" | "MOMENTUM";

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

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80, h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / Math.max(1, data.length - 1);
  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  // Per-instance unique id — avoids duplicate-DOM-id coupling across many
  // sparklines (architect nit, Pass 4.1). useId() output contains ":" which
  // SVG url(#...) tolerates, but sanitize for safety against future XML
  // serializers.
  const rawId  = useId();
  const gradId = `spark-grad-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.40" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline
        points={points}
        fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})` }}
      />
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
  const isLiveTick    = tickMs < 10_000;                  // telemetry-flicker
  const isFreshSignal = tickMs < 30_000;                  // spark-drift dot
  const isReady       = opp.readiness === "READY";        // ring-sweep crystallization cue
  const rr     = rrRatio(opp.entry, opp.stop, opp.target);
  const gatedReason = opp.readiness === "GATED" && opp.reason ? opp.reason : null;
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
        height: 328,
        fontFamily: T.FONT_MONO,
        // Deterministic hover cadence — background + border tinted in lock-step.
        transition: `background-color ${T.TX_FAST}, border-color ${T.TX_FAST}`,
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
          {/* Sweep only on READY — communicates "signal has crystallized, awaiting execution".
              WAITING / GATED cards keep a static ring. */}
          {isReady && (
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
          )}
          <span style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36,
            // Conf-tiered weight + bloom — conviction-grade signals
            // visibly anchor the focal grid; low-conf stays restrained.
            fontWeight: opp.conf >= 85 ? 400 : 300,
            color: dirColor, letterSpacing: T.TRACK_DISPLAY,
            textShadow:
              opp.conf >= 85 ? `0 0 16px ${dirColor}, 0 0 8px ${dirColor}` :
              opp.conf >= 70 ? `0 0 10px ${dirColor}` :
              opp.conf >= 55 ? `0 0 6px ${dirColor}`  :
                               "none",
          }}>{opp.conf}</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Row label="REGIME" value={opp.regime} />
          <Row label="VOLATILITY" value={opp.vol} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 2 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
              <div style={{ display: "flex", gap: 4 }}>
                {["5m", "15m", "1H", "4H"].map(tf => (
                  <span key={tf} style={{
                    width: 11, fontSize: 7, color: T.TEXT_3,
                    textAlign: "center", letterSpacing: 0,
                  }}>{tf}</span>
                ))}
              </div>
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

      {/* Price strip — ENTRY · STOP · TGT · R:R (derived from VM, paper-only context) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr auto",
        gap: 8,
        padding: "6px 0",
        borderTop: `1px solid ${T.BORDER}`,
        borderBottom: `1px solid ${T.BORDER}`,
      }}>
        <PriceCell label="ENTRY"  value={fmtPrice(opp.entry)}  tone={T.TEXT_0} />
        <PriceCell label="STOP"   value={fmtPrice(opp.stop)}   tone={T.RED}
          tooltip={`Stop ${fmtPrice(opp.stop)} (${pctDelta(opp.entry, opp.stop)} from entry)`} />
        <PriceCell label="TGT"    value={fmtPrice(opp.target)} tone={T.NEON}
          tooltip={`Target ${fmtPrice(opp.target)} (${pctDelta(opp.entry, opp.target)} from entry)`} />
        <PriceCell label="R:R"    value={rr}                   tone={dirColor} align="right" />
      </div>

      {/* Sparkline + details row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ position: "relative", width: 80, height: 36 }}>
          <Sparkline data={opp.sparkline} color={sparkColor} />
          {/* v4.1 spark-drift scan dot — only when signal has updated within the last 30s.
              Communicates "this price stream is live"; stale cards keep a static sparkline. */}
          {isFreshSignal && (
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
          )}
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
            <span
              title={`Signal age ${ageStr} · execution latency ${opp.latency}`}
              style={{
                fontSize: 10, color: T.TEXT_2,
                // Flicker only while telemetry is genuinely live (<10s since update).
                // Static otherwise — prevents 20 cards from breathing in perpetuity.
                animation: isLiveTick ? "telemetry-flicker 1.6s ease-in-out infinite" : undefined,
                animationDelay: isLiveTick ? `-${flickerDelayMs}ms` : undefined,
                fontVariantNumeric: "tabular-nums",
              }}>
              <span style={{ color: T.TEXT_1 }}>{ageStr}</span>
              <span style={{ opacity: 0.45, margin: "0 4px" }}>·</span>
              {opp.latency}
            </span>
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
              fontFamily: T.FONT_MONO, letterSpacing: T.TRACK_LABEL,
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
        <span
          title={gatedReason ? `Gated: ${gatedReason}` : opp.reasoning}
          style={{
            fontSize: 10, fontStyle: "italic",
            color: gatedReason ? T.AMBER : T.TEXT_2,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.35,
            maxHeight: "2.7em",
          }}>
          {gatedReason ? `⛔ ${gatedReason}` : opp.reasoning}
        </span>
      </div>
    </article>
  );
});

function ConfidenceRing({ color, value }: { color: string; value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  // Conf-tiered glow intensity — high-conviction signals visibly bloom,
  // low-conviction stay restrained. State-gated motion policy: glow
  // amount encodes confidence tier.
  const glowPx =
    value >= 85 ? 14 :
    value >= 70 ? 10 :
    value >= 55 ? 6  : 3;
  const ringStroke = value >= 70 ? 2.5 : 2;
  const showHalo = value >= 85;
  return (
    <svg width={96} height={96} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {/* Outer bloom halo — only for conviction-grade signals (>=85). */}
      {showHalo && (
        <circle
          cx={48} cy={48} r={46} fill="none"
          stroke={color} strokeWidth={1}
          style={{ filter: `drop-shadow(0 0 8px ${color})`, opacity: 0.35 }}
        />
      )}
      <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={2} />
      <circle
        cx={48} cy={48} r={r} fill="none"
        stroke={color} strokeWidth={ringStroke}
        strokeDasharray={`${c * pct} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
        style={{
          filter: `drop-shadow(0 0 ${glowPx}px ${color}) drop-shadow(0 0 ${Math.round(glowPx / 2)}px ${color})`,
          transition: "stroke-dasharray 600ms ease",
        }}
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

function PriceCell({ label, value, tone, align = "left", tooltip }: {
  label: string;
  value: string;
  tone: string;
  align?: "left" | "right";
  tooltip?: string;
}) {
  return (
    <div
      title={tooltip}
      style={{
        display: "flex", flexDirection: "column", gap: 1,
        alignItems: align === "right" ? "flex-end" : "flex-start",
        minWidth: 0,
        cursor: tooltip ? "help" : undefined,
    }}>
      <span style={{
        fontSize: 8, color: T.TEXT_3,
        letterSpacing: "0.10em", textTransform: "uppercase",
      }}>{label}</span>
      <span style={{
        fontSize: 12, color: tone, fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        maxWidth: "100%",
      }}>{value}</span>
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
        fontFamily: T.FONT_MONO, fontSize: 9, letterSpacing: T.TRACK_TITLE,
        color: accent, opacity: 0.55,
      }}>
        {subLabel}
      </span>
    </div>
  );
}

const OpportunityMatrix = memo(function OpportunityMatrix({
  majors, alts, onQueue, isLoading, isError, now,
}: {
  majors:    OpportunityVM[];
  alts:      OpportunityVM[];
  onQueue:   (opp: OpportunityVM) => void;
  isLoading: boolean;
  isError:   boolean;
  /** Pass 3.3: shell-level shared 1Hz tick. Previously this component
   *  spawned its own `useNow1s()` — now consolidated to a single shell
   *  source so the ribbon, matrix, and footer all tick in lock-step
   *  with zero observable drift and one timer instead of three. */
  now:       number;
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
        now={now}
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
        now={now}
      />
    </section>
  );
});

// Estimated card height (px) for the virtualizer pre-measure pass. Actual
// per-card height is observed via `measureElement` once mounted, so this
// only sets the initial scrollbar geometry. Dialed in against the
// approved CommandDeck mockup density: confidence ring + reasoning
// block + sparkline + exchange row ≈ 380px tall.
const CARD_ESTIMATE_PX = 380;
// Gap between cards, preserved from the pre-virtualization flex layout
// (was `gap: 14` on the scroll container). Absolute positioning means
// we now carry the gap as `paddingBottom` on each row wrapper so the
// virtualizer's `measureElement` includes it in the row's total height.
const CARD_ROW_GAP_PX = 14;

const Column = memo(function Column({
  title, opps, onQueue, isLoading, isError,
  accent, subLabel, tintRgba, leftDivider = false, now,
}: {
  title: string; opps: OpportunityVM[]; onQueue: (opp: OpportunityVM) => void;
  isLoading: boolean; isError: boolean;
  accent: string; subLabel: string; tintRgba: string; leftDivider?: boolean;
  now: number;
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
        {isError && !showList && (
          <div style={{
            padding: 24, textAlign: "center", color: "#FF4D4D", fontFamily: T.FONT_MONO,
            border: `1px dashed #FF4D4D55`, fontSize: 11,
          }}>
            ENGINE FEED UNAVAILABLE · /api/engine/status failed · retrying…
          </div>
        )}
        {!isError && !showList && (
          <div style={{
            padding: 24, textAlign: "center", color: T.TEXT_2, fontFamily: T.FONT_MONO,
            border: `1px dashed ${T.BORDER}`, fontSize: 11,
          }}>
            {isLoading ? "Loading engine signals…" : `No ${title.toLowerCase()} match the current filters.`}
          </div>
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
        <h3 style={{ margin: 0, fontSize: 11, color: T.TEXT_0, letterSpacing: T.TRACK_LABEL }}>{title}</h3>
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

const PortfolioIntelligence = memo(function PortfolioIntelligence() {
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

const ExecutionAwareness = memo(function ExecutionAwareness({ openCount }: { openCount: number }) {
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

  const filteredMajors = useMemo(() => filterOpps(majors, query, filter), [majors, query, filter]);
  const filteredAlts   = useMemo(() => filterOpps(alts,   query, filter), [alts,   query, filter]);

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
        /* Pass 4.1 — RiskHeatmap hot-cell pulse. State-gated: only cells
           with risk > 0.7 receive this; calm cells stay static. Floor
           kept >= amber's static ceiling (0.70) so hot cells never
           visually under-rank amber at trough. */
        @keyframes risk-pulse {
          0%   { opacity: 0.75; }
          50%  { opacity: 1.00; }
          100% { opacity: 0.75; }
        }
        /* Pass 4.1 — honor reduced-motion preference. Holds at the
           bright phase so state semantics (hot/online/fresh) remain
           legible without continuous motion. Scope: only the keyframes
           introduced or amplified in 4.x. */
        @media (prefers-reduced-motion: reduce) {
          .cd-ribbon *,
          .cd-footer *,
          .cd-scroll * {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
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
          onUpgrade={openUpgrade}
        />

        <OpportunityMatrix
          majors={filteredMajors}
          alts={filteredAlts}
          onQueue={queuePaper}
          isLoading={isLoading}
          isError={isError}
          now={nowShell}
        />

        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          paddingTop: 20,
          borderTop: `1px solid ${T.BORDER}`,
        }}>
          <AIReasoningConsole log={engineStatus?.recentSignalLog} live={engineOnline} />
          <PortfolioIntelligence />
          <SignalPipeline opps={opportunities} pulse={pulse} engine={engineStatus} />
          <MarketRegime opps={opportunities} />
          <ExchangeTopology />
          <RiskHeatmap opps={opportunities} />
          <AIThroughput engine={engineStatus} pulse={pulse} signalsPerMin={signalsPerMin} />
          <ExecutionAwareness openCount={openTrades.length} />
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
