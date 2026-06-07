---
name: Jarvis prod schema deploy (pg_dump replay)
description: How the jarvis_ namespace reaches Render prod, and the pitfalls that bite an idempotent per-statement replay.
---

The jarvis_ table namespace is NOT pushed to Render prod by drizzle-kit (dev
`drizzle-kit push` never reaches prod — see prod-db-on-render). Prod had ZERO
jarvis_ tables until it was seeded by replaying the dev schema.

**Mechanism:** dump dev with `pg_dump --schema-only -t 'jarvis_*'`, rewrite
CREATE TABLE/INDEX to `IF NOT EXISTS`, apply to prod per-statement with
duplicate-tolerant error codes (42P07/42710/42701/42P06/42P16/42P04) so a
constraint with no `IF NOT EXISTS` form is skipped if it already exists. The
committed `.sql` is the deploy record; the `.mjs` runner is dry-run by default,
`--apply` executes.

**Why pg_dump, not drizzle:** drizzle has no prod credential path here and the
namespace was already drifted (44 tables). A schema-only replay is additive,
auditable, and re-runnable.

**Pitfalls that cost time:**
- **pg_dump 16+ emits psql meta-commands** (`\restrict` / `\unrestrict`). These
  are NOT valid SQL and break a per-statement `client.query()` replay — strip any
  line starting with `\` before splitting on `;`.
- **pgvector**: `jarvis_embeddings` uses the `vector(1536)` type. pg_dump does
  NOT emit `CREATE EXTENSION`. Prepend `CREATE EXTENSION IF NOT EXISTS vector;`
  (verified available on Render prod, v0.8.1) or that one table fails 42704
  "type public.vector does not exist".
- The code_execution sandbox has no `process.env` and can't resolve `pg`; run the
  runner via bash so RENDER_PROD_DATABASE_URL is present and import pg by absolute
  `.pnpm` path.
