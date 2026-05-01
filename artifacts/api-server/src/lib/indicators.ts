import type { Candle } from "./marketData.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Signal = "bullish" | "bearish" | "neutral";

export interface RSIResult {
  value: number;
  signal: Signal;
  score: number;
  label: string;
}

export interface EMAResult {
  short: number;
  shortPeriod: number;
  long: number;
  longPeriod: number;
  spread: number;
  spreadPct: number;
  signal: Signal;
  score: number;
  crossover: "golden" | "death" | "none";
}

export interface TrendResult {
  direction: Signal;
  strength: "strong" | "moderate" | "weak";
  score: number;
  priceVsEma9: "above" | "below";
  priceVsEma21: "above" | "below";
}

export interface PatternResult {
  name: string;
  detected: boolean;
  signal: Signal;
  score: number;
  description: string;
}

export interface AnalysisResult {
  symbol: string;
  timeframe: string;
  price: number;
  analyzedAt: number;
  candles: number;
  indicators: {
    rsi: RSIResult;
    ema: EMAResult;
    trend: TrendResult;
  };
  patterns: PatternResult[];
  summary: {
    totalScore: number;
    maxScore: number;
    normalizedScore: number;
    signal: Signal;
    confidence: number;
  };
}

// ── RSI ────────────────────────────────────────────────────────────────────────

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

export function computeRSI(candles: Candle[]): RSIResult {
  const closes = candles.map((c) => c.close);
  const value = calcRSI(closes);

  let signal: Signal;
  let score: number;
  let label: string;

  if (value < 30)      { signal = "bullish"; score = 1.0;  label = "Oversold" }
  else if (value < 40) { signal = "bullish"; score = 0.5;  label = "Near Oversold" }
  else if (value > 70) { signal = "bearish"; score = -1.0; label = "Overbought" }
  else if (value > 60) { signal = "bearish"; score = -0.5; label = "Near Overbought" }
  else                 { signal = "neutral"; score = 0;    label = "Neutral" }

  return { value, signal, score, label };
}

// ── EMA ────────────────────────────────────────────────────────────────────────

function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return parseFloat(ema.toFixed(2));
}

export function computeEMA(candles: Candle[], shortPeriod = 9, longPeriod = 21): EMAResult {
  const closes = candles.map((c) => c.close);
  const short = calcEMA(closes, shortPeriod);
  const long  = calcEMA(closes, longPeriod);
  const spread    = parseFloat((short - long).toFixed(2));
  const spreadPct = parseFloat(((spread / long) * 100).toFixed(3));

  // Detect crossover by comparing previous bar
  let crossover: EMAResult["crossover"] = "none";
  if (closes.length >= longPeriod + 2) {
    const prevCloses = closes.slice(0, -1);
    const prevShort  = calcEMA(prevCloses, shortPeriod);
    const prevLong   = calcEMA(prevCloses, longPeriod);
    if (prevShort < prevLong && short > long) crossover = "golden";
    if (prevShort > prevLong && short < long) crossover = "death";
  }

  let signal: Signal;
  let score: number;

  if (spread > 0) {
    signal = "bullish";
    score  = crossover === "golden" ? 1.0 : Math.min(0.8, spreadPct * 10);
  } else if (spread < 0) {
    signal = "bearish";
    score  = crossover === "death" ? -1.0 : Math.max(-0.8, spreadPct * 10);
  } else {
    signal = "neutral";
    score  = 0;
  }

  return { short, shortPeriod, long, longPeriod, spread, spreadPct, signal, score, crossover };
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export function computeTrend(candles: Candle[], ema: EMAResult): TrendResult {
  const price = candles[candles.length - 1].close;
  const closes = candles.map((c) => c.close);

  const priceVsEma9:  TrendResult["priceVsEma9"]  = price > ema.short ? "above" : "below";
  const priceVsEma21: TrendResult["priceVsEma21"] = price > ema.long  ? "above" : "below";

  // Recent slope over last 5 closes
  const recent = closes.slice(-5);
  const slope = recent[recent.length - 1] - recent[0];
  const slopePct = (slope / recent[0]) * 100;

  let direction: Signal;
  let strength: TrendResult["strength"];
  let score: number;

  if (priceVsEma9 === "above" && priceVsEma21 === "above" && slope > 0) {
    direction = "bullish";
    strength  = Math.abs(slopePct) > 0.5 ? "strong" : "moderate";
    score     = strength === "strong" ? 1.0 : 0.6;
  } else if (priceVsEma9 === "below" && priceVsEma21 === "below" && slope < 0) {
    direction = "bearish";
    strength  = Math.abs(slopePct) > 0.5 ? "strong" : "moderate";
    score     = strength === "strong" ? -1.0 : -0.6;
  } else if (priceVsEma21 === "above") {
    direction = "bullish";
    strength  = "weak";
    score     = 0.3;
  } else if (priceVsEma21 === "below") {
    direction = "bearish";
    strength  = "weak";
    score     = -0.3;
  } else {
    direction = "neutral";
    strength  = "weak";
    score     = 0;
  }

  return { direction, strength, score, priceVsEma9, priceVsEma21 };
}

// ── Candle Patterns ────────────────────────────────────────────────────────────

function bodySize(c: Candle)      { return Math.abs(c.close - c.open); }
function candleRange(c: Candle)   { return c.high - c.low; }
function lowerWick(c: Candle)     { return Math.min(c.open, c.close) - c.low; }
function upperWick(c: Candle)     { return c.high - Math.max(c.open, c.close); }
function isBullish(c: Candle)     { return c.close > c.open; }
function isBearish(c: Candle)     { return c.close < c.open; }

function detectHammer(curr: Candle): PatternResult {
  const body  = bodySize(curr);
  const lower = lowerWick(curr);
  const upper = upperWick(curr);
  const range = candleRange(curr);
  const detected =
    range > 0 &&
    lower >= 2 * body &&
    upper <= body * 0.3 &&
    body >= range * 0.05;
  return {
    name: "Hammer",
    detected,
    signal: "bullish",
    score: detected ? 0.7 : 0,
    description: "Long lower wick with small body — potential bullish reversal",
  };
}

function detectShootingStar(curr: Candle): PatternResult {
  const body  = bodySize(curr);
  const lower = lowerWick(curr);
  const upper = upperWick(curr);
  const range = candleRange(curr);
  const detected =
    range > 0 &&
    upper >= 2 * body &&
    lower <= body * 0.3 &&
    body >= range * 0.05;
  return {
    name: "Shooting Star",
    detected,
    signal: "bearish",
    score: detected ? -0.7 : 0,
    description: "Long upper wick with small body — potential bearish reversal",
  };
}

function detectDoji(curr: Candle): PatternResult {
  const body  = bodySize(curr);
  const range = candleRange(curr);
  const detected = range > 0 && body / range <= 0.1;
  return {
    name: "Doji",
    detected,
    signal: "neutral",
    score: detected ? 0.2 : 0,
    description: "Open ≈ Close — indecision, potential reversal signal",
  };
}

function detectBullishEngulfing(prev: Candle, curr: Candle): PatternResult {
  const detected =
    isBearish(prev) &&
    isBullish(curr) &&
    curr.open <= prev.close &&
    curr.close >= prev.open;
  return {
    name: "Bullish Engulfing",
    detected,
    signal: "bullish",
    score: detected ? 1.0 : 0,
    description: "Bullish candle completely engulfs prior bearish candle — strong reversal signal",
  };
}

function detectBearishEngulfing(prev: Candle, curr: Candle): PatternResult {
  const detected =
    isBullish(prev) &&
    isBearish(curr) &&
    curr.open >= prev.close &&
    curr.close <= prev.open;
  return {
    name: "Bearish Engulfing",
    detected,
    signal: "bearish",
    score: detected ? -1.0 : 0,
    description: "Bearish candle completely engulfs prior bullish candle — strong reversal signal",
  };
}

export function detectPatterns(candles: Candle[]): PatternResult[] {
  if (candles.length < 2) return [];
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  return [
    detectBullishEngulfing(prev, curr),
    detectBearishEngulfing(prev, curr),
    detectHammer(curr),
    detectShootingStar(curr),
    detectDoji(curr),
  ];
}

// ── Full Analysis ──────────────────────────────────────────────────────────────

export function runAnalysis(symbol: string, timeframe: string, candles: Candle[]): AnalysisResult {
  const rsi     = computeRSI(candles);
  const ema     = computeEMA(candles);
  const trend   = computeTrend(candles, ema);
  const patterns = detectPatterns(candles);

  const price = candles[candles.length - 1].close;

  // Score accumulation
  const indicatorScore = rsi.score + ema.score + trend.score;
  const patternScore   = patterns.filter((p) => p.detected).reduce((s, p) => s + p.score, 0);
  const totalScore     = parseFloat((indicatorScore + patternScore).toFixed(3));

  // Max possible score: rsi(1) + ema(1) + trend(1) + patterns(bullish_engulf(1) + hammer(0.7) + doji(0.2) = 1.9)
  const maxScore    = 4.9;
  const clampedScore = Math.max(-maxScore, Math.min(maxScore, totalScore));
  const normalizedScore = parseFloat(((clampedScore / maxScore + 1) / 2).toFixed(3)); // 0–1

  let signal: Signal;
  if (totalScore > 0.5)       signal = "bullish";
  else if (totalScore < -0.5) signal = "bearish";
  else                        signal = "neutral";

  const confidence = parseFloat(Math.min(99, Math.max(10, Math.abs(normalizedScore - 0.5) * 200)).toFixed(1));

  return {
    symbol,
    timeframe,
    price,
    analyzedAt: Date.now(),
    candles: candles.length,
    indicators: { rsi, ema, trend },
    patterns,
    summary: { totalScore, maxScore, normalizedScore, signal, confidence },
  };
}
