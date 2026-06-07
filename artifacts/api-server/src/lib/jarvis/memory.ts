import { db } from "@workspace/db";
import { jarvisBusinessesTable, jarvisMemoriesTable } from "@workspace/db";

/**
 * Executive-memory write-hooks. Turns durable Jarvis domain rows into entries in
 * `jarvis_memories` so they become part of the executive memory corpus — citable,
 * retrievable, and (via the deterministic indexer) embeddable for semantic recall.
 *
 * Businesses are the one core knowledge source that is NOT itself an indexer
 * subject type, so they are invisible to retrieval until mirrored into a memory.
 * These hooks close that gap. They are ADDITIVE + IDEMPOTENT (deduped by
 * `sourceType` + `sourceId`, mirroring the Memory Agent's finding-promotion) and
 * must NEVER fabricate metrics — manual fields that are unset are simply omitted.
 *
 * Callers are responsible for fail-safety: a memory write must never break the
 * primary domain mutation, so route hooks wrap these in `.catch(req.log.warn)`.
 */

/** `source_type` tag identifying a business-profile memory. */
export const BUSINESS_MEMORY_SOURCE = "business";

export interface BusinessMemoryInput {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  monthlyRevenue?: number | null;
  healthStatus?: string | null;
}

/**
 * Deterministic, honest profile text. Manual/optional fields are included ONLY
 * when set — an unset revenue or health status is omitted, never zero-filled or
 * guessed (null → dash invariant). AICandlez performance is sourced live
 * elsewhere and is intentionally not asserted here.
 */
function buildBusinessMemoryContent(b: BusinessMemoryInput): string {
  const lines: string[] = [];
  const description = b.description?.trim();
  if (description) lines.push(description);
  const status = b.status?.trim();
  if (status) lines.push(`Status: ${status}`);
  if (typeof b.monthlyRevenue === "number" && Number.isFinite(b.monthlyRevenue)) {
    lines.push(
      `Monthly revenue (manual estimate): $${Math.round(
        b.monthlyRevenue,
      ).toLocaleString("en-US")}`,
    );
  }
  const health = b.healthStatus?.trim();
  if (health) lines.push(`Health status: ${health}`);
  return lines.join("\n");
}

/**
 * Upsert the durable memory mirror of a business. Idempotent and race-safe via
 * an atomic ON CONFLICT against the `jarvis_memories_source_uq` unique index on
 * (source_type, source_id): concurrent backfill + route-hook writes for the same
 * business converge on a single row instead of duplicating. The indexer then
 * re-embeds only on real content changes. May throw — callers decide how to
 * handle failure (route hooks swallow + log).
 */
export async function recordBusinessMemory(
  business: BusinessMemoryInput,
  createdBy: string | null,
): Promise<void> {
  const title = `Business profile: ${business.name}`.slice(0, 200);
  const content = buildBusinessMemoryContent(business);

  await db
    .insert(jarvisMemoriesTable)
    .values({
      title,
      content: content || null,
      memoryType: "fact",
      importance: "high",
      businessId: business.id,
      sourceType: BUSINESS_MEMORY_SOURCE,
      sourceId: business.id,
      pinned: false,
      tags: ["business", "profile"],
      createdBy: createdBy ?? "jarvis-system",
    })
    .onConflictDoUpdate({
      target: [jarvisMemoriesTable.sourceType, jarvisMemoriesTable.sourceId],
      set: {
        title,
        content: content || null,
        businessId: business.id,
        updatedAt: new Date(),
      },
    });
}

/**
 * One-time / reusable backfill: mirror every existing business into a memory.
 * Idempotent via `recordBusinessMemory`. Returns the count processed. Used by
 * the activation script and safe to re-run (e.g. on prod at deploy).
 */
export async function backfillBusinessMemories(
  createdBy: string | null,
): Promise<{ processed: number; failed: number }> {
  const businesses = await db.select().from(jarvisBusinessesTable);
  let processed = 0;
  let failed = 0;
  for (const b of businesses) {
    try {
      await recordBusinessMemory(b, createdBy);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}
