/**
 * Institutional dashboard color tokens — matte black + neon green
 * (matches the locked AICandlez brand palette).
 *
 * All consumed via inline styles so the rewrite doesn't have to fight the
 * existing cyan Tailwind variables in trading-dashboard's index.css.
 */
export const N = {
  /* surfaces */
  BG:        "#000000",
  SURFACE_1: "#040806",       // panel base
  SURFACE_2: "#070C09",       // row hover / inner row
  SURFACE_3: "#0A140F",       // card emphasis
  BORDER:    "#0F1F18",       // standard divider
  BORDER_HI: "#1A2E22",       // hover / focus divider
  BORDER_LV: "#66FF6618",     // brand-tinted divider

  /* brand (neon green system) */
  BRAND:     "#66FF66",       // primary neon green
  BRAND_DEEP:"#00C853",       // deep emerald
  BRAND_BRT: "#7CFF00",       // bright lime
  BRAND_VIV: "#39FF14",       // vivid neon
  BRAND_GLOW:"#66FF6640",
  BRAND_DIM: "#66FF66aa",

  /* directional */
  LONG:      "#00ff8a",
  LONG_GLOW: "#00ff8a55",
  SHORT:     "#ff3355",
  SHORT_GLOW:"#ff335555",

  /* text hierarchy */
  TEXT_0:    "#EAF7EE",       // primary body
  TEXT_1:    "#B6D4C2",       // secondary
  TEXT_2:    "#7A9A88",       // tertiary
  TEXT_3:    "#3A5A4A",       // disabled / scaffolding

  /* status */
  WARN:      "#FFB800",
  WARN_DIM:  "#FFB80030",

  /* gold / orange — live-execution accent */
  GOLD:      "#FFA500",
  GOLD_BRT:  "#FFC940",
  GOLD_DEEP: "#FF7A00",
  GOLD_GLOW: "#FFA50080",

  /* type */
  FONT_MONO: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
};

export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 8,
};
