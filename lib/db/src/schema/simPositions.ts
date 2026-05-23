import { pgTable, text, varchar, real, bigint, boolean, timestamp, index } from "drizzle-orm/pg-core";
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
  // Populated when this position was opened against a live broker account
  // (per-user `user_exchange_connections`). NULL for paper/sim fills.
  exchange:        text("exchange"),
  exchangeOrderId: text("exchange_order_id"),
  // Broker-reported entry-leg commission (when the exchange's order/fill
  // response includes it). Carried on the position so the close-side
  // receipt can prefer it over the catalog estimate. NULL for paper fills
  // and for brokers that don't surface a per-order fee.
  entryFeeBroker:         real("entry_fee_broker"),
  entryFeeBrokerCurrency: text("entry_fee_broker_currency"),
  // True when this position was opened against the connected exchange's
  // public sandbox/testnet (paper-mode sandbox routing). The close path
  // MUST use this same flag — never the user's current `paperSandboxEnabled`
  // setting — so toggling sandbox off mid-flight cannot route a close to
  // production. NULL/false for both internal-simulator paper fills and
  // real-money live fills.
  sandbox:                boolean("sandbox").notNull().default(false),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sim_positions_user_idx").on(t.userId),
]);

export type SimPosition = typeof simPositionsTable.$inferSelect;
export type InsertSimPosition = typeof simPositionsTable.$inferInsert;
