import { db } from "@workspace/db";
import {
  jarvisBusinessesTable,
  jarvisBrandProfilesTable,
  type JarvisBusiness,
  type JarvisBrandProfile,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { retrieve } from "../cognition/retrieval.js";
import type { RetrievalResult, ThinkInput } from "../cognition/types.js";

/**
 * Brand context loader for the Creative Intelligence Division. Assembles the
 * grounding a creative agent reasons from:
 *   1. Business Registry row (jarvis_businesses) — manual, honest facts only.
 *   2. per-business Brand Profile (jarvis_brand_profiles) — voice, palette,
 *      positioning, guardrails.
 *   3. Executive Memory retrieval (cognition `retrieve`) — citable memory/asset/
 *      decision/task refs that ground claims and drive the grounding score.
 *
 * The business + brand blocks are STRUCTURED CONTEXT injected verbatim into the
 * prompt. They are NOT graph nodes, so they never inflate grounding — grounding
 * is measured only against the retrieved corpus refs (decision: brand/registry
 * are guidance, memory is the citable evidence). Never fabricates: unset profile
 * fields are simply omitted.
 */

export interface BrandContext {
  business: JarvisBusiness | null;
  brandProfile: JarvisBrandProfile | null;
  retrieval: RetrievalResult;
}

export async function loadBusiness(
  businessId: string,
): Promise<JarvisBusiness | null> {
  const [row] = await db
    .select()
    .from(jarvisBusinessesTable)
    .where(eq(jarvisBusinessesTable.id, businessId))
    .limit(1);
  return row ?? null;
}

export async function loadBrandProfile(
  businessId: string,
): Promise<JarvisBrandProfile | null> {
  const [row] = await db
    .select()
    .from(jarvisBrandProfilesTable)
    .where(eq(jarvisBrandProfilesTable.businessId, businessId))
    .limit(1);
  return row ?? null;
}

/**
 * Load the full brand context for a creative task. Retrieval is scoped to the
 * business + executive (BOOST, never a hard filter — org-global memory stays
 * available) and seeded with brand keywords so brand-relevant memory surfaces.
 */
export async function loadBrandContext(args: {
  businessId: string;
  query: string;
  instructions?: string | null;
  executiveUserId?: string | null;
  maxDocs?: number;
}): Promise<BrandContext> {
  const [business, brandProfile] = await Promise.all([
    loadBusiness(args.businessId),
    loadBrandProfile(args.businessId),
  ]);

  const keywordSeed = [
    brandProfile?.brandName,
    business?.name,
    ...(brandProfile?.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  const retrievalInput: ThinkInput = {
    kind: "briefing",
    query: `${args.query} ${keywordSeed}`.trim(),
    instructions: args.instructions ?? null,
    businessId: args.businessId,
    executiveUserId: args.executiveUserId ?? null,
    maxDocs: args.maxDocs ?? 10,
  };

  const retrieval = await retrieve(retrievalInput);
  return { business, brandProfile, retrieval };
}

/** Honest, dash-free registry block. Unset manual fields are omitted entirely. */
export function buildBusinessBlock(business: JarvisBusiness | null): string {
  if (!business) return "BUSINESS: (not found in registry)";
  const lines: string[] = [`Name: ${business.name}`];
  if (business.description?.trim()) lines.push(`About: ${business.description.trim()}`);
  if (business.status?.trim()) lines.push(`Status: ${business.status.trim()}`);
  if (business.healthStatus?.trim())
    lines.push(`Health: ${business.healthStatus.trim()}`);
  if (
    typeof business.monthlyRevenue === "number" &&
    Number.isFinite(business.monthlyRevenue)
  ) {
    lines.push(
      `Monthly revenue (manual estimate): $${Math.round(
        business.monthlyRevenue,
      ).toLocaleString("en-US")}`,
    );
  }
  return ["BUSINESS REGISTRY:", lines.join("\n")].join("\n");
}

/** Brand system block — every set field is fed verbatim; unset fields omitted. */
export function buildBrandBlock(profile: JarvisBrandProfile | null): string {
  if (!profile) {
    return "BRAND PROFILE: (none on file — keep the tone institutional and on-brand; do not invent brand attributes)";
  }
  const lines: string[] = [`Brand: ${profile.brandName}`];
  if (profile.tagline?.trim()) lines.push(`Tagline: ${profile.tagline.trim()}`);
  if (profile.positioning?.trim())
    lines.push(`Positioning: ${profile.positioning.trim()}`);
  if (profile.targetAudience?.trim())
    lines.push(`Audience: ${profile.targetAudience.trim()}`);
  if (profile.voice?.trim()) lines.push(`Voice: ${profile.voice.trim()}`);
  if (profile.tone?.trim()) lines.push(`Tone: ${profile.tone.trim()}`);
  if (profile.valueProps?.length)
    lines.push(`Value props: ${profile.valueProps.join("; ")}`);
  if (profile.keywords?.length)
    lines.push(`Keywords: ${profile.keywords.join(", ")}`);
  if (profile.palette?.length) {
    lines.push(
      `Palette: ${profile.palette
        .map((c) => (c.name ? `${c.name} ${c.hex}` : c.hex))
        .join(", ")}`,
    );
  }
  if (profile.dos?.length) lines.push(`DO: ${profile.dos.join("; ")}`);
  if (profile.donts?.length) lines.push(`DON'T: ${profile.donts.join("; ")}`);
  if (profile.notes?.trim()) lines.push(`Notes: ${profile.notes.trim()}`);
  return ["BRAND PROFILE:", lines.join("\n")].join("\n");
}
