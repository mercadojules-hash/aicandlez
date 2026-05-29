# AICandlez — Setup Guide

> **Updated for Phase 3:** Live Trading Console, Exchange Connection Management (Kraken, Binance.US, Coinbase, Crypto.com), user-scoped simulation accounts, and Clerk authentication.

## Requirements

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 24 LTS | https://nodejs.org or `nvm install 24` |
| pnpm | 9+ | `npm install -g pnpm@9` or `corepack enable` |
| PostgreSQL | 14+ (optional) | https://www.postgresql.org/download/ |

> **PostgreSQL is optional.** The app starts without it — all DB-backed features
> (trade history, portfolio, settings) return empty/mock data. Signals, AI engine,
> and the full UI are functional without a database.

---

## 1. Install dependencies

```bash
pnpm install
```

This installs all workspace packages: `lib/api-client-react`, `lib/api-zod`,
`lib/db`, `artifacts/api-server`, and `artifacts/trading-dashboard`.

---

## 2. Configure environment

```bash
cp .env.example .env
```

> **How env loading works locally:**
> The API server imports `dotenv/config` as its very first statement, which reads
> your `.env` file automatically before any other code runs. No manual patching
> needed — just ensure `.env` exists with the values below.

**Minimum required variables:**

```bash
# For full DB persistence (app works without it in mock mode)
DATABASE_URL=postgresql://postgres:password@localhost:5432/aicandlez

# Session security — generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=your_random_32_char_string_here

# Credential vault encryption key (set before storing any exchange keys)
VAULT_MASTER_KEY=your_random_32_char_vault_key_here
```

---

## 3. Database setup (optional)

```bash
# Create the database
createdb aicandlez

# Run migrations via Drizzle
pnpm --filter @workspace/db run migrate
# or
pnpm --filter @workspace/api-server run db:push
```

---

## 4. Authentication (Clerk)

AICandlez uses [Clerk](https://clerk.com) for user authentication. You need your own Clerk application for local development.

**Steps:**

1. Sign up free at https://clerk.com and create a new **Application**
2. In **API Keys**, copy both keys into your `.env`:
   ```bash
   CLERK_SECRET_KEY=sk_test_...
   CLERK_PUBLISHABLE_KEY=pk_test_...
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...   # same value as above
   ```
3. In **User & Authentication → Email, Phone, Username**, enable Email address
4. In **Paths**, ensure:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in URL: `/command`
5. (Optional) Enable Google OAuth in **Social Connections**

> Without valid Clerk keys the dashboard redirects all routes to sign-in and
> the API's `requireAuth` middleware returns 401 on all protected endpoints.

---

## 5. Start services

### Option A — Two terminals (recommended)

**Terminal 1 — API server (port 8080):**
```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Dashboard (port 5173):**
```bash
pnpm --filter @workspace/trading-dashboard run dev
```

The Vite dev server automatically proxies `/api/*` requests to `localhost:8080` — no separate reverse proxy is needed.

### Option B — Single command
```bash
# Install concurrently once: pnpm add -g concurrently
npx concurrently \
  "pnpm --filter @workspace/api-server run dev" \
  "PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trading-dashboard run dev"
```

---

## 6. Verify everything is running

```bash
# API health
curl http://localhost:8080/api/healthz

# Mobile API ping
curl http://localhost:8080/api/mobile/ping

# Exchange adapter status
curl http://localhost:8080/api/adapters

# Engine status
curl http://localhost:8080/api/engine/status
```

Open the dashboard: **http://localhost:5173**

---

## 6. Exchange Configuration

### Simulation Mode (default — no keys needed)
All trades are paper trades. The signal engine runs live against Kraken public API.
No API keys required. This is the **safe default**.

### Live Trading Mode (Kraken)
1. Add to `.env`:
   ```bash
   KRAKEN_API_KEY=your_api_key
   KRAKEN_API_SECRET=your_base64_secret
   EXCHANGE_LIVE_ENABLED=true
   ```
2. Switch to LIVE mode via the Exchange module UI or:
   ```bash
   curl -X POST http://localhost:8080/api/exchange/mode \
     -H "Content-Type: application/json" \
     -d '{"mode":"live"}'
   ```

### Additional Exchanges (Binance, Coinbase, Bybit, OKX, KuCoin)
Add the corresponding env vars (see `.env.example`) and use the adapter API:
```bash
# Set active adapter
curl -X POST http://localhost:8080/api/adapters/active \
  -H "Content-Type: application/json" \
  -d '{"exchange":"Binance"}'
```

---

## 7. Mobile API

The mobile API is served from the same backend process — no separate service needed.

```bash
# Key mobile endpoints
GET  /api/mobile/ping        — Health check
GET  /api/mobile/status      — Engine + risk snapshot
GET  /api/mobile/portfolio   — Balances + positions
GET  /api/mobile/signals     — Last 10 signals
GET  /api/mobile/symbols     — Per-symbol signal cards
POST /api/mobile/kill        — Emergency kill switch
```

---

## 8. Production Build

```bash
# TypeScript check — must show 0 errors
pnpm run typecheck

# Build API server (esbuild CJS bundle)
pnpm --filter @workspace/api-server run build

# Build dashboard (Vite)
pnpm --filter @workspace/trading-dashboard run build
```

Built artifacts:
- API: `artifacts/api-server/dist/server.js`
- Dashboard: `artifacts/trading-dashboard/dist/`

---

## 9. Regenerating API client

If you change the OpenAPI spec (`lib/api-spec/openapi.yaml`):

```bash
pnpm --filter @workspace/api-spec run codegen
```

This regenerates React Query hooks in `lib/api-client-react` and Zod schemas in `lib/api-zod`.

---

## TypeScript

```bash
# Full typecheck (libs + all artifacts) — expected: 0 errors
pnpm run typecheck

# Libs only (composite build)
pnpm run typecheck:libs

# API server only
pnpm --filter @workspace/api-server run typecheck
```

---

## Signal Quality Filters

Configure via `POST /api/engine/filters`:

```json
{ "volumeFilter": true, "require1HTrend": false }
```

| Filter | Default | Description |
|--------|---------|-------------|
| `volumeFilter` | `true` | Volume ≥ 65% of 20-bar rolling avg |
| `require1HTrend` | `false` | 1H EMA9 must align with signal direction |
| Sideways filter | Always ON | EMA spread < 0.15% blocks signal |
| Min confidence | 60 | Minimum adjusted confidence |

---

## Non-Linux Platforms (macOS / Windows)

The `pnpm-workspace.yaml` contains esbuild platform overrides optimised for Linux.
If you see esbuild errors on macOS or Windows:
1. Remove or comment out the `overrides` block in `pnpm-workspace.yaml`
2. Run `pnpm install` again

---

## Troubleshooting

| Problem | Solution |
|---------|---------|
| API not responding | Check `PORT` env var and ensure api-server is running |
| `EXCHANGE_LIVE_ENABLED` not working | Ensure `KRAKEN_API_KEY` and `KRAKEN_API_SECRET` are also set |
| TypeScript errors on install | Run `pnpm run typecheck:libs` first to build composite packages |
| DB connection refused | Ensure PostgreSQL is running and `DATABASE_URL` is correct |
| Vault decryption error | `VAULT_MASTER_KEY` must match the value used when credentials were stored |
