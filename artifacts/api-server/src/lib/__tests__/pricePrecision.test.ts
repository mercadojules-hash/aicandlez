import { describe, expect, it } from "vitest";
import { roundOptionalPrice, roundPrice } from "../pricePrecision.js";

describe("price precision", () => {
  it("preserves sub-cent meme coin entry prices", () => {
    expect(roundPrice(0.000003)).toBe(0.000003);
    expect(roundPrice(0.00000499)).toBe(0.00000499);
  });

  it("keeps TP/SL thresholds nonzero for sub-cent prices", () => {
    const entry = roundPrice(0.000003);
    const stopLoss = roundPrice(entry * 0.98);
    const takeProfit = roundPrice(entry * 1.04);

    expect(stopLoss).toBe(0.00000294);
    expect(takeProfit).toBe(0.00000312);
    expect(roundOptionalPrice(null)).toBeNull();
  });

  it("prevents flat PEPE fills from being recorded as full-notional profit", () => {
    const entryPrice = roundPrice(0.000003);
    const exitPrice = roundPrice(0.000003);
    const quantity = 200_000_000;
    const realizedPnL = (exitPrice - entryPrice) * quantity;

    expect(realizedPnL).toBe(0);
  });
});
