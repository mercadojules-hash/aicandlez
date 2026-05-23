import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── BingXAdapter ──────────────────────────────────────────────────────────────
//
// BingX REST v1 spot adapter.
// API docs: https://bingx-api.github.io/docs/
//
// Required env:
//   BINGX_API_KEY
//   BINGX_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "BTC-USDT"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC-USDT",  ETHUSD:  "ETH-USDT",  SOLUSD:  "SOL-USDT",
  XRPUSD:  "XRP-USDT",  DOGEUSD: "DOGE-USDT", AVAXUSD: "AVAX-USDT",
  LINKUSD: "LINK-USDT", ADAUSD:  "ADA-USDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1d",
};

export const BINGX_CONFIG: AdapterConfig = {
  exchange:    "BingX",
  apiKey:      process.env["BINGX_API_KEY"],
  apiSecret:   process.env["BINGX_API_SECRET"],
  takerFeePct: 0.10,
  makerFeePct: 0.10,
  rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 600 },
};

export class BingXAdapter extends BaseExchangeAdapter {
  // BingX has no public sandbox we can target — testnet must fail loudly.
  private readonly BASE = this.resolveHost({
    prod:    "open-api.bingx.com",
    testnet: null,
  });
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...BINGX_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.replace("USD", "-USDT"); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("-USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://open-api.bingx.com/market for live data
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<BingXResp<BingXTicker>>(`/openApi/spot/v1/ticker/24hr?symbol=${pair}`),
      3, 300, "getTicker",
    );
    const t = data.data;
    if (!t) throw new Error(`BingX: no ticker for ${symbol}`);
    const last = parseFloat(t.lastPrice);
    const open = parseFloat(t.openPrice ?? t.lastPrice);
    return {
      symbol, exchange: "BingX",
      bid:       parseFloat(t.bidPrice ?? String(last * 0.9998)),
      ask:       parseFloat(t.askPrice ?? String(last * 1.0002)),
      last,
      volume24h: parseFloat(t.volume),
      change24h: last - open,
      changePct: parseFloat(t.priceChangePercent ?? "0"),
      timestamp: t.closeTime ?? Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const interval = TF_MAP[timeframe] ?? "5m";
    const data     = await this.withRetry(
      () => this.get<BingXResp<BingXKline[]>>(`/openApi/spot/v2/market/kline?symbol=${pair}&interval=${interval}&limit=${limit}`),
      3, 300, "getCandles",
    );
    return (data.data ?? []).map(r => ({
      time:   r.time,
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
      () => this.get<BingXResp<{ bids: string[][]; asks: string[][] }>>(`/openApi/spot/v1/market/depth?symbol=${pair}&depth=${depth}`),
      3, 300, "getOrderBook",
    );
    const book = data.data ?? { bids: [], asks: [] };
    return {
      symbol, exchange: "BingX",
      bids: book.bids.map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: book.asks.map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("BingX");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<BingXResp<{ balances: BingXBalance[] }>>("/openApi/spot/v1/account/balance"),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const b of (data.data?.balances ?? [])) {
      const free   = parseFloat(b.free);
      const locked = parseFloat(b.locked);
      if (free + locked < 0.000001) continue;
      balances[b.asset] = { free, locked, total: free + locked };
      if (b.asset === "USDT") usd += free + locked;
    }
    return { exchange: "BingX", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("BingX", req, this.normaliseSymbol(req.symbol), this.config);
    const params: Record<string, string> = {
      symbol:   this.normaliseSymbol(req.symbol),
      side:     req.side.toUpperCase(),
      type:     req.type === "market" ? "MARKET" : "LIMIT",
      quantity: req.qty.toFixed(8),
    };
    if (req.limitPrice) params["price"] = req.limitPrice.toFixed(8);
    if (req.clientId)   params["newClientOrderId"] = req.clientId;
    const data = await this.withRetry(
      () => this.signedPost<BingXResp<{ orderId: string }>>("/openApi/spot/v1/trade/order", params),
      3, 500, "placeOrder",
    );
    void data;
    return simulatedOrder("BingX", req, this.normaliseSymbol(req.symbol), this.config);
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      const pair = this.normaliseSymbol(req.symbol);
      await this.withRetry(
        () => this.signedDelete(`/openApi/spot/v1/trade/cancel?symbol=${pair}&orderId=${req.exchangeOrderId}`),
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
        () => this.signedGet<BingXResp<BingXOrderInfo>>(`/openApi/spot/v1/trade/query?symbol=${pair}&orderId=${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      const o = data.data;
      if (!o) return null;
      const fill = parseFloat(o.price ?? "0");
      const qty  = parseFloat(o.executedQty ?? "0");
      const hasBroker = o.fee != null && o.fee !== "";
      const fee = hasBroker
        ? {
            amount:   parseFloat(o.fee!),
            currency: o.feeAsset ?? "USDT",
            ratePct:  this.config.takerFeePct,
            source:   "broker" as const,
          }
        : {
            amount:   (qty * fill) * this.config.takerFeePct / 100,
            currency: "USDT",
            ratePct:  this.config.takerFeePct,
            source:   "estimate" as const,
          };
      return {
        id: String(o.orderId), exchangeOrderId: String(o.orderId), exchange: "BingX",
        symbol, nativeSymbol: pair,
        side:   o.side.toLowerCase() as "buy" | "sell",
        type:   o.type.toLowerCase() as "market" | "limit",
        status: o.status === "FILLED" ? "filled" : o.status === "CANCELED" ? "cancelled" : "open",
        requestedQty: parseFloat(o.origQty ?? "0"), filledQty: qty,
        avgFillPrice: fill, quoteQty: qty * fill,
        fee,
        createdAt: o.time ?? Date.now(), updatedAt: o.updateTime ?? Date.now(),
      };
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private sign(queryString: string): string {
    return crypto.createHmac("sha256", this.config.apiSecret!).update(queryString).digest("hex");
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("BingX: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const ts     = Date.now();
    const [pathname, qs = ""] = path.split("?") as [string, string | undefined];
    const query  = `${qs}&timestamp=${ts}`;
    const sig    = this.sign(query);
    return new Promise((resolve, reject) => {
      https.get({
        hostname: this.BASE,
        path:     `${pathname}?${query}&signature=${sig}`,
        headers:  { "X-BX-APIKEY": this.config.apiKey! },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("BingX: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, params: Record<string, string>): Promise<T> {
    const ts    = Date.now();
    const body  = new URLSearchParams({ ...params, timestamp: String(ts) }).toString();
    const sig   = this.sign(body);
    const full  = `${body}&signature=${sig}`;
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: {
          "X-BX-APIKEY":   this.config.apiKey!,
          "Content-Type":  "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(full),
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("BingX: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(full);
      req.end();
    });
  }

  private signedDelete<T>(path: string): Promise<T> {
    const [pathname, qs = ""] = path.split("?") as [string, string | undefined];
    const ts    = Date.now();
    const query = `${qs}&timestamp=${ts}`;
    const sig   = this.sign(query);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE,
        path:     `${pathname}?${query}&signature=${sig}`,
        method:   "DELETE",
        headers:  { "X-BX-APIKEY": this.config.apiKey! },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("BingX: parse failed")); }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }
}

// ── BingX API types ───────────────────────────────────────────────────────────
interface BingXResp<T>  { code: number; msg?: string; data?: T; }
interface BingXTicker   {
  symbol: string; lastPrice: string; bidPrice?: string; askPrice?: string;
  volume: string; openPrice?: string; priceChangePercent?: string; closeTime?: number;
}
interface BingXKline    { time: number; open: string; high: string; low: string; close: string; volume: string; }
interface BingXBalance  { asset: string; free: string; locked: string; }
interface BingXOrderInfo {
  orderId: number; side: string; type: string; status: string;
  origQty?: string; executedQty?: string; price?: string; time?: number; updateTime?: number;
  fee?: string; feeAsset?: string;
}
