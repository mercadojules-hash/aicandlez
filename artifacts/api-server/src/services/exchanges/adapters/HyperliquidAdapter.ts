import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook,
} from "../types.js";
import { emptyAccount } from "./BinanceAdapter.js";
import { signL1Action, walletAddressFromPrivateKey } from "./HyperliquidSigning.js";

// ── HyperliquidAdapter ────────────────────────────────────────────────────────
//
// Hyperliquid L1 perps adapter.
//
// Hyperliquid authenticates writes with EIP-712 signatures over a
// "phantom Agent" derived from msgpack(action) + nonce_be8 + vault byte.
// There is no API key / secret pair — the operator provides:
//
//   apiKey    → wallet address (0x-prefixed, lowercase); derived from
//               the private key when omitted.
//   apiSecret → 32-byte ETH private key hex (with or without 0x prefix);
//               this can be the master wallet or a Hyperliquid agent key.
//
// The exchange endpoint is the same testnet/prod hostname the read-side
// already uses; `AdapterConfig.testnet` selects the host AND drives the
// phantom agent's `source` field ("a" mainnet / "b" testnet).

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

interface MetaCacheEntry {
  index:      number;
  szDecimals: number;
}

export class HyperliquidAdapter extends BaseExchangeAdapter {
  // Hyperliquid testnet → api.hyperliquid-testnet.xyz (verified public sandbox).
  private readonly BASE = this.resolveHost({
    prod:    "api.hyperliquid.xyz",
    testnet: "api.hyperliquid-testnet.xyz",
  });

  private readonly isMainnet: boolean;
  private metaCache: Map<string, MetaCacheEntry> = new Map();
  private metaCacheAt = 0;
  private walletAddress: string | null = null;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...HYPERLIQUID_CONFIG, ...config });
    this.isMainnet = !this.config.testnet;
    if (this.config.apiSecret) {
      try {
        this.walletAddress = this.config.apiKey?.startsWith("0x")
          ? this.config.apiKey.toLowerCase()
          : walletAddressFromPrivateKey(this.normalisePrivKey());
      } catch {
        // address resolution failures surface at first authenticated call
        this.walletAddress = null;
      }
    }
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
    // Real clearinghouse snapshot for the configured wallet. The base
    // implementation still returns the empty shell when no wallet is
    // configured so adapter consumers never crash.
    if (!this.walletAddress) return emptyAccount("Hyperliquid");
    try {
      const state = await this.infoPost<HLClearinghouse>({
        type: "clearinghouseState",
        user: this.walletAddress,
      });
      const usdc = parseFloat(state.withdrawable ?? state.marginSummary?.accountValue ?? "0");
      return {
        exchange:       "Hyperliquid",
        balances:       { USDC: { free: usdc, locked: 0, total: usdc } },
        totalEquityUSD: parseFloat(state.marginSummary?.accountValue ?? String(usdc)),
        positions:      [],
        lastUpdated:    Date.now(),
      };
    } catch {
      return emptyAccount("Hyperliquid");
    }
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.assertSignable();
    this.checkOrderRateLimit();

    const coin = this.normaliseSymbol(req.symbol);
    const meta = await this.getMeta(coin);
    const ticker = await this.getTicker(req.symbol);

    // Market orders on Hyperliquid are IOC limit orders priced aggressively
    // inside the protocol's 10% slippage band. We round to a tick-safe price
    // (5 sig-figs, ≤ 6-szDecimals decimal places) and a sz-safe quantity.
    const isBuy = req.side === "buy";
    const rawPrice = req.limitPrice ?? ticker.last * (isBuy ? 1.05 : 0.95);
    const priceStr = this.formatPrice(rawPrice, meta.szDecimals);
    const sizeStr  = req.qty.toFixed(meta.szDecimals);

    const action = {
      type: "order" as const,
      orders: [{
        a: meta.index,
        b: isBuy,
        p: priceStr,
        s: sizeStr,
        r: false,
        t: { limit: { tif: req.type === "limit" ? "Gtc" : "Ioc" } },
      }],
      grouping: "na" as const,
    };

    const raw = await this.signedExchange<HLOrderResp>(action);
    const placedAt = Date.now();
    const status = raw?.response?.data?.statuses?.[0];
    const oid =
      (status && "filled" in status && status.filled?.oid)
      ?? (status && "resting" in status && status.resting?.oid)
      ?? 0;
    const errMsg = status && "error" in status ? status.error : undefined;
    if (!oid && errMsg) {
      throw new Error(`Hyperliquid: ${errMsg}`);
    }
    if (!oid) {
      throw new Error(`Hyperliquid: order rejected (raw: ${JSON.stringify(raw)})`);
    }

    // Re-query so the broker fee is resolved straight from the fill record.
    const queried = await this.getOrder(String(oid), req.symbol);
    if (queried) return queried;

    // Defensive fallback — shouldn't happen on a successful fill but keeps
    // the contract honest if the fills API lags by a beat.
    const filledQty = status && "filled" in status ? parseFloat(status.filled.totalSz) : 0;
    const fillPrice = status && "filled" in status ? parseFloat(status.filled.avgPx) : parseFloat(priceStr);
    const quoteQty  = filledQty * fillPrice;
    return {
      id:              String(oid),
      exchangeOrderId: String(oid),
      exchange:        "Hyperliquid",
      symbol:          req.symbol,
      nativeSymbol:    coin,
      side:            req.side,
      type:            req.type,
      status:          filledQty > 0 ? "filled" : "open",
      requestedQty:    req.qty,
      filledQty,
      avgFillPrice:    fillPrice,
      quoteQty,
      fee: {
        amount:   this.computeFee(quoteQty, true),
        currency: "USDC",
        ratePct:  this.config.takerFeePct,
        source:   "estimate",
      },
      createdAt: placedAt,
      updatedAt: placedAt,
      rawResponse: raw,
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.config.apiSecret) {
      return { ok: false, reason: "Hyperliquid: wallet private key not configured" };
    }
    try {
      this.checkOrderRateLimit();
      const coin = this.normaliseSymbol(req.symbol);
      const meta = await this.getMeta(coin);
      const oid  = parseInt(req.exchangeOrderId, 10);
      if (!Number.isFinite(oid)) {
        return { ok: false, reason: `invalid order id: ${req.exchangeOrderId}` };
      }
      const action = {
        type: "cancel" as const,
        cancels: [{ a: meta.index, o: oid }],
      };
      const raw = await this.signedExchange<HLCancelResp>(action);
      const status = raw?.response?.data?.statuses?.[0];
      if (status === "success") return { ok: true };
      if (typeof status === "object" && status && "error" in status) {
        return { ok: false, reason: status.error };
      }
      return { ok: false, reason: `Hyperliquid: ${JSON.stringify(raw)}` };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  async getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null> {
    if (!this.walletAddress) return null;
    try {
      const oidNum = parseInt(exchangeOrderId, 10);
      if (!Number.isFinite(oidNum)) return null;

      const coin = this.normaliseSymbol(symbol);
      const status = await this.infoPost<HLOrderStatus>({
        type: "orderStatus", user: this.walletAddress, oid: oidNum,
      });
      const wrapper = status?.order;
      const order = wrapper?.order;
      if (!order) return null;
      const wrapperStatus = wrapper.status ?? wrapper.statusType;

      // Pull this fill out of the recent user-fills window to get the
      // broker-sourced fee + filled price.
      const since = Date.now() - 10 * 60_000;
      const fills = await this.infoPost<HLFill[]>({
        type: "userFillsByTime", user: this.walletAddress, startTime: since,
      }).catch(() => [] as HLFill[]);

      let filledQty = parseFloat(order.origSz) - parseFloat(order.sz ?? "0");
      let avgPrice  = parseFloat(order.limitPx ?? "0");
      let feeAmount = 0;
      let feeCcy    = "USDC";
      let hasBrokerFee = false;
      let quoteQty  = 0;

      const myFills = fills.filter(f => Number(f.oid) === oidNum);
      if (myFills.length > 0) {
        let weightedPriceVol = 0;
        let totalSz = 0;
        for (const f of myFills) {
          const sz = parseFloat(f.sz);
          const px = parseFloat(f.px);
          weightedPriceVol += sz * px;
          totalSz += sz;
          feeAmount += parseFloat(f.fee ?? "0");
          if (f.feeToken) feeCcy = f.feeToken;
          if (f.fee != null && f.fee !== "") hasBrokerFee = true;
        }
        if (totalSz > 0) {
          avgPrice = weightedPriceVol / totalSz;
          filledQty = totalSz;
          quoteQty  = weightedPriceVol;
        }
      } else {
        quoteQty = filledQty * avgPrice;
      }

      const orderStatus: StandardOrder["status"] =
        wrapperStatus === "filled"
          ? "filled"
          : wrapperStatus === "canceled" || wrapperStatus === "marginCanceled"
            ? "cancelled"
            : filledQty > 0 && filledQty < parseFloat(order.origSz)
              ? "partial"
              : "open";

      const fee = hasBrokerFee
        ? {
            amount:   feeAmount,
            currency: feeCcy,
            ratePct:  this.config.takerFeePct,
            source:   "broker" as const,
          }
        : {
            amount:   this.computeFee(quoteQty, true),
            currency: feeCcy,
            ratePct:  this.config.takerFeePct,
            source:   "estimate" as const,
          };

      return {
        id:              String(oidNum),
        exchangeOrderId: String(oidNum),
        exchange:        "Hyperliquid",
        symbol,
        nativeSymbol:    coin,
        side:            order.side === "B" ? "buy" : "sell",
        type:            order.orderType === "Limit" ? "limit" : "market",
        status:          orderStatus,
        requestedQty:    parseFloat(order.origSz),
        filledQty,
        avgFillPrice:    avgPrice,
        quoteQty,
        fee,
        createdAt: order.timestamp ?? Date.now(),
        updatedAt: Date.now(),
        rawResponse: { status, fills: myFills },
      };
    } catch {
      return null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertSignable(): void {
    if (!this.config.apiSecret) {
      throw new Error("Hyperliquid: wallet private key (apiSecret) not configured");
    }
  }

  private normalisePrivKey(): string {
    return this.config.apiSecret!.startsWith("0x")
      ? this.config.apiSecret!.slice(2)
      : this.config.apiSecret!;
  }

  /**
   * Format a price for Hyperliquid: at most 5 significant figures, at most
   * (6 - szDecimals) decimal places. For BTC (szDecimals=5) that means
   * integer-rounded prices, which sit comfortably inside the protocol's
   * IOC slippage band for an aggressive marketable limit.
   */
  private formatPrice(price: number, szDecimals: number): string {
    const maxDecimals = Math.max(0, 6 - szDecimals);
    // Round to 5 sig figs first.
    const sig5 = parseFloat(price.toPrecision(5));
    return sig5.toFixed(maxDecimals);
  }

  private async getMeta(coin: string): Promise<MetaCacheEntry> {
    const FRESH_MS = 60_000;
    if (this.metaCache.size === 0 || Date.now() - this.metaCacheAt > FRESH_MS) {
      const meta = await this.infoPost<HLPerpMeta>({ type: "meta" });
      this.metaCache = new Map();
      (meta.universe ?? []).forEach((u, i) => {
        this.metaCache.set(u.name, { index: i, szDecimals: u.szDecimals ?? 0 });
      });
      this.metaCacheAt = Date.now();
    }
    const hit = this.metaCache.get(coin);
    if (!hit) throw new Error(`Hyperliquid: unknown coin ${coin}`);
    return hit;
  }

  private tfToMs(tf: string): number {
    const map: Record<string, number> = {
      "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
      "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
    };
    return map[tf] ?? 300_000;
  }

  private infoPost<T>(payload: Record<string, unknown>): Promise<T> {
    return this.post<T>("/info", JSON.stringify(payload));
  }

  private async signedExchange<T>(action: unknown): Promise<T> {
    const nonce = Date.now();
    const sig = signL1Action(this.normalisePrivKey(), action, nonce, this.isMainnet);
    const body = JSON.stringify({
      action,
      nonce,
      signature: sig,
      vaultAddress: null,
    });
    return this.post<T>("/exchange", body);
  }

  private post<T>(path: string, body: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.BASE, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error(`Hyperliquid: parse failed (${path})`)); }
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

interface HLPerpMeta {
  universe?: { name: string; szDecimals?: number }[];
}

interface HLClearinghouse {
  withdrawable?: string;
  marginSummary?: { accountValue?: string };
}

interface HLOrderResp {
  status?: string;
  response?: {
    type?: string;
    data?: {
      statuses?: Array<
        | { resting: { oid: number } }
        | { filled: { oid: number; totalSz: string; avgPx: string } }
        | { error: string }
      >;
    };
  };
}

interface HLCancelResp {
  status?: string;
  response?: {
    type?: string;
    data?: { statuses?: Array<"success" | { error: string }> };
  };
}

interface HLOrderStatus {
  status?: string;
  order?: {
    order: {
      coin?: string;
      side: "B" | "A";
      limitPx?: string;
      sz?: string;
      origSz: string;
      orderType?: string;
      timestamp?: number;
    };
    status?: string;
    statusType?: string;
  };
}

interface HLFill {
  oid: number;
  px: string;
  sz: string;
  side?: string;
  fee?: string;
  feeToken?: string;
  time?: number;
}
