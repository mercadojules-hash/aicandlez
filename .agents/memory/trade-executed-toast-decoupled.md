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

## Customer fan-out is nested inside the GLOBAL `isLiveExec` branch

In `tradingLoop.ts autoExecute`, `isLiveExec = exModeForStream === "live"` is derived from the
**global** exchange-engine mode (`getExchangeStatus().mode`), NOT per-customer. The entire customer
live fan-out — operator `placeLiveAutoOrder` + per-user `executeCustomerOrder` (→
`placeLiveAutoOrderForUser`) + the `sim_positions` mirror ([AI_FANOUT_EXECUTED]) — lives INSIDE
`if (isLiveExec) { … }`. When the global engine is in simulation (`EXCHANGE_LIVE_ENABLED=false`),
`isLiveExec=false`, so autoExecute writes ONLY a global paper `trades` row (mode=`auto`,
exchange=null), increments the signalFunnel `executionSucceeded`, emits the TRADE EXECUTED toast,
and returns — **zero** `sim_positions`/`sim_trades`/broker writes.

**Why it matters:** `executionSucceeded` / "Execution Attempts = N, Success = N" can read all-green
while NO customer position, equity reservation, buying-power change, or Live-Trades row appears.
Customer live execution therefore requires the GLOBAL/operator engine to be in live mode;
`CUSTOMER_LIVE_EXECUTION_ENABLED=true` alone is NOT sufficient because the fan-out is gated behind
`isLiveExec`. To open customer positions the global exchange engine must be live
(`EXCHANGE_LIVE_ENABLED=true` + an operator exchange selected), OR the fan-out must be decoupled
from `isLiveExec` (design change — do not do unprompted).

**How to apply:** If success counters climb but customer Open/Equity/Live-Trades don't move, check
`GET /api/engine/status` trade rows for `mode:"auto"` + `exchange:null` (= global paper) and confirm
the global engine's exchange mode. Don't hunt in the per-user path; the orders never entered it.
