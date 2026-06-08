#!/usr/bin/env bash
# Jarvis Desktop — run backend + frontend together.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a

# Ensure Ollama is reachable
if ! curl -fsS "${OLLAMA_BASE_URL:-http://localhost:11434/v1}/models" >/dev/null 2>&1; then
  echo "⚠ Ollama not reachable at ${OLLAMA_BASE_URL:-http://localhost:11434}. Start it: ollama serve"
fi

echo "▶ Starting backend (:3000) and frontend (:5173)…"
pnpm --filter @jarvis/server run dev &
SERVER_PID=$!
pnpm --filter @jarvis/web run dev &
WEB_PID=$!

trap 'echo "▶ Stopping…"; kill $SERVER_PID $WEB_PID 2>/dev/null || true' INT TERM
wait
