---
name: Customer funnel window vs persisted P&L
description: Per-customer execution funnel counters are in-memory since-process-start; mixing them with all-time persisted sim_trades stats is misleading unless the window is scoped/labeled.
---

# Customer funnel window vs persisted realized P&L

`customerExecutionAttribution.getCustomerFunnel(userId)` returns
`{ since, attempts, successes, failures, ... }` where the counters are an
**in-memory, since-process-start** rolling tally. They reset to zero on every
Render restart / redeploy.

By contrast, realized performance (win rate, profit factor, avg win/loss, P&L,
closes-by-reason) is computed from **persisted, all-time** `sim_trades`.

**Rule:** any report that puts an attempt→fill conversion next to all-time
realized stats MUST carry the funnel's `since` timestamp through to the response
and the UI must scope/label that conversion ("since engine start"). Do not
present a since-boot conversion as if it shared the all-time window — after a
restart attempts/fills read near-zero while P&L history is intact, so an
unlabeled ratio looks broken or lies.

**Why:** code review flagged this exact conflation in the consolidated profit
report (P7). Fix was to add `funnelSince` to the report shape rather than try to
make the funnel persistent.

**How to apply:** when building per-customer dashboards that blend live-order
funnel telemetry with trade history, treat the two as different time windows;
label or filter, never silently merge.
