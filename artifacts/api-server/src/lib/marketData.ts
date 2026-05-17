import https from "node:https";

export interface Candle {
  time: number;   // Unix seconds
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

// ── Symbol maps ──────────────────────────────────────────────────────────────

const ALPACA_SYMBOLS: Record<string, string> = {
  BTCUSD:  "BTC/USD",
  ETHUSD:  "ETH/USD",
  SOLUSD:  "SOL/USD",
  XRPUSD:  "XRP/USD",
  DOGEUSD: "DOGE/USD",
  AVAXUSD: "AVAX/USD",
  LINKUSD: "LINK/USD",
  ADAUSD:  "ADA/USD",
};

// Public fallback data source — no auth required
const FALLBACK_SYMBOLS: Record<string, string> = {
  BTCUSD:  "BTCUSDT",
  ETHUSD:  "ETHUSDT",
  SOLUSD:  "SOLUSDT",
  XRPUSD:  "XRPUSDT",
  DOGEUSD: "DOGEUSDT",
  AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT",
  ADAUSD:  "ADAUSDT",
};

const ALPACA_TF: Record<string, string> = {
  "1m": "1Min", "5m": "5Min", "15m": "15Min", "30m": "30Min",
  "1h": "1Hour", "4h": "4Hour", "1d": "1Day",
};

const FALLBACK_TF: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1d",
};

const TF_TO_MS: Record<string, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};

export const SUPPORTED_SYMBOLS    = Object.keys(ALPACA_SYMBOLS);
export const SUPPORTED_TIMEFRAMES = ["1m", "5m", "15m", "1h"];
export const BACKTEST_TIMEFRAMES  = ["1m", "5m", "15m", "1h", "4h", "1d"];

const CANDLE_TTL: Record<string, number> = {
  "1m": 30_000, "5m": 60_000, "15m": 90_000,
  "1h": 120_000, "4h": 300_000, "1d": 600_000,
};
const TICKER_TTL = 15_000;

const candleCache = new Map<string, CacheEntry<Candle[]>>();
const tickerCache = new Map<string, CacheEntry<TickerData>>();

// ── Alpaca data API (primary — requires ALPACA_API_KEY) ───────────────────────

interface AlpacaBar { t: string; o: number; h: number; l: number; c: number; v: number }

function alpacaHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID":     process.env["ALPACA_API_KEY"]    ?? "",
    "APCA-API-SECRET-KEY": process.env["ALPACA_SECRET_KEY"] ?? "",
  };
}

function isAlpacaConfigured(): boolean {
  return !!(process.env["ALPACA_API_KEY"] && process.env["ALPACA_SECRET_KEY"]);
}

function alpacaDataGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(
      { hostname: "data.alpaca.markets", path, headers: alpacaHeaders() },
      res => {
        let d = "";
        res.on("data", c => { d += c as string; });
        res.on("end", () => {
          try { resolve(JSON.parse(d) as T); }
          catch { reject(new Error(`Alpaca data: non-JSON — ${d.slice(0, 200)}`)); }
        });
      }
    ).on("error", reject);
  });
}

async function fetchAlpacaCandles(
  symbol: string, timeframe: string, limit: number,
): Promise<Candle[]> {
  const pair = ALPACA_SYMBOLS[symbol];
  if (!pair) throw new Error(`Unsupported symbol: ${symbol}`);
  const tf     = ALPACA_TF[timeframe] ?? "5Min";
  const tfMs   = TF_TO_MS[timeframe]  ?? 300_000;
  const end    = new Date().toISOString();
  const start  = new Date(Date.now() - limit * tfMs * 1.5).toISOString();
  const enc    = encodeURIComponent(pair);

  const data = await alpacaDataGet<{ bars: Record<string, AlpacaBar[]> }>(
    `/v1beta3/crypto/us/bars?symbols=${enc}&timeframe=${tf}&start=${start}&end=${end}&limit=${limit}&sort=asc`
  );
  const bars = data.bars?.[pair] ?? [];
  return bars.slice(-limit).map(b => ({
    time:   Math.floor(new Date(b.t).getTime() / 1000),
    open:   b.o,
    high:   b.h,
    low:    b.l,
    close:  b.c,
    volume: b.v,
  }));
}

async function fetchAlpacaTicker(symbol: string): Promise<TickerData> {
  const pair = ALPACA_SYMBOLS[symbol];
  if (!pair) throw new Error(`Unsupported symbol: ${symbol}`);
  const enc  = encodeURIComponent(pair);

  const data = await alpacaDataGet<{ bars: Record<string, AlpacaBar> }>(
    `/v1beta3/crypto/us/latest/bars?symbols=${enc}`
  );
  const bar   = data.bars?.[pair];
  const price = bar?.c ?? 0;
  return {
    symbol,
    price,
    bid:              price * 0.9999,
    ask:              price * 1.0001,
    open24h:          price,
    high24h:          bar?.h ?? price,
    low24h:           bar?.l ?? price,
    volume24h:        bar?.v ?? 0,
    change24h:        0,
    changePercent24h: 0,
    lastUpdated:      Date.now(),
  };
}

// ── Public fallback data source (no auth required) ────────────────────────────

interface FallbackKline {
  0: number; 1: string; 2: string; 3: string; 4: string; 5: string;
}

interface FallbackTicker24h {
  lastPrice: string; bidPrice: string; askPrice: string;
  openPrice: string; highPrice: string; lowPrice: string;
  volume: string; priceChange: string; priceChangePercent: string;
}

async function fetchFallbackCandles(
  symbol: string, timeframe: string, limit: number,
): Promise<Candle[]> {
  const sym      = FALLBACK_SYMBOLS[symbol];
  if (!sym) throw new Error(`Unsupported symbol: ${symbol}`);
  const interval = FALLBACK_TF[timeframe] ?? "5m";
  const url      = `/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`;

  return new Promise((resolve, reject) => {
    https.get({ hostname: "api.binance.com", path: url }, res => {
      let d = "";
      res.on("data", c => { d += c as string; });
      res.on("end", () => {
        try {
          const klines = JSON.parse(d) as FallbackKline[];
          resolve(klines.map(k => ({
            time:   Math.floor(k[0] / 1000),
            open:   parseFloat(k[1]),
            high:   parseFloat(k[2]),
            low:    parseFloat(k[3]),
            close:  parseFloat(k[4]),
            volume: parseFloat(k[5]),
          })));
        } catch {
          reject(new Error(`Candle data parse failed: ${d.slice(0, 200)}`));
        }
      });
    }).on("error", reject);
  });
}

async function fetchFallbackTicker(symbol: string): Promise<TickerData> {
  const sym = FALLBACK_SYMBOLS[symbol];
  if (!sym) throw new Error(`Unsupported symbol: ${symbol}`);
  const url = `/api/v3/ticker/24hr?symbol=${sym}`;

  return new Promise((resolve, reject) => {
    https.get({ hostname: "api.binance.com", path: url }, res => {
      let d = "";
      res.on("data", c => { d += c as string; });
      res.on("end", () => {
        try {
          const t = JSON.parse(d) as FallbackTicker24h;
          const price = parseFloat(t.lastPrice);
          resolve({
            symbol,
            price,
            bid:              parseFloat(t.bidPrice),
            ask:              parseFloat(t.askPrice),
            open24h:          parseFloat(t.openPrice),
            high24h:          parseFloat(t.highPrice),
            low24h:           parseFloat(t.lowPrice),
            volume24h:        parseFloat(t.volume),
            change24h:        parseFloat(t.priceChange),
            changePercent24h: parseFloat(t.priceChangePercent),
            lastUpdated:      Date.now(),
          });
        } catch {
          reject(new Error(`Ticker data parse failed: ${d.slice(0, 200)}`));
        }
      });
    }).on("error", reject);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getCandles(
  symbol: string, timeframe: string, limit = 100,
): Promise<Candle[]> {
  const key    = `${symbol}_${timeframe}`;
  const ttl    = CANDLE_TTL[timeframe] ?? 60_000;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttl) return cached.data.slice(-limit);

  const candles = isAlpacaConfigured()
    ? await fetchAlpacaCandles(symbol, timeframe, limit)
    : await fetchFallbackCandles(symbol, timeframe, limit);

  candleCache.set(key, { data: candles, fetchedAt: Date.now() });
  return candles.slice(-limit);
}

export async function getTicker(symbol: string): Promise<TickerData> {
  const cached = tickerCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < TICKER_TTL) return cached.data;

  const ticker = isAlpacaConfigured()
    ? await fetchAlpacaTicker(symbol)
    : await fetchFallbackTicker(symbol);

  tickerCache.set(symbol, { data: ticker, fetchedAt: Date.now() });
  return ticker;
}

// ── Compat: some route files iterate this for the supported symbol list ───────
export const SYMBOL_MAP = ALPACA_SYMBOLS;
