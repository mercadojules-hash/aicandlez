import { Router } from "express";
import {
  getSentimentOverview, getSymbolSentiment, applySentimentAdjustment,
} from "../lib/sentimentEngine.js";

const router = Router();

// GET /sentiment/overview — full market + per-symbol sentiment snapshot
router.get("/sentiment/overview", (_req, res) => {
  res.json(getSentimentOverview());
});

// GET /sentiment/news — all headlines sorted newest-first
router.get("/sentiment/news", (_req, res) => {
  const overview = getSentimentOverview();
  res.json({ news: overview.allNews, updatedAt: overview.updatedAt });
});

// GET /sentiment/:symbol — single-symbol sentiment (BTCUSD, ETHUSD, SOLUSD)
router.get("/sentiment/:symbol", (req, res) => {
  const sym = getSymbolSentiment(req.params.symbol!);
  if (!sym) {
    res.status(404).json({ error: `Symbol ${req.params.symbol} not supported` });
    return;
  }
  res.json(sym);
});

// GET /sentiment/adjusted/:symbol — AI confidence adjusted by sentiment
router.get("/sentiment/adjusted/:symbol", (req, res) => {
  const { baseConfidence, decision } = req.query;
  const conf = parseFloat(String(baseConfidence ?? "50"));
  const dec  = String(decision ?? "HOLD") as "BUY" | "SELL" | "HOLD";

  const result = applySentimentAdjustment(conf, dec, req.params.symbol!);
  res.json(result);
});

export default router;
