/**
 * Jarvis Desktop Edition — Brain Ingestion Pipeline
 * -------------------------------------------------
 * Auto-classifying importer that turns a flat folder of plain-text brain files
 * (the "Jarvis-Test" knowledge export — ~266 *.txt) into STRUCTURED Jarvis data,
 * not just an undifferentiated document pile.
 *
 * What it populates (and why, mapped to the live data model):
 *   1. jarvis_knowledge_assets — EVERY file becomes one asset (the corpus the
 *      cognition indexer + Executive Query retrieve over). Keyed by the UNIQUE
 *      `source_path`, so re-running UPSERTS instead of duplicating. Each asset is
 *      classified (filename + content) and tagged, and linked to the business +
 *      category it most relates to.
 *   2. jarvis_businesses — the real ventures parsed from the Project Registry
 *      (every project whose status is not "Infrastructure"). slug-keyed upsert.
 *      monthlyRevenue / healthStatus are LEFT NULL — never fabricated.
 *   3. jarvis_projects — every project parsed from the Project Registry, linked
 *      to its business by name. Name-keyed manual upsert.
 *   4. jarvis_agents — the real agents parsed from the Agent Registry (8 active
 *      agents in this export). role/description/capabilities come straight from
 *      the registry; agentType stays "custom" and enabled=false so this is a
 *      faithful, side-effect-free registry (the scheduler never auto-runs them).
 *   5. jarvis_knowledge_categories — one category per project, so the corpus is
 *      organised by venture.
 *   6. jarvis_memories — the Executive Memory files become high-importance
 *      context memories, linked to their business + category.
 *   7. jarvis_knowledge_relationships — the knowledge graph. Built ONLY from the
 *      supported node types (asset | memory | category): asset→category and
 *      memory→category ("categorized_as") plus category→category ("supports")
 *      backbone from the platform's cross-project relationship doc. We do NOT
 *      widen the graph node-type contract.
 *   8. Unless --no-embed, runs the deterministic cognition indexer
 *      (`runIndexerPass`). Embeddings need OPENAI_API_KEY (text-embedding-3-small)
 *      — WITHOUT it the import still succeeds and Executive Query works in LEXICAL
 *      mode; only semantic similarity is unavailable. If embeddings are produced,
 *      semantic retrieval is enabled.
 *
 * NO FABRICATION: only data actually found in the files is written. Counts that
 * cannot be derived (revenue, health) are left NULL → rendered as a dash.
 *
 * Run from the package root (so the root .env is loaded):
 *   pnpm import:brain -- /absolute/path/to/Jarvis-Test
 *   pnpm import:brain -- /path/to/Jarvis-Test --no-embed
 *
 * Flags:
 *   --no-embed            skip embedding generation (structured data only)
 *   --source-prefix=<p>   source_path namespace (default "brain")
 *   --ext=<.txt,.md>      comma list of extensions to include (default .txt,.md)
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, relative, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  pool,
  jarvisKnowledgeAssetsTable,
  jarvisMemoriesTable,
  jarvisBusinessesTable,
  jarvisProjectsTable,
  jarvisAgentsTable,
  jarvisKnowledgeCategoriesTable,
  jarvisKnowledgeRelationshipsTable,
} from "@workspace/db";
import type { GraphNodeType } from "../lib/jarvis/cognition/types.js";
import {
  runIndexerPass,
  setSemanticRetrievalEnabled,
} from "../lib/jarvis/cognition/index.js";

interface Options {
  dir: string;
  embed: boolean;
  sourcePrefix: string;
  exts: string[];
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  let embed = true;
  let sourcePrefix = "brain";
  let exts = [".txt", ".md"];

  for (const a of argv) {
    if (a === "--no-embed") embed = false;
    else if (a.startsWith("--source-prefix="))
      sourcePrefix = a.slice("--source-prefix=".length).trim() || "brain";
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
      "Usage: pnpm import:brain -- <dir> [--no-embed] [--source-prefix=p] [--ext=.txt,.md]",
    );
    process.exit(2);
  }
  return { dir: resolve(dir), embed, sourcePrefix, exts };
}

// ── Generic helpers ──────────────────────────────────────────────────────────

async function collectFiles(root: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = join(d, e.name);
      // Skip macOS archive cruft.
      if (e.name === "__MACOSX" || e.name.startsWith("._")) continue;
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && exts.includes(extname(e.name).toLowerCase()))
        out.push(full);
    }
  }
  await walk(root);
  out.sort();
  return out;
}

function deriveTitle(content: string, path: string): string {
  for (const raw of content.split("\n").slice(0, 50)) {
    const line = raw.replace(/^#{1,6}\s+/, "").trim();
    if (line.length > 0) return line.slice(0, 200);
  }
  return basename(path).replace(/\.[^.]+$/, "").slice(0, 200);
}

function deriveSummary(content: string): string | null {
  for (const raw of content.split("\n")) {
    const t = raw.trim();
    if (t.length > 0 && !t.startsWith("#")) return t.slice(0, 280);
  }
  return null;
}

function deriveSourceKey(prefix: string, rel: string): string {
  const full = `${prefix}/${rel}`;
  if (full.length <= 255) return full;
  const hash = createHash("sha256").update(rel).digest("hex");
  return `${prefix.slice(0, 180)}/${hash}`;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 140) || "untitled"
  );
}

// ── Classification (filename + content) ──────────────────────────────────────

type DocClass =
  | "agent"
  | "registry"
  | "business-memory"
  | "sprint"
  | "governance"
  | "strategic"
  | "specification"
  | "document";

function classify(fileName: string): DocClass {
  const n = fileName.toLowerCase();
  if (/executive memory\.txt$/.test(n)) return "business-memory";
  if (/(registry|project index|project profiles|cross-project relationships|canonical documents)/.test(n))
    return "registry";
  if (/\bsprint \d+/.test(n) || /\bday \d+ build/.test(n)) return "sprint";
  if (/^(trading|seo|mobile|research) agent\.txt$/.test(n) || /jarvis core agent\.txt$/.test(n))
    return "agent";
  if (/(governance|constitution|charter|compliance|audit|risk|security|continuity|disaster recovery)/.test(n))
    return "governance";
  if (/(strategy|strategic|roadmap|vision|doctrine|foresight|legacy|civilization)/.test(n))
    return "strategic";
  if (/(specification|spec|blueprint|architecture|design|framework|directive|playbook|guide|manual|plan)/.test(n))
    return "specification";
  return "document";
}

// ── Registry parsers ─────────────────────────────────────────────────────────

interface ParsedAgent {
  agentId: string; // AGENT-001
  name: string;
  status: string;
  role: string;
  purpose: string;
  handles: string[];
  associatedProjects: string[];
}

/**
 * Parse the "Jarvis Agent Registry.txt" AGENT-NNN detail blocks. Each block is a
 * `Label:` then value (single line or a list of `* item`) sequence.
 */
function parseAgentRegistry(text: string): ParsedAgent[] {
  const lines = text.split("\n");
  const agents: ParsedAgent[] = [];
  // Find detail blocks that START with a bare "AGENT-NNN" line followed (after a
  // "====" rule) by "Name:". We only treat a block as a detail block when it has
  // a Name field, which excludes the summary list at the top.
  const idxs: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^AGENT-\d+\s*$/.test(lines[i].trim())) idxs.push(i);
  }
  for (let b = 0; b < idxs.length; b += 1) {
    const start = idxs[b];
    const end = b + 1 < idxs.length ? idxs[b + 1] : lines.length;
    const block = lines.slice(start, end);
    const agentId = block[0].trim();
    const fields = extractFields(block.slice(1));
    const name = (fields.get("Name")?.[0] ?? "").trim();
    if (!name) continue; // summary-list reference, not a detail block
    agents.push({
      agentId,
      name,
      status: (fields.get("Status")?.[0] ?? "Active").trim(),
      role: (fields.get("Role")?.[0] ?? "").trim(),
      purpose: (fields.get("Purpose")?.join(" ") ?? "").trim(),
      handles: fields.get("Handles") ?? [],
      associatedProjects: fields.get("Associated Project") ?? [],
    });
  }
  return agents;
}

interface ParsedProject {
  name: string;
  priority: number | null;
  status: string;
  purpose: string;
  keywords: string[];
  assignedAgents: string[];
}

/**
 * Parse the "Jarvis Project Registry.txt" numbered project blocks (delimited by
 * dashed rules). First line `N. Name`; inline `Priority:` / `Status:`; labeled
 * multi-line `Purpose` / `Keywords` / `Assigned Agents`.
 */
function parseProjectRegistry(text: string): ParsedProject[] {
  // Limit to the ACTIVE PROJECTS region (before ROUTING RULES) to avoid the
  // trailing reference list re-introducing duplicates.
  let region = text;
  const routingAt = region.search(/^\s*ROUTING RULES\s*$/m);
  if (routingAt > 0) region = region.slice(0, routingAt);
  const chunks = region.split(/^-{10,}$/m);
  const projects: ParsedProject[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    let name = "";
    for (const raw of lines) {
      const m = raw.trim().match(/^\d+\.\s+(.+)$/);
      if (m) {
        name = m[1].trim();
        break;
      }
    }
    if (!name || seen.has(name.toLowerCase())) continue;
    const priorityM = chunk.match(/Priority:\s*(\d+)/);
    const statusM = chunk.match(/Status:\s*(.+)/);
    const fields = extractFields(lines);
    seen.add(name.toLowerCase());
    projects.push({
      name,
      priority: priorityM ? Number(priorityM[1]) : null,
      status: statusM ? statusM[1].trim() : "active",
      purpose: (fields.get("Purpose")?.join(" ") ?? "").trim(),
      keywords: fields.get("Keywords") ?? [],
      assignedAgents: fields.get("Assigned Agents") ?? [],
    });
  }
  return projects;
}

/**
 * Generic `Label:` extractor. A line that is exactly `Label:` (or `Label: value`)
 * opens a field; subsequent non-empty lines (including `* item` / `→ item` /
 * bare words) accumulate as its values until the next label or a blank gap that
 * precedes another label. Returns label → list of values.
 */
function extractFields(lines: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const labelMatch = line.match(/^([A-Za-z][A-Za-z /&]+?):\s*(.*)$/);
    if (labelMatch && !line.startsWith("*") && !line.startsWith("→")) {
      current = labelMatch[1].trim();
      const inline = labelMatch[2].trim();
      out.set(current, inline ? [inline] : []);
      continue;
    }
    if (!current) continue;
    if (line.length === 0) continue;
    if (/^={3,}$/.test(line) || /^-{3,}$/.test(line)) {
      current = null;
      continue;
    }
    const item = line.replace(/^[*→•-]\s*/, "").trim();
    if (item.length > 0) out.get(current)!.push(item);
  }
  return out;
}

// ── Manual name-keyed upserts (tables without a unique constraint on name) ─────

async function upsertProject(
  p: ParsedProject,
  businessId: string | null,
): Promise<string> {
  const description = p.purpose || null;
  const status = p.status || "active";
  const [existing] = await db
    .select({ id: jarvisProjectsTable.id })
    .from(jarvisProjectsTable)
    .where(eq(jarvisProjectsTable.name, p.name))
    .limit(1);
  if (existing) {
    await db
      .update(jarvisProjectsTable)
      .set({ description, status, businessId, updatedAt: new Date() })
      .where(eq(jarvisProjectsTable.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(jarvisProjectsTable)
    .values({ name: p.name, description, status, businessId })
    .returning({ id: jarvisProjectsTable.id });
  return row.id;
}

async function upsertAgent(a: ParsedAgent): Promise<void> {
  const descParts: string[] = [];
  if (a.purpose) descParts.push(a.purpose);
  if (a.associatedProjects.length)
    descParts.push(`Associated projects: ${a.associatedProjects.join(", ")}.`);
  if (a.handles.length) descParts.push(`Handles: ${a.handles.join(", ")}.`);
  const description = descParts.join(" ") || null;
  const status = /active/i.test(a.status) ? "active" : a.status.toLowerCase();
  const capabilities = a.handles.length ? a.handles : null;
  const [existing] = await db
    .select({ id: jarvisAgentsTable.id })
    .from(jarvisAgentsTable)
    .where(eq(jarvisAgentsTable.name, a.name))
    .limit(1);
  if (existing) {
    await db
      .update(jarvisAgentsTable)
      .set({
        role: a.role,
        description,
        status,
        capabilities,
        config: { registryId: a.agentId, associatedProjects: a.associatedProjects },
        updatedAt: new Date(),
      })
      .where(eq(jarvisAgentsTable.id, existing.id));
    return;
  }
  await db.insert(jarvisAgentsTable).values({
    name: a.name,
    role: a.role,
    description,
    status,
    agentType: "custom",
    capabilities,
    config: { registryId: a.agentId, associatedProjects: a.associatedProjects },
    enabled: false,
    priority: 100,
  });
}

async function upsertBusinessBySlug(
  name: string,
  description: string | null,
  status: string,
): Promise<string> {
  const slug = slugify(name);
  const [row] = await db
    .insert(jarvisBusinessesTable)
    .values({ name, slug, description, status })
    .onConflictDoUpdate({
      target: jarvisBusinessesTable.slug,
      set: { name, description, status, updatedAt: new Date() },
    })
    .returning({ id: jarvisBusinessesTable.id });
  return row.id;
}

async function upsertCategoryBySlug(
  name: string,
  description: string | null,
): Promise<string> {
  const slug = slugify(name);
  const [row] = await db
    .insert(jarvisKnowledgeCategoriesTable)
    .values({ name, slug, description })
    .onConflictDoUpdate({
      target: jarvisKnowledgeCategoriesTable.slug,
      set: { name, description, updatedAt: new Date() },
    })
    .returning({ id: jarvisKnowledgeCategoriesTable.id });
  return row.id;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const info = await stat(opts.dir).catch(() => null);
  if (!info || !info.isDirectory()) {
    console.error(`Not a directory: ${opts.dir}`);
    process.exit(2);
  }

  const files = await collectFiles(opts.dir, opts.exts);
  console.log(`Scanning ${opts.dir}\nFound ${files.length} file(s).`);
  if (files.length === 0) {
    console.log("Nothing to import.");
    await closeAndExit(0);
    return;
  }

  // 1) Parse the registries up front (their content drives entity creation).
  const registryText = new Map<string, string>();
  for (const f of files) {
    const base = basename(f);
    if (
      base === "Jarvis Agent Registry.txt" ||
      base === "Jarvis Project Registry.txt"
    ) {
      registryText.set(base, (await readFile(f, "utf8")).trim());
    }
  }

  const parsedAgents = registryText.has("Jarvis Agent Registry.txt")
    ? parseAgentRegistry(registryText.get("Jarvis Agent Registry.txt")!)
    : [];
  const parsedProjects = registryText.has("Jarvis Project Registry.txt")
    ? parseProjectRegistry(registryText.get("Jarvis Project Registry.txt")!)
    : [];

  console.log(
    `Parsed ${parsedAgents.length} agent(s) and ${parsedProjects.length} project(s) from registries.`,
  );

  // 2) Businesses = ventures (status not "Infrastructure"). slug-keyed upsert.
  const businessIdByName = new Map<string, string>();
  for (const p of parsedProjects) {
    if (/infrastructure/i.test(p.status)) continue;
    const id = await upsertBusinessBySlug(p.name, p.purpose || null, "active");
    businessIdByName.set(p.name.toLowerCase(), id);
  }

  // 3) Projects (link to business by name) + 4) one category per project.
  const categoryIdByProject = new Map<string, string>();
  interface ProjectIndexEntry {
    name: string;
    nameLower: string;
    keywords: string[];
    categoryId: string;
    businessId: string | null;
  }
  const projectIndex: ProjectIndexEntry[] = [];
  for (const p of parsedProjects) {
    const businessId = businessIdByName.get(p.name.toLowerCase()) ?? null;
    await upsertProject(p, businessId);
    const categoryId = await upsertCategoryBySlug(p.name, p.purpose || null);
    categoryIdByProject.set(p.name.toLowerCase(), categoryId);
    projectIndex.push({
      name: p.name,
      nameLower: p.name.toLowerCase(),
      keywords: p.keywords.map((k) => k.toLowerCase()),
      categoryId,
      businessId,
    });
  }
  // Fallback category for files that match no project.
  const fallbackCategoryId =
    categoryIdByProject.get("jarvis") ??
    (await upsertCategoryBySlug("Jarvis Platform", "General Jarvis platform knowledge."));

  // 5) Agents.
  for (const a of parsedAgents) await upsertAgent(a);

  // 6) Walk every file → asset (+ memory for Executive Memory files).
  const baseTags = ["imported", "jarvis-brain"];
  let assetsUpserted = 0;
  let memoriesUpserted = 0;
  let skippedEmpty = 0;
  let failed = 0;
  // (assetId|memoryId, categoryId, type) edges to (re)build the graph.
  const assetEdges: Array<{ id: string; categoryId: string }> = [];
  const memoryEdges: Array<{ id: string; categoryId: string }> = [];

  /** Best project match by keyword/name hits in the haystack. */
  function matchProject(haystack: string): ProjectIndexEntry | null {
    let best: ProjectIndexEntry | null = null;
    let bestScore = 0;
    for (const p of projectIndex) {
      let score = 0;
      if (haystack.includes(p.nameLower)) score += 3;
      for (const kw of p.keywords) if (kw && haystack.includes(kw)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return bestScore > 0 ? best : null;
  }

  for (const file of files) {
    const rel = relative(opts.dir, file);
    const base = basename(file);
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
      const docClass = classify(base);
      const haystack = `${base}\n${content}`.toLowerCase();
      const match = matchProject(haystack);
      const categoryId = match?.categoryId ?? fallbackCategoryId;
      const businessId = match?.businessId ?? null;
      const tags = [...baseTags, docClass];

      const [assetRow] = await db
        .insert(jarvisKnowledgeAssetsTable)
        .values({
          title,
          summary,
          content,
          assetType: "document",
          sourcePath: sourceKey,
          sourceUrl,
          categoryId,
          businessId,
          tags,
          status: "active",
          createdBy: "ingest-brain",
        })
        .onConflictDoUpdate({
          target: jarvisKnowledgeAssetsTable.sourcePath,
          set: {
            title,
            summary,
            content,
            sourceUrl,
            categoryId,
            businessId,
            tags,
            status: "active",
            updatedAt: new Date(),
          },
        })
        .returning({ id: jarvisKnowledgeAssetsTable.id });
      assetsUpserted += 1;
      if (assetRow) assetEdges.push({ id: assetRow.id, categoryId });

      // Executive Memory files → high-importance context memories.
      const memMatch = base.match(/^(.+?) Executive Memory\.txt$/i);
      if (memMatch) {
        const memSourceId = deriveSourceKey("brain-memory", rel);
        const [memRow] = await db
          .insert(jarvisMemoriesTable)
          .values({
            title,
            content,
            memoryType: "context",
            importance: "high",
            categoryId,
            businessId,
            sourceType: "jarvis-brain",
            sourceId: memSourceId,
            tags: [...baseTags, "executive-memory"],
            status: "active",
            createdBy: "ingest-brain",
          })
          .onConflictDoUpdate({
            target: [jarvisMemoriesTable.sourceType, jarvisMemoriesTable.sourceId],
            set: {
              title,
              content,
              categoryId,
              businessId,
              status: "active",
              updatedAt: new Date(),
            },
          })
          .returning({ id: jarvisMemoriesTable.id });
        memoriesUpserted += 1;
        if (memRow) memoryEdges.push({ id: memRow.id, categoryId });
      }
    } catch (err) {
      failed += 1;
      console.error(
        `  ! failed ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 7) (Re)build the knowledge graph from supported node types only.
  //    Idempotent: wipe this importer's prior edges, then re-insert.
  await db
    .delete(jarvisKnowledgeRelationshipsTable)
    .where(eq(jarvisKnowledgeRelationshipsTable.createdBy, "ingest-brain"));

  let edges = 0;
  const EDGE_CHUNK = 500;
  const assetEdgeRows = assetEdges.map((e) => ({
    sourceType: "asset",
    sourceId: e.id,
    targetType: "category",
    targetId: e.categoryId,
    relationType: "categorized_as",
    createdBy: "ingest-brain",
  }));
  const memoryEdgeRows = memoryEdges.map((e) => ({
    sourceType: "memory",
    sourceId: e.id,
    targetType: "category",
    targetId: e.categoryId,
    relationType: "categorized_as",
    createdBy: "ingest-brain",
  }));
  // category→category backbone: the Jarvis platform supports every venture
  // category (from the Cross-Project Relationships doctrine: Jarvis is the
  // executive intelligence layer for all projects).
  const jarvisCategoryId = categoryIdByProject.get("jarvis");
  const categoryEdgeRows =
    jarvisCategoryId != null
      ? projectIndex
          .filter((p) => p.categoryId !== jarvisCategoryId)
          .map((p) => ({
            sourceType: "category",
            sourceId: jarvisCategoryId,
            targetType: "category",
            targetId: p.categoryId,
            relationType: "supports",
            createdBy: "ingest-brain",
          }))
      : [];

  const allEdges = [...assetEdgeRows, ...memoryEdgeRows, ...categoryEdgeRows];
  for (let i = 0; i < allEdges.length; i += EDGE_CHUNK) {
    const slice = allEdges.slice(i, i + EDGE_CHUNK);
    if (slice.length) {
      await db.insert(jarvisKnowledgeRelationshipsTable).values(slice);
      edges += slice.length;
    }
  }

  console.log(
    `\nAssets upserted: ${assetsUpserted}  |  Memories upserted: ${memoriesUpserted}` +
      `  |  Skipped (empty): ${skippedEmpty}  |  Failed: ${failed}` +
      `\nGraph edges: ${edges} (asset→category ${assetEdgeRows.length}, ` +
      `memory→category ${memoryEdgeRows.length}, category→category ${categoryEdgeRows.length})`,
  );

  // 8) Embeddings (optional, lexical-safe).
  if (!opts.embed) {
    console.log(
      "\n--no-embed set: skipping embeddings. Executive Query will use LEXICAL retrieval.",
    );
    await closeAndExit(0);
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.log(
      "\nOPENAI_API_KEY not set: embeddings cannot be generated. Import is complete and " +
        "Executive Query works in LEXICAL mode. Set OPENAI_API_KEY and re-run for semantic search.",
    );
    await closeAndExit(0);
    return;
  }

  console.log("\nGenerating embeddings (cognition indexer)…");
  const subjectTypes: GraphNodeType[] = ["asset", "memory"];
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
    await setSemanticRetrievalEnabled(true, "ingest-brain");
    console.log("Semantic retrieval ENABLED. Executive Query now fuses lexical + vector results.");
  } else {
    console.log(
      "No new embeddings written (already up to date, or the provider degraded). Lexical retrieval remains available.",
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
  console.error("import:brain failed:", err);
  process.exit(1);
});
