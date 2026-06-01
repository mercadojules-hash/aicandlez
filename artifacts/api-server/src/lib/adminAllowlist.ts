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
// Lower-cased + trimmed comparisons. To add another operator, append to the
// array and redeploy.
// ─────────────────────────────────────────────────────────────────────────────

export const OPERATOR_ADMIN_EMAILS: readonly string[] = [
  "info@mixtapepsd.com",
  "teedelgado@gmail.com",
];

export function isOperatorAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return OPERATOR_ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}
