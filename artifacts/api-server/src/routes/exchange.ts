import { Router } from "express";
import {
  getExchangeStatus,
  getOrders,
  setMode,
  toggleKillSwitch,
  togglePause,
  previewOrder,
  executeOrder,
  fetchLiveBalances,
  resetSimBalances,
  type OrderSide,
  type OrderType,
  type ExchangeMode,
} from "../lib/exchangeEngine.js";

const router = Router();

// ── Status ───────────────────────────────────────────────────────────────────
router.get("/exchange/status", (_req, res) => {
  res.json(getExchangeStatus());
});

// ── Orders list ───────────────────────────────────────────────────────────────
router.get("/exchange/orders", (_req, res) => {
  const limit = parseInt(String(_req.query["limit"] ?? "50"), 10);
  res.json(getOrders(limit));
});

// ── Balances (live or sim) ────────────────────────────────────────────────────
router.get("/exchange/balances", async (_req, res) => {
  const status = getExchangeStatus();
  if (status.mode === "live" && status.apiConfigured) {
    try {
      const balances = await fetchLiveBalances();
      res.json({ source: "live", balances });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: msg });
    }
  } else {
    res.json({ source: "simulation", balances: status.simBalances });
  }
});

// ── Set mode ──────────────────────────────────────────────────────────────────
router.post("/exchange/mode", (req, res) => {
  const { mode } = req.body as { mode: ExchangeMode };
  if (mode !== "simulation" && mode !== "live") {
    return res.status(400).json({ error: "mode must be 'simulation' or 'live'" });
  }
  const result = setMode(mode);
  if (!result.ok) {
    return res.status(400).json({ error: result.reason });
  }
  res.json({ mode, status: getExchangeStatus() });
});

// ── Kill switch ───────────────────────────────────────────────────────────────
router.post("/exchange/kill", (_req, res) => {
  const active = toggleKillSwitch();
  res.json({ killSwitch: active, status: getExchangeStatus() });
});

// ── Pause ─────────────────────────────────────────────────────────────────────
router.post("/exchange/pause", (_req, res) => {
  const paused = togglePause();
  res.json({ paused, status: getExchangeStatus() });
});

// ── Reset simulation balances ─────────────────────────────────────────────────
router.post("/exchange/sim/reset", (_req, res) => {
  const balances = resetSimBalances();
  res.json({ balances, status: getExchangeStatus() });
});

// ── Preview order ─────────────────────────────────────────────────────────────
router.post("/exchange/order/preview", async (req, res) => {
  const { symbol, side, orderType, amountUSD, limitPrice } = req.body as {
    symbol:     string;
    side:       OrderSide;
    orderType:  OrderType;
    amountUSD:  number;
    limitPrice?: number;
  };
  if (!symbol || !side || !orderType || !amountUSD) {
    return res.status(400).json({ error: "symbol, side, orderType, amountUSD are required" });
  }
  try {
    const preview = await previewOrder(symbol, side, orderType, amountUSD, limitPrice);
    res.json(preview);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Preview failed";
    res.status(502).json({ error: msg });
  }
});

// ── Execute order ─────────────────────────────────────────────────────────────
router.post("/exchange/order/execute", async (req, res) => {
  const { symbol, side, orderType, amountUSD, limitPrice } = req.body as {
    symbol:     string;
    side:       OrderSide;
    orderType:  OrderType;
    amountUSD:  number;
    limitPrice?: number;
  };
  if (!symbol || !side || !orderType || !amountUSD) {
    return res.status(400).json({ error: "symbol, side, orderType, amountUSD are required" });
  }
  try {
    const order = await executeOrder(symbol, side, orderType, amountUSD, limitPrice);
    res.json(order);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Execution failed";
    res.status(502).json({ error: msg });
  }
});

export default router;
