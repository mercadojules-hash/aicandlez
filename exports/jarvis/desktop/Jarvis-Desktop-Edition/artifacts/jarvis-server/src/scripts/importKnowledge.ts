/**
 * Jarvis Desktop Edition — Knowledge Collection Importer
 * ------------------------------------------------------
 * Bulk-loads a folder of plain-text knowledge files (e.g. an Open WebUI
 * knowledge-collection export of *.txt / *.md) into the Jarvis Brain.
 *
 * What it does (and why, mapped to the live data model):
 *   1. Each file -> one row in `jarvis_knowledge_assets`. This is the canonical
 *      corpus the cognition indexer and Executive Query retrieve over. Rows are
 *      keyed by the UNIQUE `source_path` column, so re-running UPSERTS instead of
 *      duplicating (safe to run repeatedly / incrementally).
 *   2. (optional, --memories) also mirror each file into `jarvis_memories`
 *      (source_type/source_id keyed, idempotent) so the same content shows up in
 *      the executive memory corpus, not just the knowledge repository.
 *   3. Unless --no-embed, runs the deterministic cognition indexer
 *      (`runIndexerPass`) which computes vector embeddings and writes
 *      `jarvis_embeddings`. Embeddings require `OPENAI_API_KEY`
 *      (text-embedding-3-small, 1536 dims) — WITHOUT it the import still
 *      succeeds and Executive Query works in LEXICAL mode; only semantic
 *      similarity is unavailable.
 *   4. If embeddings were produced, enables the semantic-retrieval flag so
 *      Executive Query fuses lexical + vector results.
 *
 * Run from the package root (so the root .env is loaded):
 *   pnpm import:knowledge -- /absolute/path/to/Jarvis-Test
 *   pnpm import:knowledge -- /path/to/Jarvis-Test --memories
 *   pnpm import:knowledge -- /path/to/Jarvis-Test --no-embed
 *
 * Flags:
 *   --memories            also create a jarvis_memories row per file
 *   --no-embed            skip embedding generation (assets only)
 *   --tag=<tag>           extra tag added to every imported asset/memory
 *   --source-prefix=<p>   source_path namespace (default "import")
 *   --ext=<.txt,.md>      comma list of extensions to include (default .txt,.md)
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, relative, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { db, pool, jarvisKnowledgeAssetsTable, jarvisMemoriesTable } from "@workspace/db";
import type { GraphNodeType } from "../lib/jarvis/cognition/types.js";
import {
  runIndexerPass,
  setSemanticRetrievalEnabled,
} from "../lib/jarvis/cognition/index.js";

interface Options {
  dir: string;
  memories: boolean;
  embed: boolean;
  extraTag: string | null;
  sourcePrefix: string;
  exts: string[];
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  let memories = false;
  let embed = true;
  let extraTag: string | null = null;
  let sourcePrefix = "import";
  let exts = [".txt", ".md"];

  for (const a of argv) {
    if (a === "--memories") memories = true;
    else if (a === "--no-embed") embed = false;
    else if (a.startsWith("--tag=")) extraTag = a.slice("--tag=".length).trim() || null;
    else if (a.startsWith("--source-prefix="))
      sourcePrefix = a.slice("--source-prefix=".length).trim() || "import";
    else if (a.startsWith("--ext="))
      exts = a
        .slice("--ext=".length)
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .map((e) => (e.startsWith(".") ? e : `.${e}`));
    else if (!a.startsWith("--")) positional.push(a);
  }

  const dir = positional[0];
  if (!dir) {
    console.error(
      "Usage: pnpm import:knowledge -- <dir> [--memories] [--no-embed] [--tag=t] [--source-prefix=p] [--ext=.txt,.md]",
    );
    process.exit(2);
  }
  return { dir: resolve(dir), memories, embed, extraTag, sourcePrefix, exts };
}

/** Recursively collect files under `root` whose extension is in `exts`. */
async function collectFiles(root: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && exts.includes(extname(e.name).toLowerCase()))
        out.push(full);
    }
  }
  await walk(root);
  out.sort();
  return out;
}

/** First non-empty line as a title, else the filename (sans extension). */
function deriveTitle(content: string, path: string): string {
  for (const raw of content.split("\n").slice(0, 50)) {
    const line = raw.replace(/^#{1,6}\s+/, "").trim();
    if (line.length > 0) return line.slice(0, 200);
  }
  return basename(path).replace(/\.[^.]+$/, "").slice(0, 200);
}

/** First substantive paragraph for the summary (<= 280 chars). */
function deriveSummary(content: string): string | null {
  for (const raw of content.split("\n")) {
    const t = raw.trim();
    if (t.length > 0 && !t.startsWith("#")) return t.slice(0, 280);
  }
  return null;
}

/**
 * Stable, collision-resistant key for a file, used identically for the asset's
 * UNIQUE `source_path` (varchar 1024) and the memory's `source_id` (varchar
 * 255). Short, readable paths pass through verbatim; longer ones fall back to a
 * SHA-256 of the relative path so the key never overflows either column and two
 * distinct files can never collide on a truncated prefix.
 */
function deriveSourceKey(prefix: string, rel: string): string {
  const full = `${prefix}/${rel}`;
  if (full.length <= 255) return full;
  const hash = createHash("sha256").update(rel).digest("hex"); // 64 chars
  return `${prefix.slice(0, 180)}/${hash}`; // <= 180 + 1 + 64 = 245
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const info = await stat(opts.dir).catch(() => null);
  if (!info || !info.isDirectory()) {
    console.error(`Not a directory: ${opts.dir}`);
    process.exit(2);
  }

  const files = await collectFiles(opts.dir, opts.exts);
  console.log(
    `Scanning ${opts.dir}\nFound ${files.length} file(s) matching ${opts.exts.join(", ")}`,
  );
  if (files.length === 0) {
    console.log("Nothing to import.");
    process.exit(0);
  }

  const baseTags = ["imported", "knowledge-collection"];
  if (opts.extraTag) baseTags.push(opts.extraTag);

  let assetsUpserted = 0;
  let memoriesUpserted = 0;
  let skippedEmpty = 0;
  let failed = 0;

  for (const file of files) {
    const rel = relative(opts.dir, file);
    const sourceKey = deriveSourceKey(opts.sourcePrefix, rel);
    const sourceUrl = `file://${rel}`.slice(0, 2048);
    try {
      const content = (await readFile(file, "utf8")).trim();
      if (content.length === 0) {
        skippedEmpty += 1;
        continue;
      }
      const title = deriveTitle(content, file);
      const summary = deriveSummary(content);

      await db
        .insert(jarvisKnowledgeAssetsTable)
        .values({
          title,
          summary,
          content,
          assetType: "document",
          sourcePath: sourceKey,
          sourceUrl,
          tags: baseTags,
          status: "active",
          createdBy: "import-script",
        })
        .onConflictDoUpdate({
          target: jarvisKnowledgeAssetsTable.sourcePath,
          set: { title, summary, content, sourceUrl, status: "active", updatedAt: new Date() },
        });
      assetsUpserted += 1;

      if (opts.memories) {
        await db
          .insert(jarvisMemoriesTable)
          .values({
            title,
            content,
            memoryType: "fact",
            importance: "normal",
            sourceType: "knowledge-import",
            sourceId: sourceKey,
            tags: baseTags,
            status: "active",
            createdBy: "import-script",
          })
          .onConflictDoUpdate({
            target: [jarvisMemoriesTable.sourceType, jarvisMemoriesTable.sourceId],
            set: { title, content, status: "active", updatedAt: new Date() },
          });
        memoriesUpserted += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(`  ! failed ${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\nAssets upserted: ${assetsUpserted}` +
      (opts.memories ? `  |  Memories upserted: ${memoriesUpserted}` : "") +
      `  |  Skipped (empty): ${skippedEmpty}  |  Failed: ${failed}`,
  );

  if (!opts.embed) {
    console.log(
      "\n--no-embed set: skipping embedding generation. Executive Query will use LEXICAL retrieval.",
    );
    await closeAndExit(0);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log(
      "\nOPENAI_API_KEY not set: embeddings cannot be generated (the embedding provider is OpenAI text-embedding-3-small).\n" +
        "Import is complete and Executive Query works in LEXICAL mode. Set OPENAI_API_KEY and re-run to add semantic search.",
    );
    await closeAndExit(0);
    return;
  }

  console.log("\nGenerating embeddings (cognition indexer)…");
  const subjectTypes: GraphNodeType[] = opts.memories
    ? ["asset", "memory"]
    : ["asset"];
  let totalEmbedded = 0;
  for (let pass = 1; pass <= 100; pass += 1) {
    const r = await runIndexerPass({ subjectTypes, limit: 200 });
    totalEmbedded += r.upserted;
    console.log(
      `  pass ${pass}: scanned=${r.scanned} upserted=${r.upserted} skipped=${r.skipped}` +
        (r.errored ? ` errored=${r.error}` : "") +
        (r.budgetExceeded ? " budgetExceeded" : ""),
    );
    if (r.budgetExceeded || r.errored) break;
    if (r.upserted === 0) break;
  }
  console.log(`Embeddings written this run: ${totalEmbedded}`);

  if (totalEmbedded > 0) {
    await setSemanticRetrievalEnabled(true, "import-script");
    console.log("Semantic retrieval ENABLED. Executive Query now fuses lexical + vector results.");
  } else {
    console.log(
      "No new embeddings were written (already up to date, or the provider degraded). Lexical retrieval remains available.",
    );
  }

  await closeAndExit(0);
}

async function closeAndExit(code: number): Promise<void> {
  try {
    if (pool) await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

main().catch((err) => {
  console.error("import:knowledge failed:", err);
  process.exit(1);
});
