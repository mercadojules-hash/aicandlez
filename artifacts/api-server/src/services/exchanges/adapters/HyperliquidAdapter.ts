import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook,
} from "../types.js";
import { emptyAccount } from "./BinanceAdapter.js";

// ── HyperliquidAdapter ────────────────────────────────────────────────────────
//
// Hyperliquid L2 perps adapter — PUBLIC endpoints only.
//
// STATUS: coming_soon
//
// Hyperliquid uses Ethereum private-key signing (EIP-712) for all
// authenticated requests. There is no API key/secret model — all orders
// and account operations are signed with an ETH private key or an
// agent wallet.  Wallet integration is planned for a future release.
//
// This adapter provides:
//   ✓  getTicker    — via Hyperliquid Info API
//   ✓  getCandles   — via Hyperliquid Info API
//   ✓  getOrderBook — via Hyperliquid Info API
//   ✗  getAccount   — requires wallet auth (returns empty account)
//   ✗  placeOrder   — requires wallet auth (throws)
//   ✗  cancelOrder  — requires wallet auth (throws)
//   ✗  getOrder     — requires wallet auth (returns null)

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC",  ETHUSD:  "ETH",  SOLUSD:  "SOL",
  XRPUSD:  "XRP",  DOGEUSD: "DOGE", AVAXUSD: "AVAX",
  LINKUSD: "LINK", ADAUSD:  "ADA",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

// Hyperliquid candle interval strings
const TF_MAP: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1d",
};

export const HYPERLIQUID_CONFIG: AdapterConfig = {
  exchange:    "Hyperliquid",
  takerFeePct: 0.05,
  makerFeePct: 0.02,
  rateLimit:   { ordersPerSecond: 5, requestsPerMinute: 300 },
};

export class HyperliquidAdapter extends BaseExchangeAdapter {
  private readonly BASE = "api.hyperliquid.xyz";

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...HYPERLIQUID_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? s.replace("USD", ""); }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? `${s}USD`; }

  async connect(): Promise<void> {
    // Public websocket: wss://api.hyperliquid.xyz/ws (no auth needed for data)
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const coin = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.infoPost<HLMeta>({ type: "metaAndAssetCtxs" }),
      3, 300, "getTicker",
    );
    const idx  = (data[0]?.universe ?? []).findIndex(a => a.name === coin);
    const ctx  = idx >= 0 ? data[1]?.[idx] : undefined;
    if (!ctx) throw new Error(`Hyperliquid: no market for ${symbol}`);
    const mid = parseFloat(ctx.midPx ?? ctx.markPx ?? "0");
    return {
      symbol, exchange: "Hyperliquid",
      bid:       mid * 0.9998,
      ask:       mid * 1.0002,
      last:      mid,
      volume24h: parseFloat(ctx.dayNtlVlm ?? "0"),
      change24h: 0,
      changePct: 0,
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const coin  = this.normaliseSymbol(symbol);
    const interval = TF_MAP[timeframe] ?? "5m";
    const endMs = Date.now();
    const startMs = endMs - limit * (this.tfToMs(timeframe));
    const data  = await this.withRetry(
      () => this.infoPost<HLCandle[]>({ type: "candleSnapshot", req: { coin, interval, startTime: startMs, endTime: endMs } }),
      3, 300, "getCandles",
    );
    return (data ?? []).map(r => ({
      time:   r.t,
      open:   parseFloat(r.o),
      high:   parseFloat(r.h),
      low:    parseFloat(r.l),
      close:  parseFloat(r.c),
      volume: parseFloat(r.v),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const coin = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.infoPost<{ levels: [HLLevel[], HLLevel[]] }>({ type: "l2Book", coin }),
      3, 300, "getOrderBook",
    );
    const [bids = [], asks = []] = data.levels ?? [];
    return {
      symbol, exchange: "Hyperliquid",
      bids: bids.slice(0, depth).map(b => ({ price: parseFloat(b.px), qty: parseFloat(b.sz) })),
      asks: asks.slice(0, depth).map(a => ({ price: parseFloat(a.px), qty: parseFloat(a.sz) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    // Wallet-based auth (EIP-712) not yet implemented
    return emptyAccount("Hyperliquid");
  }

  async placeOrder(_req: PlaceOrderRequest): Promise<StandardOrder> {
    throw new Error("Hyperliquid: Ethereum wallet signing required — coming soon");
  }

  async cancelOrder(_req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: "Hyperliquid: Ethereum wallet signing required — coming soon" };
  }

  async getOrder(_exchangeOrderId: string, _symbol: string): Promise<StandardOrder | null> {
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private tfToMs(tf: string): number {
    const map: Record<string, number> = {
      "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
      "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
    };
    return map[tf] ?? 300_000;
  }

  private infoPost<T>(payload: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path: "/info", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("Hyperliquid: parse failed")); }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }
}

// ── Hyperliquid API types ─────────────────────────────────────────────────────
type HLMeta = [
  { universe?: { name: string }[] },
  ({ midPx?: string; markPx?: string; dayNtlVlm?: string } | undefined)[]
];
interface HLCandle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface HLLevel  { px: string; sz: string; n: number; }
