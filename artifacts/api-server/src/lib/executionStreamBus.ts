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
  | "order_acknowledged"
  | "order_filled"
  | "order_rejected"
  | "position_persisted"
  | "position_persist_failed"
  | "dashboard_hydrated"
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

// One-shot listener registered when STM is activated with
// `disableAfterFirstLiveFill: true`. Held at module scope so we can detach
// it on manual deactivation or TTL expiry without leaving zombie handlers
// across multiple STM cycles.
let _autoDisableListener: ((ev: ExecStreamEvent) => void) | null = null;

function _detachAutoDisable(): void {
  if (_autoDisableListener) {
    executionStreamBus.off("event", _autoDisableListener);
    _autoDisableListener = null;
  }
}

export function getSafeTestMode(): SafeTestModeState {
  // Lazy expiry — refresh on read.
  if (_state.active && _state.expiresAt && Date.now() >= _state.expiresAt) {
    _detachAutoDisable();
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
  disableAfterFirstLiveFill?:  boolean;
}): SafeTestModeState {
  // Detach any previous one-shot listener before re-activating.
  _detachAutoDisable();

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
    message:  `Safe Test Mode ACTIVE — confidence floor=${opts.liveConfidenceFloorOverride ?? "default"}, min order=$${opts.minOrderUsdOverride ?? "default"}, duration ${Math.round(opts.durationMs / 60_000)}min${opts.disableAfterFirstLiveFill ? " · auto-disable on first live fill" : ""}`,
    details: {
      durationMs:                   opts.durationMs,
      liveConfidenceFloorOverride:  opts.liveConfidenceFloorOverride,
      minOrderUsdOverride:          opts.minOrderUsdOverride,
      reason:                       opts.reason,
      activatedBy:                  opts.activatedBy,
      disableAfterFirstLiveFill:    !!opts.disableAfterFirstLiveFill,
    },
  });

  // Register one-shot auto-disable: on the FIRST order_filled tagged
  // mode === 'live', clear STM and restore default thresholds. Sim/test
  // fills are ignored so paper trades cannot accidentally end the window.
  if (opts.disableAfterFirstLiveFill) {
    _autoDisableListener = (ev: ExecStreamEvent) => {
      if (ev.type === "order_filled" && ev.mode === "live" && _state.active) {
        _detachAutoDisable();
        executionStreamBus.emitEvent({
          type:     "safe_test_mode_expired",
          severity: "info",
          message:  `Safe Test Mode auto-disabled after first live fill (${ev.symbol ?? "?"} ${ev.side ?? "?"} $${ev.sizeUSD ?? "?"}) — thresholds restored to defaults`,
          details:  { triggerOrderId: ev.id, symbol: ev.symbol, side: ev.side, sizeUSD: ev.sizeUSD },
        });
        _state = {
          active: false, expiresAt: null,
          liveConfidenceFloorOverride: null, minOrderUsdOverride: null,
          reason: null, activatedBy: null,
        };
      }
    };
    executionStreamBus.on("event", _autoDisableListener);
  }

  return _state;
}

export function deactivateSafeTestMode(): SafeTestModeState {
  _detachAutoDisable();
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
