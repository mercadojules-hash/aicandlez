import { Router } from "express";
import { db } from "@workspace/db";
import { userExchangeConnectionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireDisclaimer } from "../middlewares/requireDisclaimer.js";
import { requirePlan } from "../middlewares/requirePlan.js";
import { vault } from "../services/vault/CredentialVault.js";
import { ensureFreshAlpacaCreds } from "../services/exchanges/AlpacaTokenRefresher.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { alpacaBrokerProvider } from "../services/exchanges/AlpacaBrokerProvider.js";
import { EXCHANGE_CATALOG, CATALOG_BY_ID, CONNECTABLE_EXCHANGE_IDS } from "../services/exchanges/catalog.js";
import { makeAdapter } from "../services/exchanges/adapterFactory.js";
import type { ExchangeCredentials } from "../services/vault/CredentialVault.js";
import type { Request } from "express";

// ── User exchange connection routes ───────────────────────────────────────────
//
// All routes are auth-gated. userId is extracted from Clerk session — never
// from the request body. Raw credentials are never logged, never returned.
//
// Base path: /api/user/exchanges

const router = Router();
type AuthReq = Request & { clerkUserId: string };

// ── Supported exchanges — driven entirely from EXCHANGE_CATALOG ───────────────
// CONNECTABLE_EXCHANGE_IDS: all exchanges where status !== "coming_soon"
// CATALOG_BY_ID:            fast ID → entry lookup
// EXCHANGE_CATALOG:         ordered list (preserves tier order for UI)

// ── Adapter factory ───────────────────────────────────────────────────────────
// The exchange-name → adapter-class map lives in
// `services/exchanges/adapterFactory.ts` (single source of truth). Adding a
// new exchange = edit that one file.

// ── Connection test helper ────────────────────────────────────────────────────
// 1. Test public endpoint (confirms network / exchange reachable)
// 2. Test private endpoint (getAccount) → confirms credentials work
// Never tests or requests withdrawal permissions.

async function runConnectionTest(exchange: string, creds: ExchangeCredentials) {
  const adapter = makeAdapter(exchange, creds);

  // Step 1 — public ticker (network check)
  await adapter.getTicker("BTCUSD");

  // Step 2 — private account endpoint (auth check)
  let read  = false;
  let trade = false;
  let errorMsg: string | undefined;
  try {
    await adapter.getAccount();
    read  = true;
    trade = true;   // read access on exchange account implies trading key scope
  } catch (err) {
    errorMsg = (err as Error).message;
  }

  return {
    ok:          read,
    permissions: { read, trade, withdraw: false as const },
    error:       errorMsg,
  };
}

// ── Safe row serialiser — never includes encryptedBlob ───────────────────────

function safeRow(row: typeof userExchangeConnectionsTable.$inferSelect) {
  return {
    id:              row.id,
    exchange:        row.exchange,
    label:           row.label,
    status:          row.status,
    isDefault:       row.isDefault,
    tradingMode:     row.tradingMode,
    permissions:     row.permissions,
    lastVerifiedAt:  row.lastVerifiedAt,
    lastError:       row.lastError,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
    meta:            CATALOG_BY_ID[row.exchange] ?? null,
  };
}

// ── GET /api/user/exchanges ───────────────────────────────────────────────────
// Returns all of the authenticated user's exchange connections.
// Includes connection metadata + exchange info. Never returns raw keys.

router.get("/user/exchanges", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const rows = await db
      .select()
      .from(userExchangeConnectionsTable)
      .where(eq(userExchangeConnectionsTable.userId, userId));

    // Build response: all exchanges from catalog (with per-user connection status)
    const connectedSet = new Set(rows.map(r => r.exchange));
    const allExchanges = EXCHANGE_CATALOG.map(entry => ({
      exchange:    entry.id,
      connected:   connectedSet.has(entry.id),
      connection:  rows.find(r => r.exchange === entry.id) ? safeRow(rows.find(r => r.exchange === entry.id)!) : null,
      meta:        entry,
    }));

    res.json({ exchanges: allExchanges });
  } catch (err) {
    req.log.error({ err }, "GET /user/exchanges failed");
    res.status(500).json({ error: "Failed to load exchange connections" });
  }
});

// ── POST /api/user/exchanges/connect ─────────────────────────────────────────
// Validate credentials, test connection, store encrypted to DB.
// Body: { exchange, apiKey, apiSecret, passphrase?, label? }

// PAID-ONLY: free users may NEVER POST exchange credentials. requirePlan
// performs the admin bypass + 402 MEMBERSHIP_REQUIRED response. The
// disclaimer gate still runs afterwards for non-admin paid users.
router.post("/user/exchanges/connect", requireAuth, requirePlan("starter"), requireDisclaimer, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const { exchange, apiKey, apiSecret, passphrase, label } = req.body as {
    exchange:    string;
    apiKey:      string;
    apiSecret:   string;
    passphrase?: string;
    label?:      string;
  };

  // ── Validate input ────────────────────────────────────────────────────────

  if (!exchange || !apiKey || !apiSecret) {
    res.status(400).json({ error: "exchange, apiKey, and apiSecret are required" });
    return;
  }
  if (!CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    res.status(400).json({ error: `Unsupported exchange: ${exchange}` });
    return;
  }

  const meta = CATALOG_BY_ID[exchange]!;
  if (meta.requiresPassphrase && !passphrase) {
    res.status(400).json({ error: `${exchange} requires a passphrase` });
    return;
  }

  // Basic format checks — prevent obviously invalid keys from hitting the exchange
  if (apiKey.trim().length < 8 || apiSecret.trim().length < 8) {
    res.status(400).json({ error: "API key and secret must be at least 8 characters" });
    return;
  }

  const creds: ExchangeCredentials = { apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), passphrase: passphrase?.trim(), label };

  // ── Test connection ───────────────────────────────────────────────────────
  let testResult: { ok: boolean; permissions: { read: boolean; trade: boolean; withdraw: false }; error?: string };
  try {
    req.log.info({ userId, exchange }, "userExchanges: testing connection");
    testResult = await runConnectionTest(exchange, creds);
  } catch (err) {
    req.log.warn({ userId, exchange, err: (err as Error).message }, "userExchanges: connection test failed");
    res.status(422).json({
      ok:    false,
      error: `Connection test failed: ${(err as Error).message}`,
    });
    return;
  }

  if (!testResult.ok) {
    req.log.warn({ userId, exchange }, "userExchanges: credentials rejected (no read access)");
    res.status(422).json({
      ok:    false,
      error: testResult.error ?? "Credentials could not authenticate with the exchange. Check your API key and secret.",
    });
    return;
  }

  // ── Encrypt + persist ─────────────────────────────────────────────────────
  const encryptedBlob = vault.encryptBlob(userId, creds);

  try {
    const now = new Date();
    await db
      .insert(userExchangeConnectionsTable)
      .values({
        userId,
        exchange,
        label:          label ?? "Default",
        encryptedBlob,
        status:         "active",
        isDefault:      false,
        tradingMode:    "paper",
        permissions:    testResult.permissions,
        lastVerifiedAt: now,
        lastError:      null,
      })
      .onConflictDoUpdate({
        target: [userExchangeConnectionsTable.userId, userExchangeConnectionsTable.exchange],
        set: {
          label:          label ?? "Default",
          encryptedBlob,
          status:         "active",
          permissions:    testResult.permissions,
          lastVerifiedAt: now,
          lastError:      null,
          updatedAt:      now,
        },
      });

    auditLogger.append(userId, "CREDENTIAL_STORED", { exchange }, { exchange });
    req.log.info({ userId, exchange }, "userExchanges: credentials stored successfully");

    // Return the updated row (safe, no raw creds)
    const [row] = await db
      .select()
      .from(userExchangeConnectionsTable)
      .where(
        and(
          eq(userExchangeConnectionsTable.userId, userId),
          eq(userExchangeConnectionsTable.exchange, exchange),
        )
      )
      .limit(1);

    res.json({ ok: true, connection: row ? safeRow(row) : null, permissions: testResult.permissions });
  } catch (err) {
    req.log.error({ err }, "userExchanges: failed to persist connection");
    res.status(500).json({ error: "Failed to save connection" });
  }
});

// ── GET /api/user/exchanges/balances ──────────────────────────────────────────
// Returns live balance snapshots for every connection the authenticated user
// owns. One round-trip; per-connection failures degrade gracefully so a single
// dead exchange doesn't sink the whole response. Never returns raw credentials.
//
// Response shape:
//   { connections: [
//       { exchange, label, tradingMode, ok, totalEquityUSD, balances, error? },
//       …
//     ],
//     totalEquityUSD: number,        // sum across ok=true connections
//     fetchedAt: number,
//   }
//
// Empty `connections: []` is the "no live connection" signal the Portal/PWA
// use to fall back to the simulated balance hero.
type BalanceConnection = {
  exchange:       string;
  label:          string | null;
  tradingMode:    string;
  ok:             boolean;
  totalEquityUSD: number;
  balances:       Record<string, { free: number; locked: number; total: number }>;
  lastUpdated:    number;
  error?:         string;
};

async function loadBalanceForRow(
  userId: string,
  row: typeof userExchangeConnectionsTable.$inferSelect,
): Promise<BalanceConnection> {
  const base: BalanceConnection = {
    exchange:       row.exchange,
    label:          row.label,
    tradingMode:    row.tradingMode,
    ok:             false,
    totalEquityUSD: 0,
    balances:       {},
    lastUpdated:    0,
  };
  let creds = vault.decryptBlob(userId, row.encryptedBlob);
  if (!creds) return { ...base, error: "Failed to decrypt stored credentials" };
  try {
    creds = await ensureFreshAlpacaCreds(userId, row, creds);
  } catch (err) {
    return { ...base, error: (err as Error).message };
  }
  try {
    const adapter = makeAdapter(row.exchange, creds);
    const account = await adapter.getAccount();
    return {
      ...base,
      ok:             true,
      totalEquityUSD: account.totalEquityUSD,
      balances:       account.balances,
      lastUpdated:    account.lastUpdated,
    };
  } catch (err) {
    return { ...base, error: (err as Error).message };
  }
}

router.get("/user/exchanges/balances", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const rows = await db
      .select()
      .from(userExchangeConnectionsTable)
      .where(eq(userExchangeConnectionsTable.userId, userId));

    const connections = await Promise.all(rows.map(r => loadBalanceForRow(userId, r)));
    const totalEquityUSD = connections
      .filter(c => c.ok)
      .reduce((sum, c) => sum + (Number.isFinite(c.totalEquityUSD) ? c.totalEquityUSD : 0), 0);

    res.json({ connections, totalEquityUSD, fetchedAt: Date.now() });
  } catch (err) {
    req.log.error({ err }, "GET /user/exchanges/balances failed");
    res.status(500).json({ error: "Failed to load exchange balances" });
  }
});

// ── GET /api/user/exchanges/:exchange/balances ────────────────────────────────
// Live balance snapshot for one specific connection.

router.get("/user/exchanges/:exchange/balances", requireAuth, async (req, res): Promise<void> => {
  const userId   = (req as AuthReq).clerkUserId;
  const exchange = String(req.params["exchange"]);

  if (!CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    res.status(400).json({ error: `Unsupported exchange: ${exchange}` });
    return;
  }

  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ error: `No connection found for ${exchange}` });
    return;
  }

  const snapshot = await loadBalanceForRow(userId, row);
  if (!snapshot.ok) {
    res.status(502).json({ ...snapshot, fetchedAt: Date.now() });
    return;
  }
  res.json({ ...snapshot, fetchedAt: Date.now() });
});

// ── POST /api/user/exchanges/:exchange/test ───────────────────────────────────
// Re-test a stored connection. Updates permissions + health timestamp.

router.post("/user/exchanges/:exchange/test", requireAuth, requirePlan("starter"), async (req, res): Promise<void> => {
  const userId   = (req as AuthReq).clerkUserId;
  const exchange = String(req.params["exchange"]);

  if (!CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    res.status(400).json({ error: `Unsupported exchange: ${exchange}` });
    return;
  }

  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ ok: false, error: `No connection found for ${exchange}` });
    return;
  }

  let creds = vault.decryptBlob(userId, row.encryptedBlob);
  if (!creds) {
    res.status(500).json({ ok: false, error: "Failed to decrypt stored credentials" });
    return;
  }
  try {
    creds = await ensureFreshAlpacaCreds(userId, row, creds);
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message });
    return;
  }

  let testResult: { ok: boolean; permissions: { read: boolean; trade: boolean; withdraw: false }; error?: string };
  try {
    testResult = await runConnectionTest(exchange, creds);
  } catch (err) {
    const errorMsg = (err as Error).message;
    await db
      .update(userExchangeConnectionsTable)
      .set({ status: "error", lastError: errorMsg, updatedAt: new Date() })
      .where(
        and(
          eq(userExchangeConnectionsTable.userId, userId),
          eq(userExchangeConnectionsTable.exchange, exchange),
        )
      );
    res.json({ ok: false, error: errorMsg });
    return;
  }

  const now = new Date();
  await db
    .update(userExchangeConnectionsTable)
    .set({
      status:         testResult.ok ? "active" : "error",
      permissions:    testResult.permissions,
      lastVerifiedAt: now,
      lastError:      testResult.error ?? null,
      updatedAt:      now,
    })
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    );

  req.log.info({ userId, exchange, ok: testResult.ok }, "userExchanges: connection re-tested");
  res.json({ ok: testResult.ok, permissions: testResult.permissions, error: testResult.error });
});

// ── POST /api/user/exchanges/:exchange/default ────────────────────────────────
// Set one exchange as the user's default; clears default on all others.

router.post("/user/exchanges/:exchange/default", requireAuth, requirePlan("starter"), async (req, res): Promise<void> => {
  const userId   = (req as AuthReq).clerkUserId;
  const exchange = String(req.params["exchange"]);

  if (!CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    res.status(400).json({ error: `Unsupported exchange: ${exchange}` });
    return;
  }

  // Verify the connection exists and belongs to this user
  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ error: `No connection found for ${exchange}` });
    return;
  }

  // Clear all user's defaults, then set this one
  await db
    .update(userExchangeConnectionsTable)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(userExchangeConnectionsTable.userId, userId));

  await db
    .update(userExchangeConnectionsTable)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    );

  req.log.info({ userId, exchange }, "userExchanges: default exchange set");
  res.json({ ok: true, default: exchange });
});

// ── POST /api/user/exchanges/:exchange/mode ───────────────────────────────────
// Set paper/live trading mode for a connection.
// Live mode requires explicit opt-in — cannot be set without user acknowledgement.

router.post("/user/exchanges/:exchange/mode", requireAuth, requirePlan("starter"), async (req, res): Promise<void> => {
  const userId   = (req as AuthReq).clerkUserId;
  const exchange = String(req.params["exchange"]);
  const { mode, acknowledged } = req.body as { mode: string; acknowledged?: boolean };

  if (!CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    res.status(400).json({ error: `Unsupported exchange: ${exchange}` });
    return;
  }
  if (mode !== "paper" && mode !== "live") {
    res.status(400).json({ error: "mode must be 'paper' or 'live'" });
    return;
  }
  if (mode === "live" && !acknowledged) {
    res.status(400).json({ error: "Live trading requires explicit acknowledgement (acknowledged: true)" });
    return;
  }

  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ error: `No connection found for ${exchange}` });
    return;
  }

  await db
    .update(userExchangeConnectionsTable)
    .set({ tradingMode: mode, updatedAt: new Date() })
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    );

  if (mode === "live") {
    auditLogger.append(userId, "MODE_CHANGED", { exchange, mode: "live" }, { exchange });
  }

  req.log.info({ userId, exchange, mode }, "userExchanges: trading mode updated");
  res.json({ ok: true, exchange, tradingMode: mode });
});

// ── GET /api/user/exchanges/:exchange/open-orders ─────────────────────────────
// Returns the currently-open orders sitting at the broker for the given
// connection. Drives the "X open orders" count in the disconnect modal so the
// user can decide whether to cancel them before revoking the OAuth grant.
//
// Currently only Alpaca is wired up — other adapters return an empty list.

router.get("/user/exchanges/:exchange/open-orders", requireAuth, async (req, res): Promise<void> => {
  const userId   = (req as AuthReq).clerkUserId;
  const exchange = String(req.params["exchange"]);

  if (!CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    res.status(400).json({ error: `Unsupported exchange: ${exchange}` });
    return;
  }

  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ error: `No connection found for ${exchange}` });
    return;
  }

  if (exchange !== "Alpaca") {
    res.json({ exchange, supported: false, count: 0, orders: [] });
    return;
  }

  let creds = vault.decryptBlob(userId, row.encryptedBlob);
  if (!creds) {
    res.status(500).json({ error: "Failed to decrypt stored credentials" });
    return;
  }
  try {
    creds = await ensureFreshAlpacaCreds(userId, row, creds);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message, count: 0, orders: [] });
    return;
  }

  try {
    const adapter = makeAdapter(exchange, creds) as AlpacaAdapter;
    const orders = await adapter.listOpenOrders();
    res.json({ exchange, supported: true, count: orders.length, orders });
  } catch (err) {
    req.log.warn({ userId, exchange, err: (err as Error).message }, "userExchanges: listOpenOrders failed");
    res.status(502).json({ error: (err as Error).message, count: 0, orders: [] });
  }
});

// ── DELETE /api/user/exchanges/:exchange ──────────────────────────────────────
// Permanently remove a user's exchange connection and encrypted credentials.
// Optional body: { cancelOpenOrders?: boolean } — when true, attempts to cancel
// all open broker-side orders BEFORE revoking the OAuth grant. Per-order
// outcomes are audit-logged individually and summarised on the final
// CREDENTIAL_REVOKED entry.

router.delete("/user/exchanges/:exchange", requireAuth, async (req, res): Promise<void> => {
  const userId   = (req as AuthReq).clerkUserId;
  const exchange = String(req.params["exchange"]);
  const cancelOpenOrders = Boolean((req.body as { cancelOpenOrders?: boolean } | undefined)?.cancelOpenOrders);

  if (!CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    res.status(400).json({ error: `Unsupported exchange: ${exchange}` });
    return;
  }

  // Look up the row first so we can (a) tell the caller it didn't exist with a
  // 404, and (b) attempt remote-side OAuth revocation BEFORE we drop the only
  // copy of the refresh token we have. Local deletion still proceeds even if
  // remote revoke fails — the user's intent is to disconnect, and we never
  // want a third-party hiccup to leave stale credentials sitting in our DB.
  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ error: `No connection found for ${exchange}` });
    return;
  }

  // ── Alpaca: optionally cancel open orders, then revoke OAuth grant ────────
  // Best-effort. Only attempts when:
  //   • the connection is Alpaca,
  //   • the OAuth provider is configured (env vars present),
  //   • we have a usable refresh_token or access_token in the encrypted blob.
  let revoked = false;
  let revokeError: string | undefined;
  let cancelSummary: {
    requested: boolean;
    attempted: number;
    succeeded: number;
    failed:    number;
    error?:    string;
  } = { requested: cancelOpenOrders, attempted: 0, succeeded: 0, failed: 0 };

  if (exchange === "Alpaca" && alpacaBrokerProvider.isEnabled()) {
    let creds = vault.decryptBlob(userId, row.encryptedBlob);

    // 1) Cancel open orders first, while we still have a valid access token.
    //    Per-order audit entries + a summary on the final CREDENTIAL_REVOKED.
    if (cancelOpenOrders && creds) {
      try {
        const freshCreds = await ensureFreshAlpacaCreds(userId, row, creds);
        creds = freshCreds;
        const adapter = makeAdapter(exchange, freshCreds) as AlpacaAdapter;
        const results = await adapter.cancelAllOpenOrders();
        cancelSummary = {
          requested: true,
          attempted: results.length,
          succeeded: results.filter(r => r.ok).length,
          failed:    results.filter(r => !r.ok).length,
        };
        for (const r of results) {
          auditLogger.append(
            userId,
            "ORDER_CANCELLED",
            {
              exchange, exchangeOrderId: r.exchangeOrderId,
              symbol: r.symbol, side: r.side, qty: r.qty,
              ok: r.ok, reason: r.reason, trigger: "disconnect",
            },
            { exchange, symbol: r.symbol },
          );
        }
        req.log.info(
          { userId, exchange, ...cancelSummary },
          "userExchanges: cancelled open orders ahead of disconnect",
        );
      } catch (err) {
        cancelSummary = {
          requested: true, attempted: 0, succeeded: 0, failed: 0,
          error: (err as Error).message,
        };
        req.log.warn(
          { userId, exchange, err: cancelSummary.error },
          "userExchanges: cancel-open-orders failed — proceeding with revoke",
        );
      }
    }

    // 2) Revoke the OAuth grant at the issuer.
    const token = creds?.oauthRefreshToken || creds?.oauthAccessToken;
    if (token) {
      try {
        await alpacaBrokerProvider.revokeToken(token);
        revoked = true;
        auditLogger.append(
          userId,
          "CREDENTIAL_REVOKED",
          { exchange, method: "oauth", cancelledOrders: cancelSummary },
          { exchange },
        );
        req.log.info({ userId, exchange }, "userExchanges: OAuth token revoked at issuer");
      } catch (err) {
        revokeError = (err as Error).message;
        req.log.warn({ userId, exchange, err: revokeError }, "userExchanges: OAuth revoke failed — proceeding with local delete");
      }
    }
  }

  await db
    .delete(userExchangeConnectionsTable)
    .where(
      and(
        eq(userExchangeConnectionsTable.userId, userId),
        eq(userExchangeConnectionsTable.exchange, exchange),
      )
    );

  auditLogger.append(
    userId,
    "CREDENTIAL_DELETED",
    { exchange, revoked, cancelledOrders: cancelSummary },
    { exchange },
  );
  req.log.info({ userId, exchange, revoked, cancelledOrders: cancelSummary }, "userExchanges: connection deleted");
  res.json({
    ok: true,
    exchange,
    revoked,
    cancelledOrders: cancelSummary,
    ...(revokeError ? { revokeError } : {}),
  });
});

export default router;
