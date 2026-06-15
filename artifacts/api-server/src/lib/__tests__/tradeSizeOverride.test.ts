import { describe, expect, it } from "vitest";
import { getTradeSizeOverrideUsd } from "../tradeSizeOverride.js";

describe("getTradeSizeOverrideUsd", () => {
  it("uses the approved $600 default when unset or blank", () => {
    expect(getTradeSizeOverrideUsd({})).toBe(600);
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "" })).toBe(600);
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "   " })).toBe(600);
  });

  it("parses a positive dollar override", () => {
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "600" })).toBe(600);
  });

  it("falls back to $600 for invalid and non-positive values", () => {
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "0" })).toBe(600);
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "-1" })).toBe(600);
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "abc" })).toBe(600);
  });
});
