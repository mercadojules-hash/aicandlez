# Jarvis Dependency Inventory

Generated 2026-06-08. Covers everything Jarvis Desktop Edition needs to run, plus
every external/Replit coupling and how it is handled in the hybrid Phase 1 build.

## System dependencies (Mac)

| Tool        | Why                                          | Install                  |
| ----------- | -------------------------------------------- | ------------------------ |
| Node 24     | Runtime for backend + frontend tooling       | `brew install node@24`   |
| pnpm        | Workspace package manager                    | `brew install pnpm`      |
| PostgreSQL 16 | Database                                    | `brew install postgresql@16` |
| pgvector    | Vector extension (semantic memory)           | `brew install pgvector`  |
| Ollama      | Local cognition LLM                          | `brew install ollama`    |
| ffmpeg      | Phoenix video agent (optional)               | `brew install ffmpeg`    |
| Docker (opt)| One-command Postgres+pgvector                 | Docker Desktop           |

## Backend runtime dependencies (npm)

From `apps/server` (lifted from api-server, Jarvis subset):

- **Web/server:** `express`, `cors`, `helmet`, `cookie-parser`, `http-proxy-middleware`
- **Database:** `drizzle-orm`, `pg` (via `@workspace/db`)
- **Auth:** `@clerk/express`, `@clerk/backend`, `@clerk/shared`
- **AI:** `openai` (cognition→Ollama via baseURL; embeddings→OpenAI),
  `@anthropic-ai/sdk` (optional alt provider)
- **Validation:** `zod`, `@workspace/api-zod`
- **Logging:** `pino`, `pino-http`
- **Crypto/vault:** `@noble/hashes`, `@noble/secp256k1`
- **Voice (optional):** ElevenLabs via REST (no SDK required)
- **Storage:** local filesystem adapter (replaces `@google-cloud/storage`)
- **Misc:** `web-push`, `ws`, `dotenv`, `@msgpack/msgpack`

> Dependencies NOT needed by Jarvis and dropped from the standalone build:
> `stripe`, `stripe-replit-sync`, `@dydxprotocol/v4-client-js`,
> `google-auth-library` (object-storage auth — replaced), exchange/trading libs.

## Frontend dependencies (npm)

From `apps/web` (lifted from artifacts/jarvis — 65 devDependencies). Key ones:

- **Core:** `react`, `react-dom`, `vite`, `@vitejs/plugin-react`
- **Auth:** `@clerk/react`, `@clerk/themes`
- **Data:** `@tanstack/react-query`, `@workspace/api-client-react` (generated)
- **Routing:** `wouter`
- **UI:** full `@radix-ui/*` set, `tailwindcss`, `embla-carousel-react`
- **Dropped:** `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`,
  `@replit/vite-plugin-runtime-error-modal` (Replit dev-only plugins)

See `package-manifests/` for the verbatim `package.json` files.

## External services

| Service   | Role                  | Phase 1 handling                      |
| --------- | --------------------- | ------------------------------------- |
| Ollama    | Cognition (local)     | **Primary** — runs on localhost       |
| OpenAI    | Embeddings (1536-dim) | **Kept** (hybrid) — needs API key     |
| Clerk     | Auth                  | **Kept** — your own Clerk app keys    |
| ElevenLabs| Premium voice (opt)   | Optional REST key; browser voice free |

See `EXTERNAL-SERVICES.md` and `REPLIT-DEPENDENCIES.md` for the full breakdown.
