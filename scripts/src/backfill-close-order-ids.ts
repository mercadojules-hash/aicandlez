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

interface PerExchangeStats { matched: number; unmatched: number; ambiguous: number; skipped: number; errored: number; }

async function main(): Promise<void> {
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
    await pool?.end();
    return;
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
    if (exchange !== "Alpaca" && exchange !== "Kraken") {
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

    const earliestExit = trades.reduce((m, t) => Math.min(m, t.exitTime), Number.POSITIVE_INFINITY);
    const sinceMs      = Math.max(0, earliestExit - TIME_WINDOW_MS);

    let history: BrokerOrder[];
    try {
      if (exchange === "Alpaca") {
        const res = await fetchAlpacaClosedOrders(creds, sinceMs);
        history = res.orders;
        if (res.truncated) {
          console.warn(`[backfill] user=${userId.slice(0, 8)}… exchange=Alpaca: order history TRUNCATED at page cap — unmatched counts for this user may not be trustworthy. Re-run after raising ALPACA_PAGE_CAP.`);
        }
      } else {
        history = await fetchKrakenClosedOrders(creds, sinceMs);
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
  for (const [ex, s] of perExchange) {
    console.log(`  [${ex}] matched=${s.matched} unmatched=${s.unmatched} ambiguous=${s.ambiguous} skipped=${s.skipped} errored=${s.errored}`);
  }

  await pool?.end();
}

main().catch(err => {
  console.error("[backfill] fatal:", err);
  void pool?.end();
  process.exit(1);
});
