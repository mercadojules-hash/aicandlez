import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative, join, extname, basename } from "node:path";
import { db, jarvisCodeFilesTable } from "@workspace/db";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { logger } from "../../logger.js";
import { resolveRepoRoot } from "./repoRoot.js";

/**
 * Jarvis Code Content Indexing (Sovereignty Pillar 4) — READ-ONLY filesystem
 * walk. Builds a lexical index of repo source / build / config / doc files into
 * `jarvis_code_files` so Jarvis can explain where important code lives with file
 * references. Stores a short summary + exported symbol names + a content hash for
 * idempotency, PLUS the raw file CONTENT (capped at MAX_STORED_CONTENT_CHARS) for
 * files small enough to read — large files stay metadata-only (content null).
 * The stored content powers Phase 1 LEXICAL code grounding in cognition.
 *
 * NOTE: this is a lexical index only. Code is intentionally NOT wired into the
 * cognition RAG EMBEDDING pipeline (that would touch the budget gate + grounding
 * contract, and code is never a graph/embedding subject) — code content is
 * surfaced lexically via `fetchCode` in retrieval and as a citation-only ref.
 */

// Top-level roots we index; everything else is ignored.
const ALLOWED_ROOTS = ["artifacts", "lib", "scripts"];
const ROOT_CONFIG_FILES = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "tsconfig.json",
  "render.yaml",
  ".env.production.example",
  "drizzle.config.ts",
];

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".local",
  ".replit-artifact",
  "attached_assets",
  ".expo",
  "coverage",
  ".turbo",
  ".cache",
  "public",
]);

const MAX_FILES = 6000;
const MAX_READ_BYTES = 1_048_576; // 1 MB — larger files are metadata-only.
// Phase 1 code grounding: cap stored raw content per file so a few huge generated
// files cannot bloat the table. Files over MAX_READ_BYTES stay `content` null.
const MAX_STORED_CONTENT_CHARS = 60_000;

function languageOf(path: string): string {
  const ext = extname(path).toLowerCase().replace(/^\./, "");
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return ext;
    case "json":
      return "json";
    case "md":
      return "md";
    case "toml":
      return "toml";
    case "yaml":
    case "yml":
      return "yaml";
    case "sql":
      return "sql";
    case "css":
      return "css";
    case "html":
      return "html";
    case "sh":
      return "sh";
    default:
      return ext || "other";
  }
}

function kindOf(path: string, language: string): string {
  const base = basename(path).toLowerCase();
  if (language === "md") return "doc";
  if (language === "css") return "style";
  if (language === "sql" || path.includes("/schema/")) return "schema";
  if (
    /\.config\.[cm]?[jt]s$/.test(base) ||
    base.startsWith("tsconfig") ||
    base === "package.json" ||
    language === "toml" ||
    language === "yaml" ||
    base.endsWith(".example") ||
    base === "pnpm-workspace.yaml"
  ) {
    return "config";
  }
  if (/(vite|esbuild|drizzle|build)\./.test(base) || path.includes("/scripts/"))
    return "build";
  return "source";
}

function artifactOf(relPath: string): string {
  const parts = relPath.split("/");
  if (parts[0] === "artifacts" && parts[1]) return parts[1];
  if (parts[0] === "lib" && parts[1]) return `lib/${parts[1]}`;
  if (parts[0] === "scripts") return "scripts";
  return "root";
}

const INDEXABLE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".toml", ".yaml", ".yml", ".sql", ".css", ".html", ".sh",
]);

function isIndexable(name: string): boolean {
  return INDEXABLE_EXT.has(extname(name).toLowerCase());
}

function extractSymbols(content: string): string[] {
  const out = new Set<string>();
  const re =
    /export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) out.add(m[1]);
    if (out.size >= 40) break;
  }
  return [...out];
}

function deriveSummary(content: string, language: string): string | null {
  if (language === "md") {
    for (const line of content.split("\n").slice(0, 30)) {
      const h = line.match(/^#{1,3}\s+(.+?)\s*$/);
      if (h && h[1]) return h[1].slice(0, 240);
    }
    return null;
  }
  // First block-comment line or line comment.
  const block = content.match(/\/\*\*?\s*\n?\s*\*?\s*(.+)/);
  if (block && block[1]) return block[1].replace(/\*\/.*$/, "").trim().slice(0, 240);
  for (const line of content.split("\n").slice(0, 12)) {
    const c = line.match(/^\s*\/\/\s*(.+)/);
    if (c && c[1]) return c[1].slice(0, 240);
  }
  return null;
}

interface WalkAcc {
  files: string[];
}

async function walk(root: string, dirAbs: string, acc: WalkAcc): Promise<void> {
  if (acc.files.length >= MAX_FILES) return;
  const entries = await readdir(dirAbs, { withFileTypes: true }).catch(
    () => null,
  );
  if (!entries) return;
  for (const ent of entries) {
    if (acc.files.length >= MAX_FILES) return;
    const abs = join(dirAbs, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
      await walk(root, abs, acc);
    } else if (ent.isFile()) {
      if (ent.name.startsWith(".") && !ent.name.endsWith(".example")) continue;
      if (!isIndexable(ent.name)) continue;
      acc.files.push(relative(root, abs).split("\\").join("/"));
    }
  }
}

export interface CodeIndexResult {
  generatedAt: number;
  repoRoot: string;
  scanned: number;
  upserted: number;
  unchanged: number;
  errors: number;
  truncated: boolean;
}

async function indexOne(
  root: string,
  relPath: string,
): Promise<"upserted" | "unchanged" | "error"> {
  try {
    const abs = resolve(root, relPath);
    const info = await stat(abs);
    if (!info.isFile()) return "error";
    const language = languageOf(relPath);
    const kind = kindOf(relPath, language);
    const artifact = artifactOf(relPath);

    let content = "";
    let lineCount: number | null = null;
    let symbols: string[] = [];
    let summary: string | null = null;
    let hash: string;
    // Phase 1 code grounding: raw text persisted for lexical cognition. Null for
    // files over the read cap (metadata-only).
    let storedContent: string | null = null;

    if (info.size <= MAX_READ_BYTES) {
      content = await readFile(abs, "utf8");
      lineCount = content.split("\n").length;
      summary = deriveSummary(content, language);
      if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(language)) {
        symbols = extractSymbols(content);
      }
      hash = createHash("sha256").update(content).digest("hex");
      storedContent =
        content.length > MAX_STORED_CONTENT_CHARS
          ? content.slice(0, MAX_STORED_CONTENT_CHARS)
          : content;
    } else {
      // Metadata-only for very large files (hash from size+mtime).
      hash = createHash("sha256")
        .update(`${info.size}:${info.mtimeMs}`)
        .digest("hex");
    }

    const existing = await db
      .select({
        id: jarvisCodeFilesTable.id,
        contentHash: jarvisCodeFilesTable.contentHash,
        contentPresent: sql<boolean>`(${jarvisCodeFilesTable.content} IS NOT NULL)`,
      })
      .from(jarvisCodeFilesTable)
      .where(eq(jarvisCodeFilesTable.path, relPath))
      .limit(1);

    // Hash-unchanged rows are skipped, EXCEPT when we have content to store and the
    // existing row has none yet (first run after the content column was added) — so
    // the backfill is not permanently short-circuited by a matching hash.
    if (
      existing[0]?.contentHash === hash &&
      (storedContent === null || existing[0]?.contentPresent)
    ) {
      return "unchanged";
    }

    const now = new Date();
    await db
      .insert(jarvisCodeFilesTable)
      .values({
        path: relPath,
        artifact,
        language,
        kind,
        sizeBytes: info.size,
        lineCount,
        summary,
        symbols: symbols.length > 0 ? symbols : null,
        content: storedContent,
        contentHash: hash,
        indexedAt: now,
      })
      .onConflictDoUpdate({
        target: jarvisCodeFilesTable.path,
        set: {
          artifact,
          language,
          kind,
          sizeBytes: info.size,
          lineCount,
          summary,
          symbols: symbols.length > 0 ? symbols : null,
          content: storedContent,
          contentHash: hash,
          indexedAt: now,
          updatedAt: now,
        },
      });
    return "upserted";
  } catch (err) {
    logger.warn({ err, path: relPath }, "jarvis: code index file failed");
    return "error";
  }
}

/** Walk the repo and (re)index the code file registry. Fail-safe. */
export async function reindexCode(): Promise<CodeIndexResult> {
  const root = resolveRepoRoot();
  const acc: WalkAcc = { files: [] };

  for (const r of ALLOWED_ROOTS) {
    await walk(root, resolve(root, r), acc);
  }
  for (const f of ROOT_CONFIG_FILES) {
    try {
      const info = await stat(resolve(root, f));
      if (info.isFile()) acc.files.push(f);
    } catch {
      // missing root config — skip
    }
  }

  let upserted = 0;
  let unchanged = 0;
  let errors = 0;
  for (const relPath of acc.files) {
    const r = await indexOne(root, relPath);
    if (r === "upserted") upserted += 1;
    else if (r === "unchanged") unchanged += 1;
    else errors += 1;
  }

  return {
    generatedAt: Date.now(),
    repoRoot: root,
    scanned: acc.files.length,
    upserted,
    unchanged,
    errors,
    truncated: acc.files.length >= MAX_FILES,
  };
}

export interface CodeSearchRow {
  path: string;
  artifact: string | null;
  language: string | null;
  kind: string;
  summary: string | null;
  symbols: string[] | null;
  lineCount: number | null;
}

/** Lexical code search over path / summary / symbols. Fail-safe to []. */
export async function searchCode(
  query: string,
  opts?: { artifact?: string | null; kind?: string | null; limit?: number },
): Promise<CodeSearchRow[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 100);
  const like = `%${q}%`;
  try {
    const filters = [
      or(
        ilike(jarvisCodeFilesTable.path, like),
        ilike(jarvisCodeFilesTable.summary, like),
        sql`${jarvisCodeFilesTable.symbols}::text ILIKE ${like}`,
      ),
    ];
    if (opts?.artifact)
      filters.push(eq(jarvisCodeFilesTable.artifact, opts.artifact));
    if (opts?.kind) filters.push(eq(jarvisCodeFilesTable.kind, opts.kind));

    const rows = await db
      .select({
        path: jarvisCodeFilesTable.path,
        artifact: jarvisCodeFilesTable.artifact,
        language: jarvisCodeFilesTable.language,
        kind: jarvisCodeFilesTable.kind,
        summary: jarvisCodeFilesTable.summary,
        symbols: jarvisCodeFilesTable.symbols,
        lineCount: jarvisCodeFilesTable.lineCount,
      })
      .from(jarvisCodeFilesTable)
      .where(and(...filters))
      .limit(limit);
    return rows;
  } catch (err) {
    logger.warn({ err }, "jarvis: searchCode failed");
    return [];
  }
}

export interface CodeIndexStats {
  totalFiles: number;
  byArtifact: { artifact: string; files: number }[];
  byKind: { kind: string; files: number }[];
  lastIndexedAt: number | null;
}

/** Summary stats for the code index (fail-safe). */
export async function getCodeIndexStats(): Promise<CodeIndexStats> {
  try {
    const [byArtifact, byKind, totals] = await Promise.all([
      db
        .select({
          artifact: jarvisCodeFilesTable.artifact,
          files: sql<number>`count(*)::int`,
        })
        .from(jarvisCodeFilesTable)
        .groupBy(jarvisCodeFilesTable.artifact),
      db
        .select({
          kind: jarvisCodeFilesTable.kind,
          files: sql<number>`count(*)::int`,
        })
        .from(jarvisCodeFilesTable)
        .groupBy(jarvisCodeFilesTable.kind),
      db
        .select({
          total: sql<number>`count(*)::int`,
          last: sql<string | null>`max(${jarvisCodeFilesTable.indexedAt})`,
        })
        .from(jarvisCodeFilesTable),
    ]);
    const lastStr = totals[0]?.last ?? null;
    const lastMs = lastStr ? new Date(lastStr).getTime() : null;
    return {
      totalFiles: totals[0]?.total ?? 0,
      byArtifact: byArtifact
        .map((r) => ({ artifact: r.artifact ?? "root", files: r.files }))
        .sort((a, b) => b.files - a.files),
      byKind: byKind
        .map((r) => ({ kind: r.kind, files: r.files }))
        .sort((a, b) => b.files - a.files),
      lastIndexedAt: lastMs && !Number.isNaN(lastMs) ? lastMs : null,
    };
  } catch (err) {
    logger.warn({ err }, "jarvis: getCodeIndexStats failed");
    return { totalFiles: 0, byArtifact: [], byKind: [], lastIndexedAt: null };
  }
}
