/**
 * Defensive payload normalizer for admin user-action mutations.
 *
 * The api-server Zod validators (e.g. `create_complimentary_subscription`)
 * accept ONLY the lowercase canonical tier values: `free` | `starter` | `pro`.
 * The UI mostly stores tiers in lowercase already, but display layers
 * (`.toUpperCase()`, casing drift in future state defaults, copy-pasted
 * radio values, etc.) have historically leaked uppercase like `FREE` /
 * `STARTER` / `PRO` into outbound mutation bodies, producing:
 *
 *   "Invalid option: expected one of 'free'|'starter'|'pro'"
 *
 * This helper is the single mutation-layer boundary that guarantees every
 * tier-shaped field is lowercased BEFORE it crosses the API. Per the
 * remediation directive: canonical DB/API stays lowercase, normalization
 * lives in the frontend mutation layer, no schema redesign.
 *
 * Fields normalized (case-insensitive key match, value-shape preserving):
 *   - `plan`      — `free`/`starter`/`pro`
 *   - `tier`      — alias used in some UIs
 *   - `fromPlan`, `toPlan` — used by upgrade/downgrade endpoints
 *
 * Numeric `capTier` is left alone (it's an int, not a string enum).
 * Non-string values, unknown keys, and nested objects pass through
 * untouched — this is intentionally a shallow, additive layer.
 */

const TIER_KEYS = new Set(["plan", "tier", "fromPlan", "toPlan"]);

export function normalizeAdminActionPayload(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (TIER_KEYS.has(k) && typeof v === "string") {
      out[k] = v.toLowerCase();
    } else {
      out[k] = v;
    }
  }
  return out;
}
