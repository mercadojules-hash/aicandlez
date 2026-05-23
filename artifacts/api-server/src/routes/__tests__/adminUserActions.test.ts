/**
 * adminUserActions tests (Task #159).
 *
 * Fixture-based unit tests. We mock the Drizzle `db` chain methods and the
 * Stripe client; the value of these tests is pinning the route's
 * audit-write + state-mutation pairing, the operator self-action block,
 * the super-admin gate for destructive endpoints, and the emergency_disable
 * composite path.
 *
 * Auth/role middleware is independently tested elsewhere — here we stub them
 * to next() and assert behavior assuming the actor has reached the handler.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Drizzle chain mock ───────────────────────────────────────────────────────
// Each `db.*` call returns a Proxy that resolves to whatever was queued
// for that operation kind. Operations: select, insert, update, delete.
interface QueuedResult { kind: "select" | "insert" | "update" | "delete" | "execute"; rows: unknown }
let opQueue: QueuedResult[] = [];

function chainable(value: unknown) {
  // Proxy that returns itself for every method call, but is `await`able and
  // resolves to `value`. Drizzle uses `.from().where().limit()` then awaits;
  // a returning() variant resolves to an array too.
  const handler: ProxyHandler<{ then?: unknown }> = {
    get(target, prop) {
      if (prop === "then") {
        // act like a thenable resolving to `value`
        return (onFulfilled: (v: unknown) => unknown) => Promise.resolve(value).then(onFulfilled);
      }
      // unknown method → return self for further chaining
      return () => new Proxy(target, handler);
    },
  };
  return new Proxy({}, handler);
}

function popOrDefault(kind: QueuedResult["kind"], fallback: unknown): unknown {
  const idx = opQueue.findIndex(q => q.kind === kind);
  if (idx === -1) return fallback;
  const [item] = opQueue.splice(idx, 1);
  return item!.rows;
}

const dbMock = {
  select: vi.fn(() => chainable(popOrDefault("select", []))),
  insert: vi.fn(() => chainable(popOrDefault("insert", []))),
  update: vi.fn(() => chainable(popOrDefault("update", []))),
  delete: vi.fn(() => chainable(popOrDefault("delete", []))),
  execute: vi.fn(async () => ({ rows: popOrDefault("execute", []) as unknown[] })),
};

vi.mock("@workspace/db", () => ({
  db: dbMock,
  usersTable:                    { clerkUserId: "clerk_user_id", role: "role", stripeCustomerId: "stripe_customer_id", stripeSubscriptionId: "stripe_subscription_id", trialEndsAt: "trial_ends_at", plan: "plan", planStatus: "plan_status" },
  userAdminStatusTable:          { userId: "user_id", status: "status", setByAdminId: "set_by_admin_id", reason: "reason", since: "since", updatedAt: "updated_at" },
  userAdminActionsTable:         { id: "id", actorAdminId: "actor_admin_id", targetUserId: "target_user_id", action: "action", payload: "payload", createdAt: "created_at" },
  userTradeLimitsTable:          { userId: "user_id", capTier: "cap_tier", overrideExpiresAt: "override_expires_at", createdAt: "created_at", updatedAt: "updated_at" },
  userExchangeConnectionsTable:  { id: "id", userId: "user_id", exchange: "exchange", status: "status", tradingMode: "trading_mode" },
  ADMIN_STATUSES:          ["active", "suspended", "disabled", "force_paper"] as const,
  TRADE_LIMIT_CAP_TIERS:   [50, 100, 200, -1] as const,
}));

vi.mock("../../middlewares/requireAuth.js", () => ({
  requireAuth: (req: { clerkUserId?: string }, _res: unknown, next: () => void) => {
    req.clerkUserId = req.clerkUserId ?? "admin_actor";
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const stripeMock = {
  subscriptions: {
    update: vi.fn(async (id: string, _params: unknown, _opts: unknown) => ({
      id, status: "active", cancel_at: null, trial_end: 9_999_999_999,
    })),
    cancel: vi.fn(async (id: string) => ({ id, status: "canceled", cancel_at: null })),
  },
};
vi.mock("../../stripeClient.js", () => ({
  getUncachableStripeClient: vi.fn(async () => stripeMock),
}));

const invalidateTradeLimitCache = vi.fn();
vi.mock("../../lib/tradeLimitEngine.js", () => ({ invalidateTradeLimitCache }));

const __invalidateAdminUserTelemetryCache = vi.fn();
vi.mock("../adminUserTelemetry.js", () => ({
  __invalidateAdminUserTelemetryCache,
  default: { stack: [] },
}));

// ── Test scaffolding ────────────────────────────────────────────────────────
function makeReq(opts: { params?: Record<string, string>; body?: unknown; actor?: string }) {
  return {
    params: opts.params ?? {},
    body:   opts.body   ?? {},
    query:  {},
    path:   "",
    clerkUserId: opts.actor ?? "admin_actor",
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  };
}
function makeRes() {
  const res: { statusCode: number; body: unknown; status: (n: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 200, body: null,
    status(n) { this.statusCode = n; return this; },
    json(b)   { this.body = b; return this; },
  };
  return res;
}

const { default: router } = await import("../adminUserActions.js");

interface Layer { route?: { path: string; stack: Array<{ handle: (req: unknown, res: unknown, next: () => void) => unknown; method?: string }> } }
function getHandler(path: string) {
  const stack = (router as unknown as { stack: Layer[] }).stack;
  const layer = stack.find(l => l.route?.path === path);
  if (!layer?.route) throw new Error(`route ${path} not found`);
  return layer.route.stack[layer.route.stack.length - 1]!.handle as
    (req: unknown, res: unknown, next: () => void) => Promise<void>;
}

beforeEach(() => {
  opQueue = [];
  dbMock.select.mockClear(); dbMock.insert.mockClear();
  dbMock.update.mockClear(); dbMock.delete.mockClear();
  stripeMock.subscriptions.update.mockClear();
  stripeMock.subscriptions.cancel.mockClear();
  invalidateTradeLimitCache.mockClear();
  __invalidateAdminUserTelemetryCache.mockClear();
});

describe("operator status mutations", () => {
  it("suspends a user, writes audit, invalidates telemetry cache", async () => {
    // before-lookup + after-lookup both return the status row
    opQueue.push(
      { kind: "select", rows: [{ userId: "u1", status: "active",    reason: null }] },
      { kind: "select", rows: [{ userId: "u1", status: "suspended", reason: "abuse" }] },
    );
    const handler = getHandler("/admin/users/:id/suspend");
    const req = makeReq({ params: { id: "u1" }, body: { note: "platform abuse report", reason: "abuse" } });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(200);
    expect((res.body as { status: string }).status).toBe("suspended");
    expect(dbMock.insert).toHaveBeenCalled();       // status upsert + audit row
    expect(__invalidateAdminUserTelemetryCache).toHaveBeenCalled();
  });

  it("rejects status mutation without a note", async () => {
    const handler = getHandler("/admin/users/:id/activate");
    const req = makeReq({ params: { id: "u1" }, body: {} });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(400);
  });

  it("blocks operator self-action", async () => {
    const handler = getHandler("/admin/users/:id/disable");
    const req = makeReq({ params: { id: "admin_actor" }, body: { note: "n/a" }, actor: "admin_actor" });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(400);
    expect(String((res.body as { error: string }).error)).toMatch(/own account/i);
  });
});

describe("trade-limit override", () => {
  it("upserts trade-limit row + invalidates the engine cache", async () => {
    opQueue.push(
      { kind: "select", rows: [{ userId: "u1", capTier: 50,  overrideExpiresAt: null }] }, // before
      { kind: "select", rows: [{ userId: "u1", capTier: 200, overrideExpiresAt: null }] }, // after
    );
    const handler = getHandler("/admin/users/:id/override_trade_limit");
    const req = makeReq({ params: { id: "u1" }, body: { note: "high-volume customer", capTier: 200 } });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(invalidateTradeLimitCache).toHaveBeenCalledWith("u1");
  });

  it("rejects an invalid capTier", async () => {
    const handler = getHandler("/admin/users/:id/override_trade_limit");
    const req = makeReq({ params: { id: "u1" }, body: { note: "n", capTier: 75 } });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(400);
  });
});

describe("subscription actions", () => {
  it("cancels at period end via Stripe + writes audit", async () => {
    opQueue.push({ kind: "select", rows: [{
      stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
      trialEndsAt: null, plan: "pro", planStatus: "active",
    }] });
    const handler = getHandler("/admin/users/:id/cancel_subscription");
    const req = makeReq({ params: { id: "u1" }, body: { note: "user requested cancel" } });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      "sub_1",
      { cancel_at_period_end: true },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(res.statusCode).toBe(200);
  });

  it("409s comp_subscription if no stripe sub on file", async () => {
    opQueue.push({ kind: "select", rows: [{ stripeCustomerId: null, stripeSubscriptionId: null, planStatus: "none" }] });
    const handler = getHandler("/admin/users/:id/complimentary_subscription");
    const req = makeReq({ params: { id: "u1" }, body: { note: "comp 30 days", days: 30 } });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(409);
  });

  it("extends subscription by pushing trial_end forward", async () => {
    opQueue.push({ kind: "select", rows: [{
      stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
      trialEndsAt: null, plan: "starter", planStatus: "active",
    }] });
    const handler = getHandler("/admin/users/:id/extend_subscription");
    const req = makeReq({ params: { id: "u1" }, body: { note: "goodwill extend", days: 14 } });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(200);
    const updateCall = stripeMock.subscriptions.update.mock.calls[0]!;
    expect(updateCall[0]).toBe("sub_1");
    expect((updateCall[1] as { trial_end: number; proration_behavior: string }).proration_behavior).toBe("none");
  });
});

describe("revoke_exchange_access (super-admin)", () => {
  it("deletes all of the user's exchange connections + writes audit", async () => {
    opQueue.push(
      { kind: "select", rows: [{ id: "ec1", exchange: "Kraken", status: "active", tradingMode: "paper" }] }, // before
      { kind: "delete", rows: [{ id: "ec1" }] },
    );
    const handler = getHandler("/admin/users/:id/revoke_exchange_access");
    const req = makeReq({ params: { id: "u1" }, body: { note: "security incident" } });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(200);
    expect((res.body as { deleted: number }).deleted).toBe(1);
    expect(dbMock.delete).toHaveBeenCalled();
  });
});

describe("emergency_disable (super-admin composite)", () => {
  it("flips status, wipes credentials, cancels stripe, writes one audit row", async () => {
    // statusBefore, stripeBefore, exchangeBefore queries
    opQueue.push(
      { kind: "select", rows: [{ userId: "u1", status: "active", reason: null }] }, // statusBefore
      { kind: "select", rows: [{ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", trialEndsAt: null, plan: "pro", planStatus: "active" }] }, // stripeBefore
      { kind: "select", rows: [{ id: "ec1", exchange: "Kraken", tradingMode: "live" }, { id: "ec2", exchange: "Coinbase", tradingMode: "paper" }] }, // exchangeBefore
      { kind: "delete", rows: [{ id: "ec1" }, { id: "ec2" }] },
      { kind: "select", rows: [{ userId: "u1", status: "disabled", reason: "TOS violation" }] }, // statusAfter
    );
    const handler = getHandler("/admin/users/:id/emergency_disable");
    const req = makeReq({ params: { id: "u1" }, body: { note: "platform safety", reason: "TOS violation" } });
    const res = makeRes();
    await handler(req, res, () => undefined);

    expect(res.statusCode).toBe(200);
    const body = res.body as { status: string; exchangesDeleted: number; stripe: { stripeStatus: string | null } };
    expect(body.status).toBe("disabled");
    expect(body.exchangesDeleted).toBe(2);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      "sub_1",
      { cancel_at_period_end: true },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    // exactly one audit row (composite)
    const auditInserts = dbMock.insert.mock.calls.length;
    // 1 for status upsert + 1 for audit row = 2 inserts
    expect(auditInserts).toBe(2);
  });

  it("does not roll back local mutations if Stripe fails — records error in audit", async () => {
    opQueue.push(
      { kind: "select", rows: [{ userId: "u1", status: "active", reason: null }] },
      { kind: "select", rows: [{ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_dead", trialEndsAt: null, plan: "pro", planStatus: "active" }] },
      { kind: "select", rows: [] },
      { kind: "delete", rows: [] },
      { kind: "select", rows: [{ userId: "u1", status: "disabled", reason: "abuse" }] },
    );
    stripeMock.subscriptions.update.mockRejectedValueOnce(new Error("stripe network failure"));
    const handler = getHandler("/admin/users/:id/emergency_disable");
    const req = makeReq({ params: { id: "u1" }, body: { note: "rebuild later", reason: "abuse" } });
    const res = makeRes();
    await handler(req, res, () => undefined);
    expect(res.statusCode).toBe(200);
    const body = res.body as { status: string; stripe: { error?: string; stripeStatus: string | null } };
    expect(body.status).toBe("disabled");
    expect(body.stripe.error).toMatch(/stripe network failure/);
    expect(body.stripe.stripeStatus).toBeNull();
  });
});
