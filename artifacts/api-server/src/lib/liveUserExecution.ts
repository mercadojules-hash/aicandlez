import { db } from "@workspace/db";
import {
  userExchangeConnectionsTable,
  userNotificationsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { vault } from "../services/vault/CredentialVault.js";
import type { ExchangeCredentials } from "../services/vault/CredentialVault.js";
import { ensureFreshAlpacaCreds } from "../services/exchanges/AlpacaTokenRefresher.js";
import type { BaseExchangeAdapter } from "../services/exchanges/BaseExchangeAdapter.js";
// Live + beta adapters (mirrors makeAdapter() in routes/userExchanges.ts)
import { KrakenAdapter }       from "../services/exchanges/adapters/KrakenAdapter.js";
import { AlpacaAdapter }       from "../services/exchanges/adapters/AlpacaAdapter.js";
import { BinanceAdapter }      from "../services/exchanges/adapters/BinanceAdapter.js";
import { CoinbaseAdapter }     from "../services/exchanges/adapters/CoinbaseAdapter.js";
import { GateIOAdapter }       from "../services/exchanges/adapters/GateIOAdapter.js";
import { BitgetAdapter }       from "../services/exchanges/adapters/BitgetAdapter.js";
import { MEXCAdapter }         from "../services/exchanges/adapters/MEXCAdapter.js";
import { CryptoDotComAdapter } from "../services/exchanges/adapters/CryptoDotComAdapter.js";
import { HTXAdapter }          from "../services/exchanges/adapters/HTXAdapter.js";
import { GeminiAdapter }       from "../services/exchanges/adapters/GeminiAdapter.js";
import { BitstampAdapter }     from "../services/exchanges/adapters/BitstampAdapter.js";
import { PhemexAdapter }       from "../services/exchanges/adapters/PhemexAdapter.js";
import { BloFinAdapter }       from "../services/exchanges/adapters/BloFinAdapter.js";
import { BingXAdapter }        from "../services/exchanges/adapters/BingXAdapter.js";
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

export function isDryRunEnabled(): boolean {
  return process.env["LIVE_TRADE_DRY_RUN"] === "true";
}

function makeAdapter(exchange: string, creds: ExchangeCredentials): BaseExchangeAdapter {
  const cfg = { apiKey: creds.apiKey, apiSecret: creds.apiSecret, passphrase: creds.passphrase };
  switch (exchange) {
    case "Kraken":       return new KrakenAdapter(cfg);
    case "Alpaca":       return new AlpacaAdapter(cfg);
    case "Binance":      return new BinanceAdapter(cfg);
    case "Coinbase":     return new CoinbaseAdapter(cfg);
    case "GateIO":       return new GateIOAdapter(cfg);
    case "Bitget":       return new BitgetAdapter(cfg);
    case "MEXC":         return new MEXCAdapter(cfg);
    case "CryptoDotCom": return new CryptoDotComAdapter(cfg);
    case "HTX":          return new HTXAdapter(cfg);
    case "Gemini":       return new GeminiAdapter(cfg);
    case "Bitstamp":     return new BitstampAdapter(cfg);
    case "Phemex":       return new PhemexAdapter(cfg);
    case "BloFin":       return new BloFinAdapter(cfg);
    case "BingX":        return new BingXAdapter(cfg);
    default: throw new Error(`No adapter for exchange: ${exchange}`);
  }
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
  // Fire-and-forget push to existing customer subscriptions
  void NotificationDispatcher.sendToUser(userId, {
    title,
    body:      message,
    notifType: "trade",
    tag:       `live-fill-${symbol}`,
    url:       "/aicandlez-app/portfolio",
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
  void NotificationDispatcher.sendToUser(userId, {
    title,
    body:      message,
    notifType: "trade",
    tag:       `live-close-${symbol}`,
    url:       "/aicandlez-app/portfolio",
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
