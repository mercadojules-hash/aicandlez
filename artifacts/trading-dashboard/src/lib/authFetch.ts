// ─────────────────────────────────────────────────────────────────────────────
// authFetch — cross-subdomain auth bridge + content-type guard.
// ─────────────────────────────────────────────────────────────────────────────
// On the production 3-domain split (trade./admintrade./api.aicandlez.com) the
// Clerk `__session` cookie is unreliable across subdomains under Safari ITP,
// default SameSite=Lax, and Storage Partitioning. Cookie-only fetches will
// 401 even for signed-in operators.
//
// This is the SINGLE fetch primitive for every `/api/*` call in the
// trading-dashboard. Task #172 made it the platform-wide ban; bare
// `fetch("/api/...")` outside this file is a build-time error
// (see `scripts/check-no-bare-api-fetch.ts`).
//
// This helper:
//   • Reads the current Clerk session token via the global `window.Clerk`
//     (set by ClerkProvider on mount). No React-hook dependency, so it can be
//     called from anywhere — useQuery factories, raw event handlers, etc.
//   • Attaches `Authorization: Bearer <token>` when a token is available.
//   • Always sets `credentials: "include"` so the cookie path still works
//     same-origin and as a belt-and-suspenders fallback cross-origin.
//   • Preserves any explicit Authorization header the caller passes in.
//   • Prefixes `/api/*` with `VITE_API_BASE_URL` so cross-origin static
//     hosts (admintrade., app., trade.) hit `api.aicandlez.com` rather
//     than their own SPA fallback (which returns 200 + `index.html`).
//   • Throws a structured `ApiContractError` when an `r.ok` response
//     comes back without `application/json` — this catches the
//     "static-host returned index.html" failure mode at the helper layer
//     so React Query doesn't silently swallow a JSON.parse and return `[]`.
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

// ─────────────────────────────────────────────────────────────────────────────
// API base URL resolution — exported so other modules (useUserRole, the
// boot-time validator banner) share a single source of truth.
// ─────────────────────────────────────────────────────────────────────────────
export const API_BASE_URL = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "");

/** Hosts that MUST have `VITE_API_BASE_URL` set (static Render services). */
const PROD_STATIC_HOSTS = [
  "admintrade.aicandlez.com",
  "trade.aicandlez.com",
  "app.aicandlez.com",
];

/** True if we are on a static prod host but `VITE_API_BASE_URL` is empty. */
export function isApiBaseUrlMisconfigured(): boolean {
  if (typeof window === "undefined") return false;
  if (API_BASE_URL) return false;
  return PROD_STATIC_HOSTS.includes(window.location.hostname);
}

// One-shot console alarm so the misconfiguration is loud in browser devtools.
if (typeof window !== "undefined" && isApiBaseUrlMisconfigured()) {
  // eslint-disable-next-line no-console
  console.error(
    "[authFetch] VITE_API_BASE_URL is empty on a static production host " +
      `(${window.location.hostname}). All /api/* requests will hit the SPA ` +
      "fallback and return index.html. Set VITE_API_BASE_URL=https://api.aicandlez.com " +
      "on this Render service and redeploy.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ApiContractError — thrown when an OK response violates the JSON contract.
// ─────────────────────────────────────────────────────────────────────────────
export interface ApiContractErrorPayload {
  url:         string;
  status:      number;
  contentType: string;
  bodyPreview: string;
  host:        string;
  apiBase:     string;
}

export class ApiContractError extends Error {
  readonly url:         string;
  readonly status:      number;
  readonly contentType: string;
  readonly bodyPreview: string;
  readonly host:        string;
  readonly apiBase:     string;

  constructor(payload: ApiContractErrorPayload) {
    super(
      `API contract violation: ${payload.url} returned ${payload.status} with ` +
        `content-type "${payload.contentType}" (expected application/json). ` +
        `Likely cause: VITE_API_BASE_URL misconfigured on ${payload.host} — ` +
        `request hit the static SPA host instead of the API host.`,
    );
    this.name        = "ApiContractError";
    this.url         = payload.url;
    this.status      = payload.status;
    this.contentType = payload.contentType;
    this.bodyPreview = payload.bodyPreview;
    this.host        = payload.host;
    this.apiBase     = payload.apiBase;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

// Wait (up to ~3s) for Clerk JS to finish loading and rehydrate its session.
async function waitForClerk(timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.Clerk?.loaded && window.Clerk?.session) return;
    if (window.Clerk?.loaded && !window.Clerk?.session) return; // genuinely signed-out
    await new Promise((r) => setTimeout(r, 50));
  }
}

function resolveUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!API_BASE_URL) return input;
  if (typeof input !== "string") return input;
  if (input.startsWith("/api/") || input === "/api") {
    return `${API_BASE_URL}${input}`;
  }
  return input;
}

/** Methods whose 200/204 response bodies are typically empty / non-JSON. */
const BODY_LESS_METHODS = new Set(["HEAD", "OPTIONS"]);

export interface AuthFetchOptions {
  /**
   * Set to `false` when the caller does not expect a JSON response body
   * (e.g. file downloads, SSE setup, intentional `text/plain` endpoints).
   * Default = `true`.
   */
  expectsJson?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// authFetch
// ─────────────────────────────────────────────────────────────────────────────
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: AuthFetchOptions = {},
): Promise<Response> {
  const { expectsJson = true } = options;

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
  // ── Content-Type guard ───────────────────────────────────────────────
  // express.json() only parses requests with `Content-Type:
  // application/json`. fetch() defaults to `text/plain;charset=UTF-8`
  // when given a string body and no explicit Content-Type, so the server
  // silently sees `req.body = {}` and every Zod schema field comes back
  // as `undefined` ("expected boolean, received undefined" etc.).
  // Auto-set it when the caller passed a string body and didn't override.
  if (
    typeof init.body === "string" &&
    init.body.length > 0 &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const resolved = resolveUrl(input);
  const response = await fetch(resolved, { ...init, credentials: "include", headers });

  // Content-type guard. Only applies when:
  //   • caller expects JSON (default)
  //   • response is OK (errors are surfaced via response.status normally)
  //   • method has a body (skip HEAD/OPTIONS)
  //   • status has a body (skip 204/205)
  //   • we're touching the API surface (path starts with /api or the
  //     URL ends up on the configured API base host)
  if (expectsJson && response.ok) {
    const method = (init.method ?? "GET").toUpperCase();
    const status = response.status;
    const bodylessStatus = status === 204 || status === 205 || status === 304;
    const isApiPath =
      (typeof input === "string" && (input.startsWith("/api/") || input === "/api")) ||
      (typeof resolved === "string" && API_BASE_URL && resolved.startsWith(API_BASE_URL));

    if (!BODY_LESS_METHODS.has(method) && !bodylessStatus && isApiPath) {
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        // Clone so the caller can still read the body if they catch the error.
        const preview = await response.clone().text().then(
          (t) => t.slice(0, 200),
          () => "",
        );
        throw new ApiContractError({
          url:         typeof resolved === "string" ? resolved : String(resolved),
          status,
          contentType,
          bodyPreview: preview,
          host:        typeof window !== "undefined" ? window.location.hostname : "",
          apiBase:     API_BASE_URL || "(empty)",
        });
      }
    }
  }

  return response;
}
