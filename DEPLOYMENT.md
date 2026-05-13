# Apex Trader — Production Deployment Guide

## Architecture

```
apexdigital.design          → Marketing / WordPress
app.apexdigital.design      → Dashboard (React + Vite, static)
api.apexdigital.design      → API + WebSocket (Express + Node.js)
```

The platform is a pnpm monorepo. The API server and dashboard are deployed as separate services.

---

## Quick Start (Render — Recommended)

Render has native monorepo support and a free managed PostgreSQL tier.

### 1. Fork / push to GitHub

Push this repository to a GitHub account accessible to your Render workspace.

### 2. Create a new Render Blueprint

1. Go to **render.com → New → Blueprint**
2. Point it at your repository root
3. Render reads `render.yaml` automatically — it will provision:
   - `apex-trader-api` — Node.js web service (API + WebSocket)
   - `apex-trader-dashboard` — Static site (React dashboard)
   - `apex-trader-db` — PostgreSQL database

### 3. Set secret environment variables

In the Render dashboard, set the following on the `apex-trader-api` service:

| Variable | Value |
|---|---|
| `CLERK_SECRET_KEY` | Your Clerk secret key (`sk_live_...`) |
| `CLERK_PUBLISHABLE_KEY` | Your Clerk publishable key (`pk_live_...`) |
| `VAULT_MASTER_KEY` | 32+ char random secret (never change after first deploy) |
| `STRIPE_SECRET_KEY` | Your Stripe secret key (optional — billing) |

On the `apex-trader-dashboard` service:

| Variable | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Your Clerk publishable key |

`DATABASE_URL`, `SESSION_SECRET`, and `WEBHOOK_BASE_URL` are pre-configured in `render.yaml`.

### 4. Deploy

Click **Apply** — Render runs the build and start commands automatically.

Health check: `GET https://api.apexdigital.design/api/healthz`

---

## Quick Start (Railway)

### 1. Create a new Railway project

```bash
railway login
railway init
```

Or create via the Railway dashboard and link your GitHub repo.

### 2. Add a PostgreSQL plugin

In your Railway project → **New → Database → PostgreSQL**.
Railway automatically sets `DATABASE_URL` in your service environment.

### 3. Configure services

Railway reads `railway.json` and `nixpacks.toml` from the repo root.

Set these environment variables in Railway:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `CLERK_SECRET_KEY` | `sk_live_...` |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
| `SESSION_SECRET` | 64-char random string |
| `VAULT_MASTER_KEY` | 32-char random string |
| `WEBHOOK_BASE_URL` | `https://api.apexdigital.design` |
| `EXCHANGE_LIVE_ENABLED` | `false` (enable only when ready) |

### 4. Deploy

```bash
railway up
```

---

## Custom Domain Setup

### DNS Records (add at your DNS provider)

```
# API backend
api.apexdigital.design   CNAME   your-render-service.onrender.com
                    OR   CNAME   your-railway-service.up.railway.app

# Dashboard frontend
app.apexdigital.design   CNAME   your-render-static-site.onrender.com
                    OR   CNAME   your-railway-frontend.up.railway.app
```

Both Render and Railway provide free TLS via Let's Encrypt — no manual SSL cert needed.

### Clerk domain configuration

In your Clerk dashboard:
1. Go to **Domains** → add `app.apexdigital.design`
2. Update **Redirect URLs** to include `https://app.apexdigital.design`
3. Update **Sign-in URL** to `https://app.apexdigital.design/sign-in`

### Stripe webhook configuration

After deploying, update the Stripe webhook endpoint:
1. Stripe Dashboard → **Webhooks → Edit**
2. Set endpoint URL to `https://api.apexdigital.design/api/stripe/webhook`
3. Or set `WEBHOOK_BASE_URL=https://api.apexdigital.design` — the server registers it automatically on startup.

---

## Build Commands Reference

```bash
# Full build (all libs + API server bundle)
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run build

# Database migrations (run before starting the server)
pnpm --filter @workspace/api-server run migrate

# Start the production server
pnpm --filter @workspace/api-server run start

# Build the dashboard (static files → artifacts/trading-dashboard/dist/)
pnpm --filter @workspace/trading-dashboard run build
```

---

## WebSocket Connection

The API server exposes a WebSocket endpoint at `/ws` on the same port as the HTTP API.

**Mobile app / external clients:**

```
wss://api.apexdigital.design/ws?token=<clerk_jwt>
```

Pass the Clerk session JWT as a query parameter. The server verifies it before accepting the connection.

**Supported events (server → client):**

| Event | Payload |
|---|---|
| `connected` | `{ userId, subscriptions[] }` |
| `market_data` | `{ symbol, price, volume, timestamp }` |
| `signal` | `{ symbol, action, confidence, reason, timestamp }` |
| `trade_executed` | `{ symbol, side, price, sizeUSD, timestamp }` |
| `system_status` | `{ killSwitch, autoMode, uptime, timestamp }` |
| `pong` | `{ timestamp }` |

**Supported events (client → server):**

| Event | Payload |
|---|---|
| `ping` | `{}` |
| `subscribe` | `{ symbols: ["BTCUSD", "ETHUSD"] }` |
| `unsubscribe` | `{ symbols: ["SOLUSD"] }` |

Default subscriptions on connect: `BTCUSD`, `ETHUSD`, `SOLUSD`.

---

## Health Checks

| Endpoint | Description |
|---|---|
| `GET /api/healthz` | Full status: DB ping, WS count, uptime |
| `GET /api/livez` | Lightweight liveness probe (no DB call) |

Both return HTTP 200 when healthy, 503 when degraded.

---

## Environment Variables Reference

See `.env.example` for the full list with descriptions.

**Required in production:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Clerk server-side secret |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `SESSION_SECRET` | Session signing secret (min 32 chars) |
| `VAULT_MASTER_KEY` | AES-256 vault master key (min 32 chars) |
| `WEBHOOK_BASE_URL` | Public API base URL for Stripe webhook |

**Optional but recommended:**

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe billing (auto-set by Replit integration) |
| `EXCHANGE_LIVE_ENABLED` | `true` to unlock live trading (default: `false`) |
| `KRAKEN_API_KEY` / `KRAKEN_API_SECRET` | Live Kraken trading |

---

## Production Checklist

- [ ] `DATABASE_URL` set and database is reachable
- [ ] `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` set
- [ ] `SESSION_SECRET` is a random 64-char string (never the example value)
- [ ] `VAULT_MASTER_KEY` is a random 32-char string (never change after first use)
- [ ] `WEBHOOK_BASE_URL` points to production API domain
- [ ] `EXCHANGE_LIVE_ENABLED=false` (enable deliberately when ready)
- [ ] Clerk dashboard: production domain added, redirect URLs updated
- [ ] Stripe webhook endpoint updated to `https://api.apexdigital.design/api/stripe/webhook`
- [ ] DNS records propagated (`api.*` and `app.*` subdomains)
- [ ] TLS active on both subdomains
- [ ] `GET /api/healthz` returns `{ "status": "ok", "db": { "status": "ok" } }`
- [ ] WebSocket connection test: `wscat -c "wss://api.apexdigital.design/ws?token=<jwt>"`
- [ ] Sign-in flow works on `app.apexdigital.design`
- [ ] Billing page loads and Stripe Checkout opens
- [ ] `EXCHANGE_LIVE_ENABLED` left `false` until full production sign-off

---

## Mobile App Connectivity (Phase 6)

The mobile app (Expo / React Native) will connect to:

- **REST API:** `https://api.apexdigital.design/api`
- **WebSocket:** `wss://api.apexdigital.design/ws?token=<clerk_jwt>`
- **Auth:** Clerk Bearer token (obtained via `@clerk/expo`)

No localhost references — the mobile app requires the production API to be live.
