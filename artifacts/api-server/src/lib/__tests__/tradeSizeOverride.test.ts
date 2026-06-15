import { describe, expect, it } from "vitest";
import { getTradeSizeOverrideUsd } from "../tradeSizeOverride.js";

describe("getTradeSizeOverrideUsd", () => {
  it("returns null when unset or blank", () => {
    expect(getTradeSizeOverrideUsd({})).toBeNull();
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "" })).toBeNull();
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "   " })).toBeNull();
  });

  it("parses a positive dollar override", () => {
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "600" })).toBe(600);
  });

  it("rejects invalid and non-positive values", () => {
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "0" })).toBeNull();
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "-1" })).toBeNull();
    expect(getTradeSizeOverrideUsd({ TRADE_SIZE_OVERRIDE_USD: "abc" })).toBeNull();
  });
});
