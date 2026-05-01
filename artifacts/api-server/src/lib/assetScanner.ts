import { getCandles } from "./marketData.js";
import { emaArray, rsiArray } from "./backtestEngine.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AssetScan {
  symbol:      string;       // "BTCUSD"
  displayName: string;       // "BTC"
  price:       number;
  change1h:    number;       // % vs prior candle
  change4h:    number;       // % vs 4 candles ago
  change24h:   number;       // % vs 24 candles ago
  ema9:        number;
  ema21:       number;
  rsi:         number;
  trend:       "BULLISH" | "BEARISH" | "NEUTRAL";
  momentum:    "STRONG" | "MODERATE" | "WEAK";
  confidence:  number;       // 0–100
  signal:      "BUY" | "NEUTRAL" | "AVOID";
  rank:        number;
  tradeStatus: "ACTIVE" | "WATCHING" | "SKIP";
  reasons:     string[];
  scannedAt:   number;
}

export interface ScanResult {
  assets:      AssetScan[];
  activeCount: number;
  summary:     { buy: number; neutral: number; avoid: number };
  scannedAt:   number;
}

const ASSETS: { symbol: string; name: string }[] = [
  { symbol: "BTCUSD", name: "BTC" },
  { symbol: "ETHUSD", name: "ETH" },
  { symbol: "SOLUSD", name: "SOL" },
];

// ── Single-asset analysis ─────────────────────────────────────────────────────

async function scanAsset(symbol: string, displayName: string): Promise<Omit<AssetScan, "rank" | "tradeStatus">> {
  const candles = await getCandles(symbol, "1h", 100);
  if (candles.length < 30) throw new Error(`Insufficient candles for ${symbol}`);

  const closes  = candles.map(c => c.close);
  const price   = closes[closes.length - 1]!;
  const ema9Arr = emaArray(closes, 9);
  const ema21Arr= emaArray(closes, 21);
  const rsiArr  = rsiArray(closes, 14);

  const ema9  = ema9Arr[ema9Arr.length - 1]!;
  const ema21 = ema21Arr[ema21Arr.length - 1]!;
  const rsi   = rsiArr[rsiArr.length - 1]!;

  const prev1  = closes[closes.length - 2]!;
  const prev4  = closes[closes.length - 5]!;
  const prev24 = closes[closes.length - 25] ?? closes[0]!;

  const change1h  = ((price - prev1)  / prev1)  * 100;
  const change4h  = ((price - prev4)  / prev4)  * 100;
  const change24h = ((price - prev24) / prev24) * 100;

  // ── Trend ──────────────────────────────────────────────────────────────────
  const trend: AssetScan["trend"] =
    ema9 > ema21 ? "BULLISH" :
    ema9 < ema21 ? "BEARISH" : "NEUTRAL";

  // ── Momentum ──────────────────────────────────────────────────────────────
  const absChange4h = Math.abs(change4h);
  const momentum: AssetScan["momentum"] =
    absChange4h >= 2  ? "STRONG" :
    absChange4h >= 0.8? "MODERATE" : "WEAK";

  // ── Confidence scoring (0–100) ────────────────────────────────────────────
  const reasons: string[] = [];
  let score = 0;

  // EMA alignment (30 pts)
  if (ema9 > ema21) {
    const separation = ((ema9 - ema21) / ema21) * 100;
    const pts = separation > 0.5 ? 30 : 20;
    score += pts;
    reasons.push(`EMA 9 > EMA 21 — bullish trend (sep ${separation.toFixed(2)}%)`);
  } else {
    const separation = ((ema21 - ema9) / ema21) * 100;
    score -= 10;
    reasons.push(`EMA 9 < EMA 21 — bearish trend (sep ${separation.toFixed(2)}%)`);
  }

  // RSI position (25 pts)
  if (rsi < 40) {
    score += 25;
    reasons.push(`RSI ${rsi.toFixed(1)} — oversold, strong reversal potential`);
  } else if (rsi < 55) {
    score += 20;
    reasons.push(`RSI ${rsi.toFixed(1)} — neutral zone, room to run`);
  } else if (rsi < 65) {
    score += 10;
    reasons.push(`RSI ${rsi.toFixed(1)} — mildly elevated, watch closely`);
  } else if (rsi < 75) {
    score += 0;
    reasons.push(`RSI ${rsi.toFixed(1)} — approaching overbought`);
  } else {
    score -= 15;
    reasons.push(`RSI ${rsi.toFixed(1)} — overbought, avoid entry`);
  }

  // 1h momentum (20 pts)
  if (change1h > 0.5) {
    score += 20;
    reasons.push(`1h momentum +${change1h.toFixed(2)}% — strong buying pressure`);
  } else if (change1h > 0) {
    score += 10;
    reasons.push(`1h momentum +${change1h.toFixed(2)}% — mild positive`);
  } else if (change1h > -0.5) {
    score += 5;
    reasons.push(`1h change ${change1h.toFixed(2)}% — flat`);
  } else {
    score -= 5;
    reasons.push(`1h momentum ${change1h.toFixed(2)}% — selling pressure`);
  }

  // 24h trend (15 pts)
  if (change24h > 3) {
    score += 15;
    reasons.push(`24h change +${change24h.toFixed(2)}% — strong daily uptrend`);
  } else if (change24h > 0) {
    score += 10;
    reasons.push(`24h change +${change24h.toFixed(2)}% — positive daily bias`);
  } else if (change24h > -3) {
    score += 2;
    reasons.push(`24h change ${change24h.toFixed(2)}% — slight daily pullback`);
  } else {
    score -= 10;
    reasons.push(`24h change ${change24h.toFixed(2)}% — significant daily decline`);
  }

  // EMA momentum (EMA9 slope) (10 pts)
  const prevEma9 = ema9Arr[ema9Arr.length - 3]!;
  const ema9slope = ((ema9 - prevEma9) / prevEma9) * 100;
  if (ema9slope > 0.1) {
    score += 10;
    reasons.push(`EMA 9 rising slope +${ema9slope.toFixed(3)}%`);
  } else if (ema9slope < -0.1) {
    score -= 5;
    reasons.push(`EMA 9 falling slope ${ema9slope.toFixed(3)}%`);
  }

  // Clamp to 0–100
  const confidence = Math.min(100, Math.max(0, Math.round(score)));

  // ── Signal ─────────────────────────────────────────────────────────────────
  const signal: AssetScan["signal"] =
    confidence >= 60 ? "BUY" :
    confidence >= 35 ? "NEUTRAL" : "AVOID";

  return {
    symbol,
    displayName,
    price:      parseFloat(price.toFixed(2)),
    change1h:   parseFloat(change1h.toFixed(3)),
    change4h:   parseFloat(change4h.toFixed(3)),
    change24h:  parseFloat(change24h.toFixed(3)),
    ema9:       parseFloat(ema9.toFixed(2)),
    ema21:      parseFloat(ema21.toFixed(2)),
    rsi:        parseFloat(rsi.toFixed(1)),
    trend,
    momentum,
    confidence,
    signal,
    reasons,
    scannedAt:  Date.now(),
  };
}

// ── Full scan (all 3 assets) ──────────────────────────────────────────────────

const MAX_ACTIVE = 2;

export async function runScan(): Promise<ScanResult> {
  const results = await Promise.all(
    ASSETS.map(a => scanAsset(a.symbol, a.name))
  );

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  // Assign rank and trade status (max 2 active, BUY-signal only)
  let activeCount = 0;
  const assets: AssetScan[] = results.map((r, i) => {
    let tradeStatus: AssetScan["tradeStatus"];
    if (r.signal === "BUY" && activeCount < MAX_ACTIVE) {
      tradeStatus = "ACTIVE";
      activeCount++;
    } else if (r.signal === "NEUTRAL") {
      tradeStatus = "WATCHING";
    } else {
      tradeStatus = "SKIP";
    }
    return { ...r, rank: i + 1, tradeStatus };
  });

  const summary = {
    buy:     assets.filter(a => a.signal === "BUY").length,
    neutral: assets.filter(a => a.signal === "NEUTRAL").length,
    avoid:   assets.filter(a => a.signal === "AVOID").length,
  };

  return { assets, activeCount, summary, scannedAt: Date.now() };
}
