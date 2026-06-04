---
name: Coinbase portfolio scope vs equity read
description: Why Coinbase "account is not available"/INSUFFICIENT_FUND happens while the portal shows a healthy equity; how per-user live equity is sourced for risk sizing.
---

# UPDATE (raw API audit): the real cause is currency-wallet mismatch, NOT portfolio scope

**Verified by a read-only raw `/api/v3/brokerage/accounts` + `/portfolios` pull
for the QA Coinbase account that showed "~$604.85 but every $50 order rejected":**
- The account has exactly ONE portfolio ("Default", DEFAULT type). EVERY account
  row carries the SAME `retail_portfolio_id`. So the view⊋trade portfolio-scope
  theory below was a RED HERRING for this case — there is no second portfolio/vault.
- The displayed "$604.85" is literally the **USDC** wallet balance (604.850060…).
  **USD cash is only ~$8.38.** Portfolio breakdown: total_balance ~$4,337,
  total_cash_equivalent ~$613 (USD 8.38 + USDC 604.85), total_crypto ~$3,724
  (SHIB/XLM/DOT/ALGO/JASMY/GRT/FET/… spread across ~16 alts).
- Why $50 orders still fail INSUFFICIENT_FUND despite "$604.85":
  - **BUY** → engine trades `BASE-USD` products (normaliseSymbol → `-USD`); a
    `-USD` market BUY draws the **USD** quote wallet = only $8.38. The $604.85
    USDC is NOT auto-spent on `-USD` pairs (it funds `-USDC` pairs / needs convert).
  - **SELL** (majority of attempts; spot has no shorting) → a market SELL needs
    the **exact base coin** in the wallet. Engine SELL signals on coins not held
    (or held < $50 worth) → "Insufficient balance in source account".
- Funds are NOT missing/hidden — they're real, in one portfolio, just in the
  WRONG currency/asset for the orders being placed.

**How to apply (updated):** when Coinbase shows healthy equity but every order
rejects, FIRST pull raw `/accounts` and check the split: is the headline number
USDC while USD cash (the `-USD` BUY source) is ~empty, and are the SELLs for
coins not held? That is the common cause. Only chase portfolio-scope (below) if
`/portfolios` actually returns >1 portfolio or accounts carry differing
`retail_portfolio_id`s. Decrypting QA creds for a one-off read-only audit is
acceptable when explicitly requested by the operator; never print the key/secret.

# (legacy theory) Coinbase "account is not available" = trade-portfolio scope mismatch

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
