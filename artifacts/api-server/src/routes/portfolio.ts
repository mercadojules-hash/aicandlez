import { Router } from "express";
import { db } from "@workspace/db";
import { tradesTable, settingsTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";

const router = Router();

router.get("/portfolio", async (req, res) => {
  const allTrades = await db.select().from(tradesTable);
  const closedTrades = allTrades.filter((t) => t.status === "closed");
  const openTrades = allTrades.filter((t) => t.status === "open");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = closedTrades.filter((t) => t.closedAt && t.closedAt >= todayStart);

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const todayPnl = todayTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;

  const initialBalance = 1000;
  const balance = initialBalance + totalPnl;
  const totalPnlPercent = (totalPnl / initialBalance) * 100;

  res.json({
    balance: parseFloat(balance.toFixed(2)),
    initialBalance,
    totalPnl: parseFloat(totalPnl.toFixed(4)),
    totalPnlPercent: parseFloat(totalPnlPercent.toFixed(2)),
    openPositions: openTrades.length,
    totalTrades: allTrades.length,
    winRate: parseFloat(winRate.toFixed(2)),
    todayTrades: todayTrades.length,
    todayPnl: parseFloat(todayPnl.toFixed(4)),
  });
});

router.get("/dashboard/summary", async (req, res) => {
  const allTrades = await db.select().from(tradesTable);
  const closedTrades = allTrades.filter((t) => t.status === "closed");
  const openTrades = allTrades.filter((t) => t.status === "open");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = closedTrades.filter((t) => t.closedAt && t.closedAt >= todayStart);

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const todayPnl = todayTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const initialBalance = 1000;
  const balance = initialBalance + totalPnl;
  const todayPnlPercent = initialBalance > 0 ? (todayPnl / initialBalance) * 100 : 0;

  const settingsRows = await db.select().from(settingsTable).where(eq(settingsTable.id, "default")).limit(1);
  const settings = settingsRows[0] ?? { killSwitch: false, autoMode: false };

  res.json({
    balance: parseFloat(balance.toFixed(2)),
    todayPnl: parseFloat(todayPnl.toFixed(4)),
    todayPnlPercent: parseFloat(todayPnlPercent.toFixed(2)),
    openPositions: openTrades.length,
    todayTrades: todayTrades.length,
    winRate: parseFloat(winRate.toFixed(2)),
    lastSignal: null,
    killSwitchActive: settings.killSwitch ?? false,
    autoModeActive: settings.autoMode ?? false,
  });
});

export default router;
