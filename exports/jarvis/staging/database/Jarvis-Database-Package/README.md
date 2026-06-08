# Jarvis Database Package

Everything needed to stand up the Jarvis database locally (PostgreSQL 16 +
pgvector). Generated 2026-06-08.

## Contents

| File                              | Purpose                                              |
| --------------------------------- | --------------------------------------------------- |
| `jarvis_schema.sql`               | Full DDL: pgvector extension + 47 `jarvis_*` tables + `users` |
| `drizzle/schema/jarvis.ts`        | Drizzle ORM schema source (47 tables)               |
| `drizzle/schema/users.ts`         | Shared identity table (FK target)                   |
| `drizzle/drizzle.config.ts`       | Drizzle Kit config (for migrations/push)            |
| `migrations/`                     | Existing sovereignty migration + apply script       |
| `pgvector.conf.md`                | pgvector configuration notes                         |
| `init-db.sh`                      | One-shot: create extension + apply schema            |
| `SCHEMA.md`                       | Table-group documentation                            |

## Quick apply

```bash
export DATABASE_URL=postgres://jarvis:jarvis@localhost:5432/jarvis
./init-db.sh
```

## Notes

- `jarvis_schema.sql` is a `pg_dump --schema-only` capture (no owners/privileges),
  with `CREATE EXTENSION IF NOT EXISTS vector;` prepended and pg_dump-16
  `\restrict` meta-commands stripped so it replays cleanly on a fresh database.
- Embedding dimension is **1536** (OpenAI `text-embedding-3-small`). The hybrid
  profile keeps this unchanged.
- The Drizzle schema is included so you can continue using `drizzle-kit` for
  future migrations instead of raw SQL.
