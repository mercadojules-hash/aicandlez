import { pgTable, text, varchar, real, bigint, boolean, timestamp, index } from "drizzle-orm/pg-core";
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
  // Engine avgConfidence (%) at open, copied from sim_positions at close so
  // realized performance can be sliced by confidence band (50–64 experiment).
  // NULL for trades closed before this column existed / paths without a value.
  confidence:     real("confidence"),
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
  // Broker-reported commissions captured straight from the exchange's order
  // / fill response (when available). Stored alongside the catalog estimate
  // above so the customer receipt can prefer the real charge and fall back
  // to the estimate when the adapter didn't surface one. `*Currency` is the
  // settlement currency the broker quoted the fee in (USD, USDT, etc.).
  entryFeeBroker:         real("entry_fee_broker"),
  entryFeeBrokerCurrency: text("entry_fee_broker_currency"),
  exitFeeBroker:          real("exit_fee_broker"),
  exitFeeBrokerCurrency:  text("exit_fee_broker_currency"),
  // True when this trade was opened against the connected exchange's
  // public sandbox/testnet (paper-mode sandbox routing). Mirrors the
  // open-side `sim_positions.sandbox` flag so closed trades can carry the
  // TESTNET pill in the Portal trade-history feed.
  sandbox:                boolean("sandbox").notNull().default(false),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sim_trades_user_idx").on(t.userId),
]);

export type SimTrade = typeof simTradesTable.$inferSelect;
export type InsertSimTrade = typeof simTradesTable.$inferInsert;
