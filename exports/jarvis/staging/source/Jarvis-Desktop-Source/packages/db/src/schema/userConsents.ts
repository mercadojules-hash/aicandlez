import { pgTable, text, varchar, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── user_consents ─────────────────────────────────────────────────────────────
// Records explicit user acceptance of platform terms / risk disclaimers.
//
// consent_version allows us to re-show the gate when terms change.
// Versions:
//   "v1.0"           — legacy fee acknowledgement (5 checkboxes)
//   "disclaimer-v1.0" — current required risk disclaimer (6 checkboxes)
//
// The current required version for gated actions (checkout, exchange connect,
// live execution, plan upgrade) is exported from
// `@workspace/db/constants/disclaimer` as DISCLAIMER_VERSION.

export const userConsentsTable = pgTable("user_consents", {
  id:              text("id").primaryKey(),
  userId:          varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

  // Which version of the consent screen was accepted
  consentVersion:  varchar("consent_version", { length: 40 }).notNull().default("v1.0"),

  // ── v1.0 fee acknowledgements (legacy — kept for historical rows) ─────────
  acceptedTerms:             boolean("accepted_terms").notNull().default(false),
  acceptedMembershipFee:     boolean("accepted_membership_fee").notNull().default(false),
  acceptedPerformanceFee:    boolean("accepted_performance_fee").notNull().default(false),
  acceptedNoFeeOnLosses:     boolean("accepted_no_fee_on_losses").notNull().default(false),
  acceptedNoUnrealizedFee:   boolean("accepted_no_unrealized_fee").notNull().default(false),

  // ── disclaimer-v1.0 risk acknowledgements (current required gate) ─────────
  // Nullable — only present on rows where consent_version starts with
  // "disclaimer-". Existing v1.0 fee rows keep NULL here.
  acceptedNotAdvice:         boolean("accepted_not_advice"),
  acceptedTradingRisk:       boolean("accepted_trading_risk"),
  acceptedAiInaccuracy:      boolean("accepted_ai_inaccuracy"),
  acceptedPastPerformance:   boolean("accepted_past_performance"),
  acceptedUserResponsible:   boolean("accepted_user_responsible"),
  acceptedAutomatedLosses:   boolean("accepted_automated_losses"),

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
