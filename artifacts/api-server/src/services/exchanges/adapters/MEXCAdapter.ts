import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── MEXCAdapter ───────────────────────────────────────────────────────────────
//
// MEXC REST v3 adapter (Binance-compatible API).
// API docs: https://mexcdevelop.github.io/apidocs/spot_v3_en/
//
// Required env:
//   MEXC_API_KEY
//   MEXC_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "BTCUSDT"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTCUSDT",  ETHUSD:  "ETHUSDT",  SOLUSD:  "SOLUSDT",
  XRPUSD:  "XRPUSDT",  DOGEUSD: "DOGEUSDT", AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT", ADAUSD:  "ADAUSDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "60m", "4h": "4h", "1d": "1d",
};

export const MEXC_CONFIG: AdapterConfig = {
  exchange:    "MEXC",
  apiKey:      process.env["MEXC_API_KEY"],
  apiSecret:   process.env["MEXC_API_SECRET"],
  takerFeePct: 0.10,
  makerFeePct: 0.10,
  rateLimit:   { ordersPerSecond: 20, requestsPerMinute: 1200 },
};

export class MEXCAdapter extends BaseExchangeAdapter {
  private readonly BASE = "api.mexc.com";
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...MEXC_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.replace("USD", "USDT"); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://wbs.mexc.com/ws for live streams
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<MEXCTicker>(`/api/v3/ticker/24hr?symbol=${pair}`),
      3, 300, "getTicker",
    );
    return {
      symbol, exchange: "MEXC",
      bid:       parseFloat(data.bidPrice),
      ask:       parseFloat(data.askPrice),
      last:      parseFloat(data.lastPrice),
      volume24h: parseFloat(data.volume),
      change24h: parseFloat(data.priceChange),
      changePct: parseFloat(data.priceChangePercent),
      timestamp: data.closeTime,
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const interval = TF_MAP[timeframe] ?? "5m";
    const rows     = await this.withRetry(
      () => this.get<MEXCKline[]>(`/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`),
      3, 300, "getCandles",
    );
    return rows.map(r => ({
      time:   r[0] as number,
      open:   parseFloat(r[1] as string),
      high:   parseFloat(r[2] as string),
      low:    parseFloat(r[3] as string),
      close:  parseFloat(r[4] as string),
      volume: parseFloat(r[5] as string),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<{ bids: string[][]; asks: string[][] }>(`/api/v3/depth?symbol=${pair}&limit=${depth}`),
      3, 300, "getOrderBook",
    );
    return {
      symbol, exchange: "MEXC",
      bids: data.bids.map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: data.asks.map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("MEXC");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<MEXCAccount>("/api/v3/account"),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const b of data.balances) {
      const free   = parseFloat(b.free);
      const locked = parseFloat(b.locked);
      if (free + locked < 0.000001) continue;
      balances[b.asset] = { free, locked, total: free + locked };
      if (b.asset === "USDT") usd += free + locked;
    }
    return { exchange: "MEXC", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("MEXC", req, this.normaliseSymbol(req.symbol), this.config);
    const params: Record<string, string> = {
      symbol:           this.normaliseSymbol(req.symbol),
      side:             req.side.toUpperCase(),
      type:             req.type === "market" ? "MARKET" : "LIMIT",
      quantity:         req.qty.toFixed(8),
      newOrderRespType: "FULL",
    };
    if (req.limitPrice) { params["price"] = req.limitPrice.toFixed(8); params["timeInForce"] = "GTC"; }
    if (req.clientId) params["newClientOrderId"] = req.clientId;
    const data = await this.withRetry(
      () => this.signedPost<MEXCOrderResp>("/api/v3/order", params),
      3, 500, "placeOrder",
    );
    const fill = parseFloat(data.price ?? "0");
    const qty  = parseFloat(data.executedQty ?? String(req.qty));
    return {
      id: String(data.orderId), exchangeOrderId: String(data.orderId), exchange: "MEXC",
      symbol: req.symbol, nativeSymbol: data.symbol,
      side: req.side, type: req.type,
      status: data.status === "FILLED" ? "filled" : "open",
      requestedQty: req.qty, filledQty: qty,
      avgFillPrice: fill, quoteQty: qty * fill,
      fee: this.feeFromFills(data.fills, qty * fill),
      createdAt: data.transactTime ?? Date.now(),
      updatedAt: data.transactTime ?? Date.now(),
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      const pair = this.normaliseSymbol(req.symbol);
      await this.withRetry(
        () => this.signedDelete(`/api/v3/order?symbol=${pair}&orderId=${req.exchangeOrderId}`),
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
        () => this.signedGet<MEXCOrderResp>(`/api/v3/order?symbol=${pair}&orderId=${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      const fill = parseFloat(data.price ?? "0");
      const qty  = parseFloat(data.executedQty ?? "0");
      return {
        id: String(data.orderId), exchangeOrderId: String(data.orderId), exchange: "MEXC",
        symbol, nativeSymbol: data.symbol,
        side: (data.side?.toLowerCase() ?? "buy") as "buy" | "sell",
        type: (data.type?.toLowerCase() ?? "market") as "market" | "limit",
        status: data.status === "FILLED" ? "filled" : data.status === "CANCELED" ? "cancelled" : "open",
        requestedQty: parseFloat(data.origQty ?? "0"), filledQty: qty,
        avgFillPrice: fill, quoteQty: qty * fill,
        fee: this.feeFromFills(data.fills, qty * fill),
        createdAt: data.transactTime ?? Date.now(), updatedAt: data.transactTime ?? Date.now(),
      };
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  /**
   * Sum broker-reported commissions across `fills[]` (MEXC v3 FULL response).
   * Falls back to a catalog-rate estimate when the broker did not report any.
   */
  private feeFromFills(
    fills: MEXCFill[] | undefined,
    notional: number,
  ): StandardOrder["fee"] {
    if (fills && fills.length > 0 && fills.some(f => f.commission != null)) {
      const total = fills.reduce((s, f) => s + parseFloat(f.commission ?? "0"), 0);
      const currency = fills.find(f => f.commissionAsset)?.commissionAsset ?? "USDT";
      return { amount: total, currency, ratePct: this.config.takerFeePct, source: "broker" };
    }
    return {
      amount:   notional * this.config.takerFeePct / 100,
      currency: "USDT",
      ratePct:  this.config.takerFeePct,
      source:   "estimate",
    };
  }

  private sign(query: string): string {
    return crypto.createHmac("sha256", this.config.apiSecret!).update(query).digest("hex");
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({
        hostname: this.BASE, path,
        headers: { "X-MEXC-APIKEY": this.config.apiKey ?? "" },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("MEXC: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const ts    = Date.now();
    const query = `timestamp=${ts}`;
    const sig   = this.sign(query);
    return this.get<T>(`${path}?${query}&signature=${sig}`);
  }

  private signedPost<T>(path: string, params: Record<string, string>): Promise<T> {
    const ts   = Date.now();
    const body = new URLSearchParams({ ...params, timestamp: String(ts) }).toString();
    const sig  = this.sign(body);
    const full = `${body}&signature=${sig}`;
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: {
          "X-MEXC-APIKEY": this.config.apiKey!,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(full),
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("MEXC: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(full);
      req.end();
    });
  }

  private signedDelete<T>(path: string): Promise<T> {
    const ts    = Date.now();
    const [pathname, qs = ""] = path.split("?") as [string, string | undefined];
    const query = `${qs}&timestamp=${ts}`;
    const sig   = this.sign(query);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE,
        path: `${pathname}?${query}&signature=${sig}`,
        method: "DELETE",
        headers: { "X-MEXC-APIKEY": this.config.apiKey! },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("MEXC: parse failed")); }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }
}

// ── MEXC API types ────────────────────────────────────────────────────────────
interface MEXCTicker {
  symbol: string; lastPrice: string; bidPrice: string; askPrice: string;
  volume: string; priceChange: string; priceChangePercent: string; closeTime: number;
}
type MEXCKline = [number, string, string, string, string, string, ...unknown[]];
interface MEXCAccount { balances: { asset: string; free: string; locked: string }[]; }
interface MEXCFill { price?: string; qty?: string; commission?: string; commissionAsset?: string; }
interface MEXCOrderResp {
  orderId: number; symbol: string; status: string; side?: string; type?: string;
  price?: string; origQty?: string; executedQty?: string; transactTime?: number;
  fills?: MEXCFill[];
}
