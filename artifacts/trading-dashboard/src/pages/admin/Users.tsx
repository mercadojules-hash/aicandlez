/**
 * CRM Phase A — /admin/users
 *
 * The "All Users" institutional grid. For A1 this is a thin re-export of
 * the existing Admin.tsx (single source of truth for the full grid +
 * action drawer). When A2 ships the User Intelligence Panel refactor we
 * decompose Admin.tsx into shared components and this file becomes a
 * dedicated composition rather than a re-export.
 */
import Admin from "../Admin";

export default function AdminUsers() {
  return <Admin />;
}
