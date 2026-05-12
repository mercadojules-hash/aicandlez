import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── OKXAdapter ────────────────────────────────────────────────────────────────
//
// OKX REST v5 adapter.
// API docs: https://www.okx.com/docs-v5/en/
//
// Required env:
//   OKX_API_KEY
//   OKX_API_SECRET
//   OKX_PASSPHRASE  (mandatory for OKX signing)
//
// Symbol normalisation:
//   "BTCUSD" → "BTC-USDT"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD: "BTC-USDT", ETHUSD: "ETH-USDT", SOLUSD: "SOL-USDT",
  XRPUSD: "XRP-USDT", DOGEUSD: "DOGE-USDT", AVAXUSD: "AVAX-USDT",
  LINKUSD: "LINK-USDT", ADAUSD: "ADA-USDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "4h": "4H", "1d": "1D",
};

export const OKX_CONFIG: AdapterConfig = {
  exchange:    "OKX",
  apiKey:      process.env["OKX_API_KEY"],
  apiSecret:   process.env["OKX_API_SECRET"],
  passphrase:  process.env["OKX_PASSPHRASE"],
  takerFeePct: 0.10,
  makerFeePct: 0.08,
  rateLimit:   { ordersPerSecond: 20, requestsPerMinute: 600 },
};

export class OKXAdapter extends BaseExchangeAdapter {
  private readonly BASE = "www.okx.com";
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...OKX_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string   { return SYMBOL_MAP[s] ?? s; }
  denormaliseSymbol(s: string): string  { return REVERSE_MAP[s] ?? s.replace("-USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://ws.okx.com:8443/ws/v5/public
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const instId = this.normaliseSymbol(symbol);
    const data   = await this.withRetry(
      () => this.get<OKXResp<OKXTicker[]>>(`/api/v5/market/ticker?instId=${instId}`),
      3, 300, "getTicker",
    );
    const t = data.data?.[0];
    if (!t) throw new Error(`OKX: no ticker for ${symbol}`);
    return {
      symbol, exchange: "OKX",
      bid: parseFloat(t.bidPx), ask: parseFloat(t.askPx), last: parseFloat(t.last),
      volume24h: parseFloat(t.vol24h),
      change24h: parseFloat(t.last) - parseFloat(t.open24h),
      changePct: ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100,
      timestamp: parseInt(t.ts),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const instId = this.normaliseSymbol(symbol);
    const bar    = TF_MAP[timeframe] ?? "15m";
    const data   = await this.withRetry(
      () => this.get<OKXResp<string[][]>>(
        `/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`
      ),
      3, 300, "getCandles",
    );
    return (data.data ?? []).reverse().map(r => ({
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
      () => this.get<OKXResp<Array<{ bids: string[][]; asks: string[][] }>>>(
        `/api/v5/market/books?instId=${instId}&sz=${depth}`
      ),
      3, 300, "getOrderBook",
    );
    const book = data.data?.[0];
    return {
      symbol, exchange: "OKX",
      bids: (book?.bids ?? []).map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: (book?.asks ?? []).map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("OKX");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<OKXResp<Array<{ details: Array<{ ccy: string; availBal: string; frozenBal: string }> }>>>(
        "/api/v5/account/balance"
      ),
      3, 500, "getAccount",
    );
    const balances: StandardAccount["balances"] = {};
    let usd = 0;
    for (const acct of data.data ?? []) {
      for (const d of acct.details ?? []) {
        const free   = parseFloat(d.availBal);
        const locked = parseFloat(d.frozenBal);
        balances[d.ccy] = { free, locked, total: free + locked };
        if (d.ccy === "USDT") usd += free + locked;
      }
    }
    return { exchange: "OKX", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("OKX", req, this.normaliseSymbol(req.symbol), this.config);

    const clOrdId = req.clientId ?? `OKX-${Date.now()}-${this.orderSeq++}`;
    const body: Record<string, string> = {
      instId:  this.normaliseSymbol(req.symbol),
      tdMode:  "cash",
      side:    req.side,
      ordType: req.type === "market" ? "market" : "limit",
      sz:      req.qty.toFixed(8),
      clOrdId,
    };
    if (req.limitPrice) body["px"] = req.limitPrice.toFixed(8);

    const data = await this.withRetry(
      () => this.signedPost<OKXResp<Array<{ ordId: string; clOrdId: string }>>>(
        "/api/v5/trade/order", body
      ),
      3, 500, "placeOrder",
    );

    const fill = req.limitPrice ?? 0;
    const fee  = this.computeFee(req.qty * fill, true);
    return {
      id: clOrdId, exchangeOrderId: data.data?.[0]?.ordId ?? clOrdId,
      exchange: "OKX", symbol: req.symbol, nativeSymbol: this.normaliseSymbol(req.symbol),
      side: req.side, type: req.type, status: req.type === "market" ? "filled" : "open",
      requestedQty: req.qty, filledQty: req.type === "market" ? req.qty : 0,
      requestedPrice: req.limitPrice, avgFillPrice: fill, quoteQty: req.qty * fill,
      fee: { amount: fee, currency: "USDT", ratePct: this.config.takerFeePct },
      createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      await this.signedPost("/api/v5/trade/cancel-order", {
        instId: this.normaliseSymbol(req.symbol), ordId: req.exchangeOrderId,
      });
      return { ok: true };
    } catch (err) { return { ok: false, reason: (err as Error).message }; }
  }

  async getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const instId = this.normaliseSymbol(symbol);
      const data   = await this.withRetry(
        () => this.signedGet<OKXResp<OKXOrder[]>>(
          `/api/v5/trade/order?instId=${instId}&ordId=${exchangeOrderId}`
        ),
        3, 300, "getOrder",
      );
      const raw = data.data?.[0];
      if (!raw) return null;
      const fill = parseFloat(raw.avgPx ?? "0");
      const qty  = parseFloat(raw.accFillSz ?? "0");
      return {
        id: raw.clOrdId ?? exchangeOrderId, exchangeOrderId: raw.ordId,
        exchange: "OKX", symbol, nativeSymbol: raw.instId,
        side: raw.side as "buy" | "sell", type: "market",
        status: raw.state === "filled" ? "filled" : "open",
        requestedQty: parseFloat(raw.sz ?? "0"), filledQty: qty, avgFillPrice: fill, quoteQty: qty * fill,
        fee: { amount: parseFloat(raw.fee ?? "0"), currency: "USDT", ratePct: this.config.takerFeePct },
        createdAt: parseInt(raw.cTime ?? "0"), updatedAt: parseInt(raw.uTime ?? "0"),
      };
    } catch { return null; }
  }

  private isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret && this.config.passphrase);
  }

  private sign(ts: string, method: string, path: string, body = ""): string {
    return crypto.createHmac("sha256", this.config.apiSecret!).update(ts + method + path + body).digest("base64");
  }

  private authHeaders(method: string, path: string, body = ""): Record<string, string> {
    const ts  = new Date().toISOString();
    const sig = this.sign(ts, method, path, body);
    return {
      "OK-ACCESS-KEY":        this.config.apiKey!,
      "OK-ACCESS-SIGN":       sig,
      "OK-ACCESS-TIMESTAMP":  ts,
      "OK-ACCESS-PASSPHRASE": this.config.passphrase!,
      "Content-Type":         "application/json",
    };
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => { try { resolve(JSON.parse(d) as T); } catch { reject(new Error("parse")); } });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const headers = this.authHeaders("GET", path);
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => { try { resolve(JSON.parse(d) as T); } catch { reject(new Error("parse")); } });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: Record<string, string>): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const headers = { ...this.authHeaders("POST", path, bodyStr), "Content-Length": String(Buffer.byteLength(bodyStr)) };
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: this.BASE, path, method: "POST", headers }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => { try { resolve(JSON.parse(d) as T); } catch { reject(new Error("parse")); } });
      });
      req.on("error", reject);
      req.write(bodyStr);
      req.end();
    });
  }
}

interface OKXResp<T> { code: string; msg: string; data: T }
interface OKXTicker { instId: string; last: string; bidPx: string; askPx: string; vol24h: string; open24h: string; ts: string }
interface OKXOrder { ordId: string; clOrdId: string; instId: string; side: string; sz: string; avgPx: string; accFillSz: string; fee: string; state: string; cTime: string; uTime: string }
