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
      session?: {
        getToken: (opts?: { template?: string }) => Promise<string | null>;
      } | null;
    };
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let token: string | null = null;
  try {
    token = (await window.Clerk?.session?.getToken?.()) ?? null;
  } catch {
    token = null;
  }
  const headers = new Headers(init.headers ?? {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, credentials: "include", headers });
}
