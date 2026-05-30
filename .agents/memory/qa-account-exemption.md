---
name: QA/internal account entitlement exemption
description: How and why platform QA accounts are exempted from tier trade limits, and what must stay enforced.
---

# QA / internal account entitlement exemption

Platform dev/QA accounts are exempted from **tier entitlement throttling**
(daily-trade cap + concurrent-position cap) via the `users.is_internal_account`
boolean flag — NOT by elevating them to admin/operator role and NOT by raising
global platform limits.

**Why this flag (vs role / operator flag / override table):** it grants the
exemption without handing QA accounts operator privileges or the broader
operator gate-bypass, it's a single durable boolean per user, and it already
existed as the SoT for performance-fee exemption (`feeLedger.ts`). Role
elevation would over-grant; a separate override table is more moving parts and
can drift inert (we already had a stale `user_trade_limits` row that did
nothing).

**What internal accounts bypass:** daily cap (gate 0b via
`tradeLimitEngine.resolveCap` unlimited short-circuit), platform concurrent cap
(gate 0c), and plan max-open-positions (gate 0LIQ Gate A, via the
`unlimitedPositions` input to `evaluateLiquidityGuard`).

**What they MUST still respect (do not let future changes bypass these for
internal accounts):** liquidity cushion (gate 0LIQ Gate B, sized to the single
pending entry), per-user risk budget (gate 0d — operator-only bypass, internal
deliberately NOT exempt), position sizing, stop-loss/take-profit, exchange
balance.

**How to apply:** the exemption predicates (`isInternalAccount`,
`isOperatorRole`, and the `resolveCap` lookup) are fail-closed — a DB error
throttles as a normal customer. Keep them fail-closed. The flag must be set in
BOTH prod and dev DBs; it is data, so it won't appear in a code diff.

**Known out-of-scope risk:** the `count*` helpers
(`countOpensInWindow`, `countOpenLivePositions`) are fail-OPEN on DB error
(synthetic zero count) — a deliberate availability tradeoff, independent of this
exemption. Harden to fail-closed only as a separate, considered change.
