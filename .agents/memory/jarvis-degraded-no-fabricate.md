---
name: Degraded reads must not fabricate numbers
description: Jarvis Historical Intelligence fail-safe — a degraded read/write path that emits numeric zeros silently fabricates real-money performance; degrade to null/dash and skip degraded persistence.
---

# Degraded reads must never fabricate numbers (null/dash, not zero)

A "fail-safe" aggregation path that returns an all-zeros struct on a failed read
LOOKS safe (no throw, 200 response) but it **fabricates real-money performance** —
the UI happily renders "$0 P&L, 0% win rate" as if it were true.

**Rule:** when a money/trade read degrades, every numeric metric must propagate to
the frontend as `null` and render as a dash (`—`), never `0`. The server may carry
placeholder zeros internally, but it MUST also carry a `degraded` flag, and the UI
must check that flag and override ALL numeric cells to dash (do not trust the
zeros). Comparison/delta badges computed from degraded sides must also dash out.

**Persistence corollary (worse):** a degraded snapshot/trend writer that upserts
zero-valued cumulative rows permanently **pollutes the historical series** with
synthetic data points. Distinguish a *core* read failure from a secondary/optional
one (e.g. point-in-time open positions): if the CORE read failed, SKIP the write
entirely (leave the day absent → renders as a gap/dash) rather than persisting a
fake $0 row. Only persist when the core aggregate is real.

**Why:** caught in architect review of the Historical Intelligence layer — the
degraded empty-stats struct set closedTrades/realizedPnl/grossProfit etc. to 0 and
the page rendered them as real, and captureDailySnapshot upserted those zeros into
the growth curve.

**How to apply:** any new fail-safe aggregation over `sim_trades`/equity for an
exec/reporting surface. Pattern: server returns `{...metrics, degraded:true}`;
UI gates on `degraded` → dash; writers gate on `coreDegraded` → skip upsert.
