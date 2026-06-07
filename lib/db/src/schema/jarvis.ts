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

// ── Sprint 2 — operations layer ──────────────────────────────────────────────
// Task / Decision / Escalation / Approval management. All FKs resolve into the
// Sprint 1 registries and detach (set null) on parent delete so operational
// history is never destroyed by a registry edit.

export const jarvisTasksTable = pgTable("jarvis_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("todo"),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  projectId: uuid("project_id").references(() => jarvisProjectsTable.id, {
    onDelete: "set null",
  }),
  assigneeAgentId: uuid("assignee_agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  dueAt: timestamp("due_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisDecisionsTable = pgTable("jarvis_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  context: text("context"),
  decision: text("decision"),
  rationale: text("rationale"),
  status: varchar("status", { length: 32 }).notNull().default("proposed"),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  decidedBy: varchar("decided_by", { length: 255 }),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisEscalationsTable = pgTable("jarvis_escalations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  severity: varchar("severity", { length: 16 }).notNull().default("medium"),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  assigneeAgentId: uuid("assignee_agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisApprovalsTable = pgTable("jarvis_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  requestedBy: varchar("requested_by", { length: 255 }),
  decidedBy: varchar("decided_by", { length: 255 }),
  decidedAt: timestamp("decided_at"),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
export type JarvisTask = typeof jarvisTasksTable.$inferSelect;
export type InsertJarvisTask = typeof jarvisTasksTable.$inferInsert;
export type JarvisDecision = typeof jarvisDecisionsTable.$inferSelect;
export type InsertJarvisDecision = typeof jarvisDecisionsTable.$inferInsert;
export type JarvisEscalation = typeof jarvisEscalationsTable.$inferSelect;
export type InsertJarvisEscalation = typeof jarvisEscalationsTable.$inferInsert;
export type JarvisApproval = typeof jarvisApprovalsTable.$inferSelect;
export type InsertJarvisApproval = typeof jarvisApprovalsTable.$inferInsert;
