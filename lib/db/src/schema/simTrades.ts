import { pgTable, text, varchar, real, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const simTradesTable = pgTable("sim_trades", {
  id:             text("id").primaryKey(),
  userId:         varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  symbol:         text("symbol").notNull(),
  side:           text("side").notNull(),
  quantity:       real("quantity").notNull(),
  entryPrice:     real("entry_price").notNull(),
  exitPrice:      real("exit_price").notNull(),
  entryTime:      bigint("entry_time", { mode: "number" }).notNull(),
  exitTime:       bigint("exit_time", { mode: "number" }).notNull(),
  sizeUSD:        real("size_usd").notNull(),
  realizedPnL:    real("realized_pnl").notNull(),
  realizedPnLPct: real("realized_pnl_pct").notNull(),
  durationMs:     bigint("duration_ms", { mode: "number" }).notNull(),
  closeReason:    text("close_reason").default("MANUAL"),
  // Populated when this trade was executed against a live broker account
  // (per-user `user_exchange_connections`). NULL for paper/sim fills.
  exchange:        text("exchange"),
  exchangeOrderId: text("exchange_order_id"),
  // Broker reference for the close-side market order submitted when this
  // live position was flattened. NULL for paper trades and for any legacy
  // live trades closed before close-side submission was wired in.
  exchangeCloseOrderId: text("exchange_close_order_id"),
  // Broker commission charged on each fill (live trades only — NULL for paper).
  // Stored in USD. Computed at close time from the exchange catalog's taker
  // fee rate; surfaced in the customer's trade receipt for audit parity with
  // the broker's own statement.
  entryFee:        real("entry_fee"),
  exitFee:         real("exit_fee"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sim_trades_user_idx").on(t.userId),
]);

export type SimTrade = typeof simTradesTable.$inferSelect;
export type InsertSimTrade = typeof simTradesTable.$inferInsert;
