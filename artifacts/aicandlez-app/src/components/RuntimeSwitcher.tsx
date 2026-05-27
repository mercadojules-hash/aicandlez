/**
 * RuntimeSwitcher — PWA chip row (Task #199).
 *
 * Mounted in `App.tsx` Shell above the routed page content so every
 * PWA page sees a single, consistent runtime context. Mobile-first
 * sizing — scrolls horizontally on narrow viewports without forcing
 * the whole header to wrap.
 *
 * Selecting a live chip flips the displayed runtime context only;
 * order routing remains gated by the server-side kill switch and
 * Task #200's safe-execution gate. A one-shot status pill explains
 * this to the user the first time they pick a live chip.
 */

import { useEffect, useRef, useState } from "react";
import { useRuntimeState, useSetRuntimeExchange } from "../hooks/useRuntimeState";

const C = {
  BG:            "#000",
  BORDER:        "rgba(255,255,255,0.08)",
  BORDER_ACTIVE: "rgba(102,255,102,0.55)",
  BRAND:         "#66FF66",
  BRAND_GLOW:    "rgba(102,255,102,0.35)",
  GOLD:          "#FFB020",
  TEXT_0:        "#E8F5EC",
  TEXT_2:        "#5F706A",
  DANGER:        "rgba(255,90,108,0.85)",
};

const FONT_MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

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
      <div style={rowStyle}>
        <span style={legendStyle}>RUNTIME</span>
        <span style={{ ...chipBaseStyle, opacity: 0.35 }}>PAPER</span>
      </div>
    );
  }

  const chips = [
    { key: "paper",  label: "PAPER", active: state.mode === "paper", live: false, ok: true },
    ...state.connectedExchanges.map(c => ({
      key:    c.exchange,
      label:  c.exchange.toUpperCase(),
      active: state.mode === "live" && state.activeExchange === c.exchange,
      live:   true,
      ok:     c.ok,
    })),
  ];

  function onSelect(chipKey: string, isLive: boolean) {
    if (isPending) return;
    setRuntimeExchange(chipKey === "paper" ? "paper" : chipKey);
    if (isLive) {
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
      <div style={scrollerStyle}>
        {chips.map(chip => (
          <button
            key={chip.key}
            role="radio"
            aria-checked={chip.active}
            disabled={isPending}
            title={chip.live
              ? `${chip.label} — display only. Live execution is not yet armed; orders continue as paper.`
              : "Paper trading — simulated capital, no real orders."}
            onClick={() => onSelect(chip.key, chip.live)}
            style={{
              ...chipBaseStyle,
              borderColor: chip.active ? C.BORDER_ACTIVE : C.BORDER,
              color:       chip.active ? C.BRAND : C.TEXT_0,
              background:  chip.active ? "rgba(102,255,102,0.07)" : "rgba(255,255,255,0.02)",
              boxShadow:   chip.active ? `0 0 12px ${C.BRAND_GLOW}` : "none",
              opacity:     chip.ok ? 1 : 0.55,
              cursor:      isPending ? "wait" : "pointer",
            }}
          >
            <span aria-hidden style={{
              width: 5, height: 5, borderRadius: "50%",
              background: chip.active ? C.BRAND
                        : !chip.ok    ? C.DANGER
                        : C.TEXT_2,
              boxShadow:  chip.active ? `0 0 6px ${C.BRAND}` : "none",
            }} />
            {chip.label}
          </button>
        ))}
      </div>
      {liveTeaser && (
        <span role="status" style={teaserStyle}>
          ● LIVE: {liveTeaser} — DISPLAY ONLY · ORDERS STILL PAPER
        </span>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  padding: "8px 12px",
  background: C.BG,
  borderBottom: `1px solid ${C.BORDER}`,
};

const scrollerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  overflowX: "auto", overflowY: "hidden",
  flex: 1, minWidth: 0,
  scrollbarWidth: "none",
  WebkitOverflowScrolling: "touch",
};

const legendStyle: React.CSSProperties = {
  fontFamily: FONT_MONO, fontSize: 9, fontWeight: 800,
  color: C.TEXT_2, letterSpacing: "0.20em", flexShrink: 0,
};

const chipBaseStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "5px 10px",
  border: `1px solid ${C.BORDER}`,
  borderRadius: 3,
  fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700,
  letterSpacing: "0.14em",
  color: C.TEXT_0,
  background: "rgba(255,255,255,0.02)",
  cursor: "pointer",
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const teaserStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700,
  color: C.GOLD, letterSpacing: "0.10em",
  padding: "4px 8px",
  border: `1px solid ${C.GOLD}55`, borderRadius: 3,
  background: `${C.GOLD}10`,
};
