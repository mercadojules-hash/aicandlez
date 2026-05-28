/**
 * positionStore — single source of truth for all customer position-state
 * mutations (Task #207, Phase 2 of the execution-state convergence).
 *
 * Architectural invariant (locking in over Phase 2):
 *   Every customer position open / live fill / close — manual portal,
 *   AI fan-out, future operator-as-user paths — MUST flow through this
 *   module. Direct `db.insert(simPositionsTable)` /
 *   `db.insert(simTradesTable)` / `db.update(simPositionsTable)` /
 *   `db.delete(simPositionsTable)` outside the allowlist is forbidden by
 *   `scripts/src/check-no-direct-position-writes.ts`.
 *
 * Phase-2 Step-1 scope (this file):
 *   - Canonical SoT shell wrapping the existing `userSimRegistry.ts`
 *     write helpers (`placeUserOrder`, `registerLiveUserFill`,
 *     `closeUserPosition`) under stable, intention-revealing names
 *     (`openPosition`, `recordFill`, `closePosition`).
 *   - `snapshot(userId)` returns a unified `ExecutionStateSnapshot`
 *     shape pulled from `getUserAccountSummary` + `getUserTradeHistory`
 *     so future `GET /api/execution/state` snapshot extension (Phase 2
 *     Step 2) can read a single function instead of two.
 *   - Stream events (`position_opened` / `position_filled` /
 *     `position_closed`) emitted alongside every write so consumers can
 *     start subscribing immediately. The actual DB write is still owned
 *     by `userSimRegistry.ts` — `positionStore` is a behavior-preserving
 *     funnel today.
 *   - `notifyFillExecuted()` helper for `executionGateway.ts` to fire a
 *     stream event on every successful customer order *without* writing
 *     to the DB (the legacy mirror in `userLiveOrder.ts` /
 *     `tradingLoop.ts` is still the writer until the Step-5 cutover).
 *
 * Phase-flag for the cutover:
 *   `POSITION_STORE_UNIFIED=true` is reserved for Phase 2 Step 5, when
 *   the legacy mirror call sites stop double-writing and delegate fill
 *   persistence to this module exclusively. Default `false` keeps the
 *   double-write path so any regression can be reverted in <5s.
 *
 * NOT in scope for Phase 2 Step 1 (deferred to later Phase 2 steps):
 *   - `GET /api/execution/state` snapshot endpoint extension (Step 2).
 *   - UI panel migration in trading-dashboard + aicandlez-app (Step 3).
 *   - OpenAPI codegen + Playwright + load + soak + nightly diff job
 *     (Steps 4/6).
 *   - Cutover that retires the legacy mirror double-write (Step 5).
 *   - Operator path (`/api/exchange/order/execute`) — kept separate.
 */

import { logger } from "./logger.js";
import { executionStreamBus } from "./executionStreamBus.js";
import {
  emit               as emitTelemetry,
  resolveCorrelation,
  forgetCorrelation,
} from "./executionTelemetry.js";
import {
  placeUserOrder            as _placeUserOrder,
  registerLiveUserFill      as _registerLiveUserFill,
  closeUserPosition         as _closeUserPosition,
  getUserAccountSummary,
  getUserTradeHistory,
  type UserOrderRequest,
  type UserSimPosition,
  type UserSimTrade,
} from "./userSimRegistry.js";

/** Phase-flag for the Step-5 cutover from double-write to SoT-only.
 *  Read at call time (not module load) so flag flips take effect on the
 *  next mutation without a process restart. */
export function isPositionStoreUnified(): boolean {
  return process.env["POSITION_STORE_UNIFIED"] === "true";
}

// ── Canonical write surface ─────────────────────────────────────────────

/** Open a paper position. Wraps the legacy `placeUserOrder` and emits
 *  a `position_opened` stream event on success. */
export async function openPosition(
  userId: string,
  req:    UserOrderRequest,
): Promise<{ success: boolean; position?: UserSimPosition; error?: string }> {
  const result = await _placeUserOrder(userId, req);
  if (result.success && result.position) {
    const p = result.position;
    executionStreamBus.emitEvent({
      type:     "position_opened",
      severity: "info",
      symbol:   p.symbol,
      side:     p.side,
      sizeUSD:  p.sizeUSD,
      price:    p.entryPrice,
      mode:     "simulation",
      message:  `[POSITION_STORE] paper opened ${p.symbol} ${p.side} $${p.sizeUSD}`,
      details:  { userId, positionId: p.id, signalId: p.signalId ?? null },
    });
  }
  return result;
}

/** Mirror a live exchange fill into the user's position state. Wraps
 *  the legacy `registerLiveUserFill` and emits a `position_filled`
 *  stream event on success.
 *
 *  Phase-2 Step-1: this is the canonical write path going forward, but
 *  the legacy `userLiveOrder.ts` / `tradingLoop.ts` mirror call sites
 *  still call `registerLiveUserFill` directly (double-write is OFF —
 *  there is currently only ONE writer in either branch). Step 5 will
 *  route those call sites through here instead. */
export async function recordFill(params: Parameters<typeof _registerLiveUserFill>[0]): Promise<UserSimPosition> {
  const position = await _registerLiveUserFill(params);
  executionStreamBus.emitEvent({
    type:     "position_filled",
    severity: "success",
    symbol:   position.symbol,
    side:     position.side,
    sizeUSD:  position.sizeUSD,
    price:    position.entryPrice,
    exchange: position.exchange,
    mode:     position.sandbox ? "test" : "live",
    message:  `[POSITION_STORE] live fill mirrored ${position.symbol} ${position.side} $${position.sizeUSD} @ ${position.exchange}`,
    details: {
      userId:          position.userId,
      positionId:      position.id,
      exchangeOrderId: position.exchangeOrderId,
      signalId:        position.signalId ?? null,
      sandbox:         position.sandbox === true,
    },
  });
  return position;
}

/** Close a position (paper or live mirror). Wraps `closeUserPosition`
 *  and emits a `position_closed` stream event on success. */
export async function closePosition(
  userId:      string,
  positionId:  string,
  closeReason: string = "MANUAL",
): Promise<{ success: boolean; trade?: UserSimTrade; error?: string }> {
  const result = await _closeUserPosition(userId, positionId, closeReason);
  if (result.success && result.trade) {
    const t = result.trade;
    const isLive = !!(t.exchange && t.exchangeOrderId);
    executionStreamBus.emitEvent({
      type:     "position_closed",
      severity: t.realizedPnL >= 0 ? "success" : "info",
      symbol:   t.symbol,
      side:     t.side,
      sizeUSD:  t.sizeUSD,
      price:    t.exitPrice,
      exchange: t.exchange,
      mode:     isLive ? "live" : "simulation",
      message:  `[POSITION_STORE] closed ${t.symbol} ${t.side} PnL ${t.realizedPnL >= 0 ? "+" : ""}${t.realizedPnL.toFixed(2)}`,
      details: {
        userId,
        positionId,
        closeReason,
        realizedPnL:    t.realizedPnL,
        realizedPnLPct: t.realizedPnLPct,
        durationMs:     t.durationMs,
      },
    });
    // Phase 4 (Task #209) — preserve the ORIGINAL trade correlationId
    // through close so the lifecycle grep chain stays unbroken
    // (REQUEST → ACCEPTED → PERSISTED → CLOSED, one id end-to-end). The
    // chain was bridged by `rememberCorrelation(positionId, corrId)` at
    // persistence sites (userLiveOrder.ts mirror, tradingLoop.ts fan-out
    // mirror, paper openPosition above). If unknown (process restart),
    // fall back to a deterministic close-id so the row still validates.
    const origCorr = resolveCorrelation(positionId)
      ?? resolveCorrelation(t.exchangeOrderId ?? null)
      ?? `close-${positionId}`;
    emitTelemetry({
      tag:               "POSITION_CLOSED",
      correlationId:     origCorr,
      userId,
      symbol:            t.symbol,
      normalizedSymbol:  t.symbol,
      exchange:          t.exchange ?? null,
      runtimeMode:       isLive ? "live" : "paper",
      persistenceResult: "persisted",
      positionId,
      latencyMs:         t.durationMs ?? 0,
      trigger:           "system",
      side:              t.side,
      sizeUSD:           t.sizeUSD,
      realizedPnL:       t.realizedPnL,
      realizedPnLPct:    t.realizedPnLPct,
      closeReason,
    });
    // Bound the in-memory positionId→correlationId map.
    forgetCorrelation(positionId);
    if (t.exchangeOrderId) forgetCorrelation(t.exchangeOrderId);
  }
  return result;
}

// ── Canonical read surface ──────────────────────────────────────────────

export interface ExecutionStateSnapshot {
  userId:    string;
  ts:        number;
  /** Aggregated account view from `getUserAccountSummary`. Shape is
   *  intentionally not narrowed here — Phase 2 Step 2 will publish a
   *  Zod schema as part of the snapshot endpoint extension. */
  account:   Awaited<ReturnType<typeof getUserAccountSummary>>;
  /** Closed-trade history. */
  history:   UserSimTrade[];
}

/** Single-call snapshot for the future `GET /api/execution/state`
 *  extension. Today: thin aggregator over the existing read helpers so
 *  the call shape is locked in before the endpoint lands in Step 2. */
export async function snapshot(userId: string): Promise<ExecutionStateSnapshot> {
  const [account, history] = await Promise.all([
    getUserAccountSummary(userId),
    getUserTradeHistory(userId),
  ]);
  return { userId, ts: Date.now(), account, history };
}

// ── Gateway hook (telemetry-only) ───────────────────────────────────────

/** Emit a `position_filled` stream event from the execution gateway on
 *  every successful customer order. Telemetry-only — no DB write
 *  (the legacy mirror in `userLiveOrder.ts` / `tradingLoop.ts` is still
 *  the writer until Step 5). Once Step 5 lands, those call sites will
 *  call `recordFill()` and this helper retires. */
export function notifyFillExecuted(args: {
  trigger:         "manual" | "ai";
  correlationId?:  string;
  userId:          string;
  symbol:          string;
  side:            "BUY" | "SELL";
  sizeUSD:         number;
  fillPrice?:      number | null;
  quantity?:       number | null;
  exchange?:       string | null;
  exchangeOrderId?: string | null;
  sandbox?:        boolean;
  dryRun?:         boolean;
}): void {
  try {
    executionStreamBus.emitEvent({
      type:     "position_filled",
      severity: "success",
      symbol:   args.symbol,
      side:     args.side,
      sizeUSD:  args.sizeUSD,
      price:    args.fillPrice ?? undefined,
      exchange: args.exchange ?? undefined,
      mode:     args.sandbox || args.dryRun ? "test" : "live",
      message:  `[POSITION_STORE] gateway notify ${args.trigger} ${args.symbol} ${args.side} $${args.sizeUSD}`,
      details: {
        gatewayNotify:   true,
        trigger:         args.trigger,
        correlationId:   args.correlationId ?? null,
        userId:          args.userId,
        quantity:        args.quantity ?? null,
        exchangeOrderId: args.exchangeOrderId ?? null,
        sandbox:         args.sandbox === true,
        dryRun:          args.dryRun === true,
      },
    });
    // Phase 4 (Task #209) — emit LIVE_TRADES_HYDRATED on every gateway-
    // notify so the customer's live-trades panel hydration funnel shows
    // up in the correlationId grep chain. Rate-limited 1/sec/user.
    if (args.correlationId) {
      emitTelemetry({
        tag:               "LIVE_TRADES_HYDRATED",
        correlationId:     args.correlationId,
        userId:            args.userId,
        symbol:            args.symbol,
        normalizedSymbol:  args.symbol,
        exchange:          args.exchange ?? null,
        runtimeMode:       args.sandbox || args.dryRun ? "sandbox" : "live",
        persistenceResult: "persisted",
        positionId:        args.exchangeOrderId ?? null,
        latencyMs:         0,
        trigger:           args.trigger,
        side:              args.side,
        sizeUSD:           args.sizeUSD,
      });
    }
  } catch (err) {
    // Telemetry must never break execution. Log + swallow.
    logger.warn(
      { err, userId: args.userId, symbol: args.symbol },
      "positionStore.notifyFillExecuted failed (non-fatal)",
    );
  }
}
