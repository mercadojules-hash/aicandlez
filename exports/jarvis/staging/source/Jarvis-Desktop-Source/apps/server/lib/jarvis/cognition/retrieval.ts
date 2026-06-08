import { db } from "@workspace/db";
import {
  jarvisKnowledgeAssetsTable,
  jarvisMemoriesTable,
  jarvisDecisionsTable,
  jarvisTasksTable,
  jarvisKnowledgeCategoriesTable,
  jarvisKnowledgeRelationshipsTable,
  jarvisEmbeddingsTable,
  jarvisCodeFilesTable,
} from "@workspace/db";
import { and, desc, eq, inArray, ilike, or, sql, type SQL } from "drizzle-orm";
import type {
  CitationNodeType,
  GraphNodeType,
  RetrievalResult,
  RetrievedDoc,
  RetrievedRef,
  ThinkInput,
} from "./types.js";
import { embedOne, EMBEDDING_MODEL } from "./embeddings.js";
import { getSemanticRetrievalEnabled } from "./indexer.js";

/**
 * HYBRID retrieval for cognition (Sprint 9). Combines:
 *   - LEXICAL match over the knowledge corpus (hop-0), and
 *   - SEMANTIC ANN search (pgvector cosine) over `jarvis_embeddings` (hop-0),
 * fused with Reciprocal Rank Fusion (RRF) + recency/importance/pinned boosts,
 * then ONE-HOP graph expansion via `jarvis_knowledge_relationships` (hop-1).
 *
 * Semantic is a STRICTLY ADDITIVE quality layer. It DEGRADES to the original
 * lexical-only behaviour whenever any of these hold (design §8):
 *   - the `cognition.semanticRetrieval.enabled` toggle is off (default),
 *   - the query embed fails (missing key / provider down / timeout),
 *   - the pgvector ANN query errors (extension absent),
 *   - there are no embeddings / no semantic hits.
 * The corpus + ref types are the canonical graph node types
 * (`memory`/`asset`/`decision`/`task`/`category`) so every retrieved ref is both
 * citable and graph-traversable. Pure read; never mutates.
 */

const DEFAULT_MAX_DOCS = 8;
const PER_TYPE_CANDIDATE_LIMIT = 40;
const SEMANTIC_CANDIDATE_LIMIT = 40;
const MAX_EXPANSION_DOCS = 6;
const MAX_TEXT_CHARS = 1200;
/** Query-focused snippet window (chars) + lead context before the first match. */
const SNIPPET_MAX_CHARS = 500;
const SNIPPET_LEAD_CHARS = 120;
/**
 * Code docs get a LARGER query-focused window than knowledge docs so cognition
 * sees enough surrounding source to reason (a 500-char window is too small for a
 * function body). The total prompt is still bounded by `MAX_CONTEXT_CHARS`.
 */
const CODE_SNIPPET_MAX_CHARS = 1600;
const CODE_SNIPPET_LEAD_CHARS = 240;
/** Bound on code candidates pulled into the lexical pool per query. */
const CODE_CANDIDATE_LIMIT = 12;
/** RRF dampening constant (Cormack et al. 2009). Higher = flatter rank weight. */
const RRF_K = 60;

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
  type: CitationNodeType;
  id: string;
  title: string;
  text: string;
  /** Boost metadata — present where the source row carries it. */
  updatedAt?: Date | null;
  importance?: string | null;
  pinned?: boolean | null;
  /** Ownership metadata for personalized (executive-scoped) recall boosts. */
  createdBy?: string | null;
  businessId?: string | null;
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
    updatedAt: r.updatedAt,
    createdBy: r.createdBy,
    businessId: r.businessId,
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
    updatedAt: r.updatedAt,
    importance: r.importance,
    pinned: r.pinned,
    createdBy: r.createdBy,
    businessId: r.businessId,
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
    updatedAt: r.updatedAt,
    createdBy: r.decidedBy,
    businessId: r.businessId,
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
    updatedAt: r.updatedAt,
    businessId: r.businessId,
  }));
}

/**
 * LEXICAL code candidates (Phase 1 code grounding). Matches the query terms over
 * path / summary / symbols / raw content of `jarvis_code_files`. Returns code
 * RawDocs whose text is the stored file content (windowed downstream by the code
 * snippet). `"code"` is a citation-only ref type — never graph-expanded or
 * embedded. Fail-safe to [] (a code-index miss must never break cognition).
 */
async function fetchCode(terms: string[]): Promise<RawDoc[]> {
  if (terms.length === 0) return [];
  const t = jarvisCodeFilesTable;
  try {
    const where = lexFilter(
      terms,
      terms.flatMap((term) => {
        const like = `%${escapeLike(term)}%`;
        return [
          ilike(t.path, like),
          ilike(t.summary, like),
          ilike(t.content, like),
          sql`${t.symbols}::text ILIKE ${like}`,
        ];
      }),
    );
    const rows = await db
      .select({
        id: t.id,
        path: t.path,
        summary: t.summary,
        content: t.content,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(where)
      .orderBy(desc(t.updatedAt))
      .limit(CODE_CANDIDATE_LIMIT);
    return rows.map((r) => ({
      type: "code" as const,
      id: r.id,
      title: r.path,
      // Prefer raw content; fall back to summary for metadata-only files. NOT
      // pre-truncated — the code snippet window keeps the matched region intact.
      text: (r.content ?? r.summary ?? "").trim(),
      updatedAt: r.updatedAt,
    }));
  } catch {
    return [];
  }
}

/** Resolve refs back into docs (one batched query per type), with boost meta. */
async function resolveRefs(refs: RetrievedRef[]): Promise<RawDoc[]> {
  const byType = new Map<CitationNodeType, string[]>();
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
            updatedAt: r.updatedAt,
            createdBy: r.createdBy,
            businessId: r.businessId,
          });
        break;
      }
      case "memory": {
        const rows = await db
          .select()
          .from(jarvisMemoriesTable)
          .where(inArray(jarvisMemoriesTable.id, ids));
        for (const r of rows)
          out.push({
            type,
            id: r.id,
            title: r.title,
            text: truncate(r.content ?? ""),
            updatedAt: r.updatedAt,
            importance: r.importance,
            pinned: r.pinned,
            createdBy: r.createdBy,
            businessId: r.businessId,
          });
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
            updatedAt: r.updatedAt,
            createdBy: r.decidedBy,
            businessId: r.businessId,
          });
        break;
      }
      case "task": {
        const rows = await db
          .select()
          .from(jarvisTasksTable)
          .where(inArray(jarvisTasksTable.id, ids));
        for (const r of rows)
          out.push({
            type,
            id: r.id,
            title: r.title,
            text: truncate(r.description ?? ""),
            updatedAt: r.updatedAt,
            businessId: r.businessId,
          });
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
            updatedAt: r.updatedAt,
          });
        break;
      }
      case "code": {
        // Code refs never arrive via semantic/hop (code is neither embedded nor
        // graph-linked), but resolve them for completeness so a re-resolved code
        // citation stays consistent. Content windowed downstream by the snippet.
        const rows = await db
          .select({
            id: jarvisCodeFilesTable.id,
            path: jarvisCodeFilesTable.path,
            summary: jarvisCodeFilesTable.summary,
            content: jarvisCodeFilesTable.content,
            updatedAt: jarvisCodeFilesTable.updatedAt,
          })
          .from(jarvisCodeFilesTable)
          .where(inArray(jarvisCodeFilesTable.id, ids));
        for (const r of rows)
          out.push({
            type,
            id: r.id,
            title: r.path,
            text: (r.content ?? r.summary ?? "").trim(),
            updatedAt: r.updatedAt,
          });
        break;
      }
    }
  }
  return out;
}

const VALID_NODE_TYPES: ReadonlySet<string> = new Set([
  "memory", "asset", "category", "decision", "task",
]);

/**
 * SEMANTIC candidates via pgvector ANN cosine search, ordered nearest-first.
 * Returns docs in similarity order, or `null` on ANY failure (embed failure,
 * pgvector absent, query error) so the caller degrades to lexical-only. Never
 * throws.
 */
async function semanticCandidates(query: string): Promise<RawDoc[] | null> {
  try {
    const { ok, embedding } = await embedOne(query);
    if (!ok || !embedding) return null;

    const vecLiteral = `[${embedding.join(",")}]`;
    const rows = await db
      .select({
        subjectType: jarvisEmbeddingsTable.subjectType,
        subjectId: jarvisEmbeddingsTable.subjectId,
      })
      .from(jarvisEmbeddingsTable)
      .where(
        and(
          eq(jarvisEmbeddingsTable.model, EMBEDDING_MODEL),
          eq(jarvisEmbeddingsTable.status, "active"),
        ),
      )
      .orderBy(sql`${jarvisEmbeddingsTable.embedding} <=> ${vecLiteral}::vector`)
      .limit(SEMANTIC_CANDIDATE_LIMIT);

    if (rows.length === 0) return [];

    // Preserve ANN order while resolving to full docs (resolveRefs is unordered).
    const orderedRefs: RetrievedRef[] = rows
      .filter((r) => VALID_NODE_TYPES.has(r.subjectType))
      .map((r) => ({ type: r.subjectType as GraphNodeType, id: r.subjectId }));
    const docs = await resolveRefs(orderedRefs);
    const byKey = new Map<string, RawDoc>();
    for (const d of docs) byKey.set(`${d.type}:${d.id}`, d);
    const ordered: RawDoc[] = [];
    for (const ref of orderedRefs) {
      const d = byKey.get(`${ref.type}:${ref.id}`);
      if (d) ordered.push(d);
    }
    return ordered;
  } catch {
    return null;
  }
}

/** Multiplicative boost from recency + importance + pinned. */
function boostFactor(doc: RawDoc): number {
  let f = 1;
  if (doc.updatedAt) {
    const days = (Date.now() - new Date(doc.updatedAt).getTime()) / 86_400_000;
    if (days <= 7) f *= 1.15;
    else if (days <= 30) f *= 1.08;
    else if (days <= 90) f *= 1.03;
  }
  if (doc.pinned) f *= 1.2;
  if (doc.importance === "critical") f *= 1.25;
  else if (doc.importance === "high") f *= 1.12;
  return f;
}

/**
 * Personalized (executive-scoped) recall boost. Pure BOOST, never a filter:
 * org-global corpus stays fully available (org→global default). When an
 * `executiveUserId` is supplied, that executive's own authored corpus is lifted;
 * a matching `businessId` lifts org-relevant corpus more gently.
 */
function personalBoost(doc: RawDoc, input: ThinkInput): number {
  let f = 1;
  if (
    input.executiveUserId &&
    doc.createdBy &&
    doc.createdBy === input.executiveUserId
  ) {
    f *= 1.3;
  }
  if (input.businessId && doc.businessId && doc.businessId === input.businessId) {
    f *= 1.1;
  }
  return f;
}

// `rank` is 0-based (forEach index); standard RRF uses 1-based rank, so +1.
const rrfWeight = (rank: number): number => 1 / (RRF_K + rank + 1);

/**
 * Fuse two rank lists with RRF, apply boosts (recency/importance/pinned +
 * personalized executive scope), return the top `maxDocs` as hop-0 docs. A doc
 * present in both lists accumulates both rank contributions.
 */
function fuse(
  lexical: RawDoc[],
  semantic: RawDoc[],
  maxDocs: number,
  input: ThinkInput,
): RetrievedDoc[] {
  const acc = new Map<string, { doc: RawDoc; rrf: number }>();
  const add = (doc: RawDoc, rank: number) => {
    const key = `${doc.type}:${doc.id}`;
    const existing = acc.get(key);
    if (existing) {
      existing.rrf += rrfWeight(rank);
      // Prefer the metadata-richer copy (e.g. memory importance/pinned).
      if (!existing.doc.updatedAt && doc.updatedAt) existing.doc = doc;
    } else {
      acc.set(key, { doc, rrf: rrfWeight(rank) });
    }
  };
  lexical.forEach((d, i) => add(d, i));
  semantic.forEach((d, i) => add(d, i));

  return [...acc.values()]
    .map((e) => ({
      e,
      score: e.rrf * boostFactor(e.doc) * personalBoost(e.doc, input),
    }))
    .sort((a, b) => b.score - a.score || a.e.doc.title.localeCompare(b.e.doc.title))
    .slice(0, maxDocs)
    .map(({ e, score }) => ({
      type: e.doc.type,
      id: e.doc.id,
      title: e.doc.title,
      text: e.doc.text,
      score,
      hop: 0 as const,
    }));
}

/**
 * Query-focused snippet: window the text around the FIRST matched query term so
 * the context block carries the relevant passage instead of an arbitrary head.
 * Falls back to a head slice when no term matches.
 */
function snippet(
  text: string,
  terms: string[],
  maxChars: number = SNIPPET_MAX_CHARS,
  leadChars: number = SNIPPET_LEAD_CHARS,
): string {
  const body = (text ?? "").trim();
  if (!body) return "";
  if (body.length <= maxChars) return body;
  if (terms.length === 0) return `${body.slice(0, maxChars)}…`;

  const lower = body.toLowerCase();
  let firstIdx = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (firstIdx === -1 || i < firstIdx)) firstIdx = i;
  }
  if (firstIdx === -1) return `${body.slice(0, maxChars)}…`;

  const start = Math.max(0, firstIdx - leadChars);
  const end = Math.min(body.length, start + maxChars);
  const pre = start > 0 ? "…" : "";
  const post = end < body.length ? "…" : "";
  return `${pre}${body.slice(start, end).trim()}${post}`;
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
  const neighbours: RetrievedRef[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    for (const endpoint of [
      { type: e.sourceType, id: e.sourceId },
      { type: e.targetType, id: e.targetId },
    ]) {
      const key = `${endpoint.type}:${endpoint.id}`;
      if (seedKeys.has(key) || seen.has(key)) continue;
      if (!VALID_NODE_TYPES.has(endpoint.type)) continue;
      seen.add(key);
      neighbours.push({ type: endpoint.type as GraphNodeType, id: endpoint.id });
    }
  }
  return neighbours.slice(0, MAX_EXPANSION_DOCS);
}

/**
 * Retrieve grounding context for a cognition task. Returns hop-0 hits (lexical
 * fused with semantic when enabled+available) plus hop-1 graph neighbours, and
 * the flat ref set used for grounding scoring.
 */
export async function retrieve(input: ThinkInput): Promise<RetrievalResult> {
  const queryText = [input.query, input.instructions, input.period, input.audience]
    .filter(Boolean)
    .join(" ");
  const terms = tokenize(queryText);

  const maxDocs = input.maxDocs ?? DEFAULT_MAX_DOCS;

  // LEXICAL candidates (hop-0), scored + ordered.
  const lexicalRaw = terms.length
    ? (
        await Promise.all([
          fetchAssets(terms),
          fetchMemories(terms),
          fetchDecisions(terms),
          fetchTasks(terms),
          fetchCode(terms),
        ])
      ).flat()
    : [];
  const lexicalSorted = lexicalRaw
    .map((c) => ({ doc: c, score: lexicalScore(terms, `${c.title} ${c.text}`) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
  const lexicalDocs = lexicalSorted.map((s) => s.doc);

  // SEMANTIC candidates (hop-0) — only when enabled AND available; null degrades.
  let semanticDocs: RawDoc[] | null = null;
  if (queryText.trim().length > 0 && (await getSemanticRetrievalEnabled())) {
    semanticDocs = await semanticCandidates(queryText);
  }

  // hop-0 set: fuse when semantic produced hits, else lexical-only (legacy),
  // both with recency/importance/pinned + personalized executive-scope boosts.
  let directDocs: RetrievedDoc[];
  if (semanticDocs && semanticDocs.length > 0) {
    directDocs = fuse(lexicalDocs, semanticDocs, maxDocs, input);
  } else {
    directDocs = lexicalSorted
      .map((s) => ({
        doc: s.doc,
        score: s.score * boostFactor(s.doc) * personalBoost(s.doc, input),
      }))
      .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
      .slice(0, maxDocs)
      .map(({ doc, score }) => ({
        type: doc.type,
        id: doc.id,
        title: doc.title,
        text: doc.text,
        score,
        hop: 0 as const,
      }));
  }

  if (directDocs.length === 0) return { docs: [], refs: [] };

  const seedRefs: RetrievedRef[] = directDocs.map((d) => ({ type: d.type, id: d.id }));
  const seedKeys = new Set(seedRefs.map((r) => `${r.type}:${r.id}`));
  const hopRefs = await expandOneHop(seedRefs);
  const hopDocs = (await resolveRefs(hopRefs))
    .filter((d) => !seedKeys.has(`${d.type}:${d.id}`))
    .map<RetrievedDoc>((d) => ({
      type: d.type,
      id: d.id,
      title: d.title,
      text: d.text,
      score: 0,
      hop: 1,
    }));

  // Query-focused snippets keep the context block tight + relevant (dedup is
  // already enforced by key across the fused + hop sets). Code docs get a wider
  // window so a function body survives; the total prompt stays bounded.
  const docs = [...directDocs, ...hopDocs].map((d) => ({
    ...d,
    text:
      d.type === "code"
        ? snippet(d.text, terms, CODE_SNIPPET_MAX_CHARS, CODE_SNIPPET_LEAD_CHARS)
        : snippet(d.text, terms),
  }));
  const refs: RetrievedRef[] = docs.map((d) => ({ type: d.type, id: d.id }));
  return { docs, refs };
}
