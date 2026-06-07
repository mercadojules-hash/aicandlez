---
name: Starting Live Capital is manual-entry only
description: Why AICandlez Starting Live Capital must be entered by an admin, never auto-derived from the exchange
---

Starting Live Capital (the AICandlez performance baseline) is set MANUALLY via the
existing AI Allocated Capital control (`PUT /user/ai-capital` / admin
`PUT /admin/users/:id/ai-capital`, stored in `user_settings.ai_allocated_capital`).
The managed-performance LIVE block reads it as `startingLiveCapital`.

**Why:** The Coinbase adapter exposes only CURRENT balances (`getAccount` /
`getAccountValueUSD`) — there is NO transaction/ledger/deposit-history method.
Even with that data, "what counts as the AICandlez trading pool" is a
business/accounting decision (existing holdings, XLM liquidation, asset
conversions, capital reallocations) the broker cannot infer. The account owner
explicitly chose manual entry as the authoritative source of truth.

**How to apply:** Do NOT build Coinbase transaction-history reconstruction for
Starting Live Capital. If asked to "compute" it, route to the manual admin
control. `null` baseline → render a dash, never fabricate a number.
