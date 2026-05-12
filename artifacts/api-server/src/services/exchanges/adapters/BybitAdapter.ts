import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── BybitAdapter ──────────────────────────────────────────────────────────────
//
// Bybit V5 REST adapter (Unified Trading Account).
// API docs: https://bybit-exchange.github.io/docs/v5/intro
//
// Required env:
//   BYBIT_API_KEY
//   BYBIT_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "BTCUSDT"  (spot) or "BTCUSD" (inverse perpetual)

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD: "BTCUSDT", ETHUSD: "ETHUSDT", SOLUSD: "SOLUSDT",
  XRPUSD: "XRPUSDT", DOGEUSD: "DOGEUSDT", AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT", ADAUSD: "ADAUSDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D",
};

export const BYBIT_CONFIG: AdapterConfig = {
  exchange:    "Bybit",
  apiKey:      process.env["BYBIT_API_KEY"],
  apiSecret:   process.env["BYBIT_API_SECRET"],
  takerFeePct: 0.10,
  makerFeePct: 0.10,
  rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 600 },
};

export class BybitAdapter extends BaseExchangeAdapter {
  private readonly BASE = "api.bybit.com";
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...BYBIT_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.replace("USD", "USDT"); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("USDT", "USD"); }

  async connect(): Promise<void> {
    // TODO Phase 2: wss://stream.bybit.com/v5/public/spot
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<BybitResp<{ list: BybitTicker[] }>>(`/v5/market/tickers?category=spot&symbol=${pair}`),
      3, 300, "getTicker",
    );
    const t = data.result?.list?.[0];
    if (!t) throw new Error(`Bybit: no ticker for ${symbol}`);
    return {
      symbol, exchange: "Bybit",
      bid: parseFloat(t.bid1Price), ask: parseFloat(t.ask1Price),
      last: parseFloat(t.lastPrice), volume24h: parseFloat(t.volume24h),
      change24h: parseFloat(t.price24hPcnt) * parseFloat(t.lastPrice) / 100,
      changePct: parseFloat(t.price24hPcnt) * 100,
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const tf   = TF_MAP[timeframe] ?? "15";
    const data = await this.withRetry(
      () => this.get<BybitResp<{ list: string[][] }>>(
        `/v5/market/kline?category=spot&symbol=${pair}&interval=${tf}&limit=${limit}`
      ),
      3, 300, "getCandles",
    );
    return (data.result?.list ?? []).reverse().map(r => ({
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
      () => this.get<BybitResp<{ b: string[][]; a: string[][] }>>(
        `/v5/market/orderbook?category=spot&symbol=${pair}&limit=${depth}`
      ),
      3, 300, "getOrderBook",
    );
    const book = data.result;
    return {
      symbol, exchange: "Bybit",
      bids: (book?.b ?? []).map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: (book?.a ?? []).map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("Bybit");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<BybitResp<{ list: Array<{ coin: Array<{ coin: string; walletBalance: string; availableToWithdraw: string }> }> }>>(
        "/v5/account/wallet-balance?accountType=UNIFIED"
      ),
      3, 500, "getAccount",
    );
    const balances: StandardAccount["balances"] = {};
    let usd = 0;
    for (const account of data.result?.list ?? []) {
      for (const c of account.coin ?? []) {
        const free  = parseFloat(c.availableToWithdraw);
        const total = parseFloat(c.walletBalance);
        balances[c.coin] = { free, locked: total - free, total };
        if (c.coin === "USDT") usd += total;
      }
    }
    return { exchange: "Bybit", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("Bybit", req, this.normaliseSymbol(req.symbol), this.config);

    const clientId = req.clientId ?? `BY-${Date.now()}-${this.orderSeq++}`;
    const body: Record<string, string> = {
      category:    "spot",
      symbol:      this.normaliseSymbol(req.symbol),
      side:        req.side === "buy" ? "Buy" : "Sell",
      orderType:   req.type === "market" ? "Market" : "Limit",
      qty:         req.qty.toFixed(8),
      orderLinkId: clientId,
    };
    if (req.limitPrice) body["price"] = req.limitPrice.toFixed(8);

    const data = await this.withRetry(
      () => this.signedPost<BybitResp<{ orderId: string; orderLinkId: string }>>(
        "/v5/order/create", body
      ),
      3, 500, "placeOrder",
    );

    const fill = req.limitPrice ?? 0;
    const fee  = this.computeFee(req.qty * fill, true);
    return {
      id: clientId, exchangeOrderId: data.result?.orderId ?? clientId,
      exchange: "Bybit", symbol: req.symbol, nativeSymbol: this.normaliseSymbol(req.symbol),
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
      await this.signedPost("/v5/order/cancel", {
        category: "spot", symbol: this.normaliseSymbol(req.symbol), orderId: req.exchangeOrderId,
      });
      return { ok: true };
    } catch (err) { return { ok: false, reason: (err as Error).message }; }
  }

  async getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const pair = this.normaliseSymbol(symbol);
      const data = await this.withRetry(
        () => this.signedGet<BybitResp<{ list: BybitOrder[] }>>(
          `/v5/order/history?category=spot&symbol=${pair}&orderId=${exchangeOrderId}`
        ),
        3, 300, "getOrder",
      );
      const raw = data.result?.list?.[0];
      if (!raw) return null;
      const fill = parseFloat(raw.avgPrice ?? "0");
      const qty  = parseFloat(raw.cumExecQty ?? "0");
      return {
        id: raw.orderLinkId ?? exchangeOrderId, exchangeOrderId: raw.orderId ?? exchangeOrderId,
        exchange: "Bybit", symbol, nativeSymbol: pair,
        side: raw.side.toLowerCase() as "buy" | "sell", type: "market",
        status: raw.orderStatus === "Filled" ? "filled" : "open",
        requestedQty: parseFloat(raw.qty ?? "0"), filledQty: qty, avgFillPrice: fill, quoteQty: qty * fill,
        fee: { amount: parseFloat(raw.cumExecFee ?? "0"), currency: "USDT", ratePct: this.config.takerFeePct },
        createdAt: Date.now(), updatedAt: Date.now(),
      };
    } catch { return null; }
  }

  private isConfigured(): boolean { return !!(this.config.apiKey && this.config.apiSecret); }

  private sign(ts: number, payload: string): string {
    return crypto.createHmac("sha256", this.config.apiSecret!).update(`${ts}${this.config.apiKey}5000${payload}`).digest("hex");
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
    const ts  = Date.now();
    const sig = this.sign(ts, path.includes("?") ? path.split("?")[1]! : "");
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path,
        headers: { "X-BAPI-API-KEY": this.config.apiKey!, "X-BAPI-SIGN": sig,
                   "X-BAPI-TIMESTAMP": String(ts), "X-BAPI-RECV-WINDOW": "5000" }
      }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => { try { resolve(JSON.parse(d) as T); } catch { reject(new Error("parse")); } });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: Record<string, string>): Promise<T> {
    const ts      = Date.now();
    const bodyStr = JSON.stringify(body);
    const sig     = this.sign(ts, bodyStr);
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: this.BASE, path, method: "POST",
        headers: { "X-BAPI-API-KEY": this.config.apiKey!, "X-BAPI-SIGN": sig,
                   "X-BAPI-TIMESTAMP": String(ts), "X-BAPI-RECV-WINDOW": "5000",
                   "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) }
      }, res => {
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

interface BybitResp<T> { retCode: number; retMsg: string; result: T }
interface BybitTicker { lastPrice: string; bid1Price: string; ask1Price: string; volume24h: string; price24hPcnt: string }
interface BybitOrder { orderId: string; orderLinkId: string; side: string; qty: string; avgPrice: string; cumExecQty: string; cumExecFee: string; orderStatus: string }
