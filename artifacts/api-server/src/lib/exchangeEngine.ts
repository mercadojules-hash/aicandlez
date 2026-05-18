import { validateTrade, getStatus as getRiskStatus } from "./riskEngine.js";
import { getTicker }      from "./marketData.js";
import { CoinbaseAdapter } from "../services/exchanges/adapters/CoinbaseAdapter.js";
import { AlpacaAdapter }   from "../services/exchanges/adapters/AlpacaAdapter.js";

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
let _selectedExchange: string       = "Alpaca";
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
    const account = await adapter.getAccount();
    return {
      USD: account.balances["USD"]?.total ?? 0,
      BTC: account.balances["BTC"]?.total ?? 0,
      ETH: account.balances["ETH"]?.total ?? 0,
      SOL: account.balances["SOL"]?.total ?? 0,
    };
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

  // ── LIVE execution via Alpaca ──────────────────────────────────────────────
  const liveAdapter = new AlpacaAdapter();
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

  _orders.unshift(order);
  return order;
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
    const ex = exchange ?? _selectedExchange;
    if (!isExchangeConfigured(ex)) return { ok: false, reason: `${ex} API credentials are not configured` };
    if (_killSwitch) return { ok: false, reason: "Exchange kill switch is active — disable it first" };
  }
  _mode = mode;
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
