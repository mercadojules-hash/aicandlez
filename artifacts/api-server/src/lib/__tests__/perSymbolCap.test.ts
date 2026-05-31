import { describe, it, expect, afterEach } from "vitest";
import { getMaxPositionsPerSymbol } from "../tradingLoop.js";

// Per-symbol diversification cap is an ENTRY-gate config getter. It must be
// configurable via env, default to 1, and treat 0 as "disabled" (unlimited).
// These cases lock the contract so the default can never be silently hardcoded
// away and invalid values always fail safe to the default.
const KEY = "MAX_POSITIONS_PER_SYMBOL";

describe("getMaxPositionsPerSymbol — configurable entry-gate ceiling", () => {
  const original = process.env[KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  const set = (v: string | undefined) => {
    if (v === undefined) delete process.env[KEY];
    else process.env[KEY] = v;
  };

  it("defaults to 1 when unset", () => {
    set(undefined);
    expect(getMaxPositionsPerSymbol()).toBe(1);
  });

  it("defaults to 1 when empty string", () => {
    set("");
    expect(getMaxPositionsPerSymbol()).toBe(1);
  });

  it("returns 0 (disabled / unlimited) when set to 0", () => {
    set("0");
    expect(getMaxPositionsPerSymbol()).toBe(0);
  });

  it("honors an explicit positive integer", () => {
    set("1");
    expect(getMaxPositionsPerSymbol()).toBe(1);
    set("2");
    expect(getMaxPositionsPerSymbol()).toBe(2);
    set("5");
    expect(getMaxPositionsPerSymbol()).toBe(5);
  });

  it("floors fractional values", () => {
    set("2.9");
    expect(getMaxPositionsPerSymbol()).toBe(2);
  });

  it("fails safe to default on invalid input", () => {
    set("abc");
    expect(getMaxPositionsPerSymbol()).toBe(1);
    set("-1");
    expect(getMaxPositionsPerSymbol()).toBe(1);
    set("NaN");
    expect(getMaxPositionsPerSymbol()).toBe(1);
  });
});
