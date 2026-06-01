# AICandlez — Pre-Launch Profit Validation & Readiness Report

**Date:** June 1, 2026
**Scope:** Production live-trading data for the two internal test accounts
(`teedelgado@gmail.com`, `info@mixtapepsd.com`).
**Data source:** Production database (Render), read-only. Clean live trades only
(`exchange IS NOT NULL`, reconciliation-pollution excluded — none found).

---

## Verdict: ⛔ NOT YET LAUNCH-READY

The live algorithm is **break-even, not demonstrably profitable**, on a **very
young, statistically insufficient sample**. Combined net realized P&L across both
accounts is **+$0.09 over 75 closed live trades** (profit factor ≈ 1.01, win rate
26.7%). This does not clear the bar of "proven profitable, stable, and safe."

Two specific blockers must be addressed before adding paying users (details below):
1. **Fee-dominated $10 sizing** masks any real edge — validate at $50–$100.
2. **Instant 4–6 second stop-out scratches** (24% of one account's trades)
   indicate a stop-loss-on-entry execution issue that wastes fees and depresses
   win rate.

---

## 1. What the data shows

### teedelgado@gmail.com — Coinbase + Kraken (parallel), $10 orders
| Metric | Value |
| --- | --- |
| Clean live trades | 63 (May 30 → Jun 1) |
| Live volume ramp | May 30: 2 · May 31: 23 · Jun 1: 38 |
| Win rate | **23.8%** |
| Net realized | **−$0.55** |
| Profit factor | **0.92** (losing) |
| Avg winner / loser | +$0.44 / −$0.23 |
| Avg hold | 2.8h · Max drawdown −$2.86 |
| Avg trade confidence | 44.6 (configured min_confidence = 65) |
| Open live positions | 20 / 20 (at per-user cap) |
| Closes | STOP_LOSS 43 · TAKE_PROFIT 12 · TRAILING_STOP 4 · SL_PARTIAL 3 · MAX_HOLD 1 |

- **By exchange:** Coinbase +$1.56 (n=31, 26% win) · Kraken −$2.11 (n=32, 22% win)
- **By category:** majors +$0.74 (n=52) · alts **−$1.29** (n=11, 9% win)
- **Bleeders:** STXUSD −$1.52 (10 trades, 0% win) · INJUSD −$0.63 (9, 22%) ·
  XLMUSD −$0.43 (13, 15%)
- **Winners:** TONUSD +$2.37 (9, 78% win) · HBARUSD +$1.04 (100% win)

### info@mixtapepsd.com — Kraken only, $10 orders
| Metric | Value |
| --- | --- |
| Clean live trades | 12 (May 31 → Jun 1) |
| Win rate | **41.7%** |
| Net realized | **+$0.64** |
| Profit factor | **1.40** (profitable, but n=12) |
| Avg winner / loser | +$0.45 / −$0.23 |
| Avg hold | 3.6h · Max drawdown −$1.26 |
| Avg trade confidence | 45.5 (configured min_confidence = 60) |
| Open live positions | 5 |
| Closes | TAKE_PROFIT 5 · STOP_LOSS 6 · MAX_HOLD 1 |

- **By category:** 100% majors. Best HBARUSD +$1.04, TONUSD +$0.80. Bleeder
  INJUSD −$0.66 (6 trades, 17% win).

---

## 2. Why it is not profitable yet (root causes)

1. **Fee drag at $10 sizing dominates the signal.** Average winner is $0.44 and
   average loser $0.23 — both within the same order of magnitude as exchange +
   app fees. At this size, edge is indistinguishable from noise. **A clean
   profitability read requires $50–$100 orders** where fixed costs amortize.

2. **Win rate below the reward:risk break-even.** SL is locked at 2% and TP at
   4% (2:1), which needs **> ~33% win rate** to break even before fees.
   teedelgado is at 23.8% (below) — consistent with PF 0.92. info clears it
   (41.7%) but on only 12 trades.

3. **Instant stop-out scratches.** 15 of 63 teedelgado live trades (24%) closed
   at STOP_LOSS for exactly $0.00 within **4–6 seconds** of entry. These are not
   normal exits — they suggest the synthetic stop is triggering on entry-bar
   spread/slippage. They inflate the loss/stop count, burn fees, and drag win
   rate. **Engineering investigation required.**

4. **Alts are bleeding; majors carry the book.** On both accounts, majors are
   net positive and alts (esp. STX, INJ) net negative. No category-allocation
   bias is set (`category_allocation = null`).

5. **Let-winners-run exits aren't fully armed.** `trailing_stop_percent` and
   `max_hold_hours` are **null** on both accounts, so the new momentum exit has
   limited effect (only 4 trailing closes observed).

---

## 3. Representativeness caveats (read before trusting these numbers)

- **Both are internal QA accounts** (`is_internal_account = true`) — exempt from
  tier daily/concurrent caps. teedelgado ran ~38 trades/day and 20 concurrent
  positions; a real `starter` customer is capped at 50/day and **3 concurrent**.
  So this data does **not** reflect constrained customer behavior.
- **Sample is tiny and young:** ~1.5 days of meaningful volume (teedelgado), <1
  day (info). No statistical confidence is possible. The brief's ≥24–48h
  threshold is, at best, marginally met for one account.
- Confidence stored on executed trades (~44–45) sits well below configured
  `min_confidence` (60–65). This is expected if the stored value is *display*
  confidence (execution uses a separate `executionEligible` authority), but the
  gap should be confirmed so we know the real entry-quality floor.

---

## 4. Recommended launch-ready starting configs

These are **starting points for the next controlled validation run**, grounded
in the data above — **not** certified profitable settings. Core safety is
unchanged: **SL stays 2% in every config.** "Reduce blockers" stays opt-in.

### Shared baseline (all tiers, both exchanges)
| Lever | Recommendation | Rationale |
| --- | --- | --- |
| Stop loss | **2%** (locked) | Safety invariant |
| Take profit | 4% | Keep 2:1; let trailing capture extension |
| Trailing stop | **1.5%** (enable) | Currently null — arms let-winners-run |
| Max hold | **24h** (enable) | Currently null — caps dead/losing holds |
| Min confidence | **65** | Raise entry quality; both ran ~44–45 effective |
| Category allocation | **majors 75% / alts 20% / memes 5%** | Majors carried both books; alts bled |
| Exclude / down-weight | STXUSD, INJUSD | Chronic 0–22% win-rate bleeders |
| Closest preset | **Balanced** (Conservative for first $50+ run) | Maps to shipped presets |

### Per-size tiers
| Trade size | Recommended concurrent | Notes |
| --- | --- | --- |
| $10 | 3 | Fee-dominated; use only for plumbing/smoke tests, not profit proof |
| $20 | 3–4 | Still fee-heavy |
| **$50** | 4–6 | **Recommended floor for a real profitability read** |
| **$100** | 6–12 | Cleanest signal; scale concurrency with deployable balance |

Concurrency must remain **balance-aware** (use the in-app concurrency advisor)
and capped by tier (`starter` 3 / `pro` 6 / `elite` 12) and by actual exchange
balance — never exceed `floor(deployable_USD / trade_size)`.

### Exchange notes
- **Coinbase** and **Kraken** are both viable. Coinbase was slightly net-positive
  for teedelgado; Kraken was the only venue for info (net-positive). Keep both,
  monitor per-exchange net, and confirm each pair's min-notional ≥ chosen size
  ($10 is near Coinbase's floor — another reason to validate at $50+).

---

## 5. Go-live checklist status

| Criterion | Status |
| --- | --- |
| ≥24–48h live test | ⚠️ Marginal (teedelgado ~1.5 days w/ volume; info <1 day) |
| Positive net realized P&L | ⛔ Break-even (combined +$0.09; teedelgado −$0.55) |
| Stable trade history, no reconciliation pollution | ✅ Clean (0 polluted rows) |
| No ghost / instant-scratch trades | ⛔ 24% instant 4–6s stop-outs on teedelgado |
| Balances / Live Trades / Trade History reconcile | ✅ sim_account totals tie out |
| Both accounts tested separately | ✅ Yes |
| Dashboard stable after refresh | ❓ Not verifiable from data |

---

## 6. Recommended path to launch

1. **Fix the instant stop-out scratches** (engineering) — stop firing SL on the
   entry bar; this alone should lift win rate and cut wasted fees.
2. **Re-run validation at $50 and $100** on both Coinbase and Kraken with the
   configs in §4, **for a continuous 5–7 days**, both accounts separately.
3. **Apply the majors-weighted allocation and enable trailing + max-hold** so the
   let-winners-run logic has teeth; exclude STX/INJ.
4. **Re-measure** win rate, profit factor, and net realized. Launch gate:
   sustained **PF ≥ 1.3** and **positive net realized** over the full window at
   $50+, with no instant-scratch anomaly.
5. Only then proceed to a limited paying-customer beta under the existing
   controlled-beta concurrency cap.

---

*Prepared from production data, read-only. No customer money was moved and no
configuration was changed in producing this report.*
