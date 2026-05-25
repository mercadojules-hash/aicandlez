import { useLocation } from "wouter";

const BRAND       = "#66FF66";
const BRAND_DEEP  = "#00C853";
const BRAND_BRGT  = "#7CFF00";
const BRAND_GLOW  = "rgba(102,255,102,0.32)";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif";

/**
 * Premium pill CTA used across Home, Signals, Crypto, Equities,
 * Portfolio and Trade. Routes users to the upgrade flow.
 *
 * Subtle Free/Pro concurrency hint is rendered below to anchor the
 * value-prop without being preachy.
 */
export function EnableLiveCTA({
  hint = true,
  style,
}: { hint?: boolean; style?: React.CSSProperties }) {
  const [, setLocation] = useLocation();
  return (
    <div style={{ padding: "6px 16px 12px", ...style }}>
      <button
        onClick={() => setLocation("/subscribe")}
        style={{
          position: "relative", overflow: "hidden", width: "100%",
          padding: "14px 18px", borderRadius: 999, cursor: "pointer",
          background: `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, ${BRAND_BRGT} 100%)`,
          border: `1px solid ${BRAND_BRGT}`,
          color: "#001b06",
          fontSize: 13.5, fontFamily: SANS, fontWeight: 900,
          letterSpacing: 0.6, textTransform: "uppercase",
          boxShadow: `0 10px 32px ${BRAND_GLOW}, 0 0 0 1px rgba(255,255,255,0.108) inset, 0 1px 0 rgba(255,255,255,0.27) inset`,
          animation: "orb-breathe 3.6s ease-in-out infinite",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: "#001b06",
            boxShadow: "0 0 8px rgba(0,0,0,0.24)",
            animation: "dot-pulse 1.4s ease-in-out infinite",
          }}/>
          Enable Live AI Execution
        </span>
        <span style={{ fontSize: 16, fontWeight: 900, opacity: 0.85 }}>›</span>
        <span aria-hidden style={{
          position: "absolute", top: 0, left: "-30%", height: "100%", width: "30%",
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
          animation: "edge-sweep 4.5s ease-in-out infinite",
        }}/>
      </button>
      {hint && (
        <div style={{
          marginTop: 6, textAlign: "center" as const,
          fontSize: 9.5, fontFamily: SANS, fontWeight: 600,
          color: "#5A726A", letterSpacing: 0.4,
        }}>
          Free · up to 6 concurrent AI trades &nbsp;·&nbsp; Pro · up to 12 concurrent
        </div>
      )}
    </div>
  );
}
