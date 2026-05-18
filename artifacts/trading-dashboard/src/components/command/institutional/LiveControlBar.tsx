/**
 * LiveControlBar — cinematic institutional "ENABLE LIVE AI TRADING" bar.
 *
 * One instance is rendered DIRECTLY above each signal section
 * (crypto / equities). Asset-class scoped.
 *
 *   States:
 *   ─────────────────────────────────────────────────────────────────────────
 *   SIMULATION  matte black · neutral border · "ARM EXECUTION"
 *   LIVE        gold/orange glow · animated pulse · sweep · "ACTIVE"
 *   PAUSED      amber border · halted · "PAUSED"
 */

import { Zap, Pause, Activity } from "lucide-react";
import { N } from "./theme";

type State = "LIVE" | "SIMULATION" | "PAUSED";

interface Props {
  assetClass: "CRYPTO" | "EQUITIES";
  state:      State;
  onToggle:   () => void;
}

const KEYFRAMES = `
@keyframes live-bar-sweep {
  0%   { transform: translateX(-30%); }
  100% { transform: translateX(130%); }
}
@keyframes live-bar-pulse {
  0%, 100% { box-shadow: 0 0 24px var(--lbc), inset 0 0 22px var(--lbcI); }
  50%      { box-shadow: 0 0 44px var(--lbc), inset 0 0 32px var(--lbcI); }
}
@keyframes live-bar-dot {
  0%, 100% { transform: scale(1);    box-shadow: 0 0 10px var(--lbc), 0 0 22px var(--lbc); }
  50%      { transform: scale(1.35); box-shadow: 0 0 18px var(--lbc), 0 0 36px var(--lbc); }
}
`;

export function LiveControlBar({ assetClass, state, onToggle }: Props) {
  const isLive   = state === "LIVE";
  const isPaused = state === "PAUSED";

  const color =
    isLive   ? N.GOLD       :
    isPaused ? N.WARN       :
               N.TEXT_2;

  const colorBrt =
    isLive   ? N.GOLD_BRT   :
    isPaused ? N.WARN       :
               N.TEXT_1;

  const label =
    isLive
      ? `LIVE AI ${assetClass} TRADING · ACTIVE`
      : isPaused
      ? `LIVE AI ${assetClass} TRADING · PAUSED`
      : `ENABLE LIVE AI ${assetClass} TRADING`;

  const subLabel =
    isLive
      ? "EXECUTION ENGINE ENGAGED · OPERATOR · UNLIMITED · CLICK TO HALT"
      : isPaused
      ? "EXECUTION HALTED · CLICK TO RESUME"
      : "PRESS TO ARM EXECUTION ENGINE · OPERATOR · UNLIMITED";

  const statusPillBg = isLive ? `${color}22` : isPaused ? `${color}18` : "transparent";

  return (
    <>
      <style>{KEYFRAMES}</style>
      <button
        onClick={onToggle}
        className="w-full text-left"
        style={{
          // CSS vars consumed by keyframes
          ["--lbc" as string]: `${color}80`,
          ["--lbcI" as string]: `${color}28`,
          position: "relative",
          background: isLive
            ? `linear-gradient(90deg, #000 0%, ${N.GOLD_DEEP}1f 50%, #000 100%)`
            : isPaused
            ? `linear-gradient(90deg, #000 0%, ${color}10 50%, #000 100%)`
            : "linear-gradient(90deg, #000 0%, #050905 50%, #000 100%)",
          border: `1.5px solid ${color}${isLive ? "" : isPaused ? "66" : "33"}`,
          borderRadius: 6,
          padding: "18px 22px",
          minHeight: 78,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          cursor: "pointer",
          overflow: "hidden",
          boxShadow: isLive
            ? `0 0 32px ${color}55, inset 0 0 24px ${color}1c`
            : isPaused
            ? `0 0 16px ${color}30`
            : "none",
          animation: isLive ? "live-bar-pulse 2.4s ease-in-out infinite" : "none",
          transition: "border-color 200ms ease, box-shadow 200ms ease",
        }}
        onMouseEnter={(e) => {
          if (!isLive) {
            e.currentTarget.style.boxShadow = `0 0 22px ${color}50, inset 0 0 18px ${color}18`;
            e.currentTarget.style.borderColor = color;
          }
        }}
        onMouseLeave={(e) => {
          if (!isLive) {
            e.currentTarget.style.boxShadow = isPaused ? `0 0 16px ${color}30` : "none";
            e.currentTarget.style.borderColor = `${color}${isPaused ? "66" : "33"}`;
          }
        }}
      >
        {/* LIVE sweep highlight — diagonal moving gleam */}
        {isLive && (
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
          <span style={{
            width: 50, height: 50, borderRadius: 6,
            background: isLive ? `${color}22` : isPaused ? `${color}18` : "#050905",
            border: `1.5px solid ${color}${isLive ? "" : isPaused ? "70" : "40"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isLive ? `0 0 18px ${color}70, inset 0 0 12px ${color}40` : "none",
            flexShrink: 0,
          }}>
            {isPaused
              ? <Pause    size={24} style={{ color }} />
              : isLive
              ? <Activity size={24} style={{ color: colorBrt, animation: "neon-pulse 1.1s infinite", filter: `drop-shadow(0 0 6px ${color})` }} />
              : <Zap      size={24} style={{ color }} />}
          </span>

          <div className="flex flex-col items-start">
            <span style={{
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: "0.24em",
              color: isLive ? colorBrt : color,
              fontFamily: N.FONT_MONO,
              textShadow: isLive
                ? `0 0 12px ${color}, 0 0 22px ${color}80`
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
              color: isLive ? `${N.GOLD_BRT}cc` : N.TEXT_3,
              fontFamily: N.FONT_MONO,
              whiteSpace: "nowrap",
            }}>
              {subLabel}
            </span>
          </div>
        </div>

        {/* RIGHT — large status pill (LIVE / PAUSED / SIMULATION) */}
        <div className="flex items-center" style={{ gap: 12, pointerEvents: "none", zIndex: 1, flexShrink: 0 }}>
          <span style={{
            width: 12, height: 12, borderRadius: 12,
            background: color,
            boxShadow: `0 0 10px ${color}, 0 0 22px ${color}`,
            animation: isLive ? "live-bar-dot 1.2s ease-in-out infinite" : "none",
          }} />
          <span style={{
            padding: "8px 14px",
            borderRadius: 4,
            background: statusPillBg,
            border: `1.5px solid ${color}${isLive ? "" : isPaused ? "66" : "40"}`,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.32em",
            color: isLive ? colorBrt : color,
            fontFamily: N.FONT_MONO,
            textShadow: isLive ? `0 0 10px ${color}` : "none",
            boxShadow: isLive ? `0 0 14px ${color}55, inset 0 0 8px ${color}30` : "none",
          }}>
            {state}
          </span>
        </div>
      </button>
    </>
  );
}
