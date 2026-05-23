import type { SymBreakdown } from "../types";

export function hashSymbol(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 33 + sym.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function resolveDirection(
  symbol: string,
  breakdown?: SymBreakdown,
): "LONG" | "SHORT" {
  if (breakdown?.agreedAction === "BUY")  return "LONG";
  if (breakdown?.agreedAction === "SELL") return "SHORT";
  return (hashSymbol(symbol) % 100) > 55 ? "LONG" : "SHORT";
}
