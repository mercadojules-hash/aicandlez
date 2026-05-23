import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── CryptoDotComAdapter ───────────────────────────────────────────────────────
//
// Crypto.com Exchange REST v2 adapter.
// API docs: https://exchange-docs.crypto.com/exchange/v1/rest-ws/index.html
//
// Required env:
//   CRYPTOCOM_API_KEY
//   CRYPTOCOM_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "BTC_USDT"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC_USDT", ETHUSD:  "ETH_USDT", SOLUSD:  "SOL_USDT",
  XRPUSD:  "XRP_USDT", DOGEUSD: "DOGE_USDT", AVAXUSD: "AVAX_USDT",
  LINKUSD: "LINK_USDT", ADAUSD: "ADA_USDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1D",
};

export const CRYPTOCOM_CONFIG: AdapterConfig = {
  exchange:    "CryptoDotCom",
  apiKey:      process.env["CRYPTOCOM_API_KEY"],
  apiSecret:   process.env["CRYPTOCOM_API_SECRET"],
  takerFeePct: 0.075,
  makerFeePct: 0.075,
  rateLimit:   { ordersPerSecond: 15, requestsPerMinute: 900 },
};

export class CryptoDotComAdapter extends BaseExchangeAdapter {
  // Crypto.com Exchange publishes a UAT REST sandbox at uat-api.3ona.co.
  // Used by the weekly broker-fee drift smoke (see
  // `__tests__/adapterFeeParsingTestnet.test.ts`).
  private readonly BASE = this.resolveHost({
    prod:    "api.crypto.com",
    testnet: "uat-api.3ona.co",
  });
  private readonly VER  = "/v2";
  private id = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...CRYPTOCOM_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.replace("USD", "_USDT"); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("_USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://stream.crypto.com/v2/market
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.publicGet<CDCTickerResp>(`${this.VER}/public/get-ticker?instrument_name=${pair}`),
      3, 300, "getTicker",
    );
    const t = data.result?.data;
    if (!t) throw new Error(`Crypto.com: no ticker for ${symbol}`);
    const last = parseFloat(t.a ?? t.k);
    const bid  = parseFloat(t.b);
    const ask  = parseFloat(t.k);
    const h24  = parseFloat(t.h);
    const l24  = parseFloat(t.l);
    return {
      symbol, exchange: "CryptoDotCom",
      bid, ask, last,
      volume24h: parseFloat(t.v ?? "0"),
      change24h: last - (h24 + l24) / 2,
      changePct: parseFloat(t.c ?? "0"),
      timestamp: t.t ?? Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const interval = TF_MAP[timeframe] ?? "5m";
    const data     = await this.withRetry(
      () => this.publicGet<CDCCandleResp>(`${this.VER}/public/get-candlestick?instrument_name=${pair}&timeframe=${interval}&count=${limit}`),
      3, 300, "getCandles",
    );
    return (data.result?.data ?? []).map((r: CDCCandle) => ({
      time:   r.t,
      open:   parseFloat(r.o),
      high:   parseFloat(r.h),
      low:    parseFloat(r.l),
      close:  parseFloat(r.c),
      volume: parseFloat(r.v),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.publicGet<CDCBookResp>(`${this.VER}/public/get-book?instrument_name=${pair}&depth=${depth}`),
      3, 300, "getOrderBook",
    );
    const book = data.result?.data?.[0] ?? { bids: [], asks: [] };
    return {
      symbol, exchange: "CryptoDotCom",
      bids: (book.bids ?? []).map((b: [string, string, string]) => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
      asks: (book.asks ?? []).map((a: [string, string, string]) => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("CryptoDotCom");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.privatePost<CDCAccountResp>("/v2/private/get-account-summary", {}),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const a of (data.result?.accounts ?? [])) {
      const free   = a.available;
      const locked = a.order;
      if (free + locked < 0.000001) continue;
      balances[a.currency] = { free, locked, total: a.balance };
      if (a.currency === "USDT" || a.currency === "USD") usd += a.balance;
    }
    return { exchange: "CryptoDotCom", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("CryptoDotCom", req, this.normaliseSymbol(req.symbol), this.config);
    const data = await this.withRetry(
      () => this.privatePost<CDCOrderResp>("/v2/private/create-order", {
        instrument_name: this.normaliseSymbol(req.symbol),
        side:            req.side.toUpperCase(),
        type:            req.type === "market" ? "MARKET" : "LIMIT",
        quantity:        req.qty,
        price:           req.limitPrice,
        client_oid:      req.clientId,
      }),
      3, 500, "placeOrder",
    );
    // Preserve the real exchange order id so the weekly drift suite can
    // round-trip place → getOrder and resolve a broker-sourced fee.
    const orderId = data.result?.order_id;
    if (orderId == null) {
      return simulatedOrder("CryptoDotCom", req, this.normaliseSymbol(req.symbol), this.config);
    }
    const queried = await this.getOrder(String(orderId), req.symbol);
    if (queried) return queried;
    const fallback = simulatedOrder("CryptoDotCom", req, this.normaliseSymbol(req.symbol), this.config);
    fallback.id              = String(orderId);
    fallback.exchangeOrderId = String(orderId);
    return fallback;
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      await this.withRetry(
        () => this.privatePost("/v2/private/cancel-order", {
          instrument_name: this.normaliseSymbol(req.symbol),
          order_id:        parseInt(req.exchangeOrderId),
        }),
        2, 300, "cancelOrder",
      );
      return { ok: true };
    } catch (err) { return { ok: false, reason: (err as Error).message }; }
  }

  async getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const data = await this.withRetry(
        () => this.privatePost<{ result: { order_info: CDCOrderInfo } }>("/v2/private/get-order-detail", { order_id: parseInt(exchangeOrderId) }),
        3, 300, "getOrder",
      );
      const o = data.result?.order_info;
      if (!o) return null;
      return {
        id: String(o.order_id), exchangeOrderId: String(o.order_id), exchange: "CryptoDotCom",
        symbol, nativeSymbol: o.instrument_name,
        side:   o.side.toLowerCase() as "buy" | "sell",
        type:   o.type.toLowerCase() as "market" | "limit",
        status: o.status === "FILLED" ? "filled" : o.status === "CANCELED" ? "cancelled" : "open",
        requestedQty: o.quantity, filledQty: o.cumulative_quantity,
        avgFillPrice: o.avg_price ?? 0, quoteQty: o.cumulative_value ?? 0,
        fee: o.fee_currency_amount !== undefined && o.fee_currency_amount !== null
          ? { amount: o.fee_currency_amount, currency: o.fee_currency ?? "USDT", ratePct: this.config.takerFeePct, source: "broker" }
          : { amount: this.computeFee(o.cumulative_value ?? 0, true), currency: "USDT", ratePct: this.config.takerFeePct, source: "estimate" },
        createdAt: o.create_time, updatedAt: o.update_time,
      };
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private publicGet<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as { code: number; result?: T } & T;
            if ((parsed as { code: number }).code !== 0) reject(new Error(`Crypto.com: code ${(parsed as { code: number }).code}`));
            else resolve(parsed);
          }
          catch { reject(new Error("Crypto.com: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private privatePost<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id    = this.id++;
    const nonce = Date.now();
    const paramStr = Object.keys(params).sort().map(k => `${k}${params[k]}`).join("");
    const sigParts = `${method}${id}${this.config.apiKey}${paramStr}${nonce}`;
    const sig = crypto.createHmac("sha256", this.config.apiSecret!).update(sigParts).digest("hex");
    const body = JSON.stringify({ id, method, nonce, api_key: this.config.apiKey, params, sig });
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path: method, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Crypto.com: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

// ── Crypto.com API types ──────────────────────────────────────────────────────
interface CDCTickerResp { result?: { data?: { a?: string; b: string; k: string; h: string; l: string; v?: string; c?: string; t?: number } } }
interface CDCCandleResp { result?: { data?: CDCCandle[] } }
interface CDCCandle     { t: number; o: string; h: string; l: string; c: string; v: string; }
interface CDCBookResp   { result?: { data?: { bids: [string, string, string][]; asks: [string, string, string][] }[] } }
interface CDCAccountResp { result?: { accounts: { currency: string; balance: number; available: number; order: number }[] } }
interface CDCOrderResp  { result?: { order_id: number } }
interface CDCOrderInfo  {
  order_id: number; instrument_name: string; side: string; type: string; status: string;
  quantity: number; cumulative_quantity: number; avg_price?: number; cumulative_value?: number;
  fee_currency_amount?: number; fee_currency?: string; create_time: number; update_time: number;
}
