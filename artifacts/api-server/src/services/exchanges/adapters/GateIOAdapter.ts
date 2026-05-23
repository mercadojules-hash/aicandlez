import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── GateIOAdapter ─────────────────────────────────────────────────────────────
//
// Gate.io REST v4 adapter.
// API docs: https://www.gate.io/docs/developers/apiv4/
//
// Required env:
//   GATEIO_API_KEY
//   GATEIO_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "BTC_USDT"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC_USDT",  ETHUSD:  "ETH_USDT",  SOLUSD:  "SOL_USDT",
  XRPUSD:  "XRP_USDT",  DOGEUSD: "DOGE_USDT", AVAXUSD: "AVAX_USDT",
  LINKUSD: "LINK_USDT", ADAUSD:  "ADA_USDT",  BNBUSD:  "BNB_USDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1d",
};

export const GATEIO_CONFIG: AdapterConfig = {
  exchange:    "GateIO",
  apiKey:      process.env["GATEIO_API_KEY"],
  apiSecret:   process.env["GATEIO_API_SECRET"],
  takerFeePct: 0.20,
  makerFeePct: 0.20,
  rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 900 },
};

export class GateIOAdapter extends BaseExchangeAdapter {
  // Gate.io has no public spot sandbox we can target — opt-in testnet
  // construction must fail rather than silently route to prod.
  private readonly BASE = this.resolveHost({
    prod:    "api.gateio.ws",
    testnet: null,
  });
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...GATEIO_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.replace("USD", "_USDT"); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("_USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://api.gateio.ws/ws/v4/ for live price streams
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<GateTicker[]>(`/api/v4/spot/tickers?currency_pair=${pair}`),
      3, 300, "getTicker",
    );
    const t = data[0];
    if (!t) throw new Error(`GateIO: no ticker for ${symbol}`);
    const last = parseFloat(t.last);
    const open = parseFloat(t.open_24h ?? t.last);
    return {
      symbol, exchange: "GateIO",
      bid:       parseFloat(t.highest_bid),
      ask:       parseFloat(t.lowest_ask),
      last,
      volume24h: parseFloat(t.quote_volume),
      change24h: last - open,
      changePct: open > 0 ? ((last - open) / open) * 100 : 0,
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const interval = TF_MAP[timeframe] ?? "5m";
    const data     = await this.withRetry(
      () => this.get<GateCandle[]>(`/api/v4/spot/candlesticks?currency_pair=${pair}&interval=${interval}&limit=${limit}`),
      3, 300, "getCandles",
    );
    return data.map(r => ({
      time:   parseInt(r[0]) * 1000,
      open:   parseFloat(r[5]),
      high:   parseFloat(r[3]),
      low:    parseFloat(r[4]),
      close:  parseFloat(r[2]),
      volume: parseFloat(r[1]),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<{ bids: string[][]; asks: string[][] }>(`/api/v4/spot/order_book?currency_pair=${pair}&limit=${depth}`),
      3, 300, "getOrderBook",
    );
    return {
      symbol, exchange: "GateIO",
      bids: data.bids.map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: data.asks.map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("GateIO");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<GateBalance[]>("/api/v4/spot/accounts"),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const b of data) {
      const free   = parseFloat(b.available);
      const locked = parseFloat(b.locked);
      if (free + locked < 0.000001) continue;
      balances[b.currency] = { free, locked, total: free + locked };
      if (b.currency === "USDT") usd += free + locked;
    }
    return { exchange: "GateIO", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("GateIO", req, this.normaliseSymbol(req.symbol), this.config);
    const body = JSON.stringify({
      currency_pair: this.normaliseSymbol(req.symbol),
      type:          req.type === "market" ? "market" : "limit",
      side:          req.side,
      amount:        req.qty.toFixed(8),
      price:         req.limitPrice?.toFixed(8) ?? "0",
    });
    const data = await this.withRetry(
      () => this.signedPost<GateOrder>("/api/v4/spot/orders", body),
      3, 500, "placeOrder",
    );
    return this.normaliseOrder(data, req.symbol);
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      const pair = this.normaliseSymbol(req.symbol);
      await this.withRetry(
        () => this.signedDelete(`/api/v4/spot/orders/${req.exchangeOrderId}?currency_pair=${pair}`),
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
        () => this.signedGet<GateOrder>(`/api/v4/spot/orders/${exchangeOrderId}?currency_pair=${pair}`),
        3, 300, "getOrder",
      );
      return this.normaliseOrder(data, symbol);
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private gateSign(method: string, path: string, query: string, body: string, ts: string): string {
    const hash = crypto.createHash("sha512").update(body).digest("hex");
    const msg  = `${method}\n${path}\n${query}\n${hash}\n${ts}`;
    return crypto.createHmac("sha512", this.config.apiSecret!).update(msg).digest("hex");
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("GateIO: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const ts  = Math.floor(Date.now() / 1000).toString();
    const [pathname, query = ""] = path.split("?") as [string, string | undefined];
    const sig = this.gateSign("GET", pathname, query, "", ts);
    return new Promise((resolve, reject) => {
      https.get({
        hostname: this.BASE, path,
        headers: {
          "KEY": this.config.apiKey!, "SIGN": sig, "Timestamp": ts,
          "Accept": "application/json",
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("GateIO: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: string): Promise<T> {
    const ts  = Math.floor(Date.now() / 1000).toString();
    const sig = this.gateSign("POST", path, "", body, ts);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: {
          "KEY": this.config.apiKey!, "SIGN": sig, "Timestamp": ts,
          "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body),
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("GateIO: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  private signedDelete<T>(path: string): Promise<T> {
    const ts  = Math.floor(Date.now() / 1000).toString();
    const [pathname, query = ""] = path.split("?") as [string, string | undefined];
    const sig = this.gateSign("DELETE", pathname, query, "", ts);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "DELETE",
        headers: {
          "KEY": this.config.apiKey!, "SIGN": sig, "Timestamp": ts,
          "Accept": "application/json",
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("GateIO: parse failed")); }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  private normaliseOrder(raw: GateOrder, symbol: string): StandardOrder {
    const qty  = parseFloat(raw.amount ?? "0");
    const fill = parseFloat(raw.fill_price ?? raw.price ?? "0");
    return {
      id: raw.id, exchangeOrderId: raw.id, exchange: "GateIO",
      symbol, nativeSymbol: raw.currency_pair,
      side:   raw.side as "buy" | "sell",
      type:   raw.type as "market" | "limit",
      status: raw.status === "closed" ? "filled" : raw.status === "cancelled" ? "cancelled" : "open",
      requestedQty: qty, filledQty: parseFloat(raw.filled_total ?? "0") / (fill || 1),
      avgFillPrice: fill, quoteQty: parseFloat(raw.filled_total ?? "0"),
      fee:      raw.fee !== undefined && raw.fee !== null
        ? { amount: parseFloat(raw.fee), currency: raw.fee_currency ?? "USDT", ratePct: this.config.takerFeePct, source: "broker" }
        : { amount: this.computeFee(parseFloat(raw.filled_total ?? "0"), true), currency: "USDT", ratePct: this.config.takerFeePct, source: "estimate" },
      createdAt: parseInt(raw.create_time_ms ?? "0") || Date.now(),
      updatedAt: parseInt(raw.update_time_ms ?? "0") || Date.now(),
    };
  }
}

// ── Gate.io API types ──────────────────────────────────────────────────────────

interface GateTicker {
  currency_pair: string;
  last:          string;
  highest_bid:   string;
  lowest_ask:    string;
  base_volume:   string;
  quote_volume:  string;
  open_24h?:     string;
}
// [timestamp, volume, close, high, low, open, ...rest]
type GateCandle = [string, string, string, string, string, string, ...string[]];
interface GateBalance { currency: string; available: string; locked: string; }
interface GateOrder {
  id:             string;
  currency_pair:  string;
  side:           string;
  type:           string;
  status:         string;
  amount?:        string;
  price?:         string;
  fill_price?:    string;
  fee_currency?:  string;
  filled_total?:  string;
  fee?:           string;
  create_time_ms?: string;
  update_time_ms?: string;
}
