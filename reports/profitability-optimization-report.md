# AICandlez — Profitability Optimization Report

**Date:** June 1, 2026
**Basis:** Findings from the #221 Production Validation Report, validated against
the **full live production trade history** (~80 clean live closed trades across
the two internal accounts; `exchange IS NOT NULL`, reconciliation pollution
excluded). Engine is live and trading, so counts drift by a few trades between
snapshots.
**Status:** ⚠️ **Recommendations only — NO code changes made, NOTHING deployed.**
Awaiting your approval of the final optimization package.

---

## TL;DR — where the money actually is

| Lever | Finding | Action | Leverage |
| --- | --- | --- | --- |
| **P1 Instant stop-outs** | 30% of trades scratch-stop in <10s; a spread/timing bug, not strategy | **Fix first** | 🟢🟢🟢 Highest |
| **P2 Symbols** | TON/HBAR carry the book; STX/INJ/XLM/AVAX bleed | Promote/demote/disable | 🟢🟢 High |
| **P5 Confidence** | Confidence is **inverted** — low conf profitable, mid conf toxic | **Do NOT raise the floor** | 🟢🟢 High (corrective) |
| **P3 Category** | "alts vs majors" is misleading; real losers are mislabeled majors | Symbol-level > category | 🟡 Medium |
| **P4 Exits** | TP works (90% win); trailing barely used; can't backtest precisely | Enable trailing, instrument | 🟡 Medium |
| **P6 Capital** | $10 is fee-dominated | Validate at $50–$100 | 🟡 Medium |

**Single most important number:** removing the instant stop-outs alone moves the
live book from **win 28.9% / PF 1.22 / +$1.92** to **win 40.7% / PF 1.45 /
+$3.29**. Fixing P1 is worth more than every config knob combined.

---

## Priority #1 — Instant Stop-Outs (ROOT CAUSE CONFIRMED)

**Scale:** 24 of ~79 clean live trades (**30%**) close via `STOP_LOSS` within
**<10 seconds** of entry, at ≈ $0.00 P&L. Net −$1.37 plus wasted entry+exit fees
on every one. Split Coinbase 15 / Kraken 9.

**Root cause (confirmed in code, `artifacts/api-server/src/lib/tradingLoop.ts`):**

1. The synthetic stop-loss is computed from the **broker fill price**
   (`userEntry = r.fillPrice`, ~line 1384) at open: `fillPrice × (1 − 2%)` for a
   BUY (lines 1391/1403). On a BUY the fill is typically at the **ask**.
2. `runHardStopMonitor` runs on **every engine tick (~4–6s)** with **no
   stabilization / minimum-hold delay** (lines 3471–3476). A position opened on
   one tick is evaluated on the very next tick.
3. The stop is evaluated against the **last-trade ticker price** (~line 2003),
   which on a BUY is often at the **bid** (lines 2058–2059:
   `if (price <= p.stopLoss) reason = "STOP_LOSS"`).
4. **The bid/ask spread alone** puts the position underwater the instant it
   opens. If spread + first-tick volatility pushes the last price below the
   2%-from-ask stop, it scratch-exits before the trade ever had a chance.

There is **no `minHoldMs`, cooldown, or mark/mid-price smoothing** anywhere in
the live exit path.

**Proposed fix (for approval — not yet implemented):**
- Add a **stabilization grace period** (suggest 60–120s) before SL evaluation
  begins for a freshly opened live position. SL still active for catastrophic
  moves via a wider "hard" bound during the grace window if desired.
- Evaluate the stop against **mid price** (or require the breach to exceed the
  measured entry spread), so the spread itself can't trigger an exit.
- Optionally require **two consecutive ticks** below the stop before exiting.
- **SL stays 2%.** This only stops the *spread/timing artifact*, not real stops.

> ⚠️ Side effect to note: `ALGOUSD` shows 9 live trades all at exactly $0.00 (0%
> win). These are almost entirely instant scratches — its "0% win rate" is a P1
> artifact, **not** a symbol verdict. Re-evaluate ALGO only *after* P1 is fixed.

---

## Priority #2 — Symbol Performance (full live history)

Validated against all clean live trades (n≥3 for signal):

| Symbol | n | Net | Win% | PF | Verdict |
| --- | --- | --- | --- | --- | --- |
| **TONUSD** | 11 | **+$3.17** | 81.8% | 8.4 | ✅ Promote |
| **HBARUSD** | 8 | **+$3.00** | 75.0% | ∞ | ✅ Promote |
| NEARUSD | 3 | +$0.12 | 33.3% | ∞ | 🟢 Lean keep (low data) |
| ALGOUSD | 9 | $0.00 | 0% | 0 | ⏸ Re-judge after P1 (scratch artifact) |
| XLMUSD | 13 | −$0.43 | 15.4% | 0.77 | 🔻 Reduce weight |
| AVAXUSD | 3 | −$1.01 | 0% | 0 | 🔻 Reduce / watch |
| **INJUSD** | 15 | **−$1.29** | 20.0% | 0.50 | ⛔ Disable (most-traded loser) |
| **STXUSD** | 10 | **−$1.52** | 0% | 0 | ⛔ Disable |

**Low-data (need more before judging):** COMP +$0.23, SOL −$0.14, LTC −$0.20,
AAVE −$0.21, ICP −$0.21, BCH −$0.50 (all n≤2).

**Recommendations:**
- **Promote (raise selection bias):** TONUSD, HBARUSD.
- **Temporarily disable:** STXUSD (0% win over 10), INJUSD (PF 0.5 over 15 — it's
  the single most-traded symbol and a net drag).
- **Reduce weight:** XLMUSD, AVAXUSD.
- **Gather more data:** SOL, LTC, AAVE, ICP, BCH, COMP, NEAR, ALGO (post-P1).

This is implementable today through the existing `categoryAllocation` /
per-symbol selection bias and the symbol universe — no new gates.

---

## Priority #3 — Category Allocation (with an important correction)

| Category | n | Net | Win% | PF |
| --- | --- | --- | --- | --- |
| majors | 68 | +$2.30 | 30.9% | 1.32 |
| alts | 11 | −$1.29 | 9.1% | 0.15 |
| memes | **0** | — | — | — |

**The category framing is misleading and lower-leverage than it looks:**
- The realized live mix is **already ~86% majors / 14% alts** by count. The
  proposed Configs A (75% majors) and B (80% majors) would actually **increase**
  alt exposure relative to what already happened.
- The "alts" bucket is **essentially just STXUSD** (10 of 11 trades). Meanwhile
  the real bleeders **INJ, XLM, AVAX are classified as _majors_**. So
  re-weighting categories will not remove them — only **symbol-level** controls
  (P2) will.
- **Memes have ZERO live trades.** Allocating 5% to memes (both proposed configs)
  is allocating to an unmeasured bucket. Don't fund what hasn't been validated.

**Recommendation (evidence-based):**

| Config | Majors | Alts | Memes | Verdict |
| --- | --- | --- | --- | --- |
| A (proposed) | 75% | 20% | 5% | ❌ Loosens toward alts vs reality |
| B (proposed) | 80% | 15% | 5% | ⚠️ Better, but memes unvalidated |
| **C (recommended)** | **85%** | **10%** | **5%*** | ✅ Matches data; *memes = small exploratory probe only to gather data, can be 0% |
| Dynamic (rolling) | — | — | — | ✅ Best long-term; needs rolling-profitability infra (not yet built) |

**Projected directional impact** (small-sample, illustrative): tightening to ~85%
majors and removing STX/INJ would have eliminated roughly **−$2.8** of realized
losses while preserving the +$6.2 from TON/HBAR — lifting overall PF from ~1.22
toward ~**1.6–1.8**. Treat as directional, not a guarantee.

> Bottom line: **do the symbol-level pruning (P2); category weights are a
> secondary tidy-up.**

---

## Priority #4 — Exit Optimization

**Closes by reason (all live):**

| Reason | n | Net | Win% | Avg % |
| --- | --- | --- | --- | --- |
| TAKE_PROFIT | 21 | +$9.04 | 90.5% | +2.27% |
| STOP_LOSS | 49 | −$8.55 | 0% | −0.91% |
| TRAILING_STOP | 4 | +$0.43 | 50% | +0.55% |
| MAX_HOLD | 2 | +$0.09 | 50% | +0.44% |
| STOP_LOSS_PARTIAL | 3 | $0.00 | 0% | 0% |

**Findings:**
- TP capture is **healthy** (90% of TP closes are wins). The strategy *makes*
  money when it reaches target; it *loses* on the stop side — which P1 directly
  addresses (many of those 49 stops are the instant scratches).
- The let-winners-run / trailing exit is **barely exercised** (4 trades) because
  `trailing_stop_percent` and `max_hold_hours` were null on both accounts until
  recently.

**Honest limitation on the requested scenario simulation:** `sim_trades` stores
only entry/exit — there is **no max-favorable/adverse excursion (MFE/MAE)** per
trade. Without the intra-trade price path I **cannot faithfully backtest** TP
4/5/6% × trailing 1.5/2% and give you reliable PF numbers per scenario; doing so
would be guesswork dressed as data.

**Recommendation:**
- **Start with Scenario 1 (SL 2% / TP 4% / Trailing 1.5%)** — closest to current
  behavior, arms the trailing exit, keeps the proven 2:1 base.
- **Instrument MFE/MAE capture** on live positions now, run 1–2 weeks, *then*
  choose between Scenarios 2 and 3 on real excursion data. Raising TP to 5–6%
  only pays off if trades are demonstrably running past 4% — which we can't yet
  prove.
- Keep **Max Hold 24h** and **SL 2%** in all scenarios.

---

## Priority #5 — Confidence Quality (this INVERTS the #221 assumption)

**Audit result (confirmed in `tradingLoop.ts`):**
- `sim_trades.confidence` stores **execution confidence** (`avgConfidence` =
  `0.65×5m + 0.35×15m` AI score, line 952). Display confidence is a separate,
  UI-only enriched number (line 3147) and is *not* what gates execution.
- An active experiment, **`EXPERIMENT_CONF_FLOOR = 40`** (line 192), sets
  `BASELINE_MIN_CONFIDENCE = 40` (line 201) and **the per-user `minConfidence`
  clamp (60/65) was deliberately removed** from the execution path (lines
  182–191). Every path now gates solely on `avgConfidence ≥ 40`. The data
  confirms it: of 74 executed trades, **45 are 40–50, only 2 are ≥60.**

**The decisive finding — performance by confidence bucket:**

| Confidence | n | Net | Win% | PF |
| --- | --- | --- | --- | --- |
| 40–45 | 30 | +$2.48 | 30.0% | **2.23** |
| 45–50 | 19 | +$3.46 | 57.9% | **3.88** |
| 50–55 | 20 | −$2.59 | 5.0% | 0.15 |
| 55–60 | 7 | −$1.14 | 14.3% | 0.21 |
| 60+ | 2 | −$0.42 | 0% | 0 |

**Confidence is currently INVERTED / broken as a predictor.** The profitable
trades are in the **40–50** band; the **50–60** band is toxic; and there is
**effectively no data above 60** (n=2). Persisting through the experiment:

- ❌ **Do NOT raise the execution floor to 60/65** as #221 suggested. On current
  data that would **delete the only profitable band (40–50)** and keep losers —
  and it rests on a 2-trade sample above 60.
- ✅ **Keep the floor at 40 for now** (or recalibrate — see below). The
  experiment is producing the profitable trades.
- 🔧 **Recalibrate the confidence model.** `avgConfidence` as computed does not
  rank profitability — that's the real bug here, not the threshold. Until the
  score is predictive, confidence is **not a usable quality lever**, and symbol
  selection (P2) + the P1 fix are where edge comes from.

> This is the single biggest correction to the #221 assumptions: the platform's
> confidence number is not yet trustworthy enough to gate on.

---

## Priority #6 — Capital Scaling Recommendations

Grounded in live data: at $10, avg winner is **$0.44** and avg loser **$0.23** —
the same order of magnitude as fees, so **fee drag dominates and hides the edge.**
Scale up to read true profitability; keep risk constant in **percentage** terms
(SL 2% is identical risk-per-trade at every size).

| Trade size | Concurrent (suggested) | Daily target | Capital required* | Risk profile | Use |
| --- | --- | --- | --- | --- | --- |
| **$10** | 3 | 10–20 | ~$50–100 | Minimal $ risk, **fee-dominated** | Plumbing/smoke tests only — not a profit read |
| **$20** | 3–4 | 10–20 | ~$120–250 | Low $ risk, still fee-heavy | Transitional |
| **$50** | 4–6 | 15–30 | ~$400–800 | Moderate; **clean signal floor** | ✅ Recommended for real validation |
| **$100** | 6–12 | 20–40 | ~$1,200–2,500 | Higher $ exposure, best signal | ✅ Best signal; scale concurrency with balance |

*Capital required ≈ `concurrent × size × ~1.5–2.5×` headroom for fees, partial
fills, and parallel-exchange spread. Always cap concurrency at
`floor(deployable_USD / trade_size)` and at the customer tier limit
(starter 3 / pro 6 / elite 12). Use the in-app balance-aware concurrency advisor;
**these are not hardcoded caps.** Per-trade $ risk = `size × 2%` (e.g. $1.00 at
$50, $2.00 at $100).

**Recommendation:** run the next validation pass at **$50 and $100**; treat
$10/$20 results as plumbing checks, not profitability evidence.

---

## Estimated Improvement (small-sample — directional, not promises)

| Scenario | Win% | PF | Net (sample) |
| --- | --- | --- | --- |
| Current live book | 28.9% | 1.22 | +$1.92 |
| **+ Fix P1 (instant stop-outs)** | **40.7%** | **1.45** | **+$3.29** |
| + Disable STX/INJ, reduce XLM/AVAX (P2) | ~45–50% (est.) | ~1.6–1.8 (est.) | higher |
| + $50–100 sizing to clear fee drag (P6) | similar % | clearer signal | materially higher $ |

> ⚠️ All figures derive from ~80 trades over ~2 days on QA accounts exempt from
> tier caps. They are **directional**, not statistically significant. The point
> is the *ranking* of levers, not the decimals: **P1 > P2/P5 > P3/P4/P6.**

---

## Recommended Optimization Package (for your approval)

1. **P1 — Fix instant stop-outs** (stabilization grace + mid-price/spread-aware
   stop). *Highest leverage. Deploy first, in isolation, then re-measure.*
2. **P2 — Disable STXUSD + INJUSD; reduce XLM/AVAX; bias toward TON/HBAR.**
3. **P5 — Keep confidence floor at 40 (do NOT raise); open a separate task to
   recalibrate the confidence model.**
4. **P3 — Set majors 85 / alts 10 / memes 0–5% (exploratory).**
5. **P4 — Enable trailing 1.5% + max-hold 24h; instrument MFE/MAE; revisit
   TP 5–6% only after excursion data exists.**
6. **P6 — Move validation to $50–$100.**

**Suggested sequence:** ship P1 alone → measure 3–5 days → then P2/P3/P4/P6
together → measure → revisit P5 recalibration. SL stays 2% throughout; every
"reduce blockers" change remains opt-in via presets.

*Prepared from production data, read-only. No customer funds moved, no
configuration changed, nothing deployed.*
