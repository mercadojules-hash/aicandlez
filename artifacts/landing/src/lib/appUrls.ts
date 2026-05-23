/**
 * Landing → app cross-host URL helpers.
 *
 * Single source of truth for "where does the marketing site send signed-out
 * visitors". Hardcoding `https://app.aicandlez.com/portal` across nine
 * components (Hero, Navbar, Pricing, CTA, Footer, MobileShowcase, …) is
 * a maintenance hazard and was producing an extra cross-host hop:
 *
 *   Landing CTA → app.aicandlez.com/portal → (PWA mounts, sees /portal,
 *   bounces) → trade.aicandlez.com/portal
 *
 * Fix: route CTAs at the PWA root (or trade.aicandlez.com directly for
 * the "open desktop terminal" affordance). Env-driven so we can swing the
 * targets without touching component code.
 *
 * Env vars (set in render.yaml for `aicandlez-landing`):
 *   VITE_APP_URL   default https://app.aicandlez.com    (PWA root)
 *   VITE_TRADE_URL default https://trade.aicandlez.com  (customer desktop terminal)
 */

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, "");

const APP_URL = stripTrailingSlash(
  (import.meta.env["VITE_APP_URL"] as string | undefined) ?? "https://app.aicandlez.com",
);

const TRADE_URL = stripTrailingSlash(
  (import.meta.env["VITE_TRADE_URL"] as string | undefined) ?? "https://trade.aicandlez.com",
);

/** Primary customer CTA — PWA root. Mobile-first surface; signed-in users
 *  land on PWA Home, signed-out users see Clerk sign-in flow there. */
export const APP_HOME_URL = APP_URL;

/** Sign-in deep link — Clerk-managed sign-in page on the PWA. */
export const APP_SIGN_IN_URL = `${APP_URL}/sign-in`;

/** Sign-up deep link — Clerk-managed sign-up page on the PWA. */
export const APP_SIGN_UP_URL = `${APP_URL}/sign-up`;

/** Desktop customer terminal — for "Launch Desktop Terminal" style CTAs.
 *  Bypasses the PWA's cross-app /portal bounce. */
export const TRADE_PORTAL_URL = `${TRADE_URL}/portal`;
