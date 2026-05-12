import { logger } from "../../lib/logger.js";

// ── CircuitBreaker ────────────────────────────────────────────────────────────
//
// Implements the circuit-breaker pattern for exchange operations.
//
// States:
//   CLOSED   — normal operation; requests flow through
//   OPEN     — tripped; all requests fail fast (no exchange calls made)
//   HALF_OPEN — cooldown expired; next request is a probe; if it succeeds,
//               breaker closes; if it fails, breaker opens again
//
// Applies to:
//   - Per-exchange connection health (each exchange adapter has its own breaker)
//   - Global execution breaker (trip on catastrophic loss)
//   - WebSocket health (trip on N consecutive disconnects)
//
// Usage:
//   const breaker = new CircuitBreaker({ name: "Kraken", failThreshold: 5 });
//   await breaker.call(() => adapter.placeOrder(req));

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  name:                string;
  failThreshold:       number;      // consecutive failures to open
  successThreshold:    number;      // consecutive successes in HALF_OPEN to close
  openDurationMs:      number;      // how long to stay OPEN before trying HALF_OPEN
  halfOpenMaxCalls:    number;      // max probe calls in HALF_OPEN
}

export const DEFAULT_BREAKER_CONFIG: CircuitBreakerConfig = {
  name:             "default",
  failThreshold:    5,
  successThreshold: 2,
  openDurationMs:   30_000,      // 30s
  halfOpenMaxCalls: 3,
};

export interface BreakerSnapshot {
  name:              string;
  state:             BreakerState;
  consecutiveFails:  number;
  consecutiveWins:   number;
  totalCalls:        number;
  totalFailures:     number;
  totalSuccesses:    number;
  lastFailureAt:     number | null;
  lastSuccessAt:     number | null;
  openedAt:          number | null;
  nextRetryAt:       number | null;
  lastError:         string | null;
}

export class CircuitBreaker {
  private config:             CircuitBreakerConfig;
  private state:              BreakerState = "CLOSED";
  private consecutiveFails    = 0;
  private consecutiveWins     = 0;
  private halfOpenCalls       = 0;
  private totalCalls          = 0;
  private totalFailures       = 0;
  private totalSuccesses      = 0;
  private lastFailureAt:      number | null = null;
  private lastSuccessAt:      number | null = null;
  private openedAt:           number | null = null;
  private lastError:          string | null = null;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_BREAKER_CONFIG, ...config };
  }

  // ── Main entry point ──────────────────────────────────────────────────────

  async call<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    if (this.state === "OPEN") {
      const now    = Date.now();
      const expiry = (this.openedAt ?? 0) + this.config.openDurationMs;
      if (now < expiry) {
        throw new Error(
          `[CircuitBreaker:${this.config.name}] OPEN — retry after ${Math.ceil((expiry - now) / 1000)}s`
        );
      }
      this.transitionTo("HALF_OPEN");
    }

    if (this.state === "HALF_OPEN") {
      this.halfOpenCalls++;
      if (this.halfOpenCalls > this.config.halfOpenMaxCalls) {
        this.transitionTo("OPEN");
        throw new Error(`[CircuitBreaker:${this.config.name}] HALF_OPEN probe limit exceeded — reopening`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  // ── Manual control ────────────────────────────────────────────────────────

  /** Force-open the breaker (e.g. on kill switch activation). */
  trip(reason = "Manual trip"): void {
    this.lastError = reason;
    this.transitionTo("OPEN");
    logger.warn({ breaker: this.config.name, reason }, "CircuitBreaker: manually tripped");
  }

  /** Force-close the breaker (e.g. after manual investigation). */
  reset(): void {
    this.consecutiveFails = 0;
    this.consecutiveWins  = 0;
    this.halfOpenCalls    = 0;
    this.openedAt         = null;
    this.transitionTo("CLOSED");
    logger.info({ breaker: this.config.name }, "CircuitBreaker: manually reset");
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  snapshot(): BreakerSnapshot {
    const openDuration = this.config.openDurationMs;
    return {
      name:             this.config.name,
      state:            this.state,
      consecutiveFails: this.consecutiveFails,
      consecutiveWins:  this.consecutiveWins,
      totalCalls:       this.totalCalls,
      totalFailures:    this.totalFailures,
      totalSuccesses:   this.totalSuccesses,
      lastFailureAt:    this.lastFailureAt,
      lastSuccessAt:    this.lastSuccessAt,
      openedAt:         this.openedAt,
      nextRetryAt:      this.openedAt ? this.openedAt + openDuration : null,
      lastError:        this.lastError,
    };
  }

  get currentState(): BreakerState { return this.state; }
  get isOpen():       boolean      { return this.state === "OPEN"; }
  get isClosed():     boolean      { return this.state === "CLOSED"; }

  // ── Private ────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessAt    = Date.now();
    this.consecutiveFails = 0;
    this.consecutiveWins++;

    if (this.state === "HALF_OPEN" && this.consecutiveWins >= this.config.successThreshold) {
      this.transitionTo("CLOSED");
    }
  }

  private onFailure(msg: string): void {
    this.totalFailures++;
    this.lastFailureAt    = Date.now();
    this.lastError        = msg;
    this.consecutiveWins  = 0;
    this.consecutiveFails++;

    if (this.state === "HALF_OPEN") {
      this.transitionTo("OPEN");
    } else if (this.state === "CLOSED" && this.consecutiveFails >= this.config.failThreshold) {
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(next: BreakerState): void {
    const prev = this.state;
    this.state = next;
    if (next === "OPEN") {
      this.openedAt      = Date.now();
      this.halfOpenCalls = 0;
      logger.error(
        { breaker: this.config.name, consecutiveFails: this.consecutiveFails, lastError: this.lastError },
        "CircuitBreaker: OPENED — exchange calls halted",
      );
    } else if (next === "HALF_OPEN") {
      this.halfOpenCalls    = 0;
      this.consecutiveWins  = 0;
      logger.warn({ breaker: this.config.name }, "CircuitBreaker: HALF_OPEN — probing");
    } else if (next === "CLOSED" && prev !== "CLOSED") {
      this.openedAt = null;
      logger.info({ breaker: this.config.name }, "CircuitBreaker: CLOSED — normal operation");
    }
  }
}

// ── Global registry of breakers ───────────────────────────────────────────────

class BreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  get(name: string, config: Partial<CircuitBreakerConfig> = {}): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ name, ...config }));
    }
    return this.breakers.get(name)!;
  }

  all(): BreakerSnapshot[] {
    return [...this.breakers.values()].map(b => b.snapshot());
  }

  tripAll(reason = "Global kill"): void {
    for (const b of this.breakers.values()) b.trip(reason);
  }

  resetAll(): void {
    for (const b of this.breakers.values()) b.reset();
  }
}

export const breakers = new BreakerRegistry();
