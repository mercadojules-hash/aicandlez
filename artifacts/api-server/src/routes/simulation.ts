import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  getUserAccountSummary,
  getUserMonthlyFees,
  getUserTradeHistory,
  placeUserOrder,
  closeUserPosition,
  resetUserSimulation,
} from "../lib/userSimRegistry.js";
import { addJournalEntry } from "../lib/tradeJournalEngine.js";
import type { Request } from "express";

type AuthReq = Request & { clerkUserId: string };

const router = Router();

// GET /account — canonical account endpoint used by Command Center + portfolio panels
router.get("/account", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const data = await getUserAccountSummary(userId);
    res.json(data);
  } catch (err) {
    req.log.error({ err, userId }, "GET /account failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /account/fees/monthly — last N months of broker commission, bucketed by exitTime.
// Drives the Portfolio page fee-trend sparkline beneath the lifetime "Fees paid" stat.
router.get("/account/fees/monthly", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const monthsRaw = Number(req.query["months"] ?? 6);
  const months    = Number.isFinite(monthsRaw) ? Math.trunc(monthsRaw) : 6;
  try {
    const buckets = await getUserMonthlyFees(userId, months);
    const totalFeesPaid = parseFloat(
      buckets.reduce((s, b) => s + b.feesPaid, 0).toFixed(2),
    );
    res.json({ months: buckets, totalFeesPaid });
  } catch (err) {
    req.log.error({ err, userId }, "GET /account/fees/monthly failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /simulation/account
//
// [READ_SOURCE_SIM_ACCOUNT] — Phase 5 convergence diagnostic.
// SOURCE OF TRUTH: `userSimRegistry.getUserAccountSummary(userId)` —
// per-user. Reads from `sim_positions` table + in-memory state.positions
// for the requesting user only. THIS is where `registerLiveUserFill`
// writes land, so this endpoint DOES reflect live customer fills.
//
// Customer-portal dashboard uses this endpoint (query key
// ["customer-simulation-account"]). PWA does NOT use this endpoint
// — that's the bug. See .local/docs/execution-lifecycle-convergence.md.
router.get("/simulation/account", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const data = await getUserAccountSummary(userId);
    const openPositions =
      (data as { positions?: unknown[] }).positions?.length ?? 0;
    req.log.info({
      tag:           "READ_SOURCE_SIM_ACCOUNT",
      stage:         "read",
      endpoint:      "/api/simulation/account",
      source:        "userSimRegistry.getUserAccountSummary",
      scope:         "PER_USER",  // ← per-user, sees live fills
      perUserAware:  true,
      userId,
      openPositions,
    }, "[READ_SOURCE_SIM_ACCOUNT] per-user sim_positions — includes live fills");
    res.json(data);
  } catch (err) {
    req.log.error({ err, userId }, "GET /simulation/account failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /simulation/trades — closed trade history
//
// [READ_SOURCE_SIM_TRADES] — per-user `sim_trades`. Includes both
// PAPER and LIVE rows (mode is tagged per-row). This is why Trade
// History shows live fills correctly even when Live Trades panel
// (which reads /mobile/portfolio → global engine) does not.
router.get("/simulation/trades", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const trades = await getUserTradeHistory(userId);
    req.log.info({
      tag:           "READ_SOURCE_SIM_TRADES",
      stage:         "read",
      endpoint:      "/api/simulation/trades",
      source:        "userSimRegistry.getUserTradeHistory",
      scope:         "PER_USER",
      perUserAware:  true,
      userId,
      tradeCount:    trades.length,
    }, "[READ_SOURCE_SIM_TRADES] per-user sim_trades — paper + live");
    res.json({ trades });
  } catch (err) {
    req.log.error({ err, userId }, "GET /simulation/trades failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /simulation/order — place a simulated order
router.post("/simulation/order", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
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
    const result = await placeUserOrder(userId, { symbol, side, sizeUSD });
    res.status(result.success ? 201 : 400).json(result);
  } catch (err) {
    req.log.error({ err, userId }, "POST /simulation/order failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /simulation/close/:positionId — close a position and auto-log to journal
router.post("/simulation/close/:positionId", requireAuth, async (req, res): Promise<void> => {
  const userId     = (req as AuthReq).clerkUserId;
  const positionId = String(req.params.positionId);
  const closeReason = (req.body?.closeReason as string | undefined) ?? "MANUAL";

  try {
    const result = await closeUserPosition(userId, positionId, closeReason);
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
        closeReason:    closeReason as "MANUAL" | "TRAILING_STOP" | "RISK_KILL" | "AUTO",
        reasoning:      req.body?.reasoning,
        notes:          req.body?.notes,
        tags:           req.body?.tags,
      }).catch(() => { /* non-fatal */ });
    }
    res.status(result.success ? 200 : 404).json(result);
  } catch (err) {
    req.log.error({ err, userId }, "POST /simulation/close failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /simulation/reset — wipe all positions and reset balance for this user
router.post("/simulation/reset", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    await resetUserSimulation(userId);
    res.json({ ok: true, message: "Simulation reset to $100,000 starting balance" });
  } catch (err) {
    req.log.error({ err, userId }, "POST /simulation/reset failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
