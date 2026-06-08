import { pgTable, text, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// Immutable operator-action audit trail. Every operator action against a
// user (suspend, comp sub, extend trial, override cap, revoke exchange,
// emergency disable, etc.) writes a row here. Append-only: rows are never
// updated or deleted.
//
// `payload` holds a `{ before, after, ... }` snapshot so the audit row is
// self-contained — readers don't need to reconstruct state by joining
// other tables.
export const userAdminActionsTable = pgTable("user_admin_actions", {
  id:             text("id").primaryKey(),
  actorAdminId:   varchar("actor_admin_id", { length: 255 }).notNull(),
  targetUserId:   varchar("target_user_id", { length: 255 }).notNull(),
  action:         text("action").notNull(),
  payload:        jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("user_admin_actions_target_idx").on(t.targetUserId),
  index("user_admin_actions_actor_idx").on(t.actorAdminId),
  index("user_admin_actions_created_idx").on(t.createdAt),
]);

export type UserAdminAction       = typeof userAdminActionsTable.$inferSelect;
export type InsertUserAdminAction = typeof userAdminActionsTable.$inferInsert;

// Canonical action labels. Kept as a const tuple so callers can union
// against `AdminActionType` for compile-time safety.
export const ADMIN_ACTION_TYPES = [
  "set_status",
  "set_trade_limit",
  "comp_subscription",
  "extend_trial",
  "revoke_exchange",
  "emergency_disable",
  "note",
] as const;
export type AdminActionType = typeof ADMIN_ACTION_TYPES[number];
