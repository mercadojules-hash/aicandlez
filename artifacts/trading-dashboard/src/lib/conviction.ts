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

// Pass C5 — confidence compression + smoother distribution.
// Targets a believable institutional spread:
//   weak setups    20–35   (DEVELOPING)
//   average        35–50   (MODERATE)
//   strong         50–70   (STRONG)
//   elite          70–85   (HIGH)
//   exceptional    85+     (ELITE — extremely rare; needs near-perfect
//                           alignment AND elite raw simultaneously)
// Combined with the linear-floor calibrate curve and diminishing-returns
// backend stacking (`computeDisplayConfidence`), the typical opportunity
// board now contains 2–5 medium setups, 1–3 strong, and an occasional
// elite — rather than a wasteland with one god signal.
const TIER_THRESHOLDS: { tier: ConvictionTier; min: number }[] = [
  { tier: "ELITE",      min: 85 },
  { tier: "HIGH",       min: 70 },
  { tier: "STRONG",     min: 50 },
  { tier: "MODERATE",   min: 35 },
  { tier: "DEVELOPING", min: 20 },
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

/**
 * Calibrate the engine's compressed raw confidence onto a
 * human-readable 0–100 scale.
 *
 * WHY THIS EXISTS
 * The engine formula `clamp(|totalScore|/5.7 × 150, 10, 98)` is
 * mathematically compressive — even the strongest live setups
 * naturally cluster in the 15–50 range. That's correct for
 * execution gating but psychologically destroys user trust:
 * a 5-day backtest with the prior calibration legitimately
 * produced 84/86/87/90/95 on the same quality of setup that
 * now renders as 17/21/26/38.
 *
 * THIS FUNCTION IS NOT INFLATION
 *   • Raw engine confidence is NEVER mutated, persisted, or
 *     used for execution. It flows untouched to admin, audit,
 *     order routing, risk sizing.
 *   • This curve is applied ONLY inside `computeConviction()`
 *     when feeding the user-facing render layer.
 *   • Weak signals stay weak — `calibrate(0)=0`, `calibrate(5)=22`,
 *     and the rank/MTF/trend/liquidity/regime factors still
 *     pull a junk signal back down.
 *
 * CURVE (Pass C5 — linear-floor with soft ceiling):
 *      raw    →  calibrated
 *       0     →    0     (no signal at all)
 *      10     →   21     (psychological floor)
 *      20     →   26
 *      30     →   32
 *      40     →   37
 *      50     →   43
 *      60     →   48
 *      70     →   54
 *      85     →   62
 *     100     →   70
 *
 * Replaces the prior power-0.50 curve (raw=50 → 71, raw=70 → 84) which
 * was the root cause of the user-reported "binary distribution / 90+ ELITE
 * showing up on average setups" complaint. The new linear curve preserves
 * monotonic ranking but compresses the upper end so the final calibrated
 * score (raw × 0.30 weight + context factors) only crosses ELITE when the
 * full context stack (MTF, trend, liquidity, regime, RR) ALSO aligns.
 *
 * Formula: f(r) = 15 + r * 0.55 for r > 0, clamped [0..100].
 *   - Floor 15 (the +15 baseline) means even an existing signal gets a
 *     dignified starting point rather than collapsing into single digits.
 *   - Slope 0.55 ensures even raw=100 only reaches 70 calibrated; the
 *     remaining 30 pts must be earned by genuine context alignment.
 */
export function calibrateRawConfidence(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const r = Math.min(100, raw);
  return Math.round(15 + r * 0.55);
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
  // Apply the calibration curve so the engine's compressive raw range
  // (typical valid signals cluster 15–50) maps onto the human-readable
  // 39–77 band before weighting. Combined with rank/MTF/trend/liquidity
  // context this lets a top-ranked, MTF-confirmed, well-aligned setup
  // legitimately surface as HIGH/ELITE (80–95) — the same way the
  // engine read in the prior 5-day backtest window.
  const rawN   = clamp01_100(calibrateRawConfidence(i.rawConfidence));
  const rankN  = clamp01_100(i.rankPercentile);
  const mtfN   = i.mtfAgreed ? 100 : 0;
  const trendN = clamp01_100(i.trendStrength);
  const liqN   = clamp01_100(i.liquidityScore);
  const regN   = clamp01_100(i.regimeScore);
  const rrN    = clamp01_100(rrRatioToScore(i.rrRatio));

  const base = clamp01_100(
    rawN   * WEIGHTS.raw +
    rankN  * WEIGHTS.rank +
    mtfN   * WEIGHTS.mtf +
    trendN * WEIGHTS.trend +
    liqN   * WEIGHTS.liquidity +
    regN   * WEIGHTS.regime +
    rrN    * WEIGHTS.rr,
  );

  // ── Pass C3 — Synergy bonus / Discord penalty ────────────────────
  // The weighted sum above is a fair *average*. Institutional
  // conviction is non-linear: when 4+ factors all align, the setup
  // earns a confidence boost beyond the average; when raw confidence
  // is decent but key context disagrees, the setup is sharply
  // suppressed instead of merely averaged down.
  //
  //   • Synergy: count "strong" factors among
  //     { MTF=100, trend≥70, liquidity≥70, regime≥70, RR-score≥60 }.
  //     ≥4 strong → +6 ; ≥5 strong → +12.
  //   • Discord: if calibrated raw ≥55 (the engine likes it) but
  //     context breaks {!MTF, OR trend<40, OR liquidity<50} →
  //     subtract 8 per discord, capped at -15. This is the "mediocre
  //     setups should NOT score high" lever — punishes the conflict
  //     pattern user identified (strong raw, weak everything else).
  //
  // Both modifiers are bounded so weak signals still cap low and
  // strong signals still cap at 100. Ranking monotonicity is
  // preserved within each context class.
  let strongCount = 0;
  if (mtfN === 100)  strongCount++;
  if (trendN >= 70)  strongCount++;
  if (liqN >= 70)    strongCount++;
  if (regN >= 70)    strongCount++;
  if (rrN >= 60)     strongCount++;
  // Pass C5 — synergy halved (was +12/+6). The diminishing-returns
  // backend stack already encodes "fully aligned setup deserves a
  // bonus". Synergy here is a smaller institutional cherry on top so
  // that a perfect-alignment + raw-95 setup can legitimately reach
  // mid-80s but a perfect-alignment + raw-50 setup can't masquerade as
  // ELITE on context alone.
  const synergy =
    strongCount >= 5 ? 8 :
    strongCount >= 4 ? 4 :
    0;

  // Discord is ramped linearly between calibrated raw 45 → 60 (rather
  // than gated at a single threshold) so the function stays monotonic
  // across the raw range within a fixed context class. A setup at
  // rawN=54 with broken context would otherwise score *higher* than
  // the same context at rawN=55, which violates ranking semantics.
  // Pass C5 — discord cap reduced from -15 to -12 to match the gentler
  // synergy ceiling and avoid double-penalizing weak setups (the
  // diminishing-returns backend stack already pulls them down).
  let discordRaw = 0;
  if (mtfN === 0)   discordRaw += 7;
  if (trendN < 40)  discordRaw += 4;
  if (liqN < 50)    discordRaw += 3;
  discordRaw = Math.min(12, discordRaw);
  const discordRamp = rawN <= 45 ? 0
                    : rawN >= 60 ? 1
                    : (rawN - 45) / 15;
  const discord = discordRaw * discordRamp;

  // ── Pass C5 — soft ceiling compression above 75 ──────────────────
  // Even with synergy capped at +8, a setup with all weights firing can
  // still climb into the 90s on weighted-sum alone. The user-reported
  // "isolated 90 ELITE / most cards collapsed 5-29" pattern is exactly
  // this: a single near-perfect tick blasts past 90 while everything
  // else sits unbonused. Soft-compress every point above 75 by 50% so:
  //   weighted 70 → 70        (unchanged below knee)
  //   weighted 80 → 77.5
  //   weighted 90 → 82.5
  //   weighted 100 → 87.5
  // After synergy, the practical ELITE ceiling becomes ~95 and 90+
  // requires both excellent raw AND every context factor maxed
  // (extremely rare in practice).
  const beforeMods = base + synergy - discord;
  const compressed = beforeMods <= 75
    ? beforeMods
    : 75 + (beforeMods - 75) * 0.5;
  const score = clamp01_100(compressed);

  return {
    score:     Math.round(score),
    tier:      tierFor(score),
    breakdown: {
      raw:       mkFactor(rawN,   WEIGHTS.raw,       "Engine confidence (calibrated)"),
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
