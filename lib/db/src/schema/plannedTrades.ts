import { pgTable, text, varchar, real, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const plannedTradesTable = pgTable("planned_trades", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  planType: varchar("plan_type", { length: 32 }).notNull().default("PLANNED_BUY"),
  symbol: text("symbol").notNull(),
  buyTargetPrice: real("buy_target_price"),
  buyTriggerDirection: varchar("buy_trigger_direction", { length: 16 }),
  sellTargetPrice: real("sell_target_price"),
  targetProfitUSD: real("target_profit_usd"),
  positionSizeUSD: real("position_size_usd").notNull(),
  expirationTime: bigint("expiration_time", { mode: "number" }),
  status: varchar("status", { length: 32 }).notNull().default("Waiting"),
  enteredPositionId: text("entered_position_id"),
  targetPositionId: text("target_position_id"),
  enteredAt: bigint("entered_at", { mode: "number" }),
  completedTradeId: text("completed_trade_id"),
  completedAt: bigint("completed_at", { mode: "number" }),
  cancelledAt: bigint("cancelled_at", { mode: "number" }),
  lastCheckedAt: bigint("last_checked_at", { mode: "number" }),
  attemptCount: bigint("attempt_count", { mode: "number" }).notNull().default(0),
  lastError: text("last_error"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("planned_trades_user_idx").on(t.userId),
  index("planned_trades_status_idx").on(t.status),
  index("planned_trades_type_status_idx").on(t.planType, t.status),
  index("planned_trades_target_position_idx").on(t.targetPositionId),
]);

export type PlannedTrade = typeof plannedTradesTable.$inferSelect;
export type InsertPlannedTrade = typeof plannedTradesTable.$inferInsert;
