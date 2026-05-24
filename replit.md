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
| `starter` | AI Trading        | $39.99  | Up to **3** AI trades       | Live AI exec (Alpaca), Auto Trade, analytics              |
| `pro`     | AI Trading Pro    | $79.99  | Up to **12** AI trades      | Crypto + Equities, priority exec, advanced AI scanners    |

- Performance fee on **profitable closed trades only** (label = `PERFORMANCE_FEE_LABEL` from `lib/fees`)
- Stripe billing: monthly · cancel anytime · customer portal for downgrades

**Routes:**
- `Subscribe.tsx` — full marketing 3-tier ladder (entry from upgrade banners)
- `Billing.tsx` — account billing & plan page with status banner, CURRENT / ACTIVE / PRO ACTIVE badges, upgrade CTAs, Manage Billing portal
- `SubscriptionContext.tsx` — single source of truth for `plan` (`free`/`starter`/`pro`)

**API:** `POST /billing/checkout`, `POST /billing/portal`, `GET /billing/subscription`

---

## Routing (current)

**aicandlez-app PWA (mobile-first, narrow-viewport customer surface):**
- `/` Home (radar + AI Market Scanner + Top Gainers + Active Trades)
- `/signals`, `/crypto`, `/equities`, `/trade`, `/portfolio`
- `/profile` → AI Settings, **Alert Preferences**, Connected Accounts, Broker
- `/billing`, `/subscribe`
- `/portal` → **CROSS-APP REDIRECT** to trading-dashboard's customer terminal.
  The mobile PWA does **NOT** render its own desktop terminal. The old
  `PortalDesktop.tsx` has been deleted. There is no responsive switching,
  no Home.tsx fallback, no mobile-shell impersonation of the desktop UI.

**trading-dashboard (operator console + customer desktop terminal):**
- `/` Landing (signed-out) → role-based: admin → `/command`, customer → `/portal`
- `/portal` — **customer institutional desktop workstation** (Portal.tsx, 1846 LOC):
  Market Heartbeat, Crypto + Equity Signals (top 20 each w/ confidence rings),
  AI War Room, tier-gated live execution (free/starter/pro), Active Trades,
  Trade History, Subscription, AI Auto Trade Queue. Signed-in `Protected`,
  **NOT** AdminOnly — customer auth distinct from operator auth.
- `/dashboard`, `/market`, `/ai`, `/risk`, `/sim`, `/backtest`, `/optimizer`,
  `/scanner`, `/portfolio`, `/correlation`, `/journal`, `/validation`,
  `/sentiment`, `/charts` — signed-in (admin or customer)
- **Operator/admin only** (`ProtectedAdmin` → bounce to `/portal` for non-admins):
  `/command`, `/exchange`, `/syscheck`, `/debug`, `/desktop`, `/institutional`, `/admin`
- `/settings`, `/sign-in/*`, `/sign-up/*`

## Cross-host routing matrix (Task #162 — locked)

| Host                              | Signed-out                | Signed-in customer            | Signed-in admin            | Default landing       | Build env                                                                                  |
| --------------------------------- | ------------------------- | ----------------------------- | -------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `aicandlez.com` (landing)         | Marketing page            | CTAs → `trade.aicandlez.com`  | CTAs → `trade.aicandlez.com` | Marketing             | `VITE_TRADE_URL=https://trade.aicandlez.com`, `VITE_APP_URL=https://app.aicandlez.com`     |
| `app.aicandlez.com` (PWA)         | `/` PWA home (Clerk gate) | PWA mobile experience         | PWA mobile experience      | PWA root              | `VITE_TRADING_DASHBOARD_URL=https://trade.aicandlez.com` (for `/portal` cross-host bounce) |
| `trade.aicandlez.com` (customer)  | Landing → `/sign-in`      | `/portal` (customer desktop)  | `/command` (operator)      | `/portal`             | `VITE_DEFAULT_LANDING=/portal`                                                              |
| `admintrade.aicandlez.com` (admin)| Landing → `/sign-in`      | **cross-host → `trade./portal`** | `/command` (operator)      | `/command`            | `VITE_DEFAULT_LANDING=/command`, `VITE_CUSTOMER_PORTAL_URL=https://trade.aicandlez.com/portal` |
| `api.aicandlez.com`               | (API only)                | (API only)                    | (API only)                 | n/a                   | `CUSTOMER_APP_BASE_URL=https://app.aicandlez.com` (Stripe return host fallback)             |

**Stripe return URL derivation (api-server `lib/customerAppUrl.ts`):**
1. Request `Origin` header — if allow-listed (`app.`/`trade.`/`aicandlez.com` apex/www, `*.replit.app`, `*.replit.dev`, localhost).
2. Else `CUSTOMER_APP_BASE_URL` env.
3. Else legacy `WEBHOOK_BASE_URL` → `REPLIT_DOMAINS` chain.
4. Client-provided `successUrl`/`cancelUrl`/`returnUrl` are honored only when their origin matches the resolved host (defense against spoofed Origin → open redirect).

**Trading-dashboard role dispatch (`SignedInHomeRouter`, `AdminOnly`):**
- On the customer host, non-admins → `VITE_DEFAULT_LANDING` (`/portal`); admins → `/command`.
- On the admin host, non-admins → `CrossAppRedirect(VITE_CUSTOMER_PORTAL_URL)` to keep operator chrome off their screen entirely; admins → `/command`.

## Architectural separation — CUSTOMER PORTAL vs ADMIN PORTAL (LOCKED INVARIANT)

These are intentionally **two different systems** that happen to share the
`trading-dashboard` artifact codebase. Future tasks MUST NOT merge them
back together. Every change to `/portal` must be gated by role and
preserve both worlds.

### CUSTOMER PORTAL — `trade.aicandlez.com/portal` (non-admin signed-in users)
Purpose: **paper-only onboarding + AI evaluation platform** (Task #157)
- PAPER mode ONLY — no LIVE affordances exposed to customers
- Real-money execution is operated by AICandlez through the admin terminal
  (`admintrade.aicandlez.com`) using server-side env Kraken keys. Customers
  do **not** route their own orders to broker networks from the portal.
- Server-side kill switch: `customer_live_execution_disabled` is enforced
  in `placeLiveAutoOrderForUser`, `POST /api/user/live-order`, and the
  `tradingLoop` customer fan-out branch. Default off; only flips when
  `CUSTOMER_LIVE_EXECUTION_ENABLED=true`. Admin / super-admin role bypasses.
- Onboarding flows (`?checkout=success` trigger, OnboardingFlow component)
- Upgrade funnels, tier gates, UpgradeBanner, FeatureGate (paid tiers
  unlock paper capacity + AI features — not live execution)
- Training environment + AI experimentation surface
- Conversion funnel (free → starter → pro)
- `PaperTradesProvider` mounted, gated `!isAdmin`
- **No PAPER/LIVE segmented toggle in Portal header** — replaced by a
  static "PAPER MODE" informational banner explaining that live execution
  is operated by AICandlez.
- **No `LiveExecutionBar` / ARM LIVE control** rendered for non-admins.
- `user_exchange_connections` data + ConnectModal remain available for
  forward compatibility but are not load-bearing for the current customer
  experience.

### ADMIN PORTAL — `admintrade.aicandlez.com/portal` (admin / super-admin role)
Purpose: **institutional operator terminal**
- **Real-only.** No paper, no simulation, no `PaperTradesProvider`
- No onboarding friction, no upgrade prompts, no tier gates
- Live telemetry, exchange diagnostics, execution observability
- Operator analytics, real balances only, real execution only
- Operator role bypasses every customer-tier guard
- Default landing = `/command`; `/portal` here is the operator workstation
  variant (no consumer affordances)

### Rules for future task agents
1. Anything that removes paper trading, simulation, onboarding, or upgrade
   funnels from the codebase MUST be scoped by role/domain — never wholesale.
2. Anything that adds onboarding, upgrade prompts, tier gates, or paper
   affordances MUST be hidden when `useUserRole()` returns `admin` /
   `super-admin`.
3. Customer-side changes that touch `/portal` must verify the admin path
   is untouched (and vice versa).
4. Telemetry and trade history must tag rows with mode (`PAPER` / `LIVE`)
   so the two worlds never co-mingle in metrics.

---

**Production hosting (3-domain split — current target architecture):**
- `app.aicandlez.com/*` — mobile PWA only (aicandlez-app static build). No
  desktop components, no /portal page (cross-app redirect to trade host).
- `trade.aicandlez.com/*` — **customer portal** (hybrid, see above).
  trading-dashboard static build. Default landing = `/portal`. Customer
  auth (non-admin signed-in users) lives here.
- `admintrade.aicandlez.com/*` — **admin/operator portal** (real-only, see
  above). trading-dashboard static build, separate Render service. Default
  landing = `/command`. NO paper trading, NO tier gates, NO upgrade gates,
  unlimited execution, live Kraken only. Operator role bypasses all
  customer-tier guards.
- `dashboard.aicandlez.com/*` — preserved during migration; retired once
  trade./admintrade. cutover is verified.
- Render config: see `render.yaml` services `aicandlez-trade`,
  `aicandlez-admintrade`, `aicandlez-dashboard`. CORS allow-list extended
  on the api service.

**AdminTopTelemetryBar (admin-only operator strip):**
Always-on horizontal strip rendered directly under the trading-dashboard
top header for `admin`/`super-admin` users only (gated via `useUserRole()`
in `Layout.tsx`). 15 real-time metrics: active users now, total registered,
total user trades, trades 24h, platform PnL, fees collected, exchange
connections, AI executions, live subs, MRR, failed trades, system uptime,
websocket status, queue throughput, API latency. Data: `GET /api/admin/top-telemetry`
(`artifacts/api-server/src/routes/adminTopTelemetry.ts`), polled every 5s,
all values DB-derived or engineStats-derived — no mocks.

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
- Home (radar centerpiece + AI Market Scanner + Top Gainers + Crypto Signals preview + Live Trades + Equity Signals preview + Trade History + portfolio hero) — single-column mobile-first stack, no 2-column grid
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

# Changelog (condensed)

Full per-phase detail lives in git history. Anything operationally
important has been promoted into the active sections above — this list
is milestone reference only.

- **Phase 1** — Clerk auth integrated; protected routes + `users` table + role enum + JIT provisioning.
- **Phase 2** — Per-user isolated sim environment; `userSimRegistry` + 5 sim tables + auth-gated `/api/simulation/*` and `/api/user/*`.
- **Phase 3** — Encrypted exchange credentials (AES-256-GCM + PBKDF2); connection-test-gated writes; withdrawal perms never requested.
- **Phase 4** — VAPID push infra; Module 20 Desktop Terminal; production deployment scaffolding (`DEPLOYMENT.md`, `render.yaml` × 4 services).
- **Phase 5** — Cyan → neon-green system-wide pivot; brand tokens, glass primitives, animation library; legacy aliases preserved.
- **Phase 5.1–5.3** — PWA home radar polish; cinematic typography; 3-tier billing ladder; `lib/feedback.ts` (10 alert types); Crypto/Equity signals preview blocks; tier-conditional `UpgradeBanner` + `FeatureGate`.
Per-task narration condensed to milestone refs — invariants and contracts
above (Architectural separation, Cross-host routing matrix, Authentication,
AI Trading Architecture) carry the operationally-binding rules. Detail in
git history.

- **Task #157** — Customer/Admin portal separation invariant locked; `customer_live_execution_disabled` kill switch.
- **Task #158** — Read-only telemetry surfaces: `adminUserTelemetry`, `adminTopTelemetry`, `operatorTelemetry`.
- **Task #159** — Operator action endpoints + immutable audit + Stripe billing actions + `executionStreamBus`.
- **Task #160** — Phased operator administration (Phases 1–6 backend complete; Phase E UI deferred).
- **Task #162** — Launch routing + auth unification: 4-host model (app/trade/admintrade/api); PWA `/portal` cross-host bounce (`VITE_PORTAL_URL`); Stripe return URLs server-derived via Origin allow-list (`resolveCustomerAppBaseUrl`); landing CTAs → `trade.aicandlez.com/portal` (`TRADE_PORTAL_URL`); SignedInHomeRouter env-driven role dispatch.
- **Task #163** — Customer portal restored to PAPER mode via `LiveControlBar` PAPER state (CRYPTO + EQUITIES bars on `trade/portal`); pricing copy cleanup ("No subscription" lines removed).
- **Task #164** — Locked platform color rule: ORANGE = any live affordance (ARMED + EXECUTING), GREEN = PAPER only, RED = HALTED. Single source-of-truth in `LiveControlBar.tsx`.

---

## On-call procedure (P0-01 mitigation — Option B)

`forceRestoreBilling` and `waiveAllPendingFees` are super-admin only by
design (no code change). To prevent on-call lockout when only one
super-admin is reachable:
- Maintain at least **two active super-admin Clerk users** at all times.
- Document the rotation in the internal ops runbook (out-of-band).
- Sprint 1 added a **72-hour restore grace window** in
  `evaluateAndEnforceBillingHold` so a force-restore stays durable even
  if the next fee tick re-evaluates a still-unpaid balance. Window resets
  on every admin action; auto-enforcement resumes after expiry.

## User Preferences

- Always brand work as **AICandlez** (never apex / apexdigital legacy names)
- Performance-fee language always reads "on profitable trades only · never on losses"
- Institutional tone — premium, restrained, no arcade/gambling cues
- Mobile-first PWA is the primary user surface, desktop console is operator-only
- Withdrawal permissions are never requested from exchanges (security promise)
