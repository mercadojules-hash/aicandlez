---
name: Confidence pipeline (execution vs display)
description: Why displayed signal confidence dropped from 80-95 to ~30-50; the two-layer split and that execution confidence never drifted.
---

# Confidence is TWO separate numbers — never conflate them

The engine produces two confidence values per symbol. Conflating them causes false "calibration drifted" reports.

1. **EXECUTION confidence = `avgConfidence`** (the MTF fusion in `tradingLoop.ts`).
   - Per-TF source: `runAIDecision()` in `aiReasoning.ts` → `confidence = clamp(10,98, (|totalScore|/maxScore) * 150)`, `maxScore=5.7`.
   - This formula has been **byte-identical since the engine's first version (May 1 2026)**. It structurally maps typical weak-alignment `totalScore` 0.5–1.5 → confidence 13–39%. To display 80 you need `|totalScore|≥3.04` (strong multi-indicator alignment); 95 needs ≥3.61. That bar is rarely met in choppy/sideways markets.
   - The MTF fusion weight changed once (simple `(fast+slow)/2` → `hi*0.65+lo*0.35`); that change pushes avgConfidence slightly **up**, never down.
   - This is the value every gate reads: live floor, riskGate, broker adapter, stops, concurrent caps.

2. **DISPLAY confidence = `displayConfidence`** (`computeDisplayConfidence` in `tradingLoop.ts`, plus a render-layer curve in `usePaperSignals.ts`/`conviction.ts`).
   - Display-only, MUST NOT be read by execution-path code.

# The "confidence used to be 80-95, now it's 30-50" report

**Cause: an intentional DISPLAY recalibration, not drift in the scorer.**
- Before, the render layer over-amplified raw avgConfidence into the 80-95 band (linear additive bonus stack + power-0.50 curve). The 80-95 the user remembers was **inflated display conviction**, never execution confidence.
- The team deliberately replaced that with a diminishing-returns / soft-ceiling model to produce a "more realistic" compressed 20-90 distribution. Display numbers dropped on purpose.
- Engine audit (recorded in the Pass E3 commit message) explicitly chose NOT to rewrite the raw scorer, because `avgConfidence` drives real-money gates; they split display off instead, keeping execution byte-identical.

**Why:** so future audits don't "fix" a non-existent scorer regression. The raw scorer producing low numbers is by design and load-bearing.

**How to apply:** if asked why confidence looks low or trades are sparse, separate the two questions. Displayed-number drop = intentional display recalibration. Sparse trades = execution confidence (structurally low for weak setups) sitting below the live floor + testMode being disabled by default — NOT a formula regression. Live `GET /api/engine/status → confDistribution` confirms the raw distribution (observed 2026-05-30: n=400, mean ~22.7, p90 ~42, ≥80 only 0.5%).

# Confidence has ONE execution authority: `executionEligible`

The engine's `SymbolBreakdown.executionEligible` flag is the **single source of truth** for whether a signal may execute. It folds in the confidence floor (`BASELINE_MIN_CONFIDENCE`, derived from `EXPERIMENT_CONF_FLOOR`, currently 50) plus MTF agreement, sideways/HOLD-bias blocks. There must be exactly ONE confidence comparison in the whole execution path.

**Why:** the path previously re-checked confidence in three places — the engine tick's `highConfOverride` (unreachable ≥60 override), `autoExecute`'s operator "Gate 0" live-floor, and `liveUserExecution` gate 0f's per-user `minConfidence` clamp. They were redundant duplicates of the same comparison (the per-user clamp was already pinned to the engine floor, so it never tightened beyond baseline). The stacked checks made autonomous trading unpredictable and starved execution. All three were removed; `executionEligible` is now authoritative. Changing the floor = change `EXPERIMENT_CONF_FLOOR` only, never reintroduce a second gate.

**How to apply:** when adding/auditing an execution gate, do NOT re-compare confidence — read `breakdown.executionEligible`. Keep the customer no-signal fail-closed (missing breakdown → reject `no_signal`) and operator bypass intact. Daily throughput is NOT a confidence concern: the global `settings.maxTradesPerDay` engine throttle ("Gate 2") was removed too — per-user subscription entitlement (`trade_limit_exhausted`) is the sole daily authority; the settings field is a legacy no-op. All other safety gates (risk budget, liquidity/position-count, exchange validation, symbol universe, SL/TP, kill switches, per-tier + concurrent caps) are unchanged.
