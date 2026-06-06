---
name: Live close does not guarantee broker liquidation
description: A "closed" live position in sim_trades is NOT proof the asset was market-sold to zero on the exchange; reconcile against live balances.
---

# Live close ≠ asset liquidated to USD

A live `sim_trades` row marked closed (even a "clean" MAX_HOLD / STOP_LOSS /
TAKE_PROFIT / TRAILING_STOP close with recorded realized P&L) does **not** prove
the underlying base asset was actually market-sold to ~zero on the exchange.

**Why:** the close path books realized P&L and writes a **synthetic**
`exchange_close_order_id` (`close-u-<userId>…`), not a verifiable broker fill id.
The schema has **no column for close-order status, filled/sold qty, or post-close
remaining balance**. So the DB cannot self-certify liquidation. Forensic proof
must come from reconciling against **live exchange balances**.

**Evidence (teedelgado QA acct, Coinbase, 2026-06-06):** AICandlez books showed
the account flat (only 1e-8 dust "open" rows), but Coinbase held ~$570 of
bot-traded crypto across 10 assets (NEAR $250, ALGO, SUI, AXS, AVAX, FIL, ICP,
COMP, INJ, BTC) for positions booked closed. Crucially this was NOT limited to the
50 `ZOMBIE_INSUFFICIENT_FUNDS` reconciled closes — FIL (19/19 clean) and INJ
(13/13 clean) had zero reconciles/partials yet still left whole positions
un-sold. Fully-liquidated symbols leave only sub-$1 dust (the "good" signature);
orphans leave whole-position-sized balances.

**How to apply:**
- To audit liquidation, decrypt the per-user vault cred and pull live exchange
  `getAccount`, then bucket each held asset: dust (<$1, bot-traded) = good sell;
  material balance (bot-traded, books flat) = ORPHANED un-liquidated; never-traded
  = MANUAL/user deposit; map symbol→base, RNDR↔RENDER alias.
- Staked balances appear in `getAccountValueUSD` but NOT in deployable
  `getAccount().balances` (≈$1.26k locked in this acct) — don't count as orphan.
- Real fix surface (if asked): persist real broker close-order id+status+filled
  qty + post-close balance probe; add an orphan-sweep market-sell job; reconcile
  phantom 1e-8 open rows out of sim_positions.

**Env recipe for read-only prod forensic (no product code change):** `pg` is not
a dep of api-server → fetch encrypted_blob via a /tmp node script importing the
absolute pg path, write ciphertext to /tmp; run a throwaway tsx script inside
artifacts/api-server/src importing vault + adapter to decrypt + getAccount (delete
after). Coinbase getAccount 429s under prod polling — retry w/ ~8s backoff.
process.env is unavailable in the code_execution sandbox; run via bash where prod
secrets exist.
