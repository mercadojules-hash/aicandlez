import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

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
  // ── Sprint 5 — runtime registry expansion ──────────────────────────────────
  // agentType keys the runtime handler (chief_of_staff/operations/risk/memory/
  // qa/custom). capabilities + config are advisory metadata. enabled gates the
  // scheduler; scheduleSeconds=null means manual-only. runtimeStatus + lastRun*
  // are written by the runtime, not by users.
  agentType: varchar("agent_type", { length: 48 }).notNull().default("custom"),
  capabilities: jsonb("capabilities").$type<string[]>(),
  config: jsonb("config").$type<Record<string, unknown>>(),
  enabled: boolean("enabled").notNull().default(false),
  scheduleSeconds: integer("schedule_seconds"),
  priority: integer("priority").notNull().default(100),
  runtimeStatus: varchar("runtime_status", { length: 32 }).notNull().default("idle"),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: varchar("last_run_status", { length: 32 }),
  lastError: text("last_error"),
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

// ── Sprint 3 — memory & knowledge layer ──────────────────────────────────────
// Executive Memory, Knowledge Repository (assets), Knowledge Categories
// (hierarchical taxonomy), and Knowledge Relationships (typed graph edges).
// Relationships are polymorphic (node type + uuid) so any Jarvis node can link to
// any other; endpoint existence is validated in the route layer, mirroring the
// audit-log polymorphic pattern. Category/business FKs detach (set null) on
// parent delete so the memory corpus is never destroyed by a registry edit.

export const jarvisKnowledgeCategoriesTable = pgTable("jarvis_knowledge_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  description: text("description"),
  color: varchar("color", { length: 32 }),
  parentId: uuid("parent_id").references(
    (): AnyPgColumn => jarvisKnowledgeCategoriesTable.id,
    { onDelete: "set null" },
  ),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisKnowledgeAssetsTable = pgTable("jarvis_knowledge_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  summary: text("summary"),
  content: text("content"),
  assetType: varchar("asset_type", { length: 32 }).notNull().default("document"),
  sourceUrl: varchar("source_url", { length: 2048 }),
  categoryId: uuid("category_id").references(() => jarvisKnowledgeCategoriesTable.id, {
    onDelete: "set null",
  }),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  tags: jsonb("tags").$type<string[]>(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisMemoriesTable = pgTable("jarvis_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content"),
  memoryType: varchar("memory_type", { length: 32 }).notNull().default("fact"),
  importance: varchar("importance", { length: 16 }).notNull().default("normal"),
  categoryId: uuid("category_id").references(() => jarvisKnowledgeCategoriesTable.id, {
    onDelete: "set null",
  }),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  sourceType: varchar("source_type", { length: 64 }),
  sourceId: varchar("source_id", { length: 255 }),
  pinned: boolean("pinned").notNull().default(false),
  tags: jsonb("tags").$type<string[]>(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisKnowledgeRelationshipsTable = pgTable("jarvis_knowledge_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceType: varchar("source_type", { length: 64 }).notNull(),
  sourceId: uuid("source_id").notNull(),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: uuid("target_id").notNull(),
  relationType: varchar("relation_type", { length: 48 }).notNull().default("relates_to"),
  note: text("note"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Executive Intelligence Layer (Sprint 4) ──────────────────────────────────
// Findings → Recommendations → Insights → Briefings. All `jarvis_`-prefixed and
// isolated from the AICandlez surfaces. FKs use `onDelete: "set null"` so the
// intelligence corpus survives registry edits.

export const jarvisFindingsTable = pgTable("jarvis_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  summary: text("summary"),
  detail: text("detail"),
  category: varchar("category", { length: 64 }).notNull().default("general"),
  severity: varchar("severity", { length: 16 }).notNull().default("medium"),
  confidence: integer("confidence").notNull().default(50),
  source: varchar("source", { length: 255 }),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  projectId: uuid("project_id").references(() => jarvisProjectsTable.id, {
    onDelete: "set null",
  }),
  tags: jsonb("tags").$type<string[]>(),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisRecommendationsTable = pgTable("jarvis_recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  rationale: text("rationale"),
  action: text("action"),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  impact: varchar("impact", { length: 16 }).notNull().default("medium"),
  effort: varchar("effort", { length: 16 }).notNull().default("medium"),
  findingId: uuid("finding_id").references(() => jarvisFindingsTable.id, {
    onDelete: "set null",
  }),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  tags: jsonb("tags").$type<string[]>(),
  status: varchar("status", { length: 32 }).notNull().default("proposed"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisInsightsTable = pgTable("jarvis_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content"),
  insightType: varchar("insight_type", { length: 32 }).notNull().default("trend"),
  confidence: integer("confidence").notNull().default(50),
  source: varchar("source", { length: 255 }),
  findingId: uuid("finding_id").references(() => jarvisFindingsTable.id, {
    onDelete: "set null",
  }),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  tags: jsonb("tags").$type<string[]>(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisBriefingsTable = pgTable("jarvis_briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  summary: text("summary"),
  content: text("content"),
  period: varchar("period", { length: 32 }).notNull().default("weekly"),
  audience: varchar("audience", { length: 64 }).notNull().default("executive"),
  businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
    onDelete: "set null",
  }),
  publishedAt: timestamp("published_at"),
  tags: jsonb("tags").$type<string[]>(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Agent Runtime & Coordination Layer (Sprint 5) ────────────────────────────
// jarvis_agent_runs is the execution ledger written by the runtime each time an
// agent ticks (scheduled/manual/coordinated). jarvis_agent_messages is the
// Communication Protocol in software — typed messages between agents
// (request/response/notify/handoff/escalation). Both keep history via
// `onDelete: "set null"` + denormalized name snapshots so deleting an agent from
// the registry never destroys its run/coordination history.

export const jarvisAgentRunsTable = pgTable("jarvis_agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  agentName: varchar("agent_name", { length: 200 }),
  agentType: varchar("agent_type", { length: 48 }),
  trigger: varchar("trigger", { length: 32 }).notNull().default("scheduled"),
  status: varchar("status", { length: 32 }).notNull().default("running"),
  summary: text("summary"),
  output: jsonb("output").$type<Record<string, unknown>>(),
  itemsProcessed: integer("items_processed").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
});

export const jarvisAgentMessagesTable = pgTable("jarvis_agent_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromAgentId: uuid("from_agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  fromAgentName: varchar("from_agent_name", { length: 200 }),
  toAgentId: uuid("to_agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  toAgentName: varchar("to_agent_name", { length: 200 }),
  runId: uuid("run_id").references(() => jarvisAgentRunsTable.id, {
    onDelete: "set null",
  }),
  messageType: varchar("message_type", { length: 32 }).notNull().default("notify"),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
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
export type JarvisKnowledgeCategory = typeof jarvisKnowledgeCategoriesTable.$inferSelect;
export type InsertJarvisKnowledgeCategory =
  typeof jarvisKnowledgeCategoriesTable.$inferInsert;
export type JarvisKnowledgeAsset = typeof jarvisKnowledgeAssetsTable.$inferSelect;
export type InsertJarvisKnowledgeAsset = typeof jarvisKnowledgeAssetsTable.$inferInsert;
export type JarvisMemory = typeof jarvisMemoriesTable.$inferSelect;
export type InsertJarvisMemory = typeof jarvisMemoriesTable.$inferInsert;
export type JarvisKnowledgeRelationship =
  typeof jarvisKnowledgeRelationshipsTable.$inferSelect;
export type InsertJarvisKnowledgeRelationship =
  typeof jarvisKnowledgeRelationshipsTable.$inferInsert;
export type JarvisFinding = typeof jarvisFindingsTable.$inferSelect;
export type InsertJarvisFinding = typeof jarvisFindingsTable.$inferInsert;
export type JarvisRecommendation = typeof jarvisRecommendationsTable.$inferSelect;
export type InsertJarvisRecommendation =
  typeof jarvisRecommendationsTable.$inferInsert;
export type JarvisInsight = typeof jarvisInsightsTable.$inferSelect;
export type InsertJarvisInsight = typeof jarvisInsightsTable.$inferInsert;
export type JarvisBriefing = typeof jarvisBriefingsTable.$inferSelect;
export type InsertJarvisBriefing = typeof jarvisBriefingsTable.$inferInsert;
export type JarvisAgentRun = typeof jarvisAgentRunsTable.$inferSelect;
export type InsertJarvisAgentRun = typeof jarvisAgentRunsTable.$inferInsert;
export type JarvisAgentMessage = typeof jarvisAgentMessagesTable.$inferSelect;
export type InsertJarvisAgentMessage = typeof jarvisAgentMessagesTable.$inferInsert;
