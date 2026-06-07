---
name: architect includeGitDiff isolation false-positive
description: Why architect repeatedly flags "isolation breach / non-scoped files" even when the working tree is clean, and how to verify.
---

When reviewing an isolated/scoped sprint (e.g. the `jarvis` product, which must
touch only `jarvis_`-prefixed tables + `/api/jarvis/*` + `artifacts/jarvis/*`),
`architect({ includeGitDiff: true })` will repeatedly return a BLOCKING
"isolation breach — commit bundle includes non-scoped files (tradingLoop,
exchangeEngine, PWA/dashboard, render.yaml, ...)" finding.

**Why:** the architect's diff is computed against a base branch that already
contains earlier committed work from prior sprints — it is NOT limited to the
current uncommitted change set. So pre-existing committed AICandlez files show up
in its view and get mis-attributed to the sprint under review.

**How to apply:** before acting on an architect "isolation breach" verdict,
verify the ACTUAL working-tree scope with `git --no-optional-locks status
--short`. If that shows only in-scope files, the breach is a false positive —
do NOT try to "remove" AICandlez files (they aren't yours to touch). Treat the
architect's other findings (correctness, determinism, access-control) on their
own merits; only the git-diff-scope finding is unreliable here.
