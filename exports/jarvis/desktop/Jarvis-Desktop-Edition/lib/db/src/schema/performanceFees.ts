import { pgTable, text, varchar, real, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── performance_fees ──────────────────────────────────────────────────────────
// Records every 3% performance fee charged on REALIZED, CLOSED, PROFITABLE
// trades only.  No fee is ever charged on losing trades or unrealized PnL.
//
// Settlement flow:
//   "pending"   → fee is computed and owed
//   "settled"   → payment collected (manual or via Stripe invoice)
//   "waived"    → admin override — fee forgiven for this trade
//
// This table is the authoritative source for admin fee analytics.

export const performanceFeesTable = pgTable("performance_fees", {
  id:              text("id").primaryKey(),

  // User context
  userId:          varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

  // Trade context (references sim_trades or live trade IDs)
  tradeId:         text("trade_id").notNull(),
  exchange:        varchar("exchange", { length: 100 }).notNull(),
  symbol:          text("symbol").notNull(),
  side:            varchar("side", { length: 10 }).notNull(),

  // Financial figures
  realizedPnl:     real("realized_pnl").notNull(),
  feeRate:         real("fee_rate").notNull().default(0.02),
  feeAmountUsd:    real("fee_amount_usd").notNull(),

  // Settlement
  settlementStatus: varchar("settlement_status", { length: 30 }).notNull().default("pending"),
  settledAt:        timestamp("settled_at"),

  // Trading mode (paper trades are recorded for auditing but not billed)
  isPaper:          boolean("is_paper").notNull().default(true),

  createdAt:        timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("perf_fees_user_idx").on(t.userId),
  index("perf_fees_status_idx").on(t.settlementStatus),
  index("perf_fees_trade_idx").on(t.tradeId),
]);

export type PerformanceFee    = typeof performanceFeesTable.$inferSelect;
export type InsertPerformanceFee = typeof performanceFeesTable.$inferInsert;
