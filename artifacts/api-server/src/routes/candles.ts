import { Router } from "express";
import { getCandles, SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES } from "../lib/marketData.js";

const router = Router();

const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT:  "BTCUSD",  BTCUSD:  "BTCUSD",  BTC:  "BTCUSD",
  ETHUSDT:  "ETHUSD",  ETHUSD:  "ETHUSD",  ETH:  "ETHUSD",
  SOLUSDT:  "SOLUSD",  SOLUSD:  "SOLUSD",  SOL:  "SOLUSD",
  XRPUSDT:  "XRPUSD",  XRPUSD:  "XRPUSD",  XRP:  "XRPUSD",
  DOGEUSDT: "DOGEUSD", DOGEUSD: "DOGEUSD", DOGE: "DOGEUSD",
  AVAXUSDT: "AVAXUSD", AVAXUSD: "AVAXUSD", AVAX: "AVAXUSD",
  LINKUSDT: "LINKUSD", LINKUSD: "LINKUSD", LINK: "LINKUSD",
  ADAUSDT:  "ADAUSD",  ADAUSD:  "ADAUSD",  ADA:  "ADAUSD",
};

const TIMEFRAME_MAP: Record<string, string> = { "1H": "1h", "4H": "1h", "1D": "1h" };

router.get("/candles", async (req, res) => {
  const rawSymbol = ((req.query.symbol as string) ?? "BTCUSD").toUpperCase();
  const symbol    = SYMBOL_MAP[rawSymbol] ?? rawSymbol;
  const rawTf     = (req.query.timeframe as string) ?? "1h";
  const timeframe = (TIMEFRAME_MAP[rawTf] ?? rawTf).toLowerCase();
  const limit     = Math.min(parseInt((req.query.limit as string) ?? "200", 10), 500);

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    res.status(400).json({
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
    res.json(candles);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
