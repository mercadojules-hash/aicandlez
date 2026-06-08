import { pgTable, text, varchar, real, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Immutable ledger of every credit balance movement. Insert-only —
// never UPDATE/DELETE. Balance is reconstructable via SUM(amount_usd)
// per user_id, but `user_credits.balance_usd` is the cached running
// balance for fast reads.
//
// Types:
//   topup           — user paid Stripe (positive amount)
//   fee_deduction   — performance fee charged against credits (negative)
//   refund          — Stripe refund issued (negative; reverses topup)
//   adjustment      — super-admin manual correction (signed)
export const creditTransactionsTable = pgTable("credit_transactions", {
  id:                     text("id").primaryKey(),
  userId:                 varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  amountUsd:              real("amount_usd").notNull(),
  type:                   varchar("type", { length: 30 }).notNull(),
  stripePaymentIntentId:  varchar("stripe_payment_intent_id", { length: 255 }),
  relatedFeeId:           text("related_fee_id"),
  note:                   text("note"),
  actorAdminId:           varchar("actor_admin_id", { length: 255 }),
  balanceAfter:           real("balance_after").notNull(),
  createdAt:              timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("credit_tx_user_idx").on(t.userId),
  index("credit_tx_type_idx").on(t.type),
  index("credit_tx_pi_idx").on(t.stripePaymentIntentId),
]);

export type CreditTransaction       = typeof creditTransactionsTable.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactionsTable.$inferInsert;

export const CREDIT_TX_TYPES = ["topup", "fee_deduction", "refund", "adjustment"] as const;
export type CreditTxType = typeof CREDIT_TX_TYPES[number];
