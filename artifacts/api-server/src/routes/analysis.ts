import { Router } from "express";
import { getCandles, SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES } from "../lib/marketData.js";
import { runAnalysis } from "../lib/indicators.js";

const router = Router();

router.get("/analysis/:symbol", async (req, res) => {
  const symbol    = req.params.symbol.toUpperCase();
  const timeframe = (req.query.timeframe as string) ?? "1h";
  const limit     = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 500);

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
    const candles = await getCandles(symbol, timeframe, limit);
    const analysis = runAnalysis(symbol, timeframe, candles);
    res.json(analysis);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
