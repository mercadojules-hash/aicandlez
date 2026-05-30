import { describe, it, expect } from "vitest";
import {
  evaluateLiquidityGuard,
  FEE_BUFFER_PCT,
  LIQUIDITY_SAFETY_CUSHION_USD,
  PLAN_MAX_OPEN_POSITIONS,
} from "../liquidityGuard.js";

// Cash floor for funding `slots` entries at `size` with the fee buffer + cushion.
const required = (size: number, slots: number) =>
  size * slots * (1 + FEE_BUFFER_PCT) + LIQUIDITY_SAFETY_CUSHION_USD;

describe("evaluateLiquidityGuard — normal (tier-bounded) accounts", () => {
  it("blocks at plan max-open-positions (Gate A)", () => {
    const v = evaluateLiquidityGuard({
      plan: "pro",                         // max 6
      openLiveCount: PLAN_MAX_OPEN_POSITIONS.pro,
      tradeSizeUsd: 10,
      availableCashUsd: 10_000,
    });
    expect(v.ok).toBe(false);
    expect(v.reasonCode).toBe("plan_max_positions_reached");
    expect(v.remainingSlots).toBe(0);
  });

  it("blocks on liquidity cushion when cash < floor for remaining slots (Gate B)", () => {
    const v = evaluateLiquidityGuard({
      plan: "pro",
      openLiveCount: PLAN_MAX_OPEN_POSITIONS.pro - 1, // 1 slot left
      tradeSizeUsd: 10,
      availableCashUsd: 5,                             // < required(10, 1)
    });
    expect(v.ok).toBe(false);
    expect(v.reasonCode).toBe("liquidity_protected");
    expect(v.requiredCashUsd).toBeCloseTo(required(10, 1), 6);
  });

  it("passes when within plan capacity and above the cushion", () => {
    const v = evaluateLiquidityGuard({
      plan: "pro",
      openLiveCount: PLAN_MAX_OPEN_POSITIONS.pro - 1,
      tradeSizeUsd: 10,
      availableCashUsd: 100,
    });
    expect(v.ok).toBe(true);
    expect(v.reasonCode).toBe("ok");
    expect(v.remainingSlots).toBe(1);
  });

  it("free plan is always blocked at Gate A (cap = 0)", () => {
    const v = evaluateLiquidityGuard({
      plan: "free",
      openLiveCount: 0,
      tradeSizeUsd: 10,
      availableCashUsd: 10_000,
    });
    expect(v.ok).toBe(false);
    expect(v.reasonCode).toBe("plan_max_positions_reached");
  });
});

describe("evaluateLiquidityGuard — entitlement-exempt (unlimitedPositions)", () => {
  it("skips plan max-open cap even far past the tier ceiling", () => {
    const v = evaluateLiquidityGuard({
      plan: "starter",            // tier max 3
      openLiveCount: 50,          // way over tier
      tradeSizeUsd: 10,
      availableCashUsd: 100,      // > required(10, 1)
      unlimitedPositions: true,
    });
    expect(v.ok).toBe(true);
    expect(v.reasonCode).toBe("ok");
    // Unlimited sentinel echoes for UI / telemetry.
    expect(v.planMaxOpen).toBe(-1);
    expect(v.remainingSlots).toBe(-1);
  });

  it("overrides the free-plan zero cap", () => {
    const v = evaluateLiquidityGuard({
      plan: "free",
      openLiveCount: 0,
      tradeSizeUsd: 10,
      availableCashUsd: 100,
      unlimitedPositions: true,
    });
    expect(v.ok).toBe(true);
    expect(v.reasonCode).toBe("ok");
  });

  it("STILL enforces the liquidity cushion (sized to the single pending entry)", () => {
    const v = evaluateLiquidityGuard({
      plan: "starter",
      openLiveCount: 50,
      tradeSizeUsd: 10,
      availableCashUsd: 5,        // < required(10, 1)
      unlimitedPositions: true,
    });
    expect(v.ok).toBe(false);
    expect(v.reasonCode).toBe("liquidity_protected");
    // Cushion funds ONE entry, not an unbounded slot count.
    expect(v.requiredCashUsd).toBeCloseTo(required(10, 1), 6);
    expect(v.planMaxOpen).toBe(-1);
    expect(v.remainingSlots).toBe(-1);
  });
});
