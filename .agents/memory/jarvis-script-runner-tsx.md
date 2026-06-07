---
name: api-server TS script runner (tsx, not node --experimental-strip-types)
description: Why standalone api-server CLI scripts that import @workspace/db must run under tsx, not node's strip-types loader.
---

Any standalone TS script in `artifacts/api-server/src/scripts/*` that imports
`@workspace/db` (directly or transitively, e.g. via the jarvis cognition barrel)
MUST be run with `tsx`, not `node --experimental-strip-types`.

**Why:** `@workspace/db` resolves to a directory import (`lib/db/src/schema`),
and node's `--experimental-strip-types` ESM loader throws
`ERR_UNSUPPORTED_DIR_IMPORT` (and also won't rewrite relative `.js`→`.ts` barrel
specifiers like `cognition/index.js`). tsx (esbuild) resolves both. The running
api-server itself never hits this because it is esbuild-bundled at build time;
only ad-hoc CLI scripts do.

**How to apply:** declare `"tsx": "catalog:"` in api-server devDependencies and
write the npm script as `tsx ./src/scripts/foo.ts`. NOTE: pre-existing scripts
`jarvis:backfill-embeddings` and `migrate` still use the strip-types form —
`migrate` only happens to work because it imports a published package, not
`@workspace/db`; `jarvis:backfill-embeddings` would break the same way if run.

**Related (semantic retrieval):** embeddings can ONLY use the direct
`OPENAI_API_KEY` — the Replit AI Integrations proxy explicitly does not support
the embeddings API (documented in `embeddings.ts`). So a `429 quota exceeded` on
that key produces 0 embeddings and the indexer degrades fail-safe to lexical
retrieval; there is no managed fallback. Restore quota, then re-run
`pnpm --filter @workspace/api-server run jarvis:activate-memory` (idempotent).
