import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker,
  OrderBook,
} from "../types.js";
import { emptyAccount } from "./BinanceAdapter.js";

// ── AlpacaAdapter ─────────────────────────────────────────────────────────────
//
// Alpaca Markets REST adapter — supports both paper and live trading.
// Trading API: paper-api.alpaca.markets  (ALPACA_PAPER=true)
//           or api.alpaca.markets        (live)
// Market data: data.alpaca.markets       (crypto v1beta3 endpoint)
//
// Required env:
//   ALPACA_API_KEY      — Alpaca key ID
//   ALPACA_SECRET_KEY   — Alpaca secret key
//   ALPACA_PAPER=true   — Use paper trading endpoint (recommended)
//   ALPACA_BASE_URL     — Optional override (e.g. https://paper-api.alpaca.markets)
//
// Symbol normalisation:
//   "BTCUSD" → "BTC/USD"   (Alpaca crypto uses slash notation)
//   "ETHUSD" → "ETH/USD"
//   "SOLUSD" → "SOL/USD"

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC/USD",
  ETHUSD:  "ETH/USD",
  SOLUSD:  "SOL/USD",
  XRPUSD:  "XRP/USD",
  DOGEUSD: "DOGE/USD",
  AVAXUSD: "AVAX/USD",
  LINKUSD: "LINK/USD",
  ADAUSD:  "ADA/USD",
};
const REVERSE_MAP = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]),
);

const TF_MAP: Record<string, string> = {
  "1m": "1Min", "5m": "5Min", "15m": "15Min", "30m": "30Min",
  "1h": "1Hour", "4h": "4Hour", "1d": "1Day",
};

function tradingBase(): string {
  if (process.env["ALPACA_BASE_URL"]) {
    return new URL(process.env["ALPACA_BASE_URL"]).hostname;
  }
  return process.env["ALPACA_PAPER"] === "true"
    ? "paper-api.alpaca.markets"
    : "api.alpaca.markets";
}

export const ALPACA_CONFIG: AdapterConfig = {
  exchange:    "Alpaca",
  apiKey:      process.env["ALPACA_API_KEY"],
  apiSecret:   process.env["ALPACA_SECRET_KEY"],
  takerFeePct: 0.00,
  makerFeePct: 0.00,
  rateLimit: { ordersPerSecond: 5, requestsPerMinute: 200 },
};

export class AlpacaAdapter extends BaseExchangeAdapter {
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...ALPACA_CONFIG, ...config });
  }

  normaliseSymbol(symbol: string): string {
    return SYMBOL_MAP[symbol] ?? symbol;
  }

  denormaliseSymbol(native: string): string {
    return REVERSE_MAP[native] ?? native.replace("/", "");
  }

  async connect(): Promise<void> {
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> {
    this.setState("disconnected");
  }

  // ── Public market data ──────────────────────────────────────────────────────

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const encoded = encodeURIComponent(pair);
    const data = await this.dataGet<{
      bars: Record<string, AlpacaBar>;
    }>(`/v1beta3/crypto/us/latest/bars?symbols=${encoded}`);

    const bar = data.bars?.[pair];
    const price = bar ? bar.c : 0;
    return {
      symbol,
      exchange:   "Alpaca",
      bid:        price * 0.9999,
      ask:        price * 1.0001,
      last:       price,
      volume24h:  bar?.v ?? 0,
      change24h:  0,
      changePct:  0,
      timestamp:  Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe = "5m", limit = 100): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair   = this.normaliseSymbol(symbol);
    const tf     = TF_MAP[timeframe] ?? "5Min";
    const end    = new Date().toISOString();
    const start  = new Date(Date.now() - limit * tfToMs(timeframe) * 1.5).toISOString();
    const encoded = encodeURIComponent(pair);

    const data = await this.dataGet<{
      bars: Record<string, AlpacaBar[]>;
    }>(`/v1beta3/crypto/us/bars?symbols=${encoded}&timeframe=${tf}&start=${start}&end=${end}&limit=${limit}&sort=asc`);

    const bars = data.bars?.[pair] ?? [];
    return bars.slice(-limit).map(b => ({
      time:   new Date(b.t).getTime(),
      open:   b.o,
      high:   b.h,
      low:    b.l,
      close:  b.c,
      volume: b.v,
    }));
  }

  async getOrderBook(symbol: string, depth = 10): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair    = this.normaliseSymbol(symbol);
    const encoded = encodeURIComponent(pair);
    const data = await this.dataGet<{
      orderbooks: Record<string, { a: AlpacaLevel[]; b: AlpacaLevel[] }>;
    }>(`/v1beta3/crypto/us/latest/orderbooks?symbols=${encoded}`);

    const ob = data.orderbooks?.[pair];
    return {
      symbol, exchange: "Alpaca",
      bids: (ob?.b ?? []).slice(0, depth).map(l => ({ price: l.p, qty: l.s })),
      asks: (ob?.a ?? []).slice(0, depth).map(l => ({ price: l.p, qty: l.s })),
      timestamp: Date.now(),
    };
  }

  // ── Authenticated account & orders ─────────────────────────────────────────

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) return emptyAccount("Alpaca");
    this.checkRequestRateLimit();

    const [acct, positions] = await Promise.all([
      this.tradingGet<AlpacaAccount>("/v2/account"),
      this.tradingGet<AlpacaPosition[]>("/v2/positions"),
    ]);

    const balances: Record<string, { free: number; locked: number; total: number }> = {
      USD: {
        free:  parseFloat(acct.cash),
        locked: parseFloat(acct.portfolio_value) - parseFloat(acct.cash),
        total: parseFloat(acct.portfolio_value),
      },
    };

    for (const pos of positions) {
      const asset = pos.asset_class === "crypto"
        ? pos.symbol.replace("USD", "")
        : pos.symbol;
      const qty = parseFloat(pos.qty);
      balances[asset] = { free: qty, locked: 0, total: qty };
    }

    return {
      exchange:       "Alpaca",
      balances,
      totalEquityUSD: parseFloat(acct.portfolio_value),
      positions:      [],
      lastUpdated:    Date.now(),
    };
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    if (!this.isConfigured()) {
      // Simulate if no keys
      return {
        id: `ALPACA-SIM-${Date.now()}-${this.orderSeq++}`,
        exchangeOrderId: "", exchange: "Alpaca", symbol: req.symbol,
        nativeSymbol: this.normaliseSymbol(req.symbol),
        side: req.side, type: req.type, status: "filled",
        requestedQty: req.qty, filledQty: req.qty,
        requestedPrice: req.limitPrice, avgFillPrice: req.limitPrice ?? 0,
        quoteQty: req.qty * (req.limitPrice ?? 0),
        fee: { amount: 0, currency: "USD", ratePct: 0 },
        createdAt: Date.now(), updatedAt: Date.now(),
      };
    }

    const clientId = req.clientId ?? `ac-${Date.now()}-${this.orderSeq++}`;
    const body: AlpacaOrderRequest = {
      symbol:           this.normaliseSymbol(req.symbol),
      qty:              req.qty.toFixed(8),
      side:             req.side,
      type:             req.type === "market" ? "market" : "limit",
      time_in_force:    "gtc",
      client_order_id:  clientId,
    };
    if (req.type === "limit" && req.limitPrice != null) {
      body.limit_price = req.limitPrice.toFixed(2);
    }

    const data = await this.tradingPost<AlpacaOrder>("/v2/orders", body);
    const fill  = parseFloat(data.filled_avg_price ?? req.limitPrice?.toFixed(2) ?? "0");
    const qty   = parseFloat(data.filled_qty ?? req.qty.toFixed(8));

    return {
      id:              clientId,
      exchangeOrderId: data.id,
      exchange:        "Alpaca",
      symbol:          req.symbol,
      nativeSymbol:    this.normaliseSymbol(req.symbol),
      side:            req.side,
      type:            req.type,
      status:          data.status === "filled" ? "filled" : "open",
      requestedQty:    req.qty,
      filledQty:       qty,
      requestedPrice:  req.limitPrice,
      avgFillPrice:    fill,
      quoteQty:        qty * fill,
      fee:             { amount: 0, currency: "USD", ratePct: 0 },
      createdAt:       Date.now(),
      updatedAt:       Date.now(),
      rawResponse:     data,
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "Not configured" };
    try {
      await this.tradingDelete(`/v2/orders/${req.exchangeOrderId}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  async getOrder(exchangeOrderId: string, _symbol: string): Promise<StandardOrder | null> {
    if (!this.isConfigured()) return null;
    try {
      const data = await this.tradingGet<AlpacaOrder>(`/v2/orders/${exchangeOrderId}`);
      const fill = parseFloat(data.filled_avg_price ?? "0");
      const qty  = parseFloat(data.filled_qty ?? "0");
      return {
        id:              data.client_order_id ?? exchangeOrderId,
        exchangeOrderId: data.id,
        exchange:        "Alpaca",
        symbol:          this.denormaliseSymbol(data.symbol),
        nativeSymbol:    data.symbol,
        side:            data.side as "buy" | "sell",
        type:            data.type as "market" | "limit",
        status:          data.status === "filled" ? "filled" : "open",
        requestedQty:    parseFloat(data.qty ?? "0"),
        filledQty:       qty,
        avgFillPrice:    fill,
        quoteQty:        qty * fill,
        fee:             { amount: 0, currency: "USD", ratePct: 0 },
        createdAt:       Date.now(),
        updatedAt:       Date.now(),
      };
    } catch { return null; }
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret);
  }

  private authHeaders(): Record<string, string> {
    return {
      "APCA-API-KEY-ID":     this.config.apiKey!,
      "APCA-API-SECRET-KEY": this.config.apiSecret!,
      "Content-Type":        "application/json",
    };
  }

  private tradingGet<T>(path: string): Promise<T> {
    const host = tradingBase();
    return new Promise((resolve, reject) => {
      https.get({ hostname: host, path, headers: this.authHeaders() }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(d) as Record<string, unknown>;
            if (parsed["code"] || parsed["message"]) reject(new Error(String(parsed["message"] ?? parsed["code"])));
            else resolve(parsed as T);
          } catch { reject(new Error(`Alpaca: non-JSON response — ${d.slice(0, 200)}`)); }
        });
      }).on("error", reject);
    });
  }

  private tradingPost<T>(path: string, body: unknown): Promise<T> {
    const host    = tradingBase();
    const bodyStr = JSON.stringify(body);
    const headers = { ...this.authHeaders(), "Content-Length": String(Buffer.byteLength(bodyStr)) };
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: host, path, method: "POST", headers }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(d) as Record<string, unknown>;
            if (parsed["code"] || (res.statusCode && res.statusCode >= 400)) {
              reject(new Error(String(parsed["message"] ?? parsed["code"] ?? `HTTP ${res.statusCode}`)));
            } else resolve(parsed as T);
          } catch { reject(new Error(`Alpaca: non-JSON — ${d.slice(0, 200)}`)); }
        });
      });
      req.on("error", reject);
      req.write(bodyStr);
      req.end();
    });
  }

  private tradingDelete(path: string): Promise<void> {
    const host = tradingBase();
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: host, path, method: "DELETE", headers: this.authHeaders() }, res => {
        res.resume();
        res.on("end", () => res.statusCode && res.statusCode < 300 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`)));
      });
      req.on("error", reject);
      req.end();
    });
  }

  private dataGet<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: "data.alpaca.markets", path, headers: this.authHeaders() }, res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(d) as T); }
          catch { reject(new Error(`Alpaca data: non-JSON — ${d.slice(0, 200)}`)); }
        });
      }).on("error", reject);
    });
  }
}

// ── Alpaca response types ─────────────────────────────────────────────────────

interface AlpacaBar { t: string; o: number; h: number; l: number; c: number; v: number }
interface AlpacaLevel { p: number; s: number }
interface AlpacaAccount { cash: string; portfolio_value: string; buying_power: string }
interface AlpacaPosition { symbol: string; qty: string; asset_class: string; current_price: string }
interface AlpacaOrder {
  id: string; client_order_id?: string; symbol: string;
  side: string; type: string; qty?: string; status: string;
  filled_qty?: string; filled_avg_price?: string;
}
interface AlpacaOrderRequest {
  symbol: string; qty: string; side: string; type: string;
  time_in_force: string; client_order_id?: string; limit_price?: string;
}

function tfToMs(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
    "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
  };
  return map[tf] ?? 300_000;
}
