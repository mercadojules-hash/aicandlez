// ── RegimeClassifier ──────────────────────────────────────────────────────────
//
// Classifies the current market regime from OHLCV candle data.
//
// Regimes:
//   TRENDING_UP    — strong uptrend, EMA aligned, momentum positive
//   TRENDING_DOWN  — strong downtrend
//   RANGING        — price oscillating in a band, low EMA spread
//   BREAKOUT       — sudden directional expansion from a ranging state
//   HIGH_VOLATILITY — large candle bodies, ATR spike
//   LOW_VOLATILITY  — compressed candles, pre-breakout coil
//   UNKNOWN         — insufficient data
//
// Used by:
//   ConfidenceScorer  — regime-based confidence modulation
//   AIPersonality     — personality-specific regime filters
//   RiskEngine        — volatility-based position sizing

export type MarketRegime =
  | "TRENDING_UP"
  | "TRENDING_DOWN"
  | "RANGING"
  | "BREAKOUT"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "UNKNOWN";

export interface RegimeResult {
  regime:         MarketRegime;
  confidence:     number;          // 0–100: how confident the classifier is
  atr:            number;          // average true range (price units)
  atrPct:         number;          // ATR as % of current price
  emaSpreadPct:   number;          // |EMA9 - EMA21| / price
  momentumScore:  number;          // –100 to +100
  rangeExpansion: boolean;         // true if ATR > 1.5× 20-bar ATR avg
  reasoning:      string;
}

interface Candle { open: number; high: number; low: number; close: number; volume: number }

// ── ATR ───────────────────────────────────────────────────────────────────────

function computeATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    trs.push(Math.max(
      c.high - c.low,
      Math.abs(c.high  - p.close),
      Math.abs(c.low   - p.close),
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ── EMA ───────────────────────────────────────────────────────────────────────

function ema(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i]! * k + e * (1 - k);
  return e;
}

// ── Momentum: rate of change ───────────────────────────────────────────────────

function roc(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  const old = closes[closes.length - 1 - period]!;
  const cur = closes[closes.length - 1]!;
  return old > 0 ? ((cur - old) / old) * 100 : 0;
}

// ── Main classifier ───────────────────────────────────────────────────────────

export function classifyRegime(candles: Candle[]): RegimeResult {
  if (candles.length < 30) {
    return {
      regime: "UNKNOWN", confidence: 0, atr: 0, atrPct: 0,
      emaSpreadPct: 0, momentumScore: 0, rangeExpansion: false,
      reasoning: "Insufficient data (< 30 candles)",
    };
  }

  const closes  = candles.map(c => c.close);
  const current = closes[closes.length - 1]!;

  const ema9  = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, Math.min(50, closes.length));

  const emaSpread    = Math.abs(ema9 - ema21);
  const emaSpreadPct = current > 0 ? (emaSpread / current) * 100 : 0;

  const atr    = computeATR(candles);
  const atrPct = current > 0 ? (atr / current) * 100 : 0;

  // Average ATR over last 20 bars
  const atrAvg20  = computeATR(candles.slice(-20));
  const rangeExpansion = atr > atrAvg20 * 1.5;

  const momentum = roc(closes, 14);

  // ── Decision tree ──────────────────────────────────────────────────────────

  let regime:    MarketRegime = "UNKNOWN";
  let confidence = 60;
  let reasoning  = "";

  const isBullishEMA  = ema9 > ema21 && ema21 > ema50;
  const isBearishEMA  = ema9 < ema21 && ema21 < ema50;
  const isHighVol     = atrPct > 3.5;
  const isLowVol      = atrPct < 0.8;
  const isSideways    = emaSpreadPct < 0.15;

  if (isHighVol && rangeExpansion) {
    regime    = "HIGH_VOLATILITY";
    confidence = 70;
    reasoning  = `ATR ${atrPct.toFixed(2)}% (high), range expansion detected`;
  } else if (isLowVol && isSideways) {
    regime    = "LOW_VOLATILITY";
    confidence = 65;
    reasoning  = `ATR ${atrPct.toFixed(2)}% (low), EMA spread ${emaSpreadPct.toFixed(3)}% — coiling`;
  } else if (isSideways && !rangeExpansion) {
    if (rangeExpansion) {
      regime    = "BREAKOUT";
      confidence = 72;
      reasoning  = `EMA tight, sudden ATR expansion — breakout forming`;
    } else {
      regime    = "RANGING";
      confidence = 65;
      reasoning  = `EMA spread ${emaSpreadPct.toFixed(3)}% — sideways price action`;
    }
  } else if (isBullishEMA && momentum > 2) {
    regime    = "TRENDING_UP";
    confidence = 70 + Math.min(20, momentum);
    reasoning  = `EMA9 > EMA21 > EMA50, momentum +${momentum.toFixed(1)}%`;
  } else if (isBearishEMA && momentum < -2) {
    regime    = "TRENDING_DOWN";
    confidence = 70 + Math.min(20, Math.abs(momentum));
    reasoning  = `EMA9 < EMA21 < EMA50, momentum ${momentum.toFixed(1)}%`;
  } else if (rangeExpansion) {
    regime    = "BREAKOUT";
    confidence = 60;
    reasoning  = `ATR expansion from ranging state`;
  } else {
    regime    = "RANGING";
    confidence = 55;
    reasoning  = `Mixed signals — defaulting to RANGING`;
  }

  return {
    regime,
    confidence: Math.round(Math.min(95, confidence)),
    atr,
    atrPct: parseFloat(atrPct.toFixed(3)),
    emaSpreadPct: parseFloat(emaSpreadPct.toFixed(4)),
    momentumScore: parseFloat(momentum.toFixed(2)),
    rangeExpansion,
    reasoning,
  };
}
