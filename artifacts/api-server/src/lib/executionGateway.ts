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
 * Why a gateway:
 *   Pre-convergence, manual + AI fan-out duplicated kill-switch / tier /
 *   ARM / cap / symbol-normalize / persistence wiring with subtle drift
 *   (e.g. manual emitted [MANUAL_TRADE_REQUEST] but AI emitted nothing;
 *   manual called `getSupportedExchanges` for unsupported_symbol but AI
 *   silently dropped the trade). The gateway is the single funnel where
 *   every customer order is observed, classified by `trigger`, and gets
 *   one canonical structured log tag (`[EXECUTION_GATEWAY_*]`) so on-call
 *   can grep one pattern across both surfaces.
 *
 * Phase-1 scope (this file):
 *   - Behavior-preserving pass-through to `placeLiveAutoOrderForUser`.
 *   - Adds `trigger` metadata + canonical accept/reject log tags.
 *   - Flag `EXECUTION_GATEWAY_UNIFIED` reserved for the Phase 2-4
 *     internalization passes that will collapse helpers (kill-switch,
 *     ARM, cap, persistence) into this file. Today both branches do the
 *     same thing — the flag is the rollback hatch for those later phases.
 *
 * NOT in scope for Phase 1:
 *   - Helper collapse into gateway internals (Phase 2-3).
 *   - Position-store unification, runtime-mode sync, expanded telemetry
 *     surface (Phases 2-4).
 *   - Operator path (`/api/exchange/order/execute`, no-userId
 *     `placeLiveAutoOrder`) — operator execution is a separate concern
 *     with separate credentials + audit trail.
 */

import { logger } from "./logger.js";
import {
  placeLiveAutoOrderForUser,
  type LiveUserOrderRequest,
  type LiveUserOrderResult,
} from "./liveUserExecution.js";
import { notifyFillExecuted } from "./positionStore.js";

/** Where a customer order originated. Recorded on the canonical
 *  `[EXECUTION_GATEWAY_*]` log tags so manual + AI funnels become
 *  trivially distinguishable in one grep pass. */
export type ExecutionTrigger = "manual" | "ai";

export interface ExecutionGatewayInput extends LiveUserOrderRequest {
  /** Which surface initiated this order. Manual = customer portal BUY/SELL
   *  pill via `POST /api/user/live-order`. AI = global tradingLoop fan-out
   *  to users with default+active+live `user_exchange_connections`. */
  trigger: ExecutionTrigger;
}

/** Pass-through of `LiveUserOrderResult` with the originating `trigger`
 *  echoed back so route handlers / fan-out callers don't have to track it
 *  themselves when correlating against the gateway logs. */
export interface ExecutionGatewayResult extends LiveUserOrderResult {
  trigger: ExecutionTrigger;
}

/**
 * Phase-flag for the unified-internals rollout. Default `false` keeps the
 * gateway as a behavior-preserving pass-through (Phase 1). Phase 2-4 will
 * gate the internalized helper logic behind this flag so any regression
 * can be reverted in <5s without a redeploy.
 *
 * Read at call time (not module load) so flag flips take effect on the
 * next request without a process restart.
 */
export function isExecutionGatewayUnified(): boolean {
  return process.env["EXECUTION_GATEWAY_UNIFIED"] === "true";
}

/**
 * Single entry point for every customer live-order placement.
 *
 * Today: thin wrapper over `placeLiveAutoOrderForUser` (which still owns
 * kill-switch / ARM / tier / cap / symbol-normalize / risk-gate / order
 * placement / mirror-into-sim-registry). The wrapper adds:
 *   - `[EXECUTION_GATEWAY_ACCEPTED]` log on entry (one tag, one shape,
 *     manual + AI byte-identical apart from `trigger`).
 *   - `[EXECUTION_GATEWAY_REJECTED]` log on `success: false` (preserves
 *     the upstream `errorCode` verbatim — no remapping).
 *   - `[EXECUTION_GATEWAY_EXECUTED]` log on `success: true`.
 *   - Result carries `trigger` so callers don't reconstruct it.
 *
 * Future (Phase 2-4, behind `isExecutionGatewayUnified()`):
 *   - Kill-switch / ARM / cap / normalize move IN, `placeLiveAutoOrderForUser`
 *     becomes a gateway-internal helper (un-exported).
 *   - Persistence (sim-registry mirror) moves IN so manual + AI both get
 *     the same `[EXECUTION_PERSISTED]` tag without route-level duplication.
 */
export async function executeCustomerOrder(
  input: ExecutionGatewayInput,
): Promise<ExecutionGatewayResult> {
  const { trigger, ...legacyReq } = input;

  // Canonical accept log — emitted regardless of trigger so a single
  // grep (`grep EXECUTION_GATEWAY_ACCEPTED`) shows the full customer
  // funnel. `exchange` is null at this point (resolved downstream by
  // `placeLiveAutoOrderForUser`); kept as a stable-key placeholder so
  // the accept/reject/executed tags share a uniform shape.
  logger.info(
    {
      tag:              "EXECUTION_GATEWAY_ACCEPTED",
      trigger,
      userId:           legacyReq.userId,
      normalizedSymbol: legacyReq.symbol,
      side:             legacyReq.side,
      sizeUSD:          legacyReq.sizeUSD,
      useSandbox:       legacyReq.useSandbox ?? false,
      exchange:         null,
      unified:          isExecutionGatewayUnified(),
    },
    "[EXECUTION_GATEWAY_ACCEPTED] customer order received",
  );

  // Phase-1 delegation. Both branches of the flag currently route to the
  // same helper — the flag is reserved for Phase 2-4 internalization.
  // Kept as an explicit `if` (not a no-op) so the wiring + log
  // observability is in place from day one of the rollout.
  //
  // Hard-throw envelope: `placeLiveAutoOrderForUser` is expected to return
  // a `{success: false}` envelope for every business-rule rejection, but
  // an unhandled adapter exception (e.g. network failure, JSON parse
  // crash) would skip the canonical [EXECUTION_GATEWAY_REJECTED] tag and
  // leave on-call without a grep-able rejection trail. Wrap once, log,
  // rethrow — preserves the existing exception contract for callers that
  // catch upstream (manual route + AI fan-out both wrap with .catch).
  let legacyResult: LiveUserOrderResult;
  try {
    legacyResult = isExecutionGatewayUnified()
      ? await placeLiveAutoOrderForUser(legacyReq)
      : await placeLiveAutoOrderForUser(legacyReq);
  } catch (err) {
    logger.warn(
      {
        tag:              "EXECUTION_GATEWAY_REJECTED",
        trigger,
        userId:           legacyReq.userId,
        normalizedSymbol: legacyReq.symbol,
        side:             legacyReq.side,
        sizeUSD:          legacyReq.sizeUSD,
        useSandbox:       legacyReq.useSandbox ?? false,
        exchange:         null,
        errorCode:        "uncaught_exception",
        error:            err instanceof Error ? err.message : String(err),
      },
      "[EXECUTION_GATEWAY_REJECTED] customer order threw uncaught exception",
    );
    throw err;
  }

  if (!legacyResult.success) {
    logger.warn(
      {
        tag:              "EXECUTION_GATEWAY_REJECTED",
        trigger,
        userId:           legacyReq.userId,
        normalizedSymbol: legacyReq.symbol,
        side:             legacyReq.side,
        sizeUSD:          legacyReq.sizeUSD,
        useSandbox:       legacyReq.useSandbox ?? false,
        exchange:         legacyResult.exchange ?? null,
        errorCode:        legacyResult.errorCode ?? "unknown",
        error:            legacyResult.error,
      },
      "[EXECUTION_GATEWAY_REJECTED] customer order rejected",
    );
  } else {
    logger.info(
      {
        tag:              "EXECUTION_GATEWAY_EXECUTED",
        trigger,
        userId:           legacyReq.userId,
        normalizedSymbol: legacyReq.symbol,
        side:             legacyReq.side,
        sizeUSD:          legacyReq.sizeUSD,
        useSandbox:       legacyReq.useSandbox ?? false,
        exchange:         legacyResult.exchange ?? null,
        exchangeOrderId:  legacyResult.exchangeOrderId ?? null,
        fillPrice:        legacyResult.fillPrice ?? null,
        quantity:         legacyResult.quantity ?? null,
        dryRun:           legacyResult.dryRun ?? false,
      },
      "[EXECUTION_GATEWAY_EXECUTED] customer order filled",
    );
    // Phase 2 (Task #207) — telemetry-only notify into positionStore.
    // No DB write here: the legacy mirror in `userLiveOrder.ts` /
    // `tradingLoop.ts` is still the authoritative writer. This emits
    // the canonical `position_filled` stream event so consumers can
    // subscribe immediately ahead of the Step-5 cutover.
    notifyFillExecuted({
      trigger,
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

  return { ...legacyResult, trigger };
}
