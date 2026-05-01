import { Router } from "express";
import {
  getAccountSummary, getTradeHistory, placeOrder, closePosition, resetSimulation,
} from "../lib/simulationEngine.js";
import { addJournalEntry } from "../lib/tradeJournalEngine.js";

const router = Router();

// GET /simulation/account — live balance, open positions, equity
router.get("/simulation/account", async (_req, res) => {
  try {
    const data = await getAccountSummary();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /simulation/trades — closed trade history
router.get("/simulation/trades", (_req, res) => {
  res.json({ trades: getTradeHistory() });
});

// POST /simulation/order — place a simulated order
router.post("/simulation/order", async (req, res) => {
  const { symbol, side, sizeUSD } = req.body ?? {};

  if (!symbol || !side || typeof sizeUSD !== "number") {
    res.status(400).json({ error: "Required: symbol (string), side ('BUY'|'SELL'), sizeUSD (number)" });
    return;
  }
  if (side !== "BUY" && side !== "SELL") {
    res.status(400).json({ error: "side must be 'BUY' or 'SELL'" });
    return;
  }

  try {
    const result = await placeOrder({ symbol, side, sizeUSD });
    res.status(result.success ? 201 : 400).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /simulation/close/:positionId — close a position and auto-log to journal
router.post("/simulation/close/:positionId", async (req, res) => {
  try {
    const result = await closePosition(req.params.positionId!);
    if (result.success && result.trade) {
      const t = result.trade;
      addJournalEntry({
        symbol:         t.symbol,
        displayName:    t.symbol.replace("USD", ""),
        side:           t.side,
        entryPrice:     t.entryPrice,
        exitPrice:      t.exitPrice,
        entryTime:      t.entryTime,
        exitTime:       t.exitTime,
        sizeUSD:        t.sizeUSD,
        realizedPnL:    t.realizedPnL,
        realizedPnLPct: t.realizedPnLPct,
        durationMs:     t.durationMs,
        closeReason:    (req.body?.closeReason as "MANUAL" | "TRAILING_STOP" | "RISK_KILL" | "AUTO") ?? "MANUAL",
        reasoning:      req.body?.reasoning,
        notes:          req.body?.notes,
        tags:           req.body?.tags,
      }).catch(() => { /* non-fatal */ });
    }
    res.status(result.success ? 200 : 404).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /simulation/reset — wipe all positions and reset balance
router.post("/simulation/reset", (_req, res) => {
  resetSimulation();
  res.json({ ok: true, message: "Simulation reset to $100,000 starting balance" });
});

export default router;
