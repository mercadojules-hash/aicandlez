---
name: Execution-funnel telemetry
description: How the operator execution-funnel diagnostic is wired and its known counting limitations.
---

The execution-funnel diagnostic (api-server `lib/executionFunnel.ts`, surfaced
at `GET /api/admin/execution-funnel`, UI `ExecutionFunnelPanel` on `/debug`)
instruments WHY signals don't become trades by subscribing ONCE to
`executionStreamBus` — NOT by adding counters inside the execution code.

**Why:** every gate in both execution paths (operator `autoExecute` in
tradingLoop.ts, customer fan-out in liveUserExecution.ts) already emits a typed
bus event, so a single subscriber classifies them into 5 canonical stages with
zero churn in those two large, load-bearing files.

**How to apply / gotchas when extending it:**
- All five stages (confidence/risk/liquidity/exchange/positionLimits) are
  PRE-attempt validation — including `symbol_not_in_universe` and order-minimum,
  which reject before the broker order is sent. The UI funnel subtracts them in
  spec order before "Execution Attempted". Do NOT model exchange as a post-send
  subset of attempts — that produces negative "passed" counts.
- Counting grain is asymmetric: operator events are per-signal, customer events
  are per-user fan-out. Customer live path is OFF by default so it's ~0, but the
  UI clamps derived counts so divergence never renders negatives.
- `executionAttempted`/`executionSucceeded` track the OPERATOR path only
  (`execution_sent`/`order_filled`). Customer fills emit a notification
  (`live_trade_filled`), not a bus `order_filled`.
- Some customer exchange-path early-returns in liveUserExecution.ts don't emit a
  bus event, so those rejections are under-counted. If customer live trading is
  turned on broadly, add emits at those exits to close the gap.
