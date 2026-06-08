import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  db,
  jarvisKnowledgeAssetsTable,
  jarvisRunbooksTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../logger.js";
import { runIndexerPass } from "../cognition/index.js";
import { resolveRepoRoot } from "./repoRoot.js";

/**
 * Jarvis Document & Runbook Ingestion (Sovereignty Pillar 1) — READ-ONLY over
 * the filesystem, writes confined to jarvis-owned tables.
 *
 * Reads a curated allowlist of operational docs (deployment, runbooks,
 * architecture, recovery, references) from the repo and upserts them into
 * `jarvis_knowledge_assets` (so the existing cognition indexer + Executive Query
 * retrieval pick them up automatically). Operational docs are additionally
 * mirrored into `jarvis_runbooks` for the Operational Control surface.
 *
 * Idempotent: each asset/runbook is keyed by `source_path`; unchanged content is
 * skipped (no churn). FAIL-SAFE: a missing/unreadable file is skipped and logged
 * — ingestion never throws to the route layer.
 */

export type IngestAssetType = "runbook" | "architecture" | "recovery" | "document";
export type RunbookKind =
  | "deployment"
  | "rollback"
  | "update"
  | "monitoring"
  | "operational"
  | "disaster_recovery"
  | "other";

interface DocManifestEntry {
  path: string;
  assetType: IngestAssetType;
  runbookKind?: RunbookKind;
}

/**
 * Curated manifest of high-value operational documents. Paths are repo-relative.
 * `runbookKind` (when set) also mirrors the doc into `jarvis_runbooks`.
 */
const DOC_MANIFEST: DocManifestEntry[] = [
  { path: "DEPLOYMENT.md", assetType: "runbook", runbookKind: "deployment" },
  {
    path: "artifacts/api-server/LIVE_EXECUTION_RUNBOOK.md",
    assetType: "runbook",
    runbookKind: "operational",
  },
  {
    path: "PRODUCTION_SAFETY.md",
    assetType: "runbook",
    runbookKind: "monitoring",
  },
  {
    path: "PRODUCTION_AUTH_CHECKLIST.md",
    assetType: "runbook",
    runbookKind: "operational",
  },
  { path: "replit.md", assetType: "architecture" },
  { path: "docs/aicandlez-system-architecture.md", assetType: "architecture" },
  { path: "docs/aicandlez-file-reference.md", assetType: "document" },
  { path: "docs/replit-history.md", assetType: "document" },
  { path: "README.md", assetType: "document" },
  { path: "SETUP.md", assetType: "document" },
  { path: "LAUNCH_READINESS.md", assetType: "document" },
];

/** Classify an auto-discovered doc path by filename heuristics. */
function classify(path: string): IngestAssetType {
  const p = path.toLowerCase();
  if (/(runbook|deploy|rollback|incident|oncall|on-call)/.test(p))
    return "runbook";
  if (/(architecture|design|system)/.test(p)) return "architecture";
  if (/(recovery|disaster|restore|backup)/.test(p)) return "recovery";
  return "document";
}

/** First markdown heading (`# ...`) or the filename as a title fallback. */
function deriveTitle(content: string, path: string): string {
  for (const line of content.split("\n").slice(0, 40)) {
    const m = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (m && m[1]) return m[1].slice(0, 200);
  }
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "").slice(0, 200);
}

/** First substantive prose paragraph, for the summary (≤ 280 chars). */
function deriveSummary(content: string): string | null {
  const lines = content.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (
      t.length > 0 &&
      !t.startsWith("#") &&
      !t.startsWith(">") &&
      !t.startsWith("|") &&
      !t.startsWith("```") &&
      !t.startsWith("-") &&
      !t.startsWith("*")
    ) {
      return t.slice(0, 280);
    }
  }
  return null;
}

export interface IngestFileResult {
  path: string;
  title: string | null;
  assetType: IngestAssetType;
  status: "created" | "updated" | "unchanged" | "missing" | "error";
  bytes: number | null;
  mirroredRunbook: boolean;
}

export interface IngestSummary {
  generatedAt: number;
  repoRoot: string;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  missing: number;
  errors: number;
  indexed: boolean;
  files: IngestFileResult[];
}

async function buildEntries(root: string): Promise<DocManifestEntry[]> {
  const seen = new Set(DOC_MANIFEST.map((e) => e.path));
  const entries = [...DOC_MANIFEST];
  // Auto-discover any additional markdown under docs/ (future-proof).
  try {
    const docsDir = resolve(root, "docs");
    const names = await readdir(docsDir);
    for (const name of names) {
      if (!name.toLowerCase().endsWith(".md")) continue;
      const rel = `docs/${name}`;
      if (seen.has(rel)) continue;
      seen.add(rel);
      entries.push({ path: rel, assetType: classify(rel) });
    }
  } catch {
    // docs/ may not exist — ignore.
  }
  return entries;
}

async function upsertDoc(
  entry: DocManifestEntry,
  content: string,
  bytes: number,
  createdBy: string | null,
): Promise<IngestFileResult> {
  const title = deriveTitle(content, entry.path);
  const summary = deriveSummary(content);

  const existing = await db
    .select({
      id: jarvisKnowledgeAssetsTable.id,
      content: jarvisKnowledgeAssetsTable.content,
    })
    .from(jarvisKnowledgeAssetsTable)
    .where(eq(jarvisKnowledgeAssetsTable.sourcePath, entry.path))
    .limit(1);

  const prior = existing[0];
  const unchanged = prior != null && prior.content === content;

  if (!unchanged) {
    await db
      .insert(jarvisKnowledgeAssetsTable)
      .values({
        title,
        summary,
        content,
        assetType: entry.assetType,
        sourceUrl: entry.path,
        sourcePath: entry.path,
        createdBy,
        tags: ["sovereignty", "ingested", entry.assetType],
      })
      .onConflictDoUpdate({
        target: jarvisKnowledgeAssetsTable.sourcePath,
        set: {
          title,
          summary,
          content,
          assetType: entry.assetType,
          sourceUrl: entry.path,
          updatedAt: new Date(),
        },
      });
  }

  // Mirror operational docs into jarvis_runbooks (idempotent on source_path).
  let mirroredRunbook = false;
  if (entry.runbookKind) {
    try {
      await db
        .insert(jarvisRunbooksTable)
        .values({
          title,
          kind: entry.runbookKind,
          content,
          sourcePath: entry.path,
        })
        .onConflictDoUpdate({
          target: jarvisRunbooksTable.sourcePath,
          set: {
            title,
            kind: entry.runbookKind,
            content,
            updatedAt: new Date(),
          },
        });
      mirroredRunbook = true;
    } catch (err) {
      logger.warn({ err, path: entry.path }, "jarvis: runbook mirror failed");
    }
  }

  return {
    path: entry.path,
    title,
    assetType: entry.assetType,
    status: unchanged ? "unchanged" : prior ? "updated" : "created",
    bytes,
    mirroredRunbook,
  };
}

/**
 * Ingest the curated document set. Fail-safe per file. After upserting, kicks a
 * scoped indexer pass over assets so the docs become Executive-Query-searchable
 * (the indexer is content-hash-gated, so unchanged docs cost nothing).
 */
export async function ingestDocuments(
  createdBy: string | null,
): Promise<IngestSummary> {
  const root = resolveRepoRoot();
  const entries = await buildEntries(root);
  const files: IngestFileResult[] = [];

  for (const entry of entries) {
    const abs = resolve(root, entry.path);
    try {
      const info = await stat(abs);
      if (!info.isFile()) {
        files.push({
          path: entry.path,
          title: null,
          assetType: entry.assetType,
          status: "missing",
          bytes: null,
          mirroredRunbook: false,
        });
        continue;
      }
      const content = await readFile(abs, "utf8");
      files.push(await upsertDoc(entry, content, info.size, createdBy));
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "ENOENT") {
        files.push({
          path: entry.path,
          title: null,
          assetType: entry.assetType,
          status: "missing",
          bytes: null,
          mirroredRunbook: false,
        });
      } else {
        logger.warn({ err, path: entry.path }, "jarvis: doc ingest failed");
        files.push({
          path: entry.path,
          title: null,
          assetType: entry.assetType,
          status: "error",
          bytes: null,
          mirroredRunbook: false,
        });
      }
    }
  }

  const changed = files.some(
    (f) => f.status === "created" || f.status === "updated",
  );
  let indexed = false;
  if (changed) {
    try {
      await runIndexerPass({ subjectTypes: ["asset"] });
      indexed = true;
    } catch (err) {
      logger.warn({ err }, "jarvis: post-ingest indexer pass failed");
    }
  }

  return {
    generatedAt: Date.now(),
    repoRoot: root,
    processed: files.length,
    created: files.filter((f) => f.status === "created").length,
    updated: files.filter((f) => f.status === "updated").length,
    unchanged: files.filter((f) => f.status === "unchanged").length,
    missing: files.filter((f) => f.status === "missing").length,
    errors: files.filter((f) => f.status === "error").length,
    indexed,
    files,
  };
}

export interface IngestedDocRow {
  id: string;
  title: string;
  assetType: string;
  sourcePath: string | null;
  summary: string | null;
  updatedAt: Date | null;
}

/** List the ingested sovereignty documents (assets with a source_path). */
export async function listIngestedDocs(): Promise<IngestedDocRow[]> {
  try {
    const rows = await db
      .select({
        id: jarvisKnowledgeAssetsTable.id,
        title: jarvisKnowledgeAssetsTable.title,
        assetType: jarvisKnowledgeAssetsTable.assetType,
        sourcePath: jarvisKnowledgeAssetsTable.sourcePath,
        summary: jarvisKnowledgeAssetsTable.summary,
        updatedAt: jarvisKnowledgeAssetsTable.updatedAt,
      })
      .from(jarvisKnowledgeAssetsTable)
      .where(eq(jarvisKnowledgeAssetsTable.status, "active"));
    return rows
      .filter((r) => r.sourcePath != null)
      .sort((a, b) => (a.sourcePath ?? "").localeCompare(b.sourcePath ?? ""));
  } catch (err) {
    logger.warn({ err }, "jarvis: listIngestedDocs failed");
    return [];
  }
}
