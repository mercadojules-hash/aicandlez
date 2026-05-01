// ── Risk Configuration ─────────────────────────────────────────────────────────

export interface RiskConfig {
  totalCapitalUSD:   number;
  allocationPct:     number;   // % of capital per trade
  maxTradeSizeUSD:   number;   // hard cap per trade
  dailyLossLimitPct: number;   // % of capital = daily stop
  maxTradesPerDay:   number;
  killSwitchActive:  boolean;
}

// ── Daily State ────────────────────────────────────────────────────────────────

interface DailyState {
  date:          string;   // YYYY-MM-DD
  tradesCount:   number;
  dailyPnL:      number;   // negative = loss
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Singleton State ────────────────────────────────────────────────────────────

let config: RiskConfig = {
  totalCapitalUSD:   100_000,
  allocationPct:     10,
  maxTradeSizeUSD:   5_000,
  dailyLossLimitPct: 5,
  maxTradesPerDay:   10,
  killSwitchActive:  false,
};

let daily: DailyState = {
  date:        todayStr(),
  tradesCount: 0,
  dailyPnL:    0,
};

function ensureToday() {
  const today = todayStr();
  if (daily.date !== today) {
    daily = { date: today, tradesCount: 0, dailyPnL: 0 };
  }
}

// ── Derived Metrics ────────────────────────────────────────────────────────────

export interface RiskStatus {
  maxPositionSizeUSD:      number;
  tradesUsedToday:         number;
  tradesRemainingToday:    number;
  dailyPnL:                number;
  dailyPnLPct:             number;
  dailyLossLimitUSD:       number;
  dailyLossUsedUSD:        number;
  dailyLossUsedPct:        number;   // % of limit consumed
  dailyLossRemainingUSD:   number;
  riskLevel:               "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  haltReason:              string | null;
  lastReset:               string;
}

function computeStatus(): RiskStatus {
  ensureToday();

  const { totalCapitalUSD, allocationPct, maxTradeSizeUSD, dailyLossLimitPct, maxTradesPerDay, killSwitchActive } = config;

  const maxPositionSizeUSD    = Math.min((allocationPct / 100) * totalCapitalUSD, maxTradeSizeUSD);
  const dailyLossLimitUSD     = (dailyLossLimitPct / 100) * totalCapitalUSD;
  const dailyLossUsedUSD      = Math.max(0, -daily.dailyPnL);
  const dailyLossUsedPct      = dailyLossLimitUSD > 0 ? (dailyLossUsedUSD / dailyLossLimitUSD) * 100 : 0;
  const dailyLossRemainingUSD = Math.max(0, dailyLossLimitUSD - dailyLossUsedUSD);
  const tradesRemainingToday  = Math.max(0, maxTradesPerDay - daily.tradesCount);

  let riskLevel: RiskStatus["riskLevel"];
  if (killSwitchActive || dailyLossUsedPct >= 100 || tradesRemainingToday === 0) {
    riskLevel = "CRITICAL";
  } else if (dailyLossUsedPct >= 70 || daily.tradesCount >= maxTradesPerDay * 0.8) {
    riskLevel = "HIGH";
  } else if (dailyLossUsedPct >= 40 || daily.tradesCount >= maxTradesPerDay * 0.5) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  let haltReason: string | null = null;
  if (killSwitchActive)               haltReason = "Kill switch manually activated";
  else if (dailyLossUsedPct >= 100)   haltReason = "Daily loss limit reached";
  else if (tradesRemainingToday === 0) haltReason = "Daily trade count limit reached";

  return {
    maxPositionSizeUSD,
    tradesUsedToday:      daily.tradesCount,
    tradesRemainingToday,
    dailyPnL:             daily.dailyPnL,
    dailyPnLPct:          totalCapitalUSD > 0 ? (daily.dailyPnL / totalCapitalUSD) * 100 : 0,
    dailyLossLimitUSD,
    dailyLossUsedUSD,
    dailyLossUsedPct:     parseFloat(dailyLossUsedPct.toFixed(2)),
    dailyLossRemainingUSD,
    riskLevel,
    haltReason,
    lastReset:            daily.date + "T00:00:00Z",
  };
}

// ── Validation ─────────────────────────────────────────────────────────────────

export interface ValidationCheck {
  pass:   boolean;
  reason: string;
}

export interface ValidateResult {
  allowed:            boolean;
  violations:         string[];
  maxAllowedSizeUSD:  number;
  checks: {
    killSwitch:   ValidationCheck;
    positionSize: ValidationCheck;
    dailyTrades:  ValidationCheck;
    dailyLoss:    ValidationCheck;
  };
}

export function validateTrade(sizeUSD: number): ValidateResult {
  ensureToday();
  const status  = computeStatus();
  const { killSwitchActive } = config;

  const killSwitchCheck: ValidationCheck = killSwitchActive
    ? { pass: false, reason: "Kill switch is active — all trading halted" }
    : { pass: true,  reason: "Kill switch is off" };

  const positionSizeCheck: ValidationCheck = sizeUSD <= status.maxPositionSizeUSD
    ? { pass: true,  reason: `$${sizeUSD.toLocaleString()} within max $${status.maxPositionSizeUSD.toLocaleString()}` }
    : { pass: false, reason: `$${sizeUSD.toLocaleString()} exceeds max allowed $${status.maxPositionSizeUSD.toLocaleString()}` };

  const dailyTradesCheck: ValidationCheck = status.tradesRemainingToday > 0
    ? { pass: true,  reason: `${status.tradesRemainingToday} trades remaining today` }
    : { pass: false, reason: `Daily trade limit of ${config.maxTradesPerDay} reached` };

  const dailyLossCheck: ValidationCheck = status.dailyLossUsedPct < 100
    ? { pass: true,  reason: `$${status.dailyLossRemainingUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })} loss budget remaining` }
    : { pass: false, reason: `Daily loss limit of ${config.dailyLossLimitPct}% ($${status.dailyLossLimitUSD.toLocaleString()}) reached` };

  const violations: string[] = [];
  if (!killSwitchCheck.pass)   violations.push(killSwitchCheck.reason);
  if (!positionSizeCheck.pass) violations.push(positionSizeCheck.reason);
  if (!dailyTradesCheck.pass)  violations.push(dailyTradesCheck.reason);
  if (!dailyLossCheck.pass)    violations.push(dailyLossCheck.reason);

  return {
    allowed:           violations.length === 0,
    violations,
    maxAllowedSizeUSD: status.maxPositionSizeUSD,
    checks: {
      killSwitch:   killSwitchCheck,
      positionSize: positionSizeCheck,
      dailyTrades:  dailyTradesCheck,
      dailyLoss:    dailyLossCheck,
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function getConfig(): RiskConfig       { return { ...config }; }
export function getStatus(): RiskStatus       { return computeStatus(); }

export function updateConfig(patch: Partial<RiskConfig>): RiskConfig {
  config = {
    ...config,
    ...patch,
    // Clamp values to valid ranges
    allocationPct:     Math.min(100, Math.max(1,    patch.allocationPct     ?? config.allocationPct)),
    maxTradeSizeUSD:   Math.max(100,               patch.maxTradeSizeUSD   ?? config.maxTradeSizeUSD),
    dailyLossLimitPct: Math.min(50,  Math.max(1,    patch.dailyLossLimitPct ?? config.dailyLossLimitPct)),
    maxTradesPerDay:   Math.min(100, Math.max(1,    patch.maxTradesPerDay   ?? config.maxTradesPerDay)),
    totalCapitalUSD:   Math.max(1000,              patch.totalCapitalUSD   ?? config.totalCapitalUSD),
  };
  return { ...config };
}

export function toggleKillSwitch(): boolean {
  config.killSwitchActive = !config.killSwitchActive;
  return config.killSwitchActive;
}

// ── Used by other modules for pre-trade checks ─────────────────────────────────
export { computeStatus };
