---
name: Jarvis audits reads, not just mutations
description: Why every admin-gated jarvis GET must also call audit(), to satisfy the "admin-gated + audited" invariant.
---

The jarvis "admin/super-admin gated + audited" invariant covers READ endpoints,
not only mutations. Existing `/api/jarvis/*` GET handlers already write
`jarvis_audit_logs` rows on list/read.

**Rule:** any NEW admin-gated jarvis GET must resolve the actor and call
`audit(req, actor, "<area>.<action>", entityType, null, {...})` before responding,
the same as POST/PUT/DELETE handlers.

**Why:** a code review flagged new read endpoints as an invariant breach because
they were gated but not audited, inconsistent with the rest of the surface.

**How to apply:** when adding jarvis read routes, mirror the audit call pattern
used by sibling list endpoints; `audit()` is internally try/caught so it never
breaks the response (fail-safe preserved). Use a stable lowercased action string
like `sovereignty.infra.list`.
