// ─────────────────────────────────────────────────────────────────────────────
// Super-Admin Allowlist
// ─────────────────────────────────────────────────────────────────────────────
// Emails listed here are auto-promoted to `super-admin` on first login (and
// re-asserted on every /auth/me call). This is the canonical bootstrap path
// for operator access — no manual SQL required.
//
// Lower-cased + trimmed comparisons. To add another admin, append to the
// array and redeploy.
// ─────────────────────────────────────────────────────────────────────────────

export const SUPER_ADMIN_EMAILS: readonly string[] = [
  "mercadojules@gmail.com",
];

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator (admin) Allowlist
// ─────────────────────────────────────────────────────────────────────────────
// Emails listed here are auto-promoted to `admin` (operator) on login — they get
// the operator surface (manual override Buy/Sell via the operator-env exchange
// path, /command console) but NOT super-admin powers (billing force-restore /
// fee waiver). A super-admin email is never downgraded to admin (see auth.ts).
//
// This allowlist is AUTHORITATIVE for the operator `admin` role: /auth/me both
// promotes listed emails AND downgrades any stale `admin` whose email is no
// longer here back to `user` (super-admin is never auto-demoted). To grant
// operator access, append the email + redeploy; to revoke it, remove the email
// + redeploy (the account self-corrects to a plain customer on next login).
//
// Operator access is granted without duplicating accounts: the same customer
// row, portfolio, exchange connections, and billing state remain intact while
// /auth/me promotes the email to `admin` on login.
// info@mixtapepsd.com was previously here but is now a customer account.
// ─────────────────────────────────────────────────────────────────────────────

export const OPERATOR_ADMIN_EMAILS: readonly string[] = [
  "teedelgado@gmail.com",
];

export function isOperatorAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return OPERATOR_ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}
