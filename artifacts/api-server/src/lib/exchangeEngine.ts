import { validateTrade, getStatus as getRiskStatus } from "./riskEngine.js";
import { getTicker }      from "./marketData.js";
import { CoinbaseAdapter } from "../services/exchanges/adapters/CoinbaseAdapter.js";
import { AlpacaAdapter, ALPACA_CONFIG }   from "../services/exchanges/adapters/AlpacaAdapter.js";
import { KrakenAdapter, KRAKEN_CONFIG }   from "../services/exchanges/adapters/KrakenAdapter.js";
import { BinanceAdapter, BINANCE_CONFIG } from "../services/exchanges/adapters/BinanceAdapter.js";
import { CryptoDotComAdapter, CRYPTOCOM_CONFIG } from "../services/exchanges/adapters/CryptoDotComAdapter.js";
import type { BaseExchangeAdapter } from "../services/exchanges/BaseExchangeAdapter.js";

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

// Boot-time selection. Runs once at module load. Logging is via console.info
// (this module is shared between Express request paths and worker code, so
// we don't have `req.log` here — the singleton logger from `lib/logger.ts`
// would create a circular import. Replit's workflow log captures stdout.)
_selectedExchange = pickPreferredExchange();
console.info(
  `[exchangeEngine] boot: selectedExchange=${_selectedExchange} ` +
  `liveEnabled=${process.env["EXCHANGE_LIVE_ENABLED"] === "true"} ` +
  `configured=[${getConfiguredExchanges().join(",") || "none"}] ` +
  `apiConfigured=${isExchangeConfigured(_selectedExchange)}`,
);

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
  console.info(`[exchangeEngine] fetchLiveBalances: selectedExchange=${_selectedExchange}`);
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
      console.info(`[exchangeEngine] Kraken account OK: USD=${usd} BTC=${btc} ETH=${eth} SOL=${sol}`);
      return { USD: usd, BTC: btc, ETH: eth, SOL: sol };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[exchangeEngine] Kraken getAccount FAILED: ${msg}`);
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

export async function placeLiveAutoOrder(req: {
  symbol:  string;
  side:    "BUY" | "SELL";
  sizeUSD: number;
}): Promise<LiveAutoOrderResult> {
  if (_mode !== "live") return { success: false, error: "Exchange engine not in live mode" };
  if (_killSwitch)      return { success: false, error: "Exchange kill switch is active" };
  if (_paused)          return { success: false, error: "Exchange is paused" };
  if (!isLiveCapable()) return { success: false, error: "Live mode not configured (missing API credentials or EXCHANGE_LIVE_ENABLED!=true)" };

  let adapter: BaseExchangeAdapter;
  try {
    adapter = getLiveAdapter(_selectedExchange);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Fetch live price for qty conversion. The adapter is also responsible
  // for symbol normalisation — we pass the engine-native symbol ("BTCUSD").
  let referencePrice: number;
  try {
    const ticker = await getTicker(req.symbol);
    referencePrice = ticker.price;
  } catch (err) {
    return { success: false, error: `Failed to fetch reference price for ${req.symbol}: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!(referencePrice > 0)) return { success: false, error: `Invalid reference price (${referencePrice}) for ${req.symbol}` };

  const quoteSide: "buy" | "sell" = req.side === "BUY" ? "buy" : "sell";
  const qtyBase = parseFloat((req.sizeUSD / referencePrice).toFixed(8));
  if (qtyBase <= 0) return { success: false, error: "Computed base quantity is zero" };

  try {
    const order = await adapter.placeOrder({
      symbol:   req.symbol,
      side:     quoteSide,
      type:     "market",
      qty:      qtyBase,
      clientId: `loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    const fill = order.avgFillPrice > 0 ? order.avgFillPrice : referencePrice;
    return {
      success:         true,
      exchange:        _selectedExchange,
      exchangeOrderId: order.exchangeOrderId || order.id,
      fillPrice:       parseFloat(fill.toFixed(2)),
      quantity:        order.filledQty > 0 ? order.filledQty : qtyBase,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
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
  _selectedExchange = name;
}
