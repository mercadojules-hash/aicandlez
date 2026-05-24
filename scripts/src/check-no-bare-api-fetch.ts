#!/usr/bin/env tsx
/**
 * check-no-bare-api-fetch
 *
 * Build-time guardrail (Task #172). Fails CI if any source file under
 * `artifacts/<app>/src/` (excluding the canonical `lib/authFetch.ts` files
 * and the frozen `natura-ai` artifact) contains a bare `fetch("/api/...")`
 * or `fetch(`/api/...`)`.
 *
 * Background: a shadow `useAuthFetch` hook in Admin/BillingAdmin/UserActivity
 * bypassed the cross-origin `VITE_API_BASE_URL` prefix on
 * `admintrade.aicandlez.com`, so /api/* hit the static SPA fallback,
 * returned 200 + index.html, JSON.parse silently failed, and React Query
 * defaulted to []. Every page-table on the admin host went blank.
 *
 * Going forward, every /api/* call MUST go through `authFetch`. This
 * script enforces that.
 *
 * Run: `pnpm --filter @workspace/scripts run check-no-bare-api-fetch`
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const SCAN_DIRS = [
  "artifacts/trading-dashboard/src",
  "artifacts/aicandlez-app/src",
  "artifacts/landing/src",
];

// Files allowed to call the real `fetch` against `/api/*` directly.
const ALLOWED_FILES = new Set([
  "artifacts/trading-dashboard/src/lib/authFetch.ts",
  "artifacts/aicandlez-app/src/lib/authFetch.ts",
  // useUserRole reads /api/auth/me before Clerk has loaded the global
  // bearer cache, so it intentionally constructs its own request with a
  // freshly-issued `getToken()` from the React hook context.
  "artifacts/trading-dashboard/src/hooks/useUserRole.ts",
  "artifacts/aicandlez-app/src/hooks/useUserRole.ts",
]);

// Two patterns to flag — both must avoid identifier prefixes so we never
// match `authFetch(` (the canonical wrapper).
//   (a) literal:      fetch("/api/...")   fetch(`/api/...`)
//   (b) prefixed:     fetch(`${BASE}/api/...`)  fetch(API_BASE + "/api/...")
// Pattern (b) catches the case where a file builds the URL itself
// (typically `${VITE_API_BASE_URL}/api/...`) and thereby bypasses the
// content-type guard + Bearer-cookie fallback baked into `authFetch`.
const BARE_API_FETCH_LITERAL_RE   = /(?<![A-Za-z_])fetch\(\s*[`"']\/api/;
const BARE_API_FETCH_TEMPLATE_RE  = /(?<![A-Za-z_])fetch\(\s*`[^`]*\/api/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const violations: { file: string; line: number; text: string }[] = [];

for (const dir of SCAN_DIRS) {
  const abs = join(REPO_ROOT, dir);
  for (const file of walk(abs)) {
    const rel = relative(REPO_ROOT, file).split("\\").join("/");
    if (ALLOWED_FILES.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      // Strip line comments first so commented references don't trip.
      const stripped = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      if (
        BARE_API_FETCH_LITERAL_RE.test(stripped) ||
        BARE_API_FETCH_TEMPLATE_RE.test(stripped)
      ) {
        violations.push({ file: rel, line: idx + 1, text: line.trim() });
      }
    });
  }
}

if (violations.length > 0) {
  console.error("\n✗ check-no-bare-api-fetch FAILED — bare fetch(\"/api/...\") found.\n");
  console.error("Every /api/* call must route through the shared `authFetch`");
  console.error('from `lib/authFetch.ts`. Replace `fetch(\"/api/...\")` with');
  console.error('`authFetch(\"/api/...\")`.\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  console.error(`\n${violations.length} violation(s) found.`);
  process.exit(1);
}

console.log("✓ check-no-bare-api-fetch passed — no bare /api fetches found.");
