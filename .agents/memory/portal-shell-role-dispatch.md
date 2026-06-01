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
`OPERATOR_ADMIN_EMAILS`. `/auth/me` (`routes/auth.ts`) **re-asserts** the
allowlisted role on *every* login (defends against DB downgrades) — so adding an
email to `OPERATOR_ADMIN_EMAILS` silently changes that person's `/portal` view
from customer to admin on their next login, with no code touching Portal.tsx.

**How to apply:** When someone says "my portal looks wrong / reverted," first
check *which shell* is mounting (the code ships visible banners: red "ADMIN
SHELL ACTIVE" vs purple "CANDIDATE B ACTIVE") and *what role their email
resolves to* via the allowlist — before chasing deployed SHAs or stale builds.
Diagnose role first, deployment second.

## Operator → customer-view override
Operators who need to *see* Candidate B without losing admin access use the
persisted "View as Customer" toggle (localStorage
`aicandlez:operator-customer-view`, or `?previewCustomer=1|0`). It only lets an
*admin* render the lower-privilege customer shell (no escalation; server role
checks untouched). `PortalCustomerShell` gates this via an `operatorPreview`
prop that suppresses its defense-in-depth `isAdmin` render refusal. Default (no
override) preserves the locked admin → AdminPortalShell dispatch.
