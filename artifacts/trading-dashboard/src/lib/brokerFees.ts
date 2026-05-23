// Shared broker-vs-estimate fee resolution. The customer Portal renders this
// math inline (see Portal.tsx), the operator /command desktop console uses
// these helpers via PositionsRow so a single trade's fee figure is identical
// across every surface in the platform.

export const USD_STABLE_FEE_CCY = new Set([
  "USD", "USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "FDUSD", "ZUSD",
]);

export function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function extractBaseAsset(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const s = String(symbol).toUpperCase().replace(/[/\-_]/g, "");
  const quotes = ["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USDP", "DAI", "ZUSD", "USD"];
  for (const q of quotes) {
    if (s.endsWith(q) && s.length > q.length) {
      const base = s.slice(0, s.length - q.length);
      return base === "XBT" ? "BTC" : base;
    }
  }
  return null;
}

export interface FeeLeg {
  usd:               number;
  displayFromBroker: boolean;
  fromBroker:        boolean;
  brokerIsUsd:       boolean;
  brokerAmount?:     number;
  brokerCcy?:        string;
  estimate?:         number;
}

export function resolveFeeLeg(
  brokerRaw:   number | string | null | undefined,
  brokerCcy:   string | null | undefined,
  estimateRaw: number | string | null | undefined,
  exitPrice?:  number,
  baseAsset?:  string | null,
): FeeLeg {
  const broker   = brokerRaw   != null ? toNum(brokerRaw)   : undefined;
  const estimate = estimateRaw != null ? toNum(estimateRaw) : undefined;
  const ccy      = brokerCcy ?? undefined;
  const fromBroker  = typeof broker === "number";
  const brokerIsUsd = fromBroker && (!ccy || USD_STABLE_FEE_CCY.has(ccy.toUpperCase()));
  const ccyMatchesBase = !!(ccy && baseAsset && ccy.toUpperCase() === baseAsset.toUpperCase());
  const convertible = fromBroker && !brokerIsUsd && ccyMatchesBase
    && typeof exitPrice === "number" && exitPrice > 0;
  const brokerUsd = brokerIsUsd
    ? broker!
    : (convertible ? (broker! * exitPrice!) : undefined);
  const displayFromBroker = typeof brokerUsd === "number";
  const usd = displayFromBroker ? brokerUsd! : (estimate ?? 0);
  return {
    usd, displayFromBroker, fromBroker, brokerIsUsd,
    brokerAmount: broker,
    brokerCcy:    ccy,
    estimate,
  };
}

// Adapter-regression detector. Flags when the broker's reported USD fee
// drifts >10% from the catalog estimate so operators can spot fee-shape
// changes (e.g. broker rebate tier change, Phemex fee-shape regression).
// Only meaningful when BOTH legs have broker + estimate present.
export function feeVariancePct(leg: FeeLeg): number | null {
  if (!leg.displayFromBroker) return null;
  if (leg.estimate == null || leg.estimate <= 0) return null;
  return ((leg.usd - leg.estimate) / leg.estimate) * 100;
}

export const FEE_VARIANCE_THRESHOLD_PCT = 10;
