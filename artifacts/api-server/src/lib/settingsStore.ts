// ── In-memory settings store ─────────────────────────────────────────────────
//
// Authoritative source for the trading engine's per-tick settings.
// Avoids a DB round-trip on every tick and works correctly when no DB is
// configured (DATABASE_URL absent → mock DB returns [] for all queries).
//
// Lifecycle:
//   1. Default state: autoMode = TRUE — paper trading works out of the box.
//   2. On first tick, tradingLoop.ts tries to sync from DB (if available).
//   3. PUT /api/settings updates both DB and this store in a single call.
//   4. kill-switch route also patches this store.
//
// maxActivePositions is in-memory only (not in DB schema).
//   Set to 0 to disable the open-position cap.
// maxTradesPerDay = 0 means unlimited daily trades.

export interface PersistedSettings {
  autoMode:            boolean;
  killSwitch:          boolean;
  minConfidence:       number;
  allocation:          number;
  stopLossPercent:     number;
  takeProfitPercent:   number;
  maxTradesPerDay:     number;  // 0 = unlimited
  maxActivePositions:  number;  // 0 = unlimited; default 3
}

// ── Defaults ─────────────────────────────────────────────────────────────────
// autoMode is TRUE so paper trading starts immediately on first run —
// no database or additional configuration required.
const DEFAULTS: PersistedSettings = {
  autoMode:            true,
  killSwitch:          false,
  minConfidence:       25,   // low enough for test-mode signals to trade without DB config
  allocation:          1000,
  stopLossPercent:     2,
  takeProfitPercent:   4,
  maxTradesPerDay:     10,   // 0 = unlimited
  maxActivePositions:  3,    // max concurrent open positions (0 = unlimited)
};

let _store: PersistedSettings = { ...DEFAULTS };

export const settingsStore = {
  get():                                PersistedSettings { return { ..._store }; },
  patch(p: Partial<PersistedSettings>): PersistedSettings { _store = { ..._store, ...p }; return { ..._store }; },
  reset():                              PersistedSettings { _store = { ...DEFAULTS }; return { ..._store }; },
};
