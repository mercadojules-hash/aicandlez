// ── backfill-close-order-ids ─────────────────────────────────────────────────
//
// One-time reconciliation script.
//
// Live trades closed before the close-side submission path landed have a
// NULL `exchange_close_order_id` even though the broker actually shows a
// matching close fill from that period. This script pulls each affected
// user's broker order history (Alpaca /v2/orders, Kraken ClosedOrders) and
// back-fills `exchange_close_order_id` on `sim_trades` rows where a unique
// match can be found.
//
// Idempotent: only touches rows where `exchange_close_order_id IS NULL`
// AND `exchange IS NOT NULL`. Re-running after a partial run is safe.
//
// Run with:
//   pnpm --filter @workspace/scripts run backfill-close-order-ids
//
// Required env: DATABASE_URL, VAULT_MASTER_KEY (same as api-server).
// Read-only on the broker side: no orders are placed or cancelled.

import crypto from "node:crypto";
import https from "node:https";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  db,
  pool,
  simTradesTable,
  userExchangeConnectionsTable,
  type SimTrade,
} from "@workspace/db";

// ── Vault decryption (mirrors api-server CredentialVault.decryptBlob) ─────

interface ExchangeCredentials {
  apiKey:             string;
  apiSecret:          string;
  passphrase?:        string;
  oauthAccessToken?:  string;
  oauthRefreshToken?: string;
  oauthExpiresAt?:    number;
  oauthScope?:        string;
}

function deriveVaultKey(userId: string): Buffer {
  const master = process.env["VAULT_MASTER_KEY"];
  if (!master) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("VAULT_MASTER_KEY is required in production");
    }
    return crypto.pbkdf2Sync(
      "default-dev-key-not-for-production-000",
      userId, 100_000, 32, "sha256",
    );
  }
  return crypto.pbkdf2Sync(master, userId, 100_000, 32, "sha256");
}

function decryptBlob(userId: string, blob: string): ExchangeCredentials | null {
  try {
    const { iv: ivHex, authTag: tagHex, ciphertext: ctHex } = JSON.parse(blob) as {
      iv: string; authTag: string; ciphertext: string;
    };
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      deriveVaultKey(userId),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plain = decipher.update(Buffer.from(ctHex, "hex")).toString("utf8")
      + decipher.final("utf8");
    const parsed = JSON.parse(plain) as Partial<ExchangeCredentials>;
    return {
      apiKey:    parsed.apiKey    ?? "",
      apiSecret: parsed.apiSecret ?? "",
      ...parsed,
    } as ExchangeCredentials;
  } catch {
    return null;
  }
}

// ── Normalised broker order shape ─────────────────────────────────────────

interface BrokerOrder {
  exchangeOrderId: string;
  symbol:          string;          // engine-native ("BTCUSD")
  side:            "buy" | "sell";
  filledQty:       number;
  filledAt:        number;          // unix ms
}

// ── Alpaca order history ──────────────────────────────────────────────────

const ALPACA_SYMBOL_MAP: Record<string, string> = {
  "BTC/USD":  "BTCUSD",
  "ETH/USD":  "ETHUSD",
  "SOL/USD":  "SOLUSD",
  "XRP/USD":  "XRPUSD",
  "DOGE/USD": "DOGEUSD",
  "AVAX/USD": "AVAXUSD",
  "LINK/USD": "LINKUSD",
  "ADA/USD":  "ADAUSD",
};

function alpacaHost(): string {
  if (process.env["ALPACA_BASE_URL"]) {
    return new URL(process.env["ALPACA_BASE_URL"]).hostname;
  }
  return process.env["ALPACA_PAPER"] === "true"
    ? "paper-api.alpaca.markets"
    : "api.alpaca.markets";
}

function alpacaHeaders(creds: ExchangeCredentials): Record<string, string> {
  if (creds.oauthAccessToken) {
    return { "Authorization": `Bearer ${creds.oauthAccessToken}` };
  }
  return {
    "APCA-API-KEY-ID":     creds.apiKey,
    "APCA-API-SECRET-KEY": creds.apiSecret,
  };
}

interface AlpacaHistoricalOrder {
  id:               string;
  symbol:           string;
  side:             string;
  status:           string;
  filled_qty?:      string;
  filled_at?:       string | null;
  submitted_at?:    string | null;
  updated_at?:      string | null;
}

function alpacaGet<T>(path: string, creds: ExchangeCredentials): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get({ hostname: alpacaHost(), path, headers: alpacaHeaders(creds) }, res => {
      let d = "";
      res.on("data", c => { d += c; });
      res.on("end", () => {
        try {
          const parsed: unknown = JSON.parse(d);
          if (Array.isArray(parsed) || (res.statusCode && res.statusCode < 400)) {
            resolve(parsed as T);
          } else {
            const obj = parsed as { message?: string; code?: string };
            reject(new Error(String(obj.message ?? obj.code ?? `HTTP ${res.statusCode}`)));
          }
        } catch { reject(new Error(`Alpaca: non-JSON — ${d.slice(0, 160)}`)); }
      });
    }).on("error", reject);
  });
}

// Alpaca caps `limit` at 500 per page. We paginate forward in time using
// the last filled order's submitted_at + 1ms as the next `after` cursor
// (Alpaca's /v2/orders has no opaque page token — `after`/`until` is the
// only pagination handle). PAGE_CAP is a defensive safety stop; if a run
// hits it, we log a warning so the operator knows the result may be
// truncated and the unmatched count for that user is not fully trusted.
const ALPACA_PAGE_LIMIT = 500;
const ALPACA_PAGE_CAP   = 40;     // 40 × 500 = 20,000 closed orders / user

interface AlpacaFetchResult { orders: BrokerOrder[]; truncated: boolean; }

async function fetchAlpacaClosedOrders(
  creds: ExchangeCredentials,
  sinceMs: number,
): Promise<AlpacaFetchResult> {
  const out: BrokerOrder[] = [];
  const seen = new Set<string>();
  let afterMs   = sinceMs;
  let truncated = false;

  for (let page = 0; page < ALPACA_PAGE_CAP; page++) {
    const after = new Date(afterMs).toISOString();
    // direction=asc lets us advance `after` deterministically using the
    // last row's submitted_at on each page.
    const path  = `/v2/orders?status=closed&direction=asc&limit=${ALPACA_PAGE_LIMIT}&after=${encodeURIComponent(after)}`;
    const raw   = await alpacaGet<AlpacaHistoricalOrder[]>(path, creds);
    if (!Array.isArray(raw) || raw.length === 0) return { orders: out, truncated: false };

    let newest = afterMs;
    let added  = 0;
    for (const o of raw) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      added++;
      const submittedMs = o.submitted_at ? new Date(o.submitted_at).getTime() : 0;
      if (submittedMs > newest) newest = submittedMs;

      if (o.status !== "filled" && o.status !== "partially_filled") continue;
      const filledAtIso = o.filled_at ?? o.updated_at ?? o.submitted_at;
      const filledQty   = parseFloat(o.filled_qty ?? "0");
      if (!filledAtIso || !(filledQty > 0)) continue;
      out.push({
        exchangeOrderId: o.id,
        symbol:          ALPACA_SYMBOL_MAP[o.symbol] ?? o.symbol.replace("/", ""),
        side:            o.side === "buy" ? "buy" : "sell",
        filledQty,
        filledAt:        new Date(filledAtIso).getTime(),
      });
    }

    if (raw.length < ALPACA_PAGE_LIMIT) return { orders: out, truncated: false };
    if (added === 0 || newest <= afterMs) {
      // Defensive: cursor isn't advancing → bail rather than loop forever.
      truncated = true;
      break;
    }
    afterMs = newest + 1;
    // Hit the page cap without exhausting → result is truncated.
    if (page === ALPACA_PAGE_CAP - 1) truncated = true;
  }

  return { orders: out, truncated };
}

// ── Kraken order history ──────────────────────────────────────────────────

const KRAKEN_SYMBOL_MAP: Record<string, string> = {
  XXBTZUSD: "BTCUSD",
  XETHZUSD: "ETHUSD",
  SOLUSD:   "SOLUSD",
  XXRPZUSD: "XRPUSD",
  XDGUSD:   "DOGEUSD",
  AVAXUSD:  "AVAXUSD",
  LINKUSD:  "LINKUSD",
  ADAUSD:   "ADAUSD",
};

interface KrakenClosedOrder {
  status:   string;
  vol_exec: string;
  closetm?: number;
  opentm?:  number;
  descr: { pair: string; type: string; ordertype: string };
}

function krakenPrivate<T>(
  endpoint: string,
  params: Record<string, string>,
  creds: ExchangeCredentials,
): Promise<T> {
  const nonce = Date.now().toString() + Math.floor(Math.random() * 1000);
  const path  = `/0/private/${endpoint}`;
  const body  = new URLSearchParams({ nonce, ...params }).toString();
  const sha   = crypto.createHash("sha256").update(nonce + body).digest();
  const sign  = crypto
    .createHmac("sha512", Buffer.from(creds.apiSecret, "base64"))
    .update(Buffer.concat([Buffer.from(path), sha]))
    .digest("base64");

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.kraken.com", path, method: "POST",
        headers: {
          "API-Key": creds.apiKey, "API-Sign": sign,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      res => {
        let d = "";
        res.on("data", c => { d += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(d) as { error: string[]; result: T };
            if (parsed.error?.length) reject(new Error(`Kraken ${endpoint}: ${parsed.error.join(", ")}`));
            else resolve(parsed.result);
          } catch { reject(new Error(`Kraken ${endpoint}: parse failed`)); }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function fetchKrakenClosedOrders(
  creds: ExchangeCredentials,
  sinceMs: number,
): Promise<BrokerOrder[]> {
  const startSec = Math.floor(sinceMs / 1000);
  const all: BrokerOrder[] = [];
  let ofs = 0;
  // Kraken returns 50 per page; cap at 1000 to avoid runaway pagination.
  for (let page = 0; page < 20; page++) {
    const result = await krakenPrivate<{
      closed: Record<string, KrakenClosedOrder>;
      count?: number;
    }>("ClosedOrders", { start: String(startSec), ofs: String(ofs) }, creds);

    const entries = Object.entries(result.closed ?? {});
    if (entries.length === 0) break;

    for (const [id, o] of entries) {
      if (o.status !== "closed") continue;
      const filledQty = parseFloat(o.vol_exec ?? "0");
      const closeSec  = o.closetm ?? o.opentm ?? 0;
      if (!(filledQty > 0) || !(closeSec > 0)) continue;
      all.push({
        exchangeOrderId: id,
        symbol:          KRAKEN_SYMBOL_MAP[o.descr.pair] ?? o.descr.pair,
        side:            o.descr.type === "buy" ? "buy" : "sell",
        filledQty,
        filledAt:        closeSec * 1000,
      });
    }
    ofs += entries.length;
    if (result.count != null && ofs >= result.count) break;
    // Respect Kraken 1 req/sec private-tier limit.
    await new Promise(r => setTimeout(r, 1100));
  }
  return all;
}

// ── Shared HTTP + helpers (used by the new exchange fetchers below) ──────

function httpsReq(opts: https.RequestOptions, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => { d += c; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: d }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function httpsGetJson<T>(hostname: string, path: string, headers: Record<string, string> = {}): Promise<T> {
  return httpsReq({ hostname, path, method: "GET", headers }).then(({ status, text }) => {
    if (status >= 400) throw new Error(`HTTP ${status} ${hostname}${path.split("?")[0]} → ${text.slice(0, 200)}`);
    try { return JSON.parse(text) as T; } catch { throw new Error(`non-JSON ${hostname}${path.split("?")[0]}: ${text.slice(0, 200)}`); }
  });
}

function httpsPostJson<T>(hostname: string, path: string, headers: Record<string, string>, body: string): Promise<T> {
  return httpsReq({
    hostname, path, method: "POST",
    headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
  }, body).then(({ status, text }) => {
    if (status >= 400) throw new Error(`HTTP ${status} ${hostname}${path} → ${text.slice(0, 200)}`);
    try { return JSON.parse(text) as T; } catch { throw new Error(`non-JSON ${hostname}${path}: ${text.slice(0, 200)}`); }
  });
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

interface FetchResult { orders: BrokerOrder[]; truncated: boolean; }

// Map<engine-native, exchange-native> + the reverse direction for parsing back.
type SymMap = Record<string, string>;
function reverseMap(m: SymMap): SymMap {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
}

// ── Binance closed-orders fetcher ─────────────────────────────────────────
// Per-symbol GET /api/v3/allOrders?symbol=&startTime=&limit=1000 (HMAC-SHA256 of query).

const BINANCE_MAP: SymMap = {
  BTCUSD: "BTCUSDT", ETHUSD: "ETHUSDT", SOLUSD: "SOLUSDT", XRPUSD: "XRPUSDT",
  DOGEUSD: "DOGEUSDT", AVAXUSD: "AVAXUSDT", LINKUSD: "LINKUSDT", ADAUSD: "ADAUSDT",
  BNBUSD: "BNBUSDT",
};
const BINANCE_REV = reverseMap(BINANCE_MAP);

function binanceLikeFetch(host: string, headerKey: string) {
  return async function fetch(
    creds: ExchangeCredentials,
    sinceMs: number,
    engineSymbols: string[],
    symMap: SymMap,
    revMap: SymMap,
  ): Promise<FetchResult> {
    const out: BrokerOrder[] = [];
    let truncated = false;
    const sign = (q: string) =>
      crypto.createHmac("sha256", creds.apiSecret).update(q).digest("hex");

    for (const eng of engineSymbols) {
      const native = symMap[eng] ?? eng.replace("USD", "USDT");
      let start = sinceMs;
      for (let page = 0; page < 20; page++) {
        const ts = Date.now();
        const qs = `symbol=${native}&startTime=${start}&limit=1000&timestamp=${ts}`;
        const sig = sign(qs);
        const path = `/api/v3/allOrders?${qs}&signature=${sig}`;
        const raw = await httpsGetJson<BinanceLikeOrder[]>(host, path, { [headerKey]: creds.apiKey });
        if (!Array.isArray(raw) || raw.length === 0) break;
        let newest = start;
        for (const o of raw) {
          if (o.status !== "FILLED" && o.status !== "PARTIALLY_FILLED") continue;
          const filledQty = parseFloat(o.executedQty ?? "0");
          const filledAt = o.updateTime ?? o.time ?? 0;
          if (!(filledQty > 0) || !filledAt) continue;
          out.push({
            exchangeOrderId: String(o.orderId),
            symbol: revMap[o.symbol] ?? o.symbol.replace("USDT", "USD"),
            side: o.side?.toLowerCase() === "buy" ? "buy" : "sell",
            filledQty,
            filledAt,
          });
          if (filledAt > newest) newest = filledAt;
        }
        if (raw.length < 1000) break;
        if (newest <= start) { truncated = true; break; }
        start = newest + 1;
        if (page === 19) truncated = true;
        await sleep(150);
      }
      await sleep(200);
    }
    return { orders: out, truncated };
  };
}

interface BinanceLikeOrder {
  orderId: number | string; symbol: string; side: string; status: string;
  executedQty?: string; time?: number; updateTime?: number;
}

const fetchBinanceClosedOrders = (c: ExchangeCredentials, s: number, syms: string[]) =>
  binanceLikeFetch("api.binance.com", "X-MBX-APIKEY")(c, s, syms, BINANCE_MAP, BINANCE_REV);

// ── MEXC (Binance-compatible) ─────────────────────────────────────────────

const MEXC_MAP: SymMap = {
  BTCUSD: "BTCUSDT", ETHUSD: "ETHUSDT", SOLUSD: "SOLUSDT", XRPUSD: "XRPUSDT",
  DOGEUSD: "DOGEUSDT", AVAXUSD: "AVAXUSDT", LINKUSD: "LINKUSDT", ADAUSD: "ADAUSDT",
};
const MEXC_REV = reverseMap(MEXC_MAP);

const fetchMEXCClosedOrders = (c: ExchangeCredentials, s: number, syms: string[]) =>
  binanceLikeFetch("api.mexc.com", "X-MEXC-APIKEY")(c, s, syms, MEXC_MAP, MEXC_REV);

// ── BingX closed-orders fetcher ───────────────────────────────────────────
// Per-symbol GET /openApi/spot/v1/trade/historyOrders?symbol=&startTime=&limit=1000
// HMAC-SHA256 of query, header X-BX-APIKEY.

const BINGX_MAP: SymMap = {
  BTCUSD: "BTC-USDT", ETHUSD: "ETH-USDT", SOLUSD: "SOL-USDT", XRPUSD: "XRP-USDT",
  DOGEUSD: "DOGE-USDT", AVAXUSD: "AVAX-USDT", LINKUSD: "LINK-USDT", ADAUSD: "ADA-USDT",
};
const BINGX_REV = reverseMap(BINGX_MAP);

async function fetchBingXClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  const out: BrokerOrder[] = [];
  let truncated = false;
  const sign = (q: string) =>
    crypto.createHmac("sha256", creds.apiSecret).update(q).digest("hex");

  for (const eng of engineSymbols) {
    const native = BINGX_MAP[eng] ?? eng.replace("USD", "-USDT");
    let start = sinceMs;
    for (let page = 0; page < 20; page++) {
      const ts = Date.now();
      const qs = `symbol=${native}&startTime=${start}&limit=1000&timestamp=${ts}`;
      const sig = sign(qs);
      const path = `/openApi/spot/v1/trade/historyOrders?${qs}&signature=${sig}`;
      const resp = await httpsGetJson<{ code: number; data?: { orders?: BinanceLikeOrder[] } | BinanceLikeOrder[] }>(
        "open-api.bingx.com", path, { "X-BX-APIKEY": creds.apiKey });
      const orders = Array.isArray(resp.data)
        ? resp.data
        : (resp.data?.orders ?? []);
      if (orders.length === 0) break;
      let newest = start;
      for (const o of orders) {
        if (o.status !== "FILLED" && o.status !== "PARTIALLY_FILLED") continue;
        const filledQty = parseFloat(o.executedQty ?? "0");
        const filledAt = o.updateTime ?? o.time ?? 0;
        if (!(filledQty > 0) || !filledAt) continue;
        out.push({
          exchangeOrderId: String(o.orderId),
          symbol: BINGX_REV[o.symbol] ?? o.symbol.replace("-USDT", "USD"),
          side: o.side?.toLowerCase() === "buy" ? "buy" : "sell",
          filledQty,
          filledAt,
        });
        if (filledAt > newest) newest = filledAt;
      }
      if (orders.length < 1000) break;
      if (newest <= start) { truncated = true; break; }
      start = newest + 1;
      if (page === 19) truncated = true;
      await sleep(150);
    }
    await sleep(200);
  }
  return { orders: out, truncated };
}

// ── Coinbase Advanced Trade closed-orders fetcher ─────────────────────────
// GET /api/v3/brokerage/orders/historical/batch?product_ids=…&order_status=FILLED
// Auth = the same key-type detection as the adapter (CDP org / CDP UUID / legacy HMAC).

const COINBASE_MAP: SymMap = {
  BTCUSD: "BTC-USD", ETHUSD: "ETH-USD", SOLUSD: "SOL-USD", XRPUSD: "XRP-USD",
  DOGEUSD: "DOGE-USD", AVAXUSD: "AVAX-USD", LINKUSD: "LINK-USD", ADAUSD: "ADA-USD",
};
const COINBASE_REV = reverseMap(COINBASE_MAP);
const COINBASE_HOST = "api.coinbase.com";

function coinbaseKeyType(creds: ExchangeCredentials): "cdp-org" | "cdp-uuid" | "hmac" {
  const k = creds.apiKey ?? "";
  const s = creds.apiSecret ?? "";
  if (k.startsWith("organizations/") || s.includes("-----BEGIN")) return "cdp-org";
  try {
    if (/^[0-9a-f-]{36}$/.test(k) && Buffer.from(s, "base64").length === 64) return "cdp-uuid";
  } catch { /* not base64 */ }
  return "hmac";
}

function normalisePem(raw: string): string {
  const s = raw.replace(/\\n/g, "\n").trim();
  if (s.startsWith("-----")) return s;
  const b64 = s.replace(/\s+/g, "");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
  return `-----BEGIN EC PRIVATE KEY-----\n${lines.join("\n")}\n-----END EC PRIVATE KEY-----\n`;
}

function coinbaseAuthHeaders(creds: ExchangeCredentials, method: string, path: string, body = ""): Record<string, string> {
  const t = coinbaseKeyType(creds);
  const uriPath = path.split("?")[0]!;
  if (t === "cdp-org") {
    const pem = normalisePem(creds.apiSecret);
    const nonce = crypto.randomBytes(16).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: creds.apiKey, nonce })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      sub: creds.apiKey, iss: "coinbase-cloud", nbf: now, exp: now + 120,
      uri: `${method} ${COINBASE_HOST}${uriPath}`,
    })).toString("base64url");
    const sigInput = `${header}.${payload}`;
    const signer = crypto.createSign("SHA256");
    signer.update(sigInput);
    const sig = signer.sign(
      { key: pem, dsaEncoding: "ieee-p1363" } as Parameters<typeof signer.sign>[0],
    );
    return { "Authorization": `Bearer ${sigInput}.${sig.toString("base64url")}` };
  }
  if (t === "cdp-uuid") {
    const raw = Buffer.from(creds.apiSecret, "base64");
    const priv = crypto.createPrivateKey({
      key: { kty: "OKP", crv: "Ed25519",
        d: raw.slice(0, 32).toString("base64url"),
        x: raw.slice(32).toString("base64url") },
      format: "jwk",
    });
    const nonce = crypto.randomBytes(16).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: creds.apiKey, nonce })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      sub: creds.apiKey, iss: "coinbase-cloud", nbf: now, exp: now + 120,
      uri: `${method} ${COINBASE_HOST}${uriPath}`,
    })).toString("base64url");
    const sigInput = `${header}.${payload}`;
    const sig = crypto.sign(null, Buffer.from(sigInput), priv).toString("base64url");
    return { "Authorization": `Bearer ${sigInput}.${sig}` };
  }
  // Legacy HMAC
  const ts = Math.floor(Date.now() / 1000).toString();
  const secret = Buffer.from(creds.apiSecret, "base64");
  const sig = crypto.createHmac("sha256", secret)
    .update(`${ts}${method.toUpperCase()}${path}${body}`).digest("base64");
  return {
    "CB-ACCESS-KEY": creds.apiKey,
    "CB-ACCESS-SIGN": sig,
    "CB-ACCESS-TIMESTAMP": ts,
  };
}

interface CoinbaseHistoricalOrder {
  order_id: string; product_id: string; side: string; status: string;
  filled_size?: string; last_fill_time?: string | null;
  created_time?: string | null;
}

async function fetchCoinbaseClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  const out: BrokerOrder[] = [];
  let truncated = false;
  const productIds = Array.from(new Set(engineSymbols.map(s => COINBASE_MAP[s] ?? s)));
  const startIso = new Date(sinceMs).toISOString();
  const productQs = productIds.map(p => `product_ids=${encodeURIComponent(p)}`).join("&");
  let cursor = "";
  for (let page = 0; page < 40; page++) {
    const cursorQs = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const path = `/api/v3/brokerage/orders/historical/batch?${productQs}&order_status=FILLED&start_date=${encodeURIComponent(startIso)}&limit=1000${cursorQs}`;
    const headers = coinbaseAuthHeaders(creds, "GET", path);
    const resp = await httpsGetJson<{ orders?: CoinbaseHistoricalOrder[]; cursor?: string; has_next?: boolean }>(
      COINBASE_HOST, path, headers);
    const list = resp.orders ?? [];
    for (const o of list) {
      const filledQty = parseFloat(o.filled_size ?? "0");
      const filledAtIso = o.last_fill_time ?? o.created_time;
      if (!(filledQty > 0) || !filledAtIso) continue;
      out.push({
        exchangeOrderId: o.order_id,
        symbol: COINBASE_REV[o.product_id] ?? o.product_id.replace("-", ""),
        side: o.side.toLowerCase() === "buy" ? "buy" : "sell",
        filledQty,
        filledAt: new Date(filledAtIso).getTime(),
      });
    }
    if (!resp.has_next || !resp.cursor) break;
    cursor = resp.cursor;
    if (page === 39) truncated = true;
    await sleep(200);
  }
  return { orders: out, truncated };
}

// ── Gate.io closed-orders fetcher ─────────────────────────────────────────
// Per-symbol GET /api/v4/spot/orders?currency_pair=&status=finished&from=&to=&limit=100
// Signature mirrors GateIOAdapter.gateSign.

const GATEIO_MAP: SymMap = {
  BTCUSD: "BTC_USDT", ETHUSD: "ETH_USDT", SOLUSD: "SOL_USDT", XRPUSD: "XRP_USDT",
  DOGEUSD: "DOGE_USDT", AVAXUSD: "AVAX_USDT", LINKUSD: "LINK_USDT", ADAUSD: "ADA_USDT",
};
const GATEIO_REV = reverseMap(GATEIO_MAP);

interface GateOrderHist {
  id: string; currency_pair: string; side: string; status: string;
  amount?: string; filled_total?: string; fill_price?: string; price?: string;
  update_time?: string; create_time?: string;
}

async function fetchGateIOClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  const out: BrokerOrder[] = [];
  let truncated = false;
  const startSec = Math.floor(sinceMs / 1000);

  for (const eng of engineSymbols) {
    const pair = GATEIO_MAP[eng] ?? eng.replace("USD", "_USDT");
    let page = 1;
    for (; page <= 20; page++) {
      const ts = Math.floor(Date.now() / 1000).toString();
      const query = `currency_pair=${pair}&status=finished&from=${startSec}&page=${page}&limit=100`;
      const pathname = "/api/v4/spot/orders";
      const hash = crypto.createHash("sha512").update("").digest("hex");
      const sigMsg = `GET\n${pathname}\n${query}\n${hash}\n${ts}`;
      const sig = crypto.createHmac("sha512", creds.apiSecret).update(sigMsg).digest("hex");
      const resp = await httpsGetJson<GateOrderHist[]>(
        "api.gateio.ws", `${pathname}?${query}`,
        { "KEY": creds.apiKey, "SIGN": sig, "Timestamp": ts, "Accept": "application/json" });
      if (!Array.isArray(resp) || resp.length === 0) break;
      for (const o of resp) {
        if (o.status !== "closed") continue;
        const filledTotal = parseFloat(o.filled_total ?? "0");
        const fillPrice = parseFloat(o.fill_price ?? o.price ?? "0");
        const filledQty = fillPrice > 0 ? filledTotal / fillPrice : parseFloat(o.amount ?? "0");
        const filledAt = parseInt(o.update_time ?? o.create_time ?? "0") * 1000;
        if (!(filledQty > 0) || !filledAt) continue;
        out.push({
          exchangeOrderId: o.id,
          symbol: GATEIO_REV[o.currency_pair] ?? o.currency_pair.replace("_USDT", "USD"),
          side: o.side === "buy" ? "buy" : "sell",
          filledQty,
          filledAt,
        });
      }
      if (resp.length < 100) break;
      if (page === 20) truncated = true;
      await sleep(150);
    }
    await sleep(200);
  }
  return { orders: out, truncated };
}

// ── Bitget closed-orders fetcher ──────────────────────────────────────────
// Per-symbol GET /api/v2/spot/trade/history-orders?symbol=&startTime=&limit=100

const BITGET_MAP: SymMap = {
  BTCUSD: "BTCUSDT", ETHUSD: "ETHUSDT", SOLUSD: "SOLUSDT", XRPUSD: "XRPUSDT",
  DOGEUSD: "DOGEUSDT", AVAXUSD: "AVAXUSDT", LINKUSD: "LINKUSDT", ADAUSD: "ADAUSDT",
};
const BITGET_REV = reverseMap(BITGET_MAP);

interface BitgetHistOrder {
  orderId: string; symbol: string; side: string; status: string;
  baseVolume?: string; priceAvg?: string; uTime?: string; cTime?: string;
}

async function fetchBitgetClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  const out: BrokerOrder[] = [];
  let truncated = false;
  const passphrase = creds.passphrase ?? "";
  if (!passphrase) throw new Error("Bitget requires passphrase in vault blob");

  for (const eng of engineSymbols) {
    const pair = BITGET_MAP[eng] ?? eng.replace("USD", "USDT");
    let idLessThan = "";
    for (let page = 0; page < 20; page++) {
      const ts = Date.now().toString();
      const qsParts = [`symbol=${pair}`, `startTime=${sinceMs}`, `limit=100`];
      if (idLessThan) qsParts.push(`idLessThan=${idLessThan}`);
      const query = qsParts.join("&");
      const reqPath = `/api/v2/spot/trade/history-orders?${query}`;
      const sigMsg = `${ts}GET${reqPath}`;
      const sig = crypto.createHmac("sha256", creds.apiSecret).update(sigMsg).digest("base64");
      const pp = crypto.createHmac("sha256", creds.apiSecret).update(passphrase).digest("base64");
      const resp = await httpsGetJson<{ code: string; data?: BitgetHistOrder[] }>(
        "api.bitget.com", reqPath, {
          "ACCESS-KEY": creds.apiKey,
          "ACCESS-SIGN": sig,
          "ACCESS-TIMESTAMP": ts,
          "ACCESS-PASSPHRASE": pp,
          "locale": "en-US",
        });
      const list = resp.data ?? [];
      if (list.length === 0) break;
      let oldest = "";
      for (const o of list) {
        if (o.status !== "filled" && o.status !== "full_fill" && o.status !== "partially_filled") continue;
        const filledQty = parseFloat(o.baseVolume ?? "0");
        const filledAt = parseInt(o.uTime ?? o.cTime ?? "0");
        if (!(filledQty > 0) || !filledAt) continue;
        out.push({
          exchangeOrderId: o.orderId,
          symbol: BITGET_REV[o.symbol] ?? o.symbol.replace("USDT", "USD"),
          side: o.side === "buy" ? "buy" : "sell",
          filledQty,
          filledAt,
        });
        if (!oldest || o.orderId < oldest) oldest = o.orderId;
      }
      if (list.length < 100) break;
      idLessThan = oldest;
      if (!idLessThan) { truncated = true; break; }
      if (page === 19) truncated = true;
      await sleep(150);
    }
    await sleep(200);
  }
  return { orders: out, truncated };
}

// ── Crypto.com closed-orders fetcher ──────────────────────────────────────
// POST /v2/private/get-order-history { instrument_name, start_ts, end_ts, page_size }

const CRYPTOCOM_MAP: SymMap = {
  BTCUSD: "BTC_USDT", ETHUSD: "ETH_USDT", SOLUSD: "SOL_USDT", XRPUSD: "XRP_USDT",
  DOGEUSD: "DOGE_USDT", AVAXUSD: "AVAX_USDT", LINKUSD: "LINK_USDT", ADAUSD: "ADA_USDT",
};
const CRYPTOCOM_REV = reverseMap(CRYPTOCOM_MAP);

interface CDCHistOrder {
  order_id: number | string; instrument_name: string; side: string; status: string;
  cumulative_quantity?: number; create_time?: number; update_time?: number;
}

async function fetchCryptoDotComClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  const out: BrokerOrder[] = [];
  let truncated = false;
  let id = 1;

  for (const eng of engineSymbols) {
    const pair = CRYPTOCOM_MAP[eng] ?? eng.replace("USD", "_USDT");
    let endTs = Date.now();
    for (let page = 0; page < 20; page++) {
      const method = "/v2/private/get-order-history";
      const params: Record<string, unknown> = {
        end_ts: endTs, instrument_name: pair, page_size: 200, start_ts: sinceMs,
      };
      const nonce = Date.now();
      const reqId = id++;
      const paramStr = Object.keys(params).sort().map(k => `${k}${params[k]}`).join("");
      const sigParts = `${method}${reqId}${creds.apiKey}${paramStr}${nonce}`;
      const sig = crypto.createHmac("sha256", creds.apiSecret).update(sigParts).digest("hex");
      const body = JSON.stringify({ id: reqId, method, nonce, api_key: creds.apiKey, params, sig });
      const resp = await httpsPostJson<{ code: number; result?: { order_list?: CDCHistOrder[] } }>(
        "api.crypto.com", method, { "Content-Type": "application/json" }, body);
      const list = resp.result?.order_list ?? [];
      if (list.length === 0) break;
      let oldest = endTs;
      for (const o of list) {
        if (o.status !== "FILLED") continue;
        const filledQty = Number(o.cumulative_quantity ?? 0);
        const filledAt = Number(o.update_time ?? o.create_time ?? 0);
        if (!(filledQty > 0) || !filledAt) continue;
        out.push({
          exchangeOrderId: String(o.order_id),
          symbol: CRYPTOCOM_REV[o.instrument_name] ?? o.instrument_name.replace("_USDT", "USD"),
          side: o.side.toLowerCase() === "buy" ? "buy" : "sell",
          filledQty,
          filledAt,
        });
        if (filledAt < oldest) oldest = filledAt;
      }
      if (list.length < 200) break;
      if (oldest >= endTs) { truncated = true; break; }
      endTs = oldest - 1;
      if (page === 19) truncated = true;
      await sleep(200);
    }
    await sleep(200);
  }
  return { orders: out, truncated };
}

// ── HTX closed-orders fetcher ─────────────────────────────────────────────
// Per-symbol GET /v1/order/orders?symbol=&states=filled&start-time=ms&size=100
// Signed with HTX's sorted-query HMAC-SHA256.

const HTX_MAP: SymMap = {
  BTCUSD: "btcusdt", ETHUSD: "ethusdt", SOLUSD: "solusdt", XRPUSD: "xrpusdt",
  DOGEUSD: "dogeusdt", AVAXUSD: "avaxusdt", LINKUSD: "linkusdt", ADAUSD: "adausdt",
};
const HTX_REV = reverseMap(HTX_MAP);

function htxSignedPath(method: string, path: string, extra: Record<string, string>, creds: ExchangeCredentials): string {
  const ts = new Date().toISOString().replace(/\..+/, "");
  const all: Record<string, string> = {
    AccessKeyId: creds.apiKey,
    SignatureMethod: "HmacSHA256",
    SignatureVersion: "2",
    Timestamp: ts,
    ...extra,
  };
  const sortedQs = Object.keys(all).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(all[k]!)}`)
    .join("&");
  const msg = `${method}\napi.huobi.pro\n${path}\n${sortedQs}`;
  const sig = crypto.createHmac("sha256", creds.apiSecret).update(msg).digest("base64");
  return `${sortedQs}&Signature=${encodeURIComponent(sig)}`;
}

interface HTXHistOrder {
  id: number; symbol: string; type: string; state: string;
  "field-amount"?: string; "finished-at"?: number; "created-at"?: number;
}

async function fetchHTXClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  const out: BrokerOrder[] = [];
  let truncated = false;

  for (const eng of engineSymbols) {
    const pair = HTX_MAP[eng] ?? eng.toLowerCase().replace("usd", "usdt");
    // HTX caps history queries to 48h windows; walk forward by 48h slices.
    const windowMs = 48 * 60 * 60 * 1000;
    let cursor = sinceMs;
    const now = Date.now();
    let windows = 0;
    while (cursor < now) {
      windows++;
      if (windows > 60) { truncated = true; break; }       // ~120 days safety cap
      const endMs = Math.min(now, cursor + windowMs);
      const qs = htxSignedPath("GET", "/v1/order/orders", {
        symbol: pair, states: "filled", "start-time": String(cursor), "end-time": String(endMs), size: "100",
      }, creds);
      const resp = await httpsGetJson<{ status: string; data?: HTXHistOrder[] }>(
        "api.huobi.pro", `/v1/order/orders?${qs}`);
      const list = resp.data ?? [];
      for (const o of list) {
        if (o.state !== "filled") continue;
        const filledQty = parseFloat(o["field-amount"] ?? "0");
        const filledAt = o["finished-at"] ?? o["created-at"] ?? 0;
        if (!(filledQty > 0) || !filledAt) continue;
        out.push({
          exchangeOrderId: String(o.id),
          symbol: HTX_REV[o.symbol] ?? o.symbol.toUpperCase().replace("USDT", "USD"),
          side: o.type.includes("buy") ? "buy" : "sell",
          filledQty,
          filledAt,
        });
      }
      cursor = endMs + 1;
      await sleep(200);
    }
    await sleep(200);
  }
  return { orders: out, truncated };
}

// ── Gemini closed-orders fetcher ──────────────────────────────────────────
// POST /v1/mytrades { symbol, timestamp (sec), limit_trades }

const GEMINI_MAP: SymMap = {
  BTCUSD: "BTCUSD", ETHUSD: "ETHUSD", SOLUSD: "SOLUSDT", XRPUSD: "XRPUSD",
  DOGEUSD: "DOGEUSD", AVAXUSD: "AVAXUSD", LINKUSD: "LINKUSD", ADAUSD: "ADAUSD",
};
const GEMINI_REV = reverseMap(GEMINI_MAP);

interface GeminiTrade {
  order_id: number | string; symbol?: string; type: string;
  amount: string; timestampms: number;
}

async function fetchGeminiClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  // Aggregate per-order fills so requestedQty matches.
  const fills = new Map<string, { symbol: string; side: "buy" | "sell"; qty: number; ts: number }>();
  let truncated = false;
  let nonce = Date.now();

  for (const eng of engineSymbols) {
    const native = GEMINI_MAP[eng] ?? eng;
    let cursorSec = Math.floor(sinceMs / 1000);
    for (let page = 0; page < 30; page++) {
      const endpoint = "/v1/mytrades";
      const params = { request: endpoint, nonce: String(++nonce),
        symbol: native.toLowerCase(), timestamp: cursorSec, limit_trades: 500 };
      const payload = Buffer.from(JSON.stringify(params)).toString("base64");
      const sig = crypto.createHmac("sha384", creds.apiSecret).update(payload).digest("hex");
      const resp = await httpsPostJson<GeminiTrade[] | { result: string; reason?: string; message?: string }>(
        "api.gemini.com", endpoint, {
          "Content-Type": "text/plain",
          "X-GEMINI-APIKEY": creds.apiKey,
          "X-GEMINI-PAYLOAD": payload,
          "X-GEMINI-SIGNATURE": sig,
          "Cache-Control": "no-cache",
        }, "");
      if (!Array.isArray(resp)) throw new Error(`Gemini /mytrades: ${(resp as { reason?: string; message?: string }).reason ?? (resp as { message?: string }).message ?? "error"}`);
      if (resp.length === 0) break;
      let newest = cursorSec * 1000;
      for (const t of resp) {
        const key = `${native}:${String(t.order_id)}`;
        const prev = fills.get(key);
        const qty = parseFloat(t.amount);
        const ts = t.timestampms;
        if (prev) {
          prev.qty += qty;
          if (ts > prev.ts) prev.ts = ts;
        } else {
          fills.set(key, {
            symbol: GEMINI_REV[native] ?? native,
            side: t.type.toLowerCase() === "buy" ? "buy" : "sell",
            qty,
            ts,
          });
        }
        if (ts > newest) newest = ts;
      }
      if (resp.length < 500) break;
      cursorSec = Math.floor(newest / 1000) + 1;
      if (page === 29) truncated = true;
      await sleep(200);
    }
    await sleep(200);
  }

  const out: BrokerOrder[] = [];
  for (const [key, f] of fills) {
    const oid = key.split(":").slice(1).join(":");
    if (!(f.qty > 0) || !f.ts) continue;
    out.push({ exchangeOrderId: oid, symbol: f.symbol, side: f.side, filledQty: f.qty, filledAt: f.ts });
  }
  return { orders: out, truncated };
}

// ── Bitstamp closed-orders fetcher ────────────────────────────────────────
// POST /api/v2/user_transactions/{pair}/ with offset / limit pagination.
// We aggregate per-order fills (type=2 = trade rows have `order_id`).

const BITSTAMP_MAP: SymMap = {
  BTCUSD: "btcusd", ETHUSD: "ethusd", SOLUSD: "solusd", XRPUSD: "xrpusd",
  DOGEUSD: "dogeusd", AVAXUSD: "avaxusd", LINKUSD: "linkusd", ADAUSD: "adausd",
};
const BITSTAMP_REV = reverseMap(BITSTAMP_MAP);

interface BitstampTxn {
  id: number; order_id?: number | string; type: number | string; datetime: string;
  [k: string]: unknown;
}

async function fetchBitstampClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  let truncated = false;
  let nonce = Date.now();
  const fills = new Map<string, { symbol: string; side: "buy" | "sell"; qty: number; ts: number }>();

  for (const eng of engineSymbols) {
    const pair = BITSTAMP_MAP[eng] ?? eng.toLowerCase();
    const baseAsset = pair.replace(/usd[t]?$/, "");
    const PAGE = 1000;
    let offset = 0;
    for (let page = 0; page < 50; page++) {
      const path = `/api/v2/user_transactions/${pair}/`;
      const nonceStr = String(nonce++);
      const sig = crypto.createHmac("sha256", creds.apiSecret)
        .update(`${nonceStr}${creds.apiKey}${creds.apiSecret}`).digest("hex").toUpperCase();
      const body = new URLSearchParams({
        key: creds.apiKey, signature: sig, nonce: nonceStr,
        offset: String(offset), limit: String(PAGE), sort: "desc",
      }).toString();
      const resp = await httpsPostJson<BitstampTxn[] | { error?: string; status?: string; reason?: unknown }>(
        "www.bitstamp.net", path,
        { "Content-Type": "application/x-www-form-urlencoded" }, body);
      if (!Array.isArray(resp)) throw new Error(`Bitstamp transactions: ${JSON.stringify(resp).slice(0, 160)}`);
      if (resp.length === 0) break;
      let oldestTs = Number.POSITIVE_INFINITY;
      for (const tx of resp) {
        const ts = new Date(tx.datetime + "Z").getTime();
        if (ts < oldestTs) oldestTs = ts;
        // Type 2 = trade. Filter and aggregate.
        const tType = typeof tx.type === "string" ? parseInt(tx.type) : tx.type;
        if (tType !== 2) continue;
        if (!tx.order_id) continue;
        const baseAmt = Math.abs(parseFloat(String(tx[baseAsset] ?? "0")));
        const usdAmt = parseFloat(String(tx["usd"] ?? "0"));
        // sign of base amount: positive = bought base; negative = sold.
        const baseRaw = parseFloat(String(tx[baseAsset] ?? "0"));
        const side: "buy" | "sell" = baseRaw > 0 ? "buy" : "sell";
        if (!(baseAmt > 0) || !ts) continue;
        const key = `${pair}:${String(tx.order_id)}`;
        const prev = fills.get(key);
        if (prev) {
          prev.qty += baseAmt;
          if (ts > prev.ts) prev.ts = ts;
        } else {
          fills.set(key, {
            symbol: BITSTAMP_REV[pair] ?? pair.toUpperCase(),
            side, qty: baseAmt, ts,
          });
        }
        void usdAmt;
      }
      if (resp.length < PAGE) break;
      // Stop when we walk past the back-fill window.
      if (oldestTs < sinceMs) break;
      offset += PAGE;
      if (page === 49) truncated = true;
      await sleep(250);
    }
    await sleep(200);
  }

  const out: BrokerOrder[] = [];
  for (const [key, f] of fills) {
    const oid = key.split(":").slice(1).join(":");
    if (f.ts < 0) continue;
    out.push({ exchangeOrderId: oid, symbol: f.symbol, side: f.side, filledQty: f.qty, filledAt: f.ts });
  }
  return { orders: out, truncated };
}

// ── Phemex closed-orders fetcher ──────────────────────────────────────────
// Per-symbol GET /api/v1/spot/orders/history?symbol=&start=&end=&limit=200

const PHEMEX_MAP: SymMap = {
  BTCUSD: "sBTCUSDT", ETHUSD: "sETHUSDT", SOLUSD: "sSOLUSDT", XRPUSD: "sXRPUSDT",
  DOGEUSD: "sDOGEUSDT", AVAXUSD: "sAVAXUSDT", LINKUSD: "sLINKUSDT", ADAUSD: "sADAUSDT",
};
const PHEMEX_REV = reverseMap(PHEMEX_MAP);

interface PhemexHistOrder {
  orderID: string; symbol: string; side: string; ordStatus: string;
  cumQty?: string; avgPriceEp?: number; transactTimeNs?: number; createdAt?: number; actionTimeNs?: number;
}

async function fetchPhemexClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  const out: BrokerOrder[] = [];
  let truncated = false;

  for (const eng of engineSymbols) {
    const pair = PHEMEX_MAP[eng] ?? `s${eng.replace("USD", "USDT")}`;
    let start = sinceMs;
    for (let page = 0; page < 20; page++) {
      const pathname = "/api/v1/spot/orders/history";
      const qs = `symbol=${pair}&start=${start}&end=${Date.now()}&limit=200`;
      const expiry = Math.floor(Date.now() / 1000) + 60;
      const sig = crypto.createHmac("sha256", creds.apiSecret)
        .update(`${pathname}${qs}${expiry}`).digest("hex");
      const resp = await httpsGetJson<{ code: number; data?: { rows?: PhemexHistOrder[] } | PhemexHistOrder[] }>(
        "api.phemex.com", `${pathname}?${qs}`, {
          "x-phemex-access-token": creds.apiKey,
          "x-phemex-request-expiry": String(expiry),
          "x-phemex-request-signature": sig,
        });
      const list = Array.isArray(resp.data) ? resp.data : (resp.data?.rows ?? []);
      if (list.length === 0) break;
      let newest = start;
      for (const o of list) {
        if (o.ordStatus !== "Filled" && o.ordStatus !== "PartiallyFilled") continue;
        const filledQty = parseFloat(o.cumQty ?? "0");
        const tNs = o.transactTimeNs ?? o.actionTimeNs ?? 0;
        const filledAt = tNs > 0 ? Math.floor(tNs / 1e6) : (o.createdAt ?? 0);
        if (!(filledQty > 0) || !filledAt) continue;
        out.push({
          exchangeOrderId: o.orderID,
          symbol: PHEMEX_REV[o.symbol] ?? o.symbol.replace(/^s/, "").replace("USDT", "USD"),
          side: o.side.toLowerCase() === "buy" ? "buy" : "sell",
          filledQty,
          filledAt,
        });
        if (filledAt > newest) newest = filledAt;
      }
      if (list.length < 200) break;
      if (newest <= start) { truncated = true; break; }
      start = newest + 1;
      if (page === 19) truncated = true;
      await sleep(200);
    }
    await sleep(200);
  }
  return { orders: out, truncated };
}

// ── BloFin closed-orders fetcher ──────────────────────────────────────────
// Per-symbol GET /api/v1/trade/orders-history?instId=&begin=&limit=100

const BLOFIN_MAP: SymMap = {
  BTCUSD: "BTC-USDT", ETHUSD: "ETH-USDT", SOLUSD: "SOL-USDT", XRPUSD: "XRP-USDT",
  DOGEUSD: "DOGE-USDT", AVAXUSD: "AVAX-USDT", LINKUSD: "LINK-USDT", ADAUSD: "ADA-USDT",
};
const BLOFIN_REV = reverseMap(BLOFIN_MAP);

interface BloFinHistOrder {
  ordId: string; instId: string; side: string; state: string;
  accFillSz?: string; uTime?: string; cTime?: string;
}

async function fetchBloFinClosedOrders(
  creds: ExchangeCredentials, sinceMs: number, engineSymbols: string[],
): Promise<FetchResult> {
  const out: BrokerOrder[] = [];
  let truncated = false;
  const passphrase = creds.passphrase ?? "";
  if (!passphrase) throw new Error("BloFin requires passphrase in vault blob");

  for (const eng of engineSymbols) {
    const inst = BLOFIN_MAP[eng] ?? eng.replace("USD", "-USDT");
    let beforeId = "";
    for (let page = 0; page < 20; page++) {
      const ts = Date.now().toString();
      const parts = [`instId=${inst}`, `begin=${sinceMs}`, `limit=100`];
      if (beforeId) parts.push(`before=${beforeId}`);
      const query = parts.join("&");
      const reqPath = `/api/v1/trade/orders-history?${query}`;
      const sigMsg = `${ts}GET${reqPath}`;
      const sig = crypto.createHmac("sha256", creds.apiSecret).update(sigMsg).digest("base64");
      const resp = await httpsGetJson<{ code: string; data?: BloFinHistOrder[] }>(
        "openapi.blofin.com", reqPath, {
          "ACCESS-KEY": creds.apiKey,
          "ACCESS-SIGN": sig,
          "ACCESS-TIMESTAMP": ts,
          "ACCESS-PASSPHRASE": passphrase,
        });
      const list = resp.data ?? [];
      if (list.length === 0) break;
      let oldest = "";
      for (const o of list) {
        if (o.state !== "filled" && o.state !== "partially_filled") continue;
        const filledQty = parseFloat(o.accFillSz ?? "0");
        const filledAt = parseInt(o.uTime ?? o.cTime ?? "0");
        if (!(filledQty > 0) || !filledAt) continue;
        out.push({
          exchangeOrderId: o.ordId,
          symbol: BLOFIN_REV[o.instId] ?? o.instId.replace("-USDT", "USD"),
          side: o.side.toLowerCase() === "buy" ? "buy" : "sell",
          filledQty,
          filledAt,
        });
        if (!oldest || o.ordId < oldest) oldest = o.ordId;
      }
      if (list.length < 100) break;
      if (!oldest) { truncated = true; break; }
      beforeId = oldest;
      if (page === 19) truncated = true;
      await sleep(200);
    }
    await sleep(200);
  }
  return { orders: out, truncated };
}

// ── Dispatch table ────────────────────────────────────────────────────────
// Each fetcher returns BrokerOrder[] in engine-native symbol form
// (BTCUSD etc.) and a `truncated` flag for safety reporting.
//
// `engineSymbols` is the set of unique trade symbols this user actually has
// in `sim_trades`, so we never widen API calls beyond what is needed.

type Fetcher = (
  creds: ExchangeCredentials,
  sinceMs: number,
  engineSymbols: string[],
) => Promise<FetchResult>;

const FETCHERS: Record<string, Fetcher> = {
  Alpaca: async (c, s) => fetchAlpacaClosedOrders(c, s),
  Kraken: async (c, s) => {
    const orders = await fetchKrakenClosedOrders(c, s);
    return { orders, truncated: false };
  },
  Binance:      fetchBinanceClosedOrders,
  MEXC:         fetchMEXCClosedOrders,
  BingX:        fetchBingXClosedOrders,
  Coinbase:     fetchCoinbaseClosedOrders,
  GateIO:       fetchGateIOClosedOrders,
  Bitget:       fetchBitgetClosedOrders,
  CryptoDotCom: fetchCryptoDotComClosedOrders,
  HTX:          fetchHTXClosedOrders,
  Gemini:       fetchGeminiClosedOrders,
  Bitstamp:     fetchBitstampClosedOrders,
  Phemex:       fetchPhemexClosedOrders,
  BloFin:       fetchBloFinClosedOrders,
};

// ── Matching ──────────────────────────────────────────────────────────────

const QTY_TOLERANCE_PCT = 0.01;       // 1% qty drift between sim row and broker fill
const TIME_WINDOW_MS    = 10 * 60_000; // ±10 minutes around recorded exitTime

function closeSideFor(openSide: string): "buy" | "sell" {
  return openSide.toUpperCase() === "BUY" ? "sell" : "buy";
}

function isCandidate(trade: SimTrade, order: BrokerOrder): boolean {
  if (order.symbol !== trade.symbol) return false;
  if (order.side !== closeSideFor(trade.side)) return false;
  const qtyDelta = Math.abs(order.filledQty - trade.quantity) / Math.max(trade.quantity, 1e-9);
  if (qtyDelta > QTY_TOLERANCE_PCT) return false;
  if (Math.abs(order.filledAt - trade.exitTime) > TIME_WINDOW_MS) return false;
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────

export interface PerExchangeStats { matched: number; unmatched: number; ambiguous: number; skipped: number; errored: number; }

export interface BackfillSummary {
  totalCandidates: number;
  matched:         number;
  unmatched:       number;
  ambiguous:       number;
  skipped:         number;
  errored:         number;
  perExchange:     Record<string, PerExchangeStats>;
}

export async function runCloseOrderIdBackfill(): Promise<BackfillSummary> {
  console.log("[backfill] starting close-order-id reconciliation");

  const candidates = await db
    .select()
    .from(simTradesTable)
    .where(and(
      isNull(simTradesTable.exchangeCloseOrderId),
      isNotNull(simTradesTable.exchange),
    ));

  console.log(`[backfill] ${candidates.length} candidate sim_trades rows (NULL close id, exchange set)`);
  if (candidates.length === 0) {
    return {
      totalCandidates: 0, matched: 0, unmatched: 0, ambiguous: 0,
      skipped: 0, errored: 0, perExchange: {},
    };
  }

  // Group by (userId, exchange)
  const grouped = new Map<string, SimTrade[]>();
  for (const t of candidates) {
    const key = `${t.userId}::${t.exchange}`;
    let arr = grouped.get(key);
    if (!arr) { arr = []; grouped.set(key, arr); }
    arr.push(t);
  }

  const perExchange = new Map<string, PerExchangeStats>();
  const bumpStat = (ex: string, k: keyof PerExchangeStats) => {
    let s = perExchange.get(ex);
    if (!s) { s = { matched: 0, unmatched: 0, ambiguous: 0, skipped: 0, errored: 0 }; perExchange.set(ex, s); }
    s[k]++;
  };

  let totalMatched = 0;
  let totalUnmatched = 0;
  let totalAmbiguous = 0;
  let totalSkipped = 0;
  let totalErrored = 0;

  for (const [groupKey, tradesUnsorted] of grouped) {
    const [userId, exchange] = groupKey.split("::") as [string, string];
    // Deterministic iteration: oldest exits first, tie-broken on id.
    const trades = [...tradesUnsorted].sort((a, b) =>
      a.exitTime - b.exitTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!FETCHERS[exchange]) {
      console.log(`[backfill] skip ${trades.length} rows for ${exchange} (no historical-orders adapter)`);
      for (const _ of trades) { totalSkipped++; bumpStat(exchange, "skipped"); }
      continue;
    }

    // Resolve the user's active connection for this exchange (any status — read-only call).
    const [conn] = await db
      .select()
      .from(userExchangeConnectionsTable)
      .where(and(
        eq(userExchangeConnectionsTable.userId,   userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      ))
      .limit(1);

    if (!conn) {
      console.warn(`[backfill] user=${userId.slice(0, 8)}… exchange=${exchange}: no stored connection, skipping ${trades.length} rows`);
      for (const _ of trades) { totalSkipped++; bumpStat(exchange, "skipped"); }
      continue;
    }

    const creds = decryptBlob(userId, conn.encryptedBlob);
    if (!creds) {
      console.warn(`[backfill] user=${userId.slice(0, 8)}… exchange=${exchange}: decryptBlob failed, skipping ${trades.length} rows`);
      for (const _ of trades) { totalErrored++; bumpStat(exchange, "errored"); }
      continue;
    }

    const earliestExit  = trades.reduce((m, t) => Math.min(m, t.exitTime), Number.POSITIVE_INFINITY);
    const sinceMs       = Math.max(0, earliestExit - TIME_WINDOW_MS);
    const engineSymbols = Array.from(new Set(trades.map(t => t.symbol)));

    let history: BrokerOrder[];
    try {
      const fetcher = FETCHERS[exchange]!;
      const res = await fetcher(creds, sinceMs, engineSymbols);
      history = res.orders;
      if (res.truncated) {
        console.warn(`[backfill] user=${userId.slice(0, 8)}… exchange=${exchange}: order history TRUNCATED at page cap — unmatched counts for this user may not be trustworthy.`);
      }
    } catch (err) {
      console.error(`[backfill] user=${userId.slice(0, 8)}… exchange=${exchange}: order-history fetch failed:`, (err as Error).message);
      for (const _ of trades) { totalErrored++; bumpStat(exchange, "errored"); }
      continue;
    }

    // Deterministic order iteration for stable assignment + log output.
    const orders = [...history].sort((a, b) =>
      a.filledAt - b.filledAt
      || (a.exchangeOrderId < b.exchangeOrderId ? -1
        : a.exchangeOrderId > b.exchangeOrderId ? 1 : 0));
    console.log(`[backfill] user=${userId.slice(0, 8)}… exchange=${exchange}: fetched ${orders.length} historical orders since ${new Date(sinceMs).toISOString()}`);

    // Strict 1:1 matching with ambiguity detection.
    //   1. For each trade, collect ALL broker orders that fall inside the
    //      tolerance window (symbol + opposite side + qty±1% + ±10min).
    //   2. For each broker order, collect ALL trades that claim it.
    //   3. A trade is eligible to write iff it has exactly one candidate
    //      order AND that order has exactly one claiming trade.
    //   Anything else is recorded as `ambiguous` and skipped — no DB write —
    //   so an operator can review and back-fill those by hand.
    const tradeCandidates = new Map<string, BrokerOrder[]>();
    const orderClaimants  = new Map<string, SimTrade[]>();
    for (const trade of trades) {
      const matches: BrokerOrder[] = [];
      for (const order of orders) {
        if (!isCandidate(trade, order)) continue;
        matches.push(order);
        let arr = orderClaimants.get(order.exchangeOrderId);
        if (!arr) { arr = []; orderClaimants.set(order.exchangeOrderId, arr); }
        arr.push(trade);
      }
      tradeCandidates.set(trade.id, matches);
    }

    for (const trade of trades) {
      const matches = tradeCandidates.get(trade.id) ?? [];
      if (matches.length === 0) {
        totalUnmatched++; bumpStat(exchange, "unmatched");
        continue;
      }
      if (matches.length > 1) {
        totalAmbiguous++; bumpStat(exchange, "ambiguous");
        console.warn(`[backfill] ambiguous trade=${trade.id} symbol=${trade.symbol} qty=${trade.quantity} → ${matches.length} candidate orders (${matches.map(m => m.exchangeOrderId).join(", ")}); skipping`);
        continue;
      }
      const order = matches[0]!;
      const claimants = orderClaimants.get(order.exchangeOrderId) ?? [];
      if (claimants.length > 1) {
        totalAmbiguous++; bumpStat(exchange, "ambiguous");
        console.warn(`[backfill] ambiguous trade=${trade.id} symbol=${trade.symbol} qty=${trade.quantity} → broker order ${order.exchangeOrderId} claimed by ${claimants.length} trades (${claimants.map(c => c.id).join(", ")}); skipping`);
        continue;
      }

      await db
        .update(simTradesTable)
        .set({ exchangeCloseOrderId: order.exchangeOrderId })
        .where(and(
          eq(simTradesTable.id, trade.id),
          isNull(simTradesTable.exchangeCloseOrderId),
        ));
      totalMatched++; bumpStat(exchange, "matched");
      console.log(`[backfill] matched trade=${trade.id} symbol=${trade.symbol} qty=${trade.quantity} → ${order.exchangeOrderId}`);
    }
  }

  console.log("\n[backfill] === summary ===");
  console.log(`  total candidates : ${candidates.length}`);
  console.log(`  matched          : ${totalMatched}`);
  console.log(`  unmatched        : ${totalUnmatched}`);
  console.log(`  ambiguous        : ${totalAmbiguous}`);
  console.log(`  skipped          : ${totalSkipped}`);
  console.log(`  errored          : ${totalErrored}`);
  const perExchangeObj: Record<string, PerExchangeStats> = {};
  for (const [ex, s] of perExchange) {
    console.log(`  [${ex}] matched=${s.matched} unmatched=${s.unmatched} ambiguous=${s.ambiguous} skipped=${s.skipped} errored=${s.errored}`);
    perExchangeObj[ex] = s;
  }

  return {
    totalCandidates: candidates.length,
    matched:         totalMatched,
    unmatched:       totalUnmatched,
    ambiguous:       totalAmbiguous,
    skipped:         totalSkipped,
    errored:         totalErrored,
    perExchange:     perExchangeObj,
  };
}

// No top-level side effects: the CLI wrapper lives in
// `backfill-close-order-ids-cli.ts` so importing this module from the
// api-server (where it powers the nightly scheduler) cannot trigger an
// accidental run or tear down the shared DB pool.
