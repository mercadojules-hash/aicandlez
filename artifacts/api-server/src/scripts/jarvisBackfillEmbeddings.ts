/**
 * Admin backfill script — Sprint 9 (M3). Drives the deterministic embedding
 * indexer to convergence from the CLI, as an alternative to the admin
 * `POST /api/jarvis/cognition/semantic/backfill` route (same `runIndexerPass`).
 *
 * Idempotent: re-running on an unchanged corpus embeds nothing. Bounded per
 * iteration; loops until a pass upserts nothing (converged) or the cognition
 * budget is exceeded. NEVER touches AICandlez — Jarvis `jarvis_embeddings` only.
 *
 * Run: `pnpm --filter @workspace/api-server run jarvis:backfill-embeddings`
 * Requires `OPENAI_API_KEY` (direct OpenAI egress; see embeddings.ts). Without it
 * the pass degrades to a no-op (embed → {ok:false}) and the script exits cleanly.
 */

import { runIndexerPass } from "../lib/jarvis/cognition/indexer.js";

const PER_PASS_LIMIT = 64;
const MAX_PASSES = 100;

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[jarvis-backfill] OPENAI_API_KEY not set — embeddings unavailable; nothing to do.",
    );
    return;
  }

  let totalUpserted = 0;
  let totalScanned = 0;
  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    const result = await runIndexerPass({ limit: PER_PASS_LIMIT });
    totalUpserted += result.upserted;
    totalScanned = result.scanned;
    console.log(
      `[jarvis-backfill] pass ${pass}: scanned=${result.scanned} ` +
        `upserted=${result.upserted} skipped=${result.skipped} ` +
        `empty=${result.empty} budgetExceeded=${result.budgetExceeded} ` +
        `error=${result.error ?? "none"}`,
    );
    if (result.budgetExceeded) {
      console.warn("[jarvis-backfill] cognition budget exceeded — stopping.");
      break;
    }
    if (result.errored) {
      console.error("[jarvis-backfill] embed error — stopping.");
      break;
    }
    if (result.upserted === 0) {
      console.log("[jarvis-backfill] converged — corpus fully embedded.");
      break;
    }
  }
  console.log(
    `[jarvis-backfill] done. total upserted=${totalUpserted} (last scan=${totalScanned}).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[jarvis-backfill] fatal", err);
    process.exit(1);
  });
