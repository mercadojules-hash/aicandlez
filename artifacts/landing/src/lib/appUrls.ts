/**
 * Landing → cross-host URL helpers (Task #162).
 *
 * Single source of truth for "where does the marketing site send visitors".
 * Previously each CTA hardcoded `https://app.aicandlez.com/portal` —
 * a maintenance hazard that was producing an extra cross-host hop:
 *
 *   Landing CTA → app.aicandlez.com/portal → (PWA mounts, sees /portal,
 *   bounces) → trade.aicandlez.com/portal
 *
 * Fix: primary customer CTAs go directly to `trade.aicandlez.com`
 * (customer desktop portal — the production target for signed-in users).
 * Mobile-only "Open as PWA" affordances still target the PWA root.
 *
 * Env vars (set in render.yaml for `aicandlez-landing`):
 *   VITE_APP_URL    default https://app.aicandlez.com    (mobile PWA root)
 *   VITE_TRADE_URL  default https://trade.aicandlez.com  (customer desktop portal)
 */

interface AppUrlEnv {
  VITE_APP_URL?: string;
  VITE_TRADE_URL?: string;
}

interface ResolvedAppUrls {
  /** Mobile PWA root — used for explicit "Open as PWA" CTAs. */
  APP_HOME_URL: string;
  /** Customer desktop portal — default landing target for primary CTAs. */
  TRADE_HOME_URL: string;
  /** Customer desktop portal /portal page — deep link bypass. */
  TRADE_PORTAL_URL: string;
  /** Clerk sign-in page on the customer desktop portal. */
  TRADE_SIGN_IN_URL: string;
  /** Clerk sign-up page on the customer desktop portal. */
  TRADE_SIGN_UP_URL: string;
}

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, "");

/**
 * Pure resolver — exported for unit tests. Takes an env-like object and
 * returns the canonical URL set with normalized origins.
 */
export function resolveAppUrls(env: AppUrlEnv): ResolvedAppUrls {
  const APP_URL = stripTrailingSlash(env.VITE_APP_URL ?? "https://app.aicandlez.com");
  const TRADE_URL = stripTrailingSlash(env.VITE_TRADE_URL ?? "https://trade.aicandlez.com");
  return {
    APP_HOME_URL:      APP_URL,
    TRADE_HOME_URL:    TRADE_URL,
    TRADE_PORTAL_URL:  `${TRADE_URL}/portal`,
    TRADE_SIGN_IN_URL: `${TRADE_URL}/sign-in`,
    TRADE_SIGN_UP_URL: `${TRADE_URL}/sign-up`,
  };
}

const resolved = resolveAppUrls(import.meta.env as AppUrlEnv);

export const APP_HOME_URL      = resolved.APP_HOME_URL;
export const TRADE_HOME_URL    = resolved.TRADE_HOME_URL;
export const TRADE_PORTAL_URL  = resolved.TRADE_PORTAL_URL;
export const TRADE_SIGN_IN_URL = resolved.TRADE_SIGN_IN_URL;
export const TRADE_SIGN_UP_URL = resolved.TRADE_SIGN_UP_URL;
