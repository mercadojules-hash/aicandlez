---
name: Customer headline equity sourcing
description: Which equity figure the customer portal/PWA headline must display in LIVE runtime
---

# Customer headline equity must reference the ACTIVE exchange only

In LIVE runtime, the customer headline equity must reference ONLY the active
exchange's balance — the same account the runtime label, risk gate, and
execution engine evaluate. It must NOT be the sum of all connected exchanges.

**Why:** A user with two connected exchanges (e.g. Coinbase active+default at
~$0.29, Kraken non-default at ~$60.55) previously saw the SUM (~$60.55,
Kraken-dominated) as the headline, while runtime/risk/exec all evaluated
Coinbase. That mixed state is confusing and misrepresents buying power.

**How to apply:**
- Server SoT: `GET /api/user/runtime-state` exposes `activeEquityUSD` (active
  exchange only; 0 in paper) AND `totalEquityUSD` (sum of healthy connections,
  used ONLY for the informational "Connected Exchanges" panel — never the
  headline). Active equity = `connectedExchanges.find(activeExchange).totalEquityUSD`.
- Clients bind the LIVE headline to `activeEquityUSD`, never `totalEquityUSD`.
  PWA `Home.tsx` derives the same active-only value inline; trading-dashboard
  `PortalCustomerShell` headline reads `activeEquityUSD`.
- Paper mode keeps its own branch (paper account equity); `activeEquityUSD` is 0.
- Per-exchange balances are fine to display in a dedicated Connected Exchanges
  list (with an ACTIVE badge) as long as they don't feed runtime math.
