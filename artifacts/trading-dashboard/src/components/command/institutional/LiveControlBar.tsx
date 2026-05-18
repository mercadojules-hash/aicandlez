/**
 * LiveControlBar — large glowing institutional "ENABLE LIVE AI TRADING" bar.
 *
 * One instance is rendered above each signal section (crypto / equities).
 * Three states: LIVE (green glow, pulsing), SIMULATION (neutral), PAUSED (warn amber).
 */

import { Zap, Pause, Activity } from "lucide-react";
import { N } from "./theme";

type State = "LIVE" | "SIMULATION" | "PAUSED";

interface Props {
  assetClass: "CRYPTO" | "EQUITIES";
  state:      State;
  onToggle:   () => void;
}

export function LiveControlBar({ assetClass, state, onToggle }: Props) {
  const isLive   = state === "LIVE";
  const isPaused = state === "PAUSED";

  const color =
    isLive   ? N.BRAND :
    isPaused ? N.WARN  :
               N.TEXT_2;

  const label =
    isLive   ? `LIVE AI ${assetClass} TRADING · ACTIVE` :
    isPaused ? `LIVE AI ${assetClass} TRADING · PAUSED` :
               `ENABLE LIVE AI ${assetClass} TRADING`;

  const subLabel =
    isLive   ? "EXECUTION ENGINE ENGAGED · UNLIMITED · CLICK TO HALT"
             : isPaused
             ? "EXECUTION HALTED · CLICK TO RESUME"
             : "PRESS TO ARM EXECUTION ENGINE · OPERATOR · UNLIMITED";

  return (
    <button
      onClick={onToggle}
      className="w-full transition-all"
      style={{
        position: "relative",
        background: isLive
          ? `linear-gradient(90deg, #000 0%, ${color}10 50%, #000 100%)`
          : "#000",
        border: `1px solid ${color}${isLive ? "" : "40"}`,
        borderRadius: 4,
        padding: "12px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        overflow: "hidden",
        boxShadow: isLive ? `0 0 24px ${color}40, inset 0 0 18px ${color}10` : "none",
        animation: isLive ? "edge-sweep 6s linear infinite" : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 28px ${color}55, inset 0 0 20px ${color}18`;
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = isLive
          ? `0 0 24px ${color}40, inset 0 0 18px ${color}10`
          : "none";
        e.currentTarget.style.borderColor = `${color}${isLive ? "" : "40"}`;
      }}
    >
      {/* left — icon + label */}
      <div className="flex items-center gap-3" style={{ pointerEvents: "none" }}>
        <span style={{
          width: 38, height: 38, borderRadius: 4,
          background: isLive ? `${color}1c` : "transparent",
          border: `1px solid ${color}${isLive ? "70" : "40"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: isLive ? `0 0 12px ${color}40` : "none",
        }}>
          {isPaused
            ? <Pause   size={18} style={{ color }} />
            : isLive
            ? <Activity size={18} style={{ color, animation: "neon-pulse 1.2s infinite" }} />
            : <Zap     size={18} style={{ color }} />}
        </span>

        <div className="flex flex-col items-start text-left">
          <span className="text-[13px] font-extrabold tracking-[0.22em]"
            style={{
              color,
              fontFamily: N.FONT_MONO,
              textShadow: isLive ? `0 0 10px ${color}70` : "none",
              lineHeight: 1.1,
            }}>
            {label}
          </span>
          <span className="text-[8.5px] font-bold tracking-[0.18em] mt-0.5"
            style={{ color: N.TEXT_3, fontFamily: N.FONT_MONO }}>
            {subLabel}
          </span>
        </div>
      </div>

      {/* right — state indicator */}
      <div className="flex items-center gap-2" style={{ pointerEvents: "none" }}>
        <span style={{
          width: 8, height: 8, borderRadius: 8,
          background: color,
          boxShadow: `0 0 10px ${color}`,
          animation: isLive ? "neon-pulse 1.2s infinite" : "none",
        }} />
        <span className="text-[11px] font-extrabold tracking-[0.28em]"
          style={{
            color,
            fontFamily: N.FONT_MONO,
            textShadow: isLive ? `0 0 10px ${color}60` : "none",
          }}>
          {state}
        </span>
      </div>
    </button>
  );
}
