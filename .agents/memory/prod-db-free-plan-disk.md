---
name: Prod DB schema-drift recurrence + Render free-plan disk ceiling
description: How to diagnose a prod-only 500 that works in dev, and the prod Postgres capacity hazard behind intermittent write failures.
---

# Prod-only 500 that works in dev → suspect SCHEMA DRIFT first

**Rule:** when a deployed endpoint hard-500s in prod but is fine in dev, pull the
ACTUAL error from Render logs before theorizing about runtime hangs/timeouts.
A `_DrizzleQueryError` whose message is `Failed query: select "...long column
list..."` means Drizzle's default select named a column the PROD table lacks
(dev got `drizzle-kit push`, prod did not). Confirm by diffing dev vs prod
`information_schema.columns` (script pattern: connect to both `DATABASE_URL` and
`RENDER_PROD_DATABASE_URL`, report columns in dev missing from prod). Fix =
additive idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` against
`RENDER_PROD_DATABASE_URL`; Drizzle rebuilds SQL from schema every call so the
fix takes effect immediately, NO redeploy.

**Why:** a managed-performance outage was first mis-diagnosed as a broker-poll
hang and "fixed" with a timeout/retry/CSS deploy that changed nothing, because
the request never reached the broker poll — it died at a `sim_trades` select
referencing 11 MFE/MAE/eff columns present in dev/schema but missing in prod.
Recurring drift offenders that session: `sim_trades` (11 cols),
`user_settings.trading_mode_preset`, and the whole `account_reconciliations`
table. The cross-database column diff catches ALL of them in one pass — always
run the full audit, never whack-a-mole one table.

# Render prod Postgres is a CAPACITY hazard

`aicandlez-db` (`dpg-d86c35t7vvec73dkqirg-a`) runs on Render's **FREE** Postgres
plan: **~1 GB hard storage cap** and **auto-expires/deleted ~30 days**. At ~851
MB it intermittently throws `could not extend file … No space left on device`,
which fails WRITES (new files: CREATE TABLE/INDEX, and any heap extension) while
catalog-only changes (ADD COLUMN with no rewrite) can still squeeze in. So a
schema reconciliation can partially apply: cheap ALTERs succeed, CREATE TABLE
fails on the same DB.

**Space hogs (append-only telemetry, unbounded):** `signals` ~466 MB,
`user_notifications` ~182 MB, `logs` ~139 MB, `risk_throttle_events` ~26 MB.
Plain DELETE+VACUUM reuses space WITHIN a table but does NOT return it to the OS
(so it won't unblock a CREATE TABLE); only TRUNCATE/DROP/`VACUUM FULL`/pg_repack
or a plan upgrade frees OS space. TRUNCATE of prod telemetry is destructive —
get explicit owner sign-off; never prune prod data unilaterally.

**How to apply:** if prod writes fail or a table won't create, check
`pg_database_size` + top `pg_total_relation_size` and the Render plan
(`GET /v1/postgres?ownerId=…`) before assuming a code bug. Long-term fix =
upgrade the Render Postgres plan and/or add retention/pruning to signals/
notifications/logs.
