# AICandlez — System Architecture Report

> Structured knowledge document for AI knowledge-base ingestion.
> Source of truth: this repository (`replit.md`, `lib/db/src/schema`,
> `artifacts/api-server`, agent memory, git history).
> Generated: June 03, 2026. Production deploy: Render (autoDeploy on `origin/main`).

---

## 1. Platform Overview

AICandlez is an institutional-grade AI crypto-trading SaaS. It is a single
**pnpm monorepo** (TypeScript 5.9, Node 24) containing multiple deployable
artifacts that share one Express backend and one PostgreSQL database.

- **Architecture style:** contract-first monorepo. OpenAPI spec (`lib/api-spec`)
  drives generated React Query hooks + Zod schemas (Orval). Shared logic lives in
  `lib/*` composite TypeScript packages; deployable apps live in `artifacts/*`
  (leaf packages, never import each other).
- **Primary user surface:** mobile-first PWA (`aicandlez-app`). Desktop console
  (`trading-dashboard`) is the operator/admin surface and the customer desktop
  portal.
- **Brand:** neon-green institutional theme. Premium, restrained tone — no
  arcade/gambling cues.
- **Runtime model:** subscription-driven. No subscription → paper trading; active
  paid subscription → live trading (gated); canceled/expired → live disabled,
  paper re-enabled.

### Artifacts

| Artifact            | Kind   | Route            | Role                                       |
| ------------------- | ------ | ---------------- | ------------------------------------------ |
| `landing`           | web    | `/`              | Public marketing (signed-out)              |
| `aicandlez-app`     | web    | `/aicandlez-app` | **Primary PWA** — mobile-first customer    |
| `trading-dashboard` | web    | `/dashboard`     | Operator console + customer desktop portal |
| `api-server`        | api    | `/api`           | Shared Express backend                     |
| `natura-ai`         | mobile | `/natura-ai`     | Expo wellness app — **frozen**             |
| `natura-web`        | web    | `/natura-web`    | Legacy companion — **frozen**              |
| `mockup-sandbox`    | design | `/sandbox`       | Canvas iframe variant previews             |

Forward work targets `aicandlez-app` PWA + `trading-dashboard`. `natura-*` are
frozen and not part of the product surface.

---

## 2. Business Purpose

AICandlez lets retail and prosumer crypto traders run an automated AI trading
engine against their own exchange accounts, or in paper-trading simulation.

- **Value proposition:** institutional-quality signal generation (multi-timeframe
  EMA/RSI engine with volume, sideways, and trend filters) packaged as a
  consumer SaaS with tiered entitlements.
- **Monetization:**
  1. **Monthly subscription** (3 paid tiers + a free paper tier).
  2. **Performance fee** charged **only on profitable closed trades — never on
     losses** (`PERFORMANCE_FEE_LABEL`, `lib/fees`).
- **Safety promise:** withdrawal permissions are **never** requested, tested, or
  stored from any exchange — only read + trade scopes.
- **Trust posture:** paper-first onboarding; live execution is multi-gated and
  off by default until the user explicitly arms it.

---

## 3. Frontend Architecture

Two active frontends, both React + Vite, both consuming the shared API through a
locked cross-origin transport layer.

### aicandlez-app (PWA — primary)
- Mobile-first single-column. Routes: `/` Home, `/signals`, `/crypto`, `/trade`,
  `/portfolio`, `/profile` (AI Settings → Alert Prefs → Connected Accounts →
  Broker), `/billing`, `/subscribe`. `/portal` performs a **cross-app redirect**
  to `trading-dashboard`. The PWA never renders its own desktop terminal.
- PWA features: service worker (`public/sw.js`), Web Push (VAPID,
  `usePushNotifications`, `NotificationDispatcher`), localStorage feedback prefs.
- **Home AI Market Scanner:** a radar with 10+ rotating intelligent states driven
  by a priority-ordered decision tree reading `breakdowns` + `tickersData`.

### trading-dashboard (operator console + customer desktop portal)
- Signed-out `/` → landing. Role routing: admin → `/command`, customer →
  `/portal`.
- `pages/Portal.tsx` is a thin role router: customer → `PortalCustomerShell`,
  admin → `AdminPortalShell` (legacy shell behind `VITE_ADMIN_PORTAL_LEGACY`).
- **CUSTOMER vs ADMIN separation is a locked invariant** (see §14). Customer
  portal = paper-by-default + opt-in live; admin portal = real-only, no paper, no
  tier gates, no onboarding.
- Operator → customer-view override: an admin can render the lower-privilege
  customer shell at `/portal` via a floating toggle (localStorage
  `aicandlez:operator-customer-view` or `?previewCustomer=1|0`). No privilege
  escalation — server role checks untouched.
- **Dual crypto matrix:** customer `/portal` and admin `/command` both render a
  two-column scroll: LEFT = `CryptoMajorsSignalsPanel` (majors), RIGHT =
  `CryptoAltsMemesPanel` (alts + memes). No equities on either surface.

### Cross-origin API transport (LOCKED INVARIANT)
Every `/api/*` call from any frontend MUST route through that artifact's
`src/lib/authFetch.ts`, which:
- prefixes `VITE_API_BASE_URL` (so cross-origin hosts hit `api.aicandlez.com`
  instead of their own SPA fallback);
- attaches the Clerk Bearer token as a cookie fallback (Safari ITP / SameSite);
- throws `ApiContractError` when an OK response returns non-JSON (catches a static
  host silently returning `index.html`).
- Build-time guardrail: `check-no-bare-api-fetch` fails on any bare
  `fetch("/api/...")` outside the two `authFetch.ts` files and `useUserRole.ts`.
- Note: the PWA also has a legacy `api.ts` (cookie-only, no Bearer). New PWA calls
  must use `authFetch`; the guard does **not** catch `api.*` helpers.

---

## 4. Backend Architecture

Single Express 5 service (`artifacts/api-server`) bundled with esbuild (CJS).

- **Stack:** Express 5 + Drizzle ORM (PostgreSQL) + Zod (`zod/v4`,
  `drizzle-zod`). Logging via pino (`req.log` in handlers, singleton `logger`
  elsewhere — `console.log` is banned in server code).
- **Middleware order (security-critical):** `trust proxy` → helmet → pino-http →
  Clerk proxy → CORS → **Stripe webhook route (`express.raw`)** → `express.json`
  → `express.urlencoded` → API router. The Stripe webhook is mounted **before**
  `express.json()` because signature verification needs the raw Buffer body.
- **Auth chain:** `clerkProxyMiddleware` (prod) → `clerkMiddleware` →
  `requireAuth` / `requireRole`. `requireAuth` calls `touchSession()` (debounced
  60s writes, fail-open); revoked sessions reject 401 with
  `errorCode: "session_revoked"`.
- **Trading engine** runs in-process as a global loop plus a per-user registry
  (see §9).
- **Exchange abstraction:** `EXCHANGE_CATALOG` + per-exchange adapters
  (`makeAdapter`) provide a uniform `getTicker` / `getAccount` / `executeOrder`
  surface. Credentials decrypted per-call via `CredentialVault`.

---

## 5. Database Schema

PostgreSQL via Drizzle. Schema modules in `lib/db/src/schema/`:

### Identity & access
- `users` — `clerkUserId`, `email`, `role` (`user` / `admin` / `super-admin`),
  `is_internal_account` (QA exemption flag).
- `user_sessions` — session tracking; revoke support (best-effort Clerk + local).
- `user_admin_actions`, `user_admin_status` — operator audit + admin state.
- `audit_log`, `user_consents` — compliance/audit trail.

### Trading core
- `settings` — global engine settings.
- `user_settings` — per-user engine config (minConfidence, categoryAllocation,
  AI personality, preferred live order size, etc.).
- `sim_accounts` — per-user account ledger (cash balance, `total_realized`,
  `total_trades`). Starting paper balance = $100,000.
- `sim_positions` — open positions (paper and live; live tagged via non-null
  `exchange`).
- `sim_trades` — closed-trade history; rows tagged with mode (PAPER/LIVE) and
  reconciliation tags.
- `trades` — **global trade book** (separate from per-user `sim_positions`; source
  of the `maxActivePositions` cap).
- `signals` — generated signal records.
- `account_reconciliations` — reconciliation audit (incl. zombie reconcile).

### Exchange connectivity
- `user_exchange_connections` — AES-256-GCM encrypted keys, per-user PBKDF2.
  Withdrawal permission always `false`.
- `user_exchange_settings` — per-exchange config (SL/TP/trailing overrides).
- `user_exchange_visibility` — presentational per-user exchange visibility.

### Billing & entitlements
- `credit_transactions`, `user_credits` — credit ledger.
- `performance_fees` — profitable-trade fee records.
- `processed_stripe_events` — Stripe webhook idempotency gate.
- `user_trade_limits` — per-user daily/concurrent limits.
- `user_risk_settings` — per-user risk parameters.
- `risk_throttle_events` — risk-gate telemetry.

### Notifications & ops
- `user_notifications` — in-app notifications (`data` jsonb).
- `user_push_tokens` — Web Push subscriptions.
- `logs` — structured app log rows (subset; some telemetry is pino/stdout-only).

> Schema drift trap: dev `drizzle-kit push` never reaches production. Prod schema
> changes require a manual ALTER against `RENDER_PROD_DATABASE_URL` at deploy.

---

## 6. API Endpoints

Route surface (all `/api/*`, mounted after body parsers; webhook is the raw
exception). Auth via `requireAuth` / `requireRole` unless noted.

| Group              | Purpose                                                        |
| ------------------ | ------------------------------------------------------------- |
| `/api/auth/*`      | `/auth/me` role resolution (allowlist-authoritative), session |
| `/api/billing/*`   | `POST /checkout`, `POST /portal`, `GET /subscription`         |
| `/api/stripe/webhook` | Stripe webhook (raw body, signature-verified)              |
| `/api/user/*`      | runtime-state, live-order, trading-mode, intelligence reports |
| `/api/simulation/*`| per-user paper/live sim state (all `requireAuth`)             |
| `/api/exchange/*`  | operator exchange select/order/execute (`requireOperator`)    |
| `/api/engine/*`    | `GET /engine/status` engine telemetry                        |
| `/api/signals/*`   | signal feeds                                                  |
| `/api/candles/*`   | OHLC candle data                                             |
| `/api/backtest/*`  | backtesting                                                  |
| `/api/sentiment/*` | sentiment data                                              |
| `/api/validation/*`| strategy validation                                         |
| `/api/journal/*`   | trade journal                                                |
| `/api/admin/*`     | users grid, telemetry, sessions, exchange-visibility, top-telemetry |

Key customer endpoints:
- `GET /api/user/runtime-state` — hydrates `CustomerTradingRuntimeContext`
  (paper vs live, active exchange).
- `POST /api/user/live-order` — manual customer live order (gated; server checks
  ARM → 412 `runtime_not_armed`).
- `GET /api/user/{concurrency-recommendation,execution-blockers,profit-report}` —
  advisory read-only intelligence (never change caps).
- `GET/POST /api/user/trading-mode` — conservative/balanced/aggressive presets.

---

## 7. Coinbase Integration

Coinbase is one of the supported live exchanges (alongside Kraken, Binance,
Bybit, OKX, KuCoin) and a boot-priority operator venue.

- **Connection model:** keys stored encrypted in `user_exchange_connections`
  (AES-256-GCM, per-user PBKDF2). Read + trade scopes only; withdrawal never
  requested. Connection test = `getTicker` + `getAccount` round-trip before any
  DB write.
- **Symbol mapping:** `adapter.normaliseSymbol` is the authoritative converter at
  submit time. Orders are validated locally against the product spec
  (precision / min-size / min-notional / tradability) before submission, so the
  broker doesn't reject one trade at a time.
- **Operator routing priority:** Kraken → Coinbase → CryptoDotCom → Binance →
  Gemini → Alpaca (first with env keys wins). Customer routing uses the user's
  selected/auto-promoted exchange.
- **Known portfolio nuance:** a Coinbase API key's *tradable* portfolio can differ
  from its *funded* portfolio. Equity can read fine while orders return
  "account is not available" / INSUFFICIENT_FUND because `retail_portfolio_id` is
  omitted. Risk-equity computation prices all holdings, so it can overstate
  deployable USD.
- **Universe constraint:** symbols must be in the engine-analyzed universe
  (`COINBASE_SYMBOLS`); otherwise they are structurally untradeable and rejected
  at gate `0UNI` (`symbol_not_in_universe`).

---

## 8. Stripe Integration

Stripe powers the 3-tier subscription ladder + performance fees + credit top-ups.

- **Checkout/portal:** `POST /api/billing/checkout`, `POST /api/billing/portal`
  (Stripe customer portal for downgrades/cancellation), `GET
  /api/billing/subscription`.
- **Price mapping:** `STRIPE_PRICE_{STARTER,PRO,ELITE}_MONTHLY`; legacy grandfather
  via `STRIPE_PRICE_{STARTER,PRO}_LEGACY` (comma-separated) in `planFromPriceId`.
- **Webhook:** `POST /api/stripe/webhook`, mounted with `express.raw` **before**
  `express.json()`. Idempotency via `processed_stripe_events`. Two verification
  paths exist: an in-app credit-event branch (`maybeHandleCreditEvent`, swallows
  errors) and the throwing `stripe-replit-sync` path (`processWebhook`).
- **Secret resolution:** verification uses `process.env.STRIPE_WEBHOOK_SECRET?.trim()`
  **only**. In production (`NODE_ENV=production`) the secret is env-only; a
  DB-managed fallback (`stripe._managed_webhooks`) exists but is gated to
  non-production. That silent DB fallback can shadow a missing/empty Render env
  var with a stale dev secret → "No signatures found".
- **Stripe return-URL resolution** (`lib/customerAppUrl.ts`): Origin header
  (allow-listed) → `CUSTOMER_APP_BASE_URL` → `WEBHOOK_BASE_URL` →
  `REPLIT_DOMAINS`. Client URLs honored only when origin matches the resolved host
  (anti-spoof / anti-open-redirect).
- **Active investigation:** a production webhook signature failure
  (`StripeSignatureVerificationError: No signatures found`) — see §18.

---

## 9. Trading Engine Logic

### Global trading loop (`lib/tradingLoop.ts`)
- EMA + RSI engine with a multi-timeframe (MTF) funnel (5m / 15m / 1H).
- Filters: volume gate, sideways-market block, 1H-trend filter.
- Default `minConfidence = 60`.
- Owns the global `trades` book (cap source) and the per-user LIVE exit monitor
  (`runHardStopMonitor`).

### Per-user state (`lib/userSimRegistry.ts`)
- `Map<userId, UserSimState>`, lazy DB-load, instant persistence.
- Tables: `user_settings`, `sim_accounts`, `sim_positions`, `sim_trades`,
  `user_notifications`. Starting paper balance = $100,000.

### Execution routing (`SignalRow.fireTrade`)
- Customer LIVE → `POST /api/user/live-order` (requires customer portal + LIVE
  mode + `canUseLive` + connected exchange).
- Admin operator → `POST /api/exchange/order/execute` (Kraken env path,
  `requireOperator`-gated).
- Else → paper sim (`firePaper`).

### Customer live-execution gate stack (`placeLiveAutoOrderForUser`)
Single customer chokepoint for both AI fan-out and manual live orders (operators
bypass). Ordered live-only gates:
1. `0UNI` — `symbol_not_in_universe`.
2. `0SYM` — per-symbol disable list + size multiplier (`symbol_disabled`,
   SoT `symbolPolicy.ts`).
3. `0TREND` — SELL-only 1H-trend filter (`sell_blocked_bullish_1h`, behind
   `LIVE_BLOCK_SELLS_IN_BULLISH_1H`, default OFF).
4. `0c` — platform concurrent-cap (`concurrent_live_cap_reached`).
5. Risk gates (`liquidityGuard`, risk settings).
6. `0ALLOC` — category-allocation soft-cap (falls back to
   `DEFAULT_CATEGORY_ALLOCATION`, majors-heavy).

Three independent ARM checks must all pass before live execution:
(1) env kill switch off (`customer_live_execution_disabled`), (2) `liveReady=true`
from the aggregator, (3) explicit per-session ARM.

### Exit governance (`runHardStopMonitor`, per-user LIVE)
Precedence: **SL → TP → LIVE trailing → LIVE max-hold**. SL/TP are synthetic and
locked at open. The global trailing engine is paper-only. There is no AI-driven
exit. Two separate books — global `trades` and per-user `sim_positions` — each
have their own exit monitor; every exit must close the correct book or caps
saturate and execution silently stalls.

### Live stop-loss stabilization
The 2% stop **level** is unchanged; the LIVE **trigger** is de-noised with a
stabilization grace + consecutive-breach confirm, plus a catastrophic-move
override fast-path. Knobs: `LIVE_STOP_STABILIZATION_MS` (90000),
`LIVE_STOP_CATASTROPHIC_MULT` (2.5×), `LIVE_STOP_IMMEDIATE_FRACTION`. Paper SL
untouched.

### Zombie reconciliation (orphaned LIVE positions)
When a position is past max-hold AND the broker repeatedly rejects the close AND
the verified broker balance cannot satisfy the recorded quantity, the position is
reconciled **locally** (no broker order): DELETE `sim_positions` + INSERT a tagged
`sim_trades` audit row (`RECONCILED_INSUFFICIENT_FUNDS`, `realizedPnL 0`,
excluded from realized recompute). Cash/realized/trades totals untouched. Gated
by `LIVE_RECONCILE_FAILED_CLOSE_STREAK` (default 3) consecutive failures +
`LIVE_RECONCILE_BALANCE_TOLERANCE` (default 0.02). Never reconciles on a single
rejection or when balance can satisfy quantity (transient → keep retrying).

---

## 10. Current Trading Parameters

| Parameter                  | Value / Default | Notes                                  |
| -------------------------- | --------------- | -------------------------------------- |
| `minConfidence`            | 60              | Global engine default                  |
| Volume gate                | ≥ 65% of 20-bar avg | SoT `VOLUME_GATE_FRACTION`          |
| Sideways block             | < 0.15% spread  | Blocks chop                            |
| 1H trend filter (entry)    | OFF by default  | Both-sides alignment gate when on      |
| Stop loss                  | **2%**          | Locked across all presets              |
| Take profit                | **10%** (active test) | Revert target = 4%               |
| Trailing stop              | **5%** (active test)  | Revert target = 2%               |
| Max hold                   | **24h**         | LIVE max-hold is price-independent      |
| Starting paper balance     | $100,000        |                                        |
| Platform concurrent live cap | 25            | `LIVE_EXECUTION_CONCURRENT_CAP`         |
| Per-plan max open positions | free 0 / starter 3 / pro 6 / elite 12 | `PLAN_MAX_OPEN_POSITIONS` |

> **TP10/Trail5 is an ACTIVE live experiment** (`EXIT_DEFAULTS`) — do NOT revert
> without sign-off. Live on two internal QA accounts (`is_internal_account=true`),
> both pinning `trailing_stop_percent=5` explicitly. SL 2% and max-hold 24h are
> unchanged. Precedence for TP-side/trailing: per-exchange → account → env
> (`LIVE_TRAILING_STOP_PERCENT`) → hardcoded default; `0` disables. Env is a
> gap-filler only and must not override an explicit per-account/exchange edit.

**Trading-mode presets** (`lib/tradingModePresets.ts`):
conservative/balanced/aggressive bundles that WRITE already-wired fields
(minConfidence, categoryAllocation, account SL/TP/trailing/maxHold, preferred
order size, AI personality). No new execution gates. SL stays 2% in every preset.

---

## 11. MTF Filtering Logic

Multi-timeframe funnel applied before a signal becomes executable:

- **Timeframes:** 5m (entry timing), 15m (intermediate confirmation), 1H (trend
  context).
- **Funnel order:** a candidate must survive each timeframe's checks; the funnel
  typically collapses at the confidence/MTF gate (this is where most signals die,
  per signal-funnel telemetry).
- **1H trend (entry):** EMA9 vs EMA21 alignment. The engine's `require1HTrend` is a
  **both-sides** gate (blocks counter-trend BUY as well as SELL). It is OFF by
  default.
- **SELL-only 1H trend filter (separate live-exec gate `0TREND`):** distinct from
  `require1HTrend`. When `LIVE_BLOCK_SELLS_IN_BULLISH_1H=true`, a new customer LIVE
  SELL (short) is blocked while the engine's current 1H trend is `bullish`; SELL
  is allowed on `bearish`/`unknown`; BUY unchanged. Default OFF (legacy). The 1H
  trend is read from `engineStats.symbolBreakdowns`, not recomputed.
- **Telemetry:** two funnel modules exist — `executionFunnel` (block-count) and
  `signalFunnel` (true per-signal). Trust `signalFunnel` for "where signals die".
  Execution vs display confidence are separate; `executionEligible` is the single
  execution authority — never add a second confidence gate.

---

## 12. Liquidity Guard Logic

`liquidityGuard` enforces per-user open-position ceilings and risk constraints
before any live order is placed.

- **Per-plan ceilings (`PLAN_MAX_OPEN_POSITIONS`):** free 0, starter 3, pro 6,
  elite 12. Admin/super-admin = unlimited.
- **Platform concurrent cap (gate `0c`):** controlled-beta cap of 25 concurrent
  live trades across all customers, enforced in `placeLiveAutoOrderForUser` by
  counting open `sim_positions WHERE exchange IS NOT NULL`. Admin/super-admin
  bypass; operator path (no userId) not gated here. Rejection →
  `errorCode: "concurrent_live_cap_reached"` + user notification +
  `order_rejected` stream event + `logs` row. Tunable via
  `LIVE_EXECUTION_CONCURRENT_CAP` (0 disables).
- **QA exemption:** `users.is_internal_account` exempts QA accounts from tier
  daily/concurrent caps, but liquidity + risk + sizing + balance checks still
  apply (predicates fail-closed).
- **Known TOCTOU race:** the gate reads positions then places the broker order
  without a reservation; N concurrent placements can overshoot by N−1. Acceptable
  at current scale; harden with an advisory lock / `SELECT … FOR UPDATE` before
  widening the cap.

---

## 13. Subscription System

3-tier ladder + free paper tier. **Locked — no `$5.99` anywhere in the codebase.**

| Plan ID   | Name                 | Price    | Daily | Concurrent |
| --------- | -------------------- | -------- | ----- | ---------- |
| `free`    | Paper Trading        | Free     | 10    | 0 (paper)  |
| `starter` | AI Trading           | $49.95   | 50    | 3          |
| `pro`     | AI Trading Pro       | $99.95   | 100   | 6          |
| `elite`   | AI Trading Elite VIP | $199.95  | 200   | 12         |

- Free = paper only; paid = live only. Admin/super-admin = unlimited.
- Runtime is subscription-driven: no sub → paper; active paid → live;
  canceled/expired → live disabled + paper re-enabled.
- **Performance fee:** charged only on profitable closed trades, never on losses.
- Monthly, cancel anytime, Stripe customer portal for downgrades.
- Source of truth: `SubscriptionContext.tsx` (`plan` =
  `free`/`starter`/`pro`/`elite`).
- Onboarding + upgrade funnels + tier gates unlock paper capacity, AI features,
  and eligibility to connect a live exchange (actual execution still gated by the
  three ARM checks).

---

## 14. User Roles

Three roles: `user` (customer), `admin` (operator), `super-admin`.

- **Allowlists are authoritative** (`lib/adminAllowlist.ts`). `/auth/me` resolves
  role on every login: `SUPER_ADMIN_EMAILS` → super-admin; `OPERATOR_ADMIN_EMAILS`
  → admin; otherwise → user. It both promotes AND downgrades (a stale admin whose
  email left the operator list resets to user on next login; super-admin never
  auto-demoted). Current state: `OPERATOR_ADMIN_EMAILS` is empty; the only admin
  is the single designated super-admin.
- **CUSTOMER vs ADMIN portal separation (LOCKED INVARIANT):**
  - CUSTOMER (`trade./portal`, non-admin): paper-by-default, opt-in live runtime,
    onboarding + upgrade funnels + tier gates, `PaperTradesProvider` mounted
    (gated `!isAdmin`). Telemetry/trade history tagged PAPER/LIVE.
  - ADMIN (`admintrade./portal`, admin/super-admin): real-only, no paper, no
    simulation, no onboarding, no upgrade prompts, no tier gates. Default landing
    `/command`.
  - Rules: removing paper/onboarding/upgrade must be role-scoped; adding such
    affordances must hide when `useUserRole()` is admin/super-admin (also applies
    to the PWA Profile cards); customer changes must not touch the admin path and
    vice versa.
- **On-call invariant:** maintain two active super-admin Clerk users at all times.
  `forceRestoreBilling` / `waiveAllPendingFees` are super-admin only; 72h restore
  grace window in `evaluateAndEnforceBillingHold`.

---

## 15. Deployment Architecture

Production is a 3-domain split hosted on **Render**, with the API and static
frontends as separate services.

| Host                       | Serves                          | Default landing |
| -------------------------- | ------------------------------- | --------------- |
| `aicandlez.com`            | landing (marketing)             | —               |
| `app.aicandlez.com`        | PWA only (`aicandlez-app`)      | PWA mobile      |
| `trade.aicandlez.com`      | customer portal (dashboard)     | `/portal`       |
| `admintrade.aicandlez.com` | admin portal (separate service) | `/command`      |
| `api.aicandlez.com`        | API only                        | —               |
| `dashboard.aicandlez.com`  | **legacy**, being retired       | —               |

- Render services: `aicandlez-trade`, `aicandlez-admintrade`,
  `aicandlez-dashboard` (+ api) defined in `render.yaml`.
- CORS allow-list: `aicandlez.com`, `app.`, `api.`, `trade.`, `admintrade.`.
- `AdminTopTelemetryBar` (admin-only) pulls 15 metrics from
  `GET /api/admin/top-telemetry` on a 5s poll.
- Production export ZIP: `python3 scripts/build-export-zip.py` →
  `artifacts/trading-dashboard/public/aicandlez-production.zip` (excludes
  `node_modules/`, `dist/`, `.git/`, `natura-*`, `mockup-sandbox`,
  `attached_assets/`, `.local/`, `.replit-artifact/`).

---

## 16. Environment Variables

- **Auto-provisioned:** `DATABASE_URL`, `CLERK_SECRET_KEY`,
  `VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `VAULT_MASTER_KEY`, VAPID set.
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_{STARTER,PRO,ELITE}_MONTHLY`,
  `STRIPE_PRICE_{STARTER,PRO}_LEGACY`.
- **Exchanges (live):** `KRAKEN_API_KEY/SECRET`, `BINANCE_API_KEY/SECRET`,
  `COINBASE_API_KEY/SECRET`, `CRYPTOCOM_API_KEY/SECRET`,
  `EXCHANGE_LIVE_ENABLED=true`.
- **Cross-host build env:** `VITE_API_BASE_URL`, `VITE_TRADE_URL`, `VITE_APP_URL`,
  `VITE_TRADING_DASHBOARD_URL`, `VITE_DEFAULT_LANDING`, `VITE_CUSTOMER_PORTAL_URL`,
  `CUSTOMER_APP_BASE_URL`. Canonical in `render.yaml`.
- **Operational toggles:** `CUSTOMER_LIVE_EXECUTION_ENABLED`,
  `LIVE_EXECUTION_CONCURRENT_CAP`, `LIVE_BLOCK_SELLS_IN_BULLISH_1H` (default OFF).
- **Live stop/exit tuning:** `LIVE_STOP_STABILIZATION_MS` (90000),
  `LIVE_STOP_CATASTROPHIC_MULT` (2.5), `LIVE_STOP_IMMEDIATE_FRACTION`,
  `LIVE_TRAILING_STOP_PERCENT` (gap-filler; 2%).
- **Reconciliation:** `LIVE_RECONCILE_FAILED_CLOSE_STREAK` (3),
  `LIVE_RECONCILE_BALANCE_TOLERANCE` (0.02).
- **Symbol policy (optional):** live disable list + per-symbol size multipliers
  (SoT defaults `symbolPolicy.ts`).
- **Production-only:** `CLERK_SECRET_KEY_LIVE`, `VITE_CLERK_PUBLISHABLE_KEY_LIVE`.

> Live-money env knobs must fail-safe: a bare `Number(env)` on a real-money
> exit/stop knob can yield `NaN` and silently fail-open the stop. Always validate
> finite + range and fall back to a safe default.

---

## 17. Render Deployment Process

- **Mechanism:** production = Render, **autoDeploy on `origin/main` push**. There
  is no agent-triggered prod build; `git push origin main` is the deploy action.
  (Replit's `suggestDeploy` / deployment-info point at a *different* Replit target,
  not `aicandlez.com`.)
- **Verification:** confirm a deploy via the production DB
  (`RENDER_PROD_DATABASE_URL`) and the public `GET /api/engine/status` — not via
  Replit deployment logs.
- **Production logs:** Render stdout (pino). `fetch_deployment_logs` does NOT reach
  Render (it targets the Replit deploy), so much live telemetry
  (`CUSTOMER_FANOUT_*`, `POSITION_*`, broker reject reasons, the
  `[STRIPE_WEBHOOK_DIAG]` lines) is Render-stdout-only and must be read in Render's
  log viewer.
- **Production DB:** lives on Render. `executeSql` against "prod" hits an empty
  Replit replica; use `RENDER_PROD_DATABASE_URL` via `pg` for real prod data.
- **Schema drift trap:** dev `drizzle-kit push` never reaches prod. A column
  present in dev but missing in prod breaks both reads and writes for that table
  (Drizzle uses explicit column lists). Schema changes need a manual ALTER against
  `RENDER_PROD_DATABASE_URL` at deploy time.
- Reference docs: `DEPLOYMENT.md`, `render.yaml`, `.env.production.example`.

---

## 18. Known Issues

1. **Stripe webhook signature failure (ACTIVE).**
   `StripeSignatureVerificationError: No signatures found` in production. Body
   corruption ruled out (`lengthMatch=true`, `hmacMatchesAnyV1=false`, raw body
   is a Buffer, `express.json` not touching the route, only
   `STRIPE_WEBHOOK_SECRET` used). Root cause narrowed to secret-vs-endpoint
   identity: (A) wrong/!byte-identical secret loaded in Render, or (B) deliveries
   from a different endpoint/mode than the secret belongs to. Diagnostic fields
   (`webhookSecretFirst6/Last4/RawLength/TrimChangesLength`, `hmacMatchesAnyV1`)
   are deployed; resolution requires comparing Render's first6/last4 against the
   Stripe Dashboard endpoint secret. A silent non-prod DB fallback can shadow a
   missing env secret.
2. **Per-user LIVE max-hold zombies (MITIGATED, see §19).** Previously positions
   could stay open past 24h when the broker rejected the close every tick (dust
   below min-size, or real rows failing min-notional / balance / connection).
   Now self-healed by zombie reconciliation; residual edge cases still depend on
   broker behavior.
3. **Live SHORTs not filtered differently than BUYs (current prod behavior).**
   The SELL-only 1H-trend filter is unset in prod → OFF. No SELL-specific
   confidence threshold; allocation is by asset category, never by side. BUY/SELL
   entries run ~50/50.
4. **Concurrent-cap TOCTOU race.** Gate reads then places without reservation; can
   overshoot by N−1 under concurrency. Acceptable at current scale; must harden
   before widening the cap.
5. **TP10/Trail5 vs sub-3% peaks.** MFE analysis indicates the live-profitability
   issue is not "TP too low / trail too tight"; raising TP loses the 4% cluster and
   widening the trail is too wide for sub-3% peaks. Experiment ongoing.

---

## 19. Recent Fixes

From git history (`origin/main`):

- **`06f7272`** — Improve webhook secret logging + raw body handling for Stripe
  (added `webhookSecretFirst6/Last4/RawLength/TrimChangesLength` + HMAC self-test
  diagnostics; full secret never logged).
- **`06a11a6`** — Trim `STRIPE_WEBHOOK_SECRET` at all verification sites (prod
  observed length 39 vs canonical 38 → stray character).
- **`90b47ef`** — Resolve Kraken `EAPI:Invalid nonce` (monotonic nonce +
  single-owner gate).
- **`d39ac78`** — Temporary phase-split webhook tracing to pinpoint the 400 cause.
- **`00e0ff1`** — Reconcile orphaned per-user LIVE positions (max-hold
  broker-close zombies): balance-verified, multi-failure-gated local reconcile
  with full audit; totals untouched, realized ledger kept clean.
- Earlier: trade-execution + trading-config documentation updates.

---

## 20. Future Roadmap

1. **Resolve the Stripe webhook secret mismatch** — complete the Render-vs-Stripe
   first6/last4 comparison, correct the loaded secret / endpoint-mode, then remove
   the temporary webhook diagnostics.
2. **Harden the concurrent-cap TOCTOU** with an advisory lock or
   `SELECT … FOR UPDATE` reservation before widening the live cap beyond 25.
3. **Per-account / per-exchange exit controls** — granular SL/TP/trailing/max-hold
   overrides per connection (proposed follow-up).
4. **Conclude the TP10/Trail5 live experiment** — decide keep vs revert to
   TP4/Trail2 based on internal QA account results.
5. **Retire `dashboard.aicandlez.com`** legacy host post `trade.`/`admintrade.`
   cutover.
6. **Tighten live-execution observability** — promote key Render-stdout-only
   telemetry (broker reject reasons, fan-out counters) into the queryable `logs`
   table for prod debugging without stdout access.

---

*End of report.*
