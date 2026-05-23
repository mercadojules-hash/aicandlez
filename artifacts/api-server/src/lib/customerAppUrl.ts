/**
 * Customer app base-URL resolution for Stripe checkout / portal return URLs
 * (Task #162 Phase B server-side).
 *
 * The customer-facing PWA is served at `https://app.aicandlez.com/` in prod
 * (Render service `aicandlez-app`) but at `/aicandlez-app/...` in dev (via
 * the shared proxy). Earlier code derived the Stripe return URL from
 * `WEBHOOK_BASE_URL` / `REPLIT_DOMAINS`, both of which point at the API
 * host (`api.aicandlez.com` / Replit preview domain) — sending the user
 * back to the API instead of the PWA after checkout.
 *
 * Resolution order:
 *   1. Per-request `Origin` header — when it appears in the customer-app
 *      allow-list. This naturally handles dev (`localhost:80`,
 *      `*.replit.app`, `*.replit.dev`) and any preview hosts.
 *   2. Explicit `CUSTOMER_APP_BASE_URL` env override — production source
 *      of truth (`https://app.aicandlez.com`).
 *   3. Legacy fallback chain (`WEBHOOK_BASE_URL` → `REPLIT_DOMAINS` →
 *      `http://localhost:80`) — preserves behavior for ops scripts that
 *      hit this endpoint without an Origin header.
 *
 * The resolved URL has no trailing slash; callers append `/billing`,
 * `/profile?checkout=success`, etc.
 */

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, "");

const CUSTOMER_APP_ORIGIN_ALLOW = new Set<string>([
  "https://app.aicandlez.com",
  "https://trade.aicandlez.com",
  "https://www.aicandlez.com",
  "https://aicandlez.com",
]);

const REPLIT_PREVIEW_HOST = /\.replit\.(app|dev)$/i;
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export interface CustomerAppUrlEnv {
  CUSTOMER_APP_BASE_URL?: string;
  WEBHOOK_BASE_URL?: string;
  REPLIT_DOMAINS?: string;
}

/**
 * Pure resolver — exported for unit tests.
 *
 * @param origin  Value of the request `Origin` header (may be undefined).
 * @param env     Process env subset (defaults to `process.env`).
 */
export function resolveCustomerAppBaseUrl(
  origin: string | undefined,
  env: CustomerAppUrlEnv = process.env as CustomerAppUrlEnv,
): string {
  if (origin) {
    const trimmed = stripTrailingSlash(origin);
    // Robust parse — a malformed Origin must NOT throw out of this helper
    // and break checkout. Fall through to the env chain instead.
    let hostname = "";
    try { hostname = new URL(trimmed).hostname; } catch { /* ignore */ }
    if (
      CUSTOMER_APP_ORIGIN_ALLOW.has(trimmed) ||
      (hostname && REPLIT_PREVIEW_HOST.test(hostname)) ||
      LOCALHOST.test(trimmed)
    ) {
      return trimmed;
    }
  }
  if (env.CUSTOMER_APP_BASE_URL) return stripTrailingSlash(env.CUSTOMER_APP_BASE_URL);
  if (env.WEBHOOK_BASE_URL)      return stripTrailingSlash(env.WEBHOOK_BASE_URL);
  if (env.REPLIT_DOMAINS) {
    const first = env.REPLIT_DOMAINS.split(",")[0];
    if (first) return `https://${first}`;
  }
  return "http://localhost:80";
}
