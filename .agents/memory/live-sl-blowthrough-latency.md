---
name: Live SL blow-through = monitor latency, not stop math
description: Why LIVE stop-loss exits closed at -4% to -5.4% on a 2% stop, and the multi-tier + fast-cadence fix.
---

# Live stop-loss blow-through is a LATENCY problem, not a stop-price problem

LIVE STOP_LOSS exits were closing at -4% to -5.4% on a configured 2% stop. The
stop price was correct; the monitor just reacted too slowly.

**Root cause (two compounding delays):**
1. The per-user hard-stop monitor (`runHardStopMonitor` in
   `tradingLoop.ts`) ran ONLY on the 60s analysis tick (`LOOP_INTERVAL_MS`).
2. The LIVE SL path used multi-tick confirmation (stabilization grace + N
   consecutive breaches) → up to ~120s of additional drift.
   The only fast path was a `LIVE_STOP_CATASTROPHIC_MULT` backstop at ~-5%,
   so a fast adverse move rode the grace/confirm window all the way down to
   the catastrophic level before exiting.

**Fix (LIVE branch only — paper SL exits on raw breach, untouched):**
- Dedicated FAST cadence `STOP_MONITOR_INTERVAL_MS` (default 10s, bounds
  2s–60s) running the monitor independently of the 60s analysis tick.
- A re-entrancy guard (`stopMonitorRunning` flag, `runHardStopMonitorGuarded`)
  shared by BOTH the 60s tick and the fast interval so they can never overlap
  and double-fire a close.
- A new IMMEDIATE-fire SL tier (`LIVE_STOP_IMMEDIATE_FRACTION`, default 0.25)
  that bypasses grace + confirmation once breach runs ≥ fraction×stopDistance
  past the stop (~-2.5% for a 2% stop), sitting BETWEEN the buffered-confirm
  tier and the catastrophic tier.

**Why:** capital protection — cap the realized loss near the intended stop
instead of letting microstructure-noise protection (the P1 spread/confirm fix)
become a downside blow-through hole.

**How to apply / invariants:**
- The immediate band MUST stay inside the catastrophic band
  (`LIVE_STOP_IMMEDIATE_FRACTION < LIVE_STOP_CATASTROPHIC_MULT - 1`) or the
  immediate tier never fires before catastrophic — boot logs a
  `LIVE_STOP_IMMEDIATE_DETUNED` warning if violated.
- Any new real-money exit cadence must be guarded against self-overlap.
- `HARD_STOP_TRIGGERED` log now carries `slTier`, `executionPrice`,
  `slippageVsStopPct`, `excursionVsEntryPct` — use these in prod to confirm SL
  closes cluster near -2% to -2.5%, not -4% to -5%.
- Before re-investigating the stop SCORER/price math for "stops too wide",
  check monitor CADENCE + confirmation latency first.
