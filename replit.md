# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Replit-managed Clerk (httpOnly cookie on web, Bearer for mobile)

## Phase 4 — Production Deployment Foundation (COMPLETE)

### Push Notification Infrastructure
- **VAPID keys** generated and stored as shared env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`)
- **Service worker** at `artifacts/apex-trader-app/public/sw.js` — handles push events, notification click with action buttons, OS-native display with urgency levels
- **`usePushNotifications` hook** at `artifacts/apex-trader-app/src/hooks/usePushNotifications.ts` — Web Push subscription registration, SW auto-register on sign-in, graceful `unsupported` fallback
- **`SwRegistrar` component** wired into `apex-trader-app/App.tsx` Shell — registers SW and subscribes to push automatically when user signs in
- **`NotificationDispatcher`** at `artifacts/api-server/src/services/notifications/NotificationDispatcher.ts` — VAPID web push sender, expired subscription cleanup, `signalAlert` + `tradeAlert` helpers
- **Offline push fallback** in `wsServer.ts` — if user has no active WS connection, `broadcastNotification` now triggers a push notification instead of silently dropping it
- **`POST /api/user/notify`** — auth-gated route to dispatch test push notifications to signed-in user
- **`web-push` + `@types/web-push`** installed on `api-server`

### Desktop Terminal (Module 20)
- New page `artifacts/trading-dashboard/src/pages/DesktopTerminal.tsx` at `/desktop`
- Power-user multi-panel layout: live ticker bar (BTC/ETH/SOL), Signal Feed widget, Position Monitor, AI Brief, Risk Monitor, Event Log
- Each widget has maximize/minimize toggle for focus mode
- WebSocket hook for real-time signal delivery; polls all data sources every 30s
- Added to `MODULE_LIST` as module 20 (`Monitor` icon, SYS group) in sidebar
- Auth-protected route in trading-dashboard App.tsx

### Production Deployment Architecture
- **`DEPLOYMENT.md`** — complete domain map, DNS records, SSL config, Clerk production setup, push notification setup, Render deploy, Replit deploy, database migrations, pre-deploy checklist, post-deploy verification
- **`.env.production.example`** — all env vars for all four services (api-server, trading-dashboard, apex-trader-app, landing)
- **`render.yaml`** — updated with AICandlez branding, 4 services (aicandlez-api, aicandlez-dashboard, aicandlez-app, aicandlez-landing), VAPID env var placeholders, all exchange API keys, security headers
- **CORS** — already locked to `aicandlez.com`, `app.aicandlez.com`, `api.aicandlez.com`

### Production Readiness Audit (T005)
- Zero remaining "Apex Trader" / "apexdigital" visible text across all TypeScript/TSX source files
- Download route: `apex-trader-production.zip` → `aicandlez-production.zip`
- Sidebar download link: `apex-trader-operator-console-v5.zip` → `aicandlez-operator-console-v5.zip`
- All three typechecks pass: `api-server`, `trading-dashboard`, `apex-trader-app`

**Key files (Phase 4):**
- `artifacts/apex-trader-app/public/sw.js` — Web Push service worker
- `artifacts/apex-trader-app/src/hooks/usePushNotifications.ts` — push subscription hook
- `artifacts/api-server/src/services/notifications/NotificationDispatcher.ts` — VAPID push sender
- `artifacts/api-server/src/routes/internalNotify.ts` — `POST /api/user/notify` test route
- `artifacts/api-server/src/lib/wsServer.ts` — offline push fallback in `broadcastNotification`
- `artifacts/trading-dashboard/src/pages/DesktopTerminal.tsx` — Module 20 power-user page
- `DEPLOYMENT.md` — full production deployment guide
- `.env.production.example` — production env var template
- `render.yaml` — updated multi-service deploy config

## Phase 3 — Exchange Connection Management (COMPLETE)

Each user can connect their own exchange accounts with encrypted API key storage.

**New DB Table:** `user_exchange_connections`
- `id`, `userId` (FK → users), `exchange`, `label`
- `encrypted_blob` — AES-256-GCM encrypted JSON `{ iv, authTag, ciphertext }` — raw keys never stored in plaintext
- `status` (active/error/revoked), `is_default`, `trading_mode` (paper/live default)
- `permissions` JSONB `{ read, trade, withdraw: false }` — withdraw is always false
- `last_verified_at`, `last_error`, `created_at`, `updated_at`

**Credential Vault (upgraded):**
- Added `encryptBlob(userId, creds)` → produces JSON string for DB storage
- Added `decryptBlob(userId, blob)` → decrypts stored blob back to credentials (in-memory only)
- Per-user PBKDF2 key derivation (100k iterations, SHA-256) — each user's data is keyed differently
- Credentials never logged, never returned in API responses

**New API Routes (all requireAuth — userId from Clerk session):**
- `GET /api/user/exchanges` — list all 6 supported exchanges + per-exchange connection status/metadata (safe: no keys)
- `POST /api/user/exchanges/connect` — validate, test connection, encrypt, persist. Rejects bad credentials before storage.
- `POST /api/user/exchanges/:exchange/test` — re-test a stored connection, update health + permissions
- `POST /api/user/exchanges/:exchange/default` — set as user's default exchange
- `POST /api/user/exchanges/:exchange/mode` — switch paper/live; live requires `acknowledged: true`
- `DELETE /api/user/exchanges/:exchange` — permanently delete encrypted credentials

**Connection test flow:**
1. Validate input (required fields, format, passphrase for OKX/KuCoin)
2. Instantiate ephemeral adapter with user's credentials (not global registry)
3. `getTicker("BTCUSD")` — public network check
4. `getAccount()` — private auth check → if succeeds, permissions `{ read: true, trade: true, withdraw: false }`
5. Store ONLY on success — invalid credentials are rejected before any DB write

**Safety enforcement:**
- Live mode default: OFF (paper only by default)
- Live mode switch requires `acknowledged: true` in request body
- Withdrawal permissions: never tested, never requested, always set to `false`
- Confirmation dialog required in UI before enabling live mode or disconnecting

**Supported exchanges:** Kraken, Binance, Coinbase, Bybit, OKX, KuCoin
- Each has `requiredPerms` and `warnings` metadata shown in connect wizard
- OKX + KuCoin require passphrase (enforced at validation)

**Frontend (Settings.tsx):**
- New "EXCHANGE CONNECTIONS" section at top of `/settings` page
- 6 exchange cards — each shows: status badge, READ/TRADE permissions, last verified timestamp, paper/live toggle
- Connect button → `ConnectModal` with: label, API key (masked), API secret (masked), passphrase (if needed), safety warnings, withdrawal acknowledgement checkbox
- Test / Set Default / Disconnect buttons per connected exchange
- Global safety banner: "WITHDRAWAL PERMISSIONS ARE NEVER REQUESTED"

**Key files:**
- `lib/db/src/schema/userExchangeConnections.ts` — DB schema
- `artifacts/api-server/src/services/vault/CredentialVault.ts` — added `encryptBlob`, `decryptBlob`
- `artifacts/api-server/src/routes/userExchanges.ts` — all 5 auth-gated routes
- `artifacts/trading-dashboard/src/pages/Settings.tsx` — exchange connections section

## Phase 2 — User-Scoped Trading Platform (COMPLETE)

Each authenticated user has a fully isolated trading environment. No data bleeds between accounts.

**DB Tables (5 new):**
- `user_settings` — per-user AI personality, risk profile, filters, notification prefs, preferences
- `sim_accounts` — per-user simulation balance (starts at $100,000)
- `sim_positions` — per-user open positions (indexed by userId)
- `sim_trades` — per-user closed trade history (indexed by userId)
- `user_notifications` — per-user alert inbox (indexed by userId + read status)

**Engine Architecture:**
- Global trading loop stays shared (market signals are identical for all users)
- `lib/userSimRegistry.ts` — `Map<userId, UserSimState>` with lazy DB-load on first request and immediate DB persistence on every mutation
- All simulation API routes are now `requireAuth`-gated and use `userSimRegistry` instead of the global `simulationEngine`
- Existing `simulationEngine.ts` remains for trading loop test mode (pipeline verification only)

**New API Routes (all require auth):**
- `GET /api/user/settings` — get or create user settings (JIT provisioning)
- `PUT /api/user/settings` — update any subset of user settings
- `GET /api/user/notifications` — list notifications (newest first, limit 50) + unread count
- `POST /api/user/notifications/read-all` — mark all as read
- `POST /api/user/notifications/:id/read` — mark single notification as read
- `GET /api/account`, `GET /api/simulation/account` — user-scoped sim account
- `GET /api/simulation/trades` — user-scoped trade history
- `POST /api/simulation/order` — place order in user's account
- `POST /api/simulation/close/:positionId` — close user's position
- `POST /api/simulation/reset` — reset user's $100k account

**New Frontend:**
- `src/pages/Settings.tsx` — full account settings page at `/settings` (auth-protected)
  - AI Configuration: personality selector (Conservative/Balanced/Aggressive), confidence threshold
  - Risk Management: position size, max trades/day, max active positions, stop loss, take profit, auto mode
  - Signal Filters: volume confirmation, 1H trend alignment, preferred exchange
  - Notifications: trade exec, signal alerts, risk alerts (all per-user toggles)
  - Preferences: timezone, display currency
- Settings gear icon added to UserBlock in sidebar (next to sign-out button)
- `/settings` route added and protected

**Key files:**
- `lib/db/src/schema/userSettings.ts`, `simAccounts.ts`, `simPositions.ts`, `simTrades.ts`, `userNotifications.ts`
- `artifacts/api-server/src/lib/userSimRegistry.ts`
- `artifacts/api-server/src/routes/userSettings.ts`, `userNotifications.ts`
- `artifacts/trading-dashboard/src/pages/Settings.tsx`

## Authentication (Phase 1 — COMPLETE)

Clerk is fully integrated. Provisioned app: `app_3DeE2sfuhHWTY73M9jlbRCKabFx`.

**Routing:**
- `/` — Public landing page (unauthenticated) → redirects signed-in users to `/command`
- `/sign-in/*?` — Clerk sign-in (email + Google OAuth)
- `/sign-up/*?` — Clerk sign-up
- All dashboard routes (`/command`, `/market`, `/ai`, etc.) — protected; redirect to `/sign-in` when unauthenticated

**Server:**
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — Clerk FAPI proxy (production only)
- `artifacts/api-server/src/middlewares/requireAuth.ts` — `requireAuth` + `requireRole` middleware
- `artifacts/api-server/src/routes/auth.ts` — `GET /api/auth/me` (JIT user provisioning), `PUT /api/auth/profile`
- `app.ts` mounts: `clerkProxyMiddleware` (before body parsers) → `clerkMiddleware` (after)

**DB schema:** `lib/db/src/schema/users.ts` — `users` table (clerkUserId, email, role: user/admin/super-admin)

**Frontend:**
- `src/App.tsx` — `ClerkProvider` wrapping all routes, `ClerkQueryClientCacheInvalidator`
- `src/components/Layout.tsx` — `UserBlock` shows real user name/email, sign-out button via `useUser` + `useClerk`
- `src/pages/Landing.tsx` — branded public landing page
- Clerk appearance: dark terminal theme (#050D1A card, #00aaff primary, monospace font, Apex Trader logo)
- `public/logo.svg` — branded SVG logo shown in Clerk UI
- CSS: `@layer theme, base, clerk, components, utilities` (Tailwind v4 + Clerk layer)
- `vite.config.ts`: `tailwindcss({ optimize: false })` (prevents prod CSS layer reordering)

**Env vars (auto-provisioned):** `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`

## Artifacts

### trading-dashboard (React + Vite @ /)
Hybrid AI crypto trading dashboard — 19 modules, all active. Kraken exchange, BTCUSD/ETHUSD/SOLUSD, 1m–1h timeframes.

**Modules:**
1. Dashboard — system shell, roadmap, health cards
2. Market Data — live Kraken candle feed
3. Indicators — EMA, RSI, candlestick rendering
4. AI Reasoning — EMA+RSI signal engine, BUY/SELL/HOLD with confidence
5. Risk Management — position sizing, kill switch, daily loss limit, trade cap
6. Simulation — paper trading with risk gate enforcement, auto-journal logging
7. Backtesting — historical walk-forward simulation
8. Strategy Optimizer — grid search over EMA/RSI parameters
9. Asset Scanner — multi-symbol opportunity ranking
10. Portfolio — allocation & exposure tracking
11. Correlation — BTC/ETH/SOL correlation matrix, trailing stops
12. Trade Journal — scored trade feedback (0–100), win rate, insights
13. Validation — walk-forward 4-window OOS 70/30, overfitting grade A–F, live lock gate
14. Sentiment AI — news scoring –100 to +100, Fear & Greed index, AI confidence ±5–20%
15. Exchange — Kraken integration, SIMULATION (default) / LIVE mode, kill switch, pause, risk-gated order execution, no withdrawals
16. System Verification — full engine health check panel, 10 subsystems, auto-refresh at `/syscheck`
17. Signal Debug — MTF funnel tracker, per-symbol indicator breakdown, test mode toggle, last-10 signal log, **signal quality filter toggles** (volume + 1H trend), **mini 5m sparkline charts** with VOL/MARKET/1H badges at `/debug`
18. Multi-Asset Chart — BTC/ETH/SOL charts side-by-side, EMA9/21 trend lines, volume overlay, flexible asset config + custom symbol add at `/charts`
19. Command Center — unified one-screen view: 3 mini charts + signal summary + AI brief + active trades + risk status. Fully responsive (desktop/tablet/mobile) at `/command`

**Asset Scanner** (`/scanner`): Now includes **15m mini sparkline charts** (60 candles, colored by trend) on each asset card.

**Signal quality filters** (v1.0.0 final):
- **Volume confirmation** — current 5m volume must be ≥ 85% of 20-bar rolling average (default: ON)
- **Sideways filter** — blocks trades when EMA9/EMA21 spread < 0.15% on both TFs (always active)
- **1H trend alignment** — optional: requires 1H EMA9 to align with signal direction (default: OFF, toggleable in Signal Debug)
- Default `minConfidence` changed from 70 to **60**
- New API: `POST /api/engine/filters` — `{ volumeFilter: boolean, require1HTrend: boolean }`
- New engine status fields: `volumeFilter`, `require1HTrend`, `symbolBreakdowns[*].volumeConfirmed`, `.marketCondition`, `.trend1H`

**Export ZIP** (`/apex-trader-v2.zip`):
- Served from `trading-dashboard/public/` — 303 files, ~587 KB
- Contains: all source (`api-server/src`, `trading-dashboard/src`), all `lib/` packages, `scripts/`, root configs, `.env.example`, `SETUP.md`
- Excludes: `node_modules/`, `dist/`, `.git/`, other artifacts (natura-ai, natura-web)
- Download link in sidebar footer (desktop only)
- Rebuild: `python3 scripts/build-export-zip.py` from workspace root

**Global components (App-level):**
- `AlertsProvider.tsx` — polls engine every 8s, shows toast alerts for BUY/SELL signals + trade executions. Sound toggle (Web Audio API). Deduplication via signal ID set.
- `SettingsDrawer.tsx` — floating gear icon (fixed bottom-right), slide-up drawer on mobile / popover on desktop. Controls: maxTradesPerDay, position size, min confidence, stop loss, take profit, auto-mode toggle. Persists to localStorage + syncs with `PUT /api/settings`.

**Auth note:** Dashboard path moved from `/` to `/dashboard` in MODULE_LIST (home route `/` is now the public landing page). All 19 module routes remain unchanged.

**Key files:**
- `src/pages/` — one file per module
- `src/pages/Landing.tsx` — public landing page (unauthenticated home)
- `src/pages/auth/SignInPage.tsx`, `SignUpPage.tsx` — Clerk auth pages
- `src/components/Layout.tsx` — MODULE_LIST sidebar + UserBlock (real user)
- `src/App.tsx` — ClerkProvider + all routes

### api-server (Express @ /api)
Shared backend for all trading operations.

**Key routes:**
- `/api/exchange/*` — exchange engine (status, orders, preview, execute, kill, pause, mode, balances)
- `/api/sentiment/*` — sentiment scoring, news feed
- `/api/validation/*` — walk-forward validation engine
- `/api/journal/*` — trade journal & scoring
- `/api/simulation/*` — paper trading engine
- `/api/signals/*`, `/api/candles/*`, `/api/backtest/*`

**Key lib files:**
- `src/lib/exchangeEngine.ts` — Kraken REST + HMAC-SHA512 signing, order execution, simulation balances
- `src/lib/sentimentEngine.ts` — deterministic 5-min bucketed headline scoring
- `src/lib/validationEngine.ts` — walk-forward OOS, overfitting detection
- `src/lib/riskEngine.ts` — position limits, kill switch, daily PnL tracking
- `src/lib/backtestEngine.ts` — EMA+RSI strategy, simulateOnCandles

**Exchange secrets (for LIVE mode):**
- `KRAKEN_API_KEY` — Kraken private API key
- `KRAKEN_API_SECRET` — Kraken private API secret (base64)
- `EXCHANGE_LIVE_ENABLED=true` — must be explicitly set to unlock LIVE mode

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally

### natura-ai (Expo/React Native @ /natura-ai)
Mobile-first AI-powered holistic wellness app.

**Features:**
- Onboarding flow: Welcome → Disclaimer acceptance → Goal selection → Dietary preferences
- AI Chat: Mock AI with keyword-based wellness responses for stress/sleep/digestion/energy/immunity
- Wellness Plans: Curated multi-day plans with day-by-day activities, teas, foods, supplements
- Remedy Guides: Step-by-step guided mode for herbal remedies
- Recipes: Filter by goal, add ingredients to grocery list
- Daily Routine Tracker: Checklist with morning/afternoon/evening tasks, progress bar, streaks
- Grocery List: Accumulate ingredients from recipes/plans, check-off and clear
- Saved Items: Bookmark remedies, plans, and recipes
- Daily Check-In: Energy/stress/sleep scale, streak tracking
- Profile: Stats, dietary prefs, allergies, reset onboarding

**Design:** Light only — warm cream (#F8F6F0), forest green primary (#3D7A45), Inter font, radius 16
**State:** AsyncStorage only (no backend) — UserContext + WellnessContext
**AI:** Mock keyword-based responses in `lib/ai.ts` — no API key needed

**Routes:** `/onboarding/*`, `/(tabs)` (Home, Ask AI, Plans, Recipes, Profile), `/remedy/[id]`, `/plan/[id]`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
