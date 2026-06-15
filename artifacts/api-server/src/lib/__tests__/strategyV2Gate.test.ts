import { describe, expect, it } from "vitest";
import type { SignalFactor } from "../aiReasoning.js";
import { evaluateStrategyV2Gate, type StrategyV2DecisionInput } from "../strategyV2Gate.js";

function factor(name: string, signal: SignalFactor["signal"], displayValue: string): SignalFactor {
  return {
    name,
    signal,
    displayValue,
    score: 1,
    weight: "+1.0",
    note: "",
  };
}

function decision(args: {
  trend?: string;
  trendSignal?: SignalFactor["signal"];
  emaSignal?: SignalFactor["signal"];
  rsi?: number;
  momentum?: number;
} = {}): StrategyV2DecisionInput {
  const {
    trend = "Strong Bullish",
    trendSignal = "bullish",
    emaSignal = "bullish",
    rsi = 65,
    momentum = 0.5,
  } = args;

  return {
    signals: [
      factor("Trend", trendSignal, trend),
      factor("EMA Crossover", emaSignal, emaSignal === "bullish" ? "EMA9 > EMA21" : "EMA9 < EMA21"),
      factor("RSI (14)", rsi >= 50 ? "bullish" : "bearish", rsi.toFixed(1)),
    ],
    momentum: { change5Pct: momentum },
  };
}

function decide(args: Partial<Parameters<typeof evaluateStrategyV2Gate>[0]> = {}) {
  return evaluateStrategyV2Gate({
    enabled: true,
    symbol: "BTCUSD",
    effectiveAction: "BUY",
    fast: decision(),
    slow: decision({ trend: "Moderate Bullish", rsi: 68 }),
    fastSnap: { rsi: 65, ema9: 109, ema21: 100 },
    slowSnap: { rsi: 68, ema9: 205, ema21: 200 },
    blocklist: [],
    ...args,
  });
}

describe("evaluateStrategyV2Gate", () => {
  it("blocks shorts", () => {
    const d = decide({ effectiveAction: "SELL" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_shorts_disabled");
  });

  it("blocks default blocklisted symbols", () => {
    const d = decide({ symbol: "linkusd", blocklist: undefined });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_symbol_blocked");
  });

  it("blocks RSI below 60", () => {
    const d = decide({ fastSnap: { rsi: 59.9, ema9: 109, ema21: 100 } });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_rsi_out_of_range");
  });

  it("allows high-composite continuation when one timeframe RSI is below 60 but above continuation floor", () => {
    const d = decide({
      compositeScore: 65,
      fastSnap: { rsi: 76.9, ema9: 109, ema21: 100 },
      slowSnap: { rsi: 48.9, ema9: 205, ema21: 200 },
    });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBeNull();
  });

  it("keeps low-composite continuation blocked below the original RSI floor", () => {
    const d = decide({
      compositeScore: 64.9,
      fastSnap: { rsi: 76.9, ema9: 109, ema21: 100 },
      slowSnap: { rsi: 48.9, ema9: 205, ema21: 200 },
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_rsi_out_of_range");
  });

  it("blocks high-composite continuation when both timeframes are below the original RSI band", () => {
    const d = decide({
      compositeScore: 80,
      fastSnap: { rsi: 55, ema9: 109, ema21: 100 },
      slowSnap: { rsi: 48, ema9: 205, ema21: 200 },
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_rsi_out_of_range");
  });

  it("blocks RSI above 82", () => {
    const d = decide({ compositeScore: 90, slowSnap: { rsi: 82.1, ema9: 205, ema21: 200 } });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_rsi_out_of_range");
  });

  it("blocks EMA not aligned", () => {
    const d = decide({ fastSnap: { rsi: 65, ema9: 99, ema21: 100 } });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_ema_not_aligned");
  });

  it("blocks non-strong bullish trend", () => {
    const d = decide({ fast: decision({ trend: "Weak Bullish" }) });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_not_bullish");
  });

  it("blocks non-positive 5-candle momentum", () => {
    const d = decide({ fast: decision({ momentum: 0 }) });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("strategy_v2_momentum_not_positive");
  });

  it("allows valid bullish BUY entries", () => {
    const d = decide();
    expect(d.allowed).toBe(true);
    expect(d.reason).toBeNull();
  });

  it("preserves existing behavior when V2 is disabled", () => {
    const d = decide({
      enabled: false,
      symbol: "LINKUSD",
      effectiveAction: "SELL",
      fast: decision({ trendSignal: "bearish", trend: "Strong Bearish", emaSignal: "bearish", rsi: 90, momentum: -1 }),
      fastSnap: { rsi: 90, ema9: 99, ema21: 100 },
    });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBeNull();
  });
});
