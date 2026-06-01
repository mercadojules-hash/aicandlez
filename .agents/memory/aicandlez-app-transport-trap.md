---
name: aicandlez-app transport helper trap
description: Why new /api calls in the aicandlez-app PWA must use authFetch, not the older api.ts helper
---

# aicandlez-app has TWO frontend transports — only one satisfies the locked invariant

`artifacts/aicandlez-app/src/lib/` ships both:
- `api.ts` (`api.get/put/post/delete`) — older, raw `fetch` + `credentials:"include"`. Cookie-only. NO Clerk Bearer fallback, NO `ApiContractError`.
- `authFetch.ts` (`authFetch`) — the locked cross-origin primitive (Bearer cookie-fallback for Safari ITP/SameSite, throws on non-JSON OK).

Many older files (Profile.tsx and ~20 others) still use `api`; newer hooks/contexts use `authFetch`. The codebase is mid-migration.

**Rule:** ALL new `/api/*` calls MUST go through `authFetch` per the locked transport invariant in replit.md — even inside a file whose existing calls use `api`. Following the local file convention (`api`) is a review blocker.

**Why:** `check-no-bare-api-fetch` does NOT catch `api.*` calls (it only flags bare `fetch("/api...")`), so a typecheck + guard pass is NOT proof of compliance. The architect/code-review explicitly fails on `api.*` for new endpoints.

**How to apply:** `authFetch` returns a `Response` and expects an `/api`-prefixed path (it prepends `VITE_API_BASE_URL`). The `api` helper returns parsed JSON and takes paths WITHOUT `/api`. To bridge, wrap: `authFetch(\`/api\${path}\`)` then `res.text()`→`JSON.parse`→throw on `!res.ok` (see `exitApi` in Profile.tsx).
