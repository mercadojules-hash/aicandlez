import https from "node:https";

/**
 * marketData — crypto OHLC + ticker source for the trading loop.
 *
 * History (Pass 4.2 data-pipeline restoration):
 *   Previously routed through Alpaca crypto API as primary + Binance as
 *   fallback. Both paths were dead in this environment:
 *     • Alpaca crypto bars returned silently-empty `data.bars[pair]`,
 *       which the old `getCandles` cached as `[]` for 60s → the trading
 *       loop's 15-minute stale-data guard rejected every signal → the
 *       UI was correctly empty but operators perceived it as a redesign
 *       failure. Also violated the `replit.md` "no Alpaca affordances"
 *       locked invariant for the AICandlez customer surface.
 *     • Binance public REST returned `HTTP 451 Restricted Location`
 *       from Replit / cloud IP ranges (geo-block).
 *
 *   This rewrite routes through Coinbase Exchange public REST as primary
 *   (no auth, no geo-block, seconds-fresh candles + full 24h ticker
 *   stats) and Kraken public REST as fallback (also no auth, also
 *   reachable). Both providers have been verified live from this
 *   container during the rewrite. Alpaca env vars are intentionally
 *   ignored here — `lib/exchangeEngine.ts` continues to honour Alpaca
 *   adapter selection for legacy admin paper accounts, but candle/
 *   ticker data is now decoupled.
 *
 *   Empty / stale-on-arrival responses are NO LONGER cached. The fetch
 *   path records a per-provider success/failure into `dataFeedHealth`
 *   which is exposed via `/api/engine/status` so future outages are
 *   immediately visible in the UI (PortalCustomerShell renders a
 *   DataFeedBanner when health.healthy === false).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Symbol & timeframe maps ──────────────────────────────────────────────────

// Customer-facing crypto universe. Symbols are stored in the legacy
// `BTCUSD` (concat) form across the codebase; we translate at the edge.
const COINBASE_SYMBOLS: Record<string, string> = {
  BTCUSD:  "BTC-USD",
  ETHUSD:  "ETH-USD",
  SOLUSD:  "SOL-USD",
  XRPUSD:  "XRP-USD",
  DOGEUSD: "DOGE-USD",
  AVAXUSD: "AVAX-USD",
  LINKUSD: "LINK-USD",
  ADAUSD:  "ADA-USD",
};

// Kraken pair names differ from the spot symbol — BTC is XBT, DOGE is XDG.
const KRAKEN_SYMBOLS: Record<string, string> = {
  BTCUSD:  "XBTUSD",
  ETHUSD:  "ETHUSD",
  SOLUSD:  "SOLUSD",
  XRPUSD:  "XRPUSD",
  DOGEUSD: "XDGUSD",
  AVAXUSD: "AVAXUSD",
  LINKUSD: "LINKUSD",
  ADAUSD:  "ADAUSD",
};

// Coinbase candle granularity is seconds; Kraken is minutes.
const COINBASE_GRANULARITY_SEC: Record<string, number> = {
  "1m":  60,    "5m":  300,   "15m": 900,
  "30m": 1_800, "1h":  3_600, "4h":  14_400, "1d": 86_400,
};
const KRAKEN_INTERVAL_MIN: Record<string, number> = {
  "1m":  1,  "5m":  5,  "15m": 15,
  "30m": 30, "1h":  60, "4h":  240, "1d": 1_440,
};

const TF_TO_MS: Record<string, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};

export const SUPPORTED_SYMBOLS    = Object.keys(COINBASE_SYMBOLS);
export const SUPPORTED_TIMEFRAMES = ["1m", "5m", "15m", "1h"];
export const BACKTEST_TIMEFRAMES  = ["1m", "5m", "15m", "1h", "4h", "1d"];

// Cache TTL per timeframe. Short relative to candle period — a 5m bar
// hasn't materially changed within 60s, but we still want to refresh
// often enough that the trading loop sees the newly-closed bar.
const CANDLE_TTL: Record<string, number> = {
  "1m": 30_000, "5m": 60_000, "15m": 90_000,
  "1h": 120_000, "4h": 300_000, "1d": 600_000,
};
const TICKER_TTL = 15_000;

// Reject (and do not cache) any candle batch whose newest bar is older
// than `STALE_ON_ARRIVAL_MULTIPLIER * TF_TO_MS[timeframe]`. This is
// stricter than the trading loop's downstream 15-minute guard — we
// catch the rot at the source.
const STALE_ON_ARRIVAL_MULTIPLIER = 3;

const candleCache = new Map<string, CacheEntry<Candle[]>>();
const tickerCache = new Map<string, CacheEntry<TickerData>>();

// ── Data feed health telemetry ───────────────────────────────────────────────

export interface DataFeedHealth {
  healthy:           boolean;
  primary:           "coinbase";
  fallback:          "kraken";
  primaryStatus:     "ok" | "degraded" | "down";
  fallbackStatus:    "ok" | "degraded" | "down";
  lastSuccessAt:     number | null; // unix ms — last successful candle fetch from EITHER provider
  lastSuccessSource: "coinbase" | "kraken" | null;
  lastFailureAt:     number | null;
  lastFailureSource: "coinbase" | "kraken" | null;
  lastFailureReason: string | null;
  consecutiveFailures: number;
}

const _feedHealth: DataFeedHealth = {
  healthy:             true, // optimistic until we observe a real failure window
  primary:             "coinbase",
  fallback:            "kraken",
  primaryStatus:       "ok",
  fallbackStatus:      "ok",
  lastSuccessAt:       null,
  lastSuccessSource:   null,
  lastFailureAt:       null,
  lastFailureSource:   null,
  lastFailureReason:   null,
  consecutiveFailures: 0,
};

// A feed is "down" if we've had >= this many back-to-back failures
// across BOTH providers without any successful candle fetch in between.
const FEED_DOWN_THRESHOLD = 3;

function recordSuccess(source: "coinbase" | "kraken"): void {
  _feedHealth.lastSuccessAt       = Date.now();
  _feedHealth.lastSuccessSource   = source;
  _feedHealth.consecutiveFailures = 0;
  _feedHealth.healthy             = true;
  if (source === "coinbase") _feedHealth.primaryStatus  = "ok";
  else                       _feedHealth.fallbackStatus = "ok";
}

function recordFailure(source: "coinbase" | "kraken", reason: string): void {
  _feedHealth.lastFailureAt     = Date.now();
  _feedHealth.lastFailureSource = source;
  _feedHealth.lastFailureReason = reason;
  _feedHealth.consecutiveFailures++;
  // Per-provider degraded status — independent so a single-provider
  // outage is observable (e.g. Coinbase=down, Kraken=ok still serving).
  if (source === "coinbase") _feedHealth.primaryStatus  = "down";
  else                       _feedHealth.fallbackStatus = "down";
  // Global `healthy` only flips false once BOTH providers have failed
  // back-to-back enough times to cross the down threshold — a single
  // provider being out is not a feed-wide outage.
  if (
    _feedHealth.consecutiveFailures >= FEED_DOWN_THRESHOLD &&
    _feedHealth.primaryStatus  === "down" &&
    _feedHealth.fallbackStatus === "down"
  ) {
    _feedHealth.healthy = false;
  }
}

export function getDataFeedHealth(): DataFeedHealth {
  return { ..._feedHealth };
}

// ── HTTP helper with timeout ─────────────────────────────────────────────────

const HTTP_TIMEOUT_MS = 8_000;

function httpsGetJson<T>(hostname: string, path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname,
        path,
        // Coinbase REST rejects requests without a User-Agent in some
        // cases. Kraken accepts anything. Be polite and identify.
        headers: { "User-Agent": "aicandlez-marketdata/1.0", Accept: "application/json" },
      },
      res => {
        let buf = "";
        res.on("data", c => { buf += c as string; });
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`HTTP ${res.statusCode} from ${hostname}${path}: ${buf.slice(0, 200)}`));
            return;
          }
          try { resolve(JSON.parse(buf) as T); }
          catch { reject(new Error(`Non-JSON response from ${hostname}${path}: ${buf.slice(0, 200)}`)); }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout (${HTTP_TIMEOUT_MS}ms) calling ${hostname}${path}`));
    });
  });
}

// ── Coinbase Exchange (primary) ──────────────────────────────────────────────

/** Coinbase candle schema: `[time, low, high, open, close, volume]` (DESC by time). */
type CoinbaseKline = [number, number, number, number, number, number];

async function fetchCoinbaseCandles(
  symbol: string, timeframe: string, limit: number,
): Promise<Candle[]> {
  const pid = COINBASE_SYMBOLS[symbol];
  if (!pid) throw new Error(`Unsupported symbol: ${symbol}`);
  const granularity = COINBASE_GRANULARITY_SEC[timeframe];
  if (!granularity) throw new Error(`Unsupported timeframe: ${timeframe}`);

  // Coinbase caps at 300 candles per request; we never need more here
  // (max caller is `getCandles(..., 150)`).
  const capped = Math.min(Math.max(limit, 1), 300);
  const endMs   = Date.now();
  const startMs = endMs - capped * granularity * 1_000;
  const start = new Date(startMs).toISOString();
  const end   = new Date(endMs).toISOString();

  const raw = await httpsGetJson<CoinbaseKline[]>(
    "api.exchange.coinbase.com",
    `/products/${pid}/candles?granularity=${granularity}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  );
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Coinbase returned no candles for ${pid} @ ${timeframe}`);
  }

  // Coinbase returns NEWEST FIRST; trading loop expects oldest-first.
  // Sort ascending by time and normalise to our `Candle` shape.
  return raw
    .map<Candle>(k => ({
      time:   k[0],
      low:    k[1],
      high:   k[2],
      open:   k[3],
      close:  k[4],
      volume: k[5],
    }))
    .sort((a, b) => a.time - b.time)
    .slice(-limit);
}

interface CoinbaseTickerResp { trade_id: number; price: string; size: string; time: string; bid: string; ask: string; volume: string }
interface CoinbaseStatsResp  { open: string; high: string; low: string; last: string; volume: string }

async function fetchCoinbaseTicker(symbol: string): Promise<TickerData> {
  const pid = COINBASE_SYMBOLS[symbol];
  if (!pid) throw new Error(`Unsupported symbol: ${symbol}`);

  // Two endpoints: /ticker for live bid/ask/price, /stats for 24h OHLV.
  // Run in parallel; if either fails the whole ticker call fails and
  // we fall through to Kraken.
  const [tick, stats] = await Promise.all([
    httpsGetJson<CoinbaseTickerResp>("api.exchange.coinbase.com", `/products/${pid}/ticker`),
    httpsGetJson<CoinbaseStatsResp>(  "api.exchange.coinbase.com", `/products/${pid}/stats`),
  ]);

  const price   = parseFloat(tick.price);
  const open24h = parseFloat(stats.open);
  const change  = price - open24h;
  const changeP = open24h > 0 ? (change / open24h) * 100 : 0;

  return {
    symbol,
    price,
    bid:              parseFloat(tick.bid),
    ask:              parseFloat(tick.ask),
    open24h,
    high24h:          parseFloat(stats.high),
    low24h:           parseFloat(stats.low),
    volume24h:        parseFloat(stats.volume),
    change24h:        change,
    changePercent24h: changeP,
    lastUpdated:      Date.now(),
  };
}

// ── Kraken public (fallback) ─────────────────────────────────────────────────

/** Kraken OHLC row: `[time, open, high, low, close, vwap, volume, count]`. */
type KrakenOHLCRow = [number, string, string, string, string, string, string, number];
interface KrakenOHLCResp { error: string[]; result: Record<string, KrakenOHLCRow[] | number> }

async function fetchKrakenCandles(
  symbol: string, timeframe: string, limit: number,
): Promise<Candle[]> {
  const pair = KRAKEN_SYMBOLS[symbol];
  if (!pair) throw new Error(`Unsupported symbol: ${symbol}`);
  const interval = KRAKEN_INTERVAL_MIN[timeframe];
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`);

  const data = await httpsGetJson<KrakenOHLCResp>(
    "api.kraken.com",
    `/0/public/OHLC?pair=${pair}&interval=${interval}`,
  );
  if (data.error?.length > 0) {
    throw new Error(`Kraken error: ${data.error.join(", ")}`);
  }

  // Kraken keys responses by their internal pair name (e.g. XXBTZUSD
  // for XBTUSD), so grab the first array value rather than guessing.
  const rows = Object.values(data.result).find(v => Array.isArray(v)) as KrakenOHLCRow[] | undefined;
  if (!rows || rows.length === 0) {
    throw new Error(`Kraken returned no candles for ${pair} @ ${timeframe}`);
  }

  return rows
    .map<Candle>(r => ({
      time:   r[0],
      open:   parseFloat(r[1]),
      high:   parseFloat(r[2]),
      low:    parseFloat(r[3]),
      close:  parseFloat(r[4]),
      volume: parseFloat(r[6]),
    }))
    .sort((a, b) => a.time - b.time)
    .slice(-limit);
}

interface KrakenTickerInfo { a: [string, string, string]; b: [string, string, string]; c: [string, string]; v: [string, string]; h: [string, string]; l: [string, string]; o: string }
interface KrakenTickerResp { error: string[]; result: Record<string, KrakenTickerInfo> }

async function fetchKrakenTicker(symbol: string): Promise<TickerData> {
  const pair = KRAKEN_SYMBOLS[symbol];
  if (!pair) throw new Error(`Unsupported symbol: ${symbol}`);

  const data = await httpsGetJson<KrakenTickerResp>(
    "api.kraken.com",
    `/0/public/Ticker?pair=${pair}`,
  );
  if (data.error?.length > 0) {
    throw new Error(`Kraken error: ${data.error.join(", ")}`);
  }
  const info = Object.values(data.result)[0];
  if (!info) throw new Error(`Kraken returned no ticker for ${pair}`);

  const price   = parseFloat(info.c[0]);
  const open24h = parseFloat(info.o);
  const change  = price - open24h;
  const changeP = open24h > 0 ? (change / open24h) * 100 : 0;

  return {
    symbol,
    price,
    bid:              parseFloat(info.b[0]),
    ask:              parseFloat(info.a[0]),
    open24h,
    high24h:          parseFloat(info.h[1]),
    low24h:           parseFloat(info.l[1]),
    volume24h:        parseFloat(info.v[1]),
    change24h:        change,
    changePercent24h: changeP,
    lastUpdated:      Date.now(),
  };
}

// ── Freshness gate ───────────────────────────────────────────────────────────

function isStaleOnArrival(candles: Candle[], timeframe: string): boolean {
  if (candles.length === 0) return true;
  const newestSec = candles[candles.length - 1]!.time;
  const ageMs     = Date.now() - newestSec * 1_000;
  const tfMs      = TF_TO_MS[timeframe] ?? 300_000;
  return ageMs > STALE_ON_ARRIVAL_MULTIPLIER * tfMs;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getCandles(
  symbol: string, timeframe: string, limit = 100,
): Promise<Candle[]> {
  const key    = `${symbol}_${timeframe}`;
  const ttl    = CANDLE_TTL[timeframe] ?? 60_000;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttl) return cached.data.slice(-limit);

  // ── Primary: Coinbase ─────────────────────────────────────────────
  let candles: Candle[] | null = null;
  let primaryErr: string | null = null;
  try {
    const c = await fetchCoinbaseCandles(symbol, timeframe, limit);
    if (isStaleOnArrival(c, timeframe)) {
      primaryErr = `Coinbase returned stale data for ${symbol}/${timeframe} (newest bar > ${STALE_ON_ARRIVAL_MULTIPLIER}x timeframe old)`;
      recordFailure("coinbase", primaryErr);
    } else {
      candles = c;
      recordSuccess("coinbase");
    }
  } catch (err) {
    primaryErr = err instanceof Error ? err.message : String(err);
    recordFailure("coinbase", primaryErr);
  }

  // ── Fallback: Kraken ──────────────────────────────────────────────
  if (!candles) {
    // Two failure modes here — fetch error and stale-on-arrival — each
    // must record EXACTLY ONE failure for the kraken source. We capture
    // the reason locally and call `recordFailure` once at the end of
    // the failure path, then re-throw to the caller.
    let krakenErr: string | null = null;
    try {
      const c = await fetchKrakenCandles(symbol, timeframe, limit);
      if (isStaleOnArrival(c, timeframe)) {
        krakenErr = `Kraken returned stale data for ${symbol}/${timeframe} (newest bar > ${STALE_ON_ARRIVAL_MULTIPLIER}x timeframe old)`;
      } else {
        candles = c;
        recordSuccess("kraken");
      }
    } catch (err) {
      krakenErr = err instanceof Error ? err.message : String(err);
    }
    if (!candles) {
      recordFailure("kraken", krakenErr ?? "unknown");
      // Both providers failed — DO NOT cache. Propagate so the trading
      // loop logs the failure into recentErrors and skips this symbol
      // on this tick (next tick will retry from scratch).
      throw new Error(`Candle feed unavailable for ${symbol}/${timeframe}. Coinbase: ${primaryErr ?? "ok"}. Kraken: ${krakenErr}`);
    }
  }

  candleCache.set(key, { data: candles, fetchedAt: Date.now() });
  return candles.slice(-limit);
}

export async function getTicker(symbol: string): Promise<TickerData> {
  const cached = tickerCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < TICKER_TTL) return cached.data;

  let ticker: TickerData | null = null;
  let primaryErr: string | null = null;

  try {
    ticker = await fetchCoinbaseTicker(symbol);
  } catch (err) {
    primaryErr = err instanceof Error ? err.message : String(err);
  }

  if (!ticker) {
    try {
      ticker = await fetchKrakenTicker(symbol);
    } catch (err) {
      const krakenErr = err instanceof Error ? err.message : String(err);
      throw new Error(`Ticker feed unavailable for ${symbol}. Coinbase: ${primaryErr ?? "ok"}. Kraken: ${krakenErr}`);
    }
  }

  tickerCache.set(symbol, { data: ticker, fetchedAt: Date.now() });
  return ticker;
}

// ── Compat: callers that still import SYMBOL_MAP (legacy) ────────────────────
export const SYMBOL_MAP = COINBASE_SYMBOLS;
