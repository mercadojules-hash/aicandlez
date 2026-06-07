import { db } from "@workspace/db";
import {
  jarvisCommandsTable,
  jarvisDelegationsTable,
  jarvisWorkflowRunsTable,
  type JarvisCommand,
} from "@workspace/db";
import { asc, eq, isNotNull } from "drizzle-orm";
import { logger } from "../../logger.js";
import { agentBus } from "../agentBus.js";
import { resolveAgentByType, startWorkflowRun } from "./engine.js";
import type { OrchestrationRunner } from "./types.js";

/**
 * Executive command processing. An admin issues a natural command; the route
 * parses it into a `verb` + `args` and queues a `jarvis_commands` row. The
 * orchestrator's command pass (runs FIRST each tick) routes the verb through a
 * FIXED registry of advisory-safe verbs and dispatches it one of three ways:
 *
 *   - direct      → run a specific agent action inline (read-only reports)
 *   - delegation  → create a tracked delegation (executed by the delegation pass)
 *   - workflow    → start a workflow run (advanced by the workflow pass)
 *
 * Unknown verbs are REJECTED (never guessed). Dispatched delegation/workflow
 * commands are reconciled to completed/failed when their target finishes. Fully
 * deterministic + advisory-safe — no deletes, no external calls.
 */

export type CommandKind = "direct" | "delegation" | "workflow";

export interface VerbSpec {
  verb: string;
  description: string;
  kind: CommandKind;
  /** Direct-run target + action. */
  agentType?: string;
  action?: string;
  /** Human hint describing expected args (surfaced in the command console). */
  argsHint?: string;
}

/** The authoritative advisory-safe verb registry. */
export const VERB_REGISTRY: readonly VerbSpec[] = [
  {
    verb: "status",
    description: "Executive status report — open escalations, approvals, priority tasks.",
    kind: "direct",
    agentType: "chief_of_staff",
    action: "status_report",
  },
  {
    verb: "assess_risk",
    description: "Risk posture — high/critical findings and high-impact recommendations.",
    kind: "direct",
    agentType: "risk",
    action: "report",
  },
  {
    verb: "check_tasks",
    description: "Task-queue health — overdue and unassigned work.",
    kind: "direct",
    agentType: "operations",
    action: "report_overdue",
  },
  {
    verb: "qa_sweep",
    description: "Data-integrity report across findings, recommendations, briefings.",
    kind: "direct",
    agentType: "qa",
    action: "report",
  },
  {
    verb: "review_memory",
    description: "Memory promotion candidates — eligible critical findings.",
    kind: "direct",
    agentType: "memory",
    action: "report",
  },
  {
    verb: "delegate",
    description: "Delegate an objective to an agent.",
    kind: "delegation",
    argsHint: "{ toAgentType, objective, action?, input?, priority? }",
  },
  {
    verb: "run_workflow",
    description: "Start a workflow run.",
    kind: "workflow",
    argsHint: "{ workflowId }",
  },
];

export function findVerb(verb: string | null | undefined): VerbSpec | null {
  if (!verb) return null;
  return VERB_REGISTRY.find((v) => v.verb === verb.toLowerCase()) ?? null;
}

async function fail(cmd: JarvisCommand, error: string): Promise<void> {
  await db
    .update(jarvisCommandsTable)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(jarvisCommandsTable.id, cmd.id));
  agentBus.emitEvent({
    type: "command_completed",
    severity: "error",
    message: `Command failed: ${error}`,
    details: { commandId: cmd.id, status: "failed" },
  });
}

async function dispatchDirect(
  cmd: JarvisCommand,
  spec: VerbSpec,
  runner: OrchestrationRunner,
): Promise<void> {
  const agent = spec.agentType ? await resolveAgentByType(spec.agentType) : null;
  if (!agent) {
    await fail(cmd, `No agent registered for type "${spec.agentType ?? "?"}"`);
    return;
  }
  await db
    .update(jarvisCommandsTable)
    .set({ status: "dispatched", routedAgentType: spec.agentType, updatedAt: new Date() })
    .where(eq(jarvisCommandsTable.id, cmd.id));
  agentBus.emitEvent({
    type: "command_dispatched",
    severity: "info",
    agentType: spec.agentType,
    message: `Command "${cmd.verb}" → ${agent.name}`,
    details: { commandId: cmd.id, kind: "direct", action: spec.action },
  });

  const outcome = await runner(agent, "coordinated", {
    action: spec.action ?? null,
    input: cmd.args ?? null,
  });
  if (outcome.ok) {
    await db
      .update(jarvisCommandsTable)
      .set({
        status: "completed",
        result: outcome.result?.output ?? { summary: outcome.summary ?? null },
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(jarvisCommandsTable.id, cmd.id));
    agentBus.emitEvent({
      type: "command_completed",
      severity: "success",
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.agentType,
      message: `Command "${cmd.verb}" completed: ${outcome.summary ?? "done"}`,
      details: { commandId: cmd.id, status: "completed" },
    });
  } else {
    await fail(cmd, outcome.error ?? "agent run failed");
  }
}

async function dispatchDelegation(cmd: JarvisCommand): Promise<void> {
  const args = (cmd.args ?? {}) as Record<string, unknown>;
  const toAgentType = typeof args.toAgentType === "string" ? args.toAgentType : null;
  const objective =
    typeof args.objective === "string" && args.objective.trim().length > 0
      ? args.objective
      : cmd.commandText;
  if (!toAgentType) {
    await fail(cmd, "delegate requires args.toAgentType");
    return;
  }
  const agent = await resolveAgentByType(toAgentType);
  if (!agent) {
    await fail(cmd, `No agent registered for type "${toAgentType}"`);
    return;
  }
  const [del] = await db
    .insert(jarvisDelegationsTable)
    .values({
      fromAgentName: "Command Console",
      toAgentId: agent.id,
      toAgentName: agent.name,
      objective,
      action: typeof args.action === "string" ? args.action : null,
      input:
        args.input && typeof args.input === "object"
          ? (args.input as Record<string, unknown>)
          : null,
      status: "assigned",
      priority: typeof args.priority === "string" ? args.priority : "medium",
      createdBy: cmd.issuedBy ?? null,
    })
    .returning();
  await db
    .update(jarvisCommandsTable)
    .set({
      status: "dispatched",
      routedAgentType: toAgentType,
      delegationId: del?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(jarvisCommandsTable.id, cmd.id));
  agentBus.emitEvent({
    type: "command_dispatched",
    severity: "info",
    agentId: agent.id,
    agentName: agent.name,
    agentType: agent.agentType,
    message: `Command "${cmd.verb}" delegated to ${agent.name}: ${objective}`,
    details: { commandId: cmd.id, kind: "delegation", delegationId: del?.id },
  });
}

async function dispatchWorkflow(cmd: JarvisCommand): Promise<void> {
  const args = (cmd.args ?? {}) as Record<string, unknown>;
  const workflowId = typeof args.workflowId === "string" ? args.workflowId : null;
  if (!workflowId) {
    await fail(cmd, "run_workflow requires args.workflowId");
    return;
  }
  const res = await startWorkflowRun({
    workflowId,
    trigger: "command",
    context: { commandId: cmd.id },
    initiatedBy: cmd.issuedBy ?? null,
  });
  if (!res.ok || !res.runId) {
    await fail(cmd, res.error ?? "failed to start workflow");
    return;
  }
  await db
    .update(jarvisCommandsTable)
    .set({ status: "dispatched", workflowRunId: res.runId, updatedAt: new Date() })
    .where(eq(jarvisCommandsTable.id, cmd.id));
  agentBus.emitEvent({
    type: "command_dispatched",
    severity: "info",
    message: `Command "${cmd.verb}" started workflow run`,
    details: { commandId: cmd.id, kind: "workflow", workflowRunId: res.runId },
  });
}

/** Route + dispatch a single received command. */
export async function processCommand(
  cmd: JarvisCommand,
  runner: OrchestrationRunner,
): Promise<void> {
  const spec = findVerb(cmd.verb);
  if (!spec) {
    await db
      .update(jarvisCommandsTable)
      .set({
        status: "rejected",
        error: `Unknown command verb "${cmd.verb ?? "?"}"`,
        updatedAt: new Date(),
      })
      .where(eq(jarvisCommandsTable.id, cmd.id));
    agentBus.emitEvent({
      type: "command_completed",
      severity: "error",
      message: `Command rejected: unknown verb "${cmd.verb ?? "?"}"`,
      details: { commandId: cmd.id, status: "rejected" },
    });
    return;
  }
  agentBus.emitEvent({
    type: "command_received",
    severity: "info",
    message: `Command received: "${cmd.verb}" (${spec.kind})`,
    details: { commandId: cmd.id, verb: cmd.verb, kind: spec.kind },
  });
  if (spec.kind === "direct") await dispatchDirect(cmd, spec, runner);
  else if (spec.kind === "delegation") await dispatchDelegation(cmd);
  else await dispatchWorkflow(cmd);
}

/** Reconcile dispatched delegation/workflow commands to their terminal state. */
async function reconcileDispatched(): Promise<number> {
  const dispatched = await db
    .select()
    .from(jarvisCommandsTable)
    .where(eq(jarvisCommandsTable.status, "dispatched"))
    .orderBy(asc(jarvisCommandsTable.createdAt), asc(jarvisCommandsTable.id))
    .limit(20);
  let reconciled = 0;
  for (const cmd of dispatched) {
    if (cmd.delegationId) {
      const [d] = await db
        .select()
        .from(jarvisDelegationsTable)
        .where(eq(jarvisDelegationsTable.id, cmd.delegationId))
        .limit(1);
      if (!d) continue;
      if (d.status === "completed") {
        await db
          .update(jarvisCommandsTable)
          .set({ status: "completed", result: d.result ?? null, updatedAt: new Date() })
          .where(eq(jarvisCommandsTable.id, cmd.id));
        reconciled += 1;
        agentBus.emitEvent({
          type: "command_completed",
          severity: "success",
          message: `Command "${cmd.verb}" completed (delegation done)`,
          details: { commandId: cmd.id, status: "completed" },
        });
      } else if (["failed", "expired", "declined"].includes(d.status)) {
        await db
          .update(jarvisCommandsTable)
          .set({
            status: "failed",
            error: d.error ?? `delegation ${d.status}`,
            updatedAt: new Date(),
          })
          .where(eq(jarvisCommandsTable.id, cmd.id));
        reconciled += 1;
        agentBus.emitEvent({
          type: "command_completed",
          severity: "error",
          message: `Command "${cmd.verb}" failed (delegation ${d.status})`,
          details: { commandId: cmd.id, status: "failed" },
        });
      }
    } else if (cmd.workflowRunId) {
      const [r] = await db
        .select()
        .from(jarvisWorkflowRunsTable)
        .where(eq(jarvisWorkflowRunsTable.id, cmd.workflowRunId))
        .limit(1);
      if (!r) continue;
      if (r.status === "succeeded" || r.status === "failed") {
        await db
          .update(jarvisCommandsTable)
          .set({
            status: r.status === "succeeded" ? "completed" : "failed",
            error: r.error ?? null,
            updatedAt: new Date(),
          })
          .where(eq(jarvisCommandsTable.id, cmd.id));
        reconciled += 1;
        agentBus.emitEvent({
          type: "command_completed",
          severity: r.status === "succeeded" ? "success" : "error",
          message: `Command "${cmd.verb}" ${r.status === "succeeded" ? "completed" : "failed"} (workflow ${r.status})`,
          details: { commandId: cmd.id, status: r.status },
        });
      }
    }
  }
  return reconciled;
}

/** Pump pass: dispatch newly received commands, then reconcile in-flight ones. */
export async function pumpCommands(runner: OrchestrationRunner): Promise<number> {
  let processed = 0;
  try {
    const received = await db
      .select()
      .from(jarvisCommandsTable)
      .where(eq(jarvisCommandsTable.status, "received"))
      .orderBy(asc(jarvisCommandsTable.createdAt), asc(jarvisCommandsTable.id))
      .limit(10);
    for (const cmd of received) {
      try {
        await processCommand(cmd, runner);
        processed += 1;
      } catch (err) {
        logger.warn({ err, command: cmd.id }, "jarvis command dispatch failed");
        await fail(cmd, (err as Error).message);
      }
    }
  } catch (err) {
    logger.warn({ err }, "jarvis command receive pass failed");
  }
  try {
    processed += await reconcileDispatched();
  } catch (err) {
    logger.warn({ err }, "jarvis command reconcile pass failed");
  }
  return processed;
}
