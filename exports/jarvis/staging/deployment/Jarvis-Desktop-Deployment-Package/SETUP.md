# Jarvis Desktop — First-Time Setup

Target OS: **macOS** (Apple Silicon or Intel). Estimated time: ~20–30 min
(most of it is the Ollama model download).

## 0. Prerequisites

Install Homebrew if you do not have it:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## 1. Install runtimes

```bash
brew install node@24 pnpm postgresql@16 pgvector ffmpeg
brew install ollama        # or: download from https://ollama.com/download
```

`ffmpeg` is only needed for the Phoenix video agent; everything else needs Node,
pnpm, and Postgres.

## 2. Clone / unpack the source

Unpack **Jarvis-Desktop-Source** into your working directory. The expected
layout is:

```
jarvis-desktop/
├── apps/server      # Express backend
├── apps/web         # Vite frontend
├── packages/db      # schema + drizzle client
└── scripts          # automation
```

## 3. Install dependencies

```bash
pnpm install
```

## 4. Configure environment

```bash
cp .env.example .env
# then edit .env — see the inline comments and OLLAMA/POSTGRES setup docs
```

At minimum set: `DATABASE_URL`, `OLLAMA_BASE_URL`, `JARVIS_OLLAMA_MODEL`,
`OPENAI_API_KEY` (embeddings), `VAULT_MASTER_KEY`, and your Clerk keys.

## 5. Start the database

Either via Docker:

```bash
docker compose up -d
```

…or via Homebrew Postgres — see `POSTGRES-SETUP.md`.

## 6. Pull the cognition model

```bash
ollama pull llama3.1     # or your chosen model; must match JARVIS_OLLAMA_MODEL
```

See `OLLAMA-SETUP.md`.

## 7. Apply the database schema

```bash
./scripts/seed.sh        # creates the vector extension + all jarvis_* tables
```

## 8. Verify

```bash
./scripts/dev.sh
open http://localhost:5173
```

Sign in (Clerk), then ask Jarvis "Hello Jarvis" — you should get a normal
response generated locally by Ollama with no 429 / quota error.
