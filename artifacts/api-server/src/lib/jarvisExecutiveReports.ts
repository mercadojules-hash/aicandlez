import {
  db,
  simPositionsTable,
  simTradesTable,
} from "@workspace/db";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { buildRiskGovernorReport24h, isRiskGovernorEnabled } from "./riskGovernor.js";

const LIVE_CLOSED_FILTER = and(
  isNotNull(simTradesTable.exchange),
  isNull(simTradesTable.reconciliationTag),
);

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function profitFactor(grossProfit: number, grossLoss: number): number | null {
  return grossLoss > 0 ? grossProfit / grossLoss : null;
}

export async function buildJarvisExecutiveReport(): Promise<Record<string, unknown>> {
  const [closedAgg, openAgg, recentCloses, riskGovernor] = await Promise.all([
    db
      .select({
        closedTrades: sql<number>`count(*)::int`,
        wins: sql<number>`(count(*) filter (where ${simTradesTable.realizedPnL} > 0))::int`,
        losses: sql<number>`(count(*) filter (where ${simTradesTable.realizedPnL} < 0))::int`,
        realizedPnl: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}), 0)`,
        grossProfit: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} > 0), 0)`,
        grossLoss: sql<number>`coalesce(abs(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} < 0)), 0)`,
      })
      .from(simTradesTable)
      .where(LIVE_CLOSED_FILTER),
    db
      .select({
        openPositions: sql<number>`count(*)::int`,
        openNotional: sql<number>`coalesce(sum(${simPositionsTable.sizeUSD}), 0)`,
      })
      .from(simPositionsTable)
      .where(isNotNull(simPositionsTable.exchange)),
    db
      .select({
        id: simTradesTable.id,
        userId: simTradesTable.userId,
        symbol: simTradesTable.symbol,
        side: simTradesTable.side,
        exchange: simTradesTable.exchange,
        sizeUSD: simTradesTable.sizeUSD,
        realizedPnL: simTradesTable.realizedPnL,
        realizedPnLPct: simTradesTable.realizedPnLPct,
        closeReason: simTradesTable.closeReason,
        exitTime: simTradesTable.exitTime,
      })
      .from(simTradesTable)
      .where(LIVE_CLOSED_FILTER)
      .orderBy(desc(simTradesTable.exitTime))
      .limit(10),
    buildRiskGovernorReport24h(),
  ]);

  const c = closedAgg[0];
  const o = openAgg[0];
  const wins = Number(c?.wins ?? 0);
  const losses = Number(c?.losses ?? 0);
  const decided = wins + losses;
  const grossProfit = Number(c?.grossProfit ?? 0);
  const grossLoss = Number(c?.grossLoss ?? 0);

  return {
    source: "jarvis-executive-service",
    scope: "platform",
    generatedAt: Date.now(),
    permissions: {
      readOnly: true,
      canTrade: false,
      canCancelOrders: false,
      canClosePositions: false,
      canReadExchangeCredentials: false,
      canMutateSettings: false,
      canOverrideRiskGovernor: false,
      canChangeKillSwitch: false,
    },
    metrics: {
      closedTrades: Number(c?.closedTrades ?? 0),
      wins,
      losses,
      winRate: pct(wins, decided),
      realizedPnl: Number(c?.realizedPnl ?? 0),
      grossProfit,
      grossLoss,
      profitFactor: profitFactor(grossProfit, grossLoss),
      openPositions: Number(o?.openPositions ?? 0),
      openNotional: Number(o?.openNotional ?? 0),
    },
    riskGovernor,
    recentCloses: recentCloses.map((r) => ({
      id: r.id,
      userId: r.userId,
      symbol: r.symbol,
      side: r.side,
      exchange: r.exchange,
      sizeUSD: Number(r.sizeUSD),
      realizedPnL: Number(r.realizedPnL),
      realizedPnLPct: Number(r.realizedPnLPct),
      closeReason: r.closeReason,
      exitTime: Number(r.exitTime),
    })),
  };
}

export async function buildJarvisReport24h(): Promise<Record<string, unknown>> {
  const now = Date.now();
  const since = now - 24 * 60 * 60 * 1000;
  const filter24h = and(
    LIVE_CLOSED_FILTER,
    gte(simTradesTable.exitTime, since),
  );

  const [summaryRows, exitRows, exchangeRows, topWinners, topLosers, riskGovernor] = await Promise.all([
    db
      .select({
        closedTrades: sql<number>`count(*)::int`,
        wins: sql<number>`(count(*) filter (where ${simTradesTable.realizedPnL} > 0))::int`,
        losses: sql<number>`(count(*) filter (where ${simTradesTable.realizedPnL} < 0))::int`,
        realizedPnl: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}), 0)`,
        grossProfit: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} > 0), 0)`,
        grossLoss: sql<number>`coalesce(abs(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} < 0)), 0)`,
      })
      .from(simTradesTable)
      .where(filter24h),
    db
      .select({
        closeReason: simTradesTable.closeReason,
        count: sql<number>`count(*)::int`,
        realizedPnl: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}), 0)`,
      })
      .from(simTradesTable)
      .where(filter24h)
      .groupBy(simTradesTable.closeReason),
    db
      .select({
        exchange: simTradesTable.exchange,
        count: sql<number>`count(*)::int`,
        realizedPnl: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}), 0)`,
      })
      .from(simTradesTable)
      .where(filter24h)
      .groupBy(simTradesTable.exchange),
    db
      .select({
        id: simTradesTable.id,
        symbol: simTradesTable.symbol,
        side: simTradesTable.side,
        exchange: simTradesTable.exchange,
        realizedPnL: simTradesTable.realizedPnL,
        realizedPnLPct: simTradesTable.realizedPnLPct,
        exitTime: simTradesTable.exitTime,
      })
      .from(simTradesTable)
      .where(and(filter24h, sql`${simTradesTable.realizedPnL} > 0`))
      .orderBy(desc(simTradesTable.realizedPnL))
      .limit(10),
    db
      .select({
        id: simTradesTable.id,
        symbol: simTradesTable.symbol,
        side: simTradesTable.side,
        exchange: simTradesTable.exchange,
        realizedPnL: simTradesTable.realizedPnL,
        realizedPnLPct: simTradesTable.realizedPnLPct,
        exitTime: simTradesTable.exitTime,
      })
      .from(simTradesTable)
      .where(and(filter24h, sql`${simTradesTable.realizedPnL} < 0`))
      .orderBy(simTradesTable.realizedPnL)
      .limit(10),
    buildRiskGovernorReport24h(),
  ]);

  const t = summaryRows[0];
  const wins = Number(t?.wins ?? 0);
  const losses = Number(t?.losses ?? 0);
  const decided = wins + losses;
  const grossProfit = Number(t?.grossProfit ?? 0);
  const grossLoss = Number(t?.grossLoss ?? 0);

  return {
    source: "jarvis-executive-service",
    scope: "platform",
    generatedAt: now,
    windowStart: since,
    windowEnd: now,
    summary: {
      closedTrades: Number(t?.closedTrades ?? 0),
      wins,
      losses,
      winRate: pct(wins, decided),
      realizedPnl: Number(t?.realizedPnl ?? 0),
      profitFactor: profitFactor(grossProfit, grossLoss),
    },
    exitBreakdown: exitRows.map((r) => ({
      closeReason: r.closeReason ?? "UNKNOWN",
      count: Number(r.count ?? 0),
      realizedPnl: Number(r.realizedPnl ?? 0),
    })),
    exchangeBreakdown: exchangeRows.map((r) => ({
      exchange: r.exchange,
      count: Number(r.count ?? 0),
      realizedPnl: Number(r.realizedPnl ?? 0),
    })),
    topWinners: topWinners.map(formatCompactTrade),
    topLosers: topLosers.map(formatCompactTrade),
    riskGovernor,
  };
}

export async function buildJarvisRiskGovernorReport(): Promise<Record<string, unknown>> {
  return {
    source: "jarvis-executive-service",
    scope: "platform",
    enabled: isRiskGovernorEnabled(),
    report24h: await buildRiskGovernorReport24h(),
    generatedAt: Date.now(),
  };
}

export async function buildJarvisTradesReport(limit = 50): Promise<Record<string, unknown>> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const rows = await db
    .select({
      id: simTradesTable.id,
      userId: simTradesTable.userId,
      symbol: simTradesTable.symbol,
      side: simTradesTable.side,
      exchange: simTradesTable.exchange,
      entryPrice: simTradesTable.entryPrice,
      exitPrice: simTradesTable.exitPrice,
      entryTime: simTradesTable.entryTime,
      exitTime: simTradesTable.exitTime,
      sizeUSD: simTradesTable.sizeUSD,
      realizedPnL: simTradesTable.realizedPnL,
      realizedPnLPct: simTradesTable.realizedPnLPct,
      closeReason: simTradesTable.closeReason,
      mfePct: simTradesTable.mfePct,
      maePct: simTradesTable.maePct,
      effTakeProfitPct: simTradesTable.effTakeProfitPct,
      effStopLossPct: simTradesTable.effStopLossPct,
      effTrailingStopPct: simTradesTable.effTrailingStopPct,
      effMaxHoldHours: simTradesTable.effMaxHoldHours,
    })
    .from(simTradesTable)
    .where(LIVE_CLOSED_FILTER)
    .orderBy(desc(simTradesTable.exitTime))
    .limit(safeLimit);

  return {
    source: "jarvis-executive-service",
    scope: "platform",
    generatedAt: Date.now(),
    limit: safeLimit,
    trades: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      symbol: r.symbol,
      side: r.side,
      exchange: r.exchange,
      entryPrice: Number(r.entryPrice),
      exitPrice: Number(r.exitPrice),
      entryTime: Number(r.entryTime),
      exitTime: Number(r.exitTime),
      sizeUSD: Number(r.sizeUSD),
      realizedPnL: Number(r.realizedPnL),
      realizedPnLPct: Number(r.realizedPnLPct),
      closeReason: r.closeReason,
      maximumUnrealizedProfitPct: r.mfePct == null ? null : Number(r.mfePct),
      maximumAdverseExcursionPct: r.maePct == null ? null : Number(r.maePct),
      effectiveExits: {
        takeProfitPct: r.effTakeProfitPct == null ? null : Number(r.effTakeProfitPct),
        stopLossPct: r.effStopLossPct == null ? null : Number(r.effStopLossPct),
        trailingStopPct: r.effTrailingStopPct == null ? null : Number(r.effTrailingStopPct),
        maxHoldHours: r.effMaxHoldHours == null ? null : Number(r.effMaxHoldHours),
      },
    })),
  };
}

function formatCompactTrade(r: {
  id: string;
  symbol: string;
  side: string;
  exchange: string | null;
  realizedPnL: number;
  realizedPnLPct: number;
  exitTime: number;
}) {
  return {
    id: r.id,
    symbol: r.symbol,
    side: r.side,
    exchange: r.exchange,
    realizedPnL: Number(r.realizedPnL),
    realizedPnLPct: Number(r.realizedPnLPct),
    exitTime: Number(r.exitTime),
  };
}
