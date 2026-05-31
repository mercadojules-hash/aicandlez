/**
 * multiExchangeParallel — per-user capability loader for Task #216.
 *
 * A tiny, dependency-light helper that reads the two `user_settings` columns
 * governing PARALLEL multi-exchange live trading:
 *
 *   - `multiExchangeParallelEnabled` (bool, default false)
 *   - `perExchangeMaxPositions`      (int, nullable → DEFAULT_PER_EXCHANGE_MAX)
 *
 * When a user is parallel-enabled, the AI live fan-out routes the same signal
 * to EVERY healthy, trade-authorized live connection at once, and each venue
 * enforces its own independent open-position cap. Every other customer keeps
 * the locked single-active-exchange runtime (`enabled: false`).
 *
 * All reads fail CLOSED to `enabled: false` so a DB hiccup can never silently
 * widen a customer into parallel mode.
 */

import { db, userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

/** Default per-(user, exchange) open-position cap for parallel users. */
export const DEFAULT_PER_EXCHANGE_MAX = 20;

export interface ParallelConfig {
  enabled:        boolean;
  /** Raw stored override; null → use DEFAULT_PER_EXCHANGE_MAX. */
  perExchangeMax: number | null;
}

const PARALLEL_OFF: ParallelConfig = { enabled: false, perExchangeMax: null };

/**
 * Load a single user's parallel capability config. Fails closed (parallel
 * OFF) on any error so real-money fan-out can never be widened by a DB fault.
 */
export async function loadParallelConfig(userId: string): Promise<ParallelConfig> {
  try {
    const [row] = await db
      .select({
        enabled:        userSettingsTable.multiExchangeParallelEnabled,
        perExchangeMax: userSettingsTable.perExchangeMaxPositions,
      })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    if (!row) return PARALLEL_OFF;
    return {
      enabled:        row.enabled === true,
      perExchangeMax: row.perExchangeMax ?? null,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), userId },
      "multiExchangeParallel: config load failed — defaulting parallel OFF",
    );
    return PARALLEL_OFF;
  }
}

/** Resolve the effective per-exchange cap (stored override or the default). */
export function effectivePerExchangeMax(cfg: ParallelConfig): number {
  return cfg.perExchangeMax != null && cfg.perExchangeMax > 0
    ? Math.floor(cfg.perExchangeMax)
    : DEFAULT_PER_EXCHANGE_MAX;
}
