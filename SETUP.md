# Local Development Setup — Apex Trader

## Requirements

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org or `nvm install 20` |
| pnpm | 9 or 10 | `npm install -g pnpm@10` or `corepack enable` |
| PostgreSQL | 14+ (optional) | https://www.postgresql.org/download/ |

> **PostgreSQL is optional.** The app starts without it — all DB-backed features
> (trade history, portfolio, settings) return empty/mock data. Signals and the UI
> are fully functional without a database.

---

## 1. Install dependencies

```bash
pnpm install
```

This installs all workspace packages including `lib/api-client-react`,
`lib/api-zod`, and `lib/db` which are consumed by the frontend and backend.

---

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
# Required for full DB persistence (optional — app works without it)
DATABASE_URL=postgresql://postgres:password@localhost:5432/apex_trader

# Required for session security (any random 32+ char string)
SESSION_SECRET=replace_this_with_a_random_32_char_string
```

`PORT` and `BASE_PATH` are **not** required — they default to `8080` (API) and
`5173` / `/` (frontend) automatically.

---

## 3. (Optional) Set up PostgreSQL

If you want full persistence:

```bash
# Create the database
createdb apex_trader

# Run migrations
pnpm --filter @workspace/db run migrate
```

---

## 4. Start the app

### Option A — Both services in one command (recommended)

```bash
pnpm run dev:all
```

This runs the API server and the React frontend in parallel with coloured output.

### Option B — Two separate terminals

**Terminal 1 — API server (port 8080):**
```bash
pnpm run dev:api
```

**Terminal 2 — Frontend (port 5173):**
```bash
pnpm run dev
```

---

## 5. Open the dashboard

- **Dashboard** → http://localhost:5173
- **API health** → http://localhost:8080/api/healthz

---

## Running on non-Linux platforms (macOS / Windows)

The `pnpm-workspace.yaml` file contains esbuild platform overrides that exclude
all non-Linux binaries to reduce install size. If you see esbuild errors on macOS
or Windows, remove the `overrides` block for esbuild from `pnpm-workspace.yaml`
and run `pnpm install` again.

---

## TypeScript

```bash
# Full typecheck (libs + all artifacts)
pnpm run typecheck

# Libs only
pnpm run typecheck:libs
```

> Note: a small number of pre-existing type errors exist in `Chart.tsx`,
> `Logs.tsx`, `button-group.tsx`, and `calendar.tsx` — these are known and do
> not affect runtime behaviour.

---

## Regenerating API client code

If you change the OpenAPI spec (`lib/api-spec/openapi.yaml`):

```bash
pnpm --filter @workspace/api-spec run codegen
```

This regenerates the React Query hooks in `lib/api-client-react` and the Zod
schemas in `lib/api-zod`.
