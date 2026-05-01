import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { signalsTable, logsTable } from "@workspace/db";
import { desc, eq, and, gte } from "drizzle-orm";
import { getCandles, SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES } from "../lib/marketData.js";
import { runAIDecision } from "../lib/aiReasoning.js";
import { computeRSI, computeMACD, computeEMA } from "../lib/indicators.js";

const router = Router();

function generateId() { return crypto.randomUUID(); }

// Map common UI symbol names → canonical supported names
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTCUSD", BTCUSD: "BTCUSD", BTC: "BTCUSD",
  ETHUSDT: "ETHUSD", ETHUSD: "ETHUSD", ETH: "ETHUSD",
  SOLUSDT: "SOLUSD", SOLUSD: "SOLUSD", SOL: "SOLUSD",
};

function normalizeSymbol(s: string): string {
  return SYMBOL_MAP[s.toUpperCase()] ?? s.toUpperCase();
}

function normalizeTimeframe(tf: string): string {
  const map: Record<string, string> = { "1H": "1h", "1D": "1h", "4H": "1h" };
  const lower = tf.toLowerCase();
  return map[tf] ?? (SUPPORTED_TIMEFRAMES.includes(lower) ? lower : "1h");
}

// Cache TTL per timeframe (ms) — avoid hammering Kraken on every poll
const SIGNAL_TTL: Record<string, number> = {
  "1m": 45_000, "5m": 90_000, "15m": 120_000, "1h": 180_000,
};

async function computeAndStoreSignal(symbol: string, timeframe: string): Promise<object> {
  const candles  = await getCandles(symbol, timeframe, 150);
  const decision = runAIDecision(symbol, timeframe, candles);
  const rsi      = computeRSI(candles);
  const macd     = computeMACD(candles);
  const ema      = computeEMA(candles);
  const id       = generateId();

  await db.insert(signalsTable).values({
    id,
    symbol,
    timeframe,
    action:     decision.decision,
    confidence: decision.confidence,
    trend:      decision.totalScore > 0 ? "bullish" : decision.totalScore < 0 ? "bearish" : "neutral",
    reasoning:  decision.reasoning,
    price:      decision.price,
    rsi:        rsi.value,
    macd:       macd.macdLine,
    ema20:      ema.short,
    ema50:      ema.long,
  });

  await db.insert(logsTable).values({
    id: generateId(),
    type: "signal",
    level: "info",
    message: `${decision.decision} signal — ${symbol} ${timeframe} — confidence ${decision.confidence.toFixed(1)}% — score ${decision.totalScore}`,
    details: {
      symbol, timeframe,
      action:     decision.decision,
      confidence: decision.confidence,
      price:      decision.price,
      totalScore: decision.totalScore,
    },
  });

  return {
    id,
    symbol,
    timeframe,
    action:       decision.decision,
    confidence:   decision.confidence,
    trend:        decision.totalScore > 0 ? "bullish" : decision.totalScore < 0 ? "bearish" : "neutral",
    reasoning:    decision.reasoning,
    shortSummary: decision.shortSummary,
    price:        decision.price,
    timestamp:    new Date().toISOString(),
    indicators:   { rsi: rsi.value, macd: macd.macdLine, ema20: ema.short, ema50: ema.long },
    signals:      decision.signals,
    totalScore:   decision.totalScore,
    maxScore:     decision.maxScore,
    momentum:     decision.momentum,
  };
}

router.get("/signals/latest", async (req, res) => {
  const symbol    = normalizeSymbol((req.query.symbol as string) ?? "BTCUSD");
  const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? "1h");

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    res.status(400).json({ error: `Symbol "${symbol}" not supported. Use: ${SUPPORTED_SYMBOLS.join(", ")}` });
    return;
  }

  try {
    // Check cache: return DB signal if fresh enough
    const ttl     = SIGNAL_TTL[timeframe] ?? 120_000;
    const cutoff  = new Date(Date.now() - ttl);

    const cached = await db
      .select()
      .from(signalsTable)
      .where(and(eq(signalsTable.symbol, symbol), eq(signalsTable.timeframe, timeframe), gte(signalsTable.timestamp, cutoff)))
      .orderBy(desc(signalsTable.timestamp))
      .limit(1);

    if (cached.length > 0) {
      const s = cached[0]!;
      res.json({
        id: s.id, symbol: s.symbol, timeframe: s.timeframe,
        action: s.action, confidence: s.confidence, trend: s.trend,
        reasoning: s.reasoning, price: s.price,
        timestamp: s.timestamp.toISOString(),
        indicators: { rsi: s.rsi, macd: s.macd, ema20: s.ema20, ema50: s.ema50 },
        cached: true,
      });
      return;
    }

    const result = await computeAndStoreSignal(symbol, timeframe);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/signals/generate", async (req, res) => {
  const symbol    = normalizeSymbol(req.body.symbol ?? "BTCUSD");
  const timeframe = normalizeTimeframe(req.body.timeframe ?? "1h");

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    res.status(400).json({ error: `Symbol "${symbol}" not supported. Use: ${SUPPORTED_SYMBOLS.join(", ")}` });
    return;
  }

  try {
    const result = await computeAndStoreSignal(symbol, timeframe);
    res.status(201).json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/signals/history", async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
    const signals = await db
      .select()
      .from(signalsTable)
      .orderBy(desc(signalsTable.timestamp))
      .limit(limit);

    res.json(signals.map((s) => ({
      id: s.id, symbol: s.symbol, timeframe: s.timeframe,
      action: s.action, confidence: s.confidence, trend: s.trend,
      reasoning: s.reasoning, price: s.price,
      timestamp: s.timestamp.toISOString(),
      indicators: { rsi: s.rsi, macd: s.macd, ema20: s.ema20, ema50: s.ema50 },
    })));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
