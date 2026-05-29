# AICandlez — Workspace

Institutional AI crypto trading SaaS. pnpm monorepo, TypeScript.

> Active architecture only. Phase / pass narration lives in git history.

---

## Stack

- pnpm workspaces, Node 24, TypeScript 5.9
- API: Express 5 + Drizzle ORM (PostgreSQL) + Zod (`zod/v4`, `drizzle-zod`)
- API codegen: Orval from OpenAPI in `lib/api-spec`
- Auth: Replit-managed Clerk (httpOnly cookie web, Bearer mobile)
- Billing: Stripe (3-tier ladder)
- Build: esbuild (CJS server bundle), Vite (PWA + dashboard + landing)

See `pnpm-workspace` skill for workspace structure and TS project refs.

---

## Artifacts

| Artifact            | Kind   | Path             | Role                                         |
| ------------------- | ------ | ---------------- | -------------------------------------------- |
| `landing`           | web    | `/`              | Public marketing (signed-out)                |
| `aicandlez-app`     | web    | `/aicandlez-app` | **Primary PWA** — mobile-first customer      |
| `trading-dashboard` | web    | `/dashboard`     | Operator console + customer desktop portal   |
| `api-server`        | api    | `/api`           | Shared Express backend                       |
| `natura-ai`         | mobile | `/natura-ai`     | Expo wellness app — **frozen**               |
| `natura-web`        | web    | `/natura-web`    | Legacy companion — frozen                    |
| `mockup-sandbox`    | design | `/sandbox`       | Canvas iframe variant previews               |

Forward work = `aicandlez-app` PWA + `trading-dashboard`. `natura-*` frozen.

---

## Billing (3-tier ladder — locked)

**No `$5.99` anywhere in the codebase.**

| Plan ID   | Name            | Price    | Daily | Concurrent |
| --------- | --------------- | -------- | ----- | ---------- |
| `free`    | Paper Trading   | Free     | 10    | 0 (paper)  |
| `starter` | AI Trading      | $49.95   | 50    | **3**      |
| `pro`     | AI Trading Pro  | $99.95   | 100   | **6**      |
| `elite`   | AI Trading Elite VIP | $199.95 | 200 | **12**    |

- Free = paper only; paid tiers = live only. Admin/super-admin = unlimited.
- Runtime is subscription-driven: no sub → paper; active paid sub → live;
  canceled/expired → live disabled, paper re-enabled.
- Stripe price IDs via env `STRIPE_PRICE_{STARTER,PRO,ELITE}_MONTHLY`;
  legacy starter/pro grandfathered via `STRIPE_PRICE_{STARTER,PRO}_LEGACY`
  (comma-separated) in `planFromPriceId`.
- Performance fee on **profitable closed trades only · never on losses**
  (`PERFORMANCE_FEE_LABEL` from `lib/fees`)
- Monthly · cancel anytime · Stripe customer portal for downgrades
- SoT: `SubscriptionContext.tsx` (`plan` = `free`/`starter`/`pro`/`elite`)
- API: `POST /billing/checkout`, `POST /billing/portal`, `GET /billing/subscription`

---

## Routing — locked invariants

### aicandlez-app PWA (mobile)
`/` Home · `/signals` · `/crypto` · `/trade` · `/portfolio` · `/profile`
(AI Settings → Alert Prefs → Connected Accounts → Broker) · `/billing` ·
`/subscribe`. `/portal` → **cross-app redirect** to trading-dashboard.
PWA does NOT render its own desktop terminal.

### trading-dashboard
- Signed-out `/` → landing; role-routes admin → `/command`, customer → `/portal`
- `Protected` (any signed-in): `/portal`, `/dashboard`, `/market`, `/ai`,
  `/risk`, `/sim`, `/backtest`, `/optimizer`, `/scanner`, `/portfolio`,
  `/correlation`, `/journal`, `/validation`, `/sentiment`, `/charts`
- `ProtectedAdmin` (bounce non-admins → `/portal`): `/command`, `/exchange`,
  `/syscheck`, `/debug`, `/desktop`, `/institutional`, `/admin`
- `/settings`, `/sign-in/*`, `/sign-up/*`

### Cross-host matrix

| Host                                | Customer default | Admin default |
| ----------------------------------- | ---------------- | ------------- |
| `aicandlez.com` (landing)           | CTAs → `trade.`  | CTAs → `trade.` |
| `app.aicandlez.com` (PWA)           | PWA mobile       | PWA mobile    |
| `trade.aicandlez.com` (customer)    | `/portal`        | `/command`    |
| `admintrade.aicandlez.com` (admin)  | x-host → `trade./portal` | `/command` |
| `api.aicandlez.com`                 | API only         | API only      |

Required build env: `VITE_TRADE_URL`, `VITE_APP_URL`,
`VITE_TRADING_DASHBOARD_URL`, `VITE_DEFAULT_LANDING`,
`VITE_CUSTOMER_PORTAL_URL`, `CUSTOMER_APP_BASE_URL`. Canonical in `render.yaml`.

Stripe return URL resolution (`api-server lib/customerAppUrl.ts`): Origin
header (allow-listed) → `CUSTOMER_APP_BASE_URL` → `WEBHOOK_BASE_URL` →
`REPLIT_DOMAINS`. Client URLs honored only when origin matches resolved
host (anti-spoof / anti-open-redirect).

Role dispatch (`SignedInHomeRouter`, `AdminOnly`): customer host non-admin
→ `/portal`; admin host non-admin → `CrossAppRedirect`.

---

## CUSTOMER vs ADMIN portal separation (LOCKED INVARIANT)

Two systems sharing `trading-dashboard`. Every `/portal` change must be
role-gated; never merge the two worlds.

### CUSTOMER (`trade./portal`, non-admin)
- **Runtime mode = paper by default; customers may opt into a connected
  exchange runtime.** Source of truth = `CustomerTradingRuntimeContext`
  (spec: `.local/docs/customer-runtime-context-spec.md`) hydrated from
  `GET /api/user/runtime-state`. Modes: `"paper"` (simulated hero +
  paper trades feed) or `"live"` (live equity + live BUY routing,
  subject to ARM).
- Auto-promotion rule: when `user_settings.activeRuntimeExchange IS
  NULL` AND the user has exactly ONE healthy active connection
  (status="active", balance poll ok=true), aggregator resolves
  `mode="live"`, `activeExchange=<that one>`. Two healthy connections
  → stay paper until user picks (Task #199 switcher UI). Any non-OK
  state → stay paper. Explicit `"paper"` override is sticky — even
  with one healthy connection, customer stays paper until they pick
  an exchange.
- Server-side kill switch `customer_live_execution_disabled` is
  **unchanged** — enforced in `placeLiveAutoOrderForUser`,
  `POST /api/user/live-order`, and `tradingLoop` customer fan-out.
  Default off; flips only when `CUSTOMER_LIVE_EXECUTION_ENABLED=true`.
  Admin/super-admin bypass. The runtime mode flipping to `"live"`
  gives the UI permission to render live affordances; it does NOT
  bypass this env flag, which still gates real money independently.
- ARM gate (Task #200, errorCode `runtime_not_armed`) sits between
  `liveReady=true` and execution. Three independent checks must all
  pass for a live order to ship: (1) env kill switch off, (2)
  `liveReady=true` from aggregator, (3) explicit per-session ARM.
- Onboarding + upgrade funnels + tier gates unlock **paper capacity, AI
  features, AND eligibility to connect a live exchange** (still gated
  by the three checks above for actual execution).
- `user_exchange_connections` + ConnectModal are load-bearing under
  this policy. Per-connection telemetry
  (`lastBalanceFetchAt`/`lastBalanceFetchError`) is surfaced through
  the aggregator so the portal can render "balances last synced 12s
  ago" / sync-failed banners.
- `PaperTradesProvider` remains mounted, gated `!isAdmin`, used
  whenever `mode === "paper"`.
- Customer telemetry + trade history MUST tag rows with mode
  (`PAPER`/`LIVE`) — unchanged.

### ADMIN (`admintrade./portal`, admin/super-admin)
- **Real-only.** No paper, no `PaperTradesProvider`, no simulation.
- No onboarding, no upgrade prompts, no tier gates.
- Default landing = `/command`; `/portal` here = operator workstation.

### Rules for future changes
1. Removing paper/onboarding/upgrade funnels MUST be role-scoped.
2. Adding onboarding/upgrade/tier/paper affordances MUST hide when
   `useUserRole()` is `admin`/`super-admin`.
3. Customer-side `/portal` changes must verify admin path untouched, and
   vice versa.
4. Telemetry + trade history MUST tag rows with mode (`PAPER`/`LIVE`).

---

## Active customer portal architecture (`trading-dashboard`)

- `pages/Portal.tsx` — thin role router. Customer → `<PortalCustomerShell />`;
  admin → `<AdminPortalShell />` (or `<AdminPortalLegacy />` rollback hatch
  via `VITE_ADMIN_PORTAL_LEGACY=true`). `AdminPortalLegacy` is byte-frozen.
- `components/portal/PortalCustomerShell.tsx` — single primary file. Owns
  shared `nowShell` 1Hz tick, lifted `/api/engine/status` query
  (`["engine-status-portal"]`), `MarketPulse` view-model, `signalsPerMin`
  (ref-anchored, 15s warmup).
- **Dual crypto matrix (current)**: customer `/portal` and admin `/command`
  both render the proven two-column scroll formula from
  `components/command/institutional/SignalsRow.tsx`:
  - LEFT = `CryptoMajorsSignalsPanel` (CRYPTO_MAJORS_30: BTC ETH SOL XRP
    ADA AVAX DOGE LINK DOT MATIC LTC BCH UNI ATOM NEAR APT ARB OP INJ SUI
    TON TRX ETC ICP FIL HBAR AAVE MKR XLM ALGO)
  - RIGHT = `CryptoAltsMemesPanel` (SAND MANA AXS GRT SNX CRV
    COMP LDO RNDR FET PEPE WIF BONK JUP PYTH TIA SEI STX) — XMR/HYPE/FTM/
    RUNE/KAS removed 2026-05-29 (symbol-universe reconciliation): not in the
    engine-analyzed universe (COINBASE_SYMBOLS), so structurally untradeable.
    Authoritative backstop = customer-execution gate 0UNI in
    `api-server lib/liveUserExecution.ts` (`symbol_not_in_universe`).
  - Customer chrome = `<LiveControlBar state="PAPER">` (readonly, no
    onToggle). Admin chrome = `<LiveControlBar state={cryptoState}
    onToggle={toggleCryptoLive}>` (ARM LIVE-capable).
  - No equities on either surface.
- Animation policy: every motion must answer "what intelligence state is
  this communicating?". Gated on `isReady`/`isFreshSignal`(<30s)/
  `isLiveTick`(<10s). Idle systems stay still.
- Polish tokens: `T.TRACK_LABEL=0.10em`, `T.TRACK_TITLE=0.18em`,
  `T.TRACK_DISPLAY=-0.04em`, `T.TX_FAST=120ms`, `T.TX_MED=200ms`.
  `.cd-scroll` = institutional thin neon scrollbar.

---

## Production hosting (3-domain split)

- `app.aicandlez.com/*` — PWA only (aicandlez-app static).
- `trade.aicandlez.com/*` — customer portal (trading-dashboard static).
  Default landing = `/portal`.
- `admintrade.aicandlez.com/*` — admin portal (trading-dashboard static,
  separate Render service). Default landing = `/command`. NO paper, NO
  tier gates, unlimited execution, live Kraken only.
- `dashboard.aicandlez.com/*` — preserved during migration; retired post
  trade./admintrade. cutover.

Render services: `aicandlez-trade`, `aicandlez-admintrade`,
`aicandlez-dashboard` in `render.yaml`. CORS allow-list on api.

`AdminTopTelemetryBar` (admin-only, gated via `useUserRole()` in
`Layout.tsx`): 15 metrics from `GET /api/admin/top-telemetry`, 5s poll.

---

## Authentication (Clerk)

- Replit-managed; `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY`
  auto-provisioned. Prod swaps to `*_LIVE` variants.
- `lib/db/src/schema/users.ts` — `users` (clerkUserId, email,
  role: `user`/`admin`/`super-admin`).
- Server: `clerkProxyMiddleware` (prod) → `clerkMiddleware` →
  `requireAuth` / `requireRole`. `requireAuth` calls `touchSession()` →
  `user_sessions` (indexed SELECT, debounced 60s writes, fail-open).
  Revoked sessions reject 401 with `errorCode: "session_revoked"`.
- Frontend: `ClerkProvider` + `ClerkQueryClientCacheInvalidator`. All
  routes redirect to `/sign-in` when unauthenticated. Dark terminal theme.

---

## AI Trading Architecture

**Global trading loop** (`lib/tradingLoop.ts`): EMA+RSI engine, MTF funnel
(5m/15m/1H), volume + sideways + 1H-trend filters. Default
`minConfidence=60`. Volume ≥65% of 20-bar avg (controlled live test
2026-05-29, lowered from 85%; SoT `VOLUME_GATE_FRACTION` in tradingLoop.ts),
sideways block <0.15%
spread, 1H trend OFF by default.

**Per-user state** (`lib/userSimRegistry.ts`): `Map<userId, UserSimState>`,
lazy DB-load, instant persistence. All `/api/simulation/*` `requireAuth`-
gated. Tables: `user_settings`, `sim_accounts`, `sim_positions`,
`sim_trades`, `user_notifications`. Starting paper balance = $100,000.

**Exchange connections** (`user_exchange_connections`): AES-256-GCM,
per-user PBKDF2 via `CredentialVault`. Raw keys never plaintext.
Supported: Kraken, Binance, Coinbase, Bybit, OKX, KuCoin. **Withdrawal
permissions never requested, never tested, always `false`** (security
promise). Live default OFF, requires `acknowledged: true`. Connection
test = `getTicker` + `getAccount` round-trip before DB write. SoT =
`EXCHANGE_CATALOG`. Per-user visibility via `user_exchange_visibility`
(presentational only).

**Operator multi-exchange routing:** `_selectedExchange` in
`exchangeEngine.ts` is SoT for `executeOrder()` / `placeLiveAutoOrder()`.
Boot priority: Kraken → Coinbase → CryptoDotCom → Binance → Gemini →
Alpaca (first with env keys wins). Admin switches via `CommandBar`
(`POST /api/exchange/select` → `setSelectedExchange()`); clears balances
cache. Per-order routing not exposed.

**BUY routing matrix** (`SignalRow.fireTrade`):
- Customer LIVE → `/api/user/live-order` (requires `isCustomerPortal &&
  mode==="LIVE" && canUseLive && hasExchange`)
- Admin operator (`isOperatorRole` only) → `/api/exchange/order/execute`
  (Kraken env path, server `requireOperator`-gated)
- Else → `firePaper(...)` (paper sim)

---

## Cross-origin API transport (LOCKED INVARIANT)

Every `/api/*` call from any frontend artifact MUST route through:
- `artifacts/trading-dashboard/src/lib/authFetch.ts`
- `artifacts/aicandlez-app/src/lib/authFetch.ts`

`authFetch` prefixes `VITE_API_BASE_URL` (so `admintrade./trade./app.`
cross-origin into `api.aicandlez.com` instead of hitting their own SPA
fallback), attaches Clerk Bearer as cookie fallback (Safari ITP /
SameSite=Lax), and throws `ApiContractError` when an OK response returns
non-JSON (catches "static host returned `index.html`" silent emptying).

**Build-time guardrail:** `pnpm --filter @workspace/scripts run
check-no-bare-api-fetch` — fails on any bare `fetch("/api/...")` outside
the two `authFetch.ts` files and `useUserRole.ts` (intentional
pre-bootstrap `/api/auth/me` with freshly-issued `getToken()`).

`ApiBaseUrlBanner` renders if `VITE_API_BASE_URL` empty at build time.

---

## UI System (locked, do not redesign)

**Brand:** neon-green. `#66FF66` brand · `#00C853` emerald · `#7CFF00`
lime · `#39FF14` vivid. BG `#000`/`#050A07`/`#0A1410`/`#0F1F18`.

**Tokens:** `artifacts/aicandlez-app/src/index.css` (HSL `--primary`=120°,
`--brand{-deep,-bright,-vivid,-glow,-bloom,-whisper}`, `--ink-0..3`,
`--glass-1..3`, animation lib).

**Locked surfaces — do not restructure:** Home (radar + AI Market Scanner +
Top Gainers + Crypto Signals + Live Trades + Trade History + portfolio
hero, single-column mobile-first); Signals/Crypto cards; Profile
structure; bottom nav; brand header.

**Master assets:**
- `artifacts/aicandlez-app/src/assets/aicandlez-logo-master.png`
- `artifacts/aicandlez-app/src/assets/aicandlez-icon-master.png`

**AI Market Scanner** (Home radar): 10+ rotating intelligent states,
priority-ordered decision tree reading `breakdowns` + `tickersData`.
Logic in `artifacts/aicandlez-app/src/pages/Home.tsx`.

**Notification/feedback** (`artifacts/aicandlez-app/src/lib/feedback.ts`):
`ALERT_DEFINITIONS`, `FeedbackPrefs` (localStorage, master + per-alert),
`useFeedbackPrefs` (cross-tab sync), `triggerHaptic` (off default),
`shouldNotify(key)`. Web Push: `public/sw.js`, `usePushNotifications`,
`SwRegistrar`, `NotificationDispatcher` (VAPID). UI in
`Profile.tsx → AlertPreferencesSection`.

---

## Operator surfaces (admin-only)

- `/admin/users` — grid + telemetry from `GET /api/admin/users`.
- `/admin/activity`, `/admin/subscriptions`, `/admin/sessions` — pages on
  shared hooks.
- **User Intelligence Panel** (drawer, 5 tabs: PROFILE / EXCHANGES /
  TRADING / ENTITLEMENTS / ACTIONS). All mutations audit-logged to
  `user_admin_actions`.
- **Sessions** (`user_sessions`): Revoke = best-effort Clerk revoke +
  atomic local revoke + audit row (super-admin cannot self-revoke).
- **Per-user exchange visibility:** `GET/POST/DELETE
  /api/admin/users/:id/exchange-visibility` — single-tx upsert,
  `.returning()`-gated delete (race-safe).

**api-server route surface:** `/api/exchange/*`, `/api/sentiment/*`,
`/api/validation/*`, `/api/journal/*`, `/api/simulation/*`,
`/api/signals/*`, `/api/candles/*`, `/api/backtest/*`, `/api/auth/*`,
`/api/billing/*`, `/api/user/*`, `/api/admin/*`, `/api/engine/*`.

---

## Controlled-beta operational mode

- **Platform-wide concurrent live-trade cap = 25** (customer side).
  Enforced in `placeLiveAutoOrderForUser` gate 0c by counting open
  `sim_positions WHERE exchange IS NOT NULL` across all users.
  Admin/super-admin bypass; operator path (no userId) not gated here.
  Raised from the original controlled-beta value of 3 → 25 (Task 2 / Q2)
  so per-tier concurrency (elite up to 12) is actually reachable platform
  -wide; per-user ceilings are still enforced by `liquidityGuard`
  (`PLAN_MAX_OPEN_POSITIONS` free0/starter3/pro6/elite12).
- Rejected: `errorCode: "concurrent_live_cap_reached"` + user
  notification + `executionStreamBus order_rejected` + `logs` row.
- Tune via env `LIVE_EXECUTION_CONCURRENT_CAP` (no redeploy). `0`
  disables. Default `DEFAULT_LIVE_EXECUTION_CONCURRENT_CAP=25` in
  `liveUserExecution.ts`.
- **Known TOCTOU race** (acceptable at scale): gate reads positions then
  places broker order without reservation; N concurrent placements can
  overshoot by N−1. Before widening cap, harden with advisory lock or
  `SELECT … FOR UPDATE` (see inline note next to `countOpenLivePositions`).

## On-call (P0-01 mitigation)

`forceRestoreBilling` and `waiveAllPendingFees` are super-admin only.
- Maintain **two active super-admin Clerk users** at all times.
- 72-hour restore grace window in `evaluateAndEnforceBillingHold` —
  force-restore stays durable across re-evaluations. Window resets on
  every admin action.

---

## Production Deployment

See `DEPLOYMENT.md` (domains, DNS, SSL, Clerk prod, push, Render +
Replit deploy, migrations, checklist), `render.yaml` (services + headers),
`.env.production.example`.

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
- `pnpm --filter @workspace/api-spec run codegen` — regenerate client + Zod
- `pnpm --filter @workspace/db run push` — drizzle-kit push
- `pnpm --filter @workspace/scripts run check-no-bare-api-fetch` — authFetch guard
- `python3 scripts/build-export-zip.py` — production ZIP

**Never** run `pnpm dev` at workspace root — use `restart_workflow <slug>`.

---

## Environment Variables

- **Auto-provisioned:** `DATABASE_URL`, `CLERK_SECRET_KEY`,
  `VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `VAULT_MASTER_KEY`,
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VITE_VAPID_PUBLIC_KEY`/`VAPID_SUBJECT`.
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_STARTER_MONTHLY`,
  `STRIPE_PRICE_PRO_MONTHLY`.
- **Exchanges (live):** `KRAKEN_API_KEY/SECRET`, `BINANCE_API_KEY/SECRET`,
  `COINBASE_API_KEY/SECRET`, `CRYPTOCOM_API_KEY/SECRET`,
  `EXCHANGE_LIVE_ENABLED=true`.
- **Cross-host build env:** `VITE_API_BASE_URL`, `VITE_TRADE_URL`,
  `VITE_APP_URL`, `VITE_TRADING_DASHBOARD_URL`, `VITE_DEFAULT_LANDING`,
  `VITE_CUSTOMER_PORTAL_URL`, `CUSTOMER_APP_BASE_URL`.
- **Operational toggles:** `CUSTOMER_LIVE_EXECUTION_ENABLED`,
  `LIVE_EXECUTION_CONCURRENT_CAP`.
- **Production-only:** `CLERK_SECRET_KEY_LIVE`,
  `VITE_CLERK_PUBLISHABLE_KEY_LIVE`.

---

## User Preferences

- Always brand as **AICandlez** (never apex / apexdigital legacy)
- Performance-fee language always reads "on profitable trades only ·
  never on losses"
- Institutional tone — premium, restrained, no arcade/gambling cues
- Mobile-first PWA = primary user surface; desktop console = operator
- Withdrawal permissions are never requested from exchanges
