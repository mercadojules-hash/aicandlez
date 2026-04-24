import { Router } from "express";
import { runBacktestSimulation } from "../lib/trading.js";

const router = Router();

router.post("/backtest/run", async (req, res) => {
  const {
    symbol = "BTCUSDT",
    days = 30,
    allocation = 20,
    stopLossPercent = 2,
    takeProfitPercent = 4,
    minConfidence = 80,
  } = req.body;

  const result = runBacktestSimulation(
    symbol,
    days,
    allocation,
    stopLossPercent,
    takeProfitPercent,
    minConfidence
  );

  res.json({
    symbol,
    days,
    totalTrades: result.trades.length,
    wins: result.wins,
    losses: result.losses,
    winRate: result.winRate,
    totalProfit: result.totalProfit,
    totalProfitPercent: result.totalProfitPercent,
    maxDrawdown: result.maxDrawdown,
    trades: result.trades.map((t) => ({
      ...t,
      signalId: null,
      stopLoss: null,
      takeProfit: null,
      pnlPercent: t.pnlPercent,
    })),
  });
});

export default router;
