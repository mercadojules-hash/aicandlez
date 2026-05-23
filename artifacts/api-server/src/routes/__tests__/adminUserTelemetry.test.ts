/**
 * adminUserTelemetry tests (Task #158).
 *
 * Fixture-based: we mock `@workspace/db.db.execute` and assert the
 * aggregation math + leaderboard ordering + cache behavior. We deliberately
 * do NOT exercise the SQL itself — the route's value comes from the
 * post-query shaping (winRate, online heuristic, leaderboard sort,
 * totals), and that's what these tests pin down.
 *
 * Auth/role enforcement is delegated to `requireAuth` + `requireRole`
 * middleware which are independently covered.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type ExecResult = { rows: Array<Record<string, unknown>> };
let executeQueue: ExecResult[] = [];

const dbMock = {
  execute: vi.fn(async (): Promise<ExecResult> => {
    if (executeQueue.length === 0) return { rows: [] };
    return executeQueue.shift()!;
  }),
};

vi.mock("@workspace/db", () => ({
  db: dbMock,
  // Schema objects don't matter for these tests — execute is the only path used.
  performanceFeesTable: {},
  userConsentsTable:    {},
  usersTable:           { clerkUserId: "clerk_user_id", role: "role" },
  simPositionsTable:    {},
  simTradesTable:       {},
  userTradeLimitsTable: { userId: "user_id", capTier: "cap_tier", overrideExpiresAt: "override_expires_at" },
  DEFAULT_TRADE_LIMIT_CAP: 50,
  UNLIMITED_TRADE_LIMIT_CAP: -1,
}));

vi.mock("../../middlewares/requireAuth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../lib/tradeLimitEngine.js", () => ({
  getTradeLimitVerdict: vi.fn(async (userId: string) => ({
    userId, used24h: 2, capTier: 50, remaining: 48,
    windowResetsAt: Date.now(), blocked: false, reason: "ok" as const,
  })),
}));

// Tiny logger stub req.log calls don't crash.
function makeReq(query: Record<string, string> = {}, params: Record<string, string> = {}, path = "/admin/users") {
  return {
    query, params, path,
    auth: { userId: "admin_1" },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  };
}
function makeRes() {
  const res: { statusCode: number; body: unknown; status: (n: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 200,
    body: null,
    status(n: number) { this.statusCode = n; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

// Resolve the route handlers by mounting the router and pulling its layer
// stack. We invoke each layer's handler directly so we don't need an HTTP
// server for these unit tests.
const { default: router, __invalidateAdminUserTelemetryCache } =
  await import("../adminUserTelemetry.js");

interface Layer {
  route?: {
    path: string;
    stack: Array<{ handle: (req: unknown, res: unknown, next: () => void) => unknown; method?: string }>;
  };
}
function getHandler(path: string) {
  const stack = (router as unknown as { stack: Layer[] }).stack;
  const layer = stack.find(l => l.route?.path === path);
  if (!layer?.route) throw new Error(`route ${path} not found`);
  // Last handler in the stack is the actual async route handler (after middleware).
  const last = layer.route.stack[layer.route.stack.length - 1]!;
  return last.handle as (req: unknown, res: unknown, next: () => void) => Promise<void>;
}

describe("GET /admin/users", () => {
  beforeEach(() => {
    executeQueue = [];
    dbMock.execute.mockClear();
    __invalidateAdminUserTelemetryCache();
  });

  it("shapes rows: computes winRate, mrr, online heuristic", async () => {
    const now = Date.now();
    executeQueue = [
      { rows: [
        {
          clerk_user_id: "u1", email: "a@x", role: "user", plan: "starter",
          plan_status: "active", created_at: new Date(now - 30 * 86_400_000),
          mrr_usd: 39.99, admin_status: "active",
          ai_enabled: true, position_size_usd: 100, max_active_positions: 3,
          min_confidence: 60, risk_level: "moderate",
          trades_count: 10, wins: 7, losses: 3,
          total_pnl: 250.5, fees_generated: 12.34,
          live_trades_count: 4, last_trade_ms: now - 60_000,
          open_positions: 2, open_exposure_usd: 200, open_live_positions: 1,
          exchange_total: 1, exchange_active: 1, exchange_error: 0,
          has_live_exchange: true, trade_cap_tier: 100,
          last_activity_at: now - 60_000,
        },
        {
          clerk_user_id: "u2", email: "b@x", role: "user", plan: "free",
          plan_status: "none", created_at: new Date(now - 86_400_000),
          mrr_usd: 0, admin_status: "active",
          ai_enabled: false, position_size_usd: null, max_active_positions: null,
          min_confidence: null, risk_level: null,
          trades_count: 0, wins: 0, losses: 0,
          total_pnl: 0, fees_generated: 0,
          live_trades_count: 0, last_trade_ms: null,
          open_positions: 0, open_exposure_usd: 0, open_live_positions: 0,
          exchange_total: 0, exchange_active: 0, exchange_error: 0,
          has_live_exchange: false, trade_cap_tier: 50,
          last_activity_at: now - 3 * 86_400_000,
        },
      ] },
      { rows: [{ total: 2 }] },
    ];

    const handler = getHandler("/admin/users");
    const req = makeReq();
    const res = makeRes();
    await handler(req, res, () => undefined);

    const body = res.body as { users: Array<Record<string, unknown>>; total: number };
    expect(body.total).toBe(2);
    expect(body.users[0]!["winRate"]).toBeCloseTo(0.7);
    expect(body.users[0]!["mrrUsd"]).toBe(39.99);
    expect(body.users[0]!["tradeCapTier"]).toBe(100);
    expect(body.users[0]!["onlineNow"]).toBe(true);   // last trade 60s ago
    expect(body.users[1]!["winRate"]).toBeNull();      // tradesCount=0
    expect(body.users[1]!["onlineNow"]).toBe(false);   // 3 days ago
    expect(body.users[1]!["lastTradeMs"]).toBeNull();
  });

  it("serves a cached response on the second identical call", async () => {
    executeQueue = [
      { rows: [] },
      { rows: [{ total: 0 }] },
    ];
    const handler = getHandler("/admin/users");

    await handler(makeReq(), makeRes(), () => undefined);
    const callsAfterFirst = dbMock.execute.mock.calls.length;

    await handler(makeReq(), makeRes(), () => undefined);
    expect(dbMock.execute.mock.calls.length).toBe(callsAfterFirst); // no new queries
  });
});

describe("GET /admin/users/:id", () => {
  beforeEach(() => {
    executeQueue = [];
    dbMock.execute.mockClear();
    __invalidateAdminUserTelemetryCache();
  });

  it("returns 404 when user not found", async () => {
    executeQueue = [{ rows: [] }];
    const handler = getHandler("/admin/users/:id");
    const req = makeReq({}, { id: "ghost" }, "/admin/users/ghost");
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(404);
  });

  it("aggregates positions + closed trades + fees into a single payload", async () => {
    const userCreated = new Date(Date.now() - 10 * 86_400_000);
    executeQueue = [
      // user lookup
      { rows: [{
        clerk_user_id: "u1", email: "a@x", role: "user", plan: "pro",
        plan_status: "active", stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1", billing_email: "a@x",
        trial_ends_at: null, created_at: userCreated, updated_at: userCreated,
        admin_status: "active", admin_status_reason: null, admin_status_since: null,
      }] },
      // settings
      { rows: [{ user_id: "u1", auto_mode: true, min_confidence: 65 }] },
      // sim_accounts
      { rows: [{ user_id: "u1", cash_balance: 95_000 }] },
      // positions (one live, one paper)
      { rows: [
        { id: "p1", symbol: "BTCUSD", size_usd: 100, exchange: "Kraken" },
        { id: "p2", symbol: "ETHUSD", size_usd: 50,  exchange: null },
      ] },
      // closed trades (2 wins, 1 loss)
      { rows: [
        { id: "t1", realized_pnl: 100, exit_time: Date.now() - 60_000 },
        { id: "t2", realized_pnl: 50,  exit_time: Date.now() - 120_000 },
        { id: "t3", realized_pnl: -25, exit_time: Date.now() - 180_000 },
      ] },
      // exchange connections
      { rows: [{ id: "ec1", exchange: "Kraken", status: "active", trading_mode: "paper" }] },
      // audit trail
      { rows: [] },
      // fees row
      { rows: [{ fee_records: 2, fees_total: 4.5, profitable_pnl: 150 }] },
      // audit_log events (AI decisions + latency + one error)
      { rows: [
        { id: "e1", ts_ms: Date.now(), type: "ai_decision", severity: "info",
          payload: { confidence: 70, latencyMs: 50 } },
        { id: "e2", ts_ms: Date.now(), type: "ai_decision", severity: "info",
          payload: { confidence: 80, latencyMs: 70 } },
        { id: "e3", ts_ms: Date.now(), type: "api_call", severity: "error",
          payload: { latencyMs: 1200, error: "timeout" } },
      ] },
    ];

    const handler = getHandler("/admin/users/:id");
    const req = makeReq({}, { id: "u1" }, "/admin/users/u1");
    const res = makeRes();
    await handler(req, res, () => undefined);

    const body = res.body as { aggregates: Record<string, unknown>; positions: unknown[]; closedTrades: unknown[]; tradeLimit: unknown };
    expect(body.aggregates["tradesCount"]).toBe(3);
    expect(body.aggregates["wins"]).toBe(2);
    expect(body.aggregates["losses"]).toBe(1);
    expect(body.aggregates["winRate"]).toBeCloseTo(2 / 3);
    expect(body.aggregates["realizedPnl"]).toBeCloseTo(125);
    expect(body.aggregates["openPositions"]).toBe(2);
    expect(body.aggregates["openLivePositions"]).toBe(1);
    expect(body.aggregates["exposureUsd"]).toBe(150);
    expect(body.aggregates["feesGenerated"]).toBe(4.5);
    expect(body.aggregates["avgConfidence"]).toBe(75);
    expect(body.aggregates["avgLatencyMs"]).toBeCloseTo(440);
    expect(body.aggregates["errorEventCount"]).toBe(1);
    // ~3 trades over ~10 days → ~0.3/day, but tolerant of clock drift.
    expect(body.aggregates["tradesPerDay"]).toBeGreaterThan(0);
    expect(body.tradeLimit).toMatchObject({ used24h: 2, capTier: 50 });
  });
});

describe("GET /admin/platform/leaderboards", () => {
  beforeEach(() => {
    executeQueue = [];
    dbMock.execute.mockClear();
    __invalidateAdminUserTelemetryCache();
  });

  it("orders top-traders by trade count and most-profitable by realized_pnl", async () => {
    executeQueue = [
      // per-user agg
      { rows: [
        { user_id: "u1", email: "a@x", trades: 12, wins: 8, realized_pnl: 500,  volume_usd: 1_000, fees_paid: 10 },
        { user_id: "u2", email: "b@x", trades: 30, wins: 5, realized_pnl: -250, volume_usd: 5_000, fees_paid: 25 },
        { user_id: "u3", email: "c@x", trades: 5,  wins: 5, realized_pnl: 1_200,volume_usd: 800,   fees_paid: 6  },
      ] },
      // fee leaderboard
      { rows: [
        { user_id: "u3", email: "c@x", profitable_trades: 5, fees_generated: 60, realized_pnl: 1_200 },
      ] },
      // exposure
      { rows: [{
        total_exposure_usd: 9_000, live_capital_deployed_usd: 3_000,
        open_positions: 12, open_live_positions: 4,
      }] },
      // fee totals
      { rows: [{ platform_fee_revenue_usd: 60 }] },
    ];

    const handler = getHandler("/admin/platform/leaderboards");
    const req = makeReq({ window: "7d" }, {}, "/admin/platform/leaderboards");
    const res = makeRes();
    await handler(req, res, () => undefined);

    const body = res.body as {
      window: string;
      topTraders: Array<{ user_id: string; trades: number }>;
      mostProfitable: Array<{ user_id: string; realized_pnl: number }>;
      highestVolume: Array<{ user_id: string; volume_usd: number }>;
      inDrawdown: Array<{ user_id: string; realized_pnl: number }>;
      totals: Record<string, number>;
    };
    expect(body.window).toBe("7d");
    expect(body.topTraders[0]!.user_id).toBe("u2");      // 30 trades
    expect(body.mostProfitable[0]!.user_id).toBe("u3");   // +1200
    expect(body.mostProfitable.some(r => r.user_id === "u2")).toBe(false); // drawdown excluded
    expect(body.highestVolume[0]!.user_id).toBe("u2");    // 5000 USD
    expect(body.inDrawdown[0]!.user_id).toBe("u2");       // most negative
    expect(body.totals["platformFeeRevenueUsd"]).toBe(60);
    expect(body.totals["liveCapitalDeployedUsd"]).toBe(3_000);
  });

  it("defaults to window=all when query is missing or invalid", async () => {
    executeQueue = [
      { rows: [] }, { rows: [] },
      { rows: [{ total_exposure_usd: 0, live_capital_deployed_usd: 0, open_positions: 0, open_live_positions: 0 }] },
      { rows: [{ platform_fee_revenue_usd: 0 }] },
    ];
    const handler = getHandler("/admin/platform/leaderboards");
    const req = makeReq({ window: "bogus" }, {}, "/admin/platform/leaderboards");
    const res = makeRes();
    await handler(req, res, () => undefined);
    const body = res.body as { window: string; windowStartMs: number };
    expect(body.window).toBe("all");
    expect(body.windowStartMs).toBe(0);
  });
});
