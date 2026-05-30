---
name: Why trade activity dropped (May-15 era vs late-May)
description: The dominant cause of "fewer trades now" is the testMode default flip + layered execution gates, NOT confidence-formula drift.
---

# Trade activity fell because gates were added/enabled, not because the scorer changed

The per-TF + MTF confidence scorer is essentially unchanged (see confidence-pipeline.md). The drop in trade activity comes from the execution PATH being progressively gated through late May 2026.

## The dominant cause: testMode default flip
- `engineStats.testMode` default was `true` through ~May 15, flipped to `false` by default on ~May 26.
- testMode is a master bypass in the tick decision block: it drops `confThresh` to ~20, and forces `volumeGatePass`, `sidewaysGatePass`, `trend1HGatePass` true, and enables `testSingleTF` (single-TF signal at conf≥25). So with testMode ON, almost any weak signal trades immediately with NO MTF/volume/sideways requirement.
- With testMode OFF, `shouldTrade` needs `(mtfConfirmed || highConfOverride)` where `highConfOverride` requires `avgConfidence ≥ 60` (rare; live confDistribution mean ~22, gte60 ~1%). MTF confirmation (both 5m+15m agree + trend aligned) is rare in choppy markets. → near-zero opens.

## Layered execution gates added after May 15 (each subtracts activity)
- Hard live confidence floor (added ~May 18, `LIVE_EXECUTION_MIN_CONFIDENCE`; later relaxed 80→65→`EXPERIMENT_CONF_FLOOR=50`).
- Per-customer live execution bridge / gate stack (`placeLiveAutoOrderForUser`, ~May 22): kill switch, symbol-universe, volume-safety, user-status, AI-enabled, daily cap, platform concurrent cap (3→25), liquidity cushion, risk budget, AI-disclaimer, low-confidence gate 0f (BASELINE_MIN_CONFIDENCE).
- Customer portal reverted to PAPER-only by default (~May 23) — customers aren't live unless they opt in.
- LOW-CONFIDENCE FILTER `executionEligible` (~May 26): requires MTF + conf≥baseline + non-sideways + non-HOLD before a signal is execution-eligible.
- Liquidity protection + size controls (~May 27); duplicate (userId,symbol) fan-out collapse (~May 28); Unified Execution Gateway (~May 28, behavior-preserving).

## How to apply
When asked "why fewer trades than before," do NOT re-investigate the confidence formula. Check, in order: (1) is testMode on/off, (2) which execution gates exist now that didn't in the old era, (3) customer paper-vs-live default. Recent loosening (volume 85→65%, floor 80→65→50) pushes the other way but is dwarfed by testMode OFF + MTF requirement.
