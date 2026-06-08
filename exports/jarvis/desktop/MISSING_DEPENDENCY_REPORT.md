# Jarvis Desktop Edition — Missing-Dependency Report

**Date:** June 08, 2026

This report lists every gap discovered while assembling the standalone package,
how it was found, and the resolution. All items are **resolved** — the package
installs, builds, and boots cleanly. The remaining "runtime prerequisites" are
not bugs; they are expected things the end user installs on their own Mac.

---

## A. Code/source gaps found & fixed during assembly

### 1. Missing backend helper `src/lib/objectAcl.ts`
- **Symptom:** backend boot crashed with
  `ERR_MODULE_NOT_FOUND: ...src/lib/objectAcl` imported from
  `src/lib/objectStorage.ts`.
- **Cause:** `objectStorage.ts` was copied without its sibling `objectAcl.ts`.
- **Fix:** copied `objectAcl.ts` from the source `api-server`. It pulls only
  `@google-cloud/storage` (already a declared dep). A full recursive scan of the
  backend `src/` tree then confirmed **all** local imports resolve.
- **Status:** RESOLVED — backend boots; `/api/healthz` and `/api/auth/me` 200.

### 2. `packageManager` pinned to a pnpm version without catalog support
- **Symptom:** first clean install failed with
  `@types/node@catalog: isn't supported by any available resolver` under
  `pnpm@9.3.0`.
- **Cause:** the source monorepo pins `pnpm@9.3.0` in `packageManager`, but its
  actual runtime binary is pnpm 10.x — so catalogs work there despite the pin.
  `catalog:` support only landed in **pnpm 9.5**. On a clean Mac, corepack would
  honor the pin and fetch 9.3.0, which cannot resolve catalogs.
- **Fix:** bumped `packageManager` to `pnpm@10.26.1` so corepack provisions a
  catalog-capable pnpm automatically.
- **Status:** RESOLVED — clean install succeeds (463 pkgs).

### 3a. Hardening: loopback bind + CORS allow-list (post-review fix)
- **Finding (code review):** the local super-admin auth shim combined with a
  `0.0.0.0` bind and `cors({ origin: true })` made privileged endpoints reachable
  from the LAN / any browser origin.
- **Fix:** the API now binds to `127.0.0.1` by default and restricts CORS to the
  local web origin; LAN exposure is an explicit opt-in (`JARVIS_BIND_HOST`,
  `JARVIS_CORS_ORIGINS`). Re-verified: boots on loopback, `/api/healthz` 200.
- **Status:** RESOLVED.

### 3. Replit-only build plugins & Clerk auth (removed, not "missing")
- `@replit/*` Vite plugins removed from the frontend and from
  `pnpm-workspace.yaml` catalog/overrides (they require the Replit runtime).
- `@clerk/clerk-react` and `@clerk/themes` replaced with local stubs and aliased
  in `vite.config.ts`. The desktop build authorizes a single local super-admin,
  so no Clerk keys are needed.
- **Status:** RESOLVED — frontend builds with zero unresolved imports.

---

## B. Runtime prerequisites (user-provided, NOT shipped in the ZIP)

These are intentionally external — they are host software or optional secrets,
documented in `README.md` and `.env.example`. The app installs and boots without
them (with graceful degradation noted).

| Item | Required? | If absent |
| ---- | --------- | --------- |
| Node 20+ / pnpm ≥ 9.5 | Yes | install/run fails — see README |
| PostgreSQL 16 | Yes | no persistence; DB-backed routes degrade |
| **pgvector** extension | Yes for embeddings | `CREATE EXTENSION vector` in schema fails to set up vector search |
| Ollama + `llama3.1` | Yes for offline cognition | cognition has no local provider; set a cloud key instead |
| `OPENAI_API_KEY` | Optional | embeddings fall back to **lexical** search |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Optional | cognition uses local Ollama (default) |
| Google Cloud Storage creds | Optional | Vault/Vision media features degrade gracefully |

---

## C. NPM dependencies (all declared, all resolved at install)

- **Backend (`jarvis-server`):** `@anthropic-ai/sdk`, `@google-cloud/storage`,
  `@replit/connectors-sdk`, `@workspace/db`,
  `@workspace/integrations-anthropic-ai`, `cors`, `dotenv`, `drizzle-orm`,
  `express`, `helmet`, `openai`, `pino`, `pino-http`, `pino-pretty`, `zod`.
  > Note: `@replit/connectors-sdk` is a published npm package used only for
  > optional connector metadata reads; it is not the Replit runtime and installs
  > fine off-platform. It is never on the boot-critical path.
- **Frontend (`jarvis`):** React + Vite + Radix UI + Tailwind + Recharts +
  Framer Motion + TanStack Query + `@workspace/api-client-react` (catalog subset
  in `pnpm-workspace.yaml`).
- **Libs:** `db` (drizzle-orm, pg, drizzle-zod, zod), `api-client-react`
  (@tanstack/react-query), `integrations-anthropic-ai` (@anthropic-ai/sdk).
- **Root:** `concurrently`, `dotenv-cli`, `typescript`, `@types/node`,
  `@types/pg`.

**No unresolved dependency remains.** Verified by a real `pnpm install` in a
clean directory (`/tmp/jarvis-verify`).
