---
name: "TRADE EXECUTED" toast is decoupled from real broker fills
description: Why a customer can see a "TRADE EXECUTED" notification with no Coinbase order and no persisted position.
---

The portal "TRADE EXECUTED" notifications are fired by `AlertsProvider.tsx`, NOT by a confirmed
broker fill or a persisted position. Two independent triggers exist:
- `data.tradesExecuted` session counter rising → body "N total trades executed this session".
- a `trade_executed` / signal-stream entry → body "<SYM> <side> ... $X @ $price".

Both key off the **global engine's** signal-execution telemetry (engine logs `[AUTO] BUY <SYM>` with
`tradeMode:"auto"` and `userId=null`), which is engine-wide, not per-customer.

**Why it matters:** a customer (e.g. on `trade./portal`) can get a "TRADE EXECUTED" toast for an
engine auto-signal that (a) was never submitted to Coinbase (no `execution_submitted_coinbase` /
`execution_order_rejected` trace), and (b) opened no position (no `sim_positions` / `sim_trades`
row for the symbol, for any user). The toast celebrates an internal engine fill, not real money.

**How to apply:** When validating a real live lifecycle, do NOT trust the toast or the
"trades executed this session" counter. Confirm with the per-user trace chain
(`execution_reached_volume_gate` → `execution_submitted_coinbase` → broker accept) tagged with the
user's clerkUserId, plus a real `sim_positions`/`sim_trades` row. The authoritative live-fill marker
is `execution_submitted_coinbase` with the user's `userId` in details.
