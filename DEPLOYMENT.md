# AICandlez — Production Deployment Guide

> Last updated: May 2026

## Platform Architecture

```
aicandlez.com            → Landing (static Vite — artifacts/landing)
app.aicandlez.com        → Mobile PWA (artifacts/aicandlez-app, served at root)
trade.aicandlez.com      → Customer desktop portal (artifacts/trading-dashboard)
admintrade.aicandlez.com → Operator / admin console (artifacts/trading-dashboard, separate service)
api.aicandlez.com        → Express API + WebSocket (artifacts/api-server)
auth.aicandlez.com       → Clerk auth proxy (optional)
```

> **Task #162 launch routing invariants** (do not regress):
> - `app.aicandlez.com` serves the PWA at the **root** (BASE_URL `/`).
>   Stripe return URLs are derived from `import.meta.env.BASE_URL`, not
>   hardcoded `/aicandlez-app/...` (that path 404s in production).
> - PWA `/portal` is a **cross-app redirect** to `trade.aicandlez.com/portal`
>   (env: `VITE_TRADING_DASHBOARD_URL`). The default MUST point at the
>   trading-dashboard host — pointing it at the PWA's own host self-loops.
> - `trade.aicandlez.com` Clerk `fallbackRedirectUrl` is the artifact root,
>   not `/command`. Root → `HomeRoute` → `SignedInHomeRouter` role-dispatches
>   (admin → `/command`, customer → `/portal`) in a single hop. Sending
>   everyone to `/command` causes a visible flash of admin chrome before
>   `AdminOnly` bounces non-admins.
> - Landing CTAs target `https://trade.aicandlez.com` (customer desktop
>   portal) — never `app.aicandlez.com/portal`, which double-bounces through the PWA's
>   cross-app redirect.

---

## 1. DNS Records

Configure at your DNS provider (Cloudflare recommended — use Full Strict SSL mode):

### Root domain
```
@          A        <server-ip>           ; or CNAME to Replit/Render URL
www        CNAME    aicandlez.com
```

### Subdomains
```
app          CNAME    <pwa-deploy-url>          ; mobile PWA (aicandlez-app)
trade        CNAME    <trade-deploy-url>        ; customer desktop portal
admintrade   CNAME    <admintrade-deploy-url>   ; operator/admin console
api          CNAME    <api-server-url>          ; REST + WebSocket
auth         CNAME    <clerk-proxy-url>         ; optional Clerk proxy
```

### Email / Verification
```
@          TXT      "v=spf1 include:sendgrid.net ~all"
@          TXT      "google-site-verification=<code>"
```

### Cloudflare settings
- SSL mode: **Full (strict)**
- Enable **HSTS** under SSL/TLS → Edge Certificates
- Enable **Always Use HTTPS**
- WebSocket proxying: enabled by default in Cloudflare

---

## 2. Environment Variables

### API Server (api.aicandlez.com)
```env
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://user:pass@host/aicandlez

# Clerk (production instance — pk_live_ / sk_live_)
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...

# CORS
ALLOWED_ORIGINS=https://aicandlez.com,https://www.aicandlez.com,https://app.aicandlez.com,https://trade.aicandlez.com,https://admintrade.aicandlez.com

# Session
SESSION_SECRET=<64-char-random-hex>

# Push Notifications — generate with:
#   node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"
VAPID_PUBLIC_KEY=<base64url-public-key>
VAPID_PRIVATE_KEY=<base64url-private-key>
VAPID_SUBJECT=mailto:hello@aicandlez.com

# Exchange APIs (only needed for LIVE mode)
KRAKEN_API_KEY=...
KRAKEN_API_SECRET=...
BINANCE_API_KEY=...
BINANCE_API_SECRET=...
COINBASE_API_KEY=...
COINBASE_API_SECRET=...
CRYPTOCOM_API_KEY=...
CRYPTOCOM_API_SECRET=...

# Stripe (live keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...
STRIPE_PRICE_ID_ANNUAL=price_...

# Feature flags
EXCHANGE_LIVE_ENABLED=true
```

### Customer Desktop Portal (trade.aicandlez.com)
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_CLERK_PROXY_URL=https://auth.aicandlez.com
VITE_API_BASE_URL=https://api.aicandlez.com
VITE_WS_URL=wss://api.aicandlez.com/ws
VITE_VAPID_PUBLIC_KEY=<same as VAPID_PUBLIC_KEY above>
VITE_DEFAULT_LANDING=/portal
```

### Operator / Admin Console (admintrade.aicandlez.com)
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_CLERK_PROXY_URL=https://auth.aicandlez.com
VITE_API_BASE_URL=https://api.aicandlez.com
VITE_WS_URL=wss://api.aicandlez.com/ws
VITE_VAPID_PUBLIC_KEY=<same as VAPID_PUBLIC_KEY above>
VITE_DEFAULT_LANDING=/command
```

### Mobile PWA (app.aicandlez.com, served at root)
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_BASE_URL=https://api.aicandlez.com
VITE_VAPID_PUBLIC_KEY=<same as VAPID_PUBLIC_KEY above>
# Cross-app target for PWA /portal redirect — Task #162 Phase A.
# MUST point at the trading-dashboard customer host, not back at the PWA.
VITE_TRADING_DASHBOARD_URL=https://trade.aicandlez.com
```

### Landing (aicandlez.com)
```env
VITE_APP_URL=https://app.aicandlez.com
VITE_TRADE_URL=https://trade.aicandlez.com
```

---

## 3. Clerk Production Setup

### 3a. Switch to production instance
1. In Clerk dashboard, create a **Production** instance (separate from dev)
2. Update all `CLERK_*` env vars to `pk_live_` and `sk_live_` prefixes
3. The app is provisioned at: `app_3DeE2sfuhHWTY73M9jlbRCKabFx` (dev)

### 3b. Allowed origins
Add these in Clerk Dashboard → Domains:
```
https://aicandlez.com
https://www.aicandlez.com
https://app.aicandlez.com
https://trade.aicandlez.com
https://admintrade.aicandlez.com
https://api.aicandlez.com
```

### 3c. Redirect URLs (post-auth)
Each artifact owns its own post-auth landing — Clerk-side defaults should
match these per-host. Do NOT hardcode `/command` globally; non-admins
authenticated on `trade.aicandlez.com` should land on `/portal`, which the
artifact's own `SignedInHomeRouter` handles when redirected to root.
```
Mobile PWA (app.aicandlez.com)       → /        (PWA Home, role-agnostic)
Customer Portal (trade.aicandlez.com) → /        (SignedInHomeRouter → /portal)
Admin Console (admintrade.aicandlez.com) → /command
After sign-out:                       → https://aicandlez.com/
```

### 3d. Cross-subdomain sessions (LOCKED INVARIANT)
- Configure `domain: .aicandlez.com` in Clerk session settings.
- This allows `app.aicandlez.com`, `trade.aicandlez.com`,
  `admintrade.aicandlez.com`, and `api.aicandlez.com` to share one session
  cookie. Enables "sign in once, access all surfaces".
- All four web hosts MUST use the same Clerk publishable key
  (`VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_...`). Mixing dev/prod keys
  across subdomains splits the session.
- The Clerk proxy (`VITE_CLERK_PROXY_URL=https://auth.aicandlez.com`) is
  optional but recommended; the cookie domain alone is sufficient for
  session sharing.

### 3e. OAuth providers (optional)
- Google OAuth: configure callback as `https://app.aicandlez.com/sign-in/sso-callback`
- Apple Sign In (for TestFlight): requires Apple Developer Program + OAuth app

---

## 4. Push Notification Setup

### 4a. VAPID key generation (one-time setup)
```bash
node -e "
const wp = require('web-push');
const keys = wp.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
"
```

Store both keys as environment secrets. The public key also needs to be set as `VITE_VAPID_PUBLIC_KEY` in all frontend builds.

### 4b. Web Push flow
1. User signs in → service worker registers at `BASE_URL/sw.js`
2. User grants notification permission → browser creates push subscription
3. Subscription JSON sent to `POST /api/user/push-token` (stored in `user_push_tokens`)
4. API server sends pushes via `NotificationDispatcher.sendToUser(userId, payload)`
5. Service worker receives push → shows OS notification

### 4c. Expo Push (future — native TestFlight build)
1. Enroll in Apple Developer Program ($99/year)
2. Create App ID: `com.aicandlez.app`
3. Enable push notification entitlement
4. Configure `eas.json` for EAS Build
5. Build: `eas build --platform ios --profile production`
6. Submit: `eas submit --platform ios`

---

## 5. Render.com Deployment

Deploy all services from `render.yaml`:
```bash
render deploy --yaml render.yaml
```

Services:
| Service               | Type    | Domain                  |
|-----------------------|---------|-------------------------|
| `aicandlez-api`       | Web     | api.aicandlez.com       |
| `aicandlez-dashboard` | Static  | app.aicandlez.com       |
| `aicandlez-landing`   | Static  | aicandlez.com           |
| `aicandlez-db`        | DB      | internal                |

---

## 6. Replit Deployment (Current)

1. Click **Deploy** in the Replit workspace
2. Each artifact auto-maps to its `previewPath`
3. Add custom domains in Replit project settings → Deployments → Custom Domain
4. Replit provisions Let's Encrypt TLS automatically for `.replit.app` and custom domains

---

## 7. Database Migrations

Migrations run automatically on API server start. To run manually:
```bash
pnpm --filter @workspace/api-server run migrate
```

Schema tables:
| Table                       | Purpose                          |
|-----------------------------|----------------------------------|
| `users`                     | Clerk user registry              |
| `user_settings`             | Per-user AI/risk/notification prefs |
| `user_push_tokens`          | Push notification subscriptions  |
| `user_exchange_connections` | Encrypted exchange API keys      |
| `user_notifications`        | In-app notification inbox        |
| `sim_accounts`              | Paper trading balances           |
| `sim_positions`             | Open paper positions             |
| `sim_trades`                | Closed paper trade history       |

---

## 8. Pre-Deployment Checklist

### Code
- [ ] `pnpm run typecheck` passes (zero errors)
- [ ] No `console.log` in server code (use `req.log` / `logger`)
- [ ] No hardcoded dev credentials

### Auth
- [ ] Clerk production instance keys (`pk_live_`, `sk_live_`)
- [ ] Redirect URLs updated for production domains
- [ ] Cross-subdomain session cookie configured

### Security  
- [ ] `NODE_ENV=production` on all server services
- [ ] `ALLOWED_ORIGINS` locked to production domains only
- [ ] VAPID keys generated and stored as secrets (not in code)
- [ ] `EXCHANGE_LIVE_ENABLED=true` only after security review
- [ ] Database not publicly accessible (connection string only via env)

### Push Notifications
- [ ] VAPID keys generated and set in env
- [ ] `VITE_VAPID_PUBLIC_KEY` set in all frontend builds
- [ ] Service worker accessible at `/sw.js` from PWA scope
- [ ] Notification permission prompt tested on iOS Safari and Chrome

### PWA / Mobile
- [ ] `manifest.json` `start_url` and `scope` correct for production path
- [ ] Icons present: 192x192 and 512x512 maskable
- [ ] `apple-mobile-web-app-title` = "AICandlez"
- [ ] PWA install prompt appears on Chrome/Safari

### SEO
- [ ] Landing title: "AICandlez — Institutional-Grade AI Trading"
- [ ] All OG / Twitter card meta tags complete
- [ ] `robots.txt` allows crawling
- [ ] Google Search Console property verified

### Stripe
- [ ] Live keys active (not `sk_test_`)
- [ ] Webhook endpoint registered: `https://api.aicandlez.com/api/stripe/webhook`
- [ ] `STRIPE_WEBHOOK_SECRET` set from Stripe dashboard

### TestFlight
- [ ] Apple Developer Program enrolled
- [ ] App ID: `com.aicandlez.app` created
- [ ] Push notification entitlement enabled in App ID
- [ ] Privacy policy URL: `https://aicandlez.com` (linked in footer)
- [ ] `eas.json` configured for production profile

---

## 9. Post-Deploy Verification

```bash
# API health
curl https://api.aicandlez.com/api/healthz | jq .

# WebSocket
wscat -c wss://api.aicandlez.com/ws

# PWA manifest
curl https://app.aicandlez.com/aicandlez-app/manifest.json | jq .

# CORS preflight
curl -H "Origin: https://app.aicandlez.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS https://api.aicandlez.com/api/auth/me -v 2>&1 | grep "access-control"

# Push token API (requires auth token)
curl -H "Authorization: Bearer $TOKEN" https://api.aicandlez.com/api/user/push-tokens
```

---

## 10. Tonight's Launch Sequence — `aicandlez.com` Go-Live

### A. DNS (Namecheap → Cloudflare recommended)
Add these records on Namecheap (or migrate nameservers to Cloudflare first
for full proxy/HSTS — strongly recommended):

| Type   | Host    | Value                                  | TTL  | Purpose                       |
| ------ | ------- | -------------------------------------- | ---- | ----------------------------- |
| A/ALIAS| `@`     | `<deploy IP>` or CNAME to deploy host  | Auto | Landing — `aicandlez.com`     |
| CNAME  | `www`   | `aicandlez.com`                        | Auto | Landing alias                 |
| CNAME  | `app`   | `<trading-dashboard deploy URL>`       | Auto | Customer Portal + PWA         |
| CNAME  | `admin` | `<trading-dashboard deploy URL>`       | Auto | Operator console alias        |
| CNAME  | `api`   | `<api-server deploy URL>`              | Auto | REST + WebSocket              |
| TXT    | `@`     | `v=spf1 include:_spf.google.com ~all`  | Auto | Email (if Google Workspace)   |

Note: `app` and `admin` can share the same artifact — the router decides
who lands where based on role. Use Cloudflare page rules if you want to
hard-split routing.

### B. Replit Deploy (recommended for tonight)
Deploy the **api-server** + **trading-dashboard** + **landing** artifacts as
three separate Replit Reserved VM or Autoscale deployments. Each one binds
its own subdomain via Replit's custom-domain panel.

1. `api.aicandlez.com`  → api-server (Reserved VM — persistent for WebSocket)
2. `app.aicandlez.com`  → trading-dashboard (Autoscale OK)
3. `admin.aicandlez.com`→ same trading-dashboard deployment (second domain mapping)
4. `aicandlez.com`      → landing (Autoscale)

Use `suggest_deploy` from the agent when ready.

### C. Production Secrets — Required Before Go-Live

Set in each deployment's secret panel (NOT in code):

**Shared:**
- `DATABASE_URL` — production Postgres (Neon/Replit DB)
- `SESSION_SECRET` — `openssl rand -hex 32`
- `VAULT_MASTER_KEY` — `openssl rand -hex 32` (do NOT rotate after first encrypt)
- `NODE_ENV=production`

**Clerk (production instance):**
- `CLERK_SECRET_KEY` → from Clerk dashboard `sk_live_…`
- `VITE_CLERK_PUBLISHABLE_KEY` → `pk_live_…`
- `CLERK_WEBHOOK_SECRET` (optional, for JIT mirror)

**Stripe (LIVE):**
- `STRIPE_SECRET_KEY` → `sk_live_…`
- `STRIPE_WEBHOOK_SECRET` → from registered webhook
- `VITE_STRIPE_PUBLISHABLE_KEY` → `pk_live_…`
- `STRIPE_PRICE_STARTER_MONTHLY` → live `$39.99` price ID
- `STRIPE_PRICE_PRO_MONTHLY` → live `$79.99` price ID

**Push (web):**
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VITE_VAPID_PUBLIC_KEY` /
  `VAPID_SUBJECT=mailto:hello@aicandlez.com`

**Exchanges (admin-only LIVE mode):**
- `KRAKEN_API_KEY` / `KRAKEN_API_SECRET`
- `EXCHANGE_LIVE_ENABLED=true` (admin global kill-switch)
- Alpaca: per-user encrypted via vault (no global key needed)

**CORS lock:**
- `ALLOWED_ORIGINS=https://aicandlez.com,https://app.aicandlez.com,https://admin.aicandlez.com,https://api.aicandlez.com`

### D. Clerk Production Checklist

- [ ] Switch app to Production instance (or create new prod app)
- [ ] Add `aicandlez.com`, `app.aicandlez.com`, `admin.aicandlez.com` as
      authorized domains
- [ ] Configure Google OAuth in production (separate client ID from dev)
- [ ] Set sign-in/sign-up redirect URLs to `/portal` (default user redirect)
- [ ] Brand: dark terminal theme, AICandlez logo
- [ ] Email templates: `From: AICandlez <hello@aicandlez.com>`
- [ ] Verify deliverability with sender domain DKIM/SPF records

### E. Stripe Production Checklist

- [ ] Activate live mode in Stripe dashboard
- [ ] Create live Products: `AI Trading ($39.99/mo)` and `AI Trading Pro ($79.99/mo)`
- [ ] Copy live price IDs into `STRIPE_PRICE_*` env vars
- [ ] Add webhook endpoint:
      `https://api.aicandlez.com/api/billing/webhook`
      events: `checkout.session.completed`, `customer.subscription.*`,
      `invoice.payment_failed`
- [ ] Set tax behavior to **exclusive** (or inclusive per jurisdiction)
- [ ] Test purchase with live test card → confirm sub created → confirm
      `users.plan` row updates

### F. Super-Admin Bootstrap

`mercadojules@gmail.com` is allowlisted in
`artifacts/api-server/src/lib/adminAllowlist.ts`. On first sign-in:
1. Clerk webhook (or `GET /api/auth/me`) fires JIT provisioning.
2. `usersTable` row is created with `role='super-admin'`.
3. Action is audit-logged as `ADMIN_ACTION · auto_promote_allowlisted_email`.
4. `HomeRoute` redirects to `/command` on next page load.

Confirm by:
```sql
SELECT clerk_user_id, email, role
FROM users
WHERE email = 'mercadojules@gmail.com';
```

### G. Pre-Flight Verification

```bash
# 1. Customer cannot access admin routes
curl -i https://api.aicandlez.com/api/exchange/status \
     -H "Authorization: Bearer <customer-token>"   # → 403

# 2. Engine-control rejects non-admin
curl -i -X POST https://api.aicandlez.com/api/engine/stop \
     -H "Authorization: Bearer <customer-token>"   # → 403

# 3. Public market data still works for everyone
curl https://api.aicandlez.com/api/engine/status        # → 200
curl https://api.aicandlez.com/api/healthz              # → 200

# 4. Live confidence floor is 80
grep LIVE_EXECUTION_MIN_CONFIDENCE artifacts/api-server/src/lib/tradingLoop.ts
# → export const LIVE_EXECUTION_MIN_CONFIDENCE = 80;
```

### H. iOS / EAS Submission — Follow-Up Track

Mobile is a **separate work track** (Expo `natura-ai` artifact). Current
status from prior session:
- Expo prebuild succeeds
- Metro config fixed
- CocoaPods SSL is a local-only macOS issue
- Remaining blocker: corrupted EAS project linkage / invalid UUID appId

Next steps (requires Apple credentials, deferred to a follow-up task):
1. `eas init --force` from a clean checkout to re-link project
2. Verify `app.json` `extra.eas.projectId` matches new EAS UUID
3. `eas build --platform ios --profile production --clear-cache`
4. `eas submit --platform ios --latest`
5. TestFlight invite test users

> The web platform launch (api/app/admin/landing) is **independent** of
> iOS submission and can ship tonight without waiting on EAS.
