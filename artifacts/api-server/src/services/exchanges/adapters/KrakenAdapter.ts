import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker,
  OrderBook, AssetBalance,
} from "../types.js";

// ── KrakenAdapter ─────────────────────────────────────────────────────────────
//
// Full implementation wrapping Kraken REST API.
// WebSocket support: phase 2 (scaffolded below).

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "XXBTZUSD",
  ETHUSD:  "XETHZUSD",
  SOLUSD:  "SOLUSD",
  XRPUSD:  "XXRPZUSD",
  DOGEUSD: "XDGUSD",
  AVAXUSD: "AVAXUSD",
  LINKUSD: "LINKUSD",
  ADAUSD:  "ADAUSD",
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k])
);

const ASSET_MAP: Record<string, string> = {
  ZUSD: "USD", XXBT: "BTC", XETH: "ETH", SOL: "SOL",
  XXRP: "XRP", XDOGE: "DOGE", AVAX: "AVAX", LINK: "LINK", ADA: "ADA",
};

export const KRAKEN_CONFIG: AdapterConfig = {
  exchange:    "Kraken",
  takerFeePct: 0.26,
  makerFeePct: 0.16,
  rateLimit: { ordersPerSecond: 1, requestsPerMinute: 60 },
};

export class KrakenAdapter extends BaseExchangeAdapter {
  // Kraken Spot has no public sandbox (futures-only sandbox exists but is
  // out of scope for this adapter) — testnet construction must fail loudly.
  private readonly BASE = this.resolveHost({
    prod:    "api.kraken.com",
    testnet: null,
  });
  private orderSeq = 1;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...KRAKEN_CONFIG, ...config });
  }

  // ── Symbol normalisation ──────────────────────────────────────────────────

  normaliseSymbol(symbol: string): string {
    return SYMBOL_MAP[symbol] ?? symbol;
  }

  denormaliseSymbol(native: string): string {
    return REVERSE_MAP[native] ?? native;
  }

  // ── Connection ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    // REST-only for now. WS channels are Phase 2.
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> {
    this.setState("disconnected");
  }

  // ── Market data ───────────────────────────────────────────────────────────

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.krakenPublic<Record<string, KrakenTickerEntry>>(`Ticker?pair=${pair}`),
      3, 400, "getTicker",
    );
    const entry = Object.values(data)[0];
    if (!entry) throw new Error(`Kraken: no ticker for ${symbol}`);
    const last   = parseFloat(entry.c[0]);
    const open24 = parseFloat(entry.o);
    return {
      symbol, exchange: "Kraken", nativeSymbol: pair,
      bid:       parseFloat(entry.b[0]),
      ask:       parseFloat(entry.a[0]),
      last,
      volume24h: parseFloat(entry.v[1]),
      change24h: last - open24,
      changePct: open24 > 0 ? ((last - open24) / open24) * 100 : 0,
      timestamp: Date.now(),
    } as StandardTicker & { nativeSymbol: string };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const interval = this.tfToMinutes(timeframe);
    const since    = Math.floor(Date.now() / 1000) - interval * 60 * limit;
    const data     = await this.withRetry(
      () => this.krakenPublic<Record<string, KrakenOHLC[] | number>>(
        `OHLC?pair=${pair}&interval=${interval}&since=${since}`
      ),
      3, 400, "getCandles",
    );
    const key  = Object.keys(data).find(k => k !== "last") ?? "";
    const rows = (data[key] ?? []) as KrakenOHLC[];
    return rows.slice(-limit).map(r => ({
      time:   r[0] * 1000,
      open:   parseFloat(r[1]),
      high:   parseFloat(r[2]),
      low:    parseFloat(r[3]),
      close:  parseFloat(r[4]),
      volume: parseFloat(r[6]),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.krakenPublic<Record<string, { bids: string[][]; asks: string[][] }>>(
        `Depth?pair=${pair}&count=${depth}`
      ),
      3, 400, "getOrderBook",
    );
    const book = Object.values(data)[0];
    if (!book) throw new Error(`Kraken: no order book for ${symbol}`);
    return {
      symbol, exchange: "Kraken",
      bids: book.bids.map(b => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) })),
      asks: book.asks.map(a => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) })),
      timestamp: Date.now(),
    };
  }

  // ── Account ───────────────────────────────────────────────────────────────

  async getAccount(): Promise<StandardAccount> {
    if (!this.isConfigured()) {
      console.warn("[Kraken] getAccount called but adapter not configured (apiKey/apiSecret missing)");
      throw new Error("Kraken adapter not configured: apiKey/apiSecret missing");
    }
    this.checkRequestRateLimit();
    console.info("[Kraken] getAccount → POST /0/private/Balance");
    const raw = await this.withRetry(
      () => this.krakenPrivate<Record<string, string>>("Balance"),
      3, 500, "getAccount",
    );
    console.info({ assetCount: Object.keys(raw).length }, "[Kraken] Balance response OK");
    const balances: Record<string, AssetBalance> = {};
    let usd = 0;
    for (const [k, v] of Object.entries(raw)) {
      const asset = ASSET_MAP[k] ?? k;
      const total = parseFloat(v);
      balances[asset] = { free: total, locked: 0, total };
      if (asset === "USD") usd = total;
    }
    return {
      exchange: "Kraken", balances,
      totalEquityUSD: usd,
      positions:  [],
      lastUpdated: Date.now(),
    };
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    this.checkOrderRateLimit();
    const pair = this.normaliseSymbol(req.symbol);
    const id   = `KRK-${Date.now()}-${String(this.orderSeq++).padStart(4, "0")}`;

    let krakenOrderId: string | undefined;
    let fillPrice = req.limitPrice ?? 0;

    if (this.isConfigured()) {
      const params: Record<string, string> = {
        pair,
        type:      req.side,
        ordertype: req.type === "market" ? "market" : "limit",
        volume:    req.qty.toFixed(8),
      };
      if (req.limitPrice) params["price"] = req.limitPrice.toFixed(2);

      const result = await this.withRetry(
        () => this.krakenPrivate<{ txid: string[] }>("AddOrder", params),
        3, 500, "placeOrder",
      );
      krakenOrderId = result.txid?.[0];
    } else {
      // Simulation: fetch current price as fill
      try {
        const ticker = await this.getTicker(req.symbol);
        fillPrice    = ticker.last;
      } catch { fillPrice = 0; }
    }

    const quoteQty = req.qty * fillPrice;
    const fee      = this.computeFee(quoteQty, true);

    return {
      id,
      exchangeOrderId: krakenOrderId ?? id,
      exchange:        "Kraken",
      symbol:          req.symbol,
      nativeSymbol:    pair,
      side:            req.side,
      type:            req.type,
      status:          krakenOrderId && req.type !== "market" ? "open" : "filled",
      requestedQty:    req.qty,
      filledQty:       req.type === "market" ? req.qty : 0,
      requestedPrice:  req.limitPrice,
      avgFillPrice:    fillPrice,
      quoteQty,
      fee:             { amount: fee, currency: "USD", ratePct: this.config.takerFeePct, source: "estimate" },
      createdAt:       Date.now(),
      updatedAt:       Date.now(),
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) return { ok: false, reason: "API not configured" };
    try {
      await this.withRetry(
        () => this.krakenPrivate("CancelOrder", { txid: req.exchangeOrderId }),
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
        () => this.krakenPrivate<Record<string, KrakenOrderInfo>>("QueryOrders", { txid: exchangeOrderId }),
        3, 300, "getOrder",
      );
      const raw = data[exchangeOrderId];
      if (!raw) return null;
      return this.normaliseOrderInfo(exchangeOrderId, raw);
    } catch { return null; }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret);
  }

  private krakenSign(path: string, postData: string, nonce: string): string {
    const sha256 = crypto.createHash("sha256").update(nonce + postData).digest();
    return crypto
      .createHmac("sha512", Buffer.from(this.config.apiSecret!, "base64"))
      .update(Buffer.concat([Buffer.from(path), sha256]))
      .digest("base64");
  }

  private krakenPrivate<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const key   = this.config.apiKey!;
    const nonce = Date.now().toString();
    const path  = `/0/private/${endpoint}`;
    const body  = new URLSearchParams({ nonce, ...params }).toString();
    const sign  = this.krakenSign(path, body, nonce);

    console.info({
      endpoint, nonce,
      keyLen: key.length, signLen: sign.length, bodyLen: body.length,
    }, "[Kraken] private request signed");

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: this.BASE, path, method: "POST",
          headers: {
            "API-Key": key, "API-Sign": sign,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        res => {
          let data = "";
          res.on("data", c => { data += c; });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data) as { error: string[]; result: T };
              if (parsed.error?.length) {
                console.error({
                  endpoint, status: res.statusCode, errors: parsed.error,
                }, "[Kraken] API returned error array");
                reject(new Error(`Kraken ${endpoint}: ${parsed.error.join(", ")}`));
              } else {
                console.info({ endpoint, status: res.statusCode }, "[Kraken] private response OK");
                resolve(parsed.result);
              }
            } catch (e) {
              console.error({ endpoint, status: res.statusCode, raw: data.slice(0, 200) }, "[Kraken] parse failed");
              reject(new Error(`Kraken ${endpoint}: parse failed (HTTP ${res.statusCode})`));
            }
          });
        }
      );
      req.on("error", (e) => {
        console.error({ endpoint, err: e.message }, "[Kraken] HTTPS request error");
        reject(e);
      });
      req.write(body);
      req.end();
    });
  }

  private krakenPublic<T>(endpoint: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get(`https://${this.BASE}/0/public/${endpoint}`, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as { error: string[]; result: T };
            if (parsed.error?.length) reject(new Error(parsed.error.join(", ")));
            else resolve(parsed.result);
          } catch { reject(new Error("Kraken: parse failed")); }
        });
      }).on("error", reject);
    });
  }

  private tfToMinutes(tf: string): number {
    const map: Record<string, number> = {
      "1m": 1, "5m": 5, "15m": 15, "30m": 30,
      "1h": 60, "4h": 240, "1d": 1440,
    };
    return map[tf] ?? 15;
  }

  private normaliseOrderInfo(id: string, raw: KrakenOrderInfo): StandardOrder {
    const sym = this.denormaliseSymbol(raw.descr?.pair ?? "");
    const fill = parseFloat(raw.price ?? "0");
    const qty  = parseFloat(raw.vol_exec ?? "0");
    return {
      id, exchangeOrderId: id, exchange: "Kraken",
      symbol: sym, nativeSymbol: raw.descr?.pair ?? "",
      side:   raw.descr?.type as "buy" | "sell" ?? "buy",
      type:   raw.descr?.ordertype as "market" | "limit" ?? "market",
      status: raw.status === "closed" ? "filled" : raw.status === "canceled" ? "cancelled" : "open",
      requestedQty:   parseFloat(raw.vol ?? "0"),
      filledQty:      qty,
      avgFillPrice:   fill,
      quoteQty:       qty * fill,
      fee: raw.fee !== undefined && raw.fee !== null
        ? { amount: parseFloat(raw.fee), currency: "USD", ratePct: this.config.takerFeePct, source: "broker" }
        : { amount: this.computeFee(qty * fill, true), currency: "USD", ratePct: this.config.takerFeePct, source: "estimate" },
      createdAt: raw.opentm ? raw.opentm * 1000 : Date.now(),
      updatedAt: Date.now(),
      rawResponse: raw,
    };
  }
}

// ── Kraken API response types (internal) ──────────────────────────────────────

interface KrakenTickerEntry {
  a: [string, string, string]; // ask
  b: [string, string, string]; // bid
  c: [string, string];         // last trade
  v: [string, string];         // volume
  p: [string, string];         // vwap
  t: [number, number];         // trade count
  l: [string, string];         // low
  h: [string, string];         // high
  o: string;                   // today's open
}

type KrakenOHLC = [number, string, string, string, string, string, string, number];

interface KrakenOrderInfo {
  status:   string;
  vol:      string;
  vol_exec: string;
  price:    string;
  fee:      string;
  opentm:   number;
  descr: {
    pair:      string;
    type:      string;
    ordertype: string;
  };
}
