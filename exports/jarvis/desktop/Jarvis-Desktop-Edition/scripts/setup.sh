#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Jarvis Desktop Edition — one-time setup for a clean Mac.
# Idempotent: safe to re-run. Requires Homebrew, Node >= 20, pnpm, and Ollama.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

say() { printf "\033[36m▸ %s\033[0m\n" "$1"; }
warn() { printf "\033[33m! %s\033[0m\n" "$1"; }

# ── 1. Tooling checks ────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { warn "Node.js >= 20 not found. Install it (e.g. 'brew install node')."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { warn "pnpm not found. Install it: 'npm install -g pnpm' or 'corepack enable'."; exit 1; }

# ── 2. .env ──────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  say "Created .env from .env.example (edit it if your Postgres URL differs)."
else
  say ".env already exists — leaving it untouched."
fi

# Load DATABASE_URL (and friends) for the DB steps below.
set -a; [ -f .env ] && . ./.env; set +a
DB_URL="${DATABASE_URL:-postgresql://localhost:5432/jarvis}"
DB_NAME="$(printf '%s' "$DB_URL" | sed -E 's#.*/([^/?]+).*#\1#')"

# ── 3. PostgreSQL database + pgvector + schema ───────────────────────────────
if command -v psql >/dev/null 2>&1; then
  say "Ensuring database '${DB_NAME}' exists..."
  createdb "$DB_NAME" 2>/dev/null && say "Created database '${DB_NAME}'." || say "Database '${DB_NAME}' already exists (or createdb unavailable)."

  say "Applying schema (CREATE EXTENSION vector + jarvis_* + users)..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/jarvis_schema.sql

  say "Seeding the local super-admin..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/seed-local-admin.sql
else
  warn "psql not found — skipping DB setup. Install PostgreSQL + pgvector, then run:"
  warn "  createdb ${DB_NAME}"
  warn "  psql \"$DB_URL\" -f db/jarvis_schema.sql"
  warn "  psql \"$DB_URL\" -f scripts/seed-local-admin.sql"
fi

# ── 4. Ollama model ──────────────────────────────────────────────────────────
if command -v ollama >/dev/null 2>&1; then
  MODEL="${JARVIS_OLLAMA_MODEL:-llama3.1}"
  say "Pulling Ollama model '${MODEL}' (skip if already present)..."
  ollama pull "$MODEL" || warn "Could not pull '${MODEL}' — make sure 'ollama serve' is running."
else
  warn "Ollama not found — install from https://ollama.com then run: ollama pull llama3.1"
fi

# ── 5. Dependencies ──────────────────────────────────────────────────────────
say "Installing workspace dependencies (pnpm install)..."
pnpm install

say "Setup complete. Start everything with:  pnpm dev"
