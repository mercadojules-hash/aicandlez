/**
 * Deterministic embedding INDEXER — Sprint 9 (M3). The control-plane process that
 * keeps `jarvis_embeddings` (a DERIVED read index) in sync with the knowledge
 * corpus. It is the ONLY writer of that table.
 *
 * Invariants honoured:
 * - DETERMINISTIC + IDEMPOTENT: a canonical text builder per subject type + a
 *   contentHash. A row is (re)embedded ONLY when missing or when its hash differs;
 *   an unchanged corpus produces zero embedding calls on a re-run.
 * - DERIVED, NOT CORPUS: the indexer never mutates a source `jarvis_` row. It
 *   upserts the embedding in place (no delete), so the corpus no-delete invariant
 *   is untouched.
 * - BOUNDED: each pass processes at most `limit` subjects and batches embed calls,
 *   so a tick pass or a single admin click stays cheap and predictable.
 * - BUDGETED + FAIL-SAFE: every batch is gated by the shared cognition budget
 *   (`jarvis_budgets` scopeType="cognition"); a budget hit or an embed failure
 *   stops the pass and is recorded — it NEVER throws into the caller (tick/route).
 * - OFF BY DEFAULT: semantic retrieval + the optional indexer tick pass are gated
 *   by `jarvis_settings` flags that default to false.
 *
 * Embedding egress detail (direct OpenAI, not the managed proxy) lives in
 * `embeddings.ts`; spec: `.local/docs/jarvis-semantic-retrieval-architecture.md`.
 */

import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  jarvisEmbeddingsTable,
  jarvisKnowledgeAssetsTable,
  jarvisMemoriesTable,
  jarvisDecisionsTable,
  jarvisTasksTable,
  jarvisKnowledgeCategoriesTable,
  jarvisSettingsTable,
  jarvisCognitionRunsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { GraphNodeType } from "./types.js";
import {
  embed,
  recordEmbeddingRun,
  EMBEDDING_MODEL,
  EMBEDDING_MAX_BATCH,
} from "./embeddings.js";
import { checkCognitionBudget, consumeCognitionBudget } from "./budget.js";

/** Subject types the indexer maintains — the canonical citable graph nodes. */
export const INDEXED_SUBJECT_TYPES: readonly GraphNodeType[] = [
  "memory",
  "asset",
  "decision",
  "task",
  "category",
];

/** Cap canonical text so a single huge row cannot dominate embedding cost. */
const MAX_CANONICAL_CHARS = 8000;
const DEFAULT_PASS_LIMIT = 64;

// ── jarvis_settings toggles (default OFF) ───────────────────────────────────
export const SETTING_SEMANTIC_ENABLED = "cognition.semanticRetrieval.enabled";
export const SETTING_INDEXER_TICK_ENABLED = "cognition.semanticIndexer.tickEnabled";

async function readBoolSetting(key: string): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(jarvisSettingsTable)
      .where(eq(jarvisSettingsTable.key, key))
      .limit(1);
    return row?.value === true;
  } catch {
    return false;
  }
}

async function writeBoolSetting(
  key: string,
  enabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  await db
    .insert(jarvisSettingsTable)
    .values({ key, value: enabled, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: jarvisSettingsTable.key,
      set: { value: enabled, updatedBy, updatedAt: new Date() },
    });
}

/** Is hybrid semantic retrieval enabled? (default false). Never throws. */
export function getSemanticRetrievalEnabled(): Promise<boolean> {
  return readBoolSetting(SETTING_SEMANTIC_ENABLED);
}

export function setSemanticRetrievalEnabled(
  enabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  return writeBoolSetting(SETTING_SEMANTIC_ENABLED, enabled, updatedBy);
}

/** Should the runtime tick run a bounded indexer pass? (default false). */
export function getIndexerTickEnabled(): Promise<boolean> {
  return readBoolSetting(SETTING_INDEXER_TICK_ENABLED);
}

export function setIndexerTickEnabled(
  enabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  return writeBoolSetting(SETTING_INDEXER_TICK_ENABLED, enabled, updatedBy);
}

// ── canonical text + candidate loading ──────────────────────────────────────

interface Candidate {
  subjectType: GraphNodeType;
  subjectId: string;
  text: string;
  businessId: string | null;
  createdBy: string | null;
}

function clamp(text: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > MAX_CANONICAL_CHARS ? t.slice(0, MAX_CANONICAL_CHARS) : t;
}

/** Stable, human-meaningful concatenation. Field labels keep it deterministic. */
function joinFields(parts: Array<[string, string | null | undefined]>): string {
  return clamp(
    parts
      .filter(([, v]) => v && String(v).trim().length > 0)
      .map(([label, v]) => `${label}: ${String(v).trim()}`)
      .join("\n"),
  );
}

function contentHash(subjectType: string, text: string): string {
  return createHash("sha256").update(`${subjectType}\n${text}`).digest("hex");
}

async function loadCandidates(
  subjectType: GraphNodeType,
): Promise<Candidate[]> {
  switch (subjectType) {
    case "asset": {
      const rows = await db
        .select()
        .from(jarvisKnowledgeAssetsTable)
        .orderBy(desc(jarvisKnowledgeAssetsTable.updatedAt));
      return rows.map((r) => ({
        subjectType,
        subjectId: r.id,
        text: joinFields([
          ["Title", r.title],
          ["Summary", r.summary],
          ["Content", r.content],
        ]),
        businessId: r.businessId ?? null,
        createdBy: r.createdBy ?? null,
      }));
    }
    case "memory": {
      const rows = await db
        .select()
        .from(jarvisMemoriesTable)
        .orderBy(desc(jarvisMemoriesTable.updatedAt));
      return rows.map((r) => ({
        subjectType,
        subjectId: r.id,
        text: joinFields([
          ["Title", r.title],
          ["Content", r.content],
        ]),
        businessId: r.businessId ?? null,
        createdBy: r.createdBy ?? null,
      }));
    }
    case "decision": {
      const rows = await db
        .select()
        .from(jarvisDecisionsTable)
        .orderBy(desc(jarvisDecisionsTable.updatedAt));
      return rows.map((r) => ({
        subjectType,
        subjectId: r.id,
        text: joinFields([
          ["Title", r.title],
          ["Context", r.context],
          ["Decision", r.decision],
          ["Rationale", r.rationale],
        ]),
        businessId: r.businessId ?? null,
        createdBy: r.decidedBy ?? null,
      }));
    }
    case "task": {
      const rows = await db
        .select()
        .from(jarvisTasksTable)
        .orderBy(desc(jarvisTasksTable.updatedAt));
      return rows.map((r) => ({
        subjectType,
        subjectId: r.id,
        text: joinFields([
          ["Title", r.title],
          ["Description", r.description],
        ]),
        businessId: r.businessId ?? null,
        createdBy: null,
      }));
    }
    case "category": {
      const rows = await db
        .select()
        .from(jarvisKnowledgeCategoriesTable)
        .orderBy(desc(jarvisKnowledgeCategoriesTable.updatedAt));
      return rows.map((r) => ({
        subjectType,
        subjectId: r.id,
        text: joinFields([
          ["Name", r.name],
          ["Description", r.description],
        ]),
        businessId: null,
        createdBy: null,
      }));
    }
    default:
      return [];
  }
}

// ── indexer pass ────────────────────────────────────────────────────────────

export interface IndexerPassResult {
  ok: boolean;
  scanned: number;
  upserted: number;
  skipped: number;
  empty: number;
  budgetExceeded: boolean;
  errored: boolean;
  error: string | null;
  perType: Record<string, { upserted: number; skipped: number }>;
}

/**
 * Run one bounded indexer pass: scan candidates, (re)embed up to `limit` changed
 * subjects, upsert their vectors. Idempotent — a clean corpus upserts nothing.
 * Never throws.
 */
export async function runIndexerPass(opts?: {
  limit?: number;
  subjectTypes?: GraphNodeType[];
}): Promise<IndexerPassResult> {
  const limit = Math.max(1, opts?.limit ?? DEFAULT_PASS_LIMIT);
  const types = opts?.subjectTypes ?? [...INDEXED_SUBJECT_TYPES];
  const perType: Record<string, { upserted: number; skipped: number }> = {};
  for (const t of types) perType[t] = { upserted: 0, skipped: 0 };

  const result: IndexerPassResult = {
    ok: true,
    scanned: 0,
    upserted: 0,
    skipped: 0,
    empty: 0,
    budgetExceeded: false,
    errored: false,
    error: null,
    perType,
  };

  try {
    // Existing hashes for this model, keyed by `${type}:${id}`.
    const existing = await db
      .select({
        subjectType: jarvisEmbeddingsTable.subjectType,
        subjectId: jarvisEmbeddingsTable.subjectId,
        contentHash: jarvisEmbeddingsTable.contentHash,
      })
      .from(jarvisEmbeddingsTable)
      .where(eq(jarvisEmbeddingsTable.model, EMBEDDING_MODEL));
    const haveHash = new Map<string, string>();
    for (const e of existing) {
      haveHash.set(`${e.subjectType}:${e.subjectId}`, e.contentHash);
    }

    // Collect changed/missing subjects across requested types, bounded by limit.
    const pending: Array<Candidate & { hash: string }> = [];
    for (const type of types) {
      const candidates = await loadCandidates(type);
      for (const c of candidates) {
        result.scanned += 1;
        if (c.text.length === 0) {
          result.empty += 1;
          continue;
        }
        const hash = contentHash(c.subjectType, c.text);
        if (haveHash.get(`${c.subjectType}:${c.subjectId}`) === hash) {
          result.skipped += 1;
          perType[c.subjectType]!.skipped += 1;
          continue;
        }
        if (pending.length < limit) pending.push({ ...c, hash });
      }
    }

    if (pending.length === 0) return result;

    // Embed + upsert in batches; budget-gated per batch.
    for (let i = 0; i < pending.length; i += EMBEDDING_MAX_BATCH) {
      const batch = pending.slice(i, i + EMBEDDING_MAX_BATCH);

      const budget = await checkCognitionBudget();
      if (budget?.exceeded) {
        result.budgetExceeded = true;
        result.ok = false;
        await recordEmbeddingRun({
          status: "budget_exceeded",
          subjectCount: batch.length,
          params: { stage: "indexer", budget: budget.name },
        });
        break;
      }

      const embedResult = await embed(batch.map((b) => b.text));
      if (!embedResult.ok || embedResult.embeddings.length !== batch.length) {
        result.errored = true;
        result.ok = false;
        result.error = embedResult.error ?? "embed_failed";
        await recordEmbeddingRun({
          status: embedResult.error ? "error" : "degraded",
          subjectCount: batch.length,
          result: embedResult,
          params: { stage: "indexer" },
        });
        break;
      }

      for (let j = 0; j < batch.length; j += 1) {
        const c = batch[j]!;
        const vector = embedResult.embeddings[j]!;
        await db
          .insert(jarvisEmbeddingsTable)
          .values({
            subjectType: c.subjectType,
            subjectId: c.subjectId,
            model: EMBEDDING_MODEL,
            embedding: vector,
            contentHash: c.hash,
            businessId: c.businessId,
            createdBy: c.createdBy,
            status: "active",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              jarvisEmbeddingsTable.subjectType,
              jarvisEmbeddingsTable.subjectId,
              jarvisEmbeddingsTable.model,
            ],
            set: {
              embedding: vector,
              contentHash: c.hash,
              businessId: c.businessId,
              createdBy: c.createdBy,
              status: "active",
              updatedAt: new Date(),
            },
          });
        result.upserted += 1;
        perType[c.subjectType]!.upserted += 1;
      }

      await consumeCognitionBudget(embedResult.costMicros);
      await recordEmbeddingRun({
        status: "ok",
        subjectCount: batch.length,
        result: embedResult,
        params: { stage: "indexer" },
      });
    }

    return result;
  } catch (err) {
    return {
      ...result,
      ok: false,
      errored: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── coverage / status ───────────────────────────────────────────────────────

export interface SemanticStatus {
  enabled: boolean;
  indexerTickEnabled: boolean;
  model: string;
  hasApiKey: boolean;
  totals: { corpus: number; embedded: number };
  perType: Record<string, { corpus: number; embedded: number }>;
  lastRun: {
    status: string;
    createdAt: string;
    costMicros: number;
    error: string | null;
  } | null;
}

async function countCorpus(type: GraphNodeType): Promise<number> {
  const table = {
    asset: jarvisKnowledgeAssetsTable,
    memory: jarvisMemoriesTable,
    decision: jarvisDecisionsTable,
    task: jarvisTasksTable,
    category: jarvisKnowledgeCategoriesTable,
  }[type];
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table);
  return row?.n ?? 0;
}

/** Coverage + flags for the admin Cognition panel. Never throws. */
export async function getSemanticStatus(): Promise<SemanticStatus> {
  const perType: Record<string, { corpus: number; embedded: number }> = {};
  let corpusTotal = 0;
  let embeddedTotal = 0;

  const [enabled, indexerTickEnabled] = await Promise.all([
    getSemanticRetrievalEnabled(),
    getIndexerTickEnabled(),
  ]);

  for (const type of INDEXED_SUBJECT_TYPES) {
    let corpus = 0;
    let embedded = 0;
    try {
      corpus = await countCorpus(type);
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(jarvisEmbeddingsTable)
        .where(
          and(
            eq(jarvisEmbeddingsTable.model, EMBEDDING_MODEL),
            eq(jarvisEmbeddingsTable.subjectType, type),
          ),
        );
      embedded = row?.n ?? 0;
    } catch {
      // best-effort coverage
    }
    perType[type] = { corpus, embedded };
    corpusTotal += corpus;
    embeddedTotal += embedded;
  }

  let lastRun: SemanticStatus["lastRun"] = null;
  try {
    const [row] = await db
      .select()
      .from(jarvisCognitionRunsTable)
      .where(eq(jarvisCognitionRunsTable.kind, "embedding"))
      .orderBy(desc(jarvisCognitionRunsTable.createdAt))
      .limit(1);
    if (row) {
      lastRun = {
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        costMicros: row.costMicros,
        error: row.error,
      };
    }
  } catch {
    // best-effort
  }

  return {
    enabled,
    indexerTickEnabled,
    model: EMBEDDING_MODEL,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    totals: { corpus: corpusTotal, embedded: embeddedTotal },
    perType,
    lastRun,
  };
}
