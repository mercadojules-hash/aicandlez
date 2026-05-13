import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook, AssetBalance,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── BloFinAdapter ─────────────────────────────────────────────────────────────
//
// BloFin REST v1 adapter.
// API docs: https://blofin.com/docs
//
// Required env:
//   BLOFIN_API_KEY
//   BLOFIN_API_SECRET
//   BLOFIN_PASSPHRASE  (required)
//
// Symbol normalisation:
//   "BTCUSD" → "BTC-USDT"   (BloFin uses dash-separated)

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC-USDT",  ETHUSD:  "ETH-USDT",  SOLUSD:  "SOL-USDT",
  XRPUSD:  "XRP-USDT",  DOGEUSD: "DOGE-USDT", AVAXUSD: "AVAX-USDT",
  LINKUSD: "LINK-USDT", ADAUSD:  "ADA-USDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1H", "4h": "4H", "1d": "1D",
};

export const BLOFIN_CONFIG: AdapterConfig = {
  exchange:    "BloFin",
  apiKey:      process.env["BLOFIN_API_KEY"],
  apiSecret:   process.env["BLOFIN_API_SECRET"],
  passphrase:  process.env["BLOFIN_PASSPHRASE"],
  takerFeePct: 0.10,
  makerFeePct: 0.02,
  rateLimit:   { ordersPerSecond: 20, requestsPerMinute: 600 },
};

export class BloFinAdapter extends BaseExchangeAdapter {
  private readonly BASE = "openapi.blofin.com";
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...BLOFIN_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.replace("USD", "-USDT"); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("-USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://openapi.blofin.com/ws/public
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const instId = this.normaliseSymbol(symbol);
    const data   = await this.withRetry(
      () => this.get<BloFinResp<BloFinTicker[]>>(`/api/v1/market/tickers?instId=${instId}`),
      3, 300, "getTicker",
    );
    const t = data.data?.[0];
    if (!t) throw new Error(`BloFin: no ticker for ${symbol}`);
    const last = parseFloat(t.last);
    const open = parseFloat(t.open24h ?? t.last);
    return {
      symbol, exchange: "BloFin",
      bid:       parseFloat(t.bidPx),
      ask:       parseFloat(t.askPx),
      last,
      volume24h: parseFloat(t.volCcy24h ?? t.vol24h ?? "0"),
      change24h: last - open,
      changePct: open > 0 ? ((last - open) / open) * 100 : 0,
      timestamp: parseInt(t.ts),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const instId = this.normaliseSymbol(symbol);
    const bar    = TF_MAP[timeframe] ?? "5m";
    const data   = await this.withRetry(
      () => this.get<BloFinResp<string[][]>>(`/api/v1/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`),
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
    const instId = this.normaliseSymbol(symbol);
    const data   = await this.withRetry(
      () => this.get<BloFinResp<{ bids: string[][]; asks: string[][] }[]>>(`/api/v1/market/books?instId=${instId}&sz=${depth}`),
      3, 300, "getOrderBook",
    );
    const book = data.data?.[0] ?? { bids: [], asks: [] };
    return {
      symbol, exchange: "BloFin",
      bids: book.bids.map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: book.asks.map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("BloFin");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<BloFinResp<BloFinBalance[]>>("/api/v1/asset/balances"),
      3, 500, "getAccount",
    );
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const b of (data.data ?? [])) {
      const free   = parseFloat(b.available);
      const locked = parseFloat(b.frozen ?? "0");
      if (free + locked < 0.000001) continue;
      balances[b.currency] = { free, locked, total: free + locked };
      if (b.currency === "USDT") usd += free + locked;
    }
    return { exchange: "BloFin", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("BloFin", req, this.normaliseSymbol(req.symbol), this.config);
    const body = JSON.stringify({
      instId:  this.normaliseSymbol(req.symbol),
      side:    req.side,
      ordType: req.type === "market" ? "market" : "limit",
      sz:      req.qty.toFixed(8),
      px:      req.limitPrice?.toFixed(8),
      clOrdId: req.clientId ?? `BF-${Date.now()}-${String(this.orderSeq++).padStart(4,"0")}`,
    });
    const data = await this.withRetry(
      () => this.signedPost<BloFinResp<{ ordId: string }[]>>("/api/v1/trade/order", body),
      3, 500, "placeOrder",
    );
    void data;
    return simulatedOrder("BloFin", req, this.normaliseSymbol(req.symbol), this.config);
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      const body = JSON.stringify({ instId: this.normaliseSymbol(req.symbol), ordId: req.exchangeOrderId });
      await this.withRetry(
        () => this.signedPost<BloFinResp<unknown>>("/api/v1/trade/cancel-order", body),
        2, 300, "cancelOrder",
      );
      return { ok: true };
    } catch (err) { return { ok: false, reason: (err as Error).message }; }
  }

  async getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const instId = this.normaliseSymbol(symbol);
      const data   = await this.withRetry(
        () => this.signedGet<BloFinResp<BloFinOrderInfo[]>>(`/api/v1/trade/orders-pending?instId=${instId}&ordId=${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      const o = data.data?.[0];
      if (!o) return null;
      const fill = parseFloat(o.avgPx ?? "0");
      const qty  = parseFloat(o.accFillSz ?? "0");
      return {
        id: o.ordId, exchangeOrderId: o.ordId, exchange: "BloFin",
        symbol, nativeSymbol: instId,
        side:   o.side as "buy" | "sell",
        type:   o.ordType as "market" | "limit",
        status: o.state === "filled" ? "filled" : o.state === "canceled" ? "cancelled" : "open",
        requestedQty: parseFloat(o.sz ?? "0"), filledQty: qty,
        avgFillPrice: fill, quoteQty: qty * fill,
        fee: { amount: parseFloat(o.fee ?? "0"), currency: "USDT", ratePct: this.config.takerFeePct },
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
    return {
      "ACCESS-KEY":        this.config.apiKey!,
      "ACCESS-SIGN":       sig,
      "ACCESS-TIMESTAMP":  ts,
      "ACCESS-PASSPHRASE": this.config.passphrase ?? "",
      "Content-Type":      "application/json",
    };
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("BloFin: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const [pathname, qs = ""] = path.split("?") as [string, string | undefined];
    const reqPath = qs ? `${pathname}?${qs}` : pathname;
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path: reqPath, headers: this.authHeaders("GET", reqPath) }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("BloFin: parse failed")); }
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
          catch { reject(new Error("BloFin: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

// ── BloFin API types ──────────────────────────────────────────────────────────
interface BloFinResp<T> { code: string; msg: string; data?: T; }
interface BloFinTicker  {
  instId: string; last: string; bidPx: string; askPx: string;
  vol24h?: string; volCcy24h?: string; open24h?: string; ts: string;
}
interface BloFinBalance  { currency: string; available: string; frozen?: string; }
interface BloFinOrderInfo {
  ordId: string; side: string; ordType: string; state: string;
  sz?: string; avgPx?: string; accFillSz?: string; fee?: string; cTime?: string; uTime?: string;
}
