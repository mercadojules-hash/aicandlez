import { pgTable, uuid, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Jarvis Executive Command Center — isolated product schema.
 *
 * All tables are `jarvis_`-prefixed and fully decoupled from the AICandlez
 * trading surfaces. Identity/role still reuses the shared `users` table
 * (Clerk-backed) — Jarvis never creates its own user store.
 */

export const jarvisBusinessesTable = pgTable("jarvis_businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisProjectsTable = pgTable("jarvis_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisAgentsTable = pgTable("jarvis_agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  role: varchar("role", { length: 120 }).notNull().default(""),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisWorkflowsTable = pgTable("jarvis_workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  trigger: varchar("trigger", { length: 120 }).notNull().default("manual"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisAuditLogsTable = pgTable("jarvis_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  userEmail: varchar("user_email", { length: 320 }),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entity_type", { length: 64 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jarvisSettingsTable = pgTable("jarvis_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 120 }).notNull().unique(),
  value: jsonb("value").$type<unknown>(),
  updatedBy: varchar("updated_by", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type JarvisBusiness = typeof jarvisBusinessesTable.$inferSelect;
export type InsertJarvisBusiness = typeof jarvisBusinessesTable.$inferInsert;
export type JarvisProject = typeof jarvisProjectsTable.$inferSelect;
export type InsertJarvisProject = typeof jarvisProjectsTable.$inferInsert;
export type JarvisAgent = typeof jarvisAgentsTable.$inferSelect;
export type InsertJarvisAgent = typeof jarvisAgentsTable.$inferInsert;
export type JarvisWorkflow = typeof jarvisWorkflowsTable.$inferSelect;
export type InsertJarvisWorkflow = typeof jarvisWorkflowsTable.$inferInsert;
export type JarvisAuditLog = typeof jarvisAuditLogsTable.$inferSelect;
export type InsertJarvisAuditLog = typeof jarvisAuditLogsTable.$inferInsert;
export type JarvisSetting = typeof jarvisSettingsTable.$inferSelect;
export type InsertJarvisSetting = typeof jarvisSettingsTable.$inferInsert;
