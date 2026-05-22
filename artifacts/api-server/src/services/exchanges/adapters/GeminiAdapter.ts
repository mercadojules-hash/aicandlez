import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── GeminiAdapter ─────────────────────────────────────────────────────────────
//
// Gemini REST v1/v2 adapter.
// API docs: https://docs.gemini.com/
//
// Required env:
//   GEMINI_API_KEY
//   GEMINI_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "BTCUSD"   (Gemini uses the same convention)

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTCUSD",  ETHUSD:  "ETHUSD",  SOLUSD:  "SOLUSDT",
  XRPUSD:  "XRPUSD",  DOGEUSD: "DOGEUSD", AVAXUSD: "AVAXUSD",
  LINKUSD: "LINKUSD", ADAUSD:  "ADAUSD",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1hr", "4h": "6hr", "1d": "1day",
};

export const GEMINI_CONFIG: AdapterConfig = {
  exchange:    "Gemini",
  apiKey:      process.env["GEMINI_API_KEY"],
  apiSecret:   process.env["GEMINI_API_SECRET"],
  takerFeePct: 0.35,
  makerFeePct: 0.20,
  rateLimit:   { ordersPerSecond: 5, requestsPerMinute: 300 },
};

export class GeminiAdapter extends BaseExchangeAdapter {
  private readonly BASE = "api.gemini.com";
  private nonce = Date.now();

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...GEMINI_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s; }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s; }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://api.gemini.com/v1/marketdata/<symbol>
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<GeminiTicker>(`/v1/pubticker/${pair.toLowerCase()}`),
      3, 300, "getTicker",
    );
    const last = parseFloat(data.last);
    return {
      symbol, exchange: "Gemini",
      bid:       parseFloat(data.bid),
      ask:       parseFloat(data.ask),
      last,
      volume24h: parseFloat(String(data.volume?.USD ?? data.volume?.BTC ?? "0")),
      change24h: 0,
      changePct: 0,
      timestamp: typeof data.volume?.timestamp === "number" ? data.volume.timestamp : Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const interval = TF_MAP[timeframe] ?? "5m";
    const data     = await this.withRetry(
      () => this.get<GeminiCandle[]>(`/v2/candles/${pair.toLowerCase()}/${interval}`),
      3, 300, "getCandles",
    );
    return data.slice(-limit).map(r => ({
      time:   r[0],
      open:   r[1],
      high:   r[2],
      low:    r[3],
      close:  r[4],
      volume: r[5],
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<{ bids: GeminiLevel[]; asks: GeminiLevel[] }>(`/v1/book/${pair.toLowerCase()}?limit_bids=${depth}&limit_asks=${depth}`),
      3, 300, "getOrderBook",
    );
    return {
      symbol, exchange: "Gemini",
      bids: data.bids.map(b => ({ price: parseFloat(b.price), qty: parseFloat(b.amount) })),
      asks: data.asks.map(a => ({ price: parseFloat(a.price), qty: parseFloat(a.amount) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("Gemini");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedPost<GeminiBalance[]>("/v1/balances", {}),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const b of data) {
      const free   = parseFloat(b.available);
      const total  = parseFloat(b.amount);
      const locked = Math.max(0, total - free);
      if (total < 0.000001) continue;
      balances[b.currency] = { free, locked, total };
      if (b.currency === "USD") usd += total;
    }
    return { exchange: "Gemini", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("Gemini", req, this.normaliseSymbol(req.symbol), this.config);
    const pair = this.normaliseSymbol(req.symbol);
    const data = await this.withRetry(
      () => this.signedPost<GeminiOrder>("/v1/order/new", {
        symbol:   pair.toLowerCase(),
        amount:   req.qty.toFixed(8),
        price:    (req.limitPrice ?? 0).toFixed(2),
        side:     req.side,
        type:     req.type === "market" ? "exchange market" : "exchange limit",
        client_order_id: req.clientId,
      }),
      3, 500, "placeOrder",
    );
    return this.normaliseOrder(data, req.symbol, pair);
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      await this.withRetry(
        () => this.signedPost("/v1/order/cancel", { order_id: parseInt(req.exchangeOrderId) }),
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
        () => this.signedPost<GeminiOrder>("/v1/order/status", { order_id: parseInt(exchangeOrderId) }),
        3, 300, "getOrder",
      );
      return this.normaliseOrder(data, symbol, pair);
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private buildPayload(endpoint: string, params: Record<string, unknown>): string {
    const nonce = String(++this.nonce);
    return Buffer.from(JSON.stringify({ request: endpoint, nonce, ...params })).toString("base64");
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Gemini: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, params: Record<string, unknown>): Promise<T> {
    const payload = this.buildPayload(path, params);
    const sig     = crypto.createHmac("sha384", this.config.apiSecret!).update(payload).digest("hex");
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: {
          "Content-Type":       "text/plain",
          "Content-Length":     0,
          "X-GEMINI-APIKEY":    this.config.apiKey!,
          "X-GEMINI-PAYLOAD":   payload,
          "X-GEMINI-SIGNATURE": sig,
          "Cache-Control":      "no-cache",
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Gemini: parse failed")); }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  private normaliseOrder(o: GeminiOrder, symbol: string, nativeSym: string): StandardOrder {
    const fill = parseFloat(o.avg_execution_price ?? "0");
    const qty  = parseFloat(o.executed_amount ?? "0");
    return {
      id: String(o.order_id), exchangeOrderId: String(o.order_id), exchange: "Gemini",
      symbol, nativeSymbol: nativeSym,
      side:   o.side as "buy" | "sell",
      type:   o.type.includes("market") ? "market" : "limit",
      status: o.is_live ? "open" : o.is_cancelled ? "cancelled" : "filled",
      requestedQty: parseFloat(o.original_amount ?? "0"), filledQty: qty,
      avgFillPrice: fill, quoteQty: qty * fill,
      fee: { amount: (qty * fill) * this.config.takerFeePct / 100, currency: "USD", ratePct: this.config.takerFeePct, source: "estimate" },
      createdAt: o.timestampms ?? Date.now(), updatedAt: Date.now(),
    };
  }
}

// ── Gemini API types ──────────────────────────────────────────────────────────
interface GeminiTicker { bid: string; ask: string; last: string; volume?: Record<string, unknown>; }
type GeminiCandle = [number, number, number, number, number, number];
interface GeminiLevel  { price: string; amount: string; }
interface GeminiBalance { currency: string; amount: string; available: string; }
interface GeminiOrder  {
  order_id: number; side: string; type: string; is_live: boolean; is_cancelled: boolean;
  original_amount?: string; executed_amount?: string; avg_execution_price?: string; timestampms?: number;
}
