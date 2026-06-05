---
name: Customer trade-size resolution
description: How per-entry LIVE notional resolves for customers, and the three silent gotchas when changing it.
---

# Customer trade-size resolution (per-entry LIVE notional)

Effective size at execution (`placeLiveAutoOrderForUser` / `executeCustomerOrder`):
1. If a per-(user,exchange) `user_exchange_settings.tradeSizeUsd` exists for the
   leg's `targetExchange` → that value is used **DIRECTLY, UNCLAMPED**.
2. Else → `user_settings.preferredLiveOrderSizeUsd`, **CLAMPED** through
   `coerceTradeSizeToPreset()` to `ALLOWED_TRADE_SIZES` (liquidityGuard.ts).

## Three silent gotchas (all real-money relevant)

- **Off-preset global silently becomes $10.** Setting `preferredLiveOrderSizeUsd`
  to a value NOT in `ALLOWED_TRADE_SIZES` makes `coerceTradeSizeToPreset()` fall
  back to `DEFAULT_TRADE_SIZE_USD` (10) at execution time — the order shrinks to
  $10 with no error. To make a new size legal you MUST add it to
  `ALLOWED_TRADE_SIZES` (and `SIZE_PRESETS` in tradingModePresets.ts, plus the
  frontend pickers `Trade.tsx` SIZE_PRESETS / `PortalCustomerShell.tsx`
  TRADE_SIZES_USD). Per-exchange override path does NOT need this (unclamped).

- **UI picker reads GLOBAL only.** The "Trade Size" picker (SignalRow,
  PortalCustomerShell, Trade.tsx) reads/writes `preferredLiveOrderSizeUsd`. A
  per-exchange-only change (tradeSizeUsd) executes correctly but the UI still
  shows the global value — looks like the change "didn't take". Set the global
  too if you want the UI to reflect it.

- **Manual `/api/user/live-order` bypasses per-exchange override.** That route
  does not pass `targetExchange` into `executeCustomerOrder`, so the per-exchange
  `tradeSizeUsd` is ignored on manual orders — they fall back to global preferred.
  Only the AI fan-out (`tradingLoop` passes `targetExchange`) honors per-exchange.

**How to apply:** to set a customer's per-entry size to value V consistently
across UI + AI + manual paths: ensure V ∈ ALLOWED_TRADE_SIZES (code) AND set
`preferredLiveOrderSizeUsd=V` (global); a per-exchange `tradeSizeUsd=V` only
overrides the AI fan-out for that one venue.

**Why:** discovered while raising the live QA account from $50→$125 — the $50 was
a Coinbase per-exchange override, the UI showed the $20 global, and a global set
to an off-preset value would have collapsed to $10.
