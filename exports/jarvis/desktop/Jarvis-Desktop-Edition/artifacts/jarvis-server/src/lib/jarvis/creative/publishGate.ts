import { db } from "@workspace/db";
import {
  jarvisCreativeAssetsTable,
  jarvisApprovalsTable,
  jarvisPolicyEvaluationsTable,
  type JarvisCreativeAsset,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { promotePublishedAsset } from "./memoryWriteback.js";

/**
 * Governed publish gate for creative assets. Mirrors the briefing gate exactly
 * (decision D1: PUBLISH is the governed action, the draft never is) and REUSES
 * the existing governance tables (`jarvis_approvals` + `jarvis_policy_evaluations`)
 * by writing the polymorphic `subjectType="creative_asset"` directly — it does
 * NOT touch the orchestration `GovernedSubjectType` enum (locked invariant).
 *
 * Decision rule (D2): a cognition-authored asset whose grounding is weak/absent
 * requires human approval before publish; the draft stays visible throughout.
 * On a resolved allow, the published TEXT is promoted into the knowledge corpus
 * (memory writeback) — advisory-only, NO external posting ever happens here.
 */

const SUBJECT_TYPE = "creative_asset";
const DEFAULT_MIN_GROUNDING = 60;

function minGroundingThreshold(): number {
  const raw = process.env.JARVIS_COGNITION_MIN_GROUNDING;
  if (raw == null || raw.trim() === "") return DEFAULT_MIN_GROUNDING;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return DEFAULT_MIN_GROUNDING;
  return Math.round(n);
}

export type CreativePublishDecision = "allow" | "require_approval";

export interface CreativePublishOutcome {
  decision: CreativePublishDecision;
  reason: string;
  groundingScore: number | null;
  threshold: number;
  approvalId: string | null;
  evaluationId: string;
  asset: JarvisCreativeAsset | null;
}

async function latestApproval(assetId: string) {
  const [row] = await db
    .select()
    .from(jarvisApprovalsTable)
    .where(
      and(
        eq(jarvisApprovalsTable.subjectType, SUBJECT_TYPE),
        eq(jarvisApprovalsTable.subjectId, assetId),
      ),
    )
    .orderBy(desc(jarvisApprovalsTable.createdAt))
    .limit(1);
  return row ?? null;
}

async function recordAssetEvaluation(
  asset: JarvisCreativeAsset,
  decision: CreativePublishDecision,
  reason: string,
  approvalId: string | null,
): Promise<string> {
  const [row] = await db
    .insert(jarvisPolicyEvaluationsTable)
    .values({
      policyId: null,
      policyName: "creative_publish_gate",
      subjectType: SUBJECT_TYPE,
      subjectId: asset.id,
      agentType: asset.agent,
      action: "publish",
      decision,
      reason,
      approvalId,
      trustScoreAtEval: asset.groundingScore ?? null,
      budgetSnapshot: null,
    })
    .returning({ id: jarvisPolicyEvaluationsTable.id });
  return row!.id;
}

/**
 * Source + grounding decision (no DB read). Manual (human-authored) assets are
 * already vetted → allow. Cognition assets need a grounding score at/above the
 * threshold, else approval is required.
 */
export function evaluateCreativePublish(asset: JarvisCreativeAsset): {
  decision: CreativePublishDecision;
  reason: string;
  threshold: number;
} {
  const threshold = minGroundingThreshold();
  if (asset.sourceMode !== "cognition") {
    return {
      decision: "allow",
      reason: "human-authored creative asset — no grounding gate",
      threshold,
    };
  }
  const score = asset.groundingScore;
  if (score == null) {
    return {
      decision: "require_approval",
      reason: "cognition asset has no grounding score — approval required",
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

async function markPublished(
  asset: JarvisCreativeAsset,
): Promise<JarvisCreativeAsset | null> {
  const [row] = await db
    .update(jarvisCreativeAssetsTable)
    .set({
      status: "published",
      governanceState: "approved",
      publishedAt: asset.publishedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jarvisCreativeAssetsTable.id, asset.id))
    .returning();
  return row ?? null;
}

/**
 * Run the governed publish for a creative asset. Flips to "published" only when
 * the decision resolves to allow (directly or via an existing approved approval),
 * and promotes the published text into the knowledge corpus. On require_approval
 * the asset stays a visible draft and a pending approval is created/reused.
 */
export async function publishCreativeAsset(
  asset: JarvisCreativeAsset,
  actorEmail: string | null,
): Promise<CreativePublishOutcome> {
  const base = evaluateCreativePublish(asset);

  if (base.decision === "require_approval") {
    const existing = await latestApproval(asset.id);
    if (existing?.status === "approved") {
      const reason = "approved by governance — publishing";
      const published = await markPublished(asset);
      if (published) await promotePublishedAsset(published);
      const evaluationId = await recordAssetEvaluation(
        published ?? asset,
        "allow",
        reason,
        existing.id,
      );
      return {
        decision: "allow",
        reason,
        groundingScore: asset.groundingScore,
        threshold: base.threshold,
        approvalId: existing.id,
        evaluationId,
        asset: published,
      };
    }
    if (existing?.status === "pending") {
      const evaluationId = await recordAssetEvaluation(
        asset,
        "require_approval",
        base.reason,
        existing.id,
      );
      return {
        decision: "require_approval",
        reason: base.reason,
        groundingScore: asset.groundingScore,
        threshold: base.threshold,
        approvalId: existing.id,
        evaluationId,
        asset: null,
      };
    }
    const [approval] = await db
      .insert(jarvisApprovalsTable)
      .values({
        title: `Publish creative asset: ${asset.title}`.slice(0, 200),
        description: base.reason,
        status: "pending",
        requestedBy: actorEmail ?? "governance",
        businessId: asset.businessId ?? null,
        subjectType: SUBJECT_TYPE,
        subjectId: asset.id,
        autoGenerated: true,
        decisionReason: base.reason,
      })
      .returning({ id: jarvisApprovalsTable.id });
    await db
      .update(jarvisCreativeAssetsTable)
      .set({
        governanceState: "pending_approval",
        approvalId: approval?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(jarvisCreativeAssetsTable.id, asset.id));
    const evaluationId = await recordAssetEvaluation(
      asset,
      "require_approval",
      base.reason,
      approval?.id ?? null,
    );
    return {
      decision: "require_approval",
      reason: base.reason,
      groundingScore: asset.groundingScore,
      threshold: base.threshold,
      approvalId: approval?.id ?? null,
      evaluationId,
      asset: null,
    };
  }

  // Allowed outright.
  const published = await markPublished(asset);
  if (published) await promotePublishedAsset(published);
  const evaluationId = await recordAssetEvaluation(
    published ?? asset,
    "allow",
    base.reason,
    null,
  );
  return {
    decision: "allow",
    reason: base.reason,
    groundingScore: asset.groundingScore,
    threshold: base.threshold,
    approvalId: null,
    evaluationId,
    asset: published,
  };
}
