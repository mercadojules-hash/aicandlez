import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-user administrative status. Default is `active`. Operators can flip
// to:
//   - `suspended`    → blocks every execution path (paper + live).
//                      Auth bootstrap stays open so the user can sign in
//                      and see *why* they're suspended.
//   - `disabled`     → blocks execution AND auth bootstrap. Hard lock.
//   - `force_paper`  → blocks only live paths; paper continues to work.
//
// The single source of truth is read by `userStatusGuard` and respected by
// every execution boundary.
export const userAdminStatusTable = pgTable("user_admin_status", {
  userId:        varchar("user_id", { length: 255 })
    .primaryKey()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  status:        text("status").notNull().default("active"),
  setByAdminId:  varchar("set_by_admin_id", { length: 255 }),
  reason:        text("reason"),
  since:         timestamp("since").defaultNow().notNull(),
  updatedAt:     timestamp("updated_at").defaultNow().notNull(),
});

export type UserAdminStatus       = typeof userAdminStatusTable.$inferSelect;
export type InsertUserAdminStatus = typeof userAdminStatusTable.$inferInsert;

export const ADMIN_STATUSES = ["active", "suspended", "disabled", "force_paper"] as const;
export type AdminStatus = typeof ADMIN_STATUSES[number];
