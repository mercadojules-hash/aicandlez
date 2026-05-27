/**
 * RuntimeSwitcher — persistent customer chip row (Task #199).
 *
 * Layout: `[ PAPER ] [ KRAKEN ] [ COINBASE ] …`
 *   - One chip per `connectedExchanges[]` entry returned by Task #198's
 *     aggregator, plus the always-present `PAPER` chip.
 *   - Active chip = neon-green outline + glow.
 *   - Tooltip on every live chip explains the safe-execution invariant:
 *     selecting a live chip only flips the displayed runtime context.
 *     Real order routing is still gated by the server-side kill switch
 *     and Task #200's safe-execution gate.
 *
 * Admin gating: this component is only rendered from
 * `PortalCustomerShell`. The admin shell never imports it, so the
 * "byte-identical admin" invariant is preserved by mount-point.
 *
 * Persistence: each click PUTs `activeRuntimeExchange` to
 * `/api/user/settings` via `useSetRuntimeExchange`, then the aggregator
 * refetch re-derives the canonical state.
 */

import { useEffect, useRef, useState } from "react";
import {
  useRuntimeState,
  useSetRuntimeExchange,
  type RuntimeConnection,
} from "../../hooks/useRuntimeState";

const C = {
  BG:           "#000",
  BORDER:       "rgba(255,255,255,0.10)",
  BORDER_ACTIVE:"rgba(102,255,102,0.55)",
  BRAND:        "#66FF66",
  BRAND_GLOW:   "rgba(102,255,102,0.35)",
  GOLD:         "#FFB020",
  TEXT_0:       "#E8F5EC",
  TEXT_2:       "#5F706A",
  DANGER:       "rgba(255,90,108,0.85)",
};

const FONT_MONO = "'JetBrains Mono','SF Mono','Roboto Mono',ui-monospace,monospace";

export function RuntimeSwitcher() {
  const { data: state, isLoading } = useRuntimeState();
  const { setRuntimeExchange, isPending } = useSetRuntimeExchange();
  const [liveTeaser, setLiveTeaser] = useState<string | null>(null);
  const teaserTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => { if (teaserTimer.current) window.clearTimeout(teaserTimer.current); };
  }, []);

  if (isLoading || !state) {
    return (
      <div style={skeletonRowStyle}>
        <span style={{ ...chipBaseStyle, opacity: 0.35 }}>PAPER</span>
      </div>
    );
  }

  const chips: Array<{ key: string; label: string; active: boolean; live: boolean; conn?: RuntimeConnection }> = [
    {
      key:    "paper",
      label:  "PAPER",
      active: state.mode === "paper",
      live:   false,
    },
    ...state.connectedExchanges.map(c => ({
      key:    c.exchange,
      label:  c.exchange.toUpperCase(),
      active: state.mode === "live" && state.activeExchange === c.exchange,
      live:   true,
      conn:   c,
    })),
  ];

  function onSelect(chipKey: string, isLive: boolean) {
    if (isPending) return;
    setRuntimeExchange(chipKey === "paper" ? "paper" : chipKey);
    if (isLive) {
      // Live execution is not yet armed (Task #200). Tell the user the
      // chip flipped the display only — orders will continue as paper.
      setLiveTeaser(chipKey.toUpperCase());
      if (teaserTimer.current) window.clearTimeout(teaserTimer.current);
      teaserTimer.current = window.setTimeout(() => setLiveTeaser(null), 5_500);
    } else {
      setLiveTeaser(null);
    }
  }

  return (
    <div role="radiogroup" aria-label="Trading runtime" style={rowStyle}>
      <span style={legendStyle}>RUNTIME</span>
      {chips.map(chip => {
        const unhealthy = chip.live && chip.conn ? !chip.conn.ok : false;
        const tooltip = chip.live
          ? `${chip.label} — display only. Live execution remains gated by the platform safety lock; orders continue as paper until live execution is armed.`
          : "Paper trading — simulated capital, no real orders.";
        return (
          <button
            key={chip.key}
            role="radio"
            aria-checked={chip.active}
            title={tooltip}
            disabled={isPending}
            onClick={() => onSelect(chip.key, chip.live)}
            style={{
              ...chipBaseStyle,
              borderColor: chip.active ? C.BORDER_ACTIVE : C.BORDER,
              color:       chip.active ? C.BRAND : C.TEXT_0,
              background:  chip.active ? "rgba(102,255,102,0.07)" : "rgba(255,255,255,0.02)",
              boxShadow:   chip.active ? `0 0 14px ${C.BRAND_GLOW}` : "none",
              opacity:     unhealthy ? 0.55 : 1,
              cursor:      isPending ? "wait" : "pointer",
            }}
          >
            <span aria-hidden style={{
              width: 5, height: 5, borderRadius: "50%",
              background: chip.active ? C.BRAND
                        : unhealthy   ? C.DANGER
                        : C.TEXT_2,
              boxShadow:  chip.active ? `0 0 6px ${C.BRAND}` : "none",
            }} />
            {chip.label}
          </button>
        );
      })}
      {liveTeaser && (
        <span role="status" style={{
          marginLeft: 8, fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700,
          color: C.GOLD, letterSpacing: "0.10em",
          padding: "4px 8px",
          border: `1px solid ${C.GOLD}55`, borderRadius: 3,
          background: `${C.GOLD}10`,
        }}>
          ● LIVE: {liveTeaser} — DISPLAY ONLY · ORDERS STILL PAPER
        </span>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
  padding: "8px 12px",
  background: C.BG,
  borderBottom: `1px solid ${C.BORDER}`,
};

const skeletonRowStyle: React.CSSProperties = { ...rowStyle, opacity: 0.5 };

const legendStyle: React.CSSProperties = {
  fontFamily: FONT_MONO, fontSize: 9, fontWeight: 800,
  color: C.TEXT_2, letterSpacing: "0.20em", marginRight: 4,
};

const chipBaseStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "5px 11px",
  border: `1px solid ${C.BORDER}`,
  borderRadius: 3,
  fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700,
  letterSpacing: "0.16em",
  color: C.TEXT_0,
  background: "rgba(255,255,255,0.02)",
  cursor: "pointer",
};
