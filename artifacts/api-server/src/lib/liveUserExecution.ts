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
import { getTicker } from "./marketData.js";
import { logger } from "./logger.js";
import { NotificationDispatcher } from "../services/notifications/NotificationDispatcher.js";
import { getTradeLimitVerdict, invalidateTradeLimitCache } from "./tradeLimitEngine.js";
import { getUserStatusVerdict } from "./userStatusGuard.js";
import { executionStreamBus } from "./executionStreamBus.js";
import { logsTable, riskThrottleEventsTable } from "@workspace/db";
import crypto from "crypto";
import { evaluateRiskGate } from "./riskGate.js";
import { isAiDisclaimerAccepted } from "./aiDisclaimer.js";

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
  errorCode?:      "no_connection" | "decrypt_failed" | "unsupported" | "no_sandbox" | "price_unavailable" | "exchange_reject" | "trade_limit_exhausted" | "user_status_blocked" | "customer_live_execution_disabled" | "concurrent_live_cap_reached" | "risk_max_per_trade" | "risk_max_simultaneous" | "risk_max_allocation" | "risk_reserve_cash_breach" | "risk_no_equity" | "ai_disclaimer_not_accepted";
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
 * Default = 3 during controlled beta. Operator can ratchet up via env:
 *   LIVE_EXECUTION_CONCURRENT_CAP=5   (then 10, etc.) without a redeploy.
 *
 * Set to `0` to disable the gate entirely (legacy behavior).
 *
 * Scope: customer-side only. The operator path (`exchangeEngine.
 * placeLiveAutoOrder`, no userId) is intentionally NOT gated here — operator
 * execution on `admintrade.aicandlez.com` runs under separate operational
 * controls. Admin / super-admin users authenticated on the customer path
 * also bypass.
 */
export const DEFAULT_LIVE_EXECUTION_CONCURRENT_CAP = 3;

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
        userId:   userExchangeConnectionsTable.userId,
        exchange: userExchangeConnectionsTable.exchange,
      })
      .from(userExchangeConnectionsTable)
      .where(
        and(
          eq(userExchangeConnectionsTable.isDefault,   true),
          eq(userExchangeConnectionsTable.status,      "active"),
          eq(userExchangeConnectionsTable.tradingMode, "live"),
        ),
      );
    return rows;
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
export async function placeLiveAutoOrderForUser(
  req: LiveUserOrderRequest,
): Promise<LiveUserOrderResult> {
  const { userId, symbol, side, sizeUSD, useSandbox = false } = req;

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
    if (!operator) {
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
  let adapter: BaseExchangeAdapter;
  try {
    adapter = makeAdapter(row.exchange, creds, { testnet: useSandbox, demoMode: row.demoMode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "unsupported", error: msg };
  }

  try {
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
      await emitFailureNotification(userId, symbol, side, reasonMsg, row.exchange);
      return { success: false, userId, exchange: row.exchange, errorCode: "exchange_reject", error: reasonMsg };
    }

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
    invalidateTradeLimitCache(userId);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, exchange: row.exchange, symbol, side, err: msg }, "liveUserExecution: adapter placeOrder failed");
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
