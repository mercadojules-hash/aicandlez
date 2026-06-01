import { pgTable, uuid, varchar, real, integer, jsonb, text, timestamp, index } from "drizzle-orm/pg-core";

// Immutable audit trail for operator account reconciliations. Every time an
// operator recomputes a user's realized P&L from verified records (excluding
// the unlimited-position-incident backlog), a row is appended here capturing
// the before/after ledger so the correction is permanently auditable. Rows are
// never updated or deleted.
//
// `breakdown` holds a self-contained snapshot (incident rows tagged, verified
// counts, per-bucket sums) so a reader can reconstruct the decision without
// re-querying sim_trades as it stood at reconciliation time.
export const accountReconciliationsTable = pgTable("account_reconciliations", {
  id:              uuid("id").primaryKey().defaultRandom(),
  targetUserId:    varchar("target_user_id", { length: 255 }).notNull(),
  actorUserId:     varchar("actor_user_id", { length: 255 }).notNull(),
  prevRealized:    real("prev_realized").notNull(),
  newRealized:     real("new_realized").notNull(),
  prevTotalTrades: integer("prev_total_trades").notNull(),
  newTotalTrades:  integer("new_total_trades").notNull(),
  taggedCount:     integer("tagged_count").notNull(),
  verifiedCount:   integer("verified_count").notNull(),
  breakdown:       jsonb("breakdown").$type<Record<string, unknown>>().notNull(),
  note:            text("note"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("account_reconciliations_target_idx").on(t.targetUserId),
  index("account_reconciliations_created_idx").on(t.createdAt),
]);

export type AccountReconciliation       = typeof accountReconciliationsTable.$inferSelect;
export type InsertAccountReconciliation = typeof accountReconciliationsTable.$inferInsert;
