#!/usr/bin/env tsx
/**
 * check-no-direct-adapter-orders
 *
 * Build-time guardrail (Task #206, Phase 1 — Unified Execution Gateway).
 *
 * Locks the invariant that every CUSTOMER live-order placement must
 * converge through `lib/executionGateway.ts::executeCustomerOrder()`.
 * Direct imports of `placeLiveAutoOrderForUser` from anywhere other than
 * the gateway itself — or direct customer-scoped `.placeOrder()` calls on
 * exchange adapters — silently bypass the canonical
 * `[EXECUTION_GATEWAY_*]` telemetry, the kill-switch / ARM / cap chain,
 * and (post-Phase-2) the unified persistence path.
 *
 * Scope: customer-side only. The operator path —
 * `lib/exchangeEngine.ts::placeLiveAutoOrder` (no-userId) and
 * `routes/exchangeOrders.ts` — is INTENTIONALLY excluded; operator
 * execution runs under separate credentials + audit + risk view.
 *
 * Run: `pnpm --filter @workspace/scripts run check-no-direct-adapter-orders`
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const SCAN_DIRS = ["artifacts/api-server/src"];

/** Files allowed to reference `placeLiveAutoOrderForUser` directly. */
const ALLOWED_HELPER_FILES = new Set([
  // The gateway itself wraps the legacy helper.
  "artifacts/api-server/src/lib/executionGateway.ts",
  // Source of the helper.
  "artifacts/api-server/src/lib/liveUserExecution.ts",
]);

/** Files allowed to call adapter `.placeOrder(...)` directly. The customer
 *  path is forbidden from holding a raw adapter handle; only the helpers
 *  below construct adapters + place orders.
 *
 *  Allowlist categories:
 *    - The gateway + the helper it currently wraps (customer path).
 *    - `exchangeEngine.ts` — operator process-env path (no userId).
 *      Explicitly out of scope per Phase 1.
 *    - `services/exchanges/**` — adapter implementations and the
 *      `BaseExchangeAdapter` interface contract.
 *    - `routes/exchangeOrders.ts` — operator-only manual order route
 *      (admintrade. terminal); operator-gated upstream.
 *
 *  Anything else attempting to invoke `.placeOrder(` on an adapter handle
 *  has bypassed the customer gateway and trips this guard. */
const ALLOWED_ADAPTER_FILES = new Set([
  "artifacts/api-server/src/lib/executionGateway.ts",
  "artifacts/api-server/src/lib/liveUserExecution.ts",
  "artifacts/api-server/src/lib/exchangeEngine.ts",
  "artifacts/api-server/src/routes/exchangeOrders.ts",
]);
const ALLOWED_ADAPTER_PREFIXES = [
  "artifacts/api-server/src/services/exchanges/",
];

/** Detect a direct customer-execution import / call. We grep for the
 *  identifier outside of comments — only `executionGateway.ts` and
 *  `liveUserExecution.ts` are permitted to mention it in real code. */
const DIRECT_CALL_RE   = /(?<![A-Za-z_])placeLiveAutoOrderForUser\s*[(,{<]/;
const DIRECT_IMPORT_RE = /(?<![A-Za-z_])placeLiveAutoOrderForUser(?![A-Za-z_])/;

/** Detect a direct adapter `.placeOrder(...)` invocation. Method-style
 *  call only — the leading dot prevents matching the operator-path
 *  function `placeLiveAutoOrder(` or the gateway `executeCustomerOrder(`. */
const DIRECT_ADAPTER_PLACE_RE = /\.placeOrder\s*\(/;

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

const violations: { file: string; line: number; text: string }[] = [];

for (const dir of SCAN_DIRS) {
  const abs = join(REPO_ROOT, dir);
  for (const file of walk(abs)) {
    const rel = relative(REPO_ROOT, file).split("\\").join("/");
    // Skip test files — tests may import helpers / construct adapter
    // mocks directly to assert legacy behavior without violating the
    // production-code invariant.
    if (/\.test\.[tj]sx?$/.test(rel) || rel.includes("/__tests__/")) continue;
    const helperAllowed  = ALLOWED_HELPER_FILES.has(rel);
    const adapterAllowed =
      ALLOWED_ADAPTER_FILES.has(rel) ||
      ALLOWED_ADAPTER_PREFIXES.some(p => rel.startsWith(p));
    // Fully allowlisted for both checks — skip read entirely.
    if (helperAllowed && adapterAllowed) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    let inBlockComment = false;
    lines.forEach((line, idx) => {
      // Crude block-comment tracking so the gate-0e doc comments in
      // tradingLoop / aiDisclaimer / etc. don't trip the guard.
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
      // Strip line comments + leading `*` of JSDoc continuations.
      const stripped = working.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      if (!helperAllowed && (DIRECT_CALL_RE.test(stripped) || DIRECT_IMPORT_RE.test(stripped))) {
        violations.push({ file: rel, line: idx + 1, text: line.trim() });
      }
      if (!adapterAllowed && DIRECT_ADAPTER_PLACE_RE.test(stripped)) {
        violations.push({ file: rel, line: idx + 1, text: line.trim() });
      }
    });
  }
}

if (violations.length > 0) {
  console.error("\n✗ check-no-direct-adapter-orders FAILED — direct customer-execution call found.\n");
  console.error("Every customer live-order placement MUST route through");
  console.error("`lib/executionGateway.ts::executeCustomerOrder()`.");
  console.error("Replace `placeLiveAutoOrderForUser({...})` with");
  console.error('`executeCustomerOrder({ trigger: "manual"|"ai", ... })`.\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  console.error(`\n${violations.length} violation(s) found.`);
  process.exit(1);
}

console.log("✓ check-no-direct-adapter-orders passed — every customer order routes through the gateway.");
