/**
 * symbolCategories — server-side Majors / Alts / Memes classification over the
 * engine-analyzed symbol universe (Task #219).
 *
 * This is the SoT the customer AI live fan-out uses to bias selection toward a
 * user's allocation weights. It mirrors the dashboard's presentational split
 * (`tickers.ts` CRYPTO_MAJORS_30 + CRYPTO_ALTS_MEMES) but lives server-side and
 * is keyed on the engine-native symbol (e.g. "BTCUSD") so it can be applied
 * inside the execution gates without importing any frontend code.
 *
 * Categories:
 *   - majors → large-cap "blue chip" cryptos
 *   - memes  → meme / micro-cap coins
 *   - alts   → everything else (the catch-all; an unmapped new symbol lands
 *              here so it still competes for slots rather than being excluded)
 */

export type SymbolCategory = "majors" | "alts" | "memes";

const MAJORS = new Set<string>([
  "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ADAUSD", "AVAXUSD", "DOGEUSD",
  "LINKUSD", "DOTUSD", "POLUSD", "MATICUSD", "LTCUSD", "BCHUSD", "UNIUSD",
  "ATOMUSD", "NEARUSD", "APTUSD", "ARBUSD", "OPUSD", "INJUSD", "SUIUSD",
  "TONUSD", "TRXUSD", "ETCUSD", "ICPUSD", "FILUSD", "HBARUSD", "AAVEUSD",
  "XLMUSD", "ALGOUSD",
]);

const MEMES = new Set<string>([
  "PEPEUSD", "WIFUSD", "BONKUSD", "FLOKIUSD", "TURBOUSD",
]);

/**
 * Classify an engine-native symbol into its allocation category. Falls back to
 * "alts" for any symbol not explicitly mapped (safe catch-all — the symbol
 * still competes for open-position slots).
 */
export function categoryForSymbol(symbol: string): SymbolCategory {
  const s = symbol.trim().toUpperCase();
  if (MAJORS.has(s)) return "majors";
  if (MEMES.has(s)) return "memes";
  return "alts";
}

export const CATEGORY_KEYS: readonly SymbolCategory[] = ["majors", "alts", "memes"] as const;
