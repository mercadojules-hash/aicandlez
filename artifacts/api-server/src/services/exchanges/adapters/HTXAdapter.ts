import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── HTXAdapter (formerly Huobi) ───────────────────────────────────────────────
//
// HTX REST v1 adapter.
// API docs: https://huobiapi.github.io/docs/spot/v1/en/
//
// Required env:
//   HTX_API_KEY
//   HTX_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "btcusdt"   (lowercase)

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "btcusdt",  ETHUSD:  "ethusdt",  SOLUSD:  "solusdt",
  XRPUSD:  "xrpusdt",  DOGEUSD: "dogeusdt", AVAXUSD: "avaxusdt",
  LINKUSD: "linkusdt", ADAUSD:  "adausdt",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1h": "60min", "4h": "4hour", "1d": "1day",
};

export const HTX_CONFIG: AdapterConfig = {
  exchange:    "HTX",
  apiKey:      process.env["HTX_API_KEY"],
  apiSecret:   process.env["HTX_API_SECRET"],
  takerFeePct: 0.20,
  makerFeePct: 0.20,
  rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 600 },
};

export class HTXAdapter extends BaseExchangeAdapter {
  private readonly BASE    = "api.huobi.pro";
  private readonly DOMAIN  = "api.huobi.pro";
  private accountId: string | null = null;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...HTX_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.toLowerCase().replace("usd", "usdt"); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.toUpperCase().replace("USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://api.huobi.pro/ws for market data
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<HTXTickerResp>(`/market/detail/merged?symbol=${pair}`),
      3, 300, "getTicker",
    );
    const t = data.tick;
    if (!t) throw new Error(`HTX: no ticker for ${symbol}`);
    return {
      symbol, exchange: "HTX",
      bid:       t.bid?.[0] ?? 0,
      ask:       t.ask?.[0] ?? 0,
      last:      t.close,
      volume24h: t.vol,
      change24h: t.close - t.open,
      changePct: t.open > 0 ? ((t.close - t.open) / t.open) * 100 : 0,
      timestamp: data.ts,
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const period   = TF_MAP[timeframe] ?? "5min";
    const data     = await this.withRetry(
      () => this.get<HTXCandleResp>(`/market/history/kline?symbol=${pair}&period=${period}&size=${limit}`),
      3, 300, "getCandles",
    );
    return (data.data ?? []).reverse().map(r => ({
      time:   r.id * 1000,
      open:   r.open,
      high:   r.high,
      low:    r.low,
      close:  r.close,
      volume: r.vol,
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<HTXDepthResp>(`/market/depth?symbol=${pair}&type=step0&depth=${depth}`),
      3, 300, "getOrderBook",
    );
    const tick = data.tick ?? { bids: [], asks: [] };
    return {
      symbol, exchange: "HTX",
      bids: (tick.bids ?? []).map(b => ({ price: b[0], qty: b[1] })),
      asks: (tick.asks ?? []).map(a => ({ price: a[0], qty: a[1] })),
      timestamp: data.ts ?? Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("HTX");
    this.checkRequestRateLimit();
    const id = await this.ensureAccountId();
    const data = await this.withRetry(
      () => this.signedGet<HTXBalanceResp>(`/v1/account/accounts/${id}/balance`),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const b of (data.data?.list ?? [])) {
      if (b.type === "trade") {
        const prev = balances[b.currency.toUpperCase()] ?? { free: 0, locked: 0, total: 0 };
        const val  = parseFloat(b.balance);
        balances[b.currency.toUpperCase()] = { free: val, locked: prev.locked, total: val + prev.locked };
        if (b.currency === "usdt") usd += val;
      } else if (b.type === "frozen") {
        const asset = b.currency.toUpperCase();
        const val   = parseFloat(b.balance);
        const prev  = balances[asset] ?? { free: 0, locked: 0, total: 0 };
        balances[asset] = { ...prev, locked: val, total: prev.free + val };
      }
    }
    return { exchange: "HTX", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("HTX", req, this.normaliseSymbol(req.symbol), this.config);
    const id = await this.ensureAccountId();
    const body = JSON.stringify({
      "account-id": id,
      symbol:       this.normaliseSymbol(req.symbol),
      type:         `${req.side}-${req.type === "market" ? "market" : "limit"}`,
      amount:       req.qty.toFixed(8),
      price:        req.limitPrice?.toFixed(8),
      source:       "api",
    });
    const data = await this.withRetry(
      () => this.signedPost<{ status: string; data: string }>("/v1/order/orders/place", body),
      3, 500, "placeOrder",
    );
    void data;
    return simulatedOrder("HTX", req, this.normaliseSymbol(req.symbol), this.config);
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      await this.withRetry(
        () => this.signedPost<unknown>(`/v1/order/orders/${req.exchangeOrderId}/submitcancel`, "{}"),
        2, 300, "cancelOrder",
      );
      return { ok: true };
    } catch (err) { return { ok: false, reason: (err as Error).message }; }
  }

  async getOrder(exchangeOrderId: string, _symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const data = await this.withRetry(
        () => this.signedGet<{ data: HTXOrderInfo }>(`/v1/order/orders/${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      const o = data.data;
      if (!o) return null;
      const sym    = this.denormaliseSymbol(o.symbol);
      const fill   = parseFloat(o["field-cash-amount"] ?? "0") / (parseFloat(o["field-amount"] ?? "1") || 1);
      const filled = parseFloat(o["field-amount"] ?? "0");
      return {
        id: String(o.id), exchangeOrderId: String(o.id), exchange: "HTX",
        symbol: sym, nativeSymbol: o.symbol,
        side:   (o.type.includes("buy") ? "buy" : "sell") as "buy" | "sell",
        type:   (o.type.includes("market") ? "market" : "limit") as "market" | "limit",
        status: o.state === "filled" ? "filled" : o.state === "canceled" ? "cancelled" : "open",
        requestedQty: parseFloat(o.amount ?? "0"), filledQty: filled,
        avgFillPrice: fill, quoteQty: filled * fill,
        fee: { amount: parseFloat(o["field-fees"] ?? "0"), currency: "USDT", ratePct: this.config.takerFeePct },
        createdAt: o["created-at"] ?? Date.now(), updatedAt: Date.now(),
      };
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private async ensureAccountId(): Promise<string> {
    if (this.accountId) return this.accountId;
    const data = await this.signedGet<{ data: { id: number; type: string }[] }>("/v1/account/accounts");
    const spot = (data.data ?? []).find(a => a.type === "spot");
    this.accountId = String(spot?.id ?? "0");
    return this.accountId;
  }

  private buildSignedQuery(method: string, path: string, params: Record<string, string> = {}): string {
    const ts = new Date().toISOString().replace(/\..+/, "");
    const allParams: Record<string, string> = {
      AccessKeyId:      this.config.apiKey!,
      SignatureMethod:  "HmacSHA256",
      SignatureVersion: "2",
      Timestamp:        ts,
      ...params,
    };
    const sortedQs = Object.keys(allParams).sort()
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k]!)}`)
      .join("&");
    const msg = `${method}\n${this.DOMAIN}\n${path}\n${sortedQs}`;
    const sig = crypto.createHmac("sha256", this.config.apiSecret!).update(msg).digest("base64");
    return `${sortedQs}&Signature=${encodeURIComponent(sig)}`;
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("HTX: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const qs = this.buildSignedQuery("GET", path);
    return this.get<T>(`${path}?${qs}`);
  }

  private signedPost<T>(path: string, body: string): Promise<T> {
    const qs = this.buildSignedQuery("POST", path);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path: `${path}?${qs}`, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("HTX: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

// ── HTX API types ─────────────────────────────────────────────────────────────
interface HTXTickerResp {
  ts: number;
  tick?: { bid?: [number, number]; ask?: [number, number]; close: number; open: number; vol: number; };
}
interface HTXCandleResp { data?: { id: number; open: number; high: number; low: number; close: number; vol: number }[] }
interface HTXDepthResp  { ts?: number; tick?: { bids?: [number, number][]; asks?: [number, number][] } }
interface HTXBalanceResp { data?: { list?: { currency: string; type: string; balance: string }[] } }
interface HTXOrderInfo  {
  id: number; symbol: string; type: string; state: string; amount?: string;
  "field-amount"?: string; "field-cash-amount"?: string; "field-fees"?: string;
  "created-at"?: number;
}
