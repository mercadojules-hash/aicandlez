import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildVerdict } from "../tradeLimitEngine.js";
import {
  UNLIMITED_TRADE_LIMIT_CAP,
  PLAN_DEFAULT_TRADE_LIMIT_CAP,
} from "@workspace/db";

// ── DB mock for the override-expiry suite ────────────────────────────────────
// `resolveCap` now runs:
//   db.select(...).from(users).leftJoin(user_trade_limits).where(...).limit(1)
// The mock chain mirrors that shape and returns a controllable joined row
// per test ({ plan, capTier, usePlanDefault, overrideExpiresAt }).
type MockRow = {
  plan:              string | null;
  capTier:           number | null;
  usePlanDefault:    boolean | null;
  overrideExpiresAt: Date | null;
};
let mockJoinedRow: MockRow | null = null;

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  const chain = {
    from:     () => chain,
    leftJoin: () => chain,
    where:    () => chain,
    limit:    async () => (mockJoinedRow ? [mockJoinedRow] : []),
  };
  return {
    ...actual,
    db: { select: () => chain },
  };
});

describe("tradeLimitEngine.buildVerdict", () => {
  const NOW = 1_700_000_000_000;
  const baseArgs = { source: "plan-default" as const, planDefaultCap: 50 };

  it("returns ok with full remaining when no opens in window", () => {
    const v = buildVerdict({
      ...baseArgs,
      userId: "u1", used24h: 0, capTier: 50,
      oldestOpenEpochMs: null, nowMs: NOW,
    });
    expect(v.blocked).toBe(false);
    expect(v.reason).toBe("ok");
    expect(v.remaining).toBe(50);
    expect(v.windowResetsAt).toBe(NOW);
    expect(v.source).toBe("plan-default");
    expect(v.planDefaultCap).toBe(50);
  });

  it("computes remaining as capTier - used", () => {
    const v = buildVerdict({
      ...baseArgs,
      userId: "u1", used24h: 17, capTier: 50,
      oldestOpenEpochMs: NOW - 3_600_000, nowMs: NOW,
    });
    expect(v.remaining).toBe(33);
    expect(v.blocked).toBe(false);
  });

  it("blocks at exactly the cap", () => {
    const v = buildVerdict({
      ...baseArgs,
      userId: "u1", used24h: 50, capTier: 50,
      oldestOpenEpochMs: NOW - 10_000, nowMs: NOW,
    });
    expect(v.blocked).toBe(true);
    expect(v.reason).toBe("trade_limit_exhausted");
    expect(v.remaining).toBe(0);
  });

  it("blocks above the cap (defense in depth)", () => {
    const v = buildVerdict({
      ...baseArgs,
      userId: "u1", used24h: 51, capTier: 50,
      oldestOpenEpochMs: NOW - 10_000, nowMs: NOW,
    });
    expect(v.blocked).toBe(true);
    expect(v.remaining).toBe(0);
  });

  it("never blocks when capTier is the unlimited sentinel", () => {
    const v = buildVerdict({
      ...baseArgs,
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
      ...baseArgs,
      userId: "u1", used24h: 3, capTier: 50,
      oldestOpenEpochMs: oldestOpen, nowMs: NOW,
    });
    expect(v.windowResetsAt).toBe(oldestOpen + 24 * 60 * 60 * 1000);
  });

  it("respects elevated cap tiers (100, 200) with operator-override source", () => {
    const a = buildVerdict({
      userId: "u1", used24h: 75, capTier: 100,
      source: "operator-override", planDefaultCap: 50,
      oldestOpenEpochMs: NOW, nowMs: NOW,
    });
    expect(a.blocked).toBe(false);
    expect(a.remaining).toBe(25);
    expect(a.source).toBe("operator-override");

    const b = buildVerdict({
      userId: "u1", used24h: 150, capTier: 200,
      source: "operator-override", planDefaultCap: 100,
      oldestOpenEpochMs: NOW, nowMs: NOW,
    });
    expect(b.blocked).toBe(false);
    expect(b.remaining).toBe(50);
  });
});

describe("tradeLimitEngine.resolveCap (plan default + operator override)", () => {
  beforeEach(async () => {
    mockJoinedRow = null;
    const mod = await import("../tradeLimitEngine.js");
    mod.__resetTradeLimitCacheForTests();
  });

  it("starter plan with no override row → plan default = 100", async () => {
    mockJoinedRow = { plan: "starter", capTier: null, usePlanDefault: null, overrideExpiresAt: null };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-starter-noop");
    expect(v.capTier).toBe(PLAN_DEFAULT_TRADE_LIMIT_CAP.starter);
    expect(v.source).toBe("plan-default");
    expect(v.planDefaultCap).toBe(100);
  });

  it("pro plan with usePlanDefault=true → plan default = 200 (ignores capTier)", async () => {
    mockJoinedRow = { plan: "pro", capTier: 50, usePlanDefault: true, overrideExpiresAt: null };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-pro-default");
    expect(v.capTier).toBe(200);
    expect(v.source).toBe("plan-default");
  });

  it("operator override (usePlanDefault=false) wins over plan default", async () => {
    mockJoinedRow = { plan: "starter", capTier: 200, usePlanDefault: false, overrideExpiresAt: null };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-starter-overridden");
    expect(v.capTier).toBe(200);
    expect(v.source).toBe("operator-override");
    expect(v.planDefaultCap).toBe(100);
  });

  it("UNLIMITED override propagates through verdict", async () => {
    mockJoinedRow = { plan: "free", capTier: -1, usePlanDefault: false, overrideExpiresAt: null };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-unlimited");
    expect(v.capTier).toBe(UNLIMITED_TRADE_LIMIT_CAP);
    expect(v.source).toBe("operator-override");
    expect(v.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("expired override falls back to plan default", async () => {
    mockJoinedRow = {
      plan:              "pro",
      capTier:           -1,
      usePlanDefault:    false,
      overrideExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // -1h
    };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-override-expired");
    expect(v.capTier).toBe(PLAN_DEFAULT_TRADE_LIMIT_CAP.pro);
    expect(v.source).toBe("plan-default");
  });

  it("unknown / null plan falls back to FREE plan default", async () => {
    mockJoinedRow = { plan: null, capTier: null, usePlanDefault: null, overrideExpiresAt: null };
    const { getTradeLimitVerdict } = await import("../tradeLimitEngine.js");
    const v = await getTradeLimitVerdict("u-no-plan");
    expect(v.capTier).toBe(PLAN_DEFAULT_TRADE_LIMIT_CAP.free);
  });
});
