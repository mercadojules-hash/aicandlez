/**
 * finalizeClose — Phase 2 concurrency + reconciliation suite.
 *
 * Proves the lost-update race surfaced in the Phase 2 verification is fixed:
 * concurrent same-user closes settle the account atomically (SQL-side
 * increments inside a transaction) with no drift across `sim_accounts`,
 * `sim_trades`, and `sim_positions`.
 *
 * These are INTEGRATION tests — they exercise the real Postgres transaction
 * semantics that the fix depends on (a mocked db cannot prove atomicity). They
 * seed a uniquely-namespaced throwaway user, run real closes, assert no drift,
 * and clean up after themselves. Skipped automatically when DATABASE_URL is
 * absent (the db layer falls back to an in-memory mock there).
 *
 * Only the network/fee seams are mocked: getTicker (deterministic exit price)
 * and the fee policy (no platform fee), so the arithmetic is exact. All
 * positions are paper (no exchange) so no broker round-trips occur.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Deterministic exit prices per symbol. Entry is seeded at 100 so a BUY close
// at 110 realizes +10 on qty=1 (sizeUSD=100): cashDelta = 100 + 10 = 110,
// realizedDelta = +10, with paper (zero) fees and a skipped platform fee.
const EXIT_PRICE = 110;

vi.mock("../marketData.js", async () => {
  const actual = await vi.importActual<typeof import("../marketData.js")>("../marketData.js");
  return {
    ...actual,
    getTicker: vi.fn(async (symbol: string) => ({
      symbol,
      price: EXIT_PRICE,
      bid: EXIT_PRICE,
      ask: EXIT_PRICE,
      open24h: 100,
      high24h: EXIT_PRICE,
      low24h: 100,
      volume24h: 1_000_000,
      change24h: EXIT_PRICE - 100,
      changePercent24h: 10,
      lastUpdated: Date.now(),
    })),
  };
});

vi.mock("../feeLedger.js", async () => {
  const actual = await vi.importActual<typeof import("../feeLedger.js")>("../feeLedger.js");
  return {
    ...actual,
    // No platform fee → exact paper arithmetic.
    resolveFeePolicy: vi.fn(async () => ({ skip: true, rate: 0, reason: "test-exempt" })),
    recordPerformanceFee: vi.fn(async () => undefined),
  };
});

const dbMod = await import("@workspace/db");
const { db, pool, simAccountsTable, simPositionsTable, simTradesTable, usersTable } = dbMod;
const { eq } = await import("drizzle-orm");
const { closeUserPosition, getUserAccountSummary, finalizeClose, __clearRegistryForTests } =
  await import("../userSimRegistry.js");

const HAS_DB = !!process.env.DATABASE_URL;

// Per-close deltas with the mocked price + zero fees.
const ENTRY_PRICE = 100;
const QTY = 1;
const SIZE_USD = 100;
const CASH_DELTA_PER_CLOSE = SIZE_USD + (EXIT_PRICE - ENTRY_PRICE) * QTY; // 110
const REALIZED_DELTA_PER_CLOSE = (EXIT_PRICE - ENTRY_PRICE) * QTY;        // 10

const BASE_CASH = 100_000;

let suiteUserSeq = 0;
function freshUserId(): string {
  return `test-finalize-${Date.now()}-${process.pid}-${++suiteUserSeq}`;
}

const seededUserIds: string[] = [];

async function seedUser(userId: string, positions: Array<{ id: string; symbol: string }>) {
  seededUserIds.push(userId);
  await db.insert(usersTable).values({
    clerkUserId: userId,
    email: `${userId}@test.invalid`,
    role: "user",
  });
  await db.insert(simAccountsTable).values({
    userId,
    startingBalance: BASE_CASH,
    cashBalance: BASE_CASH,
    totalRealized: 0,
    totalTrades: 0,
  });
  for (const p of positions) {
    await db.insert(simPositionsTable).values({
      id: p.id,
      userId,
      symbol: p.symbol,
      side: "BUY",
      quantity: QTY,
      entryPrice: ENTRY_PRICE,
      entryTime: Date.now() - 60_000,
      sizeUSD: SIZE_USD,
    });
  }
}

async function dbAccount(userId: string) {
  const [row] = await db
    .select()
    .from(simAccountsTable)
    .where(eq(simAccountsTable.userId, userId))
    .limit(1);
  return row!;
}

async function countTrades(userId: string): Promise<number> {
  const rows = await db.select().from(simTradesTable).where(eq(simTradesTable.userId, userId));
  return rows.length;
}

async function countPositions(userId: string): Promise<number> {
  const rows = await db.select().from(simPositionsTable).where(eq(simPositionsTable.userId, userId));
  return rows.length;
}

afterAll(async () => {
  if (!HAS_DB) return;
  for (const userId of seededUserIds) {
    await db.delete(simTradesTable).where(eq(simTradesTable.userId, userId));
    await db.delete(simPositionsTable).where(eq(simPositionsTable.userId, userId));
    await db.delete(simAccountsTable).where(eq(simAccountsTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.clerkUserId, userId));
    __clearRegistryForTests(userId);
  }
  await pool?.end();
});

describe.skipIf(!HAS_DB)("finalizeClose — concurrency + reconciliation", () => {
  it("multiple simultaneous same-user/same-symbol closes do not drift the account", async () => {
    const N = 8;
    const userId = freshUserId();
    const positions = Array.from({ length: N }, (_, i) => ({
      id: `${userId}-pos-${i}`,
      symbol: "BTCUSD",
    }));
    await seedUser(userId, positions);
    __clearRegistryForTests(userId);

    // Fire all closes concurrently — the exact shape that lost an update before.
    const results = await Promise.all(
      positions.map((p) => closeUserPosition(userId, p.id, "TRAILING_STOP")),
    );

    const applied = results.filter((r) => r.success).length;
    expect(applied).toBe(N);

    const acct = await dbAccount(userId);
    expect(acct.cashBalance).toBeCloseTo(BASE_CASH + N * CASH_DELTA_PER_CLOSE, 2);
    expect(acct.totalRealized).toBeCloseTo(N * REALIZED_DELTA_PER_CLOSE, 2);
    expect(acct.totalTrades).toBe(N);

    expect(await countTrades(userId)).toBe(N);
    expect(await countPositions(userId)).toBe(0);
  });

  it("multiple simultaneous closes across different symbols do not drift", async () => {
    const symbols = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ADAUSD"];
    const userId = freshUserId();
    const positions = symbols.map((symbol, i) => ({
      id: `${userId}-pos-${i}`,
      symbol,
    }));
    await seedUser(userId, positions);
    __clearRegistryForTests(userId);

    const results = await Promise.all(
      positions.map((p) => closeUserPosition(userId, p.id, "TRAILING_STOP")),
    );
    expect(results.filter((r) => r.success).length).toBe(symbols.length);

    const acct = await dbAccount(userId);
    expect(acct.cashBalance).toBeCloseTo(BASE_CASH + symbols.length * CASH_DELTA_PER_CLOSE, 2);
    expect(acct.totalRealized).toBeCloseTo(symbols.length * REALIZED_DELTA_PER_CLOSE, 2);
    expect(acct.totalTrades).toBe(symbols.length);
    expect(await countTrades(userId)).toBe(symbols.length);
    expect(await countPositions(userId)).toBe(0);
  });

  it("a duplicate close of the same position is idempotent (no double credit)", async () => {
    const userId = freshUserId();
    const positionId = `${userId}-pos-dup`;
    await seedUser(userId, [{ id: positionId, symbol: "BTCUSD" }]);
    __clearRegistryForTests(userId);

    // Two concurrent closes of the SAME position id.
    const [a, b] = await Promise.all([
      closeUserPosition(userId, positionId, "TRAILING_STOP"),
      closeUserPosition(userId, positionId, "TRAILING_STOP"),
    ]);

    const successes = [a, b].filter((r) => r.success).length;
    expect(successes).toBe(1); // exactly one wins; the other is the idempotent skip

    const acct = await dbAccount(userId);
    expect(acct.cashBalance).toBeCloseTo(BASE_CASH + CASH_DELTA_PER_CLOSE, 2);
    expect(acct.totalRealized).toBeCloseTo(REALIZED_DELTA_PER_CLOSE, 2);
    expect(acct.totalTrades).toBe(1);
    expect(await countTrades(userId)).toBe(1);
    expect(await countPositions(userId)).toBe(0);
  });

  it("a single full close produces exact, drift-free settlement (parity)", async () => {
    const userId = freshUserId();
    const positionId = `${userId}-pos-single`;
    await seedUser(userId, [{ id: positionId, symbol: "BTCUSD" }]);
    __clearRegistryForTests(userId);

    const res = await closeUserPosition(userId, positionId, "TRAILING_STOP");
    expect(res.success).toBe(true);

    const acct = await dbAccount(userId);
    // Exact (not just close-to) arithmetic: base + one full close, zero fees.
    expect(acct.cashBalance).toBeCloseTo(BASE_CASH + CASH_DELTA_PER_CLOSE, 6);
    expect(acct.totalRealized).toBeCloseTo(REALIZED_DELTA_PER_CLOSE, 6);
    expect(acct.totalTrades).toBe(1);

    const [tradeRow] = await db
      .select()
      .from(simTradesTable)
      .where(eq(simTradesTable.userId, userId));
    expect(tradeRow).toBeDefined();
    expect(tradeRow!.symbol).toBe("BTCUSD");
    expect(tradeRow!.side).toBe("BUY");
    expect(tradeRow!.realizedPnL).toBeCloseTo(REALIZED_DELTA_PER_CLOSE, 6);
    expect(await countPositions(userId)).toBe(0);
  });

  it("a duplicate partial close of the same position is idempotent (optimistic quantity gate)", async () => {
    // Partial closes are driven only by live broker partial fills inside
    // closeUserPosition, so the optimistic-quantity gate is exercised directly
    // against finalizeClose here: two concurrent partial settlements that both
    // expect the same pre-close quantity (10) and reduce to 6. Exactly one may
    // win; the other's WHERE predicate (quantity = 10) no longer matches once
    // the first commits → idempotent skip (no second trade row, no double
    // credit).
    const userId = freshUserId();
    const positionId = `${userId}-pos-partial-dup`;
    seededUserIds.push(userId);
    await db.insert(usersTable).values({
      clerkUserId: userId,
      email: `${userId}@test.invalid`,
      role: "user",
    });
    await db.insert(simAccountsTable).values({
      userId,
      startingBalance: BASE_CASH,
      cashBalance: BASE_CASH,
      totalRealized: 0,
      totalTrades: 0,
    });
    await db.insert(simPositionsTable).values({
      id: positionId,
      userId,
      symbol: "BTCUSD",
      side: "BUY",
      quantity: 10,
      entryPrice: ENTRY_PRICE,
      entryTime: Date.now() - 60_000,
      sizeUSD: 1000,
    });

    const mkTrade = (id: string): import("../userSimRegistry.js").UserSimTrade => ({
      id,
      userId,
      symbol: "BTCUSD",
      side: "BUY",
      quantity: 4,
      entryPrice: ENTRY_PRICE,
      exitPrice: EXIT_PRICE,
      entryTime: Date.now() - 60_000,
      exitTime: Date.now(),
      sizeUSD: 400,
      realizedPnL: (EXIT_PRICE - ENTRY_PRICE) * 4,
      realizedPnLPct: 10,
      durationMs: 60_000,
      closeReason: "MANUAL_PARTIAL",
    });

    const partial = { quantity: 6, sizeUSD: 600, entryFeeBroker: null, expectedQuantity: 10 };
    const [a, b] = await Promise.all([
      finalizeClose({
        userId,
        positionId,
        trade: mkTrade(`${positionId}-t1`),
        cashDelta: 400 + (EXIT_PRICE - ENTRY_PRICE) * 4,
        realizedDelta: (EXIT_PRICE - ENTRY_PRICE) * 4,
        isPartial: true,
        partial,
      }),
      finalizeClose({
        userId,
        positionId,
        trade: mkTrade(`${positionId}-t2`),
        cashDelta: 400 + (EXIT_PRICE - ENTRY_PRICE) * 4,
        realizedDelta: (EXIT_PRICE - ENTRY_PRICE) * 4,
        isPartial: true,
        partial,
      }),
    ]);
    const applied = [a, b].filter((r) => r.applied).length;
    expect(applied).toBe(1); // optimistic gate admits exactly one

    // Exactly one trade row, position reduced by exactly one 4-unit slice.
    expect(await countTrades(userId)).toBe(1);
    const [posRow] = await db
      .select()
      .from(simPositionsTable)
      .where(eq(simPositionsTable.id, positionId));
    expect(posRow).toBeDefined();
    expect(posRow!.quantity).toBeCloseTo(6, 6);

    const acct = await dbAccount(userId);
    expect(acct.totalTrades).toBe(1);
    expect(acct.totalRealized).toBeCloseTo((EXIT_PRICE - ENTRY_PRICE) * 4, 6);
  });

  it("recovers correct totals after a simulated restart (registry evicted → reload from DB)", async () => {
    const N = 4;
    const userId = freshUserId();
    const positions = Array.from({ length: N }, (_, i) => ({
      id: `${userId}-pos-${i}`,
      symbol: "ETHUSD",
    }));
    await seedUser(userId, positions);
    __clearRegistryForTests(userId);

    await Promise.all(positions.map((p) => closeUserPosition(userId, p.id, "TRAILING_STOP")));

    const acctBefore = await dbAccount(userId);

    // Simulate a process restart: drop cached state, force a DB rehydrate.
    __clearRegistryForTests(userId);
    const summary = await getUserAccountSummary(userId);

    // In-memory (rehydrated) state must match durable DB truth — no drift.
    expect(summary.balance).toBeCloseTo(acctBefore.cashBalance, 2);
    expect(summary.totalRealized).toBeCloseTo(acctBefore.totalRealized, 2);
    expect(summary.totalTrades).toBe(acctBefore.totalTrades);
    expect(acctBefore.totalTrades).toBe(N);
    expect(await countPositions(userId)).toBe(0);
  });
});
