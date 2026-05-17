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
  setSelectedExchange,
  type OrderSide,
  type OrderType,
  type ExchangeMode,
} from "../lib/exchangeEngine.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
router.post("/exchange/mode", requireAuth, async (req, res) => {
  const { mode } = req.body as { mode: ExchangeMode };
  if (mode !== "simulation" && mode !== "live") {
    res.status(400).json({ error: "mode must be 'simulation' or 'live'" });
    return;
  }
  // Gate live mode behind Starter plan or higher
  if (mode === "live") {
    const userId = (req as import("express").Request & { clerkUserId?: string }).clerkUserId ?? "";
    try {
      const [user] = await db
        .select({ plan: usersTable.plan, planStatus: usersTable.planStatus })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, userId))
        .limit(1);
      const planOk   = user?.plan === "starter" || user?.plan === "pro" || user?.plan === "enterprise";
      const statusOk = !user?.planStatus || user.planStatus === "active" || user.planStatus === "trialing";
      if (!planOk || !statusOk) {
        res.status(402).json({
          error:      "Live trading requires a Starter plan or higher",
          code:       "PLAN_REQUIRED",
          upgradeUrl: "/billing",
        });
        return;
      }
    } catch { /* fail open on DB errors */ }
  }
  const result = setMode(mode);
  if (!result.ok) {
    res.status(400).json({ error: result.reason });
    return;
  }
  res.json({ mode, status: getExchangeStatus() });
});

// ── Kill switch ───────────────────────────────────────────────────────────────
router.post("/exchange/kill", requireAuth, (req, res) => {
  const active    = toggleKillSwitch();
  const userId    = (req as import("express").Request & { clerkUserId?: string }).clerkUserId ?? "system";
  const ipAddress = req.ip ?? req.socket?.remoteAddress ?? null;

  auditLogger.append(
    userId,
    active ? "KILL_SWITCH_ON" : "KILL_SWITCH_OFF",
    { source: "exchange-engine", reason: "manual", active },
    { severity: active ? "critical" : "warn", ipAddress: ipAddress ?? undefined },
  );

  res.json({ killSwitch: active, status: getExchangeStatus() });
});

// ── Pause ─────────────────────────────────────────────────────────────────────
router.post("/exchange/pause", requireAuth, (_req, res) => {
  const paused = togglePause();
  res.json({ paused, status: getExchangeStatus() });
});

// ── Reset simulation balances ─────────────────────────────────────────────────
router.post("/exchange/sim/reset", requireAuth, (_req, res) => {
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
    res.status(400).json({ error: "symbol, side, orderType, amountUSD are required" });
    return;
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
router.post("/exchange/order/execute", requireAuth, async (req, res) => {
  const { symbol, side, orderType, amountUSD, limitPrice } = req.body as {
    symbol:     string;
    side:       OrderSide;
    orderType:  OrderType;
    amountUSD:  number;
    limitPrice?: number;
  };
  if (!symbol || !side || !orderType || !amountUSD) {
    res.status(400).json({ error: "symbol, side, orderType, amountUSD are required" });
    return;
  }
  try {
    const order = await executeOrder(symbol, side, orderType, amountUSD, limitPrice);
    res.json(order);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Execution failed";
    res.status(502).json({ error: msg });
  }
});

// ── Select exchange (UI label) ─────────────────────────────────────────────────
router.post("/exchange/select", requireAuth, (req, res) => {
  const { name } = req.body as { name: string };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  setSelectedExchange(name.trim());
  res.json({ exchangeName: name.trim(), status: getExchangeStatus() });
});

export default router;
