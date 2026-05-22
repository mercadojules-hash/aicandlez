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
  entryFee?: number;
  exitFee?: number;
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
    })),
    tradeHistory: dbTrades.map((t) => ({
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
      entryFee:             t.entryFee ?? undefined,
      exitFee:              t.exitFee ?? undefined,
    })),
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

export async function getUserAccountSummary(userId: string) {
  const state   = await getOrLoad(userId);
  const enriched = await enrichPositions(state.positions);
  const unrealizedTotal = enriched.reduce((s, p) => s + (p.unrealizedPnL ?? 0), 0);
  const positionValue   = enriched.reduce((s, p) => s + (p.marketValue ?? p.sizeUSD), 0);
  const equity          = state.account.cashBalance + positionValue;
  const totalPnL        = equity - state.account.startingBalance;
  const totalPnLPct     = (totalPnL / state.account.startingBalance) * 100;

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
  const isLive = !!(pos.exchange && pos.exchangeOrderId);
  if (isLive) {
    const closeRes = await placeLiveCloseOrderForUser({
      userId,
      symbol:   pos.symbol,
      openSide: pos.side,
      quantity: pos.quantity,
      exchange: pos.exchange!,
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

  const realizedPnL =
    pos.side === "BUY"
      ? (exitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - exitPrice) * pos.quantity;

  const realizedPnLPct = (realizedPnL / pos.sizeUSD) * 100;
  const exitTime       = Date.now();
  const tradeId        = newId(state);

  // Broker commission for both legs (live trades only — null for paper)
  const exitNotional = exitPrice * pos.quantity;
  const entryFee = computeFillFee(pos.exchange, pos.sizeUSD);
  const exitFee  = computeFillFee(pos.exchange, exitNotional);

  const trade: UserSimTrade = {
    id:              tradeId,
    userId,
    symbol:          pos.symbol,
    side:            pos.side,
    quantity:        pos.quantity,
    entryPrice:      pos.entryPrice,
    exitPrice:       parseFloat(exitPrice.toFixed(2)),
    entryTime:       pos.entryTime,
    exitTime,
    sizeUSD:         pos.sizeUSD,
    realizedPnL:     parseFloat(realizedPnL.toFixed(2)),
    realizedPnLPct:  parseFloat(realizedPnLPct.toFixed(3)),
    durationMs:      exitTime - pos.entryTime,
    closeReason,
    exchange:             pos.exchange,
    exchangeOrderId:      pos.exchangeOrderId,
    exchangeCloseOrderId: exchangeCloseOrderId,
    entryFee:             entryFee ?? undefined,
    exitFee:              exitFee ?? undefined,
  };

  state.account.cashBalance  += pos.sizeUSD + realizedPnL;
  state.account.totalRealized += realizedPnL;
  state.account.totalTrades  += 1;
  state.positions.splice(idx, 1);
  state.tradeHistory.unshift(trade);

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
    }),
    db.delete(simPositionsTable).where(eq(simPositionsTable.id, positionId)),
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
