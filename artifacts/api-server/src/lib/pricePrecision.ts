const PRICE_DECIMALS = 12;

export function roundPrice(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value)) return 0;
  return parseFloat(value.toFixed(PRICE_DECIMALS));
}

export function roundOptionalPrice(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return roundPrice(value);
}
