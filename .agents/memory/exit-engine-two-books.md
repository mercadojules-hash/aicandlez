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
