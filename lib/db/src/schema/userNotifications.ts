import { pgTable, varchar, text, boolean, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userNotificationsTable = pgTable("user_notifications", {
  id:      uuid("id").primaryKey().defaultRandom(),
  userId:  varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

  type:    varchar("type", { length: 50 }).notNull(),
  title:   varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  data:    jsonb("data"),
  read:    boolean("read").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("user_notifications_user_idx").on(t.userId),
  index("user_notifications_read_idx").on(t.userId, t.read),
]);

export type UserNotification = typeof userNotificationsTable.$inferSelect;
export type InsertUserNotification = typeof userNotificationsTable.$inferInsert;
