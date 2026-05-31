---
name: Customer execution-funnel attribution chokepoint
description: Where per-customer live-order outcomes must be recorded, and the throw-path trap that undercounts attempts.
---

# Per-customer execution-funnel attribution

`executeCustomerOrder` (the single locked chokepoint for AI fan-out + manual
pill) is where per-customer attempt outcomes are recorded via
`recordCustomerAttempt(...)`, keyed by userId, for the portal's "MY EXECUTION
FUNNEL" panel. This is separate from the anonymous GLOBAL engine funnel
(executionFunnel / signalFunnel telemetry) — see those topic files.

**Rule:** attribution must be recorded on BOTH paths out of the gateway —
the normal return (success/failure from `placeLiveAutoOrderForUser`) AND the
catch/throw path (record `success:false`, errorCode `uncaught_exception`,
then rethrow unchanged).

**Why:** if you only record after the normal return, any uncaught exception
in `placeLiveAutoOrderForUser` rethrows past the recorder, so the funnel
silently undercounts attempts — the user sees fills/holds that don't add up
to real attempts. A code review caught exactly this gap.

**How to apply:** unknown errorCodes (incl. `uncaught_exception`) map to the
`other` reason in `classifyErrorCode`. Attribution is pure telemetry — never
let it change execution semantics or swallow the rethrow.
