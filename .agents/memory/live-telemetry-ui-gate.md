---
name: Live-telemetry UI gate
description: How to gate live-vs-virtual display surfaces so transient broker outages never revert real-money customers to misleading paper/virtual KPIs.
---

# Live-vs-virtual display gate

A customer-facing telemetry surface that switches between a REAL broker-sourced
view and a virtual/paper view MUST gate that switch on **"does the user have an
active live exchange connection"**, NOT on **"did the balance poll succeed this
cycle"**.

**Why:** the AICandlez Managed Performance panel originally derived
`hasLiveExchange` from `liveAgg.exchanges.length > 0` (= successful polls). A
transient broker/API failure emptied that list, so the UI silently fell back to
the virtual AI KPIs (paper "Current AI Capital" $100k, synthetic "Cash
Available") — re-showing the exact misleading real-money numbers the live block
was built to replace.

**How to apply:**
- Track active-connection count separately from successfully-polled exchanges.
- Gate the live section on active-connection count; on poll failure keep the
  live section mounted, render dashes for unavailable values, and show an error
  banner. Never fall back to virtual KPIs for a connected live customer.
- Surface the balance error whenever a poll failed — full OR partial coverage
  (one exchange ok, another failed) — not only on total failure.
- A `null` numeric from the server means "unavailable" → render a dash, never a
  fabricated 0.
- Label baseline-relative profit/ROI as "since starting capital" — it is a
  delta vs a user-declared baseline, not deposit-aware lifetime profit.
