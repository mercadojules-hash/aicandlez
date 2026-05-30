---
name: What governs a per-user LIVE position's exit
description: Which engine closes a customer's open LIVE position, and which mechanisms explicitly do NOT touch it.
---

A per-user **LIVE** position (`sim_positions.exchange IS NOT NULL`, `sandbox=false`) is governed
ONLY by the **fixed SL/TP hard-stop monitor** (`runHardStopMonitor` in tradingLoop.ts, enabled by
default — `HARD_STOP_ENFORCEMENT_ENABLED !== "false"`). It force-closes when price breaches the
absolute `stop_loss` / `take_profit` locked on the row at open (SL checked first), routing through
`closeUserPosition` → live broker close.

**SL/TP are SYNTHETIC, not broker-resting.** The CoinbaseAdapter only ever places
`market_market_ioc` or `limit_limit_gtc` — it never uses stop/bracket/OCO/trigger configs. The entry
is a plain market BUY (no attached exit). The TP/SL prices live ONLY in the app DB; the engine polls
`getTicker` each tick and fires a **market SELL at trigger time** via `placeBrokerClose`. Consequences:
no protection while the engine/server is down or `getTicker` fails; fills are market (slippage, not
guaranteed at the TP price); breach is sampled per-tick, so a fast wick between ticks can be missed.

Mechanisms that do **NOT** touch a live position:
- **Trailing-stop engine** (`trailingStopEngine.ts`) is GLOBAL/operator-level (operates on
  `getAccountSummary().positions`). Its per-user fan-out (`runTrailingStops`) closes **PAPER only**
  (`listOpenPaperPositionsBySymbol`); live per-user positions are explicitly excluded. So a
  "Trailing stop triggered: <SYM>" log with `uid=null` does NOT close any customer's live position.
- **No AI/reverse-signal exit** path exists.
- **No max-hold / time-based exit** exists anywhere — a live position with neither bound hit holds
  indefinitely until manual close or kill switch.

**Gotcha:** SL/TP are computed from `user_settings.{stop_loss_percent,take_profit_percent}` AT OPEN
and stored as absolute prices on the position row. Editing those settings later does NOT re-bracket
an already-open position (check `user_settings.updated_at` vs the position's open time before
inferring the % from current settings).
