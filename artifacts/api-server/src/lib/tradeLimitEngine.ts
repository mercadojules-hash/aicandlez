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
// from hammering the DB. The cap itself is sourced from
// `user_trade_limits` (default tier = 50, sentinel -1 = unlimited).
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import {
  simPositionsTable,
  simTradesTable,
  userTradeLimitsTable,
  DEFAULT_TRADE_LIMIT_CAP,
  UNLIMITED_TRADE_LIMIT_CAP,
} from "@workspace/db";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { logger } from "./logger.js";

export interface TradeLimitVerdict {
  userId:         string;
  used24h:        number;
  capTier:        number;       // -1 sentinel = unlimited
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

/** Invalidate a single user's cached verdict (call right after recording a new live open). */
export function invalidateTradeLimitCache(userId: string): void {
  cache.delete(userId);
}

async function resolveCap(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({
        capTier:           userTradeLimitsTable.capTier,
        overrideExpiresAt: userTradeLimitsTable.overrideExpiresAt,
      })
      .from(userTradeLimitsTable)
      .where(eq(userTradeLimitsTable.userId, userId))
      .limit(1);
    if (!row) return DEFAULT_TRADE_LIMIT_CAP;
    // Expired override → fall back to default cap; operators are expected
    // to set the row's capTier explicitly when they want a permanent bump.
    if (row.overrideExpiresAt && row.overrideExpiresAt.getTime() < Date.now()) {
      return DEFAULT_TRADE_LIMIT_CAP;
    }
    return row.capTier ?? DEFAULT_TRADE_LIMIT_CAP;
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "tradeLimitEngine: cap lookup failed — defaulting to 50",
    );
    return DEFAULT_TRADE_LIMIT_CAP;
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
  oldestOpenEpochMs: number | null;
  nowMs:             number;
}): TradeLimitVerdict {
  const { userId, used24h, capTier, oldestOpenEpochMs, nowMs } = args;
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
  const cap = await resolveCap(userId);
  const { count, oldestOpenEpochMs } = await countLiveOpensInWindow(userId, now - WINDOW_MS);
  const verdict = buildVerdict({
    userId,
    used24h:           count,
    capTier:           cap,
    oldestOpenEpochMs,
    nowMs:             now,
  });
  cache.set(userId, { verdict, expiresAt: now + CACHE_TTL_MS });
  return verdict;
}
