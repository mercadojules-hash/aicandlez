import { Router } from "express";
import { engineStats } from "../lib/tradingLoop.js";
import { getExchangeStatus } from "../lib/exchangeEngine.js";
import { getStatus as getRiskStatus } from "../lib/riskEngine.js";
import { getAccountSummary } from "../lib/simulationEngine.js";
import { userEngineRegistry } from "../services/users/UserEngineRegistry.js";
import { drawdownProtection } from "../services/risk/DrawdownProtection.js";
import { executionTelemetry } from "../services/telemetry/ExecutionTelemetry.js";
import { breakers } from "../services/risk/CircuitBreaker.js";

// ── Mobile API routes ─────────────────────────────────────────────────────────
//
// Lightweight REST endpoints designed for iOS + Android app consumption.
//
// Design principles:
//   - Responses are compact (no nested raw payloads)
//   - All values pre-formatted for display (no client-side math required)
//   - Separate endpoints for portfolio, signals, risk, and telemetry
//   - Auth header: Authorization: Bearer <token>  (Phase 2)
//   - All endpoints respond < 200ms from in-memory state
//
// Base path: /api/mobile

const router = Router();

// ── Health ping ────────────────────────────────────────────────────────────────
// GET /api/mobile/ping
router.get("/mobile/ping", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), version: "1.0.0" });
});

// ── Engine status snapshot (main screen widget) ───────────────────────────────
// GET /api/mobile/status
router.get("/mobile/status", (_req, res) => {
  const ex   = getExchangeStatus();
  const risk = getRiskStatus();

  res.json({
    engine: {
      running:          engineStats.running,
      autoMode:         true,
      testMode:         engineStats.testMode,
      mode:             ex.mode,
      exchange:         ex.exchangeName,
      killSwitch:       ex.killSwitch,
      paused:           ex.paused,
      signalsGenerated: engineStats.signalsGenerated,
      tradesExecuted:   engineStats.tradesExecuted,
      tradesBlocked:    engineStats.tradesBlocked,
    },
    risk: {
      level:              risk.riskLevel,
      haltReason:         risk.haltReason,
      dailyPnL:           risk.dailyPnL,
      dailyPnLPct:        risk.dailyPnLPct,
      dailyLossUsedPct:   risk.dailyLossUsedPct,
      tradesUsedToday:    risk.tradesUsedToday,
      tradesRemaining:    risk.tradesRemainingToday,
    },
    lastSignal:  engineStats.lastSignal,
    lastTrade:   engineStats.lastTrade,
    ts:          Date.now(),
  });
});

// ── Portfolio snapshot ────────────────────────────────────────────────────────
// GET /api/mobile/portfolio
router.get("/mobile/portfolio", async (_req, res) => {
  try {
    const acct = await getAccountSummary();
    const ex   = getExchangeStatus();
    res.json({
      balances:   ex.simBalances,
      positions:  acct.positions ?? [],
      totalValue: acct.equity ?? 0,
      openPnL:    acct.unrealizedPnL ?? 0,
      exchange:   ex.exchangeName,
      mode:       ex.mode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Portfolio unavailable";
    res.status(500).json({ error: msg });
  }
});

// ── Open positions ────────────────────────────────────────────────────────────
// GET /api/mobile/positions
router.get("/mobile/positions", async (_req, res) => {
  try {
    const acct = await getAccountSummary();
    const positions = acct.positions ?? [];
    res.json({ positions, count: positions.length, ts: Date.now() });
  } catch {
    res.json({ positions: [], count: 0, ts: Date.now() });
  }
});

// ── Recent signals (last 10) ──────────────────────────────────────────────────
// GET /api/mobile/signals
router.get("/mobile/signals", (_req, res) => {
  res.json({
    signals:  engineStats.recentSignalLog,
    counts:   engineStats.signalCounts,
    funnel: {
      total:     engineStats.funnelTotal,
      passedMTF: engineStats.funnelPassedMTF,
      executed:  engineStats.funnelExecuted,
      blocked:   engineStats.funnelBlockedMTF,
    },
  });
});

// ── Symbol breakdowns (mini signal cards) ────────────────────────────────────
// GET /api/mobile/symbols
router.get("/mobile/symbols", (_req, res) => {
  const breakdowns = Object.values(engineStats.symbolBreakdowns).map(b => ({
    symbol:         b.symbol,
    action:         b.agreedAction,
    confidence:     b.avgConfidence,
    mtfConfirmed:   b.mtfConfirmed,
    volumeConfirmed: b.volumeConfirmed,
    marketCondition: b.marketCondition,
    trend1H:        b.trend1H,
    blockReason:    b.blockReason,
    lastUpdated:    b.lastUpdated,
  }));
  res.json({ symbols: breakdowns, ts: Date.now() });
});

// ── Risk status ───────────────────────────────────────────────────────────────
// GET /api/mobile/risk
router.get("/mobile/risk", (_req, res) => {
  const risk = getRiskStatus();
  res.json({
    ...risk,
    circuitBreakers: breakers.all().map(b => ({
      name:  b.name,
      state: b.state,
      fails: b.consecutiveFails,
    })),
    ts: Date.now(),
  });
});

// ── Platform user engine stats ────────────────────────────────────────────────
// GET /api/mobile/platform
router.get("/mobile/platform", (_req, res) => {
  res.json({
    engines:   userEngineRegistry.summary(),
    drawdown:  drawdownProtection.platformSummary(),
    telemetry: executionTelemetry.getLatencyStats().map(s => ({
      exchange:       s.exchange,
      samples:        s.sampleCount,
      avgRoundTripMs: s.avgRoundTripMs,
      fillRate:       s.fillRate,
    })),
    ts: Date.now(),
  });
});

// ── Push notification registration (Phase 2) ─────────────────────────────────
// POST /api/mobile/push/register
router.post("/mobile/push/register", (req, res) => {
  const { userId, token, platform } = req.body as {
    userId:   string;
    token:    string;
    platform: "ios" | "android";
  };
  if (!userId || !token || !platform) {
    res.status(400).json({ error: "userId, token, platform required" });
    return;
  }
  // TODO Phase 2: persist token to push_tokens table, integrate FCM/APNS
  req.log.info({ userId, platform }, "Push token registered (stub)");
  res.json({ ok: true, message: "Push registration queued (Phase 2)" });
});

// ── Exchange switcher (mobile) ────────────────────────────────────────────────
// POST /api/mobile/exchange/select
router.post("/mobile/exchange/select", (req, res) => {
  const { name } = req.body as { name: string };
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  // Dynamic import to avoid circular dependency
  void import("../lib/exchangeEngine.js").then(({ setSelectedExchange }) => {
    setSelectedExchange(name.trim());
    res.json({ ok: true, exchange: name.trim() });
  });
});

// ── Kill switch (mobile emergency) ───────────────────────────────────────────
// POST /api/mobile/kill
router.post("/mobile/kill", (_req, res) => {
  void import("../lib/exchangeEngine.js").then(({ toggleKillSwitch }) => {
    const active = toggleKillSwitch();
    res.json({ killSwitch: active, ts: Date.now() });
  });
});

// ── Lightweight telemetry (app startup / session tracking) ───────────────────
// POST /api/mobile/telemetry
router.post("/mobile/telemetry", (req, res) => {
  const { userId, event, meta } = req.body as {
    userId: string;
    event:  string;
    meta?:  Record<string, unknown>;
  };
  if (!userId || !event) { res.status(400).json({ error: "userId, event required" }); return; }
  req.log.info({ userId, event, meta }, "Mobile telemetry");
  res.json({ ok: true });
});

export default router;
