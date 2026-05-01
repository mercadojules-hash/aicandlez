import crypto from "node:crypto";
import https from "node:https";
import { validateTrade, getStatus as getRiskStatus } from "./riskEngine.js";

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

let _mode:        ExchangeMode = "simulation";
let _killSwitch:  boolean      = false;
let _paused:      boolean      = false;
const _orders:    ExchangeOrder[] = [];

let _simBalances: Balances = {
  USD: 100_000,
  BTC: 0,
  ETH: 0,
  SOL: 0,
};

// ── Env helpers ──────────────────────────────────────────────────────────────

function isApiConfigured(): boolean {
  return !!(process.env["KRAKEN_API_KEY"] && process.env["KRAKEN_API_SECRET"]);
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

export function getExchangeStatus(): ExchangeStatus {
  const today    = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today).getTime();
  const ordersToday = _orders.filter((o) => o.timestamp >= startOfDay && o.status === "filled").length;
  const lastOrder   = _orders.find((o) => o.status === "filled");

  return {
    mode:         _mode,
    killSwitch:   _killSwitch,
    paused:       _paused,
    liveCapable:  isLiveCapable(),
    apiConfigured: isApiConfigured(),
    liveEnabled:  isLiveEnabled(),
    ordersToday,
    lastOrderAt:  lastOrder?.timestamp ?? null,
    simBalances:  { ..._simBalances },
  };
}

export function getOrders(limit = 50): ExchangeOrder[] {
  return _orders.slice(0, limit);
}

export function setMode(mode: ExchangeMode): { ok: boolean; reason?: string } {
  if (mode === "live") {
    if (!isLiveEnabled())    return { ok: false, reason: "EXCHANGE_LIVE_ENABLED is not set to 'true'" };
    if (!isApiConfigured())  return { ok: false, reason: "KRAKEN_API_KEY or KRAKEN_API_SECRET not configured" };
    if (_killSwitch)         return { ok: false, reason: "Exchange kill switch is active — disable it first" };
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
