import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Resolve the monorepo root at runtime by walking up from the current working
 * directory until a `pnpm-workspace.yaml` is found. The api-server dev/start
 * scripts run from `artifacts/api-server`, so the root is typically two levels
 * up — but we discover it rather than hard-code it. Falls back to cwd.
 *
 * Cached after first resolution (the root never moves within a process).
 */
let cached: string | null = null;

export function resolveRepoRoot(): string {
  if (cached) return cached;
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      cached = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cached = process.cwd();
  return cached;
}
