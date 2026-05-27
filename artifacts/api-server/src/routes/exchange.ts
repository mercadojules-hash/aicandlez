import { Router } from "express";
import {
  getExchangeStatus,
  getOrders,
  setMode,
  toggleKillSwitch,
  togglePause,
  previewOrder,
  executeOrder,
  fetchLiveBalancesWithMeta,
  fetchLiveEquityWithMeta,
  getLiveExchangeState,
  resetSimBalances,
  setSelectedExchange,
  type OrderSide,
  type OrderType,
  type ExchangeMode,
} from "../lib/exchangeEngine.js";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

// Operator endpoints — admin/super-admin only. These control the shared
// exchange engine (mode, kill switch, pause, sim reset, exchange selection,
// Kraken live execution). Regular users trade through /simulation/* (paper)
// and Alpaca-only flows; they must never touch these.
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];
import { auditLogger } from "../services/telemetry/AuditLogger.js";

const router = Router();

// ── Status ───────────────────────────────────────────────────────────────────
router.get("/exchange/status", ...requireOperator, (_req, res) => {
  res.json(getExchangeStatus());
});

// ── Orders list ───────────────────────────────────────────────────────────────
router.get("/exchange/orders", ...requireOperator, (_req, res) => {
  const limit = parseInt(String(_req.query["limit"] ?? "50"), 10);
  res.json(getOrders(limit));
});

// ── Live state (operator telemetry reconciliation) ────────────────────────────
// Single read for the admin Portal tile row: balances, mark-to-market equity,
// derived open positions, today's fill count, realized P/L, and the
// ExecutionQueue saturation snapshot. See `getLiveExchangeState()` in
// `lib/exchangeEngine.ts` for the derivation rules. Replaces the older
// pattern where Portal.tsx synthesised `openCount` from paper sim_positions.
router.get("/exchange/live-state", ...requireOperator, async (req, res) => {
  try {
    const state = await getLiveExchangeState();
    res.json(state);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "live-state failed";
    req.log.error({ err }, "[live-state] unexpected failure");
    res.status(502).json({ error: msg });
  }
});

// ── Balances (live or sim) ────────────────────────────────────────────────────
router.get("/exchange/balances", ...requireOperator, async (req, res) => {
  const status = getExchangeStatus();
  const zero = { USD: 0, BTC: 0, ETH: 0, SOL: 0 };
  // OPERATOR POLICY — the admin terminal must NEVER surface the $100K paper
  // hero. If the engine is in live mode + API keys present, we read live.
  // Otherwise: if API keys ARE configured, attempt a live read anyway (the
  // engine may not yet have been flipped to live for this process) — and on
  // any failure return source="error" with zero balances. We only emit
  // source="simulation" when no API keys exist at all, and even then with
  // zero balances so the UI displays "—" instead of $100K.
  // Routes through fetchLiveBalancesWithMeta so concurrent admin panels
  // coalesce onto a single Kraken Balance call (FRESH window), and a
  // rate-limit / transient upstream failure serves the last-good snapshot
  // (STALE window) instead of zeroing the operator telemetry. The route
  // contract still distinguishes:
  //   • source="live"        → fresh upstream success
  //   • source="cached"      → served from in-process cache, recent
  //   • source="stale-error" → cache served because upstream just failed
  //                            (error string attached; balances still real)
  //   • source="error"       → upstream failed AND no usable cache
  if (status.apiConfigured) {
    try {
      // Equity rollup wrapper. Pulls raw balances via the existing cached/
      // single-flight `fetchLiveBalancesWithMeta`, then prices each non-USD
      // asset via the active adapter's `getTicker` (with its own 30s price
      // cache + stale-on-error fallback). Operator UI uses `totalEquityUsd`
      // for the KRAKEN EQUITY hero and `usdCash` for the USD CASH cell so
      // a Kraken account holding $101 of ETH stops rendering as the $0.14
      // leftover USD float.
      const equity = await fetchLiveEquityWithMeta();
      res.json({
        source:         equity.source,
        balances:       equity.balances,
        exchange:       equity.exchange,
        ageMs:          equity.ageMs,
        usdCash:        equity.usdCash,
        holdingsUsd:    equity.holdingsUsd,
        totalEquityUsd: equity.totalEquityUsd,
        holdings:       equity.holdings,
        priceErrors:    equity.priceErrors,
        ...(equity.error ? { error: equity.error } : {}),
      });
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      req.log.error({ err, exchange: status.exchangeName }, "fetchLiveEquityWithMeta failed (no cache fallback)");
      res.json({
        source:         "error",
        balances:       zero,
        exchange:       status.exchangeName,
        usdCash:        0,
        holdingsUsd:    0,
        totalEquityUsd: 0,
        holdings:       {},
        priceErrors:    [],
        error:          msg,
      });
      return;
    }
  }
  // No live keys configured — explicit standby state, NOT the sim hero.
  res.json({
    source:         "standby",
    balances:       zero,
    exchange:       status.exchangeName,
    usdCash:        0,
    holdingsUsd:    0,
    totalEquityUsd: 0,
    holdings:       {},
    priceErrors:    [],
    error:          "Exchange API keys not configured",
  });
});

// ── Set mode ──────────────────────────────────────────────────────────────────
router.post("/exchange/mode", ...requireOperator, async (req, res) => {
  const { mode } = req.body as { mode: ExchangeMode };
  if (mode !== "simulation" && mode !== "live") {
    res.status(400).json({ error: "mode must be 'simulation' or 'live'" });
    return;
  }
  // NOTE — no plan gate here. The route is already protected by
  // `requireOperator` (admin + super-admin only). Customers on starter/pro
  // never call this endpoint directly; their live-execution gating happens
  // upstream in the customer billing/consent flow, not on the shared
  // institutional engine that this route controls. A previous plan check
  // here was the root cause of the "$100,000.00 SIM FALLBACK" hero on the
  // admin Portal: admins typically have plan="free"/null in the users row
  // (no Stripe subscription), so the check 402'd, the engine never flipped
  // to live, and /exchange/balances kept returning simulation balances.
  const result = setMode(mode);
  if (!result.ok) {
    res.status(400).json({ error: result.reason });
    return;
  }
  res.json({ mode, status: getExchangeStatus() });
});

// ── Kill switch ───────────────────────────────────────────────────────────────
router.post("/exchange/kill", ...requireOperator, (req, res) => {
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
router.post("/exchange/pause", ...requireOperator, (_req, res) => {
  const paused = togglePause();
  res.json({ paused, status: getExchangeStatus() });
});

// ── Reset simulation balances ─────────────────────────────────────────────────
router.post("/exchange/sim/reset", ...requireOperator, (_req, res) => {
  const balances = resetSimBalances();
  res.json({ balances, status: getExchangeStatus() });
});

// ── Preview order ─────────────────────────────────────────────────────────────
router.post("/exchange/order/preview", ...requireOperator, async (req, res) => {
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
router.post("/exchange/order/execute", ...requireOperator, async (req, res) => {
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
    req.log.error({ err: msg }, "executeOrder failed");
    res.status(502).json({ error: msg });
  }
});

// ── Select exchange (UI label) ─────────────────────────────────────────────────
router.post("/exchange/select", ...requireOperator, (req, res) => {
  const { name } = req.body as { name: string };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  setSelectedExchange(name.trim());
  res.json({ exchangeName: name.trim(), status: getExchangeStatus() });
});

export default router;
