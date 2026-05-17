# AICandlez — Production Auth Checklist

> Status guide: ✅ done · ⚙️ in-code (needs env/DNS) · 📋 manual step required

---

## 1. Domain Structure

| Subdomain | Purpose | Points to |
|---|---|---|
| `aicandlez.com` | Landing page | Replit Reserved VM |
| `app.aicandlez.com` | Trading dashboard (main app) | Replit Reserved VM |
| `api.aicandlez.com` | Backend API + WebSocket | Replit Reserved VM |
| `auth.aicandlez.com` | Clerk FAPI proxy (optional — see §3) | Replit Reserved VM |

---

## 2. DNS Records (Cloudflare)

All four records should be **proxied** (orange cloud). Set SSL mode to **Full (strict)**.

```
aicandlez.com          CNAME  →  <replit-reserved-vm-domain>
www.aicandlez.com      CNAME  →  <replit-reserved-vm-domain>
app.aicandlez.com      CNAME  →  <replit-reserved-vm-domain>
api.aicandlez.com      CNAME  →  <replit-reserved-vm-domain>
```

### Cloudflare Transform Rules (Path Rewriting)

Create these Transform Rules in Cloudflare → Rules → Transform Rules → URL Rewrite:

**Rule 1 — Landing (aicandlez.com)**
```
IF  host = "aicandlez.com" OR host = "www.aicandlez.com"
AND NOT starts_with(path, "/landing/")
THEN  rewrite path to: /landing${path}
```

**Rule 2 — App (app.aicandlez.com)**
```
IF  host = "app.aicandlez.com"
AND NOT starts_with(path, "/api")
THEN  rewrite path to: ${path}   (no change — serves from root /)
```

**Rule 3 — API (api.aicandlez.com)**
```
IF  host = "api.aicandlez.com"
AND NOT starts_with(path, "/ws")     ← CRITICAL: exclude WebSocket path
THEN  rewrite path to: /api${path}
```
> The `/ws` exception is required. WebSocket connections use `/ws` directly on the
> api-server and must not be prefixed with `/api`.

### Cloudflare WebSocket
- Enable **WebSockets** in Cloudflare → Network (on by default for Pro+, must be toggled on Free).

---

## 3. Clerk Dashboard Configuration

### Instance Settings
- Instance type: **Production** (not development)
- After creating production instance: copy the production keys into env vars below.

### Allowed Origins
Add all of the following under **Clerk Dashboard → Domains → Allowed Origins**:
```
https://aicandlez.com
https://www.aicandlez.com
https://app.aicandlez.com
https://api.aicandlez.com
```

### Sign-in / Sign-up URLs
```
Sign-in URL:          https://app.aicandlez.com/sign-in
Sign-up URL:          https://app.aicandlez.com/sign-up
After sign-in URL:    https://app.aicandlez.com/command
After sign-up URL:    https://app.aicandlez.com/command
```

### Session Cookie (CRITICAL for cross-subdomain auth)
In **Clerk Dashboard → Sessions**:
- **Cookie domain**: `.aicandlez.com`  ← note the leading dot
- **SameSite**: `Lax`
- **Secure**: enabled (HTTPS only)

This single setting enables session sharing across `aicandlez.com`, `app.aicandlez.com`,
and `api.aicandlez.com` without requiring separate sign-ins.

### Clerk FAPI Proxy
The api-server already proxies Clerk's Frontend API at `/api/__clerk`.

Set **Clerk Dashboard → Domains → Proxy URL** to:
```
https://api.aicandlez.com/api/__clerk
```

Then set these env vars on the frontends:
```
VITE_CLERK_PROXY_URL=https://api.aicandlez.com/api/__clerk
```

This must be set for **both** `trading-dashboard` and `aicandlez-app`.

### OAuth Redirect URIs (if Google / GitHub login enabled)
Add to each OAuth provider's allowed callback list:
```
https://app.aicandlez.com/sign-in/sso-callback
https://app.aicandlez.com/sign-up/sso-callback
```

---

## 4. Required Environment Variables

### api-server
```env
NODE_ENV=production
CLERK_SECRET_KEY=sk_live_...          # From Clerk production instance
CLERK_PUBLISHABLE_KEY=pk_live_...     # From Clerk production instance
VAULT_MASTER_KEY=<64-char hex>        # Already set in Replit Secrets ✅
SESSION_SECRET=<random-64-char>       # Already set in Replit Secrets ✅
WEBHOOK_BASE_URL=https://app.aicandlez.com   # Stripe checkout success/cancel base
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@aicandlez.com
```

### trading-dashboard (build-time Vite vars)
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_CLERK_PROXY_URL=https://api.aicandlez.com/api/__clerk
VITE_WS_URL=wss://api.aicandlez.com/ws   # Direct WebSocket to API server
BASE_PATH=/
```

### aicandlez-app (build-time Vite vars)
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_CLERK_PROXY_URL=https://api.aicandlez.com/api/__clerk
BASE_PATH=/aicandlez-app
```

### landing (build-time)
```env
BASE_PATH=/landing
```

> **Security rules:**
> - `CLERK_SECRET_KEY` must NEVER appear in any frontend bundle (no `VITE_CLERK_SECRET_KEY`)
> - `VAULT_MASTER_KEY` must NEVER have a `VITE_` prefix
> - All secret keys must be set as Replit Secrets, not in `.env` files committed to git

---

## 5. Replit Proxy Routing

The `artifact.toml` path table (as configured):

| Path prefix | Service | Port |
|---|---|---|
| `/api` | api-server | 8080 |
| `/ws` | api-server | 8080 |
| `/landing` | landing | varies |
| `/aicandlez-app` | aicandlez-app | varies |
| `/` (catch-all) | trading-dashboard | varies |

> `/ws` was added to api-server's paths so WebSocket upgrades route correctly.
> Without this, `/ws` falls to the trading-dashboard (Vite), which cannot upgrade
> WebSocket connections.

---

## 6. WebSocket Authentication Flow

### Current implementation ✅
1. User signs in via Clerk
2. `AlertsProvider` calls `getToken()` (Clerk React hook) on `isSignedIn` change
3. Token is passed as `?token=<jwt>` query param in WebSocket URL
4. api-server `wsServer.ts` calls `verifyToken(token, { secretKey })` from `@clerk/backend`
5. On success: user is registered in the `clients` Map with their userId
6. 30-second heartbeat (ping/pong) — dead connections auto-terminated
7. On auth failure: `ws.close(4003, "Unauthorized: invalid token")`

### Reconnect behaviour ✅
- Exponential backoff: 1s → 2s → 4s → … → 30s max
- Backoff resets to 1s on successful connection
- Triggered by `onclose` event (covers both planned closes and network drops)
- `onerror` triggers `ws.close()` which cascades into `onclose` → reconnect

### Token expiry handling ✅
- Clerk JWTs expire after ~60 seconds by default
- Each reconnect calls `getToken()` fresh — fetches a new token automatically
- If `getToken()` throws (session truly expired / signed out), reconnect silently aborts
- Server-side: `verifyToken` rejects expired JWTs → `ws.close(4003)`

### Logout propagation
- `isSignedIn` flipping to `false` is the dependency in AlertsProvider's `useEffect`
- When it goes false, the `connectWs` function early-returns → no reconnect loop
- Any pending `reconnectTimer` is cleared in the cleanup function

---

## 7. Security Headers

Configured in `api-server/src/app.ts` via `helmet()`:

| Header | Status |
|---|---|
| `X-Frame-Options` | Set by helmet (SAMEORIGIN) |
| `X-Content-Type-Options` | Set by helmet (nosniff) |
| `Referrer-Policy` | Set by helmet |
| `Strict-Transport-Security` | Set by helmet (max-age=15552000) |
| `Content-Security-Policy` | Disabled — managed by frontend separately |
| `Cross-Origin-Embedder-Policy` | Disabled — allows chart/widget iframes |

Additionally configure in **Cloudflare → Security → HTTP Response Headers**:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
```

---

## 8. CORS Configuration

Hardcoded production origins in `api-server/src/app.ts`:
```
https://aicandlez.com
https://www.aicandlez.com
https://app.aicandlez.com
https://api.aicandlez.com
```

Plus dynamic `REPLIT_DOMAINS` for the Replit reserved VM domain (auto-set by Replit).

Mobile apps / health probes (no `Origin` header) — always allowed.

---

## 9. Stripe Webhook Configuration

Stripe must be told where to send webhook events.

In **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
```
Endpoint URL:  https://api.aicandlez.com/api/stripe/webhook
Events to listen:
  - customer.subscription.created
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.payment_succeeded
  - invoice.payment_failed
  - checkout.session.completed
```

After adding, copy the **Signing secret** (`whsec_...`) and set:
```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Stripe `success_url` and `cancel_url` now use `WEBHOOK_BASE_URL` which should be
set to `https://app.aicandlez.com` in production. ✅ (billing.ts already updated)

---

## 10. Deployment Order

Run steps in this exact order to avoid auth failures mid-deploy:

```
1. Set all environment variables in Replit Secrets
2. Run database migrations:   pnpm --filter @workspace/db push
3. Deploy api-server first    (Clerk proxy + auth must be live before frontends)
4. Verify api-server health:  curl https://api.aicandlez.com/api/healthz
5. Deploy trading-dashboard
6. Deploy aicandlez-app
7. Deploy landing
8. Configure Clerk proxy URL in Clerk Dashboard
9. Configure Stripe webhook endpoint
10. Run post-deploy validation (§11)
```

---

## 11. Post-Deploy Validation Tests

Run these manually after each deploy:

```bash
# 1. API health
curl https://api.aicandlez.com/api/healthz
# Expected: {"status":"ok","env":"production",...}

# 2. CORS preflight
curl -X OPTIONS https://api.aicandlez.com/api/healthz \
  -H "Origin: https://app.aicandlez.com" \
  -H "Access-Control-Request-Method: GET" -v 2>&1 | grep -i "access-control"
# Expected: Access-Control-Allow-Origin: https://app.aicandlez.com

# 3. Clerk proxy reachability
curl https://api.aicandlez.com/api/__clerk/v1/environment
# Expected: 200 JSON from Clerk (not a 404 or 502)

# 4. WebSocket upgrade
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  "https://api.aicandlez.com/ws"
# Expected: 101 Switching Protocols, then close 4001 (missing token) — proves WS reaches api-server

# 5. Auth middleware
curl https://api.aicandlez.com/api/auth/me
# Expected: 401 {"error":"Unauthorized"} (not 404 or 500)

# 6. Stripe webhook signature (sign a test event in Stripe Dashboard)
# Expected: 200 {"received":true}

# 7. Landing page
curl -s https://aicandlez.com | grep -i "aicandlez"
# Expected: page HTML with brand name

# 8. App page
curl -s https://app.aicandlez.com | grep -i "aicandlez"
# Expected: page HTML with brand name
```

---

## 12. Mobile / PWA Auth Continuity

### PWA (aicandlez-app)
- Service worker at `aicandlez-app/public/sw.js` handles push events offline
- Clerk auth state is persisted in `localStorage` by Clerk's SDK automatically
- On PWA re-launch: Clerk rehydrates session from storage, then refreshes token silently
- If session is stale (>7 days without activity), user is redirected to `/sign-in`

### Mobile browsers (Safari, Chrome Android)
- Clerk uses `__client` cookie with `Secure; SameSite=Lax; Domain=.aicandlez.com`
- Safari ITP will not affect first-party cookies — `.aicandlez.com` is the apex domain
- No third-party cookie dependency (Clerk proxy eliminates it)

### Token refresh
- Clerk tokens are short-lived (~60s). Clerk SDK auto-refreshes silently using the session cookie.
- `getToken()` always returns a fresh, valid token if the session is active.
- WS reconnects trigger a fresh `getToken()` call, so tokens are never stale in WS auth.

---

## 13. Remaining Blockers Before Reserved VM Deploy

| Item | Status | Action |
|---|---|---|
| Clerk production instance created | 📋 | Create at dashboard.clerk.com, copy keys |
| Production Clerk keys set in Replit Secrets | 📋 | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` |
| `VITE_CLERK_PROXY_URL` set on frontends | 📋 | Set to `https://api.aicandlez.com/api/__clerk` |
| `VITE_WS_URL` set on trading-dashboard | ✅ | Code updated — set `VITE_WS_URL=wss://api.aicandlez.com/ws` |
| `WEBHOOK_BASE_URL` set on api-server | ✅ | Code updated — set `WEBHOOK_BASE_URL=https://app.aicandlez.com` |
| Clerk session cookie domain set to `.aicandlez.com` | 📋 | Clerk Dashboard → Sessions |
| Clerk allowed origins configured | 📋 | Add all 4 domains |
| Cloudflare DNS CNAMEs pointing to Reserved VM | 📋 | Set after VM is provisioned |
| Cloudflare Transform Rules (3 rules) | 📋 | Including `/ws` exception on api rule |
| Cloudflare WebSockets enabled | 📋 | Network → WebSockets toggle |
| Stripe webhook endpoint registered | 📋 | `https://api.aicandlez.com/api/stripe/webhook` |
| `STRIPE_WEBHOOK_SECRET` set | 📋 | Copy from Stripe after registering endpoint |
| Database migrations run on production DB | 📋 | `pnpm --filter @workspace/db push` against prod `DATABASE_URL` |
| Reserved VM provisioned | 📋 | Replit → Deploy → Reserved VM |

> **Do NOT enable `EXCHANGE_LIVE_ENABLED=true`** — paper trading mode only.
> Live exchange execution is disabled at the code level and must remain so.
