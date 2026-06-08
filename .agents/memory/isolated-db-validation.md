---
name: Isolated temp-DB validation for ingestion scripts
description: How to safely validate a schema-dependent ingestion/migration script without touching dev data
---

To validate a destructive or schema-dependent script (e.g. a bulk ingestion pipeline) without mutating the dev Jarvis/AICandlez tables:

1. The Replit Postgres role (`postgres`) has `rolcreatedb=t`, so you CAN `CREATE DATABASE <tmp>`.
2. Build the temp URL by swapping the db name on `DATABASE_URL` (`BASE="${DATABASE_URL%/*}"; TMPURL="$BASE/<tmp>"`).
3. **`CREATE EXTENSION IF NOT EXISTS vector` on the temp DB BEFORE `drizzle-kit push`** — the schema includes `jarvis_embeddings` with a `vector` column; push fails without the extension even if you only intend to touch non-embedding tables.
4. Push schema: `DATABASE_URL="$TMPURL" pnpm --filter @workspace/db run push`.
5. Run the script with `DATABASE_URL="$TMPURL"`, assert counts, **re-run to prove idempotency** (identical counts), check for dangling graph edges, then `DROP DATABASE`.

**Why:** lets you prove correctness + idempotency + graph integrity on a clean slate with the real schema and real cognition modules, with zero risk to dev data.
**How to apply:** any future "import/backfill/migrate" script review — prefer this over running against dev or trusting typecheck alone.
