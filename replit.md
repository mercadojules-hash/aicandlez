# AICandlez — Workspace

Institutional AI crypto trading SaaS. pnpm workspace monorepo, TypeScript.

> Only the *current* production-active architecture lives here.
> Historical phase / per-task narration is preserved in git history.

---

## Stack

- pnpm workspaces, Node 24, TypeScript 5.9
- API: Express 5 + Drizzle ORM (PostgreSQL) + Zod (`zod/v4`, `drizzle-zod`)
- API codegen: Orval (from OpenAPI in `lib/api-spec`)
- Auth: Replit-managed Clerk (httpOnly cookie web, Bearer mobile)
- Billing: Stripe (3-tier ladder)
- Build: esbuild (CJS server bundle), Vite (PWA + dashboard + landing)

See `pnpm-workspace` skill for workspace structure and TS project references.

---

## Artifacts (production-active)

| Artifact            | Kind   | Path             | Role                                                |
| ------------------- | ------ | ---------------- | --------------------------------------------------- |
| `landing`           | web    | `/`              | Public marketing landing (signed-out)               |
| `aicandlez-app`     | web    | `/aicandlez-app` | **Primary PWA** — institutional mobile-first        |
| `trading-dashboard` | web    | `/dashboard`     | Operator console + customer desktop portal          |
| `api-server`        | api    | `/api`           | Shared Express backend                              |
| `natura-ai`         | mobile | `/natura-ai`     | Expo wellness app — **production-frozen**           |
| `natura-web`        | web    | `/natura-web`    | Legacy companion site                               |
| `mockup-sandbox`    | design | `/sandbox`       | Canvas iframe variant previews                      |

**Mobile freeze:** `natura-ai` is frozen. Forward work = `aicandlez-app`
PWA + `trading-dashboard` desktop institutional platform.

---

## Billing (3-tier ladder)

**No `$5.99` references exist anywhere in the codebase.**

| Plan ID   | Name           | Price   | Capacity                | Notes                                           |
| --------- | -------------- | ------- | ----------------------- | ----------------------------------------------- |
| `free`    | Paper Trading  | Free    | Simulated only          | 7-Day AI Paper, signals + watchlists, no live   |
| `starter` | AI Trading     | $39.99  | Up to **3** AI trades   | Live AI exec (Kraken), Auto Trade, analytics    |
| `pro`     | AI Trading Pro | $79.99  | Up to **12** AI trades  | Crypto majors+alts+emerging, priority exec, scanners |

- Performance fee **on profitable closed trades only** (label =
  `PERFORMANCE_FEE_LABEL` from `lib/fees`)
- Monthly · cancel anytime · customer portal for downgrades

**Routes/state:** `Subscribe.tsx` (marketing ladder), `Billing.tsx`
(account billing), `SubscriptionContext.tsx` (single source of truth for
`plan` = `free`/`starter`/`pro`).

**API:** `POST /billing/checkout`, `POST /billing/portal`, `GET /billing/subscription`.

---

## Routing — locked invariants

### aicandlez-app PWA (mobile-first customer surface)
- `/` Home · `/signals` · `/crypto` · `/trade` · `/portfolio`
- `/profile` (AI Settings → Alert Preferences → Connected Accounts → Broker)
- `/billing` · `/subscribe`
- `/portal` → **CROSS-APP REDIRECT** to trading-dashboard's customer terminal.
  The mobile PWA does NOT render its own desktop terminal. No
  `PortalDesktop.tsx`, no responsive switching, no mobile-shell
  impersonation of the desktop UI.

### trading-dashboard (operator console + customer desktop terminal)
- `/` Landing (signed-out) → role-based: admin → `/command`, customer → `/portal`
- `/portal` — **customer institutional desktop workstation**
  (Portal.tsx). Signed-in `Protected`, **NOT** `AdminOnly`.
- `/dashboard`, `/market`, `/ai`, `/risk`, `/sim`, `/backtest`,
  `/optimizer`, `/scanner`, `/portfolio`, `/correlation`, `/journal`,
  `/validation`, `/sentiment`, `/charts` — signed-in (admin or customer)
- **Operator/admin only** (`ProtectedAdmin` → bounce to `/portal` for
  non-admins): `/command`, `/exchange`, `/syscheck`, `/debug`,
  `/desktop`, `/institutional`, `/admin`
- `/settings`, `/sign-in/*`, `/sign-up/*`

### Cross-host routing matrix (locked)

| Host                                | Signed-out          | Customer                       | Admin                | Default       |
| ----------------------------------- | ------------------- | ------------------------------ | -------------------- | ------------- |
| `aicandlez.com` (landing)           | Marketing           | CTAs → `trade.`                | CTAs → `trade.`      | Marketing     |
| `app.aicandlez.com` (PWA)           | PWA root (gated)    | PWA mobile                     | PWA mobile           | PWA           |
| `trade.aicandlez.com` (customer)    | Landing → sign-in   | `/portal`                      | `/command`           | `/portal`     |
| `admintrade.aicandlez.com` (admin)  | Landing → sign-in   | cross-host → `trade./portal`   | `/command`           | `/command`    |
| `api.aicandlez.com`                 | (API only)          | (API only)                     | (API only)           | n/a           |

Required build env per host: `VITE_TRADE_URL`, `VITE_APP_URL`,
`VITE_TRADING_DASHBOARD_URL`, `VITE_DEFAULT_LANDING`,
`VITE_CUSTOMER_PORTAL_URL`, `CUSTOMER_APP_BASE_URL`. See `render.yaml`
for canonical values per service.

**Stripe return URL derivation** (`api-server lib/customerAppUrl.ts`):
Origin header (allow-listed) → `CUSTOMER_APP_BASE_URL` → legacy
`WEBHOOK_BASE_URL` → `REPLIT_DOMAINS`. Client-provided
`successUrl`/`cancelUrl`/`returnUrl` honored only when origin matches
resolved host (defense against spoofed Origin → open redirect).

**Role dispatch** (`SignedInHomeRouter`, `AdminOnly`): customer host
non-admins → `/portal`; admin host non-admins → `CrossAppRedirect`.

---

## Architectural separation — CUSTOMER vs ADMIN PORTAL (LOCKED INVARIANT)

Two different systems sharing the `trading-dashboard` codebase. Future
tasks MUST NOT merge them. Every `/portal` change must be role-gated and
preserve both worlds.

### CUSTOMER PORTAL — `trade.aicandlez.com/portal` (non-admin)
Purpose: paper-only onboarding + AI evaluation platform.
- **PAPER mode ONLY.** No LIVE affordances exposed to customers.
- Real-money execution operated by AICandlez through the admin terminal
  using server-side env Kraken keys. Customers do **not** route their
  own orders to broker networks from the portal.
- Server-side kill switch: `customer_live_execution_disabled` enforced
  in `placeLiveAutoOrderForUser`, `POST /api/user/live-order`, and the
  `tradingLoop` customer fan-out branch. Default off; flips only when
  `CUSTOMER_LIVE_EXECUTION_ENABLED=true`. Admin/super-admin bypass.
- Onboarding flows (`?checkout=success` trigger, `OnboardingFlow`).
- Upgrade funnels, tier gates, UpgradeBanner, FeatureGate — unlock
  paper capacity + AI features, NOT live execution.
- **No PAPER/LIVE toggle in Portal header** — static "PAPER MODE" banner.
- **No `LiveExecutionBar` / ARM LIVE** for non-admins.
- `user_exchange_connections` data + ConnectModal remain available for
  forward compatibility but are not load-bearing.
- `PaperTradesProvider` mounted, gated `!isAdmin`.

### ADMIN PORTAL — `admintrade.aicandlez.com/portal` (admin/super-admin)
Purpose: institutional operator terminal.
- **Real-only.** No paper, no simulation, no `PaperTradesProvider`.
- No onboarding friction, no upgrade prompts, no tier gates.
- Operator role bypasses every customer-tier guard.
- Default landing = `/command`; `/portal` here is the operator
  workstation variant (no consumer affordances).

### Rules for future task agents
1. Anything that removes paper/simulation/onboarding/upgrade funnels
   MUST be scoped by role/domain — never wholesale.
2. Anything that adds onboarding/upgrade prompts/tier gates/paper
   affordances MUST be hidden when `useUserRole()` is `admin`/`super-admin`.
3. Customer-side `/portal` changes must verify admin path untouched
   (and vice versa).
4. Telemetry + trade history must tag rows with mode (`PAPER`/`LIVE`)
   so the two worlds never co-mingle.

---

## Production hosting (3-domain split)

- `app.aicandlez.com/*` — PWA only (aicandlez-app static build).
  No desktop components, no `/portal` page (cross-app redirect to trade host).
- `trade.aicandlez.com/*` — customer portal. trading-dashboard static
  build. Default landing = `/portal`.
- `admintrade.aicandlez.com/*` — admin/operator portal. trading-dashboard
  static build, separate Render service. Default landing = `/command`.
  NO paper trading, NO tier gates, NO upgrade gates, unlimited execution,
  live Kraken only.
- `dashboard.aicandlez.com/*` — preserved during migration; retired once
  trade./admintrade. cutover verified.

Render config: services `aicandlez-trade`, `aicandlez-admintrade`,
`aicandlez-dashboard` in `render.yaml`. CORS allow-list on api service.

**AdminTopTelemetryBar** (admin-only): always-on strip under
trading-dashboard top header for `admin`/`super-admin` (gated via
`useUserRole()` in `Layout.tsx`). 15 real-time metrics from
`GET /api/admin/top-telemetry`, polled every 5s, all values
DB-/engineStats-derived (no mocks).

---

## Authentication (Clerk, production)

- Clerk app: `app_3DeE2sfuhHWTY73M9jlbRCKabFx`
- `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` auto-provisioned
- `lib/db/src/schema/users.ts` — `users` table (clerkUserId, email,
  role: user/admin/super-admin)
- Server: `clerkProxyMiddleware` (prod only) → `clerkMiddleware` →
  `requireAuth` / `requireRole`
- `requireAuth` also calls `touchSession()` → writes/updates a row in
  `user_sessions` (single indexed SELECT, debounced 60s writes,
  fail-open). Revoked sessions reject with 401 `errorCode: "session_revoked"`.
- Frontend: `ClerkProvider` + `ClerkQueryClientCacheInvalidator` in App shells
- All routes redirect to `/sign-in` when unauthenticated
- Clerk UI: dark terminal theme (#050D1A card, neon-green primary,
  monospace, AICandlez logo)

---

## AI Trading Architecture

**Global trading loop** (shared signals across users):
- `lib/tradingLoop.ts` — EMA+RSI engine, MTF funnel (5m/15m/1H),
  volume + sideways + 1H-trend filters
- Default `minConfidence = 60`
- Filters: volume confirmation ON (≥85% of 20-bar avg), sideways block
  (<0.15% spread), 1H trend OFF by default

**User-scoped state** (per-userId isolation, no cross-tenant bleed):
- `lib/userSimRegistry.ts` — `Map<userId, UserSimState>` lazy DB-load,
  instant persistence
- All `/api/simulation/*` routes are `requireAuth`-gated → registry
- Tables: `user_settings`, `sim_accounts`, `sim_positions`, `sim_trades`,
  `user_notifications`
- Each user starts with $100,000 simulated balance

**Exchange connections** (per-user encrypted credentials):
- `user_exchange_connections` — AES-256-GCM, per-user PBKDF2 key derivation
- `CredentialVault` — raw keys never persisted plaintext
- Supported: Kraken, Binance, Coinbase, Bybit, OKX, KuCoin
- **Withdrawal permissions never requested, never tested, always `false`**
- Live mode default OFF; requires `acknowledged: true`
- Connection test = `getTicker` + `getAccount` round-trip before any DB write
- **Single source of truth = `EXCHANGE_CATALOG`** (no hardcoded lists per
  R1.5). Per-user visibility governance via `user_exchange_visibility`
  (presentational only — execution enforcement deferred).

**Exchange secrets (LIVE):** `KRAKEN_API_KEY`, `KRAKEN_API_SECRET`,
`EXCHANGE_LIVE_ENABLED=true`.

---

## Operator surfaces (admin-only)

- `/admin/users` — grid with telemetry (exchanges, AI usage, session
  status, revenue, etc.) backed by `GET /api/admin/users`.
- `/admin/activity`, `/admin/subscriptions`, `/admin/sessions` —
  dedicated pages composed on shared hooks.
- **User Intelligence Panel** (drawer from `/admin/users`): 5 tabs —
  PROFILE / EXCHANGES / TRADING / ENTITLEMENTS / ACTIONS. All
  mutations audit-logged to `user_admin_actions`.
- **Sessions:** `user_sessions` table; `/admin/sessions` lists active
  + revoked sessions. Revoke is best-effort Clerk revoke + atomic local
  revoke + audit row (super-admin cannot self-revoke).
- **Per-user exchange visibility:** `user_exchange_visibility` overrides
  catalog defaults per user. Admin endpoints
  `GET/POST/DELETE /api/admin/users/:id/exchange-visibility` —
  single-tx upsert (ON CONFLICT DO UPDATE) and `.returning()`-gated
  delete to prevent false-positive audits on concurrent races.

---

## UI System (locked, do not redesign)

**Brand:** neon-green. `#66FF66` brand · `#00C853` deep emerald ·
`#7CFF00` bright lime · `#39FF14` vivid neon. Backgrounds `#000` /
`#050A07` / `#0A1410` / `#0F1F18`.

**Tokens:**
- `artifacts/aicandlez-app/src/index.css` — HSL `--primary` = 120°,
  `--brand{-deep,-bright,-vivid,-glow,-bloom,-whisper}`, `--ink-0..3`,
  `--glass-1..3`, animation lib (brand-pulse, orb-breathe, ticker-scroll,
  dot-pulse, bar-in/breathe, scan-line, edge-sweep, chart-drift,
  wave-bar, particle-float, shimmer)
- `artifacts/natura-ai/constants/theme.ts` — green tokens (mobile, frozen)

**Locked surfaces — do not restructure:** Home (radar centerpiece + AI
Market Scanner + Top Gainers + Crypto Signals preview + Live Trades +
Trade History + portfolio hero, single-column mobile-first);
Signals/Crypto cards; Profile structure (AI Settings → Alert
Preferences → Connected Accounts → Broker); bottom nav; brand header;
typography hierarchy.

**Master assets:**
- `artifacts/aicandlez-app/src/assets/aicandlez-logo-master.png`
- `artifacts/aicandlez-app/src/assets/aicandlez-icon-master.png`

**AI Market Scanner** (Home radar): 10+ rotating intelligent states,
priority-ordered decision tree reading `breakdowns` (per-symbol AI
state) + `tickersData` (live moves). Edit logic in
`artifacts/aicandlez-app/src/pages/Home.tsx`.

**Notification/feedback layer:** `artifacts/aicandlez-app/src/lib/feedback.ts`
— `ALERT_DEFINITIONS` (10 alert types), `FeedbackPrefs` (localStorage,
master push/sounds/haptics + per-alert toggles), `useFeedbackPrefs` hook
(cross-tab sync), `triggerHaptic` (OFF by default), `playNotificationCue`
(routes through `executionSounds.ts`), `shouldNotify(key)` (central
gate for push-emit). Web Push backend: `public/sw.js`, `usePushNotifications`,
`SwRegistrar`, server-side `NotificationDispatcher` (VAPID). UI rendered
in `Profile.tsx → AlertPreferencesSection`.

---

## Trading Dashboard Modules

20 active: Dashboard · Market Data · Indicators · AI Reasoning · Risk
Management · Simulation · Backtesting · Strategy Optimizer · Asset
Scanner · Portfolio · Correlation · Trade Journal · Validation ·
Sentiment AI · Exchange · System Verification · Signal Debug ·
Multi-Asset Chart · Command Center · Desktop Terminal (`/desktop`).

Global components (App-level): `AlertsProvider` (8s poll, dedupe, sound
toggle), `SettingsDrawer` (floating gear, mobile drawer / desktop popover).

**api-server routes:** `/api/exchange/*`, `/api/sentiment/*`,
`/api/validation/*`, `/api/journal/*`, `/api/simulation/*`,
`/api/signals/*`, `/api/candles/*`, `/api/backtest/*`, `/api/auth/*`,
`/api/billing/*`, `/api/user/*`, `/api/admin/*`.

---

## Cross-origin API transport (LOCKED INVARIANT)

Every `/api/*` call from any frontend artifact MUST route through the
shared `authFetch` primitive:
- `artifacts/trading-dashboard/src/lib/authFetch.ts`
- `artifacts/aicandlez-app/src/lib/authFetch.ts`

`authFetch` prefixes `VITE_API_BASE_URL` (so `admintrade.`/`trade.`/`app.`
cross-origin into `api.aicandlez.com` instead of hitting their own
static SPA fallback), attaches a Clerk `Bearer` token as a cookie
fallback (Safari ITP / SameSite=Lax), and throws a structured
`ApiContractError` when an OK response comes back without
`application/json` (catches the "static host returned `index.html`"
failure that silently emptied the admin CRM grid).

**Build-time guardrail:** `pnpm --filter @workspace/scripts run check-no-bare-api-fetch`
fails CI on any bare `fetch("/api/...")` outside the two `lib/authFetch.ts`
files and `useUserRole.ts` (which intentionally issues its pre-bootstrap
`/api/auth/me` call with a freshly-issued `getToken()`).

On `admintrade.`/`trade.`/`app.aicandlez.com` an admin-visible
`ApiBaseUrlBanner` renders at top of page if `VITE_API_BASE_URL` is
empty at build time.

---

## Controlled-beta operational mode

- **Platform-wide concurrent live-trade cap: 3** (customer side).
  Enforced in `placeLiveAutoOrderForUser` (gate 0c). Counts open
  `sim_positions` with `exchange IS NOT NULL` across all users; admin/
  super-admin bypass. Operator path (`exchangeEngine.placeLiveAutoOrder`,
  no userId) not gated here — `admintrade.` runs under separate controls.
- Rejected orders: `errorCode: "concurrent_live_cap_reached"`,
  user-visible notification, `executionStreamBus` `order_rejected` event,
  `logs` row tagged `[concurrent_live_cap_reached]`.
- Ratchet up via env `LIVE_EXECUTION_CONCURRENT_CAP` (no redeploy).
  `0` disables the gate. Default = `DEFAULT_LIVE_EXECUTION_CONCURRENT_CAP = 3`
  in `liveUserExecution.ts`.
- **Known TOCTOU race (acceptable at this scale):** gate reads
  `sim_positions` then places broker order without reservation, so N
  concurrent placements can each pass a stale count and overshoot by
  up to N−1. Bounded by user count (≤3 under manual oversight).
  Before widening cap or scaling onboarding, harden with DB-backed
  reservation primitive (advisory lock or `SELECT … FOR UPDATE` on a
  counter row). Inline note next to `countOpenLivePositions` in
  `liveUserExecution.ts`.

## On-call procedure (P0-01 mitigation — Option B)

`forceRestoreBilling` and `waiveAllPendingFees` are super-admin only
by design. To prevent on-call lockout:
- Maintain at least **two active super-admin Clerk users** at all times.
- Document rotation in internal ops runbook (out-of-band).
- 72-hour restore grace window in `evaluateAndEnforceBillingHold` so a
  force-restore stays durable even if the next fee tick re-evaluates a
  still-unpaid balance. Window resets on every admin action; auto-
  enforcement resumes after expiry.

---

## Production Deployment & Export

- `DEPLOYMENT.md` — domain map, DNS, SSL, Clerk prod, push setup,
  Render + Replit deploy, migrations, pre/post-deploy checklist.
- `render.yaml` — 4 services (aicandlez-api, aicandlez-dashboard,
  aicandlez-app, aicandlez-landing) with VAPID + exchange keys +
  security headers.
- `.env.production.example` — all env vars for all four services.
- CORS locked to `aicandlez.com`, `app.aicandlez.com`, `api.aicandlez.com`,
  `trade.`, `admintrade.`.
- Webhooks: Stripe (`STRIPE_WEBHOOK_SECRET`), Clerk.
- **Production export ZIP:** `python3 scripts/build-export-zip.py`
  → `artifacts/trading-dashboard/public/aicandlez-production.zip`
  (served at `/aicandlez-production.zip` via dashboard sidebar).
  Excludes `node_modules/`, `dist/`, `.git/`, `natura-*`,
  `mockup-sandbox`, `attached_assets/`, `.local/`, `.replit-artifact/`.

---

## Key Commands

- `pnpm run typecheck` — full (libs build → leaf typecheck)
- `pnpm run typecheck:libs` — composite lib build only
- `pnpm --filter @workspace/<slug> run typecheck` — single package
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client + Zod
- `pnpm --filter @workspace/db run push` — drizzle-kit push
- `python3 scripts/build-export-zip.py` — production ZIP

**Do not** run `pnpm dev` at workspace root — use `restart_workflow <slug>`.

---

## Environment Variables (canonical)

**Auto-provisioned:** `DATABASE_URL`, `CLERK_SECRET_KEY`,
`VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `VAULT_MASTER_KEY`,
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VITE_VAPID_PUBLIC_KEY` /
`VAPID_SUBJECT`.

**Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_STARTER_MONTHLY`,
`STRIPE_PRICE_PRO_MONTHLY`.

**Exchanges (LIVE):** `KRAKEN_API_KEY/SECRET`, `BINANCE_API_KEY/SECRET`,
`COINBASE_API_KEY/SECRET`, `CRYPTOCOM_API_KEY/SECRET`,
`EXCHANGE_LIVE_ENABLED=true`.

**Cross-host build env:** `VITE_API_BASE_URL`, `VITE_TRADE_URL`,
`VITE_APP_URL`, `VITE_TRADING_DASHBOARD_URL`, `VITE_DEFAULT_LANDING`,
`VITE_CUSTOMER_PORTAL_URL`, `CUSTOMER_APP_BASE_URL`.

**Operational toggles:** `CUSTOMER_LIVE_EXECUTION_ENABLED`,
`LIVE_EXECUTION_CONCURRENT_CAP`.

**Production-only:** `CLERK_SECRET_KEY_LIVE`,
`VITE_CLERK_PUBLISHABLE_KEY_LIVE`.

---

## natura-ai (production-frozen)

Mobile AI wellness app (Expo/React Native). AsyncStorage only — no
backend. Onboarding → AI Chat → Wellness Plans → Recipes → Daily
Routine → Grocery → Saved → Check-In → Profile. Light theme, warm
cream `#F8F6F0`, forest green `#3D7A45`, Inter, radius 16.
**No further dev work** while the desktop/web institutional platform
is in active development.

---

## User Preferences

- Always brand work as **AICandlez** (never apex / apexdigital legacy)
- Performance-fee language always reads "on profitable trades only ·
  never on losses"
- Institutional tone — premium, restrained, no arcade/gambling cues
- Mobile-first PWA = primary user surface; desktop console = operator
- Withdrawal permissions are never requested from exchanges (security promise)
