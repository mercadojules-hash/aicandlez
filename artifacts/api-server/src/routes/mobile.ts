import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, userConsentsTable } from "@workspace/db";
import { engineStats } from "../lib/tradingLoop.js";
import { getExchangeStatus } from "../lib/exchangeEngine.js";
import { getStatus as getRiskStatus } from "../lib/riskEngine.js";
import { getAccountSummary } from "../lib/simulationEngine.js";
import { getTicker, SUPPORTED_SYMBOLS } from "../lib/marketData.js";
import { userEngineRegistry } from "../services/users/UserEngineRegistry.js";
import { drawdownProtection } from "../services/risk/DrawdownProtection.js";
import { executionTelemetry } from "../services/telemetry/ExecutionTelemetry.js";
import { breakers } from "../services/risk/CircuitBreaker.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import type { Request } from "express";

type AuthReq = Request & { clerkUserId: string };

const CURRENT_CONSENT_VERSION = "v1.0";

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
//
// [READ_SOURCE_PORTFOLIO] — Phase 5 convergence diagnostic.
// SOURCE OF TRUTH: `simulationEngine.getAccountSummary()` — this is the
// GLOBAL system-wide simulation engine, NOT per-user. It does NOT see
// fills written by `registerLiveUserFill` (which target the per-user
// `userSimRegistry` + `sim_positions` table).
//
// Known divergence (see .local/docs/execution-lifecycle-convergence.md):
//   - Customer LIVE BUY → executeCustomerOrder → registerLiveUserFill →
//     per-user `sim_positions` row.
//   - This endpoint → global simulationEngine → does NOT include that row.
//   - Result: Trade History (which reads per-user `sim_trades`) shows
//     the fill on close, but Live Trades panel + OPEN count (which read
//     this endpoint) never see the open position. THIS IS THE BUG.
router.get("/mobile/portfolio", async (req, res) => {
  try {
    const acct = await getAccountSummary();
    const ex   = getExchangeStatus();
    const positions = acct.positions ?? [];
    req.log.info({
      tag:            "READ_SOURCE_PORTFOLIO",
      stage:          "read",
      endpoint:       "/api/mobile/portfolio",
      source:         "simulationEngine.getAccountSummary",
      scope:          "GLOBAL",   // ← NOT per-user
      perUserAware:   false,
      openPositions:  positions.length,
      exchange:       ex.exchangeName,
      mode:           ex.mode,
    }, "[READ_SOURCE_PORTFOLIO] global simulationEngine — does NOT see per-user live fills");
    res.json({
      balances:   ex.simBalances,
      positions,
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
// [READ_SOURCE_POSITIONS] — same global SoT as /mobile/portfolio.
router.get("/mobile/positions", async (req, res) => {
  try {
    const acct = await getAccountSummary();
    const positions = acct.positions ?? [];
    req.log.info({
      tag:           "READ_SOURCE_POSITIONS",
      stage:         "read",
      endpoint:      "/api/mobile/positions",
      source:        "simulationEngine.getAccountSummary",
      scope:         "GLOBAL",   // ← NOT per-user
      perUserAware:  false,
      openPositions: positions.length,
    }, "[READ_SOURCE_POSITIONS] global simulationEngine — see convergence doc");
    res.json({ positions, count: positions.length, ts: Date.now() });
  } catch {
    res.json({ positions: [], count: 0, ts: Date.now() });
  }
});

// ── Signal breakdowns + recent signals ────────────────────────────────────────
// GET /api/mobile/signals
//
// Returns the live engine state the mobile Markets and Signals screens consume:
//   - `breakdowns`: per-symbol MTF breakdown keyed by symbol, with normalized
//     fields matching the frontend `SignalBreakdown` contract.
//   - `signalFilter`: current quality-filter toggles (volume + 1H trend).
// Also keeps the legacy `signals` / `counts` / `funnel` fields for any older
// clients still relying on them.
router.get("/mobile/signals", (_req, res) => {
  const breakdowns: Record<string, {
    symbol:          string;
    action:          string;
    confidence:      number;
    mtfConfirmed:    boolean;
    volumeConfirmed: boolean;
    marketCondition: string;
    trend1H:         string;
    blockReason:     string | null;
    lastUpdated:     number;
  }> = {};
  for (const [symbol, b] of Object.entries(engineStats.symbolBreakdowns)) {
    breakdowns[symbol] = {
      symbol:          b.symbol,
      action:          b.agreedAction,
      confidence:      b.avgConfidence,
      mtfConfirmed:    b.mtfConfirmed,
      volumeConfirmed: b.volumeConfirmed,
      marketCondition: b.marketCondition,
      trend1H:         b.trend1H,
      blockReason:     b.blockReason && b.blockReason.length > 0 ? b.blockReason : null,
      lastUpdated:     b.lastUpdated,
    };
  }
  res.json({
    breakdowns,
    signalFilter: {
      volumeFilter:   engineStats.volumeFilter,
      require1HTrend: engineStats.require1HTrend,
    },
    signals:  engineStats.recentSignalLog,
    counts:   engineStats.signalCounts,
    funnel: {
      total:     engineStats.funnelTotal,
      passedMTF: engineStats.funnelPassedMTF,
      executed:  engineStats.funnelExecuted,
      blocked:   engineStats.funnelBlockedMTF,
    },
    ts: Date.now(),
  });
});

// ── Live ticker prices (Home market cards + scrolling ticker) ────────────────
// GET /api/mobile/tickers
router.get("/mobile/tickers", async (_req, res) => {
  try {
    const results = await Promise.all(
      SUPPORTED_SYMBOLS.map(async (s) => {
        try {
          const t = await getTicker(s);
          return {
            symbol:           t.symbol,
            short:            t.symbol.replace(/USD$/, ""),
            price:            t.price,
            change24h:        t.change24h,
            changePercent24h: t.changePercent24h,
            up:               t.changePercent24h >= 0,
          };
        } catch {
          return null;
        }
      }),
    );
    const tickers = results.filter((x): x is NonNullable<typeof x> => x !== null);
    res.json({ tickers, ts: Date.now() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Tickers unavailable";
    res.status(500).json({ error: msg });
  }
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

// ── Live trading eligibility check ───────────────────────────────────────────
// GET /api/mobile/live-trading/eligibility
// Auth-required. Combines subscription + consent checks into a single call.
// Response drives the mobile app's live trading gate UI.

router.get("/mobile/live-trading/eligibility", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const [user] = await db
      .select({
        plan:                 usersTable.plan,
        planStatus:           usersTable.planStatus,
        stripeSubscriptionId: usersTable.stripeSubscriptionId,
        stripeCustomerId:     usersTable.stripeCustomerId,
      })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const hasActiveSub =
      user.plan !== "free" && user.planStatus === "active";

    if (!hasActiveSub) {
      res.json({
        eligible:    false,
        reason:      "requires_subscription",
        plan:        user.plan,
        planStatus:  user.planStatus,
        hasConsented: false,
      });
      return;
    }

    const [consent] = await db
      .select({ id: userConsentsTable.id, createdAt: userConsentsTable.createdAt })
      .from(userConsentsTable)
      .where(and(
        eq(userConsentsTable.userId, userId),
        eq(userConsentsTable.consentVersion, CURRENT_CONSENT_VERSION),
      ))
      .limit(1);

    if (!consent) {
      res.json({
        eligible:    false,
        reason:      "requires_consent",
        plan:        user.plan,
        planStatus:  user.planStatus,
        hasConsented: false,
      });
      return;
    }

    res.json({
      eligible:    true,
      reason:      "ok",
      plan:        user.plan,
      planStatus:  user.planStatus,
      hasConsented: true,
      consentedAt:  consent.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "GET /mobile/live-trading/eligibility failed");
    res.status(500).json({ error: "Failed to check live trading eligibility" });
  }
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
