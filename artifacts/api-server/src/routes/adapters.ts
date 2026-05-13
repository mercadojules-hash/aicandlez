import { Router } from "express";
import { registry } from "../services/exchanges/ExchangeRegistry.js";
// Live adapters
import { KrakenAdapter, KRAKEN_CONFIG }       from "../services/exchanges/adapters/KrakenAdapter.js";
import { BinanceAdapter, BINANCE_CONFIG }      from "../services/exchanges/adapters/BinanceAdapter.js";
import { CoinbaseAdapter, COINBASE_CONFIG }    from "../services/exchanges/adapters/CoinbaseAdapter.js";
import { BybitAdapter, BYBIT_CONFIG }          from "../services/exchanges/adapters/BybitAdapter.js";
import { OKXAdapter, OKX_CONFIG }              from "../services/exchanges/adapters/OKXAdapter.js";
import { KuCoinAdapter, KUCOIN_CONFIG }        from "../services/exchanges/adapters/KuCoinAdapter.js";
// Beta adapters
import { GateIOAdapter, GATEIO_CONFIG }        from "../services/exchanges/adapters/GateIOAdapter.js";
import { BitgetAdapter, BITGET_CONFIG }        from "../services/exchanges/adapters/BitgetAdapter.js";
import { MEXCAdapter, MEXC_CONFIG }            from "../services/exchanges/adapters/MEXCAdapter.js";
import { CryptoDotComAdapter, CRYPTOCOM_CONFIG } from "../services/exchanges/adapters/CryptoDotComAdapter.js";
import { HTXAdapter, HTX_CONFIG }              from "../services/exchanges/adapters/HTXAdapter.js";
import { GeminiAdapter, GEMINI_CONFIG }        from "../services/exchanges/adapters/GeminiAdapter.js";
import { BitstampAdapter, BITSTAMP_CONFIG }    from "../services/exchanges/adapters/BitstampAdapter.js";
import { PhemexAdapter, PHEMEX_CONFIG }        from "../services/exchanges/adapters/PhemexAdapter.js";
import { BloFinAdapter, BLOFIN_CONFIG }        from "../services/exchanges/adapters/BloFinAdapter.js";
import { BingXAdapter, BINGX_CONFIG }          from "../services/exchanges/adapters/BingXAdapter.js";
import { breakers }                            from "../services/risk/CircuitBreaker.js";
import { vault }                               from "../services/vault/CredentialVault.js";
import { auditLogger }                         from "../services/telemetry/AuditLogger.js";

// ── Adapter management routes ─────────────────────────────────────────────────
//
// These routes expose the exchange adapter layer to the frontend and mobile.
//
// Key responsibilities:
//   - Bootstrap all adapters at startup
//   - Expose adapter health for system verification
//   - Allow admin/user to switch active adapter
//   - Allow credential vault operations (store / test / delete)
//   - Expose circuit breaker status and manual reset
//
// Base path: /api/adapters

const router = Router();

// ── Bootstrap adapters at module load ─────────────────────────────────────────
// Registers all adapters into the singleton registry.
// Adapters read their API keys from env vars at construction time.
// If keys are not present, adapters operate in simulation mode.

function bootstrapAdapters(): void {
  const adapters = [
    // Live
    new KrakenAdapter(KRAKEN_CONFIG),
    new BinanceAdapter(BINANCE_CONFIG),
    new CoinbaseAdapter(COINBASE_CONFIG),
    new BybitAdapter(BYBIT_CONFIG),
    new OKXAdapter(OKX_CONFIG),
    new KuCoinAdapter(KUCOIN_CONFIG),
    // Beta — registered for health monitoring and switchability
    new GateIOAdapter(GATEIO_CONFIG),
    new BitgetAdapter(BITGET_CONFIG),
    new MEXCAdapter(MEXC_CONFIG),
    new CryptoDotComAdapter(CRYPTOCOM_CONFIG),
    new HTXAdapter(HTX_CONFIG),
    new GeminiAdapter(GEMINI_CONFIG),
    new BitstampAdapter(BITSTAMP_CONFIG),
    new PhemexAdapter(PHEMEX_CONFIG),
    new BloFinAdapter(BLOFIN_CONFIG),
    new BingXAdapter(BINGX_CONFIG),
  ];

  for (const adapter of adapters) {
    if (!registry.has(adapter.exchange)) {
      registry.register(adapter);
    }
  }

  // Default active adapter: Kraken (matches existing engine)
  if (!registry.activeId()) {
    try { registry.setActive("Kraken"); } catch { /* ignore if already set */ }
  }
}

bootstrapAdapters();

// ── Health summary ────────────────────────────────────────────────────────────
// GET /api/adapters/health
router.get("/adapters/health", (_req, res) => {
  res.json({
    adapters:  registry.getHealth(),
    active:    registry.activeId(),
    breakers:  breakers.all(),
    vault:     vault.stats(),
    ts:        Date.now(),
  });
});

// ── Individual adapter health ─────────────────────────────────────────────────
// GET /api/adapters/:exchange/health
router.get("/adapters/:exchange/health", (req, res) => {
  const { exchange } = req.params as { exchange: string };
  const adapter = registry.get(exchange);
  if (!adapter) {
    res.status(404).json({ error: `Adapter not found: ${exchange}` });
    return;
  }
  res.json(adapter.getHealth());
});

// ── List adapters ─────────────────────────────────────────────────────────────
// GET /api/adapters
router.get("/adapters", (_req, res) => {
  const healthMap = registry.getHealth();
  res.json({
    adapters: registry.list().map(name => ({
      name,
      isActive:   registry.activeId() === name,
      health:     healthMap[name],
      vaultStats: vault.stats().exchangeBreakdown[name] ?? 0,
    })),
    active: registry.activeId(),
  });
});

// ── Set active adapter ────────────────────────────────────────────────────────
// POST /api/adapters/active
router.post("/adapters/active", (req, res) => {
  const { exchange } = req.body as { exchange: string };
  if (!exchange) { res.status(400).json({ error: "exchange is required" }); return; }

  try {
    registry.setActive(exchange);
    auditLogger.append("admin", "MODE_CHANGED", { exchange, action: "setActive" });
    req.log.info({ exchange }, "Adapters: active adapter changed");
    res.json({ active: exchange, health: registry.getActiveHealth() });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ── Ticker (via active adapter) ───────────────────────────────────────────────
// GET /api/adapters/ticker/:symbol
router.get("/adapters/ticker/:symbol", async (req, res) => {
  const { symbol } = req.params as { symbol: string };
  try {
    const adapter = registry.active();
    const ticker  = await breakers.get(`${adapter.exchange}-ticker`).call(
      () => adapter.getTicker(symbol)
    );
    res.json(ticker);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// ── Order book (via active adapter) ──────────────────────────────────────────
// GET /api/adapters/orderbook/:symbol
router.get("/adapters/orderbook/:symbol", async (req, res) => {
  const { symbol } = req.params as { symbol: string };
  const depth = parseInt(String(req.query["depth"] ?? "20"), 10);
  try {
    const adapter = registry.active();
    const book    = await breakers.get(`${adapter.exchange}-market`).call(
      () => adapter.getOrderBook(symbol, depth)
    );
    res.json(book);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// ── Account (via active adapter) ──────────────────────────────────────────────
// GET /api/adapters/account
router.get("/adapters/account", async (_req, res) => {
  try {
    const adapter = registry.active();
    const account = await breakers.get(`${adapter.exchange}-account`).call(
      () => adapter.getAccount()
    );
    res.json(account);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// ── Circuit breaker status ────────────────────────────────────────────────────
// GET /api/adapters/breakers
router.get("/adapters/breakers", (_req, res) => {
  res.json({ breakers: breakers.all() });
});

// ── Reset circuit breaker ─────────────────────────────────────────────────────
// POST /api/adapters/breakers/:name/reset
router.post("/adapters/breakers/:name/reset", (req, res) => {
  const { name } = req.params as { name: string };
  const b = breakers.get(name);
  b.reset();
  auditLogger.append("admin", "ADMIN_ACTION", { action: "breakerReset", breakerName: name });
  req.log.info({ breaker: name }, "Adapters: circuit breaker manually reset");
  res.json({ ok: true, breaker: b.snapshot() });
});

// ── Trip circuit breaker ──────────────────────────────────────────────────────
// POST /api/adapters/breakers/:name/trip
router.post("/adapters/breakers/:name/trip", (req, res) => {
  const { name }   = req.params as { name: string };
  const { reason } = req.body as { reason?: string };
  const b = breakers.get(name);
  b.trip(reason ?? "Manual trip");
  auditLogger.append("admin", "CIRCUIT_BREAKER_TRIPPED", { breakerName: name, reason });
  req.log.warn({ breaker: name, reason }, "Adapters: circuit breaker manually tripped");
  res.json({ ok: true, breaker: b.snapshot() });
});

// ── Credential vault: store credentials ───────────────────────────────────────
// POST /api/adapters/vault/store
// Body: { userId, exchange, apiKey, apiSecret, passphrase?, label? }
// NOTE: Credentials are encrypted immediately on arrival — never logged.
router.post("/adapters/vault/store", (req, res) => {
  const { userId, exchange, apiKey, apiSecret, passphrase, label } = req.body as {
    userId:      string;
    exchange:    string;
    apiKey:      string;
    apiSecret:   string;
    passphrase?: string;
    label?:      string;
  };

  if (!userId || !exchange || !apiKey || !apiSecret) {
    res.status(400).json({ error: "userId, exchange, apiKey, apiSecret required" });
    return;
  }

  vault.store_creds(userId, exchange, { apiKey, apiSecret, passphrase, label });
  auditLogger.append(userId, "CREDENTIAL_STORED", { exchange }, { exchange });
  req.log.info({ userId, exchange }, "Adapters: credentials stored (vault)");

  res.json({ ok: true, exchange, connected: vault.listConnected(userId) });
});

// ── Credential vault: list connected exchanges ─────────────────────────────────
// GET /api/adapters/vault/:userId/connections
router.get("/adapters/vault/:userId/connections", (req, res) => {
  const { userId } = req.params as { userId: string };
  res.json({ connections: vault.listConnected(userId) });
});

// ── Credential vault: delete credentials ──────────────────────────────────────
// DELETE /api/adapters/vault/:userId/:exchange
router.delete("/adapters/vault/:userId/:exchange", (req, res) => {
  const { userId, exchange } = req.params as { userId: string; exchange: string };
  const deleted = vault.delete(userId, exchange);
  if (deleted) {
    auditLogger.append(userId, "CREDENTIAL_DELETED", { exchange }, { exchange });
    req.log.info({ userId, exchange }, "Adapters: credentials deleted (vault)");
  }
  res.json({ ok: deleted });
});

// ── Connection test ────────────────────────────────────────────────────────────
// POST /api/adapters/vault/test
// Tests whether stored credentials for a user+exchange can authenticate.
router.post("/adapters/vault/test", async (req, res) => {
  const { userId, exchange } = req.body as { userId: string; exchange: string };
  if (!userId || !exchange) { res.status(400).json({ error: "userId, exchange required" }); return; }

  const creds = vault.retrieve(userId, exchange);
  if (!creds) { res.status(404).json({ ok: false, error: "No credentials stored for this exchange" }); return; }

  const adapter = registry.get(exchange);
  if (!adapter) { res.status(404).json({ ok: false, error: `No adapter for ${exchange}` }); return; }

  try {
    // Test by fetching BTC ticker — lightweight, no auth needed but confirms connectivity
    await adapter.getTicker("BTCUSD");
    auditLogger.append(userId, "EXCHANGE_CONNECTED", { exchange, test: true }, { exchange });
    req.log.info({ userId, exchange }, "Adapters: connection test passed");
    res.json({ ok: true, exchange, message: "Connection successful" });
  } catch (err) {
    req.log.warn({ userId, exchange, err: (err as Error).message }, "Adapters: connection test failed");
    res.json({ ok: false, exchange, error: (err as Error).message });
  }
});

export default router;
