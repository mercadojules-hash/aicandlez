---
name: "$20 sizing bug" is a RECORDING mislabel, not an execution bug
description: Every live fill records size_usd=$20 but the broker actually receives the correct per-user/per-exchange size. The resolved size is trapped local in placeLiveAutoOrderForUser and never propagates to the sim_positions/sim_trades mirror-write.
---

# Live size_usd is mislabeled; broker sizing is correct

**Proof method (no telemetry/deploy needed):** compare `quantity × entry_price`
(the real broker notional) against the recorded `size_usd` in `sim_positions`/
`sim_trades`. In prod: teedelgado Coinbase notional ≈ $49.5–50 (override $50),
teedelgado Kraken ≈ $20 (global $20), mixtapepsd Kraken ≈ $10 (global $10) — yet
EVERY row's `size_usd` column = $20. ⟹ broker gets the right size; only the
recorded field is wrong. `qty×price` is stronger evidence than a log line.

**Root cause (exact path):**
- Gate 0SIZE resolves the correct size and assigns it to the FUNCTION-LOCAL
  `sizeUSD` inside `placeLiveAutoOrderForUser` (`liveUserExecution.ts`, the
  `sizeUSD = preferred` line). The broker order is built from this local → correct.
- `LiveUserOrderResult` (`liveUserExecution.ts` interface) has NO resolved-size
  field, so the resolved value never escapes the function.
- The fan-out mirror-write `registerLiveUserFill({ ..., sizeUSD, ... })` in
  `tradingLoop.ts` (customer live success loop) passes the OUTER `autoExecute`
  `sizeUSD` — which is `settings.allocation` (the engine global, $20) computed
  near the risk-engine gate — NOT the per-user resolved size. That outer value is
  what lands in `sim_positions.size_usd` and later `sim_trades.size_usd`.

**Why it matters (not just cosmetic):** `equityProxy = cashBalance + Σ
position.sizeUSD` (userSimRegistry). With size_usd pinned at $20, exposure is
UNDERSTATED (Coinbase $50 shown as $20) and any risk/exposure gate that sums
size_usd under-counts → could admit more risk than intended. So the fix changes
real exposure numbers → real-money locked path → needs user sign-off.

**Fix shape:** add a resolved `sizeUSD` (and ideally orderId) to
`LiveUserOrderResult`, set it where the broker order is placed, and in the
mirror-write use `r.sizeUSD ?? sizeUSD`. Mirror the same into the manual
`/api/user/live-order` persistence path.

**Coercion is NOT the cause:** ALLOWED_TRADE_SIZES=[10,20,50,100],
DEFAULT_TRADE_SIZE_USD=10; $10/$50 are valid presets and do not coerce to $20.
