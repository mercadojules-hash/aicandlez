# AICandlez — AI Crypto Trading Platform v1.0.0

Institutional-grade Bloomberg/Palantir/Hyperliquid-style AI crypto trading platform.  
Built on a pnpm monorepo with React + Vite frontend, Express 5 backend, PostgreSQL, and a full exchange adapter layer supporting 6 exchanges.

---

## Architecture Overview

```
ai-trader-platform/
├── artifacts/
│   ├── trading-dashboard/     # React + Vite frontend  (served at /)
│   └── api-server/            # Express 5 backend      (served at /api)
├── lib/
│   ├── api-client-react/      # TanStack Query hooks (generated)
│   ├── api-spec/              # OpenAPI spec + Orval config
│   ├── api-zod/               # Zod validation schemas (generated)
│   └── db/                    # Drizzle ORM schema + migrations
├── scripts/                   # Utility scripts
├── pnpm-workspace.yaml        # Workspace config + catalog pins
├── tsconfig.base.json         # Shared TS strict defaults
└── tsconfig.json              # Solution file for composite libs
```

---

## Dashboard Modules (19 Total)

| Module | Route | Description |
|--------|-------|-------------|
| Dashboard | `/` | System shell, roadmap, health cards |
| Market Data | `/market` | Live Kraken candle feed, real-time tickers |
| Indicators | `/indicators` | EMA, RSI, candlestick rendering |
| AI Reasoning | `/ai` | EMA+RSI signal engine, BUY/SELL/HOLD with confidence |
| Risk Management | `/risk` | Position sizing, kill switch, daily loss limit, trade cap |
| Simulation | `/simulation` | Paper trading with risk gate enforcement, auto-journal logging |
| Backtesting | `/backtest` | Historical walk-forward simulation |
| Strategy Optimizer | `/optimizer` | Grid search over EMA/RSI parameters |
| Asset Scanner | `/scanner` | Multi-symbol opportunity ranking + 15m sparkline charts |
| Portfolio | `/portfolio` | Allocation & exposure tracking |
| Correlation | `/correlation` | BTC/ETH/SOL correlation matrix, trailing stops |
| Trade Journal | `/journal` | Scored trade feedback (0–100), win rate, insights |
| Validation | `/validation` | Walk-forward 4-window OOS 70/30, overfitting grade A–F |
| Sentiment AI | `/sentiment` | News scoring –100 to +100, Fear & Greed index, AI confidence |
| Exchange | `/exchange` | Kraken integration, SIMULATION/LIVE mode, kill switch |
| System Verification | `/syscheck` | Full engine health check, 10 subsystems, auto-refresh |
| Signal Debug | `/debug` | MTF funnel tracker, per-symbol indicator breakdown, filter toggles |
| Multi-Asset Chart | `/charts` | BTC/ETH/SOL side-by-side, EMA9/21 trend lines, volume overlay |
| Command Center | `/command` | Unified one-screen view — responsive desktop/tablet/mobile |

---

## Backend Service Architecture

### Exchange Adapter Layer (Phase 1)
All adapters implement `BaseExchangeAdapter` and normalise exchange data into standard types.

| Exchange | Adapter | Required Env Keys | Notes |
|----------|---------|-------------------|-------|
| Kraken | `KrakenAdapter` | `KRAKEN_API_KEY`, `KRAKEN_API_SECRET` | Full REST + HMAC-SHA512 |
| Binance | `BinanceAdapter` | `BINANCE_API_KEY`, `BINANCE_API_SECRET` | V3 REST + HMAC-SHA256 |
| Coinbase | `CoinbaseAdapter` | `COINBASE_API_KEY`, `COINBASE_API_SECRET` | Advanced Trade REST |
| Bybit | `BybitAdapter` | `BYBIT_API_KEY`, `BYBIT_API_SECRET` | V5 Unified REST |
| OKX | `OKXAdapter` | `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_PASSPHRASE` | V5 REST |
| KuCoin | `KuCoinAdapter` | `KUCOIN_API_KEY`, `KUCOIN_API_SECRET`, `KUCOIN_PASSPHRASE` | V2 REST |

All adapters run in **simulation mode** when API keys are absent — no real orders placed.

### AI Engine (Phase 3)
| Component | Description |
|-----------|-------------|
| `RegimeClassifier` | 7-regime market classifier: TRENDING_UP/DOWN, RANGING, BREAKOUT, HIGH_VOL, LOW_VOL, UNKNOWN |
| `AIPersonality` | Conservative / Balanced / Aggressive profiles with regime filters and size caps |
| `ConfidenceScorer` | 6-factor pipeline: regime, volume, MTF alignment, RSI zones, drawdown, personality |
| `AIMemory` | Rolling 500-entry per-user trade memory with win-rate and degradation detection |

### Risk & Safety Systems (Phases 4–5)
| Component | Description |
|-----------|-------------|
| `CircuitBreaker` | CLOSED/OPEN/HALF_OPEN state machine with global registry |
| `EnterpriseRiskEngine` | 6 parallel checks: drawdown, exposure, concentration, volatility, correlation, breaker |
| `DrawdownProtection` | GREEN→YELLOW→ORANGE→RED levels with auto kill-switch at 6% drawdown |

### Infrastructure (Phases 6–7)
| Component | Description |
|-----------|-------------|
| `CredentialVault` | AES-256-GCM per-user encrypted credential store (PBKDF2 key derivation) |
| `ExecutionTelemetry` | Signal-to-fill latency tracking, p50/p95 percentiles, slippage, rejection rates |
| `AuditLogger` | Append-only SHA-256-hashed audit trail for 19 event types |
| `ExecutionQueue` | Priority queue (CRITICAL→LOW) with concurrency control and exponential backoff |

### Multi-Tenant User Layer (Phase 2)
| Component | Description |
|-----------|-------------|
| `UserSession` | Session model with 4 subscription tiers (free/starter/pro/enterprise) |
| `UserEngineRegistry` | Isolated per-user engine state with global kill and daily PnL reset |

---

## API Reference

### Standard Routes

| Prefix | Description |
|--------|-------------|
| `GET /api/healthz` | Health check |
| `GET/POST /api/exchange/*` | Exchange engine control |
| `GET /api/signals` | Signal feed |
| `GET /api/candles` | OHLCV data |
| `GET/POST /api/simulation/*` | Paper trading |
| `POST /api/backtest` | Historical backtest |
| `GET /api/sentiment/*` | Sentiment scores + news |
| `GET/POST /api/validation/*` | Walk-forward validation |
| `GET/POST /api/journal/*` | Trade journal |
| `GET /api/scanner` | Asset scanner |
| `GET/POST /api/risk/*` | Risk engine |
| `GET/POST /api/engine/*` | Engine control + filters |
| `GET /api/system/health` | System verification |
| `GET /api/fees` | Fee calculator |

### Mobile API  `/api/mobile/*`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ping` | Health ping |
| GET | `/status` | Engine + risk snapshot |
| GET | `/portfolio` | Balances + positions |
| GET | `/positions` | Open positions list |
| GET | `/signals` | Last 10 signals + funnel stats |
| GET | `/symbols` | Per-symbol signal cards |
| GET | `/risk` | Risk status + circuit breakers |
| GET | `/platform` | Platform-wide engine/drawdown stats |
| POST | `/push/register` | Push notification registration |
| POST | `/exchange/select` | Switch active exchange |
| POST | `/kill` | Emergency kill switch |
| POST | `/telemetry` | App usage telemetry |

### Adapter Management API  `/api/adapters/*`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all registered adapters |
| GET | `/health` | Full health + circuit breakers + vault stats |
| GET | `/:exchange/health` | Individual adapter health |
| POST | `/active` | Set active adapter |
| GET | `/ticker/:symbol` | Live ticker via active adapter |
| GET | `/orderbook/:symbol` | Order book via active adapter |
| GET | `/account` | Account snapshot |
| GET | `/breakers` | Circuit breaker status |
| POST | `/breakers/:name/reset` | Manual breaker reset |
| POST | `/breakers/:name/trip` | Manual breaker trip |
| POST | `/vault/store` | Store encrypted credentials |
| GET | `/vault/:userId/connections` | List connected exchanges |
| DELETE | `/vault/:userId/:exchange` | Remove credentials |
| POST | `/vault/test` | Test exchange connection |

---

## Signal Quality Filters

| Filter | Default | Description |
|--------|---------|-------------|
| Volume confirmation | **ON** | Current 5m volume ≥ 85% of 20-bar rolling average |
| Sideways filter | Always ON | Blocks when EMA9/EMA21 spread < 0.15% on both timeframes |
| 1H trend alignment | **OFF** | Requires 1H EMA9 to align with signal direction |
| Min confidence | **60** | Minimum adjusted confidence to execute |

Configure via `POST /api/engine/filters`:
```json
{ "volumeFilter": true, "require1HTrend": false }
```

---

## Safety Controls

1. **Kill Switch** — halts all new orders instantly (`POST /api/exchange/kill`)
2. **Daily Loss Limit** — auto-halt when PnL < configured % of portfolio
3. **Max Trades/Day** — configurable execution cap
4. **Circuit Breakers** — per-exchange automatic trip on N consecutive failures
5. **Drawdown Protection** — 4-level system with auto kill at 6% drawdown from peak
6. **Correlation Gate** — caps correlated asset exposure (BTC+ETH combined)
7. **Volatility Gate** — blocks new positions when ATR exceeds threshold
8. **Credential Vault** — API keys never stored in plain text, never logged, never returned in API responses
9. **No Withdrawal Routes** — exchange adapters have no withdraw/transfer methods by design

---

## Quick Start

See [SETUP.md](./SETUP.md) for the full local development guide.

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env and fill in values
cp .env.example .env

# 3. Run database migrations
pnpm --filter @workspace/api-server run db:push

# 4. Start API server
pnpm --filter @workspace/api-server run dev

# 5. Start dashboard (new terminal)
pnpm --filter @workspace/trading-dashboard run dev
```

Dashboard: http://localhost:5173  
API: http://localhost:8080/api/healthz  
Mobile API: http://localhost:8080/api/mobile/ping

---

## Build for Production

```bash
# TypeScript check (all packages)
pnpm run typecheck

# Build dashboard
pnpm --filter @workspace/trading-dashboard run build

# Build API server
pnpm --filter @workspace/api-server run build
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 7, Wouter, TanStack Query, Recharts, Tailwind CSS |
| Backend | Express 5, Node.js 24, TypeScript 5.9, pino logging |
| Database | PostgreSQL 15 + Drizzle ORM |
| Validation | Zod v4 + drizzle-zod |
| Build | esbuild (server CJS bundle), Vite (client) |
| Monorepo | pnpm workspaces + dependency catalog |
| Security | AES-256-GCM vault, PBKDF2 key derivation, HMAC-SHA512/256 exchange signing |
| API codegen | Orval (from OpenAPI spec) |

---

## Phases Completed

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Exchange adapter architecture — 6 exchanges, 12 normalised types, BaseExchangeAdapter | ✅ |
| 2 | Multi-tenant user session model + per-user isolated engine registry | ✅ |
| 3 | AI engine — regime classifier, personality profiles, confidence scorer, AI memory | ✅ |
| 4 | Circuit breaker system + enterprise risk engine (6 parallel checks) | ✅ |
| 5 | Drawdown protection — GREEN/YELLOW/ORANGE/RED with auto kill | ✅ |
| 6 | AES-256-GCM credential vault with PBKDF2 per-user key derivation | ✅ |
| 7 | Execution telemetry, SHA-256 audit logger, priority execution queue | ✅ |
| 8 | Mobile API (12 endpoints) + adapter management API (14 endpoints) | ✅ |

---

## License

Proprietary — All rights reserved.
