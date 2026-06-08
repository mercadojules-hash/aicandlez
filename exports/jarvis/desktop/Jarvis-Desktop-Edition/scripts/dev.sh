#!/usr/bin/env bash
# Start the Jarvis Desktop Edition (backend + frontend) together.
# Thin wrapper around `pnpm dev` so you can launch from anywhere.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
exec pnpm dev
