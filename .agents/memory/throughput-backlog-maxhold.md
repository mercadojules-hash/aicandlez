---
name: Throughput/concurrency analysis trap + live max-hold gap
description: How to read open-position concurrency when comparing exit configs, and a possible live max-hold enforcement gap
---

# Throughput vs exit-config comparisons

When asked "did a new exit config (e.g. wider TP/trailing) reduce throughput by holding positions longer", separate two independent effects before concluding:

1. **Closed-trade hold time** — derive from `sim_trades.duration_ms`. A wider TP/trail only lengthens holds on *winning* trades; in an all-stop-loss stretch, closed holds get SHORTER, not longer (fast 2% SL exits dominate).
2. **Concurrent-open / capital integral** — `avg concurrent open = Σ overlap(position interval, window) / window`. This can balloon from a **pre-existing backlog of still-open positions that predate the config change**, NOT from the new config. Always check when the open positions were *created* relative to the activation boundary before blaming the new config.

**Why:** During a TP4→TP10 comparison, one QA account's avg concurrent jumped ~4→~19.6 and deployed capital ~$60→~$282, which *looks* like the new config hoarding positions — but the rise was a backlog of OLD-era (TP4) positions created before activation that simply hadn't closed. Closed-trade hold time actually *fell* (3.03h→0.56h) and open rate *rose*. Misattributing this to the new config would be wrong.

**How to apply:** Compute the avg-open/capital integral with `GREATEST(0, LEAST(exit_or_now, win_end) - GREATEST(entry, win_start))`; bucket currently-open positions by age and by created-before/after the activation boundary; only then judge the config's effect.

# Possible live max-hold enforcement gap (FLAG, not root-caused)

Several **live** (`exchange IS NOT NULL`) `sim_positions` were observed open **40–56h** with non-zero notional (e.g. AVAXUSD/LINKUSD ~$10) — well past the documented **24h max-hold** that is supposed to be ON + price-independent for live exits. Some sibling rows had $0.00 notional (XLMUSD dust/zombie). Not confirmed bug vs. dust-skip vs. monitor miss. If revisiting live exit governance, verify `runHardStopMonitor`/max-hold actually closes aged live positions and isn't skipping non-dust rows. Real-money positions stuck open past max-hold tie up slots + capital and (for non-exempt customers) would choke new-trade throughput via the concurrent cap.

**Note:** the two accounts in this analysis (one pro, one starter) are both `is_internal_account=true` → exempt from concurrent caps, so the backlog did NOT block their new opens (open rate rose). A normally-capped customer with the same backlog WOULD be starved at the per-plan concurrent cap.
