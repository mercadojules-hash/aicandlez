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
  // Coinbase Advanced Trade has no public sandbox we can target — testnet
  // construction must fail loudly.
  private readonly BASE = this.resolveHost({
    prod:    "api.coinbase.com",
    testnet: null,
  });
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
      fee:             { amount: fee, currency: "USD", ratePct: this.config.takerFeePct, source: "estimate" },
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
      const hasBroker = data.order.total_fees != null && data.order.total_fees !== "";
      const fee = hasBroker
        ? {
            amount:   parseFloat(data.order.total_fees!),
            currency: "USD",
            ratePct:  this.config.takerFeePct,
            source:   "broker" as const,
          }
        : {
            amount:   (qty * fill) * this.config.takerFeePct / 100,
            currency: "USD",
            ratePct:  this.config.takerFeePct,
            source:   "estimate" as const,
          };
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
        fee,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
    } catch { return null; }
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  private isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret);
  }

  /**
   * Key format detection:
   *   PEM secret (-----BEGIN…) → introspect actual key material:
   *       ed25519  → EdDSA JWT (PKCS#8-wrapped Ed25519, new Coinbase format)
   *       ec       → ES256 JWT (SEC1/PKCS#8 ECDSA P-256, CDP org key)
   *   UUID (36 chars) + 64-byte base64 secret → EdDSA JWT (raw Ed25519 seed)
   *   "organizations/…" key id (legacy heuristic) → ES256 JWT
   *   anything else → legacy HMAC-SHA256
   *
   * Routing PEM purely on `-----BEGIN` substring was unsafe — newer
   * Coinbase Advanced Trade keys are Ed25519 in a `-----BEGIN PRIVATE KEY-----`
   * PKCS#8 wrapper, and feeding them to crypto.createSign("SHA256") (ES256
   * path) throws `error:1E08010C:DECODER routines::unsupported`.
   */
  private get keyType(): "cdp-org" | "cdp-uuid-pem" | "cdp-uuid" | "hmac" {
    const k = this.config.apiKey  ?? "";
    const s = this.config.apiSecret ?? "";
    if (s.includes("-----BEGIN")) {
      try {
        const pem = this.normalisePem(s);
        const kt  = crypto.createPrivateKey(pem).asymmetricKeyType;
        if (kt === "ed25519") return "cdp-uuid-pem";
        if (kt === "ec")      return "cdp-org";
        throw new Error(
          `Coinbase secret: unsupported key type "${kt}". Expected Ed25519 or EC (P-256). ` +
          `Regenerate the key in Coinbase Advanced Trade and paste the full -----BEGIN/-----END block.`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Surface a clear, actionable error instead of letting OpenSSL throw
        // its cryptic "DECODER routines::unsupported" downstream.
        throw new Error(
          `Coinbase secret could not be parsed as a private key. ` +
          `Make sure you copied the entire key including the -----BEGIN PRIVATE KEY----- ` +
          `and -----END PRIVATE KEY----- lines. (parser said: ${msg})`,
        );
      }
    }
    if (k.startsWith("organizations/")) return "cdp-org";
    if (/^[0-9a-f-]{36}$/.test(k) && Buffer.from(s, "base64").length === 64) return "cdp-uuid";
    return "hmac";
  }

  /**
   * Reconstruct a valid PEM EC private key from however the secret is stored.
   * Handles:
   *   1. Full multi-line PEM — normalise escaped newlines, pass through
   *   2. Single-line PEM (browser paste into <input> strips newlines) —
   *      detect header/footer, extract body, rewrap with real newlines
   *   3. PKCS#8 header ("-----BEGIN PRIVATE KEY-----") — preserved
   *   4. Bare base64 DER — wrap with SEC1 EC PRIVATE KEY header/footer
   */
  private normalisePem(raw: string): string {
    // Step 1: normalise literal "\n" escapes to real newlines, trim outer whitespace.
    const s = raw.replace(/\\n/g, "\n").trim();

    // Step 2: detect PEM header/footer regardless of whitespace style.
    //   Matches: -----BEGIN <LABEL>-----   …body…   -----END <LABEL>-----
    //   The body may be split by real newlines OR spaces OR nothing.
    const m = s.match(/-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]+?)-----END \1-----/);
    if (m) {
      const label = m[1]!;                          // e.g. "EC PRIVATE KEY" or "PRIVATE KEY"
      const body  = m[2]!.replace(/\s+/g, "");       // strip ALL whitespace from body
      const lines: string[] = [];
      for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));
      return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
    }

    // Step 3: no header → assume bare base64 DER, wrap as SEC1 EC private key.
    const b64 = s.replace(/\s+/g, "");
    const lines: string[] = [];
    for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
    return `-----BEGIN EC PRIVATE KEY-----\n${lines.join("\n")}\n-----END EC PRIVATE KEY-----\n`;
  }

  /** Strip query string from path for use in JWT uri claim */
  private jwtPath(path: string): string {
    return path.split("?")[0]!;
  }

  /**
   * ES256 JWT for CDP org keys (organizations/… key name + ECDSA P-256 private key).
   */
  private buildEs256Jwt(method: string, path: string): string {
    const keyName = this.config.apiKey!;
    const pem     = this.normalisePem(this.config.apiSecret!);
    const nonce   = crypto.randomBytes(16).toString("hex");
    const now     = Math.floor(Date.now() / 1000);

    const header  = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyName, nonce })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      sub: keyName, iss: "coinbase-cloud",
      nbf: now, exp: now + 120,
      uri: `${method} ${this.BASE}${this.jwtPath(path)}`,
    })).toString("base64url");

    const sigInput = `${header}.${payload}`;
    const signer   = crypto.createSign("SHA256");
    signer.update(sigInput);
    const sigBuf   = signer.sign(
      { key: pem, dsaEncoding: "ieee-p1363" } as Parameters<typeof signer.sign>[0],
    );
    return `${sigInput}.${sigBuf.toString("base64url")}`;
  }

  /**
   * EdDSA JWT for new CDP UUID keys (raw 64-byte base64 secret format).
   * Secret is base64-encoded 64 bytes: [0..31] = Ed25519 private seed, [32..63] = public key.
   */
  private buildEdDsaJwt(method: string, path: string): string {
    const keyName  = this.config.apiKey!;
    const rawBytes = Buffer.from(this.config.apiSecret!, "base64"); // 64 bytes
    const privKey  = crypto.createPrivateKey({
      key:    { kty: "OKP", crv: "Ed25519", d: rawBytes.slice(0, 32).toString("base64url"), x: rawBytes.slice(32).toString("base64url") },
      format: "jwk",
    });
    return this.signEdDsaJwt(keyName, privKey, method, path);
  }

  /**
   * EdDSA JWT for PEM-wrapped Ed25519 keys (PKCS#8 -----BEGIN PRIVATE KEY-----).
   * This is the format Coinbase Advanced Trade now ships by default.
   */
  private buildEdDsaJwtFromPem(method: string, path: string): string {
    const keyName = this.config.apiKey!;
    const pem     = this.normalisePem(this.config.apiSecret!);
    const privKey = crypto.createPrivateKey(pem);
    return this.signEdDsaJwt(keyName, privKey, method, path);
  }

  private signEdDsaJwt(keyName: string, privKey: crypto.KeyObject, method: string, path: string): string {
    const nonce   = crypto.randomBytes(16).toString("hex");
    const now     = Math.floor(Date.now() / 1000);

    const header  = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: keyName, nonce })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      sub: keyName, iss: "coinbase-cloud",
      nbf: now, exp: now + 120,
      uri: `${method} ${this.BASE}${this.jwtPath(path)}`,
    })).toString("base64url");

    const sigInput = `${header}.${payload}`;
    const sig      = crypto.sign(null, Buffer.from(sigInput), privKey).toString("base64url");
    return `${sigInput}.${sig}`;
  }

  /**
   * Legacy HMAC-SHA256 signing (Coinbase Pro / older Advanced Trade keys).
   */
  private hmacSign(timestamp: string, method: string, path: string, body = ""): string {
    const secretBytes = Buffer.from(this.config.apiSecret!, "base64");
    return crypto
      .createHmac("sha256", secretBytes)
      .update(`${timestamp}${method.toUpperCase()}${path}${body}`)
      .digest("base64");
  }

  private authHeaders(method: string, path: string, body = ""): Record<string, string> {
    const type = this.keyType;
    if (type === "cdp-org") {
      return { Authorization: `Bearer ${this.buildEs256Jwt(method, path)}`, "Content-Type": "application/json" };
    }
    if (type === "cdp-uuid-pem") {
      return { Authorization: `Bearer ${this.buildEdDsaJwtFromPem(method, path)}`, "Content-Type": "application/json" };
    }
    if (type === "cdp-uuid") {
      return { Authorization: `Bearer ${this.buildEdDsaJwt(method, path)}`, "Content-Type": "application/json" };
    }
    const ts = Math.floor(Date.now() / 1000).toString();
    return {
      "CB-ACCESS-KEY":       this.config.apiKey!,
      "CB-ACCESS-SIGN":      this.hmacSign(ts, method, path, body),
      "CB-ACCESS-TIMESTAMP": ts,
      "Content-Type":        "application/json",
    };
  }

  private parseOrThrow<T>(data: string, op: string): T {
    let parsed: unknown;
    try { parsed = JSON.parse(data); } catch { throw new Error(`${op}: non-JSON response — ${data.slice(0, 200)}`); }
    const p = parsed as Record<string, unknown>;
    if (p["error"] || p["message"]) {
      throw new Error(`${op}: ${p["error"] ?? p["message"]}`);
    }
    return parsed as T;
  }

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers: this.authHeaders("GET", path) }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => { try { resolve(this.parseOrThrow<T>(data, "GET " + path)); } catch (e) { reject(e); } });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers: this.authHeaders("GET", path) }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => { try { resolve(this.parseOrThrow<T>(data, "GET " + path)); } catch (e) { reject(e); } });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: unknown): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const headers = { ...this.authHeaders("POST", path, bodyStr), "Content-Length": String(Buffer.byteLength(bodyStr)) };
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: this.BASE, path, method: "POST", headers }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => { try { resolve(this.parseOrThrow<T>(data, "POST " + path)); } catch (e) { reject(e); } });
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
  average_filled_price?: string; filled_size?: string; total_fees?: string;
  order_configuration?: { market_market_ioc?: { quote_size?: string } };
}
interface CbOrderResponse {
  success: boolean; order_id?: string;
  order?: { average_filled_price?: string; filled_size?: string };
}
