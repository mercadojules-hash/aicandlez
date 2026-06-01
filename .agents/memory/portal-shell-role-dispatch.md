---
name: Portal shell role dispatch & "customer portal regression" red herring
description: Why /portal can suddenly render the admin shell instead of the customer Candidate B shell — usually a role promotion, not a build rollback.
---

# /portal shell dispatch is role-driven, not build-driven

`trading-dashboard pages/Portal.tsx` is a pure role router:
`isAdmin === true → AdminPortalShell` (the graduated admin shell; or the
byte-frozen `AdminPortalLegacy` only when `VITE_ADMIN_PORTAL_LEGACY=true`);
`isAdmin === false → PortalCustomerShell` (Candidate B customer surface).
`isAdmin` comes from `useUserRole()` → `GET /api/auth/me`.

## The red herring
A report of "the customer portal reverted to the old admin shell / Candidate B
is gone" is most often **NOT a deployment rollback**. It is the **opposite**: a
newer change promoted the viewing account to `admin`, which correctly flips the
router to the admin shell. Candidate B only ever renders for non-admin accounts.

**Why:** `api-server lib/adminAllowlist.ts` holds `SUPER_ADMIN_EMAILS` +
`OPERATOR_ADMIN_EMAILS`. `/auth/me` (`routes/auth.ts`) resolves the allowlisted
role on *every* login — so adding an email to `OPERATOR_ADMIN_EMAILS` silently
changes that person's `/portal` view from customer to admin on their next login,
with no code touching Portal.tsx.

The allowlist is **authoritative in BOTH directions**: `/auth/me` promotes
listed emails AND downgrades a stale `admin` whose email is no longer listed
back to `user` (the lone exception is `super-admin`, which is never
auto-demoted). So revoking operator access = remove the email from
`OPERATOR_ADMIN_EMAILS` + redeploy; the account self-corrects to a plain
customer on its next `/auth/me`. (Earlier the code only promoted, never
downgraded — removing an email left the DB role stuck at `admin`, which is the
exact trap that made "operators stuck on the admin shell" look like a UI
regression.) The literal allowlist values live in `adminAllowlist.ts` — read
them there rather than duplicating account identities here.

**How to apply:** When someone says "my portal looks wrong / reverted," first
check *what role their email resolves to* via the allowlist (super-admin /
operator-allowlisted / plain user) — that determines which shell mounts — before
chasing deployed SHAs or stale builds. Diagnose role first, deployment second.
(The old red "ADMIN SHELL ACTIVE" / purple "CANDIDATE B ACTIVE" diagnostic
banners were removed once routing was confirmed; don't expect them in the UI.)

## Operator → customer-view override
Operators who need to *see* Candidate B without losing admin access use the
persisted "View as Customer" toggle (localStorage
`aicandlez:operator-customer-view`, or `?previewCustomer=1|0`). It only lets an
*admin* render the lower-privilege customer shell (no escalation; server role
checks untouched). `PortalCustomerShell` gates this via an `operatorPreview`
prop that suppresses its defense-in-depth `isAdmin` render refusal. Default (no
override) preserves the locked admin → AdminPortalShell dispatch.
