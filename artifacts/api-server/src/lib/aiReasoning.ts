import type { Candle } from "./marketData.js";
import { runAnalysis } from "./indicators.js";

export type Decision = "BUY" | "SELL" | "HOLD";
export type Signal   = "bullish" | "bearish" | "neutral";

export interface MomentumResult {
  change5:    number;
  change5Pct: number;
  change20:   number;
  change20Pct: number;
  direction:  Signal;
  strength:   "strong" | "moderate" | "weak";
  score:      number;
}

export interface SignalFactor {
  name:        string;
  displayValue: string;
  signal:      Signal;
  score:       number;
  weight:      string;
  note:        string;
}

export interface AIDecisionResult {
  symbol:     string;
  timeframe:  string;
  price:      number;
  decision:   Decision;
  confidence: number;
  reasoning:  string;
  momentum:   MomentumResult;
  signals:    SignalFactor[];
  totalScore: number;
  maxScore:   number;
  analyzedAt: number;
  candles:    number;
}

// ── Momentum ──────────────────────────────────────────────────────────────────

function computeMomentum(candles: Candle[]): MomentumResult {
  const closes = candles.map((c) => c.close);
  const last  = closes[closes.length - 1];
  const c5    = closes[closes.length - 6]  ?? closes[0];
  const c20   = closes[closes.length - 21] ?? closes[0];

  const change5    = last - c5;
  const change5Pct = parseFloat(((change5 / c5) * 100).toFixed(3));
  const change20    = last - c20;
  const change20Pct = parseFloat(((change20 / c20) * 100).toFixed(3));

  let direction: Signal;
  let strength: MomentumResult["strength"];
  let score: number;

  const mag = Math.abs(change5Pct);

  if (change5Pct > 0.05) {
    direction = "bullish";
    strength  = mag > 1.5 ? "strong" : mag > 0.3 ? "moderate" : "weak";
    score     = strength === "strong" ? 0.8 : strength === "moderate" ? 0.5 : 0.2;
  } else if (change5Pct < -0.05) {
    direction = "bearish";
    strength  = mag > 1.5 ? "strong" : mag > 0.3 ? "moderate" : "weak";
    score     = strength === "strong" ? -0.8 : strength === "moderate" ? -0.5 : -0.2;
  } else {
    direction = "neutral";
    strength  = "weak";
    score     = 0;
  }

  return { change5, change5Pct, change20, change20Pct, direction, strength, score };
}

// ── Reasoning Text ────────────────────────────────────────────────────────────

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function buildReasoning(
  decision:   Decision,
  confidence: number,
  analysis:   ReturnType<typeof runAnalysis>,
  momentum:   MomentumResult,
): string {
  const { rsi, ema, trend } = analysis.indicators;
  const detected = analysis.patterns.filter((p) => p.detected);
  const parts: string[] = [];

  // 1. Trend
  if (trend.direction !== "neutral") {
    parts.push(
      `Trend is ${trend.strength}ly ${trend.direction} — price is ${trend.priceVsEma9} EMA9 ($${fmt(ema.short)}) and ${trend.priceVsEma21} EMA21 ($${fmt(ema.long)})`
    );
  } else {
    parts.push("Trend is neutral with mixed EMA positioning");
  }

  // 2. EMA crossover or spread
  if (ema.crossover === "golden") {
    parts.push(
      `Golden Cross active: EMA9 just crossed above EMA21 — a strong bullish momentum shift`
    );
  } else if (ema.crossover === "death") {
    parts.push(
      `Death Cross active: EMA9 just crossed below EMA21 — a strong bearish momentum shift`
    );
  } else {
    const direction = ema.signal === "bullish" ? "above" : ema.signal === "bearish" ? "below" : "near";
    parts.push(
      `EMA9 is ${direction} EMA21 by $${fmt(Math.abs(ema.spread))} (${ema.spreadPct > 0 ? "+" : ""}${ema.spreadPct.toFixed(3)}%)`
    );
  }

  // 3. RSI
  parts.push(`RSI(14) at ${rsi.value.toFixed(1)} — ${rsi.label}`);

  // 4. Candle patterns
  if (detected.length > 0) {
    const names = detected.map((p) => p.name).join(" + ");
    const sig   = detected.every((p) => p.signal === "bullish")
      ? "bullish continuation"
      : detected.every((p) => p.signal === "bearish")
      ? "bearish reversal"
      : "mixed pattern signal";
    parts.push(`${names} detected — ${sig}`);
  } else {
    parts.push("No reversal candle patterns detected on the most recent bar");
  }

  // 5. Momentum
  const sign = momentum.change5Pct >= 0 ? "+" : "";
  if (momentum.direction !== "neutral") {
    parts.push(
      `${cap(momentum.strength)} ${momentum.direction} momentum: price moved ${sign}${momentum.change5Pct.toFixed(2)}% over the last 5 candles`
    );
  } else {
    parts.push("Momentum is flat — no directional price pressure over the last 5 candles");
  }

  // 6. Conclusion
  const conf = confidence.toFixed(0);
  if (decision === "BUY") {
    parts.push(`All factors align ${confidence >= 70 ? "strongly" : "moderately"} bullish → ${decision} signal at ${conf}% confidence`);
  } else if (decision === "SELL") {
    parts.push(`Bearish confluence across indicators → ${decision} signal at ${conf}% confidence`);
  } else {
    parts.push(`Mixed signals with insufficient directional edge → ${decision} — wait for clearer setup`);
  }

  return parts.join(". ") + ".";
}

// ── Signal Factors Table ───────────────────────────────────────────────────────

function buildSignals(
  analysis:  ReturnType<typeof runAnalysis>,
  momentum:  MomentumResult,
): SignalFactor[] {
  const { rsi, ema, trend } = analysis.indicators;
  const detected = analysis.patterns.filter((p) => p.detected);
  const patternScore = detected.reduce((s, p) => s + p.score, 0);

  return [
    {
      name:         "RSI (14)",
      displayValue: `${rsi.value.toFixed(1)}`,
      signal:       rsi.signal,
      score:        rsi.score,
      weight:       `${rsi.score >= 0 ? "+" : ""}${rsi.score.toFixed(1)}`,
      note:         rsi.label,
    },
    {
      name:         "EMA Crossover",
      displayValue: ema.crossover !== "none"
        ? cap(ema.crossover) + " Cross"
        : `EMA9 ${ema.signal === "bullish" ? ">" : ema.signal === "bearish" ? "<" : "≈"} EMA21`,
      signal:       ema.signal,
      score:        ema.score,
      weight:       `${ema.score >= 0 ? "+" : ""}${ema.score.toFixed(2)}`,
      note:         `Spread $${fmt(Math.abs(ema.spread))} (${ema.spreadPct >= 0 ? "+" : ""}${ema.spreadPct.toFixed(3)}%)`,
    },
    {
      name:         "Trend",
      displayValue: `${cap(trend.strength)} ${cap(trend.direction)}`,
      signal:       trend.direction,
      score:        trend.score,
      weight:       `${trend.score >= 0 ? "+" : ""}${trend.score.toFixed(1)}`,
      note:         `Price ${trend.priceVsEma9} EMA9, ${trend.priceVsEma21} EMA21`,
    },
    {
      name:         "Momentum",
      displayValue: `${momentum.change5Pct >= 0 ? "+" : ""}${momentum.change5Pct.toFixed(2)}% / 5 bars`,
      signal:       momentum.direction,
      score:        momentum.score,
      weight:       `${momentum.score >= 0 ? "+" : ""}${momentum.score.toFixed(1)}`,
      note:         `${cap(momentum.strength)} ${momentum.direction} — 20-bar: ${momentum.change20Pct >= 0 ? "+" : ""}${momentum.change20Pct.toFixed(2)}%`,
    },
    {
      name:         "Candle Patterns",
      displayValue: detected.length > 0
        ? detected.map((p) => p.name).join(", ")
        : "None detected",
      signal:       detected.length > 0 ? detected[0].signal : "neutral",
      score:        patternScore,
      weight:       `${patternScore >= 0 ? "+" : ""}${patternScore.toFixed(1)}`,
      note:         detected.length > 0
        ? `${detected.length} pattern${detected.length > 1 ? "s" : ""} active`
        : "Awaiting reversal setup",
    },
  ];
}

// ── Main Entry ────────────────────────────────────────────────────────────────

export function runAIDecision(
  symbol:    string,
  timeframe: string,
  candles:   Candle[],
): AIDecisionResult {
  const analysis  = runAnalysis(symbol, timeframe, candles);
  const momentum  = computeMomentum(candles);

  // Combine all scores
  const { rsi, ema, trend } = analysis.indicators;
  const patternScore = analysis.patterns.filter((p) => p.detected).reduce((s, p) => s + p.score, 0);
  const totalScore   = parseFloat((rsi.score + ema.score + trend.score + momentum.score + patternScore).toFixed(3));
  const maxScore     = 5.7; // rsi(1)+ema(1)+trend(1)+momentum(0.8)+patterns(1.9)

  // Decision thresholds
  let decision: Decision;
  if (totalScore >= 1.5)       decision = "BUY";
  else if (totalScore <= -1.5) decision = "SELL";
  else                         decision = "HOLD";

  // Confidence: how far score is from 0, normalized
  const raw        = Math.abs(totalScore) / maxScore;
  const confidence = parseFloat(Math.min(98, Math.max(10, raw * 150)).toFixed(1));

  const reasoning = buildReasoning(decision, confidence, analysis, momentum);
  const signals   = buildSignals(analysis, momentum);

  return {
    symbol,
    timeframe,
    price:      candles[candles.length - 1].close,
    decision,
    confidence,
    reasoning,
    momentum,
    signals,
    totalScore,
    maxScore,
    analyzedAt: Date.now(),
    candles:    candles.length,
  };
}
