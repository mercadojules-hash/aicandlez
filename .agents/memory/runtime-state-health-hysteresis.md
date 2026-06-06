---
name: runtime-state health hysteresis
description: Why a single failed exchange balance poll must never tear down a live runtime, and the grace-window pattern that prevents it.
---

# Runtime-state venue-health hysteresis

The `GET /user/runtime-state` aggregator derives a customer's runtime `mode`
(`paper`/`live`), `healthyLive` set, and headline equity from a per-connection
balance poll. The poll has **no retry and no hysteresis**: a single transient
exchange failure (e.g. Coinbase 429 / timeout / 5xx / credential-refresh hiccup)
returns `ok:false`.

**Why this is dangerous (the cascade):** one bad poll empties `healthyLive` →
`mode` resolves `"paper"`, which then:
- (a) For **parallel-cohort** users (`multiExchangeParallel=true`), the cohort
  writeback **demotes** the venue's `tradingMode` `live→paper` in
  `user_exchange_connections`. The engine's live OPEN fan-out
  (`listLiveExecutionUsers`, predicate `status="active" && tradingMode="live"`)
  then drops the user, so **new live entries stop**. Open positions keep exiting
  because exits resolve by `userId + exchange + status`, NOT `tradingMode`.
- (b) The client `RuntimeSwitcher` effect sees `mode==="paper"` and fires
  `setArmedForLive(false)` (per-session ARM lost) and the headline equity flips
  from the live balance to the paper-sim account balance — the alarming
  "equity jumped from \$2.4k to \$122k + SYNC FAILED + disarmed" symptom, with no
  user action.

**Rule:** runtime health must be hysteretic, not instantaneous. Keep a venue
"effectively healthy" for a grace window (`RUNTIME_HEALTH_GRACE_MS`, default
180000ms ≈ 6 poll cycles) after its last successful poll, and retain
last-known-good equity during the blip so the headline holds steady. A sustained
outage (failures beyond the window) still demotes correctly.

**Why grace is real-money safe:** runtime-state is advisory only. Execution
(`placeLiveAutoOrderForUser`, manual `/user/live-order`) re-verifies the broker
at order time via `getAccount()` + the live cash probe, so grace can never route
money to a genuinely-down venue. The transient poll also never changes the
persisted `status` column (still `"active"`), so it was always a soft signal
being treated as a hard verdict.

**Keying invariant:** hysteresis state is keyed by connection `row.id`, but the
`effectivelyHealthy` set the downstream filters use is keyed by exchange NAME.
Safe ONLY because of `unique(user_id, exchange)`. If that index is dropped,
switch the filters to key by id.
