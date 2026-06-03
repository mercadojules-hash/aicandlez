# AICandlez — File & Route Technical Reference

> Companion to `docs/aicandlez-system-architecture.md`. This document is the
> concrete, file-level map: repository structure, complete API route catalog,
> database schema modules, and the trading / Stripe / Coinbase / deployment file
> inventories. Generated June 03, 2026 from the live codebase.

---

## 1. Monorepo File Structure (top level)

```text
aicandlez/ (pnpm workspace)
├── artifacts/
│   ├── landing/            web   — public marketing (/)
│   ├── aicandlez-app/      web   — primary mobile PWA (/aicandlez-app)
│   ├── trading-dashboard/  web   — operator console + customer desktop (/dashboard)
│   ├── api-server/         api   — shared Express backend (/api)
│   ├── natura-ai/          mobile (Expo) — FROZEN
│   ├── natura-web/         web   — FROZEN
│   └── mockup-sandbox/     design — canvas iframe previews (/sandbox)
├── lib/
│   ├── api-spec/           OpenAPI spec + Orval codegen (client hooks + Zod)
│   ├── db/                 Drizzle schema + client (composite lib)
│   └── fees/               performance-fee labels/logic
├── scripts/                @workspace/scripts (build-export, guards)
├── docs/                   architecture + history docs
├── render.yaml             Render services + headers (prod SoT)
├── DEPLOYMENT.md           deploy runbook
├── .env.production.example
├── pnpm-workspace.yaml
├── tsconfig.base.json / tsconfig.json
└── replit.md               project README + user preferences
```

---

## 2. API Server File Structure (`artifacts/api-server/src`)

### Entry / wiring
- `index.ts` — process entry.
- `app.ts` — Express app; middleware order, Stripe raw webhook route, router mount.
- `migrate.ts` — migration runner.
- `webhookHandlers.ts` — Stripe webhook processing (credit branch + sync path).
- `stripeClient.ts` — Stripe client + webhook-secret diagnostics.

### Middlewares (`src/middlewares/`)
- `clerkProxyMiddleware.ts` — prod Clerk proxy (streams raw bytes; before parsers).
- `requireAuth.ts` — auth + `touchSession()`; exports `requireOperator` /
  `requireSuperAdmin` role guards.
- `requireDisclaimer.ts` — AI disclaimer gate.
- `requirePlan.ts` — tier gate (`requirePlan("starter")` etc.).

### Routes (`src/routes/`) — 60+ modules, mounted via `routes/index.ts`
Auth/user: `auth`, `userSettings`, `userExchanges`, `userConsent`,
`userNotifications`, `userLiveOrder`, `userRiskSettings`, `userTradeLimit`,
`userAiLiquidity`, `userExecutionFunnel`, `runtimeState`, `aiTrading`,
`aiDisclaimer`, `pushTokens`, `internalNotify`, `portfolio`, `executionState`.
Billing: `billing`, `fees`, `profitReport`.
Trading/market: `signals`, `candles`, `marketData`, `trades`, `simulation`,
`backtest`, `optimizer`, `scanner`, `correlation`, `sentiment`, `analysis`,
`journal`, `validation`, `riskManagement`, `concurrencyRecommendation`,
`executionBlockers`, `exitConfig`.
Exchange/operator: `exchange`, `exchangeCatalog`, `adapters`, `engine`,
`operatorTelemetry`, `executionDebug`, `alpacaBroker`, `alpacaPaper`.
Admin: `adminUserTelemetry`, `adminUserActions`, `adminUserProfile`,
`adminTrades`, `adminFees`, `adminReconciliation`, `adminSessions`,
`adminAnalytics`, `adminAiUsage`, `adminExecutionFunnel`,
`adminExecutionMetrics`, `adminExitConfig`, `adminExchangeConnections`,
`adminRiskEvents`, `adminBackfillStatus`, `adminTopTelemetry`,
`adminUserExchangeVisibility`.
System/mobile: `health`, `system`, `platformOverview`, `download`, `logs`,
`settings`, `mobile`.

### Domain logic (`src/lib/`)
Engine: `tradingLoop`, `trading`, `simulationEngine`, `indicators`,
`signalFunnel`, `executionFunnel`, `executionGateway`, `executionStreamBus`,
`executionTelemetry`, `aiTradingGate`, `aiReasoning`, `assetScanner`,
`marketData`, `backtestEngine`, `strategyOptimizer`, `correlationEngine`,
`sentimentEngine`, `validationEngine`, `tradeJournalEngine`, `portfolioEngine`,
`positionStore`.
Live execution & exits: `liveUserExecution`, `userSimRegistry`,
`multiExchangeParallel`, `exchangeEngine`, `operatorEngineOwner`,
`trailingStopEngine`, `exitConfig`, `killSwitch`.
Risk & limits: `riskEngine`, `riskGate`, `liquidityGuard`, `tradeLimitEngine`,
`tierLimits`, `concurrencyAdvisor`, `executionBlockerReport`, `symbolPolicy`,
`symbolCategories`.
Billing & accounting: `billingEnforcement`, `adminBillingActions`, `feeLedger`,
`accountReconciliation`, `customerExecMetrics`, `customerExecutionAttribution`,
`profitReport`.
Auth & platform: `adminAllowlist`, `userStatusGuard`, `sessionTracker`,
`ensureUserRow`, `customerAppUrl`, `notifications`, `settingsStore`,
`tradingModePresets`, `aiDisclaimer`, `validateEnv`, `logger`, `wsServer`,
`backfillScheduler`.

### Services (`src/services/`)
- `ai/` — `ConfidenceScorer`, `RegimeClassifier`, `AIPersonality`, `AIMemory`.
- `exchanges/` — `adapterFactory`, `ExchangeRegistry`, `ExchangeHealthMonitor`,
  `BaseExchangeAdapter`, `catalog`, `types`, `AlpacaBrokerProvider`,
  `AlpacaTokenRefresher`, and `adapters/` (18 exchange adapters — see §7/§8).
- `queue/` — `ExecutionQueue`.
- `risk/` — `EnterpriseRiskEngine`, `CircuitBreaker`, `DrawdownProtection`.
- `telemetry/` — `ExecutionTelemetry`, `AuditLogger`.
- `users/` — `UserEngineRegistry`, `UserSession`.
- `vault/` — `CredentialVault` (AES-256-GCM, per-user PBKDF2).

---

## 3. Complete API Route Catalog

All routes mounted under `/api`. Auth legend: 🔓 public · 🔑 `requireAuth` ·
🛠 `requireOperator` · ⭐ `requireSuperAdmin` · 📋 `requirePlan`.

### Auth & profile
- 🔑 `GET /auth/me`, `PUT /auth/profile`

### Billing (Stripe)
- 🔓 `GET /billing/publishable-key`, `GET /billing/plans`
- 🔑 `GET /billing/subscription`, `GET /billing/wallet`
- 🔑📋 `POST /billing/checkout` (also `requireDisclaimer`), `POST /billing/portal`,
  `POST /billing/topup`, `POST /billing/pay_outstanding`
- 🔓 `POST /stripe/webhook` (raw body, signature-verified — mounted in `app.ts`)

### User settings / runtime / AI
- 🔑 `GET|PUT /user/settings`; `GET|POST /user/trading-mode`
- 🔑 `GET /user/runtime-state`
- 🔑 `GET /user/ai-trading/state`, `POST /user/ai-trading/enable`
- 🔑 `GET|POST /user/consent`, `GET|POST /user/disclaimer`
- 🔑 `GET /user/execution-funnel`, `GET /user/ai-liquidity` (concurrency advice)
- 🔑 `GET /user/concurrency-recommendation`, `GET /user/execution-blockers`,
  `GET /user/profit-report`
- 🔑 `GET /user/notifications`, `POST /user/notifications/read-all`,
  `POST /user/notifications/:id/read`, `POST /user/notify`
- 🔑 `POST|DELETE /user/push-token`, `GET /user/push-tokens`

### User exchanges & live execution
- 🔑 `GET /user/exchanges`; `GET /user/exchanges/balances`,
  `GET /user/exchanges/:exchange/balances`, `GET /user/exchanges/:exchange/open-orders`
- 🔑📋 `POST /user/exchanges/connect` (+`requireDisclaimer`),
  `PUT /user/exchanges/:exchange/settings`, `POST /user/exchanges/:exchange/test`,
  `POST /user/exchanges/:exchange/default`, `POST /user/exchanges/:exchange/mode`
- 🔑 `DELETE /user/exchanges/:exchange`
- 🔑 `POST /user/live-order` (manual customer live order; server ARM check → 412)
- 🔑 `GET|PUT /user/exit-config`, `PUT|DELETE /user/exit-config/:exchange`

### Simulation / portfolio / execution state
- 🔑 `GET /account`, `GET /account/fees/monthly`
- 🔑 `GET /simulation/account`, `GET /simulation/trades`, `POST /simulation/order`,
  `POST /simulation/close/:positionId`, `POST /simulation/reset`
- 🔑 `GET /portfolio/overview`, `PATCH /portfolio/config`
- 🔑 `GET /execution/state`

### Market data / signals / analysis (mostly public reads)
- 🔓 `GET /signals/latest`; `GET /market-data`, `GET /market-data/:symbol`;
  `GET /candles`; `GET /trades`, `POST /trades`, `GET /trades/open`,
  `POST /trades/:id/close`
- 🔓 `GET /sentiment/overview`, `/sentiment/news`, `/sentiment/:symbol`,
  `/sentiment/adjusted/:symbol`
- 🔓 `GET /journal/trades`, `/journal/summary`; `POST /journal/trades`,
  `PATCH|DELETE /journal/trades/:id`
- 🔓 `GET /fees`, `/fees/all`
- 🔓 `GET /risk/config`; `POST /risk/config`, `/risk/validate`, `/risk/kill-switch`

### Engine (operator)
- 🔓 `GET /engine/status`
- 🛠 `GET /engine/signal-funnel`, `POST /engine/signal-funnel/reset`;
  `POST /engine/start|stop|arm|disarm|testmode|filters|exchange-mode`;
  `GET /engine/arm-state`; `POST /engine/close-all-positions`,
  `POST /engine/force-test-trades`; `GET /engine/debug/confidence/:symbol`

### Exchange / adapters (operator)
- 🛠 `GET /exchange/status|orders|live-state|balances`;
  `POST /exchange/mode|kill|pause|sim/reset|order/preview|order/execute|select`
- `GET /adapters`, `/adapters/health`, `/adapters/:exchange/health`,
  `/adapters/ticker/:symbol`, `/adapters/orderbook/:symbol`, `/adapters/account`,
  `/adapters/breakers`; `POST /adapters/active`, `/adapters/breakers/:name/reset|trip`,
  `/adapters/vault/store|test`; vault connection list/delete

### Admin (operator unless ⭐)
- 🛠 `GET /admin/users`, `/admin/users/:id`, `/admin/platform/leaderboards`
- 🛠 `GET /admin/positions`, `/admin/closed-trades`
- 🛠 `POST /admin/users/:id/activate|suspend|disable|force_paper|sim_reset|
  override_trade_limit|cancel_subscription|complimentary_subscription|
  extend_subscription|add_credits|sync_from_clerk`; `GET /admin/users/:id/audit|billing`;
  `GET /admin/billing/hold_queue`
- ⭐ `POST /admin/users/:id/revoke_exchange_access|emergency_disable|
  create_complimentary_subscription|waive_fees|restore_billing`;
  `PATCH /admin/users/:id/billing-overrides|complimentary`;
  `POST /admin/users/:id/plan-override|stripe-resync`
- 🛠 `PATCH /admin/users/:id/ai-settings`
- 🛠 `POST /admin/users/:id/reconcile/preview|reconcile`, `GET …/reconcile/history`
- 🛠 `GET /admin/users/:id/exit-config`, `PUT|DELETE …/exit-config[/:exchange]`
- 🛠 analytics/telemetry: `adminAnalytics`, `adminExecutionMetrics`,
  `adminExecutionFunnel`, `adminAiUsage`, `adminTopTelemetry`,
  `adminBackfillStatus`, `adminRiskEvents`, `adminUserExchangeVisibility`

### System / mobile / health
- 🔓 `GET /healthz`, `/livez`, `/system/verification`, `/settings`,
  `GET /download/*`, `GET /platform/*`
- 🛠 `PUT /settings`, `POST /settings/kill-switch`
- mobile: `GET /mobile/ping|status|portfolio|positions|signals|tickers|symbols|
  risk|platform|live-trading/eligibility`; `POST /mobile/push/register|
  exchange/select|kill|telemetry`

---

## 4. Database Schema Modules (`lib/db/src/schema/`)

| Module file                  | Table                       | Domain                |
| ---------------------------- | --------------------------- | --------------------- |
| `users.ts`                   | `users`                     | identity, role, is_internal_account |
| `userSessions.ts`            | `user_sessions`             | session tracking/revoke |
| `userAdminActions.ts`        | `user_admin_actions`        | operator audit        |
| `userAdminStatus.ts`         | `user_admin_status`         | account status        |
| `auditLog.ts`                | `audit_log`                 | compliance audit      |
| `userConsents.ts`            | `user_consents`             | consent/disclaimer    |
| `settings.ts`                | `settings`                  | global engine settings |
| `userSettings.ts`            | `user_settings`             | per-user engine config |
| `simAccounts.ts`             | `sim_accounts`              | account ledger        |
| `simPositions.ts`            | `sim_positions`             | open positions (paper+live) |
| `simTrades.ts`               | `sim_trades`                | closed-trade history  |
| `trades.ts`                  | `trades`                    | global trade book (cap source) |
| `signals.ts`                 | `signals`                   | generated signals     |
| `accountReconciliations.ts`  | `account_reconciliations`   | reconcile audit       |
| `userExchangeConnections.ts` | `user_exchange_connections` | encrypted keys        |
| `userExchangeSettings.ts`    | `user_exchange_settings`    | per-exchange overrides |
| `userExchangeVisibility.ts`  | `user_exchange_visibility`  | presentational        |
| `userRiskSettings.ts`        | `user_risk_settings`        | per-user risk         |
| `riskThrottleEvents.ts`      | `risk_throttle_events`      | risk telemetry        |
| `userTradeLimits.ts`         | `user_trade_limits`         | daily/concurrent limits |
| `creditTransactions.ts`      | `credit_transactions`       | credit ledger         |
| `userCredits.ts`             | `user_credits`              | credit balance        |
| `performanceFees.ts`         | `performance_fees`          | profitable-trade fees |
| `processedStripeEvents.ts`   | `processed_stripe_events`   | webhook idempotency   |
| `userNotifications.ts`       | `user_notifications`        | in-app notifications  |
| `userPushTokens.ts`          | `user_push_tokens`          | Web Push subscriptions |
| `logs.ts`                    | `logs`                      | structured app logs   |

`index.ts` re-exports all tables. Some tables use the `pgTable(name, cols, extra)`
3-arg form for indexes (`risk_throttle_events`, `user_exchange_connections`,
`user_exchange_settings`).

> Drizzle uses explicit column lists; a prod column missing vs dev breaks both
> reads and writes for that table. Prod schema changes = manual ALTER against
> `RENDER_PROD_DATABASE_URL` (dev `drizzle-kit push` never reaches prod).

---

## 5. Trading Engine Files

- **Loop & signal generation:** `lib/tradingLoop.ts` (EMA+RSI, MTF 5m/15m/1H
  funnel, volume/sideways/trend filters, `runHardStopMonitor` LIVE exits),
  `lib/indicators.ts`, `lib/trading.ts`, `services/ai/ConfidenceScorer.ts`,
  `services/ai/RegimeClassifier.ts`.
- **Per-user state:** `lib/userSimRegistry.ts` (`Map<userId, UserSimState>`,
  zombie reconcile), `services/users/UserEngineRegistry.ts`, `lib/positionStore.ts`,
  `lib/simulationEngine.ts`.
- **Live execution path:** `lib/liveUserExecution.ts` (customer gate stack 0UNI →
  0SYM → 0TREND → 0c → risk → 0ALLOC; `getUserBrokerBaseBalance`),
  `lib/executionGateway.ts`, `services/queue/ExecutionQueue.ts`,
  `lib/multiExchangeParallel.ts`, `lib/operatorEngineOwner.ts`,
  `lib/exchangeEngine.ts`.
- **Exits & stops:** `lib/exitConfig.ts` (SL 2% / TP 10% / trail 5% / max-hold 24h),
  `lib/trailingStopEngine.ts` (paper-only), `lib/killSwitch.ts`.
- **Risk & limits:** `lib/riskEngine.ts`, `lib/riskGate.ts`,
  `lib/liquidityGuard.ts`, `lib/tradeLimitEngine.ts`, `lib/tierLimits.ts`,
  `lib/symbolPolicy.ts`, `lib/symbolCategories.ts`,
  `services/risk/{EnterpriseRiskEngine,CircuitBreaker,DrawdownProtection}.ts`.
- **Telemetry:** `lib/signalFunnel.ts`, `lib/executionFunnel.ts`,
  `lib/executionStreamBus.ts`, `lib/executionTelemetry.ts`,
  `lib/customerExecMetrics.ts`, `lib/customerExecutionAttribution.ts`,
  `services/telemetry/{ExecutionTelemetry,AuditLogger}.ts`.
- **Config presets:** `lib/tradingModePresets.ts` (conservative/balanced/aggressive).

---

## 6. Stripe Integration Files

- `src/app.ts` — `POST /api/stripe/webhook` mounted with `express.raw` BEFORE
  `express.json()`; emits `[STRIPE_WEBHOOK_DIAG]` / `[STRIPE_WEBHOOK_DIAG2]`.
- `src/webhookHandlers.ts` — `maybeHandleCreditEvent` (credit_topup /
  outstanding_payment branch, swallows errors) + `WebhookHandlers.processWebhook`
  (Buffer guard + stripe-replit-sync throwing path).
- `src/stripeClient.ts` — `getUncachableStripeClient`, `getStripeSync`
  (env-only in prod; DB fallback gated non-prod), `describeWebhookSecret` /
  `describeSecretValue` (first6/last4/rawLength/trimChangesLength diagnostics).
- `src/routes/billing.ts` — checkout, portal, subscription, plans, wallet, topup,
  pay_outstanding.
- `src/lib/billingEnforcement.ts` — billing-hold evaluation + 72h restore grace.
- `src/lib/adminBillingActions.ts` — `forceRestoreBilling`, `waiveAllPendingFees`
  (super-admin).
- `src/lib/feeLedger.ts`, `lib/fees` (workspace lib) — performance-fee labels/logic.
- `src/lib/customerAppUrl.ts` — Stripe return-URL resolution (anti-spoof).
- Schema: `processed_stripe_events` (idempotency), `performance_fees`,
  `credit_transactions`, `user_credits`.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_PRICE_{STARTER,PRO,ELITE}_MONTHLY`, `STRIPE_PRICE_{STARTER,PRO}_LEGACY`.

---

## 7. Coinbase Integration Files

- `src/services/exchanges/adapters/CoinbaseAdapter.ts` — Coinbase adapter
  (`getTicker`/`getAccount`/`executeOrder`, `normaliseSymbol`, product-spec
  validation: precision/min-size/min-notional/tradability).
- `src/services/exchanges/adapterFactory.ts` — `makeAdapter` factory.
- `src/services/exchanges/ExchangeRegistry.ts` + `catalog.ts` — `EXCHANGE_CATALOG`
  (Coinbase entry; supported scopes read+trade, withdrawal always false).
- `src/services/exchanges/ExchangeHealthMonitor.ts` — balance-poll health.
- `src/services/vault/CredentialVault.ts` — AES-256-GCM key decrypt per call.
- `src/lib/exchangeEngine.ts` — operator boot priority (Kraken → **Coinbase** →
  CryptoDotCom → Binance → Gemini → Alpaca).
- `src/lib/liveUserExecution.ts` — customer routing + `getUserBrokerBaseBalance`
  (uses the Coinbase adapter for balance verification).
- Universe constraint: `COINBASE_SYMBOLS` (gate 0UNI `symbol_not_in_universe`).
- Env: `COINBASE_API_KEY`, `COINBASE_API_SECRET`.
- Known nuance: tradable vs funded portfolio mismatch (`retail_portfolio_id`
  omitted) → INSUFFICIENT_FUND while equity reads fine.

### Full exchange adapter inventory (`services/exchanges/adapters/`)
Alpaca, Binance, BingX, Bitget, Bitstamp, BloFin, **Coinbase**, CryptoDotCom,
dYdX, GateIO, Gemini, HTX, Hyperliquid (+ `HyperliquidSigning`), **Kraken**,
MEXC, Phemex. (`BaseExchangeAdapter` is the shared base.)

---

## 8. Deployment Architecture Files

- `render.yaml` — Render services (`aicandlez-trade`, `aicandlez-admintrade`,
  `aicandlez-dashboard`, api) + response headers + canonical build env. Prod SoT.
- `DEPLOYMENT.md` — domains, DNS, SSL, Clerk prod swap, push, Render + Replit
  deploy, migrations, checklist.
- `.env.production.example` — required prod env template.
- `scripts/src/build-export-zip.py` (run via `python3 scripts/build-export-zip.py`)
  → `artifacts/trading-dashboard/public/aicandlez-production.zip`.
- `scripts` guards: `check-no-bare-api-fetch` (authFetch invariant).
- Per-artifact `.replit-artifact/artifact.toml` — proxy path routing
  (`/api`, `/`, `/dashboard`, `/aicandlez-app`, …).
- Transport: `artifacts/{trading-dashboard,aicandlez-app}/src/lib/authFetch.ts`
  (cross-origin `/api` routing + Bearer fallback + `ApiContractError`).

### Production domain → service map
| Domain                       | Serves                               | Default |
| ---------------------------- | ------------------------------------ | ------- |
| `aicandlez.com`              | landing                              | —       |
| `app.aicandlez.com`          | PWA (`aicandlez-app` static)         | mobile  |
| `trade.aicandlez.com`        | customer portal (dashboard static)   | `/portal` |
| `admintrade.aicandlez.com`   | admin portal (separate Render svc)   | `/command` |
| `api.aicandlez.com`          | API server                           | —       |
| `dashboard.aicandlez.com`    | legacy (being retired)               | —       |

**Deploy mechanism:** Render autoDeploy on `origin/main` push. Verify via prod DB
(`RENDER_PROD_DATABASE_URL`) + public `GET /api/engine/status`. Render stdout is
not reachable from Replit tooling.

---

*End of file & route reference.*
