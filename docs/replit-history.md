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
