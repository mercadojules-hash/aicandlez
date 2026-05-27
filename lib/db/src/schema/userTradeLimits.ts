import { pgTable, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-user trade-limit configuration. Two operating modes:
//
//   1. PLAN DEFAULT (default for every new user, `usePlanDefault=true`)
//      The engine ignores `capTier` and resolves the cap from the user's
//      billing plan via `PLAN_DEFAULT_TRADE_LIMIT_CAP`:
//        free    →  50 trades / 24h
//        starter → 100 trades / 24h
//        pro     → 200 trades / 24h
//
//   2. OPERATOR OVERRIDE (`usePlanDefault=false`)
//      The engine uses the row's `capTier`. `capTier === -1` is the
//      sentinel for UNLIMITED. `overrideExpiresAt` lets an operator grant
//      a temporary bump that auto-expires; an expired override is treated
//      as if it weren't set (engine falls back to plan default and the
//      drawer's source badge flips back to PLAN DEFAULT).
//
// The row is kept non-nullable + numeric so legacy consumers that read
// `capTier` directly never see NULL. The `usePlanDefault` flag is the
// authoritative discriminator.
export const userTradeLimitsTable = pgTable("user_trade_limits", {
  userId:            varchar("user_id", { length: 255 })
    .primaryKey()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  capTier:           integer("cap_tier").notNull().default(50),
  usePlanDefault:    boolean("use_plan_default").notNull().default(true),
  overrideExpiresAt: timestamp("override_expires_at"),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
  updatedAt:         timestamp("updated_at").defaultNow().notNull(),
});

export type UserTradeLimit       = typeof userTradeLimitsTable.$inferSelect;
export type InsertUserTradeLimit = typeof userTradeLimitsTable.$inferInsert;

export const TRADE_LIMIT_CAP_TIERS = [50, 100, 200, -1] as const;
export const DEFAULT_TRADE_LIMIT_CAP = 50;
export const UNLIMITED_TRADE_LIMIT_CAP = -1;

/** Per-plan default cap on live AI trades per rolling 24h window.
 *  Source of truth for the new tier ladder (Task: operator override
 *  surface). Operator overrides set `usePlanDefault=false` and write
 *  the desired `capTier` (or `-1` for unlimited). */
export const PLAN_DEFAULT_TRADE_LIMIT_CAP: Record<"free" | "starter" | "pro", number> = {
  free:    50,
  starter: 100,
  pro:     200,
};

export type PlanTierForCap = keyof typeof PLAN_DEFAULT_TRADE_LIMIT_CAP;

/** Resolve the plan-default cap for an arbitrary plan string. Falls back
 *  to the FREE default for unknown / legacy plan strings so the engine
 *  never returns NaN. */
export function getPlanDefaultCap(plan: string | null | undefined): number {
  if (plan === "starter" || plan === "pro" || plan === "free") {
    return PLAN_DEFAULT_TRADE_LIMIT_CAP[plan];
  }
  return PLAN_DEFAULT_TRADE_LIMIT_CAP.free;
}
