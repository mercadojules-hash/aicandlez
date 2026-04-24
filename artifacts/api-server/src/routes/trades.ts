import { Router } from "express";
import { db } from "@workspace/db";
import { tradesTable, logsTable, settingsTable } from "@workspace/db";
import { desc, eq, gte, and } from "drizzle-orm";
import { generateId, getBasePrice, generateSimulatedPrice, calculatePnL } from "../lib/trading.js";

const router = Router();

router.get("/trades", async (req, res) => {
  const trades = await db
    .select()
    .from(tradesTable)
    .orderBy(desc(tradesTable.timestamp))
    .limit(100);

  res.json(trades.map(formatTrade));
});

router.post("/trades", async (req, res) => {
  const { symbol, side, amount, signalId, stopLoss, takeProfit, mode } = req.body;

  const settings = await getSettings();

  if (settings.killSwitch) {
    res.status(403).json({ error: "Kill switch is active. Trading disabled." });
    return;
  }

  const price = generateSimulatedPrice(getBasePrice(symbol ?? "BTCUSDT"));
  const id = generateId();

  await db.insert(tradesTable).values({
    id,
    symbol: symbol ?? "BTCUSDT",
    side,
    amount,
    price,
    status: "open",
    mode: mode ?? "simulated",
    signalId: signalId ?? null,
    stopLoss: stopLoss ?? null,
    takeProfit: takeProfit ?? null,
  });

  await db.insert(logsTable).values({
    id: generateId(),
    type: "trade",
    level: "success",
    message: `${mode === "auto" ? "Auto-executed" : "Manual"} ${side} trade for ${symbol ?? "BTCUSDT"} — $${amount} at $${price.toFixed(2)}`,
    details: { symbol, side, amount, price, mode },
  });

  const trade = await db.select().from(tradesTable).where(eq(tradesTable.id, id)).limit(1);

  res.json(formatTrade(trade[0]));
});

router.get("/trades/open", async (req, res) => {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"))
    .orderBy(desc(tradesTable.timestamp));

  res.json(trades.map(formatTrade));
});

router.post("/trades/:id/close", async (req, res) => {
  const { id } = req.params;

  const existing = await db.select().from(tradesTable).where(eq(tradesTable.id, id)).limit(1);
  if (!existing.length) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  const trade = existing[0];
  const exitPrice = generateSimulatedPrice(trade.price);
  const { pnl, pnlPercent } = calculatePnL(trade.side, trade.price, exitPrice, trade.amount);

  await db
    .update(tradesTable)
    .set({
      status: "closed",
      exitPrice,
      pnl,
      pnlPercent,
      closedAt: new Date(),
      reason: "manual_close",
    })
    .where(eq(tradesTable.id, id));

  await db.insert(logsTable).values({
    id: generateId(),
    type: "trade",
    level: pnl >= 0 ? "success" : "warn",
    message: `Trade ${id.slice(0, 8)} closed — PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(4)} (${pnlPercent.toFixed(2)}%)`,
    details: { id, exitPrice, pnl, pnlPercent },
  });

  const updated = await db.select().from(tradesTable).where(eq(tradesTable.id, id)).limit(1);
  res.json(formatTrade(updated[0]));
});

async function getSettings() {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, "default")).limit(1);
  if (rows.length === 0) {
    await db.insert(settingsTable).values({ id: "default" });
    const newRows = await db.select().from(settingsTable).where(eq(settingsTable.id, "default")).limit(1);
    return newRows[0];
  }
  return rows[0];
}

function formatTrade(t: typeof tradesTable.$inferSelect) {
  return {
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    amount: t.amount,
    price: t.price,
    exitPrice: t.exitPrice ?? null,
    pnl: t.pnl ?? null,
    pnlPercent: t.pnlPercent ?? null,
    status: t.status,
    mode: t.mode,
    signalId: t.signalId ?? null,
    stopLoss: t.stopLoss ?? null,
    takeProfit: t.takeProfit ?? null,
    reason: t.reason ?? null,
    timestamp: t.timestamp.toISOString(),
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
  };
}

export default router;
