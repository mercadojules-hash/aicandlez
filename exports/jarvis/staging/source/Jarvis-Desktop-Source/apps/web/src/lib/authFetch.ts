// ─────────────────────────────────────────────────────────────────────────────
// authFetch — single fetch primitive for every `/api/*` call in Jarvis.
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors the AICandlez transport invariant: attaches the Clerk Bearer token as
// a cookie fallback (Safari ITP / SameSite=Lax), prefixes `VITE_API_BASE_URL`
// so cross-origin static hosts hit the API host instead of their own SPA
// fallback, and throws `ApiContractError` when an OK response is not JSON
// (catches "static host returned index.html").
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

export const API_BASE_URL = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "");

export interface ApiContractErrorPayload {
  url: string;
  status: number;
  contentType: string;
  bodyPreview: string;
  host: string;
  apiBase: string;
}

export class ApiContractError extends Error {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly bodyPreview: string;
  readonly host: string;
  readonly apiBase: string;

  constructor(payload: ApiContractErrorPayload) {
    super(
      `API contract violation: ${payload.url} returned ${payload.status} with ` +
        `content-type "${payload.contentType}" (expected application/json).`,
    );
    this.name = "ApiContractError";
    this.url = payload.url;
    this.status = payload.status;
    this.contentType = payload.contentType;
    this.bodyPreview = payload.bodyPreview;
    this.host = payload.host;
    this.apiBase = payload.apiBase;
  }
}

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
          url: typeof resolved === "string" ? resolved : String(resolved),
          status,
          contentType,
          bodyPreview: preview,
          host: typeof window !== "undefined" ? window.location.hostname : "",
          apiBase: API_BASE_URL || "(empty)",
        });
      }
    }
  }

  return response;
}

/** Convenience: authFetch + JSON parse + non-2xx throw. */
export async function authFetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const res = await authFetch(input, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.clone().text();
    } catch {
      /* ignore */
    }
    throw new Error(`Request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
