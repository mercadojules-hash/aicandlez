import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  real,
  index,
  uniqueIndex,
  vector,
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
  // ── Executive registry metadata (manual-entry, advisory) ───────────────────
  // Optional CEO-set display values for the executive briefing / business
  // registry. NULL → rendered as a dash. AICandlez performance is sourced live
  // from the read-only trading feed instead of these columns. Never fabricated.
  monthlyRevenue: real("monthly_revenue"),
  healthStatus: varchar("health_status", { length: 32 }),
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

// A single declarative step in a workflow definition DAG. `dependsOn` lists the
// `key`s of prerequisite steps; a step becomes ready when all of them succeed.
// `action`/`input` are passed into the target agent handler (deterministic,
// advisory-safe). `condition` is an optional advisory note (no eval at runtime).
export interface JarvisWorkflowStep {
  key: string;
  agentType: string;
  action: string;
  dependsOn: string[];
  input?: Record<string, unknown>;
  condition?: string;
}

export const jarvisWorkflowsTable = pgTable("jarvis_workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  trigger: varchar("trigger", { length: 120 }).notNull().default("manual"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  // ── Sprint 6 — workflow execution ──────────────────────────────────────────
  // definition holds the ordered step DAG; version bumps on edit; enabled gates
  // whether the workflow may be executed by the orchestrator.
  definition: jsonb("definition").$type<{ steps: JarvisWorkflowStep[] }>(),
  version: integer("version").notNull().default(1),
  enabled: boolean("enabled").notNull().default(false),
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
  // ── Sprint 6 — escalation chain binding ────────────────────────────────────
  // When bound to a chain, the orchestrator advances currentLevel on SLA timeout
  // (nextEscalationAt). Advisory only — never auto-resolves.
  chainId: uuid("chain_id").references((): AnyPgColumn => jarvisEscalationChainsTable.id, {
    onDelete: "set null",
  }),
  currentLevel: integer("current_level").notNull().default(0),
  nextEscalationAt: timestamp("next_escalation_at"),
  // ── Sprint 7 — governance hold state (pump skips while pending_approval) ────
  governanceState: varchar("governance_state", { length: 32 })
    .notNull()
    .default("none"),
  policyEvaluationId: uuid("policy_evaluation_id").references(
    (): AnyPgColumn => jarvisPolicyEvaluationsTable.id,
    { onDelete: "set null" },
  ),
  approvalId: uuid("approval_id").references(
    (): AnyPgColumn => jarvisApprovalsTable.id,
    { onDelete: "set null" },
  ),
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
  // ── Sprint 7 — governance linkage (auto-generated approvals pause a subject) ─
  policyId: uuid("policy_id").references((): AnyPgColumn => jarvisPoliciesTable.id, {
    onDelete: "set null",
  }),
  subjectType: varchar("subject_type", { length: 32 }),
  subjectId: uuid("subject_id"),
  autoGenerated: boolean("auto_generated").notNull().default(false),
  decisionReason: text("decision_reason"),
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
  // Repo-relative path when this asset was ingested from a source file (doc /
  // runbook ingestion). UNIQUE so re-ingestion upserts instead of duplicating;
  // Postgres permits many NULLs, so manual/free-form assets stay unconstrained.
  sourcePath: varchar("source_path", { length: 1024 }).unique(),
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
},
  (table) => [
    // One memory per (source_type, source_id) so source-linked mirrors (e.g.
    // business profiles, promoted findings) upsert atomically instead of racing
    // SELECT-then-INSERT into duplicates. NULL source pairs stay distinct
    // (Postgres default), so free-form memories are unconstrained.
    uniqueIndex("jarvis_memories_source_uq").on(
      table.sourceType,
      table.sourceId,
    ),
  ],
);

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
  // ── Sprint 8 cognition (additive, nullable) ──
  // sourceMode: "manual" (today's CRUD) vs "cognition" (LLM-synthesized draft).
  // cognitionRunId / citations / groundingScore link a reasoned draft back to the
  // immutable cognition run that produced it. Drafts are advisory; publish is the
  // governed action (D1). Weak/zero grounding → publish requires approval (D2).
  sourceMode: varchar("source_mode", { length: 32 }).notNull().default("manual"),
  cognitionRunId: uuid("cognition_run_id").references(
    () => jarvisCognitionRunsTable.id,
    { onDelete: "set null" },
  ),
  citations: jsonb("citations").$type<{ type: string; id: string }[]>(),
  groundingScore: integer("grounding_score"),
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

// ── Multi-Agent Orchestration Layer (Sprint 6) ───────────────────────────────
// Turns the Sprint 5 ticking agents into a coordinated orchestration layer:
// routing → delegation → workflow execution → escalation chains → executive
// commands. The orchestrator is pumped from the SAME single runtime tick (one
// loop, off by default, admin-gated) and is deterministic + advisory-safe. All
// FKs `onDelete:"set null"` + denormalized name snapshots so deleting a registry
// row never destroys orchestration history. Spec:
// `.local/docs/jarvis-orchestration-spec.md`.

// Execution ledger for a workflow definition. Snapshots the workflow name so the
// run survives a workflow delete. stepsTotal/stepsCompleted drive UI progress.
export const jarvisWorkflowRunsTable = pgTable("jarvis_workflow_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id").references(() => jarvisWorkflowsTable.id, {
    onDelete: "set null",
  }),
  workflowName: varchar("workflow_name", { length: 200 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  trigger: varchar("trigger", { length: 32 }).notNull().default("manual"),
  context: jsonb("context").$type<Record<string, unknown>>(),
  initiatedBy: varchar("initiated_by", { length: 255 }),
  stepsTotal: integer("steps_total").notNull().default(0),
  stepsCompleted: integer("steps_completed").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Per-step execution record within a workflow run. dependsOn is a snapshot of the
// definition step's prerequisite keys; the engine executes a step only once all
// of them are `succeeded`.
export const jarvisWorkflowStepsTable = pgTable("jarvis_workflow_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowRunId: uuid("workflow_run_id").references(() => jarvisWorkflowRunsTable.id, {
    onDelete: "set null",
  }),
  stepKey: varchar("step_key", { length: 120 }).notNull(),
  sequence: integer("sequence").notNull().default(0),
  agentId: uuid("agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  agentName: varchar("agent_name", { length: 200 }),
  agentType: varchar("agent_type", { length: 48 }),
  action: varchar("action", { length: 64 }),
  dependsOn: jsonb("depends_on").$type<string[]>(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  input: jsonb("input").$type<Record<string, unknown>>(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  error: text("error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
  // ── Sprint 7 — governance hold state (pump skips while pending_approval) ────
  governanceState: varchar("governance_state", { length: 32 })
    .notNull()
    .default("none"),
  policyEvaluationId: uuid("policy_evaluation_id").references(
    (): AnyPgColumn => jarvisPolicyEvaluationsTable.id,
    { onDelete: "set null" },
  ),
  approvalId: uuid("approval_id").references(() => jarvisApprovalsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A tracked unit of work one agent assigns to another (distinct from a
// fire-and-forget Sprint 5 message). Lifecycle: assigned → accepted →
// in_progress → completed | declined | expired.
export const jarvisDelegationsTable = pgTable("jarvis_delegations", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromAgentId: uuid("from_agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  fromAgentName: varchar("from_agent_name", { length: 200 }),
  toAgentId: uuid("to_agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  toAgentName: varchar("to_agent_name", { length: 200 }),
  taskId: uuid("task_id").references(() => jarvisTasksTable.id, {
    onDelete: "set null",
  }),
  workflowRunId: uuid("workflow_run_id").references(() => jarvisWorkflowRunsTable.id, {
    onDelete: "set null",
  }),
  objective: varchar("objective", { length: 300 }).notNull(),
  action: varchar("action", { length: 64 }),
  input: jsonb("input").$type<Record<string, unknown>>(),
  status: varchar("status", { length: 32 }).notNull().default("assigned"),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  dueAt: timestamp("due_at"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  createdBy: varchar("created_by", { length: 255 }),
  // ── Sprint 7 — governance hold state (pump skips while pending_approval) ────
  governanceState: varchar("governance_state", { length: 32 })
    .notNull()
    .default("none"),
  policyEvaluationId: uuid("policy_evaluation_id").references(
    (): AnyPgColumn => jarvisPolicyEvaluationsTable.id,
    { onDelete: "set null" },
  ),
  approvalId: uuid("approval_id").references(() => jarvisApprovalsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Deterministic routing rule. The router keeps `enabled` rules whose
// matchType/matchValue predicate matches the input, orders by priority desc then
// createdAt,id, and takes the first; falls back to fallbackAgentType otherwise.
export const jarvisRoutingRulesTable = pgTable("jarvis_routing_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  matchType: varchar("match_type", { length: 32 }).notNull().default("any"),
  matchValue: varchar("match_value", { length: 200 }),
  targetAgentType: varchar("target_agent_type", { length: 48 }),
  targetAgentId: uuid("target_agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  chainId: uuid("chain_id").references((): AnyPgColumn => jarvisEscalationChainsTable.id, {
    onDelete: "set null",
  }),
  fallbackAgentType: varchar("fallback_agent_type", { length: 48 }),
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jarvisEscalationChainsTable = pgTable("jarvis_escalation_chains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// An ordered level within an escalation chain. slaSeconds is how long the
// orchestrator waits at this level before advancing to the next.
export const jarvisEscalationChainStepsTable = pgTable(
  "jarvis_escalation_chain_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainId: uuid("chain_id").references(() => jarvisEscalationChainsTable.id, {
      onDelete: "set null",
    }),
    level: integer("level").notNull().default(0),
    sequence: integer("sequence").notNull().default(0),
    agentType: varchar("agent_type", { length: 48 }),
    agentId: uuid("agent_id").references(() => jarvisAgentsTable.id, {
      onDelete: "set null",
    }),
    slaSeconds: integer("sla_seconds").notNull().default(3600),
    notifyRole: varchar("notify_role", { length: 32 }),
    instruction: text("instruction"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

// Executive command queue. An admin issues a command; the orchestrator routes it
// (router) then dispatches it as a direct agent run, a delegation, or a workflow
// run. Only a fixed registry of advisory-safe verbs is accepted.
export const jarvisCommandsTable = pgTable("jarvis_commands", {
  id: uuid("id").primaryKey().defaultRandom(),
  commandText: varchar("command_text", { length: 500 }).notNull(),
  verb: varchar("verb", { length: 64 }),
  args: jsonb("args").$type<Record<string, unknown>>(),
  issuedBy: varchar("issued_by", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull().default("received"),
  routedAgentType: varchar("routed_agent_type", { length: 48 }),
  routingRuleId: uuid("routing_rule_id").references(() => jarvisRoutingRulesTable.id, {
    onDelete: "set null",
  }),
  workflowRunId: uuid("workflow_run_id").references(() => jarvisWorkflowRunsTable.id, {
    onDelete: "set null",
  }),
  delegationId: uuid("delegation_id").references(() => jarvisDelegationsTable.id, {
    onDelete: "set null",
  }),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  // ── Sprint 7 — governance hold state (pump skips while pending_approval) ────
  governanceState: varchar("governance_state", { length: 32 })
    .notNull()
    .default("none"),
  policyEvaluationId: uuid("policy_evaluation_id").references(
    (): AnyPgColumn => jarvisPolicyEvaluationsTable.id,
    { onDelete: "set null" },
  ),
  approvalId: uuid("approval_id").references(() => jarvisApprovalsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type JarvisWorkflowRun = typeof jarvisWorkflowRunsTable.$inferSelect;
export type InsertJarvisWorkflowRun = typeof jarvisWorkflowRunsTable.$inferInsert;
export type JarvisWorkflowStepRow = typeof jarvisWorkflowStepsTable.$inferSelect;
export type InsertJarvisWorkflowStepRow = typeof jarvisWorkflowStepsTable.$inferInsert;
export type JarvisDelegation = typeof jarvisDelegationsTable.$inferSelect;
export type InsertJarvisDelegation = typeof jarvisDelegationsTable.$inferInsert;
export type JarvisRoutingRule = typeof jarvisRoutingRulesTable.$inferSelect;
export type InsertJarvisRoutingRule = typeof jarvisRoutingRulesTable.$inferInsert;
export type JarvisEscalationChain = typeof jarvisEscalationChainsTable.$inferSelect;
export type InsertJarvisEscalationChain =
  typeof jarvisEscalationChainsTable.$inferInsert;
export type JarvisEscalationChainStep =
  typeof jarvisEscalationChainStepsTable.$inferSelect;
export type InsertJarvisEscalationChainStep =
  typeof jarvisEscalationChainStepsTable.$inferInsert;
export type JarvisCommand = typeof jarvisCommandsTable.$inferSelect;
export type InsertJarvisCommand = typeof jarvisCommandsTable.$inferInsert;

// ── Sprint 7 — Governance, Policy & Trust Layer ──────────────────────────────
// A deterministic policy layer that gates every orchestration action (command,
// delegation, workflow step, escalation) BEFORE it executes. Advisory-safe:
// governance can only NARROW agent authority, never widen it. Off by default;
// rides the single runtime tick. Spec: .local/docs/jarvis-governance-spec.md.

// Declarative governance rule. The policy engine keeps `enabled` policies whose
// scope matches the subject and resolves by effect precedence
// (deny > require_approval > allow), then priority, then scope specificity, then
// createdAt,id. Default = allow when nothing matches.
export const jarvisPoliciesTable = pgTable("jarvis_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  scopeType: varchar("scope_type", { length: 32 }).notNull().default("global"),
  scopeValue: varchar("scope_value", { length: 200 }),
  effect: varchar("effect", { length: 32 }).notNull().default("allow"),
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
  conditions: jsonb("conditions").$type<Record<string, unknown>>(),
  requireApprovalRole: varchar("require_approval_role", { length: 32 })
    .notNull()
    .default("admin"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Immutable audit row for every governance decision. History-safe: the policy FK
// detaches (set null) on delete but the name snapshot + decision are preserved.
export const jarvisPolicyEvaluationsTable = pgTable("jarvis_policy_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyId: uuid("policy_id").references(() => jarvisPoliciesTable.id, {
    onDelete: "set null",
  }),
  policyName: varchar("policy_name", { length: 200 }),
  subjectType: varchar("subject_type", { length: 32 }).notNull(),
  subjectId: uuid("subject_id"),
  agentType: varchar("agent_type", { length: 48 }),
  action: varchar("action", { length: 64 }),
  decision: varchar("decision", { length: 32 }).notNull(),
  reason: text("reason"),
  approvalId: uuid("approval_id").references(() => jarvisApprovalsTable.id, {
    onDelete: "set null",
  }),
  trustScoreAtEval: integer("trust_score_at_eval"),
  budgetSnapshot: jsonb("budget_snapshot").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Deterministic per-agent reliability score (0–100) derived from run history.
// One row per agent, upserted by the governance-maintain pass.
export const jarvisAgentTrustTable = pgTable("jarvis_agent_trust", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => jarvisAgentsTable.id, {
    onDelete: "set null",
  }),
  agentName: varchar("agent_name", { length: 200 }),
  agentType: varchar("agent_type", { length: 48 }),
  score: integer("score").notNull().default(100),
  totalRuns: integer("total_runs").notNull().default(0),
  successfulRuns: integer("successful_runs").notNull().default(0),
  failedRuns: integer("failed_runs").notNull().default(0),
  deniedActions: integer("denied_actions").notNull().default(0),
  approvedActions: integer("approved_actions").notNull().default(0),
  windowStartedAt: timestamp("window_started_at").defaultNow(),
  lastComputedAt: timestamp("last_computed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Quota / rate-limit definition + live consumption. Deterministic window reset:
// windowStartedAt + windowSeconds <= now ⇒ consumed resets to 0.
export const jarvisBudgetsTable = pgTable("jarvis_budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  scopeType: varchar("scope_type", { length: 32 }).notNull().default("global"),
  scopeValue: varchar("scope_value", { length: 200 }),
  limitCount: integer("limit_count").notNull().default(0),
  windowSeconds: integer("window_seconds").notNull().default(3600),
  consumed: integer("consumed").notNull().default(0),
  windowStartedAt: timestamp("window_started_at").defaultNow(),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type JarvisPolicy = typeof jarvisPoliciesTable.$inferSelect;
export type InsertJarvisPolicy = typeof jarvisPoliciesTable.$inferInsert;
export type JarvisPolicyEvaluation =
  typeof jarvisPolicyEvaluationsTable.$inferSelect;
export type InsertJarvisPolicyEvaluation =
  typeof jarvisPolicyEvaluationsTable.$inferInsert;
export type JarvisAgentTrust = typeof jarvisAgentTrustTable.$inferSelect;
export type InsertJarvisAgentTrust = typeof jarvisAgentTrustTable.$inferInsert;
export type JarvisBudget = typeof jarvisBudgetsTable.$inferSelect;
export type InsertJarvisBudget = typeof jarvisBudgetsTable.$inferInsert;

// ── Cognition Layer (Sprint 8) ───────────────────────────────────────────────
// jarvis_cognition_runs is the IMMUTABLE audit ledger of every LLM advisory call.
// The model lives on the content plane: it PROPOSES, it never acts. Each row
// captures exactly what the model saw (promptHash + retrievedRefs), what it
// returned (rawOutput + parsedProposal), cost/latency, and a status. This is the
// reproducibility + observability backbone. No updatedAt — rows are never edited.
// Agent linkage is a denormalized snapshot (no FK) like jarvis_policy_evaluations.
export const jarvisCognitionRunsTable = pgTable("jarvis_cognition_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: varchar("kind", { length: 48 }).notNull(),
  agentId: uuid("agent_id"),
  agentType: varchar("agent_type", { length: 48 }),
  model: varchar("model", { length: 120 }),
  params: jsonb("params").$type<Record<string, unknown>>(),
  promptHash: varchar("prompt_hash", { length: 64 }),
  retrievedRefs: jsonb("retrieved_refs").$type<{ type: string; id: string }[]>(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costMicros: integer("cost_micros").notNull().default(0),
  latencyMs: integer("latency_ms"),
  status: varchar("status", { length: 32 }).notNull().default("ok"),
  groundingScore: integer("grounding_score"),
  rawOutput: text("raw_output"),
  parsedProposal: jsonb("parsed_proposal").$type<Record<string, unknown>>(),
  error: text("error"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type JarvisCognitionRun = typeof jarvisCognitionRunsTable.$inferSelect;
export type InsertJarvisCognitionRun =
  typeof jarvisCognitionRunsTable.$inferInsert;

// ── Semantic Retrieval (Sprint 9) ────────────────────────────────────────────
// `jarvis_embeddings` is a DERIVED READ INDEX maintained by the deterministic
// control plane (indexer/backfill) — NOT corpus data and NOT a cognition
// effector. The managed AI proxy only COMPUTES the vector; this row is written
// by deterministic code and never alters any source `jarvis_` row. Upsert-only,
// keyed by (subjectType, subjectId, model) + a contentHash so unchanged rows are
// skipped (honors the no-delete invariant: re-embed UPDATES in place). businessId
// + createdBy are denormalized so personalized/org-scoped semantic pre-filtering
// never joins back to the source row. Locked S9 model: OpenAI
// text-embedding-3-small (1536 dims), cosine distance, HNSW ANN index.
// Spec: `.local/docs/jarvis-semantic-retrieval-architecture.md` §2.
export const JARVIS_EMBEDDING_DIMS = 1536;

export const jarvisEmbeddingsTable = pgTable(
  "jarvis_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: varchar("subject_type", { length: 64 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    dims: integer("dims").notNull().default(JARVIS_EMBEDDING_DIMS),
    embedding: vector("embedding", { dimensions: JARVIS_EMBEDDING_DIMS }).notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    createdBy: varchar("created_by", { length: 255 }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("jarvis_embeddings_subject_model_uq").on(
      table.subjectType,
      table.subjectId,
      table.model,
    ),
    index("jarvis_embeddings_business_idx").on(table.businessId),
    index("jarvis_embeddings_created_by_idx").on(table.createdBy),
    index("jarvis_embeddings_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export type JarvisEmbedding = typeof jarvisEmbeddingsTable.$inferSelect;
export type InsertJarvisEmbedding = typeof jarvisEmbeddingsTable.$inferInsert;

// ── Voice Interface (Voice v1) ───────────────────────────────────────────────
// Voice is an I/O modality, NOT an authority layer: STT/TTS are side-effect-free
// transducers on the content plane; the deterministic control plane owns intent
// routing and every read/draft call; the model only PROPOSES; PUBLISH stays
// governed (unchanged S8 path). These two tables are the ONLY persistence voice
// adds. PRIVACY INVARIANT: transcripts are stored as text; raw audio is NEVER
// persisted (no audio columns). History-safe: FKs detach (set null) on parent
// delete + denormalized identity snapshots, so deleting a session/run never
// destroys turn history. OFF by default + admin-gated upstream
// (`cognition.voice.enabled`). Spec: `.local/docs/jarvis-voice-architecture.md`
// §5; plan: `.local/docs/jarvis-voice-plan.md` (V1).

// A push-to-talk, turn-based conversation. Working memory for multi-turn context
// is assembled from this session's recent turns (S9 token-budget assembly);
// nothing here is promoted to the durable corpus (that is deferred to S11/S12).
export const jarvisVoiceSessionsTable = pgTable(
  "jarvis_voice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    // Identity snapshot (Clerk user id + email at session start) — denormalized so
    // history survives even if the user record changes. Voice is admin-gated.
    createdBy: varchar("created_by", { length: 255 }),
    userEmail: varchar("user_email", { length: 320 }),
    turnCount: integer("turn_count").notNull().default(0),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    lastTurnAt: timestamp("last_turn_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_voice_sessions_created_by_idx").on(table.createdBy),
    index("jarvis_voice_sessions_status_idx").on(table.status),
  ],
);

// One PTT exchange: spoken request (transcript) → resolved intent/capability →
// advisory readback text. `intent` is one of the 7 v1 capabilities or a control
// outcome (`clarify`/`reject`/`unknown`) — voice issues NO state-changing
// command in v1. `cognitionRunId` links a reasoned draft (briefing/report) back
// to the immutable cognition ledger. `links` cites the read entities surfaced to
// the executive. NO audio columns by design.
export const jarvisVoiceTurnsTable = pgTable(
  "jarvis_voice_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(
      () => jarvisVoiceSessionsTable.id,
      { onDelete: "set null" },
    ),
    turnIndex: integer("turn_index").notNull().default(0),
    // STT output. transcriptConfidence is a 0–100 integer (null when unknown).
    transcript: text("transcript"),
    transcriptConfidence: integer("transcript_confidence"),
    // Deterministic routing outcome.
    intent: varchar("intent", { length: 64 }),
    intentConfidence: integer("intent_confidence"),
    capability: varchar("capability", { length: 64 }),
    // Advisory spoken-back text (the model PROPOSES; never acts).
    replyText: text("reply_text"),
    // Whether TTS audio was produced for this turn — the audio itself is NOT
    // stored (privacy invariant); false ⇒ text-only fallback was served.
    ttsOk: boolean("tts_ok").notNull().default(false),
    status: varchar("status", { length: 32 }).notNull().default("ok"),
    error: text("error"),
    cognitionRunId: uuid("cognition_run_id").references(
      () => jarvisCognitionRunsTable.id,
      { onDelete: "set null" },
    ),
    links: jsonb("links").$type<{ type: string; id: string }[]>(),
    costMicros: integer("cost_micros").notNull().default(0),
    latencyMs: integer("latency_ms"),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_voice_turns_session_idx").on(table.sessionId),
    index("jarvis_voice_turns_created_at_idx").on(table.createdAt),
  ],
);

export type JarvisVoiceSession = typeof jarvisVoiceSessionsTable.$inferSelect;
export type InsertJarvisVoiceSession =
  typeof jarvisVoiceSessionsTable.$inferInsert;
export type JarvisVoiceTurn = typeof jarvisVoiceTurnsTable.$inferSelect;
export type InsertJarvisVoiceTurn = typeof jarvisVoiceTurnsTable.$inferInsert;

// ── Operational Control Layer (Phase 1 — read-only visibility foundation) ─────
// Per-business operational dossier: the systems Jarvis must understand how to
// build, deploy, run, monitor, and recover. Everything here is manual-entry +
// (for repos) live read-only synced; NULL → dash in the UI, never fabricated.
// Fully isolated jarvis_ tables. Removing a system cascades to its repos +
// runbooks; business detach is set-null so operational history survives a
// registry edit. Phase 2/3 (approval-gated + autonomous ops) reuse the existing
// governance spine — these tables only capture knowledge + read-only awareness.

export const jarvisSystemsTable = pgTable(
  "jarvis_systems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    // web | api | mobile | service | infra | data | other
    kind: varchar("kind", { length: 32 }).notNull().default("service"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    description: text("description"),
    // Narrative dossier aspects (manual-entry, advisory; NULL → dash).
    architecture: text("architecture"),
    infrastructure: text("infrastructure"),
    buildProcess: text("build_process"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("jarvis_systems_business_idx").on(table.businessId)],
);

export const jarvisRepositoriesTable = pgTable(
  "jarvis_repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    systemId: uuid("system_id").references(() => jarvisSystemsTable.id, {
      onDelete: "cascade",
    }),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 32 }).notNull().default("github"),
    // owner/repo for GitHub; free-form locator for other providers.
    fullName: varchar("full_name", { length: 320 }).notNull(),
    url: text("url"),
    defaultBranch: varchar("default_branch", { length: 160 }),
    description: text("description"),
    // ── Live read-only awareness cache (written by the GitHub sync; NULL until
    // connected/synced → dash). Jarvis NEVER writes to the remote repo.
    lastCommitSha: varchar("last_commit_sha", { length: 64 }),
    lastCommitMessage: text("last_commit_message"),
    lastCommitAuthor: varchar("last_commit_author", { length: 200 }),
    lastCommitAt: timestamp("last_commit_at"),
    openPrCount: integer("open_pr_count"),
    lastWorkflowStatus: varchar("last_workflow_status", { length: 48 }),
    lastWorkflowConclusion: varchar("last_workflow_conclusion", { length: 48 }),
    lastSyncedAt: timestamp("last_synced_at"),
    syncError: text("sync_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_repositories_system_idx").on(table.systemId),
    index("jarvis_repositories_business_idx").on(table.businessId),
  ],
);

export const jarvisRunbooksTable = pgTable(
  "jarvis_runbooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    systemId: uuid("system_id").references(() => jarvisSystemsTable.id, {
      onDelete: "cascade",
    }),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 240 }).notNull(),
    // deployment | rollback | update | monitoring | operational |
    // disaster_recovery | other
    kind: varchar("kind", { length: 32 }).notNull().default("operational"),
    content: text("content"),
    // Repo-relative path when mirrored from an ingested source file. UNIQUE so
    // re-ingestion upserts; NULL for manually authored runbooks (many allowed).
    sourcePath: varchar("source_path", { length: 1024 }).unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("jarvis_runbooks_system_idx").on(table.systemId)],
);

export type JarvisSystem = typeof jarvisSystemsTable.$inferSelect;
export type InsertJarvisSystem = typeof jarvisSystemsTable.$inferInsert;
export type JarvisRepository = typeof jarvisRepositoriesTable.$inferSelect;
export type InsertJarvisRepository = typeof jarvisRepositoriesTable.$inferInsert;
export type JarvisRunbook = typeof jarvisRunbooksTable.$inferSelect;
export type InsertJarvisRunbook = typeof jarvisRunbooksTable.$inferInsert;

// ── Historical Intelligence Layer (read-only AICandlez analytics) ────────────
// Durable, jarvis-owned history of platform performance so the executive layer
// can compare periods, explain win-rate / P&L drift, and chart account growth.
// EVERY value here is derived from a strictly read-only, LIVE-only
// (exchange IS NOT NULL AND reconciliation_tag IS NULL) aggregate over the
// AICandlez trade tables — Jarvis NEVER writes those tables and imports NO
// execution modules. Paper/simulated fills are excluded by construction.
//
// `jarvis_aicandlez_daily_snapshots`: one immutable cumulative-as-of-day row per
// UTC date (idempotent upsert on `snapshot_date`). The growth curve = the
// `cumulativeRealizedPnlUsd` series across snapshots; a true equity baseline is
// manual-entry-only upstream (never auto-reconstructed) so headline equity stays
// NULL → dash here. A daily delta is derivable by diffing consecutive rows.

export const jarvisAicandlezDailySnapshotsTable = pgTable(
  "jarvis_aicandlez_daily_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // UTC calendar day (YYYY-MM-DD). Unique → one snapshot per day, upsert-safe.
    snapshotDate: varchar("snapshot_date", { length: 10 }).notNull().unique(),
    // Cumulative-as-of-day LIVE realized stats (all-time through this date).
    closedTrades: integer("closed_trades").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    // 0..1 (NULL when no decided trades → dash).
    winRate: real("win_rate"),
    cumulativeRealizedPnlUsd: real("cumulative_realized_pnl_usd")
      .notNull()
      .default(0),
    grossProfitUsd: real("gross_profit_usd").notNull().default(0),
    grossLossUsd: real("gross_loss_usd").notNull().default(0),
    // gross_profit / gross_loss (NULL when no losses yet → dash).
    profitFactor: real("profit_factor"),
    // Open LIVE positions snapshot at capture time. Point-in-time only — NULL
    // for backfilled historical days (non-reconstructable) and when the open-
    // position read fails (→ dash, never fabricated as 0).
    activeTrades: integer("active_trades"),
    openTradeValueUsd: real("open_trade_value_usd"),
    // True when the read failed and the row was written degraded (all dashes).
    degraded: boolean("degraded").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_aicandlez_daily_snapshots_date_idx").on(table.snapshotDate),
  ],
);

// `jarvis_reports`: a generated executive report run. `data` holds the fully
// computed, deterministic payload (period stats, period comparison, change /
// subscription event digest, snapshot trend). `narrative` is an OPTIONAL,
// grounded cognition synthesis (advisory; cites the same data) linked to the
// immutable cognition ledger via `cognition_run_id`. NULL narrative → the
// deterministic data still stands on its own.
export const jarvisReportsTable = pgTable(
  "jarvis_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(
      () => jarvisBusinessesTable.id,
      { onDelete: "set null" },
    ),
    title: varchar("title", { length: 240 }).notNull(),
    // executive_summary | period_comparison | growth | other
    reportType: varchar("report_type", { length: 32 })
      .notNull()
      .default("executive_summary"),
    // Primary + optional comparison windows (UTC YYYY-MM-DD; NULL = open-ended).
    periodStart: varchar("period_start", { length: 10 }),
    periodEnd: varchar("period_end", { length: 10 }),
    comparePeriodStart: varchar("compare_period_start", { length: 10 }),
    comparePeriodEnd: varchar("compare_period_end", { length: 10 }),
    // Deterministic computed payload (period stats, comparison, events, trend).
    data: jsonb("data").$type<Record<string, unknown>>(),
    // Optional grounded cognition narrative (advisory; NULL → dash).
    narrative: text("narrative"),
    cognitionRunId: uuid("cognition_run_id").references(
      () => jarvisCognitionRunsTable.id,
      { onDelete: "set null" },
    ),
    // 0..100 grounding score from the cognition run (NULL when no narrative).
    groundingScore: integer("grounding_score"),
    status: varchar("status", { length: 32 }).notNull().default("complete"),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_reports_business_idx").on(table.businessId),
    index("jarvis_reports_created_at_idx").on(table.createdAt),
    index("jarvis_reports_type_idx").on(table.reportType),
  ],
);

export type JarvisAicandlezDailySnapshot =
  typeof jarvisAicandlezDailySnapshotsTable.$inferSelect;
export type InsertJarvisAicandlezDailySnapshot =
  typeof jarvisAicandlezDailySnapshotsTable.$inferInsert;
export type JarvisReport = typeof jarvisReportsTable.$inferSelect;
export type InsertJarvisReport = typeof jarvisReportsTable.$inferInsert;

// ── Minimum Sovereignty Layer (read-only operational awareness) ──────────────
// jarvis-owned registries so Jarvis can understand the infrastructure,
// credentials (METADATA ONLY — never a value), hosting, and source code that
// run the managed businesses, without depending on Replit as the primary source
// of knowledge. Every table is advisory + read-mirror; Jarvis NEVER acts on the
// underlying systems from here. NULL → dash; nothing is fabricated.

// `jarvis_infra_resources`: domains, DNS, databases, hosting, APIs, and external
// services. Free-form, manual-or-mirror-populated. `dependsOn` is a list of
// human-readable dependency labels (other resources / systems).
export const jarvisInfraResourcesTable = pgTable(
  "jarvis_infra_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    systemId: uuid("system_id").references(() => jarvisSystemsTable.id, {
      onDelete: "set null",
    }),
    // domain | dns | database | hosting | api | external_service | other
    resourceType: varchar("resource_type", { length: 32 })
      .notNull()
      .default("other"),
    name: varchar("name", { length: 320 }).notNull(),
    provider: varchar("provider", { length: 160 }),
    purpose: text("purpose"),
    // Where it lives / dashboard or endpoint URL (NOT a secret).
    location: text("location"),
    dependsOn: jsonb("depends_on").$type<string[]>(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // One row per (type, name) → upsert-safe idempotent registration.
    uniqueIndex("jarvis_infra_resources_type_name_uq").on(
      table.resourceType,
      table.name,
    ),
    index("jarvis_infra_resources_business_idx").on(table.businessId),
  ],
);

// `jarvis_credentials`: awareness + dependency map for credentials.
// CRITICAL: there is NO value/secret column here, by design. We only track the
// NAME, purpose, storage location, and what depends on it. `present` is a
// read-only signal of whether an env var of this NAME currently exists in the
// process environment (keys only — values are never read into this table).
export const jarvisCredentialsTable = pgTable(
  "jarvis_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    systemId: uuid("system_id").references(() => jarvisSystemsTable.id, {
      onDelete: "set null",
    }),
    // Env var name / credential identifier (e.g. "STRIPE_SECRET_KEY").
    name: varchar("name", { length: 200 }).notNull().unique(),
    // api_key | secret | db_url | oauth | webhook | vault_key | other
    category: varchar("category", { length: 32 }).notNull().default("other"),
    purpose: text("purpose"),
    // e.g. "Replit Secrets", "Render env group", "CredentialVault (encrypted)".
    storageLocation: varchar("storage_location", { length: 200 }),
    dependentSystems: jsonb("dependent_systems").$type<string[]>(),
    // Read-only presence flag (NULL = unknown/never checked → dash). Never a value.
    present: boolean("present"),
    lastVerifiedAt: timestamp("last_verified_at"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_credentials_business_idx").on(table.businessId),
  ],
);

// `jarvis_render_services`: read-only cache of Render service + latest deploy
// awareness. Written by a GET-only sync (no deploy/restart/rollback). NULL until
// synced → dash. `raw` holds a sanitized projection (no env values).
export const jarvisRenderServicesTable = pgTable(
  "jarvis_render_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Render's stable service id (srv-...). Unique → upsert-safe.
    renderServiceId: varchar("render_service_id", { length: 120 })
      .notNull()
      .unique(),
    name: varchar("name", { length: 240 }),
    // web_service | static_site | private_service | background_worker | cron | pserv
    serviceType: varchar("service_type", { length: 48 }),
    env: varchar("env", { length: 48 }),
    region: varchar("region", { length: 48 }),
    repo: text("repo"),
    branch: varchar("branch", { length: 160 }),
    autoDeploy: boolean("auto_deploy"),
    suspended: varchar("suspended", { length: 32 }),
    dashboardUrl: text("dashboard_url"),
    serviceUrl: text("service_url"),
    // Latest deploy awareness.
    lastDeployId: varchar("last_deploy_id", { length: 120 }),
    lastDeployStatus: varchar("last_deploy_status", { length: 48 }),
    lastDeployCommit: varchar("last_deploy_commit", { length: 120 }),
    lastDeployCreatedAt: timestamp("last_deploy_created_at"),
    lastDeployFinishedAt: timestamp("last_deploy_finished_at"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp("last_synced_at"),
    syncError: text("sync_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_render_services_name_idx").on(table.name),
  ],
);

// `jarvis_code_files`: lexical index of repo source/build/config/doc files so
// Jarvis can explain where important code lives with file references AND reason
// from the actual source. Mirror of the filesystem at index time (idempotent on
// `path` via content hash). Stores a short summary + exported symbol names AND
// (Phase 1 code grounding) the file's raw text content (capped) so cognition can
// ground lexically on code. Files larger than the read cap remain metadata-only
// (`content` null). No secret VALUES are stored — real env files are never indexed.
export const jarvisCodeFilesTable = pgTable(
  "jarvis_code_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Repo-relative path. Unique → upsert-safe.
    path: varchar("path", { length: 1024 }).notNull().unique(),
    // Top-level artifact / lib (e.g. "api-server", "lib/db", "root").
    artifact: varchar("artifact", { length: 160 }),
    language: varchar("language", { length: 32 }),
    // source | build | config | doc | schema | style | other
    kind: varchar("kind", { length: 32 }).notNull().default("source"),
    sizeBytes: integer("size_bytes"),
    lineCount: integer("line_count"),
    summary: text("summary"),
    symbols: jsonb("symbols").$type<string[]>(),
    // Raw file text (capped at index time). Null for files over the read cap.
    content: text("content"),
    contentHash: varchar("content_hash", { length: 64 }),
    indexedAt: timestamp("indexed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_code_files_artifact_idx").on(table.artifact),
    index("jarvis_code_files_kind_idx").on(table.kind),
  ],
);

export type JarvisInfraResource = typeof jarvisInfraResourcesTable.$inferSelect;
export type InsertJarvisInfraResource =
  typeof jarvisInfraResourcesTable.$inferInsert;
export type JarvisCredential = typeof jarvisCredentialsTable.$inferSelect;
export type InsertJarvisCredential = typeof jarvisCredentialsTable.$inferInsert;
export type JarvisRenderService = typeof jarvisRenderServicesTable.$inferSelect;
export type InsertJarvisRenderService =
  typeof jarvisRenderServicesTable.$inferInsert;
export type JarvisCodeFile = typeof jarvisCodeFilesTable.$inferSelect;
export type InsertJarvisCodeFile = typeof jarvisCodeFilesTable.$inferInsert;

// ── Creative Intelligence Division (Phase 0) ─────────────────────────────────
// Three advisory tables powering the creative agents (Prometheus marketing,
// Vision images, Phoenix video). ADVISORY-ONLY + jarvis_-scoped: agents PROPOSE
// drafts; publication is the governed action (mirrors the briefing publish gate,
// decision D1) and never auto-posts anywhere. Binaries (Vision/Phoenix, later
// phases) live in object storage — the DB stores the key + metadata only, never
// the bytes and never a secret VALUE. Text drafts can be promoted into the
// knowledge corpus (text only) for memory writeback.

// One brand profile per business (businessId unique). Holds the durable brand
// system every creative draft is grounded against: palette, typography, voice,
// positioning, do/don't guardrails, and an optional logo object-storage key.
// FK cascades on business delete — a brand profile is a strict child of its
// business, not historical audit data.
export const jarvisBrandProfilesTable = pgTable(
  "jarvis_brand_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => jarvisBusinessesTable.id, { onDelete: "cascade" }),
    brandName: varchar("brand_name", { length: 200 }).notNull(),
    tagline: varchar("tagline", { length: 300 }),
    positioning: text("positioning"),
    targetAudience: text("target_audience"),
    voice: text("voice"),
    tone: varchar("tone", { length: 120 }),
    // [{ name?, hex }] — advisory palette. Never rendered as authority for the
    // live AICandlez UI tokens; this is the creative brief palette.
    palette: jsonb("palette").$type<{ name?: string; hex: string }[]>(),
    typography: jsonb("typography").$type<Record<string, unknown>>(),
    valueProps: jsonb("value_props").$type<string[]>(),
    keywords: jsonb("keywords").$type<string[]>(),
    // Brand guardrails — fed verbatim into every creative prompt.
    dos: jsonb("dos").$type<string[]>(),
    donts: jsonb("donts").$type<string[]>(),
    // Optional logo reference in object storage (set later by Vision / manual).
    logoStorageKey: varchar("logo_storage_key", { length: 1024 }),
    links: jsonb("links").$type<Record<string, string>>(),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("jarvis_brand_profiles_business_idx").on(table.businessId),
  ],
);

// A campaign is the container for a coordinated set of creative assets (strategy,
// calendar, ad concepts, briefs, schedule). sourceMode/cognitionRunId/citations/
// groundingScore mirror the briefing draft lineage so a reasoned campaign links
// back to its immutable cognition run. governanceState rides the same publish
// gate as assets. businessId detaches (set null) on business delete to preserve
// campaign history.
export const jarvisCreativeCampaignsTable = pgTable(
  "jarvis_creative_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    objective: text("objective"),
    channel: varchar("channel", { length: 64 }).notNull().default("multi"),
    audience: text("audience"),
    durationDays: integer("duration_days"),
    // Narrative strategy (markdown) synthesized by Prometheus.
    strategy: text("strategy"),
    // Structured plan: content calendar, social schedule, funnel, launch plan.
    schedule: jsonb("schedule").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    sourceMode: varchar("source_mode", { length: 32 })
      .notNull()
      .default("cognition"),
    cognitionRunId: uuid("cognition_run_id").references(
      () => jarvisCognitionRunsTable.id,
      { onDelete: "set null" },
    ),
    citations: jsonb("citations").$type<{ type: string; id: string }[]>(),
    groundingScore: integer("grounding_score"),
    governanceState: varchar("governance_state", { length: 32 })
      .notNull()
      .default("none"),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_creative_campaigns_business_idx").on(table.businessId),
    index("jarvis_creative_campaigns_status_idx").on(table.status),
  ],
);

// An individual creative artifact. `agent` records the producing agent
// (prometheus/vision/phoenix). `kind` is the artifact type (strategy/ad_concept/
// ad_copy/content_calendar/creative_brief/social_post/social_schedule/funnel_plan/
// launch_plan/image/video). Text lives in bodyText; binaries (images/video) live
// in object storage referenced by storageKey + mimeType (DB never holds bytes).
// Publication is governed: governanceState + approvalId mirror the briefing gate;
// status flips to "published" only on an allowed/approved decision. version +
// contentHash support regenerate-as-new-version (no destructive edits; rows are
// never deleted — archive instead).
export const jarvisCreativeAssetsTable = pgTable(
  "jarvis_creative_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => jarvisBusinessesTable.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(
      () => jarvisCreativeCampaignsTable.id,
      { onDelete: "set null" },
    ),
    agent: varchar("agent", { length: 48 }).notNull().default("prometheus"),
    kind: varchar("kind", { length: 48 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    prompt: text("prompt"),
    rationale: text("rationale"),
    bodyText: text("body_text"),
    storageKey: varchar("storage_key", { length: 1024 }),
    mimeType: varchar("mime_type", { length: 120 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    citations: jsonb("citations").$type<{ type: string; id: string }[]>(),
    groundingScore: integer("grounding_score"),
    sourceMode: varchar("source_mode", { length: 32 })
      .notNull()
      .default("cognition"),
    cognitionRunId: uuid("cognition_run_id").references(
      () => jarvisCognitionRunsTable.id,
      { onDelete: "set null" },
    ),
    governanceState: varchar("governance_state", { length: 32 })
      .notNull()
      .default("none"),
    approvalId: uuid("approval_id").references(() => jarvisApprovalsTable.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    publishedAt: timestamp("published_at"),
    contentHash: varchar("content_hash", { length: 64 }),
    version: integer("version").notNull().default(1),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("jarvis_creative_assets_campaign_idx").on(table.campaignId),
    index("jarvis_creative_assets_business_idx").on(table.businessId),
    index("jarvis_creative_assets_kind_idx").on(table.kind),
  ],
);

export type JarvisBrandProfile = typeof jarvisBrandProfilesTable.$inferSelect;
export type InsertJarvisBrandProfile =
  typeof jarvisBrandProfilesTable.$inferInsert;
export type JarvisCreativeCampaign =
  typeof jarvisCreativeCampaignsTable.$inferSelect;
export type InsertJarvisCreativeCampaign =
  typeof jarvisCreativeCampaignsTable.$inferInsert;
export type JarvisCreativeAsset = typeof jarvisCreativeAssetsTable.$inferSelect;
export type InsertJarvisCreativeAsset =
  typeof jarvisCreativeAssetsTable.$inferInsert;
