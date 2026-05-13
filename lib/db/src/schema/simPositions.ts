import { pgTable, text, varchar, real, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const simPositionsTable = pgTable("sim_positions", {
  id:         text("id").primaryKey(),
  userId:     varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  symbol:     text("symbol").notNull(),
  side:       text("side").notNull(),
  quantity:   real("quantity").notNull(),
  entryPrice: real("entry_price").notNull(),
  entryTime:  bigint("entry_time", { mode: "number" }).notNull(),
  sizeUSD:    real("size_usd").notNull(),
  signalId:   text("signal_id"),
  stopLoss:   real("stop_loss"),
  takeProfit: real("take_profit"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sim_positions_user_idx").on(t.userId),
]);

export type SimPosition = typeof simPositionsTable.$inferSelect;
export type InsertSimPosition = typeof simPositionsTable.$inferInsert;
