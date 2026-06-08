import { pgTable, varchar, timestamp, uuid, boolean, integer, text, jsonb } from "drizzle-orm/pg-core";

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
  // ── Billing overrides (super-admin editable, audit-logged) ───────────────────
  // All optional / off by default. When set, override the derived/default
  // billing posture for this user. Mutated only via PATCH
  // /api/admin/users/:id/billing-overrides (super-admin). Every change is
  // captured in `user_admin_actions` as `update_billing_overrides`.
  perfFeeBpsOverride:    integer("perf_fee_bps_override"),               // null = use platform default (300 = 3%)
  feeWaiverActive:       boolean("fee_waiver_active").notNull().default(false),
  feeWaiverUntil:        timestamp("fee_waiver_until"),                  // null = indefinite while active
  isComplimentaryAccount: boolean("is_complimentary_account").notNull().default(false),
  isInternalAccount:     boolean("is_internal_account").notNull().default(false),
  revenueShareBps:       integer("revenue_share_bps").notNull().default(0),
  billingOverrideNotes:  text("billing_override_notes"),
  billingOverrideMeta:   jsonb("billing_override_meta").$type<Record<string, unknown>>(),
  // ── Timestamps ────────────────────────────────────────────────────────────────
  createdAt:             timestamp("created_at").defaultNow().notNull(),
  updatedAt:             timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
