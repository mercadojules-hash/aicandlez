import { db } from "@workspace/db";
import {
  simAccountsTable,
  simPositionsTable,
  simTradesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getTicker, SUPPORTED_SYMBOLS } from "./marketData.js";
import { logger } from "./logger.js";
import {
  emitLiveCloseNotification,
  isDryRunEnabled,
  placeLiveCloseOrderForUser,
} from "./liveUserExecution.js";
import { CATALOG_BY_ID } from "../services/exchanges/catalog.js";

// Compute a fill commission for a live trade leg using the exchange catalog's
// default taker fee rate. Returns null for paper fills (no broker, no fee).
function computeFillFee(exchange: string | undefined, notionalUSD: number): number | null {
  if (!exchange) return null;
  const meta = CATALOG_BY_ID[exchange];
  if (!meta) return null;
  // `takerFeePct` is expressed as a percent (e.g. 0.26 = 0.26%).
  const fee = (notionalUSD * meta.takerFeePct) / 100;
  return parseFloat(fee.toFixed(4));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserSimPosition {
  id: string;
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  entryTime: number;
  sizeUSD: number;
  signalId?: string;
  stopLoss?: number;
  takeProfit?: number;
  currentPrice?: number;
  unrealizedPnL?: number;
  unrealizedPnLPct?: number;
  marketValue?: number;
  exchange?: string;
  exchangeOrderId?: string;
  // Broker-reported entry-leg commission carried from the open fill so the
  // close-side receipt can prefer it over the catalog estimate. Undefined
  // for paper fills and for brokers that don't surface a per-order fee.
  entryFeeBroker?: number;
  entryFeeBrokerCurrency?: string;
  // True when the position was opened against the exchange's public
  // sandbox/testnet. Authoritative for the close-side routing decision
  // (see closeUserPosition below).
  sandbox?: boolean;
}

export interface UserSimTrade {
  id: string;
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  sizeUSD: number;
  realizedPnL: number;
  realizedPnLPct: number;
  durationMs: number;
  closeReason: string;
  exchange?: string;
  exchangeOrderId?: string;
  exchangeCloseOrderId?: string;
  // Catalog-estimated fees (existing): computed from CATALOG_BY_ID taker rate.
  entryFee?: number;
  exitFee?: number;
  netFees?: number;
  // Broker-reported fees (new): straight from the exchange's order payload.
  // Persisted alongside the estimate so the receipt can prefer the real
  // figure when present and gracefully fall back to the estimate otherwise.
  entryFeeBroker?: number;
  entryFeeBrokerCurrency?: string;
  exitFeeBroker?: number;
  exitFeeBrokerCurrency?: string;
  // True when this trade was opened against the exchange's public
  // sandbox/testnet (mirrors the open-side `sim_positions.sandbox` flag).
  sandbox?: boolean;
}

interface UserSimAccount {
  userId: string;
  startingBalance: number;
  cashBalance: number;
  totalRealized: number;
  totalTrades: number;
}

interface UserSimState {
  account: UserSimAccount;
  positions: UserSimPosition[];
  tradeHistory: UserSimTrade[];
  idSeq: number;
}

// ── Symbol aliases ────────────────────────────────────────────────────────────

const SYMBOL_ALIASES: Record<string, string> = {
  BTC: "BTCUSD", ETH: "ETHUSD", SOL: "SOLUSD",
};

function normalizeSymbol(sym: string): string {
  return SYMBOL_ALIASES[sym.toUpperCase()] ?? sym.toUpperCase();
}

function newId(state: UserSimState): string {
  return `SIM-${Date.now()}-${++state.idSeq}`;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = new Map<string, UserSimState>();

async function getOrLoad(userId: string): Promise<UserSimState> {
  const existing = registry.get(userId);
  if (existing) return existing;

  const state = await loadFromDB(userId);
  registry.set(userId, state);
  return state;
}

async function loadFromDB(userId: string): Promise<UserSimState> {
  let dbAccount = await db
    .select()
    .from(simAccountsTable)
    .where(eq(simAccountsTable.userId, userId))
    .limit(1)
    .then((r) => r[0]);

  if (!dbAccount) {
    [dbAccount] = await db
      .insert(simAccountsTable)
      .values({ userId, startingBalance: 100_000, cashBalance: 100_000, totalRealized: 0, totalTrades: 0 })
      .returning();
    logger.info({ userId }, "UserSimRegistry: created new sim account");
  }

  const dbPositions = await db
    .select()
    .from(simPositionsTable)
    .where(eq(simPositionsTable.userId, userId));

  const dbTrades = await db
    .select()
    .from(simTradesTable)
    .where(eq(simTradesTable.userId, userId))
    .orderBy(desc(simTradesTable.createdAt))
    .limit(100);

  const state: UserSimState = {
    account: {
      userId,
      startingBalance: dbAccount!.startingBalance,
      cashBalance:     dbAccount!.cashBalance,
      totalRealized:   dbAccount!.totalRealized,
      totalTrades:     dbAccount!.totalTrades,
    },
    positions: dbPositions.map((p) => ({
      id:              p.id,
      userId:          p.userId,
      symbol:          p.symbol,
      side:            p.side as "BUY" | "SELL",
      quantity:        p.quantity,
      entryPrice:      p.entryPrice,
      entryTime:       p.entryTime,
      sizeUSD:         p.sizeUSD,
      signalId:        p.signalId ?? undefined,
      stopLoss:        p.stopLoss ?? undefined,
      takeProfit:      p.takeProfit ?? undefined,
      exchange:        p.exchange ?? undefined,
      exchangeOrderId: p.exchangeOrderId ?? undefined,
      entryFeeBroker:         p.entryFeeBroker ?? undefined,
      entryFeeBrokerCurrency: p.entryFeeBrokerCurrency ?? undefined,
      sandbox:                p.sandbox === true,
    })),
    tradeHistory: dbTrades.map((t) => {
      const entryFee = t.entryFee ?? undefined;
      const exitFee  = t.exitFee  ?? undefined;
      const netFees  =
        entryFee !== undefined || exitFee !== undefined
          ? parseFloat(((entryFee ?? 0) + (exitFee ?? 0)).toFixed(4))
          : undefined;
      return ({
      id:              t.id,
      userId:          t.userId,
      symbol:          t.symbol,
      side:            t.side as "BUY" | "SELL",
      quantity:        t.quantity,
      entryPrice:      t.entryPrice,
      exitPrice:       t.exitPrice,
      entryTime:       t.entryTime,
      exitTime:        t.exitTime,
      sizeUSD:         t.sizeUSD,
      realizedPnL:     t.realizedPnL,
      realizedPnLPct:  t.realizedPnLPct,
      durationMs:      t.durationMs,
      closeReason:     t.closeReason ?? "MANUAL",
      exchange:             t.exchange ?? undefined,
      exchangeOrderId:      t.exchangeOrderId ?? undefined,
      exchangeCloseOrderId: t.exchangeCloseOrderId ?? undefined,
      entryFee,
      exitFee,
      netFees,
      entryFeeBroker:         t.entryFeeBroker ?? undefined,
      entryFeeBrokerCurrency: t.entryFeeBrokerCurrency ?? undefined,
      exitFeeBroker:          t.exitFeeBroker ?? undefined,
      exitFeeBrokerCurrency:  t.exitFeeBrokerCurrency ?? undefined,
      sandbox:                t.sandbox === true,
      });
    }),
    idSeq: 0,
  };

  logger.info(
    { userId, cashBalance: state.account.cashBalance, positions: state.positions.length },
    "UserSimRegistry: loaded user sim state from DB"
  );

  return state;
}

async function persistAccount(state: UserSimState): Promise<void> {
  await db
    .update(simAccountsTable)
    .set({
      cashBalance:   state.account.cashBalance,
      totalRealized: state.account.totalRealized,
      totalTrades:   state.account.totalTrades,
      updatedAt:     new Date(),
    })
    .where(eq(simAccountsTable.userId, state.account.userId));
}

// ── Enrich positions with live prices ─────────────────────────────────────────

async function enrichPositions(positions: UserSimPosition[]): Promise<UserSimPosition[]> {
  return Promise.all(
    positions.map(async (pos) => {
      try {
        const ticker = await getTicker(pos.symbol);
        const currentPrice = ticker.price;
        const unrealizedPnL =
          pos.side === "BUY"
            ? (currentPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - currentPrice) * pos.quantity;
        const marketValue =
          pos.side === "BUY"
            ? pos.quantity * currentPrice
            : pos.sizeUSD - unrealizedPnL;
        const unrealizedPnLPct = (unrealizedPnL / pos.sizeUSD) * 100;
        return { ...pos, currentPrice, unrealizedPnL, unrealizedPnLPct, marketValue };
      } catch {
        return { ...pos };
      }
    })
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

// Monthly aggregated broker commission for the last `months` calendar months
// (most recent month last). Buckets are derived from each closed trade's
// `exitTime` (ms epoch). Paper-only users see all-zero buckets because paper
// fills never persist a fee value.
export interface MonthlyFeeBucket {
  /** YYYY-MM key, e.g. "2026-04" */
  month: string;
  /** Total entry + exit broker commission across closed trades in this month */
  feesPaid: number;
  /** Number of closed trades that landed in this month */
  tradeCount: number;
  /** Sum of gross realized P&L (pre-fee) across closed trades in this month */
  realizedPnL: number;
}

export async function getUserMonthlyFees(
  userId: string,
  months: number = 6,
): Promise<MonthlyFeeBucket[]> {
  const safeMonths = Math.max(1, Math.min(months, 24));

  // Build the trailing bucket window anchored to the current month so users
  // always see a fixed number of columns (zero-filled where no activity).
  const now = new Date();
  const buckets: MonthlyFeeBucket[] = [];
  const indexByKey = new Map<string, number>();
  for (let i = safeMonths - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    indexByKey.set(key, buckets.length);
    buckets.push({ month: key, feesPaid: 0, tradeCount: 0, realizedPnL: 0 });
  }

  const windowStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - (safeMonths - 1),
    1,
  );

  const rows = await db
    .select({
      exitTime:    simTradesTable.exitTime,
      entryFee:    simTradesTable.entryFee,
      exitFee:     simTradesTable.exitFee,
      realizedPnL: simTradesTable.realizedPnL,
    })
    .from(simTradesTable)
    .where(eq(simTradesTable.userId, userId));

  for (const r of rows) {
    if (r.exitTime < windowStart) continue;
    const d = new Date(r.exitTime);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const idx = indexByKey.get(key);
    if (idx === undefined) continue;
    const fee = (r.entryFee ?? 0) + (r.exitFee ?? 0);
    if (fee > 0) buckets[idx]!.feesPaid += fee;
    buckets[idx]!.tradeCount += 1;
    buckets[idx]!.realizedPnL += r.realizedPnL ?? 0;
  }

  for (const b of buckets) {
    b.feesPaid    = parseFloat(b.feesPaid.toFixed(2));
    b.realizedPnL = parseFloat(b.realizedPnL.toFixed(2));
  }
  return buckets;
}

export async function getUserAccountSummary(userId: string) {
  const state   = await getOrLoad(userId);
  const enriched = await enrichPositions(state.positions);
  const unrealizedTotal = enriched.reduce((s, p) => s + (p.unrealizedPnL ?? 0), 0);
  const positionValue   = enriched.reduce((s, p) => s + (p.marketValue ?? p.sizeUSD), 0);
  const equity          = state.account.cashBalance + positionValue;
  const totalPnL        = equity - state.account.startingBalance;
  const totalPnLPct     = (totalPnL / state.account.startingBalance) * 100;

  // Lifetime broker commission paid across every closed leg (entry + exit fees
  // on sim_trades for this user). Stays at 0 for paper-only users since paper
  // fills never persist a fee value.
  const feeRows = await db
    .select({
      entryFee: simTradesTable.entryFee,
      exitFee:  simTradesTable.exitFee,
    })
    .from(simTradesTable)
    .where(eq(simTradesTable.userId, userId));
  const totalFeesPaid = feeRows.reduce(
    (s, r) => s + (r.entryFee ?? 0) + (r.exitFee ?? 0),
    0,
  );

  return {
    balance:       parseFloat(state.account.cashBalance.toFixed(2)),
    startBalance:  state.account.startingBalance,
    equity:        parseFloat(equity.toFixed(2)),
    totalPnL:      parseFloat(totalPnL.toFixed(2)),
    totalPnLPct:   parseFloat(totalPnLPct.toFixed(4)),
    unrealizedPnL: parseFloat(unrealizedTotal.toFixed(2)),
    positionCount: state.positions.length,
    totalTrades:   state.account.totalTrades,
    totalRealized: parseFloat(state.account.totalRealized.toFixed(2)),
    totalFeesPaid: parseFloat(totalFeesPaid.toFixed(2)),
    positions:     enriched.map((p) => ({
      ...p,
      unrealizedPnL:    p.unrealizedPnL    != null ? parseFloat(p.unrealizedPnL.toFixed(2))    : undefined,
      unrealizedPnLPct: p.unrealizedPnLPct != null ? parseFloat(p.unrealizedPnLPct.toFixed(3)) : undefined,
      marketValue:      p.marketValue      != null ? parseFloat(p.marketValue.toFixed(2))      : undefined,
    })),
  };
}

export interface UserOrderRequest {
  symbol: string;
  side:   "BUY" | "SELL";
  sizeUSD: number;
  signalId?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export async function placeUserOrder(userId: string, req: UserOrderRequest): Promise<{
  success: boolean;
  position?: UserSimPosition;
  error?: string;
}> {
  const symbol  = normalizeSymbol(req.symbol);
  const { side, sizeUSD } = req;

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    return { success: false, error: `Unsupported symbol: ${symbol}` };
  }
  if (sizeUSD <= 0) {
    return { success: false, error: "sizeUSD must be positive" };
  }

  const state = await getOrLoad(userId);

  if (sizeUSD > state.account.cashBalance) {
    return {
      success: false,
      error: `Insufficient balance: have $${state.account.cashBalance.toFixed(2)}, need $${sizeUSD.toFixed(2)}`,
    };
  }

  let entryPrice: number;
  try {
    const ticker = await getTicker(symbol);
    entryPrice = ticker.price;
  } catch (e) {
    return { success: false, error: `Failed to fetch price: ${e instanceof Error ? e.message : String(e)}` };
  }

  const quantity = sizeUSD / entryPrice;
  const posId    = newId(state);
  const position: UserSimPosition = {
    id:         posId,
    userId,
    symbol,
    side,
    quantity:   parseFloat(quantity.toFixed(8)),
    entryPrice: parseFloat(entryPrice.toFixed(2)),
    entryTime:  Date.now(),
    sizeUSD:    parseFloat(sizeUSD.toFixed(2)),
    signalId:   req.signalId,
    stopLoss:   req.stopLoss,
    takeProfit: req.takeProfit,
  };

  state.account.cashBalance -= sizeUSD;
  state.positions.push(position);

  await Promise.all([
    db.insert(simPositionsTable).values({
      id:         position.id,
      userId,
      symbol:     position.symbol,
      side:       position.side,
      quantity:   position.quantity,
      entryPrice: position.entryPrice,
      entryTime:  position.entryTime,
      sizeUSD:    position.sizeUSD,
      signalId:   position.signalId ?? null,
      stopLoss:   position.stopLoss ?? null,
      takeProfit: position.takeProfit ?? null,
    }),
    persistAccount(state),
  ]);

  logger.info({ userId, symbol, side, sizeUSD, entryPrice }, "UserSimRegistry: order placed");
  return { success: true, position };
}

/**
 * Mirror a live exchange fill (executed against the customer's own broker
 * via `placeLiveAutoOrderForUser`) into the user's sim state so the position
 * appears in their portal. Cash balance is intentionally NOT debited — live
 * trades use real broker funds, not paper cash. On close, PnL flows through
 * `closeUserPosition` like any other position.
 */
export async function registerLiveUserFill(params: {
  userId:          string;
  symbol:          string;
  side:            "BUY" | "SELL";
  quantity:        number;
  entryPrice:      number;
  sizeUSD:         number;
  signalId?:       string;
  stopLoss?:       number;
  takeProfit?:     number;
  exchange:        string;
  exchangeOrderId: string;
  // Broker-reported entry-leg commission (when the adapter parsed it from
  // the exchange's order/fill response). Persisted so closeUserPosition can
  // prefer it over the catalog estimate on the close-side receipt.
  entryFeeBroker?:         number;
  entryFeeBrokerCurrency?: string;
  /** Open was routed via the exchange's public sandbox (paper-mode sandbox). */
  sandbox?: boolean;
}): Promise<UserSimPosition> {
  const state    = await getOrLoad(params.userId);
  const position: UserSimPosition = {
    id:              params.exchangeOrderId,
    userId:          params.userId,
    symbol:          normalizeSymbol(params.symbol),
    side:            params.side,
    quantity:        parseFloat(params.quantity.toFixed(8)),
    entryPrice:      parseFloat(params.entryPrice.toFixed(2)),
    entryTime:       Date.now(),
    sizeUSD:         parseFloat(params.sizeUSD.toFixed(2)),
    signalId:        params.signalId,
    stopLoss:        params.stopLoss,
    takeProfit:      params.takeProfit,
    exchange:        params.exchange,
    exchangeOrderId: params.exchangeOrderId,
    entryFeeBroker:         params.entryFeeBroker,
    entryFeeBrokerCurrency: params.entryFeeBrokerCurrency,
    sandbox:                params.sandbox === true,
  };

  state.positions.push(position);

  await db.insert(simPositionsTable).values({
    id:              position.id,
    userId:          position.userId,
    symbol:          position.symbol,
    side:            position.side,
    quantity:        position.quantity,
    entryPrice:      position.entryPrice,
    entryTime:       position.entryTime,
    sizeUSD:         position.sizeUSD,
    signalId:        position.signalId ?? null,
    stopLoss:        position.stopLoss ?? null,
    takeProfit:      position.takeProfit ?? null,
    exchange:        position.exchange ?? null,
    exchangeOrderId: position.exchangeOrderId ?? null,
    entryFeeBroker:         position.entryFeeBroker ?? null,
    entryFeeBrokerCurrency: position.entryFeeBrokerCurrency ?? null,
    sandbox:                position.sandbox === true,
  });

  logger.info(
    { userId: params.userId, symbol: position.symbol, side: position.side, exchange: position.exchange, exchangeOrderId: position.exchangeOrderId },
    "UserSimRegistry: live fill mirrored",
  );
  return position;
}

export async function closeUserPosition(
  userId: string,
  positionId: string,
  closeReason: string = "MANUAL",
): Promise<{ success: boolean; trade?: UserSimTrade; error?: string }> {
  const state = await getOrLoad(userId);
  const idx   = state.positions.findIndex((p) => p.id === positionId);
  if (idx === -1) {
    return { success: false, error: `Position ${positionId} not found` };
  }

  const pos = state.positions[idx]!;

  // For live positions, submit a real broker-side close order first.
  // Use the broker's fill price (when available) as the canonical exit
  // price so realized PnL matches the actual exchange execution.
  let exchangeCloseOrderId: string | undefined;
  let brokerFillPrice: number | undefined;
  let brokerFilledQty: number | undefined;
  let brokerExitFee: number | undefined;
  let brokerExitFeeCurrency: string | undefined;
  const isLive = !!(pos.exchange && pos.exchangeOrderId);
  if (isLive) {
    // Mirror the open-side sandbox decision on the close. The authoritative
    // source is the per-position `sandbox` flag persisted at open-time —
    // NEVER the user's current `paperSandboxEnabled` setting, which can
    // toggle between open and close and would route a sandbox-opened
    // position to production (real money close on a fake position).
    const useSandbox = pos.sandbox === true;
    const closeRes = await placeLiveCloseOrderForUser({
      userId,
      symbol:   pos.symbol,
      openSide: pos.side,
      quantity: pos.quantity,
      exchange: pos.exchange!,
      useSandbox,
    });
    if (!closeRes.success) {
      logger.warn(
        { userId, positionId, exchange: pos.exchange, error: closeRes.error, errorCode: closeRes.errorCode },
        "UserSimRegistry: live close order rejected — position remains open",
      );
      return {
        success: false,
        error:   `Live close order rejected on ${pos.exchange}: ${closeRes.error ?? "unknown"}`,
      };
    }
    exchangeCloseOrderId = closeRes.exchangeCloseOrderId;
    if (closeRes.fillPrice && closeRes.fillPrice > 0) {
      brokerFillPrice = closeRes.fillPrice;
    }
    if (closeRes.quantity && closeRes.quantity > 0) {
      // Clamp to position quantity in case the broker over-reports
      brokerFilledQty = Math.min(closeRes.quantity, pos.quantity);
    }
    // Accept 0 / negative (maker rebate) broker fees — only require that
    // the broker returned a finite numeric value. Catalog estimate is only
    // used when the adapter didn't report a fee at all.
    if (Number.isFinite(closeRes.brokerFee)) {
      brokerExitFee         = closeRes.brokerFee;
      brokerExitFeeCurrency = closeRes.brokerFeeCurrency;
    }
  }

  let exitPrice: number;
  if (brokerFillPrice !== undefined) {
    exitPrice = brokerFillPrice;
  } else {
    try {
      const ticker = await getTicker(pos.symbol);
      exitPrice = ticker.price;
    } catch (e) {
      return { success: false, error: `Failed to fetch price: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // Partial-fill aware close. When the broker reported a filled quantity
  // smaller than the position quantity (Kraken-style partials, or close
  // orders that the exchange only partially executed), we close only the
  // filled portion: realized PnL is computed on the filled qty, sizeUSD
  // is pro-rated, the position stays open with the remaining qty/size,
  // and the user can retry. When brokerFilledQty matches pos.quantity
  // (or this is a non-live close), behaviour is the standard full close.
  const closedQty = brokerFilledQty !== undefined ? brokerFilledQty : pos.quantity;
  const isPartial = closedQty < pos.quantity - 1e-12;
  const closedSizeUSD = isPartial
    ? parseFloat(((pos.sizeUSD * closedQty) / pos.quantity).toFixed(2))
    : pos.sizeUSD;

  const realizedPnL =
    pos.side === "BUY"
      ? (exitPrice - pos.entryPrice) * closedQty
      : (pos.entryPrice - exitPrice) * closedQty;

  const realizedPnLPct = closedSizeUSD > 0 ? (realizedPnL / closedSizeUSD) * 100 : 0;
  const exitTime       = Date.now();
  const tradeId        = newId(state);

  // Broker commission for both legs (live trades only — null for paper).
  // Fees are pro-rated against the closed portion so partial closes only
  // charge for the quantity actually filled. Estimates always recorded;
  // broker-reported amounts (when present) are stored alongside the
  // estimate and preferred for cash accounting + receipt totals.
  const exitNotional = exitPrice * closedQty;
  const entryFee = computeFillFee(pos.exchange, closedSizeUSD);
  const exitFee  = computeFillFee(pos.exchange, exitNotional);
  // Pro-rate the broker-reported entry fee against the closed portion in
  // case of a partial close — the carried entryFeeBroker reflects the full
  // open-leg charge for the original quantity.
  const entryFeeBrokerProRated =
    pos.entryFeeBroker !== undefined && pos.quantity > 0
      ? parseFloat(((pos.entryFeeBroker * closedQty) / pos.quantity).toFixed(8))
      : undefined;
  // Only treat a broker-reported fee as USD-equivalent for cash accounting
  // when the broker charged it in a USD-stable asset. Fees paid in a native
  // asset (BNB, BTC, ETH, exchange token) need an FX conversion we don't do
  // here — keep them on the receipt but fall back to the catalog estimate
  // for the cash/PnL math so account equity stays consistent.
  const USD_STABLE = new Set(["USD", "USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "FDUSD", "ZUSD"]);
  const entryBrokerIsUsd = entryFeeBrokerProRated !== undefined
    && (pos.entryFeeBrokerCurrency === undefined || USD_STABLE.has(pos.entryFeeBrokerCurrency.toUpperCase()));
  const exitBrokerIsUsd  = brokerExitFee !== undefined
    && (brokerExitFeeCurrency === undefined || USD_STABLE.has(brokerExitFeeCurrency.toUpperCase()));
  const effectiveEntryFee = entryBrokerIsUsd ? entryFeeBrokerProRated! : (entryFee ?? 0);
  const effectiveExitFee  = exitBrokerIsUsd  ? brokerExitFee!          : (exitFee  ?? 0);
  const netFees  = effectiveEntryFee + effectiveExitFee;

  const trade: UserSimTrade = {
    id:              tradeId,
    userId,
    symbol:          pos.symbol,
    side:            pos.side,
    quantity:        parseFloat(closedQty.toFixed(8)),
    entryPrice:      pos.entryPrice,
    exitPrice:       parseFloat(exitPrice.toFixed(2)),
    entryTime:       pos.entryTime,
    exitTime,
    sizeUSD:         closedSizeUSD,
    realizedPnL:     parseFloat(realizedPnL.toFixed(2)),
    realizedPnLPct:  parseFloat(realizedPnLPct.toFixed(3)),
    durationMs:      exitTime - pos.entryTime,
    closeReason:     isPartial ? `${closeReason}_PARTIAL` : closeReason,
    exchange:             pos.exchange,
    exchangeOrderId:      pos.exchangeOrderId,
    exchangeCloseOrderId: exchangeCloseOrderId,
    entryFee:             entryFee ?? undefined,
    exitFee:              exitFee ?? undefined,
    netFees:
      entryFee != null || exitFee != null || entryFeeBrokerProRated != null || brokerExitFee != null
        ? parseFloat(netFees.toFixed(4))
        : undefined,
    entryFeeBroker:         entryFeeBrokerProRated,
    entryFeeBrokerCurrency: entryFeeBrokerProRated !== undefined ? pos.entryFeeBrokerCurrency : undefined,
    exitFeeBroker:          brokerExitFee,
    exitFeeBrokerCurrency:  brokerExitFee !== undefined ? brokerExitFeeCurrency : undefined,
    sandbox:                pos.sandbox === true,
  };

  // Live trades pay broker commission on both legs — deduct from cash and
  // realized PnL so account equity reconciles to the receipt's Net P&L.
  // Paper trades have null fees (no broker) and behave exactly as before.
  state.account.cashBalance  += closedSizeUSD + realizedPnL - netFees;
  state.account.totalRealized += realizedPnL - netFees;
  state.account.totalTrades  += 1;
  if (isPartial) {
    pos.quantity = parseFloat((pos.quantity - closedQty).toFixed(8));
    pos.sizeUSD  = parseFloat((pos.sizeUSD - closedSizeUSD).toFixed(2));
    // Carry forward only the unallocated portion of the broker-reported
    // entry fee — otherwise a follow-up partial close would re-charge the
    // already-consumed slice and cumulative entry fees would exceed what
    // the broker actually billed.
    if (pos.entryFeeBroker !== undefined && entryFeeBrokerProRated !== undefined) {
      // Preserve sign — a maker rebate (negative fee) must continue to
      // accrue against subsequent partial closes, not be clamped away.
      const remaining = pos.entryFeeBroker - entryFeeBrokerProRated;
      pos.entryFeeBroker = parseFloat(remaining.toFixed(8));
    }
  } else {
    state.positions.splice(idx, 1);
  }
  state.tradeHistory.unshift(trade);

  const positionMutation = isPartial
    ? db.update(simPositionsTable)
        .set({
          quantity: pos.quantity,
          sizeUSD:  pos.sizeUSD,
          entryFeeBroker: pos.entryFeeBroker ?? null,
        })
        .where(eq(simPositionsTable.id, positionId))
    : db.delete(simPositionsTable).where(eq(simPositionsTable.id, positionId));

  await Promise.all([
    db.insert(simTradesTable).values({
      id:              trade.id,
      userId,
      symbol:          trade.symbol,
      side:            trade.side,
      quantity:        trade.quantity,
      entryPrice:      trade.entryPrice,
      exitPrice:       trade.exitPrice,
      entryTime:       trade.entryTime,
      exitTime:        trade.exitTime,
      sizeUSD:         trade.sizeUSD,
      realizedPnL:     trade.realizedPnL,
      realizedPnLPct:  trade.realizedPnLPct,
      durationMs:      trade.durationMs,
      closeReason:     trade.closeReason,
      exchange:             trade.exchange ?? null,
      exchangeOrderId:      trade.exchangeOrderId ?? null,
      exchangeCloseOrderId: trade.exchangeCloseOrderId ?? null,
      entryFee:             trade.entryFee ?? null,
      exitFee:              trade.exitFee ?? null,
      entryFeeBroker:         trade.entryFeeBroker ?? null,
      entryFeeBrokerCurrency: trade.entryFeeBrokerCurrency ?? null,
      exitFeeBroker:          trade.exitFeeBroker ?? null,
      exitFeeBrokerCurrency:  trade.exitFeeBrokerCurrency ?? null,
      sandbox:                trade.sandbox === true,
    }),
    positionMutation,
    persistAccount(state),
  ]);

  logger.info({ userId, positionId, realizedPnL: trade.realizedPnL, closeReason }, "UserSimRegistry: position closed");

  // Live position? Mirror the close into the user's notification feed +
  // push channel — symmetric counterpart to emitFillNotification on open.
  if (trade.exchange) {
    void emitLiveCloseNotification({
      userId,
      symbol:          trade.symbol,
      side:            trade.side,
      exchange:        trade.exchange,
      exitPrice:       trade.exitPrice,
      quantity:        trade.quantity,
      realizedPnL:     trade.realizedPnL,
      realizedPnLPct:  trade.realizedPnLPct,
      closeReason,
      exchangeOrderId: trade.exchangeOrderId,
      dryRun:          isDryRunEnabled(),
    });
  }

  return { success: true, trade };
}

export async function getUserTradeHistory(userId: string): Promise<UserSimTrade[]> {
  const state = await getOrLoad(userId);
  return [...state.tradeHistory];
}

export async function resetUserSimulation(userId: string): Promise<void> {
  const state = await getOrLoad(userId);

  await Promise.all([
    db.delete(simPositionsTable).where(eq(simPositionsTable.userId, userId)),
    db.delete(simTradesTable).where(eq(simTradesTable.userId, userId)),
    db.update(simAccountsTable)
      .set({ cashBalance: 100_000, totalRealized: 0, totalTrades: 0, updatedAt: new Date() })
      .where(eq(simAccountsTable.userId, userId)),
  ]);

  state.account.cashBalance  = 100_000;
  state.account.totalRealized = 0;
  state.account.totalTrades  = 0;
  state.positions            = [];
  state.tradeHistory         = [];

  logger.info({ userId }, "UserSimRegistry: simulation reset");
}
