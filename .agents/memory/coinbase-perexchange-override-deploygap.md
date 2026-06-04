---
name: Per-exchange size override ignored = running build, not source
description: When a per-exchange trade-size override is set in DB but every live fill uses the global size, suspect a deploy/version gap, and don't use max-hold behavior as proof of the running build.
---

# Per-exchange size override ignored in prod

Symptom: a customer set a per-exchange trade-size override (e.g. Coinbase $50)
in `user_exchange_settings`, but 100% of that venue's live fills keep using the
global preset ($20), never the override — for many consecutive fills over days.

**The source path can be fully correct and this still happens.** Verified
end-to-end on origin/main: fan-out passes `targetExchange` → gateway
`{trigger, ...legacyReq}` preserves it → `placeLiveAutoOrderForUser` 0PAR loads
`perExchangeTradeSize` by `(userId, req.targetExchange)` → 0SIZE assigns
`sizeUSD = perExchangeTradeSize ?? global`. DB returns the override row cleanly
(exact-match join, no casing/schema drift), role=user (non-operator so 0SIZE
applies), feature commit is an ancestor of HEAD. Everything reads $override, yet
result is $global.

**Conclusion when code+DB+schema+git-ancestry all say override but result is
global: it's a RUNTIME/DEPLOY gap — the running process predates the
per-exchange-size code (the override branch literally isn't in the running
binary), so every leg falls through to the global size.** Not a source bug.

**Why:** Render builds origin/main on push, but the agent can't force a build,
can't read the live deployed SHA, and Render deployment logs are not accessible
from this environment (fetch_deployment_logs returns empty). So you cannot prove
the running build statically.

**Inference trap (the important part):** do NOT use exit/max-hold behavior as
proof that "the latest build is deployed." Max-hold resolves via
`perExchange ?? account ?? env(LIVE_POSITION_MAX_HOLD_MS)/3.6e6 ?? EXIT_DEFAULTS`
(exitConfig.ts resolveFrom). A 1h max-hold can therefore be live on an OLD build
purely via the `LIVE_POSITION_MAX_HOLD_MS` env default — it says nothing about
whether a newer code commit (e.g. per-exchange size) is running.

**How to apply / confirm (read-only can't finish it):** verify the deployed
Render commit actually includes the per-exchange-size code and redeploy/restart;
after restart the next fill on that venue should jump to the override size. If it
is already on the newest commit and still wrong, add one structured log at the
0SIZE assignment (resolved venue + perExchangeTradeSize + final sizeUSD) and
watch one tick. Any actual size change is a real-money locked invariant → needs
user sign-off; the audit itself stays read-only.

Bonus schema note: `sim_trades`/`sim_positions` `entry_time`/`exit_time`/
`duration_ms` are bigint epoch-ms (compare with raw ms, not `to_timestamp`),
whereas `logs.timestamp` is a real timestamptz.
