// ─────────────────────────────────────────────────────────────────────────────
// authFetch — cross-subdomain auth bridge.
// ─────────────────────────────────────────────────────────────────────────────
// On the production 3-domain split (trade./admintrade./api.aicandlez.com) the
// Clerk `__session` cookie is unreliable across subdomains under Safari ITP,
// default SameSite=Lax, and Storage Partitioning. Cookie-only fetches will
// 401 even for signed-in operators.
//
// useUserRole already mitigates this for `/api/auth/me` by attaching a Bearer
// fallback. Every other `fetch(..., { credentials: "include" })` site in the
// dashboard was still cookie-only — so role-resolution worked, but
// `/api/user/exchanges`, `/api/admin/top-telemetry`, `/api/simulation/*`,
// `/api/engine/arm`, `/api/exchange/order/execute`, etc. all 401'd, breaking
// ARM + live BUY for the operator.
//
// This helper:
//   • Reads the current Clerk session token via the global `window.Clerk`
//     (set by ClerkProvider on mount). No React-hook dependency, so it can be
//     called from anywhere — useQuery factories, raw event handlers, etc.
//   • Attaches `Authorization: Bearer <token>` when a token is available.
//   • Always sets `credentials: "include"` so the cookie path still works
//     same-origin and as a belt-and-suspenders fallback cross-origin.
//   • Preserves any explicit Authorization header the caller passes in.
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    Clerk?: {
      loaded?: boolean;
      session?: {
        getToken: (opts?: { template?: string }) => Promise<string | null>;
      } | null;
      load?: () => Promise<void>;
    };
  }
}

// Wait (up to ~3s) for Clerk JS to finish loading and rehydrate its
// session. During app boot there is a window where `window.Clerk` exists
// but `Clerk.loaded === false` and `Clerk.session === null` — calling
// `getToken()` then returns null, authFetch falls back to cookie-only,
// and cross-subdomain requests 401. Polling briefly here closes that race
// without forcing every caller to be hook-aware.
async function waitForClerk(timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.Clerk?.loaded && window.Clerk?.session) return;
    if (window.Clerk?.loaded && !window.Clerk?.session) return; // genuinely signed-out
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Resolve the API base URL once at module load. On production hosts
// (trade./admintrade.aicandlez.com) this is `https://api.aicandlez.com`
// supplied via `VITE_API_BASE_URL`. On the dev preview / same-origin
// builds this is empty so callers stay same-origin.
//
// Why this matters: admintrade.aicandlez.com is a *static* Render service —
// it has no `/api/*` handler, so a bare `fetch("/api/exchanges/catalog")`
// returns the SPA's `index.html` (200, text/html). `r.json()` then throws,
// the React Query falls back to a stub catalog, and the admin sees only
// "Alpaca" in the exchange picker. Prefixing the cross-origin API host
// fixes every authFetch caller in one place (parity with `useUserRole`,
// which already does this manually).
const API_BASE_URL = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "");

function resolveUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!API_BASE_URL) return input;
  if (typeof input !== "string") return input;
  // Only rewrite same-origin `/api/...` paths. Leave absolute URLs and
  // non-`/api` paths alone.
  if (input.startsWith("/api/") || input === "/api") {
    return `${API_BASE_URL}${input}`;
  }
  return input;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let token: string | null = null;
  try {
    await waitForClerk();
    token = (await window.Clerk?.session?.getToken?.()) ?? null;
  } catch {
    token = null;
  }
  const headers = new Headers(init.headers ?? {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(resolveUrl(input), { ...init, credentials: "include", headers });
}
