import { classifyRegime, type RegimeResult } from "./RegimeClassifier.js";
import { applyPersonalityToConfidence, getProfile, type PersonalityName } from "./AIPersonality.js";

// ── ConfidenceScorer ──────────────────────────────────────────────────────────
//
// Takes raw AI signal confidence and applies a multi-factor scoring pipeline:
//
//   1. Regime classification         — boosts trending, penalises sideways
//   2. Volume confirmation           — required volume spike boosts score
//   3. Multi-timeframe alignment     — MTF agreement boosts, mismatch penalises
//   4. AI personality modifier       — per-user risk profile multiplier
//   5. Volatility adaptation         — scales position size to ATR
//   6. Drawdown adaptation           — reduces confidence when PnL is negative
//
// Returns a ScoredSignal with the final adjusted confidence and
// an explanation trail so audit logs can trace every adjustment.

interface RawSignal {
  symbol:        string;
  timeframe:     string;
  decision:      "BUY" | "SELL" | "HOLD";
  rawConfidence: number;          // 0–100 from aiReasoning engine
  mtfConfirmed:  boolean;
  volumeConfirmed: boolean;
  rsi:           number;
  emaSpreadPct:  number;          // |EMA9-EMA21| / price
}

interface Candle { open: number; high: number; low: number; close: number; volume: number }

export interface ScoredSignal {
  symbol:             string;
  decision:           string;
  rawConfidence:      number;
  adjustedConfidence: number;         // final value used for trade gating
  regime:             RegimeResult;
  personalityName:    PersonalityName;
  passed:             boolean;        // whether signal meets personality threshold
  adjustments: Array<{ factor: string; delta: number; reason: string }>;
  positionSizeMultiplier: number;     // 0–1 relative to max position — volatility-adjusted
  scoredAt:           number;
}

// ── Scoring pipeline ──────────────────────────────────────────────────────────

export function scoreSignal(
  signal:          RawSignal,
  candles:         Candle[],
  personality:     PersonalityName,
  dailyPnLPct:     number,          // negative = drawdown
): ScoredSignal {
  const profile     = getProfile(personality);
  const regime      = classifyRegime(candles);
  const adjustments: ScoredSignal["adjustments"] = [];

  let conf = signal.rawConfidence;

  // ── Factor 1: Regime bonus / penalty ──────────────────────────────────────
  const regimeDelta = computeRegimeDelta(regime, signal.decision);
  if (regimeDelta !== 0) {
    conf += regimeDelta;
    adjustments.push({ factor: "Regime", delta: regimeDelta, reason: regime.reasoning });
  }

  // ── Factor 2: Volume confirmation ──────────────────────────────────────────
  if (!signal.volumeConfirmed) {
    const d = -8;
    conf += d;
    adjustments.push({ factor: "Volume", delta: d, reason: "Volume below 85% rolling avg — penalising" });
  } else {
    const d = +4;
    conf += d;
    adjustments.push({ factor: "Volume", delta: d, reason: "Volume confirmed — boosting" });
  }

  // ── Factor 3: MTF alignment ────────────────────────────────────────────────
  if (signal.mtfConfirmed) {
    const d = +10;
    conf += d;
    adjustments.push({ factor: "MTF", delta: d, reason: "5m and 15m timeframes agree — boosting" });
  } else {
    const d = -12;
    conf += d;
    adjustments.push({ factor: "MTF", delta: d, reason: "MTF mismatch — penalising" });
  }

  // ── Factor 4: RSI extreme zones ───────────────────────────────────────────
  const { rsi } = signal;
  if (signal.decision === "BUY" && rsi < 30) {
    const d = +6;
    conf += d;
    adjustments.push({ factor: "RSI", delta: d, reason: `RSI ${rsi.toFixed(0)} — oversold zone supports BUY` });
  } else if (signal.decision === "SELL" && rsi > 70) {
    const d = +6;
    conf += d;
    adjustments.push({ factor: "RSI", delta: d, reason: `RSI ${rsi.toFixed(0)} — overbought zone supports SELL` });
  } else if (signal.decision === "BUY" && rsi > 70) {
    const d = -8;
    conf += d;
    adjustments.push({ factor: "RSI", delta: d, reason: `RSI ${rsi.toFixed(0)} — overbought, BUY risk elevated` });
  } else if (signal.decision === "SELL" && rsi < 30) {
    const d = -8;
    conf += d;
    adjustments.push({ factor: "RSI", delta: d, reason: `RSI ${rsi.toFixed(0)} — oversold, SELL risk elevated` });
  }

  // ── Factor 5: Drawdown adaptation ─────────────────────────────────────────
  if (dailyPnLPct < -3) {
    const d = -15;
    conf += d;
    adjustments.push({ factor: "Drawdown", delta: d, reason: `Daily PnL ${dailyPnLPct.toFixed(1)}% — reducing exposure` });
  } else if (dailyPnLPct < -1.5) {
    const d = -7;
    conf += d;
    adjustments.push({ factor: "Drawdown", delta: d, reason: `Daily PnL ${dailyPnLPct.toFixed(1)}% — caution mode` });
  }

  // ── Factor 6: Personality multiplier ─────────────────────────────────────
  conf = applyPersonalityToConfidence(conf, profile, regime.regime);
  adjustments.push({
    factor: "Personality",
    delta:  +(conf - conf / profile.confidenceMultiplier).toFixed(1),
    reason: `${profile.label} profile multiplier ×${profile.confidenceMultiplier}`,
  });

  const adjustedConfidence = Math.max(0, Math.min(100, parseFloat(conf.toFixed(1))));
  const passed = signal.decision !== "HOLD" && adjustedConfidence >= profile.minConfidence;

  // ── Position size multiplier: inverse volatility scaling ──────────────────
  const atrPct  = regime.atrPct || 1;
  const baseline = 1.5;   // "normal" ATR% for this asset class
  const sizeMultiplier = parseFloat(Math.min(1, Math.max(0.1, baseline / atrPct)).toFixed(2));

  return {
    symbol:                signal.symbol,
    decision:              signal.decision,
    rawConfidence:         signal.rawConfidence,
    adjustedConfidence,
    regime,
    personalityName:       personality,
    passed,
    adjustments,
    positionSizeMultiplier: sizeMultiplier,
    scoredAt:              Date.now(),
  };
}

// ── Regime delta table ─────────────────────────────────────────────────────────

function computeRegimeDelta(regime: RegimeResult, decision: string): number {
  switch (regime.regime) {
    case "TRENDING_UP":
      return decision === "BUY"  ? +8 : decision === "SELL" ? -10 : 0;
    case "TRENDING_DOWN":
      return decision === "SELL" ? +8 : decision === "BUY"  ? -10 : 0;
    case "RANGING":
      return -5;       // both long and short are risky in sideways
    case "BREAKOUT":
      return +5;       // breakout favours momentum trades
    case "HIGH_VOLATILITY":
      return -12;      // high vol means wider spreads, slippage risk
    case "LOW_VOLATILITY":
      return -3;       // low vol means smaller edge
    case "UNKNOWN":
      return -20;      // no data = large penalty
    default:
      return 0;
  }
}
