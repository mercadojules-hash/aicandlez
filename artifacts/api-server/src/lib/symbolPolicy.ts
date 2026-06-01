/**
 * symbolPolicy — env-tunable per-symbol LIVE-trading policy (Production
 * Optimization P2). Lets the operator disable underperforming symbols and scale
 * exposure on individual symbols WITHOUT a redeploy, reusing the existing
 * customer execution gates in `liveUserExecution.ts`.
 *
 * Scope: applies to NEW customer live entries only. Open positions, their exit
 * monitors, paper trading, historical rows, and reconciliation are all
 * untouched. The operator path bypasses every rule here.
 *
 * Defaults encode the approved package, derived from production results:
 *   - DISABLE STXUSD + INJUSD  (0% / PF-0.5 net losers in live trading).
 *   - HALVE   XLMUSD + AVAXUSD (weak performers — reduce exposure, keep probing).
 *   - Validated winners (TONUSD / HBARUSD) keep full size; they are "promoted"
 *     structurally — disabling the losers and halving the laggards, combined with
 *     the majors-heavy category allocation (P3), steers freed slots + capital
 *     toward them without inflating per-trade risk.
 */

const DEFAULT_DISABLED_LIVE_SYMBOLS = ["STXUSD", "INJUSD"] as const;

const DEFAULT_LIVE_SIZE_MULTIPLIERS: Record<string, number> = {
  XLMUSD: 0.5,
  AVAXUSD: 0.5,
};

/**
 * Disabled-symbol set. `DISABLED_LIVE_SYMBOLS` (comma-separated) overrides the
 * default; an explicit empty string clears the blocklist entirely.
 */
function parseDisabled(): Set<string> {
  const raw = process.env.DISABLED_LIVE_SYMBOLS;
  if (raw === undefined) return new Set<string>(DEFAULT_DISABLED_LIVE_SYMBOLS);
  return new Set(
    raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
  );
}

/** True when a symbol must NOT open new customer live positions. */
export function isLiveSymbolDisabled(symbol: string): boolean {
  return parseDisabled().has(symbol.trim().toUpperCase());
}

/**
 * Per-symbol size multipliers. `LIVE_SYMBOL_SIZE_MULTIPLIERS` is a JSON object
 * (e.g. `{"XLMUSD":0.5}`) that overrides the default; malformed JSON falls back
 * to the default. Only finite, positive values are accepted.
 */
function parseMultipliers(): Record<string, number> {
  const raw = process.env.LIVE_SYMBOL_SIZE_MULTIPLIERS;
  if (raw === undefined || raw === "") return DEFAULT_LIVE_SIZE_MULTIPLIERS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k.trim().toUpperCase()] = n;
    }
    return out;
  } catch {
    return DEFAULT_LIVE_SIZE_MULTIPLIERS;
  }
}

/**
 * Multiplier (clamped 0.05–2) scaling a requested LIVE order size for a symbol.
 * `1` = unchanged. Applied BEFORE the risk / liquidity gates, which still enforce
 * every ceiling — this can only resize within those bounds, never bypass them.
 */
export function liveSymbolSizeMultiplier(symbol: string): number {
  const m = parseMultipliers()[symbol.trim().toUpperCase()];
  if (m === undefined) return 1;
  return Math.min(2, Math.max(0.05, m));
}
