# Jarvis Desktop — macOS Deployment Walkthrough

End-to-end guide to run Jarvis Executive Command Center entirely on a Mac with
**no Replit dependency**. Hybrid profile: Ollama cognition + OpenAI embeddings.

## Architecture on a Mac

```
                 ┌──────────────────────────────────────────────┐
   Browser ──────►  Vite frontend (apps/web)         :5173       │
                 └───────────────┬──────────────────────────────┘
                                 │  /api/* via authFetch (VITE_API_BASE_URL)
                 ┌───────────────▼──────────────────────────────┐
                 │  Express backend (apps/server)     :3000      │
                 │   • /api/jarvis/* (216 endpoints)             │
                 │   • Clerk auth middleware                     │
                 └───┬───────────────┬───────────────┬──────────┘
                     │               │               │
        cognition    │   embeddings  │     data      │
                     ▼               ▼               ▼
        Ollama  :11434     OpenAI API        Postgres+pgvector :5432
        (local LLM)        (text-embedding-   (jarvis_* + users)
                            3-small, 1536d)
                     ▲
        binaries ────┘  Local filesystem storage (./.local-storage)
        video ───────►  ffmpeg (brew)
```

## Step-by-step

1. **Install runtimes** (`SETUP.md` §1): Node 24, pnpm, Postgres 16, pgvector,
   ffmpeg, Ollama.
2. **Unpack source** (Jarvis-Desktop-Source) into `jarvis-desktop/`.
3. **`pnpm install`**.
4. **`cp .env.example .env`** and fill keys (Clerk, OpenAI for embeddings,
   `VAULT_MASTER_KEY`).
5. **Database:** `docker compose up -d` (or Homebrew, see `POSTGRES-SETUP.md`).
6. **Schema:** `./scripts/seed.sh` (applies `jarvis_schema.sql` from the
   Database Package).
7. **Model:** `ollama pull llama3.1` (match `JARVIS_OLLAMA_MODEL`).
8. **Run:** `./scripts/dev.sh`.
9. **Open:** <http://localhost:5173>, sign in via Clerk, test "Hello Jarvis".

## Replit components and their local replacements

| Replit component                  | Local replacement                          | Phase 1 status |
| --------------------------------- | ------------------------------------------ | -------------- |
| Replit-managed Clerk tenant       | Your own Clerk application keys             | Keep           |
| OpenAI (cognition)                | Ollama (local)                             | Replaced       |
| OpenAI (embeddings)               | OpenAI (unchanged, hybrid)                 | Keep           |
| Replit App Storage (object store) | Local filesystem adapter                   | Replaced       |
| `@replit/connectors-sdk` (GitHub) | Octokit + PAT, or disabled                 | Deferred       |
| Replit AI proxy (fallback)        | n/a (Ollama is primary)                    | Dropped        |
| Replit Vite dev plugins           | removed                                     | Dropped        |
| Replit workspace proxy            | direct localhost ports                     | Dropped        |

## Production-on-Mac (optional, later)

For an always-on local install rather than dev servers:

- Build the frontend: `pnpm --filter @jarvis/web run build` → serve `dist/` via the
  Express backend or any static server.
- Run the backend under a process manager (`pm2`, `launchd`, or `brew services`).
- Keep Ollama + Postgres running as background services.

This is out of Phase 1 scope but the build is compatible with it.
