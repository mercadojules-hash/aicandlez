import { db } from "@workspace/db";
import {
  jarvisEscalationsTable,
  jarvisEscalationChainStepsTable,
  jarvisAgentsTable,
  jarvisAgentMessagesTable,
  type JarvisEscalation,
} from "@workspace/db";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { logger } from "../../logger.js";
import { agentBus } from "../agentBus.js";
import { resolveAgentByType } from "./engine.js";

/**
 * Escalation-chain engine. An open escalation bound to a chain carries a
 * `currentLevel` + `nextEscalationAt`. When the SLA for the current level lapses,
 * the engine advances to the next chain step: it reassigns the escalation, posts
 * an advisory message to the next step's agent, and recomputes `nextEscalationAt`
 * from that step's SLA. When the chain is exhausted it stops advancing (clears
 * nextEscalationAt) but NEVER auto-resolves — a human/admin always closes an
 * escalation. Deterministic (steps ordered by level,sequence,id) and bounded.
 */

const MAX_ADVANCE_PER_TICK = 10;
const DEFAULT_SLA_SECONDS = 3600;

export async function advanceEscalation(esc: JarvisEscalation): Promise<void> {
  if (!esc.chainId) return;
  const steps = await db
    .select()
    .from(jarvisEscalationChainStepsTable)
    .where(eq(jarvisEscalationChainStepsTable.chainId, esc.chainId))
    .orderBy(
      asc(jarvisEscalationChainStepsTable.level),
      asc(jarvisEscalationChainStepsTable.sequence),
      asc(jarvisEscalationChainStepsTable.id),
    );

  const nextLevel = (esc.currentLevel ?? 0) + 1;
  const nextStep = steps.find((s) => s.level === nextLevel) ?? null;
  if (!nextStep) {
    // Chain exhausted — stop advancing but keep the escalation open.
    await db
      .update(jarvisEscalationsTable)
      .set({ nextEscalationAt: null, updatedAt: new Date() })
      .where(eq(jarvisEscalationsTable.id, esc.id));
    agentBus.emitEvent({
      type: "escalation_advanced",
      severity: "warn",
      message: `Escalation "${esc.title}" reached end of chain (level ${esc.currentLevel})`,
      details: { escalationId: esc.id, exhausted: true, level: esc.currentLevel },
    });
    return;
  }

  // Resolve the next step's target agent (explicit agentId wins, else by type).
  let agentId: string | null = nextStep.agentId ?? null;
  let agentName: string | null = null;
  if (agentId) {
    const [a] = await db
      .select({ name: jarvisAgentsTable.name })
      .from(jarvisAgentsTable)
      .where(eq(jarvisAgentsTable.id, agentId))
      .limit(1);
    agentName = a?.name ?? null;
  } else if (nextStep.agentType) {
    const a = await resolveAgentByType(nextStep.agentType);
    if (a) {
      agentId = a.id;
      agentName = a.name;
    }
  }

  const nextAt = new Date(
    Date.now() + (nextStep.slaSeconds ?? DEFAULT_SLA_SECONDS) * 1000,
  );
  await db
    .update(jarvisEscalationsTable)
    .set({
      currentLevel: nextLevel,
      nextEscalationAt: nextAt,
      assigneeAgentId: agentId,
      updatedAt: new Date(),
    })
    .where(eq(jarvisEscalationsTable.id, esc.id));

  // Advisory hand-off message to the next responder (system-origin).
  await db.insert(jarvisAgentMessagesTable).values({
    fromAgentId: null,
    fromAgentName: "Escalation Engine",
    toAgentId: agentId,
    toAgentName: agentName,
    runId: null,
    messageType: "escalation",
    subject: `Escalation level ${nextLevel}: ${esc.title}`,
    body: nextStep.instruction ?? esc.description ?? null,
    payload: {
      escalationId: esc.id,
      chainId: esc.chainId,
      level: nextLevel,
      severity: esc.severity,
    },
  });

  agentBus.emitEvent({
    type: "escalation_advanced",
    severity: "warn",
    agentId,
    agentName,
    message: `Escalation "${esc.title}" advanced to level ${nextLevel} (${agentName ?? nextStep.agentType ?? "unassigned"})`,
    details: { escalationId: esc.id, level: nextLevel, chainId: esc.chainId },
  });
}

/** Pump pass: advance every open chained escalation whose SLA has lapsed. */
export async function pumpEscalations(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(jarvisEscalationsTable)
    .where(
      and(
        eq(jarvisEscalationsTable.status, "open"),
        isNotNull(jarvisEscalationsTable.chainId),
        isNotNull(jarvisEscalationsTable.nextEscalationAt),
        lte(jarvisEscalationsTable.nextEscalationAt, now),
      ),
    )
    .orderBy(asc(jarvisEscalationsTable.createdAt), asc(jarvisEscalationsTable.id))
    .limit(MAX_ADVANCE_PER_TICK);
  for (const esc of due) {
    try {
      await advanceEscalation(esc);
    } catch (err) {
      logger.warn({ err, escalation: esc.id }, "jarvis escalation advance failed");
    }
  }
  return due.length;
}
