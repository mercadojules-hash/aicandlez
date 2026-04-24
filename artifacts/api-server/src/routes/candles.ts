import { Router } from "express";
import { generateCandles } from "../lib/trading.js";

const router = Router();

router.get("/candles", (req, res) => {
  const symbol = (req.query.symbol as string) ?? "BTCUSDT";
  const timeframe = (req.query.timeframe as string) ?? "1H";
  const limit = parseInt((req.query.limit as string) ?? "200", 10);

  const candles = generateCandles(symbol, timeframe, Math.min(limit, 500));

  res.json(candles);
});

export default router;
