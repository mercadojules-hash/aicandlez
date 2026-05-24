import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// processed_stripe_events
// ─────────────────────────────────────────────────────────────────────────────
//
// Durable idempotency ledger for Stripe webhook fulfillment paths that mutate
// our own balance / fee state (credit_topup, outstanding_payment).
//
// Stripe guarantees at-least-once delivery for webhooks. The Stripe library
// will redeliver `payment_intent.succeeded` on transient processing failures.
// Without a durable dedupe gate, we would risk double-crediting balances or
// re-settling the same outstanding-payment leftover.
//
// Insertion strategy (in WebhookHandlers.maybeHandleCreditEvent):
//   1. Open a transaction.
//   2. INSERT (paymentIntentId, eventType) — primary key = paymentIntentId.
//      If ON CONFLICT DO NOTHING returns 0 rows, this event was already
//      processed → return early, do not mutate balances.
//   3. Inside the SAME transaction, mutate balances / settle fees. Commit.
//
// This guarantees: either both the idempotency row AND the financial
// mutations commit, or neither does.

export const processedStripeEventsTable = pgTable("processed_stripe_events", {
  paymentIntentId: varchar("payment_intent_id", { length: 255 }).primaryKey(),
  eventType:       varchar("event_type", { length: 64 }).notNull(),
  userId:          varchar("user_id", { length: 255 }).notNull(),
  amountUsd:       text("amount_usd").notNull(),  // stored as string for exactness in audit
  processedAt:     timestamp("processed_at").defaultNow().notNull(),
});

export type ProcessedStripeEvent       = typeof processedStripeEventsTable.$inferSelect;
export type InsertProcessedStripeEvent = typeof processedStripeEventsTable.$inferInsert;
