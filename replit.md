# AICandlez — Workspace

Institutional AI crypto trading SaaS. pnpm monorepo, TypeScript.

> Active architecture only. Historical phase / per-task narration lives
> in git history.

---

## Stack

- pnpm workspaces, Node 24, TypeScript 5.9
- API: Express 5 + Drizzle ORM (PostgreSQL) + Zod (`zod/v4`, `drizzle-zod`)
- API codegen: Orval from OpenAPI in `lib/api-spec`
- Auth: Replit-managed Clerk (httpOnly cookie web, Bearer mobile)
- Billing: Stripe (3-tier ladder)
- Build: esbuild (CJS server bundle), Vite (PWA + dashboard + landing)

See `pnpm-workspace` skill for workspace structure and TS project references.

---

## Artifacts (production-active)

| Artifact            | Kind   | Path             | Role                                          |
| ------------------- | ------ | ---------------- | --------------------------------------------- |
| `landing`           | web    | `/`              | Public marketing (signed-out)                 |
| `aicandlez-app`     | web    | `/aicandlez-app` | **Primary PWA** — mobile-first customer       |
| `trading-dashboard` | web    | `/dashboard`     | Operator console + customer desktop portal    |
| `api-server`        | api    | `/api`           | Shared Express backend                        |
| `natura-ai`         | mobile | `/natura-ai`     | Expo wellness app — **production-frozen**     |
| `natura-web`        | web    | `/natura-web`    | Legacy companion site                         |
| `mockup-sandbox`    | design | `/sandbox`       | Canvas iframe variant previews                |

Forward work = `aicandlez-app` PWA + `trading-dashboard` desktop platform.
`natura-*` is frozen.

---

## Billing (3-tier ladder)

**No `$5.99` references anywhere in the codebase.**

| Plan ID   | Name           | Price   | Capacity                | Notes                                    |
| --------- | -------------- | ------- | ----------------------- | ---------------------------------------- |
| `free`    | Paper Trading  | Free    | Simulated only          | 7-Day AI Paper, signals, no live         |
| `starter` | AI Trading     | $39.99  | Up to **3** AI trades   | Live AI exec (Kraken), Auto Trade        |
| `pro`     | AI Trading Pro | $79.99  | Up to **12** AI trades  | Majors+alts+emerging, priority exec      |

- Performance fee **on profitable closed trades only**
  (label = `PERFORMANCE_FEE_LABEL` from `lib/fees`)
- Monthly · cancel anytime · Stripe customer portal for downgrades
- Source of truth: `SubscriptionContext.tsx` (`plan` = `free`/`starter`/`pro`)
- API: `POST /billing/checkout`, `POST /billing/portal`, `GET /billing/subscription`

---

## Routing — locked invariants

### aicandlez-app PWA (mobile customer surface)
- `/` Home · `/signals` · `/crypto` · `/trade` · `/portfolio`
- `/profile` (AI Settings → Alert Preferences → Connected Accounts → Broker)
- `/billing` · `/subscribe`
- `/portal` → **CROSS-APP REDIRECT** to trading-dashboard customer terminal.
  PWA does NOT render its own desktop terminal.

### trading-dashboard (operator console + customer desktop terminal)
- `/` Landing (signed-out) → role-based: admin → `/command`, customer → `/portal`
- `/portal` — **customer institutional desktop workstation** (signed-in
  `Protected`, **NOT** `AdminOnly`)
- Signed-in (admin or customer): `/dashboard`, `/market`, `/ai`, `/risk`,
  `/sim`, `/backtest`, `/optimizer`, `/scanner`, `/portfolio`,
  `/correlation`, `/journal`, `/validation`, `/sentiment`, `/charts`
- Admin-only (`ProtectedAdmin` → bounce non-admins to `/portal`):
  `/command`, `/exchange`, `/syscheck`, `/debug`, `/desktop`,
  `/institutional`, `/admin`
- `/settings`, `/sign-in/*`, `/sign-up/*`

### Cross-host matrix (locked)

| Host                                | Signed-out          | Customer                       | Admin                | Default       |
| ----------------------------------- | ------------------- | ------------------------------ | -------------------- | ------------- |
| `aicandlez.com` (landing)           | Marketing           | CTAs → `trade.`                | CTAs → `trade.`      | Marketing     |
| `app.aicandlez.com` (PWA)           | PWA root (gated)    | PWA mobile                     | PWA mobile           | PWA           |
| `trade.aicandlez.com` (customer)    | Landing → sign-in   | `/portal`                      | `/command`           | `/portal`     |
| `admintrade.aicandlez.com` (admin)  | Landing → sign-in   | cross-host → `trade./portal`   | `/command`           | `/command`    |
| `api.aicandlez.com`                 | (API only)          | (API only)                     | (API only)           | n/a           |

Required build env: `VITE_TRADE_URL`, `VITE_APP_URL`, `VITE_TRADING_DASHBOARD_URL`,
`VITE_DEFAULT_LANDING`, `VITE_CUSTOMER_PORTAL_URL`, `CUSTOMER_APP_BASE_URL`.
See `render.yaml` for canonical values.

**Stripe return URL** (`api-server lib/customerAppUrl.ts`): Origin header
(allow-listed) → `CUSTOMER_APP_BASE_URL` → `WEBHOOK_BASE_URL` →
`REPLIT_DOMAINS`. Client-provided URLs honored only when origin matches
resolved host (anti-spoof / anti-open-redirect).

**Role dispatch** (`SignedInHomeRouter`, `AdminOnly`): customer host
non-admins → `/portal`; admin host non-admins → `CrossAppRedirect`.

---

## CUSTOMER vs ADMIN portal separation (LOCKED INVARIANT)

Two systems sharing the `trading-dashboard` codebase. Every `/portal`
change must be role-gated; never merge the two worlds.

### CUSTOMER (`trade.aicandlez.com/portal`, non-admin)
- **PAPER mode ONLY.** No LIVE affordances exposed.
- Real-money execution is operated by AICandlez through the admin
  terminal using server-side env Kraken keys. Customers do not route
  their own orders to broker networks from `/portal`.
- Server-side kill switch `customer_live_execution_disabled` enforced
  in `placeLiveAutoOrderForUser`, `POST /api/user/live-order`, and the
  `tradingLoop` customer fan-out branch. Default off; flips only when
  `CUSTOMER_LIVE_EXECUTION_ENABLED=true`. Admin/super-admin bypass.
- Onboarding (`?checkout=success` trigger, `OnboardingFlow`), upgrade
  funnels, tier gates — unlock **paper capacity + AI features**, NOT
  live execution.
- **No PAPER/LIVE toggle, no `LiveExecutionBar`, no ARM LIVE** for
  non-admins. Static "PAPER MODE" banner only.
- `user_exchange_connections` + ConnectModal stay mounted for forward
  compatibility but are not load-bearing.
- `PaperTradesProvider` mounted, gated `!isAdmin`.

### ADMIN (`admintrade.aicandlez.com/portal`, admin/super-admin)
- **Real-only.** No paper, no `PaperTradesProvider`, no simulation.
- No onboarding, no upgrade prompts, no tier gates. Operator role
  bypasses every customer guard.
- Default landing = `/command`; `/portal` here = operator workstation.

### Rules for future changes
1. Removing paper/onboarding/upgrade funnels MUST be role-scoped, never wholesale.
2. Adding onboarding/upgrade/tier/paper affordances MUST be hidden when `useUserRole()` is `admin`/`super-admin`.
3. Customer-side `/portal` changes must verify admin path untouched, and vice versa.
4. Telemetry + trade history MUST tag rows with mode (`PAPER`/`LIVE`).

---

## Active customer portal architecture (`trading-dashboard`)

- `pages/Portal.tsx` — thin role router. Customer branch →
  `<PortalCustomerShell />`; admin branch → `<AdminPortalLegacy />`
  (byte-frozen — DO NOT EDIT during customer-portal iteration).
- `components/portal/PortalCustomerShell.tsx` — single primary file
  hosting the customer institutional workstation. Owns: shared
  `nowShell` 1Hz tick, lifted `/api/engine/status` query
  (`["engine-status-portal"]`), `MarketPulse` view-model
  (`computeMarketPulse`), `signalsPerMin` (ref-anchored, 15s warmup).
  All telemetry surfaces consume the same pulse for lock-step rhythm.
- `components/portal/` — extracted surfaces (OperatorPulseRibbon,
  PaperModeBanner, AssetIntelligenceSearchBar, OpportunityMatrix +
  Majors/AltsColumn + OpportunityCard, AIReasoningConsole,
  PortfolioIntelligence, SignalPipeline, ExchangeTopology, RiskHeatmap,
  MarketRegime, AIThroughput, ExecutionAwareness, EnableLiveAITradingBar).
- `hooks/usePaperSignals.ts` — crypto-only adapter to `SymBreakdown` +
  candles → `OpportunityVM`. Hardcoded MAJORS = BTC ETH SOL XRP ADA
  DOGE AVAX LINK POL ATOM; ALTS = remainder (Pass 6.2: NEAR APT ARB
  OP FIL added to engine pool; MATIC rebranded to POL on both
  Coinbase + Kraken).
- **Animation policy (focus #1):** every motion must answer "what
  intelligence state is this communicating?". Card animations gated on
  `isReady` / `isFreshSignal` (<30s) / `isLiveTick` (<10s). Footer
  Radio cadence tied to `tickTone`. `cmdbar-scan` gated on engine +
  headroom. Idle systems stay still.
- **Polish tokens (focus #2):** `T.TRACK_LABEL = 0.10em`,
  `T.TRACK_TITLE = 0.18em`, `T.TRACK_DISPLAY = -0.04em`, `T.TX_FAST =
  120ms ease`, `T.TX_MED = 200ms ease`. `.cd-scroll` = institutional
  thin neon scrollbar.

---

## Production hosting (3-domain split)

- `app.aicandlez.com/*` — PWA only (aicandlez-app static build).
- `trade.aicandlez.com/*` — customer portal (trading-dashboard static).
  Default landing = `/portal`.
- `admintrade.aicandlez.com/*` — admin portal (trading-dashboard static,
  separate Render service). Default landing = `/command`. NO paper, NO
  tier gates, unlimited execution, live Kraken only.
- `dashboard.aicandlez.com/*` — preserved during migration; retired
  once trade./admintrade. cutover verified.

Render services: `aicandlez-trade`, `aicandlez-admintrade`,
`aicandlez-dashboard` in `render.yaml`. CORS allow-list on api.

**AdminTopTelemetryBar** (admin-only, gated via `useUserRole()` in
`Layout.tsx`): 15 real-time metrics from `GET /api/admin/top-telemetry`,
5s poll, all DB-/engineStats-derived.

---

## Authentication (Clerk)

- Replit-managed Clerk; `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY`
  auto-provisioned. Prod swaps to `*_LIVE` variants.
- `lib/db/src/schema/users.ts` — `users` table (clerkUserId, email,
  role: `user`/`admin`/`super-admin`).
- Server: `clerkProxyMiddleware` (prod) → `clerkMiddleware` →
  `requireAuth` / `requireRole`. `requireAuth` also calls
  `touchSession()` → `user_sessions` row (indexed SELECT, debounced
  60s writes, fail-open). Revoked sessions reject 401 with
  `errorCode: "session_revoked"`.
- Frontend: `ClerkProvider` + `ClerkQueryClientCacheInvalidator` in
  App shells. All routes redirect to `/sign-in` when unauthenticated.
- Clerk UI: dark terminal theme.

---

## AI Trading Architecture

**Global trading loop** (`lib/tradingLoop.ts`): EMA+RSI engine, MTF
funnel (5m/15m/1H), volume + sideways + 1H-trend filters. Default
`minConfidence = 60`. Volume confirmation ON (≥85% of 20-bar avg),
sideways block (<0.15% spread), 1H trend OFF by default.

**Per-user state** (no cross-tenant bleed): `lib/userSimRegistry.ts`
— `Map<userId, UserSimState>`, lazy DB-load, instant persistence.
All `/api/simulation/*` are `requireAuth`-gated → registry. Tables:
`user_settings`, `sim_accounts`, `sim_positions`, `sim_trades`,
`user_notifications`. Starting paper balance = $100,000.

**Exchange connections** (`user_exchange_connections`): AES-256-GCM,
per-user PBKDF2 key derivation via `CredentialVault`. Raw keys never
persisted plaintext. Supported: Kraken, Binance, Coinbase, Bybit, OKX,
KuCoin. **Withdrawal permissions never requested, never tested, always
`false`.** Live mode default OFF, requires `acknowledged: true`.
Connection test = `getTicker` + `getAccount` round-trip before DB write.
Single source of truth = `EXCHANGE_CATALOG`. Per-user visibility via
`user_exchange_visibility` (presentational only).

**Live exchange secrets:** `KRAKEN_API_KEY`, `KRAKEN_API_SECRET`,
`EXCHANGE_LIVE_ENABLED=true`.

---

## Operator surfaces (admin-only)

- `/admin/users` — grid with telemetry (exchanges, AI usage, sessions,
  revenue) from `GET /api/admin/users`.
- `/admin/activity`, `/admin/subscriptions`, `/admin/sessions` —
  dedicated pages on shared hooks.
- **User Intelligence Panel** (drawer from `/admin/users`, 5 tabs:
  PROFILE / EXCHANGES / TRADING / ENTITLEMENTS / ACTIONS). All
  mutations audit-logged to `user_admin_actions`.
- **Sessions:** `user_sessions` table. Revoke = best-effort Clerk
  revoke + atomic local revoke + audit row (super-admin cannot
  self-revoke).
- **Per-user exchange visibility:** admin endpoints
  `GET/POST/DELETE /api/admin/users/:id/exchange-visibility` —
  single-tx upsert (ON CONFLICT DO UPDATE), `.returning()`-gated
  delete to prevent false-positive audits on concurrent races.

---

## Cross-origin API transport (LOCKED INVARIANT)

Every `/api/*` call from any frontend artifact MUST route through:
- `artifacts/trading-dashboard/src/lib/authFetch.ts`
- `artifacts/aicandlez-app/src/lib/authFetch.ts`

`authFetch` prefixes `VITE_API_BASE_URL` (so `admintrade.`/`trade.`/`app.`
cross-origin into `api.aicandlez.com` instead of hitting their own SPA
fallback), attaches Clerk Bearer as cookie fallback (Safari ITP /
SameSite=Lax), and throws `ApiContractError` when an OK response
returns non-JSON (catches "static host returned `index.html`" silent
data emptying).

**Build-time guardrail:**
`pnpm --filter @workspace/scripts run check-no-bare-api-fetch` —
fails on any bare `fetch("/api/...")` outside the two `lib/authFetch.ts`
files and `useUserRole.ts` (which intentionally issues its pre-bootstrap
`/api/auth/me` call with a freshly-issued `getToken()`).

`ApiBaseUrlBanner` renders at top of page on `admintrade./trade./app.`
if `VITE_API_BASE_URL` is empty at build time (admin-visible).

---

## UI System (locked, do not redesign)

**Brand:** neon-green. `#66FF66` brand · `#00C853` emerald ·
`#7CFF00` lime · `#39FF14` vivid. Backgrounds `#000` / `#050A07` /
`#0A1410` / `#0F1F18`.

**Tokens:**
- `artifacts/aicandlez-app/src/index.css` — HSL `--primary` = 120°,
  `--brand{-deep,-bright,-vivid,-glow,-bloom,-whisper}`, `--ink-0..3`,
  `--glass-1..3`, animation lib (brand-pulse, orb-breathe, scan-line,
  edge-sweep, etc.)
- `artifacts/natura-ai/constants/theme.ts` — green tokens (mobile, frozen)

**Locked surfaces — do not restructure:** Home (radar + AI Market
Scanner + Top Gainers + Crypto Signals + Live Trades + Trade History +
portfolio hero, single-column mobile-first); Signals/Crypto cards;
Profile structure (AI Settings → Alert Preferences → Connected
Accounts → Broker); bottom nav; brand header.

**Master assets:**
- `artifacts/aicandlez-app/src/assets/aicandlez-logo-master.png`
- `artifacts/aicandlez-app/src/assets/aicandlez-icon-master.png`

**AI Market Scanner** (Home radar): 10+ rotating intelligent states,
priority-ordered decision tree reading `breakdowns` + `tickersData`.
Logic in `artifacts/aicandlez-app/src/pages/Home.tsx`.

**Notification/feedback layer:**
`artifacts/aicandlez-app/src/lib/feedback.ts` — `ALERT_DEFINITIONS`,
`FeedbackPrefs` (localStorage, master push/sounds/haptics + per-alert),
`useFeedbackPrefs` (cross-tab sync), `triggerHaptic` (off by default),
`shouldNotify(key)` (central gate). Web Push backend: `public/sw.js`,
`usePushNotifications`, `SwRegistrar`, `NotificationDispatcher` (VAPID).
UI in `Profile.tsx → AlertPreferencesSection`.

---

## Trading Dashboard modules

20 active surfaces: Dashboard · Market Data · Indicators · AI Reasoning
· Risk Management · Simulation · Backtesting · Strategy Optimizer ·
Asset Scanner · Portfolio · Correlation · Trade Journal · Validation ·
Sentiment AI · Exchange · System Verification · Signal Debug ·
Multi-Asset Chart · Command Center · Desktop Terminal (`/desktop`).

App-level globals: `AlertsProvider` (8s poll, dedupe, sound toggle),
`SettingsDrawer` (floating gear → mobile drawer / desktop popover).

**api-server route surface:** `/api/exchange/*`, `/api/sentiment/*`,
`/api/validation/*`, `/api/journal/*`, `/api/simulation/*`,
`/api/signals/*`, `/api/candles/*`, `/api/backtest/*`, `/api/auth/*`,
`/api/billing/*`, `/api/user/*`, `/api/admin/*`, `/api/engine/*`.

---

## Controlled-beta operational mode

- **Concurrent live-trade cap = 3** (customer side). Enforced in
  `placeLiveAutoOrderForUser` (gate 0c) by counting open
  `sim_positions WHERE exchange IS NOT NULL` across all users.
  Admin/super-admin bypass; operator path (no userId) not gated here.
- Rejected order: `errorCode: "concurrent_live_cap_reached"`,
  user-visible notification, `executionStreamBus` `order_rejected`
  event, `logs` row tagged `[concurrent_live_cap_reached]`.
- Tune via env `LIVE_EXECUTION_CONCURRENT_CAP` (no redeploy). `0`
  disables. Default `DEFAULT_LIVE_EXECUTION_CONCURRENT_CAP = 3` in
  `liveUserExecution.ts`.
- **Known TOCTOU race (acceptable at scale):** gate reads positions
  then places broker order without reservation; N concurrent placements
  can overshoot by up to N−1. Before widening cap or scaling
  onboarding, harden with advisory lock or `SELECT … FOR UPDATE` on
  a counter row (see inline note next to `countOpenLivePositions`).

## On-call (P0-01 mitigation)

`forceRestoreBilling` and `waiveAllPendingFees` are super-admin only.
To prevent on-call lockout:
- Maintain **two active super-admin Clerk users** at all times.
- 72-hour restore grace window in `evaluateAndEnforceBillingHold` —
  force-restore stays durable even if the next fee tick re-evaluates
  an unpaid balance. Window resets on every admin action.

---

## Production Deployment & Export

- `DEPLOYMENT.md` — domain map, DNS, SSL, Clerk prod, push setup,
  Render + Replit deploy, migrations, checklist.
- `render.yaml` — services (api, dashboard, app, landing) with VAPID
  + exchange keys + security headers.
- `.env.production.example` — all env vars per service.
- CORS allow-list: `aicandlez.com`, `app.`, `api.`, `trade.`, `admintrade.`.
- Webhooks: Stripe (`STRIPE_WEBHOOK_SECRET`), Clerk.
- **Production export ZIP:** `python3 scripts/build-export-zip.py` →
  `artifacts/trading-dashboard/public/aicandlez-production.zip` (served
  via dashboard sidebar). Excludes `node_modules/`, `dist/`, `.git/`,
  `natura-*`, `mockup-sandbox`, `attached_assets/`, `.local/`,
  `.replit-artifact/`.

---

## Key Commands

- `pnpm run typecheck` — full (libs build → leaf typecheck)
- `pnpm run typecheck:libs` — composite lib build only
- `pnpm --filter @workspace/<slug> run typecheck` — single package
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client + Zod
- `pnpm --filter @workspace/db run push` — drizzle-kit push
- `pnpm --filter @workspace/scripts run check-no-bare-api-fetch` — authFetch guardrail
- `python3 scripts/build-export-zip.py` — production ZIP

**Never** run `pnpm dev` at workspace root — use `restart_workflow <slug>`.

---

## Environment Variables (canonical)

**Auto-provisioned:** `DATABASE_URL`, `CLERK_SECRET_KEY`,
`VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `VAULT_MASTER_KEY`,
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VITE_VAPID_PUBLIC_KEY` /
`VAPID_SUBJECT`.

**Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_STARTER_MONTHLY`,
`STRIPE_PRICE_PRO_MONTHLY`.

**Exchanges (live):** `KRAKEN_API_KEY/SECRET`, `BINANCE_API_KEY/SECRET`,
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

## natura-ai (frozen)

Mobile AI wellness app (Expo/React Native). AsyncStorage only.
Onboarding → AI Chat → Wellness Plans → Recipes → Daily Routine →
Grocery → Saved → Check-In → Profile. Light theme, warm cream
`#F8F6F0`, forest green `#3D7A45`, Inter, radius 16. **No further
dev work** while desktop institutional platform is in active development.

---

## User Preferences

- Always brand as **AICandlez** (never apex / apexdigital legacy)
- Performance-fee language always reads "on profitable trades only ·
  never on losses"
- Institutional tone — premium, restrained, no arcade/gambling cues
- Mobile-first PWA = primary user surface; desktop console = operator
- Withdrawal permissions are never requested from exchanges (security promise)
