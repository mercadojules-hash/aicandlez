import { db } from "@workspace/db";
import {
  jarvisAgentsTable,
  jarvisWorkflowsTable,
  jarvisWorkflowRunsTable,
  jarvisWorkflowStepsTable,
  type JarvisAgent,
  type JarvisWorkflowRun,
  type JarvisWorkflowStepRow,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { logger } from "../../logger.js";
import { agentBus } from "../agentBus.js";
import { gateSubject } from "./governanceGate.js";
import type { OrchestrationRunner } from "./types.js";

/**
 * Workflow execution engine. A workflow's `definition.steps` is a DAG: each step
 * names an agent type + action and `dependsOn` other steps' keys. The engine
 * advances exactly ONE ready step per run per tick (bounded), recording a per-step
 * ledger in `jarvis_workflow_steps`. Deterministic: steps are ordered by
 * `(sequence, id)`, runs by `(createdAt, id)`. Advisory-safe — never deletes.
 */

// Bound work per tick: at most one ready step advanced per running workflow, for
// at most this many running workflows. Keeps a single tick predictable + cheap.
const MAX_RUNNING_WORKFLOWS_PER_TICK = 10;

/** Resolve the deterministic (oldest) agent of a given type, or null. */
export async function resolveAgentByType(
  agentType: string,
): Promise<JarvisAgent | null> {
  const [agent] = await db
    .select()
    .from(jarvisAgentsTable)
    .where(eq(jarvisAgentsTable.agentType, agentType))
    .orderBy(asc(jarvisAgentsTable.createdAt), asc(jarvisAgentsTable.id))
    .limit(1);
  return agent ?? null;
}

/**
 * Create a workflow run + its pending step rows from a workflow definition. Does
 * NOT execute any steps — the pump advances them. Returns the run id.
 */
export async function startWorkflowRun(opts: {
  workflowId: string;
  trigger?: string;
  context?: Record<string, unknown> | null;
  initiatedBy?: string | null;
}): Promise<{ ok: boolean; runId: string | null; error?: string }> {
  const [wf] = await db
    .select()
    .from(jarvisWorkflowsTable)
    .where(eq(jarvisWorkflowsTable.id, opts.workflowId));
  if (!wf) return { ok: false, runId: null, error: "Workflow not found" };
  if (!wf.enabled) return { ok: false, runId: null, error: "Workflow is disabled" };
  const steps = wf.definition?.steps ?? [];
  if (steps.length === 0)
    return { ok: false, runId: null, error: "Workflow has no steps" };

  const [run] = await db
    .insert(jarvisWorkflowRunsTable)
    .values({
      workflowId: wf.id,
      workflowName: wf.name,
      status: "running",
      trigger: opts.trigger ?? "manual",
      context: opts.context ?? null,
      initiatedBy: opts.initiatedBy ?? null,
      stepsTotal: steps.length,
      stepsCompleted: 0,
      startedAt: new Date(),
    })
    .returning();
  if (!run) return { ok: false, runId: null, error: "Failed to create run" };

  await db.insert(jarvisWorkflowStepsTable).values(
    steps.map((s, i) => ({
      workflowRunId: run.id,
      stepKey: s.key,
      sequence: i,
      agentType: s.agentType,
      action: s.action,
      dependsOn: s.dependsOn ?? [],
      status: "pending" as const,
      input: s.input ?? null,
    })),
  );

  agentBus.emitEvent({
    type: "workflow_started",
    severity: "info",
    runId: run.id,
    message: `Workflow "${wf.name}" started (${steps.length} step${steps.length === 1 ? "" : "s"})`,
    details: { workflowRunId: run.id, steps: steps.length, trigger: opts.trigger },
  });
  return { ok: true, runId: run.id };
}

/** Advance a single running workflow run by one ready step (or finalize it). */
export async function advanceWorkflowRun(
  run: JarvisWorkflowRun,
  runner: OrchestrationRunner,
): Promise<void> {
  const steps = await db
    .select()
    .from(jarvisWorkflowStepsTable)
    .where(eq(jarvisWorkflowStepsTable.workflowRunId, run.id))
    .orderBy(asc(jarvisWorkflowStepsTable.sequence), asc(jarvisWorkflowStepsTable.id));

  const failed = steps.find((s) => s.status === "failed");
  if (failed) {
    await finalizeWorkflow(
      run.id,
      "failed",
      `Step "${failed.stepKey}" failed: ${failed.error ?? "unknown error"}`,
    );
    return;
  }

  const succeeded = new Set(
    steps.filter((s) => s.status === "succeeded").map((s) => s.stepKey),
  );
  // A step parked by governance (held) or in-flight (running) pauses the run —
  // it neither finalizes nor fails until the auto-approval is resolved.
  const paused = steps.filter(
    (s) => s.status === "held" || s.status === "running",
  );
  const pending = steps.filter((s) => s.status === "pending");
  if (pending.length === 0) {
    if (paused.length > 0) return; // awaiting approval / in-flight
    await finalizeWorkflow(run.id, "succeeded", null);
    return;
  }

  const ready = pending.find((s) =>
    (s.dependsOn ?? []).every((dep) => succeeded.has(dep)),
  );
  if (!ready) {
    if (paused.length > 0) return; // pending steps blocked behind a held/running step
    // No step is runnable and none is in-flight → unresolvable dependency graph.
    await finalizeWorkflow(
      run.id,
      "failed",
      "Unresolvable step dependencies (no ready step)",
    );
    return;
  }

  await executeStep(run, ready, runner);
}

async function executeStep(
  run: JarvisWorkflowRun,
  step: JarvisWorkflowStepRow,
  runner: OrchestrationRunner,
): Promise<void> {
  // Governance gate (pre-execution). deny → fail the step (workflow fails);
  // require_approval → park the step in "held" so advanceWorkflowRun pauses the
  // whole run until a human resolves the auto-approval.
  const gate = await gateSubject(
    {
      subjectType: "workflow_step",
      subjectId: step.id,
      agentType: step.agentType ?? null,
      action: step.action ?? null,
      workflowName: run.workflowName ?? null,
    },
    `Workflow "${run.workflowName ?? ""}" step "${step.stepKey}"`,
    step.governanceState,
  );
  if (!gate.proceed) {
    if (gate.decision === "deny") {
      const finishedAt = new Date();
      await db
        .update(jarvisWorkflowStepsTable)
        .set({
          status: "failed",
          error: gate.result?.reason ?? "blocked by governance",
          finishedAt,
        })
        .where(eq(jarvisWorkflowStepsTable.id, step.id));
      agentBus.emitEvent({
        type: "workflow_step",
        severity: "error",
        runId: run.id,
        message: `Workflow "${run.workflowName ?? ""}" step "${step.stepKey}" denied by governance`,
        details: { stepKey: step.stepKey, reason: gate.result?.reason },
      });
    } else {
      await db
        .update(jarvisWorkflowStepsTable)
        .set({ status: "held" })
        .where(eq(jarvisWorkflowStepsTable.id, step.id));
    }
    return;
  }

  const startedAt = new Date();
  await db
    .update(jarvisWorkflowStepsTable)
    .set({ status: "running", startedAt })
    .where(eq(jarvisWorkflowStepsTable.id, step.id));

  const agent = step.agentType ? await resolveAgentByType(step.agentType) : null;
  if (!agent) {
    const finishedAt = new Date();
    await db
      .update(jarvisWorkflowStepsTable)
      .set({
        status: "failed",
        error: `No agent registered for type "${step.agentType ?? "?"}"`,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(jarvisWorkflowStepsTable.id, step.id));
    agentBus.emitEvent({
      type: "workflow_step",
      severity: "error",
      runId: run.id,
      message: `Workflow "${run.workflowName ?? ""}" step "${step.stepKey}" failed: no agent`,
      details: { stepKey: step.stepKey, agentType: step.agentType },
    });
    return;
  }

  const outcome = await runner(agent, "coordinated", {
    action: step.action ?? null,
    input: step.input ?? null,
    workflowStep: { workflowRunId: run.id, stepKey: step.stepKey },
  });
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  if (outcome.ok) {
    await db
      .update(jarvisWorkflowStepsTable)
      .set({
        status: "succeeded",
        agentId: agent.id,
        agentName: agent.name,
        output: outcome.result?.output ?? { summary: outcome.summary ?? null },
        finishedAt,
        durationMs,
      })
      .where(eq(jarvisWorkflowStepsTable.id, step.id));
    await bumpStepsCompleted(run.id);
    agentBus.emitEvent({
      type: "workflow_step",
      severity: "success",
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.agentType,
      runId: run.id,
      message: `Workflow "${run.workflowName ?? ""}" step "${step.stepKey}" done`,
      details: { stepKey: step.stepKey, summary: outcome.summary },
    });
  } else {
    await db
      .update(jarvisWorkflowStepsTable)
      .set({
        status: "failed",
        agentId: agent.id,
        agentName: agent.name,
        error: outcome.error ?? "step failed",
        finishedAt,
        durationMs,
      })
      .where(eq(jarvisWorkflowStepsTable.id, step.id));
    agentBus.emitEvent({
      type: "workflow_step",
      severity: "error",
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.agentType,
      runId: run.id,
      message: `Workflow "${run.workflowName ?? ""}" step "${step.stepKey}" failed`,
      details: { stepKey: step.stepKey, error: outcome.error },
    });
  }
}

async function bumpStepsCompleted(runId: string): Promise<void> {
  const completed = await db
    .select({ status: jarvisWorkflowStepsTable.status })
    .from(jarvisWorkflowStepsTable)
    .where(
      and(
        eq(jarvisWorkflowStepsTable.workflowRunId, runId),
        eq(jarvisWorkflowStepsTable.status, "succeeded"),
      ),
    );
  await db
    .update(jarvisWorkflowRunsTable)
    .set({ stepsCompleted: completed.length, updatedAt: new Date() })
    .where(eq(jarvisWorkflowRunsTable.id, runId));
}

async function finalizeWorkflow(
  runId: string,
  status: "succeeded" | "failed",
  error: string | null,
): Promise<void> {
  if (status === "failed") {
    // Mark any not-yet-run steps as skipped (never delete history).
    await db
      .update(jarvisWorkflowStepsTable)
      .set({ status: "skipped" })
      .where(
        and(
          eq(jarvisWorkflowStepsTable.workflowRunId, runId),
          eq(jarvisWorkflowStepsTable.status, "pending"),
        ),
      );
  }
  const finishedAt = new Date();
  const [run] = await db
    .select()
    .from(jarvisWorkflowRunsTable)
    .where(eq(jarvisWorkflowRunsTable.id, runId));
  const durationMs = run
    ? finishedAt.getTime() - new Date(run.startedAt).getTime()
    : null;
  const completed = await db
    .select({ status: jarvisWorkflowStepsTable.status })
    .from(jarvisWorkflowStepsTable)
    .where(
      and(
        eq(jarvisWorkflowStepsTable.workflowRunId, runId),
        eq(jarvisWorkflowStepsTable.status, "succeeded"),
      ),
    );
  await db
    .update(jarvisWorkflowRunsTable)
    .set({
      status,
      error,
      finishedAt,
      durationMs,
      stepsCompleted: completed.length,
      updatedAt: finishedAt,
    })
    .where(eq(jarvisWorkflowRunsTable.id, runId));
  agentBus.emitEvent({
    type: "workflow_finished",
    severity: status === "succeeded" ? "success" : "error",
    runId,
    message: `Workflow "${run?.workflowName ?? ""}" ${status}`,
    details: { status, error },
  });
}

/** Pump pass: advance every running workflow run by one ready step. */
export async function pumpWorkflowRuns(runner: OrchestrationRunner): Promise<number> {
  const runs = await db
    .select()
    .from(jarvisWorkflowRunsTable)
    .where(eq(jarvisWorkflowRunsTable.status, "running"))
    .orderBy(asc(jarvisWorkflowRunsTable.createdAt), asc(jarvisWorkflowRunsTable.id))
    .limit(MAX_RUNNING_WORKFLOWS_PER_TICK);
  for (const run of runs) {
    try {
      await advanceWorkflowRun(run, runner);
    } catch (err) {
      logger.warn({ err, run: run.id }, "jarvis workflow advance failed");
    }
  }
  return runs.length;
}
