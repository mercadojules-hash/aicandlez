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
  run(ctx: AgentContext): Promise<AgentRunResult>;
}
