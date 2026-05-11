import type { Candle, ChartPt } from "./types";

export function calcEMA(values: number[], period: number): (number | null)[] {
  if (values.length < period) return new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(period - 1).fill(null);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function buildChartData(candles: Candle[]): ChartPt[] {
  const closes = candles.map((c) => c.close);
  const ema9s  = calcEMA(closes, 9);
  const ema21s = calcEMA(closes, 21);
  return candles.map((c, i) => ({
    label:  new Date(c.time * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    close:  c.close,
    volume: c.volume,
    ema9:   ema9s[i],
    ema21:  ema21s[i],
  }));
}

export function fmtPrice(v: number): string {
  if (v >= 10000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (v >= 100)   return v.toFixed(2);
  return v.toFixed(4);
}

export function fmtUSD(v: number): string {
  return `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ago(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export const Q_OPTS = {
  cache:                 "no-store" as RequestCache,
  staleTime:             0,
  gcTime:                0,
  refetchOnMount:        "always" as const,
  refetchOnReconnect:    true,
  refetchOnWindowFocus:  true,
} as const;
