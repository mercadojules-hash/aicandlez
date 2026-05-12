import type { MarketRegime } from "./RegimeClassifier.js";

// ── AIPersonality ─────────────────────────────────────────────────────────────
//
// Personality profiles control how the AI interprets signals and sizes positions.
// Each profile has:
//
//   minConfidence      — minimum signal confidence to consider trading
//   confidenceBoost    — multiplier applied to raw confidence (>1 = more aggressive)
//   regimeFilter       — regimes where this personality will trade
//   maxPositionPct     — max % of capital per single trade
//   maxDailyDrawdownPct — daily stop-loss % before kill
//   takesProfitQuick   — whether to close at lower profit %
//   tradesAgainstTrend — whether to take counter-trend signals
//
// Applied in:
//   ConfidenceScorer   — modulates raw signal confidence
//   AutoExecute        — filters which signals pass
//   UserEngineRegistry — stored per user

export type PersonalityName = "conservative" | "balanced" | "aggressive";

export interface PersonalityProfile {
  name:                 PersonalityName;
  label:                string;
  description:          string;
  minConfidence:        number;          // 0–100
  confidenceMultiplier: number;          // applied to raw score (< 1 dampens, > 1 amplifies)
  allowedRegimes:       MarketRegime[];  // only trades in these regimes
  blockedRegimes:       MarketRegime[];  // hard block
  maxPositionPct:       number;          // % of portfolio
  maxDailyDrawdownPct:  number;
  stopLossPct:          number;          // default stop loss
  takeProfitPct:        number;          // default take profit
  maxOpenPositions:     number;
  requiresMTFConfirm:   boolean;         // must have multi-timeframe agreement
  requiresVolumeConfirm: boolean;
  tradeShortSignals:    boolean;         // whether to trade SELL signals
  color:                string;          // UI accent color
  icon:                 string;
}

// ── Profile definitions ───────────────────────────────────────────────────────

const CONSERVATIVE: PersonalityProfile = {
  name:                 "conservative",
  label:                "Conservative",
  description:          "High-confidence trades only. Strict risk controls. Prefers trending markets. Avoids volatility.",
  minConfidence:        72,
  confidenceMultiplier: 0.90,
  allowedRegimes:       ["TRENDING_UP", "TRENDING_DOWN"],
  blockedRegimes:       ["HIGH_VOLATILITY", "BREAKOUT", "UNKNOWN"],
  maxPositionPct:       5,
  maxDailyDrawdownPct:  2,
  stopLossPct:          1.5,
  takeProfitPct:        3.0,
  maxOpenPositions:     3,
  requiresMTFConfirm:   true,
  requiresVolumeConfirm: true,
  tradeShortSignals:    false,
  color:                "#00aaff",
  icon:                 "🛡️",
};

const BALANCED: PersonalityProfile = {
  name:                 "balanced",
  label:                "Balanced",
  description:          "Moderate risk/reward. Trades most regimes except extreme volatility. MTF confirmation preferred.",
  minConfidence:        60,
  confidenceMultiplier: 1.00,
  allowedRegimes:       ["TRENDING_UP", "TRENDING_DOWN", "RANGING", "LOW_VOLATILITY"],
  blockedRegimes:       ["HIGH_VOLATILITY", "UNKNOWN"],
  maxPositionPct:       10,
  maxDailyDrawdownPct:  5,
  stopLossPct:          2.5,
  takeProfitPct:        5.0,
  maxOpenPositions:     5,
  requiresMTFConfirm:   true,
  requiresVolumeConfirm: true,
  tradeShortSignals:    true,
  color:                "#00ff8a",
  icon:                 "⚖️",
};

const AGGRESSIVE: PersonalityProfile = {
  name:                 "aggressive",
  label:                "Aggressive",
  description:          "Maximum opportunity capture. Trades breakouts, volatility spikes, and counter-trend setups.",
  minConfidence:        45,
  confidenceMultiplier: 1.15,
  allowedRegimes:       ["TRENDING_UP", "TRENDING_DOWN", "RANGING", "BREAKOUT", "HIGH_VOLATILITY", "LOW_VOLATILITY"],
  blockedRegimes:       ["UNKNOWN"],
  maxPositionPct:       20,
  maxDailyDrawdownPct:  10,
  stopLossPct:          4.0,
  takeProfitPct:        10.0,
  maxOpenPositions:     10,
  requiresMTFConfirm:   false,
  requiresVolumeConfirm: false,
  tradeShortSignals:    true,
  color:                "#ff4466",
  icon:                 "⚡",
};

export const PERSONALITY_PROFILES: Record<PersonalityName, PersonalityProfile> = {
  conservative: CONSERVATIVE,
  balanced:     BALANCED,
  aggressive:   AGGRESSIVE,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getProfile(name: PersonalityName): PersonalityProfile {
  return PERSONALITY_PROFILES[name];
}

export function isRegimeAllowed(profile: PersonalityProfile, regime: MarketRegime): boolean {
  if (profile.blockedRegimes.includes(regime)) return false;
  if (profile.allowedRegimes.length === 0)      return true;
  return profile.allowedRegimes.includes(regime);
}

export function applyPersonalityToConfidence(
  rawConfidence: number,
  profile:       PersonalityProfile,
  regime:        MarketRegime,
): number {
  if (!isRegimeAllowed(profile, regime)) return 0;
  return Math.min(100, rawConfidence * profile.confidenceMultiplier);
}

export function listProfiles(): PersonalityProfile[] {
  return Object.values(PERSONALITY_PROFILES);
}
