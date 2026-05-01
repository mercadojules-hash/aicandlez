import { Router } from "express";
import { runBacktest, type BacktestConfig } from "../lib/backtestEngine.js";
import { SUPPORTED_SYMBOLS, BACKTEST_TIMEFRAMES } from "../lib/marketData.js";

const router = Router();

// Candle limits per timeframe (Kraken caps at ~720 regardless)
const CANDLE_LIMITS: Record<string, number> = {
  "1m": 720, "5m": 720, "15m": 720, "1h": 720, "4h": 720, "1d": 365,
};

// POST /backtest/run — run strategy on historical candles
router.post("/backtest/run", async (req, res) => {
  const {
    symbol         = "BTCUSD",
    timeframe      = "1h",
    initialCapital = 10000,
  } = req.body ?? {};

  const normalizedTf = timeframe.toLowerCase();

  if (!SUPPORTED_SYMBOLS.includes(symbol.toUpperCase())) {
    res.status(400).json({ error: `Unsupported symbol. Supported: ${SUPPORTED_SYMBOLS.join(", ")}` });
    return;
  }
  if (!BACKTEST_TIMEFRAMES.includes(normalizedTf)) {
    res.status(400).json({ error: `Unsupported timeframe. Supported: ${BACKTEST_TIMEFRAMES.join(", ")}` });
    return;
  }
  if (typeof initialCapital !== "number" || initialCapital < 100) {
    res.status(400).json({ error: "initialCapital must be a number >= 100" });
    return;
  }

  try {
    const limit  = CANDLE_LIMITS[normalizedTf] ?? 500;
    const config: BacktestConfig = {
      symbol: symbol.toUpperCase(),
      timeframe: normalizedTf,
      initialCapital,
      strategy: "ema_crossover",
      candleLimit: limit,
    };
    const result = await runBacktest(config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /backtest/periods — available period options
router.get("/backtest/periods", (_req, res) => {
  res.json([
    { id: "1h",  label: "1 Hour",  period: "~1 month",  detail: "720 hourly candles ≈ 30 days",        candles: 720 },
    { id: "4h",  label: "4 Hour",  period: "~4 months", detail: "720 × 4h candles ≈ 120 days",         candles: 720 },
    { id: "1d",  label: "1 Day",   period: "~1 year",   detail: "365 daily candles ≈ 12 months",        candles: 365 },
  ]);
});

export default router;
