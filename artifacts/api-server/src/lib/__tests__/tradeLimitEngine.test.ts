import { describe, it, expect } from "vitest";
import { buildVerdict } from "../tradeLimitEngine.js";
import { UNLIMITED_TRADE_LIMIT_CAP } from "@workspace/db";

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
