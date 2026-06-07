---
name: Jarvis Operational Dossier & infra awareness
description: How Jarvis Phase-1 read-only operational awareness is built and the sovereignty constraints governing it
---

# Jarvis Operational Control Layer (Phase 1 — read-only)

Jarvis owns an "Operational Dossier" describing how every managed system is
built, hosted, run, monitored, and recovered. Phase 1 is **read-only
visibility**; P2 (executive approval) and P3 (autonomous w/ governance) must
EXTEND the existing governance spine (evaluateGovernance / approvals / policies),
never reinvent it.

Data model lives in `jarvis_` tables only: systems (architecture / infrastructure
/ build_process narrative), repositories (source repos + a live read-only
awareness cache), runbooks (deployment/rollback/update/monitoring/operational/
disaster_recovery). API surface is `/api/jarvis/*` only, all `requireRole
["admin","super-admin"]`, audited, fail-safe (null → dash in UI).

## GitHub awareness = connectors-sdk proxy, NOT Octokit

The GitHub connector in this monorepo is consumed via `@replit/connectors-sdk`:
`new ReplitConnectors().proxy("github", "/repos/{owner}/{repo}…", {method:"GET"})`
then `.json()`. Do NOT install or use `@octokit/rest` — the connector blueprint
ships the proxy pattern and that is what's wired.

**Why:** I burned a step trying to `packager_install @octokit/rest` (also failed
with ERR_PNPM_ADDING_TO_ROOT). The blueprint snippet returned by addIntegration
uses the proxy SDK; that is the supported path.

**How to apply:** sync is GET-only (read-only promise — Jarvis never writes to a
remote repo). Sync failures are caught and persisted to the repo's
`syncError` + `lastSyncedAt`; the route returns 200 with the row (UI degrades to
dashes) — never a 5xx for an expected external outage. Open-PR count is one page
(`per_page=100`), so >100 open PRs undercount — acceptable at awareness level.

## Sovereignty constraint — secret METADATA only, never plaintext

The long-term "Sovereignty Initiative" extends the dossier to domains, DNS,
Render services, databases, APIs, env vars, **secret locations**, deployment
workflows, recovery procedures. Hard rule the user set: Jarvis tracks secret
*metadata* — what secret exists, which service uses it, where it is stored,
whether it is present/healthy — but must NEVER store plaintext secret values in
executive memory, knowledge retrieval, or conversational context.
