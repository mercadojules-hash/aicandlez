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

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
