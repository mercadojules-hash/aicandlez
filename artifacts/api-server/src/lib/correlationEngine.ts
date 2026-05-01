import { getCandles } from "./marketData.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CorrelationPair {
  asset1:       string;   // e.g. "BTC"
  asset2:       string;
  correlation:  number;   // Pearson r, -1 to 1
  absCorr:      number;
  strength:     "HIGH" | "MODERATE" | "LOW";
  direction:    "POSITIVE" | "NEGATIVE";
  bothOpen:     boolean;  // both assets in open positions
  overlapRisk:  boolean;  // HIGH strength AND bothOpen
}

export interface CorrelationMatrix {
  pairs:                CorrelationPair[];
  diversificationScore: number;   // 0–100  (higher = more diversified)
  overlapWarning:       boolean;
  strongPairs:          string[];  // human-readable warnings
  candles:              number;
  computedAt:           number;
}

// ── Pearson r ─────────────────────────────────────────────────────────────────

function pearson(X: number[], Y: number[]): number {
  const n    = Math.min(X.length, Y.length);
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += X[i]!; sumY += Y[i]!; }
  const mx = sumX / n, my = sumY / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = X[i]! - mx, dy = Y[i]! - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  return dx2 === 0 || dy2 === 0 ? 0 : num / Math.sqrt(dx2 * dy2);
}

function returns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    out.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
  }
  return out;
}

// ── Config ────────────────────────────────────────────────────────────────────

const ASSETS  = ["BTCUSD", "ETHUSD", "SOLUSD"] as const;
const NAMES: Record<string, string> = { BTCUSD: "BTC", ETHUSD: "ETH", SOLUSD: "SOL" };

// Cache correlation for 2 minutes (candles don't change that fast)
let cache: { result: CorrelationMatrix; at: number } | null = null;
const CACHE_TTL = 120_000;

// ── Main ──────────────────────────────────────────────────────────────────────

export async function computeCorrelationMatrix(openSymbols: string[] = []): Promise<CorrelationMatrix> {
  if (cache && Date.now() - cache.at < CACHE_TTL && openSymbols.length === 0) {
    return { ...cache.result, computedAt: cache.at };
  }

  const candleArrays = await Promise.all(
    ASSETS.map(s => getCandles(s, "1h", 100))
  );
  const retSeries = candleArrays.map(c => returns(c.map(x => x.close)));
  const minLen    = Math.min(...retSeries.map(r => r.length));
  const trimmed   = retSeries.map(r => r.slice(-minLen));

  const pairs: CorrelationPair[] = [];
  const absCorrs: number[] = [];

  for (let i = 0; i < ASSETS.length; i++) {
    for (let j = i + 1; j < ASSETS.length; j++) {
      const r    = pearson(trimmed[i]!, trimmed[j]!);
      const abs  = Math.abs(r);
      const a1   = ASSETS[i]!;
      const a2   = ASSETS[j]!;
      const strength: CorrelationPair["strength"] =
        abs >= 0.72 ? "HIGH" : abs >= 0.45 ? "MODERATE" : "LOW";
      const bothOpen   = openSymbols.includes(a1) && openSymbols.includes(a2);
      absCorrs.push(abs);
      pairs.push({
        asset1:      NAMES[a1]!,
        asset2:      NAMES[a2]!,
        correlation: parseFloat(r.toFixed(4)),
        absCorr:     parseFloat(abs.toFixed(4)),
        strength,
        direction:   r >= 0 ? "POSITIVE" : "NEGATIVE",
        bothOpen,
        overlapRisk: strength === "HIGH" && bothOpen,
      });
    }
  }

  const avgAbs = absCorrs.reduce((a, b) => a + b, 0) / absCorrs.length;
  const diversificationScore = Math.max(0, Math.round((1 - avgAbs) * 100));
  const overlapWarning = pairs.some(p => p.overlapRisk);
  const strongPairs = pairs
    .filter(p => p.strength === "HIGH" && p.bothOpen)
    .map(p => `${p.asset1} & ${p.asset2} are highly correlated (${p.correlation.toFixed(2)}) and both open`);

  const result: CorrelationMatrix = {
    pairs,
    diversificationScore,
    overlapWarning,
    strongPairs,
    candles: minLen + 1,
    computedAt: Date.now(),
  };

  if (openSymbols.length === 0) cache = { result, at: Date.now() };
  return result;
}
