// ─────────────────────────────────────────────────────────────────────────────
// Per-user trade-limit engine
// ─────────────────────────────────────────────────────────────────────────────
//
// Counts a user's LIVE AI trades opened in the rolling 24h window and
// returns a verdict the pre-execution gate can consume.
//
// "Live trade" = a row in `sim_positions` (currently open) OR `sim_trades`
// (already closed) where `exchange IS NOT NULL`. The user-execution
// boundary mirrors every live broker fill into `sim_positions` via
// `registerLiveUserFill`, so both tables together represent the complete
// universe of live opens.
//
// The operator (no-userId) live path through `placeLiveAutoOrder` is
// intentionally uncapped — operators never appear in `sim_*` tables.
//
// A small 5s per-user cache keeps the trading loop and stream emitters
// from hammering the DB. The cap itself is resolved from two sources,
// in priority order:
//
//   1. user_trade_limits row with `usePlanDefault=false` and a non-
//      expired `overrideExpiresAt` (or null expiry = permanent) →
//      operator override.  `capTier === -1` = UNLIMITED.
//   2. Otherwise → plan default from `PLAN_DEFAULT_TRADE_LIMIT_CAP`
//      keyed by `users.plan` (free=50, starter=100, pro=200).
//
// Source is surfaced in the verdict so the operator drawer can render
// PLAN DEFAULT / OPERATOR OVERRIDE badges without a second round-trip.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import {
  simPositionsTable,
  simTradesTable,
  userTradeLimitsTable,
  usersTable,
  UNLIMITED_TRADE_LIMIT_CAP,
  getPlanDefaultCap,
} from "@workspace/db";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { logger } from "./logger.js";

export type TradeLimitSource = "plan-default" | "operator-override";

export interface TradeLimitVerdict {
  userId:         string;
  used24h:        number;
  capTier:        number;       // -1 sentinel = unlimited
  /** Effective cap source — drives the PLAN DEFAULT / OPERATOR OVERRIDE
   *  badge in the operator drawer. */
  source:         TradeLimitSource;
  /** Cap that the user would receive from their plan tier alone, ignoring
   *  any operator override. Exposed so the drawer can show what the
   *  override is overriding (e.g. "OVERRIDE: 200 · PLAN DEFAULT: 100"). */
  planDefaultCap: number;
  remaining:      number;       // Number.POSITIVE_INFINITY when unlimited
  windowResetsAt: number;       // epoch ms — earliest open that would age out
  blocked:        boolean;
  reason:         "ok" | "trade_limit_exhausted";
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5_000;

interface CacheEntry { verdict: TradeLimitVerdict; expiresAt: number }
const cache = new Map<string, CacheEntry>();

/** Reset the per-user cache. Test-only; production paths rely on TTL. */
export function __resetTradeLimitCacheForTests(): void {
  cache.clear();
}

/** Invalidate a single user's cached verdict (call right after recording
 *  a new live open OR after an operator writes an override). */
export function invalidateTradeLimitCache(userId: string): void {
  cache.delete(userId);
}

interface ResolvedCap {
  capTier:        number;
  source:         TradeLimitSource;
  planDefaultCap: number;
}

async function resolveCap(userId: string): Promise<ResolvedCap> {
  try {
    // Single round-trip: LEFT JOIN user_trade_limits onto users so the
    // plan lookup and the override lookup happen together. Missing
    // user row (shouldn't happen at runtime — requireAuth enforces it)
    // falls through to the FREE plan default.
    const [row] = await db
      .select({
        plan:              usersTable.plan,
        capTier:           userTradeLimitsTable.capTier,
        usePlanDefault:    userTradeLimitsTable.usePlanDefault,
        overrideExpiresAt: userTradeLimitsTable.overrideExpiresAt,
      })
      .from(usersTable)
      .leftJoin(userTradeLimitsTable, eq(userTradeLimitsTable.userId, usersTable.clerkUserId))
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);

    const planDefaultCap = getPlanDefaultCap(row?.plan ?? null);

    if (!row || row.capTier === null || row.usePlanDefault !== false) {
      // No row, no override flag set, or operator explicitly chose
      // "use plan default" → plan tier wins.
      return { capTier: planDefaultCap, source: "plan-default", planDefaultCap };
    }
    if (row.overrideExpiresAt && row.overrideExpiresAt.getTime() < Date.now()) {
      // Override window elapsed → revert to plan default. Operators
      // who want a permanent bump set overrideExpiresAt = null.
      return { capTier: planDefaultCap, source: "plan-default", planDefaultCap };
    }
    return { capTier: row.capTier, source: "operator-override", planDefaultCap };
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "tradeLimitEngine: cap lookup failed — defaulting to FREE plan default",
    );
    const fallback = getPlanDefaultCap(null);
    return { capTier: fallback, source: "plan-default", planDefaultCap: fallback };
  }
}

interface WindowOpens { count: number; oldestOpenEpochMs: number | null }

async function countLiveOpensInWindow(userId: string, cutoffMs: number): Promise<WindowOpens> {
  try {
    const [openRows, closedRows] = await Promise.all([
      db
        .select({
          count:  sql<number>`count(*)::int`,
          oldest: sql<number | null>`min(${simPositionsTable.entryTime})`,
        })
        .from(simPositionsTable)
        .where(
          and(
            eq(simPositionsTable.userId, userId),
            isNotNull(simPositionsTable.exchange),
            gte(simPositionsTable.entryTime, cutoffMs),
          ),
        ),
      db
        .select({
          count:  sql<number>`count(*)::int`,
          oldest: sql<number | null>`min(${simTradesTable.entryTime})`,
        })
        .from(simTradesTable)
        .where(
          and(
            eq(simTradesTable.userId, userId),
            isNotNull(simTradesTable.exchange),
            gte(simTradesTable.entryTime, cutoffMs),
          ),
        ),
    ]);
    const count = (openRows[0]?.count ?? 0) + (closedRows[0]?.count ?? 0);
    const oldestCandidates = [openRows[0]?.oldest ?? null, closedRows[0]?.oldest ?? null]
      .filter((v): v is number => typeof v === "number");
    const oldest = oldestCandidates.length ? Math.min(...oldestCandidates) : null;
    return { count, oldestOpenEpochMs: oldest };
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "tradeLimitEngine: window count query failed — defaulting to 0",
    );
    return { count: 0, oldestOpenEpochMs: null };
  }
}

/** Pure verdict builder — unit-tested. */
export function buildVerdict(args: {
  userId:            string;
  used24h:           number;
  capTier:           number;
  source:            TradeLimitSource;
  planDefaultCap:    number;
  oldestOpenEpochMs: number | null;
  nowMs:             number;
}): TradeLimitVerdict {
  const { userId, used24h, capTier, source, planDefaultCap, oldestOpenEpochMs, nowMs } = args;
  const unlimited = capTier === UNLIMITED_TRADE_LIMIT_CAP;
  const remaining = unlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, capTier - used24h);
  const blocked = !unlimited && used24h >= capTier;
  // Window-reset = the earliest open in the window + 24h. If there are no
  // opens yet, the window has effectively "just reset" — return now.
  const windowResetsAt = oldestOpenEpochMs !== null
    ? oldestOpenEpochMs + WINDOW_MS
    : nowMs;
  return {
    userId,
    used24h,
    capTier,
    source,
    planDefaultCap,
    remaining,
    windowResetsAt,
    blocked,
    reason: blocked ? "trade_limit_exhausted" : "ok",
  };
}

export async function getTradeLimitVerdict(userId: string): Promise<TradeLimitVerdict> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.verdict;
  const resolved = await resolveCap(userId);
  const { count, oldestOpenEpochMs } = await countLiveOpensInWindow(userId, now - WINDOW_MS);
  const verdict = buildVerdict({
    userId,
    used24h:           count,
    capTier:           resolved.capTier,
    source:            resolved.source,
    planDefaultCap:    resolved.planDefaultCap,
    oldestOpenEpochMs,
    nowMs:             now,
  });
  cache.set(userId, { verdict, expiresAt: now + CACHE_TTL_MS });
  return verdict;
}
