import { pgTable, varchar, timestamp, uuid } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  clerkUserId:           varchar("clerk_user_id", { length: 255 }).unique().notNull(),
  email:                 varchar("email", { length: 255 }).notNull(),
  role:                  varchar("role", { length: 50 }).notNull().default("user"),
  // ── Billing ──────────────────────────────────────────────────────────────────
  plan:                  varchar("plan", { length: 50 }).notNull().default("free"),
  planStatus:            varchar("plan_status", { length: 50 }).notNull().default("none"),
  stripeCustomerId:      varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId:  varchar("stripe_subscription_id", { length: 255 }),
  billingEmail:          varchar("billing_email", { length: 255 }),
  trialEndsAt:           timestamp("trial_ends_at"),
  // ── AI Trading Disclaimer (eligibility + risk acknowledgement) ───────────────
  // Customer must affirmatively accept the disclaimer before AI auto-trading
  // can be enabled. Server-enforced in `placeLiveAutoOrderForUser` (gate 0e)
  // and in the AI-enable gate. Version-bumped if disclaimer text changes so
  // existing customers are re-prompted on update.
  aiDisclaimerAcceptedAt: timestamp("ai_disclaimer_accepted_at"),
  aiDisclaimerVersion:    varchar("ai_disclaimer_version", { length: 32 }),
  aiDisclaimerIp:         varchar("ai_disclaimer_ip", { length: 64 }),
  // ── Timestamps ────────────────────────────────────────────────────────────────
  createdAt:             timestamp("created_at").defaultNow().notNull(),
  updatedAt:             timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
