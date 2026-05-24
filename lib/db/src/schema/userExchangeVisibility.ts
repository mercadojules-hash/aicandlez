import { pgTable, text, varchar, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

// CRM Phase A4 — per-user exchange governance / entitlements.
//
// One row per (clerkUserId, exchangeId) ONLY when an operator has
// explicitly set a visibility override. Absent row = default visible
// (driven by the catalog's `customerVisible`/`adminOnly` flags). When
// `visible = false`, the exchange is hidden from that user's
// onboarding / connect surfaces (presentational governance — execution
// enforcement is intentionally deferred to a later phase).
//
// Hard-revert semantics: an operator can "clear" a per-user override
// by deleting the row, which returns the user to catalog defaults
// without leaving a stale `visible=true` artifact. Each mutation
// appends an immutable row to `user_admin_actions` for the audit trail.
export const userExchangeVisibilityTable = pgTable("user_exchange_visibility", {
  id:               text("id").primaryKey(),
  clerkUserId:      varchar("clerk_user_id", { length: 255 }).notNull(),
  exchangeId:       varchar("exchange_id",   { length: 64  }).notNull(),
  visible:          boolean("visible").notNull(),
  note:             text("note"),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
  updatedByAdminId: varchar("updated_by_admin_id", { length: 255 }).notNull(),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_exchange_visibility_user_exchange_uniq").on(t.clerkUserId, t.exchangeId),
  index("user_exchange_visibility_user_idx").on(t.clerkUserId),
]);

export type UserExchangeVisibility       = typeof userExchangeVisibilityTable.$inferSelect;
export type InsertUserExchangeVisibility = typeof userExchangeVisibilityTable.$inferInsert;
