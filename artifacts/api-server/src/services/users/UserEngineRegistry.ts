import { logger } from "../../lib/logger.js";

// ── UserEngineRegistry ────────────────────────────────────────────────────────
//
// Manages per-user AI engine state.
// Each user gets an isolated engine instance so that:
//   - Signal streams do not bleed between users
//   - Kill switches are scoped per user
//   - AI memory, confidence, and journal are isolated
//   - Paper trading balances are independent
//
// In Phase 2 (multi-tenant cloud):
//   - Each user engine would run in a separate BullMQ worker process
//   - State would be persisted to Redis (fast) + PostgreSQL (durable)
//   - WebSocket streams would be multiplexed per user session
//
// Current design: in-process Map — supports hundreds of users in a single
// Node.js process. Sufficient for prototype / MVP (< 1,000 concurrent users).

export interface UserEngineState {
  userId:           string;
  running:          boolean;
  testMode:         boolean;
  autoMode:         boolean;
  killSwitch:       boolean;
  paused:           boolean;
  startedAt:        number | null;
  lastTickAt:       number | null;
  signalsGenerated: number;
  tradesExecuted:   number;
  tradesBlocked:    number;
  // Paper portfolio
  paperUSD:         number;
  paperPositions:   UserPosition[];
  // AI state
  aiPersonality:    "conservative" | "balanced" | "aggressive";
  minConfidence:    number;
  // Risk state
  dailyPnL:         number;
  dailyTrades:      number;
  dailyDate:        string;    // YYYY-MM-DD — reset when date changes
  // Session telemetry
  lastSignal:       string | null;
  lastTrade:        string | null;
  errors:           string[];
}

export interface UserPosition {
  id:           string;
  symbol:       string;
  side:         "BUY" | "SELL";
  sizeUSD:      number;
  entryPrice:   number;
  stopLoss:     number;
  takeProfit:   number;
  openedAt:     number;
}

// ── Default state factory ─────────────────────────────────────────────────────

function defaultState(userId: string): UserEngineState {
  return {
    userId,
    running:          false,
    testMode:         true,
    autoMode:         true,
    killSwitch:       false,
    paused:           false,
    startedAt:        null,
    lastTickAt:       null,
    signalsGenerated: 0,
    tradesExecuted:   0,
    tradesBlocked:    0,
    paperUSD:         100_000,
    paperPositions:   [],
    aiPersonality:    "balanced",
    minConfidence:    60,
    dailyPnL:         0,
    dailyTrades:      0,
    dailyDate:        new Date().toISOString().slice(0, 10),
    lastSignal:       null,
    lastTrade:        null,
    errors:           [],
  };
}

// ── Registry ──────────────────────────────────────────────────────────────────

class UserEngineRegistry {
  private sessions = new Map<string, UserEngineState>();

  /** Get or create engine state for a user. */
  getOrCreate(userId: string): UserEngineState {
    if (!this.sessions.has(userId)) {
      const state = defaultState(userId);
      this.sessions.set(userId, state);
      logger.info({ userId }, "UserEngineRegistry: new engine state created");
    }
    return this.sessions.get(userId)!;
  }

  /** Update a subset of the user's engine state. */
  patch(userId: string, patch: Partial<UserEngineState>): UserEngineState {
    const state = this.getOrCreate(userId);
    Object.assign(state, patch);
    this.resetDailyIfNeeded(state);
    return state;
  }

  get(userId: string): UserEngineState | undefined {
    return this.sessions.get(userId);
  }

  has(userId: string): boolean {
    return this.sessions.has(userId);
  }

  /** Evict a user's state (e.g. on logout or after prolonged inactivity). */
  evict(userId: string): void {
    this.sessions.delete(userId);
    logger.info({ userId }, "UserEngineRegistry: engine state evicted");
  }

  /** Summary of all active user engines. */
  summary(): { total: number; running: number; paused: number; killed: number } {
    let running = 0, paused = 0, killed = 0;
    for (const s of this.sessions.values()) {
      if (s.killSwitch) killed++;
      else if (s.paused) paused++;
      else if (s.running) running++;
    }
    return { total: this.sessions.size, running, paused, killed };
  }

  /** Kill all user engines (global emergency stop). */
  killAll(): number {
    let count = 0;
    for (const state of this.sessions.values()) {
      if (!state.killSwitch) {
        state.killSwitch = true;
        state.autoMode   = false;
        count++;
      }
    }
    logger.warn({ count }, "UserEngineRegistry: GLOBAL KILL — all engines halted");
    return count;
  }

  /** List all userId keys. */
  userIds(): string[] {
    return [...this.sessions.keys()];
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private resetDailyIfNeeded(state: UserEngineState): void {
    const today = new Date().toISOString().slice(0, 10);
    if (state.dailyDate !== today) {
      state.dailyDate   = today;
      state.dailyPnL    = 0;
      state.dailyTrades = 0;
    }
  }
}

// Singleton
export const userEngineRegistry = new UserEngineRegistry();
