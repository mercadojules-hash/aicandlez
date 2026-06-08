import type { JarvisAgent } from "@workspace/db";

/**
 * Jarvis Agent Runtime — shared types.
 *
 * Isolated from the AICandlez trading engine. The runtime executes registered
 * agent handlers on a schedule (or on demand), records each execution in
 * `jarvis_agent_runs`, and lets agents coordinate via `jarvis_agent_messages`
 * (the Communication Protocol) and `jarvis_escalations` (the Escalation
 * Framework). Agents are deterministic + advisory-safe: they never delete data
 * and never reach outside the `jarvis_*` surface.
 */

export type AgentTrigger = "scheduled" | "manual" | "coordinated";

export type AgentMessageType =
  | "request"
  | "response"
  | "notify"
  | "handoff"
  | "escalation";

export type AgentLogSeverity = "info" | "success" | "warn" | "error";

export interface OutboundMessage {
  /** Explicit target agent id. If omitted, `toAgentType` is resolved. */
  toAgentId?: string | null;
  /** Resolve the first agent of this type as the target. */
  toAgentType?: string | null;
  toAgentName?: string | null;
  messageType: AgentMessageType;
  subject: string;
  body?: string;
  payload?: Record<string, unknown>;
}

export interface AgentRunResult {
  summary: string;
  itemsProcessed: number;
  output?: Record<string, unknown>;
}

export interface AgentContext {
  agent: JarvisAgent;
  runId: string;
  trigger: AgentTrigger;
  startedAt: Date;
  /** Push a live activity event to the agent bus (no DB write). */
  log(
    message: string,
    opts?: { severity?: AgentLogSeverity; details?: Record<string, unknown> },
  ): void;
  /** Persist a coordination message + emit a bus event. */
  emitMessage(msg: OutboundMessage): Promise<void>;
  /**
   * Raise an escalation assigned to this agent. Deduped: if an OPEN escalation
   * with the same title already exists, returns its id without inserting.
   */
  raiseEscalation(input: {
    title: string;
    description?: string;
    severity?: string;
    businessId?: string | null;
  }): Promise<string | null>;
  /** Write a governance audit row (actor = jarvis-runtime). */
  audit(
    action: string,
    entityType: string,
    entityId?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  // ── Sprint 6 — orchestration context (all optional / backward compatible) ──
  /** Orchestrated action key (workflow step / delegation / command). Null on a
   *  plain scheduled tick. */
  action?: string | null;
  /** Structured input for an orchestrated action. */
  input?: Record<string, unknown> | null;
  /** Present when this run is executing a delegation. */
  delegation?: DelegationContextInfo | null;
  /** Present when this run is executing a workflow step. */
  workflowStep?: WorkflowStepContextInfo | null;
  /** Create a tracked delegation to another agent. Returns the delegation id. */
  delegate(input: DelegateInput): Promise<string | null>;
}

export interface AgentHandler {
  /** Stable key matching `jarvis_agents.agent_type`. */
  type: string;
  label: string;
  description: string;
  defaultCapabilities: string[];
  /** Suggested schedule when seeding the default fleet (seconds). */
  defaultScheduleSeconds: number;
  /** Suggested scheduler priority (lower = runs first). */
  defaultPriority: number;
  /**
   * Deterministic orchestrated actions this agent supports beyond its scheduled
   * run (Sprint 6). Surfaced in AGENT_CATALOG so the router + workflow builder
   * know what each agent can do. Advisory-safe only.
   */
  actions?: string[];
  run(ctx: AgentContext): Promise<AgentRunResult>;
}

// ── Sprint 6 — orchestration shared types ───────────────────────────────────

/** Extra context the orchestrator injects when invoking a handler for an
 *  orchestrated run (workflow step / delegation / command). All optional. */
export interface OrchestrationExtra {
  action?: string | null;
  input?: Record<string, unknown> | null;
  delegation?: DelegationContextInfo | null;
  workflowStep?: WorkflowStepContextInfo | null;
}

export interface DelegationContextInfo {
  delegationId: string;
  fromAgentName?: string | null;
  objective: string;
}

export interface WorkflowStepContextInfo {
  workflowRunId: string;
  stepKey: string;
}

export interface DelegateInput {
  toAgentId?: string | null;
  toAgentType?: string | null;
  objective: string;
  action?: string;
  input?: Record<string, unknown>;
  priority?: string;
  taskId?: string | null;
  workflowRunId?: string | null;
  dueAt?: Date | null;
}
