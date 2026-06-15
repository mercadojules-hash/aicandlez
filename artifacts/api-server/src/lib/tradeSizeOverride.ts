/**
 * Operator-level customer live allocation override.
 *
 * Scope is deliberately narrow at call sites: new customer LIVE entries only.
 * Existing open positions and all strategy/risk/exit gates remain untouched.
 */
export function getTradeSizeOverrideUsd(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env["TRADE_SIZE_OVERRIDE_USD"];
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
