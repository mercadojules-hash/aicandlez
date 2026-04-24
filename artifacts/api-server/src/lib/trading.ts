import crypto from "crypto";

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateSimulatedPrice(basePrice: number): number {
  const fluctuation = (Math.random() - 0.5) * 0.02;
  return parseFloat((basePrice * (1 + fluctuation)).toFixed(2));
}

const BASE_PRICES: Record<string, number> = {
  BTCUSDT: 67500,
  ETHUSDT: 3850,
  BNBUSDT: 590,
  SOLUSDT: 172,
  ADAUSDT: 0.45,
};

export function getBasePrice(symbol: string): number {
  return BASE_PRICES[symbol] ?? 1000;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function generateCandles(symbol: string, timeframe: string, limit: number): CandleData[] {
  const intervalSeconds: Record<string, number> = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1H": 3600,
    "1D": 86400,
  };

  const interval = intervalSeconds[timeframe] ?? 3600;
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - interval * limit;

  let price = getBasePrice(symbol);
  const candles: CandleData[] = [];

  for (let i = 0; i < limit; i++) {
    const time = startTime + i * interval;
    const volatility = price * 0.008;
    const open = price;
    const change = (Math.random() - 0.48) * volatility;
    const close = parseFloat((open + change).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * volatility * 0.5).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * volatility * 0.5).toFixed(2));
    const volume = parseFloat((Math.random() * 1000 + 500).toFixed(2));

    candles.push({ time, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

interface Indicators {
  rsi: number;
  macd: number;
  ema20: number;
  ema50: number;
}

function computeIndicators(candles: CandleData[]): Indicators {
  const closes = candles.map((c) => c.close);
  const n = closes.length;

  const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ema50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;

  let gains = 0;
  let losses = 0;
  const period = 14;
  for (let i = n - period; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = parseFloat((100 - 100 / (1 + rs)).toFixed(2));

  const macd = parseFloat((ema20 - ema50).toFixed(2));

  return { rsi, macd, ema20: parseFloat(ema20.toFixed(2)), ema50: parseFloat(ema50.toFixed(2)) };
}

type SignalAction = "BUY" | "SELL" | "HOLD";
type Trend = "bullish" | "bearish" | "neutral";

interface AISignal {
  action: SignalAction;
  confidence: number;
  trend: Trend;
  reasoning: string;
  indicators: Indicators;
}

export function generateAISignal(symbol: string, timeframe: string): AISignal {
  const candles = generateCandles(symbol, timeframe, 100);
  const indicators = computeIndicators(candles);
  const { rsi, macd, ema20, ema50 } = indicators;

  let bullishPoints = 0;
  let bearishPoints = 0;

  if (rsi < 30) bullishPoints += 3;
  else if (rsi < 40) bullishPoints += 1;
  else if (rsi > 70) bearishPoints += 3;
  else if (rsi > 60) bearishPoints += 1;

  if (macd > 0) bullishPoints += 2;
  else bearishPoints += 2;

  if (ema20 > ema50) bullishPoints += 2;
  else bearishPoints += 2;

  const totalPoints = bullishPoints + bearishPoints;
  const bullishRatio = bullishPoints / totalPoints;

  let action: SignalAction;
  let trend: Trend;
  let confidence: number;
  let reasoning: string;

  if (bullishRatio >= 0.65) {
    action = "BUY";
    trend = "bullish";
    confidence = parseFloat((60 + bullishRatio * 40).toFixed(1));
    reasoning = `RSI at ${rsi} indicates ${rsi < 40 ? "oversold conditions" : "moderate momentum"}. EMA20 (${ema20.toFixed(0)}) is ${ema20 > ema50 ? "above" : "below"} EMA50 (${ema50.toFixed(0)}), confirming ${trend} trend. MACD of ${macd.toFixed(0)} shows ${macd > 0 ? "positive" : "negative"} momentum.`;
  } else if (bullishRatio <= 0.35) {
    action = "SELL";
    trend = "bearish";
    confidence = parseFloat((60 + (1 - bullishRatio) * 40).toFixed(1));
    reasoning = `RSI at ${rsi} signals ${rsi > 60 ? "overbought conditions" : "bearish pressure"}. EMA crossover with EMA20 (${ema20.toFixed(0)}) ${ema20 < ema50 ? "below" : "above"} EMA50 (${ema50.toFixed(0)}) confirms bearish structure. MACD divergence at ${macd.toFixed(0)}.`;
  } else {
    action = "HOLD";
    trend = "neutral";
    confidence = parseFloat((40 + Math.abs(bullishRatio - 0.5) * 80).toFixed(1));
    reasoning = `Market conditions are mixed. RSI at ${rsi} is in neutral territory. EMA20/EMA50 spread is minimal at ${Math.abs(ema20 - ema50).toFixed(0)} points. Insufficient signal clarity to initiate a position.`;
  }

  confidence = Math.min(99, Math.max(20, confidence));

  return { action, confidence, trend, reasoning, indicators };
}

export function calculatePnL(
  side: string,
  entryPrice: number,
  exitPrice: number,
  amount: number
): { pnl: number; pnlPercent: number } {
  let pnlPercent: number;
  if (side === "BUY") {
    pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
  } else {
    pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
  }
  const pnl = (amount * pnlPercent) / 100;
  return {
    pnl: parseFloat(pnl.toFixed(4)),
    pnlPercent: parseFloat(pnlPercent.toFixed(4)),
  };
}

export function runBacktestSimulation(
  symbol: string,
  days: number,
  allocation: number,
  stopLossPercent: number,
  takeProfitPercent: number,
  minConfidence: number
): {
  trades: Array<{
    id: string;
    symbol: string;
    side: "BUY" | "SELL";
    amount: number;
    price: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    status: "closed";
    mode: "simulated";
    timestamp: string;
    closedAt: string;
    reason: string;
  }>;
  winRate: number;
  totalProfit: number;
  totalProfitPercent: number;
  maxDrawdown: number;
  wins: number;
  losses: number;
} {
  const trades: ReturnType<typeof runBacktestSimulation>["trades"] = [];
  const candles = generateCandles(symbol, "1H", days * 24);
  let currentBalance = allocation;
  let maxBalance = allocation;
  let maxDrawdown = 0;

  for (let i = 50; i < candles.length - 1; i += Math.floor(Math.random() * 12) + 6) {
    const subset = candles.slice(0, i + 1);
    const indicators = computeIndicators(subset);
    const { rsi, macd, ema20, ema50 } = indicators;

    let bullish = 0;
    if (rsi < 40) bullish += 3;
    else if (rsi > 60) bullish -= 3;
    if (macd > 0) bullish += 2;
    else bullish -= 2;
    if (ema20 > ema50) bullish += 2;
    else bullish -= 2;

    const confidence = Math.min(99, Math.max(20, 50 + Math.abs(bullish) * 8));
    if (confidence < minConfidence) continue;

    const side: "BUY" | "SELL" = bullish > 0 ? "BUY" : "SELL";
    const entryPrice = candles[i].close;
    const entryTime = new Date(candles[i].time * 1000);

    const exitCandleIndex = Math.min(i + Math.floor(Math.random() * 6) + 1, candles.length - 1);
    const exitCandle = candles[exitCandleIndex];
    const exitPrice = exitCandle.close;
    const exitTime = new Date(exitCandle.time * 1000);

    const { pnl, pnlPercent } = calculatePnL(side, entryPrice, exitPrice, allocation);
    const isWin = pnl > 0;

    currentBalance += pnl;
    if (currentBalance > maxBalance) maxBalance = currentBalance;
    const drawdown = ((maxBalance - currentBalance) / maxBalance) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    trades.push({
      id: generateId(),
      symbol,
      side,
      amount: allocation,
      price: entryPrice,
      exitPrice,
      pnl: parseFloat(pnl.toFixed(4)),
      pnlPercent: parseFloat(pnlPercent.toFixed(4)),
      status: "closed",
      mode: "simulated",
      timestamp: entryTime.toISOString(),
      closedAt: exitTime.toISOString(),
      reason: isWin ? "take_profit" : "stop_loss",
    });
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const totalProfit = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalProfitPercent = allocation > 0 ? (totalProfit / allocation) * 100 : 0;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return {
    trades,
    wins,
    losses,
    winRate: parseFloat(winRate.toFixed(2)),
    totalProfit: parseFloat(totalProfit.toFixed(4)),
    totalProfitPercent: parseFloat(totalProfitPercent.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
  };
}
