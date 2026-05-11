export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  open24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  lastUpdated: number;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export const KRAKEN_PAIRS: Record<string, string> = {
  BTCUSD:  "XBTUSD",
  ETHUSD:  "ETHUSD",
  SOLUSD:  "SOLUSD",
  XRPUSD:  "XRPUSD",
  DOGEUSD: "XDGUSD",
  AVAXUSD: "AVAXUSD",
  LINKUSD: "LINKUSD",
  ADAUSD:  "ADAUSD",
};

export const SUPPORTED_SYMBOLS = Object.keys(KRAKEN_PAIRS);
export const SUPPORTED_TIMEFRAMES = ["1m", "5m", "15m", "1h"];
export const BACKTEST_TIMEFRAMES  = ["1m", "5m", "15m", "1h", "4h", "1d"];

const KRAKEN_INTERVALS: Record<string, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
};

const CANDLE_TTL: Record<string, number> = {
  "1m": 30_000,
  "5m": 60_000,
  "15m": 90_000,
  "1h": 120_000,
  "4h": 300_000,
  "1d": 600_000,
};

const TICKER_TTL = 15_000;

const candleCache = new Map<string, CacheEntry<Candle[]>>();
const tickerCache = new Map<string, CacheEntry<TickerData>>();

async function fetchKrakenOHLC(symbol: string, timeframe: string): Promise<Candle[]> {
  const pair = KRAKEN_PAIRS[symbol];
  const interval = KRAKEN_INTERVALS[timeframe] ?? 60;
  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Kraken OHLC HTTP ${res.status}`);

  const data = (await res.json()) as { error: string[]; result: Record<string, unknown> };
  if (data.error?.length) throw new Error(data.error[0]);

  const resultKey = Object.keys(data.result).find((k) => k !== "last")!;
  const raw = data.result[resultKey] as number[][];

  return raw.map((c) => ({
    time: c[0],
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[6]),
  }));
}

async function fetchKrakenTicker(symbol: string): Promise<TickerData> {
  const pair = KRAKEN_PAIRS[symbol];
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Kraken Ticker HTTP ${res.status}`);

  const data = (await res.json()) as { error: string[]; result: Record<string, Record<string, string[]>> };
  if (data.error?.length) throw new Error(data.error[0]);

  const resultKey = Object.keys(data.result)[0];
  const t = data.result[resultKey];

  const price = parseFloat(t.c[0]);
  const open24h = parseFloat(t.o as unknown as string);
  const change24h = parseFloat((price - open24h).toFixed(2));
  const changePercent24h = parseFloat(((change24h / open24h) * 100).toFixed(2));

  return {
    symbol,
    price,
    bid: parseFloat(t.b[0]),
    ask: parseFloat(t.a[0]),
    open24h,
    high24h: parseFloat(t.h[1]),
    low24h: parseFloat(t.l[1]),
    volume24h: parseFloat(t.v[1]),
    change24h,
    changePercent24h,
    lastUpdated: Date.now(),
  };
}

export async function getCandles(symbol: string, timeframe: string, limit = 100): Promise<Candle[]> {
  const key = `${symbol}_${timeframe}`;
  const ttl = CANDLE_TTL[timeframe] ?? 60_000;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttl) return cached.data.slice(-limit);

  const candles = await fetchKrakenOHLC(symbol, timeframe);
  candleCache.set(key, { data: candles, fetchedAt: Date.now() });
  return candles.slice(-limit);
}

export async function getTicker(symbol: string): Promise<TickerData> {
  const cached = tickerCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < TICKER_TTL) return cached.data;

  const ticker = await fetchKrakenTicker(symbol);
  tickerCache.set(symbol, { data: ticker, fetchedAt: Date.now() });
  return ticker;
}
