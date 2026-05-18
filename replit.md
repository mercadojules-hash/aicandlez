# AICandlez — Workspace

Institutional AI crypto trading SaaS. pnpm workspace monorepo, TypeScript.

> Phase 1–4 + Phase 5 design history is archived at the end of this file.
> Only the *current* production-active architecture lives in the top sections.

---

## Stack

- **Monorepo**: pnpm workspaces, Node 24, TypeScript 5.9
- **API**: Express 5 + Drizzle ORM (PostgreSQL) + Zod (`zod/v4`, `drizzle-zod`)
- **API codegen**: Orval (from OpenAPI in `lib/api-spec`)
- **Auth**: Replit-managed Clerk (httpOnly cookie web, Bearer mobile)
- **Billing**: Stripe (3-tier ladder)
- **Build**: esbuild (CJS bundle for server), Vite (PWA + dashboard + landing)

See `pnpm-workspace` skill for workspace structure and TS project references.

---

## Artifacts (production-active)

| Artifact              | Kind   | Path             | Role                                                |
| --------------------- | ------ | ---------------- | --------------------------------------------------- |
| `landing`             | web    | `/`              | Public marketing landing (signed-out)               |
| `aicandlez-app`       | web    | `/aicandlez-app` | **Primary PWA** — institutional mobile-first        |
| `trading-dashboard`   | web    | `/dashboard`     | Operator desktop console (19 modules + `/desktop`)  |
| `api-server`          | api    | `/api`           | Shared Express backend                              |
| `natura-ai`           | mobile | `/natura-ai`     | Expo wellness app — **production-frozen**           |
| `natura-web`          | web    | `/natura-web`    | Legacy companion site                               |
| `mockup-sandbox`      | design | `/sandbox`       | Canvas iframe variant previews                      |

**Mobile freeze (current phase):** `natura-ai` is in production freeze.
All forward work is on **`aicandlez-app` PWA** + **`trading-dashboard`** desktop
institutional platform.

---

## Billing Structure (current — supersedes all earlier pricing)

3-tier ladder. **No `$5.99` references exist anywhere in the codebase.**

| Plan ID   | Name              | Price   | Capacity                    | Key features                                              |
| --------- | ----------------- | ------- | --------------------------- | --------------------------------------------------------- |
| `free`    | Paper Trading     | Free    | Simulated only              | 7-Day AI Paper Trading, signals + watchlists, no live exec |
| `starter` | AI Trading        | $15.99  | Up to **3** AI trades       | Live AI exec (Alpaca), Auto Trade, analytics              |
| `pro`     | AI Trading Pro    | $39.99  | Up to **12** AI trades      | Crypto + Equities, priority exec, advanced AI scanners    |

- Performance fee on **profitable closed trades only** (label = `PERFORMANCE_FEE_LABEL` from `lib/fees`)
- Stripe billing: monthly · cancel anytime · customer portal for downgrades

**Routes:**
- `Subscribe.tsx` — full marketing 3-tier ladder (entry from upgrade banners)
- `Billing.tsx` — account billing & plan page with status banner, CURRENT / ACTIVE / PRO ACTIVE badges, upgrade CTAs, Manage Billing portal
- `SubscriptionContext.tsx` — single source of truth for `plan` (`free`/`starter`/`pro`)

**API:** `POST /billing/checkout`, `POST /billing/portal`, `GET /billing/subscription`

---

## Routing (current)

**aicandlez-app PWA (mobile-first, primary user surface):**
- `/` Home (radar + AI Market Scanner + Top Gainers + Active Trades)
- `/signals`, `/crypto`, `/equities`, `/trade`, `/portfolio`
- `/profile` → AI Settings, **Alert Preferences** (new), Connected Accounts, Broker
- `/billing`, `/subscribe`

**trading-dashboard desktop console:**
- `/` Landing (signed-out) → `/command` (signed-in)
- `/dashboard`, `/command`, `/market`, `/ai`, `/risk`, `/sim`, `/backtest`, `/optimizer`, `/scanner`, `/portfolio`, `/correlation`, `/journal`, `/validation`, `/sentiment`, `/exchange`, `/syscheck`, `/debug`, `/charts`
- `/desktop` — Module 20 multi-panel power-user terminal
- `/settings`, `/sign-in/*`, `/sign-up/*`

**api-server:** `/api/exchange/*`, `/api/sentiment/*`, `/api/validation/*`, `/api/journal/*`, `/api/simulation/*`, `/api/signals/*`, `/api/candles/*`, `/api/backtest/*`, `/api/auth/*`, `/api/billing/*`, `/api/user/*`

---

## Authentication (Clerk, production)

- Clerk app: `app_3DeE2sfuhHWTY73M9jlbRCKabFx`
- `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` auto-provisioned
- `lib/db/src/schema/users.ts` — `users` table (clerkUserId, email, role: user/admin/super-admin)
- Server: `clerkProxyMiddleware` (prod only) → `clerkMiddleware` → `requireAuth` / `requireRole`
- Frontend: `ClerkProvider` + `ClerkQueryClientCacheInvalidator` in App shells
- All dashboard/PWA routes redirect to `/sign-in` when unauthenticated
- Clerk UI: dark terminal theme (#050D1A card, neon-green primary, monospace, AICandlez logo)

---

## AI Trading Architecture

**Global trading loop** (shared signals across users):
- `lib/tradingLoop.ts` — EMA+RSI engine, MTF funnel (5m/15m/1H), volume + sideways + 1H-trend filters
- Default `minConfidence = 60`
- Filters: volume confirmation ON (≥85% of 20-bar avg), sideways block (<0.15% spread), 1H trend OFF by default

**User-scoped state** (per-userId isolation, no cross-tenant bleed):
- `lib/userSimRegistry.ts` — `Map<userId, UserSimState>` lazy DB-load, instant persistence
- All `/api/simulation/*` routes are `requireAuth`-gated → route through registry
- Tables: `user_settings`, `sim_accounts`, `sim_positions`, `sim_trades`, `user_notifications`
- Each user starts with $100,000 simulated balance

**Exchange connections** (per-user encrypted credentials):
- `user_exchange_connections` table — AES-256-GCM, per-user PBKDF2 key derivation
- `CredentialVault` — `encryptBlob` / `decryptBlob`, raw keys never persisted plaintext
- Supported: Kraken, Binance, Coinbase, Bybit, OKX, KuCoin
- **Withdrawal permissions never requested, never tested, always `false`**
- Live mode default OFF; requires `acknowledged: true` to enable
- Connection test = `getTicker` + `getAccount` round-trip before any DB write

**Exchange secrets (LIVE mode):** `KRAKEN_API_KEY`, `KRAKEN_API_SECRET`, `EXCHANGE_LIVE_ENABLED=true`

---

## AI Market Scanner (Home.tsx radar)

10+ rotating intelligent states, priority-ordered decision tree:
`Initializing market feed` → `Strong breakout activity detected` →
`High volatility detected — proceed with caution` →
`Momentum increasing across crypto markets` →
`Bullish momentum strengthening` → `Bearish pressure increasing` →
`Market sentiment: Bullish/Bearish` →
`AI detecting institutional accumulation` →
`Trend continuation likely` → `Risk elevated — choppy market` →
`Volatility compression detected` → `Accumulation patterns forming` →
`Low-confidence market conditions` → `Market conditions favorable` →
`Equity market cooling — crypto holding steady` →
`AI tracking emerging opportunities` → `Scanning for high-confidence setups`

Each branch reads `breakdowns` (per-symbol AI state) + `tickersData` (live moves).

---

## Notification & Feedback Scaffolding

**`artifacts/aicandlez-app/src/lib/feedback.ts`** — unified architecture layer:
- `ALERT_DEFINITIONS` — 10 alert types (AI Signals, Auto Trade Exec, Trade Open/Close, TP/SL Hit, High-Confidence Setups, Scanner, Volatility, Portfolio)
- `FeedbackPrefs` — localStorage object with master switches (push/sounds/haptics) + per-alert toggles
- `useFeedbackPrefs` — React hook with cross-tab `storage` sync
- `triggerHaptic(intensity)` — `navigator.vibrate` wrapper; OFF by default (institutional default)
- `playNotificationCue(state)` — routes through existing `executionSounds.ts` bus
- `shouldNotify(key)` — central gate for future push-emit code

**UI:** `Profile.tsx → AlertPreferencesSection` renders all toggles between AI Settings and Connected Accounts. Child rows dim when no delivery channel is enabled.

**Web Push backend** (existing, Phase 4): `public/sw.js` + `usePushNotifications` hook + `SwRegistrar` + server-side `NotificationDispatcher` with VAPID. The new feedback layer reads/writes the same `pushEnabled` flag.

---

## Finalized UI System (current — locked, do not redesign)

**Brand:** neon-green system. `#66FF66` brand · `#00C853` deep emerald · `#7CFF00` bright lime · `#39FF14` vivid neon. Backgrounds `#000` / `#050A07` / `#0A1410` / `#0F1F18`.

**Design tokens:**
- `artifacts/aicandlez-app/src/index.css` — HSL `--primary` = 120° (green), `--brand{-deep,-bright,-vivid,-glow,-bloom,-whisper}`, `--ink-0..3`, `--glass-1..3`, animation lib (`brand-pulse`, `orb-breathe`, `ticker-scroll`, `dot-pulse`, `bar-in`, `bar-breathe`, `scan-line`, `edge-sweep`, `chart-drift`, `wave-bar`, `particle-float`, `shimmer`)
- `artifacts/natura-ai/constants/theme.ts` — green tokens (mobile, frozen)

**Locked surfaces — do not restructure:**
- Home (radar centerpiece + AI Market Scanner + Top Gainers + Active Trades + portfolio hero)
- Signals, Crypto, Equities (asset cards, ranking, confidence rings)
- Profile structure (AI Settings → Alert Preferences → Connected Accounts → Broker)
- Bottom navigation (green/black, status pip)
- Brand header (centered master logo + green underglow)
- Typography hierarchy, scroll containers, all approved cards

**Master assets:**
- `artifacts/aicandlez-app/src/assets/aicandlez-logo-master.png`
- `artifacts/aicandlez-app/src/assets/aicandlez-icon-master.png`

---

## Trading Dashboard Modules (19 active + 20)

1 Dashboard · 2 Market Data · 3 Indicators · 4 AI Reasoning · 5 Risk Management ·
6 Simulation · 7 Backtesting · 8 Strategy Optimizer · 9 Asset Scanner ·
10 Portfolio · 11 Correlation · 12 Trade Journal · 13 Validation ·
14 Sentiment AI · 15 Exchange · 16 System Verification · 17 Signal Debug ·
18 Multi-Asset Chart · 19 Command Center · **20 Desktop Terminal** (`/desktop`)

Global components (App-level): `AlertsProvider` (8s poll, dedupe, sound toggle), `SettingsDrawer` (floating gear, mobile drawer / desktop popover).

---

## Production Deployment

- `DEPLOYMENT.md` — complete domain map, DNS, SSL, Clerk prod, push setup, Render + Replit deploy, migrations, pre/post-deploy checklist
- `render.yaml` — 4 services (aicandlez-api, aicandlez-dashboard, aicandlez-app, aicandlez-landing) with VAPID + exchange keys + security headers
- `.env.production.example` — all env vars for all four services
- CORS locked to `aicandlez.com`, `app.aicandlez.com`, `api.aicandlez.com`
- Webhooks: Stripe (`STRIPE_WEBHOOK_SECRET`), Clerk

---

## Production Export

**Build the production ZIP:**
```bash
python3 scripts/build-export-zip.py
```
Output: `artifacts/trading-dashboard/public/aicandlez-production.zip`
Served at: `/aicandlez-production.zip` (download link in dashboard sidebar)

Includes: `lib/db`, `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`,
`artifacts/api-server`, `artifacts/trading-dashboard`, `artifacts/aicandlez-app`,
`artifacts/landing`, `scripts/`, root configs, `.env.example`, `SETUP.md`, `DEPLOYMENT.md`, `render.yaml`.

Excludes: `node_modules/`, `dist/`, `.git/`, `natura-ai`, `natura-web`, `mockup-sandbox`, `attached_assets/`, `.local/`, `.replit-artifact/`.

---

## Key Commands

- `pnpm run typecheck` — full typecheck (libs build → leaf typecheck)
- `pnpm run typecheck:libs` — composite lib build only
- `pnpm --filter @workspace/<slug> run typecheck` — single package
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client + Zod
- `python3 scripts/build-export-zip.py` — build production ZIP

**Do not** run `pnpm dev` at workspace root — use `restart_workflow <slug>`.

---

## Environment Variables (canonical list)

**Auto-provisioned:** `DATABASE_URL`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `VAULT_MASTER_KEY`, `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VITE_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT`

**Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`, plus `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_PRO_MONTHLY` (price IDs mapped per `PlanId`)

**Exchanges (LIVE):** `KRAKEN_API_KEY/SECRET`, `BINANCE_API_KEY/SECRET`, `COINBASE_API_KEY/SECRET`, `CRYPTOCOM_API_KEY/SECRET`, `EXCHANGE_LIVE_ENABLED=true`

**Production-only:** `CLERK_SECRET_KEY_LIVE`, `VITE_CLERK_PUBLISHABLE_KEY_LIVE`

---

## natura-ai (production-frozen)

Mobile-first AI wellness app (Expo/React Native). AsyncStorage only — no backend.
Onboarding → AI Chat → Wellness Plans → Recipes → Daily Routine → Grocery → Saved → Check-In → Profile.
Light theme, warm cream `#F8F6F0`, forest green `#3D7A45`, Inter, radius 16.
**No further dev work** while the desktop/web institutional platform is in active development.

---

# Archive — Implementation History

*Condensed summaries of historical phases. Full detail lives in git history.*

**Phase 1 — Authentication (DONE)**
Clerk fully integrated. Public landing at `/`, sign-in/up routes, all dashboard routes protected. `users` table with role enum. `clerkProxyMiddleware` + `clerkMiddleware` + `requireAuth`/`requireRole`. JIT user provisioning via `GET /api/auth/me`.

**Phase 2 — User-Scoped Trading Platform (DONE)**
Every authenticated user gets fully isolated simulation environment. 5 new DB tables (`user_settings`, `sim_accounts`, `sim_positions`, `sim_trades`, `user_notifications`). `userSimRegistry` Map with lazy DB-load + immediate persistence. All `/api/simulation/*` + `/api/user/*` routes auth-gated. `Settings.tsx` page added at `/settings`.

**Phase 3 — Exchange Connection Management (DONE)**
Per-user encrypted exchange credentials. `user_exchange_connections` table with AES-256-GCM + per-user PBKDF2. 6 exchanges. Connection test gates writes. Live mode requires `acknowledged: true`. Withdrawal perms never requested. Settings page exchange connection cards + ConnectModal wizard.

**Phase 4 — Production Deployment Foundation (DONE)**
VAPID push infra: `sw.js`, `usePushNotifications`, `SwRegistrar`, `NotificationDispatcher`, `POST /api/user/notify`. Offline push fallback in `wsServer.ts`. Module 20 Desktop Terminal at `/desktop`. `DEPLOYMENT.md`, `.env.production.example`, `render.yaml` with 4 services. Full production-readiness audit (zero apexdigital / placeholder strings).

**Phase 5 — Neon-Green Brand Pivot (DONE)**
Cyan → neon-green system-wide. Brand palette tokens, glass primitives, animation library. Home rebuilds for both PWA (Vite/React) and Expo. Legacy aliases preserved (`C.cyan`, `C.purple`, `C.teal`, `C.green` remap onto green) so existing components re-skin automatically. Tab bar reskin on natura-ai.

**Phase 5.1 — PWA Home Radar Polish (DONE)**
Centered master logo brand header. Real branded crypto icons (BTC/ETH/SOL/ADA/AVAX/DOGE inline SVG). `RadarScanner` component (concentric rings + rotating sweep + asset blips + breathing center medallion). Cinematic typography (48px tabular-nums portfolio hero), atmospheric background (orbs + rays + grid + vignette), glowing BUY/SELL CTAs.

**Phase 5.2 — Final Master Polish (DONE — current)**
- Billing.tsx full rewrite to 3-tier ladder with status badges + upgrade/downgrade/portal CTAs
- `lib/feedback.ts` notification + sound + haptic scaffolding (10 alert types, master switches, localStorage-backed, cross-tab synced)
- Profile.tsx Alert Preferences section
- Home.tsx scanner expanded with 5 new intelligent states (now 10+ rotating)
- All approved layouts/cards/nav/typography preserved exactly as-is
- Zero `$5.99` references in source

---

## User Preferences

- Always brand work as **AICandlez** (never apex / apexdigital legacy names)
- Performance-fee language always reads "on profitable trades only · never on losses"
- Institutional tone — premium, restrained, no arcade/gambling cues
- Mobile-first PWA is the primary user surface, desktop console is operator-only
- Withdrawal permissions are never requested from exchanges (security promise)
