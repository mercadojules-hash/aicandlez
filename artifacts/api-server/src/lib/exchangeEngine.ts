import { validateTrade, getStatus as getRiskStatus } from "./riskEngine.js";
import { getTicker }      from "./marketData.js";
import { CoinbaseAdapter } from "../services/exchanges/adapters/CoinbaseAdapter.js";
import { AlpacaAdapter, ALPACA_CONFIG }   from "../services/exchanges/adapters/AlpacaAdapter.js";
import { KrakenAdapter, KRAKEN_CONFIG }   from "../services/exchanges/adapters/KrakenAdapter.js";
import { BinanceAdapter, BINANCE_CONFIG } from "../services/exchanges/adapters/BinanceAdapter.js";
import { CryptoDotComAdapter, CRYPTOCOM_CONFIG } from "../services/exchanges/adapters/CryptoDotComAdapter.js";
import type { BaseExchangeAdapter } from "../services/exchanges/BaseExchangeAdapter.js";
import { executionStreamBus } from "./executionStreamBus.js";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExchangeMode  = "simulation" | "live";
export type OrderSide     = "buy" | "sell";
export type OrderType     = "market" | "limit";
export type OrderStatus   = "filled" | "rejected" | "cancelled" | "open";

export interface ExchangeOrder {
  id:               string;
  symbol:           string;          // e.g. "BTCUSD"
  nativePair:       string;          // e.g. "BTC/USD" (Alpaca notation)
  side:             OrderSide;
  orderType:        OrderType;
  volumeBase:       number;          // in base currency (BTC / ETH / SOL)
  limitPrice?:      number;
  fillPrice:        number;
  valueUSD:         number;
  feeUSD:           number;
  status:           OrderStatus;
  mode:             ExchangeMode;
  timestamp:        number;
  exchangeOrderId?: string;          // broker-assigned order ID
  riskChecks:       RiskGate[];
  rejectionReason?: string;
}

export interface RiskGate {
  name:   string;
  passed: boolean;
  detail: string;
}

export interface OrderPreview {
  symbol:        string;
  nativePair:    string;          // exchange-native symbol
  side:          OrderSide;
  orderType:     OrderType;
  volumeBase:    number;
  estimatedFill: number;
  valueUSD:      number;
  feeUSD:        number;
  riskGates:     RiskGate[];
  allowed:       boolean;
  blockedBy:     string[];
}

export interface ExchangeStatus {
  mode:              ExchangeMode;
  killSwitch:        boolean;
  paused:            boolean;
  liveCapable:       boolean;       // env vars present AND EXCHANGE_LIVE_ENABLED=true
  apiConfigured:     boolean;       // ALPACA_API_KEY + ALPACA_SECRET_KEY both set
  liveEnabled:       boolean;       // EXCHANGE_LIVE_ENABLED=true
  ordersToday:       number;
  lastOrderAt:       number | null;
  simBalances:       Balances;
  exchangeName:      string;
}

export interface Balances {
  USD: number;
  BTC: number;
  ETH: number;
  SOL: number;
}

// ── Alpaca symbol map ─────────────────────────────────────────────────────────

const ALPACA_PAIRS: Record<string, string> = {
  BTCUSD:  "BTC/USD",
  ETHUSD:  "ETH/USD",
  SOLUSD:  "SOL/USD",
  XRPUSD:  "XRP/USD",
  DOGEUSD: "DOGE/USD",
  AVAXUSD: "AVAX/USD",
  LINKUSD: "LINK/USD",
  ADAUSD:  "ADA/USD",
};

const TAKER_FEE = 0.0; // Alpaca charges 0% fee for crypto

// ── Singleton state ───────────────────────────────────────────────────────────

let _mode:             ExchangeMode = "simulation";
let _killSwitch:       boolean      = false;
let _paused:           boolean      = false;
// _selectedExchange picks the active live-broker the engine routes through
// for /exchange/balances + /exchange/mode + execution. Default is determined
// by `pickPreferredExchange()` at module init — see below. Historically this
// was hard-coded to "Alpaca", which on the production admin terminal meant
// `getExchangeStatus()` reported `exchangeName: "Alpaca"` + `apiConfigured:
// false` (Alpaca keys absent), so the header pill rendered "ALPACA STANDBY"
// and the operator USD tile rendered "—" — even though KRAKEN_API_KEY +
// KRAKEN_API_SECRET were configured and Kraken had a real ~$100 balance.
let _selectedExchange: string       = "Alpaca"; // overwritten by init below
const _orders:         ExchangeOrder[] = [];

// Simulated portfolio for paper trading
const PAPER_BALANCES: Balances = { USD: 100_000, BTC: 0, ETH: 0, SOL: 0 };

let _simBalances: Balances = { ...PAPER_BALANCES };

// ── Env helpers ───────────────────────────────────────────────────────────────

function isExchangeConfigured(exchange: string): boolean {
  const ex = exchange.toLowerCase().replace(/[\s._-]/g, "");
  if (ex === "kraken")                        return !!(process.env["KRAKEN_API_KEY"]    && process.env["KRAKEN_API_SECRET"]);
  if (ex === "binance" || ex === "binanceus") return !!(process.env["BINANCE_API_KEY"]   && process.env["BINANCE_API_SECRET"]);
  if (ex === "coinbase")                      return !!(process.env["COINBASE_API_KEY"]  && process.env["COINBASE_API_SECRET"]);
  if (ex === "cryptocom" || ex === "cryptocomdotcom" || ex === "cryptodotcom") {
    return !!(process.env["CRYPTOCOM_API_KEY"] && process.env["CRYPTOCOM_API_SECRET"]);
  }
  if (ex === "gemini")  return !!(process.env["GEMINI_API_KEY"]  && process.env["GEMINI_API_SECRET"]);
  if (ex === "alpaca")  return !!(process.env["ALPACA_API_KEY"]  && process.env["ALPACA_SECRET_KEY"]);
  return false;
}

export function getConfiguredExchanges(): string[] {
  return (["Kraken", "Binance", "Coinbase", "CryptoDotCom", "Gemini", "Alpaca"] as const)
    .filter(e => isExchangeConfigured(e));
}

/**
 * Pick the preferred live exchange at boot, in priority order:
 *   Kraken → Coinbase → CryptoDotCom → Binance → Gemini → Alpaca.
 *
 * Kraken leads because the production admin terminal
 * (admintrade.aicandlez.com) runs against real Kraken capital — this is
 * documented in `replit.md` ("Exchange secrets (LIVE mode): KRAKEN_API_KEY,
 * KRAKEN_API_SECRET, EXCHANGE_LIVE_ENABLED=true") and is the only exchange
 * with a configured live USD balance for the operator hero. Alpaca is
 * intentionally last — it is the *recommended* on-ramp for new customers
 * (per the T1-T6 onboarding plan) but is rarely configured on the shared
 * engine.
 *
 * Falls back to "Alpaca" only when literally nothing is configured (sim
 * environments / local dev with no exchange keys); in that case the engine
 * still works in simulation mode but `apiConfigured` will be false, which is
 * the correct truthful signal.
 */
function pickPreferredExchange(): string {
  const priority = ["Kraken", "Coinbase", "CryptoDotCom", "Binance", "Gemini", "Alpaca"];
  for (const ex of priority) {
    if (isExchangeConfigured(ex)) return ex;
  }
  return "Alpaca";
}

// Boot-time selection. Runs once at module load. Logging uses the shared
// pino singleton (`lib/logger.ts`) — this module is shared between Express
// request paths and worker code so `req.log` is not available here, but
// the structured singleton is fine (no circular import: logger.ts has no
// dependency on exchangeEngine).
_selectedExchange = pickPreferredExchange();
logger.info({
  tag:           "BALANCE_FETCH",
  event:         "boot",
  exchange:      _selectedExchange,
  liveEnabled:   process.env["EXCHANGE_LIVE_ENABLED"] === "true",
  configured:    getConfiguredExchanges(),
  apiConfigured: isExchangeConfigured(_selectedExchange),
}, "[BALANCE_FETCH] exchangeEngine boot");

function isApiConfigured(): boolean {
  return isExchangeConfigured(_selectedExchange);
}
function isLiveEnabled(): boolean {
  return process.env["EXCHANGE_LIVE_ENABLED"] === "true";
}
function isLiveCapable(): boolean {
  return isApiConfigured() && isLiveEnabled();
}

// ── Live balances ─────────────────────────────────────────────────────────────

export async function fetchLiveBalances(): Promise<Balances> {
  const t0 = Date.now();
  logger.info({ tag: "BALANCE_FETCH", event: "start", exchange: _selectedExchange }, "[BALANCE_FETCH] start");
  if (_selectedExchange === "Kraken") {
    if (!isExchangeConfigured("Kraken")) {
      throw new Error("Kraken API credentials are not configured (KRAKEN_API_KEY / KRAKEN_API_SECRET missing)");
    }
    const { KrakenAdapter, KRAKEN_CONFIG } = await import("../services/exchanges/adapters/KrakenAdapter.js");
    const adapter = new KrakenAdapter({
      ...KRAKEN_CONFIG,
      apiKey:    process.env["KRAKEN_API_KEY"],
      apiSecret: process.env["KRAKEN_API_SECRET"],
    });
    try {
      const account = await adapter.getAccount();
      const usd = account.balances["USD"]?.total ?? 0;
      const btc = account.balances["BTC"]?.total ?? 0;
      const eth = account.balances["ETH"]?.total ?? 0;
      const sol = account.balances["SOL"]?.total ?? 0;
      logger.info({
        tag:         "BALANCE_FETCH",
        event:       "ok",
        exchange:    "Kraken",
        assetCount:  Object.keys(account.balances).length,
        latencyMs:   Date.now() - t0,
        errorCode:   null,
      }, "[BALANCE_FETCH] Kraken account ok");
      return { USD: usd, BTC: btc, ETH: eth, SOL: sol };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({
        tag:       "BALANCE_FETCH",
        event:     "fail",
        exchange:  "Kraken",
        latencyMs: Date.now() - t0,
        errorCode: "adapter_getAccount_throw",
        err:       msg,
      }, "[BALANCE_FETCH] Kraken getAccount failed");
      throw err;
    }
  }

  if (_selectedExchange === "Coinbase") {
    if (!isExchangeConfigured("Coinbase")) throw new Error("Coinbase API keys not configured");
    const adapter = new CoinbaseAdapter();
    const account = await adapter.getAccount();
    return {
      USD: account.balances["USD"]?.free ?? 0,
      BTC: account.balances["BTC"]?.free ?? 0,
      ETH: account.balances["ETH"]?.free ?? 0,
      SOL: account.balances["SOL"]?.free ?? 0,
    };
  }

  if (_selectedExchange === "Alpaca") {
    if (!isExchangeConfigured("Alpaca")) throw new Error("Alpaca API keys not configured");
    const adapter = new AlpacaAdapter();
    const account = await adapter.getAccount();
    return {
      USD: account.balances["USD"]?.free ?? 0,
      BTC: account.balances["BTC"]?.free ?? 0,
      ETH: account.balances["ETH"]?.free ?? 0,
      SOL: account.balances["SOL"]?.free ?? 0,
    };
  }

  // Other exchanges: not yet implemented for live balances
  return { USD: 0, BTC: 0, ETH: 0, SOL: 0 };
}

// ── Live balances cache + single-flight (telemetry resilience) ───────────────
// Background: multiple admin telemetry panels poll /api/exchange/balances and
// /api/exchange/live-state concurrently. Each call hits Kraken's private
// /0/private/Balance endpoint, which has a strict rate limit. Without
// coalescing, the parallel callers each trigger an upstream call, Kraken
// returns `EAPI:Rate limit exceeded`, every panel renders "$0 / Kraken USD
// unavailable", and the operator dashboard appears disconnected even though
// the account is healthy (real balances, real positions, prior live trade
// succeeded).
//
// Fix is telemetry-layer ONLY — it does NOT touch the execution path. The
// Kraken bridge for order placement still calls KrakenAdapter directly with
// no cache: only the read-side balance polling is coalesced and snapshotted.
//
//   1. FRESH window (BALANCES_FRESH_MS): return cached snapshot, no upstream
//      call. Collapses bursts of concurrent panel polls.
//   2. Single-flight: one in-flight upstream request at a time; concurrent
//      callers await the same Promise.
//   3. STALE-ON-ERROR window (BALANCES_STALE_MS): if the upstream call
//      fails (rate-limit, timeout, transient) but we have a snapshot within
//      the stale window, serve it with source="cached" + error message
//      attached. Telemetry degrades gracefully instead of flipping to zero.
type BalancesCacheEntry  = { balances: Balances; fetchedAt: number };
type BalancesErrorEntry  = { msg: string; at: number };
type BalancesPerExchange = {
  cache:    BalancesCacheEntry | null;
  inflight: Promise<Balances> | null;
  // Negative cache. When an upstream call fails AND we have no positive
  // snapshot to fall back on, we remember the failure for a short cooldown.
  // Subsequent polls within the cooldown return immediately without
  // re-hitting Kraken — this prevents the cold-cache / rate-limit death
  // spiral where every 4-10s panel poll keeps the throttle counter pinned
  // and the window from ever decaying. Cleared on the next successful fetch
  // and on setSelectedExchange().
  lastError: BalancesErrorEntry | null;
};

// Keyed by exchange name so concurrent callers for different exchanges never
// share a single-flight promise (architect review caught this: a global
// inflight could let a Coinbase caller receive Kraken balances if the
// operator switched mid-flight). Each exchange has its own cache + inflight
// slot. clearBalancesCache() flips both when the selected exchange changes.
const _balancesByExchange = new Map<string, BalancesPerExchange>();

// Tuning — telemetry tier only. Execution path is untouched.
//   FRESH_MS: how long a successful snapshot is served without re-fetching.
//     Bumped 8s → 20s in the controlled-beta stabilization pass because the
//     hero balance is decorative for the operator (real positions/equity
//     live in /exchange/live-state which derives from _orders, not from
//     Balance). 20s staleness is invisible to operator and drops the
//     upstream rate from ~7.5/min to ~3/min worst case across all panels.
//   STALE_MS: how long a snapshot may be served as `stale-error` after the
//     upstream starts failing. Long, because a stale real number is always
//     better than a zero.
//   ERROR_COOLDOWN_MS: negative-cache duration when upstream fails AND we
//     have no positive cache to serve. Within this window the route gets
//     the cached error string and Kraken is not touched, giving the
//     rate-limit counter time to decay. Slightly longer than the longest
//     poll interval (10s) so polling cycles can't immediately re-arm.
const BALANCES_FRESH_MS        = 20_000;
const BALANCES_STALE_MS        = 5 * 60 * 1000;
const BALANCES_ERROR_COOLDOWN_MS = 20_000;

// ── Staleness telemetry ─────────────────────────────────────────────────────
// Bumped every time `fetchLiveBalancesWithMeta` serves a stale-on-error
// snapshot. The frontend reads this via the existing live-state payload
// so the operator pill can render "STALE × N" instead of silently
// serving cached numbers. `_lastStaleEvent` is the most recent stale
// event for the currently-selected exchange and surfaces the upstream
// error string to the operator drawer.
let _staleEventCount = 0;
let _lastStaleEvent: { exchange: string; ageMs: number; error: string; at: number } | null = null;

export function getBalanceStalenessStats(): {
  staleEventCount: number;
  lastStaleEvent:  { exchange: string; ageMs: number; error: string; at: number } | null;
} {
  return { staleEventCount: _staleEventCount, lastStaleEvent: _lastStaleEvent };
}

export type LiveBalancesSource = "live" | "cached" | "stale-error";
export interface LiveBalancesWithMeta {
  balances: Balances;
  exchange: string;
  source:   LiveBalancesSource;
  ageMs:    number;
  error?:   string;
}

function getBalancesSlot(exchange: string): BalancesPerExchange {
  let slot = _balancesByExchange.get(exchange);
  if (!slot) {
    slot = { cache: null, inflight: null, lastError: null };
    _balancesByExchange.set(exchange, slot);
  }
  return slot;
}

export async function fetchLiveBalancesWithMeta(): Promise<LiveBalancesWithMeta> {
  // Capture the exchange selection at call-entry. The slot is keyed by this
  // value, so even if `_selectedExchange` mutates mid-await we still resolve
  // against the slot that owns the upstream call we joined.
  const exchange = _selectedExchange;
  const slot     = getBalancesSlot(exchange);
  const now      = Date.now();

  // 1. Fresh cache hit — no upstream call.
  if (slot.cache && now - slot.cache.fetchedAt < BALANCES_FRESH_MS) {
    return {
      balances: slot.cache.balances,
      exchange,
      source:   "cached",
      ageMs:    now - slot.cache.fetchedAt,
    };
  }

  // 1b. Negative-cache hit — upstream failed recently AND we have no usable
  // snapshot. Skip the upstream call entirely and re-throw the cached error.
  // This is the fix for the cold-cache rate-limit death spiral: without this,
  // every 4-10s poll across every panel would re-hit Kraken during the
  // throttle window, pinning the counter and preventing decay. We only honor
  // the cooldown when no positive cache exists — if we have a snapshot
  // (even stale), the stale-on-error branch below is strictly better.
  if (
    slot.lastError &&
    !slot.cache &&
    now - slot.lastError.at < BALANCES_ERROR_COOLDOWN_MS
  ) {
    throw new Error(slot.lastError.msg);
  }

  // 2. Single-flight per exchange: concurrent callers for the SAME exchange
  // coalesce; callers for a different exchange use that exchange's own slot.
  if (!slot.inflight) {
    slot.inflight = fetchLiveBalances()
      .then((b) => {
        slot.cache     = { balances: b, fetchedAt: Date.now() };
        slot.lastError = null;  // success clears the negative cache
        return b;
      })
      .finally(() => {
        slot.inflight = null;
      });
  }

  try {
    const balances = await slot.inflight;
    return { balances, exchange, source: "live", ageMs: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Remember the failure so subsequent polls within the cooldown window
    // do not re-hit Kraken. Refreshed each time so a sustained outage stays
    // suppressed for the full cooldown beyond the last attempt.
    slot.lastError = { msg, at: Date.now() };

    // 3. Stale-on-error: serve last-good snapshot for THIS exchange if still
    // within the stale window. Slot-scoped → never cross-leaks across
    // exchanges.
    if (slot.cache && Date.now() - slot.cache.fetchedAt < BALANCES_STALE_MS) {
      const ageMs = Date.now() - slot.cache.fetchedAt;
      _staleEventCount += 1;
      _lastStaleEvent  = { exchange, ageMs, error: msg, at: Date.now() };
      logger.warn({
        tag:       "BALANCE_FETCH",
        event:     "stale_cache_served",
        exchange,
        ageMs,
        errorCode: "upstream_failed_stale_served",
        err:       msg,
      }, "[BALANCE_FETCH] serving stale cache after upstream failure");
      return {
        balances: slot.cache.balances,
        exchange,
        source:   "stale-error",
        ageMs,
        error:    msg,
      };
    }

    // No cache available — bubble error to caller (route renders source="error").
    // The negative cache above will absorb subsequent polls for the cooldown.
    logger.warn({
      tag:           "BALANCE_FETCH",
      event:         "fail_no_cache",
      exchange,
      cooldownMs:    BALANCES_ERROR_COOLDOWN_MS,
      errorCode:     "upstream_failed_no_cache",
      err:           msg,
    }, "[BALANCE_FETCH] upstream failed with no cache — negative-caching");
    throw err;
  }
}

// ── Live equity (balances + USD-priced crypto holdings) ─────────────────────
// Background: `/api/exchange/balances` previously surfaced ONLY the USD cash
// row from Kraken's Balance endpoint. Operators with a Kraken account
// holding crypto (e.g. ETH worth $101) saw "KRAKEN BALANCE = $0.14" — the
// leftover USD float — and not their actual account value. The admin
// terminal must reflect TOTAL ACCOUNT EQUITY (USD cash + every crypto
// holding marked-to-market) so that the operator's mental model matches
// what they see in Kraken Pro.
//
// Equity = USD + Σ (qty_asset × last_price_assetUSD)
//
// Pricing strategy:
//   • Pull live ticker once per asset per cycle via the active adapter.
//   • Cache last-good price per (exchange, symbol) for `PRICE_CACHE_FRESH_MS`
//     so the equity recompute doesn't fan out ticker calls every poll.
//   • If a ticker fetch fails AND we have no cached price, mark that asset
//     in `priceErrors` and omit it from the equity sum (under-report rather
//     than crash). The UI shows a soft warning chip instead of zeroing the
//     hero. A stale price is always better than no price; a missing price
//     is always better than $0 equity.
//   • Only price non-USD assets with a positive total. Dust below
//     `DUST_QTY_THRESHOLD` is ignored to avoid wasting ticker calls on
//     remnants that round to <$0.01 of equity.

const PRICE_CACHE_FRESH_MS = 30_000;
const DUST_QTY_THRESHOLD   = 1e-8;

type PriceCacheEntry = { price: number; fetchedAt: number };
const _priceCache = new Map<string, PriceCacheEntry>();

function priceCacheKey(exchange: string, symbol: string): string {
  return `${exchange}::${symbol}`;
}

/**
 * Get a USD price for `${asset}USD` on the active exchange's adapter, using
 * a short-lived per-(exchange,symbol) cache. Returns `{ price, source }`
 * where source ∈ "live" | "cached" | "error". On error returns
 * `{ price: null, source: "error", error }` so the caller can decide
 * whether to omit the asset from the equity sum.
 */
export async function getCachedSpotPriceUSD(
  exchange: string,
  asset: string,
): Promise<{ price: number; source: "live" | "cached" } | { price: null; source: "error"; error: string }> {
  const symbol = `${asset}USD`;
  const key    = priceCacheKey(exchange, symbol);
  const now    = Date.now();
  const cached = _priceCache.get(key);

  if (cached && now - cached.fetchedAt < PRICE_CACHE_FRESH_MS) {
    return { price: cached.price, source: "cached" };
  }

  try {
    let price = NaN;
    if (exchange === "Kraken") {
      const { KrakenAdapter, KRAKEN_CONFIG } = await import("../services/exchanges/adapters/KrakenAdapter.js");
      const adapter = new KrakenAdapter({
        ...KRAKEN_CONFIG,
        apiKey:    process.env["KRAKEN_API_KEY"],
        apiSecret: process.env["KRAKEN_API_SECRET"],
      });
      const t = await adapter.getTicker(symbol);
      price = t.last;
    } else if (exchange === "Coinbase") {
      const adapter = new CoinbaseAdapter();
      const t = await adapter.getTicker(symbol);
      price = t.last;
    } else if (exchange === "Alpaca") {
      const adapter = new AlpacaAdapter();
      const t = await adapter.getTicker(symbol);
      price = t.last;
    } else {
      throw new Error(`No live-ticker adapter wired for exchange=${exchange}`);
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Adapter returned non-positive price for ${symbol}: ${price}`);
    }
    _priceCache.set(key, { price, fetchedAt: now });
    return { price, source: "live" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fallback: serve cached even if past freshness window — a stale price
    // is strictly better than dropping the asset from the equity total.
    // We don't gate this on a stale window because there's no upper bound
    // on how long a price stays "useful enough" — the equity hero just
    // needs SOMETHING believable. If even that's missing, return error.
    if (cached) {
      logger.warn({
        tag:       "BALANCE_FETCH",
        event:     "spot_price_stale_served",
        exchange,
        symbol,
        ageMs:     now - cached.fetchedAt,
        errorCode: "spot_upstream_failed_stale_served",
        err:       msg,
      }, "[BALANCE_FETCH] spot price upstream failed — serving stale cache");
      return { price: cached.price, source: "cached" };
    }
    logger.warn({
      tag:       "BALANCE_FETCH",
      event:     "spot_price_fail_no_cache",
      exchange,
      symbol,
      errorCode: "spot_upstream_failed_no_cache",
      err:       msg,
    }, "[BALANCE_FETCH] spot price upstream failed with no cache");
    return { price: null, source: "error", error: msg };
  }
}

export interface LiveEquityWithMeta extends LiveBalancesWithMeta {
  /** USD cash row (Balance endpoint `USD`). */
  usdCash:        number;
  /** Σ (qty_asset × last_price) across non-USD assets we could price. */
  holdingsUsd:    number;
  /** usdCash + holdingsUsd — what the UI shows as "KRAKEN EQUITY". */
  totalEquityUsd: number;
  /** Per-asset USD value (omitted when qty<=dust or price unavailable). */
  holdings:       Record<string, { qty: number; priceUsd: number; valueUsd: number; priceSource: "live" | "cached" }>;
  /** Assets we hold but could not price (UI shows a soft warning chip). */
  priceErrors:    Array<{ asset: string; qty: number; error: string }>;
}

/**
 * Convenience wrapper. Returns the full `LiveBalancesWithMeta` payload PLUS
 * the USD-priced equity rollup. Never throws on price errors — it
 * under-reports equity and surfaces the missing assets in `priceErrors`
 * so the UI can show a warning instead of falling back to $0.
 */
export async function fetchLiveEquityWithMeta(): Promise<LiveEquityWithMeta> {
  const meta = await fetchLiveBalancesWithMeta();
  const usdCash = meta.balances.USD ?? 0;

  const holdings: LiveEquityWithMeta["holdings"]       = {};
  const priceErrors: LiveEquityWithMeta["priceErrors"] = [];
  let holdingsUsd = 0;

  // Only non-USD assets with non-dust quantity participate in pricing.
  const nonUsdAssets: Array<[string, number]> = Object.entries(meta.balances)
    .filter(([asset, qty]) => asset !== "USD" && qty > DUST_QTY_THRESHOLD);

  // Parallel ticker fetches — the price cache absorbs the bursts so we
  // don't fan out fresh upstream calls every poll. Settles independently
  // per asset so one ticker failure doesn't poison the whole rollup.
  const results = await Promise.all(
    nonUsdAssets.map(async ([asset, qty]) => {
      const r = await getCachedSpotPriceUSD(meta.exchange, asset);
      return { asset, qty, result: r };
    }),
  );

  for (const { asset, qty, result } of results) {
    if (result.source === "error") {
      priceErrors.push({ asset, qty, error: result.error });
      continue;
    }
    const valueUsd = qty * result.price;
    holdings[asset] = {
      qty,
      priceUsd: result.price,
      valueUsd,
      priceSource: result.source,
    };
    holdingsUsd += valueUsd;
  }

  return {
    ...meta,
    usdCash,
    holdingsUsd,
    totalEquityUsd: usdCash + holdingsUsd,
    holdings,
    priceErrors,
  };
}

/**
 * Drop in-flight + cached telemetry snapshots. Called from
 * `setSelectedExchange()` so a switch from e.g. Kraken → Coinbase does not
 * keep serving Kraken balances out of cache to a poll that started on the
 * new selection. We clear ALL slots (cheap; map is at most ~6 entries) for
 * simplicity rather than tracking only the previously-selected slot.
 */
export function clearBalancesCache(): void {
  _balancesByExchange.clear();
}

// ── Price estimate ─────────────────────────────────────────────────────────────

async function estimatePrice(symbol: string): Promise<number> {
  const ticker = await getTicker(symbol);
  return ticker.price;
}

// ── Risk gates ────────────────────────────────────────────────────────────────

function buildRiskGates(valueUSD: number): { gates: RiskGate[]; allowed: boolean; blockedBy: string[] } {
  const blockedBy: string[] = [];

  const exchangeKillGate: RiskGate = _killSwitch
    ? { name: "Exchange Kill Switch", passed: false, detail: "Exchange kill switch is active" }
    : { name: "Exchange Kill Switch", passed: true,  detail: "Exchange kill switch is off" };

  const pauseGate: RiskGate = _paused
    ? { name: "Exchange Paused",    passed: false, detail: "Exchange is paused — no new orders" }
    : { name: "Exchange Paused",    passed: true,  detail: "Exchange is active" };

  const modeGate: RiskGate = (_mode === "live" && !isLiveCapable())
    ? { name: "Live Mode Auth",  passed: false, detail: "LIVE mode not configured" }
    : { name: "Live Mode Auth",  passed: true,  detail: `Mode: ${_mode.toUpperCase()}` };

  const riskResult  = validateTrade(valueUSD);
  const riskStatus  = getRiskStatus();

  const riskKillGate: RiskGate = riskResult.checks.killSwitch.pass
    ? { name: "Risk Kill Switch",  passed: true,  detail: riskResult.checks.killSwitch.reason }
    : { name: "Risk Kill Switch",  passed: false, detail: riskResult.checks.killSwitch.reason };

  const positionGate: RiskGate = riskResult.checks.positionSize.pass
    ? { name: "Position Size",    passed: true,  detail: riskResult.checks.positionSize.reason }
    : { name: "Position Size",    passed: false, detail: riskResult.checks.positionSize.reason };

  const dailyTradeGate: RiskGate = riskResult.checks.dailyTrades.pass
    ? { name: "Daily Trade Limit", passed: true,  detail: riskResult.checks.dailyTrades.reason }
    : { name: "Daily Trade Limit", passed: false, detail: riskResult.checks.dailyTrades.reason };

  const dailyLossGate: RiskGate = riskResult.checks.dailyLoss.pass
    ? { name: "Daily Loss Limit",  passed: true,  detail: riskResult.checks.dailyLoss.reason }
    : { name: "Daily Loss Limit",  passed: false, detail: riskResult.checks.dailyLoss.reason };

  const riskLevelGate: RiskGate = riskStatus.riskLevel !== "CRITICAL"
    ? { name: "Risk Level",       passed: true,  detail: `Risk level: ${riskStatus.riskLevel}` }
    : { name: "Risk Level",       passed: false, detail: `Risk level CRITICAL — trading halted` };

  const gates = [exchangeKillGate, pauseGate, modeGate, riskKillGate, positionGate, dailyTradeGate, dailyLossGate, riskLevelGate];
  for (const g of gates) if (!g.passed) blockedBy.push(g.detail);

  return { gates, allowed: blockedBy.length === 0, blockedBy };
}

// ── Order ID ──────────────────────────────────────────────────────────────────

let _orderSeq = 1;
function nextOrderId(): string {
  return `EX-${Date.now()}-${String(_orderSeq++).padStart(4, "0")}`;
}

// ── Simulation helpers ────────────────────────────────────────────────────────

function baseAsset(symbol: string): keyof Balances {
  if (symbol === "BTCUSD") return "BTC";
  if (symbol === "ETHUSD") return "ETH";
  if (symbol === "SOLUSD") return "SOL";
  throw new Error(`Unknown symbol: ${symbol}`);
}

function applySimBalance(order: ExchangeOrder) {
  const asset = baseAsset(order.symbol);
  if (order.side === "buy") {
    _simBalances.USD      = Math.max(0, _simBalances.USD - order.valueUSD - order.feeUSD);
    _simBalances[asset]   = (_simBalances[asset] ?? 0) + order.volumeBase;
  } else {
    _simBalances[asset]   = Math.max(0, (_simBalances[asset] ?? 0) - order.volumeBase);
    _simBalances.USD     += order.valueUSD - order.feeUSD;
  }
}

// ── Preview ───────────────────────────────────────────────────────────────────

export async function previewOrder(
  symbol:    string,
  side:      OrderSide,
  orderType: OrderType,
  amountUSD: number,
  limitPrice?: number,
): Promise<OrderPreview> {
  const nativePair = ALPACA_PAIRS[symbol];
  if (!nativePair) throw new Error(`Unsupported symbol: ${symbol}`);

  const fillPrice  = orderType === "limit" && limitPrice ? limitPrice : await estimatePrice(symbol);
  const volumeBase = amountUSD / fillPrice;
  const valueUSD   = volumeBase * fillPrice;
  const feeUSD     = valueUSD * TAKER_FEE;

  const { gates, allowed, blockedBy } = buildRiskGates(valueUSD);

  return {
    symbol, nativePair, side, orderType, volumeBase,
    estimatedFill: fillPrice,
    valueUSD:      parseFloat(valueUSD.toFixed(2)),
    feeUSD:        parseFloat(feeUSD.toFixed(4)),
    riskGates:     gates,
    allowed,
    blockedBy,
  };
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function executeOrder(
  symbol:    string,
  side:      OrderSide,
  orderType: OrderType,
  amountUSD: number,
  limitPrice?: number,
): Promise<ExchangeOrder> {
  const nativePair = ALPACA_PAIRS[symbol];
  if (!nativePair) throw new Error(`Unsupported symbol: ${symbol}`);

  const fillPrice  = orderType === "limit" && limitPrice ? limitPrice : await estimatePrice(symbol);
  const volumeBase = amountUSD / fillPrice;
  const valueUSD   = volumeBase * fillPrice;
  const feeUSD     = valueUSD * TAKER_FEE;

  const { gates, allowed, blockedBy } = buildRiskGates(valueUSD);

  const order: ExchangeOrder = {
    id:         nextOrderId(),
    symbol,
    nativePair,
    side,
    orderType,
    volumeBase:  parseFloat(volumeBase.toFixed(8)),
    limitPrice,
    fillPrice:   parseFloat(fillPrice.toFixed(2)),
    valueUSD:    parseFloat(valueUSD.toFixed(2)),
    feeUSD:      parseFloat(feeUSD.toFixed(4)),
    status:      "rejected",
    mode:        _mode,
    timestamp:   Date.now(),
    riskChecks:  gates,
  };

  if (!allowed) {
    order.status = "rejected";
    order.rejectionReason = blockedBy.join("; ");
    _orders.unshift(order);
    return order;
  }

  if (_mode === "simulation") {
    order.status = "filled";
    applySimBalance(order);
    _orders.unshift(order);
    return order;
  }

  // ── LIVE execution via per-exchange adapter registry ──────────────────────
  // Routes the order through whichever adapter is currently selected
  // (Kraken, Coinbase, Alpaca, Binance, Crypto.com), instantiated with the
  // operator's process-env credentials. Before this registry existed, this
  // branch was hardcoded to `new AlpacaAdapter()` — meaning a Kraken
  // selection on the operator console would silently route to Alpaca.
  const liveAdapter = getLiveAdapter(_selectedExchange);
  const result = await liveAdapter.placeOrder({
    symbol,
    side:      side as "buy" | "sell",
    type:      orderType,
    qty:       volumeBase,
    clientId:  order.id,
    ...(orderType === "limit" && limitPrice ? { limitPrice } : {}),
  });

  order.exchangeOrderId = result.exchangeOrderId;
  order.status          = result.status === "filled" ? "filled" : "open";
  if (orderType === "market") order.status = "filled";
  if (result.avgFillPrice > 0) order.fillPrice = parseFloat(result.avgFillPrice.toFixed(2));

  _orders.unshift(order);
  return order;
}

// ── Live adapter registry ─────────────────────────────────────────────────────
//
// Returns a `BaseExchangeAdapter` instance for the given exchange name,
// constructed with the operator's process-env credentials. Throws if the
// exchange is unsupported or its credentials are missing. The instance is
// short-lived and intended to be used for a single call — adapters are
// stateless across calls and creating one is cheap.
//
// Per the live-execution bridge architecture, this is the ONLY place where
// the engine picks which real exchange to send a live order to. Per-user
// customer credentials (from `user_exchange_connections`) are NOT consulted
// here — process-env keys are operator credentials only. Customer-scoped
// live execution is a follow-up scope.
export function getLiveAdapter(exchange: string): BaseExchangeAdapter {
  const ex = exchange.toLowerCase().replace(/[\s._-]/g, "");
  if (ex === "kraken") {
    if (!isExchangeConfigured("Kraken")) {
      throw new Error("Kraken API credentials are not configured (KRAKEN_API_KEY / KRAKEN_API_SECRET missing)");
    }
    return new KrakenAdapter({
      ...KRAKEN_CONFIG,
      apiKey:    process.env["KRAKEN_API_KEY"],
      apiSecret: process.env["KRAKEN_API_SECRET"],
    });
  }
  if (ex === "coinbase") {
    if (!isExchangeConfigured("Coinbase")) throw new Error("Coinbase API credentials are not configured (COINBASE_API_KEY / COINBASE_API_SECRET missing)");
    return new CoinbaseAdapter();
  }
  if (ex === "alpaca") {
    if (!isExchangeConfigured("Alpaca")) throw new Error("Alpaca API credentials are not configured (ALPACA_API_KEY / ALPACA_SECRET_KEY missing)");
    return new AlpacaAdapter({ ...ALPACA_CONFIG });
  }
  if (ex === "binance" || ex === "binanceus") {
    if (!isExchangeConfigured("Binance")) throw new Error("Binance API credentials are not configured (BINANCE_API_KEY / BINANCE_API_SECRET missing)");
    return new BinanceAdapter({
      ...BINANCE_CONFIG,
      apiKey:    process.env["BINANCE_API_KEY"],
      apiSecret: process.env["BINANCE_API_SECRET"],
    });
  }
  if (ex === "cryptocom" || ex === "cryptocomdotcom" || ex === "cryptodotcom") {
    if (!isExchangeConfigured("CryptoDotCom")) throw new Error("Crypto.com API credentials are not configured (CRYPTOCOM_API_KEY / CRYPTOCOM_API_SECRET missing)");
    return new CryptoDotComAdapter({
      ...CRYPTOCOM_CONFIG,
      apiKey:    process.env["CRYPTOCOM_API_KEY"],
      apiSecret: process.env["CRYPTOCOM_API_SECRET"],
    });
  }
  throw new Error(`No live adapter available for exchange: ${exchange}`);
}

export const LIVE_BRIDGE_EXCHANGES = ["Kraken", "Coinbase", "Alpaca", "Binance", "CryptoDotCom"] as const;

// ── Auto-trade live bridge ────────────────────────────────────────────────────
//
// Used by the global trading loop (`tradingLoop.autoExecute`) when exchange
// mode is "live" and the trade is not a sim/test path. Returns a normalized
// result the loop can splice into its existing success path (DB insert +
// audit + execution-stream emit) WITHOUT touching `_simBalances` or the
// in-memory sim positions list — the live and sim paths stay fully isolated.
//
// All upstream gates (confidence floor, MTF, volume, sideways, 1H trend,
// max positions, daily limit, correlation, risk engine, kill switch) run
// BEFORE this function is invoked. The only checks here are operational:
// live-capable + not-paused. The trading-loop callsite is the dedupe
// boundary; this function does NOT enforce a separate dedupe window.
export interface LiveAutoOrderResult {
  success:         boolean;
  error?:          string;
  exchange?:       string;
  exchangeOrderId?: string;
  fillPrice?:      number;
  quantity?:       number;
}

export interface LiveAutoOrderResultExtended extends LiveAutoOrderResult {
  /** Gate that produced a rejection (only populated on success=false). */
  rejectionGate?: string;
  /** Raw broker response payload, captured for operator diagnostics. */
  rawResponse?:   unknown;
  /** Wall-clock latency of adapter.placeOrder in ms. */
  latencyMs?:     number;
}

/**
 * Operator-path live order execution (process-env credentials).
 *
 * Every rejection path emits a structured `order_rejected` event to the
 * executionStreamBus with a `gate` discriminator, so the /command Live
 * Execution Stream surfaces exactly *why* a live order didn't fire. On
 * success the function emits `order_acknowledged` (when the adapter
 * returns) and `order_filled` (with raw broker response captured), then
 * returns the structured result so the caller can persist + emit
 * `position_persisted` after the DB write.
 *
 * Rejection gates (stable identifiers — operator dashboard filters on these):
 *   live_mode_off · kill_switch · paused · not_capable · adapter_init ·
 *   ticker_fetch · invalid_price · qty_zero · broker_reject
 */
export async function placeLiveAutoOrder(req: {
  symbol:  string;
  side:    "BUY" | "SELL";
  sizeUSD: number;
}): Promise<LiveAutoOrderResultExtended> {
  const reject = (gate: string, error: string, details?: Record<string, unknown>): LiveAutoOrderResultExtended => {
    executionStreamBus.emitEvent({
      type:     "order_rejected",
      severity: gate === "broker_reject" ? "error" : "warn",
      symbol:   req.symbol,
      side:     req.side,
      sizeUSD:  req.sizeUSD,
      gate,
      mode:     "live",
      exchange: _selectedExchange,
      reason:   error,
      message:  `LIVE order REJECTED ${req.symbol} ${req.side} $${req.sizeUSD} @ ${gate}: ${error}`,
      details:  { ...details, gate, exchange: _selectedExchange },
    });
    return { success: false, error, rejectionGate: gate };
  };

  if (_mode !== "live")  return reject("live_mode_off", "Exchange engine not in live mode");
  if (_killSwitch)       return reject("kill_switch",   "Exchange kill switch is active");
  if (_paused)           return reject("paused",        "Exchange is paused");
  if (!isLiveCapable())  return reject("not_capable",   "Live mode not configured (missing API credentials or EXCHANGE_LIVE_ENABLED!=true)");

  // ── DISARM gate (BUY-only) ────────────────────────────────────────────────
  // Operator DISARM blocks NEW entries only. SELLs always flow so existing
  // Kraken positions can still reconcile / close via trailing-stop, TP/SL,
  // or manual close. Dynamic import to avoid the routes/engine ↔ lib/exchangeEngine
  // import cycle. Decorative-flag-only state until this gate landed; now
  // enforced wherever the loop drives BUYs through the operator path.
  if (req.side === "BUY") {
    try {
      const { isOperatorArmed } = await import("../routes/engine.js");
      if (!isOperatorArmed()) {
        return reject("disarmed", "Operator DISARMED — new BUY entries blocked (existing positions can still close)");
      }
    } catch {
      /* arm-state introspection unavailable — fail safe by allowing through
         to existing gates; never silently arm. */
    }
  }

  let adapter: BaseExchangeAdapter;
  try {
    adapter = getLiveAdapter(_selectedExchange);
  } catch (err) {
    return reject("adapter_init", err instanceof Error ? err.message : String(err));
  }

  // Fetch live price for qty conversion. The adapter is also responsible
  // for symbol normalisation — we pass the engine-native symbol ("BTCUSD").
  let referencePrice: number;
  try {
    const ticker = await getTicker(req.symbol);
    referencePrice = ticker.price;
  } catch (err) {
    return reject("ticker_fetch", `Failed to fetch reference price for ${req.symbol}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!(referencePrice > 0)) return reject("invalid_price", `Invalid reference price (${referencePrice}) for ${req.symbol}`);

  const quoteSide: "buy" | "sell" = req.side === "BUY" ? "buy" : "sell";
  const qtyBase = parseFloat((req.sizeUSD / referencePrice).toFixed(8));
  if (qtyBase <= 0) return reject("qty_zero", "Computed base quantity is zero", { referencePrice, sizeUSD: req.sizeUSD });

  const clientId = `loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const t0 = Date.now();
  let order: Awaited<ReturnType<BaseExchangeAdapter["placeOrder"]>>;
  try {
    order = await adapter.placeOrder({
      symbol:   req.symbol,
      side:     quoteSide,
      type:     "market",
      qty:      qtyBase,
      clientId,
    });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    return reject(
      "broker_reject",
      err instanceof Error ? err.message : String(err),
      { latencyMs, clientId, qtyBase, referencePrice },
    );
  }

  const latencyMs = Date.now() - t0;
  const fill = order.avgFillPrice > 0 ? order.avgFillPrice : referencePrice;
  const filledQty = order.filledQty > 0 ? order.filledQty : qtyBase;
  const exchangeOrderId = order.exchangeOrderId || order.id;

  // Broker acknowledged the order (returned a payload).
  executionStreamBus.emitEvent({
    type:     "order_acknowledged",
    severity: "info",
    symbol:   req.symbol, side: req.side, sizeUSD: req.sizeUSD, price: fill,
    mode:     "live",
    exchange: _selectedExchange,
    message:  `LIVE order ACK ${req.symbol} ${req.side} qty=${filledQty} @ $${fill.toFixed(2)} (${latencyMs}ms) — id=${exchangeOrderId}`,
    details:  { exchangeOrderId, clientId, latencyMs, qtyBase, filledQty, fill, rawResponse: order },
  });

  // Filled (market order; treated as immediate fill).
  executionStreamBus.emitEvent({
    type:     "order_filled",
    severity: "success",
    symbol:   req.symbol, side: req.side, sizeUSD: req.sizeUSD, price: fill,
    mode:     "live",
    exchange: _selectedExchange,
    message:  `LIVE FILLED ${req.symbol} ${req.side} $${req.sizeUSD} @ $${fill.toFixed(2)} on ${_selectedExchange} (id=${exchangeOrderId})`,
    details:  { exchangeOrderId, filledQty, fillPrice: fill, latencyMs },
  });

  return {
    success:         true,
    exchange:        _selectedExchange,
    exchangeOrderId,
    fillPrice:       parseFloat(fill.toFixed(2)),
    quantity:        filledQty,
    rawResponse:     order,
    latencyMs,
  };
}

// ── Public getters / setters ──────────────────────────────────────────────────

export function getExchangeStatus(): ExchangeStatus & { configuredExchanges: string[] } {
  const today      = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today).getTime();
  const ordersToday  = _orders.filter((o) => o.timestamp >= startOfDay && o.status === "filled").length;
  const lastOrder    = _orders.find((o) => o.status === "filled");

  return {
    mode:                _mode,
    killSwitch:          _killSwitch,
    paused:              _paused,
    liveCapable:         isLiveCapable(),
    apiConfigured:       isApiConfigured(),
    liveEnabled:         isLiveEnabled(),
    ordersToday,
    lastOrderAt:         lastOrder?.timestamp ?? null,
    simBalances:         { ..._simBalances },
    exchangeName:        _selectedExchange,
    configuredExchanges: getConfiguredExchanges(),
  };
}

export function getOrders(limit = 50): ExchangeOrder[] {
  return _orders.slice(0, limit);
}

// ── Live exchange state (operator telemetry reconciliation) ───────────────────
//
// Single endpoint that surfaces the full operator picture from the in-memory
// `_orders` ledger + a one-shot Kraken (or active adapter) account read +
// mark-to-market via `getTicker` per held symbol. Built so the admin Portal
// can stop deriving openCount from paper `sim_positions` (which is always 0
// for operators) and instead reflect real Kraken-derived positions.
//
// Derivation:
//   • positions: per unique symbol with at least one filled BUY/SELL,
//     netQty = Σ(filled BUY volumeBase) − Σ(filled SELL volumeBase).
//     A position is "open" when netQty > epsilon. avgEntry is the
//     volume-weighted average of filled BUY fillPrices; markPrice is the
//     current ticker; unrealizedUSD = (markPrice − avgEntry) × netQty.
//   • totalEquityUSD: balances.USD + Σ(balance × ticker.price) for each
//     non-zero base balance. NB: this is *raw account equity from the
//     exchange* — independent of `_orders` (so it stays correct even if
//     the engine memory was wiped or the operator funded the account
//     externally).
//   • queue: ExecutionQueue stats (depth + processing + completed + failed).
//     Surfaced because operator reports a stall around 30 BUYs — this is
//     the single best diagnostic to confirm/refute a queue saturation
//     hypothesis. concurrency is the configured cap.
//   • Any failure on the live read returns source="error" with raw _orders
//     counts still populated — those derive from local memory and can't
//     fail.
export interface LiveExchangePosition {
  symbol:         string;
  netQty:         number;          // base units; >0 means long
  avgEntryUSD:    number;          // VWAP of filled BUYs
  markPriceUSD:   number;          // current ticker
  unrealizedUSD:  number;          // (mark − entry) × netQty
  unrealizedPct:  number;          // unrealizedUSD / (avgEntry × netQty) × 100
  buyCount:       number;
  sellCount:      number;
  firstFillAt:    number;
  lastFillAt:     number;
}

export interface LiveExchangeState {
  source:              "live" | "error" | "standby";
  exchange:            string;
  mode:                ExchangeMode;
  apiConfigured:       boolean;
  liveCapable:         boolean;
  balances:            Balances;
  markPrices:          Record<string, number>;       // by base symbol e.g. "BTC"
  totalEquityUSD:      number;                       // USD + Σ(base × mark)
  positions:           LiveExchangePosition[];       // only open positions
  openPositionsCount:  number;                       // positions.length
  filledTotal:         number;                       // _orders filled lifetime
  filledToday:         number;                       // filled today (UTC date)
  lastFillAt:          number | null;
  realizedTodayUSD:    number;                       // Σ realized P/L from closed slices today (simplified)
  unrealizedTotalUSD:  number;                       // Σ positions[].unrealizedUSD (top-level convenience)
  queue: {
    concurrency:  number;
    processing:   number;
    depth:        number;                            // queued waiting to start
    completed:    number;
    failed:       number;
    avgLatencyMs: number;
  };
  error?:              string;
}

export async function getLiveExchangeState(): Promise<LiveExchangeState> {
  // Capture identity at function entry so a mid-flight setSelectedExchange()
  // cannot cause us to label balances from exchange A with exchange B's name
  // (architect review). All response fields derived from selection use this
  // captured value, not the live `_selectedExchange` global.
  const entryExchange      = _selectedExchange;
  const entryApiConfigured = isApiConfigured();
  const entryLiveCapable   = isLiveCapable();

  const today      = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today).getTime();
  const filledLifetime = _orders.filter(o => o.status === "filled");
  const filledToday    = filledLifetime.filter(o => o.timestamp >= startOfDay).length;
  const lastFill       = filledLifetime[0]; // _orders is newest-first

  // ── Positions derivation from in-memory ledger ─────────────────────────
  type Agg = { netQty: number; buyVol: number; buyNotional: number; sells: number; buyCount: number; sellCount: number; first: number; last: number };
  const agg = new Map<string, Agg>();
  for (const o of filledLifetime) {
    const cur = agg.get(o.symbol) ?? {
      netQty: 0, buyVol: 0, buyNotional: 0, sells: 0, buyCount: 0, sellCount: 0,
      first: o.timestamp, last: o.timestamp,
    };
    if (o.side === "buy") {
      cur.netQty      += o.volumeBase;
      cur.buyVol      += o.volumeBase;
      cur.buyNotional += o.volumeBase * o.fillPrice;
      cur.buyCount    += 1;
    } else {
      cur.netQty   -= o.volumeBase;
      cur.sells    += o.volumeBase;
      cur.sellCount += 1;
    }
    cur.first = Math.min(cur.first, o.timestamp);
    cur.last  = Math.max(cur.last,  o.timestamp);
    agg.set(o.symbol, cur);
  }

  // ── Live balances + mark prices ────────────────────────────────────────
  let balances: Balances = { USD: 0, BTC: 0, ETH: 0, SOL: 0 };
  let source: LiveExchangeState["source"] = "standby";
  let error: string | undefined;
  if (entryApiConfigured) {
    try {
      // Route through the cached/single-flight wrapper so getLiveExchangeState
      // and /api/exchange/balances coalesce onto the same upstream call and
      // share the same stale-on-error snapshot. Without this, the two
      // endpoints fight for the same Kraken Balance rate-limit budget.
      const meta = await fetchLiveBalancesWithMeta();
      balances = meta.balances;
      // Map telemetry source: stale-on-error still surfaces "live" balances
      // to the operator grid (so the dashboard does not zero out) but
      // attaches the error string so the UI can show a "stale" pill.
      source   = "live";
      if (meta.source === "stale-error" && meta.error) error = meta.error;
    } catch (err) {
      source = "error";
      error  = err instanceof Error ? err.message : String(err);
    }
  }

  // Collect symbols we need marks for: every base with non-zero balance OR
  // every symbol with an open net position. We do this in one pass and
  // tolerate individual ticker failures (mark falls back to 0 → unrealized=0
  // rather than failing the whole endpoint).
  const baseSymbols = new Set<string>();
  if (balances.BTC > 0) baseSymbols.add("BTCUSD");
  if (balances.ETH > 0) baseSymbols.add("ETHUSD");
  if (balances.SOL > 0) baseSymbols.add("SOLUSD");
  for (const [sym, a] of agg) if (a.netQty > 1e-8) baseSymbols.add(sym);

  const markPrices: Record<string, number> = {};
  await Promise.all(
    Array.from(baseSymbols).map(async (sym) => {
      try {
        const t = await getTicker(sym);
        markPrices[sym] = t.price;
      } catch {
        markPrices[sym] = 0;
      }
    }),
  );

  // ── Build open positions list ──────────────────────────────────────────
  const positions: LiveExchangePosition[] = [];
  for (const [sym, a] of agg) {
    if (a.netQty <= 1e-8) continue;
    const avgEntry = a.buyVol > 0 ? a.buyNotional / a.buyVol : 0;
    const mark     = markPrices[sym] ?? 0;
    const unreal   = mark > 0 && avgEntry > 0 ? (mark - avgEntry) * a.netQty : 0;
    const denom    = avgEntry * a.netQty;
    positions.push({
      symbol:        sym,
      netQty:        parseFloat(a.netQty.toFixed(8)),
      avgEntryUSD:   parseFloat(avgEntry.toFixed(2)),
      markPriceUSD:  parseFloat(mark.toFixed(2)),
      unrealizedUSD: parseFloat(unreal.toFixed(2)),
      unrealizedPct: denom > 0 ? parseFloat(((unreal / denom) * 100).toFixed(2)) : 0,
      buyCount:      a.buyCount,
      sellCount:     a.sellCount,
      firstFillAt:   a.first,
      lastFillAt:    a.last,
    });
  }
  positions.sort((a, b) => b.lastFillAt - a.lastFillAt);

  // ── Total equity = USD + Σ(base × mark) ────────────────────────────────
  const btcMark = markPrices["BTCUSD"] ?? 0;
  const ethMark = markPrices["ETHUSD"] ?? 0;
  const solMark = markPrices["SOLUSD"] ?? 0;
  const totalEquity = balances.USD
    + balances.BTC * btcMark
    + balances.ETH * ethMark
    + balances.SOL * solMark;

  // ── Realized P/L today (simplified) ────────────────────────────────────
  // For each filled SELL today: realized = (sell.fillPrice − avgEntryAtSell) × sell.volumeBase.
  // We approximate avgEntryAtSell with the symbol's lifetime VWAP of BUYs.
  // Operator can refine later with FIFO/LIFO if needed.
  let realizedToday = 0;
  for (const o of filledLifetime) {
    if (o.timestamp < startOfDay) continue;
    if (o.side !== "sell") continue;
    const a = agg.get(o.symbol);
    if (!a || a.buyVol === 0) continue;
    const vwap = a.buyNotional / a.buyVol;
    realizedToday += (o.fillPrice - vwap) * o.volumeBase;
  }

  // ── ExecutionQueue diagnostic ──────────────────────────────────────────
  // Dynamically import to avoid the cycle (queue may import exchange utils).
  let queueStats = { concurrency: 0, processing: 0, depth: 0, completed: 0, failed: 0, avgLatencyMs: 0 };
  try {
    const { executionQueue } = await import("../services/queue/ExecutionQueue.js");
    const s = executionQueue.stats();
    queueStats = {
      // `concurrency` is a private field — read it via a typed structural
      // cast since the queue intentionally doesn't expose it (Phase 2 will
      // swap for BullMQ and the value will move into config). Operator
      // diagnostic only — never used as a gate.
      concurrency:  (executionQueue as unknown as { concurrency: number }).concurrency ?? 0,
      processing:   s.processing,
      depth:        s.depth,
      completed:    s.completed,
      failed:       s.failed,
      avgLatencyMs: s.avgLatencyMs,
    };
  } catch {
    /* queue introspection is best-effort */
  }

  return {
    source,
    exchange:            entryExchange,
    mode:                _mode,
    apiConfigured:       entryApiConfigured,
    liveCapable:         entryLiveCapable,
    balances,
    markPrices,
    totalEquityUSD:      parseFloat(totalEquity.toFixed(2)),
    positions,
    openPositionsCount:  positions.length,
    filledTotal:         filledLifetime.length,
    filledToday,
    lastFillAt:          lastFill?.timestamp ?? null,
    realizedTodayUSD:    parseFloat(realizedToday.toFixed(2)),
    unrealizedTotalUSD:  parseFloat(positions.reduce((s, p) => s + p.unrealizedUSD, 0).toFixed(2)),
    queue:               queueStats,
    ...(error ? { error } : {}),
  };
}

export function setMode(mode: ExchangeMode, exchange?: string): { ok: boolean; reason?: string } {
  if (mode === "live") {
    if (!isLiveEnabled()) return { ok: false, reason: "EXCHANGE_LIVE_ENABLED is not set to 'true'" };
    if (_killSwitch) return { ok: false, reason: "Exchange kill switch is active — disable it first" };

    // Safety net: if caller passed an explicit exchange, honor it; otherwise
    // if the currently-selected exchange is not actually configured (e.g.
    // someone set _selectedExchange to "Alpaca" but only Kraken keys exist),
    // auto-switch to whichever exchange IS configured before going live.
    // Without this, an admin POST /exchange/mode live with default selection
    // would 400 with "Alpaca API credentials are not configured" and the
    // engine would silently stay in simulation.
    const requested = exchange ?? _selectedExchange;
    if (!isExchangeConfigured(requested)) {
      const fallback = pickPreferredExchange();
      if (!isExchangeConfigured(fallback)) {
        return { ok: false, reason: `${requested} API credentials are not configured (no live exchange has credentials)` };
      }
      console.info(`[exchangeEngine] setMode live: ${requested} not configured, auto-switching to ${fallback}`);
      _selectedExchange = fallback;
    } else if (exchange && exchange !== _selectedExchange) {
      _selectedExchange = exchange;
    }
  }
  _mode = mode;
  console.info(`[exchangeEngine] setMode → mode=${_mode} exchange=${_selectedExchange} apiConfigured=${isApiConfigured()}`);
  return { ok: true };
}

export function toggleKillSwitch(): boolean {
  _killSwitch = !_killSwitch;
  return _killSwitch;
}

export function togglePause(): boolean {
  _paused = !_paused;
  return _paused;
}

export function resetSimBalances(): Balances {
  _simBalances = { USD: 100_000, BTC: 0, ETH: 0, SOL: 0 };
  return { ..._simBalances };
}

export function setSelectedExchange(name: string): void {
  const prev = _selectedExchange;
  _selectedExchange = name;
  // Invalidate cached balances + drop any in-flight upstream calls so the
  // next /api/exchange/balances poll cannot serve stale data from the
  // previously-selected exchange. Cheap (Map.clear); see clearBalancesCache.
  if (prev !== name) clearBalancesCache();
}
