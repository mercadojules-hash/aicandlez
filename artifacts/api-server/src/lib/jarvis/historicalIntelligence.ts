import {
  db,
  simTradesTable,
  simPositionsTable,
  jarvisAicandlezDailySnapshotsTable,
  jarvisReportsTable,
  jarvisMemoriesTable,
  userAdminActionsTable,
  auditLogTable,
  type JarvisAicandlezDailySnapshot,
  type JarvisReport,
} from "@workspace/db";
import { and, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { think } from "./cognition/index.js";

/**
 * AICandlez Historical Intelligence Layer (Task #223) — read-only analytics.
 *
 * Every metric is derived from a strictly read-only, LIVE-only aggregate over
 * the AICandlez trade tables (`exchange IS NOT NULL AND reconciliation_tag IS
 * NULL` — real broker fills only, paper/simulated excluded by construction).
 * This module NEVER writes a trading table and imports NO execution modules.
 * Writes are confined to jarvis-owned tables (snapshots, reports, memories).
 *
 * Every public function is FAIL-SAFE: a failed read degrades to nulls / empty
 * arrays and is logged — it never throws to the route layer, which keeps the
 * "null → dash, never 5xx" invariant intact.
 */

// ── window helpers ───────────────────────────────────────────────────────────

/** Inclusive start-of-day epoch ms for a `YYYY-MM-DD` UTC date. */
export function dateStrToStartMs(d: string): number {
  return Date.parse(`${d}T00:00:00.000Z`);
}

/** Exclusive end (start of the following day) for an inclusive `YYYY-MM-DD`. */
export function dateStrToEndMs(d: string): number {
  return Date.parse(`${d}T00:00:00.000Z`) + 86_400_000;
}

/** Current UTC calendar day as `YYYY-MM-DD`. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidDateStr(d: unknown): d is string {
  return (
    typeof d === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(`${d}T00:00:00.000Z`))
  );
}

/** Normalize optional query date params into an epoch-ms window. */
export function resolveWindow(
  start?: string | null,
  end?: string | null,
): { startMs: number | null; endMs: number | null; start: string | null; end: string | null } {
  const s = isValidDateStr(start) ? start : null;
  const e = isValidDateStr(end) ? end : null;
  return {
    start: s,
    end: e,
    startMs: s ? dateStrToStartMs(s) : null,
    endMs: e ? dateStrToEndMs(e) : null,
  };
}

// LIVE-only, reconciliation-clean predicate shared by every read path.
function liveConds(startMs: number | null, endMs: number | null) {
  const conds = [
    isNotNull(simTradesTable.exchange),
    isNull(simTradesTable.reconciliationTag),
  ];
  if (startMs != null) conds.push(gte(simTradesTable.exitTime, startMs));
  if (endMs != null) conds.push(lt(simTradesTable.exitTime, endMs));
  return and(...conds);
}

// Same predicate as a raw SQL chunk (for grouped queries via db.execute).
function liveWhereSql(startMs: number | null, endMs: number | null) {
  const parts = [
    sql`${simTradesTable.exchange} IS NOT NULL`,
    sql`${simTradesTable.reconciliationTag} IS NULL`,
  ];
  if (startMs != null) parts.push(sql`${simTradesTable.exitTime} >= ${startMs}`);
  if (endMs != null) parts.push(sql`${simTradesTable.exitTime} < ${endMs}`);
  return sql.join(parts, sql` AND `);
}

// ── period stats (T2) ────────────────────────────────────────────────────────

export interface CloseReasonStat {
  reason: string;
  trades: number;
  wins: number;
  losses: number;
  realizedPnlUsd: number;
}

export interface DailyPoint {
  day: string;
  trades: number;
  wins: number;
  losses: number;
  realizedPnlUsd: number;
}

export interface PeriodStats {
  start: string | null;
  end: string | null;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  realizedPnlUsd: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  profitFactor: number | null;
  avgWinUsd: number | null;
  avgLossUsd: number | null;
  avgPnlPct: number | null;
  avgDurationMs: number | null;
  avgConfidence: number | null;
  byCloseReason: CloseReasonStat[];
  degraded: boolean;
}

function emptyPeriodStats(
  start: string | null,
  end: string | null,
  degraded: boolean,
): PeriodStats {
  return {
    start,
    end,
    closedTrades: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    realizedPnlUsd: 0,
    grossProfitUsd: 0,
    grossLossUsd: 0,
    profitFactor: null,
    avgWinUsd: null,
    avgLossUsd: null,
    avgPnlPct: null,
    avgDurationMs: null,
    avgConfidence: null,
    byCloseReason: [],
    degraded,
  };
}

/** Windowed LIVE-only aggregate over closed trades. Never throws. */
export async function computePeriodStats(
  startMs: number | null,
  endMs: number | null,
  start: string | null,
  end: string | null,
): Promise<PeriodStats> {
  try {
    const where = liveConds(startMs, endMs);
    const whereSql = liveWhereSql(startMs, endMs);

    const [scalarRows, reasonRes] = await Promise.all([
      db
        .select({
          closed: sql<number>`(count(*))::int`,
          wins: sql<number>`(count(*) filter (where ${simTradesTable.realizedPnL} > 0))::int`,
          losses: sql<number>`(count(*) filter (where ${simTradesTable.realizedPnL} < 0))::int`,
          realized: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}), 0)::float8`,
          grossProfit: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} > 0), 0)::float8`,
          grossLoss: sql<number>`coalesce(abs(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} < 0)), 0)::float8`,
          sumWin: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} > 0), 0)::float8`,
          sumLoss: sql<number>`coalesce(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} < 0), 0)::float8`,
          sumPnlPct: sql<number>`coalesce(sum(${simTradesTable.realizedPnLPct}), 0)::float8`,
          sumDuration: sql<number>`coalesce(sum(${simTradesTable.durationMs}), 0)::float8`,
          confSum: sql<number>`coalesce(sum(${simTradesTable.confidence}), 0)::float8`,
          confCount: sql<number>`(count(${simTradesTable.confidence}))::int`,
        })
        .from(simTradesTable)
        .where(where),
      db.execute(sql`
        select
          coalesce(${simTradesTable.closeReason}, 'UNKNOWN') as reason,
          (count(*))::int as trades,
          (count(*) filter (where ${simTradesTable.realizedPnL} > 0))::int as wins,
          (count(*) filter (where ${simTradesTable.realizedPnL} < 0))::int as losses,
          coalesce(sum(${simTradesTable.realizedPnL}), 0)::float8 as realized
        from ${simTradesTable}
        where ${whereSql}
        group by reason
        order by trades desc
      `),
    ]);

    const s = scalarRows[0];
    const closed = s?.closed ?? 0;
    const wins = s?.wins ?? 0;
    const losses = s?.losses ?? 0;
    const decided = wins + losses;
    const grossProfit = Number(s?.grossProfit ?? 0);
    const grossLoss = Number(s?.grossLoss ?? 0);
    const sumWin = Number(s?.sumWin ?? 0);
    const sumLoss = Number(s?.sumLoss ?? 0);
    const confCount = s?.confCount ?? 0;

    const byCloseReason: CloseReasonStat[] = (
      reasonRes.rows as Array<Record<string, unknown>>
    ).map((r) => ({
      reason: String(r.reason ?? "UNKNOWN"),
      trades: Number(r.trades ?? 0),
      wins: Number(r.wins ?? 0),
      losses: Number(r.losses ?? 0),
      realizedPnlUsd: Number(r.realized ?? 0),
    }));

    return {
      start,
      end,
      closedTrades: closed,
      wins,
      losses,
      winRate: decided > 0 ? wins / decided : null,
      realizedPnlUsd: Number(s?.realized ?? 0),
      grossProfitUsd: grossProfit,
      grossLossUsd: grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      avgWinUsd: wins > 0 ? sumWin / wins : null,
      avgLossUsd: losses > 0 ? sumLoss / losses : null,
      avgPnlPct: closed > 0 ? Number(s?.sumPnlPct ?? 0) / closed : null,
      avgDurationMs: closed > 0 ? Number(s?.sumDuration ?? 0) / closed : null,
      avgConfidence: confCount > 0 ? Number(s?.confSum ?? 0) / confCount : null,
      byCloseReason,
      degraded: false,
    };
  } catch (err) {
    logger.error({ err }, "historical: computePeriodStats failed");
    return emptyPeriodStats(start, end, true);
  }
}

/** Per-UTC-day LIVE series inside a window (for charting). Never throws. */
export async function computeDailySeries(
  startMs: number | null,
  endMs: number | null,
): Promise<DailyPoint[]> {
  try {
    const whereSql = liveWhereSql(startMs, endMs);
    const res = await db.execute(sql`
      select
        to_char(to_timestamp(${simTradesTable.exitTime} / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') as day,
        (count(*))::int as trades,
        (count(*) filter (where ${simTradesTable.realizedPnL} > 0))::int as wins,
        (count(*) filter (where ${simTradesTable.realizedPnL} < 0))::int as losses,
        coalesce(sum(${simTradesTable.realizedPnL}), 0)::float8 as realized
      from ${simTradesTable}
      where ${whereSql}
      group by day
      order by day asc
    `);
    return (res.rows as Array<Record<string, unknown>>).map((r) => ({
      day: String(r.day),
      trades: Number(r.trades ?? 0),
      wins: Number(r.wins ?? 0),
      losses: Number(r.losses ?? 0),
      realizedPnlUsd: Number(r.realized ?? 0),
    }));
  } catch (err) {
    logger.error({ err }, "historical: computeDailySeries failed");
    return [];
  }
}

// ── period comparison (T2) ───────────────────────────────────────────────────

export interface PeriodDelta {
  closedTrades: number;
  winRatePts: number | null;
  realizedPnlUsd: number;
  profitFactor: number | null;
  avgPnlPct: number | null;
}

export interface PeriodComparison {
  current: PeriodStats;
  previous: PeriodStats;
  delta: PeriodDelta;
  explanations: string[];
}

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

/**
 * Deterministic, honest explanations for the win-rate / P&L drift between two
 * windows. NO fabrication — every sentence is a direct restatement of the
 * computed deltas (win-rate points, P&L, close-reason mix).
 */
function explainComparison(
  cur: PeriodStats,
  prev: PeriodStats,
  delta: PeriodDelta,
): string[] {
  const out: string[] = [];
  if (cur.degraded || prev.degraded) {
    out.push("Comparison incomplete: one or both windows failed to load.");
    return out;
  }
  if (cur.closedTrades === 0 && prev.closedTrades === 0) {
    out.push("No live closed trades in either window.");
    return out;
  }

  if (delta.winRatePts != null) {
    const dir = delta.winRatePts >= 0 ? "rose" : "fell";
    out.push(
      `Win rate ${dir} ${Math.abs(delta.winRatePts).toFixed(1)} pts ` +
        `(${prev.winRate != null ? (prev.winRate * 100).toFixed(1) : "--"}% → ` +
        `${cur.winRate != null ? (cur.winRate * 100).toFixed(1) : "--"}%).`,
    );
  }

  const pnlDir = delta.realizedPnlUsd >= 0 ? "up" : "down";
  out.push(
    `Realized P&L ${pnlDir} ${fmtUsd(delta.realizedPnlUsd)} ` +
      `(${fmtUsd(prev.realizedPnlUsd)} → ${fmtUsd(cur.realizedPnlUsd)}).`,
  );

  // TP/SL effect: contrast stop-loss vs take-profit close-reason mix.
  const reasonShare = (p: PeriodStats, needle: string): number => {
    if (p.closedTrades === 0) return 0;
    const hits = p.byCloseReason
      .filter((r) => r.reason.toUpperCase().includes(needle))
      .reduce((acc, r) => acc + r.trades, 0);
    return hits / p.closedTrades;
  };
  const slPrev = reasonShare(prev, "STOP") + reasonShare(prev, "SL");
  const slCur = reasonShare(cur, "STOP") + reasonShare(cur, "SL");
  const tpPrev = reasonShare(prev, "TP") + reasonShare(prev, "PROFIT") + reasonShare(prev, "TAKE");
  const tpCur = reasonShare(cur, "TP") + reasonShare(cur, "PROFIT") + reasonShare(cur, "TAKE");
  if (Math.abs(slCur - slPrev) >= 0.05) {
    const dir = slCur >= slPrev ? "rose" : "fell";
    out.push(
      `Stop-loss exits ${dir} from ${(slPrev * 100).toFixed(0)}% to ` +
        `${(slCur * 100).toFixed(0)}% of closes.`,
    );
  }
  if (Math.abs(tpCur - tpPrev) >= 0.05) {
    const dir = tpCur >= tpPrev ? "rose" : "fell";
    out.push(
      `Take-profit exits ${dir} from ${(tpPrev * 100).toFixed(0)}% to ` +
        `${(tpCur * 100).toFixed(0)}% of closes.`,
    );
  }

  if (delta.profitFactor != null) {
    const dir = delta.profitFactor >= 0 ? "improved" : "weakened";
    out.push(
      `Profit factor ${dir} by ${Math.abs(delta.profitFactor).toFixed(2)} ` +
        `(${prev.profitFactor != null ? prev.profitFactor.toFixed(2) : "--"} → ` +
        `${cur.profitFactor != null ? cur.profitFactor.toFixed(2) : "--"}).`,
    );
  }
  return out;
}

export async function comparePeriods(
  cur: { startMs: number | null; endMs: number | null; start: string | null; end: string | null },
  prev: { startMs: number | null; endMs: number | null; start: string | null; end: string | null },
): Promise<PeriodComparison> {
  const [current, previous] = await Promise.all([
    computePeriodStats(cur.startMs, cur.endMs, cur.start, cur.end),
    computePeriodStats(prev.startMs, prev.endMs, prev.start, prev.end),
  ]);
  const delta: PeriodDelta = {
    closedTrades: current.closedTrades - previous.closedTrades,
    winRatePts:
      current.winRate != null && previous.winRate != null
        ? (current.winRate - previous.winRate) * 100
        : null,
    realizedPnlUsd: current.realizedPnlUsd - previous.realizedPnlUsd,
    profitFactor:
      current.profitFactor != null && previous.profitFactor != null
        ? current.profitFactor - previous.profitFactor
        : null,
    avgPnlPct:
      current.avgPnlPct != null && previous.avgPnlPct != null
        ? current.avgPnlPct - previous.avgPnlPct
        : null,
  };
  return { current, previous, delta, explanations: explainComparison(current, previous, delta) };
}

// ── daily snapshots (T4) ─────────────────────────────────────────────────────

export async function getDailySnapshots(
  limit = 180,
): Promise<JarvisAicandlezDailySnapshot[]> {
  try {
    const rows = await db
      .select()
      .from(jarvisAicandlezDailySnapshotsTable)
      .orderBy(desc(jarvisAicandlezDailySnapshotsTable.snapshotDate))
      .limit(Math.min(Math.max(limit, 1), 1000));
    return rows.reverse();
  } catch (err) {
    logger.error({ err }, "historical: getDailySnapshots failed");
    return [];
  }
}

/**
 * Capture (idempotent upsert) today's cumulative-as-of-now LIVE snapshot. Open
 * position counts are point-in-time (only meaningful for "today"). Never throws.
 */
export async function captureDailySnapshot(
  date = todayUtc(),
): Promise<JarvisAicandlezDailySnapshot | null> {
  // Cumulative through end of `date` (all live closed trades up to that day).
  const endMs = dateStrToEndMs(date);
  let degraded = false;
  let coreDegraded = false;
  let stats: PeriodStats;
  let openAgg: { active: number | null; notional: number | null } = {
    active: 0,
    notional: 0,
  };
  try {
    stats = await computePeriodStats(null, endMs, null, date);
    degraded = stats.degraded;
    coreDegraded = stats.degraded;
  } catch {
    stats = emptyPeriodStats(null, date, true);
    degraded = true;
    coreDegraded = true;
  }
  // Fail-safe: a failed CORE read would persist synthetic zeros into the
  // cumulative growth curve. Never fabricate trend history — skip the write and
  // let the day stay absent (renders as a gap / dash) rather than a fake $0 row.
  if (coreDegraded) {
    logger.warn({ date }, "historical: skipping degraded snapshot write");
    return null;
  }
  // Open positions are only valid for the live "now" snapshot.
  if (date === todayUtc()) {
    try {
      const openRows = await db
        .select({
          active: sql<number>`(count(*))::int`,
          notional: sql<number>`coalesce(sum(${simPositionsTable.sizeUSD}), 0)::float8`,
        })
        .from(simPositionsTable)
        .where(isNotNull(simPositionsTable.exchange));
      openAgg = {
        active: openRows[0]?.active ?? 0,
        notional: Number(openRows[0]?.notional ?? 0),
      };
    } catch {
      // Open-position read failed — leave as null (→ dash), never fabricate 0.
      openAgg = { active: null, notional: null };
      degraded = true;
    }
  }

  try {
    const values = {
      snapshotDate: date,
      closedTrades: stats.closedTrades,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      cumulativeRealizedPnlUsd: stats.realizedPnlUsd,
      grossProfitUsd: stats.grossProfitUsd,
      grossLossUsd: stats.grossLossUsd,
      profitFactor: stats.profitFactor,
      activeTrades: openAgg.active,
      openTradeValueUsd: openAgg.notional,
      degraded,
    };
    const [row] = await db
      .insert(jarvisAicandlezDailySnapshotsTable)
      .values(values)
      .onConflictDoUpdate({
        target: jarvisAicandlezDailySnapshotsTable.snapshotDate,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err }, "historical: captureDailySnapshot upsert failed");
    return null;
  }
}

/**
 * Backfill the cumulative growth curve from existing live trade history: one
 * snapshot per UTC day from the first live close to today, each holding the
 * cumulative-through-that-day stats. Historical open-position state cannot be
 * reconstructed, so active/open columns stay 0 for backfilled days (honest).
 * Idempotent (upsert per day). Never throws.
 */
export async function backfillDailySnapshots(): Promise<{ days: number; degraded: boolean }> {
  try {
    const res = await db.execute(sql`
      select
        to_char(to_timestamp(${simTradesTable.exitTime} / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') as day,
        (count(*))::int as trades,
        (count(*) filter (where ${simTradesTable.realizedPnL} > 0))::int as wins,
        (count(*) filter (where ${simTradesTable.realizedPnL} < 0))::int as losses,
        coalesce(sum(${simTradesTable.realizedPnL}), 0)::float8 as realized,
        coalesce(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} > 0), 0)::float8 as gross_profit,
        coalesce(abs(sum(${simTradesTable.realizedPnL}) filter (where ${simTradesTable.realizedPnL} < 0)), 0)::float8 as gross_loss
      from ${simTradesTable}
      where ${liveWhereSql(null, null)}
      group by day
      order by day asc
    `);
    const daily = res.rows as Array<Record<string, unknown>>;
    let cumClosed = 0;
    let cumWins = 0;
    let cumLosses = 0;
    let cumRealized = 0;
    let cumGrossProfit = 0;
    let cumGrossLoss = 0;
    const today = todayUtc();
    let written = 0;
    for (const d of daily) {
      const day = String(d.day);
      cumClosed += Number(d.trades ?? 0);
      cumWins += Number(d.wins ?? 0);
      cumLosses += Number(d.losses ?? 0);
      cumRealized += Number(d.realized ?? 0);
      cumGrossProfit += Number(d.gross_profit ?? 0);
      cumGrossLoss += Number(d.gross_loss ?? 0);
      // For "today", prefer the live capture (carries open positions).
      if (day === today) continue;
      const decided = cumWins + cumLosses;
      const values = {
        snapshotDate: day,
        closedTrades: cumClosed,
        wins: cumWins,
        losses: cumLosses,
        winRate: decided > 0 ? cumWins / decided : null,
        cumulativeRealizedPnlUsd: cumRealized,
        grossProfitUsd: cumGrossProfit,
        grossLossUsd: cumGrossLoss,
        profitFactor: cumGrossLoss > 0 ? cumGrossProfit / cumGrossLoss : null,
        // Historical open-position state is non-reconstructable → null (dash),
        // never fabricated as 0.
        activeTrades: null,
        openTradeValueUsd: null,
        degraded: false,
      };
      await db
        .insert(jarvisAicandlezDailySnapshotsTable)
        .values(values)
        .onConflictDoUpdate({
          target: jarvisAicandlezDailySnapshotsTable.snapshotDate,
          set: { ...values, updatedAt: new Date() },
        });
      written += 1;
    }
    // Always (re)capture today's live row last.
    await captureDailySnapshot(today);
    return { days: written + 1, degraded: false };
  } catch (err) {
    logger.error({ err }, "historical: backfillDailySnapshots failed");
    return { days: 0, degraded: true };
  }
}

// ── change & subscription ingestion (T3) ─────────────────────────────────────

export interface ChangeEvent {
  id: string;
  source: "admin-action" | "audit";
  kind: string;
  actor: string | null;
  target: string | null;
  summary: string;
  payload: Record<string, unknown> | null;
  at: number;
}

// audit_log types that represent configuration / risk / exit-policy changes.
const CONFIG_AUDIT_PATTERN =
  "%config%|%setting%|%exit%|%risk%|%trading_mode%|%threshold%|%limit%";

export async function getChangeEvents(limit = 100): Promise<ChangeEvent[]> {
  const cap = Math.min(Math.max(limit, 1), 500);
  const events: ChangeEvent[] = [];

  try {
    const actions = await db
      .select()
      .from(userAdminActionsTable)
      .orderBy(desc(userAdminActionsTable.createdAt))
      .limit(cap);
    for (const a of actions) {
      events.push({
        id: a.id,
        source: "admin-action",
        kind: a.action,
        actor: a.actorAdminId,
        target: a.targetUserId,
        summary: summarizeAdminAction(a.action, a.payload),
        payload: a.payload,
        at: new Date(a.createdAt).getTime(),
      });
    }
  } catch (err) {
    logger.error({ err }, "historical: getChangeEvents admin-actions failed");
  }

  try {
    const audits = await db
      .select()
      .from(auditLogTable)
      .where(
        sql`${auditLogTable.type} ILIKE ANY (string_to_array(${CONFIG_AUDIT_PATTERN}, '|'))`,
      )
      .orderBy(desc(auditLogTable.tsMs))
      .limit(cap);
    for (const a of audits) {
      events.push({
        id: a.id,
        source: "audit",
        kind: a.type,
        actor: a.userId,
        target: a.symbol ?? a.exchange ?? null,
        summary: `${a.type}${a.symbol ? ` · ${a.symbol}` : ""}${
          a.severity ? ` (${a.severity})` : ""
        }`,
        payload: a.payload,
        at: a.tsMs,
      });
    }
  } catch (err) {
    logger.error({ err }, "historical: getChangeEvents audit failed");
  }

  events.sort((x, y) => y.at - x.at);
  return events.slice(0, cap);
}

function summarizeAdminAction(
  action: string,
  payload: Record<string, unknown> | null,
): string {
  const before = payload && typeof payload.before === "object" ? payload.before : null;
  const after = payload && typeof payload.after === "object" ? payload.after : null;
  if (before && after) {
    return `${action}: changed`;
  }
  return action;
}

export interface SubscriptionSummary {
  degraded: boolean;
  totalSubscriptions: number | null;
  byStatus: { status: string; count: number }[];
  activeCount: number | null;
  canceledCount: number | null;
  recent: { id: string; status: string; createdAt: number | null }[];
}

/** Read-only summary over the synced Stripe mirror schema. Never throws. */
export async function getSubscriptionSummary(): Promise<SubscriptionSummary> {
  const summary: SubscriptionSummary = {
    degraded: false,
    totalSubscriptions: null,
    byStatus: [],
    activeCount: null,
    canceledCount: null,
    recent: [],
  };
  try {
    const res = await db.execute(
      sql`select status, count(*)::int as count from stripe.subscriptions group by status`,
    );
    const rows = res.rows as Array<Record<string, unknown>>;
    summary.byStatus = rows.map((r) => ({
      status: String(r.status ?? "unknown"),
      count: Number(r.count ?? 0),
    }));
    summary.totalSubscriptions = summary.byStatus.reduce((a, r) => a + r.count, 0);
    summary.activeCount =
      summary.byStatus.find((r) => r.status === "active")?.count ?? 0;
    summary.canceledCount =
      summary.byStatus.find((r) => r.status === "canceled")?.count ?? 0;
  } catch (err) {
    logger.warn({ err }, "historical: subscription status summary unavailable");
    summary.degraded = true;
  }
  try {
    const res = await db.execute(
      sql`select id, status, created from stripe.subscriptions order by created desc nulls last limit 15`,
    );
    summary.recent = (res.rows as Array<Record<string, unknown>>).map((r) => {
      const created = r.created;
      let createdAt: number | null = null;
      if (typeof created === "number") createdAt = created * 1000;
      else if (created instanceof Date) createdAt = created.getTime();
      else if (typeof created === "string") {
        const p = Date.parse(created);
        createdAt = Number.isFinite(p) ? p : null;
      }
      return { id: String(r.id), status: String(r.status ?? "unknown"), createdAt };
    });
  } catch (err) {
    logger.warn({ err }, "historical: recent subscriptions unavailable");
  }
  return summary;
}

const CHANGE_MEMORY_SOURCE = "aicandlez-change";
const SUBSCRIPTION_MEMORY_SOURCE = "aicandlez-subscriptions";

/**
 * Ingest recent change + subscription history into `jarvis_memories` with stable
 * source keys so the indexer can embed them and ExecutiveQuery can ground on
 * them. ADDITIVE + IDEMPOTENT (upsert on sourceType+sourceId). Never throws.
 */
export async function runHistoricalIngestion(
  createdBy: string | null,
): Promise<{ changes: number; subscription: boolean; degraded: boolean }> {
  let changes = 0;
  let subscription = false;
  let degraded = false;

  try {
    const events = await getChangeEvents(120);
    for (const ev of events) {
      const title = `AICandlez change: ${ev.kind}`.slice(0, 200);
      const lines: string[] = [ev.summary];
      if (ev.actor) lines.push(`Actor: ${ev.actor}`);
      if (ev.target) lines.push(`Target: ${ev.target}`);
      lines.push(`When: ${new Date(ev.at).toISOString()}`);
      const content = lines.join("\n");
      try {
        await db
          .insert(jarvisMemoriesTable)
          .values({
            title,
            content,
            memoryType: "event",
            importance: "medium",
            sourceType: CHANGE_MEMORY_SOURCE,
            sourceId: `${ev.source}:${ev.id}`,
            pinned: false,
            tags: ["aicandlez", "change", ev.source],
            createdBy: createdBy ?? "jarvis-system",
          })
          .onConflictDoUpdate({
            target: [jarvisMemoriesTable.sourceType, jarvisMemoriesTable.sourceId],
            set: { title, content, updatedAt: new Date() },
          });
        changes += 1;
      } catch (err) {
        logger.warn({ err, id: ev.id }, "historical: change memory upsert failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "historical: change ingestion failed");
    degraded = true;
  }

  try {
    const sub = await getSubscriptionSummary();
    if (!sub.degraded) {
      const lines: string[] = [];
      if (sub.totalSubscriptions != null)
        lines.push(`Total subscriptions: ${sub.totalSubscriptions}`);
      for (const s of sub.byStatus) lines.push(`${s.status}: ${s.count}`);
      const content = lines.join("\n");
      await db
        .insert(jarvisMemoriesTable)
        .values({
          title: "AICandlez subscription history",
          content,
          memoryType: "fact",
          importance: "high",
          sourceType: SUBSCRIPTION_MEMORY_SOURCE,
          sourceId: "summary",
          pinned: false,
          tags: ["aicandlez", "subscriptions", "billing"],
          createdBy: createdBy ?? "jarvis-system",
        })
        .onConflictDoUpdate({
          target: [jarvisMemoriesTable.sourceType, jarvisMemoriesTable.sourceId],
          set: { content, updatedAt: new Date() },
        });
      subscription = true;
    } else {
      degraded = true;
    }
  } catch (err) {
    logger.error({ err }, "historical: subscription ingestion failed");
    degraded = true;
  }

  return { changes, subscription, degraded };
}

// ── executive report generation (T5) ─────────────────────────────────────────

export interface GenerateReportInput {
  title?: string | null;
  reportType?: string | null;
  businessId?: string | null;
  start?: string | null;
  end?: string | null;
  compareStart?: string | null;
  compareEnd?: string | null;
  withNarrative?: boolean;
  createdBy: string | null;
}

export async function listReports(limit = 50): Promise<JarvisReport[]> {
  try {
    return await db
      .select()
      .from(jarvisReportsTable)
      .orderBy(desc(jarvisReportsTable.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
  } catch (err) {
    logger.error({ err }, "historical: listReports failed");
    return [];
  }
}

export async function getReport(id: string): Promise<JarvisReport | null> {
  try {
    const [row] = await db
      .select()
      .from(jarvisReportsTable)
      .where(eq(jarvisReportsTable.id, id));
    return row ?? null;
  } catch (err) {
    logger.error({ err }, "historical: getReport failed");
    return null;
  }
}

export async function deleteReport(id: string): Promise<boolean> {
  try {
    const rows = await db
      .delete(jarvisReportsTable)
      .where(eq(jarvisReportsTable.id, id))
      .returning({ id: jarvisReportsTable.id });
    return rows.length > 0;
  } catch (err) {
    logger.error({ err }, "historical: deleteReport failed");
    return false;
  }
}

/**
 * Compose an executive report: deterministic period stats (+ optional period
 * comparison), change/subscription digest, and snapshot trend — then an
 * OPTIONAL grounded cognition narrative (advisory; reuses the governed think()
 * path, never throws). Persists one `jarvis_reports` row. Never throws.
 */
export async function generateReport(
  input: GenerateReportInput,
): Promise<JarvisReport | null> {
  const win = resolveWindow(input.start, input.end);
  const hasCompare = !!(input.compareStart || input.compareEnd);
  const cmpWin = resolveWindow(input.compareStart, input.compareEnd);

  const [period, series, snapshots, changes, subscriptions] = await Promise.all([
    computePeriodStats(win.startMs, win.endMs, win.start, win.end),
    computeDailySeries(win.startMs, win.endMs),
    getDailySnapshots(180),
    getChangeEvents(40),
    getSubscriptionSummary(),
  ]);

  let comparison: PeriodComparison | null = null;
  if (hasCompare) {
    comparison = await comparePeriods(win, cmpWin);
  }

  const reportType = input.reportType?.trim() || (hasCompare ? "period_comparison" : "executive_summary");
  const title =
    input.title?.trim() ||
    `Executive report ${win.start ?? "all-time"}${win.end ? ` → ${win.end}` : ""}`;

  const data: Record<string, unknown> = {
    period,
    series,
    comparison,
    snapshots: snapshots.map((s) => ({
      date: s.snapshotDate,
      cumulativeRealizedPnlUsd: s.cumulativeRealizedPnlUsd,
      closedTrades: s.closedTrades,
      winRate: s.winRate,
    })),
    changes: changes.slice(0, 20),
    subscriptions,
    generatedAt: Date.now(),
  };

  // Optional grounded narrative (advisory). think() is fail-safe and returns a
  // non-"ok" status (null proposal) when budget/provider/grounding fail — we
  // simply persist the deterministic data without a narrative in that case.
  let narrative: string | null = null;
  let cognitionRunId: string | null = null;
  let groundingScore: number | null = null;
  if (input.withNarrative) {
    try {
      const result = await think({
        kind: "briefing",
        query: `${title}. Explain AICandlez performance, win-rate and P&L drivers, take-profit / stop-loss effects, account growth, and any configuration or subscription changes.`,
        instructions:
          "Ground every claim in retrieved AICandlez change, subscription, and performance memories. Do not invent metrics.",
        businessId: input.businessId ?? null,
        createdBy: input.createdBy,
        agentType: "historical-intelligence",
      });
      if (result.status === "ok" && result.proposal) {
        narrative = result.proposal.content || result.proposal.summary || null;
      }
      cognitionRunId = result.runId;
      groundingScore = result.groundingScore;
    } catch (err) {
      logger.warn({ err }, "historical: report narrative synthesis failed (advisory)");
    }
  }

  try {
    const [row] = await db
      .insert(jarvisReportsTable)
      .values({
        businessId: input.businessId ?? null,
        title: title.slice(0, 240),
        reportType: reportType.slice(0, 32),
        periodStart: win.start,
        periodEnd: win.end,
        comparePeriodStart: cmpWin.start,
        comparePeriodEnd: cmpWin.end,
        data,
        narrative,
        cognitionRunId,
        groundingScore,
        status: "complete",
        createdBy: input.createdBy,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err }, "historical: generateReport persist failed");
    return null;
  }
}
