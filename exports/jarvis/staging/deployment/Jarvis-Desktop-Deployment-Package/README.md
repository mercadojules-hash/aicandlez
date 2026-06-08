# Jarvis Desktop Edition

A standalone, Replit-free build of the **Jarvis Executive Command Center**, designed
to run entirely on a local Mac.

**Architecture (hybrid):**

- **Cognition:** Ollama (local LLM) — e.g. `llama3.1` / `qwen2.5`
- **Embeddings:** OpenAI `text-embedding-3-small` (1536-dim) — *unchanged*
- **Database:** Local PostgreSQL 16 + pgvector
- **Memory & Knowledge Graph:** local Postgres (`jarvis_*` tables)
- **Voice:** browser-native tier (no key) + optional ElevenLabs premium
- **Dashboard:** local Vite + React frontend

## Components

| Layer        | Tech                              | Port            |
| ------------ | --------------------------------- | --------------- |
| Frontend     | Vite 7 + React 19                 | `5173`          |
| Backend      | Express (Jarvis routes only)      | `3000`          |
| Database     | PostgreSQL 16 + pgvector          | `5432`          |
| Cognition    | Ollama                            | `11434`         |

## Quick start

```bash
# 1. One-time setup (installs deps, pulls model, starts DB, applies schema)
./scripts/setup.sh

# 2. Run everything
./scripts/dev.sh

# 3. Open the dashboard
open http://localhost:5173
```

See `SETUP.md`, `STARTUP.md`, `OLLAMA-SETUP.md`, `POSTGRES-SETUP.md`, and
`MACOS-DEPLOYMENT.md` for full detail.

## What is in this deployment package

- `README.md` — this file
- `SETUP.md` — first-time setup
- `STARTUP.md` — day-to-day run instructions
- `.env.example` — environment variable template
- `OLLAMA-SETUP.md` — local LLM install + model pull
- `POSTGRES-SETUP.md` — local Postgres + pgvector
- `MACOS-DEPLOYMENT.md` — end-to-end macOS walkthrough
- `docker-compose.yml` — one-command Postgres + pgvector
- `scripts/setup.sh`, `scripts/dev.sh`, `scripts/seed.sh` — automation

> Source code ships in **Jarvis-Desktop-Source**; database schema in
> **Jarvis-Database-Package**; dependency inventory in
> **Jarvis-Dependency-Inventory**.

## Important notes

- This is the **hybrid** profile: cognition is fully local (Ollama), but
  **embeddings still call OpenAI** (kept unchanged per Phase 1 scope). You need a
  valid `OPENAI_API_KEY` for semantic memory/knowledge search. If it is absent,
  Jarvis degrades to lexical search automatically — it does not crash.
- **Auth:** Clerk is retained. Clerk is an external SaaS (not Replit-specific);
  point the app at your own Clerk application keys.
- **Object storage** (creative/vision/vault binaries) is replaced by a local
  filesystem adapter during the implementation phase. Until then those features
  degrade gracefully.
