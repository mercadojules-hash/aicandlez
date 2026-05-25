/**
 * conviction.ts — user-facing CALIBRATED conviction layer.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * READ THIS FIRST:
 *
 * The raw engine `confidence` (clamp(|totalScore|/5.7 × 150, 10, 98))
 * naturally clusters in the 20s–50s because the formula is compressive
 * (BUY threshold = 1.5/5.7 = 39.5%). That number is **correct for
 * execution gating** but **misleads humans** who pattern-match "high %
 * = great signal" from years of using calibrated dashboards.
 *
 * `computeConviction()` is a SEPARATE layer that translates the same
 * underlying signal quality into a familiar 0–100 conviction scale
 * by composing seven real, live, observable factors:
 *
 *   1. raw engine confidence           weight 0.30   (anchor — never lies)
 *   2. rank percentile vs current pool weight 0.18
 *   3. MTF timeframe agreement         weight 0.15
 *   4. trend strength (EMA + MTF)      weight 0.12
 *   5. liquidity confirmation          weight 0.10
 *   6. market regime quality           weight 0.10
 *   7. reward/risk ratio shape         weight 0.05
 *
 * Weights sum to 1.0. Raw confidence remains the largest single
 * weight so the score can never lie about the engine: a genuinely
 * weak signal (low raw, low rank, no MTF, no trend, no liquidity,
 * bad regime, bad RR) caps out near 0.
 *
 * RULES THIS LAYER OBEYS:
 *   • The engine code, persisted `signals.confidence`, and execution
 *     gates are NEVER modified. They keep operating on raw values.
 *   • Conviction is a *render* concept only.
 *   • Every breakdown line is real, derived from live engine data.
 *     No hardcoded preview numbers ever flow through this function.
 *   • Honest floor: weak signals stay weak.
 *   • Honest ceiling: a top-3-ranked signal with full MTF agreement,
 *     good RR, strong trend, confirmed volume, and a clean regime
 *     IS allowed to display as HIGH/ELITE even when raw is in the 40s.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type ConvictionTier =
  | "LOW"
  | "DEVELOPING"
  | "MODERATE"
  | "STRONG"
  | "HIGH"
  | "ELITE";

/** Inputs are all 0..100 unless noted, every value must come from real
 *  live engine telemetry — never synthetic/hardcoded. */
export interface ConvictionInputs {
  /** Raw engine confidence from the persisted signal pipeline (0..100). */
  rawConfidence:  number;
  /** Percentile rank among the CURRENT active signal pool (0..100).
   *  100 = best, 0 = worst. Caller computes this after building the list. */
  rankPercentile: number;
  /** True when fast + slow timeframes agreed on direction (engine
   *  `mtfConfirmed === true`). */
  mtfAgreed:      boolean;
  /** Trader R:R ratio = reward / risk (e.g. 2.0 means 2:1). */
  rrRatio:        number;
  /** 0..100 trend-strength composite (caller derives from EMA alignment
   *  + 1H trend + per-TF decisions). */
  trendStrength:  number;
  /** 0..100 liquidity / volume confirmation. Engine `volumeConfirmed`
   *  → 100, otherwise a lower neutral floor. */
  liquidityScore: number;
  /** 0..100 market-regime quality. BREAKOUT/TRENDING high; RANGING /
   *  EXHAUSTED low. */
  regimeScore:    number;
}

export interface ConvictionFactor {
  /** Normalized 0..100 input. */
  value:        number;
  /** Weight in [0..1]; weights sum to 1.0. */
  weight:       number;
  /** Points this factor contributed to the final score (0..100 × weight). */
  contribution: number;
  /** Short human label, e.g. "Raw engine confidence". */
  label:        string;
  /** Short verdict, e.g. "weak", "good", "excellent". */
  verdict:      "weak" | "fair" | "good" | "strong";
}

export interface ConvictionBreakdown {
  raw:       ConvictionFactor;
  rank:      ConvictionFactor;
  mtf:       ConvictionFactor;
  trend:     ConvictionFactor;
  liquidity: ConvictionFactor;
  regime:    ConvictionFactor;
  rr:        ConvictionFactor;
}

export interface ConvictionResult {
  /** 0..100 calibrated conviction score (rounded integer). */
  score:     number;
  /** Tier label derived from `score`. */
  tier:      ConvictionTier;
  /** Per-factor breakdown for the "Why this score?" disclosure. */
  breakdown: ConvictionBreakdown;
}

const WEIGHTS = {
  raw:       0.30,
  rank:      0.18,
  mtf:       0.15,
  trend:     0.12,
  liquidity: 0.10,
  regime:    0.10,
  rr:        0.05,
} as const;

const TIER_THRESHOLDS: { tier: ConvictionTier; min: number }[] = [
  { tier: "ELITE",      min: 85 },
  { tier: "HIGH",       min: 70 },
  { tier: "STRONG",     min: 55 },
  { tier: "MODERATE",   min: 40 },
  { tier: "DEVELOPING", min: 25 },
  { tier: "LOW",        min: 0  },
];

function clamp01_100(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function verdictFor(value: number): ConvictionFactor["verdict"] {
  if (value >= 80) return "strong";
  if (value >= 60) return "good";
  if (value >= 35) return "fair";
  return "weak";
}

function mkFactor(value: number, weight: number, label: string): ConvictionFactor {
  const v = clamp01_100(value);
  return {
    value:        Math.round(v),
    weight,
    contribution: Math.round(v * weight * 10) / 10,
    label,
    verdict:      verdictFor(v),
  };
}

/** Map an RR ratio (0..∞) onto a 0..100 score.
 *    RR <= 1.0 →   0    (no asymmetric edge)
 *    RR = 1.5  →  25
 *    RR = 2.0  →  50    (acceptable)
 *    RR = 3.0  → 100    (excellent, caps here)
 *  Negative / zero / non-finite inputs return 0. */
export function rrRatioToScore(rr: number): number {
  if (!Number.isFinite(rr) || rr <= 1) return 0;
  return Math.min(100, (rr - 1) * 50);
}

export function tierFor(score: number): ConvictionTier {
  const s = clamp01_100(score);
  for (const t of TIER_THRESHOLDS) {
    if (s >= t.min) return t.tier;
  }
  return "LOW";
}

export function computeConviction(i: ConvictionInputs): ConvictionResult {
  const rawN   = clamp01_100(i.rawConfidence);
  const rankN  = clamp01_100(i.rankPercentile);
  const mtfN   = i.mtfAgreed ? 100 : 0;
  const trendN = clamp01_100(i.trendStrength);
  const liqN   = clamp01_100(i.liquidityScore);
  const regN   = clamp01_100(i.regimeScore);
  const rrN    = clamp01_100(rrRatioToScore(i.rrRatio));

  const score = clamp01_100(
    rawN   * WEIGHTS.raw +
    rankN  * WEIGHTS.rank +
    mtfN   * WEIGHTS.mtf +
    trendN * WEIGHTS.trend +
    liqN   * WEIGHTS.liquidity +
    regN   * WEIGHTS.regime +
    rrN    * WEIGHTS.rr,
  );

  return {
    score:     Math.round(score),
    tier:      tierFor(score),
    breakdown: {
      raw:       mkFactor(rawN,   WEIGHTS.raw,       "Raw engine confidence"),
      rank:      mkFactor(rankN,  WEIGHTS.rank,      "Rank vs current signal pool"),
      mtf:       mkFactor(mtfN,   WEIGHTS.mtf,       "Multi-timeframe agreement"),
      trend:     mkFactor(trendN, WEIGHTS.trend,     "Trend strength (EMA + 1H)"),
      liquidity: mkFactor(liqN,   WEIGHTS.liquidity, "Volume / liquidity"),
      regime:    mkFactor(regN,   WEIGHTS.regime,    "Market regime quality"),
      rr:        mkFactor(rrN,    WEIGHTS.rr,        "Reward-to-risk shape"),
    },
  };
}

/** Compute integer percentile rank (0..100) of `value` within `pool`,
 *  where 100 = best (highest). Empty pool → 50 (neutral). */
export function percentileRank(value: number, pool: number[]): number {
  if (pool.length === 0) return 50;
  if (pool.length === 1) return value >= pool[0] ? 100 : 0;
  let countBelow = 0;
  for (const v of pool) {
    if (Number.isFinite(v) && v < value) countBelow++;
  }
  return Math.round((countBelow / (pool.length - 1)) * 100);
}
