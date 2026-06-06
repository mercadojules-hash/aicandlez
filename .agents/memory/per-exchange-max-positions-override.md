---
name: Per-exchange max_positions overrides the concurrent cap
description: Why raising user_risk_settings.max_simultaneous_trades doesn't lift a parallel-enabled user's concurrent live cap
---

For a `multi_exchange_parallel_enabled` user whose AI fan-out is venue-scoped
(targetExchange set), the effective concurrent-live cap (riskGate Cap 2 + 0LIQ
liquidity guard + per-category budget) is `user_exchange_settings.max_positions`
for that venue — NOT `user_risk_settings.max_simultaneous_trades` and NOT
`user_settings.per_exchange_max_positions`.

Precedence (parallel + scoped order path, `placeLiveAutoOrderForUser`):
per-exchange row `user_exchange_settings.max_positions` (when present, integer >0)
REPLACES `effectivePerExchangeMax` (from `user_settings.per_exchange_max_positions`,
default 20), which in turn is passed as `maxSimultaneousOverride` to the riskGate,
overriding `user_risk_settings.max_simultaneous_trades` entirely.

**Why:** a user can appear stuck at an odd concurrent number (e.g. exactly 10)
even after you raise max_simultaneous_trades to 20 — because the binding value is
a stale per-exchange override. An internal QA account (Coinbase) was
pinned at 10 by `user_exchange_settings.max_positions=10` while every other cap
read 20; the riskGate log said "your cap is 10" with the DB max_simultaneous=20.

**How to apply:** to change a parallel user's live concurrent cap, edit the
per-(user,exchange) row in `user_exchange_settings.max_positions` for the venue
they actually trade. Verify ALL of: user_exchange_settings.max_positions (venue),
user_settings.per_exchange_max_positions, user_settings.max_active_positions,
user_risk_settings.max_simultaneous_trades. riskGate reads these FRESH per order
(no redeploy needed) — a prod DB UPDATE takes effect within ~30-60s (equity cache
TTL). Non-parallel users instead use max_simultaneous_trades directly.

Separately, the platform-wide gate 0c (`concurrent_live_cap_reached`,
LIVE_EXECUTION_CONCURRENT_CAP) is shared across all users; check the logs table
for that errorCode to tell whether the shared cap (vs the per-user cap) is the
binding one. Zero such rows = platform cap has headroom.
