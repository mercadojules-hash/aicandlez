---
name: LIVE stop-loss needs a stop-INDEPENDENT emergency backstop
description: Why the relative SL tiers can leak to -4/-5% and why an absolute entry-relative emergency stop is required
---

# LIVE stop-loss: the relative tiers can leak; keep an absolute backstop

All the LIVE stop-loss fast tiers in `runHardStopMonitor` (catastrophic /
immediate / grace / N-tick confirmed) are computed RELATIVE to the position's
stored `stopLoss` price AND live inside `if (p.stopLoss !== null)`. That means a
LIVE position that reaches the monitor with a **null or stale stop**, or whose
adverse move never registers as `rawBreach`, has NO fast exit at all — only the
price-independent max-hold ceiling catches it, so the loss rides to -4%/-5% and
closes as a MAX_HOLD (or an overshoot STOP_LOSS) far past the configured 2%.

**Why:** a prod audit (post the 2026-06-01 immediate-tier deploy) showed the
worst LIVE losers were MAX_HOLD exits at -4 to -4.5% that NEVER stopped, not
stabilization-delay STOP_LOSS exits. Stabilization grace is only ~90s and cannot
explain a 6h ride; the only consistent cause is the stop logic never engaging.

**How to apply:** keep an absolute, entry-relative emergency backstop
(`LIVE_STOP_EMERGENCY_PCT`, default 3%, floor 2.5%, cap 5%) that fires on raw
loss from entry, INDEPENDENT of `p.stopLoss`, gated on `reason === null && isLive`
so it's purely additive (never changes the normal 2% stop / TP / trailing /
max-hold / paper). It is a backstop, not a replacement: it cannot undo a
single-tick gap + broker fill slippage on a fast/illiquid move (e.g. an XLM
-4.79% one-jump) — that needs lower detection latency or broker-native stop
orders, not a tighter threshold. Assumes SL is a universal 2% (no intentionally
wider custom stops); if wider per-account stops are ever introduced, gate the
emergency to `max(EMERGENCY_PCT, stop-derived level)` so it can't pre-empt them.
