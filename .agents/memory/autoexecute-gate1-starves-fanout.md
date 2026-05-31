---
name: Global Gate 1 short-circuits the customer fan-out
description: Why a saturated GLOBAL trades book causes 0 customer execution attempts even when customers have free per-user capacity.
---

In `tradingLoop.ts` `autoExecute(...)`, **Gate 1 (max active positions) sits at the
TOP of the function and `return`s early** when the GLOBAL `trades` book (operator
auto book, `mode=auto`, `exchange IS NULL`, counted by `countOpenTradePositions`)
is at `settings.maxActivePositions`. The **customer LIVE fan-out**
(`executeCustomerOrder` → `placeLiveAutoOrderForUser`, then `registerLiveUserFill`)
AND the **paper fan-out** (`placeUserOrder`) are both positioned BELOW Gate 1 in
the same function.

**Consequence:** when the global operator book saturates (e.g. 12/12), autoExecute
returns before reaching the fan-out, so EVERY customer gets nothing — live and
paper — regardless of their own free per-user capacity. The engine-status
`executionFunnel` shows the signature `reachedExecution > 0` with
`passedPositionLimits == 0` (100% of candidates die at the position-limit gate),
and "Exec Attempts: 0". Persisted proof = `logs` rows
`"max active positions (N) reached — currently N open"`.

**Why it's misleading:** a customer can have 2/12 positions, $600 equity, AI on,
Coinbase connected, runtime settings correct — and still get 0 fills — because the
blocker is the GLOBAL book, a different table from their per-user `sim_positions`.
Raising the global cap (3→12) only delays re-saturation; the global engine refills
its own auto book up to whatever the cap is.

**The correct fix direction:** the global position cap is meant to bound the
OPERATOR's own book; customers are independently protected by their per-user gates
(plan_max_positions, concurrent cap, liquidity guard, risk) inside
`placeLiveAutoOrderForUser`. So Gate 1 must NOT gate the customer fan-out — convert
the early `return` into a flag that skips only the operator's own position open
while letting the customer + paper fan-out proceed. (Real-money path — get sign-off
before changing.)
