#!/usr/bin/env tsx
/**
 * check-no-direct-position-writes
 *
 * Build-time guardrail (Task #207, Phase 2 Step 1 — Position-Store SoT).
 *
 * Locks the invariant that every customer position-state mutation —
 * paper open, live fill mirror, close, reset — must converge through
 * `lib/positionStore.ts`. Direct `db.insert(simPositionsTable)`,
 * `db.insert(simTradesTable)`, `db.update(simPositionsTable)`, or
 * `db.delete(simPositionsTable)` outside the allowlist silently bypasses
 * the canonical `position_opened` / `position_filled` /
 * `position_closed` stream events and (post-Step-5 cutover) the unified
 * write contract.
 *
 * Mode (Phase 2 Step 1 — WARN):
 *   The legacy writer `userSimRegistry.ts` is currently allowlisted —
 *   it still owns the actual DB writes, and `positionStore.ts` is a
 *   funnel that delegates to it. The guard reports violations as
 *   warnings (exit 0) so it can run in CI today without blocking. The
 *   Step-5 cutover will (a) move the writes into `positionStore.ts`,
 *   (b) shrink the allowlist to just `positionStore.ts`, and (c) flip
 *   `WARN_ONLY` to `false` so the invariant becomes a hard build gate.
 *
 * Scope: customer-side only. The operator path executes against
 * exchange-level engine state and does not touch `simPositionsTable` /
 * `simTradesTable`, so it is naturally out of scope here.
 *
 * Run: `pnpm --filter @workspace/scripts run check-no-direct-position-writes`
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const SCAN_DIRS = ["artifacts/api-server/src"];

/** Phase 2 Step 1: warn only — flip to `false` at Step-5 cutover. */
const WARN_ONLY = true;

/** Files allowed to write the position / trade tables directly.
 *
 *  Phase 2 Step 1:
 *    - `positionStore.ts` — canonical SoT funnel.
 *    - `userSimRegistry.ts` — current legacy writer that the SoT
 *      delegates to. Removed from the allowlist at Step-5 cutover when
 *      writes migrate into `positionStore.ts` itself.
 *    - `scripts/backfill-*.ts` style migrations live outside SCAN_DIRS
 *      and are intentionally never scanned. */
const ALLOWED_FILES = new Set([
  "artifacts/api-server/src/lib/positionStore.ts",
  "artifacts/api-server/src/lib/userSimRegistry.ts",
]);

/** Detect direct CRUD against the position / trade tables. Match
 *  patterns are intentionally narrow — we only fire on `db.<op>(<table>)`
 *  invocations, not on incidental identifier mentions in comments or
 *  type imports. */
const WRITE_RES: { tag: string; re: RegExp }[] = [
  { tag: "insert simPositionsTable", re: /\bdb\s*\.\s*insert\s*\(\s*simPositionsTable\b/ },
  { tag: "update simPositionsTable", re: /\bdb\s*\.\s*update\s*\(\s*simPositionsTable\b/ },
  { tag: "delete simPositionsTable", re: /\bdb\s*\.\s*delete\s*\(\s*simPositionsTable\b/ },
  { tag: "insert simTradesTable",    re: /\bdb\s*\.\s*insert\s*\(\s*simTradesTable\b/    },
  { tag: "update simTradesTable",    re: /\bdb\s*\.\s*update\s*\(\s*simTradesTable\b/    },
  { tag: "delete simTradesTable",    re: /\bdb\s*\.\s*delete\s*\(\s*simTradesTable\b/    },
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const violations: { file: string; line: number; text: string; tag: string }[] = [];

for (const dir of SCAN_DIRS) {
  const abs = join(REPO_ROOT, dir);
  for (const file of walk(abs)) {
    const rel = relative(REPO_ROOT, file).split("\\").join("/");
    if (ALLOWED_FILES.has(rel)) continue;
    // Tests are allowed to assert legacy behavior directly.
    if (/\.test\.[tj]sx?$/.test(rel) || rel.includes("/__tests__/")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    let inBlockComment = false;
    lines.forEach((line, idx) => {
      let working = line;
      if (inBlockComment) {
        const end = working.indexOf("*/");
        if (end === -1) return;
        working = working.slice(end + 2);
        inBlockComment = false;
      }
      const blockStart = working.indexOf("/*");
      if (blockStart !== -1 && working.indexOf("*/", blockStart) === -1) {
        working = working.slice(0, blockStart);
        inBlockComment = true;
      }
      const stripped = working.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      for (const { tag, re } of WRITE_RES) {
        if (re.test(stripped)) {
          violations.push({ file: rel, line: idx + 1, text: line.trim(), tag });
        }
      }
    });
  }
}

if (violations.length > 0) {
  const header = WARN_ONLY
    ? "\n⚠ check-no-direct-position-writes WARN — direct position-table write found.\n"
    : "\n✗ check-no-direct-position-writes FAILED — direct position-table write found.\n";
  const stream = WARN_ONLY ? console.warn : console.error;
  stream(header);
  stream("Every customer position-state mutation MUST route through");
  stream("`lib/positionStore.ts` (openPosition / recordFill / closePosition).");
  stream("Phase 2 Step 5 will tighten the allowlist and flip this guard to error mode.\n");
  for (const v of violations) {
    stream(`  ${v.file}:${v.line}  [${v.tag}]  ${v.text}`);
  }
  stream(`\n${violations.length} violation(s) found.`);
  if (!WARN_ONLY) process.exit(1);
} else {
  console.log("✓ check-no-direct-position-writes passed — all position-table writes route through positionStore.");
}
