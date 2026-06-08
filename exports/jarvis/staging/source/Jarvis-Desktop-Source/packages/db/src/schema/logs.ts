import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const logsTable = pgTable("logs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // signal, trade, system, error
  level: text("level").notNull(), // info, warn, error, success
  message: text("message").notNull(),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertLogSchema = createInsertSchema(logsTable).omit({ timestamp: true });
export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logsTable.$inferSelect;
