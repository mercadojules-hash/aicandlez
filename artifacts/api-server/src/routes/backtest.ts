import { Router } from "express";
import { runBacktest, type BacktestConfig } from "../lib/backtestEngine.js";
import { SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES } from "../lib/marketData.js";

const router = Router();

// POST /backtest/run — run strategy on historical candles
router.post("/backtest/run", async (req, res) => {
  const {
    symbol         = "BTCUSD",
    timeframe      = "1h",
    initialCapital = 10000,
  } = req.body ?? {};

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    res.status(400).json({ error: `Unsupported symbol. Supported: ${SUPPORTED_SYMBOLS.join(", ")}` });
    return;
  }
  if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
    res.status(400).json({ error: `Unsupported timeframe. Supported: ${SUPPORTED_TIMEFRAMES.join(", ")}` });
    return;
  }
  if (typeof initialCapital !== "number" || initialCapital < 100) {
    res.status(400).json({ error: "initialCapital must be a number >= 100" });
    return;
  }

  try {
    const config: BacktestConfig = { symbol, timeframe, initialCapital, strategy: "ema_crossover" };
    const result = await runBacktest(config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
