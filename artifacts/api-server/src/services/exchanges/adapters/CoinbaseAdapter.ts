import crypto from "node:crypto";
import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker,
  OrderBook,
} from "../types.js";
import { emptyAccount, simulatedOrder } from "./BinanceAdapter.js";
import { logger } from "../../../lib/logger.js";
import { SYMBOL_MAP as COINBASE_PRODUCT_IDS } from "../../../lib/marketData.js";

// 2026-05-28 — Coinbase rejection instrumentation. Customer hit
// "Exchange rejected order — Unauthorized" with no surfaced status code
// or response body. These helpers preserve the full Coinbase HTTP
// response (status + body, capped to a sane length) so on-call can
// distinguish 401 Unauthorized (auth/scope) vs 400 Bad Request
// (malformed payload) vs 403 Forbidden (IP allow-list / suspended key)
// vs 429 (rate limit) without re-instrumenting on every incident.
const COINBASE_ERR_BODY_MAX = 1500;

/** Thrown by HTTP helpers when Coinbase returns non-2xx or a JSON error. */
class CoinbaseHttpError extends Error {
  readonly statusCode: number;
  readonly rawBody:    string;
  readonly endpoint:   string;
  readonly method:     string;
  constructor(method: string, endpoint: string, statusCode: number, rawBody: string, summary: string) {
    super(`Coinbase ${method} ${endpoint} → ${statusCode}: ${summary}`);
    this.name       = "CoinbaseHttpError";
    this.statusCode = statusCode;
    this.rawBody    = rawBody.slice(0, COINBASE_ERR_BODY_MAX);
    this.endpoint   = endpoint;
    this.method     = method;
  }
}

/** Best-effort one-shot summary of the failure for the surfaced error text. */
function summariseCoinbaseError(raw: string): string {
  if (!raw) return "(empty body)";
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const parts: string[] = [];
    if (p["error"])            parts.push(String(p["error"]));
    if (p["error_response"])   parts.push(JSON.stringify(p["error_response"]));
    if (p["message"])          parts.push(String(p["message"]));
    if (p["error_details"])    parts.push(JSON.stringify(p["error_details"]));
    if (p["failure_reason"])   parts.push(String(p["failure_reason"]));
    if (p["preview_failure_reason"]) parts.push(String(p["preview_failure_reason"]));
    return parts.length > 0 ? parts.join(" · ") : raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

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
//
// Coinbase Advanced Trade product_ids are dash-separated (BASE-QUOTE). The
// engine emits dashless symbols ("NEARUSD"). The single source of truth for
// the engine→Coinbase mapping is `COINBASE_SYMBOLS` in lib/marketData.ts
// (re-exported there as SYMBOL_MAP) — it already carries every Coinbase
// rebrand that dash-insertion cannot derive (RNDR→RENDER, MATIC→POL, …).
// `normaliseSymbol` consults that canonical map first and falls back to
// algorithmic dash-insertion before the quote currency, so any analyzed
// symbol not yet in the map is still tradeable instead of being silently
// rejected at the broker with "Invalid product_id".

// First-occurrence-wins reverse map (engine-native ← product_id) so legacy
// aliases (e.g. POL-USD ← POLUSD, not MATICUSD) resolve to the canonical key.
const REVERSE_MAP: Record<string, string> = {};
for (const [engineSym, productId] of Object.entries(COINBASE_PRODUCT_IDS)) {
  if (!(productId in REVERSE_MAP)) REVERSE_MAP[productId] = engineSym;
}

// Quote currencies Coinbase quotes against. Longest-first so "USDC"/"USDT"
// match before "USD".
const QUOTE_CURRENCIES = ["USDC", "USDT", "USDS", "USD", "EUR", "GBP", "BTC", "ETH"];

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
    const sym = symbol.trim().toUpperCase();
    // Already a Coinbase product_id (BASE-QUOTE).
    if (sym.includes("-")) return sym;
    // Canonical engine→Coinbase map (carries rebrands like RNDR→RENDER).
    const mapped = COINBASE_PRODUCT_IDS[sym];
    if (mapped) return mapped;
    // Derive: insert a dash before the recognised quote currency.
    for (const quote of QUOTE_CURRENCIES) {
      if (sym.length > quote.length && sym.endsWith(quote)) {
        return `${sym.slice(0, -quote.length)}-${quote}`;
      }
    }
    // Unknown quote — return unchanged (broker will reject loudly).
    return sym;
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

    // Coinbase users commonly park trading capital in USDC rather than USD
    // — Advanced Trade settles spot orders against either side of the
    // book, so USDC is genuinely deployable buying power. The previous
    // implementation summed only `currency === "USD"`, which silently
    // understated equity (real-world report: $39 USD + $604 USDC reported
    // as $39, breaking the user's trust in the runtime equity display).
    //
    // Scope of USD-pegged stables counted here is intentionally narrow
    // (USDC only). Wider stables (USDT/DAI/PYUSD) can de-peg and need
    // a price check before being treated as 1:1 deployable equity — out
    // of scope for this conservative first pass. The `usdBreakdown`
    // field surfaces the split so the UI can render USD Cash / USDC
    // Collateral / Total Deployable Equity separately.
    const STABLECOIN_ASSETS = new Set(["USDC"]);
    let cash             = 0;
    let stablecoin       = 0;
    const stablecoinHit: Set<string> = new Set();
    for (const acc of data.accounts ?? []) {
      const asset  = acc.currency;
      const avail  = parseFloat(acc.available_balance.value);
      const hold   = parseFloat(acc.hold.value);
      balances[asset] = { free: avail, locked: hold, total: avail + hold };
      if (asset === "USD") {
        cash += avail + hold;
      } else if (STABLECOIN_ASSETS.has(asset)) {
        const amt = avail + hold;
        if (amt > 0) {
          stablecoin += amt;
          stablecoinHit.add(asset);
        }
      }
    }
    const totalEquityUSD = cash + stablecoin;
    return {
      exchange: "Coinbase",
      balances,
      totalEquityUSD,
      usdBreakdown: {
        cash,
        stablecoin,
        total:            totalEquityUSD,
        stablecoinAssets: Array.from(stablecoinHit).sort(),
      },
      positions:   [],
      lastUpdated: Date.now(),
    };
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
      // Coinbase `market_market_ioc`: a market SELL MUST specify `base_size`
      // (the quantity of the base asset); `quote_size` is BUY-only. The engine
      // always sizes orders in base units (`req.qty` = base quantity), so use
      // `base_size` for both sides. The previous `quote_size` form both used a
      // SELL-invalid field AND miscomputed the value (`qty * (limitPrice ?? 1)`
      // collapsed to the base quantity, not the USD notional).
      body["order_configuration"] = { market_market_ioc: { base_size: req.qty.toFixed(8) } };
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

  /**
   * 2026-05-28 — rewritten to preserve the raw HTTP status code and full
   * response body via `CoinbaseHttpError`. Previously a 401 with body
   * `{ "error": "Unauthorized" }` was surfaced as the bare string
   * "Unauthorized" with no status code, no endpoint, no key-type context,
   * no structured log line — making customer auth rejections impossible
   * to triage without re-instrumenting on every incident.
   */
  private parseOrThrow<T>(method: string, path: string, statusCode: number, data: string): T {
    // Non-2xx → ALWAYS throw with full body preserved, regardless of JSON-ness.
    if (statusCode < 200 || statusCode >= 300) {
      const summary = summariseCoinbaseError(data);
      throw new CoinbaseHttpError(method, path, statusCode, data, summary);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(data); }
    catch { throw new CoinbaseHttpError(method, path, statusCode, data, `non-JSON response (${data.length} bytes)`); }
    const p = parsed as Record<string, unknown>;
    // Some Coinbase endpoints return 200 with a body-level error (e.g. order
    // rejected for buying power / unsupported product) — still surface those
    // through the same typed error so callers see status+body uniformly.
    if (p["error"] || p["message"] || p["error_response"]) {
      const summary = summariseCoinbaseError(data);
      throw new CoinbaseHttpError(method, path, statusCode, data, summary);
    }
    return parsed as T;
  }

  /** Log line emitted before every HTTPS send. Includes key-type + key prefix only — never the secret. */
  private logAuthRequest(method: string, path: string, hasBody: boolean) {
    let detectedKeyType: string;
    try { detectedKeyType = this.keyType; }
    catch (e) { detectedKeyType = `key_type_error: ${e instanceof Error ? e.message : String(e)}`; }
    logger.info({
      tag:           "COINBASE_AUTH_REQUEST",
      method,
      endpoint:      path,
      host:          this.BASE,
      keyType:       detectedKeyType,
      keyPrefix:     (this.config.apiKey ?? "").slice(0, 16),
      keyLen:        (this.config.apiKey ?? "").length,
      secretLen:     (this.config.apiSecret ?? "").length,
      secretIsPem:   (this.config.apiSecret ?? "").includes("-----BEGIN"),
      hasBody,
    }, "[COINBASE_AUTH_REQUEST]");
  }

  /** Log line emitted on every HTTPS response (success OR failure). */
  private logAuthResponse(method: string, path: string, statusCode: number, bodyLen: number) {
    const ok = statusCode >= 200 && statusCode < 300;
    logger.info({
      tag:        "COINBASE_AUTH_RESPONSE",
      method,
      endpoint:   path,
      statusCode,
      ok,
      bodyLen,
    }, "[COINBASE_AUTH_RESPONSE]");
  }

  /** Log line emitted on every failure with full surfaced body (capped). */
  private logAuthFailure(method: string, path: string, statusCode: number, rawBody: string, err: Error) {
    logger.error({
      tag:          "COINBASE_AUTH_FAILURE",
      method,
      endpoint:     path,
      statusCode,
      errorName:    err.name,
      errorMessage: err.message,
      rawBody:      rawBody.slice(0, COINBASE_ERR_BODY_MAX),
      keyPrefix:    (this.config.apiKey ?? "").slice(0, 16),
    }, "[COINBASE_AUTH_FAILURE]");
  }

  private get<T>(path: string): Promise<T> {
    this.logAuthRequest("GET", path, false);
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers: this.authHeaders("GET", path) }, res => {
        let data = "";
        const status = res.statusCode ?? 0;
        res.on("data", c => { data += c; });
        res.on("end", () => {
          this.logAuthResponse("GET", path, status, data.length);
          try { resolve(this.parseOrThrow<T>("GET", path, status, data)); }
          catch (e) {
            const err = e as Error;
            this.logAuthFailure("GET", path, status, data, err);
            reject(err);
          }
        });
      }).on("error", reject);
    });
  }

  private signedGet<T>(path: string): Promise<T> {
    this.logAuthRequest("GET", path, false);
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers: this.authHeaders("GET", path) }, res => {
        let data = "";
        const status = res.statusCode ?? 0;
        res.on("data", c => { data += c; });
        res.on("end", () => {
          this.logAuthResponse("GET", path, status, data.length);
          try { resolve(this.parseOrThrow<T>("GET", path, status, data)); }
          catch (e) {
            const err = e as Error;
            this.logAuthFailure("GET", path, status, data, err);
            reject(err);
          }
        });
      }).on("error", reject);
    });
  }

  private signedPost<T>(path: string, body: unknown): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const headers = { ...this.authHeaders("POST", path, bodyStr), "Content-Length": String(Buffer.byteLength(bodyStr)) };
    this.logAuthRequest("POST", path, true);
    // One-shot per-request body log so on-call can reproduce the rejected
    // payload verbatim. Truncated to avoid log bloat. Secrets are never
    // in order bodies — safe to log in full at this size cap.
    logger.debug({
      tag:      "COINBASE_REQUEST_BODY",
      endpoint: path,
      body:     bodyStr.slice(0, COINBASE_ERR_BODY_MAX),
    }, "[COINBASE_REQUEST_BODY]");
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: this.BASE, path, method: "POST", headers }, res => {
        let data = "";
        const status = res.statusCode ?? 0;
        res.on("data", c => { data += c; });
        res.on("end", () => {
          this.logAuthResponse("POST", path, status, data.length);
          try { resolve(this.parseOrThrow<T>("POST", path, status, data)); }
          catch (e) {
            const err = e as Error;
            this.logAuthFailure("POST", path, status, data, err);
            reject(err);
          }
        });
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
