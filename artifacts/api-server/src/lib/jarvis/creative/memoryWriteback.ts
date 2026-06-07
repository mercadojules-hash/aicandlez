import { db } from "@workspace/db";
import {
  jarvisMemoriesTable,
  jarvisKnowledgeAssetsTable,
  jarvisKnowledgeRelationshipsTable,
  type JarvisCreativeCampaign,
  type JarvisCreativeAsset,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { RetrievedRef } from "../cognition/types.js";

/**
 * Executive-memory writeback for the Creative Intelligence Division. Two tiers,
 * both ADDITIVE + IDEMPOTENT and both wrapped fail-safe by callers:
 *
 *  1. `recordCampaignMemory` — a lightweight working-memory breadcrumb written
 *     when a campaign is DRAFTED. Deduped by (sourceType, sourceId) so re-runs
 *     converge on one row. Lets the executive system "remember" that a campaign
 *     exists without promoting unapproved creative copy into the citable corpus.
 *
 *  2. `promotePublishedAsset` — corpus-grade promotion run only when an asset is
 *     PUBLISHED (the governed action). Mirrors the published TEXT into
 *     `jarvis_knowledge_assets` (idempotent via the unique `source_path`) and
 *     links it to the refs the campaign cited (`derived_from` edges). Binary
 *     assets (image/video) are NEVER promoted as bytes — only a metadata pointer.
 */

export const CAMPAIGN_MEMORY_SOURCE = "creative_campaign";
const VALID_EDGE_TYPES: ReadonlySet<string> = new Set([
  "memory",
  "asset",
  "category",
  "decision",
  "task",
]);

function campaignMemoryContent(campaign: JarvisCreativeCampaign): string {
  const lines: string[] = [`Marketing campaign drafted: ${campaign.name}`];
  if (campaign.objective?.trim()) lines.push(`Objective: ${campaign.objective.trim()}`);
  if (campaign.channel?.trim()) lines.push(`Channel: ${campaign.channel.trim()}`);
  if (typeof campaign.durationDays === "number")
    lines.push(`Duration: ${campaign.durationDays} days`);
  if (typeof campaign.groundingScore === "number")
    lines.push(`Grounding: ${campaign.groundingScore}`);
  return lines.join("\n");
}

/** Upsert a working-memory breadcrumb for a drafted campaign (idempotent). */
export async function recordCampaignMemory(
  campaign: JarvisCreativeCampaign,
  createdBy: string | null,
): Promise<void> {
  const title = `Campaign: ${campaign.name}`.slice(0, 200);
  const content = campaignMemoryContent(campaign);
  await db
    .insert(jarvisMemoriesTable)
    .values({
      title,
      content,
      memoryType: "event",
      importance: "normal",
      businessId: campaign.businessId ?? null,
      sourceType: CAMPAIGN_MEMORY_SOURCE,
      sourceId: campaign.id,
      pinned: false,
      tags: ["marketing", "campaign", "prometheus"],
      createdBy: createdBy ?? "jarvis-prometheus",
    })
    .onConflictDoUpdate({
      target: [jarvisMemoriesTable.sourceType, jarvisMemoriesTable.sourceId],
      set: {
        title,
        content,
        businessId: campaign.businessId ?? null,
        updatedAt: new Date(),
      },
    });
}

/** Synthetic unique source key for a promoted creative asset. */
function assetSourcePath(assetId: string): string {
  return `creative-asset://${assetId}`;
}

/**
 * Promote a PUBLISHED text asset into the knowledge corpus + link it to its
 * cited refs. Idempotent via the unique `source_path`. TEXT ONLY: binary assets
 * (image/video) are NEVER promoted — neither bytes nor a metadata pointer — so
 * the citable corpus stays purely textual. Returns the knowledge-asset id (or
 * null if the asset is binary / has no text / on failure).
 */
export async function promotePublishedAsset(
  asset: JarvisCreativeAsset,
): Promise<string | null> {
  if (asset.kind === "image" || asset.kind === "video") return null;
  try {
    const sourcePath = assetSourcePath(asset.id);
    const content = (asset.bodyText ?? asset.rationale ?? "").trim();
    if (!content) return null;

    const [row] = await db
      .insert(jarvisKnowledgeAssetsTable)
      .values({
        title: asset.title.slice(0, 200),
        summary: asset.rationale ?? null,
        content,
        assetType: "marketing_asset",
        sourcePath,
        businessId: asset.businessId ?? null,
        tags: ["marketing", asset.agent, asset.kind],
        createdBy: asset.createdBy ?? "jarvis-prometheus",
      })
      .onConflictDoUpdate({
        target: jarvisKnowledgeAssetsTable.sourcePath,
        set: {
          title: asset.title.slice(0, 200),
          summary: asset.rationale ?? null,
          content,
          businessId: asset.businessId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: jarvisKnowledgeAssetsTable.id });

    const knowledgeAssetId = row?.id ?? null;
    if (knowledgeAssetId) {
      await linkAssetToCitations(
        knowledgeAssetId,
        (asset.citations ?? []) as RetrievedRef[],
        asset.createdBy ?? "jarvis-prometheus",
      );
    }
    return knowledgeAssetId;
  } catch {
    // Writeback must never break the governed publish flow.
    return null;
  }
}

/** Create `derived_from` edges from the promoted asset to each cited ref. */
async function linkAssetToCitations(
  knowledgeAssetId: string,
  citations: RetrievedRef[],
  createdBy: string,
): Promise<void> {
  for (const ref of citations) {
    if (!VALID_EDGE_TYPES.has(ref.type)) continue;
    const existing = await db
      .select({ id: jarvisKnowledgeRelationshipsTable.id })
      .from(jarvisKnowledgeRelationshipsTable)
      .where(
        and(
          eq(jarvisKnowledgeRelationshipsTable.sourceType, "asset"),
          eq(jarvisKnowledgeRelationshipsTable.sourceId, knowledgeAssetId),
          eq(jarvisKnowledgeRelationshipsTable.targetType, ref.type),
          eq(jarvisKnowledgeRelationshipsTable.targetId, ref.id),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(jarvisKnowledgeRelationshipsTable).values({
      sourceType: "asset",
      sourceId: knowledgeAssetId,
      targetType: ref.type,
      targetId: ref.id,
      relationType: "derived_from",
      note: "promoted creative asset grounding",
      createdBy,
    });
  }
}
