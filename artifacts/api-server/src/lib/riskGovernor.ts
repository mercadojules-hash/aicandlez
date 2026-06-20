import { db } from "@workspace/db";
import {
  riskGovernorEventsTable,
  riskGovernorStatesTable,
  simAccountsTable,
  simPositionsTable,
  simTradesTable,
  type RiskGovernorPauseReason,
  type RiskGovernorEventType,
  type RiskGovernorReasonCode,
  type RiskGovernorStatus,
  type RiskGovernorState,
} from "@workspace/db";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { settingsStore } from "./settingsStore.js";

const CONSECUTIVE_LOSS_LIMIT = 8;
const ROLLING20_MIN_TRADES = 20;
const ROLLING20_WIN_RATE_FLOOR = 0.35;
const DAILY_LOSS_EQUITY_PCT_LIMIT = 5;
const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export interface RiskGovernorClosedTrade {
  id: string;
  realizedPnL: number;
  exitTime: number;
}

export interface RiskGovernorMetrics {
  consecutiveLosses: number;
  rolling20Trades: number;
  rolling20WinRate: number | null;
  dailyRealizedPnl: number;
  dailyRealizedLossPct: number | null;
  equityUsd: number | null;
  lastEvaluatedTradeId: string | null;
  lastEvaluatedExitTime: number | null;
}

export interface RiskGovernorDecision {
  enabled: boolean;
  status: RiskGovernorStatus;
  paused: boolean;
  blockNewEntries: boolean;
  pauseReason: RiskGovernorPauseReason | null;
  message: string;
  cooldownUntil: Date | null;
  manualOverrideActive: boolean;
  manualOverrideExpiresAt: Date | null;
  exchangeHealthOk: boolean | null;
  globalKillSwitchActive: boolean;
  degraded: boolean;
  degradedReasons: string[];
  metrics: RiskGovernorMetrics;
}

interface ComputeArgs {
  enabled: boolean;
  tradesDesc: RiskGovernorClosedTrade[];
  dailyRealizedPnl: number;
  equityUsd: number | null;
  previous?: Pick<RiskGovernorState,
    "status" | "paused" | "pauseReason" | "pausedAt" | "cooldownUntil" |
    "manualOverrideActive" | "manualOverrideExpiresAt"
  > | null;
  nowMs: number;
  cooldownMs: number;
  exchangeHealthOk?: boolean | null;
  globalKillSwitchActive: boolean;
}

export function isRiskGovernorEnabled(): boolean {
  return process.env["RISK_GOVERNOR_ENABLED"] === "true";
}

export function getRiskGovernorCooldownMs(): number {
  const raw = process.env["RISK_GOVERNOR_COOLDOWN_MS"];
  if (raw === undefined || raw === "") return DEFAULT_COOLDOWN_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COOLDOWN_MS;
}

export function computeRiskGovernorDecision(args: ComputeArgs): RiskGovernorDecision {
  const {
    enabled,
    tradesDesc,
    dailyRealizedPnl,
    equityUsd,
    previous,
    nowMs,
    cooldownMs,
    globalKillSwitchActive,
  } = args;
  const exchangeHealthOk = args.exchangeHealthOk ?? null;
  const degradedReasons: string[] = [];
  const latest = tradesDesc[0] ?? null;
  const consecutiveLosses = countConsecutiveLosses(tradesDesc);
  const rolling20 = tradesDesc.slice(0, ROLLING20_MIN_TRADES);
  const rolling20Trades = rolling20.length;
  const rolling20Wins = rolling20.filter((t) => t.realizedPnL > 0).length;
  const rolling20WinRate = rolling20Trades >= ROLLING20_MIN_TRADES
    ? rolling20Wins / rolling20Trades
    : null;
  if (equityUsd === null || !(equityUsd > 0)) degradedReasons.push("equity_unavailable");
  const dailyRealizedLossPct =
    equityUsd !== null && equityUsd > 0 && dailyRealizedPnl < 0
      ? (Math.abs(dailyRealizedPnl) / equityUsd) * 100
      : equityUsd !== null && equityUsd > 0
        ? 0
        : null;

  const metrics: RiskGovernorMetrics = {
    consecutiveLosses,
    rolling20Trades,
    rolling20WinRate,
    dailyRealizedPnl,
    dailyRealizedLossPct,
    equityUsd,
    lastEvaluatedTradeId: latest?.id ?? null,
    lastEvaluatedExitTime: latest?.exitTime ?? null,
  };

  if (!enabled) {
    return {
      enabled,
      status: "DISABLED",
      paused: false,
      blockNewEntries: false,
      pauseReason: null,
      message: "Risk Governor disabled by feature flag.",
      cooldownUntil: null,
      manualOverrideActive: false,
      manualOverrideExpiresAt: null,
      exchangeHealthOk,
      globalKillSwitchActive,
      degraded: degradedReasons.length > 0,
      degradedReasons,
      metrics,
    };
  }

  const prevOverrideActive = previous?.manualOverrideActive === true;
  const prevOverrideExpiresAt = previous?.manualOverrideExpiresAt ?? null;
  const overrideStillActive =
    prevOverrideActive &&
    (prevOverrideExpiresAt === null || prevOverrideExpiresAt.getTime() > nowMs);
  if (overrideStillActive) {
    return {
      enabled,
      status: "MANUAL_OVERRIDE",
      paused: false,
      blockNewEntries: false,
      pauseReason: previous?.pauseReason ?? null,
      message: "Manual operator override is active; new entries are allowed.",
      cooldownUntil: previous?.cooldownUntil ?? null,
      manualOverrideActive: true,
      manualOverrideExpiresAt: prevOverrideExpiresAt,
      exchangeHealthOk,
      globalKillSwitchActive,
      degraded: degradedReasons.length > 0,
      degradedReasons,
      metrics,
    };
  }

  const triggered = firstTriggeredPause(metrics);
  if (triggered) {
    const pausedAt = previous?.pausedAt ?? new Date(nowMs);
    const cooldownUntil = previous?.cooldownUntil ?? new Date(pausedAt.getTime() + cooldownMs);
    return {
      enabled,
      status: statusForReason(triggered),
      paused: true,
      blockNewEntries: true,
      pauseReason: triggered,
      message: pauseMessage(triggered, metrics),
      cooldownUntil,
      manualOverrideActive: false,
      manualOverrideExpiresAt: prevOverrideExpiresAt,
      exchangeHealthOk,
      globalKillSwitchActive,
      degraded: degradedReasons.length > 0,
      degradedReasons,
      metrics,
    };
  }

  const wasPaused = previous?.paused === true || (previous?.status?.startsWith("PAUSED_") ?? false);
  const priorCooldownUntil = previous?.cooldownUntil ?? null;
  if (wasPaused) {
    const cooldownUntil = priorCooldownUntil ?? new Date(nowMs + cooldownMs);
    if (cooldownUntil.getTime() > nowMs) {
      return {
        enabled,
        status: "COOLDOWN",
        paused: true,
        blockNewEntries: true,
        pauseReason: previous?.pauseReason ?? null,
        message: "Risk Governor cooldown is still active.",
        cooldownUntil,
        manualOverrideActive: false,
        manualOverrideExpiresAt: prevOverrideExpiresAt,
        exchangeHealthOk,
        globalKillSwitchActive,
        degraded: degradedReasons.length > 0,
        degradedReasons,
        metrics,
      };
    }
    const resumeClean = exchangeHealthOk === true && globalKillSwitchActive === false;
    return {
      enabled,
      status: resumeClean ? "RESUME_ELIGIBLE" : "COOLDOWN",
      paused: true,
      blockNewEntries: true,
      pauseReason: previous?.pauseReason ?? null,
      message: resumeClean
        ? "Cooldown passed and risk improved; manual review or override can resume entries."
        : "Cooldown passed, but exchange health or global kill-switch state is not clean.",
      cooldownUntil,
      manualOverrideActive: false,
      manualOverrideExpiresAt: prevOverrideExpiresAt,
      exchangeHealthOk,
      globalKillSwitchActive,
      degraded: degradedReasons.length > 0,
      degradedReasons,
      metrics,
    };
  }

  const watch = isWatch(metrics);
  return {
    enabled,
    status: watch ? "WATCH" : "OK",
    paused: false,
    blockNewEntries: false,
    pauseReason: null,
    message: watch ? "Risk Governor is near a pause threshold." : "Risk Governor allows new entries.",
    cooldownUntil: null,
    manualOverrideActive: false,
    manualOverrideExpiresAt: prevOverrideExpiresAt,
    exchangeHealthOk,
    globalKillSwitchActive,
    degraded: degradedReasons.length > 0,
    degradedReasons,
    metrics,
  };
}

export async function evaluateRiskGovernorForUser(args: {
  userId: string;
  nowMs?: number;
  exchangeHealthOk?: boolean | null;
  globalKillSwitchActive?: boolean;
  persist?: boolean;
}): Promise<RiskGovernorDecision> {
  const nowMs = args.nowMs ?? Date.now();
  const [previous, tradesDesc, dailyRealizedPnl, equityUsd] = await Promise.all([
    loadState(args.userId),
    loadRecentLiveClosedTrades(args.userId),
    loadDailyRealizedPnl(args.userId, nowMs),
    loadLedgerEquityEstimate(args.userId),
  ]);
  const decision = computeRiskGovernorDecision({
    enabled: isRiskGovernorEnabled(),
    tradesDesc,
    dailyRealizedPnl,
    equityUsd,
    previous,
    nowMs,
    cooldownMs: getRiskGovernorCooldownMs(),
    exchangeHealthOk: args.exchangeHealthOk,
    globalKillSwitchActive: args.globalKillSwitchActive ?? settingsStore.get().killSwitch === true,
  });
  if (args.persist !== false && decision.enabled) {
    await persistDecision(args.userId, previous, decision);
  }
  return decision;
}

export async function setRiskGovernorManualOverride(args: {
  userId: string;
  active: boolean;
  actorAdminId: string;
  expiresAt?: Date | null;
  nowMs?: number;
}): Promise<RiskGovernorDecision> {
  const nowMs = args.nowMs ?? Date.now();
  const previous = await loadState(args.userId);
  await upsertState(args.userId, {
    status: args.active ? "MANUAL_OVERRIDE" : "OK",
    paused: false,
    manualOverrideActive: args.active,
    manualOverrideExpiresAt: args.active ? args.expiresAt ?? null : null,
    updatedAt: new Date(nowMs),
  });
  await insertEvent(args.userId, {
    eventType: args.active ? "MANUAL_OVERRIDE_ENABLED" : "MANUAL_OVERRIDE_DISABLED",
    fromStatus: previous?.status ?? null,
    toStatus: args.active ? "MANUAL_OVERRIDE" : "OK",
    reasonCode: args.active ? "manual_operator_override" : "manual_override_disabled",
    message: args.active
      ? "Manual operator override enabled for Risk Governor."
      : "Manual operator override disabled for Risk Governor.",
    actorAdminId: args.actorAdminId,
    metrics: { expiresAt: args.expiresAt?.toISOString() ?? null },
  });
  return evaluateRiskGovernorForUser({ userId: args.userId, nowMs, persist: true });
}

export async function getRiskGovernorStatusForUser(userId: string): Promise<RiskGovernorDecision> {
  return evaluateRiskGovernorForUser({
    userId,
    exchangeHealthOk: null,
    globalKillSwitchActive: settingsStore.get().killSwitch === true,
    persist: true,
  });
}

export async function buildRiskGovernorReport24h(userId?: string): Promise<Record<string, unknown>> {
  const now = Date.now();
  const since = now - 24 * 60 * 60 * 1000;
  const scopeFilter = userId ? eq(riskGovernorEventsTable.scopeId, userId) : undefined;
  const [states, events, tradeRows] = await Promise.all([
    userId
      ? db.select().from(riskGovernorStatesTable).where(eq(riskGovernorStatesTable.scopeId, userId)).limit(1)
      : db.select().from(riskGovernorStatesTable),
    db.select().from(riskGovernorEventsTable)
      .where(scopeFilter ? and(scopeFilter, gte(riskGovernorEventsTable.createdAt, new Date(since))) : gte(riskGovernorEventsTable.createdAt, new Date(since)))
      .orderBy(desc(riskGovernorEventsTable.createdAt))
      .limit(100),
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
      .where(and(
        isNotNull(simTradesTable.exchange),
        isNull(simTradesTable.reconciliationTag),
        gte(simTradesTable.exitTime, since),
        ...(userId ? [eq(simTradesTable.userId, userId)] : []),
      )),
  ]);
  const t = tradeRows[0];
  const wins = Number(t?.wins ?? 0);
  const losses = Number(t?.losses ?? 0);
  const decided = wins + losses;
  const grossProfit = Number(t?.grossProfit ?? 0);
  const grossLoss = Number(t?.grossLoss ?? 0);
  return {
    enabled: isRiskGovernorEnabled(),
    scope: userId ? { type: "user", id: userId } : { type: "platform", id: "all-users" },
    generatedAt: now,
    windowStart: since,
    windowEnd: now,
    states: states.map(formatState),
    pausedScopes: states.filter((s) => s.paused).length,
    events: events.map((e) => ({
      eventType: e.eventType,
      scopeId: e.scopeId,
      reasonCode: e.reasonCode,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      message: e.message,
      metrics: e.metrics,
      createdAt: e.createdAt,
    })),
    trading: {
      closedTrades: Number(t?.closedTrades ?? 0),
      wins,
      losses,
      winRate: decided > 0 ? wins / decided : null,
      realizedPnl: Number(t?.realizedPnl ?? 0),
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    },
  };
}

function countConsecutiveLosses(tradesDesc: RiskGovernorClosedTrade[]): number {
  let count = 0;
  for (const t of tradesDesc) {
    if (t.realizedPnL < 0) count++;
    else break;
  }
  return count;
}

function firstTriggeredPause(metrics: RiskGovernorMetrics): RiskGovernorPauseReason | null {
  if (metrics.consecutiveLosses >= CONSECUTIVE_LOSS_LIMIT) return "consecutive_losses_8";
  if (
    metrics.rolling20Trades >= ROLLING20_MIN_TRADES &&
    metrics.rolling20WinRate !== null &&
    metrics.rolling20WinRate < ROLLING20_WIN_RATE_FLOOR
  ) return "rolling20_win_rate_below_35";
  if (
    metrics.dailyRealizedLossPct !== null &&
    metrics.dailyRealizedLossPct > DAILY_LOSS_EQUITY_PCT_LIMIT
  ) return "daily_realized_loss_gt_5pct";
  return null;
}

function statusForReason(reason: RiskGovernorPauseReason): RiskGovernorStatus {
  if (reason === "consecutive_losses_8") return "PAUSED_CONSECUTIVE_LOSSES";
  if (reason === "rolling20_win_rate_below_35") return "PAUSED_ROLLING20_WIN_RATE";
  return "PAUSED_DAILY_DRAWDOWN";
}

function pauseMessage(reason: RiskGovernorPauseReason, metrics: RiskGovernorMetrics): string {
  if (reason === "consecutive_losses_8") return `Risk Governor paused new entries after ${metrics.consecutiveLosses} consecutive live losses.`;
  if (reason === "rolling20_win_rate_below_35") return `Risk Governor paused new entries because rolling 20-trade win rate is ${((metrics.rolling20WinRate ?? 0) * 100).toFixed(1)}%.`;
  return `Risk Governor paused new entries because daily realized loss is ${((metrics.dailyRealizedLossPct ?? 0)).toFixed(2)}% of account equity.`;
}

function isWatch(metrics: RiskGovernorMetrics): boolean {
  return metrics.consecutiveLosses >= 6 ||
    (metrics.rolling20Trades >= ROLLING20_MIN_TRADES && metrics.rolling20WinRate !== null && metrics.rolling20WinRate < 0.4) ||
    (metrics.dailyRealizedLossPct !== null && metrics.dailyRealizedLossPct >= 4);
}

async function loadState(userId: string): Promise<RiskGovernorState | null> {
  try {
    const [row] = await db
      .select()
      .from(riskGovernorStatesTable)
      .where(and(eq(riskGovernorStatesTable.scopeType, "user"), eq(riskGovernorStatesTable.scopeId, userId)))
      .limit(1);
    return row ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "riskGovernor: state load failed");
    return null;
  }
}

async function loadRecentLiveClosedTrades(userId: string): Promise<RiskGovernorClosedTrade[]> {
  const rows = await db
    .select({
      id: simTradesTable.id,
      realizedPnL: simTradesTable.realizedPnL,
      exitTime: simTradesTable.exitTime,
    })
    .from(simTradesTable)
    .where(and(
      eq(simTradesTable.userId, userId),
      isNotNull(simTradesTable.exchange),
      isNull(simTradesTable.reconciliationTag),
    ))
    .orderBy(desc(simTradesTable.exitTime))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    realizedPnL: Number(r.realizedPnL),
    exitTime: Number(r.exitTime),
  }));
}

async function loadDailyRealizedPnl(userId: string, nowMs: number): Promise<number> {
  const d = new Date(nowMs);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const [row] = await db
    .select({ realized: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}), 0)` })
    .from(simTradesTable)
    .where(and(
      eq(simTradesTable.userId, userId),
      isNotNull(simTradesTable.exchange),
      isNull(simTradesTable.reconciliationTag),
      gte(simTradesTable.exitTime, start),
    ));
  return Number(row?.realized ?? 0);
}

async function loadLedgerEquityEstimate(userId: string): Promise<number | null> {
  try {
    const [acct, open] = await Promise.all([
      db.select({ cash: simAccountsTable.cashBalance })
        .from(simAccountsTable)
        .where(eq(simAccountsTable.userId, userId))
        .limit(1),
      db.select({ notional: sql<number>`coalesce(sum(${simPositionsTable.sizeUSD}), 0)` })
        .from(simPositionsTable)
        .where(and(eq(simPositionsTable.userId, userId), isNotNull(simPositionsTable.exchange))),
    ]);
    const cash = acct[0]?.cash;
    if (cash == null) return null;
    const equity = Number(cash) + Number(open[0]?.notional ?? 0);
    return Number.isFinite(equity) && equity > 0 ? equity : null;
  } catch (err) {
    logger.warn({ err, userId }, "riskGovernor: ledger equity estimate failed");
    return null;
  }
}

async function persistDecision(userId: string, previous: RiskGovernorState | null, decision: RiskGovernorDecision): Promise<void> {
  await upsertState(userId, {
    status: decision.status,
    paused: decision.paused,
    pauseReason: decision.pauseReason,
    pausedAt: decision.paused ? previous?.pausedAt ?? new Date() : null,
    cooldownUntil: decision.cooldownUntil,
    lastEvaluatedTradeId: decision.metrics.lastEvaluatedTradeId,
    lastEvaluatedExitTime: decision.metrics.lastEvaluatedExitTime,
    consecutiveLosses: decision.metrics.consecutiveLosses,
    rolling20Trades: decision.metrics.rolling20Trades,
    rolling20WinRate: decision.metrics.rolling20WinRate,
    dailyRealizedPnl: decision.metrics.dailyRealizedPnl,
    dailyRealizedLossPct: decision.metrics.dailyRealizedLossPct,
    equityUsd: decision.metrics.equityUsd,
    exchangeHealthOk: decision.exchangeHealthOk,
    globalKillSwitchActive: decision.globalKillSwitchActive,
    manualOverrideActive: decision.manualOverrideActive,
    manualOverrideExpiresAt: decision.manualOverrideExpiresAt,
    degraded: decision.degraded,
    degradedReasons: decision.degradedReasons,
    updatedAt: new Date(),
  });
  const prevStatus = previous?.status ?? null;
  if (prevStatus !== decision.status || previous?.paused !== decision.paused) {
    await insertEvent(userId, {
      eventType: eventTypeForDecision(decision),
      fromStatus: prevStatus,
      toStatus: decision.status,
      reasonCode: decision.pauseReason ?? (decision.status === "DISABLED" ? "feature_disabled" : "evaluation"),
      message: decision.message,
      metrics: decision.metrics as unknown as Record<string, unknown>,
    });
  }
}

async function upsertState(userId: string, values: Partial<typeof riskGovernorStatesTable.$inferInsert>): Promise<void> {
  const insertValues = {
    scopeType: "user" as const,
    scopeId: userId,
    ...values,
  };
  await db
    .insert(riskGovernorStatesTable)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [riskGovernorStatesTable.scopeType, riskGovernorStatesTable.scopeId],
      set: values,
    });
}

async function insertEvent(userId: string, values: {
  eventType: RiskGovernorEventType;
  fromStatus: RiskGovernorStatus | null;
  toStatus: RiskGovernorStatus;
  reasonCode: RiskGovernorReasonCode;
  message: string;
  metrics?: Record<string, unknown>;
  actorAdminId?: string | null;
}): Promise<void> {
  try {
    await db.insert(riskGovernorEventsTable).values({
      scopeType: "user",
      scopeId: userId,
      eventType: values.eventType,
      fromStatus: values.fromStatus,
      toStatus: values.toStatus,
      reasonCode: values.reasonCode,
      message: values.message,
      metrics: values.metrics ?? {},
      actorAdminId: values.actorAdminId ?? null,
    });
  } catch (err) {
    logger.warn({ err, userId }, "riskGovernor: event insert failed");
  }
}

function eventTypeForDecision(decision: RiskGovernorDecision): RiskGovernorEventType {
  if (decision.status.startsWith("PAUSED_")) return "PAUSE";
  if (decision.status === "WATCH") return "WATCH";
  if (decision.status === "COOLDOWN") return "COOLDOWN_STARTED";
  if (decision.status === "RESUME_ELIGIBLE") return "RESUME_ELIGIBLE";
  return "EVALUATION";
}

function formatState(s: RiskGovernorState): Record<string, unknown> {
  return {
    scopeType: s.scopeType,
    scopeId: s.scopeId,
    status: s.status,
    paused: s.paused,
    pauseReason: s.pauseReason,
    pausedAt: s.pausedAt,
    cooldownUntil: s.cooldownUntil,
    consecutiveLosses: s.consecutiveLosses,
    rolling20Trades: s.rolling20Trades,
    rolling20WinRate: s.rolling20WinRate,
    dailyRealizedPnl: s.dailyRealizedPnl,
    dailyRealizedLossPct: s.dailyRealizedLossPct,
    equityUsd: s.equityUsd,
    manualOverrideActive: s.manualOverrideActive,
    manualOverrideExpiresAt: s.manualOverrideExpiresAt,
    degraded: s.degraded,
    degradedReasons: s.degradedReasons,
  };
}
