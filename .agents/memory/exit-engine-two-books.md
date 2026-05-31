---
name: Exit engine two-book invariant
description: The global trades book and per-user sim_positions book are separate with separate exit monitors; every exit trigger must close BOTH or the max-active-positions cap starves AI execution.
---

# Two separate position books, two separate exit monitors

The trading engine keeps **two independent position stores**:

1. **Global book** — the `trades` table (mode `auto`/`live`/`test`) ⇔ in-memory
   `simulationEngine.positions[]`. Under EXIT_ENGINE_V2 the `trades` row id ==
   the simulationEngine position id (linked at open). On boot,
   `rehydrateOpenPositions()` reloads open rows into simulationEngine.
2. **Per-user book** — `sim_positions` / `sim_trades`, fanned out per customer.

**The max-active-positions cap (`maxActivePositions`, Gate 1 in `autoExecute`)
counts the GLOBAL book only** (`countOpenTradePositions` via
`openGlobalPositionsPredicate`). When `openCount >= cap` the gate returns BEFORE
the execution-attempt counter increments → AI signals silently stop executing.

**Why this bites:** each exit trigger historically closed only ONE book.
- Trailing pass (`runTrailingStops`) closes the global book (+ `markTradeRowClosed`)
  AND fans out per-user closes.
- Hard SL/TP (`runHardStopMonitor`) closed ONLY per-user `sim_positions`.
  → Global rows that breached SL/TP but never triggered trailing (flat market =
  trailing rarely fires) were never closed, piled up, and permanently saturated
  the cap. Symptom: 0 exec attempts + global `trades` shows ~all open / ~none
  closed while `sim_trades` shows many closes.

**Invariant for any future exit/close work:** an exit trigger that should free a
slot MUST close the GLOBAL book too (close the simulationEngine position by id +
`markTradeRowClosed(id, ...)`). Closing only the per-user book does NOT drain the
cap — per-user position ids ≠ global trades ids, so you cannot map a per-user
close back to a global row; you must act on the global book directly.

**How to apply:** mirror `runGlobalHardStops()` — read open global rows via
`openGlobalPositionsPredicate`, detect the exit condition, then
`closePosition(id)` + `markTradeRowClosed(id, ...)`. Do NOT also fan out per-user
from a global hard-stop if `runHardStopMonitor` already covers that trigger per-user
(double-book closes of the same trigger). `markTradeRowClosed` is idempotent
(status='open' guarded + `.returning()`), so concurrent/duplicate ticks are safe.

**Recovery — draining a saturated global cap:** because the cap is COUNTED FROM
THE DB (`countOpenTradePositions`) and boot rehydration uses the SAME predicate
(`openGlobalPositionsPredicate`), a one-time flatten is just: `UPDATE trades SET
status='closed', exit_price=price, pnl=0, pnl_percent=0, closed_at=now(),
reason='RECONCILED' WHERE status='open' AND mode IN ('auto','live','test') AND
price>0 AND amount>0;` then **restart api-server** so in-memory simulationEngine
rehydrates from the now-empty open set (otherwise the closed rows stay resident
in memory until restart). Breakeven (`exit=price`, pnl=0) is the correct
non-fabricating choice for phantom paper rows — it's a global operator paper
book, never customer money. After restart, confirm `tradesExecuted` starts
incrementing and `tradesBlocked` stays 0 in `GET /api/engine/status`.

**Restart is NOT required to free the cap.** The cap is read fresh from the DB
every tick (`await countOpenTradePositions()`, no cache), so a DB-side close of
the stale open rows frees Gate 1 within one loop interval (~60s) on the live
process. Verified: after a manual flatten, prod stopped emitting the
`"max active positions"` block log immediately and fell through to normal
downstream filters (`Sideways/range-bound market`). Restart only evicts the
orphaned in-memory `simulationEngine` positions (cosmetic) — the cap itself is
already drained by the DB write.

**Two deadlock modes even `runGlobalHardStops` can't resolve** (and why a
self-heal exists): the SL/TP pass `continue`s and never closes a global row when
(1) the symbol has **no live ticker** (delisted/untradeable — price lookup
fails) so SL/TP can't be evaluated, or (2) the position is **absent from
in-memory `simulationEngine`** (boot rehydration gap) so `closePosition` returns
not-success and the row is intentionally left open for reconciliation. Both leak
cap slots forever.

**Self-heal guard:** `runGlobalCapSelfHeal()` (separate fn, called right after
`runGlobalHardStops` in the tick) force-closes any global row open longer than
`GLOBAL_POSITION_MAX_HOLD_MS` (default 24h; `0` disables). It tries
`closePosition`+`markTradeRowClosed` first; if unmanageable, it does a flat
administrative close (`exit=entry, pnl=0, pnlPct=0`) so the cap always frees.
**Why gated ONLY on `isExitEngineV2()`, NOT `isHardStopEnforcementEnabled()`:**
the latter is an unrelated SL/TP kill switch — coupling an anti-deadlock safety
control to it would let ops silently re-enable cap starvation. Scoped to the
GLOBAL `trades` book only; never touches `sim_positions` (customer real money).
