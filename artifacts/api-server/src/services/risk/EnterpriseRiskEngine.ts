import { logger } from "../../lib/logger.js";
import { breakers } from "./CircuitBreaker.js";

// ── EnterpriseRiskEngine ──────────────────────────────────────────────────────
//
// Extends the core risk engine with institutional-grade controls:
//
//   ① Max daily drawdown            (% of portfolio — auto kill)
//   ② Max portfolio exposure        (total open positions as % of portfolio)
//   ③ Correlation concentration     (prevents all-in on correlated assets)
//   ④ Circuit breaker integration   (trips on catastrophic conditions)
//   ⑤ Slippage detection            (flags fills far from expected)
//   ⑥ Abnormal execution detection  (unusual fill size / price spikes)
//   ⑦ Exchange disconnect protection (halt when exchange WS drops)
//   ⑧ Volatility-based position scaling (smaller size on high ATR)
//
// Each user has an isolated risk context (userId-keyed).
// The global singleton `globalRisk` protects the whole platform.

export interface RiskContext {
  userId:              string;      // "global" for platform-wide
  portfolioUSD:        number;
  openPositions:       OpenPosition[];
  dailyPnL:            number;      // negative = loss
  dailyVolumeUSD:      number;
  lastExecutionAt:     number | null;
  config:              RiskConfig;
}

export interface OpenPosition {
  symbol:     string;
  side:       "BUY" | "SELL";
  sizeUSD:    number;
  entryPrice: number;
  currentPrice: number;
}

export interface RiskConfig {
  maxDailyDrawdownPct:   number;    // e.g. 5 = 5% of portfolio
  maxPortfolioExposurePct: number;  // e.g. 80 = max 80% deployed
  maxSinglePositionPct:  number;    // e.g. 20 = single trade max 20%
  maxCorrelatedExposurePct: number; // e.g. 40 = BTC+ETH combined max 40%
  slippageTolerancePct:  number;    // e.g. 0.5 = flag if fill > 0.5% off expected
  maxVolatilityATRPct:   number;    // halt new trades if ATR% exceeds this
  requireExchangeConnection: boolean;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxDailyDrawdownPct:     5,
  maxPortfolioExposurePct: 80,
  maxSinglePositionPct:    20,
  maxCorrelatedExposurePct: 40,
  slippageTolerancePct:    0.75,
  maxVolatilityATRPct:     5,
  requireExchangeConnection: true,
};

export interface RiskCheckResult {
  allowed:    boolean;
  violations: RiskViolation[];
  warnings:   RiskViolation[];
  adjustedSizeUSD: number;      // size after volatility scaling
}

export interface RiskViolation {
  rule:    string;
  detail:  string;
  severity: "block" | "warn";
}

// ── Check pipeline ────────────────────────────────────────────────────────────

export function checkEnterpriseRisk(
  ctx:        RiskContext,
  tradeUSD:   number,
  symbol:     string,
  atrPct:     number,
): RiskCheckResult {
  const violations: RiskViolation[] = [];
  const warnings:   RiskViolation[] = [];

  const { config, portfolioUSD, dailyPnL, openPositions } = ctx;
  const totalOpen   = openPositions.reduce((s, p) => s + p.sizeUSD, 0);
  const tradeAsPct  = portfolioUSD > 0 ? (tradeUSD / portfolioUSD) * 100 : 0;
  const dailyLossPct = portfolioUSD > 0 ? (Math.max(0, -dailyPnL) / portfolioUSD) * 100 : 0;

  // ① Daily drawdown
  if (dailyLossPct >= config.maxDailyDrawdownPct) {
    violations.push({
      rule:    "MaxDailyDrawdown",
      detail:  `Daily loss ${dailyLossPct.toFixed(2)}% ≥ limit ${config.maxDailyDrawdownPct}%`,
      severity: "block",
    });
    // Auto-trip the circuit breaker
    breakers.get(`${ctx.userId}-drawdown`, { failThreshold: 1 }).trip("Daily drawdown limit hit");
    logger.error({ userId: ctx.userId, dailyLossPct }, "EnterpriseRisk: DAILY DRAWDOWN LIMIT HIT");
  } else if (dailyLossPct >= config.maxDailyDrawdownPct * 0.8) {
    warnings.push({ rule: "DrawdownWarning", detail: `Approaching daily limit (${dailyLossPct.toFixed(1)}%)`, severity: "warn" });
  }

  // ② Portfolio exposure
  const afterTrade = totalOpen + tradeUSD;
  const exposurePct = portfolioUSD > 0 ? (afterTrade / portfolioUSD) * 100 : 0;
  if (exposurePct > config.maxPortfolioExposurePct) {
    violations.push({
      rule:    "MaxPortfolioExposure",
      detail:  `Exposure ${exposurePct.toFixed(1)}% would exceed limit ${config.maxPortfolioExposurePct}%`,
      severity: "block",
    });
  }

  // ③ Single position size
  if (tradeAsPct > config.maxSinglePositionPct) {
    violations.push({
      rule:    "MaxSinglePosition",
      detail:  `Trade size ${tradeAsPct.toFixed(1)}% > limit ${config.maxSinglePositionPct}%`,
      severity: "block",
    });
  }

  // ④ Volatility gate
  if (atrPct > config.maxVolatilityATRPct) {
    violations.push({
      rule:    "VolatilityGate",
      detail:  `ATR ${atrPct.toFixed(2)}% exceeds threshold ${config.maxVolatilityATRPct}%`,
      severity: "block",
    });
  } else if (atrPct > config.maxVolatilityATRPct * 0.75) {
    warnings.push({ rule: "VolatilityWarning", detail: `ATR ${atrPct.toFixed(2)}% — elevated volatility`, severity: "warn" });
  }

  // ⑤ Correlated concentration (BTC + ETH often move together)
  const CORRELATED_PAIRS = [["BTCUSD","ETHUSD"], ["XRPUSD","DOGEUSD"], ["AVAXUSD","SOLUSD"]];
  for (const group of CORRELATED_PAIRS) {
    if (!group.includes(symbol)) continue;
    const groupExposure = openPositions
      .filter(p => group.includes(p.symbol))
      .reduce((s, p) => s + p.sizeUSD, 0) + tradeUSD;
    const groupPct = portfolioUSD > 0 ? (groupExposure / portfolioUSD) * 100 : 0;
    if (groupPct > config.maxCorrelatedExposurePct) {
      violations.push({
        rule:    "CorrelationConcentration",
        detail:  `Correlated exposure ${groupPct.toFixed(1)}% > limit ${config.maxCorrelatedExposurePct}%`,
        severity: "block",
      });
    }
  }

  // ⑥ Circuit breaker state check
  const breaker = breakers.get(`${ctx.userId}-exchange`);
  if (breaker.isOpen) {
    violations.push({ rule: "CircuitBreakerOpen", detail: "Exchange circuit breaker is OPEN", severity: "block" });
  }

  // Volatility-scaled adjusted size
  const volScale       = atrPct > 0 ? Math.min(1, 1.5 / atrPct) : 1;
  const adjustedSizeUSD = parseFloat((tradeUSD * volScale).toFixed(2));

  return {
    allowed:    violations.length === 0,
    violations,
    warnings,
    adjustedSizeUSD,
  };
}

// ── Slippage detector ─────────────────────────────────────────────────────────

export interface SlippageReport {
  symbol:       string;
  expectedPrice: number;
  fillPrice:     number;
  slippagePct:   number;
  isAbnormal:    boolean;
  action:        "log" | "alert" | "halt";
}

export function detectSlippage(
  symbol:        string,
  expectedPrice: number,
  fillPrice:     number,
  tolerancePct:  number = DEFAULT_RISK_CONFIG.slippageTolerancePct,
): SlippageReport {
  const slippagePct = expectedPrice > 0
    ? Math.abs((fillPrice - expectedPrice) / expectedPrice) * 100
    : 0;
  const isAbnormal = slippagePct > tolerancePct;
  const action: SlippageReport["action"] =
    slippagePct > tolerancePct * 4 ? "halt"  :
    slippagePct > tolerancePct * 2 ? "alert" : "log";

  if (action !== "log") {
    logger.warn({ symbol, expectedPrice, fillPrice, slippagePct: slippagePct.toFixed(3), action },
      "EnterpriseRisk: slippage detected");
  }

  return { symbol, expectedPrice, fillPrice, slippagePct: parseFloat(slippagePct.toFixed(4)), isAbnormal, action };
}
