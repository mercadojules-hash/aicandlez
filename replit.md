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

**Export ZIP** (`/apex-trader-final-export-v1.zip`):
- Served from `trading-dashboard/public/`
- Contains: `README.md` (full feature guide, API reference, arch diagram), `.env.example`, `SETUP.md` (quick-start checklist)
- Download link in sidebar footer (desktop + mobile)

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
