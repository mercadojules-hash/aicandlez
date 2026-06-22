import { Router } from "express";
import {
  getCandles,
  getDataFeedHealth,
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
      source: "Coinbase/Kraken",
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
      source: "Coinbase/Kraken",
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/market-data/:symbol/health", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    res.status(404).json({
      error: `Symbol "${symbol}" not supported. Use: ${SUPPORTED_SYMBOLS.join(", ")}`,
    });
    return;
  }

  try {
    const ticker = await getTicker(symbol);
    const now = Date.now();
    res.json({
      symbol,
      source: "Coinbase/Kraken",
      tickerLastUpdated: ticker.lastUpdated,
      tickerAgeSeconds: Math.max(0, Math.floor((now - ticker.lastUpdated) / 1000)),
      ticker,
      feed: getDataFeedHealth(),
      timestamp: now,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      symbol,
      source: "Coinbase/Kraken",
      tickerAgeSeconds: null,
      feed: getDataFeedHealth(),
      error: msg,
      timestamp: Date.now(),
    });
  }
});

export default router;
