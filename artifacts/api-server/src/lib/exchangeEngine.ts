import crypto from "node:crypto";
import https from "node:https";
import { validateTrade, getStatus as getRiskStatus } from "./riskEngine.js";
import { CoinbaseAdapter } from "../services/exchanges/adapters/CoinbaseAdapter.js";
import { AlpacaAdapter }  from "../services/exchanges/adapters/AlpacaAdapter.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type ExchangeMode  = "simulation" | "live";
export type OrderSide     = "buy" | "sell";
export type OrderType     = "market" | "limit";
export type OrderStatus   = "filled" | "rejected" | "cancelled" | "open";

export interface ExchangeOrder {
  id:            string;
  symbol:        string;            // e.g. "BTCUSD"
  krakenPair:    string;            // e.g. "XXBTZUSD"
  side:          OrderSide;
  orderType:     OrderType;
  volumeBase:    number;            // in base currency (BTC / ETH / SOL)
  limitPrice?:   number;
  fillPrice:     number;
  valueUSD:      number;
  feeUSD:        number;
  status:        OrderStatus;
  mode:          ExchangeMode;
  timestamp:     number;
  krakenOrderId?: string;
  riskChecks:    RiskGate[];
  rejectionReason?: string;
}

export interface RiskGate {
  name:   string;
  passed: boolean;
  detail: string;
}

export interface OrderPreview {
  symbol:       string;
  krakenPair:   string;
  side:         OrderSide;
  orderType:    OrderType;
  volumeBase:   number;
  estimatedFill: number;
  valueUSD:     number;
  feeUSD:       number;
  riskGates:    RiskGate[];
  allowed:      boolean;
  blockedBy:    string[];
}

export interface ExchangeStatus {
  mode:              ExchangeMode;
  killSwitch:        boolean;
  paused:            boolean;
  liveCapable:       boolean;       // env vars present AND EXCHANGE_LIVE_ENABLED=true
  apiConfigured:     boolean;       // KRAKEN_API_KEY + KRAKEN_API_SECRET both set
  liveEnabled:       boolean;       // EXCHANGE_LIVE_ENABLED=true
  ordersToday:       number;
  lastOrderAt:       number | null;
  simBalances:       Balances;
  exchangeName:      string;        // selected exchange display name
}

export interface Balances {
  USD: number;
  BTC: number;
  ETH: number;
  SOL: number;
}

// ── Kraken pair config ───────────────────────────────────────────────────────

const KRAKEN_PAIRS: Record<string, string> = {
  BTCUSD: "XXBTZUSD",
  ETHUSD: "XETHZUSD",
  SOLUSD: "SOLUSD",
};
const TAKER_FEE = 0.0026; // 0.26% Kraken taker fee

// ── Singleton state ──────────────────────────────────────────────────────────

let _mode:             ExchangeMode = "simulation";
let _killSwitch:       boolean      = false;
let _paused:           boolean      = false;
let _selectedExchange: string       = "Kraken";
const _orders:         ExchangeOrder[] = [];

// Per-exchange simulated portfolio snapshots
const EXCHANGE_BALANCES: Record<string, Balances> = {
  Kraken:       { USD: 100_000, BTC: 0,    ETH: 0,    SOL: 0    },
  Binance:      { USD: 84_350,  BTC: 0.42, ETH: 3.10, SOL: 22.5 },
  Coinbase:     { USD: 62_100,  BTC: 0.18, ETH: 1.50, SOL: 8.0  },
  CryptoDotCom: { USD: 48_900,  BTC: 0.22, ETH: 1.80, SOL: 14.0 },
  OKX:          { USD: 41_200,  BTC: 0.08, ETH: 0.90, SOL: 5.2  },
  Bybit:        { USD: 28_750,  BTC: 0.05, ETH: 0.30, SOL: 2.1  },
  Bitfinex:     { USD: 15_000,  BTC: 0.02, ETH: 0.12, SOL: 0    },
  "Gate.io":    { USD: 22_500,  BTC: 0.04, ETH: 0.25, SOL: 1.8  },
  KuCoin:       { USD: 11_000,  BTC: 0.01, ETH: 0.08, SOL: 0.5  },
  Huobi:        { USD:  8_400,  BTC: 0,    ETH: 0.05, SOL: 0    },
  MEXC:         { USD:  5_100,  BTC: 0,    ETH: 0.02, SOL: 0    },
  Phemex:       { USD:  3_200,  BTC: 0,    ETH: 0,    SOL: 0    },
  Uphold:       { USD: 18_750,  BTC: 0.03, ETH: 0.22, SOL: 1.4  },
  Alpaca:       { USD: 100_000, BTC: 0,    ETH: 0,    SOL: 0    },
};

let _simBalances: Balances = { ...EXCHANGE_BALANCES["Kraken"]! };

// ── Env helpers ──────────────────────────────────────────────────────────────

/** Per-exchange credential check — normalises common ID variants */
function isExchangeConfigured(exchange: string): boolean {
  const ex = exchange.toLowerCase().replace(/[\s._-]/g, "");
  if (ex === "kraken")                         return !!(process.env["KRAKEN_API_KEY"]    && process.env["KRAKEN_API_SECRET"]);
  if (ex === "binance" || ex === "binanceus")  return !!(process.env["BINANCE_API_KEY"]   && process.env["BINANCE_API_SECRET"]);
  if (ex === "coinbase")                       return !!(process.env["COINBASE_API_KEY"]  && process.env["COINBASE_API_SECRET"]);
  if (ex === "cryptocom" || ex === "cryptocomdotcom" || ex === "cryptodotcom") {
    return !!(process.env["CRYPTOCOM_API_KEY"] && process.env["CRYPTOCOM_API_SECRET"]);
  }
  if (ex === "alpaca") return !!(process.env["ALPACA_API_KEY"] && process.env["ALPACA_SECRET_KEY"]);
  return false;
}

/** Returns list of exchange IDs that have API credentials configured */
export function getConfiguredExchanges(): string[] {
  return (["Kraken", "Binance", "Coinbase", "CryptoDotCom", "Alpaca"] as const)
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

// ── Kraken private API ───────────────────────────────────────────────────────

function krakenSign(path: string, postData: string, nonce: string, secret: string): string {
  const sha256Hash = crypto.createHash("sha256").update(nonce + postData).digest();
  return crypto
    .createHmac("sha512", Buffer.from(secret, "base64"))
    .update(Buffer.concat([Buffer.from(path), sha256Hash]))
    .digest("base64");
}

async function krakenPrivate<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const key    = process.env["KRAKEN_API_KEY"]!;
  const secret = process.env["KRAKEN_API_SECRET"]!;
  const nonce  = Date.now().toString();
  const path   = `/0/private/${endpoint}`;

  const body = new URLSearchParams({ nonce, ...params }).toString();
  const sign = krakenSign(path, body, nonce, secret);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.kraken.com",
        path,
        method:  "POST",
        headers: {
          "API-Key":      key,
          "API-Sign":     sign,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as { error: string[]; result: T };
            if (parsed.error?.length) {
              reject(new Error(parsed.error.join(", ")));
            } else {
              resolve(parsed.result);
            }
          } catch {
            reject(new Error("Failed to parse Kraken response"));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Live balances ────────────────────────────────────────────────────────────

export async function fetchLiveBalances(): Promise<Balances> {
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

  // Default: Kraken
  if (!isApiConfigured()) throw new Error("Kraken API keys not configured");
  const raw = await krakenPrivate<Record<string, string>>("Balance");
  return {
    USD: parseFloat(raw["ZUSD"] ?? raw["USD"] ?? "0"),
    BTC: parseFloat(raw["XXBT"] ?? raw["XBT"] ?? "0"),
    ETH: parseFloat(raw["XETH"] ?? raw["ETH"] ?? "0"),
    SOL: parseFloat(raw["SOL"]  ?? "0"),
  };
}

// ── Price estimate (use last Kraken ticker) ──────────────────────────────────

async function estimatePrice(symbol: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const pair = KRAKEN_PAIRS[symbol];
    if (!pair) return reject(new Error(`Unknown symbol: ${symbol}`));

    https.get(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data) as { result: Record<string, { c: string[] }> };
          const entry = Object.values(json.result)[0];
          resolve(parseFloat(entry.c[0]));
        } catch {
          reject(new Error("Ticker parse failed"));
        }
      });
    }).on("error", reject);
  });
}

// ── Risk gates ───────────────────────────────────────────────────────────────

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

// ── Order ID ─────────────────────────────────────────────────────────────────

let _orderSeq = 1;
function nextOrderId(): string {
  return `EX-${Date.now()}-${String(_orderSeq++).padStart(4, "0")}`;
}

// ── Simulation helpers ───────────────────────────────────────────────────────

function baseAsset(symbol: string): keyof Balances {
  if (symbol === "BTCUSD") return "BTC";
  if (symbol === "ETHUSD") return "ETH";
  if (symbol === "SOLUSD") return "SOL";
  throw new Error(`Unknown symbol: ${symbol}`);
}

function applySimBalance(order: ExchangeOrder) {
  const asset = baseAsset(order.symbol);
  if (order.side === "buy") {
    _simBalances.USD  = Math.max(0, _simBalances.USD - order.valueUSD - order.feeUSD);
    _simBalances[asset] = (_simBalances[asset] ?? 0) + order.volumeBase;
  } else {
    _simBalances[asset] = Math.max(0, (_simBalances[asset] ?? 0) - order.volumeBase);
    _simBalances.USD  += order.valueUSD - order.feeUSD;
  }
}

// ── Preview ──────────────────────────────────────────────────────────────────

export async function previewOrder(
  symbol:    string,
  side:      OrderSide,
  orderType: OrderType,
  amountUSD: number,
  limitPrice?: number,
): Promise<OrderPreview> {
  const krakenPair    = KRAKEN_PAIRS[symbol];
  if (!krakenPair) throw new Error(`Unsupported symbol: ${symbol}`);

  const fillPrice     = orderType === "limit" && limitPrice ? limitPrice : await estimatePrice(symbol);
  const volumeBase    = amountUSD / fillPrice;
  const valueUSD      = volumeBase * fillPrice;
  const feeUSD        = valueUSD * TAKER_FEE;

  const { gates, allowed, blockedBy } = buildRiskGates(valueUSD);

  return {
    symbol, krakenPair, side, orderType, volumeBase,
    estimatedFill: fillPrice,
    valueUSD:      parseFloat(valueUSD.toFixed(2)),
    feeUSD:        parseFloat(feeUSD.toFixed(4)),
    riskGates:     gates,
    allowed,
    blockedBy,
  };
}

// ── Execute ──────────────────────────────────────────────────────────────────

export async function executeOrder(
  symbol:    string,
  side:      OrderSide,
  orderType: OrderType,
  amountUSD: number,
  limitPrice?: number,
): Promise<ExchangeOrder> {
  const krakenPair = KRAKEN_PAIRS[symbol];
  if (!krakenPair) throw new Error(`Unsupported symbol: ${symbol}`);

  const fillPrice  = orderType === "limit" && limitPrice ? limitPrice : await estimatePrice(symbol);
  const volumeBase = amountUSD / fillPrice;
  const valueUSD   = volumeBase * fillPrice;
  const feeUSD     = valueUSD * TAKER_FEE;

  const { gates, allowed, blockedBy } = buildRiskGates(valueUSD);

  const order: ExchangeOrder = {
    id:         nextOrderId(),
    symbol,
    krakenPair,
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

  // ── LIVE execution via Kraken ─────────────────────────────────────────────
  const params: Record<string, string> = {
    pair:      krakenPair,
    type:      side,
    ordertype: orderType === "market" ? "market" : "limit",
    volume:    volumeBase.toFixed(8),
  };
  if (orderType === "limit" && limitPrice) {
    params["price"] = limitPrice.toFixed(2);
  }

  const result = await krakenPrivate<{ txid: string[]; descr: { order: string } }>("AddOrder", params);
  order.krakenOrderId = result.txid?.[0];
  order.status        = "open";   // market orders typically fill immediately; limit stays open
  if (orderType === "market") order.status = "filled";

  _orders.unshift(order);
  return order;
}

// ── Public getters / setters ─────────────────────────────────────────────────

export function getExchangeStatus(): ExchangeStatus & { configuredExchanges: string[] } {
  const today    = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today).getTime();
  const ordersToday = _orders.filter((o) => o.timestamp >= startOfDay && o.status === "filled").length;
  const lastOrder   = _orders.find((o) => o.status === "filled");

  return {
    mode:                 _mode,
    killSwitch:           _killSwitch,
    paused:               _paused,
    liveCapable:          isLiveCapable(),
    apiConfigured:        isApiConfigured(),
    liveEnabled:          isLiveEnabled(),
    ordersToday,
    lastOrderAt:          lastOrder?.timestamp ?? null,
    simBalances:          { ..._simBalances },
    exchangeName:         _selectedExchange,
    configuredExchanges:  getConfiguredExchanges(),
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
  // Switch to this exchange's simulated portfolio snapshot
  const snap = EXCHANGE_BALANCES[name];
  if (snap) _simBalances = { ...snap };
}
