---
name: LIVE close must sell ACTUAL free balance, not recorded qty
description: Per-user LIVE positions never exit at SL/TP/max-hold because the close submits the recorded pos.quantity, which is slightly above the broker's free base balance (entry fee + rounding shrinkage) → whole-order INSUFFICIENT_FUND every tick. Fix = clamp the sell to free balance and book a FULL close.
---

# Balance-aware LIVE close (max-hold turnover fix)

**Symptom:** LIVE positions stuck open far past the max-hold timer (e.g. 1h
max-hold but seen 7–35h open); broker rejects the close every tick with
Coinbase `INSUFFICIENT_FUND` / Kraken `Insufficient funds`.

**Root cause:** the close submits `pos.quantity` (the base qty recorded at
OPEN). A spot market BUY pays its entry fee partly in the base asset and rounds
down, so the actual FREE base balance is a hair below the recorded qty. A market
sell for more than you hold is rejected **wholesale** (not partially) → the
position can never close itself.

**Why the zombie reconciler does NOT fix this:** the orphan reconciler
(`reconcileZombiePosition`, gated by `getUserBrokerBaseBalance`) only retires a
position when broker balance **< recorded qty**. These positions HOLD ~99.5% of
qty (balance ≥ the sellable amount), so the reconciler correctly refuses them —
they are not orphans, they are mis-sized closes.

**Fix (the durable rule):** before placing the close, probe `adapter.getAccount()`
free base balance and clamp the sell qty to it (round DOWN, never up). Then book
it as a **FULL** close so no phantom fee-shrinkage dust remainder is left open to
re-trap the position.

**Two safety gates that MUST stay (real money):**
1. Only treat it as a full close when the clamped order actually **filled in
   full** (`!partial && filledQty>0`) — never book a full close on a broker
   PARTIAL fill, or you strand untracked live exposure.
2. Only when **free ≈ total** (`free >= total*(1-tol)`, tol ~1%) — if balance is
   merely LOCKED elsewhere (free < total), do NOT full-close; keep retrying, or
   locked balance that later unlocks is left untracked. Fail closed when total
   unknown.

**How to apply:** clamp + `liquidatedFullBalance` flag live in
`placeLiveCloseOrderForUser` (`liveUserExecution.ts`); `closeUserPosition`
(`userSimRegistry.ts`) forces `isPartial=false` only when that flag is true.
PnL is on the actual sold qty; sizeUSD released = full `pos.sizeUSD` (matches
the established full-close cash math). Applies to ALL close reasons (SL/TP/
trailing/max-hold/manual), not just max-hold.
