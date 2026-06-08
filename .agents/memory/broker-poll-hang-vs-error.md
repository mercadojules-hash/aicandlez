---
name: Telemetry broker-poll hang vs error
description: Why error-swallowing isn't enough for customer telemetry endpoints that read live broker balances inline
---

# Customer telemetry must TIMEOUT its inline broker poll, not just catch errors

`loadBalanceForRow` (and the live-balance aggregation that wraps it) swallows
broker **errors** and returns `{ok:false}`. But a broker **hang** (slow / rate-
limited / stalled connection) is not an error — the promise simply never
resolves. Any customer telemetry endpoint that `await`s the live-balance
aggregation INLINE before responding will then block the whole response until
the client/proxy aborts → the panel's query goes `isError` → a sticky
"unavailable" banner (worsened by `retry:false`). Meanwhile runtime-state has
its own cache/hysteresis, so the exchange still "appears connected" — a
confusing split symptom.

**Rule:** bound each per-connection broker poll with a `Promise.race` timeout
(~8s) that degrades THAT connection to a dashed live block (set `balanceError`)
while fast connections + all non-broker KPIs still return. Keep the active-
connection count incremented BEFORE the await so `hasLiveExchange` stays true and
the UI shows dashes, never the misleading virtual fallback.

**Why:** prod incident — two live customers saw "Managed performance unavailable
— retrying" with telemetry never populating; root cause was the unbounded inline
broker await, not a 500 (route deployed, no schema drift, DB reads fine).

**How to apply:** any new/edited customer-facing endpoint that reads live
exchange balances for DISPLAY must timeout-bound the broker call and degrade to
null (dash) — never block the response, never fabricate. Pair with FE
`keepPreviousData` semantics + a banner gated on `!data` so a transient refetch
failure keeps last-good numbers visible. Display-only; never on the execution/
risk/sizing path.
