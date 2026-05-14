import { Router } from "express";
import https from "node:https";
import { setSelectedExchange, getExchangeStatus } from "../lib/exchangeEngine.js";
import { logger } from "../lib/logger.js";

const router = Router();

const ALPACA_HOST = "paper-api.alpaca.markets";

function alpacaHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID":     process.env["ALPACA_API_KEY"]    ?? "",
    "APCA-API-SECRET-KEY": process.env["ALPACA_SECRET_KEY"] ?? "",
    "Content-Type":        "application/json",
  };
}

function isConfigured(): boolean {
  return !!(process.env["ALPACA_API_KEY"] && process.env["ALPACA_SECRET_KEY"]);
}

function alpacaGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { hostname: ALPACA_HOST, path, headers: alpacaHeaders() },
      res => {
        let d = "";
        res.on("data", c => { d += c as string; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(d) as Record<string, unknown>;
            if (parsed["code"] != null || (res.statusCode != null && res.statusCode >= 400)) {
              reject(new Error(String(parsed["message"] ?? parsed["code"] ?? `HTTP ${res.statusCode}`)));
            } else {
              resolve(parsed as T);
            }
          } catch {
            reject(new Error(`Non-JSON response: ${d.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
  });
}

function alpacaPost<T>(path: string, bodyStr: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers = {
      ...alpacaHeaders(),
      "Content-Length": String(Buffer.byteLength(bodyStr)),
    };
    const req = https.request(
      { hostname: ALPACA_HOST, path, method: "POST", headers },
      res => {
        let d = "";
        res.on("data", c => { d += c as string; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(d) as Record<string, unknown>;
            if (parsed["code"] != null || (res.statusCode != null && res.statusCode >= 400)) {
              reject(new Error(String(parsed["message"] ?? parsed["code"] ?? `HTTP ${res.statusCode}`)));
            } else {
              resolve(parsed as T);
            }
          } catch {
            reject(new Error(`Non-JSON response: ${d.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlpacaRawAccount {
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  status: string;
  daytrade_count: number;
  shorting_enabled: boolean;
  account_blocked: boolean;
  trading_blocked: boolean;
}

interface AlpacaRawPosition {
  asset_id: string;
  symbol: string;
  qty: string;
  qty_available?: string;
  side: string;
  asset_class: string;
  avg_entry_price: string;
  current_price?: string;
  lastday_price?: string;
  unrealized_pl?: string;
  unrealized_plpc?: string;
  market_value?: string;
}

interface AlpacaRawOrder {
  id: string;
  client_order_id?: string;
  symbol: string;
  side: string;
  type: string;
  qty?: string;
  filled_qty?: string;
  filled_avg_price?: string;
  status: string;
  submitted_at: string;
  filled_at?: string | null;
  canceled_at?: string | null;
  time_in_force?: string;
  limit_price?: string | null;
}

// ── GET /api/exchange/alpaca/account ─────────────────────────────────────────

router.get("/exchange/alpaca/account", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Alpaca credentials not configured" });
    return;
  }
  try {
    const acct = await alpacaGet<AlpacaRawAccount>("/v2/account");
    res.json({
      equity:         parseFloat(acct.equity),
      cash:           parseFloat(acct.cash),
      buyingPower:    parseFloat(acct.buying_power),
      portfolioValue: parseFloat(acct.portfolio_value),
      isPaper:        process.env["ALPACA_PAPER"] === "true",
      status:         acct.status,
      daytradeCount:  acct.daytrade_count,
      accountBlocked: acct.account_blocked,
      tradingBlocked: acct.trading_blocked,
    });
  } catch (err) {
    req.log.error({ err }, "Alpaca account fetch failed");
    res.status(502).json({ error: (err as Error).message });
  }
});

// ── GET /api/exchange/alpaca/positions ────────────────────────────────────────

router.get("/exchange/alpaca/positions", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Alpaca credentials not configured" });
    return;
  }
  try {
    const positions = await alpacaGet<AlpacaRawPosition[]>("/v2/positions");
    res.json(
      positions.map(p => ({
        id:           p.asset_id,
        symbol:       p.symbol.replace("/", ""),
        qty:          parseFloat(p.qty),
        qtyAvail:     parseFloat(p.qty_available ?? p.qty),
        side:         (parseFloat(p.qty) >= 0 ? "BUY" : "SELL") as "BUY" | "SELL",
        assetClass:   p.asset_class,
        entryPrice:   parseFloat(p.avg_entry_price),
        currentPrice: parseFloat(p.current_price ?? p.avg_entry_price),
        pnl:          parseFloat(p.unrealized_pl ?? "0"),
        pnlPct:       parseFloat(p.unrealized_plpc ?? "0") * 100,
        marketValue:  parseFloat(p.market_value ?? "0"),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Alpaca positions fetch failed");
    res.status(502).json({ error: (err as Error).message });
  }
});

// ── GET /api/exchange/alpaca/orders ──────────────────────────────────────────

router.get("/exchange/alpaca/orders", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Alpaca credentials not configured" });
    return;
  }
  try {
    const status = typeof req.query["status"] === "string" ? req.query["status"] : "all";
    const limit  = typeof req.query["limit"]  === "string" ? req.query["limit"]  : "50";
    const orders = await alpacaGet<AlpacaRawOrder[]>(
      `/v2/orders?status=${status}&limit=${limit}&direction=desc`
    );
    res.json(
      orders.map(o => ({
        id:            o.id,
        clientId:      o.client_order_id ?? null,
        symbol:        o.symbol.replace("/", ""),
        side:          o.side.toUpperCase() as "BUY" | "SELL",
        type:          o.type,
        qty:           parseFloat(o.qty ?? "0"),
        filledQty:     parseFloat(o.filled_qty ?? "0"),
        avgFillPrice:  parseFloat(o.filled_avg_price ?? "0"),
        limitPrice:    o.limit_price ? parseFloat(o.limit_price) : null,
        status:        o.status,
        timeInForce:   o.time_in_force ?? "gtc",
        submittedAt:   o.submitted_at,
        filledAt:      o.filled_at ?? null,
        canceledAt:    o.canceled_at ?? null,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Alpaca orders fetch failed");
    res.status(502).json({ error: (err as Error).message });
  }
});

// ── POST /api/exchange/alpaca/activate ───────────────────────────────────────
// Sets Alpaca as the active exchange and verifies connectivity

router.post("/exchange/alpaca/activate", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Alpaca credentials not configured" });
    return;
  }
  try {
    const acct = await alpacaGet<AlpacaRawAccount>("/v2/account");
    setSelectedExchange("Alpaca");
    logger.info("Alpaca set as active exchange (paper: %s)", process.env["ALPACA_PAPER"]);
    res.json({
      ok:             true,
      exchange:       "Alpaca",
      isPaper:        process.env["ALPACA_PAPER"] === "true",
      equity:         parseFloat(acct.equity),
      buyingPower:    parseFloat(acct.buying_power),
      status:         getExchangeStatus(),
    });
  } catch (err) {
    req.log.error({ err }, "Alpaca activation failed");
    res.status(502).json({ error: (err as Error).message });
  }
});

// ── POST /api/exchange/alpaca/order ──────────────────────────────────────────
// Place a paper order through Alpaca

router.post("/exchange/alpaca/order", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Alpaca credentials not configured" });
    return;
  }
  const { symbol, side, qty, type = "market", limitPrice, notional } = req.body as {
    symbol: string; side: string; qty?: number; notional?: number;
    type?: string; limitPrice?: number;
  };

  if (!symbol || !side || (!qty && !notional)) {
    res.status(400).json({ error: "symbol, side, and qty or notional are required" });
    return;
  }

  try {
    // Alpaca crypto uses symbol format BTC/USD, equities use BTCUSD
    const alpacaSymbol = symbol.replace("USD", "/USD").replace("//", "/");

    const body: Record<string, string | number> = {
      symbol:        alpacaSymbol,
      side:          side.toLowerCase(),
      type:          type === "limit" ? "limit" : "market",
      time_in_force: "gtc",
    };
    if (qty)      body["qty"]         = qty;
    if (notional) body["notional"]    = notional;
    if (type === "limit" && limitPrice) body["limit_price"] = limitPrice;

    const order = await alpacaPost<AlpacaRawOrder>("/v2/orders", JSON.stringify(body));
    req.log.info({ symbol, side, qty, type }, "Alpaca paper order placed");
    res.json({
      id:           order.id,
      symbol:       order.symbol.replace("/", ""),
      side:         order.side.toUpperCase(),
      status:       order.status,
      qty:          parseFloat(order.qty ?? "0"),
      filledQty:    parseFloat(order.filled_qty ?? "0"),
      avgFillPrice: parseFloat(order.filled_avg_price ?? "0"),
      submittedAt:  order.submitted_at,
      filledAt:     order.filled_at ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Alpaca order placement failed");
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
