import crypto from "node:crypto";

// ── UserSession ───────────────────────────────────────────────────────────────
//
// Represents an authenticated platform user.
// In Phase 2 this will be backed by PostgreSQL (users table).
// For now it provides a complete in-memory model of what the full
// multi-tenant system will store per user.
//
// Each user gets:
//   - Isolated AI engine state        (see UserEngineRegistry)
//   - Isolated paper trading account  (see simulationEngine, scoped by userId)
//   - Isolated trade journal
//   - Isolated analytics
//   - AI personality profile
//   - Subscription tier
//   - Encrypted exchange credentials  (see CredentialVault)

export type SubscriptionTier = "free" | "starter" | "pro" | "elite" | "enterprise";
export type UserRole         = "trader" | "admin" | "readonly";
export type AIPersonality    = "conservative" | "balanced" | "aggressive";

export interface UserPreferences {
  theme:             "dark" | "light";
  defaultSymbols:    string[];
  defaultTimeframe:  string;
  aiPersonality:     AIPersonality;
  notifications: {
    email:    boolean;
    sms:      boolean;
    push:     boolean;
    trades:   boolean;
    signals:  boolean;
    alerts:   boolean;
  };
  riskSettings: {
    maxPositionSizePct:   number;   // % of portfolio per trade
    maxDailyDrawdownPct:  number;   // daily stop-loss % of portfolio
    maxOpenPositions:     number;
    autoKillOnDrawdown:   boolean;
  };
}

export interface UserSession {
  id:               string;               // UUID
  email:            string;
  username:         string;
  role:             UserRole;
  tier:             SubscriptionTier;
  preferences:      UserPreferences;
  createdAt:        number;               // unix ms
  lastActiveAt:     number;
  isOnboarded:      boolean;
  connectedExchanges: string[];           // e.g. ["Kraken", "Binance"]
  paperBalanceUSD:  number;
  sessionToken?:    string;              // ephemeral JWT placeholder
  ipAddress?:       string;
}

// ── Default preferences ───────────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme:            "dark",
  defaultSymbols:   ["BTCUSD", "ETHUSD", "SOLUSD"],
  defaultTimeframe: "15m",
  aiPersonality:    "balanced",
  notifications: {
    email: true, sms: false, push: true,
    trades: true, signals: true, alerts: true,
  },
  riskSettings: {
    maxPositionSizePct:  10,
    maxDailyDrawdownPct:  5,
    maxOpenPositions:     5,
    autoKillOnDrawdown:   true,
  },
};

// ── Factory ───────────────────────────────────────────────────────────────────

export function createUserSession(
  email:    string,
  username: string,
  tier:     SubscriptionTier = "free",
  role:     UserRole         = "trader",
): UserSession {
  return {
    id:                 crypto.randomUUID(),
    email,
    username,
    role,
    tier,
    preferences:        { ...DEFAULT_PREFERENCES },
    createdAt:          Date.now(),
    lastActiveAt:       Date.now(),
    isOnboarded:        false,
    connectedExchanges: [],
    paperBalanceUSD:    100_000,
  };
}

// ── Subscription limits ───────────────────────────────────────────────────────

export const TIER_LIMITS: Record<SubscriptionTier, {
  maxExchangeConnections: number;
  maxActivePositions:     number;
  maxTradesPerDay:        number;
  aiRequestsPerDay:       number;
  backtestHistoryDays:    number;
  hasLiveTrading:         boolean;
  hasCopyTrading:         boolean;
  hasPrioritySupport:     boolean;
}> = {
  free: {
    maxExchangeConnections: 1,
    maxActivePositions:     3,
    maxTradesPerDay:        5,
    aiRequestsPerDay:       20,
    backtestHistoryDays:    30,
    hasLiveTrading:         false,
    hasCopyTrading:         false,
    hasPrioritySupport:     false,
  },
  starter: {
    maxExchangeConnections: 2,
    maxActivePositions:     10,
    maxTradesPerDay:        25,
    aiRequestsPerDay:       200,
    backtestHistoryDays:    180,
    hasLiveTrading:         true,
    hasCopyTrading:         false,
    hasPrioritySupport:     false,
  },
  pro: {
    maxExchangeConnections: 5,
    maxActivePositions:     50,
    maxTradesPerDay:        -1,     // unlimited
    aiRequestsPerDay:       -1,
    backtestHistoryDays:    730,
    hasLiveTrading:         true,
    hasCopyTrading:         true,
    hasPrioritySupport:     false,
  },
  elite: {
    maxExchangeConnections: 10,
    maxActivePositions:     100,
    maxTradesPerDay:        200,
    aiRequestsPerDay:       -1,
    backtestHistoryDays:    730,
    hasLiveTrading:         true,
    hasCopyTrading:         true,
    hasPrioritySupport:     true,
  },
  enterprise: {
    maxExchangeConnections: -1,     // unlimited
    maxActivePositions:     -1,
    maxTradesPerDay:        -1,
    aiRequestsPerDay:       -1,
    backtestHistoryDays:    -1,
    hasLiveTrading:         true,
    hasCopyTrading:         true,
    hasPrioritySupport:     true,
  },
};
