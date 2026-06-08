/**
 * Jarvis Vault table registry — the single source of truth for WHAT the vault
 * captures and in WHAT ORDER it is safe to restore.
 *
 * Entries are listed in DEPENDENCY (topological) order: a table never appears
 * before a table it references, so a clean restore can INSERT forward and DELETE
 * in reverse without violating foreign keys. Each entry also declares its known
 * intra-namespace FK columns so the validation framework can prove referential
 * integrity WITHIN a package (orphan detection), and marks the embedding /
 * storageKey carriers so the engine handles pgvector + object-storage pointers.
 *
 * ADDITIVE-ONLY / jarvis_ ONLY: this registry references nothing outside the
 * jarvis_ namespace. Adding a new jarvis_ table = add one ordered entry here.
 */
import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  jarvisBusinessesTable,
  jarvisAgentsTable,
  jarvisWorkflowsTable,
  jarvisSettingsTable,
  jarvisAuditLogsTable,
  jarvisKnowledgeCategoriesTable,
  jarvisPoliciesTable,
  jarvisEscalationChainsTable,
  jarvisCognitionRunsTable,
  jarvisCodeFilesTable,
  jarvisRenderServicesTable,
  jarvisAicandlezDailySnapshotsTable,
  jarvisBudgetsTable,
  jarvisSystemsTable,
  jarvisProjectsTable,
  jarvisBrandProfilesTable,
  jarvisAgentTrustTable,
  jarvisAgentRunsTable,
  jarvisEscalationChainStepsTable,
  jarvisRepositoriesTable,
  jarvisRunbooksTable,
  jarvisInfraResourcesTable,
  jarvisCredentialsTable,
  jarvisKnowledgeAssetsTable,
  jarvisMemoriesTable,
  jarvisEmbeddingsTable,
  jarvisCreativeCampaignsTable,
  jarvisFindingsTable,
  jarvisBriefingsTable,
  jarvisReportsTable,
  jarvisVoiceSessionsTable,
  jarvisApprovalsTable,
  jarvisPolicyEvaluationsTable,
  jarvisRecommendationsTable,
  jarvisInsightsTable,
  jarvisTasksTable,
  jarvisDecisionsTable,
  jarvisRoutingRulesTable,
  jarvisWorkflowRunsTable,
  jarvisAgentMessagesTable,
  jarvisVoiceTurnsTable,
  jarvisCreativeAssetsTable,
  jarvisWorkflowStepsTable,
  jarvisDelegationsTable,
  jarvisEscalationsTable,
  jarvisCommandsTable,
  jarvisKnowledgeRelationshipsTable,
} from "@workspace/db";

/** A declared intra-namespace FK: a JS column whose value must match an `id`
 * of rows in `ref` (the referenced registry table name). */
export interface VaultRef {
  col: string;
  ref: string;
}

export interface VaultTableEntry {
  /** Physical table name (also the package key). */
  name: string;
  table: PgTable;
  /** Self-referential FK column (JS prop) needing parent-before-child ordering. */
  selfRef?: string;
  /** Declared intra-namespace FK columns (JS prop -> referenced table name). */
  refs?: VaultRef[];
  /** True for the pgvector embedding carrier. */
  hasEmbedding?: boolean;
  /** JS prop holding an object-storage `/objects/...` pointer, if any. */
  storageKeyCol?: string;
}

/**
 * Dependency-ordered registry (parents first). Reverse this for clean-restore
 * deletes. Self-referential and polymorphic edges are noted; polymorphic links
 * (knowledge_relationships, embeddings.subject) carry no DB FK by design.
 */
export const VAULT_REGISTRY: VaultTableEntry[] = [
  { name: "jarvis_businesses", table: jarvisBusinessesTable },
  { name: "jarvis_agents", table: jarvisAgentsTable },
  { name: "jarvis_workflows", table: jarvisWorkflowsTable },
  { name: "jarvis_settings", table: jarvisSettingsTable },
  { name: "jarvis_audit_logs", table: jarvisAuditLogsTable },
  {
    name: "jarvis_knowledge_categories",
    table: jarvisKnowledgeCategoriesTable,
    selfRef: "parentId",
  },
  { name: "jarvis_policies", table: jarvisPoliciesTable },
  { name: "jarvis_escalation_chains", table: jarvisEscalationChainsTable },
  { name: "jarvis_cognition_runs", table: jarvisCognitionRunsTable },
  { name: "jarvis_code_files", table: jarvisCodeFilesTable },
  { name: "jarvis_render_services", table: jarvisRenderServicesTable },
  {
    name: "jarvis_aicandlez_daily_snapshots",
    table: jarvisAicandlezDailySnapshotsTable,
  },
  { name: "jarvis_budgets", table: jarvisBudgetsTable },
  {
    name: "jarvis_systems",
    table: jarvisSystemsTable,
    refs: [{ col: "businessId", ref: "jarvis_businesses" }],
  },
  {
    name: "jarvis_projects",
    table: jarvisProjectsTable,
    refs: [{ col: "businessId", ref: "jarvis_businesses" }],
  },
  {
    name: "jarvis_brand_profiles",
    table: jarvisBrandProfilesTable,
    refs: [{ col: "businessId", ref: "jarvis_businesses" }],
    storageKeyCol: "logoStorageKey",
  },
  {
    name: "jarvis_agent_trust",
    table: jarvisAgentTrustTable,
    refs: [{ col: "agentId", ref: "jarvis_agents" }],
  },
  {
    name: "jarvis_agent_runs",
    table: jarvisAgentRunsTable,
    refs: [{ col: "agentId", ref: "jarvis_agents" }],
  },
  {
    name: "jarvis_escalation_chain_steps",
    table: jarvisEscalationChainStepsTable,
    refs: [
      { col: "chainId", ref: "jarvis_escalation_chains" },
      { col: "agentId", ref: "jarvis_agents" },
    ],
  },
  {
    name: "jarvis_repositories",
    table: jarvisRepositoriesTable,
    refs: [
      { col: "systemId", ref: "jarvis_systems" },
      { col: "businessId", ref: "jarvis_businesses" },
    ],
  },
  {
    name: "jarvis_runbooks",
    table: jarvisRunbooksTable,
    refs: [
      { col: "systemId", ref: "jarvis_systems" },
      { col: "businessId", ref: "jarvis_businesses" },
    ],
  },
  {
    name: "jarvis_infra_resources",
    table: jarvisInfraResourcesTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "systemId", ref: "jarvis_systems" },
    ],
  },
  {
    name: "jarvis_credentials",
    table: jarvisCredentialsTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "systemId", ref: "jarvis_systems" },
    ],
  },
  {
    name: "jarvis_knowledge_assets",
    table: jarvisKnowledgeAssetsTable,
    refs: [
      { col: "categoryId", ref: "jarvis_knowledge_categories" },
      { col: "businessId", ref: "jarvis_businesses" },
    ],
  },
  {
    name: "jarvis_memories",
    table: jarvisMemoriesTable,
    refs: [
      { col: "categoryId", ref: "jarvis_knowledge_categories" },
      { col: "businessId", ref: "jarvis_businesses" },
    ],
  },
  {
    name: "jarvis_embeddings",
    table: jarvisEmbeddingsTable,
    refs: [{ col: "businessId", ref: "jarvis_businesses" }],
    hasEmbedding: true,
  },
  {
    name: "jarvis_creative_campaigns",
    table: jarvisCreativeCampaignsTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "cognitionRunId", ref: "jarvis_cognition_runs" },
    ],
  },
  {
    name: "jarvis_findings",
    table: jarvisFindingsTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "projectId", ref: "jarvis_projects" },
    ],
  },
  {
    name: "jarvis_briefings",
    table: jarvisBriefingsTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "cognitionRunId", ref: "jarvis_cognition_runs" },
    ],
  },
  {
    name: "jarvis_reports",
    table: jarvisReportsTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "cognitionRunId", ref: "jarvis_cognition_runs" },
    ],
  },
  {
    name: "jarvis_voice_sessions",
    table: jarvisVoiceSessionsTable,
    refs: [{ col: "businessId", ref: "jarvis_businesses" }],
  },
  {
    name: "jarvis_approvals",
    table: jarvisApprovalsTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "policyId", ref: "jarvis_policies" },
    ],
  },
  {
    name: "jarvis_policy_evaluations",
    table: jarvisPolicyEvaluationsTable,
    refs: [
      { col: "policyId", ref: "jarvis_policies" },
      { col: "approvalId", ref: "jarvis_approvals" },
    ],
  },
  {
    name: "jarvis_recommendations",
    table: jarvisRecommendationsTable,
    refs: [
      { col: "findingId", ref: "jarvis_findings" },
      { col: "businessId", ref: "jarvis_businesses" },
    ],
  },
  {
    name: "jarvis_insights",
    table: jarvisInsightsTable,
    refs: [
      { col: "findingId", ref: "jarvis_findings" },
      { col: "businessId", ref: "jarvis_businesses" },
    ],
  },
  {
    name: "jarvis_tasks",
    table: jarvisTasksTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "projectId", ref: "jarvis_projects" },
      { col: "assigneeAgentId", ref: "jarvis_agents" },
    ],
  },
  {
    name: "jarvis_decisions",
    table: jarvisDecisionsTable,
    refs: [{ col: "businessId", ref: "jarvis_businesses" }],
  },
  {
    name: "jarvis_routing_rules",
    table: jarvisRoutingRulesTable,
    refs: [
      { col: "targetAgentId", ref: "jarvis_agents" },
      { col: "chainId", ref: "jarvis_escalation_chains" },
    ],
  },
  {
    name: "jarvis_workflow_runs",
    table: jarvisWorkflowRunsTable,
    refs: [{ col: "workflowId", ref: "jarvis_workflows" }],
  },
  {
    name: "jarvis_agent_messages",
    table: jarvisAgentMessagesTable,
    refs: [
      { col: "fromAgentId", ref: "jarvis_agents" },
      { col: "toAgentId", ref: "jarvis_agents" },
      { col: "runId", ref: "jarvis_agent_runs" },
    ],
  },
  {
    name: "jarvis_voice_turns",
    table: jarvisVoiceTurnsTable,
    refs: [
      { col: "sessionId", ref: "jarvis_voice_sessions" },
      { col: "cognitionRunId", ref: "jarvis_cognition_runs" },
    ],
  },
  {
    name: "jarvis_creative_assets",
    table: jarvisCreativeAssetsTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "campaignId", ref: "jarvis_creative_campaigns" },
      { col: "cognitionRunId", ref: "jarvis_cognition_runs" },
      { col: "approvalId", ref: "jarvis_approvals" },
    ],
    storageKeyCol: "storageKey",
  },
  {
    name: "jarvis_workflow_steps",
    table: jarvisWorkflowStepsTable,
    refs: [
      { col: "workflowRunId", ref: "jarvis_workflow_runs" },
      { col: "agentId", ref: "jarvis_agents" },
      { col: "policyEvaluationId", ref: "jarvis_policy_evaluations" },
      { col: "approvalId", ref: "jarvis_approvals" },
    ],
  },
  {
    name: "jarvis_delegations",
    table: jarvisDelegationsTable,
    refs: [
      { col: "fromAgentId", ref: "jarvis_agents" },
      { col: "toAgentId", ref: "jarvis_agents" },
      { col: "taskId", ref: "jarvis_tasks" },
      { col: "workflowRunId", ref: "jarvis_workflow_runs" },
      { col: "policyEvaluationId", ref: "jarvis_policy_evaluations" },
      { col: "approvalId", ref: "jarvis_approvals" },
    ],
  },
  {
    name: "jarvis_escalations",
    table: jarvisEscalationsTable,
    refs: [
      { col: "businessId", ref: "jarvis_businesses" },
      { col: "assigneeAgentId", ref: "jarvis_agents" },
      { col: "chainId", ref: "jarvis_escalation_chains" },
      { col: "policyEvaluationId", ref: "jarvis_policy_evaluations" },
      { col: "approvalId", ref: "jarvis_approvals" },
    ],
  },
  {
    name: "jarvis_commands",
    table: jarvisCommandsTable,
    refs: [
      { col: "routingRuleId", ref: "jarvis_routing_rules" },
      { col: "workflowRunId", ref: "jarvis_workflow_runs" },
      { col: "delegationId", ref: "jarvis_delegations" },
      { col: "policyEvaluationId", ref: "jarvis_policy_evaluations" },
      { col: "approvalId", ref: "jarvis_approvals" },
    ],
  },
  {
    name: "jarvis_knowledge_relationships",
    table: jarvisKnowledgeRelationshipsTable,
  },
];

/** Column (JS prop) names of a registry table, derived from Drizzle metadata. */
export function tableColumnNames(entry: VaultTableEntry): string[] {
  return Object.keys(getTableColumns(entry.table));
}

/** The set of physical table names the registry covers. */
export function registryTableNames(): string[] {
  return VAULT_REGISTRY.map((e) => e.name);
}

/** Look up an entry by physical table name. */
export function entryByName(name: string): VaultTableEntry | undefined {
  return VAULT_REGISTRY.find((e) => e.name === name);
}
