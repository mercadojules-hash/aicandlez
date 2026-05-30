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
