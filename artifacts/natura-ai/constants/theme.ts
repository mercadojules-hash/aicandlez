// ── AICandlez — Premium Neon-Green Fintech Theme ──────────────────────────
// Cinematic dark UI · Apple-level polish · luxury crypto/AI trading aesthetic.
// Use only tokens from this file in app surfaces — never hardcode hex values.

// Core brand palette
const BRAND_PRIMARY    = "#66FF66"; // Hero neon green — primary brand
const BRAND_DEEP       = "#00C853"; // Deep emerald — success / pressed states
const BRAND_BRIGHT     = "#7CFF00"; // Saturated lime — highlights / glow center
const BRAND_VIVID      = "#39FF14"; // Vivid neon — confidence peaks
const BRAND_GLOW       = "rgba(102, 255, 102, 0.45)";
const BRAND_BLOOM      = "rgba(102, 255, 102, 0.18)";
const BRAND_WHISPER    = "rgba(102, 255, 102, 0.06)";

// Deep blacks (cinematic dark)
const BG_ABS           = "#000000";
const BG_CARD          = "#050A07"; // hint of green warmth
const BG_CARD_2        = "#0A1410";
const BG_CARD_3        = "#0F1F18";

// Glassmorphism surfaces
const GLASS_LIGHT      = "rgba(255,255,255,0.04)";
const GLASS_MED        = "rgba(255,255,255,0.07)";
const GLASS_HIGH       = "rgba(255,255,255,0.11)";
const GLASS_BORDER     = "rgba(255,255,255,0.08)";
const GLASS_BORDER_HI  = "rgba(102,255,102,0.22)";

// Semantic
const POSITIVE         = BRAND_PRIMARY;
const NEGATIVE         = "#FF4060";
const NEGATIVE_DEEP    = "#C8253F";
const WARNING          = "#FFB94A";
const NEUTRAL_INFO     = "#7FC2FF"; // a clean cool accent for non-brand signals

export const C = {
  // Brand
  brand:        BRAND_PRIMARY,
  brandDeep:    BRAND_DEEP,
  brandBright:  BRAND_BRIGHT,
  brandVivid:   BRAND_VIVID,
  brandGlow:    BRAND_GLOW,
  brandBloom:   BRAND_BLOOM,
  brandWhisper: BRAND_WHISPER,

  // Backgrounds
  bg:       BG_ABS,
  surface:  BG_CARD,
  surface2: BG_CARD_2,
  surface3: BG_CARD_3,

  // Glass primitives
  glass:    GLASS_LIGHT,
  glassMed: GLASS_MED,
  glassHi:  GLASS_HIGH,
  border:   GLASS_BORDER,
  borderHi: GLASS_BORDER_HI,
  border2:  "rgba(255,255,255,0.12)",
  border3:  "rgba(255,255,255,0.18)",

  // Legacy semantic aliases — same names, now mapped onto the green system
  // so every existing component re-skins automatically.
  cyan:     BRAND_PRIMARY,     // legacy "cyan" → brand green
  cyanDim:  BRAND_BLOOM,
  cyanGlow: BRAND_GLOW,
  green:    BRAND_PRIMARY,
  greenDim: BRAND_BLOOM,
  red:      NEGATIVE,
  redDim:   "rgba(255,64,96,0.18)",
  purple:   BRAND_BRIGHT,      // legacy purple accents → bright lime
  purpleDim:"rgba(124,255,0,0.18)",
  orange:   WARNING,
  orangeDim:"rgba(255,185,74,0.18)",
  teal:     BRAND_DEEP,        // legacy teal → deep emerald
  tealDim:  "rgba(0,200,83,0.18)",

  // Text hierarchy (cool white → muted greens for very low priority)
  textPrimary:   "#F2FFF6",
  textSecondary: "#B4D9C0",
  textMuted:     "#6F8C7A",
  textDim:       "#3F584C",

  // Semantic
  positive: POSITIVE,
  negative: NEGATIVE,
  negativeDeep: NEGATIVE_DEEP,
  neutral:  NEUTRAL_INFO,
  warning:  WARNING,
  ai:       BRAND_BRIGHT,
};

export const FONTS = {
  mono:       "Inter_400Regular",
  monoMedium: "Inter_500Medium",
  monoSemi:   "Inter_600SemiBold",
  monoBold:   "Inter_700Bold",
};

// Spacing scale — 4pt grid for premium rhythm
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

// Radius scale — chunky modern fintech
export const RADIUS = { sm: 6, md: 10, lg: 14, xl: 18, xxl: 22, full: 999 };

// Cinematic shadows — deep blacks with soft green bloom on key surfaces
export const SHADOWS = {
  card:   { shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  cardLg: { shadowColor: "#000", shadowOpacity: 0.65, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  bloom:  { shadowColor: C.brand, shadowOpacity: 0.35, shadowRadius: 28, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  bloomSm:{ shadowColor: C.brand, shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
};

// Type scale — bold, modern, deliberate hierarchy
export const TYPE = {
  hero:     { fontSize: 38, fontFamily: FONTS.monoBold,   letterSpacing: -0.8 },
  display:  { fontSize: 28, fontFamily: FONTS.monoBold,   letterSpacing: -0.4 },
  title:    { fontSize: 20, fontFamily: FONTS.monoBold,   letterSpacing: -0.2 },
  body:     { fontSize: 14, fontFamily: FONTS.mono,       letterSpacing: 0    },
  bodyMed:  { fontSize: 14, fontFamily: FONTS.monoMedium, letterSpacing: 0    },
  caption:  { fontSize: 11, fontFamily: FONTS.mono,       letterSpacing: 0.2  },
  micro:    { fontSize: 9,  fontFamily: FONTS.monoBold,   letterSpacing: 1.4, textTransform: "uppercase" as const },
};

// ── Legacy compat shims (kept so older code keeps compiling) ───────────────
export const colors = {
  primary: C.brand, background: C.bg, card: C.surface,
  border: C.border, text: C.textPrimary, textDim: C.textMuted,
};
export const spacing  = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius   = RADIUS;
export const radii    = RADIUS;
export const fontSizes = { xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 28, xxxl: 36 };
