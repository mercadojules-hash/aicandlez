#!/usr/bin/env bash
# Jarvis Database Package — create extension + apply full schema.
set -euo pipefail
cd "$(dirname "$0")"
: "${DATABASE_URL:?Set DATABASE_URL, e.g. postgres://jarvis:jarvis@localhost:5432/jarvis}"

echo "▶ Enabling pgvector…"
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "▶ Applying jarvis_schema.sql…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ./jarvis_schema.sql

echo "✅ Done."
psql "$DATABASE_URL" -c "select count(*) as jarvis_tables from information_schema.tables where table_name like 'jarvis\_%';"
