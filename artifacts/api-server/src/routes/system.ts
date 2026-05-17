import { Router } from "express";
import { desc, eq, and, like, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { signalsTable, logsTable, tradesTable } from "@workspace/db";
import { engineStats } from "../lib/tradingLoop.js";
import { getCandles } from "../lib/marketData.js";
import { getJournal } from "../lib/tradeJournalEngine.js";
import { getLastValidation, isLiveLocked, getLockReason } from "../lib/validationEngine.js";
import { checkTrailingStops } from "../lib/trailingStopEngine.js";

const router = Router();

// GET /system/verification — aggregated health check for all engine subsystems
router.get("/system/verification", async (_req, res) => {
  const now = Date.now();

  // ── 1. Market data status ──────────────────────────────────────────────────
  let marketDataStatus: { ok: boolean; symbol: string; close: number; timestamp: number; ageSeconds: number } | null = null;
  try {
    const candles = await getCandles("BTCUSD", "1h", 1);
    if (candles.length > 0) {
      const last = candles[candles.length - 1]!;
      const ageMs = now - last.time * 1000;   // .time is Unix seconds
      marketDataStatus = {
        ok:         ageMs < 7_200_000,        // fresh if < 2 hours old
        symbol:     "BTCUSD",
        close:      last.close,
        timestamp:  last.time,
        ageSeconds: Math.round(ageMs / 1000),
      };
    }
  } catch { /* ignore */ }

  // ── 2. Last signal ─────────────────────────────────────────────────────────
  let lastSignalRow: {
    id: string; symbol: string; timeframe: string; action: string;
    confidence: number; trend: string; reasoning: string; price: number;
    timestamp: string;
  } | null = null;
  try {
    const rows = await db.select().from(signalsTable).orderBy(desc(signalsTable.timestamp)).limit(1);
    if (rows.length > 0) {
      const s = rows[0]!;
      lastSignalRow = {
        id:         s.id,
        symbol:     s.symbol,
        timeframe:  s.timeframe,
        action:     s.action,
        confidence: s.confidence,
        trend:      s.trend,
        reasoning:  s.reasoning,
        price:      s.price,
        timestamp:  s.timestamp.toISOString(),
      };
    }
  } catch { /* ignore */ }

  // Fallback: DB returned nothing (mock DB / no signals persisted yet) but
  // the engine has generated signals — use in-memory stats so System
  // Verification correctly shows Signal Generation as ACTIVE.
  if (lastSignalRow === null && engineStats.lastSignal) {
    const sig = engineStats.lastSignal;
    lastSignalRow = {
      id:         "in-memory",
      symbol:     sig.symbol,
      timeframe:  sig.timeframe,
      action:     sig.action,
      confidence: sig.confidence,
      trend:      sig.action === "BUY" ? "bullish" : sig.action === "SELL" ? "bearish" : "neutral",
      reasoning:  sig.shortSummary,
      price:      sig.price,
      timestamp:  new Date(engineStats.lastSignalAt ?? now).toISOString(),
    };
  }

  // ── 3. MTF gate status ─────────────────────────────────────────────────────
  const mtfStatus = {
    confirmed:         engineStats.lastSignal?.mtfConfirmed ?? false,
    lastAction:        engineStats.lastSignal?.action ?? null,
    lastShortSummary:  engineStats.lastSignal?.shortSummary ?? null,
    confirmedCount:    engineStats.mtfConfirmedCount,
    lastSignalAt:      engineStats.lastSignalAt,
  };

  // ── 4. Auto-trade simulation status ───────────────────────────────────────
  let lastAutoTrade: {
    symbol: string; side: string; amount: number; price: number;
    status: string; timestamp: string;
  } | null = null;
  try {
    const rows = await db.select().from(tradesTable)
      .where(eq(tradesTable.mode, "auto"))
      .orderBy(desc(tradesTable.timestamp))
      .limit(1);
    if (rows.length > 0) {
      const t = rows[0]!;
      lastAutoTrade = {
        symbol:    t.symbol,
        side:      t.side,
        amount:    t.amount,
        price:     t.price,
        status:    t.status,
        timestamp: t.timestamp.toISOString(),
      };
    }
  } catch { /* ignore */ }

  const autoTradeStatus = {
    mode:            "simulation",
    totalExecuted:   engineStats.tradesExecuted,
    totalBlocked:    engineStats.tradesBlocked,
    lastTrade:       lastAutoTrade,
  };

  // ── 5. Risk engine last block ──────────────────────────────────────────────
  let lastRiskBlock: { message: string; timestamp: string } | null = null;
  try {
    const rows = await db.select().from(logsTable)
      .where(and(eq(logsTable.type, "trade"), eq(logsTable.level, "warn"), like(logsTable.message, "%risk engine%")))
      .orderBy(desc(logsTable.timestamp))
      .limit(1);
    if (rows.length > 0) {
      const l = rows[0]!;
      lastRiskBlock = { message: l.message, timestamp: l.timestamp.toISOString() };
    }
  } catch { /* ignore */ }

  // ── 6. Correlation block ───────────────────────────────────────────────────
  let lastCorrelationBlock: { message: string; timestamp: string } | null = null;
  try {
    const rows = await db.select().from(logsTable)
      .where(and(eq(logsTable.type, "trade"), like(logsTable.message, "%correlation%")))
      .orderBy(desc(logsTable.timestamp))
      .limit(1);
    if (rows.length > 0) {
      const l = rows[0]!;
      lastCorrelationBlock = { message: l.message, timestamp: l.timestamp.toISOString() };
    }
  } catch { /* ignore */ }

  // ── 7. Trailing stop status ────────────────────────────────────────────────
  let trailingStopStatus: {
    hitsThisSession: number;
    activeCount:     number;
    lastHit:         { message: string; timestamp: string } | null;
    positions:       Array<{ symbol: string; status: string; gainPct: number }>;
  } = { hitsThisSession: engineStats.trailingStopHits, activeCount: 0, lastHit: null, positions: [] };
  try {
    const tsResult = await checkTrailingStops();
    trailingStopStatus.activeCount = tsResult.statuses.filter(s => s.status === "ACTIVE").length;
    trailingStopStatus.positions   = tsResult.statuses.map(s => ({
      symbol:  s.symbol,
      status:  s.status,
      gainPct: s.gainFromEntryPct,
    }));

    const rows = await db.select().from(logsTable)
      .where(and(eq(logsTable.type, "trade"), like(logsTable.message, "%Trailing stop%")))
      .orderBy(desc(logsTable.timestamp))
      .limit(1);
    if (rows.length > 0) {
      const l = rows[0]!;
      trailingStopStatus.lastHit = { message: l.message, timestamp: l.timestamp.toISOString() };
    }
  } catch { /* ignore */ }

  // ── 8. Journal last entry ──────────────────────────────────────────────────
  let lastJournalEntry: {
    id: string; symbol: string; side: string; realizedPnLPct: number;
    closeReason: string; exitTime: string;
  } | null = null;
  try {
    const journal = getJournal();
    if (journal.length > 0) {
      const e = journal[0]!;
      lastJournalEntry = {
        id:            e.id,
        symbol:        e.symbol,
        side:          e.side,
        realizedPnLPct: e.realizedPnLPct,
        closeReason:   e.closeReason,
        exitTime:      new Date(e.exitTime).toISOString(),
      };
    }
  } catch { /* ignore */ }

  // ── 9. Validation status ───────────────────────────────────────────────────
  const lastVal  = getLastValidation();
  const oosRet   = lastVal?.oos?.outOfSampleReturn ?? null;
  const validationStatus = {
    liveLocked:   isLiveLocked(),
    lockReason:   getLockReason(),
    hasRun:       lastVal !== null,
    lastGrade:    lastVal?.grade ?? null,
    gradeScore:   lastVal?.gradeScore ?? null,
    profitable:   oosRet !== null ? oosRet > 0 : null,
    riskScore:    lastVal ? Math.max(0, Math.round(100 - lastVal.gradeScore)) : null,
    summary:      lastVal
      ? `${lastVal.grade} · OOS ${oosRet !== null ? (oosRet >= 0 ? "+" : "") + oosRet.toFixed(2) + "%" : "?"} · Score ${Math.round(lastVal.gradeScore)}/100`
      : "No validation run yet — trigger one via POST /api/validation/run",
  };

  // ── 10. Backtest capabilities ──────────────────────────────────────────────
  const backtestCapabilities = {
    timeframes:    ["1h (~30d)", "4h (~120d)", "1d (~365d)", "15m (~5d)", "5m (~1.7d)"],
    strategy:      "EMA Crossover (12/26/50)",
    dataSource:    "Alpaca / Binance public API (live candles)",
    periodsEndpoint: "/api/backtest/periods",
  };

  // ── Final response ─────────────────────────────────────────────────────────
  res.json({
    generatedAt: new Date().toISOString(),
    checks: {
      marketData:         marketDataStatus,
      lastSignal:         lastSignalRow,
      mtfGate:            mtfStatus,
      autoTrading:        autoTradeStatus,
      riskEngine:         { lastBlock: lastRiskBlock },
      correlationFilter:  { blocksThisSession: engineStats.correlationBlocks, lastBlock: lastCorrelationBlock },
      trailingStops:      trailingStopStatus,
      journal:            { entryCount: getJournal().length, lastEntry: lastJournalEntry },
      validation:         validationStatus,
      backtest:           backtestCapabilities,
    },
  });
});

export default router;
