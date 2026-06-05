---
name: Live cash recycling = exchange, not internal ledger
description: Two-ledger model for capital recycling; live open never debits the internal sim ledger while close credits it (asymmetry); recycling for live happens at the broker.
---

# Capital recycling: two separate ledgers

AICandlez runs **two parallel ledgers**; conflating them is the trap.

1. **Internal sim ledger** (`sim_accounts.cashBalance` / `totalRealized`).
   `equityProxy = cashBalance + Σ position.sizeUSD`. This is the **PAPER**
   source of truth: paper OPEN debits cash (`placeUserOrder`,
   `cashBalance -= sizeUSD`), paper CLOSE credits it (`finalizeClose`,
   `cash += closedSizeUSD + realizedPnL − netFees − platformFeeUSD`).

2. **Exchange balance** (read live via `adapter.getAccount()`). This is the
   **LIVE** source of truth for both buying power (the 0CASH pre-flight probe
   in `placeLiveAutoOrderForUser` reads `usdBreakdown.cash + stablecoin`) and
   headline live equity (`activeEquityUSD` in `routes/runtimeState.ts` =
   `connectedExchanges[].totalEquityUSD`).

## How live recycling actually works
Both live BUY and live SELL/close submit `adapter.placeOrder({type:"market"})`.
A spot **market SELL auto-settles the filled crypto into quote currency
(USD/USDC) in the same wallet at the broker** — that is the recycling. The next
BUY re-reads the exchange balance, so proceeds are immediately redeployable.
Coinbase and Kraken are identical at this layer (differences are adapter-level:
Kraken acks market orders as status="open"→polled, more partial fills, non-USD
fee currency falls back to catalog estimate).

## The asymmetry (non-obvious; not a recycling break)
Live OPEN (`registerLiveUserFill`) records the position but **never debits**
`sim_accounts.cashBalance`. Live CLOSE (`finalizeClose`) **credits** it with no
`isLive` branch. So the internal ledger drifts UP for live users.
**Why it's harmless to trading:** live buying power + headline equity come from
the exchange, not this ledger. **Where it leaks:** `routes/mobile.ts`
`/portfolio` reads `totalValue`/`realized` from `getUserAccountSummary` (the
internal ledger), so that specific surface can misstate a pure-live user's
equity. Verify the consuming UI before "fixing" — the PWA hero uses
runtime-state `activeEquityUSD` (exchange), not this.

## Only path that marks closed while crypto may remain at exchange
`reconcileZombiePosition` retires a row LOCALLY with no broker SELL:
- `RECONCILED_INSUFFICIENT_FUNDS` — only after verifying free balance < qty
  (asset already gone) → nothing remains.
- `RECONCILED_CONNECTION_REMOVED` — connection fully removed, venue
  unreachable, so real crypto MAY remain in the user's wallet (intentional,
  audited, user-notified; removing keys never moves coins).
Partial fills leave the unfilled remainder as an OPEN position (not "closed").
