import { db } from "@workspace/db";
import {
  simAccountsTable,
  simPositionsTable,
  simTradesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getTicker, SUPPORTED_SYMBOLS } from "./marketData.js";
import { logger } from "./logger.js";

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
      id:         p.id,
      userId:     p.userId,
      symbol:     p.symbol,
      side:       p.side as "BUY" | "SELL",
      quantity:   p.quantity,
      entryPrice: p.entryPrice,
      entryTime:  p.entryTime,
      sizeUSD:    p.sizeUSD,
      signalId:   p.signalId ?? undefined,
      stopLoss:   p.stopLoss ?? undefined,
      takeProfit: p.takeProfit ?? undefined,
    })),
    tradeHistory: dbTrades.map((t) => ({
      id:             t.id,
      userId:         t.userId,
      symbol:         t.symbol,
      side:           t.side as "BUY" | "SELL",
      quantity:       t.quantity,
      entryPrice:     t.entryPrice,
      exitPrice:      t.exitPrice,
      entryTime:      t.entryTime,
      exitTime:       t.exitTime,
      sizeUSD:        t.sizeUSD,
      realizedPnL:    t.realizedPnL,
      realizedPnLPct: t.realizedPnLPct,
      durationMs:     t.durationMs,
      closeReason:    t.closeReason ?? "MANUAL",
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

  let exitPrice: number;
  try {
    const ticker = await getTicker(pos.symbol);
    exitPrice = ticker.price;
  } catch (e) {
    return { success: false, error: `Failed to fetch price: ${e instanceof Error ? e.message : String(e)}` };
  }

  const realizedPnL =
    pos.side === "BUY"
      ? (exitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - exitPrice) * pos.quantity;

  const realizedPnLPct = (realizedPnL / pos.sizeUSD) * 100;
  const exitTime       = Date.now();
  const tradeId        = newId(state);

  const trade: UserSimTrade = {
    id:             tradeId,
    userId,
    symbol:         pos.symbol,
    side:           pos.side,
    quantity:       pos.quantity,
    entryPrice:     pos.entryPrice,
    exitPrice:      parseFloat(exitPrice.toFixed(2)),
    entryTime:      pos.entryTime,
    exitTime,
    sizeUSD:        pos.sizeUSD,
    realizedPnL:    parseFloat(realizedPnL.toFixed(2)),
    realizedPnLPct: parseFloat(realizedPnLPct.toFixed(3)),
    durationMs:     exitTime - pos.entryTime,
    closeReason,
  };

  state.account.cashBalance  += pos.sizeUSD + realizedPnL;
  state.account.totalRealized += realizedPnL;
  state.account.totalTrades  += 1;
  state.positions.splice(idx, 1);
  state.tradeHistory.unshift(trade);

  await Promise.all([
    db.insert(simTradesTable).values({
      id:             trade.id,
      userId,
      symbol:         trade.symbol,
      side:           trade.side,
      quantity:       trade.quantity,
      entryPrice:     trade.entryPrice,
      exitPrice:      trade.exitPrice,
      entryTime:      trade.entryTime,
      exitTime:       trade.exitTime,
      sizeUSD:        trade.sizeUSD,
      realizedPnL:    trade.realizedPnL,
      realizedPnLPct: trade.realizedPnLPct,
      durationMs:     trade.durationMs,
      closeReason:    trade.closeReason,
    }),
    db.delete(simPositionsTable).where(eq(simPositionsTable.id, positionId)),
    persistAccount(state),
  ]);

  logger.info({ userId, positionId, realizedPnL: trade.realizedPnL, closeReason }, "UserSimRegistry: position closed");
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
