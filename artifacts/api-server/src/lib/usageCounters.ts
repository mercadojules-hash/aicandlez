/**
 * usageCounters — lightweight in-process platform usage accounting that feeds
 * the `usage_daily` table (admin Platform Resource & Billing Telemetry surface).
 *
 * Design:
 *   - API requests are counted in-memory as a delta since the last flush
 *     (cheap increment on the hot path — no per-request DB write).
 *   - A periodic flusher (60s, unref'd) upserts the running day's row with an
 *     ADDITIVE update for the request/exchange counters (so multiple processes
 *     aggregate correctly) and an idempotent SET for DB-derived figures
 *     (trades closed today, distinct active users today) + GREATEST for peak RSS.
 *   - On flush failure the pulled deltas are re-banked so counts are not lost.
 *
 * History accumulates from enablement forward — there is no backfill.
 */
import os from "node:os";
import { db } from "@workspace/db";
import { sql, gte } from "drizzle-orm";
import { usageDailyTable, platformCostConfigTable, simTradesTable } from "@workspace/db";
import { logger } from "./logger.js";

let apiRequestDelta = 0;
let exchangeCallDelta = 0;
let flusherStarted = false;
let flushing = false;

export function recordApiRequest(): void {
  apiRequestDelta++;
}

export function recordExchangeCall(n = 1): void {
  exchangeCallDelta += n;
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function utcMidnightMs(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export async function flushUsageCounters(): Promise<void> {
  if (flushing) return;
  flushing = true;
  const api = apiRequestDelta;
  const exch = exchangeCallDelta;
  apiRequestDelta = 0;
  exchangeCallDelta = 0;
  try {
    const day = utcDayKey();
    const rss = process.memoryUsage().rss;
    const startMs = utcMidnightMs();

    // Trades closed today + distinct users who closed a trade today.
    const [tradeAgg] = await db
      .select({
        trades: sql<number>`count(*)::int`,
        users: sql<number>`count(distinct ${simTradesTable.userId})::int`,
      })
      .from(simTradesTable)
      .where(gte(simTradesTable.exitTime, startMs));
    const trades = Number(tradeAgg?.trades ?? 0);
    const activeUsers = Number(tradeAgg?.users ?? 0);

    // Snapshot the manual monthly cost estimate (sum of all components) so the
    // cost trend reflects rate changes over time. Optional — null if unset.
    let estMonthlyCostUsd: number | null = null;
    try {
      const [cfg] = await db.select().from(platformCostConfigTable).limit(1);
      if (cfg) {
        estMonthlyCostUsd =
          (cfg.monthlyReplitUsd ?? 0) +
          (cfg.monthlyRenderUsd ?? 0) +
          (cfg.monthlyDbUsd ?? 0) +
          (cfg.monthlyAiUsd ?? 0) +
          (cfg.monthlyThirdPartyUsd ?? 0);
      }
    } catch {
      /* cost config optional */
    }

    await db
      .insert(usageDailyTable)
      .values({
        day,
        apiRequests: api,
        exchangeCalls: exch,
        activeUsers,
        trades,
        peakRssBytes: rss,
        estMonthlyCostUsd,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: usageDailyTable.day,
        set: {
          apiRequests: sql`${usageDailyTable.apiRequests} + ${api}`,
          exchangeCalls: sql`${usageDailyTable.exchangeCalls} + ${exch}`,
          activeUsers, // DB-derived idempotent set
          trades, // DB-derived idempotent set
          peakRssBytes: sql`GREATEST(${usageDailyTable.peakRssBytes}, ${rss})`,
          estMonthlyCostUsd,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    // Re-bank the deltas so a transient DB failure doesn't lose counts.
    apiRequestDelta += api;
    exchangeCallDelta += exch;
    logger.warn(
      { tag: "USAGE_FLUSH_FAILED", err },
      "[USAGE_FLUSH_FAILED] usage_daily upsert failed — deltas re-banked",
    );
  } finally {
    flushing = false;
  }
}

/** Idempotently start the periodic flusher (called from the request hot path). */
export function ensureUsageFlusher(): void {
  if (flusherStarted) return;
  flusherStarted = true;
  const FLUSH_MS = 60_000;
  const t = setInterval(() => {
    void flushUsageCounters();
  }, FLUSH_MS);
  if (typeof t.unref === "function") t.unref();
}

export const __usageCountersInternal = { utcDayKey, utcMidnightMs };
export { os };
