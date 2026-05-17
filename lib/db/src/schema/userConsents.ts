import { pgTable, text, varchar, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── user_consents ─────────────────────────────────────────────────────────────
// Records explicit user acceptance of platform terms at first access.
//
// consent_version allows us to re-show the gate when terms change.
// Current version: "v1.0" — covers:
//   • $5.99/month membership fee
//   • 3% performance fee on PROFITABLE CLOSED trades only
//   • No fee on losing trades
//   • No fee on unrealized PnL

export const userConsentsTable = pgTable("user_consents", {
  id:              text("id").primaryKey(),
  userId:          varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

  // Which version of the consent screen was accepted
  consentVersion:  varchar("consent_version", { length: 20 }).notNull().default("v1.0"),

  // Individual checkboxes the user explicitly ticked
  acceptedTerms:             boolean("accepted_terms").notNull().default(false),
  acceptedMembershipFee:     boolean("accepted_membership_fee").notNull().default(false),
  acceptedPerformanceFee:    boolean("accepted_performance_fee").notNull().default(false),
  acceptedNoFeeOnLosses:     boolean("accepted_no_fee_on_losses").notNull().default(false),
  acceptedNoUnrealizedFee:   boolean("accepted_no_unrealized_fee").notNull().default(false),

  // Optional: raw payload for audit trail
  metadata:        jsonb("metadata"),

  // Request context
  ipAddress:       varchar("ip_address", { length: 100 }),
  userAgent:       text("user_agent"),

  createdAt:       timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("user_consents_user_idx").on(t.userId),
  index("user_consents_version_idx").on(t.userId, t.consentVersion),
]);

export type UserConsent    = typeof userConsentsTable.$inferSelect;
export type InsertUserConsent = typeof userConsentsTable.$inferInsert;
