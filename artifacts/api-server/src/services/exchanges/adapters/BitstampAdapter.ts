import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── BitstampAdapter ───────────────────────────────────────────────────────────
//
// Bitstamp REST v2 adapter.
// API docs: https://www.bitstamp.net/api/
//
// Required env:
//   BITSTAMP_API_KEY
//   BITSTAMP_API_SECRET
//   BITSTAMP_CUSTOMER_ID  (username/customer ID for auth)
//
// Symbol normalisation:
//   "BTCUSD" → "btcusd"   (lowercase)

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "btcusd",  ETHUSD:  "ethusd",  SOLUSD:  "solusd",
  XRPUSD:  "xrpusd",  DOGEUSD: "dogeusd", AVAXUSD: "avaxusd",
  LINKUSD: "linkusd", ADAUSD:  "adausd",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

export const BITSTAMP_CONFIG: AdapterConfig = {
  exchange:    "Bitstamp",
  apiKey:      process.env["BITSTAMP_API_KEY"],
  apiSecret:   process.env["BITSTAMP_API_SECRET"],
  takerFeePct: 0.50,
  makerFeePct: 0.50,
  rateLimit:   { ordersPerSecond: 8, requestsPerMinute: 400 },
};

export class BitstampAdapter extends BaseExchangeAdapter {
  private readonly BASE = "www.bitstamp.net";
  private nonce = Date.now();

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...BITSTAMP_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.toLowerCase(); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.toUpperCase(); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://ws.bitstamp.net
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<BitstampTicker>(`/api/v2/ticker/${pair}/`),
      3, 300, "getTicker",
    );
    const last = parseFloat(data.last);
    const open = parseFloat(data.open);
    return {
      symbol, exchange: "Bitstamp",
      bid:       parseFloat(data.bid),
      ask:       parseFloat(data.ask),
      last,
      volume24h: parseFloat(data.volume),
      change24h: last - open,
      changePct: open > 0 ? ((last - open) / open) * 100 : 0,
      timestamp: parseInt(data.timestamp) * 1000,
    };
  }

  async getCandles(symbol: string, _timeframe: string, limit: number): Promise<StandardCandle[]> {
    // Bitstamp OHLC endpoint
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const step = 300; // 5 minutes in seconds
    const data = await this.withRetry(
      () => this.get<BitstampOHLCResp>(`/api/v2/ohlc/${pair}/?step=${step}&limit=${limit}`),
      3, 300, "getCandles",
    );
    return (data.data?.ohlc ?? []).map(r => ({
      time:   parseInt(r.timestamp) * 1000,
      open:   parseFloat(r.open),
      high:   parseFloat(r.high),
      low:    parseFloat(r.low),
      close:  parseFloat(r.close),
      volume: parseFloat(r.volume),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<{ bids: string[][]; asks: string[][] }>(`/api/v2/order_book/${pair}/`),
      3, 300, "getOrderBook",
    );
    return {
      symbol, exchange: "Bitstamp",
      bids: data.bids.slice(0, depth).map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: data.asks.slice(0, depth).map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("Bitstamp");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedPost<Record<string, string>>("/api/v2/balance/", {}),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    const assets = new Set<string>();
    for (const key of Object.keys(data)) {
      const match = key.match(/^([a-z]+)_available$/);
      if (match?.[1]) assets.add(match[1]);
    }
    for (const asset of assets) {
      const free   = parseFloat(data[`${asset}_available`] ?? "0");
      const locked = parseFloat(data[`${asset}_reserved`]  ?? "0");
      const total  = parseFloat(data[`${asset}_balance`]   ?? "0");
      if (total < 0.000001) continue;
      balances[asset.toUpperCase()] = { free, locked, total };
      if (asset === "usd") usd += total;
    }
    return { exchange: "Bitstamp", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("Bitstamp", req, this.normaliseSymbol(req.symbol), this.config);
    const pair   = this.normaliseSymbol(req.symbol);
    const path   = `/api/v2/${req.type === "market" ? `${req.side}/${pair}` : `${req.side}/${pair}`}/`;
    const params: Record<string, string> = { amount: req.qty.toFixed(8) };
    if (req.type === "limit" && req.limitPrice) params["price"] = req.limitPrice.toFixed(2);
    const data = await this.withRetry(
      () => this.signedPost<BitstampOrder>(path, params),
      3, 500, "placeOrder",
    );
    return this.normaliseOrder(data, req.symbol, pair);
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      await this.withRetry(
        () => this.signedPost("/api/v2/cancel_order/", { id: req.exchangeOrderId }),
        2, 300, "cancelOrder",
      );
      return { ok: true };
    } catch (err) { return { ok: false, reason: (err as Error).message }; }
  }

  async getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const pair = this.normaliseSymbol(symbol);
      const data = await this.withRetry(
        () => this.signedPost<BitstampOrder>("/api/v2/order_status/", { id: exchangeOrderId }),
        3, 300, "getOrder",
      );
      return this.normaliseOrder(data, symbol, pair);
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Bitstamp: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, params: Record<string, string>): Promise<T> {
    const nonce = String(this.nonce++);
    const msg   = `${nonce}${this.config.apiKey}${this.config.apiSecret}`;
    // Bitstamp v2 auth: HMAC-SHA256 of nonce+API-key+API-secret (legacy approach)
    // For v2 OAuth-based keys, signature format changed — using legacy here for compatibility
    const sig   = crypto.createHmac("sha256", this.config.apiSecret!).update(msg).digest("hex").toUpperCase();
    const body  = new URLSearchParams({
      key: this.config.apiKey!, signature: sig, nonce, ...params,
    }).toString();
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: {
          "Content-Type":   "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Bitstamp: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  private normaliseOrder(o: BitstampOrder, symbol: string, nativeSym: string): StandardOrder {
    const fill = parseFloat(o.price ?? "0");
    const qty  = parseFloat(o.amount ?? "0");
    const side = o.type === 0 ? "buy" : "sell";
    return {
      id: String(o.id), exchangeOrderId: String(o.id), exchange: "Bitstamp",
      symbol, nativeSymbol: nativeSym,
      side, type: "limit",
      status: o.status === "Finished" ? "filled" : o.status === "Canceled" ? "cancelled" : "open",
      requestedQty: qty, filledQty: qty,
      avgFillPrice: fill, quoteQty: qty * fill,
      fee: { amount: (qty * fill) * this.config.takerFeePct / 100, currency: "USD", ratePct: this.config.takerFeePct, source: "estimate" },
      createdAt: o.datetime ? new Date(o.datetime).getTime() : Date.now(), updatedAt: Date.now(),
    };
  }
}

// ── Bitstamp API types ────────────────────────────────────────────────────────
interface BitstampTicker { last: string; bid: string; ask: string; volume: string; open: string; timestamp: string; }
interface BitstampOHLCResp { data?: { ohlc?: { timestamp: string; open: string; high: string; low: string; close: string; volume: string }[] } }
interface BitstampOrder { id: number | string; type: number; price?: string; amount?: string; status?: string; datetime?: string; }
