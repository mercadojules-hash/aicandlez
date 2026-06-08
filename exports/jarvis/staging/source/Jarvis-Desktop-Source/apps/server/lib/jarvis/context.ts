import { db } from "@workspace/db";
import {
  jarvisAgentsTable,
  jarvisAgentMessagesTable,
  jarvisEscalationsTable,
  jarvisAuditLogsTable,
  jarvisDelegationsTable,
  type JarvisAgent,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { agentBus } from "./agentBus.js";
import type {
  AgentContext,
  AgentTrigger,
  DelegateInput,
  DelegationContextInfo,
  OutboundMessage,
  WorkflowStepContextInfo,
} from "./types.js";

const RUNTIME_ACTOR = "jarvis-runtime";

/**
 * Builds the per-run AgentContext. Cross-cutting helpers (messaging, escalation,
 * delegation, audit) are closures so they share the same `agent`/`runId` without
 * relying on `this` binding. The optional `action`/`input`/`delegation`/
 * `workflowStep` fields are populated only for orchestrated runs (Sprint 6);
 * a plain scheduled tick leaves them undefined (backward compatible).
 */
export function buildContext(opts: {
  agent: JarvisAgent;
  runId: string;
  trigger: AgentTrigger;
  startedAt: Date;
  action?: string | null;
  input?: Record<string, unknown> | null;
  delegation?: DelegationContextInfo | null;
  workflowStep?: WorkflowStepContextInfo | null;
}): AgentContext {
  const { agent, runId, trigger, startedAt } = opts;

  const audit: AgentContext["audit"] = async (
    action,
    entityType,
    entityId,
    metadata,
  ) => {
    try {
      await db.insert(jarvisAuditLogsTable).values({
        userId: RUNTIME_ACTOR,
        userEmail: null,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: { ...metadata, agentId: agent.id, agentName: agent.name, runId },
      });
    } catch (err) {
      logger.warn({ err, agent: agent.id }, "jarvis agent audit failed");
    }
  };

  const log: AgentContext["log"] = (message, o) => {
    agentBus.emitEvent({
      type: "agent_log",
      severity: o?.severity ?? "info",
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.agentType,
      runId,
      message,
      details: o?.details,
    });
  };

  const emitMessage: AgentContext["emitMessage"] = async (msg: OutboundMessage) => {
    try {
      let toAgentId = msg.toAgentId ?? null;
      let toAgentName = msg.toAgentName ?? null;
      if (!toAgentId && msg.toAgentType) {
        const [target] = await db
          .select({ id: jarvisAgentsTable.id, name: jarvisAgentsTable.name })
          .from(jarvisAgentsTable)
          .where(eq(jarvisAgentsTable.agentType, msg.toAgentType))
          // Deterministic recipient when multiple agents share a type: oldest wins.
          .orderBy(asc(jarvisAgentsTable.createdAt), asc(jarvisAgentsTable.id))
          .limit(1);
        if (target) {
          toAgentId = target.id;
          toAgentName = target.name;
        }
      }
      const [row] = await db
        .insert(jarvisAgentMessagesTable)
        .values({
          fromAgentId: agent.id,
          fromAgentName: agent.name,
          toAgentId,
          toAgentName,
          runId,
          messageType: msg.messageType,
          subject: msg.subject,
          body: msg.body ?? null,
          payload: msg.payload ?? null,
        })
        .returning();
      agentBus.emitEvent({
        type: "agent_message",
        severity: "info",
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.agentType,
        runId,
        message: `${agent.name} → ${toAgentName ?? "broadcast"}: ${msg.subject}`,
        details: { messageType: msg.messageType, messageId: row?.id },
      });
    } catch (err) {
      logger.warn({ err, agent: agent.id }, "jarvis agent emitMessage failed");
    }
  };

  const raiseEscalation: AgentContext["raiseEscalation"] = async (input) => {
    try {
      // Dedupe: never re-raise an escalation that is already open with the same
      // title. Keeps a scheduled agent from spamming the escalation queue.
      const existing = await db
        .select({ id: jarvisEscalationsTable.id })
        .from(jarvisEscalationsTable)
        .where(
          and(
            eq(jarvisEscalationsTable.title, input.title),
            eq(jarvisEscalationsTable.status, "open"),
          ),
        )
        .orderBy(asc(jarvisEscalationsTable.createdAt), asc(jarvisEscalationsTable.id))
        .limit(1);
      if (existing[0]) return existing[0].id;

      const [row] = await db
        .insert(jarvisEscalationsTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          severity: input.severity ?? "medium",
          assigneeAgentId: agent.id,
          businessId: input.businessId ?? null,
        })
        .returning();
      agentBus.emitEvent({
        type: "agent_escalation",
        severity: "warn",
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.agentType,
        runId,
        message: `${agent.name} raised escalation: ${input.title}`,
        details: { escalationId: row?.id, severity: input.severity ?? "medium" },
      });
      await audit("raise_escalation", "jarvis_escalation", row?.id ?? null, {
        title: input.title,
      });
      return row?.id ?? null;
    } catch (err) {
      logger.warn({ err, agent: agent.id }, "jarvis agent raiseEscalation failed");
      return null;
    }
  };

  const delegate: AgentContext["delegate"] = async (input: DelegateInput) => {
    try {
      let toAgentId = input.toAgentId ?? null;
      let toAgentName: string | null = null;
      if (!toAgentId && input.toAgentType) {
        const [target] = await db
          .select({ id: jarvisAgentsTable.id, name: jarvisAgentsTable.name })
          .from(jarvisAgentsTable)
          .where(eq(jarvisAgentsTable.agentType, input.toAgentType))
          // Deterministic target when multiple agents share a type: oldest wins.
          .orderBy(asc(jarvisAgentsTable.createdAt), asc(jarvisAgentsTable.id))
          .limit(1);
        if (target) {
          toAgentId = target.id;
          toAgentName = target.name;
        }
      } else if (toAgentId) {
        const [target] = await db
          .select({ name: jarvisAgentsTable.name })
          .from(jarvisAgentsTable)
          .where(eq(jarvisAgentsTable.id, toAgentId))
          .limit(1);
        toAgentName = target?.name ?? null;
      }
      const [row] = await db
        .insert(jarvisDelegationsTable)
        .values({
          fromAgentId: agent.id,
          fromAgentName: agent.name,
          toAgentId,
          toAgentName,
          taskId: input.taskId ?? null,
          workflowRunId: input.workflowRunId ?? null,
          objective: input.objective,
          action: input.action ?? null,
          input: input.input ?? null,
          status: "assigned",
          priority: input.priority ?? "medium",
          dueAt: input.dueAt ?? null,
          createdBy: RUNTIME_ACTOR,
        })
        .returning();
      agentBus.emitEvent({
        type: "delegation_created",
        severity: "info",
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.agentType,
        runId,
        message: `${agent.name} delegated → ${toAgentName ?? input.toAgentType ?? "unassigned"}: ${input.objective}`,
        details: { delegationId: row?.id, action: input.action ?? null },
      });
      await audit("create_delegation", "jarvis_delegation", row?.id ?? null, {
        objective: input.objective,
        toAgentType: input.toAgentType ?? null,
      });
      return row?.id ?? null;
    } catch (err) {
      logger.warn({ err, agent: agent.id }, "jarvis agent delegate failed");
      return null;
    }
  };

  return {
    agent,
    runId,
    trigger,
    startedAt,
    action: opts.action ?? null,
    input: opts.input ?? null,
    delegation: opts.delegation ?? null,
    workflowStep: opts.workflowStep ?? null,
    log,
    emitMessage,
    raiseEscalation,
    delegate,
    audit,
  };
}
