import { pgTable, varchar, real, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const simAccountsTable = pgTable("sim_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .unique()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

  startingBalance: real("starting_balance").notNull().default(100000),
  cashBalance:     real("cash_balance").notNull().default(100000),
  totalRealized:   real("total_realized").notNull().default(0),
  totalTrades:     integer("total_trades").notNull().default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SimAccount = typeof simAccountsTable.$inferSelect;
export type InsertSimAccount = typeof simAccountsTable.$inferInsert;
