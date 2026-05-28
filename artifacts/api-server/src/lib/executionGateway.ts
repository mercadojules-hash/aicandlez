/**
 * executionGateway — single entry point for every CUSTOMER live-order
 * placement (Task #206, Phase 1 of the execution-state convergence).
 *
 * Architectural invariant (locked):
 *   All customer execution paths — manual portal BUY/SELL pill, AI auto-
 *   trade fan-out, future operator-as-user paths — MUST converge through
 *   `executeCustomerOrder()`. Direct calls to `placeLiveAutoOrderForUser`
 *   (or to any adapter `.placeOrder` for a userId-scoped flow) are
 *   forbidden by `scripts/src/check-no-direct-adapter-orders.ts`.
 *
 * Phase 4 (Task #209) — every accept/reject emits a canonical
 * `executionTelemetry` row carrying the same correlationId stamped on
 * the upstream REQUEST tag so on-call can grep one id end-to-end.
 */

import { logger } from "./logger.js";
import {
  placeLiveAutoOrderForUser,
  type LiveUserOrderRequest,
  type LiveUserOrderResult,
} from "./liveUserExecution.js";
import { notifyFillExecuted } from "./positionStore.js";
import {
  emit as emitTelemetry,
  genCorrelationId,
  type ExecutionTrigger as TelemetryTrigger,
  type RuntimeMode,
} from "./executionTelemetry.js";

/** Where a customer order originated. */
export type ExecutionTrigger = "manual" | "ai";

export interface ExecutionGatewayInput extends LiveUserOrderRequest {
  /** Which surface initiated this order. */
  trigger: ExecutionTrigger;
}

/** Pass-through of `LiveUserOrderResult` with the originating `trigger`
 *  and the canonical `correlationId` echoed back so route handlers /
 *  fan-out callers can stamp it on their own downstream logs without
 *  re-deriving it. */
export interface ExecutionGatewayResult extends LiveUserOrderResult {
  trigger:       ExecutionTrigger;
  correlationId: string;
}

export function isExecutionGatewayUnified(): boolean {
  return process.env["EXECUTION_GATEWAY_UNIFIED"] === "true";
}

function runtimeOf(req: LiveUserOrderRequest): RuntimeMode {
  return req.useSandbox ? "sandbox" : "live";
}

/**
 * Single entry point for every customer live-order placement.
 */
export async function executeCustomerOrder(
  input: ExecutionGatewayInput,
): Promise<ExecutionGatewayResult> {
  const { trigger, ...legacyReq } = input;
  const correlationId = legacyReq.correlationId ?? genCorrelationId();
  const acceptedAt = Date.now();
  const trigT: TelemetryTrigger = trigger;
  const runtimeMode = runtimeOf(legacyReq);

  // Re-stamp the request so downstream `placeLiveAutoOrderForUser` sees
  // the resolved id (matters when the upstream caller didn't pass one).
  legacyReq.correlationId = correlationId;

  emitTelemetry({
    tag:               "EXECUTION_GATEWAY_ACCEPTED",
    correlationId,
    userId:            legacyReq.userId,
    symbol:            legacyReq.symbol,
    normalizedSymbol:  legacyReq.symbol,
    exchange:          null,
    runtimeMode,
    persistenceResult: "pending",
    positionId:        null,
    latencyMs:         0,
    trigger:           trigT,
    side:              legacyReq.side,
    sizeUSD:           legacyReq.sizeUSD,
    unified:           isExecutionGatewayUnified(),
  });

  let legacyResult: LiveUserOrderResult;
  try {
    legacyResult = isExecutionGatewayUnified()
      ? await placeLiveAutoOrderForUser(legacyReq)
      : await placeLiveAutoOrderForUser(legacyReq);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitTelemetry({
      tag:               "EXECUTION_REJECTED",
      correlationId,
      userId:            legacyReq.userId,
      symbol:            legacyReq.symbol,
      normalizedSymbol:  legacyReq.symbol,
      exchange:          null,
      runtimeMode,
      persistenceResult: "skipped",
      positionId:        null,
      latencyMs:         Date.now() - acceptedAt,
      rejectionReason:   "uncaught_exception",
      trigger:           trigT,
      side:              legacyReq.side,
      sizeUSD:           legacyReq.sizeUSD,
      error:             msg,
    });
    // Preserve legacy structured log for back-compat grep.
    logger.warn(
      { tag: "EXECUTION_GATEWAY_REJECTED", correlationId, trigger, userId: legacyReq.userId, error: msg },
      "[EXECUTION_GATEWAY_REJECTED] customer order threw uncaught exception",
    );
    throw err;
  }

  if (!legacyResult.success) {
    emitTelemetry({
      tag:               "EXECUTION_REJECTED",
      correlationId,
      userId:            legacyReq.userId,
      symbol:            legacyReq.symbol,
      normalizedSymbol:  legacyReq.symbol,
      exchange:          legacyResult.exchange ?? null,
      runtimeMode,
      persistenceResult: "skipped",
      positionId:        null,
      latencyMs:         Date.now() - acceptedAt,
      rejectionReason:   legacyResult.errorCode ?? "unknown",
      trigger:           trigT,
      side:              legacyReq.side,
      sizeUSD:           legacyReq.sizeUSD,
      error:             legacyResult.error,
    });
  } else {
    // Treat as the "filled" transition. POSITION_PERSISTED is emitted
    // separately by the caller after the registry mirror succeeds (the
    // gateway can't tell whether the legacy mirror writer ran).
    logger.info(
      {
        tag:              "EXECUTION_GATEWAY_EXECUTED",
        correlationId,
        trigger,
        userId:           legacyReq.userId,
        normalizedSymbol: legacyReq.symbol,
        exchange:         legacyResult.exchange ?? null,
        exchangeOrderId:  legacyResult.exchangeOrderId ?? null,
        fillPrice:        legacyResult.fillPrice ?? null,
        latencyMs:        Date.now() - acceptedAt,
      },
      "[EXECUTION_GATEWAY_EXECUTED] customer order filled",
    );
    notifyFillExecuted({
      trigger,
      correlationId,
      userId:          legacyReq.userId,
      symbol:          legacyReq.symbol,
      side:            legacyReq.side,
      sizeUSD:         legacyReq.sizeUSD,
      fillPrice:       legacyResult.fillPrice ?? null,
      quantity:        legacyResult.quantity ?? null,
      exchange:        legacyResult.exchange ?? null,
      exchangeOrderId: legacyResult.exchangeOrderId ?? null,
      sandbox:         legacyReq.useSandbox === true,
      dryRun:          legacyResult.dryRun === true,
    });
  }

  return { ...legacyResult, trigger, correlationId };
}
