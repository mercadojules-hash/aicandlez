import {
  pgTable, varchar, text, timestamp, uuid, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userPushTokensTable = pgTable("user_push_tokens", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

  token:      text("token").notNull(),
  platform:   varchar("platform", { length: 20 }).notNull(), // "expo" | "web"
  deviceName: varchar("device_name", { length: 200 }),

  createdAt:  timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
}, (t) => [
  index("user_push_tokens_user_idx").on(t.userId),
  uniqueIndex("user_push_tokens_token_idx").on(t.token),
]);

export type UserPushToken    = typeof userPushTokensTable.$inferSelect;
export type InsertUserPushToken = typeof userPushTokensTable.$inferInsert;
