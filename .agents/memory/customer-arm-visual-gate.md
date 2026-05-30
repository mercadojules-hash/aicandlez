---
name: Customer AI Live Trading "ARMED" visual gate
description: Why the green "AI EXECUTION ARMED" customer state must be gated on the per-session armedForLive flag, not persisted autoMode.
---

# Customer AI Live Trading ARMED visual must follow session-arm, not persisted enable

The customer activation bar (`EnableLiveAITradingBar` in
`trading-dashboard PortalCustomerShell.tsx`) must NOT render the green
"AI EXECUTION ARMED" state from `enabled` (persisted `autoMode`, from
`GET /api/user/ai-trading/state`) alone.

`armedForLive` (`useArmedForLive`) is module-scoped and resets to `false`
on EVERY page load by design. `autoMode` survives a hard refresh — so a
green-armed bar driven off `enabled` alone lies on a live runtime: the
session is disarmed and the server rejects every live order with
`LIVE_BLOCKED_NOT_ARMED` / `runtime_not_armed`.

**Rule:** show green ARMED only when `enabled && (paper-runtime OR
armedForLive)`. Anything else → RED "NOT ARMED" re-arm CTA.

**Why:** users repeatedly hit `LIVE_BLOCKED_NOT_ARMED` after refreshing
while the UI still showed armed. The UI must never claim armed when the
backend would block execution.

**How to apply (fail-closed):** suppress the re-arm requirement ONLY when
runtime is POSITIVELY resolved to paper (`runtimeState?.mode === "paper"`).
While `runtimeState` is undefined (cold load / transient fetch error),
treat an enabled-but-unarmed session as needing re-arm so green ARMED can
never flash before the runtime is confirmed paper. Paper AI keeps firing
server-side regardless of the live ARM flag, so resolved-paper safely
shows active.
