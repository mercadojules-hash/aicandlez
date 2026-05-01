import { Router } from "express";
import {
  getCandles,
  getTicker,
  SUPPORTED_SYMBOLS,
  SUPPORTED_TIMEFRAMES,
} from "../lib/marketData.js";

const router = Router();

router.get("/market-data", async (req, res) => {
  try {
    const tickers = await Promise.all(SUPPORTED_SYMBOLS.map((s) => getTicker(s)));
    res.json({
      symbols: SUPPORTED_SYMBOLS,
      timeframes: SUPPORTED_TIMEFRAMES,
      tickers,
      source: "Kraken",
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/market-data/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const timeframe = (req.query.timeframe as string) ?? "1h";
  const limit = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 500);

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    res.status(404).json({
      error: `Symbol "${symbol}" not supported. Use: ${SUPPORTED_SYMBOLS.join(", ")}`,
    });
    return;
  }

  if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
    res.status(400).json({
      error: `Timeframe "${timeframe}" not supported. Use: ${SUPPORTED_TIMEFRAMES.join(", ")}`,
    });
    return;
  }

  try {
    const [ticker, candles] = await Promise.all([
      getTicker(symbol),
      getCandles(symbol, timeframe, limit),
    ]);

    res.json({
      symbol,
      timeframe,
      ticker,
      candles,
      count: candles.length,
      source: "Kraken",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
