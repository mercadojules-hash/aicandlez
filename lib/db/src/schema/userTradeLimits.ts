import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-user trade-limit configuration. Default cap is 50 live AI trades per
// rolling 24h window. Operators promote individual users to 100 / 200 /
// unlimited via the admin surface. `capTier === -1` is the sentinel for
// "unlimited" — keeps the column non-nullable + numeric.
//
// `overrideExpiresAt` lets an operator grant a temporary cap bump that
// auto-expires; the engine treats an expired override as if it weren't set
// (falls back to the row's capTier, which the operator can keep at 50).
export const userTradeLimitsTable = pgTable("user_trade_limits", {
  userId:            varchar("user_id", { length: 255 })
    .primaryKey()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  capTier:           integer("cap_tier").notNull().default(50),
  overrideExpiresAt: timestamp("override_expires_at"),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
  updatedAt:         timestamp("updated_at").defaultNow().notNull(),
});

export type UserTradeLimit       = typeof userTradeLimitsTable.$inferSelect;
export type InsertUserTradeLimit = typeof userTradeLimitsTable.$inferInsert;

export const TRADE_LIMIT_CAP_TIERS = [50, 100, 200, -1] as const;
export const DEFAULT_TRADE_LIMIT_CAP = 50;
export const UNLIMITED_TRADE_LIMIT_CAP = -1;
