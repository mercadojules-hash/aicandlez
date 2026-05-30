---
name: ARM enforcement model (customer live orders)
description: Where the per-session "ARM" requirement is and is NOT enforced across live-order entry points; which gates actually protect real money.
---

# ARM enforcement model for customer live orders

`armedForLive` is a **client-side, module-scoped** session flag
(trading-dashboard `hooks/useArmedForLive.ts`) that resets to `false` on every
page load. There is **no `armedForLive` field on the server**. The server's
only per-session arm enforcement happens at the AI-trading *enable* route
(`aiTrading.ts`), which requires an interactive-arm flag in the request body
to turn on LIVE auto-mode (rejects with `[ARM_LIVE_REJECTED] runtime_not_armed`
otherwise). Once enabled, the persisted `user_settings.autoMode` drives the
loop fan-out — there is no per-tick session re-check (the arm happened at
enable time).

Live-order entry points and arm status:
- **Manual customer BUY/SELL**: `SignalRow.fireTrade` (client) gates on
  `!armedForLive` before calling `POST /api/user/live-order`. The server route
  → `executeCustomerOrder` → `placeLiveAutoOrderForUser` does **NOT** re-verify
  a session arm. A direct API call could therefore place a live order while the
  UI session is "disarmed" — still subject to the env kill switch + all gates
  below, but not to the client arm.
- **AI auto fan-out** (`tradingLoop.ts` customer loop): arm satisfied at
  autoMode-enable time; gate `0a2 user_ai_disabled` (= autoMode off) blocks
  execution when disabled.
- **Operator path** `POST /api/exchange/order/execute`: no arm by design,
  `requireOperator`-gated, platform-credential institutional path.

`placeLiveAutoOrderForUser` gate list (the real-money protections, independent
of any arm flag): `0PRE` customer_live_execution_disabled (env kill switch),
`0SIZE` size clamp, `0UNI` symbol_not_in_universe, `0VOL` volume gate, `0a`
user_status_blocked, `0a2` user_ai_disabled, `0b` trade_limit_exhausted, `0c`
concurrent_live_cap_reached, `0LIQ` liquidity/plan_max_positions, `0d` risk
gate, `0e` ai_disclaimer_not_accepted, `0f` low_confidence_signal.

**Why:** future "add a live-order path" or "harden ARM" work must know the arm
is a UI affordance, not a server gate, on the manual route. If true server-side
arm enforcement is ever required for manual orders, add an explicit per-session
check in the `/api/user/live-order` route — typecheck-clean changes elsewhere
will not close that gap.
