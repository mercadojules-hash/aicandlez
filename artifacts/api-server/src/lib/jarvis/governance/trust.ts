import { db } from "@workspace/db";
import { jarvisAgentTrustTable, type JarvisAgentTrust } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

/**
 * Deterministic per-agent trust scoring. Trust is a pure function of run history
 * (success rate) penalized by governance denials — NO randomness, NO external
 * calls, NO ML. Scores feed policy `minTrustScore` conditions: a low-trust agent
 * can have an otherwise-allowed action escalated to require_approval.
 */

export interface TrustStats {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  deniedActions: number;
  approvedActions: number;
}

const DENIAL_PENALTY = 2;
const MAX_DENIAL_PENALTY = 20;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Pure: 100 with no history; otherwise success-rate% minus capped denial penalty. */
export function computeTrustScore(stats: TrustStats): number {
  if (stats.totalRuns <= 0) return 100;
  const successRate = stats.successfulRuns / stats.totalRuns;
  const base = Math.round(successRate * 100);
  const penalty = Math.min(stats.deniedActions * DENIAL_PENALTY, MAX_DENIAL_PENALTY);
  return clamp(base - penalty, 0, 100);
}

async function findTrustRow(
  agentId: string | null,
  agentType: string | null,
): Promise<JarvisAgentTrust | null> {
  if (agentId) {
    const [row] = await db
      .select()
      .from(jarvisAgentTrustTable)
      .where(eq(jarvisAgentTrustTable.agentId, agentId))
      .limit(1);
    if (row) return row;
  }
  if (agentType) {
    const [row] = await db
      .select()
      .from(jarvisAgentTrustTable)
      .where(eq(jarvisAgentTrustTable.agentType, agentType))
      .limit(1);
    return row ?? null;
  }
  return null;
}

/** Read the current trust score for an agent, or null if untracked. */
export async function getTrustScore(
  agentId: string | null,
  agentType: string | null,
): Promise<number | null> {
  const row = await findTrustRow(agentId, agentType);
  return row?.score ?? null;
}

/** Record a finished agent run outcome, upserting the agent's trust row. */
export async function recordRunOutcome(p: {
  agentId: string | null;
  agentName: string | null;
  agentType: string | null;
  ok: boolean;
}): Promise<void> {
  const now = new Date();
  const existing = await findTrustRow(p.agentId, p.agentType);
  if (!existing) {
    const successfulRuns = p.ok ? 1 : 0;
    const failedRuns = p.ok ? 0 : 1;
    await db.insert(jarvisAgentTrustTable).values({
      agentId: p.agentId,
      agentName: p.agentName,
      agentType: p.agentType,
      score: computeTrustScore({
        totalRuns: 1,
        successfulRuns,
        failedRuns,
        deniedActions: 0,
        approvedActions: 0,
      }),
      totalRuns: 1,
      successfulRuns,
      failedRuns,
      windowStartedAt: now,
      lastComputedAt: now,
    });
    return;
  }
  const totalRuns = existing.totalRuns + 1;
  const successfulRuns = existing.successfulRuns + (p.ok ? 1 : 0);
  const failedRuns = existing.failedRuns + (p.ok ? 0 : 1);
  await db
    .update(jarvisAgentTrustTable)
    .set({
      totalRuns,
      successfulRuns,
      failedRuns,
      score: computeTrustScore({
        totalRuns,
        successfulRuns,
        failedRuns,
        deniedActions: existing.deniedActions,
        approvedActions: existing.approvedActions,
      }),
      lastComputedAt: now,
      updatedAt: now,
    })
    .where(eq(jarvisAgentTrustTable.id, existing.id));
}

/** Bump governance counters (denied/approved) for an agent's trust row. */
export async function recordGovernanceOutcome(p: {
  agentId: string | null;
  agentType: string | null;
  denied?: boolean;
  approved?: boolean;
}): Promise<void> {
  const existing = await findTrustRow(p.agentId, p.agentType);
  if (!existing) return;
  const deniedActions = existing.deniedActions + (p.denied ? 1 : 0);
  const approvedActions = existing.approvedActions + (p.approved ? 1 : 0);
  await db
    .update(jarvisAgentTrustTable)
    .set({
      deniedActions,
      approvedActions,
      score: computeTrustScore({
        totalRuns: existing.totalRuns,
        successfulRuns: existing.successfulRuns,
        failedRuns: existing.failedRuns,
        deniedActions,
        approvedActions,
      }),
      lastComputedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jarvisAgentTrustTable.id, existing.id));
}

/** Maintenance pass: recompute every trust row's score from stored counters. */
export async function recomputeAllTrust(): Promise<number> {
  const rows = await db
    .select()
    .from(jarvisAgentTrustTable)
    .orderBy(asc(jarvisAgentTrustTable.createdAt), asc(jarvisAgentTrustTable.id));
  const now = new Date();
  for (const row of rows) {
    const score = computeTrustScore(row);
    if (score !== row.score) {
      await db
        .update(jarvisAgentTrustTable)
        .set({ score, lastComputedAt: now, updatedAt: now })
        .where(eq(jarvisAgentTrustTable.id, row.id));
    }
  }
  return rows.length;
}
