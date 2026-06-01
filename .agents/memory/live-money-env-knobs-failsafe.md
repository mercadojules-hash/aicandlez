---
name: Live-money env knobs must fail-safe
description: Any env-tunable knob that gates a real-money exit/stop must validate finite+range and fall back to a safe default, never NaN.
---

Any env var that tunes a **live execution or exit gate** (e.g. the LIVE_STOP_*
stop-loss stabilization knobs in `tradingLoop.ts`) must be parsed with a
finite + range guard and fall back to a hard-coded safe default on bad input.

**Why:** Bare `Number(process.env.X ?? "default")` returns `NaN` for a malformed
value ("abc", ""). `NaN` comparisons are always false, so a buffered/catastrophic
breach check silently evaluates false and the **live stop-loss can stop firing** —
a fail-OPEN real-money safety regression. Caught in architect review of the
Production Optimization Package P1.

**How to apply:** Use a `parseKnob(name, raw, fallback, min, max)` helper that
returns the fallback when `!Number.isFinite(n) || out of range`, collects the bad
inputs, and logs one `WARN` at boot. Pick conservative bounds so no value can
neutralize the protection (e.g. spread buffer capped below the 2% stop distance;
confirmation ticks floored at 1; catastrophic mult floored at 1).
