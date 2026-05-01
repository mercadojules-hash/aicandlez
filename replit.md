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

## Artifacts

### trading-dashboard (React + Vite @ /)
Hybrid AI crypto trading dashboard — 18 modules, all active. Kraken exchange, BTCUSD/ETHUSD/SOLUSD, 1m–1h timeframes.

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
17. Signal Debug — MTF funnel tracker, per-symbol indicator breakdown, test mode toggle, last-10 signal log at `/debug`
18. Multi-Asset Chart — BTC/ETH/SOL charts side-by-side, EMA9/21 trend lines, volume overlay, flexible asset config + custom symbol add at `/charts`

**Key files:**
- `src/pages/` — one file per module
- `src/components/Layout.tsx` — MODULE_LIST sidebar
- `src/App.tsx` — all routes

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
