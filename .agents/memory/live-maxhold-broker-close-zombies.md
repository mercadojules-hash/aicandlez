---
name: Live max-hold close depends on a successful broker order (zombie risk)
description: Why per-user LIVE positions can sit open well past the 24h max-hold ceiling
---

Per-user LIVE positions exit ONLY through `closeUserPosition` → `placeLiveCloseOrderForUser`.
The max-hold trigger itself is sound (price-independent, fires when age ≥ maxHoldMs; maxHoldMs
hardcodes a 24h fallback so it's effectively always > 0; age uses `sim_positions.entry_time`,
which is reliably populated). It DOES fire — MAX_HOLD closes exist in prod history.

**The gap:** when the broker rejects the close order, `closeUserPosition` returns
`success:false` and the row STAYS OPEN. The monitor re-triggers MAX_HOLD next tick and
re-fails — indefinitely. There is **no force-close / local-reconciliation fallback for
per-user positions**. (The `MAX_HOLD_FORCE_CLOSE` self-heal only covers the GLOBAL `trades`
book — per-user `sim_positions` are explicitly excluded.)

**Why:** the close is gated on a real exchange fill so realized PnL matches the broker;
there's no safety valve to mark a position closed locally when the venue won't accept the close.

**How to apply:** "live position open >> 24h" is almost always a repeatedly-failing broker
close, NOT a broken max-hold trigger or a null entry_time. Diagnose the close-rejection
reason first. Two common classes:
- **Dust** (`quantity` ~1e-08, ~$0 notional, e.g. XLMUSD): below broker min order size →
  rejected every tick → permanent zombie. Inflates open-position count.
- **Real exposure** ($10–$20): rejection reason (min-notional / insufficient sellable
  balance / connection) lives in Render stdout (`HARD_STOP_SKIPPED`, "live close order
  rejected") — these are pino-only, NOT in the DB `logs` table, so prod-DB queries won't
  show them. Need Render logs to get the exact broker error.
