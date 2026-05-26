// Re-export of the shared authFetch primitive scoped to the aicandlez-app PWA.
// Same contract as `trading-dashboard/src/lib/authFetch.ts` — see that file
// for the architectural reasoning (cross-subdomain Clerk Bearer fallback,
// VITE_API_BASE_URL prefixing, ApiContractError on HTML-pretending-to-be-JSON).
//
// Task #172 made this the SINGLE fetch primitive for every `/api/*` call
// in the PWA. Bare `authFetch("/api/...")` outside this file is a build-time
// error (see `scripts/check-no-bare-api-fetch.ts`).

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

export const API_BASE_URL = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "");

const PROD_STATIC_HOSTS = [
  "app.aicandlez.com",
  "trade.aicandlez.com",
  "admintrade.aicandlez.com",
];

export function isApiBaseUrlMisconfigured(): boolean {
  if (typeof window === "undefined") return false;
  if (API_BASE_URL) return false;
  return PROD_STATIC_HOSTS.includes(window.location.hostname);
}

if (typeof window !== "undefined" && isApiBaseUrlMisconfigured()) {
  // eslint-disable-next-line no-console
  console.error(
    "[authFetch] VITE_API_BASE_URL is empty on a static production host " +
      `(${window.location.hostname}). All /api/* requests will hit the SPA ` +
      "fallback and return index.html. Set VITE_API_BASE_URL=https://api.aicandlez.com " +
      "on this Render service and redeploy.",
  );
}

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

async function waitForClerk(timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.Clerk?.loaded && window.Clerk?.session) return;
    if (window.Clerk?.loaded && !window.Clerk?.session) return;
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

const BODY_LESS_METHODS = new Set(["HEAD", "OPTIONS"]);

export interface AuthFetchOptions {
  expectsJson?: boolean;
}

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
