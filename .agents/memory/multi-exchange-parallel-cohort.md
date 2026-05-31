---
name: Multi-exchange parallel cohort hygiene
description: How per-user parallel multi-exchange live trading stays healthy-only and per-venue isolated; the tradingMode demotion invariant.
---

# Multi-exchange parallel live trading (per-user capability)

A per-user flag (`user_settings.multi_exchange_parallel_enabled`, default
false) lets specific accounts trade live on MULTIPLE connected exchanges at
once, each with an independent per-exchange open-position cap
(`per_exchange_max_positions`, NULL → DEFAULT_PER_EXCHANGE_MAX in
`multiExchangeParallel.ts`). All other users keep single-active-exchange.

## The cohort-hygiene invariant (load-bearing)

The engine fan-out cohort (`listLiveExecutionUsers`) selects parallel-user
rows purely by `status="active" && tradingMode="live"`. Therefore the DB
`tradingMode` column on `user_exchange_connections` MUST track venue HEALTH,
or a degraded venue keeps getting fanned out.

**Rule:** the parallel writeback in `runtimeState.ts` must run UNCONDITIONALLY
for parallel users (not gated on `liveReady`) and, in one transaction:
demote any `tradingMode="live"` row NOT in the freshly-resolved healthy
`activeExchanges` back to `"paper"`, promote healthy active venues to `"live"`,
keep the one-default invariant (isDefault on primary active venue only). This
covers partial-degrade AND all-degrade (`activeExchanges=[]`, incl.
subscription-forced paper). Promotion alone (the original bug) is insufficient
— without the demotion half, a venue whose balance health degrades lingers as
live and the cohort fans it out.

**Why:** code review caught that promotion-only writeback left stale live rows
for degraded venues; `listLiveExecutionUsers` then kept them in the cohort.

**How to apply:** any change to how parallel runtime mode is resolved must
preserve both directions (promote healthy + demote unhealthy). Enforcement is
eventual (depends on runtime-state hydration polling); the open-path hard stop
in `placeLiveAutoOrderForUser` independently rejects orders to unhealthy/
unauthorized venues, so real money is safe even if a stale row briefly lingers.

## Per-venue isolation

For parallel users, open-position counting, the cap override
(`maxOpenOverride = perExchangeMax`) into liquidity Gate A + riskGate Cap 2,
and the duplicate-position guard are all scoped to `(user, exchange[, symbol])`
ONLY when `parallelCfg.enabled && targetExchange` is present. So Coinbase BTC
never blocks Kraken BTC, and one venue's fills never consume the other's slots.
Single-active users keep plan-tier caps and per-(user,symbol) dedup unchanged.

## Ops gotcha

The platform-wide concurrent live cap (gate 0c, default 25 via
`DEFAULT_LIVE_EXECUTION_CONCURRENT_CAP`) caps TOTAL live positions across all
users. To let parallel users actually reach 40 open each, raise env
`LIVE_EXECUTION_CONCURRENT_CAP` (no redeploy) — this is ops, not code.
