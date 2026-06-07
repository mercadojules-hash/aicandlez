---
name: Governance re-entry on recurrent subjects
description: Why an "approved" gate short-circuit must be reset for recurrent (multi-step) subjects in the Jarvis governance layer, or one approval permanently bypasses policy/trust/budget.
---

The Jarvis governance gate short-circuits to ALLOW when a subject's
`governanceState === "approved"` — this is the resume-pass re-entry path (a human
approved a held subject, next tick it proceeds without being re-held).

**Rule:** that short-circuit is safe ONLY for **one-shot** subjects (command,
delegation, workflow step) — they pass the gate once and then move to a terminal
status, so the approved state is consumed naturally. A **recurrent** subject is
gated repeatedly: an escalation row advances through multiple chain levels, calling
the gate once per advance. For recurrent subjects the approved state MUST be reset
(to the `"none"` sentinel — the column is `notNull().default("none")`, not
nullable) the moment it is consumed, so the NEXT pass re-evaluates fresh.

**Why:** without the reset, a single human approval at level 1 left
`governanceState="approved"`, and every subsequent escalation advance hit the
re-entry short-circuit and skipped policy + trust + budget evaluation entirely —
governance silently *widening* authority over time, which violates the locked
monotonic-narrowing invariant. tsc/typecheck cannot catch this; it's a control-flow
bug only visible by tracing the recurrent subject across multiple ticks.

**How to apply:** any time you add a new governed subject type, ask "is this gated
once, or repeatedly?" If repeatedly, the action that consumes an approval must clear
the approved state in the same write that advances the subject. The fresh-allow path
is already safe (gate stamps `"allowed"`, not `"approved"`); only the human-approved
re-entry value triggers the bypass.

**Bonus (spec reading):** "advisory-safe / no deletes" in the governance spec
governs the automated *evaluation/runtime* (it never deletes data, only narrows) —
it does NOT prohibit admin CRUD DELETE endpoints for managing policies/budgets.
Those follow the same RegistryView admin-delete pattern as every S1–S6 registry. An
architect flag of "DELETE routes violate no-deletes" is a false positive here.
