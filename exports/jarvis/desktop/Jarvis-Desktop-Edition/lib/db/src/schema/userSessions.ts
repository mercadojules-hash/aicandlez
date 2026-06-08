import { pgTable, text, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

// CRM Phase A3 — real per-session persistence.
//
// One row per Clerk session, lazily upserted by the `requireAuth`
// middleware on each authenticated request. `clerkSessionId` is the
// natural key (Clerk's `sid` claim). `lastSeenAt` is debounced in
// middleware (only re-written when stale > 60s) to keep the auth path
// cheap. When `revokedAt` is non-null, the middleware refuses to
// authenticate the session, surfaced to the client as a hard 401 with
// `errorCode: "session_revoked"`.
//
// Append-on-revoke semantics: revocation is recorded by setting
// `revokedAt` + `revokedByAdminId` + `revokeReason`; rows are never
// hard-deleted so the operator's revoke history stays auditable.
export const userSessionsTable = pgTable("user_sessions", {
  id:                text("id").primaryKey(),
  clerkSessionId:    varchar("clerk_session_id", { length: 255 }),
  clerkUserId:       varchar("clerk_user_id",    { length: 255 }).notNull(),
  ipAddress:         varchar("ip_address",       { length: 64 }),
  userAgent:         text("user_agent"),
  firstSeenAt:       timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt:        timestamp("last_seen_at").defaultNow().notNull(),
  revokedAt:         timestamp("revoked_at"),
  revokedByAdminId:  varchar("revoked_by_admin_id", { length: 255 }),
  revokeReason:      text("revoke_reason"),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_sessions_clerk_session_uniq").on(t.clerkSessionId),
  index("user_sessions_user_idx").on(t.clerkUserId),
  index("user_sessions_last_seen_idx").on(t.lastSeenAt),
  index("user_sessions_revoked_idx").on(t.revokedAt),
]);

export type UserSession       = typeof userSessionsTable.$inferSelect;
export type InsertUserSession = typeof userSessionsTable.$inferInsert;
