/**
 * Trading-mode presets (Profit-Optimization initiative, feature #1).
 *
 * A preset is a NAMED bundle of the already-wired customer trading levers. It
 * is the single genuinely-new backbone of the profit-optimization work: instead
 * of adding a parallel un-wired config path, applying a preset WRITES the
 * underlying fields that the execution engine already consumes —
 *
 *   - `aiPersonality`            → ConfidenceScorer modifier + regime filter
 *   - `minConfidence`            → per-user confidence floor (still ≥ engine baseline)
 *   - `categoryAllocation`       → liveUserExecution gate 0ALLOC majors/alts/memes bias
 *   - account SL/TP/trailing/maxHold → exitConfig.ts resolver (Task #220)
 *   - `preferredLiveOrderSizeUsd`→ per-trade notional (clamped {10,20,50,100})
 *
 * so NO new execution gate wiring is required and every preset composes with
 * the existing safety gates untouched.
 *
 * SAFETY: every preset keeps `stopLossPercent: 2` — the user's locked stop-loss
 * requirement. "Aggressive Growth" only loosens selectivity (lower minConfidence,
 * still above the engine baseline floor), biases toward alts/memes, raises the
 * take-profit target, and lets winners run longer (higher maxHold). It NEVER
 * disables a hard safety gate: the mandatory volume filter, liquidity guard,
 * duplicate-position protection, exchange validation, broker balance checks,
 * max-position caps, and kill switch all remain enforced server-side regardless
 * of the chosen preset.
 */

import type { PersonalityName } from "../services/ai/AIPersonality.js";
import { clampExitValue } from "./exitConfig.js";

export type TradingModePreset = "conservative" | "balanced" | "aggressive";

export interface CategoryAllocation {
  majors: number;
  alts:   number;
  memes:  number;
}

export interface TradingModePresetDef {
  /** Stable preset id (stored in user_settings.tradingModePreset). */
  id:    TradingModePreset;
  /** Customer-facing label. */
  label: string;
  /** One-line summary of what the mode does (institutional tone). */
  summary: string;
  /** Underlying levers the preset writes. */
  aiPersonality:             PersonalityName;
  minConfidence:             number;
  categoryAllocation:        CategoryAllocation;
  stopLossPercent:           number;
  takeProfitPercent:         number;
  trailingStopPercent:       number;
  maxHoldHours:              number;
  preferredLiveOrderSizeUsd: number;
}

// Allowed customer per-trade notional presets (mirrors preferredLiveOrderSizeUsd
// allowlist + liquidityGuard clamp).
const SIZE_PRESETS = [10, 20, 50, 100, 125] as const;

export const TRADING_MODE_PRESETS: Record<TradingModePreset, TradingModePresetDef> = {
  conservative: {
    id:                        "conservative",
    label:                     "Conservative",
    summary:                   "More selective entries, smaller size, faster exits. Majors-weighted.",
    aiPersonality:             "conservative",
    minConfidence:             70,
    categoryAllocation:        { majors: 60, alts: 30, memes: 10 },
    stopLossPercent:           2,
    takeProfitPercent:         3,
    trailingStopPercent:       1.5,
    maxHoldHours:              1,
    preferredLiveOrderSizeUsd: 10,
  },
  balanced: {
    id:                        "balanced",
    label:                     "Balanced",
    summary:                   "Default mode. Moderate selectivity and take-profit, even category mix.",
    aiPersonality:             "balanced",
    minConfidence:             60,
    categoryAllocation:        { majors: 40, alts: 40, memes: 20 },
    stopLossPercent:           2,
    takeProfitPercent:         4,
    trailingStopPercent:       2,
    maxHoldHours:              2,
    preferredLiveOrderSizeUsd: 20,
  },
  aggressive: {
    id:                        "aggressive",
    label:                     "Aggressive Growth",
    summary:                   "More alt/meme exposure, more valid attempts, higher targets, lets winners run. SL & trailing still on.",
    aiPersonality:             "aggressive",
    minConfidence:             50,
    categoryAllocation:        { majors: 10, alts: 50, memes: 40 },
    stopLossPercent:           2,
    takeProfitPercent:         6,
    trailingStopPercent:       2,
    maxHoldHours:              3,
    preferredLiveOrderSizeUsd: 20,
  },
};

export const TRADING_MODE_PRESET_IDS: readonly TradingModePreset[] = [
  "conservative",
  "balanced",
  "aggressive",
] as const;

export function isTradingModePreset(v: unknown): v is TradingModePreset {
  return typeof v === "string" && (TRADING_MODE_PRESET_IDS as readonly string[]).includes(v);
}

/**
 * Resolve the bundle a preset writes, with exit-percent fields passed through
 * the centralized clamp so a preset can never write an out-of-bounds value.
 * `categoryAllocation` is returned as a plain object for the jsonb column.
 */
export function buildPresetPatch(preset: TradingModePreset): {
  aiPersonality:             PersonalityName;
  minConfidence:             number;
  categoryAllocation:        CategoryAllocation;
  stopLossPercent:           number;
  takeProfitPercent:         number;
  trailingStopPercent:       number;
  maxHoldHours:              number;
  preferredLiveOrderSizeUsd: number;
  tradingModePreset:         TradingModePreset;
} {
  const def = TRADING_MODE_PRESETS[preset];
  const size = SIZE_PRESETS.includes(def.preferredLiveOrderSizeUsd as (typeof SIZE_PRESETS)[number])
    ? def.preferredLiveOrderSizeUsd
    : 10;
  return {
    aiPersonality:             def.aiPersonality,
    minConfidence:             def.minConfidence,
    categoryAllocation:        { ...def.categoryAllocation },
    stopLossPercent:           clampExitValue("stopLossPercent", def.stopLossPercent),
    takeProfitPercent:         clampExitValue("takeProfitPercent", def.takeProfitPercent),
    trailingStopPercent:       clampExitValue("trailingStopPercent", def.trailingStopPercent),
    maxHoldHours:              clampExitValue("maxHoldHours", def.maxHoldHours),
    preferredLiveOrderSizeUsd: size,
    tradingModePreset:         preset,
  };
}

/** Fields compared to decide which named preset (if any) a row matches. */
export interface PresetIdentityInput {
  aiPersonality:             string | null;
  minConfidence:             number | null;
  categoryAllocation:        CategoryAllocation | null;
  stopLossPercent:           number | null;
  takeProfitPercent:         number | null;
  trailingStopPercent:       number | null;
  maxHoldHours:              number | null;
  preferredLiveOrderSizeUsd: number | null;
}

function approxEq(a: number | null | undefined, b: number, tol = 0.001): boolean {
  return typeof a === "number" && Math.abs(a - b) <= tol;
}

function allocEq(a: CategoryAllocation | null | undefined, b: CategoryAllocation): boolean {
  return !!a && a.majors === b.majors && a.alts === b.alts && a.memes === b.memes;
}

/**
 * Determine which named preset the current settings match, or `"custom"` when
 * the user has manually diverged any composing field. Identity-only — never
 * affects execution.
 */
export function resolvePresetIdentity(s: PresetIdentityInput): TradingModePreset | "custom" {
  for (const id of TRADING_MODE_PRESET_IDS) {
    const def = TRADING_MODE_PRESETS[id];
    if (
      s.aiPersonality === def.aiPersonality &&
      approxEq(s.minConfidence, def.minConfidence) &&
      allocEq(s.categoryAllocation, def.categoryAllocation) &&
      approxEq(s.stopLossPercent, def.stopLossPercent) &&
      approxEq(s.takeProfitPercent, def.takeProfitPercent) &&
      approxEq(s.trailingStopPercent, def.trailingStopPercent) &&
      approxEq(s.maxHoldHours, def.maxHoldHours) &&
      approxEq(s.preferredLiveOrderSizeUsd, def.preferredLiveOrderSizeUsd)
    ) {
      return id;
    }
  }
  return "custom";
}
