---
name: Live max-hold close depends on a successful broker order (zombie risk)
description: Why per-user LIVE positions can sit open well past the max-hold ceiling; balance-verified local reconciliation valve
---

Per-user LIVE positions exit ONLY through `closeUserPosition` → `placeLiveCloseOrderForUser`.
The max-hold trigger itself is sound (price-independent, fires when age ≥ maxHoldMs; maxHoldMs has a
hardcoded fallback — `EXIT_DEFAULTS.maxHoldHours`, lowered 24h → 6h universal — so it's effectively
always > 0; age uses `sim_positions.entry_time`, which is reliably populated). It DOES fire —
MAX_HOLD closes exist in prod history.

**The gap (now closed — see Resolution below):** when the broker rejects the close order,
`closeUserPosition` returns `success:false` and the row STAYS OPEN. The monitor re-triggers
MAX_HOLD next tick and re-fails. Historically there was **no force-close / local-reconciliation
fallback for per-user positions** (the `MAX_HOLD_FORCE_CLOSE` self-heal only covers the GLOBAL
`trades` book — per-user `sim_positions` are excluded); the balance-verified reconciler below now
closes that gap for true orphans.

**Why:** the close is gated on a real exchange fill so realized PnL matches the broker;
there's no safety valve to mark a position closed locally when the venue won't accept the close.

**How to apply:** "live position open well past max-hold" is almost always a repeatedly-failing
broker close, NOT a broken max-hold trigger or a null entry_time. Diagnose the close-rejection
reason first. Two common classes:
- **Dust** (`quantity` ~1e-08, ~$0 notional, e.g. XLMUSD): below broker min order size →
  rejected every tick → permanent zombie. Inflates open-position count.
- **Real exposure** ($10–$20): the broker rejection text IS persisted — `closeUserPosition`'s
  failure path calls `emitFailureNotification` → `user_notifications` (type=`live_trade_failed`,
  message=`Exchange rejected close order: <broker msg>`, `data->>'symbol'` carries the symbol).
  Query that table for the exact reason; you do NOT need Render stdout. (The DB `logs` table
  still has nothing; pino HARD_STOP_SKIPPED is Render-only — but notifications cover it.)

**Observed in prod:** every stuck REAL row failed for the SAME root reason — **insufficient
balance** (Kraken `EOrder:Insufficient funds`, Coinbase `INSUFFICIENT_FUND`), persisting to the
latest tick. A secondary INTERMITTENT Kraken `EAPI:Invalid nonce` (exchange API error) also
appears but is not the blocker. "Insufficient balance" on a close = tracked `sim_positions.quantity`
exceeds the actual sellable broker balance (asset already moved/sold or quantity drifted) — the
position is untracked-divergent, not just rejected.

**Resolution — local reconciliation safety valve (now wired):** the monitor escalates a
past-max-hold LIVE position whose broker close fails N consecutive ticks to a broker-balance
probe, and retires it LOCALLY (no broker order) only when the live TOTAL base-asset balance is
verified below the recorded quantity. Hard rules that must never be relaxed:
- **Fail-CLOSED on an unverified balance.** If the probe can't return `ok:true`, keep retrying —
  never reconcile without a confirmed balance (a probe failure must not look like "asset gone").
- **Verify before closing — never blind-close on one rejection.** Three independent confirms:
  age≥maxHold, a consecutive failed-close streak (floor 2, default 3), AND verified
  balance < qty*(1−tol). A balance that CAN cover the qty = transient (min-size / nonce) → keep
  the row, reset the streak.
- **Use TOTAL (free+locked), not free.** An asset locked in an open order still exists at the
  venue → not an orphan. Reconciling on free-only would wrongly retire real holdings.
- **Accounting:** reconcile = DELETE `sim_positions` + INSERT a `reconciliationTag`-tagged
  `sim_trades` row (realizedPnL 0, closeReason `RECONCILED_INSUFFICIENT_FUNDS`). LIVE opens never
  deducted cash, so do NOT credit cash and do NOT touch total_realized/total_trades — the asset is
  already gone at the broker (the SoT for live equity); fabricating a recovered-capital credit
  overstates equity. The tag excludes the row from the realized recompute.
**Why:** the original close path is gated on a real fill so realized PnL matches the broker; the
valve only bypasses that fill when the asset provably no longer exists to fill against.

**Connection-removed orphans (observed prod, now closed).** If the user DELETES the exchange
connection, a still-open LIVE position on that venue can NEVER be closed (no credentials) AND the
balance probe `getUserBrokerBaseBalance` returns `errorCode:"no_connection"` (no active row) →
under the old "fail-CLOSED on unverified balance" rule it deferred forever, eating
concurrency/deployment slots indefinitely. Fix: the monitor now treats a `no_connection` probe as
a PERMANENT orphan (unambiguous + permanent, unlike transient `getaccount_failed`/`decrypt_failed`/
`unsupported` which keep deferring) and reconciles it via `reconcileZombiePosition` (closeReason
`RECONCILED_CONNECTION_REMOVED`, actualBalance null, same ZOMBIE tag → excluded from realized).
Removing our API key never liquidates the user's real holdings — they remain under manual control
at the exchange. **Convergence caveat:** the customer summary reads in-memory `state.positions`
(getOrLoad caches forever, no prod eviction), so the retire only reflects in the UI once it runs
IN the prod process (the monitor calls `reconcileZombiePosition`, which splices memory + deletes DB
+ writes audit + notification atomically). A raw out-of-process DB delete would NOT converge prod
memory (UI stays stale + STATE_DB_DIVERGENCE error spam) → never hand-delete these; ship the code
fix and let the in-process monitor retire them on the next deploy/restart.

**Dust zombies silently eat per-exchange capacity (observed prod).** Unclosable dust rows
(`size_usd=0`, `quantity≈1e-8`, e.g. XLMUSD) still count as OPEN `sim_positions` toward the
per-(user,exchange) `maxPositions` cap. With a tight per-exchange cap (e.g. Coinbase max=10),
several dust zombies can occupy half the slots, so the venue sits pinned at its cap
(`risk_max_simultaneous`) and NO new real entry can open — making an unrelated config change
(e.g. a per-trade size bump) operationally inert even though it's stored correctly. The
balance-probe reconciler does NOT retire these: tiny qty (~1e-8) is satisfiable by ~any residual
balance, so `balance < qty*(1−tol)` is false → "transient" → keep retrying forever.
**How to apply:** when a per-exchange size/cap change "isn't doing anything," first count dust
zombies in `sim_positions` (size_usd=0 / qty≈1e-8) AND check real broker free capital in the
`risk_reserve_cash_breach` logs before suspecting the setting didn't apply.
