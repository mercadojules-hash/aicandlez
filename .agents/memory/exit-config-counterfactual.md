---
name: Exit-config counterfactual & sim_trades pnl semantics
description: Why realized_pnl_pct ≠ raw price move, and why raising TP/widening trailing does NOT fix live profitability (MFE evidence)
---

## sim_trades P&L semantics (don't misread exit triggers)
- The engine's SL/TP/trailing act on **RAW PRICE**, not on `realized_pnl_pct`.
  Verified from prod live trades: `TAKE_PROFIT` fires at **+4.0% raw** price move
  (entry→exit), `STOP_LOSS` at **≈−2% raw** (clean), trailing tight.
- `realized_pnl_pct` (and `realized_pnl`) is **P&L-on-notional AFTER fees AND
  small-order rounding**, so it reads ~half the raw move for low-priced coins.
  Effective notional << `size_usd`: per-account multiplier varied ≈ **0.37**
  (~$10 effective on $20 nominal) vs **0.72** on a second test account. Cause:
  Coinbase min-increment rounding on ~$20 orders of $2–$5 coins.
- **Lesson:** never infer the engine's SL/TP/trailing levels from
  `realized_pnl_pct`; compute `(exit_price-entry_price)/entry_price` (dir-aware)
  to see the true trigger.

## Counterfactual: SL2/TP5/Trail3 vs current SL2/TP4/Trail2
**Verdict: proposed config would NOT help; likely worse.** Diagnosis = the
problem is **neither TP-too-low nor trailing-too-tight**.
- Evidence = MFE (peak favorable excursion) reconstructed from 1m Coinbase
  candles (ground truth, model-independent). Across both live test accounts most
  trades barely move up: only ~15% of one account's trades peaked ≥4%, ~4%
  peaked ≥5%, and ~44% never reached +1.5%; the other account: 0 of 8 reached ≥4%.
- Raising TP 4→5 **removes** realized winners: the actual +4% TAKE_PROFITs
  (COMP) peaked only ~4.2%, so a 5% TP never triggers — they keep riding / give
  back.
- Widening trail 1.5→3 is **too wide** for sub-3% peaks: gives back the whole
  move, converting marginal winners into losers.
- Real drivers of negative expectancy: (1) small favorable excursions =
  entry/signal quality, not exit tuning; (2) **stop blow-throughs** — some
  STOP_LOSS exited at −4% (XLM) and −5.4% (COMP) raw instead of −2%
  (slippage/gap or delayed stop). Tightening stop *enforcement* beats any
  TP/trailing change.

**Method caveat:** a clean rule-replay sim of the *current* config only matched
63–67% of actual exit reasons (my trailing model arms/clips more aggressively
than the engine), so trust MFE + raw-move ground truth, not simulated PF/net-$.
Also `sim_trades` has no stored peak — MFE must be rebuilt from candles, and
trades inside their 24h hold window are censored (can only mark-to-market).

## Counterfactual: TP4→10 on a high-volume live day (149 closed trades)
**Verdict: raising TP does NOT help; TP=4 maximizes realized P&L.** Re-confirmed
on a much bigger sample than the original 8-trade day.
- **The 2% trailing stop is the binding constraint, NOT the TP ceiling.** 67% of
  winners *eventually* printed ≥10% MFE somewhere in 24h, but with trailing held
  at 2% only ~1 in ~48 winners actually reaches +10% — the trailing stop catches
  the first >2% pullback long before the later global peak. Raising TP just
  converts hard +4% banks into trailing give-backs (~peak−2%), avg cohort raw
  return drops from +4% to ~1.9%.
- **Two methods agree directionally** that higher TP loses money vs TP=4:
  full-path sim (Δ≈−$1.7 at TP10) and a reality-anchored decomposition
  (hold all non-TP trades at actual P&L, re-sim only actual-TP-hitters forward
  from their +4% point) (Δ≈−$0.6). Decomposition is the trustworthy one — it
  sidesteps the SL model.
- **SL-stabilization modeling trap:** a naive 1m-candle full-path sim fires SL on
  any bar wick to −2% and massively over-counts stop-outs (52 vs actual 24),
  because production P1 stop stabilization (90s grace + 2-tick confirm + spread
  buffer, tick-level) suppresses brief wicks. NEVER trust the absolute net-$ of a
  candle full-path sim; the constant-SL block cancels in TP-vs-TP *deltas*, and
  the decomposition avoids SL entirely by anchoring forward from the real exit.
- Mechanics for any future candle recon here: prod DB = RENDER_PROD_DATABASE_URL;
  candles via Coinbase Exchange public (`/products/{SYM}-USD/candles?granularity=60`,
  300/page, paginate + retry on 429/5xx for full history) — Kraken OHLC fallback
  only returns last ~720 1m candles, so trust Coinbase pagination for entry-side
  coverage.

## TP+trailing JOINT grid (varying BOTH tp and trailing)
- **Full-path candle sim CANNOT be calibrated to the live engine's trailing/SL.**
  Across 3 entry/peak/SL-stabilization calibrations the baseline TP4/Tr2 sim
  predicted the actual live day at −$8 to −$17 vs the real +$12.35 (≈$20+ gap,
  bigger than the effect measured) and never reproduced the real exit mix
  (51TP/40trail/57SL). **NEVER quote absolute $ or PF from this sim.** Trailing is
  the hardest to model: arming from breakeven over-fires trailing (116 vs 40),
  arming only after +trail% profit flips to over-firing SL. Tick-level grace +
  spread buffer can't be reproduced at 1m granularity.
- **Censoring bias favors wide combos:** wider TP/trailing hold positions past the
  candle window; up to ~25 unresolved get marked-to-market as winners. Always
  recompute on the common subset resolved in EVERY combo before ranking.
- **What IS robust = the RELATIVE RANKING.** Across all calibrations AND the
  common-resolved subset, the ordering was monotonic and identical:
  TP4/Tr2 < TP6/Tr3 < TP8/Tr3 < TP8/Tr4 < TP10/Tr4 < TP10/Tr5 (PF ~0.4→~1.8).
  **A wider TP must be paired with a wider trailing** — the 2% trailing (not the
  TP ceiling) was the binding constraint that made TP-alone increases lose. Best
  of the six = widest tested (TP10/Tr5), but improvement had NOT plateaued at the
  grid edge, so the true optimum is unbracketed. Magnitude unprovable from one
  noisy day → validate via paper/live A/B, do NOT blind-deploy off the backtest.

## EXIT_DEFAULTS is SHADOWED by NOT-NULL account TP/SL (rollout trap)
- `user_settings.take_profit_percent` & `stop_loss_percent` are **NOT NULL**
  (schema default 4 / 2); `trailing_stop_percent` & `max_hold_hours` are
  **NULLABLE**. `resolveExitConfig` precedence = perExchange ?? account ?? env ??
  EXIT_DEFAULTS. **Consequence:** bumping `EXIT_DEFAULTS.takeProfitPercent` only
  reaches userId=null (operator/global) and rows with NO settings row — every
  existing customer's stored TP=4 shadows it. Trailing & max-hold DO inherit
  EXIT_DEFAULTS (nullable → fall through). SL likewise shadowed but we keep it 2.
- **All live trading is customer-path** (non-null userId; operator-null live ≈ 0;
  verified: 24 open live positions all customer, 6 user_settings rows all 4/null/
  2/null, no per-exchange overrides). So a platform TP change that must hit live
  trades REQUIRES a `user_settings` data migration (UPDATE take_profit_percent),
  not just the code default.
- **Deploy-order trap:** applying a wide-TP data change while trailing is still
  the OLD tight default = the bad TP-wide/trail-tight interim (clips winners).
  Setting BOTH tp AND trail explicitly on the account rows makes the rollout
  deploy-order-independent (account values win on old AND new code).
