import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { generateId, generateAISignal, getBasePrice, generateSimulatedPrice } from "../lib/trading.js";

const router = Router();

router.get("/signals/latest", async (req, res) => {
  const symbol = (req.query.symbol as string) ?? "BTCUSDT";
  const timeframe = (req.query.timeframe as string) ?? "1H";

  const existing = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.symbol, symbol))
    .orderBy(desc(signalsTable.timestamp))
    .limit(1);

  if (existing.length > 0) {
    const s = existing[0];
    res.json({
      id: s.id,
      symbol: s.symbol,
      timeframe: s.timeframe,
      action: s.action,
      confidence: s.confidence,
      trend: s.trend,
      reasoning: s.reasoning,
      price: s.price,
      timestamp: s.timestamp.toISOString(),
      indicators: { rsi: s.rsi, macd: s.macd, ema20: s.ema20, ema50: s.ema50 },
    });
    return;
  }

  const ai = generateAISignal(symbol, timeframe);
  const price = generateSimulatedPrice(getBasePrice(symbol));
  const id = generateId();

  await db.insert(signalsTable).values({
    id,
    symbol,
    timeframe,
    action: ai.action,
    confidence: ai.confidence,
    trend: ai.trend,
    reasoning: ai.reasoning,
    price,
    rsi: ai.indicators.rsi,
    macd: ai.indicators.macd,
    ema20: ai.indicators.ema20,
    ema50: ai.indicators.ema50,
  });

  res.json({
    id,
    symbol,
    timeframe,
    action: ai.action,
    confidence: ai.confidence,
    trend: ai.trend,
    reasoning: ai.reasoning,
    price,
    timestamp: new Date().toISOString(),
    indicators: ai.indicators,
  });
});

router.post("/signals/generate", async (req, res) => {
  const symbol = req.body.symbol ?? "BTCUSDT";
  const timeframe = req.body.timeframe ?? "1H";

  const ai = generateAISignal(symbol, timeframe);
  const price = generateSimulatedPrice(getBasePrice(symbol));
  const id = generateId();

  await db.insert(signalsTable).values({
    id,
    symbol,
    timeframe,
    action: ai.action,
    confidence: ai.confidence,
    trend: ai.trend,
    reasoning: ai.reasoning,
    price,
    rsi: ai.indicators.rsi,
    macd: ai.indicators.macd,
    ema20: ai.indicators.ema20,
    ema50: ai.indicators.ema50,
  });

  await db.insert(logsTable).values({
    id: generateId(),
    type: "signal",
    level: "info",
    message: `New ${ai.action} signal for ${symbol} with ${ai.confidence.toFixed(1)}% confidence`,
    details: { symbol, timeframe, action: ai.action, confidence: ai.confidence },
  });

  res.json({
    id,
    symbol,
    timeframe,
    action: ai.action,
    confidence: ai.confidence,
    trend: ai.trend,
    reasoning: ai.reasoning,
    price,
    timestamp: new Date().toISOString(),
    indicators: ai.indicators,
  });
});

router.get("/signals/history", async (req, res) => {
  const signals = await db
    .select()
    .from(signalsTable)
    .orderBy(desc(signalsTable.timestamp))
    .limit(50);

  res.json(
    signals.map((s) => ({
      id: s.id,
      symbol: s.symbol,
      timeframe: s.timeframe,
      action: s.action,
      confidence: s.confidence,
      trend: s.trend,
      reasoning: s.reasoning,
      price: s.price,
      timestamp: s.timestamp.toISOString(),
      indicators: { rsi: s.rsi, macd: s.macd, ema20: s.ema20, ema50: s.ema50 },
    }))
  );
});

import { logsTable } from "@workspace/db";

export default router;
