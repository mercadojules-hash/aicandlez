/**
 * customerExecMetrics — separated, honest execution counters (Issue #2).
 *
 * Historically a single "executed" counter conflated three very different
 * events: the global operator simulation book opening a position, a customer
 * broker order being *submitted*, and a customer broker order actually being
 * *filled and persisted*. Operators could not tell whether a number on the
 * dashboard meant "the AI simulated an open" or "real customer money moved".
 *
 * This module owns four in-memory cumulative counters (since boot or last
 * reset), each incremented at exactly one well-defined point in the pipeline:
 *
 *   operatorSimExecutions          — global operator/sim book opened a position
 *                                    (tradingLoop global open; NOT a customer
 *                                    broker order, NOT real customer money).
 *   customerBrokerOrdersSubmitted  — a customer live order was *sent* to the
 *                                    broker (adapter.placeOrder dispatched).
 *   customerBrokerOrdersFilled     — the broker ACCEPTED the order AND the
 *                                    fill was persisted AND a position record
 *                                    exists. Incremented from the single
 *                                    post-persistence hook
 *                                    (positionStore.notifyFillHydrated), so it
 *                                    can never run ahead of a real persisted
 *                                    fill. Dry-run fills are excluded.
 *   brokerRejects                  — a customer broker order was rejected
 *                                    (errorCode "exchange_reject").
 *
 * Live position/closed-trade counts are NOT held here — they are derived from
 * the database at read time by the metrics route, so they always reflect
 * ground truth rather than a counter that could drift across restarts.
 *
 * Telemetry must never break execution: every recorder is a plain in-memory
 * increment with no I/O and no throw surface.
 */

export interface CustomerExecMetrics {
  /** Epoch ms when these counters were last (re)baselined. */
  since: number;
  /** Global operator/sim book opens — simulated, not customer broker orders. */
  operatorSimExecutions: number;
  /** Customer live orders dispatched to a broker. */
  customerBrokerOrdersSubmitted: number;
  /** Customer broker orders accepted + persisted (real fills only, no dry-run). */
  customerBrokerOrdersFilled: number;
  /** Customer broker orders rejected by the exchange. */
  brokerRejects: number;
}

const state: CustomerExecMetrics = {
  since: Date.now(),
  operatorSimExecutions: 0,
  customerBrokerOrdersSubmitted: 0,
  customerBrokerOrdersFilled: 0,
  brokerRejects: 0,
};

/** Global operator/sim book opened a position (simulated; not a broker order). */
export function recordOperatorSimExecution(): void {
  state.operatorSimExecutions++;
}

/** A customer live order was dispatched to the broker. */
export function recordCustomerBrokerSubmitted(): void {
  state.customerBrokerOrdersSubmitted++;
}

/**
 * A customer broker order was accepted by the exchange AND the fill was
 * persisted AND a position record exists. Call ONLY from the post-persistence
 * hook, once per persisted fill. Dry-run fills must not call this.
 */
export function recordCustomerBrokerFilled(): void {
  state.customerBrokerOrdersFilled++;
}

/** A customer broker order was rejected by the exchange. */
export function recordBrokerReject(): void {
  state.brokerRejects++;
}

/** Snapshot of the in-memory counters (DB-derived counts added by the route). */
export function getCustomerExecMetrics(): CustomerExecMetrics {
  return { ...state };
}

/** Rebaseline all counters to zero and stamp a fresh `since`. */
export function resetCustomerExecMetrics(): void {
  state.since = Date.now();
  state.operatorSimExecutions = 0;
  state.customerBrokerOrdersSubmitted = 0;
  state.customerBrokerOrdersFilled = 0;
  state.brokerRejects = 0;
}
