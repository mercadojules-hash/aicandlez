---
name: Customer LIVE execution decoupled from global/operator live mode
description: Why/how customer live AI execution runs independently of the global engine's live mode, and the duplicate-prevention invariant it depends on.
---

# Customer LIVE execution is decoupled from global/operator live mode

In `tradingLoop.ts` `autoExecute`, the customer LIVE fan-out (per-user
`executeCustomerOrder` → `placeLiveAutoOrderForUser`, then `registerLiveUserFill`
mirror into `sim_positions`) runs in a block gated ONLY by
`isCustomerLiveExecutionEnabled()` (env `CUSTOMER_LIVE_EXECUTION_ENABLED`) plus
the per-customer runtime/safety gates. It runs exactly once per autoExecute pass
— in BOTH global sim AND global live mode. It is NOT inside `if (isLiveExec)` and does NOT depend
on `EXCHANGE_LIVE_ENABLED` / the operator engine being live.

**Why:** customers with their own connected exchange must receive real positions
on every successful AI signal regardless of whether the global/operator engine
happens to be running in paper or live mode. Coupling them meant customer live
orders only fired when the operator engine was live — a real-money gap.

**How to apply:**
- The operator env-key path (`placeLiveAutoOrder`) stays gated on `isLiveExec`.
- All per-customer safety/risk/sizing/SL-TP/eligibility/kill-switch checks remain
  enforced inside `placeLiveAutoOrderForUser` — never weaken or bypass them when
  touching the fan-out.

## Duplicate-prevention invariant (load-bearing)
The live cohort selector (`listLiveExecutionUsers`,
`user_exchange_connections.tradingMode='live'`) and the paper cohort selector
(`listPaperAutoTradeUsers`, `user_settings.tradingMode != 'live'`) key off
DIFFERENT `tradingMode` columns and CAN overlap. In sim global mode both fan-outs
now run in the same tick, so a user could otherwise get a live AND a paper
position. Guard: collect live-fan-out userIds in a Set and exclude them from the
paper fan-out (logged `AI_FANOUT_SKIPPED reason=handled_by_live_fanout`). Any
change to either selector must preserve this exclusion.

## Two-book independence on global-sim failure
Customer LIVE positions live in `sim_positions` and are self-managed by the
per-user fixed SL/TP exit monitor — INDEPENDENT of the global simulationEngine
book. If the global sim `placeOrder` hard-fails after the customer fan-out
already persisted fills, the global tick is rejected for the GLOBAL book only;
customer fills stand. Do NOT fabricate a synthetic global `trades` row anchored
to a customer fill in that path — the global exit monitor / maxActivePositions
cap would then track a position that isn't in the global book.
