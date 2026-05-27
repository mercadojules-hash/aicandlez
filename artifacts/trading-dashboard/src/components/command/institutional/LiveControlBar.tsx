/**
 * LiveControlBar — cinematic institutional "ENABLE LIVE AI TRADING" bar.
 *
 * One instance is rendered DIRECTLY above each signal section
 * (crypto / equities). Asset-class scoped.
 *
 *   Operator-facing states (institutional language — no "SIMULATION"):
 *   ─────────────────────────────────────────────────────────────────────────
 *   STANDBY     matte black · muted neutral border · no glow · "ARM EXECUTION"
 *   LIVE        orange/gold glow · animated pulse · sweep · "EXECUTION ARMED"
 *   PAUSED      red emergency stop · red pulse · "EXECUTION HALTED"
 *
 * Designed to feel like a Bloomberg / hedge-fund execution arming switch —
 * high-stakes, visually intentional, communicates state instantly.
 */

import type { ReactNode } from "react";
import { Zap, OctagonAlert, Activity, Ban, ShieldCheck } from "lucide-react";
import { N } from "./theme";

// Visual vocabulary used across customer portal, admin portal, and
// /command. New canonical states (HALTED/ARMED/EXECUTING) drive the bars
// when fed from useExecutionState. Legacy operator states (LIVE/STANDBY/
// PAUSED) remain supported for back-compat with the existing /command
// arm-switch interaction.
type State = "LIVE" | "STANDBY" | "PAUSED" | "ARMED" | "EXECUTING" | "HALTED" | "PAPER";

const PILL_LABEL: Record<State, string> = {
  LIVE:      "EXECUTING",
  EXECUTING: "EXECUTING",
  ARMED:     "ARMED",
  STANDBY:   "STANDBY",
  PAUSED:    "HALTED",
  HALTED:    "HALTED",
  PAPER:     "PAPER",
};

interface Props {
  assetClass: "CRYPTO" | "EQUITIES";
  state:      State;
  /** Omit to render a read-only status bar (no click affordance). */
  onToggle?:  () => void;
  /**
   * Confidence-threshold eligibility (hard rule: 80%+ to arm live execution).
   * When `eligible === false` AND state is STANDBY, the toggle is disabled
   * and the UI shows "BELOW EXECUTION THRESHOLD". Has no effect once the
   * engine is already LIVE/PAUSED — operator can still halt/reset.
   * Defaults to `true` for backwards compatibility.
   */
  eligible?:           boolean;
  /** Optional sub-label addendum when not eligible (e.g. "MAX 72% · NEED 80%"). */
  eligibilityReason?:  string;
  /**
   * Optional override for the leading 50×50 icon tile (left of the label).
   * Customer portal passes the AICandlez logo here so the bar doubles as
   * the brand anchor for the live-intelligence strip. /command call sites
   * omit it and keep the default state-driven icon (Zap / Activity / etc).
   */
  leadingSlot?:        ReactNode;
  /**
   * Phase 8.4 — customer subscription-aware copy override. When the
   * customer plan = STARTER or PRO (`customerEntitled === true`) AND
   * `state === "PAPER"`, the bar swaps its sim language for a premium
   * "ENABLE LIVE AI CRYPTO TRADING" CTA and a "LIVE READY" pill. This
   * is UX intelligence only — no LIVE execution wiring changes;
   * server-side kill switch + concurrent caps still govern fills.
   * Default false. /command never passes this prop → byte-identical.
   */
  customerEntitled?:   boolean;
}

const KEYFRAMES = `
@keyframes live-bar-sweep {
  0%   { transform: translateX(-30%); }
  100% { transform: translateX(130%); }
}
@keyframes live-bar-pulse {
  0%, 100% { box-shadow: 0 0 9px var(--lbc), inset 0 0 22px var(--lbcI); }
  50%      { box-shadow: 0 0 16px var(--lbc), inset 0 0 32px var(--lbcI); }
}
@keyframes live-bar-dot {
  0%, 100% { transform: scale(1);    box-shadow: 0 0 7px var(--lbc), 0 0 22px var(--lbc); }
  50%      { transform: scale(1.35); box-shadow: 0 0 7px var(--lbc), 0 0 36px var(--lbc); }
}
@keyframes halt-bar-pulse {
  0%, 100% { box-shadow: 0 0 7px var(--lbc), inset 0 0 14px var(--lbcI); border-color: var(--lbcB1); }
  50%      { box-shadow: 0 0 13px var(--lbc), inset 0 0 22px var(--lbcI); border-color: var(--lbcB2); }
}
@keyframes halt-bar-dot {
  0%, 100% { transform: scale(1);    opacity: 0.85; box-shadow: 0 0 7px var(--lbc); }
  50%      { transform: scale(1.25); opacity: 1;    box-shadow: 0 0 8px var(--lbc), 0 0 40px var(--lbc); }
}
`;

export function LiveControlBar({
  assetClass,
  state,
  onToggle,
  eligible = true,
  eligibilityReason,
  leadingSlot,
  customerEntitled = false,
}: Props) {
  // Visual buckets: LIVE/EXECUTING share the gold pulsing treatment;
  // PAUSED/HALTED share the red emergency-stop treatment; ARMED is the
  // new neon-green ready state surfaced by useExecutionState.
  const isExecuting = state === "LIVE" || state === "EXECUTING";
  const isHalted    = state === "PAUSED" || state === "HALTED";
  const isArmedRdy  = state === "ARMED";
  // PAPER — customer simulated-trading mode. Neon-green soft glow,
  // no order-firing animation, read-only by design. Reuses the ARMED
  // visual treatment with a distinct pill + label.
  const isPaper     = state === "PAPER";
  // Back-compat shims so the existing animation/branch code keeps working.
  const isLive   = isExecuting;
  const isPaused = isHalted;

  const readOnly = typeof onToggle !== "function";

  // Eligibility constrains any HALTED/STANDBY → ARMED transition. Once the
  // engine is EXECUTING, the operator must always retain the ability to halt
  // it. ARMED is already eligibility-cleared upstream by the server hook.
  const blocked = !isExecuting && !isArmedRdy && !eligible;

  // Platform visual language (Task #164 — locked):
  //   EXECUTING → orange/gold (hot, actively firing orders)
  //   ARMED     → orange/gold (live execution armed = live-class state)
  //   PAPER     → neon green  (simulated mode — ONLY green state)
  //   HALTED    → red         (emergency stop / kill switch)
  //   STANDBY   → muted neutral (idle, system safe — back-compat)
  // Rule: ORANGE = any live affordance (armed or executing).
  // GREEN is reserved for paper/simulated mode only.
  const color =
    isExecuting ? N.GOLD       :
    isArmedRdy  ? N.GOLD       :
    isPaper     ? N.BRAND      :
    isHalted    ? N.DANGER     :
                  N.TEXT_2;

  const colorBrt =
    isExecuting ? N.GOLD_BRT   :
    isArmedRdy  ? N.GOLD_BRT   :
    isPaper     ? N.BRAND_BRT  :
    isHalted    ? N.DANGER_BRT :
                  N.TEXT_1;

  // Phase 8.4 — customer subscription-aware label override. When the
  // customer is entitled (starter/pro) and the bar is in PAPER state,
  // surface a premium "ENABLE LIVE AI CRYPTO TRADING" CTA instead of the
  // simulation copy. This is UX only — `onToggle` is still omitted on
  // the customer surface so the bar remains read-only; real-money fills
  // remain server-gated by the kill switch + concurrent caps.
  const isCustomerLiveReady = isPaper && customerEntitled;

  const label =
    isExecuting
      ? `LIVE AI ${assetClass} EXECUTION · EXECUTING`
      : isArmedRdy
      ? `LIVE AI ${assetClass} EXECUTION · ARMED`
      : isCustomerLiveReady
      ? `ENABLE LIVE AI ${assetClass} TRADING`
      : isPaper
      ? `AI ${assetClass} PAPER TRADING · ACTIVE`
      : blocked
      ? `LIVE AI ${assetClass} EXECUTION · LOCKED`
      : isHalted
      ? `LIVE AI ${assetClass} EXECUTION · HALTED`
      : `ENABLE LIVE AI ${assetClass} EXECUTION`;

  const subLabel =
    isExecuting
      ? `EXECUTION ENGINE ENGAGED · LIVE ORDERS FIRING${readOnly ? "" : " · CLICK TO HALT"}`
      : isArmedRdy
      ? `ENGINE ARMED · AWAITING NEXT SIGNAL${readOnly ? "" : " · CLICK TO HALT"}`
      : isCustomerLiveReady
      ? `AI MONITORS MARKETS CONTINUOUSLY · NEW POSITIONS PAUSE WHEN DISABLED`
      : isPaper
      ? `SIMULATED ALPACA EXECUTION · $100,000 PAPER CAPITAL · REAL MARKET DATA`
      : blocked
      ? `BELOW EXECUTION THRESHOLD · 80% CONFIDENCE REQUIRED${eligibilityReason ? ` · ${eligibilityReason}` : ""}`
      : isHalted
      ? `EMERGENCY STOP ENGAGED · ORDERS BLOCKED${readOnly ? "" : " · CLICK TO ARM"}${eligibilityReason ? ` · ${eligibilityReason}` : ""}`
      : `LIVE EXECUTION ELIGIBLE${readOnly ? "" : " · PRESS TO ARM ENGINE"}${eligibilityReason ? ` · ${eligibilityReason}` : ""}`;

  const statusPillBg = isLive ? `${color}22` : isPaused ? `${color}18` : "transparent";

  return (
    <>
      <style>{KEYFRAMES}</style>
      <button
        onClick={blocked || readOnly ? undefined : onToggle}
        disabled={blocked}
        aria-disabled={blocked || readOnly}
        className="w-full text-left"
        style={{
          // CSS vars consumed by keyframes
          ["--lbc"   as string]: `${color}80`,
          ["--lbcI"  as string]: `${color}28`,
          ["--lbcB1" as string]: `${color}66`,
          ["--lbcB2" as string]: color,
          position: "relative",
          background: isExecuting
            ? `linear-gradient(90deg, #000 0%, ${N.GOLD_DEEP}1f 50%, #000 100%)`
            : isArmedRdy
            ? `linear-gradient(90deg, #000 0%, ${color}14 50%, #000 100%)`
            : isHalted
            ? `linear-gradient(90deg, #000 0%, ${color}10 50%, #000 100%)`
            : "linear-gradient(90deg, #000 0%, #050905 50%, #000 100%)",
          border: `1.5px solid ${color}${isExecuting ? "" : isArmedRdy ? "88" : isHalted ? "66" : "33"}`,
          borderRadius: 6,
          padding: "18px 22px",
          minHeight: 78,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          cursor: blocked ? "not-allowed" : readOnly ? "default" : "pointer",
          opacity: blocked ? 0.55 : 1,
          overflow: "hidden",
          boxShadow: isExecuting
            ? `0 0 32px ${color}55, inset 0 0 24px ${color}1c`
            : isArmedRdy
            ? `0 0 22px ${color}50, inset 0 0 16px ${color}1c`
            : isHalted
            ? `0 0 18px ${color}50, inset 0 0 14px ${color}28`
            : "none",
          animation:
            isExecuting ? "live-bar-pulse 2.4s ease-in-out infinite" :
            isArmedRdy  ? "live-bar-pulse 3.6s ease-in-out infinite" :
            isHalted    ? "halt-bar-pulse 1.4s ease-in-out infinite" :
                          "none",
          transition: "border-color 200ms ease, box-shadow 200ms ease",
        }}
        onMouseEnter={(e) => {
          if (!isExecuting && !isHalted && !isArmedRdy && !blocked && !readOnly) {
            e.currentTarget.style.boxShadow = `0 0 22px ${color}50, inset 0 0 18px ${color}18`;
            e.currentTarget.style.borderColor = color;
          }
        }}
        onMouseLeave={(e) => {
          if (!isExecuting && !isHalted && !isArmedRdy) {
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.borderColor = `${color}33`;
          }
        }}
      >
        {/* Sweep highlight — diagonal moving gleam during EXECUTING only. */}
        {isExecuting && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: "30%",
              height: "100%",
              background: `linear-gradient(90deg, transparent 0%, ${N.GOLD_BRT}30 50%, transparent 100%)`,
              filter: "blur(6px)",
              animation: "live-bar-sweep 3.6s linear infinite",
              pointerEvents: "none",
            }}
          />
        )}

        {/* LEFT — icon + label + sublabel */}
        <div className="flex items-center" style={{ gap: 16, pointerEvents: "none", zIndex: 1 }}>
          {leadingSlot != null ? (
            /* Customer hero-brand mode — no boxed treatment. The slot renders
               transparent, vertically centered, with its own breathing room
               so a brand mark / logo can act as the terminal anchor. */
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "flex-start",
              flexShrink: 0, paddingRight: 4,
            }}>
              {leadingSlot}
            </span>
          ) : (
            <span style={{
              width: 50, height: 50, borderRadius: 6,
              background: isExecuting ? `${color}22` : isArmedRdy ? `${color}1a` : isHalted ? `${color}18` : "#050905",
              border: `1.5px solid ${color}${isExecuting ? "" : isArmedRdy ? "88" : isHalted ? "70" : "40"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: isExecuting
                ? `0 0 18px ${color}70, inset 0 0 12px ${color}40`
                : isArmedRdy
                ? `0 0 14px ${color}60, inset 0 0 10px ${color}30`
                : "none",
              flexShrink: 0,
            }}>
              {isHalted
                ? <OctagonAlert size={24} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
                : isExecuting
                ? <Activity     size={24} style={{ color: colorBrt, animation: "neon-pulse 1.1s infinite", filter: `drop-shadow(0 0 4px ${color})` }} />
                : isArmedRdy
                ? <ShieldCheck  size={24} style={{ color: colorBrt, filter: `drop-shadow(0 0 4px ${color})` }} />
                : blocked
                ? <Ban          size={24} style={{ color: N.TEXT_3 }} />
                : <Zap          size={24} style={{ color }} />}
            </span>
          )}

          <div className="flex flex-col items-start">
            <span style={{
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: "0.24em",
              color: isExecuting || isArmedRdy ? colorBrt : color,
              fontFamily: N.FONT_MONO,
              textShadow: isExecuting
                ? `0 0 12px ${color}, 0 0 22px ${color}80`
                : isArmedRdy
                ? `0 0 10px ${color}, 0 0 18px ${color}66`
                : "none",
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}>
              {label}
            </span>
            <span style={{
              marginTop: 4,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.22em",
              color: isExecuting ? `${N.GOLD_BRT}cc` : isArmedRdy ? `${N.BRAND_BRT}cc` : N.TEXT_3,
              fontFamily: N.FONT_MONO,
              whiteSpace: "nowrap",
            }}>
              {subLabel}
            </span>
          </div>
        </div>

        {/* RIGHT — large status pill (EXECUTING / ARMED / HALTED / STANDBY) */}
        <div className="flex items-center" style={{ gap: 12, pointerEvents: "none", zIndex: 1, flexShrink: 0 }}>
          <span style={{
            width: 12, height: 12, borderRadius: 12,
            background: color,
            boxShadow: `0 0 7px ${color}, 0 0 8px ${color}`,
            animation:
              isExecuting ? "live-bar-dot 1.2s ease-in-out infinite" :
              isArmedRdy  ? "live-bar-dot 2.0s ease-in-out infinite" :
              isHalted    ? "halt-bar-dot 1.1s ease-in-out infinite" :
                            "none",
          }} />
          <span style={{
            padding: "8px 14px",
            borderRadius: 4,
            background: isExecuting ? `${color}22` : isArmedRdy ? `${color}1a` : isHalted ? `${color}18` : "transparent",
            border: `1.5px solid ${color}${isExecuting ? "" : isArmedRdy ? "88" : isHalted ? "66" : "40"}`,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.32em",
            color: isExecuting || isArmedRdy ? colorBrt : color,
            fontFamily: N.FONT_MONO,
            textShadow: isExecuting || isArmedRdy ? `0 0 7px ${color}` : "none",
            boxShadow: isExecuting
              ? `0 0 14px ${color}55, inset 0 0 8px ${color}30`
              : isArmedRdy
              ? `0 0 10px ${color}45, inset 0 0 6px ${color}22`
              : "none",
          }}>
            {isCustomerLiveReady ? "LIVE READY" : PILL_LABEL[state]}
          </span>
        </div>
      </button>
    </>
  );
}
