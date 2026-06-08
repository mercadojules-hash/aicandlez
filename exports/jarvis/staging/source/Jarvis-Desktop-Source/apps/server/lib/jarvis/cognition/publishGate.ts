import { db } from "@workspace/db";
import {
  jarvisBriefingsTable,
  jarvisApprovalsTable,
  jarvisPolicyEvaluationsTable,
  type JarvisBriefing,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

/**
 * Governed publish gate for briefings (decision D1: PUBLISH is the governed
 * action, the draft never is). It REUSES the existing governance tables
 * (`jarvis_approvals` + `jarvis_policy_evaluations`) by writing the polymorphic
 * `subjectType="briefing"` directly — it does NOT add "briefing" to the
 * orchestration `GovernedSubjectType` enum (locked invariant: no enum change).
 *
 * Decision rule (D2): a cognition-authored draft whose grounding is weak or
 * absent requires human approval before publish; the draft itself stays visible
 * the whole time. Human-authored (manual) briefings are already human-vetted, so
 * they publish directly. An existing APPROVED approval unlocks publish (the human
 * already signed off); an existing PENDING approval blocks without duplicating.
 */

const SUBJECT_TYPE = "briefing";
const DEFAULT_MIN_GROUNDING = 60;

/** Min grounding score for a cognition briefing to publish without approval. */
function minGroundingThreshold(): number {
  const raw = process.env.JARVIS_COGNITION_MIN_GROUNDING;
  if (raw == null || raw.trim() === "") return DEFAULT_MIN_GROUNDING;
  const n = Number(raw);
  // Fail-safe: a malformed knob must not relax the gate.
  if (!Number.isFinite(n) || n < 0 || n > 100) return DEFAULT_MIN_GROUNDING;
  return Math.round(n);
}

export type BriefingPublishDecision = "allow" | "require_approval";

export interface BriefingPublishOutcome {
  decision: BriefingPublishDecision;
  reason: string;
  groundingScore: number | null;
  threshold: number;
  approvalId: string | null;
  evaluationId: string;
  briefing: JarvisBriefing | null;
}

/** Most-recent governance approval for this briefing, if any. */
async function latestApproval(briefingId: string) {
  const [row] = await db
    .select()
    .from(jarvisApprovalsTable)
    .where(
      and(
        eq(jarvisApprovalsTable.subjectType, SUBJECT_TYPE),
        eq(jarvisApprovalsTable.subjectId, briefingId),
      ),
    )
    .orderBy(desc(jarvisApprovalsTable.createdAt))
    .limit(1);
  return row ?? null;
}

async function recordBriefingEvaluation(
  briefing: JarvisBriefing,
  decision: BriefingPublishDecision,
  reason: string,
  approvalId: string | null,
): Promise<string> {
  const [row] = await db
    .insert(jarvisPolicyEvaluationsTable)
    .values({
      policyId: null,
      policyName: "briefing_publish_gate",
      subjectType: SUBJECT_TYPE,
      subjectId: briefing.id,
      agentType: "cognition",
      action: "publish",
      decision,
      reason,
      approvalId,
      trustScoreAtEval: briefing.groundingScore ?? null,
      budgetSnapshot: null,
    })
    .returning({ id: jarvisPolicyEvaluationsTable.id });
  return row!.id;
}

/**
 * Pure-ish decision: does this briefing need approval before publish? Considers
 * source mode + grounding only (no live DB read). Approval-history short-circuit
 * is applied by `publishBriefing`.
 */
export function evaluateBriefingPublish(briefing: JarvisBriefing): {
  decision: BriefingPublishDecision;
  reason: string;
  threshold: number;
} {
  const threshold = minGroundingThreshold();
  if (briefing.sourceMode !== "cognition") {
    return {
      decision: "allow",
      reason: "human-authored briefing — no grounding gate",
      threshold,
    };
  }
  const score = briefing.groundingScore;
  if (score == null) {
    return {
      decision: "require_approval",
      reason: "cognition briefing has no grounding score — approval required",
      threshold,
    };
  }
  if (score < threshold) {
    return {
      decision: "require_approval",
      reason: `grounding ${score} < required ${threshold} — approval required`,
      threshold,
    };
  }
  return {
    decision: "allow",
    reason: `grounding ${score} ≥ required ${threshold}`,
    threshold,
  };
}

/**
 * Run the governed publish. Returns the outcome; only flips the briefing to
 * "published" when the decision resolves to allow (directly or via an existing
 * approved approval). On require_approval the briefing stays a visible draft and
 * a pending approval is created (or reused).
 */
export async function publishBriefing(
  briefing: JarvisBriefing,
  actorEmail: string | null,
): Promise<BriefingPublishOutcome> {
  const base = evaluateBriefingPublish(briefing);

  // Approval-history short-circuit: a resolved approval governs the outcome.
  if (base.decision === "require_approval") {
    const existing = await latestApproval(briefing.id);
    if (existing?.status === "approved") {
      const reason = "approved by governance — publishing";
      const published = await markPublished(briefing);
      const evaluationId = await recordBriefingEvaluation(
        published ?? briefing,
        "allow",
        reason,
        existing.id,
      );
      return {
        decision: "allow",
        reason,
        groundingScore: briefing.groundingScore,
        threshold: base.threshold,
        approvalId: existing.id,
        evaluationId,
        briefing: published,
      };
    }
    if (existing?.status === "pending") {
      const evaluationId = await recordBriefingEvaluation(
        briefing,
        "require_approval",
        base.reason,
        existing.id,
      );
      return {
        decision: "require_approval",
        reason: base.reason,
        groundingScore: briefing.groundingScore,
        threshold: base.threshold,
        approvalId: existing.id,
        evaluationId,
        briefing: null,
      };
    }
    // No usable approval — create one and pause publish.
    const [approval] = await db
      .insert(jarvisApprovalsTable)
      .values({
        title: `Publish briefing: ${briefing.title}`,
        description: base.reason,
        status: "pending",
        requestedBy: actorEmail ?? "governance",
        businessId: briefing.businessId ?? null,
        subjectType: SUBJECT_TYPE,
        subjectId: briefing.id,
        autoGenerated: true,
        decisionReason: base.reason,
      })
      .returning({ id: jarvisApprovalsTable.id });
    const evaluationId = await recordBriefingEvaluation(
      briefing,
      "require_approval",
      base.reason,
      approval?.id ?? null,
    );
    return {
      decision: "require_approval",
      reason: base.reason,
      groundingScore: briefing.groundingScore,
      threshold: base.threshold,
      approvalId: approval?.id ?? null,
      evaluationId,
      briefing: null,
    };
  }

  // Allowed outright.
  const published = await markPublished(briefing);
  const evaluationId = await recordBriefingEvaluation(
    published ?? briefing,
    "allow",
    base.reason,
    null,
  );
  return {
    decision: "allow",
    reason: base.reason,
    groundingScore: briefing.groundingScore,
    threshold: base.threshold,
    approvalId: null,
    evaluationId,
    briefing: published,
  };
}

async function markPublished(
  briefing: JarvisBriefing,
): Promise<JarvisBriefing | null> {
  const [row] = await db
    .update(jarvisBriefingsTable)
    .set({
      status: "published",
      publishedAt: briefing.publishedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jarvisBriefingsTable.id, briefing.id))
    .returning();
  return row ?? null;
}
