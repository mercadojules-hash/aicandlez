import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── PhemexAdapter ─────────────────────────────────────────────────────────────
//
// Phemex REST v1 spot adapter.
// API docs: https://phemex.com/user-guides/api-overview
//
// Required env:
//   PHEMEX_API_KEY
//   PHEMEX_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "sBTCUSDT"   (spot prefix "s" + USDT pair)
//
// Price scaling: Phemex spot prices are NOT scaled (normal floats in v1).

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "sBTCUSDT",  ETHUSD:  "sETHUSDT",  SOLUSD:  "sSOLUSDT",
  XRPUSD:  "sXRPUSDT",  DOGEUSD: "sDOGEUSDT", AVAXUSD: "sAVAXUSDT",
  LINKUSD: "sLINKUSDT", ADAUSD:  "sADAUSDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "4h": 14400, "1d": 86400,
};

export const PHEMEX_CONFIG: AdapterConfig = {
  exchange:    "Phemex",
  apiKey:      process.env["PHEMEX_API_KEY"],
  apiSecret:   process.env["PHEMEX_API_SECRET"],
  takerFeePct: 0.075,
  makerFeePct: 0.025,
  rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 600 },
};

export class PhemexAdapter extends BaseExchangeAdapter {
  // Phemex testnet → testnet-api.phemex.com (verified public sandbox).
  private readonly BASE = this.resolveHost({
    prod:    "api.phemex.com",
    testnet: "testnet-api.phemex.com",
  });

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...PHEMEX_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? `s${s.replace("USD", "USDT")}`; }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace(/^s/, "").replace("USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://phemex.com/ws for market data
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<PhemexTickerResp>(`/md/spot/ticker/24hr?symbol=${pair}`),
      3, 300, "getTicker",
    );
    const t = data.result;
    if (!t) throw new Error(`Phemex: no ticker for ${symbol}`);
    const last = parseFloat(t.close);
    const open = parseFloat(t.open);
    return {
      symbol, exchange: "Phemex",
      bid:       parseFloat(t.bid),
      ask:       parseFloat(t.ask),
      last,
      volume24h: parseFloat(t.baseVolume ?? t.volume ?? "0"),
      change24h: last - open,
      changePct: open > 0 ? ((last - open) / open) * 100 : 0,
      timestamp: Math.floor((t.timestamp ?? Date.now()) / 1e6), // nanoseconds → ms
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const resolution = TF_MAP[timeframe] ?? 300;
    const to       = Math.floor(Date.now() / 1000);
    const from     = to - resolution * limit;
    const data     = await this.withRetry(
      () => this.get<PhemexCandleResp>(`/exchange/spot/candlestick?symbol=${pair}&resolution=${resolution}&from=${from}&to=${to}&limit=${limit}`),
      3, 300, "getCandles",
    );
    return (data.data?.rows ?? []).map(r => ({
      time:   r[0] * 1000,
      open:   parseFloat(r[3]),
      high:   parseFloat(r[4]),
      low:    parseFloat(r[5]),
      close:  parseFloat(r[6]),
      volume: parseFloat(r[7]),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<PhemexBookResp>(`/md/spot/orderbook?symbol=${pair}`),
      3, 300, "getOrderBook",
    );
    const book = data.result?.book ?? { bids: [], asks: [] };
    return {
      symbol, exchange: "Phemex",
      bids: (book.bids ?? []).slice(0, depth).map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
      asks: (book.asks ?? []).slice(0, depth).map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("Phemex");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<PhemexAccountResp>("/spot/wallets"),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const w of (data.data ?? [])) {
      const free   = parseFloat(w.userBalance);
      const locked = parseFloat(w.lockedTradingBalance ?? "0");
      if (free + locked < 0.000001) continue;
      balances[w.currency] = { free: free - locked, locked, total: free };
      if (w.currency === "USDT") usd += free;
    }
    return { exchange: "Phemex", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("Phemex", req, this.normaliseSymbol(req.symbol), this.config);
    const body = JSON.stringify({
      symbol:      this.normaliseSymbol(req.symbol),
      side:        req.side === "buy" ? "Buy" : "Sell",
      orderQty:    req.qty.toFixed(8),
      priceEp:     req.limitPrice ? Math.round(req.limitPrice * 1e8) : undefined,
      ordType:     req.type === "market" ? "Market" : "Limit",
      timeInForce: "GoodTillCancel",
      clOrdID:     req.clientId,
    });
    const data = await this.withRetry(
      () => this.signedPost<PhemexOrderResp>("/spot/orders", body),
      3, 500, "placeOrder",
    );
    void data;
    return simulatedOrder("Phemex", req, this.normaliseSymbol(req.symbol), this.config);
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      const pair = this.normaliseSymbol(req.symbol);
      await this.withRetry(
        () => this.signedDelete(`/spot/orders?symbol=${pair}&orderID=${req.exchangeOrderId}`),
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
        () => this.signedGet<{ data: PhemexOrderInfo }>(`/spot/orders/active?symbol=${pair}&orderID=${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      const o = data.data;
      if (!o) return null;
      const fill = (o.avgPriceEp ?? 0) / 1e8;
      const qty  = parseFloat(o.cumQty ?? "0");
      const hasBroker = o.cumFeeEv != null;
      const fee = hasBroker
        ? {
            amount:   o.cumFeeEv! / 1e8,
            currency: "USDT",
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
        id: o.orderID, exchangeOrderId: o.orderID, exchange: "Phemex",
        symbol, nativeSymbol: pair,
        side:   o.side.toLowerCase() as "buy" | "sell",
        type:   o.ordType.toLowerCase() as "market" | "limit",
        status: o.ordStatus === "Filled" ? "filled" : o.ordStatus === "Canceled" ? "cancelled" : "open",
        requestedQty: parseFloat(o.orderQty ?? "0"), filledQty: qty,
        avgFillPrice: fill, quoteQty: qty * fill,
        fee,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private sign(expiry: number, path: string, qs: string, body: string): string {
    const msg = `${path}${qs}${expiry}${body}`;
    return crypto.createHmac("sha256", this.config.apiSecret!).update(msg).digest("hex");
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Phemex: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const [pathname, qs = ""] = path.split("?") as [string, string | undefined];
    const expiry = Math.floor(Date.now() / 1000) + 60;
    const sig    = this.sign(expiry, pathname, qs, "");
    return new Promise((resolve, reject) => {
      https.get({
        hostname: this.BASE,
        path: qs ? `${pathname}?${qs}` : pathname,
        headers: {
          "x-phemex-access-token":    this.config.apiKey!,
          "x-phemex-request-expiry":  String(expiry),
          "x-phemex-request-signature": sig,
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Phemex: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: string): Promise<T> {
    const expiry = Math.floor(Date.now() / 1000) + 60;
    const sig    = this.sign(expiry, path, "", body);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: {
          "x-phemex-access-token":      this.config.apiKey!,
          "x-phemex-request-expiry":    String(expiry),
          "x-phemex-request-signature": sig,
          "Content-Type":    "application/json",
          "Content-Length":  Buffer.byteLength(body),
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Phemex: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  private signedDelete<T>(path: string): Promise<T> {
    const [pathname, qs = ""] = path.split("?") as [string, string | undefined];
    const expiry = Math.floor(Date.now() / 1000) + 60;
    const sig    = this.sign(expiry, pathname, qs, "");
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE,
        path: qs ? `${pathname}?${qs}` : pathname,
        method: "DELETE",
        headers: {
          "x-phemex-access-token":      this.config.apiKey!,
          "x-phemex-request-expiry":    String(expiry),
          "x-phemex-request-signature": sig,
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Phemex: parse failed")); }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }
}

// ── Phemex API types ──────────────────────────────────────────────────────────
interface PhemexTickerResp {
  result?: { close: string; open: string; bid: string; ask: string; baseVolume?: string; volume?: string; timestamp?: number; };
}
// [timestamp_s, interval, last_close, open, high, low, close, volume, turnover]
type PhemexCandleRow = [number, number, string, string, string, string, string, string, string];
interface PhemexCandleResp { data?: { rows?: PhemexCandleRow[] } }
interface PhemexBookResp   { result?: { book?: { bids?: [string, string][]; asks?: [string, string][] } } }
interface PhemexAccountResp { data?: { currency: string; userBalance: string; lockedTradingBalance?: string }[] }
interface PhemexOrderResp  { data?: { orderID: string } }
interface PhemexOrderInfo  {
  orderID: string; side: string; ordType: string; ordStatus: string;
  orderQty?: string; cumQty?: string; avgPriceEp?: number; cumFeeEv?: number;
}
