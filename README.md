# Apex Trader — AI Crypto Trading Dashboard

A full-stack hybrid AI trading dashboard for BTC, ETH, and SOL with real-time signals,
multi-timeframe analysis, risk controls, portfolio tracking, and strategy backtesting.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 7 + Wouter + TanStack Query + Recharts |
| Backend | Express 5 + Pino + esbuild |
| Database | PostgreSQL + Drizzle ORM |
| Monorepo | pnpm workspaces |
| Type safety | TypeScript 5.9 + Zod + OpenAPI codegen |

## Quick Start

See [SETUP.md](./SETUP.md) for the full local development guide.

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Start both services in parallel
pnpm run dev:all
```

Then open:
- **Dashboard** → http://localhost:5173
- **API** → http://localhost:8080/api/healthz

## Features

- **Live Signal Engine** — multi-timeframe (5m + 15m) BUY/SELL/HOLD signals via Kraken public API
- **Signal Quality Filters** — volume confirmation gate, sideways-market filter, 1H trend alignment
- **Asset Scanner** — real-time 3-asset overview with mini sparkline charts
- **Signal Debug** — per-symbol breakdown with quality badges and filter toggles
- **Portfolio Panel** — P&L tracking, open positions, trade history
- **Risk Controls** — kill switch, max drawdown, position size, daily loss limit
- **Strategy Backtester** — replay historical candles against the signal engine
- **Strategy Optimizer** — grid-search over parameter space
- **Logs Viewer** — live server log stream

## Project Structure

```
apex-trader/
├── artifacts/
│   ├── api-server/        Express API + trading engine (19 modules)
│   └── trading-dashboard/ React frontend (11 pages, 30+ components)
├── lib/
│   ├── api-client-react/  TanStack Query hooks (generated)
│   ├── api-spec/          OpenAPI spec + Orval config
│   ├── api-zod/           Zod validation schemas (generated)
│   └── db/                Drizzle ORM schema + migrations
├── scripts/               Shared utility scripts
├── package.json           Root task orchestration
└── pnpm-workspace.yaml    Workspace config + dependency catalog
```

## Scripts

| Command | Description |
|---|---|
| `pnpm run dev:all` | Start API + frontend in parallel |
| `pnpm run dev` | Frontend only (port 5173) |
| `pnpm run dev:api` | Backend only (port 8080) |
| `pnpm run build` | Production build of frontend |
| `pnpm run typecheck` | Full TypeScript check across all packages |

## Environment Variables

See [.env.example](./.env.example) for all variables. Only `DATABASE_URL` enables
full persistence — the app runs in degraded (mock) mode without it.
