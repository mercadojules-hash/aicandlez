---
name: AI-trading activation banner reconciliation
description: Why the customer AI-trading "ACTIVATION FAILED" banner must reconcile its sticky local error state against the authoritative polled enabled state.
---

# AI-trading activation banner reconciliation

The customer portal AI-trading bar (`PortalCustomerShell.tsx`) drives its red
"ACTIVATION FAILED" banner from `activationError`, a sticky local React state set
on ANY failed `POST /api/user/ai-trading/enable`. The authoritative truth is the
polled `GET /api/user/ai-trading/state` (`enabled`).

**The trap:** because `autoMode` is persisted server-side, a transient enable
POST failure (catch-all 500 "Failed to update AI trading state", or a re-arm
re-post after a hard refresh) can coexist with a fully-running trading loop —
positions open, fills occurring, P&L normal — leaving a permanent FALSE banner.
The local error state never reconciled against `enabled`; it only cleared on next
attempt, success, or manual dismiss.

**Invariant (don't regress):** an "activation failed" banner must never be shown
while the server confirms AI is enabled. Reconcile sticky local action-error
state against authoritative polled state, and scope by intent.

**Why:** `enabled` staying `true` the whole time means a `[enabled]`-only effect
never re-fires; you must also depend on the error itself. And a blanket
`!enabled` render-gate would mask a genuine DISABLE failure (user tried to turn
AI off, it failed, `enabled` still true), so tag the failure with
`action: "enable" | "disable"` and only suppress stale ENABLE errors.

**How to apply:** if you add/optimistically-set any local error state for an
action whose outcome is also reflected in a polled server flag, reconcile it
against that flag (clear + render-gate), scoped to the action that flag
contradicts — never leave it purely sticky.
