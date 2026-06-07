import { db } from "@workspace/db";
import { jarvisBriefingsTable, type JarvisBriefing } from "@workspace/db";
import { think } from "./index.js";
import type { CognitionStatus, RetrievedRef } from "./types.js";

/**
 * Briefing cognition surface (Sprint 8 vertical slice). `synthesizeBriefing`
 * turns a focus query into a DRAFT briefing via the advisory cognition plane.
 *
 * ADVISORY-ONLY: it only ever writes a `status="draft"` row tagged
 * `sourceMode="cognition"` and linked to its immutable cognition run. Publishing
 * is the governed action (decision D1) handled by `publishGate.ts` — synthesis
 * never publishes. On any non-"ok" cognition outcome (provider down, parse fail,
 * budget exhausted) NO draft is written, so the existing manual surface is left
 * exactly as it was (fail-safe).
 */

export interface SynthesizeBriefingInput {
  query: string;
  instructions?: string | null;
  period?: string | null;
  audience?: string | null;
  businessId?: string | null;
  createdBy?: string | null;
}

export interface SynthesizeBriefingResult {
  ok: boolean;
  status: CognitionStatus;
  briefing: JarvisBriefing | null;
  runId: string | null;
  groundingScore: number | null;
  citations: RetrievedRef[];
  reason: string | null;
}

export async function synthesizeBriefing(
  input: SynthesizeBriefingInput,
): Promise<SynthesizeBriefingResult> {
  const result = await think({
    kind: "briefing",
    query: input.query,
    instructions: input.instructions ?? null,
    period: input.period ?? null,
    audience: input.audience ?? null,
    businessId: input.businessId ?? null,
    createdBy: input.createdBy ?? null,
    agentType: "cognition",
  });

  // Fail-safe: degraded / error / budget_exceeded never produce a draft.
  if (result.status !== "ok" || !result.proposal) {
    return {
      ok: false,
      status: result.status,
      briefing: null,
      runId: result.runId,
      groundingScore: result.groundingScore,
      citations: result.citations,
      reason: result.degradedReason ?? result.error,
    };
  }

  const [briefing] = await db
    .insert(jarvisBriefingsTable)
    .values({
      title: result.proposal.title,
      summary: result.proposal.summary || null,
      content: result.proposal.content || null,
      period: input.period ?? "weekly",
      audience: input.audience ?? "executive",
      businessId: input.businessId ?? null,
      status: "draft",
      sourceMode: "cognition",
      cognitionRunId: result.runId,
      citations: result.citations,
      groundingScore: result.groundingScore,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return {
    ok: true,
    status: "ok",
    briefing: briefing ?? null,
    runId: result.runId,
    groundingScore: result.groundingScore,
    citations: result.citations,
    reason: null,
  };
}
