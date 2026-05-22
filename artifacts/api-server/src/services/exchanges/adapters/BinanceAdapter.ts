import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker,
  OrderBook, AssetBalance,
} from "../types.js";

// ── BinanceAdapter ────────────────────────────────────────────────────────────
//
// Binance REST + WebSocket adapter.
// REST: api.binance.com
// WS:   wss://stream.binance.com:9443/ws
//
// Required env:
//   BINANCE_API_KEY
//   BINANCE_API_SECRET
//
// Symbol normalisation:
//   "BTCUSD" → "BTCUSDT"  (Binance uses USDT pairs)

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTCUSDT",
  ETHUSD:  "ETHUSDT",
  SOLUSD:  "SOLUSDT",
  XRPUSD:  "XRPUSDT",
  DOGEUSD: "DOGEUSDT",
  AVAXUSD: "AVAXUSDT",
  LINKUSD: "LINKUSDT",
  ADAUSD:  "ADAUSDT",
  BNBUSD:  "BNBUSDT",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1d",
};

export const BINANCE_CONFIG: AdapterConfig = {
  exchange:    "Binance",
  apiKey:      process.env["BINANCE_API_KEY"],
  apiSecret:   process.env["BINANCE_API_SECRET"],
  takerFeePct: 0.10,
  makerFeePct: 0.10,
  rateLimit: { ordersPerSecond: 10, requestsPerMinute: 1200 },
};

export class BinanceAdapter extends BaseExchangeAdapter {
  private readonly BASE = "api.binance.com";
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...BINANCE_CONFIG, ...config });
  }

  normaliseSymbol(symbol: string): string {
    return SYMBOL_MAP[symbol] ?? symbol.replace("USD", "USDT");
  }

  denormaliseSymbol(native: string): string {
    return REVERSE_MAP[native] ?? native.replace("USDT", "USD");
  }

  async connect(): Promise<void> {
    // TODO Phase 2: open WebSocket stream for live prices + order updates
    // wss://stream.binance.com:9443/ws/<symbol>@trade
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
      () => this.get<BinanceTicker>(`/api/v3/ticker/24hr?symbol=${pair}`),
      3, 300, "getTicker",
    );
    return {
      symbol, exchange: "Binance",
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
    const pair = this.normaliseSymbol(symbol);
    const tf   = TF_MAP[timeframe] ?? "15m";
    const rows = await this.withRetry(
      () => this.get<BinanceKline[]>(`/api/v3/klines?symbol=${pair}&interval=${tf}&limit=${limit}`),
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
      symbol, exchange: "Binance",
      bids: data.bids.map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: data.asks.map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("Binance");
    this.checkRequestRateLimit();
    const data = await this.withRetry(
      () => this.signedGet<BinanceAccount>("/api/v3/account"),
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
    return { exchange: "Binance", balances, totalEquityUSD: usd, positions: [], lastUpdated: Date.now() };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) return simulatedOrder("Binance", req, this.normaliseSymbol(req.symbol), this.config);

    const params: Record<string, string> = {
      symbol:   this.normaliseSymbol(req.symbol),
      side:     req.side.toUpperCase(),
      type:     req.type === "market" ? "MARKET" : "LIMIT",
      quantity: req.qty.toFixed(8),
      newOrderRespType: "FULL",
    };
    if (req.limitPrice) {
      params["price"]       = req.limitPrice.toFixed(8);
      params["timeInForce"] = "GTC";
    }
    if (req.clientId) params["newClientOrderId"] = req.clientId;

    const data = await this.withRetry(
      () => this.signedPost<BinanceOrderResponse>("/api/v3/order", params),
      3, 500, "placeOrder",
    );
    return this.normaliseOrder(data, req.symbol);
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
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  async getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const pair = this.normaliseSymbol(symbol);
      const data = await this.withRetry(
        () => this.signedGet<BinanceOrderResponse>(`/api/v3/order?symbol=${pair}&orderId=${exchangeOrderId}`),
        3, 300, "getOrder",
      );
      return this.normaliseOrder(data, symbol);
    } catch { return null; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret);
  }

  private sign(query: string): string {
    return crypto.createHmac("sha256", this.config.apiSecret!).update(query).digest("hex");
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers: { "X-MBX-APIKEY": this.config.apiKey ?? "" } }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Binance: parse failed")); }
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
    const ts     = Date.now();
    const body   = new URLSearchParams({ ...params, timestamp: String(ts) }).toString();
    const sig    = this.sign(body);
    const full   = `${body}&signature=${sig}`;
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: this.BASE, path, method: "POST",
          headers: {
            "X-MBX-APIKEY": this.config.apiKey!,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(full),
          },
        },
        res => {
          let data = "";
          res.on("data", c => { data += c; });
          res.on("end", () => {
            try { resolve(JSON.parse(data) as T); }
            catch { reject(new Error("Binance: parse failed")); }
          });
        }
      );
      req.on("error", reject);
      req.write(full);
      req.end();
    });
  }

  private signedDelete<T>(path: string): Promise<T> {
    const ts    = Date.now();
    const query = path.includes("?") ? `${path}&timestamp=${ts}` : `${path}?timestamp=${ts}`;
    const sig   = this.sign(query.replace(/^\/[^?]*\?/, ""));
    return new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: this.BASE, path: `${query}&signature=${sig}`, method: "DELETE",
          headers: { "X-MBX-APIKEY": this.config.apiKey! } },
        res => {
          let data = "";
          res.on("data", c => { data += c; });
          res.on("end", () => { try { resolve(JSON.parse(data) as T); } catch { reject(new Error("parse failed")); } });
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  private normaliseOrder(raw: BinanceOrderResponse, symbol: string): StandardOrder {
    const fill = parseFloat(raw.price || raw.fills?.[0]?.price || "0");
    const qty  = parseFloat(raw.executedQty || "0");
    // Only treat the commission as broker-sourced when Binance actually
    // returned per-fill commissions. Use the first fill's commissionAsset
    // as the fee currency (BNB, USDT, etc.) instead of hardcoding USDT —
    // that asset materially changes how the amount maps to USD.
    const brokerFills = raw.fills && raw.fills.length > 0;
    const fee  = brokerFills
      ? raw.fills!.reduce((s, f) => s + parseFloat(f.commission || "0"), 0)
      : this.computeFee(qty * fill, true);
    const feeSource: "broker" | "estimate" = brokerFills ? "broker" : "estimate";
    const feeCurrency = brokerFills
      ? (raw.fills![0]!.commissionAsset || "USDT")
      : "USDT";
    const statusMap: Record<string, StandardOrder["status"]> = {
      NEW: "open", PARTIALLY_FILLED: "partial", FILLED: "filled",
      CANCELED: "cancelled", REJECTED: "rejected",
    };
    return {
      id:              raw.clientOrderId || String(raw.orderId),
      exchangeOrderId: String(raw.orderId),
      exchange:        "Binance",
      symbol,
      nativeSymbol:    raw.symbol,
      side:            raw.side.toLowerCase() as "buy" | "sell",
      type:            raw.type.toLowerCase() as "market" | "limit",
      status:          statusMap[raw.status] ?? "open",
      requestedQty:    parseFloat(raw.origQty || "0"),
      filledQty:       qty,
      requestedPrice:  raw.price ? parseFloat(raw.price) : undefined,
      avgFillPrice:    fill,
      quoteQty:        qty * fill,
      fee:             { amount: fee, currency: feeCurrency, ratePct: this.config.takerFeePct, source: feeSource },
      createdAt:       raw.transactTime ?? Date.now(),
      updatedAt:       Date.now(),
      rawResponse:     raw,
    };
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function emptyAccount(exchange: string): StandardAccount {
  return { exchange, balances: {}, totalEquityUSD: 0, positions: [], lastUpdated: Date.now() };
}

export function simulatedOrder(
  exchange: string,
  req: PlaceOrderRequest,
  nativeSymbol: string,
  config: AdapterConfig,
): StandardOrder {
  const id = `SIM-${Date.now()}`;
  return {
    id, exchangeOrderId: id, exchange, symbol: req.symbol, nativeSymbol,
    side: req.side, type: req.type, status: "filled",
    requestedQty: req.qty, filledQty: req.qty,
    requestedPrice: req.limitPrice, avgFillPrice: req.limitPrice ?? 0,
    quoteQty: req.qty * (req.limitPrice ?? 0),
    fee: { amount: 0, currency: "USD", ratePct: config.takerFeePct, source: "estimate" },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// ── Binance response types ─────────────────────────────────────────────────────

interface BinanceTicker {
  symbol: string; bidPrice: string; askPrice: string; lastPrice: string;
  volume: string; priceChange: string; priceChangePercent: string; closeTime: number;
}
type BinanceKline = [number, string, string, string, string, string, ...unknown[]];
interface BinanceAccount {
  balances: Array<{ asset: string; free: string; locked: string }>;
}
interface BinanceOrderResponse {
  orderId: number; clientOrderId: string; symbol: string; status: string;
  side: string; type: string; price: string; origQty: string; executedQty: string;
  transactTime?: number;
  fills?: Array<{ price: string; qty: string; commission: string; commissionAsset: string }>;
}
