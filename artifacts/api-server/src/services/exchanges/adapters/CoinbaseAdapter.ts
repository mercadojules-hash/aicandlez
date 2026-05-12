import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker,
  OrderBook,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";

// ── CoinbaseAdapter ───────────────────────────────────────────────────────────
//
// Coinbase Advanced Trade REST adapter.
// API docs: https://docs.cdp.coinbase.com/advanced-trade/docs/welcome
//
// Required env:
//   COINBASE_API_KEY     (CDP API key name)
//   COINBASE_API_SECRET  (ECDSA private key)
//
// Symbol normalisation:
//   "BTCUSD" → "BTC-USD"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC-USD",
  ETHUSD:  "ETH-USD",
  SOLUSD:  "SOL-USD",
  XRPUSD:  "XRP-USD",
  DOGEUSD: "DOGE-USD",
  AVAXUSD: "AVAX-USD",
  LINKUSD: "LINK-USD",
  ADAUSD:  "ADA-USD",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_SECS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400,
};

export const COINBASE_CONFIG: AdapterConfig = {
  exchange:    "Coinbase",
  apiKey:      process.env["COINBASE_API_KEY"],
  apiSecret:   process.env["COINBASE_API_SECRET"],
  takerFeePct: 0.60,
  makerFeePct: 0.40,
  rateLimit: { ordersPerSecond: 5, requestsPerMinute: 300 },
};

export class CoinbaseAdapter extends BaseExchangeAdapter {
  private readonly BASE = "api.coinbase.com";
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...COINBASE_CONFIG, ...config });
  }

  normaliseSymbol(symbol: string): string {
    return SYMBOL_MAP[symbol] ?? symbol;
  }

  denormaliseSymbol(native: string): string {
    return REVERSE_MAP[native] ?? native.replace("-", "");
  }

  async connect(): Promise<void> {
    // TODO Phase 2: subscribe to Coinbase Advanced Trade WebSocket
    // wss://advanced-trade-ws.coinbase.com
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> {
    this.setState("disconnected");
  }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<{ trades: Array<{ price: string; time: string }> }>(
        `/api/v3/brokerage/best_bid_ask?product_ids=${pair}`
      ),
      3, 300, "getTicker",
    );
    const last = parseFloat(data.trades?.[0]?.price ?? "0");
    return {
      symbol, exchange: "Coinbase",
      bid: last, ask: last, last,
      volume24h: 0, change24h: 0, changePct: 0,
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair  = this.normaliseSymbol(symbol);
    const gran  = TF_SECS[timeframe] ?? 900;
    const end   = Math.floor(Date.now() / 1000);
    const start = end - gran * limit;
    const data  = await this.withRetry(
      () => this.get<{ candles: CoinbaseCandle[] }>(
        `/api/v3/brokerage/products/${pair}/candles?start=${start}&end=${end}&granularity=${gran}`
      ),
      3, 300, "getCandles",
    );
    return (data.candles ?? []).reverse().slice(-limit).map(c => ({
      time:   parseInt(c.start) * 1000,
      open:   parseFloat(c.open),
      high:   parseFloat(c.high),
      low:    parseFloat(c.low),
      close:  parseFloat(c.close),
      volume: parseFloat(c.volume),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<{ pricebook: { bids: CbLevel[]; asks: CbLevel[] } }>(
        `/api/v3/brokerage/product_book?product_id=${pair}&limit=${depth}`
      ),
      3, 300, "getOrderBook",
    );
    const pb = data.pricebook;
    return {
      symbol, exchange: "Coinbase",
      bids: (pb?.bids ?? []).map(b => ({ price: parseFloat(b.price), qty: parseFloat(b.size) })),
      asks: (pb?.asks ?? []).map(a => ({ price: parseFloat(a.price), qty: parseFloat(a.size) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("Coinbase");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<{ accounts: CbAccount[] }>("/api/v3/brokerage/accounts"),
      3, 500, "getAccount",
    );
    const balances: Record<string, ReturnType<typeof emptyAccount>["balances"][string]> = {};
    let usd = 0;
    for (const acc of data.accounts ?? []) {
      const asset  = acc.currency;
      const avail  = parseFloat(acc.available_balance.value);
      const hold   = parseFloat(acc.hold.value);
      balances[asset] = { free: avail, locked: hold, total: avail + hold };
      if (asset === "USD") usd += avail + hold;
    }
    return { exchange: "Coinbase", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("Coinbase", req, this.normaliseSymbol(req.symbol), this.config);

    const clientId = req.clientId ?? `CB-${Date.now()}-${this.orderSeq++}`;
    const body: Record<string, unknown> = {
      client_order_id: clientId,
      product_id:      this.normaliseSymbol(req.symbol),
      side:            req.side.toUpperCase(),
    };

    if (req.type === "market") {
      body["order_configuration"] = { market_market_ioc: { quote_size: (req.qty * (req.limitPrice ?? 1)).toFixed(2) } };
    } else {
      body["order_configuration"] = {
        limit_limit_gtc: { base_size: req.qty.toFixed(8), limit_price: req.limitPrice!.toFixed(2) },
      };
    }

    const data = await this.withRetry(
      () => this.signedPost<CbOrderResponse>("/api/v3/brokerage/orders", body),
      3, 500, "placeOrder",
    );
    const fill = parseFloat(data.order?.average_filled_price ?? req.limitPrice?.toFixed(2) ?? "0");
    const qty  = parseFloat(data.order?.filled_size ?? req.qty.toFixed(8));
    const fee  = this.computeFee(qty * fill, true);
    return {
      id:              clientId,
      exchangeOrderId: data.order_id ?? clientId,
      exchange:        "Coinbase",
      symbol:          req.symbol,
      nativeSymbol:    this.normaliseSymbol(req.symbol),
      side:            req.side,
      type:            req.type,
      status:          data.success ? "filled" : "rejected",
      requestedQty:    req.qty,
      filledQty:       qty,
      requestedPrice:  req.limitPrice,
      avgFillPrice:    fill,
      quoteQty:        qty * fill,
      fee:             { amount: fee, currency: "USD", ratePct: this.config.takerFeePct },
      createdAt:       Date.now(), updatedAt: Date.now(),
      rawResponse:     data,
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      await this.withRetry(
        () => this.signedPost<unknown>("/api/v3/brokerage/orders/batch_cancel",
          { order_ids: [req.exchangeOrderId] }),
        2, 300, "cancelOrder",
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  async getOrder(exchangeOrderId: string, _symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const data = await this.withRetry(
        () => this.signedGet<{ order: CbOrder }>(`/api/v3/brokerage/orders/historical/${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      if (!data.order) return null;
      const fill = parseFloat(data.order.average_filled_price ?? "0");
      const qty  = parseFloat(data.order.filled_size ?? "0");
      return {
        id: data.order.client_order_id ?? exchangeOrderId,
        exchangeOrderId,
        exchange: "Coinbase",
        symbol: this.denormaliseSymbol(data.order.product_id),
        nativeSymbol: data.order.product_id,
        side: data.order.side.toLowerCase() as "buy" | "sell",
        type: "market",
        status: data.order.status === "FILLED" ? "filled" : "open",
        requestedQty: parseFloat(data.order.order_configuration?.market_market_ioc?.quote_size ?? "0"),
        filledQty: qty, avgFillPrice: fill, quoteQty: qty * fill,
        fee: { amount: 0, currency: "USD", ratePct: this.config.takerFeePct },
        createdAt: Date.now(), updatedAt: Date.now(),
      };
    } catch { return null; }
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  private isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret);
  }

  private sign(timestamp: string, method: string, path: string, body = ""): string {
    const msg = `${timestamp}${method}${path}${body}`;
    return crypto.createHmac("sha256", this.config.apiSecret!).update(msg).digest("hex");
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => { try { resolve(JSON.parse(data) as T); } catch { reject(new Error("parse failed")); } });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    const ts  = Math.floor(Date.now() / 1000).toString();
    const sig = this.sign(ts, "GET", path);
    return new Promise((resolve, reject) => {
      https.get({
        hostname: this.BASE, path,
        headers: { "CB-ACCESS-KEY": this.config.apiKey!, "CB-ACCESS-SIGN": sig,
                   "CB-ACCESS-TIMESTAMP": ts, "Content-Type": "application/json" },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => { try { resolve(JSON.parse(data) as T); } catch { reject(new Error("parse failed")); } });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: unknown): Promise<T> {
    const ts      = Math.floor(Date.now() / 1000).toString();
    const bodyStr = JSON.stringify(body);
    const sig     = this.sign(ts, "POST", path, bodyStr);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: {
          "CB-ACCESS-KEY": this.config.apiKey!, "CB-ACCESS-SIGN": sig,
          "CB-ACCESS-TIMESTAMP": ts, "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => { try { resolve(JSON.parse(data) as T); } catch { reject(new Error("parse failed")); } });
      });
      req.on("error", reject);
      req.write(bodyStr);
      req.end();
    });
  }
}

// ── Coinbase response types ───────────────────────────────────────────────────

interface CoinbaseCandle { start: string; open: string; high: string; low: string; close: string; volume: string }
interface CbLevel { price: string; size: string }
interface CbAccount { currency: string; available_balance: { value: string }; hold: { value: string } }
interface CbOrder {
  client_order_id?: string; product_id: string; side: string; status: string;
  average_filled_price?: string; filled_size?: string;
  order_configuration?: { market_market_ioc?: { quote_size?: string } };
}
interface CbOrderResponse {
  success: boolean; order_id?: string;
  order?: { average_filled_price?: string; filled_size?: string };
}
