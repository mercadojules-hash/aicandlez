---
name: Jarvis reads AICandlez live data only through a one-way fail-safe boundary
description: How the isolated Jarvis product is allowed to surface AICandlez trading data without breaking either product's isolation.
---

Jarvis is an isolated product (writes only `jarvis_` tables, serves only
`/api/jarvis/*`, admin-gated). It is allowed ONE cross-product read: a live
AICandlez snapshot, surfaced via `GET /api/jarvis/integrations/aicandlez` (and
embedded in the executive-briefing aggregate).

The boundary rules (all load-bearing — a future "improvement" that breaks any
one of them re-couples the two products or leaks misleading data):
1. **Read-only.** SELECT against `sim_positions`/`sim_trades` only. Never mutate
   AICandlez tables; never call any AICandlez execution/trading module — import
   nothing from that side, query the DB directly.
2. **Live-only, never paper.** Filter `exchange IS NOT NULL` (= live fills);
   exclude reconciled/backlog rows from realized P&L. Paper/simulated numbers
   must NEVER appear in the Jarvis AICandlez panel.
3. **Fail-safe.** The endpoint never throws; on any error or unavailable metric
   it returns a degraded payload with that metric `null`, which the UI renders as
   a dash. Equity/cash are dashed unless reliably derivable from the tables.

**Why:** the user explicitly authorized Jarvis to show *live* AICandlez data;
isolation otherwise forbids cross-product coupling. Reading live rows directly
keeps Jarvis decoupled from AICandlez code while honoring the request, and the
live-only + fail-safe rules stop the executive view from ever showing paper or
crashing on a transient gap.

**How to apply:** any change to the AICandlez panel/feed must preserve all three
rules. Do not add an import from the AICandlez execution side, do not relax the
`exchange IS NOT NULL` filter, and do not let a missing metric throw instead of
dashing.
