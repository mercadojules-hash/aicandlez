---
name: Dust-phantom live-position retirement
description: Why phantom live sim_positions (qty≤1e-8 & size_usd=0) can't be cleared by a prod-DB delete, and the in-process guard that retires them.
---

# Dust-phantom live-position retirement

A LIVE `sim_positions` row with `quantity <= 1e-8 AND size_usd = 0` is a phantom:
real opens always carry a min-notional `sizeUSD ≫ 0`, so such a row never
represented a broker fill and no asset exists at the exchange.

## Why phantoms sit open forever
- The normal exit path fires a broker close every tick that the venue rejects as
  sub-min-notional dust.
- The balance-verified zombie reconciler is gated on a broker balance probe that
  **fail-CLOSES under exchange 429 rate-limiting**, so under load it can never
  confirm the orphan → the row never retires and keeps a concurrency slot.

## Invariant: never converge a live sim_position by editing prod DB alone
**Why:** `getUserAccountSummary.positionCount` comes from in-memory
`state.positions` (only logs `STATE_DB_DIVERGENCE`, no self-heal);
`closeUserPosition` returns early on a rejected LIVE close without splicing
memory; `reconcileZombiePosition` no-ops without splicing if the DB row is already
gone. So a bare prod DELETE strands a permanent in-memory zombie that re-fires
rejected closes.
**How to apply:** converge IN the prod process — delete DB + splice memory
atomically (via the running loop or a restart that reloads from DB), never a raw
DELETE.

## The fix
An unconditional guard at the top of `runHardStopMonitor`'s per-position loop
retires `isLive && qty<=1e-8 && sizeUSD<=0` rows via `reconcileZombiePosition`
(no broker probe), independent of max-hold. Gate is doubly strict so no real
position (always `sizeUSD>0`) can match. Dust reconciliations carry their own
`reconciliation_tag = RECONCILED_DUST_PHANTOM` + notification copy so ops
dashboards keying on the tag don't mislabel them as insufficient-funds zombies.
**Deploy dependency:** runs on prod only after a Render deploy; on restart the
registry reloads phantoms from DB, then the first tick retires them → 0/N.
