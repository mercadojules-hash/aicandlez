# Jarvis Desktop Edition

A fully standalone, single-user build of **Jarvis** — the executive command
center — that runs entirely on your own Mac. No Replit, no Clerk, no cloud
account required. Cognition runs locally through **Ollama**; data persists in a
local **PostgreSQL + pgvector** database.

This is a lean, **Jarvis-only** package: none of the AICandlez trading, Stripe,
or exchange code is included.

---

## What's inside

```
Jarvis-Desktop-Edition/
├── artifacts/
│   ├── jarvis/          # React + Vite frontend (the Jarvis UI)
│   └── jarvis-server/   # Lean Express backend (Jarvis routes + libs only)
├── lib/
│   ├── db/                       # Drizzle schema + Postgres client
│   ├── api-client-react/         # React Query client helpers
│   └── integrations-anthropic-ai/# Anthropic SDK helper (optional cloud path)
├── db/jarvis_schema.sql          # Full schema (pgvector + jarvis_* + users)
├── scripts/
│   ├── setup.sh                  # One-time bootstrap (DB + Ollama + deps)
│   ├── dev.sh                    # Start backend + frontend together
│   └── seed-local-admin.sql      # Seeds the single local super-admin
├── .env.example
├── pnpm-workspace.yaml
└── package.json
```

---

## Prerequisites (clean Mac)

Install these once via [Homebrew](https://brew.sh):

```bash
# Node.js 20+ and pnpm
brew install node
npm install -g pnpm          # or: corepack enable

# PostgreSQL 16 + pgvector
brew install postgresql@16 pgvector
brew services start postgresql@16

# Ollama (local LLM runtime)
brew install ollama
ollama serve &               # leave running in its own terminal
ollama pull llama3.1         # the default cognition model
```

> **pgvector note:** the schema runs `CREATE EXTENSION vector`. The `pgvector`
> formula installs the extension into your Homebrew Postgres automatically. If
> you use Postgres.app or another distribution, install pgvector for that build.

---

## Quick start

```bash
# 1. From the project root, run the one-time bootstrap.
#    Creates .env, the database, the schema, seeds the admin, pulls the model,
#    and installs dependencies.
bash scripts/setup.sh

# 2. Start everything (backend on :5050, frontend on :5173).
pnpm dev
```

Then open **http://localhost:5173**.

### Manual setup (if you skip setup.sh)

```bash
cp .env.example .env
createdb jarvis
psql "$DATABASE_URL" -f db/jarvis_schema.sql
psql "$DATABASE_URL" -f scripts/seed-local-admin.sql
pnpm install
pnpm dev
```

---

## Configuration (`.env`)

Every value is optional — localhost defaults apply when unset. See
`.env.example` for the annotated list. Highlights:

| Variable                | Default                     | Purpose                                            |
| ----------------------- | --------------------------- | -------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://localhost:5432/jarvis` | Postgres connection (pgvector required for embeddings). |
| `OLLAMA_BASE_URL`       | `http://localhost:11434`    | Local LLM endpoint (default cognition provider).   |
| `JARVIS_OLLAMA_MODEL`   | `llama3.1`                  | Ollama model used for reasoning.                   |
| `ANTHROPIC_API_KEY`     | _(unset)_                   | Optional — if set, used instead of Ollama.         |
| `OPENAI_API_KEY`        | _(unset)_                   | Optional — enables semantic embeddings + cognition.|
| `JARVIS_SERVER_PORT`    | `5050`                      | Backend port.                                      |
| `JARVIS_WEB_PORT`       | `5173`                      | Frontend port.                                     |

### Cognition provider priority

`callModel` selects a provider by **key availability**, in this order:

1. `ANTHROPIC_API_KEY` → Anthropic (Claude) directly
2. else `OPENAI_API_KEY` → OpenAI directly
3. else → **local Ollama** (`OLLAMA_BASE_URL`, default `http://localhost:11434`)

So a clean desktop with no cloud keys reasons **fully offline** through Ollama.
Every call is fail-safe: a provider outage degrades gracefully rather than
crashing the server.

### Embeddings

Semantic (vector) embeddings require an `OPENAI_API_KEY` (1536-dim). Without it,
Jarvis automatically falls back to lexical search — everything still works, just
without vector similarity.

---

## Loading a knowledge collection (TXT / Markdown import)

To populate the Jarvis Brain from a folder of plain-text files (for example an
exported Open WebUI knowledge collection of `.txt` files), use the bundled
importer. There is no separate UI for this — it is a one-shot script:

```bash
# From the project root, with .env in place:
pnpm import:knowledge -- /absolute/path/to/Jarvis-Test

# Also mirror each file into the executive memory corpus:
pnpm import:knowledge -- /path/to/Jarvis-Test --memories

# Assets only, skip embedding generation:
pnpm import:knowledge -- /path/to/Jarvis-Test --no-embed
```

What it does:

1. Each file → one row in `jarvis_knowledge_assets` (title from the first line,
   full text as content). Rows are keyed by a UNIQUE `source_path`, so re-running
   **upserts** instead of duplicating — safe to run repeatedly.
2. With `--memories`, also mirrors each file into `jarvis_memories`.
3. Unless `--no-embed`, runs the cognition indexer to compute vector embeddings
   into `jarvis_embeddings` and enables semantic retrieval. This step needs
   `OPENAI_API_KEY`; without it the import still succeeds and Executive Query
   answers in **lexical** mode (only vector similarity is unavailable).

Flags: `--memories`, `--no-embed`, `--tag=<tag>`, `--source-prefix=<p>`,
`--ext=.txt,.md`.

> `importVault` (the Vault restore route) is **not** the right tool for raw
> files — it only restores a previously exported Jarvis namespace dump. Use this
> importer for arbitrary TXT/Markdown folders.

---

## How desktop mode differs from the cloud build

- **Authentication is removed.** A local shim authorizes every request as a
  single **super-admin** (`local-admin` / `admin@localhost`). The Clerk frontend
  components are replaced with lightweight stubs. There are no other users.
- **Cognition defaults to Ollama** instead of the Replit AI proxy.
- **Backend is Jarvis-only** — no trading/billing/exchange routes.
- **Object storage** (used by the Vault + Vision features) is optional; those
  features degrade gracefully if Google Cloud Storage credentials are absent.

---

## Common commands

```bash
pnpm dev          # backend + frontend together
pnpm dev:api      # backend only
pnpm dev:web      # frontend only
pnpm build        # production build of the frontend
pnpm typecheck    # typecheck libs + apps
```

---

## Troubleshooting

- **Blank page / API errors:** make sure the backend is running (`pnpm dev:api`)
  and reachable at `http://localhost:5050/api/healthz`.
- **`CREATE EXTENSION "vector"` fails:** pgvector isn't installed for your
  Postgres build. Install it (`brew install pgvector`) and re-run the schema.
- **Cognition returns nothing:** confirm `ollama serve` is running and the model
  is pulled (`ollama list`).
- **Port already in use:** set `JARVIS_SERVER_PORT` / `JARVIS_WEB_PORT` in `.env`.
