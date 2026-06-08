#!/usr/bin/env bash
# Jarvis Desktop — apply database schema (idempotent).
# Expects jarvis_schema.sql from the Jarvis-Database-Package alongside this repo,
# or set SCHEMA_FILE to its path.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a
: "${DATABASE_URL:?DATABASE_URL not set (edit .env)}"

SCHEMA_FILE="${SCHEMA_FILE:-./jarvis_schema.sql}"
if [ ! -f "$SCHEMA_FILE" ]; then
  echo "⚠ $SCHEMA_FILE not found. Copy jarvis_schema.sql from the Database Package,"
  echo "  or run: SCHEMA_FILE=/path/to/jarvis_schema.sql ./scripts/seed.sh"
  exit 1
fi

echo "▶ Ensuring pgvector extension…"
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "▶ Applying schema from $SCHEMA_FILE …"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"

echo "✅ Schema applied."
psql "$DATABASE_URL" -c "\dt jarvis_*" | tail -5
