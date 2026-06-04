---
name: How prod deploys (Render autoDeploy)
description: What "deploy to prod" actually means for AICandlez and what the agent can/can't do.
---

Production is **Render**, not Replit Deployments. Every service in `render.yaml`
(`aicandlez-api`, `-trade`, `-admintrade`, `-dashboard`, `-app`, `-landing`) has
`autoDeploy: true` watching the GitHub `origin/main` branch.

**Deploy mechanism:** when a merged commit lands on `origin/main` (GitHub repo
`mercadojules-hash/aicandlez`), Render auto-builds + ships it. No manual trigger is
needed and the agent has **no way to force a Render build** (no Render API/CLI
configured; `git push` is forbidden to the agent anyway). The platform's
checkpoint commit already reaches `origin/main`, so "deploy" usually just means
"wait for Render autoDeploy (a few minutes)".

**Why this matters:** `suggestDeploy()` / `getDeploymentInfo()` point at a
*separate* Replit autoscale target (`trade-sentinel-mercadojules.replit.app`),
NOT the real `aicandlez.com` prod. Don't tell the user to "click Publish" for a
prod change — that's the wrong surface.

**How to verify a deploy went live:** there is no build-SHA endpoint, so pick a
DB-observable behavior change unique to the commit and watch for its cutover
timestamp. Strongest marker: query the Render prod DB
(`RENDER_PROD_DATABASE_URL`) for evidence the new code ran (e.g. a brand-new
`sim_trades.close_reason` value, or `sim_positions.size_usd` diverging from the
old flat $20 to true per-exchange notional like Coinbase $50 — new rows after the
deploy minute carry the new value while older rows keep the old), or
`curl https://api.aicandlez.com/api/engine/status`
(public; counters reset on each Render restart). The public engine status +
prod-DB row evidence are the agent's only prod observability — Render runtime
logs are not fetchable via `fetchDeploymentLogs` (that's Replit-deploy only).

**Note:** the `origin` remote URL historically embedded a GitHub PAT in plaintext
— if seen again, advise rotating it; never echo it.
