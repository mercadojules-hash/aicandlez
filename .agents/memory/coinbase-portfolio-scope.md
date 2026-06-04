---
name: Coinbase portfolio scope vs equity read
description: Why Coinbase "account is not available"/INSUFFICIENT_FUND happens while the portal shows a healthy equity; how per-user live equity is sourced for risk sizing.
---

# UPDATE 3 (raw API audit): STAKED balances are invisible to getAccount() → equity under-reports by the staked $

**Verified by a read-only per-portfolio breakdown pull (`/api/v3/brokerage/portfolios/{uuid}`)
for a QA account whose Coinbase Advanced "Total Balance" exceeded our equity by ~$1,398:**
- ONE portfolio ("Default"). Coinbase breakdown total = $4,368.83; `getAccount()` = $2,970.94.
- Per-asset `spot_positions[]` reconciled exactly: every asset with `available_to_trade_fiat > 0`
  IS counted by us; every asset with **`available_to_trade_fiat = 0` (STAKED)** is DROPPED. The
  gap was SOL ($966) + ADA ($280) + ETH ($152) + dust POL/NU ≈ $1,398 — all staked.
- **Root cause:** `getAccount()` builds `balances[asset].total = available_balance + hold` from
  `/api/v3/brokerage/accounts`. Staked/bonded amounts are NOT in `available_balance` or `hold`
  (they live in a separate staked balance), so `total = 0` → the `bal.total > 0` filter excludes
  them from `heldCrypto` → $0 contribution. NOT a pricing failure (best_bid priced every liquid
  asset fine; our priced spot ≈ Coinbase fiat within ~$2 best-bid-vs-mid drift).
- **The staked $ is REAL account value but NOT deployable** (must unstake w/ cooldown before it's
  even liquid spot, let alone tradable). So the correct fix is a DISPLAY split (Total Account
  Value incl. staked vs Available Trading Cash vs Deployed) — and the risk/free-capital gate must
  keep sizing off DEPLOYABLE funds, NOT the staked-inclusive total, or it approves BUYs the broker
  can't fund. The authoritative total incl. staked = portfolio breakdown `total_balance`, not the
  available+hold sum.

**How to apply:** when Coinbase "Total Balance" > our equity and `/portfolios` returns ONE
portfolio with USD present, check `spot_positions[].available_to_trade_fiat == 0` (staked) before
any pagination/currency theory. Reconcile via the portfolio breakdown endpoint (Coinbase's own
per-asset fiat), not just `/accounts`.

# UPDATE 2 (raw API audit): getAccount() DROPS the USD fiat account — un-paginated /accounts fetch

**Verified by a fresh read-only raw pull after the QA user converted USDC→USD:**
- Coinbase consumer app + raw `/api/v3/brokerage/accounts?limit=250` BOTH show
  **USD available = $612.21** (single "Default" portfolio), USDC ≈ $0.00006 dust,
  total_crypto ≈ $3,843, portfolio total ≈ $4,455.
- But `adapter.getAccount()` returned **cash: 0**, totalEquityUSD ≈ $0.00006
  (USDC dust only). The USD fiat account was MISSING from `balances` entirely.
- **Root cause:** `getAccount()` calls `signedGet("/api/v3/brokerage/accounts")`
  with NO `limit` and NO pagination loop. Coinbase auto-provisions a wallet per
  supported asset (200+); the default page (~49, crypto first / fiat last) does
  NOT include the USD fiat account, so the `if (asset === "USD")` branch never
  runs → cash stays 0. The code DOES intend to count USD+USDC; it just never
  receives the USD row. Adding `?limit=250` (or cursor pagination) makes USD
  appear. This UNDERSTATES deployable equity to ~$0 whenever USD sits past the
  first page.
- **Why the dashboard "Coinbase balance" tracked $604→~$0:** the customer tile is
  fed by `usdBreakdown.total` (cash + USDC). When the headline was USDC, it read
  ~$604; after USDC→USD conversion the USDC went to dust and the USD that replaced
  it is invisible to `getAccount()` → tile collapses to ~$0 ("$6.02" = the 6025…
  dust significand).
- **Liquidity guard is decoupled from broker cash:** `evaluateLiquidityGuard`'s
  `availableCashUsd` is sourced from `sim_accounts.cashBalance` (PAPER ledger) in
  BOTH the 0LIQ execution gate and the `/user/ai-trading/liquidity` UI route
  (`readUserCashBalance`). So "buying power $0.00 / shortfall" is NOT the broker
  USD; a live broker-cash display reading `usdBreakdown.cash` (=$0 from the bug)
  is the only thing that shows $0 buying power.

**How to apply:** when Coinbase equity/cash reads ~$0 but the user has real USD,
suspect the un-paginated `/accounts` page cutoff FIRST (pull `?limit=250` to
confirm USD reappears) before any currency-wallet/portfolio theory below.

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

# Option A (APPROVED): Coinbase equity = TRUE total account value

`CoinbaseAdapter.getAccount()` now sets `totalEquityUSD = USD cash + USDC +
priced non-USD crypto holdings`, and `usdBreakdown` carries a numeric `holdings`
field. `riskGate.readUserLiveEquity` returns `acct.totalEquityUSD` directly
whenever `usdBreakdown.holdings` is numeric (the Coinbase capability marker),
bypassing the legacy `priceUserLiveAccount` repricer. Kraken (no `holdings`
field) stays on the legacy path, untouched.

**Why:** `priceUserLiveAccount` builds an UNAUTHENTICATED adapter → Coinbase
`best_bid_ask` 401s → all non-USD crypto priced at $0 → equity collapses to
cash-only. Then `freeCapital = equity − openNotional − reserve` subtracts the
notional of deployed capital that was never counted in equity → free capital
drains ~2× too fast (double-count). Pricing holdings INTO equity fixes it.

**How to apply / invariants:**
- Holdings are marked at **best-BID** (conservative, never overstates), priced
  via the AUTHENTICATED `best_bid_ask`. One batched call; Coinbase 400s the whole
  batch if ANY `product_id` is delisted/invalid (e.g. CLV-USD), so on batch
  failure it falls back to per-product pricing — a bad id drops only itself.
- **Degrades SAFE:** any unpriceable asset is skipped (under-report, never
  throw); a full `best_bid_ask` outage → holdings=0 → equity = cash-only (the
  old conservative number), never an overstatement.
- Equity intentionally now exceeds deployable USD cash (that older "overstates
  deployable USD" bullet above is now the DELIBERATE Option-A tradeoff): equity
  reflects total account value for the free-capital gate; a BUY still needs
  USD/USDC and can still fail INSUFFICIENT_FUND when the account is mostly coins.
  That is expected — Option A fixed sizing double-count, NOT the currency mix.
- Cost: `getAccount()` now adds pricing call(s) on every caller (balance polls,
  reconciler, risk gate). Acceptable at current scale; if rate-limit pressure
  shows up, add a short per-connection TTL cache or a balance-only fast path.
- Did NOT implement depth/order-book-walked liquidation valuation (architect
  raised it): best-bid single-price marking is already conservative and
  consistent with how the rest of the system marks equity; depth-walking is out
  of scope for Option A.
