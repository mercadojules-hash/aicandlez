import { getCandles } from "./marketData.js";
import { simulateOnCandles, type StrategyParams, type BacktestMetrics } from "./backtestEngine.js";

// ── Parameter grid ────────────────────────────────────────────────────────────

export const PARAM_GRID = {
  emaShort:         [5, 7, 9, 12],
  emaLong:          [15, 21, 26],
  rsiBuyThreshold:  [60, 65, 70],
  rsiSellThreshold: [75, 78, 82],
};
// 4 × 3 × 3 × 3 = 108 combinations

export type OptimizeTarget = "totalReturn" | "sharpeRatio" | "winRate" | "profitFactor";

export interface OptimizerConfig {
  symbol:         string;
  timeframe:      string;
  initialCapital: number;
  optimizeFor:    OptimizeTarget;
}

export interface OptimizeRun {
  rank:    number;
  params:  StrategyParams;
  metrics: BacktestMetrics;
  score:   number;   // value of the target metric used for sorting
}

export interface OptimizationResult {
  config:       OptimizerConfig & { candleCount: number; periodLabel: string };
  best:         OptimizeRun;
  results:      OptimizeRun[];   // top 20 shown, sorted by score desc
  totalRuns:    number;
  durationMs:   number;
  grid:         typeof PARAM_GRID;
  runAt:        number;
}

// ── Scoring function ───────────────────────────────────────────────────────────

function score(metrics: BacktestMetrics, target: OptimizeTarget): number {
  switch (target) {
    case "totalReturn":  return metrics.totalReturn;
    case "sharpeRatio":  return metrics.sharpeRatio;
    case "winRate":      return metrics.winRate;
    case "profitFactor": return Math.min(metrics.profitFactor, 20);  // cap ∞ at 20
  }
}

// ── Grid search ───────────────────────────────────────────────────────────────

export async function runOptimizer(cfg: OptimizerConfig): Promise<OptimizationResult> {
  const { symbol, timeframe, initialCapital, optimizeFor } = cfg;
  const startMs = Date.now();

  // Fetch candles ONCE — all combos share the same data
  const candles = await getCandles(symbol, timeframe, 500);
  if (candles.length < 35) {
    throw new Error(`Not enough candles for optimization: got ${candles.length}`);
  }
  const closes = candles.map(c => c.close);

  const msPerCandle: Record<string, number> = { "1m": 60e3, "5m": 300e3, "15m": 900e3, "1h": 3600e3 };
  const spanDays    = Math.round(candles.length * (msPerCandle[timeframe] ?? 3600e3) / 86400e3);
  const periodLabel = `${candles.length} ${timeframe} candles (~${spanDays} days)`;

  // Expand parameter grid
  const runs: OptimizeRun[] = [];

  for (const emaShort of PARAM_GRID.emaShort) {
    for (const emaLong of PARAM_GRID.emaLong) {
      if (emaShort >= emaLong) continue;  // skip invalid combos
      for (const rsiBuyThreshold of PARAM_GRID.rsiBuyThreshold) {
        for (const rsiSellThreshold of PARAM_GRID.rsiSellThreshold) {
          if (rsiBuyThreshold >= rsiSellThreshold) continue;  // buy < sell threshold

          const params: StrategyParams = { emaShort, emaLong, rsiBuyThreshold, rsiSellThreshold };
          const sim = simulateOnCandles(candles, closes, params, initialCapital);
          const s   = score(sim.metrics, optimizeFor);

          runs.push({ rank: 0, params, metrics: sim.metrics, score: s });
        }
      }
    }
  }

  // Sort by score descending
  runs.sort((a, b) => b.score - a.score);
  runs.forEach((r, i) => { r.rank = i + 1; });

  const top20 = runs.slice(0, 20);
  const best  = runs[0]!;

  return {
    config: { ...cfg, candleCount: candles.length, periodLabel },
    best,
    results: top20,
    totalRuns:  runs.length,
    durationMs: Date.now() - startMs,
    grid:  PARAM_GRID,
    runAt: Date.now(),
  };
}
