import type { RetrievedRef } from "./types.js";

/**
 * Grounding = how much of the model's proposal is anchored to real retrieved
 * refs. It is a pure function of (cited refs) vs (retrieval set): the fraction of
 * citations that point at a ref actually present in retrieval, scaled 0..100.
 *
 * A proposal that cites nothing, or cites refs we never retrieved, scores low —
 * which routes PUBLISH to require_approval (decision D2). The draft itself always
 * stays visible; grounding only gates the governed publish action.
 */

function key(ref: RetrievedRef): string {
  return `${ref.type}:${ref.id}`;
}

/** Keep only citations that resolve to a retrieved ref (dedup, preserve order). */
export function validateCitations(
  citations: RetrievedRef[],
  retrievedRefs: RetrievedRef[],
): RetrievedRef[] {
  const allowed = new Set(retrievedRefs.map(key));
  const seen = new Set<string>();
  const out: RetrievedRef[] = [];
  for (const c of citations) {
    const k = key(c);
    if (!allowed.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * 0..100 grounding score. Zero citations OR zero retrieval ⇒ 0 (ungrounded).
 * Otherwise (valid citations / total citations) * 100, rounded.
 */
export function computeGroundingScore(
  citations: RetrievedRef[],
  retrievedRefs: RetrievedRef[],
): number {
  if (citations.length === 0 || retrievedRefs.length === 0) return 0;
  const allowed = new Set(retrievedRefs.map(key));
  const valid = citations.filter((c) => allowed.has(key(c))).length;
  return Math.round((valid / citations.length) * 100);
}
