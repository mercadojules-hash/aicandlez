import { EventEmitter } from "events";
import crypto from "crypto";

export type ExecStreamSeverity = "info" | "success" | "warn" | "error";

export type ExecStreamType =
  | "loop_tick"
  | "loop_error"
  | "signal_detected"
  | "signal_rejected"
  | "signal_accepted"
  | "mtf_blocked"
  | "mtf_confirmed"
  | "confidence_too_low"
  | "live_floor_blocked"
  | "max_positions_blocked"
  | "daily_limit_blocked"
  | "correlation_blocked"
  | "risk_engine_blocked"
  | "position_size_too_small"
  | "order_minimum_failed"
  | "duplicate_blocked"
  | "execution_sent"
  | "order_filled"
  | "order_rejected"
  | "exchange_latency_warning"
  | "websocket_disconnected"
  | "safe_test_mode_activated"
  | "safe_test_mode_expired";

export interface ExecStreamEvent {
  id:          string;
  ts:          number;
  type:        ExecStreamType;
  severity:    ExecStreamSeverity;
  symbol?:     string;
  side?:       "BUY" | "SELL";
  confidence?: number;
  sizeUSD?:    number;
  price?:      number;
  gate?:       string;
  mode?:       "simulation" | "live" | "test";
  exchange?:   string;
  reason?:     string;
  message:     string;
  details?:    Record<string, unknown>;
}

const RING_MAX = 1000;

class ExecutionStreamBus extends EventEmitter {
  private ring: ExecStreamEvent[] = [];
  private cursor = 0;

  emitEvent(ev: Omit<ExecStreamEvent, "id" | "ts"> & { ts?: number }): ExecStreamEvent {
    const full: ExecStreamEvent = {
      id: crypto.randomUUID(),
      ts: ev.ts ?? Date.now(),
      ...ev,
    };
    this.cursor++;
    this.ring.unshift(full);
    if (this.ring.length > RING_MAX) this.ring.length = RING_MAX;
    this.emit("event", full);
    return full;
  }

  getRecent(limit = 200, sinceCursor?: number): { events: ExecStreamEvent[]; cursor: number } {
    let evs = this.ring;
    if (typeof sinceCursor === "number" && sinceCursor > 0) {
      const skip = Math.max(0, this.cursor - sinceCursor);
      evs = this.ring.slice(0, skip);
    }
    return { events: evs.slice(0, limit), cursor: this.cursor };
  }

  clear(): void {
    this.ring = [];
  }

  size(): number {
    return this.ring.length;
  }
}

export const executionStreamBus = new ExecutionStreamBus();

// ── Safe Test Mode ─────────────────────────────────────────────────────────
//
// Admin-only temporary override of live execution thresholds, used to verify
// the end-to-end pipeline against a real exchange with a tiny balance. Time-
// boxed (auto-expires) and never bypasses the risk engine, kill switch, or
// audit logger. Activation/expiry both emit stream events.

export interface SafeTestModeState {
  active:                  boolean;
  expiresAt:               number | null;
  liveConfidenceFloorOverride: number | null;  // e.g. 60 (vs default 80)
  minOrderUsdOverride:     number | null;      // e.g. 10  (allow tiny $100-balance trades)
  reason:                  string | null;
  activatedBy:             string | null;
}

let _state: SafeTestModeState = {
  active:                       false,
  expiresAt:                    null,
  liveConfidenceFloorOverride:  null,
  minOrderUsdOverride:          null,
  reason:                       null,
  activatedBy:                  null,
};

export function getSafeTestMode(): SafeTestModeState {
  // Lazy expiry — refresh on read.
  if (_state.active && _state.expiresAt && Date.now() >= _state.expiresAt) {
    executionStreamBus.emitEvent({
      type:     "safe_test_mode_expired",
      severity: "info",
      message:  "Safe Test Mode expired — thresholds restored to defaults",
    });
    _state = {
      active: false, expiresAt: null,
      liveConfidenceFloorOverride: null, minOrderUsdOverride: null,
      reason: null, activatedBy: null,
    };
  }
  return _state;
}

export function activateSafeTestMode(opts: {
  durationMs:                  number;
  liveConfidenceFloorOverride: number | null;
  minOrderUsdOverride:         number | null;
  reason:                      string;
  activatedBy:                 string;
}): SafeTestModeState {
  _state = {
    active:                       true,
    expiresAt:                    Date.now() + opts.durationMs,
    liveConfidenceFloorOverride:  opts.liveConfidenceFloorOverride,
    minOrderUsdOverride:          opts.minOrderUsdOverride,
    reason:                       opts.reason,
    activatedBy:                  opts.activatedBy,
  };
  executionStreamBus.emitEvent({
    type:     "safe_test_mode_activated",
    severity: "warn",
    message:  `Safe Test Mode ACTIVE — confidence floor=${opts.liveConfidenceFloorOverride ?? "default"}, min order=$${opts.minOrderUsdOverride ?? "default"}, duration ${Math.round(opts.durationMs / 60_000)}min`,
    details: {
      durationMs:                   opts.durationMs,
      liveConfidenceFloorOverride:  opts.liveConfidenceFloorOverride,
      minOrderUsdOverride:          opts.minOrderUsdOverride,
      reason:                       opts.reason,
      activatedBy:                  opts.activatedBy,
    },
  });
  return _state;
}

export function deactivateSafeTestMode(): SafeTestModeState {
  if (_state.active) {
    executionStreamBus.emitEvent({
      type:     "safe_test_mode_expired",
      severity: "info",
      message:  "Safe Test Mode manually deactivated",
    });
  }
  _state = {
    active: false, expiresAt: null,
    liveConfidenceFloorOverride: null, minOrderUsdOverride: null,
    reason: null, activatedBy: null,
  };
  return _state;
}
