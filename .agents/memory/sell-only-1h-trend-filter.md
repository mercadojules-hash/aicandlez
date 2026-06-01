---
name: SELL-only 1H trend filter
description: Why the SELL-only counter-trend short filter is a separate live-exec gate, not a reuse of the engine's require1HTrend.
---

The trading engine already computes a 1H trend (EMA9 vs EMA21 on 1H closes,
stored on `engineStats.symbolBreakdowns[symbol].trend1H` as
bullish/bearish/unknown) and has a signal-level gate `require1HTrend` (default
OFF).

**Do NOT reuse `require1HTrend` to implement a SELL-only filter.** It is a
both-sides *alignment* gate: it requires the 1H trend to agree with the signal
direction, so enabling it also blocks counter-trend BUYs — violating any
"BUY logic unchanged" requirement.

**Rule:** a side-asymmetric trend filter must be its own gate. The SELL-only
counter-trend short filter lives as a customer live-execution gate
(`placeLiveAutoOrderForUser` — the single chokepoint for both the AI fan-out and
manual `/api/user/live-order`), behind env flag `LIVE_BLOCK_SELLS_IN_BULLISH_1H`
(default OFF = legacy). It reads the engine's existing `trend1H` (never
recomputes), blocks only `side==="SELL"` when `trend1H==="bullish"`, allows
bearish/unknown, and operators bypass (mirrors 0UNI/0SYM).

**Why:** production short-book analysis showed counter-trend shorts (SELL opened
in a bullish 1H tape) were the dominant profit leak, while longs were healthy —
so the fix had to touch shorts only.

**How to apply:** any future side-specific or regime-specific execution filter
on real money belongs at the `placeLiveAutoOrderForUser` gate stack (paper/sim
never routes through it), behind a default-OFF env flag for reversibility, and
must leave the opposite side and the SL/TP/trailing/max-hold/size/confidence
paths untouched.
