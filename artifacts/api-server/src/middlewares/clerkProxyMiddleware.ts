/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * AUTH CONFIGURATION: To manage users, enable/disable login providers
 * (Google, GitHub, etc.), change app branding, or configure OAuth credentials,
 * use the Auth pane in the workspace toolbar. There is no external Clerk
 * dashboard — all auth configuration is done through the Auth pane.
 *
 * IMPORTANT:
 * - Active whenever CLERK_SECRET_KEY is set (dev and prod).
 * - Must be mounted BEFORE express.json() middleware
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { RequestHandler } from "express";
import type { IncomingHttpHeaders } from "http";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

/**
 * The proxy URL that is registered in the Clerk dashboard for this instance.
 * When VITE_CLERK_PROXY_URL is set (the production proxy URL), Clerk will only
 * accept requests whose Clerk-Proxy-Url header matches a registered value.
 * We always send this registered URL so that requests from the Replit dev
 * sandbox (whose dynamic hostname can't be pre-registered) are accepted too.
 */
const REGISTERED_PROXY_URL: string | undefined = (() => {
  const raw = process.env.VITE_CLERK_PROXY_URL;
  if (!raw) return undefined;
  try {
    // Normalise: ensure it ends with the canonical path
    const u = new URL(raw);
    return u.origin + CLERK_PROXY_PATH;
  } catch {
    return undefined;
  }
})();

/**
 * Returns the first effective public hostname for the given request,
 * preferring x-forwarded-host over the Host header so callers behind a
 * proxy see the original client-facing host.
 *
 * x-forwarded-host can take three shapes:
 *   - undefined (no proxy involved)
 *   - a single string (one proxy hop)
 *   - a comma-delimited string when an upstream appended rather than
 *     replaced the header (Node folds duplicate headers this way), or a
 *     string[] in some Express typings
 * In the multi-value case, the leftmost value is the original client-
 * facing host. Take that one in all forms. Exported so that app.ts
 * (clerkMiddleware callback) and this proxy middleware agree on which
 * hostname is canonical — otherwise multi-domain/custom-domain flows
 * break.
 */
export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(",")[0]?.trim();
  return firstHop || req.headers.host?.trim() || undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  // Gate on secret key presence only — not NODE_ENV.
  // Live Clerk keys embed the production FAPI domain (clerk.aicandlez.com) in
  // the publishable key, so both dev (Replit sandbox) and prod must route Clerk
  // requests through this proxy. The secret key is absent only in environments
  // that haven't provisioned Clerk, which is the right guard.
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        // Clerk validates the Clerk-Proxy-Url header against the proxy URLs
        // registered in its dashboard. We always send the registered production
        // URL (from VITE_CLERK_PROXY_URL) so that requests originating from the
        // dynamic Replit dev sandbox are accepted — that domain can never be
        // pre-registered. Falls back to computing the URL from the request host
        // when no registered URL is configured (e.g. fresh dev env).
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = getClerkProxyHost(req) || "";
        const dynamicProxyUrl = `${protocol}://${host}${CLERK_PROXY_PATH}`;
        const clerkProxyUrl = REGISTERED_PROXY_URL ?? dynamicProxyUrl;
        const registeredHost = REGISTERED_PROXY_URL
          ? new URL(REGISTERED_PROXY_URL).host
          : host;

        proxyReq.setHeader("Clerk-Proxy-Url", clerkProxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);
        // Override X-Forwarded-Host with the registered proxy's hostname so
        // Clerk FAPI doesn't reject the request because of the dynamic Replit
        // dev sandbox domain (which can never be pre-registered in the dashboard).
        proxyReq.setHeader("X-Forwarded-Host", registeredHost);

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }
      },
    },
  }) as RequestHandler;
}
