---
name: Broker-accept-without-position integrity gap (per-symbol dedup)
description: A real-money broker fill can be accepted upstream but produce no customer position row when a same-user+symbol position is already open — the per-symbol single-position guard drops the mirror write.
---

# Broker accepted, no position row (untracked fill)

The customer live fan-out submits the broker order in `placeLiveAutoOrderForUser` (liveUserExecution.ts) and logs `execution_order_accepted` on fill, THEN separately calls `registerLiveUserFill` (in tradingLoop.ts) to write `sim_positions`. These two steps are not transactional.

**Observed:** A second concurrent same-symbol BUY for the same user was accepted/filled at the broker, but no `sim_positions`/`sim_trades` row was created and it was not folded into the existing open position (quantities matched the individual earlier fills, not a sum). The first same-symbol position was still open at the time and closed later by TP. Net effect = real money spent at the broker with no tracked customer position.

**Why:** the per-user position store enforces one open position per `user+symbol`; the dedup happens at the mirror-write step, AFTER the broker order already submitted and filled. A `registerLiveUserFill` throw is only logged as a pino warn ("failed to mirror fill into sim registry") — invisible in the DB `logs` table.

**How to apply / harden:** before submitting the broker order, pre-flight check whether the user already has an open position for that symbol (reject pre-submit), OR make the mirror-write idempotent/averaging so an accepted fill is never silently dropped, OR run a periodic reconciliation that alerts when `execution_order_accepted` count != position/trade-row count per user. Surface this rather than swallowing it in a pino warn.
