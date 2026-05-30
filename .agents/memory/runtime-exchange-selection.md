---
name: Customer runtime exchange selection (canTrade SoT)
description: How a customer's picked execution exchange propagates to the live engine, and why trade-authorization must be enforced server-side.
---

# Customer runtime exchange selection

The customer RuntimeSwitcher persists `activeRuntimeExchange` via `PUT /api/user/settings`, then invalidates runtime-state. Selection becomes authoritative for the live engine **only via the `GET /api/user/runtime-state` cohort writeback**: when the resolver lands `liveReady`, it transactionally sets the active exchange `isDefault=true`+`tradingMode="live"` and clears `isDefault` on the others. Execution / risk / sizing all select by `isDefault=true AND status=active AND tradingMode=live` — they never read `activeRuntimeExchange` directly.

**Why the writeback lives on the GET, not the PUT:** only the GET has live balance-poll health (`ok`) data. Doing the promotion in the PUT would risk pinning `isDefault` on an unhealthy/unauthorized connection. The small post-PUT race window (an AI tick firing on the prior `isDefault` before the next runtime-state fetch) is the same pre-existing accepted TOCTOU the codebase documents.

**`canTrade` must be enforced at every server gate, not just the UI.** A live exchange is selectable/promotable only when Connected + Healthy + trade-authorized. `canTrade = permissions?.trade !== false` (explicit `false` blocks; missing/undecided = authorized, for backward compat with connections recorded before permission detection). Three gates must agree or a direct API call / stale stored choice can route the runtime — and thus the writeback → execution — to a trade-unauthorized venue:
1. Client switcher selectability (both TD + PWA).
2. `PUT /user/settings` validation (409 `not_trade_authorized`).
3. `GET /runtime-state` `healthyLive` predicate (`status===active && ok && canTrade`).

**How to apply:** any new field that gates live-eligibility (health, authorization, region, etc.) must be added to the `healthyLive` predicate AND the PUT validation in lockstep, or resolution and the cohort writeback diverge.
