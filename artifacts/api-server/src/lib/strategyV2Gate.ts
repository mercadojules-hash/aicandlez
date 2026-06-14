import type { Decision, MomentumResult, SignalFactor } from "./aiReasoning.js";

export const STRATEGY_V2_DEFAULT_SYMBOL_BLOCKLIST = [
  "LINKUSD",
  "AAVEUSD",
  "AVAXUSD",
  "UNIUSD",
  "ADAUSD",
  "ETCUSD",
] as const;

export const STRATEGY_V2_RSI_MIN = 60;
export const STRATEGY_V2_RSI_MAX = 82;

export type StrategyV2BlockReason =
  | "strategy_v2_shorts_disabled"
  | "strategy_v2_symbol_blocked"
  | "strategy_v2_not_bullish"
  | "strategy_v2_ema_not_aligned"
  | "strategy_v2_rsi_out_of_range"
  | "strategy_v2_momentum_not_positive";

export interface StrategyV2DecisionInput {
  signals: SignalFactor[];
  momentum: Pick<MomentumResult, "change5Pct">;
}

export interface StrategyV2SnapshotInput {
  rsi: number;
  ema9: number;
  ema21: number;
}

export interface StrategyV2GateInput {
  enabled: boolean;
  symbol: string;
  effectiveAction: Decision;
  fast: StrategyV2DecisionInput;
  slow: StrategyV2DecisionInput;
  fastSnap?: StrategyV2SnapshotInput;
  slowSnap?: StrategyV2SnapshotInput;
  blocklist?: Iterable<string>;
}

export interface StrategyV2GateDecision {
  allowed: boolean;
  reason: StrategyV2BlockReason | null;
}

export interface StrategyV2Diagnostics {
  executions: number;
  blocks: {
    sell: number;
    symbol: number;
    rsi: number;
    ema: number;
    trend: number;
    momentum: number;
  };
}

const diagnostics: StrategyV2Diagnostics = {
  executions: 0,
  blocks: {
    sell: 0,
    symbol: 0,
    rsi: 0,
    ema: 0,
    trend: 0,
    momentum: 0,
  },
};

export function isStrategyV2Enabled(): boolean {
  return process.env.STRATEGY_V2_ENABLED === "true";
}

export function getStrategyV2SymbolBlocklist(): Set<string> {
  const raw = process.env.STRATEGY_V2_SYMBOL_BLOCKLIST ??
    STRATEGY_V2_DEFAULT_SYMBOL_BLOCKLIST.join(",");
  return parseStrategyV2SymbolBlocklist(raw);
}

export function parseStrategyV2SymbolBlocklist(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => normalizeSymbol(s))
      .filter((s) => s.length > 0),
  );
}

export function evaluateStrategyV2Gate(input: StrategyV2GateInput): StrategyV2GateDecision {
  diagnostics.executions++;

  if (!input.enabled || input.effectiveAction === "HOLD") {
    return allow();
  }

  if (input.effectiveAction === "SELL") {
    return block("strategy_v2_shorts_disabled");
  }

  const blocklist = input.blocklist ? normalizeBlocklist(input.blocklist) : getStrategyV2SymbolBlocklist();
  if (blocklist.has(normalizeSymbol(input.symbol))) {
    return block("strategy_v2_symbol_blocked");
  }

  if (!hasStrongBullishTrend(input.fast) || !hasStrongBullishTrend(input.slow)) {
    return block("strategy_v2_not_bullish");
  }

  if (!hasBullishEmaAlignment(input.fast, input.fastSnap) || !hasBullishEmaAlignment(input.slow, input.slowSnap)) {
    return block("strategy_v2_ema_not_aligned");
  }

  if (!rsiInRange(readRsi(input.fast, input.fastSnap)) || !rsiInRange(readRsi(input.slow, input.slowSnap))) {
    return block("strategy_v2_rsi_out_of_range");
  }

  if (input.fast.momentum.change5Pct <= 0 || input.slow.momentum.change5Pct <= 0) {
    return block("strategy_v2_momentum_not_positive");
  }

  return allow();
}

export function getStrategyV2Diagnostics(): StrategyV2Diagnostics {
  return {
    executions: diagnostics.executions,
    blocks: { ...diagnostics.blocks },
  };
}

function allow(): StrategyV2GateDecision {
  return { allowed: true, reason: null };
}

function block(reason: StrategyV2BlockReason): StrategyV2GateDecision {
  switch (reason) {
    case "strategy_v2_shorts_disabled":
      diagnostics.blocks.sell++;
      break;
    case "strategy_v2_symbol_blocked":
      diagnostics.blocks.symbol++;
      break;
    case "strategy_v2_rsi_out_of_range":
      diagnostics.blocks.rsi++;
      break;
    case "strategy_v2_ema_not_aligned":
      diagnostics.blocks.ema++;
      break;
    case "strategy_v2_not_bullish":
      diagnostics.blocks.trend++;
      break;
    case "strategy_v2_momentum_not_positive":
      diagnostics.blocks.momentum++;
      break;
  }
  return { allowed: false, reason };
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function normalizeBlocklist(blocklist: Iterable<string>): Set<string> {
  return new Set(Array.from(blocklist, normalizeSymbol).filter((s) => s.length > 0));
}

function findSignal(decision: StrategyV2DecisionInput, name: string): SignalFactor | undefined {
  return decision.signals.find((s) => s.name === name);
}

function hasStrongBullishTrend(decision: StrategyV2DecisionInput): boolean {
  const trend = findSignal(decision, "Trend");
  if (!trend || trend.signal !== "bullish") return false;
  return !trend.displayValue.toLowerCase().startsWith("weak ");
}

function hasBullishEmaAlignment(
  decision: StrategyV2DecisionInput,
  snapshot?: StrategyV2SnapshotInput,
): boolean {
  if (snapshot && Number.isFinite(snapshot.ema9) && Number.isFinite(snapshot.ema21)) {
    return snapshot.ema9 > snapshot.ema21;
  }
  return findSignal(decision, "EMA Crossover")?.signal === "bullish";
}

function readRsi(decision: StrategyV2DecisionInput, snapshot?: StrategyV2SnapshotInput): number | null {
  if (snapshot && Number.isFinite(snapshot.rsi)) return snapshot.rsi;
  const raw = findSignal(decision, "RSI (14)")?.displayValue;
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function rsiInRange(value: number | null): boolean {
  return value !== null && value >= STRATEGY_V2_RSI_MIN && value <= STRATEGY_V2_RSI_MAX;
}
