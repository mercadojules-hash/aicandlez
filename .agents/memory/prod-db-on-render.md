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

**How to apply:** Any time you change the app schema, you MUST also apply it to
`RENDER_PROD_DATABASE_URL` (additive nullable cols: `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`
via a direct `pg` connection — `executeSql` prod is read-only and points at the wrong/empty
replica). Prefer additive+nullable so old rows stay valid. Confirm before any prod DDL; it's a
real-money database. Long-term durable fix: make prod schema sync part of the Render deploy
(push against prod, or tracked migrations) instead of dev-only `push`.
