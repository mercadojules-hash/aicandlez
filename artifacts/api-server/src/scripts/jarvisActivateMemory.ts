/**
 * Executive Memory Activation (CLI). One reusable, idempotent operation that:
 *   1. ENABLES hybrid semantic retrieval (`cognition.semanticRetrieval.enabled`)
 *      and the runtime indexer tick (`cognition.semanticIndexer.tickEnabled`).
 *   2. POPULATES executive memory from existing Jarvis knowledge sources
 *      (business profiles → `jarvis_memories`, deduped by source).
 *   3. RUNS the deterministic embedding indexer to convergence so the corpus is
 *      semantically retrievable.
 *
 * These are runtime DB facts (settings + rows), NOT code defaults — so this must
 * be run once per environment (dev now; prod at deploy against the prod DB).
 * Idempotent: re-running on an unchanged corpus embeds nothing and re-seeds
 * nothing new. NEVER touches AICandlez — Jarvis tables only.
 *
 * Run: `pnpm --filter @workspace/api-server run jarvis:activate-memory`
 *   add `-- --verify` to also run executive-style retrieval probes and print
 *   the grounding context each query resolves (read-only; for QA / status report).
 * Requires `OPENAI_API_KEY` for embeddings; without it the indexer degrades to a
 * no-op and semantic retrieval simply falls back to lexical.
 */

import {
  setSemanticRetrievalEnabled,
  setIndexerTickEnabled,
  runIndexerPass,
  getSemanticStatus,
  retrieve,
} from "../lib/jarvis/cognition/index.js";
import { backfillBusinessMemories } from "../lib/jarvis/memory.js";

const ACTOR = "jarvis-activate-memory";
const PER_PASS_LIMIT = 64;
const MAX_PASSES = 100;

/** Executive-style probes used only when `--verify` is passed. */
const VERIFY_QUERIES = [
  "What businesses am I running and how healthy are they?",
  "Which of my ventures generates the most monthly revenue?",
  "Give me a status overview of my portfolio of companies.",
];

async function activate(): Promise<void> {
  await setSemanticRetrievalEnabled(true, ACTOR);
  await setIndexerTickEnabled(true, ACTOR);
  console.log(
    "[activate-memory] semantic retrieval = ON, indexer tick = ON (jarvis_settings).",
  );

  const seed = await backfillBusinessMemories(ACTOR);
  console.log(
    `[activate-memory] business→memory backfill: processed=${seed.processed} failed=${seed.failed}.`,
  );

  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[activate-memory] OPENAI_API_KEY not set — skipping embedding indexer; " +
        "retrieval will run lexical-only until embeddings exist.",
    );
    return;
  }

  let totalUpserted = 0;
  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    const r = await runIndexerPass({ limit: PER_PASS_LIMIT });
    totalUpserted += r.upserted;
    console.log(
      `[activate-memory] indexer pass ${pass}: scanned=${r.scanned} ` +
        `upserted=${r.upserted} skipped=${r.skipped} empty=${r.empty} ` +
        `budgetExceeded=${r.budgetExceeded} error=${r.error ?? "none"}`,
    );
    if (r.budgetExceeded || r.errored || r.upserted === 0) break;
  }
  console.log(`[activate-memory] indexer total upserted=${totalUpserted}.`);

  const status = await getSemanticStatus();
  console.log(
    `[activate-memory] semantic status: ${JSON.stringify(status)}`,
  );
}

async function verify(): Promise<void> {
  console.log("\n[activate-memory] ── retrieval verification ──────────────");
  for (const query of VERIFY_QUERIES) {
    const { docs, refs } = await retrieve({ kind: "briefing", query });
    console.log(`\nQ: ${query}`);
    console.log(`   refs=${refs.length} docs=${docs.length}`);
    for (const d of docs) {
      const snippet = d.text.replace(/\s+/g, " ").slice(0, 140);
      console.log(
        `   - [${d.type} hop${d.hop} score=${d.score.toFixed(4)}] ${d.title} :: ${snippet}`,
      );
    }
  }
}

async function main(): Promise<void> {
  await activate();
  if (process.argv.includes("--verify")) await verify();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[activate-memory] fatal", err);
    process.exit(1);
  });
