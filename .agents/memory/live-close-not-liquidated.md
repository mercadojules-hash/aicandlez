---
name: Live close does not guarantee broker liquidation
description: A "closed" live position in sim_trades is NOT proof the asset was market-sold to zero on the exchange; reconcile against live balances.
---

# Live close ≠ asset liquidated to USD

A live `sim_trades` row marked closed (even a "clean" MAX_HOLD / STOP_LOSS /
TAKE_PROFIT / TRAILING_STOP close with recorded realized P&L) does **not** prove
the underlying base asset was actually market-sold to ~zero on the exchange.

**Why (historical):** the close path booked realized P&L and wrote a **synthetic**
`exchange_close_order_id` (`close-u-<userId>…`), not a verifiable broker fill id,
with **no column for close-order status, filled/sold qty, or post-close remaining
balance** — the DB could not self-certify liquidation.

**Fix (2026-06-06, now live):** the live close arbiter NEVER books CLOSED on the
optimistic `placeOrder` ACK. It requires a REAL broker snapshot (`gotBrokerSnapshot`
= a successful `getOrder` poll, NOT the ACK) showing full fill, OR a post-close
`getAccount` balance probe proving the remaining base balance is dust
(`verifiedLiquidated = brokerFilledFull || remainingIsDust`). Unverified → keep the
position OPEN + retry. Persisted: `close_broker_status`, `close_filled_qty`,
`post_close_base_balance`. Dust thresholds (`CLOSE_DUST_USD` 1.0/0..100,
`CLOSE_DUST_QTY` 1e-8/0..1) are fail-safe with UPPER bounds so a malformed env can
never widen liquidation criteria. **Lesson: any "book closed" decision on real money
must be driven by a broker-confirmed fill or a balance-verified residual — never an
order-submit ACK.** Pre-fix orphans still need a separate sweep; this only stops new
ones.

**Evidence (teedelgado QA acct, Coinbase, 2026-06-06):** AICandlez books showed
the account flat (only 1e-8 dust "open" rows), but Coinbase held ~$570 of
bot-traded crypto across 10 assets (NEAR $250, ALGO, SUI, AXS, AVAX, FIL, ICP,
COMP, INJ, BTC) for positions booked closed. Crucially this was NOT limited to the
50 `ZOMBIE_INSUFFICIENT_FUNDS` reconciled closes — FIL (19/19 clean) and INJ
(13/13 clean) had zero reconciles/partials yet still left whole positions
un-sold. Fully-liquidated symbols leave only sub-$1 dust (the "good" signature);
orphans leave whole-position-sized balances.

**Dry-run orphan-sweep preview refinement (2026-06-06):** after excluding the
protected never-sell set (QNT/SHIB/GRT/JASMY/ALEO/NU/MLN), still-tracked open
positions (NEAR ~125 held ≈ tracked), cash (USD ~$1.75k + USDC), and sub-min-notional
dust, the genuinely bot-orphaned + SELL-eligible (≥ Coinbase $1 min_market_funds,
tradable) set was **9 assets ≈ $318.50**: ALGO, SUI, AXS, AVAX, FIL, ICP, COMP, INJ,
BTC. 8 more bot-orphaned but sub-$1 → leave as dust. Pricing must use Coinbase PUBLIC
endpoints (`api.coinbase.com/v2/prices/{A}-USD/spot`, `api.exchange.coinbase.com/
products/{A}-USD` min_market_funds) — the authenticated per-asset getTicker 429s hard
under prod polling on the shared key.

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
