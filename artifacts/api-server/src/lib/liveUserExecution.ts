import { db } from "@workspace/db";
import {
  simPositionsTable,
  userExchangeConnectionsTable,
  userNotificationsTable,
  userSettingsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { vault } from "../services/vault/CredentialVault.js";
import { ensureFreshAlpacaCreds } from "../services/exchanges/AlpacaTokenRefresher.js";
import { hasSandbox, makeAdapter } from "../services/exchanges/adapterFactory.js";
import type { BaseExchangeAdapter } from "../services/exchanges/BaseExchangeAdapter.js";
import type { StandardOrder } from "../services/exchanges/types.js";
import { getTicker, normalizeExecutionSymbol, SUPPORTED_SYMBOLS } from "./marketData.js";
import { logger } from "./logger.js";
import { NotificationDispatcher } from "../services/notifications/NotificationDispatcher.js";
import { getTradeLimitVerdict, invalidateTradeLimitCache } from "./tradeLimitEngine.js";
import { getUserStatusVerdict } from "./userStatusGuard.js";
import { executionStreamBus } from "./executionStreamBus.js";
import { logsTable, riskThrottleEventsTable } from "@workspace/db";
import crypto from "crypto";
import { evaluateRiskGate } from "./riskGate.js";
import { isAiDisclaimerAccepted } from "./aiDisclaimer.js";
import { engineStats, BASELINE_MIN_CONFIDENCE, EXPERIMENT_CONF_FLOOR, VOLUME_GATE_FRACTION } from "./tradingLoop.js";
import { resolveAiTradingGate } from "./aiTradingGate.js";
import {
  ALLOWED_TRADE_SIZES,
  DEFAULT_TRADE_SIZE_USD,
  coerceTradeSizeToPreset,
  evaluateLiquidityGuard,
} from "./liquidityGuard.js";
import { simAccountsTable } from "@workspace/db";

// ── Per-user live execution bridge ────────────────────────────────────────────
//
// Resolves a customer's own connected exchange (`user_exchange_connections`),
// decrypts the AES-256-GCM credential blob via the CredentialVault, and
// submits a live order through an ephemeral adapter instance.
//
// Operator credentials from process.env (KRAKEN_API_KEY etc.) are NOT used
// here — this path is strictly per-customer. The operator-only execution
// path lives in `exchangeEngine.placeLiveAutoOrder` (no userId).
//
// Failure surface (any of):
//   - User has no default+active+live connection             → "no_connection"
//   - encryptedBlob fails to decrypt (key mismatch/tamper)   → "decrypt_failed"
//   - Unsupported exchange (no adapter)                       → "unsupported"
//   - Adapter rejection (network/auth/balance/symbol)         → "exchange_reject"
// All failures emit a `user_notifications` row tagged `live_trade_failed`
// so the customer sees it in their notification feed.
//
// Dry-run mode: when LIVE_TRADE_DRY_RUN === "true", the adapter call is
// skipped. The function returns success with a synthetic exchangeOrderId
// (`DRYRUN-...`) and the reference ticker price. Used during single-user
// pilot rollout to verify the credential resolution + ticker pricing path
// without touching real money on the exchange.

export interface LiveUserOrderRequest {
  userId:  string;
  symbol:  string;          // engine-native ("BTCUSD")
  side:    "BUY" | "SELL";
  sizeUSD: number;
  /**
   * Route the order through the exchange's public sandbox / testnet instead
   * of production. Used by the customer portal's PAPER mode "use exchange
   * sandbox" option for exchanges where one is available. Caller is
   * responsible for verifying the exchange has a sandbox via
   * `hasSandbox(exchange)` — when the user's connected exchange has none,
   * the caller must fall back to the internal simulator and never set this.
   */
  useSandbox?: boolean;
  /**
   * Phase 4 (Task #209) — canonical correlationId stamped on every
   * downstream telemetry row. Optional so existing internal callers don't
   * have to thread one in for unit tests; the gateway / route handlers
   * always pass one through in production.
   */
  correlationId?: string;
}

export interface LiveUserOrderResult {
  success:         boolean;
  userId:          string;
  exchange?:       string;
  exchangeOrderId?: string;
  fillPrice?:      number;
  quantity?:       number;
  // Broker-reported entry-leg commission, in `brokerFeeCurrency`, when the
  // exchange's order/fill payload included a real fee figure. Only set when
  // `order.fee.source === "broker"` on the underlying StandardOrder — left
  // undefined on dry-run, paper, and brokers that don't surface a fee.
  brokerFee?:         number;
  brokerFeeCurrency?: string;
  dryRun?:         boolean;
  /** True when the order was routed through the exchange's public sandbox. */
  sandbox?:        boolean;
  errorCode?:      "no_connection" | "not_trade_authorized" | "decrypt_failed" | "unsupported" | "unsupported_symbol" | "symbol_not_in_universe" | "no_sandbox" | "price_unavailable" | "exchange_reject" | "trade_limit_exhausted" | "user_status_blocked" | "customer_live_execution_disabled" | "user_ai_disabled" | "concurrent_live_cap_reached" | "risk_max_per_trade" | "risk_max_simultaneous" | "risk_max_allocation" | "risk_reserve_cash_breach" | "risk_no_equity" | "ai_disclaimer_not_accepted" | "low_confidence_signal" | "volume_safety_gate" | "liquidity_protected" | "plan_max_positions_reached";
  error?:          string;
}

/**
 * Customer-portal live-execution kill switch (Task #157).
 *
 * The customer portal at `trade.aicandlez.com/portal` is paper-only. Real-
 * money execution is reserved for the operator terminal at
 * `admintrade.aicandlez.com` and routed through the server-side env Kraken
 * keys via `exchangeEngine.placeLiveAutoOrder` (no userId path).
 *
 * This flag governs the *per-user* execution path
 * (`placeLiveAutoOrderForUser` + `POST /api/user/live-order` + the customer
 * fan-out branch of `tradingLoop`). When false (the default), non-admin
 * callers are hard-rejected with `customer_live_execution_disabled` even if
 * an `user_exchange_connections` row exists or a stale UI affordance leaks
 * through. Admins / super-admins bypass the gate so operator tooling that
 * happens to authenticate as a real user is unaffected.
 *
 * Flip via env to re-enable a future customer live-execution rollout —
 * intentionally undocumented in customer-facing surfaces.
 */
export function isCustomerLiveExecutionEnabled(): boolean {
  return process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"] === "true";
}

/**
 * Controlled-beta platform-wide concurrent live-trade ceiling.
 *
 * Counts open rows in `sim_positions` where `exchange IS NOT NULL` (i.e. live
 * customer fills mirrored back into the per-user sim registry). When the
 * count reaches the cap, every subsequent customer live order — manual or
 * auto-trade fan-out — is rejected with `concurrent_live_cap_reached`.
 *
 * Default = 25 — a platform-wide backstop sized above the sum of a small
 * cohort of paid tiers (per-user concurrency is independently enforced by
 * `liquidityGuard.PLAN_MAX_OPEN_POSITIONS`: starter 3 / pro 6 / elite 12).
 * Operator can ratchet via env:
 *   LIVE_EXECUTION_CONCURRENT_CAP=50   without a redeploy.
 *
 * Set to `0` to disable the gate entirely (legacy behavior).
 *
 * Scope: customer-side only. The operator path (`exchangeEngine.
 * placeLiveAutoOrder`, no userId) is intentionally NOT gated here — operator
 * execution on `admintrade.aicandlez.com` runs under separate operational
 * controls. Admin / super-admin users authenticated on the customer path
 * also bypass.
 */
export const DEFAULT_LIVE_EXECUTION_CONCURRENT_CAP = 25;

export function getLiveExecutionConcurrentCap(): number {
  const raw = process.env["LIVE_EXECUTION_CONCURRENT_CAP"];
  if (raw == null || raw === "") return DEFAULT_LIVE_EXECUTION_CONCURRENT_CAP;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_LIVE_EXECUTION_CONCURRENT_CAP;
  return Math.floor(n);
}

async function countOpenLivePositions(): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(simPositionsTable)
      .where(isNotNull(simPositionsTable.exchange));
    return Number(row?.n ?? 0);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: open-live-position count failed — failing open to legacy gates",
    );
    return 0;
  }
}

// NOTE — gate-0c TOCTOU: the cap check reads `sim_positions` then places the
// broker order without a reservation; concurrent parallel customer placements
// (tradingLoop fan-out `Promise.all`, simultaneous manual orders) can each
// pass a stale count and overshoot the cap by the number of in-flight calls.
// Bounded at ~N for N concurrent users; acceptable during controlled beta
// (≤3 users under manual oversight). Hardening — DB-backed reservation
// primitive (advisory lock / `SELECT … FOR UPDATE` on a counter row) — is a
// known backlog item to land before widening the cap or scaling user count.

async function isOperatorRole(userId: string): Promise<boolean> {
  try {
    const [u] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);
    return u?.role === "admin" || u?.role === "super-admin";
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: role lookup failed — assuming non-operator (fail-closed for live)",
    );
    return false;
  }
}

/**
 * Internal / QA account check (`users.is_internal_account`). These are
 * platform development accounts exempt from tier ENTITLEMENT throttling —
 * the daily-trade cap (gate 0b), the platform-wide concurrent cap (gate 0c),
 * and the plan-tier max-open-positions cap (gate 0LIQ part A). They STILL
 * respect the liquidity cushion, the per-user risk budget (gate 0d), trade
 * sizing, stop-loss / take-profit, and exchange balance availability. This
 * is the maintainable QA-exemption mechanism: a single boolean on the user
 * row, independent of the admin/operator role (so QA accounts don't inherit
 * operator privileges or the broader operator gate-bypass). Fail-closed
 * (throttle as a normal customer) on lookup error.
 */
async function isInternalAccount(userId: string): Promise<boolean> {
  try {
    const [u] = await db
      .select({ isInternal: usersTable.isInternalAccount })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);
    return u?.isInternal === true;
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: internal-account lookup failed — assuming non-internal (fail-closed)",
    );
    return false;
  }
}

export interface LiveUserCloseRequest {
  userId:    string;
  symbol:    string;          // engine-native ("BTCUSD")
  openSide:  "BUY" | "SELL";  // side of the *opening* fill — close uses the opposite
  quantity:  number;          // base-asset qty already known from the open
  exchange:  string;          // exchange the open fill landed on (must match user's current default)
  /** Route close through the exchange's public sandbox (mirrors the open side). */
  useSandbox?: boolean;
}

export interface LiveUserCloseResult {
  success:              boolean;
  userId:               string;
  exchange?:            string;
  exchangeCloseOrderId?: string;
  fillPrice?:           number;
  quantity?:            number;
  // Broker-reported close-leg commission (see LiveUserOrderResult.brokerFee).
  brokerFee?:           number;
  brokerFeeCurrency?:   string;
  dryRun?:              boolean;
  errorCode?:           "no_connection" | "decrypt_failed" | "unsupported" | "no_sandbox" | "exchange_mismatch" | "exchange_reject" | "customer_live_execution_disabled";
  error?:               string;
}

export function isDryRunEnabled(): boolean {
  return process.env["LIVE_TRADE_DRY_RUN"] === "true";
}

// Poll adapter.getOrder() until the order is in a terminal state (filled,
// cancelled, rejected) or until the timeout elapses. Returns the latest
// known order snapshot plus a `timedOut` flag the caller uses to decide
// how to surface partial / unfilled close orders.
//
// Some exchanges (notably Kraken) acknowledge a market order with
// status="open" and avgFillPrice=0 on the initial placeOrder response,
// even though the order fills moments later. Without polling, realized
// PnL falls back to the live ticker which can drift from the true fill.
async function pollOrderUntilFilled(
  adapter: BaseExchangeAdapter,
  exchangeOrderId: string,
  symbol: string,
  opts: {
    timeoutMs?:  number;
    intervalMs?: number;
    logCtx?:     Record<string, unknown>;
  } = {},
): Promise<{ order: StandardOrder | null; timedOut: boolean }> {
  const timeoutMs  = opts.timeoutMs  ?? 5000;
  const intervalMs = opts.intervalMs ?? 500;
  const deadline   = Date.now() + timeoutMs;
  let last: StandardOrder | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const o = await adapter.getOrder(exchangeOrderId, symbol);
      if (o) {
        last = o;
        if (o.status === "filled" || o.status === "cancelled" || o.status === "rejected") {
          return { order: o, timedOut: false };
        }
      }
    } catch (err) {
      logger.warn(
        { ...(opts.logCtx ?? {}), exchangeOrderId, err: err instanceof Error ? err.message : String(err) },
        "liveUserExecution: getOrder poll attempt failed",
      );
    }
  }
  return { order: last, timedOut: true };
}

async function emitFillNotification(
  userId:   string,
  symbol:   string,
  side:     "BUY" | "SELL",
  exchange: string,
  fillPrice: number,
  quantity:  number,
  exchangeOrderId: string,
  dryRun:   boolean,
  extra?: { note?: string; data?: Record<string, unknown> },
): Promise<void> {
  const priceStr = fillPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qtyStr   = quantity.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const noteSuffix = extra?.note ? ` · ${extra.note}` : "";
  const title    = `${side} ${symbol} filled on ${exchange}${dryRun ? " (dry-run)" : ""}${noteSuffix}`;
  const message  = `${side} ${qtyStr} ${symbol} @ $${priceStr} on ${exchange}${noteSuffix}`;

  // Customer can mute live-fill push alerts in Profile → Alert Preferences
  // ("Live Trade Filled"). We ALWAYS persist the in-app notification row so
  // the fill remains visible in the notification feed/history — only the
  // background push to the device is suppressed when the toggle is off.
  let pushAllowed = true;
  try {
    const [settingsRow] = await db
      .select({ notificationsLiveFills: userSettingsTable.notificationsLiveFills })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    if (settingsRow && settingsRow.notificationsLiveFills === false) {
      pushAllowed = false;
    }
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: failed to load notificationsLiveFills preference; defaulting to enabled",
    );
  }

  const notifData: Record<string, unknown> = {
    symbol, side, exchange, fillPrice, quantity, exchangeOrderId, dryRun,
    ...(extra?.data ?? {}),
  };
  try {
    await db.insert(userNotificationsTable).values({
      userId,
      type:    "live_trade_filled",
      title,
      message,
      data:    notifData,
      read:    false,
    });
  } catch (err) {
    logger.warn(
      { userId, symbol, side, err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: failed to persist live_trade_filled notification row",
    );
  }
  if (!pushAllowed) return;
  // Fire-and-forget push to existing customer subscriptions
  void NotificationDispatcher.sendToUser(userId, {
    title,
    body:      message,
    notifType: "trade",
    tag:       `live-fill-${symbol}`,
    url:       "/aicandlez-app/portfolio",
    alertKey:  "liveTradeFilled",
    data:      { ...notifData, kind: "live_trade_filled" },
  }).catch((err) => {
    logger.warn(
      { userId, symbol, err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: push dispatch failed for live_trade_filled",
    );
  });
}

export async function emitLiveCloseNotification(params: {
  userId:           string;
  symbol:           string;
  side:             "BUY" | "SELL";
  exchange:         string;
  exitPrice:        number;
  quantity:         number;
  realizedPnL:      number;
  realizedPnLPct:   number;
  closeReason:      string;
  exchangeOrderId?: string;
  dryRun?:          boolean;
}): Promise<void> {
  const {
    userId, symbol, side, exchange, exitPrice, quantity,
    realizedPnL, realizedPnLPct, closeReason, exchangeOrderId, dryRun,
  } = params;
  const priceStr  = exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qtyStr    = quantity.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const pnlSign   = realizedPnL >= 0 ? "+" : "−";
  const pnlAbs    = Math.abs(realizedPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pnlPctStr = `${realizedPnL >= 0 ? "+" : "−"}${Math.abs(realizedPnLPct).toFixed(2)}%`;
  const reasonTag = closeReason.toUpperCase();
  const title     = `${side} ${symbol} closed on ${exchange} · ${reasonTag}${dryRun ? " (dry-run)" : ""}`;
  const message   = `Exited ${qtyStr} ${symbol} @ $${priceStr} · PnL ${pnlSign}$${pnlAbs} (${pnlPctStr})`;
  try {
    await db.insert(userNotificationsTable).values({
      userId,
      type:    "live_trade_closed",
      title,
      message,
      data:    {
        symbol, side, exchange, exitPrice, quantity,
        realizedPnL, realizedPnLPct, closeReason,
        exchangeOrderId: exchangeOrderId ?? null,
        dryRun: !!dryRun,
      },
      read:    false,
    });
  } catch (err) {
    logger.warn(
      { userId, symbol, side, err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: failed to persist live_trade_closed notification row",
    );
  }
  // Map the broker close reason onto the customer-facing alert taxonomy so
  // TP/SL mutes are honored independently of the generic "Trade Closed"
  // toggle. Anything else (manual close, trailing stop, AI exit, risk kill)
  // counts as a generic Trade Closed alert.
  const reasonAlertKey =
    closeReason === "TAKE_PROFIT" ? "takeProfitHit" :
    closeReason === "STOP_LOSS"   ? "stopLossHit"   :
                                    "tradeClosed";
  void NotificationDispatcher.sendToUser(userId, {
    title,
    body:      message,
    notifType: "trade",
    tag:       `live-close-${symbol}`,
    url:       "/aicandlez-app/portfolio",
    alertKey:  reasonAlertKey,
    data:      {
      symbol, side, exchange, exitPrice, quantity,
      realizedPnL, realizedPnLPct, closeReason,
      exchangeOrderId: exchangeOrderId ?? null,
      dryRun: !!dryRun,
      kind: "live_trade_closed",
    },
  }).catch((err) => {
    logger.warn(
      { userId, symbol, err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: push dispatch failed for live_trade_closed",
    );
  });
}

async function emitFailureNotification(
  userId: string,
  symbol: string,
  side:   "BUY" | "SELL",
  reason: string,
  exchange?: string,
): Promise<void> {
  try {
    await db.insert(userNotificationsTable).values({
      userId,
      type:    "live_trade_failed",
      title:   `Live ${side} ${symbol} failed`,
      message: reason,
      data:    { symbol, side, exchange: exchange ?? null, reason },
      read:    false,
    });
  } catch (err) {
    logger.warn(
      { userId, symbol, side, err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: failed to persist user_notifications row",
    );
  }
}

/**
 * Returns the list of userIds with an active, default, live-mode
 * exchange connection. These are the users the trading loop will fan
 * live orders out to on each confirmed signal.
 */
export async function listLiveExecutionUsers(): Promise<Array<{ userId: string; exchange: string }>> {
  try {
    const rows = await db
      .select({
        userId:      userExchangeConnectionsTable.userId,
        exchange:    userExchangeConnectionsTable.exchange,
        permissions: userExchangeConnectionsTable.permissions,
      })
      .from(userExchangeConnectionsTable)
      .where(
        and(
          eq(userExchangeConnectionsTable.isDefault,   true),
          eq(userExchangeConnectionsTable.status,      "active"),
          eq(userExchangeConnectionsTable.tradingMode, "live"),
        ),
      );
    // Exclude connections whose key is EXPLICITLY not trade-authorized so a
    // stale isDefault/live row can never re-enter the live auto fan-out
    // cohort. The open-path guard in placeLiveAutoOrderForUser is the hard
    // stop; this just keeps the cohort clean (no wasted fan-out / log noise).
    // Missing/undecided permissions remain eligible (backward compat).
    return rows
      .filter(r => r.permissions?.trade !== false)
      .map(r => ({ userId: r.userId, exchange: r.exchange }));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "liveUserExecution: listLiveExecutionUsers query failed",
    );
    return [];
  }
}

/**
 * Place a single live order for one customer through their own
 * connected exchange. All upstream gates (confidence floor, MTF,
 * risk engine, kill switch) must have already passed.
 */
// TEMP (controlled live test 2026-05-29): structured execution-trace logs that
// mark each stage of the live customer pipeline so we can confirm orders reach
// the broker and validate the end-to-end Coinbase path. Written to the `logs`
// table (queryable) AND the pino console. Remove once the volume gate / daily
// cap are tightened back after the first confirmed live fill.
async function recordExecTrace(
  event: string,
  level: "info" | "warn" | "error",
  details: Record<string, unknown>,
): Promise<void> {
  logger.info({ execTrace: event, ...details }, event);
  try {
    await db.insert(logsTable).values({
      id:      crypto.randomUUID(),
      type:    "trade",
      level,
      message: event,
      details: { ...details, execTrace: event },
    });
  } catch (err) {
    logger.warn({ err, event }, "recordExecTrace insert failed");
  }
}

export async function placeLiveAutoOrderForUser(
  req: LiveUserOrderRequest,
): Promise<LiveUserOrderResult> {
  const { userId, symbol, side, useSandbox = false } = req;
  // `sizeUSD` is reassigned below by the customer trade-size clamp (after the
  // 0PRE kill switch) so every downstream gate (0VOL log payloads, 0d risk
  // gate, 0LIQ liquidity guard, the final order placement) sees the
  // user-preferred size — not whatever the AI fan-out caller proposed.
  let sizeUSD = req.sizeUSD;

  // 0PRE. Customer-portal live-execution kill switch (Task #157).
  // The customer portal is paper-only; non-admin live execution is hard-
  // rejected unless explicitly re-enabled via env. Admins/super-admins
  // bypass — they may exist as authenticated users on the operator
  // terminal. Sandbox/testnet calls are also blocked when the flag is off
  // because they still hit the broker network layer via per-user creds.
  if (!isCustomerLiveExecutionEnabled()) {
    const operator = await isOperatorRole(userId);
    if (!operator) {
      const msg = "Live execution is operated by AICandlez and is not available from the customer portal.";
      executionStreamBus.emitEvent({
        type:     "order_rejected",
        severity: "warn",
        symbol, side, mode: "live",
        gate:     "customer_live_execution_disabled",
        reason:   "customer_live_execution_disabled",
        message:  msg,
        details:  { userId, useSandbox },
      });
      try {
        await db.insert(logsTable).values({
          id:      crypto.randomUUID(),
          type:    "trade",
          level:   "warn",
          message: `[customer_live_execution_disabled] ${msg}`,
          details: { userId, symbol, side, useSandbox, errorCode: "customer_live_execution_disabled" },
        });
      } catch (err) {
        logger.warn({ err, userId }, "liveUserExecution: customer-disabled log insert failed");
      }
      return { success: false, userId, errorCode: "customer_live_execution_disabled", error: msg };
    }
  }

  // 0SIZE. Customer trade-size enforcement (after kill switch, before all
  // downstream gates). The AI trading loop fan-out passes a globally-uniform
  // sizeUSD (engine default), but the customer chooses their per-trade size
  // in the PWA + Portal picker which writes `preferredLiveOrderSizeUsd` to
  // `user_settings`. We clamp the incoming sizeUSD to MIN(requested,
  // preferred) so the customer's pick is the upper bound the AI is ever
  // allowed to spend per entry — and so the liquidity guard math (0LIQ
  // below) operates on the actual size that will be sent to the broker.
  // Operators (admin / super-admin) bypass — the operator terminal calls
  // `placeLiveAutoOrder` (no userId), not this function, but a manual
  // admin-as-user call should not be artificially capped.
  {
    const operatorSize = await isOperatorRole(userId);
    if (!operatorSize) {
      let preferred: number = DEFAULT_TRADE_SIZE_USD;
      try {
        const [row] = await db
          .select({ size: userSettingsTable.preferredLiveOrderSizeUsd })
          .from(userSettingsTable)
          .where(eq(userSettingsTable.userId, userId))
          .limit(1);
        preferred = coerceTradeSizeToPreset(row?.size);
      } catch (err) {
        logger.warn({ err, userId }, "liveUserExecution: trade-size lookup failed — using default preset");
      }
      // Clamp to MIN: caller's request is treated as an upper bound (the
      // engine may have legacy callers proposing $50/$100), but the
      // customer's preferred size always wins when smaller. We never
      // UP-size — the customer's pick is the ceiling.
      const requested = Number.isFinite(sizeUSD) && sizeUSD > 0 ? sizeUSD : preferred;
      sizeUSD = Math.min(requested, preferred);
    }
  }

  // 0UNI. MANDATORY symbol-universe alignment gate.
  //
  // Customer execution symbols MUST be the intersection of the customer's
  // connected-exchange universe AND the engine ANALYZED universe
  // (`SUPPORTED_SYMBOLS` = the symbols the trading loop iterates and for which
  // it computes `engineStats.symbolBreakdowns`). A symbol outside that set can
  // NEVER have a breakdown, so the downstream 0VOL gate would always reject it
  // with the misleading "No recent volume analysis available" message after a
  // wasted broker-creds round-trip. We reject earlier, here, with a precise
  // `symbol_not_in_universe` errorCode so structurally-impossible symbols
  // (e.g. Kraken-only XMR/RUNE/FTM/KAS, or HYPE which is listed on neither
  // engine venue, for a Coinbase customer) never reach execution.
  //
  // This is the engine-universe half of the intersection. The exchange half is
  // enforced downstream by adapter symbol normalization
  // (`normalizeSymbolForVenue` → null → `unsupported_symbol`), so a symbol that
  // is in the engine universe but unsupported on THIS customer's connected
  // venue is still rejected before any real order ships.
  //
  // This gate does NOT touch confidence, MTF, volume thresholds, risk,
  // position sizing, or trade limits — it only restricts WHICH symbols are
  // eligible to enter those existing gates. Operators bypass (mirrors 0VOL):
  // the operator diagnostic path uses `placeLiveAutoOrder` (no userId) and may
  // legitimately probe symbols.
  {
    const uniSym = symbol.trim().toUpperCase();
    const operatorUni = await isOperatorRole(userId);
    if (!operatorUni && !SUPPORTED_SYMBOLS.includes(uniSym)) {
      const reason =
        `${uniSym} is outside the engine-analyzed execution universe — ` +
        `no signal breakdown is ever computed for it, so the order was ` +
        `rejected by the symbol-universe alignment gate.`;
      await emitFailureNotification(userId, symbol, side, reason);
      executionStreamBus.emitEvent({
        type:     "order_rejected",
        severity: "warn",
        symbol, side, sizeUSD, mode: "live",
        gate:     "symbol_universe",
        reason:   "symbol_not_in_universe",
        message:  `Live order REJECTED ${symbol} ${side} $${sizeUSD}: ${reason}`,
        details:  { userId },
      });
      try {
        await db.insert(logsTable).values({
          id:      crypto.randomUUID(),
          type:    "trade",
          level:   "warn",
          message: `[symbol_not_in_universe] ${reason}`,
          details: { userId, symbol, normalizedSymbol: uniSym, side, sizeUSD, errorCode: "symbol_not_in_universe" },
        });
      } catch (err) {
        logger.warn({ err, userId }, "liveUserExecution: universe-gate log insert failed");
      }
      return { success: false, userId, errorCode: "symbol_not_in_universe", error: reason };
    }
  }

  // 0VOL. MANDATORY volume-confirmation safety gate.
  //
  // Volume Filter is a baseline platform safety control for all customer
  // live execution — it is NOT an opt-in preference. Customers cannot
  // disable it; the per-user `user_settings.volume_filter` column is
  // server-locked to `true` (see `routes/userSettings.ts` PUT — the field
  // is stripped from the customer-writable allowlist). This gate enforces
  // the same invariant at the execution layer so a leaked client mutation,
  // a stale cached toggle, or a manual `/api/user/live-order` call cannot
  // route a customer order through thin order books / low-liquidity bars.
  //
  // The check reads the latest 5m breakdown computed by the trading loop
  // (`engineStats.symbolBreakdowns[symbol]`). Missing breakdowns fail
  // CLOSED — we refuse to ship a live customer order against a symbol the
  // engine hasn't analyzed yet rather than allow a slippage-risky fill.
  //
  // Admins / super-admins bypass — operator diagnostic flows (and the
  // global `engineStats.volumeFilter` toggle flipped via /engine/filters)
  // remain available for override / testing. Sandbox routes also bypass
  // because public testnets do not carry real liquidity risk.
  if (!useSandbox) {
    const operatorVol = await isOperatorRole(userId);
    if (!operatorVol) {
      const bd = engineStats.symbolBreakdowns[symbol];
      const volumeOk = bd?.volumeConfirmed === true;
      await recordExecTrace("execution_reached_volume_gate", "info", {
        userId, symbol, side, sizeUSD,
        hasBreakdown: !!bd, volumeConfirmed: bd?.volumeConfirmed ?? null,
        gateFraction: VOLUME_GATE_FRACTION,
      });
      if (!volumeOk) {
        const reason = bd
          ? `Volume below ${Math.round(VOLUME_GATE_FRACTION * 100)}% of 20-bar average — order rejected by mandatory volume safety gate.`
          : "No recent volume analysis available for this symbol — order rejected by mandatory volume safety gate.";
        await recordExecTrace("execution_volume_reject", "warn", {
          userId, symbol, side, sizeUSD,
          hasBreakdown: !!bd, volumeConfirmed: bd?.volumeConfirmed ?? null,
          gateFraction: VOLUME_GATE_FRACTION,
        });
        await emitFailureNotification(userId, symbol, side, reason);
        executionStreamBus.emitEvent({
          type:     "order_rejected",
          severity: "warn",
          symbol, side, sizeUSD, mode: "live",
          gate:     "volume_safety_gate",
          reason:   "volume_safety_gate",
          message:  `Live order REJECTED ${symbol} ${side} $${sizeUSD}: ${reason}`,
          details:  { userId, hasBreakdown: !!bd, volumeConfirmed: bd?.volumeConfirmed ?? null },
        });
        try {
          await db.insert(logsTable).values({
            id:      crypto.randomUUID(),
            type:    "trade",
            level:   "warn",
            message: `[volume_safety_gate] ${reason}`,
            details: { userId, symbol, side, sizeUSD, errorCode: "volume_safety_gate", hasBreakdown: !!bd, volumeConfirmed: bd?.volumeConfirmed ?? null },
          });
        } catch (err) {
          logger.warn({ err, userId }, "liveUserExecution: volume-gate log insert failed");
        }
        return { success: false, userId, errorCode: "volume_safety_gate", error: reason };
      }
      await recordExecTrace("execution_volume_pass", "info", {
        userId, symbol, side, sizeUSD,
        volumeConfirmed: bd?.volumeConfirmed ?? null,
        gateFraction: VOLUME_GATE_FRACTION,
      });
    }
  }

  // 0a. Admin-status guard — blocks suspended / disabled / force_paper users.
  // Sandbox routing still respects status (force_paper allows sandbox; that
  // path will not reach here because callers route sandbox through the
  // internal simulator, but `suspended` and `disabled` always block).
  const statusVerdict = await getUserStatusVerdict(userId);
  if (!statusVerdict.allowLive) {
    const msg = statusVerdict.reason ?? `Account ${statusVerdict.status} — live execution blocked`;
    await emitFailureNotification(userId, symbol, side, msg);
    executionStreamBus.emitEvent({
      type:     "order_rejected",
      severity: "warn",
      symbol, side, mode: "live",
      gate:     "user_status_blocked",
      reason:   "user_status_blocked",
      message:  msg,
      details:  { userId, status: statusVerdict.status },
    });
    try {
      await db.insert(logsTable).values({
        id:      crypto.randomUUID(),
        type:    "trade",
        level:   "warn",
        message: `[user_status_blocked] ${msg}`,
        details: { userId, symbol, side, status: statusVerdict.status, errorCode: "user_status_blocked" },
      });
    } catch (err) {
      logger.warn({ err, userId }, "liveUserExecution: status-block log insert failed");
    }
    return { success: false, userId, errorCode: "user_status_blocked", error: msg };
  }

  // 0a2. PER-USER AI ENABLED gate (fail-closed safety stop).
  // Reads `user_settings.autoMode` — the server-backed truth flipped by
  // POST /api/user/ai-trading/enable. When false, the user has explicitly
  // halted AI execution (or never enabled it). EVERY customer-side live
  // order MUST stop here. Admin/super-admin bypass — operator terminal
  // routes through the no-userId entry point but if an admin authenticates
  // and triggers this path manually we don't want their toggle to lock
  // them out. Missing settings row → fail-closed (treat as disabled).
  {
    const operatorAi = await isOperatorRole(userId);
    if (!operatorAi) {
      let userAiEnabled = false;
      try {
        const [row] = await db
          .select({ autoMode: userSettingsTable.autoMode })
          .from(userSettingsTable)
          .where(eq(userSettingsTable.userId, userId))
          .limit(1);
        userAiEnabled = row?.autoMode === true;
      } catch (err) {
        logger.warn({ err, userId }, "liveUserExecution: user AI flag lookup failed — failing closed");
        userAiEnabled = false;
      }
      if (!userAiEnabled) {
        const msg = "AI trading is disabled for this account. Enable AI in your portal to resume execution.";
        await emitFailureNotification(userId, symbol, side, msg);
        executionStreamBus.emitEvent({
          type:     "order_rejected",
          severity: "warn",
          symbol, side, mode: "live",
          gate:     "user_ai_disabled",
          reason:   "user_ai_disabled",
          message:  msg,
          details:  { userId },
        });
        try {
          await db.insert(logsTable).values({
            id:      crypto.randomUUID(),
            type:    "trade",
            level:   "warn",
            message: `[user_ai_disabled] ${msg}`,
            details: { userId, symbol, side, errorCode: "user_ai_disabled" },
          });
        } catch (err) {
          logger.warn({ err, userId }, "liveUserExecution: user-ai-disabled log insert failed");
        }
        return { success: false, userId, errorCode: "user_ai_disabled", error: msg };
      }
    }
  }

  // 0b. Trade-limit guard — rolling 24h cap. Operators in the no-userId
  // path (`placeLiveAutoOrder` in exchangeEngine) skip this gate entirely.
  // Sandbox/testnet opens are real broker orders against the user's
  // exchange and still count toward the cap.
  const limitVerdict = await getTradeLimitVerdict(userId);
  if (limitVerdict.blocked) {
    const msg = `Trade limit reached (${limitVerdict.used24h}/${limitVerdict.capTier} in 24h) — try again after ${new Date(limitVerdict.windowResetsAt).toISOString()}`;
    await emitFailureNotification(userId, symbol, side, msg);
    executionStreamBus.emitEvent({
      type:     "order_rejected",
      severity: "warn",
      symbol, side, mode: "live",
      gate:     "trade_limit_exhausted",
      reason:   "trade_limit_exhausted",
      message:  msg,
      details:  {
        userId,
        used24h:        limitVerdict.used24h,
        capTier:        limitVerdict.capTier,
        windowResetsAt: limitVerdict.windowResetsAt,
      },
    });
    try {
      await db.insert(logsTable).values({
        id:      crypto.randomUUID(),
        type:    "trade",
        level:   "warn",
        message: `[trade_limit_exhausted] ${msg}`,
        details: {
          userId, symbol, side,
          used24h:        limitVerdict.used24h,
          capTier:        limitVerdict.capTier,
          windowResetsAt: limitVerdict.windowResetsAt,
          errorCode:      "trade_limit_exhausted",
        },
      });
    } catch (err) {
      logger.warn({ err, userId }, "liveUserExecution: trade-limit log insert failed");
    }
    return { success: false, userId, errorCode: "trade_limit_exhausted", error: msg };
  }

  // 0c. Controlled-beta concurrent live-trade ceiling (platform-wide).
  // Counts open `sim_positions` with `exchange IS NOT NULL` across all users
  // — this mirrors how operator telemetry counts "open live positions". When
  // the count reaches the cap, every subsequent customer live order
  // (manual + trading-loop fan-out) is rejected. Admin / super-admin bypass
  // so operator tooling that happens to authenticate as a real user is
  // unaffected. `0` disables the gate.
  const concurrentCap = getLiveExecutionConcurrentCap();
  if (concurrentCap > 0) {
    const operator = await isOperatorRole(userId);
    // Operators (admin/super-admin) AND internal/QA accounts bypass the
    // platform-wide controlled-beta concurrent cap entirely.
    const internal = operator ? false : await isInternalAccount(userId);
    if (!operator && !internal) {
      const openLive = await countOpenLivePositions();
      if (openLive >= concurrentCap) {
        const msg = `Platform live-execution capacity reached (${openLive}/${concurrentCap} concurrent live trades) — controlled-beta limit`;
        await emitFailureNotification(userId, symbol, side, msg);
        executionStreamBus.emitEvent({
          type:     "order_rejected",
          severity: "warn",
          symbol, side, mode: "live",
          gate:     "concurrent_live_cap_reached",
          reason:   "concurrent_live_cap_reached",
          message:  msg,
          details:  { userId, openLive, concurrentCap },
        });
        try {
          await db.insert(logsTable).values({
            id:      crypto.randomUUID(),
            type:    "trade",
            level:   "warn",
            message: `[concurrent_live_cap_reached] ${msg}`,
            details: { userId, symbol, side, openLive, concurrentCap, errorCode: "concurrent_live_cap_reached" },
          });
        } catch (err) {
          logger.warn({ err, userId }, "liveUserExecution: concurrent-cap log insert failed");
        }
        return { success: false, userId, errorCode: "concurrent_live_cap_reached", error: msg };
      }
    }
  }

  // 0LIQ. Customer AI Liquidity Cushion + Plan-tier Max-open guard.
  //
  // After the platform-wide concurrent cap (0c) but BEFORE the per-user
  // risk budget (0d). Two failure modes, both customer-protective:
  //
  //   (a) plan_max_positions_reached — user's open LIVE position count
  //       already meets the plan-tier ceiling (starter=3, pro=6, elite=12, free=0).
  //       Even with infinite cash, the AI cannot open another entry.
  //
  //   (b) liquidity_protected — user does have an open slot, but their
  //       available cash is below the required floor to safely fund the
  //       REMAINING slots at their chosen trade size + round-trip fees +
  //       a small safety cushion. The AI pauses new entries to preserve
  //       the fee/cash cushion. Existing positions are untouched.
  //
  // Operator (admin / super-admin) bypass — operator tooling is not subject
  // to plan-tier caps. Sandbox routes ALSO bypass: testnets don't consume
  // real cash, so the liquidity floor is meaningless there. The math lives
  // in `lib/liquidityGuard.ts` so this gate and `GET /user/ai-trading/
  // liquidity` (read-only UI status feed) cannot drift.
  if (!useSandbox) {
    const operatorLiq = await isOperatorRole(userId);
    if (!operatorLiq) {
      // Internal/QA accounts skip the plan-tier max-open-positions cap but
      // STILL run the liquidity cushion (sized to the single pending entry).
      const internalLiq = await isInternalAccount(userId);
      try {
        const [gate, openLiveRow, cashRow] = await Promise.all([
          resolveAiTradingGate(userId),
          db.select({ n: sql<number>`count(*)::int` })
            .from(simPositionsTable)
            .where(and(
              eq(simPositionsTable.userId, userId),
              isNotNull(simPositionsTable.exchange),
            )),
          db.select({ cash: simAccountsTable.cashBalance })
            .from(simAccountsTable)
            .where(eq(simAccountsTable.userId, userId))
            .limit(1),
        ]);

        const verdict = evaluateLiquidityGuard({
          plan:                gate.plan,
          openLiveCount:       Number(openLiveRow[0]?.n ?? 0),
          tradeSizeUsd:        sizeUSD,
          availableCashUsd:    Number(cashRow[0]?.cash ?? 0),
          unlimitedPositions:  internalLiq,
        });

        if (!verdict.ok) {
          const errCode = verdict.reasonCode === "plan_max_positions_reached"
            ? ("plan_max_positions_reached" as const)
            : ("liquidity_protected" as const);
          const userFacing = errCode === "liquidity_protected"
            ? "LIQUIDITY PROTECTED — AI paused new entries to preserve fee/cash cushion."
            : (verdict.message ?? "Plan capacity reached for AI positions.");
          await emitFailureNotification(userId, symbol, side, userFacing);
          executionStreamBus.emitEvent({
            type:     "order_rejected",
            severity: "warn",
            symbol, side, sizeUSD, mode: "live",
            gate:     errCode,
            reason:   errCode,
            message:  userFacing,
            details:  {
              userId,
              plan:             gate.plan,
              planMaxOpen:      verdict.planMaxOpen,
              remainingSlots:   verdict.remainingSlots,
              tradeSizeUsd:     sizeUSD,
              availableCashUsd: verdict.availableCashUsd,
              requiredCashUsd:  verdict.requiredCashUsd,
            },
          });
          try {
            await db.insert(logsTable).values({
              id:      crypto.randomUUID(),
              type:    "trade",
              level:   "warn",
              message: `[${errCode}] ${userFacing}`,
              details: {
                userId, symbol, side, sizeUSD,
                errorCode:        errCode,
                plan:             gate.plan,
                planMaxOpen:      verdict.planMaxOpen,
                remainingSlots:   verdict.remainingSlots,
                availableCashUsd: verdict.availableCashUsd,
                requiredCashUsd:  verdict.requiredCashUsd,
                allowedTradeSizes: ALLOWED_TRADE_SIZES,
              },
            });
          } catch (err) {
            logger.warn({ err, userId }, "liveUserExecution: 0LIQ log insert failed");
          }
          return { success: false, userId, errorCode: errCode, error: userFacing };
        }
      } catch (err) {
        // Fail-CLOSED: any DB lookup failure during liquidity evaluation
        // is treated as "cannot safely authorize a new live entry right
        // now". This matches the rest of the user-side gates (0a2 AI
        // flag, 0a status guard).
        logger.error({ err, userId, symbol, side }, "liveUserExecution: 0LIQ evaluation failed — failing closed");
        const msg = "LIQUIDITY PROTECTED — AI paused new entries to preserve fee/cash cushion.";
        await emitFailureNotification(userId, symbol, side, msg);
        // Mirror the normal 0LIQ reject sinks so fail-closed events are
        // visible on the execution stream + logsTable, not only the
        // server-side logger. Without these, a transient DB hiccup would
        // silently block customer entries with no operator-visible
        // telemetry trail.
        executionStreamBus.emitEvent({
          type:     "order_rejected",
          severity: "warn",
          symbol, side, sizeUSD, mode: "live",
          gate:     "liquidity_protected",
          reason:   "liquidity_protected",
          message:  msg,
          details:  { userId, failClosed: true, err: String(err) },
        });
        try {
          await db.insert(logsTable).values({
            id:      crypto.randomUUID(),
            type:    "trade",
            level:   "warn",
            message: `[liquidity_protected] ${msg} (fail-closed)`,
            details: {
              userId, symbol, side, sizeUSD,
              errorCode:  "liquidity_protected",
              failClosed: true,
              err:        String(err),
            },
          });
        } catch (logErr) {
          logger.warn({ err: logErr, userId }, "liveUserExecution: 0LIQ fail-closed log insert failed");
        }
        return { success: false, userId, errorCode: "liquidity_protected", error: msg };
      }
    }
  }

  // 0d. Per-user AI risk budget. User-defined caps (max per-trade, max
  // simultaneous, max total allocation, reserve cash) enforced against
  // a live equity + open-exposure snapshot. Admin/super-admin bypass —
  // operator path is governed by platform-wide controls (0a–0c), not
  // a customer's self-imposed budget. See `lib/riskGate.ts`.
  {
    const operatorRisk = await isOperatorRole(userId);
    if (!operatorRisk) {
      const verdict = await evaluateRiskGate({ userId, intendedSizeUsd: sizeUSD });
      if (!verdict.allowed) {
        const { reasonCode, reasonText, snapshot } = verdict;
        await emitFailureNotification(userId, symbol, side, reasonText);
        executionStreamBus.emitEvent({
          type:     "order_rejected",
          severity: "warn",
          symbol, side, mode: "live",
          gate:     reasonCode,
          reason:   reasonCode,
          message:  reasonText,
          details:  { userId, snapshot },
        });
        try {
          const [userRow] = await db
            .select({ email: usersTable.email })
            .from(usersTable)
            .where(eq(usersTable.clerkUserId, userId))
            .limit(1);
          await db.insert(riskThrottleEventsTable).values({
            userId,
            userEmail:       userRow?.email ?? null,
            symbol, side,
            intendedSizeUsd: sizeUSD,
            equityUsd:       snapshot.equityUsd,
            openCount:       snapshot.openCount,
            openNotionalUsd: snapshot.openNotionalUsd,
            reasonCode,
            reasonText,
            snapshot,
          });
        } catch (err) {
          logger.warn({ err, userId }, "liveUserExecution: risk_throttle_events insert failed");
        }
        try {
          await db.insert(logsTable).values({
            id:      crypto.randomUUID(),
            type:    "trade",
            level:   "warn",
            message: `[${reasonCode}] ${reasonText}`,
            details: { userId, symbol, side, sizeUSD, snapshot, errorCode: reasonCode },
          });
        } catch (err) {
          logger.warn({ err, userId }, "liveUserExecution: risk-gate log insert failed");
        }
        return { success: false, userId, errorCode: reasonCode, error: reasonText };
      }
    }
  }

  // 0e. AI Trading eligibility & risk disclaimer. Customer MUST have
  // affirmatively accepted the current disclaimer (18+, jurisdictional
  // legality, financial responsibility) before any live AI order is
  // placed. Server-enforced so a tampered frontend cannot bypass it.
  // Admin/super-admin bypass — operators are not subject to the consumer
  // eligibility flow. See `lib/aiDisclaimer.ts`.
  {
    const operatorDisclaimer = await isOperatorRole(userId);
    if (!operatorDisclaimer) {
      const accepted = await isAiDisclaimerAccepted(userId);
      if (!accepted) {
        const msg = "AI trading disclaimer not accepted — open the AI panel and confirm eligibility to continue.";
        await emitFailureNotification(userId, symbol, side, msg);
        executionStreamBus.emitEvent({
          type:     "order_rejected",
          severity: "warn",
          symbol, side, mode: "live",
          gate:     "ai_disclaimer_not_accepted",
          reason:   "ai_disclaimer_not_accepted",
          message:  msg,
          details:  { userId },
        });
        try {
          await db.insert(logsTable).values({
            id:      crypto.randomUUID(),
            type:    "trade",
            level:   "warn",
            message: `[ai_disclaimer_not_accepted] ${msg}`,
            details: { userId, symbol, side, sizeUSD, errorCode: "ai_disclaimer_not_accepted" },
          });
        } catch (err) {
          logger.warn({ err, userId }, "liveUserExecution: ai-disclaimer log insert failed");
        }
        return { success: false, userId, errorCode: "ai_disclaimer_not_accepted", error: msg };
      }
    }
  }

  // 0f. LOW-CONFIDENCE FILTER (hard execution gate).
  // Separation of signal visibility from execution eligibility — signals
  // may render in the UI (visually muted, marked LOW CONFIDENCE) but a
  // signal whose engine `avgConfidence` falls below the caller's
  // `user_settings.minConfidence` MUST NEVER reach the broker. This is the
  // canonical pre-Kraken-live invariant. The trading-loop fan-out already
  // checks per-user minConfidence at the per-symbol level (tradingLoop.ts
  // ~line 1153) but the manual `POST /api/user/live-order` path bypasses
  // that funnel — without this gate a customer could click TRADE on a
  // muted card and route a sub-threshold order. Operators (admin /
  // super-admin) bypass: the admin terminal commands live execution from
  // server-side env keys and is not subject to the customer threshold.
  //
  // Missing engine breakdown (symbol never analyzed this session) →
  // fail-closed: refuse the order with a "no_signal" reason so we never
  // ship an order against a signal we can't verify. Missing user settings
  // row → fail back to engine BASELINE_MIN_CONFIDENCE (60) so a brand-new
  // customer is held to the same floor as the platform default.
  {
    const operatorConf = await isOperatorRole(userId);
    if (!operatorConf) {
      let userMinConfidence = BASELINE_MIN_CONFIDENCE;
      try {
        const [settingsRow] = await db
          .select({ minConfidence: userSettingsTable.minConfidence })
          .from(userSettingsTable)
          .where(eq(userSettingsTable.userId, userId))
          .limit(1);
        if (settingsRow && typeof settingsRow.minConfidence === "number") {
          userMinConfidence = settingsRow.minConfidence;
        }
      } catch (err) {
        logger.warn({ err, userId }, "liveUserExecution: minConfidence lookup failed — falling back to engine baseline");
      }

      // CONF EXPERIMENT: clamp the per-user live floor DOWN to the experiment
      // knob (default 50) so the platform-wide 50-floor experiment actually
      // reaches customers whose personal user_settings.minConfidence is higher
      // (schema default 60). Never RAISES a user who chose a lower personal
      // floor. Revert with EXPERIMENT_CONF_FLOOR=65.
      userMinConfidence = Math.min(userMinConfidence, EXPERIMENT_CONF_FLOOR);

      const breakdown = engineStats.symbolBreakdowns[symbol];
      if (!breakdown) {
        const msg = `No engine signal available for ${symbol} — refusing to route execution against an unverified signal.`;
        await emitFailureNotification(userId, symbol, side, msg);
        logger.warn(
          { userId, symbol, side, threshold: userMinConfidence, reason: "no_signal" },
          "[execution-gate] blocked low confidence signal",
        );
        executionStreamBus.emitEvent({
          type:     "order_rejected",
          severity: "warn",
          symbol, side, mode: "live",
          gate:     "low_confidence_signal",
          reason:   "no_signal",
          message:  msg,
          details:  { userId, threshold: userMinConfidence, reason: "no_signal" },
        });
        try {
          await db.insert(logsTable).values({
            id:      crypto.randomUUID(),
            type:    "trade",
            level:   "warn",
            message: `[execution-gate] blocked low confidence signal — ${symbol}: no engine signal (threshold ${userMinConfidence}%)`,
            details: { userId, symbol, side, threshold: userMinConfidence, reason: "no_signal", errorCode: "low_confidence_signal" },
          });
        } catch (err) {
          logger.warn({ err, userId }, "liveUserExecution: low-confidence log insert failed");
        }
        return { success: false, userId, errorCode: "low_confidence_signal", error: msg };
      }

      // Two-layer check: (a) global executionEligible flag (HOLD bias /
      // no MTF / sideways / sub-baseline conf), then (b) per-user
      // minConfidence on top. Layer (a) catches structural blocks; layer
      // (b) catches users who have tightened their personal threshold
      // above baseline.
      const subUserThreshold = breakdown.avgConfidence < userMinConfidence;

      // ── [CONFIDENCE_GATE] TELEMETRY (temporary — confidence-pipeline audit)
      // Emits one structured log per evaluation (pass AND block) so the full
      // distribution of signalConfidence vs userMinConfidence is observable.
      // Existing logger.warn below only fires on block; this captures passes
      // too. Remove once the audit is closed.
      logger.info(
        {
          tag:               "CONFIDENCE_GATE",
          signalConfidence:  breakdown.avgConfidence,
          userMinConfidence,
          passed:            !subUserThreshold && breakdown.executionEligible,
          symbol,
          userId,
          executionPath:     "placeLiveAutoOrderForUser",
          executionEligible: breakdown.executionEligible,
          blockReason:       breakdown.executionBlockReason,
        },
        "[CONFIDENCE_GATE] eval",
      );


      if (!breakdown.executionEligible || subUserThreshold) {
        const reason: string = subUserThreshold && breakdown.executionEligible
          ? "low_confidence"
          : (breakdown.executionBlockReason ?? "low_confidence");
        const msg =
          `LOW CONFIDENCE — ${symbol} signal confidence ${breakdown.avgConfidence.toFixed(1)}% ` +
          `is below your minimum threshold of ${userMinConfidence}% (reason: ${reason}). ` +
          `Live execution blocked.`;
        await emitFailureNotification(userId, symbol, side, msg);
        logger.warn(
          {
            userId,
            asset:      symbol,
            confidence: breakdown.avgConfidence,
            threshold:  userMinConfidence,
            reason,
          },
          "[execution-gate] blocked low confidence signal",
        );
        executionStreamBus.emitEvent({
          type:       "confidence_too_low",
          severity:   "warn",
          symbol, side, mode: "live",
          confidence: breakdown.avgConfidence,
          gate:       "low_confidence_signal",
          reason,
          message:    msg,
          details:    { userId, confidence: breakdown.avgConfidence, threshold: userMinConfidence, reason },
        });
        try {
          await db.insert(logsTable).values({
            id:      crypto.randomUUID(),
            type:    "trade",
            level:   "warn",
            message: `[execution-gate] blocked low confidence signal — ${symbol} conf=${breakdown.avgConfidence.toFixed(1)}% threshold=${userMinConfidence}% reason=${reason}`,
            details: {
              userId, symbol, side,
              asset:      symbol,
              confidence: breakdown.avgConfidence,
              threshold:  userMinConfidence,
              reason,
              errorCode:  "low_confidence_signal",
            },
          });
        } catch (err) {
          logger.warn({ err, userId }, "liveUserExecution: low-confidence log insert failed");
        }
        return { success: false, userId, errorCode: "low_confidence_signal", error: msg };
      }
    }
  }

  // 1. Resolve default live connection
  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId,      userId),
        eq(userExchangeConnectionsTable.isDefault,   true),
        eq(userExchangeConnectionsTable.status,      "active"),
        eq(userExchangeConnectionsTable.tradingMode, "live"),
      ),
    )
    .limit(1);

  if (!row) {
    const msg = "No default live exchange connection configured";
    await emitFailureNotification(userId, symbol, side, msg);
    return { success: false, userId, errorCode: "no_connection", error: msg };
  }

  // 1b. Trade-authorization gate (defense-in-depth at the real-money
  // chokepoint). Runtime-state resolution + the cohort writeback + PUT
  // /user/settings now all exclude trade-unauthorized venues, but a row
  // PREVIOUSLY promoted to isDefault/live could still survive with an API
  // key whose detected permissions are explicitly { trade: false }. Refuse
  // to OPEN a live position on such a connection so no real order can ship
  // through an unauthorized venue. Missing/undecided permissions are treated
  // as authorized (backward compat). NOTE: this gate is intentionally on the
  // OPEN path only — `placeLiveCloseOrderForUser` is NOT gated, so an exit
  // is never trapped by a permission flag.
  if (row.permissions?.trade === false) {
    const msg = `${row.exchange} API key is not authorized for trading — reconnect with trade permission enabled`;
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "not_trade_authorized", error: msg };
  }

  // 2. Decrypt credentials
  let creds = vault.decryptBlob(userId, row.encryptedBlob);
  if (!creds) {
    const msg = `Could not decrypt stored credentials for ${row.exchange} — please reconnect`;
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    // Mark connection as errored so the user is prompted to reconnect
    try {
      await db
        .update(userExchangeConnectionsTable)
        .set({ status: "error", lastError: "Decryption failed", updatedAt: new Date() })
        .where(eq(userExchangeConnectionsTable.id, row.id));
    } catch { /* non-fatal */ }
    return { success: false, userId, exchange: row.exchange, errorCode: "decrypt_failed", error: msg };
  }

  // 2b. Refresh Alpaca OAuth token if it's about to expire. Failures here
  // mark the row errored and surface as exchange_reject so the user gets
  // a notification + the UI can prompt re-auth.
  try {
    creds = await ensureFreshAlpacaCreds(userId, row, creds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "exchange_reject", error: msg };
  }

  // 2.5 Pre-execution venue symbol-support check (hoisted above getTicker
  // per 2026-05-28 fix). 2026-05 unification: now routes through the
  // canonical `normalizeExecutionSymbol` resolver so coinbase / kraken /
  // binance ALL pre-flight through the same code path that the gateway
  // pass (planned) will share with AI-engine + manual BUY/SELL. Symbols
  // removed from the registry (e.g. MKRUSD, HYPEUSD on coinbase) return
  // the structured `unsupported_symbol` errorCode + `supportedExchanges`
  // hint rather than a downstream `price_unavailable` from the failing
  // ticker call. `no_map` venues abstain — the adapter's own
  // UnsupportedSymbolError still catches misses (see step 5).
  const preflightNormalize = normalizeExecutionSymbol(symbol, row.exchange);
  if (preflightNormalize.ok === false && preflightNormalize.reason === "unsupported_symbol") {
    const msg = preflightNormalize.supportedExchanges.length > 0
      ? `${symbol} is not listed on ${row.exchange} — try ${preflightNormalize.supportedExchanges.join(" or ")}`
      : `${symbol} is not listed on any supported venue`;
    logger.warn(
      {
        tag:                "SYMBOL_NORMALIZE_REJECT",
        userId,
        symbol,
        exchange:           row.exchange,
        supportedExchanges: preflightNormalize.supportedExchanges,
        stage:              "pre-ticker",
      },
      "[SYMBOL_NORMALIZE_REJECT] placeLiveAutoOrderForUser pre-ticker",
    );
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return {
      success:   false,
      userId,
      exchange:  row.exchange,
      errorCode: "unsupported_symbol",
      error:     msg,
    };
  }

  // 3. Reference price → base quantity
  let referencePrice: number;
  try {
    const ticker = await getTicker(symbol);
    referencePrice = ticker.price;
  } catch (err) {
    const msg = `Failed to fetch reference price for ${symbol}: ${err instanceof Error ? err.message : String(err)}`;
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "price_unavailable", error: msg };
  }
  if (!(referencePrice > 0)) {
    const msg = `Invalid reference price (${referencePrice}) for ${symbol}`;
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "price_unavailable", error: msg };
  }

  const qtyBase = parseFloat((sizeUSD / referencePrice).toFixed(8));
  if (qtyBase <= 0) {
    const msg = "Computed base quantity is zero — order skipped";
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "exchange_reject", error: msg };
  }

  // 4. Dry-run short-circuit (pilot rollout safety net)
  if (isDryRunEnabled()) {
    logger.info(
      { userId, exchange: row.exchange, symbol, side, sizeUSD, qtyBase, referencePrice },
      "liveUserExecution: DRY-RUN — adapter call skipped",
    );
    const dryResult: LiveUserOrderResult = {
      success:         true,
      userId,
      exchange:        row.exchange,
      exchangeOrderId: `DRYRUN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fillPrice:       parseFloat(referencePrice.toFixed(2)),
      quantity:        qtyBase,
      dryRun:          true,
    };
    await emitFillNotification(
      userId, symbol, side, row.exchange,
      dryResult.fillPrice!, dryResult.quantity!, dryResult.exchangeOrderId!, true,
    );
    invalidateTradeLimitCache(userId);
    return dryResult;
  }

  // 5. Build adapter + place order
  // When `useSandbox` is true, the caller wants paper-mode behavior routed
  // through the exchange's public sandbox. Refuse loudly if the exchange has
  // no sandbox — the caller is supposed to fall back to the internal
  // simulator on its side rather than ever silently hitting production with
  // a "sandbox" expectation.
  if (useSandbox && !hasSandbox(row.exchange)) {
    const msg = `${row.exchange} has no public sandbox — paper-mode order falls back to internal simulator`;
    return { success: false, userId, exchange: row.exchange, errorCode: "no_sandbox", error: msg };
  }

  // 2026-05 unification — single canonical pre-flight via
  // `normalizeExecutionSymbol`. Replaces the prior coinbase/kraken-only
  // `isSymbolSupportedOn` branch with the catalogue-wide resolver:
  //   - `ok:true`               → proceed to adapter
  //   - `unsupported_symbol`    → hard reject with structured errorCode
  //                               and the venues that DO carry the pair
  //   - `no_map`                → abstain at this layer (we have no
  //                               symbol table for that venue); the
  //                               adapter's own validation is still
  //                               authoritative and will throw
  //                               UnsupportedSymbolError on miss.
  // Logs `[SYMBOL_NORMALIZE_REJECT]` so the rejection is grep-able
  // separately from generic adapter throws.
  const normalize = normalizeExecutionSymbol(symbol, row.exchange);
  if (normalize.ok === false && normalize.reason === "unsupported_symbol") {
    const msg = normalize.supportedExchanges.length > 0
      ? `${symbol} is not listed on ${row.exchange} — try ${normalize.supportedExchanges.join(" or ")}`
      : `${symbol} is not listed on any supported venue`;
    logger.warn(
      {
        tag:                "SYMBOL_NORMALIZE_REJECT",
        userId,
        symbol,
        exchange:           row.exchange,
        supportedExchanges: normalize.supportedExchanges,
      },
      "[SYMBOL_NORMALIZE_REJECT] placeLiveAutoOrderForUser pre-flight",
    );
    return {
      success:   false,
      userId,
      exchange:  row.exchange,
      errorCode: "unsupported_symbol",
      error:     msg,
    };
  }
  if (normalize.ok === true) {
    logger.debug(
      {
        tag:      "SYMBOL_NORMALIZE_OK",
        userId,
        symbol,
        exchange: row.exchange,
        native:   normalize.native,
      },
      "[SYMBOL_NORMALIZE_OK] placeLiveAutoOrderForUser pre-flight",
    );
  }

  let adapter: BaseExchangeAdapter;
  try {
    adapter = makeAdapter(row.exchange, creds, { testnet: useSandbox, demoMode: row.demoMode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "unsupported", error: msg };
  }

  // Tracks whether a real broker fill landed. Once true, a throw from any
  // downstream side-effect (notification, cache invalidation) must NOT emit a
  // false `execution_order_rejected` — the order already filled.
  let filled = false;
  try {
    await recordExecTrace(`execution_submitted_${row.exchange.toLowerCase()}`, "info", {
      userId, symbol, side, sizeUSD, exchange: row.exchange, qtyBase, referencePrice,
    });
    let order = await adapter.placeOrder({
      symbol,
      side:     side === "BUY" ? "buy" : "sell",
      type:     "market",
      qty:      qtyBase,
      clientId: `loop-u-${userId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });

    // Poll for the true execution. Many exchanges (e.g. Kraken) return
    // status="open" with avgFillPrice=0 on the initial market-order ack,
    // even though the fill lands moments later. Without this poll the
    // open path falls back to the ticker price and the recorded entry
    // price for the live position drifts from the actual broker fill.
    const idForPoll = order.exchangeOrderId || order.id;
    let timedOut = false;
    const isTerminal = (s: StandardOrder["status"]) =>
      s === "filled" || s === "cancelled" || s === "rejected";
    if (idForPoll && !isTerminal(order.status)) {
      const poll = await pollOrderUntilFilled(adapter, idForPoll, symbol, {
        timeoutMs:  5000,
        intervalMs: 500,
        logCtx:     { userId, exchange: row.exchange, symbol, side },
      });
      if (poll.order) order = poll.order;
      timedOut = poll.timedOut && !isTerminal(order.status);
    }

    const requestedQty = order.requestedQty > 0 ? order.requestedQty : qtyBase;
    const unfilled     = !(order.filledQty > 0);
    const partial      = order.filledQty > 0 && order.filledQty < requestedQty - 1e-12;

    // Hard failures: rejected, cancelled, or timed out with no fill at all.
    if (order.status === "rejected" || order.status === "cancelled" || (timedOut && unfilled)) {
      const reasonMsg = timedOut
        ? `Open order ${idForPoll} did not fill within 5s on ${row.exchange} (status=${order.status})`
        : `Open order ${idForPoll} ${order.status} on ${row.exchange}`;
      logger.warn(
        { userId, exchange: row.exchange, symbol, side,
          status: order.status, timedOut, filledQty: order.filledQty, requestedQty },
        "liveUserExecution: open order not filled",
      );
      await recordExecTrace("execution_order_rejected", "warn", {
        userId, symbol, side, exchange: row.exchange,
        status: order.status, timedOut, error: reasonMsg,
      });
      await emitFailureNotification(userId, symbol, side, reasonMsg, row.exchange);
      return { success: false, userId, exchange: row.exchange, errorCode: "exchange_reject", error: reasonMsg };
    }

    // Past the hard-failure branch — the order is a real fill (full or partial).
    filled = true;
    const fill = order.avgFillPrice > 0 ? order.avgFillPrice : referencePrice;
    // Prefer the broker-reported commission when the adapter actually
    // populated `fee.source === "broker"`. Estimates (catalog rate * notional)
    // are intentionally NOT forwarded as brokerFee — closeUserPosition will
    // fall back to its own catalog estimate if brokerFee is undefined.
    // Accept 0 and negative (maker rebate) amounts as legitimate broker
    // values — only gate on a finite number with source === "broker".
    const brokerFeeOpen =
      order.fee && order.fee.source === "broker" && Number.isFinite(order.fee.amount)
        ? { amount: parseFloat(order.fee.amount.toFixed(8)), currency: order.fee.currency }
        : undefined;
    const result: LiveUserOrderResult = {
      success:         true,
      userId,
      exchange:        row.exchange,
      exchangeOrderId: order.exchangeOrderId || order.id,
      fillPrice:       parseFloat(fill.toFixed(2)),
      quantity:        order.filledQty > 0 ? order.filledQty : qtyBase,
      brokerFee:         brokerFeeOpen?.amount,
      brokerFeeCurrency: brokerFeeOpen?.currency,
    };

    const note = timedOut
      ? "partial fill — poll timed out"
      : partial
        ? "partial fill"
        : undefined;

    logger.info(
      { userId, exchange: row.exchange, symbol, side, sizeUSD,
        fillPrice: result.fillPrice, exchangeOrderId: result.exchangeOrderId,
        status: order.status, partial, timedOut,
        filledQty: order.filledQty, requestedQty },
      "liveUserExecution: order filled",
    );
    await emitFillNotification(
      userId, symbol, side, row.exchange,
      result.fillPrice!, result.quantity!, result.exchangeOrderId ?? "", false,
      note
        ? { note, data: { partial, timedOut, requestedQty, status: order.status } }
        : undefined,
    );
    await recordExecTrace("execution_order_accepted", "info", {
      userId, symbol, side, exchange: row.exchange,
      exchangeOrderId: result.exchangeOrderId,
      fillPrice: result.fillPrice, quantity: result.quantity,
    });
    invalidateTradeLimitCache(userId);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, exchange: row.exchange, symbol, side, err: msg }, "liveUserExecution: adapter placeOrder failed");
    // Only a genuine pre-fill failure is a rejection. A throw after `filled`
    // (e.g. notification/cache side-effect) must not masquerade as a reject.
    if (!filled) {
      await recordExecTrace("execution_order_rejected", "error", {
        userId, symbol, side, exchange: row.exchange, error: msg,
      });
    }
    await emitFailureNotification(userId, symbol, side, `Exchange rejected order: ${msg}`, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "exchange_reject", error: msg };
  }
}

/**
 * Place a real broker-side close (flatten) order for a customer's existing
 * live position. Submits a market order on the opposite side of the open
 * fill, on the same exchange the open landed on. Returns a distinct
 * close-side `exchangeCloseOrderId` so trade history can surface both
 * the open and close references.
 *
 * Failure modes mirror `placeLiveAutoOrderForUser` plus `exchange_mismatch`
 * when the user's current default live connection no longer matches the
 * exchange that opened the position (defensive — should be rare).
 *
 * Dry-run path: when LIVE_TRADE_DRY_RUN === "true", returns a synthetic
 * `DRYRUN-CLOSE-…` reference and skips the adapter call.
 */
export async function placeLiveCloseOrderForUser(
  req: LiveUserCloseRequest,
): Promise<LiveUserCloseResult> {
  const { userId, symbol, openSide, quantity, exchange, useSandbox = false } = req;
  const closeSide: "BUY" | "SELL" = openSide === "BUY" ? "SELL" : "BUY";

  // 0PRE. Customer-portal live-execution kill switch (Task #157).
  // Symmetric with `placeLiveAutoOrderForUser` — a customer should not be
  // able to execute a real broker close any more than they can execute a
  // real broker open. Admins/super-admins bypass. Sandbox is also blocked
  // (still hits broker network via per-user creds).
  if (!isCustomerLiveExecutionEnabled()) {
    const operator = await isOperatorRole(userId);
    if (!operator) {
      const msg = "Live execution is operated by AICandlez and is not available from the customer portal.";
      executionStreamBus.emitEvent({
        type:     "order_rejected",
        severity: "warn",
        symbol, side: closeSide, mode: "live",
        gate:     "customer_live_execution_disabled",
        reason:   "customer_live_execution_disabled",
        message:  msg,
        details:  { userId, useSandbox, leg: "close" },
      });
      try {
        await db.insert(logsTable).values({
          id:      crypto.randomUUID(),
          type:    "trade",
          level:   "warn",
          message: `[customer_live_execution_disabled] close ${msg}`,
          details: { userId, symbol, side: closeSide, leg: "close", useSandbox, errorCode: "customer_live_execution_disabled" },
        });
      } catch (err) {
        logger.warn({ err, userId }, "liveUserExecution(close): customer-disabled log insert failed");
      }
      return { success: false, userId, exchange, errorCode: "customer_live_execution_disabled", error: msg };
    }
  }

  if (!(quantity > 0)) {
    return {
      success: false, userId, exchange,
      errorCode: "exchange_reject",
      error: `Invalid close quantity (${quantity})`,
    };
  }

  // 1. Resolve default live connection
  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId,      userId),
        eq(userExchangeConnectionsTable.isDefault,   true),
        eq(userExchangeConnectionsTable.status,      "active"),
        eq(userExchangeConnectionsTable.tradingMode, "live"),
      ),
    )
    .limit(1);

  if (!row) {
    const msg = "No default live exchange connection configured for close";
    await emitFailureNotification(userId, symbol, closeSide, msg, exchange);
    return { success: false, userId, exchange, errorCode: "no_connection", error: msg };
  }

  if (row.exchange !== exchange) {
    const msg = `Default live connection is ${row.exchange} but position opened on ${exchange}`;
    await emitFailureNotification(userId, symbol, closeSide, msg, exchange);
    return { success: false, userId, exchange, errorCode: "exchange_mismatch", error: msg };
  }

  // 2. Decrypt credentials
  const creds = vault.decryptBlob(userId, row.encryptedBlob);
  if (!creds) {
    const msg = `Could not decrypt stored credentials for ${row.exchange} — please reconnect`;
    await emitFailureNotification(userId, symbol, closeSide, msg, row.exchange);
    try {
      await db
        .update(userExchangeConnectionsTable)
        .set({ status: "error", lastError: "Decryption failed", updatedAt: new Date() })
        .where(eq(userExchangeConnectionsTable.id, row.id));
    } catch { /* non-fatal */ }
    return { success: false, userId, exchange: row.exchange, errorCode: "decrypt_failed", error: msg };
  }

  // 3. Dry-run short-circuit
  if (isDryRunEnabled()) {
    let referencePrice = 0;
    try {
      const ticker = await getTicker(symbol);
      referencePrice = ticker.price;
    } catch { /* best-effort for dry-run only */ }
    const dryResult: LiveUserCloseResult = {
      success:              true,
      userId,
      exchange:             row.exchange,
      exchangeCloseOrderId: `DRYRUN-CLOSE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fillPrice:            parseFloat(referencePrice.toFixed(2)),
      quantity,
      dryRun:               true,
    };
    logger.info(
      { userId, exchange: row.exchange, symbol, closeSide, quantity, referencePrice },
      "liveUserExecution: DRY-RUN close — adapter call skipped",
    );
    await emitFillNotification(
      userId, symbol, closeSide, row.exchange,
      dryResult.fillPrice!, quantity, dryResult.exchangeCloseOrderId!, true,
    );
    return dryResult;
  }

  // 4. Build adapter + submit market close
  // Mirror the open-side sandbox choice so paper-sandbox positions close on
  // the same testnet they were opened against.
  if (useSandbox && !hasSandbox(row.exchange)) {
    const msg = `${row.exchange} has no public sandbox — paper-mode close cannot be routed`;
    return { success: false, userId, exchange: row.exchange, errorCode: "no_sandbox", error: msg };
  }
  let adapter: BaseExchangeAdapter;
  try {
    adapter = makeAdapter(row.exchange, creds, { testnet: useSandbox, demoMode: row.demoMode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitFailureNotification(userId, symbol, closeSide, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "unsupported", error: msg };
  }

  try {
    let order = await adapter.placeOrder({
      symbol,
      side:     closeSide === "BUY" ? "buy" : "sell",
      type:     "market",
      qty:      parseFloat(quantity.toFixed(8)),
      clientId: `close-u-${userId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });

    // Poll for the true execution. Many exchanges (e.g. Kraken) return
    // status="open" with avgFillPrice=0 on the initial market-order ack,
    // even though the fill lands moments later. Without this poll the
    // close path falls back to the ticker price and realized PnL drifts
    // from the actual broker execution.
    const idForPoll = order.exchangeOrderId || order.id;
    let timedOut = false;
    const isTerminal = (s: StandardOrder["status"]) =>
      s === "filled" || s === "cancelled" || s === "rejected";
    if (idForPoll && !isTerminal(order.status)) {
      const poll = await pollOrderUntilFilled(adapter, idForPoll, symbol, {
        timeoutMs:  5000,
        intervalMs: 500,
        logCtx:     { userId, exchange: row.exchange, symbol, closeSide },
      });
      if (poll.order) order = poll.order;
      timedOut = poll.timedOut && !isTerminal(order.status);
    }

    const requestedQty = order.requestedQty > 0 ? order.requestedQty : quantity;
    const unfilled     = !(order.filledQty > 0);
    const partial      = order.filledQty > 0 && order.filledQty < requestedQty - 1e-12;

    // Hard failures: rejected, cancelled, or timed out with no fill at all.
    // Surface as live_trade_failed so the position stays open and the caller
    // (closeUserPosition) can retry on the next pass.
    if (order.status === "rejected" || order.status === "cancelled" || (timedOut && unfilled)) {
      const reasonMsg = timedOut
        ? `Close order ${idForPoll} did not fill within 5s on ${row.exchange} (status=${order.status})`
        : `Close order ${idForPoll} ${order.status} on ${row.exchange}`;
      logger.warn(
        { userId, exchange: row.exchange, symbol, closeSide,
          status: order.status, timedOut, filledQty: order.filledQty, requestedQty },
        "liveUserExecution: close order not filled",
      );
      await emitFailureNotification(userId, symbol, closeSide, reasonMsg, row.exchange);
      return { success: false, userId, exchange: row.exchange, errorCode: "exchange_reject", error: reasonMsg };
    }

    const fill = order.avgFillPrice > 0 ? order.avgFillPrice : 0;
    // See open-side path: only forward broker-sourced fees.
    const brokerFeeClose =
      order.fee && order.fee.source === "broker" && Number.isFinite(order.fee.amount)
        ? { amount: parseFloat(order.fee.amount.toFixed(8)), currency: order.fee.currency }
        : undefined;
    const result: LiveUserCloseResult = {
      success:              true,
      userId,
      exchange:             row.exchange,
      exchangeCloseOrderId: order.exchangeOrderId || order.id,
      fillPrice:            parseFloat(fill.toFixed(2)),
      quantity:             order.filledQty > 0 ? order.filledQty : quantity,
      brokerFee:            brokerFeeClose?.amount,
      brokerFeeCurrency:    brokerFeeClose?.currency,
    };

    const note = timedOut
      ? "partial fill — poll timed out"
      : partial
        ? "partial fill"
        : undefined;

    logger.info(
      { userId, exchange: row.exchange, symbol, closeSide,
        fillPrice: result.fillPrice, exchangeCloseOrderId: result.exchangeCloseOrderId,
        status: order.status, partial, timedOut,
        filledQty: order.filledQty, requestedQty },
      "liveUserExecution: close order filled",
    );
    await emitFillNotification(
      userId, symbol, closeSide, row.exchange,
      result.fillPrice!, result.quantity!, result.exchangeCloseOrderId ?? "", false,
      note
        ? { note, data: { partial, timedOut, requestedQty, status: order.status } }
        : undefined,
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, exchange: row.exchange, symbol, closeSide, err: msg }, "liveUserExecution: adapter close placeOrder failed");
    await emitFailureNotification(userId, symbol, closeSide, `Exchange rejected close order: ${msg}`, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "exchange_reject", error: msg };
  }
}
