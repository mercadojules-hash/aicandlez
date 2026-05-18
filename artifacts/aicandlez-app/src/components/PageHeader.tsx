import aicandlezIconMaster from "../assets/aicandlez-icon-master.png";

const BRAND       = "#66FF66";
const BRAND_BLOOM = "rgba(102,255,102,0.22)";
const BRAND_GLOW  = "rgba(102,255,102,0.55)";
const BORDER      = "rgba(255,255,255,0.07)";
const TEXT        = "#E8F5EC";
const TEXT_DIM    = "#5A726A";
const SANS        = "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif";

/**
 * Compact, premium institutional page header used across every page
 * in the AICandlez PWA. Shows the green "A" master icon at left and
 * the page title at right.
 *
 * Visual language is locked to the Signals/Crypto/Equities system:
 * deep black background, neon-green glow, subtle hairline divider.
 */
export function PageHeader({
  title,
  caption,
  right,
}: {
  title:   string;
  caption?: string;
  right?:   React.ReactNode;
}) {
  return (
    <div
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            12,
        padding:        "14px 16px 12px",
        borderBottom:   `1px solid ${BORDER}`,
        background:     "linear-gradient(180deg, rgba(102,255,102,0.025) 0%, transparent 100%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        {/* A logo medallion */}
        <div
          style={{
            position:     "relative",
            width:        34,
            height:       34,
            borderRadius: 9,
            flexShrink:   0,
            background:   "linear-gradient(135deg, rgba(102,255,102,0.10) 0%, rgba(0,200,83,0.06) 100%)",
            border:       `1px solid ${BRAND_BLOOM}`,
            boxShadow:    `0 0 14px ${BRAND_BLOOM}, inset 0 0 8px rgba(102,255,102,0.08)`,
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            overflow:     "hidden",
          }}
        >
          <img
            src={aicandlezIconMaster}
            alt="AICandlez"
            style={{
              width:  "82%",
              height: "82%",
              objectFit: "contain",
              filter: `drop-shadow(0 0 4px ${BRAND_GLOW})`,
            }}
          />
        </div>

        {/* Title + optional caption */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              fontSize:      18,
              fontFamily:    SANS,
              fontWeight:    800,
              color:         TEXT,
              letterSpacing: "-0.01em",
              lineHeight:    1.1,
              whiteSpace:    "nowrap",
              overflow:      "hidden",
              textOverflow:  "ellipsis",
            }}
          >
            {title}
          </div>
          {caption && (
            <div
              style={{
                fontSize:      8.5,
                fontFamily:    SANS,
                fontWeight:    700,
                color:         TEXT_DIM,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginTop:     3,
              }}
            >
              {caption}
            </div>
          )}
        </div>
      </div>

      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}
