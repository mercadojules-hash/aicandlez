---
name: Per-exchange/global live size not honored — deployed-code bug, NOT a deploy gap
description: Every live fill records the same flat size regardless of per-user global or per-exchange overrides. Earlier "deploy gap" theory is DISPROVEN; treat as a deployed-code size resolution/recording issue and prove the running build via reconciler-fired evidence, not max-hold.
---

# Live fill size ignores per-user config (override + global)

Symptom: live fills record one flat size for everyone — a per-exchange override
(teedelgado Coinbase $50) AND a sub-preset global (mixtapepsd global $10) are
BOTH ignored; every fill records $20 (teedelgado Kraken global=$20; coincidence).

**DISPROVEN earlier theory:** this was first called a deploy/version gap (prod
running a build that predates the per-exchange-size code). That is WRONG.

**How the running build was proven current (read-only):**
- The zombie reconciler (`reconcileZombiePosition`, commit ~June 2) **fired in
  prod** — `sim_trades.close_reason=RECONCILED_INSUFFICIENT_FUNDS` /
  `reconciliation_tag=ZOMBIE_INSUFFICIENT_FUNDS`, fresh rows. A live reconcile
  proves the running binary is AT/AFTER that commit, which is AFTER the
  per-exchange-size commit (older). So the size code IS deployed.
- Prod process `startedAt` ≈ the 1h-max-hold commit time, and 1h max-hold is
  live. origin/main tip contains both features. Conclusion: **prod == origin/main
  tip; NOT behind. Deploying changes nothing (only docs commits were unpushed).**

**So it's a deployed-code logic/recording issue, not a deploy gap.** Candidate
mechanisms to check next (could not finish read-only): (a) gate-0SIZE
`sizeUSD = preferred` is computed but the value RECORDED into
`sim_trades.size_usd`/the mirror-write uses the engine fan-out `sizeUSD` instead
of the gate-resolved size (recording bug — broker may actually fill the right
size); (b) a later clamp (buying-power/risk) resets it; (c) `coerceTradeSizeToPreset`
maps non-preset globals to `DEFAULT_TRADE_SIZE_USD` (=10) — note ALLOWED sizes
are [10,20,50,100], so $10 global is a VALID preset and should NOT coerce to $20,
which rules out coercion as the cause of mixtapepsd's $10→$20.

**Verification limit (durable):** there is NO build-SHA endpoint — `/api/healthz`
returns a hardcoded `version:"0.0.0"`. Render's deployed SHA cannot be read from
this env (`fetch_deployment_logs` empty; suggestDeploy/getDeploymentInfo point at
a DIFFERENT Replit target, not aicandlez.com). Prove the running build by RUNTIME
EVIDENCE (a feature's side effects appearing in the DB), not by SHA. Permanent
fix = add a `/api/version` endpoint surfacing `RENDER_GIT_COMMIT`.

**Inference trap (still true):** do NOT use max-hold behavior as proof of the
running build — 1h max-hold can be env-driven (`LIVE_POSITION_MAX_HOLD_MS`) on any
build. Use a feature whose DB side effect is unambiguous (the reconcile tag).

Any actual size-path change is a real-money locked invariant → user sign-off
required; the audit stays read-only.

Bonus schema note: `sim_trades`/`sim_positions` `entry_time`/`exit_time`/
`duration_ms` are bigint epoch-ms (compare with raw ms, not `to_timestamp`),
whereas `logs.timestamp` is a real timestamptz.
