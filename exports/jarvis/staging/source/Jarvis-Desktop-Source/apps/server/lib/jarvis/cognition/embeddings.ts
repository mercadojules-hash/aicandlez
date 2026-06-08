/**
 * Embedding provider — Sprint 9. The ONLY place the cognition layer computes
 * vector embeddings for semantic retrieval.
 *
 * DEVIATION FROM THE MANAGED-PROXY INVARIANT (approved, documented):
 * The Replit AI Integrations proxy does NOT support the embeddings API — verified
 * across the OpenAI / Gemini / OpenRouter integration skills (all list embeddings
 * as unsupported), and Anthropic has no embeddings API at all. The S9 design
 * locked OpenAI `text-embedding-3-small` (1536 dims); with no managed path, this
 * provider calls the OpenAI SDK DIRECTLY using `OPENAI_API_KEY`. Rationale +
 * migration notes: `.local/docs/jarvis-semantic-retrieval-architecture.md` §3.
 *
 * Every other cognition invariant is preserved:
 * - LAZY import of the OpenAI SDK + key check INSIDE the call — a missing SDK or
 *   missing `OPENAI_API_KEY` must DEGRADE retrieval to lexical, never crash the
 *   api-server boot (which would take down the deterministic AICandlez plane).
 * - FAIL-SAFE: provider/timeout/parse failure resolves to `{ ok:false }`; this
 *   function NEVER throws. Embeddings are a derived read index — losing them only
 *   degrades retrieval quality, it never blocks or corrupts anything.
 * - OFF by default + admin-gated upstream (the indexer/retriever own the toggle).
 * - Cost is accounted to the existing cognition budget ledger
 *   (`jarvis_budgets` scopeType="cognition") and embedding calls are recorded to
 *   the immutable `jarvis_cognition_runs` audit ledger with kind="embedding".
 */

import { db } from "@workspace/db";
import { jarvisCognitionRunsTable, JARVIS_EMBEDDING_DIMS } from "@workspace/db";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = JARVIS_EMBEDDING_DIMS;
export const EMBEDDING_TIMEOUT_MS = 30_000;
/** Max inputs per OpenAI embeddings request (the indexer batches above this). */
export const EMBEDDING_MAX_BATCH = 96;

// text-embedding-3-small list price ≈ $0.02 / 1M tokens.
// In USD-micros per token: 0.02 / 1e6 USD-per-token ÷ 1e-6 USD-per-micro = 0.02.
// Used only for the cost_micros audit + cognition budget ledger — an estimate,
// never a billing source of truth.
const EMBED_MICROS_PER_TOKEN = 0.02;

export function estimateEmbeddingCostMicros(totalTokens: number): number {
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return 0;
  return Math.ceil(totalTokens * EMBED_MICROS_PER_TOKEN);
}

export interface EmbeddingResult {
  ok: boolean;
  /** One vector per input, in input order. Empty when `ok` is false. */
  embeddings: number[][];
  model: string;
  dims: number;
  totalTokens: number;
  costMicros: number;
  latencyMs: number;
  error: string | null;
}

function emptyResult(
  startedAt: number,
  error: string | null,
): EmbeddingResult {
  return {
    ok: false,
    embeddings: [],
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMS,
    totalTokens: 0,
    costMicros: 0,
    latencyMs: Date.now() - startedAt,
    error,
  };
}

/**
 * Compute embeddings for one or more input strings. Pure compute: it does NOT
 * consult or consume the budget and does NOT record a run — those belong to the
 * orchestrating indexer (M3), mirroring how `callModel` stays pure while
 * `think()` owns budget + audit. NEVER throws.
 */
export async function embed(
  inputs: string[],
  opts?: { timeoutMs?: number },
): Promise<EmbeddingResult> {
  const startedAt = Date.now();

  const texts = inputs
    .map((t) => (typeof t === "string" ? t : ""))
    .map((t) => t.trim());
  if (texts.length === 0) {
    return { ...emptyResult(startedAt, null), ok: true };
  }
  if (texts.some((t) => t.length === 0)) {
    return emptyResult(startedAt, "empty_input");
  }
  if (texts.length > EMBEDDING_MAX_BATCH) {
    return emptyResult(
      startedAt,
      `batch_too_large:${texts.length}>${EMBEDDING_MAX_BATCH}`,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return emptyResult(startedAt, "OPENAI_API_KEY missing");
  }

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey,
      timeout: opts?.timeoutMs ?? EMBEDDING_TIMEOUT_MS,
    });

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMS,
    });

    // Re-order by `index` defensively — the API returns input order, but we do
    // not want a silent misalignment between a vector and its subject.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== texts.length) {
      return emptyResult(
        startedAt,
        `count_mismatch:${ordered.length}!=${texts.length}`,
      );
    }
    const embeddings: number[][] = [];
    for (const item of ordered) {
      const vec = item.embedding;
      if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) {
        return emptyResult(
          startedAt,
          `bad_vector_dims:${Array.isArray(vec) ? vec.length : "n/a"}`,
        );
      }
      embeddings.push(vec);
    }

    const totalTokens = response.usage?.total_tokens ?? 0;
    return {
      ok: true,
      embeddings,
      model: EMBEDDING_MODEL,
      dims: EMBEDDING_DIMS,
      totalTokens,
      costMicros: estimateEmbeddingCostMicros(totalTokens),
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    return emptyResult(
      startedAt,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Convenience single-input wrapper. Returns the lone vector or null. */
export async function embedOne(
  input: string,
  opts?: { timeoutMs?: number },
): Promise<{ ok: boolean; embedding: number[] | null; result: EmbeddingResult }> {
  const result = await embed([input], opts);
  const embedding = result.ok && result.embeddings.length === 1
    ? result.embeddings[0]!
    : null;
  return { ok: result.ok && embedding !== null, embedding, result };
}

export interface RecordEmbeddingRunArgs {
  status: "ok" | "degraded" | "error" | "budget_exceeded" | "disabled";
  subjectCount: number;
  result?: EmbeddingResult | null;
  /** Extra structured context (e.g. backfill batch id, subjectType breakdown). */
  params?: Record<string, unknown>;
  createdBy?: string | null;
  error?: string | null;
}

/**
 * Append an embedding call to the immutable `jarvis_cognition_runs` audit ledger
 * (kind="embedding"). FAIL-SAFE: an audit insert failure must never break the
 * indexer flow, so it swallows errors and returns null.
 */
export async function recordEmbeddingRun(
  args: RecordEmbeddingRunArgs,
): Promise<string | null> {
  try {
    const r = args.result ?? null;
    const [row] = await db
      .insert(jarvisCognitionRunsTable)
      .values({
        kind: "embedding",
        model: r?.model ?? EMBEDDING_MODEL,
        params: {
          subjectCount: args.subjectCount,
          dims: r?.dims ?? EMBEDDING_DIMS,
          ...(args.params ?? {}),
        },
        inputTokens: r?.totalTokens ?? 0,
        outputTokens: 0,
        costMicros: r?.costMicros ?? 0,
        latencyMs: r?.latencyMs ?? null,
        status: args.status,
        error: args.error ?? r?.error ?? null,
        createdBy: args.createdBy ?? null,
      })
      .returning({ id: jarvisCognitionRunsTable.id });
    return row?.id ?? null;
  } catch {
    return null;
  }
}
