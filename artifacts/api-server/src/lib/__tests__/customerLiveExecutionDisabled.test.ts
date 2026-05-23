/**
 * Customer-portal live-execution kill-switch tests (Task #157).
 *
 * Two-worlds invariant: the customer portal at `trade.aicandlez.com/portal`
 * is paper-only. Non-admin callers must be hard-rejected from the per-user
 * live-execution path with `customer_live_execution_disabled`, even with
 * an active `user_exchange_connections` row. Admins/super-admins bypass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const usersTableRef = { role: "role", clerkUserId: "clerkUserId" };
const execStreamMock = { emitEvent: vi.fn() };

// Drizzle chain stub — `db.select(...).from(...).where(...).limit(1)`
// is reused for both the users-role lookup and the connection lookup.
// For the kill-switch tests we only need the role lookup; downstream
// queries are never reached because the guard returns early.
let nextRoleRow: { role: string } | undefined = { role: "user" };

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => (nextRoleRow ? [nextRoleRow] : [])),
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(async () => undefined),
  })),
};

vi.mock("@workspace/db", () => ({
  db: dbMock,
  userExchangeConnectionsTable: { userId: "userId", isDefault: "isDefault", status: "status", tradingMode: "tradingMode" },
  userNotificationsTable:       {},
  userSettingsTable:            {},
  usersTable:                   usersTableRef,
  logsTable:                    {},
}));

vi.mock("../executionStreamBus.js",     () => ({ executionStreamBus: execStreamMock }));
vi.mock("../logger.js",                 () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../../services/vault/CredentialVault.js", () => ({ vault: { decryptBlob: vi.fn() } }));
vi.mock("../../services/exchanges/AlpacaTokenRefresher.js", () => ({ ensureFreshAlpacaCreds: vi.fn() }));
vi.mock("../../services/exchanges/adapterFactory.js", () => ({ hasSandbox: () => false, makeAdapter: vi.fn() }));
vi.mock("../../services/notifications/NotificationDispatcher.js", () => ({
  NotificationDispatcher: { notifyUser: vi.fn() },
}));
vi.mock("../marketData.js",        () => ({ getTicker: vi.fn(async () => 50000) }));
vi.mock("../tradeLimitEngine.js",  () => ({
  getTradeLimitVerdict:        vi.fn(async () => ({ blocked: false })),
  invalidateTradeLimitCache:   vi.fn(),
}));
vi.mock("../userStatusGuard.js",   () => ({
  getUserStatusVerdict: vi.fn(async () => ({ allowLive: true, status: "active" })),
}));

// Import AFTER mocks so the module picks them up.
const liveUserExecution = await import("../liveUserExecution.js");
const { placeLiveAutoOrderForUser, isCustomerLiveExecutionEnabled } = liveUserExecution;

describe("isCustomerLiveExecutionEnabled", () => {
  const prev = process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"];
  afterEach(() => {
    if (prev === undefined) delete process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"];
    else process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"] = prev;
  });

  it("defaults to false when env is unset", () => {
    delete process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"];
    expect(isCustomerLiveExecutionEnabled()).toBe(false);
  });

  it("is false for any value other than the exact string 'true'", () => {
    for (const v of ["1", "yes", "TRUE", "on", ""]) {
      process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"] = v;
      expect(isCustomerLiveExecutionEnabled()).toBe(false);
    }
  });

  it("is true only when env === 'true'", () => {
    process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"] = "true";
    expect(isCustomerLiveExecutionEnabled()).toBe(true);
  });
});

describe("placeLiveAutoOrderForUser — customer kill switch", () => {
  beforeEach(() => {
    delete process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"];
    execStreamMock.emitEvent.mockClear();
    dbMock.insert.mockClear();
    nextRoleRow = { role: "user" };
  });

  it("rejects non-admin caller with customer_live_execution_disabled when flag is off", async () => {
    const result = await placeLiveAutoOrderForUser({
      userId: "user_abc", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("customer_live_execution_disabled");
    expect(result.error).toMatch(/customer portal/i);
    expect(execStreamMock.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type:   "order_rejected",
        gate:   "customer_live_execution_disabled",
        reason: "customer_live_execution_disabled",
      }),
    );
    // Audit log row written.
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it("still rejects when useSandbox=true (sandbox still hits broker network via per-user creds)", async () => {
    const result = await placeLiveAutoOrderForUser({
      userId: "user_abc", symbol: "BTCUSD", side: "BUY", sizeUSD: 100, useSandbox: true,
    });
    expect(result.errorCode).toBe("customer_live_execution_disabled");
  });

  it("admin role bypasses the kill switch (proceeds past the gate)", async () => {
    nextRoleRow = { role: "admin" };
    const result = await placeLiveAutoOrderForUser({
      userId: "admin_xyz", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
    });
    // We don't assert success — downstream connection lookup will fail
    // (no row) and return `no_connection`. The point is that we got
    // PAST the customer kill-switch gate.
    expect(result.errorCode).not.toBe("customer_live_execution_disabled");
  });

  it("super-admin role bypasses the kill switch", async () => {
    nextRoleRow = { role: "super-admin" };
    const result = await placeLiveAutoOrderForUser({
      userId: "su_xyz", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
    });
    expect(result.errorCode).not.toBe("customer_live_execution_disabled");
  });

  it("flag explicitly enabled → non-admin proceeds past the gate", async () => {
    process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"] = "true";
    nextRoleRow = { role: "user" };
    const result = await placeLiveAutoOrderForUser({
      userId: "user_abc", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
    });
    expect(result.errorCode).not.toBe("customer_live_execution_disabled");
  });

  it("role lookup failure fails-closed (treated as non-operator)", async () => {
    nextRoleRow = undefined; // no row → operator=false → reject
    const result = await placeLiveAutoOrderForUser({
      userId: "ghost", symbol: "BTCUSD", side: "BUY", sizeUSD: 100,
    });
    expect(result.errorCode).toBe("customer_live_execution_disabled");
  });
});

describe("placeLiveCloseOrderForUser — customer kill switch (symmetric)", () => {
  const { placeLiveCloseOrderForUser } = liveUserExecution;

  beforeEach(() => {
    delete process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"];
    execStreamMock.emitEvent.mockClear();
    dbMock.insert.mockClear();
    nextRoleRow = { role: "user" };
  });

  it("rejects non-admin close with customer_live_execution_disabled when flag is off", async () => {
    const result = await placeLiveCloseOrderForUser({
      userId: "user_abc", symbol: "BTCUSD",
      openSide: "BUY", quantity: 0.01, exchange: "Kraken",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("customer_live_execution_disabled");
    expect(execStreamMock.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        gate: "customer_live_execution_disabled",
        details: expect.objectContaining({ leg: "close" }),
      }),
    );
  });

  it("admin bypasses close-side kill switch", async () => {
    nextRoleRow = { role: "admin" };
    const result = await placeLiveCloseOrderForUser({
      userId: "admin_xyz", symbol: "BTCUSD",
      openSide: "BUY", quantity: 0.01, exchange: "Kraken",
    });
    expect(result.errorCode).not.toBe("customer_live_execution_disabled");
  });

  it("sandbox close is still blocked for non-admin", async () => {
    const result = await placeLiveCloseOrderForUser({
      userId: "user_abc", symbol: "BTCUSD",
      openSide: "BUY", quantity: 0.01, exchange: "Binance", useSandbox: true,
    });
    expect(result.errorCode).toBe("customer_live_execution_disabled");
  });
});
