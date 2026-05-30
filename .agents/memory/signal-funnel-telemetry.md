---
name: Signal funnel telemetry (two modules)
description: Two distinct execution-funnel telemetry modules exist in api-server; which to trust and the one counting pitfall.
---

# Signal funnel telemetry

The api-server has TWO funnel telemetry modules — do not confuse them:

- `lib/executionFunnel.ts` — subscribes to the execution event bus and counts
  only BLOCK events. An approximation: it cannot see signals that died at the
  engine confidence/MTF gate (those never reach the bus). Its `/engine/status`
  rollup historically inferred `passedConfidence` from block-stage subtraction.
- `lib/signalFunnel.ts` — a TRUE per-signal pass-through funnel populated by
  `tradingLoop.ts tick()`. Records a full Y/N trace per signal across every gate
  (confidence → mtf → volume → spread → trend1h → position → cooldown →
  duplicate → risk → exchange) plus cumulative stage counters. This is the
  authoritative source for "where do signals die?".

**For funnel diagnosis, trust `signalFunnel.ts`**, exposed via operator-gated
`GET /api/engine/signal-funnel` and the enriched `executionFunnel` block in
`GET /api/engine/status`.

**Counting pitfall:** `executionAttempted` must be incremented exactly ONCE per
trace. It is true both for EXECUTED traces and exchange-stage rejections; if you
increment it in both the pass path and `finishReject`, exchange-rejection traces
double-count. Count it once near the top of `recordSignalTrace`, not inside the
gate walk.

**Why:** the engine evaluates confidence+MTF *before* `autoExecute`, so the
funnel typically collapses entirely at the confidence/MTF gate and downstream
gates see zero traffic — only a per-signal pass-through funnel makes that visible.
