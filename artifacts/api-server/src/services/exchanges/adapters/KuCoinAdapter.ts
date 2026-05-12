import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── KuCoinAdapter ─────────────────────────────────────────────────────────────
//
// KuCoin REST v2/v3 adapter.
// API docs: https://docs.kucoin.com/
//
// Required env:
//   KUCOIN_API_KEY
//   KUCOIN_API_SECRET
//   KUCOIN_PASSPHRASE
//
// Symbol normalisation:
//   "BTCUSD" → "BTC-USDT"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD: "BTC-USDT", ETHUSD: "ETH-USDT", SOLUSD: "SOL-USDT",
  XRPUSD: "XRP-USDT", DOGEUSD: "DOGE-USDT", AVAXUSD: "AVAX-USDT",
  LINKUSD: "LINK-USDT", ADAUSD: "ADA-USDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1h": "1hour", "4h": "4hour", "1d": "1day",
};

export const KUCOIN_CONFIG: AdapterConfig = {
  exchange:    "KuCoin",
  apiKey:      process.env["KUCOIN_API_KEY"],
  apiSecret:   process.env["KUCOIN_API_SECRET"],
  passphrase:  process.env["KUCOIN_PASSPHRASE"],
  takerFeePct: 0.10,
  makerFeePct: 0.10,
  rateLimit:   { ordersPerSecond: 5, requestsPerMinute: 300 },
};

export class KuCoinAdapter extends BaseExchangeAdapter {
  private readonly BASE = "api.kucoin.com";
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...KUCOIN_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string   { return SYMBOL_MAP[s] ?? s; }
  denormaliseSymbol(s: string): string  { return REVERSE_MAP[s] ?? s.replace("-USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: fetch WS token via POST /api/v1/bullet-public,
    // then connect to wss://ws-api.kucoin.com
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<KCResp<KCTicker>>(`/api/v1/market/orderbook/level1?symbol=${pair}`),
      3, 300, "getTicker",
    );
    const t = data.data;
    const last = parseFloat(t.price);
    return {
      symbol, exchange: "KuCoin",
      bid: parseFloat(t.bestBid), ask: parseFloat(t.bestAsk), last,
      volume24h: parseFloat(t.size),
      change24h: 0, changePct: 0,
      timestamp: t.time,
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair  = this.normaliseSymbol(symbol);
    const tf    = TF_MAP[timeframe] ?? "15min";
    const endAt = Math.floor(Date.now() / 1000);
    const data  = await this.withRetry(
      () => this.get<KCResp<string[][]>>(
        `/api/v1/market/candles?type=${tf}&symbol=${pair}&endAt=${endAt}&startAt=${endAt - 60 * limit * 60}`
      ),
      3, 300, "getCandles",
    );
    return (data.data ?? []).reverse().slice(-limit).map(r => ({
      time:   parseInt(r[0]!) * 1000,
      open:   parseFloat(r[1]!),
      close:  parseFloat(r[2]!),
      high:   parseFloat(r[3]!),
      low:    parseFloat(r[4]!),
      volume: parseFloat(r[5]!),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<KCResp<{ bids: string[][]; asks: string[][] }>>(
        `/api/v1/market/orderbook/level2_${depth}?symbol=${pair}`
      ),
      3, 300, "getOrderBook",
    );
    const book = data.data;
    return {
      symbol, exchange: "KuCoin",
      bids: (book?.bids ?? []).map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: (book?.asks ?? []).map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("KuCoin");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<KCResp<Array<{ currency: string; available: string; holds: string; type: string }>>>(
        "/api/v1/accounts?type=trade"
      ),
      3, 500, "getAccount",
    );
    const balances: StandardAccount["balances"] = {};
    let usd = 0;
    for (const a of data.data ?? []) {
      const free   = parseFloat(a.available);
      const locked = parseFloat(a.holds);
      balances[a.currency] = { free, locked, total: free + locked };
      if (a.currency === "USDT") usd += free + locked;
    }
    return { exchange: "KuCoin", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("KuCoin", req, this.normaliseSymbol(req.symbol), this.config);

    const clientOid = req.clientId ?? `KC-${Date.now()}-${this.orderSeq++}`;
    const body: Record<string, string> = {
      clientOid,
      symbol: this.normaliseSymbol(req.symbol),
      side:   req.side,
      type:   req.type === "market" ? "market" : "limit",
    };
    if (req.type === "market") {
      body["funds"] = (req.qty * (req.limitPrice ?? 1)).toFixed(2);
    } else {
      body["size"]  = req.qty.toFixed(8);
      body["price"] = req.limitPrice!.toFixed(8);
    }

    const data = await this.withRetry(
      () => this.signedPost<KCResp<{ orderId: string }>>("/api/v1/orders", body),
      3, 500, "placeOrder",
    );

    const fill = req.limitPrice ?? 0;
    const fee  = this.computeFee(req.qty * fill, true);
    return {
      id: clientOid, exchangeOrderId: data.data?.orderId ?? clientOid,
      exchange: "KuCoin", symbol: req.symbol, nativeSymbol: this.normaliseSymbol(req.symbol),
      side: req.side, type: req.type, status: req.type === "market" ? "filled" : "open",
      requestedQty: req.qty, filledQty: req.type === "market" ? req.qty : 0,
      requestedPrice: req.limitPrice, avgFillPrice: fill, quoteQty: req.qty * fill,
      fee: { amount: fee, currency: "USDT", ratePct: this.config.takerFeePct },
      createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      await this.signedDelete(`/api/v1/orders/${req.exchangeOrderId}`);
      return { ok: true };
    } catch (err) { return { ok: false, reason: (err as Error).message }; }
  }

  async getOrder(exchangeOrderId: string, _symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const data = await this.withRetry(
        () => this.signedGet<KCResp<KCOrder>>(`/api/v1/orders/${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      const raw = data.data;
      if (!raw) return null;
      const fill = parseFloat(raw.dealFunds ?? "0") / Math.max(parseFloat(raw.dealSize ?? "1"), 0.00001);
      const qty  = parseFloat(raw.dealSize ?? "0");
      return {
        id: raw.clientOid ?? exchangeOrderId, exchangeOrderId: raw.id,
        exchange: "KuCoin", symbol: this.denormaliseSymbol(raw.symbol), nativeSymbol: raw.symbol,
        side: raw.side as "buy" | "sell", type: raw.type as "market" | "limit",
        status: raw.isActive ? "open" : "filled",
        requestedQty: parseFloat(raw.size ?? "0"), filledQty: qty, avgFillPrice: fill, quoteQty: qty * fill,
        fee: { amount: parseFloat(raw.fee ?? "0"), currency: "USDT", ratePct: this.config.takerFeePct },
        createdAt: raw.createdAt, updatedAt: Date.now(),
      };
    } catch { return null; }
  }

  private isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret && this.config.passphrase);
  }

  private sign(ts: string, method: string, path: string, body = ""): string {
    return crypto.createHmac("sha256", this.config.apiSecret!).update(ts + method + path + body).digest("base64");
  }

  private signPassphrase(): string {
    return crypto.createHmac("sha256", this.config.apiSecret!).update(this.config.passphrase!).digest("base64");
  }

  private authHeaders(method: string, path: string, body = ""): Record<string, string> {
    const ts = Date.now().toString();
    return {
      "KC-API-KEY":         this.config.apiKey!,
      "KC-API-SIGN":        this.sign(ts, method, path, body),
      "KC-API-TIMESTAMP":   ts,
      "KC-API-PASSPHRASE":  this.signPassphrase(),
      "KC-API-KEY-VERSION": "2",
      "Content-Type":       "application/json",
    };
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => { try { resolve(JSON.parse(d) as T); } catch { reject(new Error("parse")); } });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const headers = this.authHeaders("GET", path);
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => { try { resolve(JSON.parse(d) as T); } catch { reject(new Error("parse")); } });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: Record<string, string>): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const headers = { ...this.authHeaders("POST", path, bodyStr), "Content-Length": String(Buffer.byteLength(bodyStr)) };
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: this.BASE, path, method: "POST", headers }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => { try { resolve(JSON.parse(d) as T); } catch { reject(new Error("parse")); } });
      });
      req.on("error", reject);
      req.write(bodyStr);
      req.end();
    });
  }

  private signedDelete<T>(path: string): Promise<T> {
    const headers = this.authHeaders("DELETE", path);
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: this.BASE, path, method: "DELETE", headers }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => { try { resolve(JSON.parse(d) as T); } catch { reject(new Error("parse")); } });
      });
      req.on("error", reject);
      req.end();
    });
  }
}

interface KCResp<T> { code: string; data: T }
interface KCTicker { price: string; bestBid: string; bestAsk: string; size: string; time: number }
interface KCOrder { id: string; clientOid: string; symbol: string; side: string; type: string; size: string; dealSize: string; dealFunds: string; fee: string; isActive: boolean; createdAt: number }
