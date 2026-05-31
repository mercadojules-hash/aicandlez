---
name: Production DB lives on Render, not Replit Deployments
description: How to run read-only verification against the REAL production database for this project.
---

The app deploys on **Render** (auto-deploy from `origin/main`), and production data lives in a
**Render-hosted Postgres**, addressed by the `RENDER_PROD_DATABASE_URL` secret.

**Why:** `executeSql({ environment: "production" })` targets Replit's *managed Deployments* replica,
which this project does NOT use — so it returns `relation "users" does not exist` (empty/unprovisioned).

**How to apply:** For read-only prod verification, connect with `pg` using
`process.env.RENDER_PROD_DATABASE_URL` (SSL `rejectUnauthorized:false`), wrap in
`BEGIN; SET TRANSACTION READ ONLY;` and only run SELECTs. `pg` is not resolvable from the workspace
root in code_execution — require it by absolute path
(`node_modules/.pnpm/pg@<ver>/node_modules/pg`) from a node script, or run inside a package that
declares `pg` (lib/db). Never print the connection string.

## Schema drift is a prod-down trap: dev `drizzle-kit push` does NOT reach Render prod

Adding a column to the Drizzle schema and running `pnpm --filter @workspace/db run push`
applies it to **dev (`DATABASE_URL`) only**. Render prod is a separate DB; nothing in the
deploy syncs app-schema (only Stripe migrations run on boot via `api-server src/migrate.ts`).
Once the new code deploys to prod with the column in the schema, prod breaks.

**Why it's worse than it looks:** Drizzle emits an **explicit column list for BOTH reads and
writes** (never `SELECT *`). So a column present in the schema but missing in the prod table
makes *every* `SELECT` and `INSERT` on that table throw `column "<col>" does not exist`. The
whole affected-table data layer goes down in prod — e.g. `loadFromDB`'s `.select()` throws, so
the in-memory registry hydrates empty (Open Positions 0, empty feeds, $0 P&L), AND live fills
fail to persist (real money spent, no row). Reads break, not just writes.

## Per-user tables are keyed by Clerk user ID, NOT users.id UUID

`sim_positions`, `sim_trades`, `sim_accounts`, `user_settings`, and
`user_exchange_connections` all store `user_id = users.clerk_user_id` (the
`user_3...` string from `req.clerkUserId`), NOT the `users.id` UUID.

**Why:** every per-user route resolves `userId = (req).clerkUserId` and passes
that straight into the registry/DB; the `users` table UUID PK is never used as
the foreign key.

**How to apply:** When verifying a user from their email, first read
`users.clerk_user_id` and query all per-user tables with THAT value. Querying
those tables with `users.id` (the UUID) returns 0 rows and falsely looks like
"the write path never persisted" — it's just the wrong key.

## Verifying whether prod is running fresh code (Render deploy boundary)

The Replit dev container CANNOT trigger a Render deploy or set/read Render service env. Pushing
to `origin/main` (GitHub) only makes code *available*; the live process restarts only when Render
redeploys. To check if prod is on a given commit WITHOUT Render access: compare the running
engine's `startedAt` (`GET /api/engine/status`, unauthenticated) against the commit's
`git show -s --format=%ci`. If `startedAt` precedes the commit time, prod is on OLD code — full
stop, env vars are irrelevant. You can also infer the effective `maxActivePositions` from
`executionFunnel`: `reachedExecution>0` with `passedPositionLimits==0` ⇒ Gate 1 saturated
(openBook >= cap). New `render.yaml` env keys are NOT live until Render syncs the blueprint /
redeploys — declaring `value: "12"` in render.yaml does nothing to the running process by itself.
Immediate no-redeploy unblock = admin `PUT /api/settings` (`maxActivePositions`/`n`) runtime
override, but that needs an operator Clerk session (the dev container has none).

**How to apply:** Any time you change the app schema, you MUST also apply it to
`RENDER_PROD_DATABASE_URL` (additive nullable cols: `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`
via a direct `pg` connection — `executeSql` prod is read-only and points at the wrong/empty
replica). Prefer additive+nullable so old rows stay valid. Confirm before any prod DDL; it's a
real-money database. Long-term durable fix: make prod schema sync part of the Render deploy
(push against prod, or tracked migrations) instead of dev-only `push`.
