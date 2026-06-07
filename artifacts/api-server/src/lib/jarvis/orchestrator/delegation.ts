import { db } from "@workspace/db";
import {
  jarvisDelegationsTable,
  jarvisAgentsTable,
  type JarvisDelegation,
} from "@workspace/db";
import { and, asc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { logger } from "../../logger.js";
import { agentBus } from "../agentBus.js";
import type { OrchestrationRunner } from "./types.js";

/**
 * Delegation engine. A delegation is a TRACKED unit of work one agent assigns to
 * another (distinct from a fire-and-forget Sprint 5 message). Lifecycle:
 *
 *   assigned → in_progress → completed | failed
 *   assigned/in_progress (past due) → expired
 *   assigned (no resolvable target) → declined
 *
 * Each pump expires overdue work then executes a bounded batch of assigned
 * delegations by running the target handler in delegated mode. Deterministic
 * (ordered by createdAt,id) and advisory-safe — it never deletes a delegation.
 */

const MAX_EXECUTE_PER_TICK = 5;
const MAX_EXPIRE_PER_TICK = 25;

async function expireOverdue(): Promise<number> {
  const now = new Date();
  const overdue = await db
    .select()
    .from(jarvisDelegationsTable)
    .where(
      and(
        inArray(jarvisDelegationsTable.status, [
          "assigned",
          "accepted",
          "in_progress",
        ]),
        isNotNull(jarvisDelegationsTable.dueAt),
        lt(jarvisDelegationsTable.dueAt, now),
      ),
    )
    .orderBy(asc(jarvisDelegationsTable.createdAt), asc(jarvisDelegationsTable.id))
    .limit(MAX_EXPIRE_PER_TICK);
  for (const d of overdue) {
    await db
      .update(jarvisDelegationsTable)
      .set({
        status: "expired",
        error: "Past due before execution",
        updatedAt: new Date(),
      })
      .where(eq(jarvisDelegationsTable.id, d.id));
    agentBus.emitEvent({
      type: "delegation_executed",
      severity: "warn",
      agentId: d.toAgentId ?? null,
      agentName: d.toAgentName ?? null,
      message: `Delegation expired: ${d.objective}`,
      details: { delegationId: d.id, status: "expired" },
    });
  }
  return overdue.length;
}

/** Execute a single assigned delegation through the runner. */
export async function executeDelegation(
  d: JarvisDelegation,
  runner: OrchestrationRunner,
): Promise<void> {
  let agent = null;
  if (d.toAgentId) {
    const [a] = await db
      .select()
      .from(jarvisAgentsTable)
      .where(eq(jarvisAgentsTable.id, d.toAgentId))
      .limit(1);
    agent = a ?? null;
  }
  if (!agent) {
    await db
      .update(jarvisDelegationsTable)
      .set({
        status: "declined",
        error: "No resolvable target agent",
        updatedAt: new Date(),
      })
      .where(eq(jarvisDelegationsTable.id, d.id));
    agentBus.emitEvent({
      type: "delegation_executed",
      severity: "error",
      message: `Delegation declined (no target agent): ${d.objective}`,
      details: { delegationId: d.id, status: "declined" },
    });
    return;
  }

  await db
    .update(jarvisDelegationsTable)
    .set({ status: "in_progress", updatedAt: new Date() })
    .where(eq(jarvisDelegationsTable.id, d.id));

  const outcome = await runner(agent, "coordinated", {
    action: d.action ?? null,
    input: d.input ?? null,
    delegation: {
      delegationId: d.id,
      fromAgentName: d.fromAgentName,
      objective: d.objective,
    },
  });

  if (outcome.ok) {
    await db
      .update(jarvisDelegationsTable)
      .set({
        status: "completed",
        result: outcome.result?.output ?? { summary: outcome.summary ?? null },
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(jarvisDelegationsTable.id, d.id));
    agentBus.emitEvent({
      type: "delegation_executed",
      severity: "success",
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.agentType,
      message: `Delegation completed by ${agent.name}: ${d.objective}`,
      details: { delegationId: d.id, status: "completed" },
    });
  } else {
    await db
      .update(jarvisDelegationsTable)
      .set({
        status: "failed",
        error: outcome.error ?? "delegation failed",
        updatedAt: new Date(),
      })
      .where(eq(jarvisDelegationsTable.id, d.id));
    agentBus.emitEvent({
      type: "delegation_executed",
      severity: "error",
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.agentType,
      message: `Delegation failed at ${agent.name}: ${d.objective}`,
      details: { delegationId: d.id, status: "failed", error: outcome.error },
    });
  }
}

async function executeAssigned(runner: OrchestrationRunner): Promise<number> {
  const pending = await db
    .select()
    .from(jarvisDelegationsTable)
    .where(eq(jarvisDelegationsTable.status, "assigned"))
    .orderBy(asc(jarvisDelegationsTable.createdAt), asc(jarvisDelegationsTable.id))
    .limit(MAX_EXECUTE_PER_TICK);
  for (const d of pending) {
    await executeDelegation(d, runner);
  }
  return pending.length;
}

/** Pump pass: expire overdue delegations, then execute a bounded assigned batch. */
export async function pumpDelegations(runner: OrchestrationRunner): Promise<number> {
  let processed = 0;
  try {
    processed += await expireOverdue();
  } catch (err) {
    logger.warn({ err }, "jarvis delegation expire pass failed");
  }
  try {
    processed += await executeAssigned(runner);
  } catch (err) {
    logger.warn({ err }, "jarvis delegation execute pass failed");
  }
  return processed;
}
