---
name: High Total Account Value but ~$0 buying power (Coinbase customer)
description: Operator symptom — dashboard shows a healthy Total Account Value yet Available Trading Cash is near zero with only 1 "open position". Maps that symptom to its real cause so you don't chase a phantom missing-cash bug.
---

# "Why only $X cash when the account is worth $Y?" (Coinbase live customer)

**Operator symptom:** dashboard Total Account Value looks healthy (e.g. ~$3.9k)
but **Available Trading Cash** (= USD + USDC only) is near zero (e.g. $19), and
**Open Positions** shows just 1 even though yesterday there were many.

**This is NOT a missing-cash bug.** The cash is correct; the capital is simply
**not in cash**. Decompose the Coinbase total:
- Available Cash = `usdBreakdown.cash` (USD wallet) + `usdBreakdown.stablecoin`
  (USDC). This is the ONLY spendable buying power, and the dashboard math is right.
- Liquid Crypto = `usdBreakdown.holdings` — priced spot base assets sitting in the
  wallet, NOT counted as buying power.
- Staked = `getAccountValueUSD()` (Coinbase `total_balance`, staking-inclusive)
  − deployable total. Never deployable.
- "Open Positions" counts only AICandlez-**tracked** `sim_positions` rows, NOT the
  wallet's other crypto balances.

**Why cash drains toward zero while crypto residue grows:** every $N BUY spends
USD to acquire a base asset. A clean close SELLs it and settles proceeds back to
the **quote asset (USD)**, restoring buying power (there is NO auto USD↔USDC
conversion — both are just counted as fungible "cash"). But a large share of
Coinbase closes get retired **without an actual broker SELL**:
`RECONCILED_INSUFFICIENT_FUNDS` and/or `realized_pnl = 0` closes (dust /
min-notional / fee-shrinkage rejects — see `balance-aware-live-close.md` and
`live-maxhold-broker-close-zombies.md`). When that happens the tracked position
row goes away but the base crypto stays in the wallet as **untracked liquid
holdings**, and no USD is returned. Repeat overnight → USD cash bleeds to ~$0
while a pile of small crypto balances accumulates.

**Clearest fingerprint:** find a base asset held in large quantity (e.g. XLM
~10,344 units) whose recent Coinbase closes are logged `realized_pnl=0` /
`RECONCILED_INSUFFICIENT_FUNDS`. That asset is stranded buying power.

**How to apply:** when an operator reports "tons of value but no cash to trade,"
pull (1) live `getAccount().usdBreakdown` + `getAccountValueUSD()` for the active
exchange, and (2) the 60h closed-live trades grouped by `close_reason`. If
reconciled/zero-pnl closes dominate, the answer is stranded-as-crypto, not lost
cash. Caveat: not ALL wallet crypto is failed-close residue — some is older
trades, manual QA holdings, or the staked book. State the mix honestly.
