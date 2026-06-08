# PostgreSQL + pgvector Setup

Jarvis stores executive memory, the knowledge graph, agents, governance, and
voice transcripts in PostgreSQL. The `jarvis_embeddings` table requires the
**pgvector** extension (`vector(1536)`, HNSW cosine index).

## Option A — Docker (recommended, zero local install)

`docker-compose.yml` (included) uses the official pgvector image:

```bash
docker compose up -d
```

This starts Postgres 16 with pgvector preinstalled on `localhost:5432`
(db `jarvis`, user `jarvis`, password `jarvis`). Matches the default
`DATABASE_URL` in `.env.example`.

## Option B — Homebrew

```bash
brew install postgresql@16 pgvector
brew services start postgresql@16

createuser -s jarvis
createdb -O jarvis jarvis
psql -d jarvis -c "ALTER USER jarvis WITH PASSWORD 'jarvis';"
```

## Apply the schema

The schema ships in **Jarvis-Database-Package** (`jarvis_schema.sql`). It begins
with `CREATE EXTENSION IF NOT EXISTS vector;` and creates all 47 `jarvis_*`
tables plus the shared `users` identity table.

```bash
psql "$DATABASE_URL" -f jarvis_schema.sql
# or use the helper:
./scripts/seed.sh
```

## Verify

```bash
psql "$DATABASE_URL" -c "\dx"                          # vector extension listed
psql "$DATABASE_URL" -c "\dt jarvis_*"                 # 47 tables
psql "$DATABASE_URL" -c "select count(*) from jarvis_settings;"
```

## Backups

```bash
# Full Jarvis namespace dump (schema + data)
pg_dump "$DATABASE_URL" -t 'jarvis_*' -t users > jarvis-backup-$(date +%F).sql

# Restore
psql "$DATABASE_URL" -f jarvis-backup-YYYY-MM-DD.sql
```

## Notes

- pgvector is **mandatory** — without it `jarvis_embeddings` fails to create and
  semantic search is unavailable.
- The embedding dimension is **1536** (OpenAI `text-embedding-3-small`). Do not
  change it in the hybrid profile; changing it requires a column + index rebuild
  and full re-embed (Phase 2).
