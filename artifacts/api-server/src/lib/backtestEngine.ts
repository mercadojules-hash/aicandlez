import { getCandles, type Candle } from "./marketData.js";

// ── Math helpers (O(n) passes) ─────────────────────────────────────────────────

export function emaArray(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [closes[0]!];
  for (let i = 1; i < closes.length; i++) {
    out.push(closes[i]! * k + out[i - 1]! * (1 - k));
  }
  return out;
}

export function rsiArray(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return closes.map(() => 50);
  const changes = closes.slice(1).map((c, i) => c - closes[i]!);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const d = changes[i]!;
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  const out: number[] = new Array(period + 1).fill(50);
  for (let i = period; i < changes.length; i++) {
    const d = changes[i]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

// ── Strategy parameters ────────────────────────────────────────────────────────

export interface StrategyParams {
  emaShort:         number;   // fast EMA period (default 9)
  emaLong:          number;   // slow EMA period (default 21)
  rsiBuyThreshold:  number;   // BUY only when RSI < this (default 70)
  rsiSellThreshold: number;   // SELL when RSI > this (default 78)
}

export const DEFAULT_PARAMS: StrategyParams = {
  emaShort:         9,
  emaLong:          21,
  rsiBuyThreshold:  70,
  rsiSellThreshold: 78,
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BacktestConfig {
  symbol:         string;
  timeframe:      string;
  initialCapital: number;
  strategy:       "ema_crossover";
  candleLimit?:   number;
}

export interface BacktestTradeRecord {
  n:          number;
  entryTime:  number;
  entryPrice: number;
  exitTime:   number;
  exitPrice:  number;
  returnPct:  number;
  returnUSD:  number;
  won:        boolean;
}

export interface BacktestMetrics {
  totalReturn:     number;
  totalReturnUSD:  number;
  winRate:         number;
  maxDrawdown:     number;
  totalTrades:     number;
  winningTrades:   number;
  losingTrades:    number;
  profitFactor:    number;
  avgWinPct:       number;
  avgLossPct:      number;
  benchmarkReturn: number;
  finalEquity:     number;
  sharpeRatio:     number;
}

export interface BacktestResult {
  config:  BacktestConfig & { candleCount: number; periodLabel: string; params: StrategyParams };
  metrics: BacktestMetrics;
  trades:  BacktestTradeRecord[];
  equityCurve: Array<{ time: number; equity: number; pct: number }>;
  runAt:   number;
}

// ── Shared metrics helpers ─────────────────────────────────────────────────────

function sharpe(equityPoints: number[]): number {
  if (equityPoints.length < 2) return 0;
  const rets: number[] = [];
  for (let i = 1; i < equityPoints.length; i++) {
    rets.push((equityPoints[i]! - equityPoints[i - 1]!) / equityPoints[i - 1]!);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const std  = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
  if (std === 0) return 0;
  return parseFloat(((mean / std) * Math.sqrt(252)).toFixed(3));
}

function maxDD(equityPoints: number[]): number {
  let peak = equityPoints[0]!;
  let dd   = 0;
  for (const eq of equityPoints) {
    if (eq > peak) peak = eq;
    const d = (peak - eq) / peak;
    if (d > dd) dd = d;
  }
  return parseFloat((dd * 100).toFixed(2));
}

// ── Core simulation (works on pre-fetched candles) ────────────────────────────

const WARMUP = 30;

export interface SimResult {
  metrics:     BacktestMetrics;
  trades:      BacktestTradeRecord[];
  equityCurve: BacktestResult["equityCurve"];
}

export function simulateOnCandles(
  candles:        Candle[],
  closes:         number[],
  params:         StrategyParams,
  initialCapital: number,
): SimResult {
  const { emaShort, emaLong, rsiBuyThreshold, rsiSellThreshold } = params;

  const ema9  = emaArray(closes, emaShort);
  const ema21 = emaArray(closes, emaLong);
  const rsi   = rsiArray(closes, 14);

  const benchmarkReturn = ((closes[closes.length - 1]! - closes[0]!) / closes[0]!) * 100;

  let cash      = initialCapital;
  let inPos     = false;
  let entryIdx  = 0;
  let entryPrice= 0;
  let qty       = 0;

  const trades:      BacktestTradeRecord[] = [];
  const equityCurve: SimResult["equityCurve"] = [];

  for (let i = WARMUP; i < candles.length; i++) {
    const currEMA9  = ema9[i]!;
    const currEMA21 = ema21[i]!;
    const prevEMA9  = ema9[i - 1]!;
    const prevEMA21 = ema21[i - 1]!;
    const currRSI   = rsi[i]!;
    const price     = closes[i]!;

    const bullCross = prevEMA9 <= prevEMA21 && currEMA9 > currEMA21;
    const bearCross = prevEMA9 >= prevEMA21 && currEMA9 < currEMA21;

    if (!inPos && bullCross && currRSI < rsiBuyThreshold) {
      entryIdx   = i;
      entryPrice = price;
      qty        = cash / price;
      inPos      = true;
    }

    if (inPos && (bearCross || currRSI > rsiSellThreshold)) {
      const proceeds  = qty * price;
      const returnUSD = proceeds - (qty * entryPrice);
      const returnPct = ((price - entryPrice) / entryPrice) * 100;
      cash = proceeds;
      inPos = false;
      trades.push({
        n:          trades.length + 1,
        entryTime:  candles[entryIdx]!.time,
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        exitTime:   candles[i]!.time,
        exitPrice:  parseFloat(price.toFixed(2)),
        returnPct:  parseFloat(returnPct.toFixed(3)),
        returnUSD:  parseFloat(returnUSD.toFixed(2)),
        won:        returnPct > 0,
      });
    }

    const equity = inPos ? qty * price : cash;
    equityCurve.push({
      time:   candles[i]!.time,
      equity: parseFloat(equity.toFixed(2)),
      pct:    parseFloat(((equity - initialCapital) / initialCapital * 100).toFixed(3)),
    });
  }

  // Close open position at last candle
  if (inPos) {
    const exitPrice = closes[closes.length - 1]!;
    const proceeds  = qty * exitPrice;
    const returnUSD = proceeds - (qty * entryPrice);
    const returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
    cash = proceeds;
    trades.push({
      n:          trades.length + 1,
      entryTime:  candles[entryIdx]!.time,
      entryPrice: parseFloat(entryPrice.toFixed(2)),
      exitTime:   candles[candles.length - 1]!.time,
      exitPrice:  parseFloat(exitPrice.toFixed(2)),
      returnPct:  parseFloat(returnPct.toFixed(3)),
      returnUSD:  parseFloat(returnUSD.toFixed(2)),
      won:        returnPct > 0,
    });
  }

  // Metrics
  const finalEquity  = equityCurve[equityCurve.length - 1]?.equity ?? initialCapital;
  const totalReturn  = ((finalEquity - initialCapital) / initialCapital) * 100;
  const winning      = trades.filter(t => t.won);
  const losing       = trades.filter(t => !t.won);
  const winRate      = trades.length > 0 ? (winning.length / trades.length) * 100 : 0;
  const grossProfit  = winning.reduce((s, t) => s + t.returnUSD, 0);
  const grossLoss    = Math.abs(losing.reduce((s, t) => s + t.returnUSD, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss;
  const avgWinPct    = winning.length > 0 ? winning.reduce((s, t) => s + t.returnPct, 0) / winning.length : 0;
  const avgLossPct   = losing.length  > 0 ? Math.abs(losing.reduce((s, t) => s + t.returnPct, 0) / losing.length) : 0;

  return {
    metrics: {
      totalReturn:     parseFloat(totalReturn.toFixed(3)),
      totalReturnUSD:  parseFloat((finalEquity - initialCapital).toFixed(2)),
      winRate:         parseFloat(winRate.toFixed(1)),
      maxDrawdown:     maxDD(equityCurve.map(e => e.equity)),
      totalTrades:     trades.length,
      winningTrades:   winning.length,
      losingTrades:    losing.length,
      profitFactor:    parseFloat(profitFactor.toFixed(3)),
      avgWinPct:       parseFloat(avgWinPct.toFixed(2)),
      avgLossPct:      parseFloat(avgLossPct.toFixed(2)),
      benchmarkReturn: parseFloat(benchmarkReturn.toFixed(3)),
      finalEquity:     parseFloat(finalEquity.toFixed(2)),
      sharpeRatio:     sharpe(equityCurve.map(e => e.equity)),
    },
    trades,
    equityCurve,
  };
}

// ── Public: run backtest (fetches candles) ────────────────────────────────────

export async function runBacktest(
  config: BacktestConfig,
  params: StrategyParams = DEFAULT_PARAMS,
): Promise<BacktestResult> {
  const { symbol, timeframe, initialCapital } = config;
  const limit   = config.candleLimit ?? 500;
  const candles = await getCandles(symbol, timeframe, limit);

  if (candles.length < WARMUP + 5) {
    throw new Error(`Not enough candles: got ${candles.length}, need at least ${WARMUP + 5}`);
  }

  const closes = candles.map(c => c.close);
  const msPerCandle: Record<string, number> = {
    "1m": 60e3, "5m": 300e3, "15m": 900e3, "1h": 3600e3, "4h": 14400e3, "1d": 86400e3,
  };
  const spanDays    = Math.round(candles.length * (msPerCandle[timeframe] ?? 3600e3) / 86400e3);
  const periodLabel = `${candles.length} ${timeframe} candles (~${spanDays} days)`;

  const sim = simulateOnCandles(candles, closes, params, initialCapital);

  return {
    config: { ...config, candleCount: candles.length, periodLabel, params },
    metrics: sim.metrics,
    trades:  sim.trades,
    equityCurve: sim.equityCurve,
    runAt: Date.now(),
  };
}
