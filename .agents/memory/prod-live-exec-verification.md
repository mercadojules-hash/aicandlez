---
name: Prod live-execution verification (customer position creation)
description: How to prove every AI live execution created a customer position using the Render prod DB; which trace events are persisted vs pino-only, and how to reconcile.
---

# Verifying customer live-position creation in prod

Ground truth = Render prod DB (read-only via `RENDER_PROD_DATABASE_URL`, bash/node only — see prod-db-on-render.md). Render app/pino stdout logs are NOT reachable from the dev container.

## What IS persisted to the DB `logs` table (usable as proof)
- `execution_submitted_{kraken|coinbase}` — per-user broker submission. `details` carries `userId`, `symbol`, `side`, `exchange`, `qtyBase`, `referencePrice`.
- `execution_order_accepted` — broker fill confirmed. `details` carries `userId`, `symbol`, `exchangeOrderId`, `fillPrice`, `quantity`. This is the authoritative "execution success" event.
- `execution_order_rejected` — broker bounced it. `details.error` has the raw broker message (e.g. Coinbase "INSUFFICIENT_FUND", Kraken "EOrder:Insufficient funds", "Invalid product_id", "account is not available"). Correctly produces NO position.
- `[AUTO] ...` (level=success) — GLOBAL signal/engine row (uid-less), not per-user.
- `Auto-trade blocked for X: daily limit / max active positions / per-symbol cap` — GLOBAL trades-book gates, run BEFORE the per-user fan-out.

## What is NOT persisted (cannot be retrieved from DB)
- `CUSTOMER_FANOUT_START` / `CUSTOMER_FANOUT_COMPLETE` / `CUSTOMER_POSITION_CREATED` / `CUSTOMER_POSITION_REJECTED` — all **pino-only** (Render stdout). Confirmed 0 rows in the DB `logs` table. Do not promise these lines from prod-DB verification; substitute the trace events above + the actual `sim_positions`/`sim_trades` rows.

## Correct reconciliation recipe
- Match a submission/accept to a position row by **`sim_positions.created_at`** (≈ fill time +~1s), and to a closed trade by **`sim_trades.entry_time`** (epoch ms). DO NOT match trades on `created_at` — that's the CLOSE time and will produce false misses.
- Join key: `sim_positions.user_id` / `sim_trades.user_id` = `users.clerk_user_id` (varchar `user_…`), NOT `users.id`.
- A correct result: every `execution_order_accepted` should have exactly one position/trade row; every `execution_order_rejected` should have none.
