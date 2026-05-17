# AICandlez — Production Deployment Guide

> Last updated: May 2026

## Platform Architecture

```
aicandlez.com            → Landing (static Vite — artifacts/landing)
app.aicandlez.com        → Operator console / desktop terminal (artifacts/trading-dashboard)
app.aicandlez.com/…pwa   → Mobile PWA (artifacts/aicandlez-app)
api.aicandlez.com        → Express API + WebSocket (artifacts/api-server)
auth.aicandlez.com       → Clerk auth proxy (optional)
```

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
app        CNAME    <replit-deploy-url>   ; trading dashboard + PWA
api        CNAME    <api-server-url>      ; REST + WebSocket
auth       CNAME    <clerk-proxy-url>     ; optional Clerk proxy
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
ALLOWED_ORIGINS=https://aicandlez.com,https://www.aicandlez.com,https://app.aicandlez.com

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

### Trading Dashboard / Operator Console (app.aicandlez.com)
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_CLERK_PROXY_URL=https://auth.aicandlez.com
VITE_API_BASE_URL=https://api.aicandlez.com
VITE_WS_URL=wss://api.aicandlez.com/ws
VITE_VAPID_PUBLIC_KEY=<same as VAPID_PUBLIC_KEY above>
```

### Mobile PWA (aicandlez-app, served under app.aicandlez.com)
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_BASE_URL=https://api.aicandlez.com
VITE_VAPID_PUBLIC_KEY=<same as VAPID_PUBLIC_KEY above>
```

### Landing (aicandlez.com)
```env
VITE_APP_URL=https://app.aicandlez.com
VITE_PWA_URL=https://app.aicandlez.com/aicandlez-app/
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
https://api.aicandlez.com
```

### 3c. Redirect URLs
```
Sign-in success:   https://app.aicandlez.com/command
Sign-up success:   https://app.aicandlez.com/command
After sign-out:    https://aicandlez.com/
```

### 3d. Cross-subdomain sessions
- Configure `domain: .aicandlez.com` in Clerk session settings
- This allows `app.aicandlez.com` and `api.aicandlez.com` to share one session cookie
- Enables "sign in once, access all surfaces" (mobile, desktop, API)

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
