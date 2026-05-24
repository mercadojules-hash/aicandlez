import { pgTable, varchar, real, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Prepaid credit balance per user. Single source of truth for available
// credits — `credit_transactions` is the immutable ledger that produces
// this balance via running sum.
//
// Rule: credits are SaaS platform credit (covers performance fees).
// They are NOT trading capital, never sent to exchanges, never withdrawable
// as cash. Refunds go back to the original Stripe payment method.
export const userCreditsTable = pgTable("user_credits", {
  userId:                varchar("user_id", { length: 255 })
    .primaryKey()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  balanceUsd:            real("balance_usd").notNull().default(0),
  autoRechargeUsd:       real("auto_recharge_usd").default(0),
  autoRechargeThreshold: real("auto_recharge_threshold").default(0),
  updatedAt:             timestamp("updated_at").defaultNow().notNull(),
});

export type UserCredits       = typeof userCreditsTable.$inferSelect;
export type InsertUserCredits = typeof userCreditsTable.$inferInsert;
