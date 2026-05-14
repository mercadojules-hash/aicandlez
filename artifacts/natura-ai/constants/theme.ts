// ── Apex AI Trader — Dark Institutional Theme ─────────────────────────────────

export const C = {
  bg:       "#000000",
  surface:  "#010C18",
  surface2: "#060810",
  surface3: "#0a1420",
  border:   "#0d1e2e",
  border2:  "#1a2a36",
  border3:  "#243545",
  cyan:     "#00aaff",
  cyanDim:  "#00aaff30",
  cyanGlow: "#00aaff60",
  green:    "#00ff8a",
  greenDim: "#00ff8a25",
  red:      "#ff3355",
  redDim:   "#ff335525",
  purple:   "#cc55ff",
  purpleDim:"#cc55ff25",
  orange:   "#ffaa00",
  orangeDim:"#ffaa0025",
  teal:     "#00eeff",
  tealDim:  "#00eeff20",
  textPrimary:   "#EAF2FF",
  textSecondary: "#7a9eb8",
  textMuted:     "#4a6a80",
  textDim:       "#2a4050",
  positive: "#00ff8a",
  negative: "#ff3355",
  neutral:  "#9FB3C8",
  warning:  "#ffaa00",
  ai:       "#cc55ff",
};

export const FONTS = {
  mono:       "Inter_400Regular",
  monoMedium: "Inter_500Medium",
  monoSemi:   "Inter_600SemiBold",
  monoBold:   "Inter_700Bold",
};

export const RADIUS = { sm: 4, md: 8, lg: 12, xl: 16, full: 999 };

// Legacy shims
export const colors = {
  primary: C.cyan, background: C.bg, card: C.surface,
  border: C.border, text: C.textPrimary, textDim: C.textMuted,
};
export const spacing  = { xs:4, sm:8, md:16, lg:24, xl:32, xxl:48 };
export const radius   = RADIUS;
export const radii    = RADIUS;
export const fontSizes = { xs:10, sm:12, md:14, lg:16, xl:20, xxl:28, xxxl:36 };
