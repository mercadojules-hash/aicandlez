/**
 * Jarvis sovereignty production DB migration (#225) — ADDITIVE + IDEMPOTENT.
 *
 * Replays the entire `jarvis_` table namespace from the dev DB (the drizzle-kit
 * source of truth) onto the Render production DB so Jarvis can self-ground its
 * knowledge/memory/code/infra layer against prod WITHOUT Replit as the primary
 * store. The Render prod DB had ZERO jarvis_ tables (the jarvis schema had never
 * been pushed there), so this creates the full namespace.
 *
 * SAFETY (locked invariants):
 * - Strictly additive: CREATE TABLE / INDEX rewritten to IF NOT EXISTS; ADD
 *   CONSTRAINT statements applied with duplicate-tolerance (Postgres has no
 *   IF NOT EXISTS for constraints). NO DROP, NO column ALTER on existing tables,
 *   NO data migration.
 * - jarvis_ namespace only — every FK target is another jarvis_ table (verified),
 *   so NOTHING in the AICandlez trading/exec/billing schema is touched.
 * - Read-only against dev (pg_dump --schema-only); the only writes are CREATE/
 *   ADD CONSTRAINT against prod.
 *
 * Usage: node lib/db/migrations/apply-jarvis-sovereignty-prod.mjs [--apply]
 *   (default DRY RUN: generates the .sql + prints the plan; --apply executes.)
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import pg from "/home/runner/workspace/node_modules/.pnpm/pg@8.21.0/node_modules/pg/lib/index.js";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const DEV = process.env.DATABASE_URL;
const PROD = process.env.RENDER_PROD_DATABASE_URL;

if (!DEV) throw new Error("DATABASE_URL (dev source) missing");
if (!PROD) throw new Error("RENDER_PROD_DATABASE_URL (prod target) missing");

// 1. Dump the jarvis namespace from dev (schema only, read-only).
const dump = execFileSync(
  "pg_dump",
  [DEV, "--schema-only", "--no-owner", "--no-privileges", "--no-comments", "-t", "jarvis_*"],
  { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
);

// 2. Strip psql meta-commands (pg_dump 16+ emits \restrict / \unrestrict, which
//    are NOT valid SQL) and make creation idempotent. The jarvis_embeddings table
//    uses the pgvector `vector` type, so enable the extension first (additive,
//    IF NOT EXISTS; verified available on Render prod). pg_dump does not emit the
//    CREATE EXTENSION, so we prepend it.
const ddlBody = dump
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("\\"))
  .join("\n")
  .replace(/CREATE TABLE (?!IF NOT EXISTS)/g, "CREATE TABLE IF NOT EXISTS ")
  .replace(/CREATE UNIQUE INDEX (?!IF NOT EXISTS)/g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
  .replace(/CREATE INDEX (?!IF NOT EXISTS)/g, "CREATE INDEX IF NOT EXISTS ");
const ddl = "CREATE EXTENSION IF NOT EXISTS vector;\n\n" + ddlBody;

// 3. Persist the committed deploy record.
const outPath = path.join("lib", "db", "migrations", "jarvis-sovereignty-prod.sql");
mkdirSync(path.dirname(outPath), { recursive: true });
const header =
  "-- Jarvis sovereignty prod schema (#225) — ADDITIVE + IDEMPOTENT.\n" +
  "-- Generated from dev DATABASE_URL via: pg_dump --schema-only -t 'jarvis_*'.\n" +
  "-- CREATE TABLE/INDEX rewritten to IF NOT EXISTS. ADD CONSTRAINT statements are\n" +
  "-- applied with duplicate-tolerance by the runner (no IF NOT EXISTS for\n" +
  "-- constraints in Postgres). No drops, no data, no non-jarvis tables touched.\n\n";
writeFileSync(outPath, header + ddl, "utf8");
console.log(`Wrote deploy record: ${outPath} (${(header + ddl).length} bytes)`);

// 4. Split into individual statements (no dollar-quoted bodies in these tables).
const statements = ddl
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => {
    const meaningful = s
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("")
      .trim();
    return meaningful.length > 0;
  });

const counts = { create_table: 0, create_index: 0, alter: 0, other: 0 };
for (const s of statements) {
  if (/CREATE TABLE/i.test(s)) counts.create_table++;
  else if (/CREATE (UNIQUE )?INDEX/i.test(s)) counts.create_index++;
  else if (/ALTER TABLE/i.test(s)) counts.alter++;
  else counts.other++;
}
console.log(`Parsed ${statements.length} statements:`, JSON.stringify(counts));

if (!APPLY) {
  console.log("\nDRY RUN — re-run with --apply to execute against prod.");
  process.exit(0);
}

// 5. Apply to prod, autocommit per statement, tolerating "already exists".
const DUP_CODES = new Set(["42P07", "42710", "42701", "42P06", "42P16", "42P04"]);
const client = new Client({ connectionString: PROD, ssl: { rejectUnauthorized: false } });
await client.connect();
let applied = 0;
let skipped = 0;
try {
  for (const s of statements) {
    try {
      await client.query(s);
      applied++;
    } catch (err) {
      if (err && DUP_CODES.has(err.code)) {
        skipped++;
        continue;
      }
      console.error(`\nFATAL on statement (code=${err?.code}):\n${s}\n`);
      throw err;
    }
  }
  console.log(`\nApplied=${applied} SkippedExisting=${skipped}`);

  // 6. Verify.
  const tabs = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name LIKE $2`,
    ["public", "jarvis_%"],
  );
  const targets = [
    "jarvis_infra_resources",
    "jarvis_credentials",
    "jarvis_render_services",
    "jarvis_code_files",
  ];
  const t2 = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name = ANY($2)`,
    ["public", targets],
  );
  const present = new Set(t2.rows.map((r) => r.table_name));
  const sp = await client.query(
    `SELECT table_name FROM information_schema.columns WHERE table_schema=$1 AND table_name IN ($2,$3) AND column_name=$4`,
    ["public", "jarvis_knowledge_assets", "jarvis_runbooks", "source_path"],
  );
  console.log(`\nPROD jarvis_ tables now: ${tabs.rows[0].n}`);
  for (const t of targets) console.log(`  ${t}: ${present.has(t) ? "OK" : "MISSING"}`);
  for (const t of ["jarvis_knowledge_assets", "jarvis_runbooks"]) {
    console.log(`  ${t}.source_path: ${sp.rows.find((r) => r.table_name === t) ? "OK" : "MISSING"}`);
  }
} finally {
  await client.end();
}
