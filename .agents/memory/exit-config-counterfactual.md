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
