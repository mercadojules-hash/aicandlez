---
name: sim-registry field hydration
description: Any sim_positions field meant to survive to close-time MUST also be hydrated in loadFromDB(), or Render restarts strand it as null.
---

# Per-position fields must be hydrated in loadFromDB()

When you add a column to `sim_positions` whose value is copied onto the
`sim_trades` row at close time (e.g. `confidence`), you must add it in THREE
places, not two:

1. The open-side insert(s) (`registerLiveUserFill`, `placeUserOrder`).
2. The close-side copy (`finalizeClose`: `pos.<field>` → trade insert).
3. **`loadFromDB()` in `userSimRegistry.ts`** — the `positions.map(...)` (and
   usually `tradeHistory.map(...)`) rehydration.

**Why:** the registry is an in-memory `Map<userId, UserSimState>` that is
DB-hydrated lazily. Render redeploys on every push to `main`, so the process
restarts frequently. If a position was opened before a restart and the field is
NOT mapped in `loadFromDB()`, the rehydrated in-memory position has the field
`undefined`; the eventual close then writes `sim_trades.<field> = null`,
silently corrupting any later analysis keyed on that field.

**How to apply:** whenever threading a new persisted per-position attribute,
grep `loadFromDB` and confirm the new column appears in the positions map. A
clean typecheck does NOT catch this because the field is optional (`?`).
