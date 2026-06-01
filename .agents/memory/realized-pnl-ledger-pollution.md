---
name: Realized P&L ledger & incident pollution signature
description: Where operator/customer realized P&L comes from, and how to tell legitimate fills from legacy incident pollution in sim_trades.
---

# Realized P&L ledger and incident-pollution signature

The realized-P&L number an operator/customer sees is the persisted running ledger
`sim_accounts.total_realized` (per user_id). It is **net of app fees**
(`realized_pnl - entry_fee - exit_fee`), not gross. It is NOT recomputed live from
`sim_trades` on read — it is a stored counter, so it can carry stale/legacy values
that no longer reflect verifiable broker fills.

`trades` (global book) vs `sim_trades` (per-user book) are separate. Operator/customer
realized comes from the per-user `sim_trades` + `sim_accounts`, NOT the global `trades`
table. The admin `LiveAccountPanel` ("Kraken proof-of-performance") sums `mode="live"`
rows client-side, but in practice operator accounts may be role=`user` and view the
customer realized surface instead.

## Legitimate vs polluted rows in sim_trades
- **Legitimate / verifiable**: `exchange IS NOT NULL` AND `exchange_order_id` /
  `exchange_close_order_id` present → a real broker fill, attributable.
- **Incident / legacy pollution**: `exchange IS NULL` AND `exchange_order_id IS NULL`
  AND `close_reason='RECONCILED_BACKLOG'`. These are synthetic bulk closes — positions
  opened during an incident, left open, then force-closed in a single batch (their
  `exit_time` values cluster within a few seconds of each other). They are not
  verifiable against the broker and pollute `total_realized`.

**Why:** The pre-attribution unlimited-position incident (~May 2026) left positions
that were later mass-reconciled with no exchange attribution. The losses are real-ish
but unverifiable; the clean post-fix figure = `SUM over sim_trades WHERE exchange IS
NOT NULL` only.

**How to apply:** To rebuild a trustworthy realized figure, recompute from
`exchange IS NOT NULL` rows (net of fees) and overwrite `sim_accounts.total_realized`.
Any reset/reconciliation tool must (1) be operator/admin-only, (2) write to PROD
(Render DB, not the empty Replit replica), (3) ideally soft-handle the backlog rows
(tag/exclude rather than hard-delete) so the audit trail survives.
