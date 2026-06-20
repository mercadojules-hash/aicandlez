import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  db,
  plannedTradesTable,
  simAccountsTable,
  simPositionsTable,
  userAdminActionsTable,
  userSettingsTable,
} from "@workspace/db";
import { getTicker } from "./marketData.js";
import { logger } from "./logger.js";
import { closeUserPosition, registerLiveUserFill } from "./userSimRegistry.js";
import { resolveExitConfig } from "./exitConfig.js";
import { roundOptionalPrice } from "./pricePrecision.js";
import { genCorrelationId, rememberCorrelation } from "./executionTelemetry.js";
import { notifyFillHydrated } from "./positionStore.js";

type PlannedStatus =
  | "Waiting"
  | "Triggering Buy"
  | "Sell Armed"
  | "Selling"
  | "Completed"
  | "Expired"
  | "Cancelled"
  | "Failed";

const RATE_LIMIT_RE = /\b(429|rate\s*limit|too many requests)\b/i;

function isRetryableBrokerError(message: string | undefined | null): boolean {
  return RATE_LIMIT_RE.test(String(message ?? ""));
}

async function writePlanAudit(args: {
  actorId?: string | null;
  targetUserId: string;
  action: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.insert(userAdminActionsTable).values({
    id: randomUUID(),
    actorAdminId: args.actorId ?? args.targetUserId,
    targetUserId: args.targetUserId,
    action: args.action,
    payload: args.payload,
  });
}

export async function setManualExitTarget(args: {
  userId: string;
  positionId: string;
  targetPrice: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await db
    .update(simPositionsTable)
    .set({ manualExitTargetPrice: args.targetPrice })
    .where(and(eq(simPositionsTable.id, args.positionId), eq(simPositionsTable.userId, args.userId)))
    .returning({ id: simPositionsTable.id });
  if (rows.length === 0) return { ok: false, error: "Open position not found for target user" };
  return { ok: true };
}

async function validatePlannedBuyBudget(args: {
  userId: string;
  sizeUSD: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [settings, acct] = await Promise.all([
    db
      .select({ preferredLiveOrderSizeUsd: userSettingsTable.preferredLiveOrderSizeUsd })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, args.userId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ cashBalance: simAccountsTable.cashBalance })
      .from(simAccountsTable)
      .where(eq(simAccountsTable.userId, args.userId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);
  const configuredMax = Number(settings?.preferredLiveOrderSizeUsd ?? 0);
  if (configuredMax > 0 && args.sizeUSD > configuredMax + 1e-9) {
    return { ok: false, error: `Planned buy size $${args.sizeUSD.toFixed(2)} exceeds configured trade size $${configuredMax.toFixed(2)}` };
  }
  const cash = Number(acct?.cashBalance ?? 0);
  if (cash > 0 && args.sizeUSD > cash + 1e-9) {
    return { ok: false, error: `Planned buy size $${args.sizeUSD.toFixed(2)} exceeds available cash $${cash.toFixed(2)}` };
  }
  return { ok: true };
}

export async function createPlannedTrade(args: {
  userId: string;
  symbol: string;
  buyTargetPrice: number;
  sellTargetPrice?: number | null;
  positionSizeUSD: number;
  expirationTime?: number | null;
  createdBy?: string | null;
}) {
  const symbol = args.symbol.trim().toUpperCase();
  const budget = await validatePlannedBuyBudget({ userId: args.userId, sizeUSD: args.positionSizeUSD });
  if (!budget.ok) throw new Error(budget.error);
  let direction: "ABOVE" | "BELOW" = "BELOW";
  try {
    const ticker = await getTicker(symbol);
    direction = args.buyTargetPrice >= ticker.price ? "ABOVE" : "BELOW";
  } catch {
    direction = "BELOW";
  }
  const [row] = await db
    .insert(plannedTradesTable)
    .values({
      id: randomUUID(),
      planType: "PLANNED_BUY",
      userId: args.userId,
      symbol,
      buyTargetPrice: args.buyTargetPrice,
      buyTriggerDirection: direction,
      sellTargetPrice: args.sellTargetPrice ?? null,
      positionSizeUSD: args.positionSizeUSD,
      expirationTime: args.expirationTime ?? null,
      status: "Waiting",
      createdBy: args.createdBy ?? null,
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

export async function createSellTarget(args: {
  userId: string;
  positionId: string;
  targetPrice?: number | null;
  targetProfitUSD?: number | null;
  createdBy?: string | null;
}) {
  const [position] = await db
    .select()
    .from(simPositionsTable)
    .where(and(eq(simPositionsTable.id, args.positionId), eq(simPositionsTable.userId, args.userId)))
    .limit(1);
  if (!position) throw new Error("Open position not found for target user");
  if (!position.exchange || !position.exchangeOrderId) {
    throw new Error("Sell targets are restricted to live exchange positions");
  }
  const [activeTarget] = await db
    .select({ id: plannedTradesTable.id })
    .from(plannedTradesTable)
    .where(and(
      eq(plannedTradesTable.userId, args.userId),
      inArray(plannedTradesTable.status, ["Sell Armed", "Selling"]),
      or(
        eq(plannedTradesTable.targetPositionId, args.positionId),
        eq(plannedTradesTable.enteredPositionId, args.positionId),
      ),
    ))
    .limit(1);
  if (activeTarget) {
    throw new Error("An active sell target already exists for this position");
  }
  let targetPrice = args.targetPrice ?? null;
  const targetProfitUSD = args.targetProfitUSD ?? null;
  if ((targetPrice == null || !(targetPrice > 0)) && targetProfitUSD != null && targetProfitUSD > 0) {
    targetPrice = position.side === "SELL"
      ? position.entryPrice - targetProfitUSD / position.quantity
      : position.entryPrice + targetProfitUSD / position.quantity;
  }
  if (targetPrice == null || !(targetPrice > 0)) {
    throw new Error("A positive targetPrice or targetProfitUSD is required");
  }
  const [row] = await db
    .insert(plannedTradesTable)
    .values({
      id: randomUUID(),
      planType: "SELL_TARGET",
      userId: args.userId,
      symbol: position.symbol,
      buyTargetPrice: null,
      sellTargetPrice: targetPrice,
      targetProfitUSD,
      positionSizeUSD: position.sizeUSD,
      status: "Sell Armed",
      enteredPositionId: position.id,
      targetPositionId: position.id,
      enteredAt: position.entryTime,
      createdBy: args.createdBy ?? null,
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

export async function cancelPlannedTrade(id: string): Promise<{ ok: boolean; error?: string }> {
  const rows = await db
    .update(plannedTradesTable)
    .set({ status: "Cancelled", cancelledAt: Date.now(), updatedAt: new Date() })
    .where(and(eq(plannedTradesTable.id, id), inArray(plannedTradesTable.status, ["Waiting", "Triggering Buy", "Sell Armed", "Selling"])))
    .returning({ id: plannedTradesTable.id });
  return rows.length > 0 ? { ok: true } : { ok: false, error: "Planned trade not found or already terminal" };
}

export async function updatePlannedTrade(args: {
  id: string;
  buyTargetPrice?: number | null;
  sellTargetPrice?: number | null;
  targetProfitUSD?: number | null;
  positionSizeUSD?: number | null;
  expirationTime?: number | null;
}): Promise<{ ok: true; row: typeof plannedTradesTable.$inferSelect } | { ok: false; error: string }> {
  const [existing] = await db.select().from(plannedTradesTable).where(eq(plannedTradesTable.id, args.id)).limit(1);
  if (!existing) return { ok: false, error: "Planned trade not found" };
  if (!["Waiting", "Sell Armed"].includes(existing.status)) {
    return { ok: false, error: "Only waiting buys or armed sell targets can be modified" };
  }
  const patch: Partial<typeof plannedTradesTable.$inferInsert> = { updatedAt: new Date(), lastError: null };
  if (args.buyTargetPrice !== undefined) patch.buyTargetPrice = args.buyTargetPrice;
  if (args.sellTargetPrice !== undefined) patch.sellTargetPrice = args.sellTargetPrice;
  if (args.targetProfitUSD !== undefined) patch.targetProfitUSD = args.targetProfitUSD;
  if (existing.planType === "PLANNED_BUY" && args.positionSizeUSD !== undefined && args.positionSizeUSD !== null) {
    const budget = await validatePlannedBuyBudget({ userId: existing.userId, sizeUSD: args.positionSizeUSD });
    if (!budget.ok) return { ok: false, error: budget.error };
    patch.positionSizeUSD = args.positionSizeUSD;
  }
  if (args.expirationTime !== undefined) patch.expirationTime = args.expirationTime;
  if (existing.planType === "PLANNED_BUY" && patch.buyTargetPrice != null) {
    try {
      const ticker = await getTicker(existing.symbol);
      patch.buyTriggerDirection = patch.buyTargetPrice >= ticker.price ? "ABOVE" : "BELOW";
    } catch {
      patch.buyTriggerDirection = existing.buyTriggerDirection ?? "BELOW";
    }
  }
  if (existing.planType === "SELL_TARGET" && (args.targetProfitUSD != null || args.sellTargetPrice != null)) {
    const [position] = await db
      .select()
      .from(simPositionsTable)
      .where(and(eq(simPositionsTable.id, existing.targetPositionId ?? existing.enteredPositionId ?? ""), eq(simPositionsTable.userId, existing.userId)))
      .limit(1);
    if (!position) return { ok: false, error: "Open position not found for sell target" };
    if ((args.sellTargetPrice == null || !(args.sellTargetPrice > 0)) && args.targetProfitUSD != null && args.targetProfitUSD > 0) {
      patch.sellTargetPrice = position.side === "SELL"
        ? position.entryPrice - args.targetProfitUSD / position.quantity
        : position.entryPrice + args.targetProfitUSD / position.quantity;
    }
  }
  const [row] = await db
    .update(plannedTradesTable)
    .set(patch)
    .where(eq(plannedTradesTable.id, args.id))
    .returning();
  return row ? { ok: true, row } : { ok: false, error: "Planned trade update failed" };
}

export async function runOperatorTradeControlsMonitor(): Promise<void> {
  await Promise.all([
    runManualExitTargetMonitor(),
    runPlannedTradeMonitor(),
  ]);
}

async function runManualExitTargetMonitor(): Promise<void> {
  const rows = await db
    .select({
      userId: simPositionsTable.userId,
      positionId: simPositionsTable.id,
      symbol: simPositionsTable.symbol,
      side: simPositionsTable.side,
      target: simPositionsTable.manualExitTargetPrice,
    })
    .from(simPositionsTable)
    .where(isNotNull(simPositionsTable.manualExitTargetPrice));
  if (rows.length === 0) return;

  const priceBySymbol = await loadPrices([...new Set(rows.map((r) => r.symbol))]);
  await Promise.all(rows.map(async (p) => {
    const target = Number(p.target);
    const price = priceBySymbol.get(p.symbol);
    if (!(target > 0) || price === undefined || !(price > 0)) return;
    const isSellSide = String(p.side).toUpperCase() === "SELL";
    const reached = isSellSide ? price <= target : price >= target;
    if (!reached) return;

    const result = await closeUserPosition(p.userId, p.positionId, "MANUAL_TARGET_EXIT");
    if (result.success) {
      await db
        .update(simPositionsTable)
        .set({ manualExitTargetPrice: null })
        .where(eq(simPositionsTable.id, p.positionId));
      logger.warn(
        { tag: "MANUAL_TARGET_EXIT", userId: p.userId, positionId: p.positionId, symbol: p.symbol, target, price },
        "[MANUAL_TARGET_EXIT] operator target reached; close executed",
      );
    } else {
      logger.warn(
        { tag: "MANUAL_TARGET_EXIT_FAILED", userId: p.userId, positionId: p.positionId, symbol: p.symbol, target, price, error: result.error },
        "[MANUAL_TARGET_EXIT_FAILED] operator target reached but close failed",
      );
    }
  }));
}

async function runPlannedTradeMonitor(): Promise<void> {
  const plans = await db
    .select()
    .from(plannedTradesTable)
    .where(inArray(plannedTradesTable.status, ["Waiting", "Sell Armed"]));
  if (plans.length === 0) return;

  const now = Date.now();
  const waiting = plans.filter((p) => p.status === "Waiting");
  const expired = waiting.filter((p) => p.expirationTime != null && p.expirationTime <= now);
  if (expired.length > 0) {
    await db
      .update(plannedTradesTable)
      .set({ status: "Expired", updatedAt: new Date() })
      .where(inArray(plannedTradesTable.id, expired.map((p) => p.id)));
  }

  const active = plans.filter((p) => !(p.status === "Waiting" && p.expirationTime != null && p.expirationTime <= now));
  const priceBySymbol = await loadPrices([...new Set(active.map((p) => p.symbol))]);

  await Promise.all(active.map(async (plan) => {
    const price = priceBySymbol.get(plan.symbol);
    if (price === undefined || !(price > 0)) return;
    if (plan.status === "Waiting" && plan.planType === "PLANNED_BUY") {
      const target = Number(plan.buyTargetPrice ?? 0);
      if (!(target > 0)) return;
      const direction = plan.buyTriggerDirection === "ABOVE" ? "ABOVE" : "BELOW";
      const reached = direction === "ABOVE" ? price >= target : price <= target;
      if (!reached) return;
      await enterPlannedTrade(plan, price);
      return;
    }
    if (plan.status === "Sell Armed" && (plan.enteredPositionId || plan.targetPositionId) && plan.sellTargetPrice != null) {
      await exitPlannedTrade(plan, price);
    }
  }));
}

async function enterPlannedTrade(plan: typeof plannedTradesTable.$inferSelect, triggerPrice: number): Promise<void> {
  const correlationId = genCorrelationId();
  const claimed = await db
    .update(plannedTradesTable)
    .set({ status: "Triggering Buy", lastCheckedAt: Date.now(), attemptCount: sql`${plannedTradesTable.attemptCount} + 1`, updatedAt: new Date() })
    .where(and(eq(plannedTradesTable.id, plan.id), eq(plannedTradesTable.status, "Waiting")))
    .returning({ id: plannedTradesTable.id });
  if (claimed.length === 0) return;
  try {
    const budget = await validatePlannedBuyBudget({ userId: plan.userId, sizeUSD: plan.positionSizeUSD });
    if (!budget.ok) {
      await markPlanTerminal(plan.id, "Failed", budget.error);
      return;
    }
    const { executeCustomerOrder } = await import("./executionGateway.js");
    const result = await executeCustomerOrder({
      trigger: "manual",
      userId: plan.userId,
      symbol: plan.symbol,
      side: "BUY",
      sizeUSD: plan.positionSizeUSD,
      useSandbox: false,
      correlationId,
    });
    if (!result.success) {
      const message = `entry_rejected:${result.errorCode ?? "unknown"}:${result.error ?? ""}`;
      if (isRetryableBrokerError(message)) {
        await db
          .update(plannedTradesTable)
          .set({ status: "Waiting", lastError: message.slice(0, 1_000), updatedAt: new Date() })
          .where(and(eq(plannedTradesTable.id, plan.id), eq(plannedTradesTable.status, "Triggering Buy")));
      } else {
        await markPlanTerminal(plan.id, "Failed", message);
      }
      return;
    }

    const entry = result.fillPrice ?? triggerPrice;
    const sizeUSD = result.sizeUSD ?? plan.positionSizeUSD;
    const qty = result.quantity ?? (entry > 0 ? sizeUSD / entry : 0);
    if (!(entry > 0) || !(qty > 0)) {
      await markPlanTerminal(plan.id, "Failed", "entry_missing_positive_fill");
      return;
    }
    const cfg = await resolveExitConfig(plan.userId, result.exchange ?? null);
    const stopLoss = roundOptionalPrice(entry * (1 - cfg.stopLossPercent / 100));
    const takeProfit = roundOptionalPrice(entry * (1 + cfg.takeProfitPercent / 100));
    const orderId = result.exchangeOrderId ?? `PLANNED-LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const position = await registerLiveUserFill({
      userId: plan.userId,
      symbol: plan.symbol,
      side: "BUY",
      quantity: qty,
      entryPrice: entry,
      sizeUSD,
      signalId: `PLANNED_TRADE:${plan.id}`,
      stopLoss: stopLoss ?? undefined,
      takeProfit: takeProfit ?? undefined,
      manualExitTargetPrice: undefined,
      exchange: result.exchange ?? "unknown",
      exchangeOrderId: orderId,
      entryFeeBroker: result.brokerFee,
      entryFeeBrokerCurrency: result.brokerFeeCurrency,
      sandbox: false,
    });
    rememberCorrelation(position.id, correlationId, "manual");
    rememberCorrelation(result.exchangeOrderId ?? null, correlationId, "manual");
    notifyFillHydrated({
      trigger: "manual",
      correlationId,
      userId: plan.userId,
      symbol: plan.symbol,
      side: "BUY",
      sizeUSD,
      fillPrice: entry,
      quantity: qty,
      exchange: result.exchange ?? null,
      exchangeOrderId: result.exchangeOrderId ?? null,
      positionId: position.id,
      runtimeMode: "live",
      latencyMs: 0,
      sandbox: false,
      dryRun: result.dryRun === true,
    });
    await db
      .update(plannedTradesTable)
      .set({
        status: plan.sellTargetPrice != null ? "Sell Armed" satisfies PlannedStatus : "Completed" satisfies PlannedStatus,
        enteredPositionId: position.id,
        enteredAt: Date.now(),
        completedAt: plan.sellTargetPrice == null ? Date.now() : null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(plannedTradesTable.id, plan.id), eq(plannedTradesTable.status, "Triggering Buy")));
    await writePlanAudit({
      actorId: plan.createdBy,
      targetUserId: plan.userId,
      action: "PLANNED_BUY_FILLED",
      payload: {
        planId: plan.id,
        symbol: plan.symbol,
        triggerPrice,
        exchange: result.exchange ?? null,
        exchangeOrderId: result.exchangeOrderId ?? null,
        positionId: position.id,
        sizeUSD,
        fillPrice: entry,
        quantity: qty,
        sellTargetPrice: plan.sellTargetPrice ?? null,
      },
    });
    logger.warn(
      { tag: "PLANNED_TRADE_ENTERED", planId: plan.id, userId: plan.userId, symbol: plan.symbol, triggerPrice, positionId: position.id },
      "[PLANNED_TRADE_ENTERED] planned buy target reached; sell target armed",
    );
  } catch (err) {
    await markPlanTerminal(plan.id, "Failed", err instanceof Error ? err.message : String(err));
  }
}

async function exitPlannedTrade(plan: typeof plannedTradesTable.$inferSelect, triggerPrice: number): Promise<void> {
  const positionId = plan.targetPositionId ?? plan.enteredPositionId;
  if (!positionId) return;
  const [position] = await db
    .select({
      side: simPositionsTable.side,
    })
    .from(simPositionsTable)
    .where(and(eq(simPositionsTable.id, positionId), eq(simPositionsTable.userId, plan.userId)))
    .limit(1);
  if (!position) {
    await markPlanTerminal(plan.id, "Failed", "target_position_not_found");
    return;
  }
  const target = Number(plan.sellTargetPrice);
  if (!(target > 0)) return;
  const isSellSide = String(position.side).toUpperCase() === "SELL";
  const reached = isSellSide ? triggerPrice <= target : triggerPrice >= target;
  if (!reached) return;

  const claimed = await db
    .update(plannedTradesTable)
    .set({ status: "Selling", lastCheckedAt: Date.now(), attemptCount: sql`${plannedTradesTable.attemptCount} + 1`, updatedAt: new Date() })
    .where(and(eq(plannedTradesTable.id, plan.id), eq(plannedTradesTable.status, "Sell Armed")))
    .returning({ id: plannedTradesTable.id });
  if (claimed.length === 0) return;
  const result = await closeUserPosition(plan.userId, positionId, "OPERATOR_TARGET_EXIT");
  if (!result.success || !result.trade) {
    const message = `exit_failed:${result.error ?? "unknown"}`;
    if (isRetryableBrokerError(message)) {
      await db
        .update(plannedTradesTable)
        .set({ status: "Sell Armed", lastError: message.slice(0, 1_000), updatedAt: new Date() })
        .where(and(eq(plannedTradesTable.id, plan.id), eq(plannedTradesTable.status, "Selling")));
    } else {
      await markPlanTerminal(plan.id, "Failed", message);
    }
    return;
  }
  await db
    .update(plannedTradesTable)
    .set({
      status: "Completed" satisfies PlannedStatus,
      completedTradeId: result.trade.id,
      completedAt: Date.now(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(plannedTradesTable.id, plan.id));
  await writePlanAudit({
    actorId: plan.createdBy,
    targetUserId: plan.userId,
    action: "OPERATOR_TARGET_EXIT_FILLED",
    payload: {
      planId: plan.id,
      positionId,
      symbol: result.trade.symbol,
      triggerPrice,
      targetPrice: plan.sellTargetPrice,
      targetProfitUSD: plan.targetProfitUSD,
      tradeId: result.trade.id,
      exitPrice: result.trade.exitPrice,
      realizedPnL: result.trade.realizedPnL,
      realizedPnLPct: result.trade.realizedPnLPct,
      closeReason: result.trade.closeReason,
    },
  });
  logger.warn(
    { tag: "PLANNED_TRADE_COMPLETED", planId: plan.id, userId: plan.userId, symbol: plan.symbol, triggerPrice, tradeId: result.trade.id },
    "[PLANNED_TRADE_COMPLETED] planned sell target reached; trade completed",
  );
}

async function markPlanTerminal(id: string, status: "Failed" | "Expired", error?: string): Promise<void> {
  await db
    .update(plannedTradesTable)
    .set({ status, lastError: error?.slice(0, 1_000) ?? null, updatedAt: new Date() })
    .where(eq(plannedTradesTable.id, id));
}

async function loadPrices(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(symbols.map(async (symbol) => {
    try {
      const ticker = await getTicker(symbol);
      if (ticker.price > 0) out.set(symbol, ticker.price);
    } catch {
      /* skip until next monitor tick */
    }
  }));
  return out;
}
