import { db } from "@workspace/db";
import {
  userExchangeConnectionsTable,
  userNotificationsTable,
  userSettingsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { vault } from "../services/vault/CredentialVault.js";
import { ensureFreshAlpacaCreds } from "../services/exchanges/AlpacaTokenRefresher.js";
import { makeAdapter } from "../services/exchanges/adapterFactory.js";
import { getTicker } from "./marketData.js";
import { logger } from "./logger.js";
import { NotificationDispatcher } from "../services/notifications/NotificationDispatcher.js";

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
}

export interface LiveUserOrderResult {
  success:         boolean;
  userId:          string;
  exchange?:       string;
  exchangeOrderId?: string;
  fillPrice?:      number;
  quantity?:       number;
  dryRun?:         boolean;
  errorCode?:      "no_connection" | "decrypt_failed" | "unsupported" | "price_unavailable" | "exchange_reject";
  error?:          string;
}

export interface LiveUserCloseRequest {
  userId:    string;
  symbol:    string;          // engine-native ("BTCUSD")
  openSide:  "BUY" | "SELL";  // side of the *opening* fill — close uses the opposite
  quantity:  number;          // base-asset qty already known from the open
  exchange:  string;          // exchange the open fill landed on (must match user's current default)
}

export interface LiveUserCloseResult {
  success:              boolean;
  userId:               string;
  exchange?:            string;
  exchangeCloseOrderId?: string;
  fillPrice?:           number;
  quantity?:            number;
  dryRun?:              boolean;
  errorCode?:           "no_connection" | "decrypt_failed" | "unsupported" | "exchange_mismatch" | "exchange_reject";
  error?:               string;
}

export function isDryRunEnabled(): boolean {
  return process.env["LIVE_TRADE_DRY_RUN"] === "true";
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
): Promise<void> {
  const priceStr = fillPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qtyStr   = quantity.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const title    = `${side} ${symbol} filled on ${exchange}${dryRun ? " (dry-run)" : ""}`;
  const message  = `${side} ${qtyStr} ${symbol} @ $${priceStr} on ${exchange}`;

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

  try {
    await db.insert(userNotificationsTable).values({
      userId,
      type:    "live_trade_filled",
      title,
      message,
      data:    { symbol, side, exchange, fillPrice, quantity, exchangeOrderId, dryRun },
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
    data:      { symbol, side, exchange, fillPrice, quantity, exchangeOrderId, dryRun, kind: "live_trade_filled" },
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
  const { userId, symbol, side, sizeUSD } = req;

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
    return dryResult;
  }

  // 5. Build adapter + place order
  let adapter: BaseExchangeAdapter;
  try {
    adapter = makeAdapter(row.exchange, creds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitFailureNotification(userId, symbol, side, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "unsupported", error: msg };
  }

  try {
    const order = await adapter.placeOrder({
      symbol,
      side:     side === "BUY" ? "buy" : "sell",
      type:     "market",
      qty:      qtyBase,
      clientId: `loop-u-${userId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });

    const fill = order.avgFillPrice > 0 ? order.avgFillPrice : referencePrice;
    const result: LiveUserOrderResult = {
      success:         true,
      userId,
      exchange:        row.exchange,
      exchangeOrderId: order.exchangeOrderId || order.id,
      fillPrice:       parseFloat(fill.toFixed(2)),
      quantity:        order.filledQty > 0 ? order.filledQty : qtyBase,
    };

    logger.info(
      { userId, exchange: row.exchange, symbol, side, sizeUSD,
        fillPrice: result.fillPrice, exchangeOrderId: result.exchangeOrderId },
      "liveUserExecution: order filled",
    );
    await emitFillNotification(
      userId, symbol, side, row.exchange,
      result.fillPrice!, result.quantity!, result.exchangeOrderId ?? "", false,
    );
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
  const { userId, symbol, openSide, quantity, exchange } = req;
  const closeSide: "BUY" | "SELL" = openSide === "BUY" ? "SELL" : "BUY";

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
  let adapter: BaseExchangeAdapter;
  try {
    adapter = makeAdapter(row.exchange, creds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitFailureNotification(userId, symbol, closeSide, msg, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "unsupported", error: msg };
  }

  try {
    const order = await adapter.placeOrder({
      symbol,
      side:     closeSide === "BUY" ? "buy" : "sell",
      type:     "market",
      qty:      parseFloat(quantity.toFixed(8)),
      clientId: `close-u-${userId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });

    const fill = order.avgFillPrice > 0 ? order.avgFillPrice : 0;
    const result: LiveUserCloseResult = {
      success:              true,
      userId,
      exchange:             row.exchange,
      exchangeCloseOrderId: order.exchangeOrderId || order.id,
      fillPrice:            parseFloat(fill.toFixed(2)),
      quantity:             order.filledQty > 0 ? order.filledQty : quantity,
    };

    logger.info(
      { userId, exchange: row.exchange, symbol, closeSide,
        fillPrice: result.fillPrice, exchangeCloseOrderId: result.exchangeCloseOrderId },
      "liveUserExecution: close order filled",
    );
    await emitFillNotification(
      userId, symbol, closeSide, row.exchange,
      result.fillPrice!, result.quantity!, result.exchangeCloseOrderId ?? "", false,
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, exchange: row.exchange, symbol, closeSide, err: msg }, "liveUserExecution: adapter close placeOrder failed");
    await emitFailureNotification(userId, symbol, closeSide, `Exchange rejected close order: ${msg}`, row.exchange);
    return { success: false, userId, exchange: row.exchange, errorCode: "exchange_reject", error: msg };
  }
}
