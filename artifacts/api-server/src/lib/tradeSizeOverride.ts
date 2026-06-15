/**
 * Operator-level customer live allocation override.
 *
 * Scope is deliberately narrow at call sites: new customer LIVE entries only.
 * Existing open positions and all strategy/risk/exit gates remain untouched.
 */
export const DEFAULT_TRADE_SIZE_OVERRIDE_USD = 600;

export function getTradeSizeOverrideUsd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["TRADE_SIZE_OVERRIDE_USD"];
  if (raw == null || raw.trim() === "") return DEFAULT_TRADE_SIZE_OVERRIDE_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TRADE_SIZE_OVERRIDE_USD;
}
