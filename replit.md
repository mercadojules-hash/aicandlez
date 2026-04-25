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
AI-assisted crypto trading dashboard with TradingView-style dark UI.

**Features:**
- Live candlestick chart (lightweight-charts v5) with symbol/timeframe selector
- AI signal panel (BUY/SELL/HOLD, confidence %, trend, reasoning, indicators)
- Mode 2 auto-execution engine with strict rules (confidence, trend, allocation, daily limit)
- Risk controls (allocation, stop loss, take profit, max trades/day, min confidence)
- Kill switch (halts all trading instantly)
- Portfolio panel (balance, PnL, win rate, open positions)
- Trade history with close buttons
- Backtest mode (historical simulation, win rate, profit %)
- Activity log (signal + trade events, color-coded by level)
- Binance integration ready (disabled by default)

**Routes:** `/` (dashboard), `/backtest`, `/logs`

### api-server (Express @ /api)
Shared backend for trading operations.

**Routes:** `/api/signals/*`, `/api/trades/*`, `/api/portfolio`, `/api/dashboard/summary`, `/api/settings`, `/api/settings/kill-switch`, `/api/logs`, `/api/backtest/run`, `/api/candles`

## DB Schema

- `signals` - AI signal history (symbol, timeframe, action, confidence, trend, indicators)
- `trades` - Trade history (symbol, side, amount, price, exit_price, pnl, status, mode)
- `settings` - Risk control settings (allocation, SL/TP %, max trades, auto mode, kill switch)
- `logs` - Activity log (type, level, message, details)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Binance Integration (Ready but Disabled)
- `binanceApiKey` and `binanceApiSecret` stored in settings table
- `liveTrading` defaults to `false` — all trades simulated
- To enable: implement `executeTrade(symbol, side, amount)` in `artifacts/api-server/src/lib/trading.ts` using `binance-api-node`

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
