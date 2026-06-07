import { db } from "@workspace/db";
import {
  jarvisKnowledgeAssetsTable,
  jarvisMemoriesTable,
  jarvisDecisionsTable,
  jarvisTasksTable,
  jarvisKnowledgeCategoriesTable,
  jarvisKnowledgeRelationshipsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, ilike, or, type SQL } from "drizzle-orm";
import type {
  GraphNodeType,
  RetrievalResult,
  RetrievedDoc,
  RetrievedRef,
  ThinkInput,
} from "./types.js";

/**
 * Deterministic retrieval for cognition: LEXICAL match over the Jarvis knowledge
 * corpus, then ONE-HOP graph expansion via `jarvis_knowledge_relationships`. NO
 * embeddings, NO vector search (deferred to S9). Pure read; never mutates.
 *
 * The corpus + ref types are the canonical graph node types
 * (`memory`/`asset`/`decision`/`task`/`category`) so every retrieved ref is both
 * citable and graph-traversable.
 */

const DEFAULT_MAX_DOCS = 8;
const PER_TYPE_CANDIDATE_LIMIT = 40;
const MAX_EXPANSION_DOCS = 6;
const MAX_TEXT_CHARS = 1200;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "what", "when", "where",
  "which", "into", "over", "under", "about", "your", "our", "their", "are",
  "was", "were", "has", "have", "had", "will", "would", "should", "could",
  "can", "may", "might", "all", "any", "but", "not", "you", "they", "them",
  "his", "her", "its", "out", "who", "how", "why", "per", "via", "use",
]);

/** Lexical query → distinct lowercase terms (>=3 chars, no stopwords). */
export function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      (text ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  );
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function truncate(text: string): string {
  const trimmed = (text ?? "").trim();
  return trimmed.length > MAX_TEXT_CHARS
    ? `${trimmed.slice(0, MAX_TEXT_CHARS)}…`
    : trimmed;
}

/** Distinct query terms appearing anywhere in the candidate's searchable text. */
function lexicalScore(terms: string[], haystack: string): number {
  const hay = haystack.toLowerCase();
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score += 1;
  return score;
}

interface RawDoc {
  type: GraphNodeType;
  id: string;
  title: string;
  text: string;
}

function lexFilter(terms: string[], cols: SQL[]): SQL | undefined {
  const clauses: SQL[] = [];
  for (const c of cols) clauses.push(c);
  return clauses.length > 0 ? or(...clauses) : undefined;
}

async function fetchAssets(terms: string[]): Promise<RawDoc[]> {
  const t = jarvisKnowledgeAssetsTable;
  const where = lexFilter(
    terms,
    terms.flatMap((term) => [
      ilike(t.title, `%${escapeLike(term)}%`),
      ilike(t.summary, `%${escapeLike(term)}%`),
      ilike(t.content, `%${escapeLike(term)}%`),
    ]),
  );
  const rows = await db
    .select()
    .from(t)
    .where(where)
    .orderBy(desc(t.updatedAt))
    .limit(PER_TYPE_CANDIDATE_LIMIT);
  return rows.map((r) => ({
    type: "asset" as const,
    id: r.id,
    title: r.title,
    text: truncate([r.summary, r.content].filter(Boolean).join("\n")),
  }));
}

async function fetchMemories(terms: string[]): Promise<RawDoc[]> {
  const t = jarvisMemoriesTable;
  const where = lexFilter(
    terms,
    terms.flatMap((term) => [
      ilike(t.title, `%${escapeLike(term)}%`),
      ilike(t.content, `%${escapeLike(term)}%`),
    ]),
  );
  const rows = await db
    .select()
    .from(t)
    .where(where)
    .orderBy(desc(t.updatedAt))
    .limit(PER_TYPE_CANDIDATE_LIMIT);
  return rows.map((r) => ({
    type: "memory" as const,
    id: r.id,
    title: r.title,
    text: truncate(r.content ?? ""),
  }));
}

async function fetchDecisions(terms: string[]): Promise<RawDoc[]> {
  const t = jarvisDecisionsTable;
  const where = lexFilter(
    terms,
    terms.flatMap((term) => [
      ilike(t.title, `%${escapeLike(term)}%`),
      ilike(t.context, `%${escapeLike(term)}%`),
      ilike(t.decision, `%${escapeLike(term)}%`),
      ilike(t.rationale, `%${escapeLike(term)}%`),
    ]),
  );
  const rows = await db
    .select()
    .from(t)
    .where(where)
    .orderBy(desc(t.updatedAt))
    .limit(PER_TYPE_CANDIDATE_LIMIT);
  return rows.map((r) => ({
    type: "decision" as const,
    id: r.id,
    title: r.title,
    text: truncate(
      [r.context, r.decision, r.rationale].filter(Boolean).join("\n"),
    ),
  }));
}

async function fetchTasks(terms: string[]): Promise<RawDoc[]> {
  const t = jarvisTasksTable;
  const where = lexFilter(
    terms,
    terms.flatMap((term) => [
      ilike(t.title, `%${escapeLike(term)}%`),
      ilike(t.description, `%${escapeLike(term)}%`),
    ]),
  );
  const rows = await db
    .select()
    .from(t)
    .where(where)
    .orderBy(desc(t.updatedAt))
    .limit(PER_TYPE_CANDIDATE_LIMIT);
  return rows.map((r) => ({
    type: "task" as const,
    id: r.id,
    title: r.title,
    text: truncate(r.description ?? ""),
  }));
}

/** Resolve graph-expanded refs back into docs (one batched query per type). */
async function resolveRefs(refs: RetrievedRef[]): Promise<RawDoc[]> {
  const byType = new Map<GraphNodeType, string[]>();
  for (const r of refs) {
    const list = byType.get(r.type) ?? [];
    list.push(r.id);
    byType.set(r.type, list);
  }
  const out: RawDoc[] = [];
  for (const [type, ids] of byType) {
    if (ids.length === 0) continue;
    switch (type) {
      case "asset": {
        const rows = await db
          .select()
          .from(jarvisKnowledgeAssetsTable)
          .where(inArray(jarvisKnowledgeAssetsTable.id, ids));
        for (const r of rows)
          out.push({
            type,
            id: r.id,
            title: r.title,
            text: truncate([r.summary, r.content].filter(Boolean).join("\n")),
          });
        break;
      }
      case "memory": {
        const rows = await db
          .select()
          .from(jarvisMemoriesTable)
          .where(inArray(jarvisMemoriesTable.id, ids));
        for (const r of rows)
          out.push({ type, id: r.id, title: r.title, text: truncate(r.content ?? "") });
        break;
      }
      case "decision": {
        const rows = await db
          .select()
          .from(jarvisDecisionsTable)
          .where(inArray(jarvisDecisionsTable.id, ids));
        for (const r of rows)
          out.push({
            type,
            id: r.id,
            title: r.title,
            text: truncate(
              [r.context, r.decision, r.rationale].filter(Boolean).join("\n"),
            ),
          });
        break;
      }
      case "task": {
        const rows = await db
          .select()
          .from(jarvisTasksTable)
          .where(inArray(jarvisTasksTable.id, ids));
        for (const r of rows)
          out.push({ type, id: r.id, title: r.title, text: truncate(r.description ?? "") });
        break;
      }
      case "category": {
        const rows = await db
          .select()
          .from(jarvisKnowledgeCategoriesTable)
          .where(inArray(jarvisKnowledgeCategoriesTable.id, ids));
        for (const r of rows)
          out.push({
            type,
            id: r.id,
            title: r.name,
            text: truncate(r.description ?? ""),
          });
        break;
      }
    }
  }
  return out;
}

/** One-hop neighbours of the seed refs via the polymorphic relationship table. */
async function expandOneHop(seed: RetrievedRef[]): Promise<RetrievedRef[]> {
  if (seed.length === 0) return [];
  const clauses: SQL[] = [];
  for (const ref of seed) {
    clauses.push(
      and(
        eq(jarvisKnowledgeRelationshipsTable.sourceType, ref.type),
        eq(jarvisKnowledgeRelationshipsTable.sourceId, ref.id),
      )!,
    );
    clauses.push(
      and(
        eq(jarvisKnowledgeRelationshipsTable.targetType, ref.type),
        eq(jarvisKnowledgeRelationshipsTable.targetId, ref.id),
      )!,
    );
  }
  const edges = await db
    .select()
    .from(jarvisKnowledgeRelationshipsTable)
    .where(or(...clauses));

  const seedKeys = new Set(seed.map((r) => `${r.type}:${r.id}`));
  const VALID: ReadonlySet<string> = new Set([
    "memory", "asset", "category", "decision", "task",
  ]);
  const neighbours: RetrievedRef[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    for (const endpoint of [
      { type: e.sourceType, id: e.sourceId },
      { type: e.targetType, id: e.targetId },
    ]) {
      const key = `${endpoint.type}:${endpoint.id}`;
      if (seedKeys.has(key) || seen.has(key)) continue;
      if (!VALID.has(endpoint.type)) continue;
      seen.add(key);
      neighbours.push({ type: endpoint.type as GraphNodeType, id: endpoint.id });
    }
  }
  return neighbours.slice(0, MAX_EXPANSION_DOCS);
}

/**
 * Retrieve grounding context for a cognition task. Returns hop-0 lexical hits
 * plus hop-1 graph neighbours, and the flat ref set used for grounding scoring.
 */
export async function retrieve(input: ThinkInput): Promise<RetrievalResult> {
  const terms = tokenize(
    [input.query, input.instructions, input.period, input.audience]
      .filter(Boolean)
      .join(" "),
  );
  if (terms.length === 0) return { docs: [], refs: [] };

  const maxDocs = input.maxDocs ?? DEFAULT_MAX_DOCS;
  const candidates = (
    await Promise.all([
      fetchAssets(terms),
      fetchMemories(terms),
      fetchDecisions(terms),
      fetchTasks(terms),
    ])
  ).flat();

  const scored: RetrievedDoc[] = candidates
    .map((c) => ({
      ...c,
      score: lexicalScore(terms, `${c.title} ${c.text}`),
      hop: 0 as const,
    }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, maxDocs);

  const seedRefs: RetrievedRef[] = scored.map((d) => ({ type: d.type, id: d.id }));
  const hopRefs = await expandOneHop(seedRefs);
  const hopDocs = (await resolveRefs(hopRefs)).map<RetrievedDoc>((d) => ({
    ...d,
    score: 0,
    hop: 1,
  }));

  const docs = [...scored, ...hopDocs];
  const refs: RetrievedRef[] = docs.map((d) => ({ type: d.type, id: d.id }));
  return { docs, refs };
}
