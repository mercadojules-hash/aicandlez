---
name: What governs a per-user LIVE position's exit
description: Which engine closes a customer's open LIVE position, and which mechanisms explicitly do NOT touch it.
---

A per-user **LIVE** position (`sim_positions.exchange IS NOT NULL`, `sandbox=false`) is governed by
`runHardStopMonitor` (tradingLoop.ts, enabled by default — `HARD_STOP_ENFORCEMENT_ENABLED !==
"false"`). It evaluates every open position each tick and force-closes via `closeUserPosition` → live
broker close. Exit priority: **SL → TP → TRAILING_STOP → MAX_HOLD**.

**Why the policy changed (was SL/TP-only):** in a flat market that never breaches the fixed SL/TP
band, a real-money position could sit open indefinitely (observed 18–27h holds). Trailing + max-hold
make the live exit lifecycle active. SL/TP-only is no longer the whole story — update any reasoning
that assumes "live exits only on fixed SL/TP".

**Exit mechanisms (all LIVE here):**
- **Fixed SL/TP** — absolute `stop_loss`/`take_profit` locked on the row at open, SL checked first.
- **Trailing-stop (LIVE-only, NEW)** — in-memory high/low water-mark `Map` keyed by positionId in
  tradingLoop.ts (`liveTrailWaterMarks`), pruned each tick, **process-local** (re-anchors on
  restart). Distance = env `LIVE_TRAILING_STOP_PERCENT` override, else derived from the position's own
  SL band. Arms only once the trail sits above entry (BUY), so it targets a profitable exit; the fixed
  SL still owns all downside. NOTE: trigger is sampled per-tick ticker — the realised market-close
  fill can still land slightly below entry on a gap/slippage. Set `LIVE_TRAILING_STOP_PERCENT=0` to
  disable.
- **Max-hold (LIVE-only, NEW)** — hard time ceiling, env `LIVE_POSITION_MAX_HOLD_MS`, **default 24h
  ON** (mirrors global book). Evaluated **price-independently** (before/without the ticker) so it
  fires even when market data is down; the broker close fetches its own fill. Set `=0` to disable.

**Observability (NEW):** `LIVE_POSITION_EVAL` log line per live position per tick — `evaluatedAt`
timestamp (proves loop liveness + last-eval time), price, SL, TP, trailPct, trailStop, trailArmed,
highWater/lowWater, ageHours, decision (`HOLD`/`HOLD_NO_PRICE`/exit reason). On close,
`HARD_STOP_TRIGGERED` carries the reason + ageHours; `trailingStopHits++` for trailing, else
`hardStopHits++`.

**SL/TP are SYNTHETIC, not broker-resting.** CoinbaseAdapter only places `market_market_ioc` /
`limit_limit_gtc` — never stop/bracket/OCO/trigger. Entry is a plain market BUY (no attached exit).
TP/SL live ONLY in the app DB; engine polls `getTicker` each tick and fires a market SELL at trigger.
Consequences: no protection while engine/server is down or `getTicker` fails (except max-hold, which
is now price-independent); fills are market (slippage); breach sampled per-tick so a fast wick between
ticks can be missed.

**Still does NOT touch a live position:**
- **Global trailing-stop engine** (`trailingStopEngine.ts`) is operator/GLOBAL-level
  (`getAccountSummary().positions`). Its per-user fan-out (`runTrailingStops`) closes **PAPER only**;
  it is distinct from the LIVE trailing now inside `runHardStopMonitor`. A "Trailing stop triggered"
  log with `uid=null` does NOT close any customer's live position.
- **No AI/reverse-signal exit** path exists.

**Gotcha:** SL/TP are computed from `user_settings.{stop_loss_percent,take_profit_percent}` AT OPEN
and stored as absolute prices on the row. Editing those settings later does NOT re-bracket an
already-open position (check `user_settings.updated_at` vs the position's open time before inferring
the % from current settings). The LIVE trailing distance, when not env-overridden, is derived from
that same stored SL band — so it inherits the at-open risk, not current settings.
