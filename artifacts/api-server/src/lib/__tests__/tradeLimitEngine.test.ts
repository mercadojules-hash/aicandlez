import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildVerdict } from "../tradeLimitEngine.js";
import { UNLIMITED_TRADE_LIMIT_CAP, DEFAULT_TRADE_LIMIT_CAP } from "@workspace/db";

// ── DB mock for the override-expiry suite ────────────────────────────────────
// `resolveCap` runs `db.select(...).from(userTradeLimitsTable).where(...).limit(1)`.
// We mock the chain to return a controllable row per test.
let mockLimitRow: { capTier: number; overrideExpiresAt: Date | null } | null = null;

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => (mockLimitRow ? [mockLimitRow] : []),
  };
  return {
    ...actual,
    db: { select: () => chain },
  };
});

describe("tradeLimitEngine.buildVerdict", () => {
  const NOW = 1_700_000_000_000;

  it("returns ok with full remaining when no opens in window", () => {
    const v = buildVerdict({
      userId: "u1", used24h: 0, capTier: 50,
      oldestOpenEpochMs: null, nowMs: NOW,
    });
    expect(v.blocked).toBe(false);
    expect(v.reason).toBe("ok");
    expect(v.remaining).toBe(50);
    expect(v.windowResetsAt).toBe(NOW);
  });

  it("computes remaining as capTier - used", () => {
    const v = buildVerdict({
      userId: "u1", used24h: 17, capTier: 50,
      oldestOpenEpochMs: NOW - 3_600_000, nowMs: NOW,
    });
    expect(v.remaining).toBe(33);
    expect(v.blocked).toBe(false);
  });

  it("blocks at exactly the cap", () => {
    const v = buildVerdict({
      userId: "u1", used24h: 50, capTier: 50,
      oldestOpenEpochMs: NOW - 10_000, nowMs: NOW,
    });
    expect(v.blocked).toBe(true);
    expect(v.reason).toBe("trade_limit_exhausted");
    expect(v.remaining).toBe(0);
  });

  it("blocks above the cap (defense in depth)", () => {
    const v = buildVerdict({
      userId: "u1", used24h: 51, capTier: 50,
      oldestOpenEpochMs: NOW - 10_000, nowMs: NOW,
    });
    expect(v.blocked).toBe(true);
    expect(v.remaining).toBe(0);
  });

  it("never blocks when capTier is the unlimited sentinel", () => {
    const v = buildVerdict({
      userId: "u1", used24h: 9_999, capTier: UNLIMITED_TRADE_LIMIT_CAP,
      oldestOpenEpochMs: NOW - 1_000, nowMs: NOW,
    });
    expect(v.blocked).toBe(false);
    expect(v.remaining).toBe(Number.POSITIVE_INFINITY);
    expect(v.reason).toBe("ok");
  });

  it("reports windowResetsAt = oldestOpen + 24h", () => {
    const oldestOpen = NOW - 6 * 60 * 60 * 1000; // 6h ago
    const v = buildVerdict({
      userId: "u1", used24h: 3, capTier: 50,
      oldestOpenEpochMs: oldestOpen, nowMs: NOW,
    });
    expect(v.windowResetsAt).toBe(oldestOpen + 24 * 60 * 60 * 1000);
  });

  it("respects elevated cap tiers (100, 200)", () => {
    const a = buildVerdict({ userId: "u1", used24h: 75, capTier: 100, oldestOpenEpochMs: NOW, nowMs: NOW });
    expect(a.blocked).toBe(false);
    expect(a.remaining).toBe(25);

    const b = buildVerdict({ userId: "u1", used24h: 150, capTier: 200, oldestOpenEpochMs: NOW, nowMs: NOW });
    expect(b.blocked).toBe(false);
    expect(b.remaining).toBe(50);
  });
});

describe("tradeLimitEngine override expiry (resolveCap)", () => {
  beforeEach(async () => {
    mockLimitRow = null;
    const mod = await import("../tradeLimitEngine.js");
    mod.__resetTradeLimitCacheForTests();
  });

  it("honors an unexpired override cap", async () => {
    mockLimitRow = {
      capTier:           200,
      overrideExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // +1h
    };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-override-unexpired");
    expect(v.capTier).toBe(200);
  });

  it("falls back to default cap when override is expired", async () => {
    mockLimitRow = {
      capTier:           200,
      overrideExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // -1h
    };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-override-expired");
    expect(v.capTier).toBe(DEFAULT_TRADE_LIMIT_CAP);
  });

  it("treats a null overrideExpiresAt as a permanent (non-expiring) cap", async () => {
    mockLimitRow = { capTier: 100, overrideExpiresAt: null };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-permanent");
    expect(v.capTier).toBe(100);
  });

  it("returns default cap when no row exists for the user", async () => {
    mockLimitRow = null;
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-no-row");
    expect(v.capTier).toBe(DEFAULT_TRADE_LIMIT_CAP);
  });
});
