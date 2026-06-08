#!/usr/bin/env bash
# Jarvis Desktop — one-time setup. Idempotent; safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ Jarvis Desktop setup"

# 1. Tooling (skips anything already installed)
if command -v brew >/dev/null 2>&1; then
  echo "▶ Installing runtimes via Homebrew…"
  brew install node@24 pnpm postgresql@16 pgvector ffmpeg ollama || true
else
  echo "⚠ Homebrew not found. Install it first: https://brew.sh"
fi

# 2. Env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "▶ Created .env from template — EDIT IT before running (keys/DB)."
fi

# 3. Dependencies
echo "▶ pnpm install…"
pnpm install

# 4. Database
if command -v docker >/dev/null 2>&1; then
  echo "▶ Starting Postgres + pgvector via Docker…"
  docker compose up -d
  echo "▶ Waiting for DB…"; sleep 5
fi

# 5. Cognition model
MODEL="${JARVIS_OLLAMA_MODEL:-llama3.1}"
if command -v ollama >/dev/null 2>&1; then
  echo "▶ Pulling Ollama model: $MODEL"
  ollama pull "$MODEL" || echo "⚠ Pull failed — run 'ollama serve' then retry."
fi

# 6. Schema
echo "▶ Applying schema…"
./scripts/seed.sh || echo "⚠ Schema apply failed — check DATABASE_URL in .env."

echo "✅ Setup complete. Run ./scripts/dev.sh"
