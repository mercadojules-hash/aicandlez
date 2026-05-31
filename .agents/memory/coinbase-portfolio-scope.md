---
name: Coinbase portfolio scope vs equity read
description: Why Coinbase "account is not available"/INSUFFICIENT_FUND happens while the portal shows a healthy equity; how per-user live equity is sourced for risk sizing.
---

# Coinbase "account is not available" = trade-portfolio scope mismatch

**Rule:** Coinbase `getAccount()` (`GET /api/v3/brokerage/accounts`) returns every
account the API key can *view* across the profile, but `placeOrder`
(`POST /api/v3/brokerage/orders`) only executes in the portfolio the key is
*scoped to trade*. Our adapter omits `retail_portfolio_id`, so orders always hit
the key's **default** portfolio. If view-scope ⊋ trade-scope (funds sit in a
portfolio the key can read but not trade), the portal/risk equity reads fine
while orders fail:
- `400 INVALID_ARGUMENT · account is not available` — observed on **SELLs**; the
  base-asset account for that coin isn't present in the key's tradable portfolio.
- `200 INSUFFICIENT_FUND · Insufficient balance in source account` — the source
  asset (USD/USDC for BUY, the coin for SELL) isn't in the tradable portfolio.

**Why:** real prod incident — one user's Coinbase portal equity looked healthy
(~$623) yet every live order was rejected. Balance polls (`lastBalanceFetchAt`)
were succeeding (no `lastBalanceFetchError`), proving the read path worked; only
the order path failed. Root cause is Coinbase-side portfolio scoping, NOT our
code. We store no `portfolio_id` column and never switch portfolios.

**How to apply:** when Coinbase live orders fail but equity reads fine, do NOT
chase a code bug. Verify in the user's Coinbase Advanced Trade dashboard that the
API key's portfolio is the SAME portfolio holding the funds, and that the source
USD/USDC and the coin being sold live in that tradable portfolio. To read the
key's portfolio programmatically you'd call `/api/v3/brokerage/portfolios` with
the live key (do not decrypt user creds for diagnostics).

# Per-user live equity sourcing for risk sizing

`riskGate.composeRiskSnapshot` → `getUserEquityUsdSafe(userId)` →
`readUserLiveEquity`: reads the single connection WHERE
`isDefault=true AND status=active AND tradingMode=live`, decrypts, calls
`adapter.getAccount()`, then `priceUserLiveAccount` sums USD-stables + prices ALL
non-USD holdings at spot. Paper fallback (`sim_accounts.cashBalance` + open paper
notional) only when no live default connection.

- The doc comment at `riskGate.ts:~30` ("equityUsd = fetchLiveEquityWithMeta().
  totalEquityUsd") is STALE — that was the OPERATOR/global Kraken account and was
  replaced by the per-user path (see SEVERE-fix note at ~line 154). Trust the
  code, not that comment.
- **Sizing overstates deployable USD:** risk equity prices crypto holdings into
  the equity number, but a BUY needs USD/USDC cash. Coinbase adapter's own
  `getAccount().totalEquityUSD` counts only USD+USDC (deployable). So a large
  "equity" can still fail BUYs with INSUFFICIENT_FUND when it's mostly coins.
- Equity is per-user **isDefault** connection only. A user with two live
  connections (e.g. Kraken default + Coinbase non-default) is sized off the
  default/active exchange; `user_settings.active_runtime_exchange` mirrors it.
