# AICandlez — Historical Archive

Archived context moved out of `replit.md` to keep that file focused on the
**current** production system. Nothing here is required to operate or change the
live system; it is retained for provenance only. Detailed phase/pass narration
lives in git history.

---

## Domain migration (3-domain split rollout)

The production surface migrated from a single `dashboard.aicandlez.com` host to a
3-domain split (`app.` PWA, `trade.` customer portal, `admintrade.` admin
portal).

- `dashboard.aicandlez.com/*` was **preserved during the migration** and is
  slated for retirement after the `trade.` / `admintrade.` cutover is fully
  settled. The `aicandlez-dashboard` Render service remained defined in
  `render.yaml` throughout the transition.
- Current state is documented in `replit.md` → "Production hosting"; this note
  records only the transitional rationale.

---

## AdminPortalLegacy rollback hatch

When `AdminPortalShell` replaced the legacy admin portal, the previous
implementation was kept byte-frozen as `AdminPortalLegacy`, reachable via
`VITE_ADMIN_PORTAL_LEGACY=true`, as a rollback hatch during the portal rewrite.
It remains available but is not part of the default render path.

---

## On-call billing-hold safety (origin)

The super-admin-only `forceRestoreBilling` / `waiveAllPendingFees` controls and
the 72-hour restore grace window in `evaluateAndEnforceBillingHold` were
introduced as the mitigation for a billing-hold incident (internally tagged
P0-01). The active runbook (maintain two super-admins, grace-window behavior)
lives in `replit.md` → "On-call"; only the incident origin is archived here.

---

## Production Optimization Package (P1–P6) — merged

A production-tuning package was designed as P1–P6 and merged to `origin/main`.
The behavior it introduced is now documented as ordinary current behavior in
`replit.md` (AI Trading Architecture / Environment Variables). Summary of what
each item became:

- **P1 — LIVE stop-loss stabilization:** stabilization grace + consecutive-breach
  confirm + catastrophic-override fast path on the LIVE stop trigger. The 2% stop
  **level** was unchanged; only the trigger was de-noised. Paper SL untouched.
- **P2 — Symbol policy:** per-symbol live disable list + size multipliers
  (`symbolPolicy.ts`), enforced at the customer live chokepoint (gate `0SYM`).
- **P3 — Category allocation default:** majors-heavy default allocation applied
  when an account has no explicit allocation (gate `0ALLOC`).
- **P4 — Exit optimization:** trailing-stop default. Initially set to 1.5%, then
  **widened to 2% post-deploy**. SL 2% / TP 4% / max-hold 24h were kept at the
  time. **Later superseded** by the active TP10 / trailing5 live test (current
  values live in `exitConfig.ts`; see `replit.md` → "Active live experiments &
  known issues").
- **P5 — Confidence floor:** intentionally **no code change**; floor stays 40.
- **P6 — Capital scaling:** post-deploy production-DB data change (per-account
  sizing + allocation), applied operationally after deploy — not a code change.

The original P1–P6 session-plan text is superseded; do not re-execute it.

---

## Archived from replit.md (trim — 2026-06-05)

Deep implementation narration moved out of the live README. Current behavior
lives in code + `.agents/memory/` topic files; this is historical context.

### Customer live-execution gate stack (full prose)
`placeLiveAutoOrderForUser` is the single customer chokepoint for both the AI
fan-out and manual `/api/user/live-order` (operators bypass). Ordered live-only
gates: 0UNI (`symbol_not_in_universe`); 0SYM per-symbol disable list + size
multiplier (`symbol_disabled`, SoT `symbolPolicy.ts`); 0SHORT spot-short block
(`spot_short_blocked`, NEW SELL entries only, pre-broker, no notification; venue
must be in `SHORT_CAPABLE_EXCHANGES` env allowlist — default empty = no shorting;
closes via `placeLiveCloseOrderForUser` unaffected); 0TREND SELL-only 1H-trend
filter (`sell_blocked_bullish_1h`, behind `LIVE_BLOCK_SELLS_IN_BULLISH_1H`,
default OFF); 0c platform concurrent-cap (`concurrent_live_cap_reached`); risk
gates; 0ALLOC category-allocation soft-cap (falls back to
`DEFAULT_CATEGORY_ALLOCATION` majors-heavy when no explicit allocation); 0CASH
pre-flight buying-power probe (`cash_unavailable`, BUY only, after adapter build
/ before submit; `usdBreakdown.cash`+stablecoin, fallback quote-asset free
balance; fails OPEN on probe error, no notification). Paper/sim never routes here.

### SELL-only 1H-trend filter (full prose)
When `LIVE_BLOCK_SELLS_IN_BULLISH_1H=true`, a new customer LIVE SELL (short) is
blocked while the engine's current 1H trend (EMA9 vs EMA21, read from
`engineStats.symbolBreakdowns`, not recomputed) is `bullish`; SELL allowed on
`bearish`/`unknown`. BUY unchanged. Default OFF = legacy. Block logs carry user,
exchange, symbol, confidence, 1H trend, reason `SELL_BLOCKED_BULLISH_1H`.

### LIVE stop-loss stabilization (full prose)
2% stop LEVEL unchanged; LIVE TRIGGER de-noised via stabilization grace +
consecutive-breach confirm, catastrophic-move override fast-path
(`runHardStopMonitor`). Knobs: `LIVE_STOP_STABILIZATION_MS` (90000),
`LIVE_STOP_CATASTROPHIC_MULT` (2.5×), `LIVE_STOP_IMMEDIATE_FRACTION` (must sit
inside the catastrophic band). Paper SL untouched.

### Active live experiments (as of trim)
- TP10/Trail5 live exit test (ACTIVE — do not revert without sign-off):
  `EXIT_DEFAULTS` TP 10% / trailing 5%; SL 2% unchanged; max-hold lowered
  24h→6h→1h universal. Live on the two internal QA accounts (teedelgado pro,
  info@mixtapepsd starter), both pin `trailing_stop_percent=5` explicitly.
  Revert target = TP4 / trail2 (recorded in `exitConfig.ts`).
- Per-user LIVE max-hold broker-reject zombies self-heal (DEPLOYED): detail in
  memory `live-maxhold-broker-close-zombies.md` + `balance-aware-live-close.md`.
- Live SHORTs not filtered differently from BUYs in prod (0TREND unset → OFF;
  BUY/SELL ~50/50; allocation by asset category, never by side).

### Active customer portal architecture (full prose)
Operator → customer-view override: an admin can render the customer shell at
`/portal` via the floating "View as Customer" toggle (localStorage
`aicandlez:operator-customer-view` or `?previewCustomer=1|0`);
`PortalCustomerShell` takes `operatorPreview` to suppress its defense-in-depth
`isAdmin` render refusal. Clerk role, `/command`, all server role checks
untouched (no escalation). `PortalCustomerShell` owns shared `nowShell` 1Hz
tick, lifted `/api/engine/status` query (`["engine-status-portal"]`),
`MarketPulse` view-model, `signalsPerMin` (ref-anchored, 15s warmup). Animation
policy: every motion answers "what intelligence state is this communicating?",
gated on `isReady`/`isFreshSignal`(<30s)/`isLiveTick`(<10s); idle systems stay
still. Polish tokens: `T.TRACK_LABEL=0.10em`, `T.TRACK_TITLE=0.18em`,
`T.TRACK_DISPLAY=-0.04em`, `T.TX_FAST=120ms`, `T.TX_MED=200ms`; `.cd-scroll` =
institutional thin neon scrollbar.
