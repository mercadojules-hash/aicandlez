import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── BitgetAdapter ─────────────────────────────────────────────────────────────
//
// Bitget REST v2 adapter.
// API docs: https://www.bitget.com/api-doc/spot/intro
//
// Required env:
//   BITGET_API_KEY
//   BITGET_API_SECRET
//   BITGET_PASSPHRASE   (required)
//
// Symbol normalisation:
//   "BTCUSD" → "BTCUSDT"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTCUSDT",  ETHUSD:  "ETHUSDT",  SOLUSD:  "SOLUSDT",
  XRPUSD:  "XRPUSDT",  DOGEUSD: "DOGEUSDT", AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT", ADAUSD:  "ADAUSDT",  BNBUSD:  "BNBUSDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1h": "1h", "4h": "4h", "1d": "1day",
};

export const BITGET_CONFIG: AdapterConfig = {
  exchange:    "Bitget",
  apiKey:      process.env["BITGET_API_KEY"],
  apiSecret:   process.env["BITGET_API_SECRET"],
  passphrase:  process.env["BITGET_PASSPHRASE"],
  takerFeePct: 0.10,
  makerFeePct: 0.10,
  rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 600 },
};

export class BitgetAdapter extends BaseExchangeAdapter {
  private readonly BASE = "api.bitget.com";
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...BITGET_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.replace("USD", "USDT"); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://ws.bitget.com/v2/ws/public
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<BitgetResp<BitgetTicker[]>>(`/api/v2/spot/market/tickers?symbol=${pair}`),
      3, 300, "getTicker",
    );
    const t = data.data?.[0];
    if (!t) throw new Error(`Bitget: no ticker for ${symbol}`);
    const last = parseFloat(t.lastPr);
    const open = parseFloat(t.open24h ?? t.lastPr);
    return {
      symbol, exchange: "Bitget",
      bid: parseFloat(t.bidPr), ask: parseFloat(t.askPr), last,
      volume24h: parseFloat(t.baseVolume),
      change24h: last - open,
      changePct: open > 0 ? ((last - open) / open) * 100 : 0,
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const interval = TF_MAP[timeframe] ?? "5min";
    const data     = await this.withRetry(
      () => this.get<BitgetResp<string[][]>>(`/api/v2/spot/market/candles?symbol=${pair}&granularity=${interval}&limit=${limit}`),
      3, 300, "getCandles",
    );
    return (data.data ?? []).map(r => ({
      time:   parseInt(r[0]!),
      open:   parseFloat(r[1]!),
      high:   parseFloat(r[2]!),
      low:    parseFloat(r[3]!),
      close:  parseFloat(r[4]!),
      volume: parseFloat(r[5]!),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<BitgetResp<{ bids: string[][]; asks: string[][] }>>(`/api/v2/spot/market/orderbook?symbol=${pair}&limit=${depth}`),
      3, 300, "getOrderBook",
    );
    const book = data.data ?? { bids: [], asks: [] };
    return {
      symbol, exchange: "Bitget",
      bids: book.bids.map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: book.asks.map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("Bitget");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<BitgetResp<BitgetBalance[]>>("/api/v2/spot/account/assets"),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const b of (data.data ?? [])) {
      const free   = parseFloat(b.available);
      const locked = parseFloat(b.frozen ?? "0");
      if (free + locked < 0.000001) continue;
      balances[b.coin] = { free, locked, total: free + locked };
      if (b.coin === "USDT") usd += free + locked;
    }
    return { exchange: "Bitget", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("Bitget", req, this.normaliseSymbol(req.symbol), this.config);
    const body = JSON.stringify({
      symbol:   this.normaliseSymbol(req.symbol),
      side:     req.side,
      orderType: req.type === "market" ? "market" : "limit",
      size:     req.qty.toFixed(8),
      price:    req.limitPrice?.toFixed(8),
      clientOid: req.clientId ?? `BG-${Date.now()}-${String(this.orderSeq++).padStart(4,"0")}`,
    });
    await this.withRetry(
      () => this.signedPost<BitgetResp<{ orderId: string }>>("/api/v2/spot/trade/place-order", body),
      3, 500, "placeOrder",
    );
    return simulatedOrder("Bitget", req, this.normaliseSymbol(req.symbol), this.config);
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      const body = JSON.stringify({ symbol: this.normaliseSymbol(req.symbol), orderId: req.exchangeOrderId });
      await this.withRetry(
        () => this.signedPost<BitgetResp<unknown>>("/api/v2/spot/trade/cancel-order", body),
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
        () => this.signedGet<BitgetResp<BitgetOrderDetail>>(`/api/v2/spot/trade/orderInfo?symbol=${pair}&orderId=${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      const o = data.data;
      if (!o) return null;
      return {
        id: o.orderId, exchangeOrderId: o.orderId, exchange: "Bitget",
        symbol, nativeSymbol: pair,
        side:   o.side as "buy" | "sell",
        type:   o.orderType as "market" | "limit",
        status: o.status === "full_fill" ? "filled" : o.status === "cancelled" ? "cancelled" : "open",
        requestedQty: parseFloat(o.size), filledQty: parseFloat(o.baseVolume ?? "0"),
        avgFillPrice: parseFloat(o.priceAvg ?? "0"),
        quoteQty: parseFloat(o.quoteVolume ?? "0"),
        fee: { amount: parseFloat(o.feeDetail?.feeCost ?? "0"), currency: "USDT", ratePct: this.config.takerFeePct },
        createdAt: parseInt(o.cTime ?? "0") || Date.now(),
        updatedAt: parseInt(o.uTime ?? "0") || Date.now(),
      };
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private sign(ts: string, method: string, path: string, body: string): string {
    const msg = `${ts}${method.toUpperCase()}${path}${body}`;
    return crypto.createHmac("sha256", this.config.apiSecret!).update(msg).digest("base64");
  }

  private authHeaders(method: string, path: string, body = ""): Record<string, string> {
    const ts  = Date.now().toString();
    const sig = this.sign(ts, method, path, body);
    const pp  = this.config.passphrase
      ? crypto.createHmac("sha256", this.config.apiSecret!).update(this.config.passphrase).digest("base64")
      : "";
    return {
      "ACCESS-KEY":        this.config.apiKey!,
      "ACCESS-SIGN":       sig,
      "ACCESS-TIMESTAMP":  ts,
      "ACCESS-PASSPHRASE": pp,
      "Content-Type":      "application/json",
      "locale":            "en-US",
    };
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Bitget: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const [pathname, query = ""] = path.split("?") as [string, string | undefined];
    const reqPath = query ? `${pathname}?${query}` : pathname;
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path: reqPath, headers: this.authHeaders("GET", reqPath) }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Bitget: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: string): Promise<T> {
    const hdrs = this.authHeaders("POST", path, body);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: { ...hdrs, "Content-Length": Buffer.byteLength(body) },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Bitget: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

// ── Bitget API types ──────────────────────────────────────────────────────────

interface BitgetResp<T> { code: string; msg: string; data?: T; }
interface BitgetTicker {
  symbol: string; lastPr: string; bidPr: string; askPr: string;
  baseVolume: string; open24h?: string;
}
interface BitgetBalance  { coin: string; available: string; frozen?: string; }
interface BitgetOrderDetail {
  orderId: string; side: string; orderType: string; status: string;
  size: string; priceAvg?: string; baseVolume?: string; quoteVolume?: string;
  feeDetail?: { feeCost: string }; cTime?: string; uTime?: string;
}

