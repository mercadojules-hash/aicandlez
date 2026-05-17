import { pgTable, text, bigint, jsonb, timestamp } from "drizzle-orm/pg-core";

export const auditLogTable = pgTable("audit_log", {
  id:        text("id").primaryKey(),
  hash:      text("hash").notNull(),
  tsMs:      bigint("ts_ms", { mode: "number" }).notNull(),
  userId:    text("user_id").notNull(),
  sessionId: text("session_id"),
  ipAddress: text("ip_address"),
  type:      text("type").notNull(),
  exchange:  text("exchange"),
  symbol:    text("symbol"),
  payload:   jsonb("payload").$type<Record<string, unknown>>().notNull(),
  severity:  text("severity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
