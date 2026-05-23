import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook,
} from "../types.js";
import { emptyAccount } from "./BinanceAdapter.js";

// ── dYdXAdapter ───────────────────────────────────────────────────────────────
//
// dYdX v4 adapter — PUBLIC endpoints only.
//
// STATUS: coming_soon
//
// dYdX v4 runs on a Cosmos SDK app-chain (dYdX Chain). Authentication is
// wallet-based (Cosmos mnemonic / STARK private key) rather than API key/secret.
// Integrating wallet signing requires a fundamentally different auth flow and
// is planned for a future release.
//
// This adapter provides:
//   ✓  getTicker    — live market data via dYdX v4 indexer REST
//   ✓  getCandles   — historical candles via indexer
//   ✓  getOrderBook — live order book via indexer
//   ✗  getAccount   — requires wallet auth (returns empty account)
//   ✗  placeOrder   — requires wallet auth (throws)
//   ✗  cancelOrder  — requires wallet auth (throws)
//   ✗  getOrder     — requires wallet auth (returns null)

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC-USD", ETHUSD:  "ETH-USD", SOLUSD:  "SOL-USD",
  XRPUSD:  "XRP-USD", DOGEUSD: "DOGE-USD", AVAXUSD: "AVAX-USD",
  LINKUSD: "LINK-USD", ADAUSD: "ADA-USD",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1MIN", "5m": "5MINS", "15m": "15MINS", "30m": "30MINS",
  "1h": "1HOUR", "4h": "4HOURS", "1d": "1DAY",
};

export const DYDX_CONFIG: AdapterConfig = {
  exchange:    "dYdX",
  takerFeePct: 0.05,
  makerFeePct: 0.02,
  rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 300 },
};

export class dYdXAdapter extends BaseExchangeAdapter {
  // dYdX v4 testnet indexer → indexer.v4testnet.dydx.exchange (verified).
  private readonly BASE = this.resolveHost({
    prod:    "indexer.dydx.trade",
    testnet: "indexer.v4testnet.dydx.exchange",
  });

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...DYDX_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? `${s.slice(0, -3)}-USD`; }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("-", ""); }

  async connect(): Promise<void> {
    // Public websocket available: wss://indexer.dydx.trade/v4/ws
    // No auth required for market data
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<dYdXMarketsResp>(`/v4/perpetualMarkets?ticker=${pair}`),
      3, 300, "getTicker",
    );
    const m = data.markets?.[pair];
    if (!m) throw new Error(`dYdX: no market for ${symbol}`);
    const last = parseFloat(m.oraclePrice ?? m.priceChange24H ?? "0");
    return {
      symbol, exchange: "dYdX",
      bid:       parseFloat(m.bestBid ?? "0"),
      ask:       parseFloat(m.bestAsk ?? "0"),
      last,
      volume24h: parseFloat(m.volume24H ?? "0"),
      change24h: parseFloat(m.priceChange24H ?? "0"),
      changePct: 0,
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const resolution = TF_MAP[timeframe] ?? "5MINS";
    const data     = await this.withRetry(
      () => this.get<{ candles: dYdXCandle[] }>(`/v4/candles/perpetualMarkets/${pair}?resolution=${resolution}&limit=${limit}`),
      3, 300, "getCandles",
    );
    return (data.candles ?? []).reverse().map(r => ({
      time:   new Date(r.startedAt).getTime(),
      open:   parseFloat(r.open),
      high:   parseFloat(r.high),
      low:    parseFloat(r.low),
      close:  parseFloat(r.close),
      volume: parseFloat(r.baseTokenVolume ?? "0"),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<{ bids: dYdXLevel[]; asks: dYdXLevel[] }>(`/v4/orderbooks/perpetualMarket/${pair}`),
      3, 300, "getOrderBook",
    );
    return {
      symbol, exchange: "dYdX",
      bids: (data.bids ?? []).slice(0, depth).map(b => ({ price: parseFloat(b.price), qty: parseFloat(b.size) })),
      asks: (data.asks ?? []).slice(0, depth).map(a => ({ price: parseFloat(a.price), qty: parseFloat(a.size) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    // Wallet-based auth not yet implemented
    return emptyAccount("dYdX");
  }

  async placeOrder(_req: PlaceOrderRequest): Promise<StandardOrder> {
    throw new Error("dYdX: wallet-based authentication required — coming soon");
  }

  async cancelOrder(_req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: "dYdX: wallet-based authentication required — coming soon" };
  }

  async getOrder(_exchangeOrderId: string, _symbol: string): Promise<StandardOrder | null> {
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers: { "Accept": "application/json" } }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("dYdX: parse failed")); }
        });
      }).on("error", reject);
    });
  }
}

// ── dYdX API types ────────────────────────────────────────────────────────────
interface dYdXMarketsResp {
  markets?: Record<string, {
    oraclePrice?: string; bestBid?: string; bestAsk?: string;
    volume24H?: string; priceChange24H?: string;
  }>;
}
interface dYdXCandle {
  startedAt: string; open: string; high: string; low: string; close: string; baseTokenVolume?: string;
}
interface dYdXLevel { price: string; size: string; }
