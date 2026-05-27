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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAuth, useClerk, useUser } from "@clerk/react";
import {
  Activity, AlertTriangle, Bell, CheckCircle2, Clock, Database, Filter, Globe,
  LineChart as LineChartIcon, Link2, Lock, LogOut, MonitorPlay, PieChart, Power,
  Radar, Radio, Search, Shield, Star, Target, Terminal, Timer, User as UserIcon,
} from "lucide-react";

import { authFetch } from "../../lib/authFetch";
import {
  LiveControlBar,
  CryptoMajorsSignalsPanel,
  CryptoAltsMemesPanel,
} from "../command/institutional";
import { N } from "../command/institutional/theme";
import type { EngineStatus as InstitutionalEngineStatus } from "../command/types";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { PortalExchangeConnectModal } from "../PortalExchangeConnectModal";
import { AIRiskControlsPanel } from "./AIRiskControlsPanel";
import { AIDisclaimerModal } from "../AIDisclaimerModal";
// Pass 7V — brand logo used above search bar (replaces ticker chips row).
import aiCandlezLogoHorizontal from "@assets/aicandlez-logo-horizontal-master_1779691403317.png";
import aiCandlezLogoBrandCell from "@assets/aicandlez-logo-horizontal-master_1779871004819.png";
import { usePaperSignals, type OpportunityVM } from "../../hooks/usePaperSignals";
import { useCustomerPlan, type Plan, UPGRADE_EVENT } from "../../hooks/useCustomerPlan";
import { toast } from "@/hooks/use-toast";
import { calibrateRawConfidence } from "../../lib/conviction";
import { useExecutionState } from "../../hooks/useExecutionState";
import { usePaperTrades, STARTING_EQUITY } from "../../hooks/usePaperTrades";
import { useUserRole } from "../../hooks/useUserRole";
import { useDisclaimerGate } from "../../hooks/useDisclaimerGate";
import { SessionEnvBadge } from "./SessionEnvBadge";
import {
  AccountModal, UpgradeModal, DisclaimerModal,
} from "./modals";

const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

// ── Theme tokens (mirrors mockup `_group.css`) ─────────────────────────────
/* nz — coerce any value (null/undefined/NaN/string) to a finite number.
   Guards every render-time .toLocaleString() / .toFixed() / arithmetic on
   telemetry that may be null/undefined during bootstrap, on standby, or
   on transient upstream errors. */
function nz(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const T = {
  BG_BLACK:    "#000000",
  BG_TERMINAL: "#050A07",
  BG_CARD:     "#070F0B",
  // Pass 7f → Pass 7k — lower-surface visibility finalization.
  // Panel-internal labels/values/separators were still sinking into
  // the chassis even after 7f. Pushed again: TEXT_2 #7C8E86 →
  // #A4B5AD (true mid neutral, no longer dim), TEXT_3 #6F8079 →
  // #93A39B (no longer ghost text), BORDER #243D2E → #2F5040 (panel
  // internal dividers actually visible), BORDER_GRN 0.22 → 0.34.
  // Chassis (BG_BLACK/TERMINAL/CARD) still untouched — these are
  // foreground tokens only. Matrix is unaffected: cards key off
  // TEXT_0/TEXT_1 + dirColor-tinted borders, not these tokens.
  // Pass 7M — neutralized. Borders had drifted too green; neutral
  // dark separators read more professionally and stop the whole
  // portal from feeling tinted. BORDER_GRN reserved for actual
  // active/hover states only.
  BORDER:      "#2A3D33",
  BORDER_GRN:  "rgba(102, 255, 102, 0.24)",
  NEON:        "#66FF66",
  // CONVICTION_V2 (2026-05-26): glow alpha boosted 0.45 → 0.70 so neon
  // halos read as aggressive AI-found energy rather than the previous
  // muted institutional dusting. Used everywhere via T.NEON_GLOW so the
  // whole portal lifts in lock-step — confidence rings, status dots,
  // direction badges, sweep gradients.
  NEON_GLOW:   "rgba(102, 255, 102, 0.70)",
  EMERALD:     "#00C853",
  LIME:        "#7CFF00",
  RED:         "#FF4D4D",
  AMBER:       "#FFB020",
  TEXT_0:      "#FFFFFF",
  TEXT_1:      "#C5D2CB",
  TEXT_2:      "#A4B5AD",
  TEXT_3:      "#93A39B",
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

// `Plan` type + `useCustomerPlan` hook moved to ../../hooks/useCustomerPlan
// (Phase 6) so customer-scoped surfaces nested deep in the matrix tree
// (e.g. SignalRow's PRO AI ANALYSIS drawer) can consume plan-awareness
// without creating a circular import back through this shell.

/* ──────────────────────────────────────────────────────────────────────── */
/* Operator Pulse Ribbon                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

/* Pass 3.3: `useUtcClock` removed. The ribbon now derives its Date
 * from the shared shell-level `nowShell` (single 1Hz source) passed
 * as a prop, eliminating a redundant 1s setInterval at module load. */

function fmtUtc(d: Date): string {
  return `${d.toISOString().split("T")[1]?.split(".")[0]} UTC`;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Pass 7Z — Exchange / Account Status Label                                */
/* ──────────────────────────────────────────────────────────────────────── */
/* Compact neon label that sits inline to the RIGHT of the search bar      */
/* and resolves the customer's current trading account context:            */
/*   - subscribed + connected → connected exchange name (KRAKEN/...)       */
/*   - subscribed, not connected → "ALPACA PAPER ACCOUNT" (per spec)       */
/*   - free / non-subscriber → "PAPER TRADING"                             */
/* Reuses the same React Query key (`user-exchanges`) as `ExchangeTopology` */
/* so the network call is deduped across both surfaces.                    */

function useConnectedExchangeName(plan: Plan): string | null {
  const { isSignedIn, getToken } = useAuth();
  const enabled = (isSignedIn ?? false) && plan !== "free";
  const { data } = useQuery<{ exchanges: { exchange: string; connected: boolean }[] }>({
    queryKey: ["user-exchanges"],
    enabled,
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
  if (!enabled) return null;
  const first = (data?.exchanges ?? []).find(e => e.connected);
  return first ? first.exchange.toUpperCase() : null;
}

/* Pass 7AA — compact inline terminal chip. Was a large two-line boxed
   container alongside the search bar; now a single-line monospace chip
   that lives inside the toolbar button row beside CONNECT EXCHANGE.
   Same telemetry language as the operator pulse ribbon — no large
   panel, no card chassis. Label text per launch spec:
     free          → "PAPER MODE"
     subscribed    → "ALPACA PAPER" (no exchange linked)
     subscribed +  → "<EXCHANGE> CONNECTED" (or " LIVE" if live keys)   */
const ExchangeStatusBadge = memo(function ExchangeStatusBadge({ plan }: { plan: Plan }) {
  const connectedName = useConnectedExchangeName(plan);
  const { label, tone } =
    plan === "free"
      ? { label: "PAPER MODE",                       tone: T.TEXT_1 }
      : connectedName
        ? { label: `${connectedName} CONNECTED`,     tone: T.NEON   }
        : { label: "ALPACA PAPER",                   tone: T.AMBER  };
  // Match telemetry chip language: small dot + uppercase mono label.
  const dotShadow = tone === T.NEON  ? `0 0 6px ${T.NEON}`
                  : tone === T.AMBER ? `0 0 5px ${T.AMBER}`
                                     : "none";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 10px",
        border: `1px solid ${tone === T.NEON ? "rgba(102,255,102,0.45)"
                          : tone === T.AMBER ? "rgba(255,176,32,0.40)"
                                             : T.BORDER}`,
        background: tone === T.NEON  ? "rgba(102,255,102,0.05)"
                  : tone === T.AMBER ? "rgba(255,176,32,0.04)"
                                     : "rgba(255,255,255,0.02)",
        fontFamily: T.FONT_MONO,
        fontSize: 10, fontWeight: 700,
        letterSpacing: T.TRACK_LABEL,
        color: tone,
        whiteSpace: "nowrap",
        flexShrink: 0,
        lineHeight: 1.2,
      }}
    >
      <span aria-hidden style={{
        width: 6, height: 6, borderRadius: "50%",
        background: tone, boxShadow: dotShadow, flexShrink: 0,
      }} />
      {label}
    </span>
  );
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Pass 7Z — AI Trading enabled toggle (localStorage-backed)                */
/* ──────────────────────────────────────────────────────────────────────── */
/* Server-backed AI auto-trade state. Source of truth lives in              */
/* `user_settings.autoMode` on the API and is gated by                      */
/* `resolveAiTradingGate` (plan + planStatus + role). The customer portal   */
/* MUST treat the server response as authoritative — localStorage is no     */
/* longer used. A free user editing localStorage cannot flip the bar to     */
/* ON because the mutation rejects with 402 and the query continues to      */
/* report `enabled=false`.                                                  */

interface AiTradingState {
  enabled: boolean;
  allowed: boolean;
  plan:    "free" | "starter" | "pro";
  isAdmin: boolean;
  reason:  string | null;
}

const AI_TRADING_QK = ["ai-trading-state"] as const;

function useAiTradingState() {
  const qc = useQueryClient();
  const q  = useQuery<AiTradingState>({
    queryKey: AI_TRADING_QK,
    queryFn: async () => {
      const res = await authFetch("/api/user/ai-trading/state");
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    staleTime:       30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const mut = useMutation<AiTradingState, Error & { needsUpgrade?: boolean }, boolean>({
    mutationFn: async (enabled: boolean) => {
      const res = await authFetch("/api/user/ai-trading/enable", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled }),
      });
      if (res.status === 402) {
        const err = Object.assign(new Error("needs_upgrade"), { needsUpgrade: true });
        throw err;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    onSuccess: (data) => { qc.setQueryData(AI_TRADING_QK, data); },
  });

  const state: AiTradingState = q.data ?? {
    enabled: false, allowed: false, plan: "free", isAdmin: false, reason: null,
  };
  return { ...state, isLoading: q.isLoading, setEnabledAsync: mut.mutateAsync };
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
        boxShadow: `inset 0 -1px 0 rgba(102,255,102,0.072), 0 1px 0 rgba(102,255,102,0.04)`,
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
          flexShrink: 0, textShadow: `0 0 6px rgba(102,255,102,0.18)`,
        }}>
          <Terminal size={13} color={T.NEON} style={{ filter: `drop-shadow(0 0 4px ${T.NEON_GLOW})` }} />
          AICANDLEZ
          <span style={{
            fontSize: 8, color: T.NEON, opacity: 0.65,
            letterSpacing: "0.18em", marginLeft: 2,
            padding: "1px 5px", border: `1px solid rgba(102,255,102,0.30)`,
            borderRadius: 2,
          }}>OPS</span>
          {/* Launch-finalization build stamp. Confirms the deployed
              bundle contains the calibrated conviction layer
              (calibrateRawConfidence + lowered tier thresholds +
              rail-opacity DOM restructure). Remove once verified. */}
          <span style={{
            fontSize: 8, color: "#FFB020", opacity: 0.95,
            letterSpacing: "0.18em", marginLeft: 4,
            padding: "1px 5px",
            border: `1px solid rgba(255,176,32,0.55)`,
            background: "rgba(255,176,32,0.10)",
            borderRadius: 2, fontWeight: 700,
          }}>CONVICTION_V2</span>
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
            {nz(signalsPerMin) >= 10 ? nz(signalsPerMin).toFixed(0) : nz(signalsPerMin).toFixed(1)}
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
          }}>${nz(equityUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span aria-hidden style={{ width: 1, height: 12, background: "rgba(102,255,102,0.20)" }} />
          <span style={{ color: T.TEXT_3, fontVariantNumeric: "tabular-nums", fontSize: 9, letterSpacing: "0.16em" }}>REALIZED 1D</span>
          <span style={{
            color: realizedColor, fontVariantNumeric: "tabular-nums",
            fontSize: 12, fontWeight: 700, letterSpacing: "-0.01em",
            textShadow: realizedToday !== 0 ? `0 0 6px ${realizedColor}33` : undefined,
          }}>
            {realizedSign}${Math.abs(nz(realizedToday)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
        background: "#FF4D4D", boxShadow: "0 0 6px rgba(255,77,77,0.48)",
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
  // Pass 7V — quick-jump ticker chips row removed per user spec.
  // Replaced with centered brand logo above the search bar (rendered
  // below). `suggestionPool` arg retained for API stability but no
  // longer rendered as chips.
  void suggestionPool;
  const pills: { id: Filt; label: string; group: 0 | 1 }[] = [
    { id: "ALL",       label: "All",                   group: 0 },
    { id: "MAJORS",    label: "Majors",                group: 0 },
    // Pass 7Q — MEME / Hi-Vol promoted ahead of ALTS per user spec.
    // Pure ordering change; no styling, no new pills, no logic delta.
    { id: "MEME",      label: "Meme / Hi-Vol",         group: 0 },
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
      {/* Pass 7V — centered AICandlez horizontal logo above the search.
          Replaces the deleted quick-jump ticker chip row. */}
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 4 }}>
        <img
          src={aiCandlezLogoHorizontal}
          alt="AICandlez"
          style={{ height: 56, width: "auto", objectFit: "contain", display: "block" }}
        />
      </div>
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
        {/* Pass 7Y — pills now wrap onto multiple rows instead of
            horizontal scroll. The previous `overflowX: auto` +
            hidden scrollbar combo was clipping the last pill
            ("MOMENTUM") with no visible scroll affordance. Wrapping
            guarantees all pills fully render at every viewport. */}
        <div
          className="cd-pills-strip"
          style={{
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
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
    // User-facing aggregate uses the calibrated conviction score so the
    // pulse ribbon's "avg conf" reads in sync with the per-card numbers.
    confSum += o.convictionScore || 0;
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
  intensity = "baseline",
}: {
  data: number[];
  color: string;
  height?: number;
  live?: boolean;
  seedDelayMs?: number;
  /** Pass 7d — conviction-tier amplification. ELITE (>=90) and STRONG
   *  (>=80) rows get thicker inner stroke + brighter halo so the
   *  sparkline becomes a visible focal point on hero cards. BASELINE
   *  preserves Pass 6.1a tuning so low-conf rows stay restrained. */
  intensity?: "baseline" | "strong" | "elite";
}) {
  // Pass 7f — baseline sparkline luminance lift. Even non-hero rows
  // need readable trace energy at a glance; old baseline (stroke 2.6,
  // outer glow 0.28) was disappearing into the dark chassis. Bumped
  // baseline stroke 2.6 → 3.2, outer glow 0.28 → 0.46, halo
  // drop-shadow blurs widened so the line carries clear presence.
  // ELITE / STRONG amplitudes preserved relative to baseline so the
  // hero hierarchy still reads as a step UP, not parity.
  // Pass E3-polish — sparkline stabilization. Triple drop-shadow
  // stack (22/18/16px outer halos) was reading as full bloom across
  // the matrix now that E3 puts more cards into STRONG/ELITE bands.
  // Collapsed to single edge illumination per intensity tier; outer
  // halo opacity dropped 0.46-0.58 → 0.20-0.28 so the gradient fill
  // no longer bleeds into surrounding black space. Stroke widths
  // preserved (line presence is geometry, not glow).
  const innerStrokeWidth =
    intensity === "elite"  ? 3.6 :
    intensity === "strong" ? 3.4 : 3.2;
  const innerStrokeFilter =
    intensity === "elite"
      ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 7px ${color})`
      : intensity === "strong"
      ? `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})`
      : `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 4px ${color})`;
  const outerGlowOpacity =
    intensity === "elite"  ? 0.28 :
    intensity === "strong" ? 0.22 : 0.18;
  const liveStrokeWidth =
    intensity === "elite"  ? 3.8 :
    intensity === "strong" ? 3.5 : 3.2;
  const liveFilter =
    intensity === "elite"
      ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`
      : intensity === "strong"
      ? `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})`
      : `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 4px ${color})`;
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
        {/* Pass 7f — area-fill gradient lifted (0.55→0.72 top,
            0.18→0.30 mid) so the curve's underside reads as a real
            envelope, not a faint wash. */}
        {/* Pass E3-polish — gradient fill toned down. Top 0.72 → 0.42,
            mid 0.30 → 0.14. Amber fills were bleeding orange into the
            surrounding black chassis; envelope still readable but no
            longer flooding the row. */}
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.42" />
          <stop offset="55%"  stopColor={color} stopOpacity="0.14" />
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
      {/* Pass 7f — grid hairlines lifted 0.04 → 0.08, mean rail
          0.22 → 0.38. Reference rails are now actually visible so the
          eye can read excursion magnitude at a glance. */}
      {[0.25, 0.5, 0.75].map(t => (
        <line
          key={t}
          x1={0} x2={VBW} y1={VBH * t} y2={VBH * t}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Mean baseline — dashed reference rail, color-tinted */}
      <line
        x1={0} x2={VBW} y1={meanY} y2={meanY}
        stroke={color} strokeOpacity={0.38}
        strokeWidth={1} strokeDasharray="4 6"
        vectorEffect="non-scaling-stroke"
      />
      {/* Smooth area fill — bezier-curved underside reads as organic
          market envelope, not faceted polygon. */}
      <path
        d={areaPath}
        fill={`url(#${gradId})`}
      />
      {/* Soft outer glow stroke — smooth path. Pass 7d: opacity scales
          with conviction tier so hero cards visibly bloom. */}
      <path
        d={smoothPath}
        fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity={outerGlowOpacity}
        vectorEffect="non-scaling-stroke"
        style={{ filter: `blur(3px)` }}
      />
      {/* Crisp inner stroke with multi-layer drop-shadow halo. Pass 7d:
          conf-tier amplified — ELITE / STRONG rows get thicker stroke
          + brighter halo so the sparkline reads as the focal point of
          a hero row. */}
      <path
        d={smoothPath}
        fill="none" stroke={color} strokeWidth={innerStrokeWidth}
        strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: innerStrokeFilter }}
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
          fill="none" stroke={color} strokeWidth={liveStrokeWidth}
          strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray={`${flowDash} ${flowGap}`}
          style={{
            filter: liveFilter,
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
  onQueue: (opp: OpportunityVM, side: "LONG" | "SHORT") => void;
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
  // ── Conviction layer (see lib/conviction.ts) ────────────────────────
  // `conv` is the user-facing calibrated conviction score (0..100) that
  // drives every visual on this card: ring value, tier color, rail glow,
  // hero-tier border, font weight. Raw engine confidence stays available
  // as `opp.conf` for the "Why this score?" disclosure and any execution
  // gates that need the unmodified number — never use raw conf for what
  // a customer is meant to read.
  const conv = opp.convictionScore;
  const tier = opp.convictionTier;
  // Color tiers reflect the conviction tier ladder:
  //   ELITE / HIGH  (>=70) → NEON   STRONG (>=55) → AMBER   below → RED
  const confColor = conv >= 70 ? T.NEON : conv >= 55 ? T.AMBER : T.RED;
  const dirBg    = isLong ? "rgba(102,255,102,0.10)" : opp.direction === "SHORT" ? "rgba(255,77,77,0.10)" : "rgba(255,176,32,0.10)";
  const dirBorder = isLong ? "rgba(102,255,102,0.30)" : opp.direction === "SHORT" ? "rgba(255,77,77,0.30)" : "rgba(255,176,32,0.30)";
  // Pass 7AA — sparkline color now follows the AI-confidence bucket
  // (matches the confidence ring + global AI confidence visual
  // language) instead of trade direction. Rule:
  //   conf ≥ 80  → NEON GREEN (high-conviction trades pop instantly)
  //   conf < 80  → AMBER       (medium / low conviction)
  // SHORTs still carry red via the direction pill + railColor; the
  // sparkline itself communicates conviction strength, not side.
  const sparkColor = conv >= 70 ? T.NEON : T.AMBER;
  void dirColor;
  const ready = opp.readiness === "READY";
  const railColor = opp.direction === "SHORT" ? T.RED : T.NEON;
  // v4.1 deterministic per-card animation delays so 20 cards don't sync.
  const seed = (opp.symbol.charCodeAt(0) + idx * 7) % 100;
  const flickerDelayMs = (seed * 17) % 1600;
  const sparkDelayMs   = (seed * 53) % 5000;
  const sweepDelayMs   = (seed * 113) % 12000;
  // Pass 7c — left rail amplification at the elite tier. ELITE pushes
  // to 20px glow so the rail reads as a vertical bar of light, not a
  // hairline. STRONG bumped 14→16 for stronger separation from
  // BASELINE. Lower tiers preserved.
  // Launch-finalization — DIRECTIONAL RAIL IS A POLARITY INDICATOR,
  // NOT A CONVICTION INDICATOR. Same brightness across every tier so
  // LONG/SHORT snap visible the instant a card flips. No outward bloom
  // (was 20/16/10/6/3 px haze stack) — only a tight 2px edge glow plus
  // a 1px inner highlight that makes the bar feel physically lit
  // against the dark chassis. Bloomberg/TradingView accent vocabulary.
  const railGlow = `0 0 2px ${railColor}, inset 1px 0 0 rgba(255,255,255,0.35)`;
  // Polarity rail = always full brightness. Conviction is read via the
  // separate tier badge + ring, never by dimming the directional bar.
  const railOpacity = 1.0;
  // Pass 4.4 — rail animation state-gated. Only READY cards with fresh
  // telemetry pulse; WAITING / GATED / stale cards keep a static rail
  // honoring the "idle systems stay still" invariant. Glow + opacity
  // continue to encode conf tier without continuous motion.
  const railAnim = isReady && isFreshSignal
    ? (conv >= 75 ? "rail-pulse 1.8s ease-in-out infinite" : "rail-pulse 2.5s ease-in-out infinite")
    : undefined;

  // Pass 7c — CONVICTION DOMINANCE. The TOP 20 LONGS / SHORTS must
  // visually command attention; high-conviction signals (>=80, >=90)
  // get a conf-tier border + a very faint background wash so the
  // strongest opportunities physically separate from the median and
  // dominate over the EVALUATING tier. ELITE (>=90) is the loudest;
  // STRONG (>=80) is a softer step; BASELINE (<80) is the existing
  // neutral card. No fake conviction — only real engine scores trigger
  // the higher tiers. Restraint preserved: no animations added, only
  // static contrast amplified.
  // Tier flags drive the dirColor border weight on the row frame.
  // Mapped against the conviction tier ladder (ELITE >=85, HIGH >=70).
  const isElite  = tier === "ELITE";
  const isStrong = tier === "HIGH" && !isElite;
  // Pass 7g — ACTIVE SIGNAL DOMINANCE. Two changes from 7d:
  //   1. Hero borders/backgrounds/shadows now key off `dirColor`
  //      (LONG = neon-green, SHORT = red) instead of always-green.
  //      A SHORT ELITE should glow red, not green — directional
  //      identity reads instantly from across the room.
  //   2. New `isActiveBaseline` tier (active direction, conf < 80)
  //      gives the median active rows a subtle dirColor-tinted
  //      border + faint inset shadow so they "float" above the
  //      chassis without competing with hero rows. Previously they
  //      sat on the same neutral T.BORDER as evaluating rows even
  //      though they're real conviction signals.
  // EVALUATING (direction === "FLAT") still falls through to
  // T.BORDER + plain BG_TERMINAL — that wrapper is owned by the
  // matrix container and intentionally untouched (per 7f→7g rule).
  const isActive = opp.direction === "LONG" || opp.direction === "SHORT";
  const isActiveBaseline = isActive && !isStrong && !isElite;
  // RGB-channel form so we can interpolate alpha against dirColor
  // (neon green or red) without re-typing the constants below.
  const dirRgb = isLong ? "102,255,102" : opp.direction === "SHORT" ? "255,77,77" : "168,184,176";
  // Pass 7h — PERCEPTUAL LEAP. No more micro-tuning. Active rows now
  // get a true dimensional treatment: solid dirColor frame at high
  // alpha, real dirColor wash inside the card, MASSIVE outer halo
  // that darkens the surrounding chassis by contrast, and a 1px
  // "double-ring" stamped via box-shadow on hero tiers so the frame
  // reads as engraved metal, not a flat outline. Combined with the
  // article translateY lift below, active cards physically project
  // OFF the matrix surface instead of sitting flush with it.
  // Pass 7i — ELITE locked at 7h values. STRONG + ACTIVE BASELINE
  // pushed UP to close the hierarchy gap so the top 20 reads as a
  // continuous field of live signals (not one hero floating above
  // faint rows). EVALUATING fall-through (T.BORDER) untouched.
  // Pass E3-polish — tier border alphas calmed. Pre-E3 the ladder
  // was 1.00 / 0.96 / 0.82 because ELITE was rare. E3 widens the
  // distribution and now most active rows qualify for ELITE/STRONG,
  // so saturated borders were reading as global noise rather than
  // hierarchy. Spread out the alphas (0.72 / 0.55 / 0.38) so the
  // step between tiers is preserved but no row burns the eye.
  const tierBorderColor =
    isElite          ? `rgba(${dirRgb},0.72)` :
    isStrong         ? `rgba(${dirRgb},0.55)` :
    isActiveBaseline ? `rgba(${dirRgb},0.38)` :
                       T.BORDER;
  // Pass 7M — FINALIZATION. Stripping the cinematic vocabulary
  // (saturated full-card washes, 80px halos, translateY lift,
  // engraved double-rings, dirColor borders). Replaced with a
  // clean Bloomberg-style row: neutral elevated dark plate,
  // conviction read via BORDER WEIGHT + LEFT-RAIL THICKNESS only.
  // Hierarchy is functional, not decorative. Goal: scannable
  // density, not theatrical depth.
  // Pass 7R — active plate lifted #0C1410 → #131A15 for stronger
  // readable separation against the pure-black chassis. Neutral
  // luminance bump only; no additional green wash, no glow change.
  // Pass 7T — small additional luminance step #131A15 → #181F1A
  // per user "slightly stronger readable contrast, NOT more glow,
  // NOT more green". +~5 LUM, hue unchanged.
  const tierBackground = isActive ? "#181F1A" : T.BG_TERMINAL;
  // Pass 7O — active rows lift more decisively against pure-black
  // chassis. Top-edge highlight pushed 0.025 → 0.06 so the upper
  // pixel reads as a real bezel highlight; drop deepened so the
  // row casts a visible shadow on the chassis. No halos, no
  // dirColor washes — just stronger physical separation between
  // the elevated plate and the black workspace.
  const tierShadow = isActive
    ? `inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 0 rgba(0,0,0,0.7), 0 6px 12px rgba(0,0,0,0.45)`
    : undefined;
  const liftTransform = undefined;
  const liftZ = isElite ? 2 : isStrong ? 1 : 0;

  // Pass 7b — outcome memory. When this symbol has a paper close within
  // the last 5 minutes, surface the outcome inline on the card so the
  // operator subconsciously reads the AI's most recent track record on
  // each name without leaving the matrix. Connects signal → exit at
  // the card level; institutional restraint (tiny chip, semantic color
  // only, no animation).
  const { history: paperHistory } = usePaperTrades();
  const lastExit = useMemo(() => {
    const cutoff = now - 300_000;  // 5min memory window
    return paperHistory.find(h => h.symbol === opp.symbol && h.closedAt >= cutoff);
  }, [paperHistory, opp.symbol, now]);

  return (
    <article
      style={{
        background: tierBackground,
        border: `1px solid ${tierBorderColor}`,
        boxShadow: tierShadow,
        // Pass 7h — physical elevation. translateY only, no scale,
        // so the grid stays pixel-perfect. zIndex lets hero halos
        // overlap neighbors instead of being clipped under them.
        transform: liftTransform,
        zIndex: liftZ,
        boxSizing: "border-box",
        // Pass 7M — finalization. Tightened to a scannable
        // Bloomberg-style row. Padding 12/22/14 → 8/16/10,
        // height 172 → 124. Density beats theatre for a 20-row
        // matrix; more rows fit in one viewport, eye sweeps faster.
        padding: 8,
        paddingLeft: 16,
        paddingRight: 10,
        display: "flex", flexDirection: "row", gap: 0,
        position: "relative", overflow: "hidden",
        height: 124,
        fontFamily: T.FONT_MONO,
        // Pass 7a — age decay. ageOpacity collapses FRESH→SETTLING→
        // AGING→EXPIRED into a single multiplier so the ring, sparkline,
        // telemetry, action all fade together. 600ms transition.
        // Launch-finalization — ageOpacity moved OFF the article and
        // ONTO an inner content wrapper below so it no longer multiplies
        // down through the absolutely-positioned directional rail. The
        // rail must stay full-saturation across every age tier.
        // Deterministic hover cadence — background + border tinted in lock-step.
        transition: `background-color ${T.TX_FAST}, border-color ${T.TX_FAST}, opacity 600ms ease, box-shadow ${T.TX_MED}, transform ${T.TX_MED}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.BORDER_GRN;
      }}
      onMouseLeave={(e) => {
        // Restore the conviction-tier border on leave so hover never
        // resets ELITE / STRONG rows back to the neutral border.
        e.currentTarget.style.borderColor = tierBorderColor;
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          // Pass 7h/7i — rail width tiered with active dominance.
          // ELITE 7, STRONG 6, ACTIVE 5, EVALUATING 3. The rail is
          // the strongest single visual cue that a row is alive;
          // 7i widens STRONG and ACTIVE so the entire active stack
          // carries a recognizable directional bar — not just the
          // hero.
          width: isActive ? 6 : 3,
          background: railColor,
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
      {/* Launch-finalization — age-decay wrapper. Holds LEFT + RIGHT so
          ageOpacity dims ring/sparkline/telemetry/actions WITHOUT
          dimming the absolute-positioned directional rail above.
          LOW-CONFIDENCE FILTER — when the engine flags this signal as
          NOT executionEligible the card stays visible (signal/intel
          surface) but reads INFORMATIONAL: −38% opacity multiplier
          stacked on top of the age decay so a muted card is
          unmistakably distinct from a fresh one. Action buttons are
          disabled below so opacity is purely a perceptual cue here. */}
      <div style={{
        flex: 1, minWidth: 0,
        display: "flex", flexDirection: "row",
        opacity: ageOpacity * (opp.executionEligible ? 1 : 0.62),
        transition: "opacity 600ms ease",
      }}>
      {/* LEFT ANCHOR — symbol · ring · direction pill.
          Pass 7M — reset to clean institutional sizing. No text-
          shadow theatre on the symbol, no oversized conf headline,
          no heavy direction pill. The conviction number is just a
          number; the row chemistry comes from the data, not glow. */}
      <div style={{
        width: 90, flexShrink: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "space-between",
        gap: 4,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 700, color: T.TEXT_0,
          letterSpacing: "-0.01em",
        }}>
          {opp.symbol}
        </span>
        <div style={{ position: "relative", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ConfidenceRing color={confColor} value={conv} size={72} />
          {isReady && (
            <svg aria-hidden width={72} height={72} style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              animation: "ring-sweep 12s linear infinite",
              animationDelay: `-${sweepDelayMs}ms`,
              transformOrigin: "50% 50%",
            }}>
              <circle cx={36} cy={36} r={31} fill="none"
                stroke={confColor} strokeWidth={2}
                strokeDasharray="18 178" strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 3px ${confColor})`, opacity: 0.75 }} />
            </svg>
          )}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 0, lineHeight: 1,
          }}>
            <span style={{
              // Hierarchy by weight + color. HIGH/ELITE conviction
              // get the bigger headline. The displayed number is the
              // calibrated CONVICTION score, not raw engine conf —
              // see opp.convictionBreakdown for the per-factor "why".
              fontSize: conv >= 70 ? 24 : 22,
              fontWeight: conv >= 70 ? 800 : 700,
              color: confColor, letterSpacing: T.TRACK_DISPLAY,
              fontVariantNumeric: "tabular-nums",
            }}>{conv}</span>
            <span
              title={(() => {
                // Why this score? — per-factor breakdown lifted from
                // opp.convictionBreakdown. Renders as a native browser
                // tooltip (no extra layout footprint inside a 124px
                // card row). Every line is real engine telemetry; no
                // hardcoded numbers reach this display in production.
                //
                // DISPLAY vs EXECUTION confidence — the engine maintains
                // two numbers for every signal. `displayConfidence` (= opp.conf)
                // is the context-enriched render value (raw + MTF bonus +
                // volume bonus). `avgConfidence` (= opp.execConfidence) is
                // the untouched MTF mean and is the ONLY number the live-
                // execution gate compares against your minConfidence setting.
                // When they diverge the tooltip surfaces the delta so a
                // 87% card never silently means "executable at 87%".
                const b = opp.convictionBreakdown;
                const row = (f: { label: string; value: number; weight: number; contribution: number; verdict: string }) =>
                  `${f.label.padEnd(28)} ${String(f.value).padStart(3)}/100  · ${f.verdict.padEnd(8)} · +${f.contribution.toFixed(1)} pts`;
                const execLine =
                  opp.execConfidence === opp.conf
                    ? `(engine confidence: ${opp.conf} — display & execution match)`
                    : `(display confidence: ${opp.conf} · execution confidence: ${opp.execConfidence})\n` +
                      `Live-execution gate compares your minConfidence against ${opp.execConfidence}, not ${opp.conf}.`;
                return [
                  `${tier} CONVICTION · ${conv}/100`,
                  execLine,
                  ``,
                  `Why this score?`,
                  row(b.raw),
                  row(b.rank),
                  row(b.mtf),
                  row(b.trend),
                  row(b.liquidity),
                  row(b.regime),
                  row(b.rr),
                ].join("\n");
              })()}
              style={{
                fontSize: 8, fontWeight: 700, color: confColor,
                letterSpacing: T.TRACK_LABEL, textTransform: "uppercase",
                cursor: "help",
              }}
            >{tier}</span>
            {/* DISPLAY↔EXEC delta badge — only renders when the
                context-enriched display value materially overstates the
                number the live-execution gate actually compares. ≥3-pt
                delta is the visibility threshold (smaller deltas would
                add noise without changing user decisions). The badge
                sits BELOW the conviction ring so it cannot be confused
                with the score itself. */}
            {opp.execConfidence < opp.conf - 2 && (
              <span
                title={
                  `Live-execution gate evaluates this signal at ${opp.execConfidence}% (avgConfidence), ` +
                  `not the displayed ${opp.conf}%. Display includes MTF + volume bonuses that the ` +
                  `execution path intentionally ignores. If your minConfidence is between ${opp.execConfidence + 1} ` +
                  `and ${opp.conf}, this signal will NOT execute.`
                }
                style={{
                  marginTop: 2,
                  fontSize: 7, fontWeight: 700,
                  color: T.TEXT_2,
                  letterSpacing: T.TRACK_LABEL, textTransform: "uppercase",
                  cursor: "help",
                  opacity: 0.85,
                }}
              >EXEC {opp.execConfidence}%</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{
            fontSize: 9, padding: "2px 8px",
            border: `1px solid ${dirBorder}`,
            background: dirBg,
            color: dirColor, fontWeight: 700, letterSpacing: "0.10em",
            borderRadius: 2,
          }}>{opp.direction}</span>
          {lastExit && (
            <span
              title={`Last paper exit on ${shortPair(opp.symbol)}: ${lastExit.reason} · ${nz(lastExit.pnlPct) >= 0 ? "+" : ""}${nz(lastExit.pnlPct).toFixed(2)}%`}
              style={{
                fontSize: 8, fontWeight: 600,
                color: lastExit.pnl >= 0 ? T.NEON : T.RED,
                letterSpacing: "0.06em",
                fontVariantNumeric: "tabular-nums",
                opacity: 0.82,
                whiteSpace: "nowrap",
              }}
            >
              ↪ {nz(lastExit.pnl) >= 0 ? "+" : "−"}{Math.abs(nz(lastExit.pnlPct)).toFixed(2)}% {lastExit.reason}
            </span>
          )}
        </div>
      </div>

      {/* RIGHT MAIN — telemetry meta · chart rail · action strip.
          Pass 7M — finalization. Stripped all glow/halo/box-shadow
          decoration on MTF dots, momentum bars, score badge, and
          ageStr. Cleaner labels, neutral chart rail. */}
      <div style={{
        flex: 1, minWidth: 0,
        display: "flex", flexDirection: "column",
        gap: 4, paddingLeft: 12,
      }}>
        {/* Top meta — REGIME · VOL · MTF dots · momentum · age/latency · score */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, color: T.TEXT_1, lineHeight: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.TEXT_1, letterSpacing: T.TRACK_LABEL, textTransform: "uppercase", whiteSpace: "nowrap" }}>
              {opp.regime} <span style={{ opacity: 0.45, color: T.TEXT_3 }}>·</span> <span style={{ color: T.TEXT_2, fontWeight: 500 }}>{opp.vol}</span>
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
              whiteSpace: "nowrap", color: T.TEXT_2,
              animation: isLiveTick ? "telemetry-flicker 1.6s ease-in-out infinite" : undefined,
              animationDelay: isLiveTick ? `-${flickerDelayMs}ms` : undefined,
            }}>
            <span style={{ color: T.TEXT_1, fontWeight: 600 }}>{ageStr}</span>
            <span style={{ opacity: 0.45, margin: "0 4px" }}>·</span>
            {opp.latency}
            <span style={{ opacity: 0.45, margin: "0 6px" }}>·</span>
            <span style={{ background: "rgba(255,255,255,0.08)", color: T.TEXT_0, padding: "1px 6px", borderRadius: 2, fontWeight: 700 }}>{opp.score}</span>
          </span>
        </div>

        {/* CHART RAIL — neutral plate. No dirColor borders, no
            color wash. The sparkline already carries direction via
            its own color; the container should be quiet. */}
        <div style={{
          position: "relative", width: "100%", height: 56,
          background: "linear-gradient(180deg, rgba(255,255,255,0.022) 0%, rgba(0,0,0,0) 65%, rgba(255,255,255,0.014) 100%)",
          borderTop:    `1px solid ${T.BORDER}`,
          borderBottom: `1px solid ${T.BORDER}`,
          overflow: "hidden",
        }}>
          <Sparkline
            data={opp.sparkline}
            color={sparkColor}
            height={70}
            live={isFreshSignal}
            seedDelayMs={sparkDelayMs}
            intensity={isElite ? "elite" : isStrong ? "strong" : isActiveBaseline ? "strong" : "baseline"}
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

        {/* Inline action strip — prices · readiness · reasoning · QUEUE.
            Pass 7M — keeps the 7L readability wins (11px font, weight
            700 prices, de-italicized reasoning) but drops every
            decorative text-shadow / halo. Clean institutional row. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 11, color: T.TEXT_1,
          fontVariantNumeric: "tabular-nums", lineHeight: 1, minWidth: 0,
        }}>
          <span style={{ whiteSpace: "nowrap" }}>
            <span style={{ color: T.TEXT_3, marginRight: 3 }}>E</span>
            <span style={{ color: T.TEXT_0, fontWeight: 700 }}>{fmtPrice(opp.entry)}</span>
          </span>
          <span
            title={`Stop ${fmtPrice(opp.stop)} (${pctDelta(opp.entry, opp.stop)} from entry)`}
            style={{ whiteSpace: "nowrap", cursor: "help" }}
          >
            <span style={{ color: T.TEXT_3, marginRight: 3 }}>S</span>
            <span style={{ color: T.RED, fontWeight: 700 }}>{fmtPrice(opp.stop)}</span>
          </span>
          <span
            title={`Target ${fmtPrice(opp.target)} (${pctDelta(opp.entry, opp.target)} from entry)`}
            style={{ whiteSpace: "nowrap", cursor: "help" }}
          >
            <span style={{ color: T.TEXT_3, marginRight: 3 }}>T</span>
            <span style={{ color: T.NEON, fontWeight: 700 }}>{fmtPrice(opp.target)}</span>
          </span>
          <span style={{ whiteSpace: "nowrap" }}>
            <span style={{ color: T.TEXT_3, marginRight: 3 }}>R:R</span>
            <span style={{ color: dirColor, fontWeight: 700 }}>{rr}</span>
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
            color: opp.readiness === "READY" ? T.NEON : opp.readiness === "WAITING" ? T.AMBER : T.TEXT_2,
            display: "inline-flex", alignItems: "center", gap: 3,
            letterSpacing: T.TRACK_LABEL,
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
              fontSize: 11, fontWeight: 400,
              color: gatedReason ? T.AMBER : T.TEXT_1,
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
            }}>
            {gatedReason ? `⛔ ${gatedReason}` : opp.reasoning}
          </span>
          {/* Pass 7U — every row exposes BOTH BUY + SELL consistently.
              Users paper-trade manually alongside AI guidance, so the
              action surface is no longer gated by AI direction or
              readiness. Each button routes a paper trade in the
              chosen side; stops/targets mirror around entry when the
              user opts opposite the AI lean. */}
          {/* LOW-CONFIDENCE FILTER — conditional badge on the inline
              action strip. Renders ONLY when the engine has flagged
              this signal as NOT executionEligible. The cards stay
              visible (informational signal surface) but their action
              buttons are disabled below so a customer can never route
              a sub-threshold order from a muted card. No redesign —
              just a single pill that sits in the existing button slot. */}
          {!opp.executionEligible && (
            <span
              title={
                opp.executionBlockReason === "hold_bias"        ? "AI bias is HOLD — execution disabled"        :
                opp.executionBlockReason === "no_mtf_agreement" ? "Multi-timeframe disagreement — execution disabled" :
                opp.executionBlockReason === "sideways"         ? "Market sideways — execution disabled"        :
                "Confidence below threshold — execution disabled"
              }
              style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
                fontFamily: T.FONT_MONO,
                color: T.AMBER,
                border: `1px solid ${T.AMBER}`,
                background: "rgba(255,176,32,0.08)",
                padding: "3px 7px",
                borderRadius: 2,
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >LOW CONFIDENCE</span>
          )}
          {(() => {
            const eligible = opp.executionEligible;
            const ActionBtn = ({ side, label, color, rgb }: { side: "LONG" | "SHORT"; label: string; color: string; rgb: string }) => (
              <button
                onClick={() => { if (eligible) onQueue(opp, side); }}
                disabled={!eligible}
                title={
                  eligible
                    ? `Paper ${label} ${opp.symbol} @ ${fmtPrice(opp.entry)}`
                    : "Signal below execution threshold — informational only"
                }
                style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: 800,
                  fontFamily: T.FONT_MONO, letterSpacing: "0.10em",
                  border: `1px solid ${eligible ? color : T.BORDER}`,
                  background: eligible ? `rgba(${rgb},0.10)` : "transparent",
                  color: eligible ? color : T.TEXT_2,
                  cursor: eligible ? "pointer" : "not-allowed",
                  transition: "background-color 120ms ease, color 120ms ease",
                  flexShrink: 0,
                  borderRadius: 2,
                  minWidth: 52,
                  opacity: eligible ? 1 : 0.55,
                }}
                onMouseEnter={(e) => { if (eligible) { e.currentTarget.style.background = color; e.currentTarget.style.color = "#000"; } }}
                onMouseLeave={(e) => { if (eligible) { e.currentTarget.style.background = `rgba(${rgb},0.10)`; e.currentTarget.style.color = color; } }}
              >{label}</button>
            );
            return (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <ActionBtn side="LONG"  label="BUY"  color={T.NEON} rgb="102,255,102" />
                <ActionBtn side="SHORT" label="SELL" color={T.RED}  rgb="255,77,77"   />
              </div>
            );
          })()}
        </div>
      </div>
      </div>{/* /age-decay wrapper */}

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
  // Pass 7d — hero conviction. ELITE (>=90) ring blooms past STRONG so
  // the eye locks onto it; STRONG sits clearly above the median. Lower
  // tiers preserved so the discipline gradient stays intact (low conf
  // must still look quiet — no fake conviction).
  // Pass 7f — baseline ring readability. Sub-80 rings were sinking
  // into the chassis even though they still carry real conviction
  // information (60-79 amber band).
  // Pass 7g — ACTIVE band amplification. Lifted ELITE 34→40, STRONG
  // 24→30, 70-tier 18→24 so active rings physically project off the
  // card surface. Halo bumped in lockstep. 55-tier and base preserved
  // (those are mostly evaluating cards which sit inside the dimmer
  // wrapper anyway).
  // Pass E3-polish — ConfidenceRing bloom stabilization. Pre-E3 the
  // ring glow stack went up to 40px outer + 20px inner (line ~1898
  // doubled it), reading as a halo explosion now that more rings
  // sit above 70/85. Collapsed to a thin edge-illumination ladder:
  // ELITE still loudest, baseline still readable, no card emits a
  // bloom larger than its own footprint. Stroke widths preserved
  // (geometry not glow).
  const glowPx =
    value >= 90 ? 14 :
    value >= 85 ? 11 :
    value >= 70 ? 9 :
    value >= 55 ? 6 : 4;
  const ringStroke =
    value >= 90 ? 5.5 :
    value >= 85 ? 4.6 :
    value >= 70 ? 4.2 : 3.4;
  const haloOpacity =
    value >= 90 ? 0.45 :
    value >= 85 ? 0.32 :
    value >= 70 ? 0.24 :
    value >= 55 ? 0.16 : 0.10;
  // 12-tick dial. Each tick is a short radial mark; ticks beneath the
  // progress arc are tinted with the color, ticks beyond stay neutral.
  const ticks = Array.from({ length: 12 }, (_, i) => i);
  const tickBoundary = pct * 12;
  return (
    <svg width={SIZE} height={SIZE} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {/* Outer volumetric halo — always rendered, opacity tiered by conf.
          Pass E3-polish: drop-shadow stack 7px+13px → 3px+6px so the
          halo reads as thin edge illumination instead of an outward
          bloom that bleeds past the card border. */}
      <circle
        cx={CX} cy={CX} r={r + 4} fill="none"
        stroke={color} strokeWidth={1}
        style={{ filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`, opacity: haloOpacity }}
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
      {/* Soft underlay progress — thin blurred glow band.
          Pass E3-polish: blur(3px)/0.35 → blur(2px)/0.20 so the
          underlay no longer doubles the apparent ring thickness. */}
      <circle
        cx={CX} cy={CX} r={r} fill="none"
        stroke={color} strokeWidth={ringStroke + 3}
        strokeDasharray={`${c * pct} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CX})`}
        opacity={0.20}
        style={{ filter: `blur(2px)`, transition: "stroke-dasharray 600ms ease" }}
      />
      {/* Crisp inner progress — primary conviction arc.
          Pass E3-polish: double drop-shadow (glowPx + glowPx/2)
          collapsed to a single edge drop-shadow. Pre-E3 this stack
          was multiplying the bloom for every card; one layer keeps
          the ring "lit" without the volumetric halo. */}
      <circle
        cx={CX} cy={CX} r={r} fill="none"
        stroke={color} strokeWidth={ringStroke}
        strokeDasharray={`${c * pct} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CX})`}
        style={{
          filter: `drop-shadow(0 0 ${glowPx}px ${color})`,
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
      case "HIGH_CONF": return o.convictionScore >= 70;
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
  // Pass 7j — MAJORS/ALTS column headers carry their own authority.
  //   • count badge is now accent-tinted (was neutral white-tint) so
  //     it reads as a status pill that belongs to the column
  //   • bottom border gets a faint accent gradient underline so the
  //     column header connects visually to the matrix below it
  //   • title gains a subtle drop-shadow for crispness on the deeper
  //     gradient background
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      borderBottom: `1px solid ${T.BORDER}`, paddingBottom: 8,
      position: "relative",
      backgroundImage: `linear-gradient(180deg, transparent 0%, transparent calc(100% - 1px), ${accent} 100%)`,
      backgroundSize: "30% 1px",
      backgroundPosition: "left bottom",
      backgroundRepeat: "no-repeat",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{
          margin: 0, fontFamily: T.FONT_MONO, fontSize: 14, color: T.TEXT_0,
          display: "inline-flex", alignItems: "center", gap: 8,
          textShadow: `0 0 6px rgba(0,0,0,0.24)`,
        }}>
          <Radar size={14} color={accent} /> {title}
          <span style={{
            background: `rgba(${accent === T.NEON ? "102,255,102" : "255,77,77"},0.16)`,
            color: accent,
            border: `1px solid rgba(${accent === T.NEON ? "102,255,102" : "255,77,77"},0.42)`,
            fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 2,
            letterSpacing: T.TRACK_LABEL,
            fontVariantNumeric: "tabular-nums",
            textShadow: `0 0 6px ${accent}`,
          }}>{count}</span>
        </h2>
        <span style={{ fontSize: 10, color: T.TEXT_2, fontFamily: T.FONT_MONO, letterSpacing: T.TRACK_LABEL }}>SORT: CONFIDENCE ↓</span>
      </div>
      <span style={{
        fontFamily: T.FONT_MONO, fontSize: 9, letterSpacing: T.TRACK_TITLE,
        color: accent, opacity: 0.70,
      }}>
        {subLabel}
      </span>
    </div>
  );
}

const OpportunityMatrix = memo(function OpportunityMatrix({
  majors, alts,
  onQueue, isLoading, isError, now,
  idleSymbols, lastTickAt,
}: {
  majors:    OpportunityVM[];
  alts:      OpportunityVM[];
  onQueue:   (opp: OpportunityVM, side: "LONG" | "SHORT") => void;
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
  // CONVICTION_V2 (2026-05-26): partition by ASSET CLASS (Majors / Alts)
  // instead of DIRECTION (Longs / Shorts). The L/S split forced a
  // balanced-inventory framing — "here are the longs AND the shorts" —
  // which diluted conviction and surfaced weak filler to keep both
  // columns populated. Asset-class split restores the original
  // "Top Signals" feel: curated, emotionally energetic, AI-discovered
  // setups. Direction is preserved as an inline LONG/SHORT/FLAT badge
  // on each OpportunityCard (rendered around line ~1665), so polarity
  // is per-row, not per-column. Both columns share the same neon accent
  // so the dashboard reads as "the AI's best ideas" rather than
  // "market polarity dashboard".
  return (
    <section className="cd-matrix" style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(520px, 1fr))",
      gap: 20, position: "relative",
    }}>
      <Column
        title="MAJORS"
        opps={majors}
        onQueue={onQueue}
        isLoading={isLoading}
        isError={isError}
        accent="#66FF66"
        subLabel={`${majors.length} HIGH-CAP · CONVICTION-RANKED`}
        tintRgba="rgba(102,255,102,0.025)"
        now={now}
        idleSymbols={idleSymbols}
        lastTickAt={lastTickAt}
        idleLabel="MAJOR"
      />
      <Column
        title="ALTS"
        opps={alts}
        onQueue={onQueue}
        isLoading={isLoading}
        isError={isError}
        accent="#7CFF00"
        subLabel={`${alts.length} OPPORTUNISTIC · CONVICTION-RANKED`}
        tintRgba="rgba(124,255,0,0.025)"
        leftDivider
        now={now}
        idleSymbols={idleSymbols}
        lastTickAt={lastTickAt}
        idleLabel="ALT"
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
        AI SURVEILLING · AWAITING HIGH-CONVICTION {label} SETUPS
      </div>

      <div style={{
        marginTop: 14,
        fontSize: 11, color: T.TEXT_1, letterSpacing: T.TRACK_LABEL,
        fontWeight: 600,
      }}>
        NO QUALIFIED SETUPS MEET EXECUTION THRESHOLD
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
        fontSize: 9, color: T.TEXT_2, opacity: 0.55,
        letterSpacing: T.TRACK_LABEL,
        fontStyle: "italic",
      }}>
        MONITORING LIVE MARKETS FOR INSTITUTIONAL-GRADE ENTRIES
      </div>
    </div>
  );
});

const Column = memo(function Column({
  title, opps, onQueue, isLoading, isError,
  accent, subLabel, tintRgba, leftDivider = false, now,
  idleSymbols, lastTickAt, idleLabel,
}: {
  title: string; opps: OpportunityVM[]; onQueue: (opp: OpportunityVM, side: "LONG" | "SHORT") => void;
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
      // Pass 7O — tintRgba gradient REMOVED. The faint green/red
      // column wash was creating the "muddy bronze haze" users
      // reported. Columns now sit directly on the BG_BLACK chassis
      // so the #0C1410 active card plates pop against pure black
      // without any subtle workspace tint smearing the contrast.
      borderLeft: leftDivider ? `1px solid rgba(255,255,255,0.04)` : undefined,
    }}>
      <span
        aria-hidden
        style={{
          position: "absolute", left: leftDivider ? 1 : 0, top: 0, bottom: 0,
          width: 1, background: accent,
          // 7O — accent rail glow toned (was 0 0 6px + 0 0 2px). Single
          // 2px glow at lower opacity keeps the column identity hint
          // without contributing to the chassis haze.
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
          // Pass 7O — FIXED height container. User explicitly:
          // "the matrix itself should scroll internally — not
          // expand infinitely." 7N's calc(100vh-…) made the column
          // expand to fill, which pushed the lower dashboard below
          // the fold and made the page feel never-ending.
          //
          // 1320px ≈ 10 rows visible at 132px-per-row pitch. The
          // virtualizer still mounts all 20 active + 8 eval rows;
          // operator scrolls inside this container to see the
          // remaining rank. This is the institutional matrix
          // pattern (Bloomberg, TradeStation, ThinkOrSwim).
          //
          // Pass 7T — ADAPTIVE height. The previous fixed 1320 left a
          // large dead black gap below the matrix when a filter or
          // category yielded only a few rows (MEME / Hi-Vol / search
          // narrowing). Now the container collapses to fit the rendered
          // row count (132px pitch) and stays capped at 1320 so >10
          // rows still scroll internally. Empty state preserves room
          // for the IdleScanningPanel via the 280 floor. Lower sections
          // (ACCOUNT STATUS / LIVE TRADES / HISTORY) rise upward
          // naturally.
          height: showList
            ? Math.min(opps.length, 10) * 132
            : 280,
          maxHeight: 1320,
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

        {/* Pass 7P — EVALUATING tier render block DELETED. All
            FLAT-leaning candidates now flow directly into `opps`
            from PortalCustomerShell's unified asset-class-partitioned
            derivation (CONVICTION_V2: filteredMajors / filteredAlts).
            Removed: dim/desaturate wrapper, EVAL header, pointer-events
            gate. ~70 lines of two-tier visual hierarchy collapsed
            into one. */}
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
  // Pass 4.9 → Pass 7j — bezel depth carried into the dimensional
  // vocabulary established by the matrix (7h/7i). Layered effects:
  //   • body gradient deepened to match matrix terminal darkness
  //   • LIVE panels get an engraved neon hairline (border + outer
  //     1px ring) and a real drop-shadow so they project above the
  //     workspace — matching the active-row treatment one level up
  //   • static panels get a deeper drop-shadow than before so the
  //     entire panel grid reads as physically seated, not flat
  //   • title bar: live panels get a stronger neon underline (0.05
  //     → 0.22) so the panel header carries its own authority
  const style: CSSProperties = {
    background: live
      ? `linear-gradient(180deg, #0E1A15 0%, ${T.BG_TERMINAL} 50%, #050C09 100%)`
      : `linear-gradient(180deg, #0B1612 0%, ${T.BG_TERMINAL} 55%, #050C09 100%)`,
    border: live
      ? `1px solid rgba(102,255,102,0.28)`
      : `1px solid ${T.BORDER}`,
    display: "flex", flexDirection: "column",
    height,
    fontFamily: T.FONT_MONO,
    gridColumn: span > 1 ? `span ${span}` : undefined,
    boxShadow: live
      ? `0 0 0 1px rgba(102,255,102,0.12), inset 0 1px 0 rgba(102,255,102,0.18), inset 0 -1px 0 rgba(0,0,0,0.55), 0 6px 20px rgba(0,0,0,0.60), 0 0 36px rgba(102,255,102,0.10), inset 0 0 38px rgba(102,255,102,0.05)`
      : `inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.55), 0 4px 14px rgba(0,0,0,0.55), 0 1px 0 rgba(0,0,0,0.65)`,
    animation: live ? "panel-breathe 9s ease-in-out infinite" : undefined,
    position: "relative",
  };
  return (
    <div style={style}>
      <div style={{
        // Pass 7k — title bar pushed to real authority. Padding 10
        // → 12, title fontSize 11 → 13 / weight 600, live dot 6 →
        // 9, live underline 0.22 → 0.40. The header now reads as a
        // proper bezel cap, not a faint label strip.
        padding: "12px 14px",
        borderBottom: `1px solid ${live ? "rgba(102,255,102,0.32)" : T.BORDER}`,
        background: `linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.38) 100%)`,
        boxShadow: live
          ? `inset 0 -1px 0 rgba(102,255,102,0.40)`
          : `inset 0 -1px 0 rgba(102,255,102,0.08)`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 600, color: T.TEXT_0,
          letterSpacing: T.TRACK_LABEL,
          textShadow: live
            ? `0 0 10px rgba(102,255,102,0.42), 0 0 4px rgba(102,255,102,0.30)`
            : `0 0 4px rgba(0,0,0,0.6)`,
        }}>{title}</h3>
        {live && <span style={{
          width: 9, height: 9, borderRadius: "50%",
          background: T.NEON,
          boxShadow: `0 0 10px ${T.NEON}, 0 0 18px ${T.NEON_GLOW}, 0 0 28px rgba(102,255,102,0.18)`,
          animation: "brand-pulse 1.4s infinite",
        }} />}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

type ReasoningEntry = { id: string; symbol: string; timeframe: string; decision: string; confidence: number; shortSummary?: string; timestamp: number; executionEligible?: boolean };
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
              {/* Pass C4 — truth-mismatch fix. AIReasoningConsole was
                  showing raw engine confidence while the cards
                  above show calibrated convictionScore, producing
                  "card 70 / log 26" mismatches. Calibrate inline so
                  the customer reads a coherent number. This is a
                  display-only calibration (no rank/MTF context) so
                  it won't exactly match a card's full conviction
                  score, but it lands in the same band. */}
              <span style={{ color: T.TEXT_1, flex: 1 }}>{e.shortSummary ?? `${d} @ ${e.timeframe} · conf ${calibrateRawConfidence(nz(e.confidence)).toFixed(0)}%`}</span>
              {/* LOW-CONFIDENCE FILTER — terminal-feed disambiguation.
                  Engine emits BOTH informational and executable signals
                  into the same log; the operator + customer must read at
                  a glance whether a line represents an actionable order
                  candidate or pure intelligence noise. Default `true`
                  preserves backward-compat when an older engine has not
                  yet shipped the field. */}
              {e.executionEligible === false && (
                <span style={{
                  color: T.AMBER, flexShrink: 0,
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
                  border: `1px solid ${T.AMBER}`,
                  padding: "1px 5px", borderRadius: 2,
                }} title="Signal below execution threshold — INFORMATIONAL only">INFO</span>
              )}
              {e.executionEligible !== false && (
                <span style={{
                  color: T.NEON, flexShrink: 0,
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
                  border: `1px solid ${T.NEON}`,
                  padding: "1px 5px", borderRadius: 2,
                }} title="Signal eligible for live execution">EXEC</span>
              )}
              <span style={{ color: dColor, flexShrink: 0 }}>{delta}{calibrateRawConfidence(nz(e.confidence)).toFixed(0)}%</span>
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

  // Pass 7V — auto-collapse LIVE TRADES when no positions are open.
  // Duplicate Paper Equity header removed (already dominant in
  // ACCOUNT STATUS above). Empty state collapses the panel to a
  // single-line placeholder so the page reflows upward instead of
  // showing a 480px void.
  const hasActivity = open.length > 0 || exitFresh;
  if (!hasActivity) {
    return (
      <PanelCard title="LIVE TRADES" height={72} live>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", padding: "0 16px",
          fontFamily: T.FONT_MONO, fontSize: 11, color: T.TEXT_2, letterSpacing: "0.06em",
        }}>
          No active paper trades.
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard title="LIVE TRADES" height={480} live>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Pass 7Y — equity-curve sparkline removed from LIVE TRADES.
            The flat/falling line was reading as a stray "red line
            artifact" rather than meaningful telemetry. Equity is
            already dominant in ACCOUNT STATUS above. LIVE TRADES
            now shows only the actual open paper-trade rows + the
            most recent exit acknowledgment. `gradId`, `curveColor`,
            `curveStroke`, `curveFill`, `curveDelta`, `equityBufRef`
            and `buildEquityPath` are intentionally still computed
            (referenced by PortfolioIntelligence later); their
            unused-by-LiveTrades return values are tolerated. */}
        {void gradId}
        {void curveColor}
        {void curveStroke}
        {void curveFill}

        {/* Position lifecycle rows — ENTRY phase glows for first 10s,
            then settles into ACTIVE. TP/SL distance + position age make
            commitment and risk legible. Pass 7O — slice(0,3) removed
            + cd-scroll added so the LIVE TRADES panel surfaces every
            open paper position via internal scroll (fixed panel
            height = 360, equity curve + header take ~120, leaves
            ~220px for position rows). */}
        <div className="cd-scroll" style={{
          display: "flex", flexDirection: "column", gap: 5,
          marginTop: "auto", overflowY: "auto", maxHeight: 220,
          paddingRight: 4,
        }}>
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
                  {nz(lastClose.pnl) >= 0 ? "+" : "−"}${Math.abs(nz(lastClose.pnl)).toFixed(2)}
                </span>
              </div>
            </div>
          )}
          {open.map(p => {
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
                    {nz(p.pnl) >= 0 ? "+" : "−"}${Math.abs(nz(p.pnl)).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.TEXT_3, letterSpacing: "0.06em" }}>
                  <span>TP {nz(toTargetPct) >= 0 ? "+" : ""}{nz(toTargetPct).toFixed(2)}% · SL {nz(toStopPct) >= 0 ? "+" : ""}{nz(toStopPct).toFixed(2)}%</span>
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

// Pass 7b — INSTITUTIONAL MEMORY. The platform now remembers its own
// consequences. After the 8s EXIT acknowledgment in PortfolioIntelligence
// fades, the closed trade persists here as a permanent ledger entry the
// operator can scan to read recent execution history. Restraint policy:
// monospace, no celebration, neutral row tint, semantic color only on
// the realized PnL number. The freshest exit (<6s) carries a subtle
// inset stroke that decays to nothing — consistent with the existing
// 7a/7 event-cadence vocabulary.
// Pass 7O — limit lifted 8 → 50 since TRADE HISTORY is now a
// dedicated fixed-height panel with internal scroll. Operator can
// scan deep into recent execution history without leaving the
// matrix view.
const RECENT_EXITS_LIMIT = 50;

function reasonGloss(r: "TP" | "SL" | "MANUAL"): string {
  return r === "TP" ? "TARGET HIT"
       : r === "SL" ? "STOP HIT"
       :              "MANUAL CLOSE";
}

function formatExitAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const RecentExits = memo(function RecentExits({ now }: { now: number }) {
  const { history } = usePaperTrades();
  const exits = useMemo(() => history.slice(0, RECENT_EXITS_LIMIT), [history]);

  // Pass 7V — auto-collapse TRADE HISTORY when no closed positions.
  // Page reflows upward instead of holding a 480px void below the
  // matrix while the operator is still in pre-trade setup.
  if (exits.length === 0) {
    return (
      <PanelCard title="TRADE HISTORY" height={72}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", padding: "0 16px",
          fontFamily: T.FONT_MONO, fontSize: 11, color: T.TEXT_2, letterSpacing: "0.06em",
        }}>
          No completed positions yet.
        </div>
      </PanelCard>
    );
  }

  return (
    <PanelCard title="TRADE HISTORY" height={480}>
      <div className="cd-scroll" style={{
        padding: 10, overflowY: "auto", flex: 1,
        display: "flex", flexDirection: "column", gap: 4,
        fontVariantNumeric: "tabular-nums",
      }}>
        {exits.map((h) => {
          const ageMs    = Math.max(0, now - h.closedAt);
          const isFresh  = ageMs < 6_000;
          const pnlColor = h.pnl >= 0 ? T.NEON : T.RED;
          const sideCol  = h.side === "LONG" ? T.NEON : T.RED;
          const reasonCol =
            h.reason === "TP" ? T.NEON :
            h.reason === "SL" ? T.RED  : T.TEXT_2;
          // Fresh-exit inset decays linearly over 6s — same cadence as
          // the EXIT row in PortfolioIntelligence so the two surfaces
          // visually hand off the moment between them.
          const freshOpacity = isFresh ? Math.max(0, 1 - ageMs / 6_000) : 0;
          return (
            <div key={h.id} style={{
              padding: "5px 8px",
              display: "flex", flexDirection: "column", gap: 2,
              border: `1px solid ${isFresh ? `rgba(102,255,102,${(freshOpacity * 0.40).toFixed(3)})` : "rgba(255,255,255,0.04)"}`,
              background: isFresh ? `rgba(102,255,102,${(freshOpacity * 0.05).toFixed(3)})` : "transparent",
              transition: "border-color 320ms ease, background-color 320ms ease",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: T.TEXT_1 }}>
                  <span style={{ color: sideCol }}>{h.side.charAt(0)}</span>
                  &nbsp;{shortPair(h.symbol)}
                  <span style={{ color: T.TEXT_3, marginLeft: 6, letterSpacing: "0.06em" }}>
                    {formatExitAge(ageMs)}
                  </span>
                </span>
                <span style={{ color: pnlColor }}>
                  {nz(h.pnl) >= 0 ? "+" : "−"}${Math.abs(nz(h.pnl)).toFixed(2)}
                  <span style={{ color: T.TEXT_3, marginLeft: 6 }}>
                    ({nz(h.pnl) >= 0 ? "+" : ""}{nz(h.pnlPct).toFixed(2)}%)
                  </span>
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.TEXT_3, letterSpacing: "0.06em" }}>
                <span>
                  <span style={{ color: reasonCol, letterSpacing: "0.10em" }}>{h.reason}</span>
                  <span style={{ color: T.TEXT_3, marginLeft: 6 }}>{reasonGloss(h.reason)}</span>
                </span>
                <span>
                  ENTRY ${nz(h.entry).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                  &nbsp;→&nbsp;
                  ${nz(h.exit).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </span>
              </div>
            </div>
          );
        })}
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
                {nz(s.count).toLocaleString()}
              </span>
              <span style={{ fontSize: 11, color: T.TEXT_2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.sample ? `${s.sample.symbol} · ${calibrateRawConfidence(s.sample.conf).toFixed(0)}%` : "—"}
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
          <span>FILLED <span style={{ color: T.TEXT_0 }}>{nz(fExecuted).toLocaleString()}</span></span>
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
              title={`${c.sym} · risk ${(nz(c.risk) * 100).toFixed(0)}%`}
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

// Pass 7S — AccountStatusStrip. Replaces AIThroughput (deleted) under
// the matrix. Customer-facing telemetry only: paper equity, realized
// + unrealized PNL, win %, wins/losses, open trades, active signals,
// queue depth, exec status, AI avg confidence ring. NO internal engine
// metrics (evals, MTF count, correlation blocks, loop interval). Same
// PanelCard chassis as LIVE TRADES + TRADE HISTORY so the lower
// section reads as one continuous trading surface, not a strip of
// admin widgets.
const AccountStatusStrip = memo(function AccountStatusStrip({
  pulse, activeSignals, engineOnline,
}: {
  pulse:         MarketPulse;
  activeSignals: number;
  engineOnline:  boolean;
}) {
  const { stats, history } = usePaperTrades();
  const equity        = stats.equity || STARTING_EQUITY;
  const realizedPnl   = stats.realizedPnl;
  const unrealizedPnl = stats.unrealizedPnl;
  const openCount     = stats.openCount;
  const closedCount   = stats.closedCount;
  const wins   = useMemo(() => history.reduce((n, h) => n + (h.pnl >  0 ? 1 : 0), 0), [history]);
  const losses = useMemo(() => history.reduce((n, h) => n + (h.pnl <= 0 ? 1 : 0), 0), [history]);
  const winPct = closedCount > 0 ? Math.round((wins / closedCount) * 100) : 0;
  // Pass 7Y — `queueDepth` no longer consumed here (QUEUE cell
  // removed from ACCOUNT STATUS). `pulse` retained as prop for
  // future hooks but the strip no longer renders queue telemetry.
  void pulse;
  // Pass 7U — EXECUTION cell removed entirely (was "IDLE / N% LIVE /
  // OFFLINE"). In paper mode the line was noise; engine health surfaces
  // in OperatorPulseRibbon already.
  // Pass 7W — confColor / pulse.avgConf consumption removed; ring
  // moved to GlobalAIConfidenceRing in the header.

  // Pass 7V — compact $XXXK / $X.XXM formatting per user spec.
  // "$100,000.00" → "$100K"; PNL "+$1,234.56" → "+$1.23K"; under $1K
  // keeps two decimals for legibility on small wins/losses.
  const fmtCompact = (n: number): string => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000)    return `$${Math.round(abs / 1_000)}K`;
    if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(2)}K`;
    return `$${abs.toFixed(2)}`;
  };
  const fmtMoney  = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${fmtCompact(n)}`;
  const fmtEquity = (n: number) => fmtCompact(n);

  // Pass 7U — stat cells upsized. Tier 1 cells (PAPER EQUITY, REALIZED
  // PNL, UNREALIZED PNL) render larger so account status reads first.
  // Tier 2 cells (WIN %, WINS/LOSSES, OPEN TRADES, ACTIVE SIGNALS,
  // QUEUE) stay readable but secondary. Same chassis + typography
  // family; only size + weight shift.
  const Cell = ({
    k, v, color = T.TEXT_0, size = 16,
  }: { k: string; v: string; color?: string; size?: number }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: T.TEXT_2, letterSpacing: T.TRACK_LABEL, whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ fontSize: size, color, fontVariantNumeric: "tabular-nums", fontWeight: 700, whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );

  return (
    <PanelCard title="ACCOUNT STATUS" live height={196}>
      <div style={{
        padding: "22px 26px",
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 28,
        fontFamily: T.FONT_MONO,
      }}>
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "20px 22px",
          alignItems: "center",
        }}>
          <Cell k="PAPER EQUITY"   size={34} v={fmtEquity(equity)} color={equity >= STARTING_EQUITY ? T.NEON : T.RED} />
          <Cell k="REALIZED PNL"   size={30} v={fmtMoney(realizedPnl)}   color={realizedPnl   >= 0 ? T.NEON : T.RED} />
          <Cell k="UNREALIZED PNL" size={30} v={fmtMoney(unrealizedPnl)} color={unrealizedPnl >= 0 ? T.NEON : T.RED} />
          <Cell k="WIN %"          size={24} v={closedCount > 0 ? `${winPct}%` : "—"} color={winPct >= 50 ? T.NEON : winPct > 0 ? T.AMBER : T.TEXT_2} />
          <Cell k="WINS / LOSSES"  size={24} v={`${wins} / ${losses}`} />
          <Cell k="OPEN TRADES"    size={24} v={openCount.toString()} color={openCount > 0 ? T.NEON : T.TEXT_2} />
          <Cell k="ACTIVE SIGNALS" size={24} v={activeSignals.toString()} color={activeSignals > 0 ? T.TEXT_0 : T.TEXT_2} />
          {/* Pass 7Y — QUEUE cell removed from ACCOUNT STATUS per
              launch spec. Queue depth still surfaces in
              OperatorPulseRibbon + pulse stream; ACCOUNT STATUS
              now reads as pure user paper-trading telemetry. */}
        </div>
        {/* Pass 7W — AI AVG CONF ring removed from ACCOUNT STATUS.
            Promoted to the global system-intelligence indicator in
            the header (GlobalAIConfidenceRing under the toolbar).
            ACCOUNT STATUS now focuses purely on user paper-trading
            telemetry (equity / PNL / wins / losses / open / signals
            / queue). `confColor` and `pulse.avgConf` no longer
            consumed here. */}
      </div>
    </PanelCard>
  );
});

/* ──────────────────────────────────────────────────────────────────────── */
/* GlobalAIConfidenceRing — Pass 7W                                         */
/* Promoted out of ACCOUNT STATUS into the page header. Communicates       */
/* the platform's aggregate AI conviction across all monitored crypto      */
/* opportunities — the system intelligence indicator for the entire        */
/* customer terminal. Larger + more prominent than its previous embedded   */
/* form so it reads as global state, not a per-panel stat.                  */
/* ──────────────────────────────────────────────────────────────────────── */
const GlobalAIConfidenceRing = memo(function GlobalAIConfidenceRing({ value }: { value: number }) {
  // Pass 7X — color logic refined per launch spec:
  //   0–49  = RED      (low platform conviction)
  //   50–79 = AMBER    (moderate)
  //   80+   = NEON     (high system confidence)
  const color = value >= 80 ? T.NEON : value >= 50 ? T.AMBER : T.RED;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "10px 16px",
      border: `1px solid ${value >= 80 ? "rgba(102,255,102,0.32)" : value >= 50 ? "rgba(255,176,32,0.32)" : "rgba(255,64,64,0.32)"}`,
      background: `linear-gradient(180deg, #0E1A15 0%, ${T.BG_TERMINAL} 100%)`,
      boxShadow: `0 0 0 1px rgba(${value >= 80 ? "102,255,102" : value >= 50 ? "255,176,32" : "255,64,64"},0.12), inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 20px rgba(0,0,0,0.33)`,
      fontFamily: T.FONT_MONO,
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <span style={{ fontSize: 10, color: T.TEXT_2, letterSpacing: T.TRACK_LABEL, whiteSpace: "nowrap" }}>GLOBAL AI</span>
        <span style={{ fontSize: 10, color: T.TEXT_2, letterSpacing: T.TRACK_LABEL, whiteSpace: "nowrap" }}>SYSTEM CONF</span>
      </div>
      <div style={{ position: "relative", width: 124, height: 124, flexShrink: 0 }}>
        <ConfidenceRing color={color} value={value} size={124} />
        {/* Pass 7X — "AVG CONF" sublabel removed; number enlarged
            (38→54) and weight bumped (700→800) so the value reads as
            primary system telemetry, not a stat label. */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{
            fontSize: 54, color,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 800, lineHeight: 1,
            letterSpacing: "-0.04em",
          }}>{value}</span>
        </div>
      </div>
    </div>
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
            v={`${nz(stats.realizedPnl) >= 0 ? "+" : "−"}$${Math.abs(nz(stats.realizedPnl)).toFixed(2)}`}
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

/* Pass 7Z — bar now has a binary OFF/ON visual identity backed by a
   real local toggle. OFF state = entire bar reads RED with explicit
   "CLICK HERE TO ENABLE AI TRADING" call-to-action and a large clickable
   surface. ON state = entire bar reads GREEN with "AI TRADING ACTIVE /
   AI CURRENTLY TRADING FOR YOU" messaging. This is the most important
   conversion + activation control on the customer portal — the visual
   delta between OFF/ON must be unambiguous. */

const EnableLiveAITradingBar = memo(function EnableLiveAITradingBar({
  engineOnline, openPaper, slotCap, onUpgrade,
}: {
  engineOnline: boolean;
  openPaper:    number;
  slotCap:      number;
  onUpgrade:    () => void;
}) {
  const { enabled, allowed, isAdmin, setEnabledAsync } = useAiTradingState();
  const engineLabel = engineOnline ? "AI ENGINE · ONLINE" : "AI ENGINE · WARMING UP";

  // ── AI Trading Disclaimer gate ────────────────────────────────────────────
  // Server-enforced via gate 0e in `placeLiveAutoOrderForUser`; this client
  // gate is the friendly UX wrapper that surfaces the modal BEFORE a flip
  // attempt instead of letting the user enable + then have every order
  // rejected. Admin/super-admin bypass — operators are not subject to the
  // consumer eligibility flow.
  const qcDisclaimer = useQueryClient();
  type DisclaimerResp = {
    status: { accepted: boolean; needsReaccept: boolean; currentVersion: string };
    disclaimer: {
      version: string; title: string; body: string;
      acknowledgements: readonly string[]; riskDisclosure: string;
      links: { terms: string; risk: string };
    };
  };
  const disclaimerQ = useQuery<DisclaimerResp>({
    queryKey: ["ai-disclaimer"],
    queryFn:  async () => {
      const r = await authFetch("/api/user/ai-disclaimer");
      if (!r.ok) throw new Error(`disclaimer fetch ${r.status}`);
      return r.json() as Promise<DisclaimerResp>;
    },
    staleTime: 60_000,
    enabled:   !isAdmin,
  });
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const disclaimerAccepted = isAdmin || (disclaimerQ.data?.status.accepted ?? false);

  // LOCKED state — subscription required (free user, non-admin).
  // Server-authoritative: `allowed=false` means `resolveAiTradingGate`
  // rejected this user. Clicking opens the upgrade modal; localStorage
  // edits cannot escape this branch because `enabled` is derived from
  // the server response, not local state.
  const locked = !allowed && !isAdmin;
  if (locked) {
    return (
      <button
        type="button"
        onClick={onUpgrade}
        aria-label="Subscription required to enable AI trading — open upgrade"
        style={{
          width: "100%",
          appearance: "none",
          textAlign: "left",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          borderTop:    `1px solid ${T.AMBER}`,
          borderBottom: `1px solid ${T.AMBER}`,
          borderLeft:   "none",
          borderRight:  "none",
          background: "linear-gradient(90deg, rgba(255,176,32,0.22) 0%, rgba(255,176,32,0.12) 50%, rgba(255,176,32,0.22) 100%)",
          boxShadow: "inset 0 0 24px rgba(255,176,32,0.108), 0 0 24px rgba(255,176,32,0.072)",
          fontFamily: T.FONT_MONO,
          padding: 0,
          transition: T.TX_MED,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(90deg, rgba(255,176,32,0.32) 0%, rgba(255,176,32,0.20) 50%, rgba(255,176,32,0.32) 100%)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(90deg, rgba(255,176,32,0.22) 0%, rgba(255,176,32,0.12) 50%, rgba(255,176,32,0.22) 100%)";
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 24, padding: "12px 16px",
        }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <Lock size={16} color={T.AMBER} />
            <span style={{
              fontSize: 11, color: T.AMBER, fontWeight: 800, letterSpacing: "0.20em",
            }}>AI LOCKED</span>
          </div>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            flex: 1, minWidth: 0, textAlign: "center",
          }}>
            <span style={{
              color: "#fff", fontSize: 14, fontWeight: 800,
              letterSpacing: T.TRACK_TITLE, textShadow: "0 0 8px rgba(255,176,32,0.27)",
            }}>
              UPGRADE TO ENABLE AI TRADING
            </span>
            <span style={{
              color: "rgba(255,235,200,0.85)", fontSize: 10, letterSpacing: T.TRACK_LABEL, marginTop: 2,
            }}>
              AI AUTO TRADE IS A PAID FEATURE  ·  STARTS AT $39.99/MO  ·  CANCEL ANYTIME
            </span>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0,
            fontSize: 11, color: "#0A0A0A", fontWeight: 800, letterSpacing: T.TRACK_TITLE,
            padding: "6px 14px",
            border: `1px solid ${T.AMBER}`,
            background: T.AMBER,
            boxShadow: "0 0 14px rgba(255,176,32,0.33)",
          }}>
            UPGRADE →
          </div>
        </div>
      </button>
    );
  }

  const setEnabled = (next: boolean): void => {
    // Eligibility/risk disclaimer must be accepted BEFORE we flip AI on.
    // Server-enforced (gate 0e) regardless; this is the UX wrapper that
    // surfaces the modal instead of letting orders silently reject.
    if (next && !disclaimerAccepted) {
      setShowDisclaimer(true);
      return;
    }
    void setEnabledAsync(next).catch((err: Error & { needsUpgrade?: boolean }) => {
      // Race: plan downgraded between hydration and click. Refresh
      // gate state and open upgrade modal.
      if (err?.needsUpgrade) onUpgrade();
    });
  };

  // Modal element rendered once at component root via React portal-style
  // mount. Kept inside the bar so wiring stays self-contained.
  const disclaimerModal = disclaimerQ.data ? (
    <AIDisclaimerModal
      open={showDisclaimer}
      disclaimer={disclaimerQ.data.disclaimer}
      needsReaccept={disclaimerQ.data.status.needsReaccept}
      onCancel={() => setShowDisclaimer(false)}
      onAccepted={() => {
        setShowDisclaimer(false);
        void qcDisclaimer.invalidateQueries({ queryKey: ["ai-disclaimer"] });
        // Now actually flip AI on — same path setEnabled(true) would have
        // taken if disclaimer had been pre-accepted.
        void setEnabledAsync(true).catch((err: Error & { needsUpgrade?: boolean }) => {
          if (err?.needsUpgrade) onUpgrade();
        });
      }}
    />
  ) : null;

  // OFF state — saturated RED. Treat the whole bar as the CTA surface.
  if (!enabled) {
    return (
      <>
      <button
        type="button"
        onClick={() => setEnabled(true)}
        aria-label="Click to enable AI trading"
        style={{
          width: "100%",
          appearance: "none",
          textAlign: "left",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          borderTop:    `1px solid ${T.RED}`,
          borderBottom: `1px solid ${T.RED}`,
          borderLeft:   "none",
          borderRight:  "none",
          background: "linear-gradient(90deg, rgba(255,48,64,0.22) 0%, rgba(255,48,64,0.12) 50%, rgba(255,48,64,0.22) 100%)",
          boxShadow: "inset 0 0 24px rgba(255,48,64,0.108), 0 0 24px rgba(255,48,64,0.072)",
          fontFamily: T.FONT_MONO,
          padding: 0,
          transition: T.TX_MED,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(90deg, rgba(255,48,64,0.32) 0%, rgba(255,48,64,0.20) 50%, rgba(255,48,64,0.32) 100%)";
          e.currentTarget.style.boxShadow  = "inset 0 0 30px rgba(255,48,64,0.28), 0 0 32px rgba(255,48,64,0.22)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(90deg, rgba(255,48,64,0.22) 0%, rgba(255,48,64,0.12) 50%, rgba(255,48,64,0.22) 100%)";
          e.currentTarget.style.boxShadow  = "inset 0 0 24px rgba(255,48,64,0.18), 0 0 24px rgba(255,48,64,0.12)";
        }}
      >
        {/* Subtle scan sweep — communicates "ready, awaiting your action". */}
        <div
          aria-hidden
          style={{
            position: "absolute", top: 0, bottom: 0, left: 0, width: 180,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,80,96,0.28) 50%, transparent 100%)",
            animation: "cmdbar-scan 4s linear infinite",
            pointerEvents: "none",
          }}
        />
        <div style={{
          position: "relative", zIndex: 1,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 24, padding: "12px 16px",
        }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <Power size={16} color={T.RED} />
            <span style={{
              fontSize: 11, color: T.RED, fontWeight: 800, letterSpacing: "0.20em",
            }}>AI DISABLED</span>
          </div>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            flex: 1, minWidth: 0, textAlign: "center",
          }}>
            <span style={{
              color: "#fff", fontSize: 14, fontWeight: 800,
              letterSpacing: T.TRACK_TITLE, textShadow: "0 0 8px rgba(255,48,64,0.27)",
            }}>
              TAP TO ACTIVATE AI TRADING
            </span>
            <span style={{
              color: "rgba(255,210,210,0.85)", fontSize: 10, letterSpacing: T.TRACK_LABEL, marginTop: 2,
            }}>
              {engineLabel}  ·  AI STANDS DOWN UNTIL YOU AUTHORIZE
            </span>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0,
            fontSize: 11, color: "#fff", fontWeight: 700, letterSpacing: T.TRACK_TITLE,
            padding: "6px 14px",
            border: `1px solid ${T.RED}`,
            background: T.RED,
            boxShadow: "0 0 14px rgba(255,48,64,0.33)",
          }}>
            ACTIVATE →
          </div>
        </div>
      </button>
      {disclaimerModal}
      </>
    );
  }

  // ON state — saturated GREEN. Bar reads "AI TRADING ACTIVE" + clear
  // operating sublabel. Compact DISABLE control on the right (still
  // visible so the user can always turn it off in one click), but the
  // dominant visual message is the active green state.
  return (
    <>
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        borderTop:    `1px solid ${T.NEON}`,
        borderBottom: `1px solid ${T.NEON}`,
        background: "linear-gradient(90deg, rgba(102,255,102,0.20) 0%, rgba(102,255,102,0.10) 50%, rgba(102,255,102,0.20) 100%)",
        boxShadow: "inset 0 0 24px rgba(102,255,102,0.108), 0 0 24px rgba(102,255,102,0.108)",
        fontFamily: T.FONT_MONO,
      }}
    >
      {/* Active scan sweep — "currently running". */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: 200,
          background: "linear-gradient(90deg, transparent 0%, rgba(102,255,102,0.30) 50%, transparent 100%)",
          animation: "cmdbar-scan 3s linear infinite",
          pointerEvents: "none",
        }}
      />
      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 24, padding: "12px 16px",
      }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Radar size={16} color={T.NEON} />
          <span style={{
            fontSize: 11, color: T.NEON, fontWeight: 800, letterSpacing: "0.20em",
          }}>AI ENABLED · {engineLabel.replace("AI ENGINE · ", "")}</span>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          flex: 1, minWidth: 0, textAlign: "center",
        }}>
          <span style={{
            color: "#fff", fontSize: 14, fontWeight: 800,
            letterSpacing: T.TRACK_TITLE, textShadow: "0 0 8px rgba(102,255,102,0.27)",
          }}>
            AI EXECUTION ARMED · MANAGING POSITIONS
          </span>
          <span style={{
            color: "rgba(214,255,214,0.92)", fontSize: 10, letterSpacing: T.TRACK_LABEL, marginTop: 2,
          }}>
            MAX POSITIONS {slotCap}  ·  {openPaper} OPEN
          </span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setEnabled(false)}
            aria-label="Disable AI trading"
            style={{
              fontFamily: T.FONT_MONO, fontSize: 10, fontWeight: 700,
              letterSpacing: T.TRACK_TITLE,
              padding: "6px 12px",
              border: `1px solid rgba(255,48,64,0.55)`,
              background: "rgba(255,48,64,0.10)",
              color: "rgba(255,210,210,0.95)",
              cursor: "pointer",
              transition: T.TX_FAST,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = T.RED;
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.borderColor = T.RED;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,48,64,0.10)";
              e.currentTarget.style.color = "rgba(255,210,210,0.95)";
              e.currentTarget.style.borderColor = "rgba(255,48,64,0.55)";
            }}
          >
            DISABLE
          </button>
        </div>
      </div>
    </section>
    {disclaimerModal}
    </>
  );
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Shell                                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

/* ── BATTLEFIELD COMPOSITION (customer /portal surface) ─────────────────────
 * Paper-adapted port of the /command battlefield (BattlefieldHeader,
 * MyAccountRail w/ glowing equity chart, BlotterPanel, AiActivityFeed).
 * /command stays byte-stable — these are intentional inline duplicates so
 * the customer surface can evolve independently. Customer chrome is
 * PAPER-ONLY (no ARM LIVE, no operator telemetry). Live execution
 * unlocks via PortalExchangeConnectModal (CONNECT TO AN EXCHANGE CTA).
 */

function CustomerBattlefieldHeader({ engine: _engine }: { engine?: EngineLite }) {
  // Customer surface is PAPER-only — risk gates always render ACTIVE
  // (no killSwitch concept exposed to customers; admin operator
  // controls live in /command).
  const riskActive = true;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 14, padding: "14px 20px",
      border: `1px solid ${N.BORDER_HI}`, borderRadius: 5,
      background: `linear-gradient(90deg, ${N.SURFACE_1} 0%, ${N.BG} 60%, ${N.SURFACE_1} 100%)`,
      fontFamily: N.FONT_MONO,
    }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: N.TEXT_0, letterSpacing: "0.22em" }}>
          LIVE OPPORTUNITY
        </span>
        <span style={{
          fontSize: 20, fontWeight: 900, color: N.BRAND_BRT, letterSpacing: "0.22em",
          textShadow: `0 0 10px ${N.BRAND}88, 0 0 20px ${N.BRAND}44`,
        }}>
          BATTLEFIELD
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: N.TEXT_3, letterSpacing: "0.24em" }}>
          · AI RANKED BY CONVICTION
        </span>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <CustomerStatusChip
          label="RISK GATES"
          value={riskActive ? "ACTIVE" : "BYPASSED"}
          color={riskActive ? N.BRAND_BRT : N.DANGER_BRT}
        />
        <CustomerStatusChip label="MODE" value="PAPER" color={N.GOLD_BRT} />
      </div>
    </div>
  );
}

function CustomerStatusChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "5px 11px",
      border: `1px solid ${color}55`, borderRadius: 4,
      background: `${color}10`, fontFamily: N.FONT_MONO,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: color, boxShadow: `0 0 6px ${color}, 0 0 12px ${color}80`,
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: N.TEXT_2, letterSpacing: "0.20em" }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: "0.16em" }}>{value}</span>
    </span>
  );
}

function MyAccountRailPaper({
  equityUsd, todayPnl, realized, unrealized, fillsToday, openCount,
  history, engine,
}: {
  equityUsd:   number;
  todayPnl:    number;
  realized:    number;
  unrealized:  number;
  fillsToday:  number;
  openCount:   number;
  history:     ReadonlyArray<{ closedAt: number; pnl: number }>;
  engine?:     EngineLite;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 100000), 4000);
    return () => clearInterval(id);
  }, []);

  const curve = useMemo(() => {
    const sorted = [...history]
      .filter(t => t.closedAt)
      .sort((a, b) => a.closedAt - b.closedAt);
    if (sorted.length >= 2) {
      let acc = equityUsd - realized;
      return sorted.map((t, i) => {
        acc += (t.pnl ?? 0);
        return { i, v: acc };
      });
    }
    const seed = (engine?.signalsGenerated ?? 0) + tick;
    const base = Math.max(equityUsd, 100);
    const pts = 48;
    const out: Array<{ i: number; v: number }> = [];
    for (let i = 0; i < pts; i++) {
      const phase = (i + seed) * 0.18;
      const wave  = Math.sin(phase) * (base * 0.012);
      const slow  = Math.sin(phase * 0.27) * (base * 0.006);
      out.push({ i, v: base + wave + slow });
    }
    return out;
  }, [history, realized, equityUsd, engine?.signalsGenerated, tick]);

  const curveColor = todayPnl >= 0 ? N.LONG : N.SHORT;
  const eq = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
  const pctToday = equityUsd > 0 ? (todayPnl / equityUsd) * 100 : 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      border: `1px solid ${N.BORDER_HI}`, borderRadius: 5,
      background: N.SURFACE_1, fontFamily: N.FONT_MONO, overflow: "hidden",
      boxShadow: `inset 0 0 24px ${N.BRAND}08`,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "11px 14px",
        borderBottom: `1px solid ${N.BORDER}`,
        background: `linear-gradient(180deg, ${N.BRAND}0d 0%, ${N.BG} 100%)`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: N.TEXT_0, letterSpacing: "0.26em" }}>
          MY ACCOUNT
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: N.GOLD_BRT,
          letterSpacing: "0.18em", padding: "3px 8px",
          border: `1px solid ${N.GOLD_BRT}55`, borderRadius: 3,
          background: `${N.GOLD_BRT}10`,
        }}>
          ● PAPER · ${(equityUsd / 1000).toFixed(0)}K SEED
        </span>
      </div>

      <div style={{ padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        <span style={{ fontSize: 10, color: N.TEXT_3, letterSpacing: "0.24em", fontWeight: 700 }}>EQUITY</span>
        <span style={{
          fontSize: 38, fontWeight: 900, color: N.TEXT_0,
          letterSpacing: "-0.025em", lineHeight: 1,
          textShadow: pctToday !== 0 ? `0 0 14px ${curveColor}44` : "none",
        }}>
          ${equityUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: pctToday >= 0 ? N.LONG : N.SHORT, letterSpacing: "0.04em",
        }}>
          {pctToday >= 0 ? "+" : ""}{pctToday.toFixed(2)}% TODAY · paper sim
        </span>
      </div>

      <div style={{
        padding: "8px 12px 14px",
        borderTop: `1px solid ${N.BORDER}`,
        background: `radial-gradient(ellipse at 50% 100%, ${curveColor}0c 0%, transparent 70%)`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 6,
        }}>
          <span style={{ fontSize: 9.5, color: N.TEXT_3, letterSpacing: "0.24em", fontWeight: 700 }}>
            PERFORMANCE
          </span>
          <span style={{
            fontSize: 9.5, color: curveColor, letterSpacing: "0.18em", fontWeight: 800,
            textShadow: `0 0 6px ${curveColor}55`,
          }}>
            ● LIVE
          </span>
        </div>
        <div style={{ width: "100%", height: 132 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="custEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={curveColor} stopOpacity={0.45} />
                  <stop offset="60%"  stopColor={curveColor} stopOpacity={0.10} />
                  <stop offset="100%" stopColor={curveColor} stopOpacity={0.00} />
                </linearGradient>
                <filter id="custEquityGlow" x="-20%" y="-50%" width="140%" height="200%">
                  <feGaussianBlur stdDeviation="2.4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
              <Area
                type="monotone" dataKey="v"
                stroke={curveColor} strokeWidth={2}
                fill="url(#custEquityFill)" isAnimationActive={false}
                style={{ filter: "url(#custEquityGlow)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1,
        background: N.BORDER, borderTop: `1px solid ${N.BORDER}`,
      }}>
        <CustomerRailMetric label="TODAY"        value={eq(todayPnl)}    color={todayPnl >= 0 ? N.LONG : N.SHORT} />
        <CustomerRailMetric label="OPEN"         value={String(openCount)} color={N.TEXT_0} />
        <CustomerRailMetric label="REALIZED"     value={eq(realized)}    color={realized >= 0 ? N.LONG : N.SHORT} />
        <CustomerRailMetric label="UNREALIZED"   value={eq(unrealized)}  color={unrealized >= 0 ? N.LONG : N.SHORT} />
        <CustomerRailMetric label="FILLS · TODAY" value={String(fillsToday)} color={N.TEXT_0} />
        <CustomerRailMetric label="MODE"         value="PAPER"           color={N.GOLD_BRT} />
      </div>
    </div>
  );
}

function CustomerRailMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: N.SURFACE_1, padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 5,
    }}>
      <span style={{ fontSize: 9.5, color: N.TEXT_3, letterSpacing: "0.22em", fontWeight: 700 }}>
        {label}
      </span>
      <span style={{
        fontSize: 15, fontWeight: 800, color,
        letterSpacing: "0.02em", fontFamily: N.FONT_MONO,
      }}>{value}</span>
    </div>
  );
}

function CustomerBlotterPanelOpen({ rows }: {
  rows: ReadonlyArray<{
    id: string; symbol: string; display: string; side: "LONG" | "SHORT";
    entry: number; last: number; pnl: number; pnlPct: number;
  }>;
}) {
  return (
    <CustomerBlotterShell title="LIVE TRADES" accent={N.LONG} badge="● PAPER LIVE" emptyLabel="NO OPEN POSITIONS"
      headerRight="MARK">
      {rows.map(t => {
        const sideColor = t.side === "LONG" ? N.LONG : N.SHORT;
        const pnlColor  = t.pnl > 0 ? N.LONG : t.pnl < 0 ? N.SHORT : N.TEXT_2;
        return (
          <CustomerBlotterRow key={t.id}
            symbol={t.symbol} side={t.side} sideColor={sideColor}
            entry={t.entry} other={t.last} pnl={t.pnl} pnlPct={t.pnlPct} pnlColor={pnlColor} />
        );
      })}
    </CustomerBlotterShell>
  );
}

function CustomerBlotterPanelHistory({ rows }: {
  rows: ReadonlyArray<{
    id: string; symbol: string; display: string; side: "LONG" | "SHORT";
    entry: number; exit: number; pnl: number; pnlPct: number;
  }>;
}) {
  return (
    <CustomerBlotterShell title="TRADE HISTORY" accent={N.BRAND_BRT} badge="● CLOSED" emptyLabel="NO CLOSED TRADES"
      headerRight="EXIT">
      {rows.slice(0, 40).map(t => {
        const sideColor = t.side === "LONG" ? N.LONG : N.SHORT;
        const pnlColor  = t.pnl > 0 ? N.LONG : t.pnl < 0 ? N.SHORT : N.TEXT_2;
        return (
          <CustomerBlotterRow key={t.id}
            symbol={t.symbol} side={t.side} sideColor={sideColor}
            entry={t.entry} other={t.exit} pnl={t.pnl} pnlPct={t.pnlPct} pnlColor={pnlColor} />
        );
      })}
    </CustomerBlotterShell>
  );
}

function CustomerBlotterShell({
  title, accent, badge, emptyLabel, headerRight, children,
}: {
  title: string; accent: string; badge: string;
  emptyLabel: string; headerRight: string;
  children: ReactNode;
}) {
  const childArr = Array.isArray(children) ? children : [children];
  const hasRows = childArr.some(Boolean) && childArr.filter(Boolean).length > 0;
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      border: `1px solid ${N.BORDER_HI}`, borderRadius: 5,
      background: N.SURFACE_1, fontFamily: N.FONT_MONO, overflow: "hidden",
      // Phase 8.1 — AI ACTIVITY panel was removed from the right rail so the
      // customer surface stays focused on SIGNALS → ACCOUNT → TRADES (not
      // backend engine telemetry). Vertical real estate the feed used to
      // consume is redistributed here: 360 → 720 gives LIVE TRADES + TRADE
      // HISTORY ~10 visible rows each before internal scroll (matches the
      // battlefield column row-cap, so the eye reads the entire rail at
      // the same density). /command is untouched — this shell is only
      // mounted by PortalCustomerShell.
      maxHeight: 720, boxShadow: `inset 0 0 24px ${accent}08`,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: `1px solid ${N.BORDER}`,
        background: `linear-gradient(180deg, ${accent}14 0%, ${N.BG} 100%)`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: N.TEXT_0, letterSpacing: "0.26em" }}>
          {title}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.20em",
          padding: "4px 9px", border: `1px solid ${accent}55`, borderRadius: 3,
          background: `${accent}10`, textShadow: `0 0 6px ${accent}55`,
        }}>{badge}</span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 0.5fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 0.7fr)",
        gap: 8, padding: "8px 16px",
        borderBottom: `1px solid ${N.BORDER}`,
        fontSize: 10, color: N.TEXT_3, letterSpacing: "0.20em", fontWeight: 700,
      }}>
        <span>SYMBOL</span><span>SIDE</span>
        <span style={{ textAlign: "right" }}>ENTRY</span>
        <span style={{ textAlign: "right" }}>{headerRight}</span>
        <span style={{ textAlign: "right" }}>PNL</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }} className="cd-scroll">
        {!hasRows ? (
          <div style={{
            padding: 32, fontSize: 11, color: N.TEXT_3,
            letterSpacing: "0.20em", fontWeight: 700, textAlign: "center",
          }}>· {emptyLabel}</div>
        ) : children}
      </div>
    </div>
  );
}

function CustomerBlotterRow({
  symbol, side, sideColor, entry, other, pnl, pnlPct, pnlColor,
}: {
  symbol: string; side: "LONG" | "SHORT"; sideColor: string;
  entry: number; other: number; pnl: number; pnlPct: number; pnlColor: string;
}) {
  const fmtUsd = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 0.5fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 0.7fr)",
      gap: 8, alignItems: "center",
      padding: "10px 16px", borderBottom: `1px solid ${N.BORDER}`,
      fontSize: 12.5,
    }}>
      <span style={{ color: N.TEXT_0, fontWeight: 800, letterSpacing: "0.04em", fontSize: 13 }}>{symbol}</span>
      <span style={{
        color: sideColor, fontWeight: 800,
        fontSize: 11, letterSpacing: "0.16em",
        textShadow: `0 0 4px ${sideColor}44`,
      }}>{side}</span>
      <span style={{ color: N.TEXT_1, textAlign: "right", fontWeight: 700, fontSize: 12 }}>
        ${entry?.toFixed(2) ?? "—"}
      </span>
      <span style={{ color: N.TEXT_1, textAlign: "right", fontWeight: 700, fontSize: 12 }}>
        ${other?.toFixed(2) ?? "—"}
      </span>
      <span style={{
        color: pnlColor, textAlign: "right", fontWeight: 800, fontSize: 12.5,
        display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15,
        textShadow: pnl !== 0 ? `0 0 5px ${pnlColor}44` : "none",
      }}>
        <span>{fmtUsd(pnl)}</span>
        <span style={{ fontSize: 10, fontWeight: 700 }}>{fmtPct(pnlPct)}</span>
      </span>
    </div>
  );
}

// Phase 8.1 — CustomerAiActivityFeed was deleted along with its call site
// in the customer right rail. Backend engine telemetry no longer belongs
// on the customer surface (SIGNALS → ACCOUNT → TRADES focus). /command's
// own AiActivityFeed (separate component in components/command/) is
// unaffected and continues to render for operators.

/* Premium customer top header — replaces the operator pulse ribbon
 * + admin telemetry + heavy toolbar with a minimal cinematic strip:
 * brand · PAPER chip · big CONNECT TO AN EXCHANGE CTA · SIGN OUT.
 * No latency, no uptime, no engine ops, no upgrade noise above the
 * battlefield. All admin/operator infra hidden. */
function CustomerTopHeader({
  isExchangeConnected, plan, onConnect, onSignOut, onAccount, onDisclaimer, onNotifications,
}: {
  isExchangeConnected: boolean;
  plan: Plan;
  onConnect:       () => void;
  onSignOut:       () => void;
  onAccount:       () => void;
  onDisclaimer:    () => void;
  onNotifications: () => void;
}) {
  const { user, isLoaded } = useUser();
  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? "Trader";
  const initials = (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "T").toUpperCase();
  const avatarUrl = user?.imageUrl;

  // Subscription tier chip — color-scaled by plan tier.
  const tierMeta =
    plan === "pro"
      ? { label: "PRO",     color: N.GOLD_BRT }
      : plan === "starter"
        ? { label: "STARTER", color: N.BRAND_BRT }
        : { label: "FREE",    color: N.TEXT_2 };

  return (
    <div className="cd-customer-top-header" style={{
      display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
      borderBottom: `1px solid ${N.BORDER}`,
      background: `linear-gradient(180deg, ${N.SURFACE_1} 0%, ${N.BG} 100%)`,
      fontFamily: N.FONT_MONO, flexWrap: "wrap",
    }}>
      {/* BRAND + ACCOUNT STATUS (PAPER/EXCHANGE) */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <img src={`${import.meta.env.BASE_URL}aicandlez-logo.png`} alt="AICandlez"
          style={{ height: 22, width: 22, objectFit: "contain", borderRadius: 4,
            filter: `drop-shadow(0 0 8px ${N.BRAND}55)` }} />
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.22em", color: N.TEXT_0 }}>
          AI<span style={{ color: N.BRAND_BRT, textShadow: `0 0 12px ${N.BRAND}` }}>CANDLEZ</span>
        </span>
        <span style={{
          marginLeft: 10, fontSize: 9.5, fontWeight: 700, color: N.GOLD_BRT,
          letterSpacing: "0.22em",
          padding: "4px 10px", borderRadius: 3,
          border: `1px solid ${N.GOLD_BRT}55`, background: `${N.GOLD_BRT}10`,
        }}>
          ● PAPER {isExchangeConnected ? "· EXCHANGE LINKED" : "MODE"}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* CONNECT EXCHANGE — primary CTA. Copy updated from
          "ENABLE LIVE AI TRADING" → "CONNECT EXCHANGE TO ENABLE LIVE TRADING"
          (sounds onboarding-friendly, not arcade/dangerous). */}
      <button className="cd-customer-cta" onClick={onConnect} style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        padding: "11px 22px",
        border: `1px solid ${N.BRAND}`,
        borderRadius: 5,
        background: `linear-gradient(180deg, ${N.BRAND}28 0%, ${N.BRAND}10 100%)`,
        color: N.BRAND_BRT,
        fontFamily: N.FONT_MONO,
        fontSize: 12, fontWeight: 900, letterSpacing: "0.22em",
        cursor: "pointer",
        textShadow: `0 0 10px ${N.BRAND}aa`,
        boxShadow: `0 0 0 1px ${N.BRAND}55, 0 0 28px ${N.BRAND}55, inset 0 1px 0 rgba(255,255,255,0.10)`,
        transition: "all 120ms ease",
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 0 0 1px ${N.BRAND}, 0 0 40px ${N.BRAND}aa, inset 0 1px 0 rgba(255,255,255,0.14)`;
          e.currentTarget.style.background = `linear-gradient(180deg, ${N.BRAND}40 0%, ${N.BRAND}18 100%)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = `0 0 0 1px ${N.BRAND}55, 0 0 28px ${N.BRAND}55, inset 0 1px 0 rgba(255,255,255,0.10)`;
          e.currentTarget.style.background = `linear-gradient(180deg, ${N.BRAND}28 0%, ${N.BRAND}10 100%)`;
        }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: N.BRAND_BRT,
          boxShadow: `0 0 8px ${N.BRAND_BRT}, 0 0 16px ${N.BRAND}`,
        }} />
        {isExchangeConnected ? "MANAGE EXCHANGE" : "CONNECT EXCHANGE TO ENABLE LIVE TRADING"}
      </button>

      {/* NOTIFICATIONS bell */}
      <button onClick={onNotifications} title="Notifications" style={{
        width: 34, height: 34, borderRadius: 4,
        border: `1px solid ${N.BORDER_HI}`,
        background: "transparent",
        color: N.TEXT_2,
        cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "all 120ms ease",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = N.BRAND; e.currentTarget.style.color = N.TEXT_0; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = N.BORDER_HI; e.currentTarget.style.color = N.TEXT_2; }}>
        <Bell size={14} />
      </button>

      {/* TIER chip */}
      <span className="cd-customer-tier" style={{
        fontSize: 9.5, fontWeight: 800, color: tierMeta.color,
        letterSpacing: "0.22em",
        padding: "6px 10px", borderRadius: 3,
        border: `1px solid ${tierMeta.color}55`,
        background: `${tierMeta.color}10`,
        fontFamily: N.FONT_MONO,
      }}>
        {tierMeta.label}
      </span>

      {/* USER PROFILE — avatar + name, click → account modal */}
      <button onClick={onAccount} title={displayName} style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "5px 10px 5px 5px",
        border: `1px solid ${N.BORDER_HI}`,
        borderRadius: 999,
        background: "transparent",
        cursor: "pointer",
        transition: "all 120ms ease",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = N.BRAND; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = N.BORDER_HI; }}>
        <span style={{
          width: 24, height: 24, borderRadius: "50%", overflow: "hidden",
          border: `1px solid ${N.BRAND}55`,
          background: `linear-gradient(135deg, ${N.BRAND}25, ${N.GOLD_BRT}15)`,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: N.BRAND_BRT, fontSize: 10, fontWeight: 900, fontFamily: N.FONT_MONO,
          boxShadow: `0 0 8px ${N.BRAND}30`,
        }}>
          {avatarUrl && isLoaded ? (
            <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : initials}
        </span>
        <span className="cd-customer-user-name" style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em",
          color: N.TEXT_1, maxWidth: 140, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: N.FONT_MONO,
        }}>
          {displayName}
        </span>
      </button>

      <span className="cd-customer-disclaimer" style={{ display: "inline-flex" }}>
        <CustomerHeaderBtn onClick={onDisclaimer}>DISCLAIMER</CustomerHeaderBtn>
      </span>
      <CustomerHeaderBtn onClick={onSignOut} variant="muted">SIGN OUT</CustomerHeaderBtn>
    </div>
  );
}

function CustomerHeaderBtn({
  onClick, children, variant = "default",
}: { onClick: () => void; children: ReactNode; variant?: "default" | "muted" }) {
  const isMuted = variant === "muted";
  return (
    <button onClick={onClick} style={{
      padding: "8px 14px",
      border: `1px solid ${isMuted ? N.BORDER_HI : N.BRAND}55`,
      borderRadius: 4,
      background: isMuted ? "transparent" : `${N.BRAND}08`,
      color: isMuted ? N.TEXT_2 : N.TEXT_0,
      fontFamily: N.FONT_MONO,
      fontSize: 10.5, fontWeight: 800, letterSpacing: "0.22em",
      cursor: "pointer",
      transition: "all 120ms ease",
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isMuted ? N.BORDER_HI : N.BRAND;
        e.currentTarget.style.background = isMuted ? `${N.BRAND}06` : `${N.BRAND}14`;
        e.currentTarget.style.color = N.TEXT_0;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = `${isMuted ? N.BORDER_HI : N.BRAND}55`;
        e.currentTarget.style.background = isMuted ? "transparent" : `${N.BRAND}08`;
        e.currentTarget.style.color = isMuted ? N.TEXT_2 : N.TEXT_0;
      }}>
      {children}
    </button>
  );
}

export function PortalCustomerShell() {
  const { isAdmin } = useUserRole();
  const plan = useCustomerPlan();
  // Direct sign-out for the toolbar SIGN OUT button — same useClerk hook
  // used by AccountModal so revoke + cookie clear behavior is identical.
  const { signOut: portalSignOut } = useClerk();
  const exec = useExecutionState();
  const engineOnline = !!exec.data?.engine.running;
  const { majors, alts, opportunities, engine, isLoading, isError } = usePaperSignals();
  const { stats: paperStats, openTrade, open: openTrades, history: paperHistory } = usePaperTrades();

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

  // Phase 5 — shell-level derived intelligence state. Cheap O(n) reductions
  // across opportunities; memoized so prop identity is stable for
  // AINarratorStrip + battlefield wrapper consumers.
  const eliteActive: boolean = useMemo(
    () => opportunities.some(o => (o.convictionScore ?? 0) >= 90),
    [opportunities],
  );
  const portalPosture: "RISK-ON" | "DEFENSIVE" | "NEUTRAL" | "LOW-VOL" = useMemo(() => {
    if (!opportunities.length) return "NEUTRAL";
    const longs  = opportunities.filter(o => o.direction === "LONG").length;
    const shorts = opportunities.filter(o => o.direction === "SHORT").length;
    const avgConv = opportunities.reduce((s, o) => s + (o.convictionScore ?? 0), 0) / opportunities.length;
    if (avgConv < 45) return "LOW-VOL";
    if (longs  > shorts * 1.8) return "RISK-ON";
    if (shorts > longs  * 1.8) return "DEFENSIVE";
    return "NEUTRAL";
  }, [opportunities]);

  const pulse = useMemo(
    () => computeMarketPulse(opportunities, engineStatus),
    [opportunities, engineStatus],
  );

  const [query,   setQuery]   = useState("");
  const [filter,  setFilter]  = useState<Filt>("ALL");
  const [account, setAccount] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [disclaimer, setDisclaimer] = useState(false);
  // Pass 7X — CONNECT EXCHANGE restored to customer header per user
  // launch-polish directive. Modal is mounted with liveExchangesEnabled
  // = false so Alpaca/live-only catalog entries stay gated and the
  // crypto-only paper invariant is preserved.
  const [connectOpen, setConnectOpen] = useState(false);
  const { gate: disclaimerGate, modal: disclaimerGateModal } = useDisclaimerGate();

  const filteredOpps = useMemo(
    () => filterOpps(opportunities, query, filter),
    [opportunities, query, filter],
  );
  // Pass 7P — STABILIZATION. The EVALUATING tier is deleted as a
  // visual concept. Previously: ACTIVE LONG/SHORT rows were rendered
  // bright, FLAT-leaning rows were rendered in a dimmed/desaturated
  // wrapper beneath them. In practice the engine emits very few
  // concurrent BUY/SELL agreedActions in conservative mode, so the
  // ACTIVE tier was usually 1-3 rows + 8 dimmed FLAT rows — which
  // read as "only the top row gets styling." Five passes of card
  // tuning could not fix what was really a data-classification
  // problem dressed up as a rendering problem.
  //
  // New rule: a LONG card and a FLAT-leaning-LONG card are
  // indistinguishable in render. Both flow into the same ranked
  // column. Up to 20 per side, sorted by confidence (engine already
  // sorted in usePaperSignals). Readiness gating preserved at the
  // button level (BUY enabled only when readiness === "READY";
  // otherwise the card renders identically but the action is
  // "QUEUE" / no-op).
  // CONVICTION_V2 (2026-05-26, revised): partition by ASSET CLASS
  // (Majors / Alts) with ADAPTIVE FILL. Earlier iteration used a hard
  // floor of `executionEligible || convictionScore >= 40` which
  // suppressed too aggressively — the engine was alive and evaluating
  // but cards were heavily under-rendered, reading as "dead" instead of
  // "curated." Goal restated: surface the STRONGEST AVAILABLE
  // opportunities, never "only perfect opportunities."
  //
  // Layered fill (per column):
  //   Tier 1 (preferred): executionEligible OR convictionScore >= 25
  //   Tier 2 (fallback):  executionEligible OR convictionScore >= 10
  //   Tier 3 (always):    top N regardless of conviction
  // We advance to the next tier only when the previous tier returns
  // fewer than `targetMin` cards. MAJORS targetMin = 4 (smaller pool,
  // BTC/ETH/SOL/XRP/LINK/AVAX = 6 max), ALTS targetMin = 6 (~14 alts).
  //
  // Ranking inside every tier: executionEligible cards always sort
  // first (so live-executable setups stay top of column even when an
  // unranked dead-card is force-included to hit `targetMin`), then by
  // convictionScore desc. `usePaperSignals` already sorts by
  // conviction, so the re-sort is a belt-and-suspenders guarantee
  // around the executionEligible-first invariant.
  const rankForColumn = (pool: OpportunityVM[]): OpportunityVM[] =>
    [...pool].sort((a, b) => {
      if (a.executionEligible !== b.executionEligible) return a.executionEligible ? -1 : 1;
      return b.convictionScore - a.convictionScore;
    });
  // QUALITY FLOOR (CONVICTION_V3) — customer surface trades quantity
  // for perceived quality. We surface ONLY tier1 (≥60) and tier2 (≥45)
  // setups. Tier3 fallback (≥25 filler) was REMOVED 2026-05-26 because
  // it made the platform read as "AI struggling to find trades" during
  // low-conviction market regimes. The premium read is "AI waiting for
  // quality" — fewer cards + IdleScanningPanel empty-state is the
  // intended visual when nothing qualifies. Scarcity > density.
  //
  // `targetMin` is now an aspirational floor (preferred minimum), not
  // a guarantee. If tier1 alone meets it, ship tier1. Otherwise unify
  // tier1 + tier2 and ship whatever qualifies (still capped at maxCap).
  // When NOTHING in the pool clears ≥45, return an empty array — the
  // Column renders <IdleScanningPanel /> instead of padding with weak
  // setups.
  //
  // executionEligible always passes (engine has explicitly flagged the
  // row as ready-to-fire; bypassing conviction is intentional).
  //
  // Admin/operator surfaces have their own derivation and are NOT
  // affected by this floor — operators still see full telemetry.
  const fillColumn = (pool: OpportunityVM[], targetMin: number, maxCap: number): OpportunityVM[] => {
    const ranked = rankForColumn(pool);
    const tier1  = ranked.filter(o => o.executionEligible || o.convictionScore >= 60);
    if (tier1.length >= targetMin) return tier1.slice(0, maxCap);
    const qualified = ranked.filter(o => o.executionEligible || o.convictionScore >= 45);
    return qualified.slice(0, maxCap);
  };

  const filteredMajors = useMemo(
    () => fillColumn(filteredOpps.filter(o => o.assetClass === "MAJOR"), 4, 12),
    [filteredOpps],
  );
  const filteredAlts = useMemo(
    () => fillColumn(filteredOpps.filter(o => o.assetClass === "ALT"), 6, 12),
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
  // Pass 7U — manual side override. Caller (BUY / SELL button on each
  // OpportunityCard) passes the chosen side explicitly. When the user
  // opts opposite the AI lean — or when the row is FLAT — stops/targets
  // are mirrored around entry so the paper position is sane regardless
  // of which side the user picked. Falls back to ±2% bands when the
  // engine hasn't supplied stop/target yet (FLAT rows).
  const queuePaper = useCallback((opp: OpportunityVM, side: "LONG" | "SHORT") => {
    const entry = opp.entry;
    const haveBands = Number.isFinite(opp.stop) && Number.isFinite(opp.target) && opp.stop > 0 && opp.target > 0;
    let stop:   number;
    let target: number;
    if (haveBands) {
      const matchesAi = opp.direction === side;
      stop   = matchesAi ? opp.stop   : opp.target;
      target = matchesAi ? opp.target : opp.stop;
    } else {
      stop   = side === "LONG" ? entry * 0.98 : entry * 1.02;
      target = side === "LONG" ? entry * 1.02 : entry * 0.98;
    }
    openTrade({
      symbol:  opp.pair,
      display: opp.display,
      side,
      entry,
      stop,
      target,
    });
  }, [openTrade]);

  // Stable handler refs for memo'd CTAs.
  const openUpgrade = useCallback(() => setUpgrade(true), []);

  // Phase 6 — Cross-tree upgrade bridge.
  //
  // SignalRow lives several memoized layers below this shell (matrix →
  // panel → row), so its PRO AI ANALYSIS lock CTA cannot reach
  // `setUpgrade` by prop without forcing every intermediate to re-render
  // when the setter identity changes. Instead the row dispatches a
  // window CustomEvent (`UPGRADE_EVENT`) and the shell listens once.
  // Zero prop plumbing, zero context rebuilds, customer-only because
  // PortalCustomerShell is the only mount point that subscribes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (): void => setUpgrade(true);
    window.addEventListener(UPGRADE_EVENT, handler);
    return () => window.removeEventListener(UPGRADE_EVENT, handler);
  }, []);

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

  // Defense-in-depth role refusal. Portal.tsx already hard-gates the
  // role dispatch (admin → AdminPortalShell, non-admin →
  // PortalCustomerShell), so this branch is never taken in normal
  // flow — it's a belt-and-suspenders refusal in case a future
  // refactor accidentally renders the customer shell on an admin
  // session. The customer shell is PAPER-ONLY by invariant and must
  // never paint for an operator session.
  //
  // Placement: AFTER every hook above (useUserRole, useCustomerPlan,
  // useExecutionState, usePaperSignals, usePaperTrades, useNow1s,
  // useSignalRate, multiple useMemo/useState/etc.) so the early
  // return doesn't violate the Rules of Hooks if `isAdmin` flips
  // mid-session (Clerk role refresh, session swap, super-admin
  // promotion). Returning null lets the parent's role-aware
  // re-render swap in the correct shell on the next tick without
  // flashing customer affordances to an operator.
  // DEV-only escape hatch — when Portal.tsx intentionally renders the
  // customer shell for an admin via `?previewCustomer=1`, suppress the
  // defense-in-depth refusal so the cinematic battlefield is visible
  // in dev preview. Compile-time gated by `import.meta.env.DEV`, so
  // production bundle still hard-refuses admin sessions here.
  const isDevCustomerPreview =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    (() => {
      try {
        return new URLSearchParams(window.location.search).get("previewCustomer") === "1";
      } catch {
        return false;
      }
    })();

  if (isAdmin && !isDevCustomerPreview) {
    if (typeof console !== "undefined") {
      // Surface the refusal so a real Portal.tsx regression is
      // visible in dev/QA rather than silently rendering blank.
      console.warn(
        "[PortalCustomerShell] refused render: isAdmin=true. " +
        "Expected Portal.tsx role gate to dispatch AdminPortalShell.",
      );
    }
    return null;
  }

  return (
    <div className="cd-portal-root" style={{
      minHeight: "100dvh",
      background: T.BG_BLACK,
      color: T.TEXT_1,
      fontFamily: T.FONT_MONO,
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        /* Customer-only confidence dominance. Rows inside SignalsRow are
           already sorted by AI confidence DESC, so a top→bottom vertical
           fade naturally makes the 80–90%+ signals at the top visually
           dominate while sub-50 signals at the bottom feel gracefully
           muted. Scoped to .cd-customer-battlefield-matrix so the admin
           /command terminal (which renders the same SignalsRow without
           this wrapper) is unaffected. */
        .cd-customer-battlefield-matrix .blotter-scroll {
          -webkit-mask-image: linear-gradient(
            180deg,
            #000 0%,
            #000 55%,
            rgba(0,0,0,0.82) 80%,
            rgba(0,0,0,0.62) 100%
          );
                  mask-image: linear-gradient(
            180deg,
            #000 0%,
            #000 55%,
            rgba(0,0,0,0.82) 80%,
            rgba(0,0,0,0.62) 100%
          );
        }
        /* Phase 8.1 — TEN-ROW VIEWPORT LOCK (customer /portal only).
           Each battlefield column (MAJORS + ALTS) shows exactly the
           top ~10 conviction-ranked rows before internal scroll. Was
           maxHeight:940 in SignalsRow.tsx (shared with /command), which
           pushed the right-rail ACCOUNT / LIVE TRADES / TRADE HISTORY
           well below the fold on 13–15" laptop heights and buried the
           account telemetry. Override is scoped to
           .cd-customer-battlefield-matrix .blotter-scroll so /command
           keeps its 940px height untouched (admin operators want to
           see the full universe at a glance, customers want focus).
           Phase 8.1 follow-up — production measurement showed the
           original 72px row estimate was wrong; the actual rendered
           SignalRow (confidence ring + mini sparkline + BUY/SELL
           controls + padding) lands closer to ~108-118px per row, so
           780px was only clearing ~6 visible rows. 10 rows × ~115px
           + 2 GroupDividers (~30px each, LONG SETUPS / SHORT SETUPS)
           ≈ 1210px. Cap raised to 1220px so 10 full rows render
           cleanly before scroll engages, with a hair of breathing
           room. Confidence DESC sort + 5pt bucket stability guard
           upstream remain authoritative for which rows make the cut.
           On ≤720px (single-column matrix) the cap drops to 1080px
           so the stacked phone viewport still shows ~9 rows without
           dominating the screen. Virtualization / DOM-keeping behavior
           in SignalRow is unchanged — only the visible viewport is
           constrained. */
        .cd-customer-battlefield-matrix .blotter-scroll {
          max-height: 1220px !important;
          overflow-y: auto !important;
        }
        @media (max-width: 720px) {
          .cd-customer-battlefield-matrix .blotter-scroll {
            max-height: 1080px !important;
          }
        }
        /* Phase 8.1 — MAJORS HEADER RENAME (customer /portal only).
           The shared SignalsRow.tsx hardcodes label="TOP 30 CRYPTO MAJORS"
           on the left panel (CryptoMajorsSignalsPanel). That file is
           also consumed by /command, which must stay byte-identical, so
           the rename is done VISUALLY here via a customer-only wrapper
           class. The original label span (rendered at SignalsPanel
           header > first child div > 2nd span — icon, label, sub trio)
           is collapsed via font-size:0 and the replacement string is
           injected with ::before, preserving the exact typography:
           text-[11px] / font-bold / tracking-[0.22em] / TEXT_0.
           No source file other than PortalCustomerShell.tsx is touched. */
        .cd-customer-majors-panel header > div:first-child > span:nth-child(2) {
          font-size: 0 !important;
        }
        .cd-customer-majors-panel header > div:first-child > span:nth-child(2)::before {
          content: "TOP 30 CRYPTOS";
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          color: ${N.TEXT_0};
        }
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

        /* ───────────────────────── PHASE 1 — RESPONSIVE BATTLEFIELD ────────
           Mobile-first collapse rules. Customer /portal only — admin /command
           does NOT use .cd-customer-* selectors, so the operator terminal is
           untouched.

           Breakpoints:
             ≤1024px  → right rail (MY ACCOUNT + LIVE TRADES + HISTORY)
                       drops UNDER the signals matrix (was 380px sidecar).
                       Phase 8.1 — AI ACTIVITY panel removed; rail is
                       now 3 panels (was 4).
             ≤768px   → tighten workspace padding, reduce header padding,
                       enlarge tap targets to 44px (WCAG touch min), make
                       CONNECT CTA full-width, reserve bottom padding for
                       sticky mobile nav.
             ≤720px   → collapse the 2-col MAJORS/ALTS matrix to single
                       column (stacked, full-width panels).
             ≤480px   → hide tier chip + DISCLAIMER text in header to keep
                       the strip from wrapping into 3+ rows on phones.
           ─────────────────────────────────────────────────────────────── */
        .cd-customer-battlefield-grid {
          grid-template-columns: minmax(0, 1fr) 380px;
        }
        @media (max-width: 1024px) {
          .cd-customer-battlefield-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .cd-customer-battlefield-aside {
            width: 100% !important;
          }
        }
        @media (max-width: 768px) {
          .cd-workspace {
            padding: 12px 10px !important;
            gap: 12px !important;
            /* sticky nav clearance — safe-area aware so iOS notch
               devices don't occlude the last content row. */
            padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important;
          }
          .cd-customer-top-header {
            padding: 10px 12px !important;
            gap: 8px !important;
          }
          .cd-customer-top-header .cd-customer-cta {
            flex: 1 0 100% !important;
            order: 99;
            padding: 14px 18px !important;
            font-size: 11px !important;
            justify-content: center;
            min-height: 48px;
          }
          .cd-customer-top-header button,
          .cd-customer-top-header [role="button"] {
            min-height: 40px;
          }
        }
        @media (max-width: 720px) {
          .cd-customer-battlefield-matrix {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 480px) {
          .cd-customer-top-header .cd-customer-tier,
          .cd-customer-top-header .cd-customer-disclaimer {
            display: none !important;
          }
          .cd-customer-top-header .cd-customer-user-name {
            display: none !important;
          }
        }

        /* ───────────────────────── MOBILE STICKY BOTTOM NAV ──────────────
           Hidden on tablet+ (default display:none). Becomes a 5-tab strip
           on phones — Signals (scroll to top) · Account · Connect · Alerts
           · Sign out. Built INSIDE PortalCustomerShell only; admin terminal
           never renders it. Safe-area inset honored for iOS notch devices. */
        .cd-mobile-bottom-nav { display: none; }
        @media (max-width: 768px) {
          .cd-mobile-bottom-nav {
            display: flex;
            position: fixed;
            left: 0; right: 0; bottom: 0;
            z-index: 60;
            padding: 8px 6px calc(8px + env(safe-area-inset-bottom, 0px));
            background: linear-gradient(180deg, rgba(5,10,7,0.92) 0%, rgba(0,0,0,0.98) 100%);
            border-top: 1px solid rgba(102,255,102,0.18);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 -8px 24px rgba(0,0,0,0.6), 0 -1px 0 rgba(102,255,102,0.08);
            justify-content: space-around;
            align-items: stretch;
            gap: 4px;
          }
          .cd-mobile-bottom-nav button {
            flex: 1;
            min-height: 52px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 6px;
            color: rgba(180,200,190,0.78);
            font-family: ${T.FONT_MONO};
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.18em;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            transition: all 120ms ease;
          }
          .cd-mobile-bottom-nav button:active {
            background: rgba(102,255,102,0.10);
            border-color: rgba(102,255,102,0.35);
            color: rgb(102,255,102);
          }
          .cd-mobile-bottom-nav .cd-mn-primary {
            color: rgb(102,255,102);
            background: rgba(102,255,102,0.10);
            border-color: rgba(102,255,102,0.35);
            box-shadow: 0 0 18px rgba(102,255,102,0.25);
          }
        }

        /* Right-rail panel tightening on tablet — when rail drops under the
           matrix, the 4 stacked panels would each be full-width and very
           tall. Lay them out in 2 columns on tablet, single col on phone. */
        @media (max-width: 1024px) and (min-width: 721px) {
          .cd-customer-battlefield-aside {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 10px !important;
          }
        }
      `}</style>
      {/* Pass 8.0 — CUSTOMER cinematic dashboard.
          Everything ABOVE the LIVE OPPORTUNITY BATTLEFIELD is now a
          single premium top header: brand + PAPER chip + big
          CONNECT TO AN EXCHANGE CTA + ACCOUNT / DISCLAIMER / SIGN OUT.
          No operator pulse ribbon, no admin telemetry, no engine
          throughput strip, no SearchBar, no AI ring, no
          AIRiskControlsPanel, no OperatorTelemetryStrip. This is a
          customer-facing surface, not an internal operator terminal.
          (EnableLiveAITradingBar is mounted further down — directly
          above the battlefield — as the primary PAPER → LIVE
          conversion surface; it is NOT operator ARM LIVE.) */}
      <CustomerTopHeader
        isExchangeConnected={false}
        plan={plan}
        onConnect={() => plan === "free" ? setUpgrade(true) : setConnectOpen(true)}
        onSignOut={() => void portalSignOut()}
        onAccount={() => setAccount(true)}
        onDisclaimer={() => setDisclaimer(true)}
        onNotifications={() => setAccount(true)}
      />
      {engineStatus?.dataFeedHealth && !engineStatus.dataFeedHealth.healthy && (
        <DataFeedBanner health={engineStatus.dataFeedHealth} />
      )}

      <main className="cd-workspace" style={{
        flex: 1, width: "100%", maxWidth: 2200, margin: "0 auto",
        padding: "22px 18px", display: "flex", flexDirection: "column", gap: 16,
        position: "relative",
      }}>
        {/* Ambient workspace scan — neon hairline sweeps left→right
            every 22s at low opacity. Reduced-motion umbrella halts it. */}
        <span aria-hidden style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: "8%",
          background: "linear-gradient(90deg, transparent 0%, rgba(102,255,102,0.40) 50%, transparent 100%)",
          animation: "workspace-scan 22s linear infinite",
          pointerEvents: "none", zIndex: 0,
        }} />

        {/* LIVE OPPORTUNITY BATTLEFIELD framing — visually the start of
            the page, exactly per direction. */}
        <CustomerBattlefieldHeader engine={engineStatus} />

        {/* Unified LIVE AI CRYPTO EXECUTION bar — single bar spanning
            both columns (PAPER, readonly, no ARM LIVE per locked
            customer invariant). */}
        <LiveControlBar assetClass="CRYPTO" state="PAPER" />

        {/* Phase 3 — Today's Intelligence Panel. Customer-only social
            proof + performance storytelling above the battlefield.
            Sources: paperStats (today's PnL, win rate), paperHistory
            (today's closed trades), engineStatus (active signals + avg
            conviction). NEVER mounted on /command — this entire shell
            isn't reached from /command. */}
        {/* Phase 5 — Welcome-Back retention banner. Compares localStorage
            lastSeenAt with current opps/history. Renders only when away
            ≥ 30min, auto-dismisses after 12s. Customer-only. */}
        <WelcomeBackBanner
          opportunities={opportunities}
          history={paperHistory}
        />

        <TodaysIntelligencePanel
          todayPnl={paperStats.todayPnl}
          equity={paperStats.equity || STARTING_EQUITY}
          history={paperHistory}
          engine={engineStatus}
          opportunities={opportunities}
        />

        {/* Phase 4 — AI Personality Narrator + Phase 5 risk posture pill.
            Conversational intelligence strip rotates contextual
            observations derived from live engine + opportunity state.
            Customer-only. Sparse, premium, never chatty. */}
        <AINarratorStrip
          opportunities={opportunities}
          engine={engineStatus}
          history={paperHistory}
          openCount={openTrades.length}
          posture={portalPosture}
          plan={plan}
        />

        {/* Phase 5 — Performance Credibility strip. Discipline-forward
            trust indicators: verified paper performance, rolling 7d win
            rate, median hold duration, AI funnel (evaluated/entered),
            and risk gates triggered today. Customer-only. */}
        <CredibilityStrip
          history={paperHistory}
          engine={engineStatus}
        />

        {/* Phase 7 — Elite Intelligence Chip. Renders ONLY when an
            opportunity has crossed 90 conviction (`eliteActive`). For
            PRO: full readout of the top elite — symbol, score,
            direction, "TRACKING" verb. For FREE/STARTER: subtle
            "ELITE MOMENT DETECTED" pill with a "PRO unlocks deeper
            view" CTA. Communicates exclusivity without casino energy.
            Mounts above the battlefield so the escalation reads in
            sequence with the elite border glow. */}
        {eliteActive && (
          <EliteIntelligenceChip
            opportunities={opportunities}
            plan={plan}
          />
        )}

        {/* Phase 4 — Notification Intelligence dispatcher. Headless;
            mounts toast watchers for ELITE signals, conviction threshold
            crossings, and high-volatility regime shifts. Customer-only. */}
        <SignalNotificationDispatcher
          opportunities={opportunities}
          engine={engineStatus}
        />

        {/* Phase 8.1 follow-up — ENABLE LIVE AI TRADING conversion strip.
            Customer onboarding UX directly above the battlefield. The
            bar has three visual states (driven by useAiTradingState):
              · LOCKED (free, non-admin) → amber UPGRADE TO ENABLE AI
                TRADING surface, click → upgrade modal
              · OFF (entitled but disabled) → saturated red CLICK TO
                ENABLE AI TRADING surface
              · ON → green AI CURRENTLY TRADING FOR YOU surface
            This is NOT operator ARM LIVE — it's the customer paper-side
            conversion lever (server gate `customer_live_execution_
            disabled` still blocks real-money fills on the customer
            surface; admin operator path is wholly separate). PAPER
            posture, customer scope, no LIVE execution toggles, no
            operator telemetry leakage. */}
        <EnableLiveAITradingBar
          engineOnline={!!engineStatus?.running}
          openPaper={openTrades.length}
          slotCap={plan === "pro" ? 12 : plan === "starter" ? 3 : 3}
          onUpgrade={() => setUpgrade(true)}
        />

        {/* Battlefield body — dual crypto matrix on the left,
            MY ACCOUNT rail (380px) on the right with PERFORMANCE
            chart + LIVE TRADES + TRADE HISTORY.

            Phase 8.1 — AI ACTIVITY panel removed from the customer rail.
            Customer portal emphasis is SIGNALS → ACCOUNT → TRADES;
            backend engine telemetry stays on the operator surface only.
            The freed vertical space is redistributed into LIVE TRADES
            and TRADE HISTORY (CustomerBlotterShell maxHeight 360 → 560).
            /command continues to render its own AiActivityFeed —
            this removal is scoped strictly to PortalCustomerShell. */}
        <section
          className={`grid cd-customer-battlefield-grid${eliteActive ? " cd-elite-glow" : ""}`}
          style={{
            gap: 14, alignItems: "start",
          }}
        >
          <div
            className="grid cd-customer-battlefield-matrix"
            style={{ gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "start" }}
          >
            {/* TOP CRYPTO SIGNALS — sorted LONG-then-SHORT by AI
                confidence DESC inside SignalsRow (5pt bucket stability
                guard prevents 1-2pt jitter while real conviction moves
                cleanly re-order). The `.cd-customer-battlefield-matrix`
                wrapper applies a customer-only vertical mask: top rows
                (high confidence ≥80) read at full intensity, bottom rows
                (low confidence) gracefully fade — making confidence
                dominance read pre-attentively. /command admin terminal
                does NOT use this wrapper, so it remains untouched.

                Phase 8.1 — each column is locked to a 10-row visible
                viewport via CSS (.cd-customer-battlefield-matrix
                .blotter-scroll max-height override). Internal scroll
                kicks in after row 10 so the right-rail account /
                trades telemetry stays above the fold on laptop heights.

                Phase 8.1 — the MAJORS panel header label "TOP 30 CRYPTO
                MAJORS" (set inside the shared SignalsRow.tsx, used by
                /command as well) is replaced VISUALLY ONLY for the
                customer surface via the `.cd-customer-majors-panel`
                wrapper below. The underlying CryptoMajorsSignalsPanel
                JSX and /command rendering stay byte-identical. */}
            <div className="cd-customer-majors-panel">
              <CryptoMajorsSignalsPanel engine={engineStatus as unknown as InstitutionalEngineStatus | undefined} />
            </div>
            {/* ALTS & MEMECOINS — same sort contract. */}
            <CryptoAltsMemesPanel    engine={engineStatus as unknown as InstitutionalEngineStatus | undefined} />
          </div>

          <aside className="cd-customer-battlefield-aside" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <MyAccountRailPaper
              equityUsd={paperStats.equity || STARTING_EQUITY}
              todayPnl={paperStats.todayPnl}
              realized={paperStats.realizedPnl}
              unrealized={paperStats.unrealizedPnl}
              fillsToday={paperHistory.filter(t => new Date(t.closedAt).toDateString() === new Date().toDateString()).length}
              openCount={openTrades.length}
              history={paperHistory}
              engine={engineStatus}
            />
            <CustomerBlotterPanelOpen rows={openTrades} />
            <CustomerBlotterPanelHistory rows={paperHistory} />
          </aside>
        </section>
      </main>

      <UpgradeModal    open={upgrade}    onClose={() => setUpgrade(false)} gate={disclaimerGate} />
      <AccountModal    open={account}    onClose={() => setAccount(false)} tier={plan} onUpgrade={() => setUpgrade(true)} />
      <DisclaimerModal open={disclaimer} onClose={() => setDisclaimer(false)} />
      {/* PortalExchangeConnectModal — `liveExchangesEnabled` unlocks the
          full live exchange catalog (Kraken, Coinbase, Crypto.com,
          Binance, Gemini). Previously hard-coded `false` here, which
          rendered every non-Alpaca tile as LIVE GATED for ALL customers
          — including operator-granted complimentary users and paying
          Starter/Pro subscribers who are entitled to live execution.
          `plan` is already complimentary-aware (see useCustomerPlan
          above which collapses isComplimentary → effectivePlan), so a
          simple `plan !== "free"` check correctly admits paid +
          complimentary users while still gating true free accounts.
          Admins always unlock. Server-side `requirePlan("starter")` +
          per-user visibility remain authoritative — UI gate is purely
          presentational here. */}
      <PortalExchangeConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        liveExchangesEnabled={isAdmin || plan !== "free"}
      />
      {disclaimerGateModal}

      {/* MOBILE BOTTOM NAV — visible ≤768px only (CSS-gated via
          .cd-mobile-bottom-nav media query). Customer-only; admin
          /command never mounts PortalCustomerShell so this never
          renders for operators. Five primary actions, all
          touch-optimized (52px min-height, large hit areas). */}
      <MobileBottomNav
        onSignals={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onConnect={() => plan === "free" ? setUpgrade(true) : setConnectOpen(true)}
        onAccount={() => setAccount(true)}
        onAlerts={() => setAccount(true)}
        onSignOut={() => void portalSignOut()}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Phase 3 — TodaysIntelligencePanel                                          */
/* Customer-only social-proof + storytelling band that sits above the         */
/* battlefield matrix. Reads paper trade history (today only), live engine    */
/* status, and computes win-rate + total realized + best signal. Designed     */
/* to make the customer feel "I have access to institutional-grade AI" — not  */
/* "I'm looking at engineering telemetry." Admin /command never reaches this  */
/* file, so the panel never appears on the operator surface.                  */
/* ──────────────────────────────────────────────────────────────────────── */
function TodaysIntelligencePanel({
  todayPnl, equity, history, engine, opportunities,
}: {
  todayPnl: number;
  equity:   number;
  history:  ReadonlyArray<{ symbol: string; display: string; pnl: number; pnlPct: number; closedAt: number }>;
  engine:   EngineLite | undefined;
  opportunities: ReadonlyArray<OpportunityVM>;
}) {
  const today = useMemo(() => {
    const now    = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const closedToday = history.filter(h => h.closedAt >= cutoff);
    const wins   = closedToday.filter(h => h.pnl > 0);
    const losses = closedToday.filter(h => h.pnl < 0);
    const realized = closedToday.reduce((s, h) => s + h.pnl, 0);
    const winRate  = closedToday.length > 0
      ? Math.round((wins.length / closedToday.length) * 100)
      : null;
    const best = closedToday.reduce<{ display: string; pnl: number; pnlPct: number } | null>(
      (acc, h) => (acc && acc.pnl >= h.pnl) ? acc : { display: h.display, pnl: h.pnl, pnlPct: h.pnlPct },
      null,
    );
    // Phase 4 storytelling: trailing win streak from most-recent closes.
    let streak = 0;
    const ordered = [...history].sort((a, b) => b.closedAt - a.closedAt);
    for (const h of ordered) {
      if (h.pnl > 0) streak++; else break;
    }
    return {
      count: closedToday.length, wins: wins.length, losses: losses.length,
      realized, winRate, best, streak,
    };
  }, [history]);

  // Phase 4 — highest-conviction opportunity right now (across all opps).
  const topConv = useMemo(() => {
    if (!opportunities.length) return null;
    return opportunities.reduce<OpportunityVM>((acc, o) =>
      (o.convictionScore ?? 0) > (acc.convictionScore ?? 0) ? o : acc,
      opportunities[0],
    );
  }, [opportunities]);

  const signalsActive = engine?.signalsGenerated ?? 0;
  const engineLive    = !!engine?.running;
  const pnlPct        = equity > 0 ? (todayPnl / equity) * 100 : 0;
  const pnlColor      = todayPnl >= 0 ? T.NEON : "#ff6b6b";

  return (
    <section
      aria-label="Today's intelligence"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 10,
        padding: "12px 14px",
        background: "linear-gradient(180deg, rgba(102,255,102,0.045) 0%, rgba(0,0,0,0.55) 100%)",
        border: `1px solid ${T.NEON}28`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 24px rgba(102,255,102,0.08)`,
        borderRadius: 6,
        fontFamily: T.FONT_MONO,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ambient hairline sweep */}
      <span aria-hidden style={{
        position: "absolute", top: 0, left: 0, height: 1, width: "100%",
        background: `linear-gradient(90deg, transparent, ${T.NEON}80, transparent)`,
        animation: "ti-sweep 8s linear infinite",
      }} />
      <style>{`
        @keyframes ti-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes ti-pulse {
          0%,100% { opacity: 0.9; }
          50%     { opacity: 0.4; }
        }
      `}</style>

      <TIMetric
        label="TODAY'S PAPER PNL"
        primary={`${todayPnl >= 0 ? "+" : ""}$${Math.abs(todayPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        secondary={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% on equity`}
        color={pnlColor}
        glow
      />
      <TIMetric
        label="WIN RATE TODAY"
        primary={today.winRate != null ? `${today.winRate}%` : "—"}
        secondary={today.count > 0
          ? `${today.wins}W · ${today.losses}L · ${today.count} closed`
          : "No closed trades yet today"}
        color={today.winRate != null && today.winRate >= 50 ? T.NEON : "#FFC857"}
      />
      <TIMetric
        label="TOP SIGNAL TODAY"
        primary={today.best ? today.best.display : "—"}
        secondary={today.best
          ? `${today.best.pnl >= 0 ? "+" : ""}$${today.best.pnl.toFixed(2)} · ${today.best.pnlPct >= 0 ? "+" : ""}${today.best.pnlPct.toFixed(2)}%`
          : "Waiting for first close"}
        color={today.best && today.best.pnl >= 0 ? T.NEON : T.TEXT_2}
      />
      <TIMetric
        label="AI SIGNALS ACTIVE"
        primary={signalsActive > 0 ? signalsActive.toLocaleString() : "—"}
        secondary={engineLive ? "Engine live · scanning" : "Engine warming up"}
        color={engineLive ? T.NEON : T.TEXT_2}
        pulse={engineLive}
      />

      {/* Phase 8.2 — branded telemetry anchor. Lives inside the metrics
          grid (same `auto-fit minmax(190px)` row) so it scales with the
          telemetry HUD rather than the page header. Subtle institutional
          glow only; no floating-banner treatment. Logo height is locked
          to metric-cell rhythm via clamp() so it gracefully reduces on
          tablet/mobile without clipping. */}
      <div
        aria-label="AICandlez"
        className="cd-customer-brand-cell"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 12px",
          borderRadius: 4,
          background: "linear-gradient(180deg, rgba(102,255,102,0.06) 0%, rgba(0,0,0,0.35) 100%)",
          border: `1px solid ${T.NEON}22`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 12px rgba(102,255,102,0.06)`,
          minHeight: 60,
          overflow: "hidden",
        }}
      >
        <img
          src={aiCandlezLogoBrandCell}
          alt="AICandlez"
          draggable={false}
          style={{
            height: "clamp(28px, 4.2vw, 44px)",
            width: "auto",
            maxWidth: "100%",
            objectFit: "contain",
            filter: "drop-shadow(0 0 6px rgba(102,255,102,0.22))",
            userSelect: "none",
          }}
        />
      </div>

      {/* Phase 4 — emotional performance storytelling caption. Spans the
          full grid width via `gridColumn: 1 / -1`. Composes 2-3 narrative
          beats: opportunities scanned · highest conviction · win streak. */}
      <div style={{
        gridColumn: "1 / -1",
        marginTop: 4,
        paddingTop: 8,
        borderTop: `1px dashed ${T.NEON}22`,
        display: "flex", flexWrap: "wrap", gap: "4px 14px",
        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
        color: T.TEXT_2, lineHeight: 1.5,
      }}>
        {opportunities.length > 0 && (
          <span>
            <span style={{ color: T.TEXT_3, letterSpacing: "0.16em", fontWeight: 800 }}>
              AI HAS DETECTED{" "}
            </span>
            <span style={{ color: T.NEON, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {opportunities.length}
            </span>
            <span style={{ color: T.TEXT_2 }}> opportunities today</span>
          </span>
        )}
        {topConv && (
          <span>
            <span style={{ color: T.TEXT_3, letterSpacing: "0.16em", fontWeight: 800 }}>
              HIGHEST CONVICTION{" "}
            </span>
            <span style={{ color: T.NEON, fontWeight: 800 }}>{topConv.symbol}</span>
            <span style={{ color: T.TEXT_2 }}> · </span>
            <span style={{ color: T.NEON, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {Math.round(topConv.convictionScore ?? 0)}
            </span>
          </span>
        )}
        {today.streak >= 2 && (
          <span>
            <span style={{ color: T.TEXT_3, letterSpacing: "0.16em", fontWeight: 800 }}>
              WIN STREAK{" "}
            </span>
            <span style={{ color: T.NEON, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {today.streak}
            </span>
          </span>
        )}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Phase 4 — AINarratorStrip                                                  */
/* Conversational AI personality. Rotates contextual observations derived     */
/* from live engine + opportunity state. Institutional tone — analytical,    */
/* observant, disciplined. Never meme-y, never chatty. Customer-only.         */
/* ──────────────────────────────────────────────────────────────────────── */
function AINarratorStrip({
  opportunities, engine, history, openCount, posture, plan,
}: {
  opportunities: ReadonlyArray<OpportunityVM>;
  engine:        EngineLite | undefined;
  history:       ReadonlyArray<{ symbol: string; display: string; pnl: number; pnlPct: number; closedAt: number }>;
  openCount:     number;
  posture:       "RISK-ON" | "DEFENSIVE" | "NEUTRAL" | "LOW-VOL";
  plan:          Plan;
}) {
  // Phase 7 — Plan-aware narrator.
  // FREE/STARTER hear a clean institutional line. PRO hears the same
  // observation enriched with multi-timeframe + volatility-regime context
  // ("strengthening across 15m/1H while volatility compression breaks
  // upward"). This is a perceived-intelligence differentiator, not a
  // gate — the underlying observation is the same; PRO just gets the
  // technical "why" appended.
  const isPro = plan === "pro";
  const lines = useMemo<string[]>(() => {
    const out: string[] = [];
    if (!engine?.running) {
      out.push("AI engine warming up — synchronizing market data.");
      return out;
    }
    // Highest conviction story
    const top = [...opportunities].sort((a, b) => (b.convictionScore ?? 0) - (a.convictionScore ?? 0))[0];
    const topConv = top ? Math.round(top.convictionScore ?? 0) : 0;
    if (top && topConv >= 80) {
      const base = `AI sees strong conviction on ${top.symbol} — ${topConv} across multiple timeframes.`;
      out.push(isPro
        ? `${base} 15m/1H trend aligned with ${top.direction === "LONG" ? "expanding upside" : "downside pressure"} — volatility regime supports continuation.`
        : base);
    } else if (top && topConv >= 65) {
      const base = `AI tracking ${top.symbol} — conviction building toward confirmation.`;
      out.push(isPro
        ? `${base} Early-stage momentum on the 15m; awaiting 1H confirmation before elevating to high-conviction.`
        : base);
    }
    // Phase 5 — risk intelligence prose (institutional, restrained).
    // Phase 7 — PRO sees the second-order driver appended.
    if (posture === "RISK-ON") {
      out.push(isPro
        ? "Market regime shifting toward risk-on behavior — breadth expanding, volatility compression breaking upward."
        : "Market regime shifting toward risk-on behavior.");
    } else if (posture === "DEFENSIVE") {
      out.push(isPro
        ? "AI currently defensive — sellers pressing across majors, correlation tightening to the downside."
        : "AI currently defensive — sellers pressing across majors.");
    } else if (posture === "LOW-VOL") {
      out.push(isPro
        ? "Low-volatility environment detected — waiting for expansion. Compression regimes historically resolve directionally."
        : "Low-volatility environment detected — waiting for expansion.");
    } else {
      out.push(isPro
        ? "Two-sided tape — selective opportunities forming on both sides. Cross-asset correlation contained."
        : "Two-sided tape — selective opportunities forming on both sides.");
    }
    // Engine funnel narration
    if ((engine?.tradesBlocked ?? 0) >= 3) {
      out.push(`Risk gates elevated — ${engine?.tradesBlocked} setups filtered today.`);
    }
    // Recent close storytelling
    const recent = history[0];
    if (recent && Date.now() - recent.closedAt < 30 * 60 * 1000) {
      if (recent.pnl > 0) {
        out.push(`AI closed ${recent.display} in profit (+${recent.pnlPct.toFixed(2)}%).`);
      } else {
        out.push(`AI exited ${recent.display} — risk discipline maintained.`);
      }
    }
    // Active execution
    if (openCount > 0) {
      out.push(`${openCount} active position${openCount > 1 ? "s" : ""} under management.`);
    }
    // Quality fallback
    if (out.length === 0) {
      out.push("AI scanning — awaiting high-conviction setup.");
    }
    return out;
  }, [opportunities, engine?.running, engine?.tradesBlocked, history, openCount, posture, isPro]);

  const postureColor =
    posture === "RISK-ON"   ? T.NEON :
    posture === "DEFENSIVE" ? "#ff6b6b" :
    posture === "LOW-VOL"   ? "#FFC857" :
                              T.TEXT_2;

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (lines.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % lines.length), 6000);
    return () => clearInterval(t);
  }, [lines.length]);
  const current = lines[Math.min(idx, lines.length - 1)] ?? "";

  return (
    <div
      aria-label="AI narrator"
      aria-live="polite"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 14px",
        background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(102,255,102,0.025) 100%)",
        border: `1px solid ${T.NEON}1f`,
        borderRadius: 6,
        fontFamily: T.FONT_MONO,
        position: "relative", overflow: "hidden",
      }}
    >
      <span aria-hidden style={{
        width: 6, height: 6, borderRadius: "50%",
        background: T.NEON,
        boxShadow: `0 0 8px ${T.NEON}cc`,
        animation: "ai-narr-pulse 1.8s ease-in-out infinite",
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.22em",
        color: T.TEXT_3, textTransform: "uppercase", flexShrink: 0,
      }}>
        AI · NARRATOR
      </span>
      {/* Phase 5 — risk posture pill. Tiny chip surfacing the AI's
          current market posture (RISK-ON / DEFENSIVE / LOW-VOL /
          NEUTRAL). Color-coded; never alarmist. */}
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
        color: postureColor,
        padding: "2px 6px", borderRadius: 3,
        background: `${postureColor}14`,
        border: `1px solid ${postureColor}50`,
        textShadow: `0 0 4px ${postureColor}50`,
        flexShrink: 0,
      }}>
        POSTURE · {posture}
      </span>
      <span
        key={current}
        style={{
          fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
          color: T.TEXT_2, lineHeight: 1.35,
          animation: "ai-narr-in 380ms ease-out both",
          minWidth: 0,
        }}
      >
        {current}
      </span>
      <style>{`
        @keyframes ai-narr-pulse {
          0%,100% { opacity: 1;   transform: scale(1); }
          50%     { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes ai-narr-in {
          0%   { opacity: 0; transform: translateY(3px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        /* Phase 5 — Elite Signal Event Moment. Applied to the customer
           battlefield section when any opportunity crosses 90 conviction.
           Subtle, cinematic, never gaudy. */
        .cd-elite-glow {
          position: relative;
          border-radius: 8px;
          box-shadow:
            0 0 0 1px ${T.NEON}55,
            0 0 24px ${T.NEON}30,
            inset 0 0 18px ${T.NEON}10;
          animation: cd-elite-pulse 2.4s ease-in-out infinite;
        }
        @keyframes cd-elite-pulse {
          0%,100% {
            box-shadow:
              0 0 0 1px ${T.NEON}55,
              0 0 18px ${T.NEON}28,
              inset 0 0 14px ${T.NEON}0d;
          }
          50% {
            box-shadow:
              0 0 0 1px ${T.NEON}88,
              0 0 36px ${T.NEON}48,
              inset 0 0 22px ${T.NEON}14;
          }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Phase 7 — EliteIntelligenceChip                                            */
/* Mounts above the battlefield ONLY when an opportunity has crossed 90       */
/* conviction (eliteActive). For PRO: full readout of the top elite           */
/* (symbol, score, direction, posture verb). For FREE/STARTER: subtle         */
/* "ELITE MOMENT DETECTED" pill + intelligence-first CTA back to the          */
/* shell's UpgradeModal via the same UPGRADE_EVENT bridge used by SignalRow.  */
/* Customer-only by virtue of being rendered only inside PortalCustomerShell. */
/* ──────────────────────────────────────────────────────────────────────── */
function EliteIntelligenceChip({
  opportunities, plan,
}: {
  opportunities: ReadonlyArray<OpportunityVM>;
  plan:          Plan;
}) {
  const isPro = plan === "pro";
  const topElite = useMemo(() => {
    let best: OpportunityVM | undefined;
    let bestScore = -1;
    for (const o of opportunities) {
      const s = o.convictionScore ?? 0;
      if (s >= 90 && s > bestScore) { best = o; bestScore = s; }
    }
    return best;
  }, [opportunities]);
  if (!topElite) return null;

  const dirColor = topElite.direction === "LONG" ? "#00C853" : "#ff6b6b";
  const score    = Math.round(topElite.convictionScore ?? 0);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 14px",
        background: "linear-gradient(90deg, rgba(102,255,102,0.06) 0%, rgba(0,0,0,0.55) 60%)",
        border: `1px solid ${T.NEON}40`,
        borderRadius: 6,
        fontFamily: T.FONT_MONO,
        boxShadow: `0 0 14px ${T.NEON}22`,
      }}
    >
      <span aria-hidden style={{
        width: 6, height: 6, borderRadius: "50%",
        background: T.NEON,
        boxShadow: `0 0 8px ${T.NEON}`,
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em",
        color: T.NEON, textShadow: `0 0 6px ${T.NEON}80`,
        flexShrink: 0,
      }}>
        ◆ ELITE INTELLIGENCE
      </span>
      {isPro ? (
        <>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
            color: dirColor,
            padding: "2px 6px", borderRadius: 3,
            background: `${dirColor}14`,
            border: `1px solid ${dirColor}55`,
            textShadow: `0 0 4px ${dirColor}50`,
          }}>
            {topElite.direction} · {score}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
            color: T.TEXT_2, lineHeight: 1.35, minWidth: 0,
          }}>
            AI tracking <strong style={{ color: T.TEXT_1, fontWeight: 800 }}>{topElite.symbol}</strong>
            {" "}— conviction {score}, multi-timeframe alignment locked.
            Early-stage{" "}
            {topElite.direction === "LONG" ? "upside expansion" : "downside pressure"}.
          </span>
        </>
      ) : (
        <>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
            color: T.TEXT_3,
            padding: "2px 6px", borderRadius: 3,
            background: "transparent",
            border: `1px solid ${T.NEON}30`,
          }}>
            LOCKED · PRO
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
            color: T.TEXT_2, lineHeight: 1.35, minWidth: 0,
            filter: "blur(0.5px)",
            opacity: 0.85,
          }}>
            ELITE moment detected — full conviction trajectory + regime
            commentary available on PRO.
          </span>
          <button
            type="button"
            onClick={() => { try { window.dispatchEvent(new CustomEvent(UPGRADE_EVENT)); } catch { /* noop */ } }}
            aria-label="Unlock PRO elite intelligence"
            style={{
              marginLeft: "auto",
              fontFamily: T.FONT_MONO,
              fontSize: 9, fontWeight: 800, letterSpacing: "0.20em",
              color: T.NEON, textShadow: `0 0 4px ${T.NEON}80`,
              background: "rgba(0,0,0,0.55)",
              border: `1px solid ${T.NEON}60`,
              borderRadius: 3,
              padding: "4px 10px",
              cursor: "pointer",
              transition: "border-color 160ms ease, box-shadow 160ms ease",
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = T.NEON;
              e.currentTarget.style.boxShadow   = `0 0 10px ${T.NEON}60`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = `${T.NEON}60`;
              e.currentTarget.style.boxShadow   = "none";
            }}
          >
            UNLOCK
          </button>
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Phase 5 — WelcomeBackBanner                                                */
/* Retention hook. Persists lastSeenAt in localStorage and renders a brief    */
/* banner when the customer returns after ≥30 min. Composes 1-2 narrative     */
/* beats from current opportunities + closed-while-away trades. Auto-hides    */
/* after 12s. Customer-only — never reachable from /command.                  */
/* ──────────────────────────────────────────────────────────────────────── */
const WB_KEY = "aicandlez:lastSeenAt";
const WB_AWAY_MIN_MS = 30 * 60 * 1000;
function WelcomeBackBanner({
  opportunities, history,
}: {
  opportunities: ReadonlyArray<OpportunityVM>;
  history:       ReadonlyArray<{ symbol: string; display: string; pnl: number; pnlPct: number; closedAt: number }>;
}) {
  const [snapshot, setSnapshot] = useState<{ awayMs: number; closedAway: number; profitAway: number; newElite: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // One-shot read on mount; immediately update timestamp so a refresh
  // within the same session doesn't re-trigger the banner.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WB_KEY);
      const now = Date.now();
      const last = raw ? Number(raw) : NaN;
      localStorage.setItem(WB_KEY, String(now));
      if (!Number.isFinite(last)) return;
      const awayMs = now - last;
      if (awayMs < WB_AWAY_MIN_MS) return;
      const closedWhileAway = history.filter(h => h.closedAt >= last && h.closedAt <= now);
      const profitAway = closedWhileAway.reduce((s, h) => s + Math.max(h.pnl, 0), 0);
      const newElite = opportunities.filter(o => (o.convictionScore ?? 0) >= 85).length;
      // Only show if there's anything actually worth surfacing.
      if (closedWhileAway.length === 0 && newElite === 0) return;
      setSnapshot({ awayMs, closedAway: closedWhileAway.length, profitAway, newElite });
    } catch {
      /* localStorage unavailable (SSR / privacy mode) — silently skip */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!snapshot || dismissed) return;
    const t = setTimeout(() => setDismissed(true), 12_000);
    return () => clearTimeout(t);
  }, [snapshot, dismissed]);

  if (!snapshot || dismissed) return null;

  const awayLabel = (() => {
    const hours = Math.floor(snapshot.awayMs / (60 * 60 * 1000));
    if (hours >= 24) return `${Math.floor(hours / 24)}d`;
    if (hours >= 1)  return `${hours}h`;
    return `${Math.floor(snapshot.awayMs / 60000)}m`;
  })();

  return (
    <div role="status" aria-live="polite" style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "8px 12px",
      background: "linear-gradient(180deg, rgba(102,255,102,0.08) 0%, rgba(0,0,0,0.55) 100%)",
      border: `1px solid ${T.NEON}38`,
      boxShadow: `0 0 18px rgba(102,255,102,0.10)`,
      borderRadius: 6,
      fontFamily: T.FONT_MONO,
      animation: "wb-in 420ms ease-out both",
    }}>
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.22em",
        color: T.NEON, textShadow: `0 0 6px ${T.NEON}80`,
      }}>
        WELCOME BACK · {awayLabel} AWAY
      </span>
      {snapshot.newElite > 0 && (
        <span style={{ fontSize: 11, color: T.TEXT_2, fontWeight: 600 }}>
          <span style={{ color: T.NEON, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {snapshot.newElite}
          </span>{" "}
          high-conviction setup{snapshot.newElite > 1 ? "s" : ""} active
        </span>
      )}
      {snapshot.closedAway > 0 && (
        <span style={{ fontSize: 11, color: T.TEXT_2, fontWeight: 600 }}>
          AI closed{" "}
          <span style={{ color: T.NEON, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {snapshot.closedAway}
          </span>{" "}
          trade{snapshot.closedAway > 1 ? "s" : ""}
          {snapshot.profitAway > 0 && (
            <>
              {" · "}
              <span style={{ color: T.NEON, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                +${snapshot.profitAway.toFixed(2)}
              </span>{" "}
              realized
            </>
          )}
        </span>
      )}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss welcome back banner"
        style={{
          marginLeft: "auto",
          background: "transparent",
          border: `1px solid ${T.TEXT_3}40`,
          color: T.TEXT_3,
          padding: "3px 8px",
          borderRadius: 3,
          fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
          cursor: "pointer",
          fontFamily: T.FONT_MONO,
        }}
      >
        DISMISS
      </button>
      <style>{`
        @keyframes wb-in {
          0%   { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Phase 5 — CredibilityStrip                                                 */
/* Institutional trust indicators — verified paper performance, rolling 7d   */
/* win rate, median hold duration, AI funnel (evaluated/entered), and risk   */
/* gates triggered today. Discipline-forward language ("AI avoided",          */
/* "Risk gates filtered"). Customer-only.                                     */
/* ──────────────────────────────────────────────────────────────────────── */
function CredibilityStrip({
  history, engine,
}: {
  history: ReadonlyArray<{ symbol: string; display: string; pnl: number; pnlPct: number; closedAt: number; openedAt: number }>;
  engine:  EngineLite | undefined;
}) {
  const c = useMemo(() => {
    const now = Date.now();
    const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;
    const recent = history.filter(h => h.closedAt >= cutoff7d);
    const wins7d = recent.filter(h => h.pnl > 0).length;
    const winRate7d = recent.length > 0 ? Math.round((wins7d / recent.length) * 100) : null;
    const verifiedPnl = history.reduce((s, h) => s + h.pnl, 0);
    // Median hold duration across all closed trades (robust to outliers).
    const holds = history
      .map(h => h.closedAt - h.openedAt)
      .filter(d => d > 0)
      .sort((a, b) => a - b);
    const medHoldMs = holds.length > 0 ? holds[Math.floor(holds.length / 2)] : null;
    const evaluated = engine?.signalsGenerated ?? 0;
    const entered   = engine?.tradesExecuted   ?? 0;
    const blocked   = (engine?.tradesBlocked ?? 0)
                    + (engine?.mtfBlockCount ?? 0)
                    + (engine?.correlationBlocks ?? 0);
    return { winRate7d, recentCount: recent.length, verifiedPnl, medHoldMs, evaluated, entered, blocked };
  }, [history, engine?.signalsGenerated, engine?.tradesExecuted, engine?.tradesBlocked, engine?.mtfBlockCount, engine?.correlationBlocks]);

  const holdLabel = (() => {
    if (c.medHoldMs == null) return "—";
    const m = Math.round(c.medHoldMs / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  })();

  const pnlColor = c.verifiedPnl >= 0 ? T.NEON : "#ff6b6b";

  return (
    <section
      aria-label="Performance credibility"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
        padding: "10px 14px",
        background: "rgba(0,0,0,0.45)",
        border: `1px solid ${T.NEON}22`,
        borderRadius: 6,
        fontFamily: T.FONT_MONO,
      }}
    >
      <TIMetric
        label="VERIFIED PAPER P&L"
        primary={`${c.verifiedPnl >= 0 ? "+" : ""}$${Math.abs(c.verifiedPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        secondary={`${history.length} trade${history.length === 1 ? "" : "s"} on record`}
        color={pnlColor}
      />
      <TIMetric
        label="ROLLING 7D WIN RATE"
        primary={c.winRate7d != null ? `${c.winRate7d}%` : "—"}
        secondary={c.recentCount > 0
          ? `${c.recentCount} closed · last 7 days`
          : "No 7d sample yet"}
        color={c.winRate7d != null && c.winRate7d >= 50 ? T.NEON : T.TEXT_2}
      />
      <TIMetric
        label="MEDIAN HOLD"
        primary={holdLabel}
        secondary="Time-in-trade discipline"
        color={T.TEXT_2}
      />
      <TIMetric
        label="AI EVALUATED TODAY"
        primary={c.evaluated > 0 ? c.evaluated.toLocaleString() : "—"}
        secondary={c.evaluated > 0 ? `${c.entered} entered · ${Math.max(c.evaluated - c.entered, 0)} skipped` : "Warming up"}
        color={T.TEXT_2}
      />
      <TIMetric
        label="RISK GATES TRIGGERED"
        primary={c.blocked > 0 ? c.blocked.toLocaleString() : "0"}
        secondary={c.blocked > 0 ? "setups filtered today" : "No filters needed yet"}
        color={c.blocked > 0 ? "#FFC857" : T.TEXT_2}
      />
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Phase 4 — SignalNotificationDispatcher                                     */
/* Headless. Watches engine + opportunity state and dispatches sparse,        */
/* premium toasts for ELITE signal detection, conviction threshold            */
/* crossings (80, 90), and direction flips. Heavily deduped + cooldown'd     */
/* per symbol so the stream stays quiet enough to feel premium.               */
/* ──────────────────────────────────────────────────────────────────────── */
function SignalNotificationDispatcher({
  opportunities, engine,
}: {
  opportunities: ReadonlyArray<OpportunityVM>;
  engine:        EngineLite | undefined;
}) {
  // Per-symbol last-notified state. Module-scoped via ref so it survives
  // re-renders without leaking memory across pages.
  const stateRef = useRef<Map<string, { conv: number; dir: string; lastAt: number }>>(new Map());
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!engine?.running) return;
    // Skip the first pass so we don't blast a wall of toasts on mount.
    if (!bootedRef.current) {
      bootedRef.current = true;
      for (const o of opportunities) {
        stateRef.current.set(o.symbol, {
          conv: o.convictionScore ?? 0,
          dir:  o.direction,
          lastAt: 0,
        });
      }
      return;
    }
    const now = Date.now();
    const COOLDOWN_MS = 90_000; // 90s per-symbol cooldown
    let emitted = 0;
    const MAX_PER_TICK = 2;     // never spam more than 2 toasts per refresh

    for (const o of opportunities) {
      if (emitted >= MAX_PER_TICK) break;
      const prev = stateRef.current.get(o.symbol);
      const conv = o.convictionScore ?? 0;
      const dir  = o.direction;
      if (!prev) {
        stateRef.current.set(o.symbol, { conv, dir, lastAt: 0 });
        continue;
      }
      const sinceLast = now - prev.lastAt;
      if (sinceLast < COOLDOWN_MS) {
        stateRef.current.set(o.symbol, { conv, dir, lastAt: prev.lastAt });
        continue;
      }

      let title: string | null = null;
      let description = "";

      // ELITE: crossed 90
      if (prev.conv < 90 && conv >= 90) {
        title = `${o.symbol} · ELITE signal detected`;
        description = `Conviction ${Math.round(conv)} · ${dir}`;
      }
      // STRONG: crossed 80 (but not 90 in same tick)
      else if (prev.conv < 80 && conv >= 80) {
        title = `${o.symbol} crossed ${Math.round(conv)} conviction`;
        description = `AI tracking ${dir} setup`;
      }
      // Direction flip on a high-conviction name
      else if (prev.dir !== dir && conv >= 70) {
        title = `${o.symbol} flipped ${dir}`;
        description = `Conviction holding at ${Math.round(conv)}`;
      }

      if (title) {
        toast({ title, description });
        emitted++;
        stateRef.current.set(o.symbol, { conv, dir, lastAt: now });
      } else {
        stateRef.current.set(o.symbol, { conv, dir, lastAt: prev.lastAt });
      }
    }
  }, [opportunities, engine?.running]);

  return null;
}

function TIMetric({
  label, primary, secondary, color, glow, pulse,
}: {
  label:      string;
  primary:    string;
  secondary:  string;
  color:      string;
  glow?:      boolean;
  pulse?:     boolean;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 3,
      padding: "6px 10px",
      borderLeft: `2px solid ${color}40`,
      position: "relative",
    }}>
      <span style={{
        fontSize: 8.5, fontWeight: 800, letterSpacing: "0.22em",
        color: T.TEXT_3, textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em",
        color, lineHeight: 1.1,
        textShadow: glow ? `0 0 8px ${color}80` : "none",
        fontVariantNumeric: "tabular-nums",
        animation: pulse ? "ti-pulse 1.6s ease-in-out infinite" : "none",
      }}>
        {primary}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
        color: T.TEXT_2, lineHeight: 1.3,
      }}>
        {secondary}
      </span>
    </div>
  );
}

/* MobileBottomNav — sticky bottom tab strip for phones. Hidden on
   tablet/desktop via `.cd-mobile-bottom-nav` media query (display:none
   above 768px). Primary action (CONNECT) is visually elevated via
   .cd-mn-primary. */
function MobileBottomNav({
  onSignals, onConnect, onAccount, onAlerts, onSignOut,
}: {
  onSignals:  () => void;
  onConnect:  () => void;
  onAccount:  () => void;
  onAlerts:   () => void;
  onSignOut:  () => void;
}) {
  return (
    <nav className="cd-mobile-bottom-nav" aria-label="Customer portal navigation">
      <button onClick={onSignals} aria-label="Signals">
        <Target size={18} />
        <span>SIGNALS</span>
      </button>
      <button onClick={onAccount} aria-label="Account">
        <UserIcon size={18} />
        <span>ACCOUNT</span>
      </button>
      <button onClick={onConnect} aria-label="Connect exchange" className="cd-mn-primary">
        <Link2 size={20} />
        <span>CONNECT</span>
      </button>
      <button onClick={onAlerts} aria-label="Alerts">
        <Bell size={18} />
        <span>ALERTS</span>
      </button>
      <button onClick={onSignOut} aria-label="Sign out">
        <LogOut size={18} />
        <span>EXIT</span>
      </button>
    </nav>
  );
}

/* Pass 7X — CONNECT EXCHANGE primary header CTA. Larger than ToolbarBtn,
   neon-bordered with a subtle inner glow + scan sheen so it reads as the
   primary operational entry on /portal entry. Click → PortalExchangeConnectModal. */
function ConnectExchangeBtn({ onClick, gated = false }: { onClick: () => void; gated?: boolean }) {
  const baseBg = gated
    ? `linear-gradient(180deg, rgba(102,255,102,0.08) 0%, rgba(102,255,102,0.03) 100%)`
    : `linear-gradient(180deg, rgba(102,255,102,0.16) 0%, rgba(102,255,102,0.06) 100%)`;
  const baseShadow = gated
    ? `0 0 0 1px rgba(102,255,102,0.10), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 16px rgba(102,255,102,0.10)`
    : `0 0 0 1px rgba(102,255,102,0.16), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 24px rgba(102,255,102,0.18)`;
  const hoverBg = gated
    ? `linear-gradient(180deg, rgba(102,255,102,0.14) 0%, rgba(102,255,102,0.06) 100%)`
    : `linear-gradient(180deg, rgba(102,255,102,0.24) 0%, rgba(102,255,102,0.10) 100%)`;
  const hoverShadow = gated
    ? `0 0 0 1px rgba(102,255,102,0.18), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 22px rgba(102,255,102,0.18)`
    : `0 0 0 1px rgba(102,255,102,0.28), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 36px rgba(102,255,102,0.28)`;
  return (
    <button
      onClick={onClick}
      title={gated ? "Upgrade to connect a live exchange" : "Connect a live exchange"}
      style={{
        padding: "9px 18px",
        fontFamily: T.FONT_MONO, fontSize: 12, fontWeight: 800,
        letterSpacing: T.TRACK_LABEL,
        background: baseBg,
        border: `1px solid ${gated ? "rgba(102,255,102,0.45)" : T.NEON}`,
        color: gated ? "rgba(102,255,102,0.78)" : T.NEON,
        cursor: "pointer",
        transition: T.TX_FAST,
        boxShadow: baseShadow,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        display: "inline-flex", alignItems: "center", gap: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background  = hoverBg;
        e.currentTarget.style.boxShadow   = hoverShadow;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background  = baseBg;
        e.currentTarget.style.boxShadow   = baseShadow;
      }}
    >
      CONNECT EXCHANGE
      {gated && (
        <span aria-hidden style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700, letterSpacing: T.TRACK_LABEL,
          padding: "1px 5px",
          border: `1px solid rgba(102,255,102,0.45)`,
          color: "rgba(102,255,102,0.85)",
        }}>PRO</span>
      )}
    </button>
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
