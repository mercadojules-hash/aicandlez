import https from "node:https";
import { BaseExchangeAdapter } from "../BaseExchangeAdapter.js";
import type {
  AdapterConfig, PlaceOrderRequest, CancelOrderRequest,
  StandardOrder, StandardAccount, StandardCandle, StandardTicker, OrderBook,
} from "../types.js";
import { emptyAccount } from "./BinanceAdapter.js";

// ── dYdXAdapter ───────────────────────────────────────────────────────────────
//
// dYdX v4 adapter — full read + write (live trading) support.
//
// AUTH MODEL
//   dYdX v4 is a Cosmos SDK app-chain (dYdX Chain). There is no API
//   key / secret model. Signing happens with a 24-word BIP-39 mnemonic
//   that derives a `dydx1…` bech32 address; each address owns one or
//   more numbered subaccounts.
//
//   We map our generic `AdapterConfig` fields onto that model:
//     • `apiSecret` → BIP-39 mnemonic (REQUIRED for any write path)
//     • `apiKey`    → subaccount number as a string (OPTIONAL,
//                     defaults to "0")
//
//   Read paths (`getTicker`, `getCandles`, `getOrderBook`) require no
//   credentials and continue to hit the public indexer.
//
// IMPLEMENTATION
//   All write paths route through `@dydxprotocol/v4-client-js`, which
//   handles cosmos-sdk transaction encoding, `MsgPlaceOrder` /
//   `MsgCancelOrder` packing, sequence/account-number management, fee
//   estimation, and tendermint broadcast. We expose:
//
//     ✓ getTicker     — indexer REST
//     ✓ getCandles    — indexer REST
//     ✓ getOrderBook  — indexer REST
//     ✓ getAccount    — indexer subaccount snapshot
//     ✓ placeOrder    — signs + broadcasts MsgPlaceOrder, then resolves
//                       the order via the indexer and stamps the real
//                       broker fee from `fills[].fee` (source:"broker")
//     ✓ cancelOrder   — signs + broadcasts MsgCancelOrder
//     ✓ getOrder      — indexer lookup + summed fill fees

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD:  "BTC-USD", ETHUSD:  "ETH-USD", SOLUSD:  "SOL-USD",
  XRPUSD:  "XRP-USD", DOGEUSD: "DOGE-USD", AVAXUSD: "AVAX-USD",
  LINKUSD: "LINK-USD", ADAUSD: "ADA-USD",
};
const REVERSE_MAP = Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]));

const TF_MAP: Record<string, string> = {
  "1m": "1MIN", "5m": "5MINS", "15m": "15MINS", "30m": "30MINS",
  "1h": "1HOUR", "4h": "4HOURS", "1d": "1DAY",
};

export const DYDX_CONFIG: AdapterConfig = {
  exchange:    "dYdX",
  takerFeePct: 0.05,
  makerFeePct: 0.02,
  rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 300 },
};

// uint32 max — dYdX clientId domain. SDK exposes the same constant in
// `examples/constants.ts`; we hard-code it here to avoid pulling an
// `examples/` file into the production bundle.
const MAX_CLIENT_ID = 2 ** 32 - 1;

// Cosmos `dydx1…` bech32 prefix exported as `BECH32_PREFIX` from the v4
// client lib. Hard-coded to avoid an extra (lazy) import roundtrip.
const BECH32_PREFIX = "dydx";

interface IndexerOrder {
  id?: string;
  clientId?: string;
  clobPairId?: string;
  orderFlags?: string;
  ticker?: string;
  status?: string;
  side?: string;
  type?: string;
  size?: string;
  totalFilled?: string;
  price?: string;
  goodTilBlock?: string;
  goodTilBlockTime?: string;
  createdAtHeight?: string;
  updatedAt?: string;
  createdAt?: string;
}
interface IndexerFill {
  id?: string;
  orderId?: string;
  side?: string;
  size?: string;
  price?: string;
  fee?: string;
  createdAt?: string;
  market?: string;
}

export class dYdXAdapter extends BaseExchangeAdapter {
  // dYdX v4 testnet indexer → indexer.v4testnet.dydx.exchange (verified).
  private readonly BASE = this.resolveHost({
    prod:    "indexer.dydx.trade",
    testnet: "indexer.v4testnet.dydx.exchange",
  });

  // Lazily-constructed signing stack — keeps startup cost out of the
  // hot path (the @dydxprotocol/v4-client-js bundle pulls in @cosmjs,
  // which is heavy). Only instantiated when the first write call comes
  // in for a configured (mnemonic-bearing) adapter.
  private signingPromise: Promise<SigningStack> | null = null;

  constructor(config: Partial<AdapterConfig> = {}) {
    super({ ...DYDX_CONFIG, ...config });
  }

  normaliseSymbol(s: string): string  { return SYMBOL_MAP[s] ?? `${s.slice(0, -3)}-USD`; }
  denormaliseSymbol(s: string): string { return REVERSE_MAP[s] ?? s.replace("-", ""); }

  async connect(): Promise<void> {
    // Public websocket available: wss://indexer.dydx.trade/v4/ws
    // No auth required for market data
    this.setState("connected");
    this.heartbeat();
  }

  async disconnect(): Promise<void> { this.setState("disconnected"); }

  async getTicker(symbol: string): Promise<StandardTicker> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<dYdXMarketsResp>(`/v4/perpetualMarkets?ticker=${pair}`),
      3, 300, "getTicker",
    );
    const m = data.markets?.[pair];
    if (!m) throw new Error(`dYdX: no market for ${symbol}`);
    const last = parseFloat(m.oraclePrice ?? m.priceChange24H ?? "0");
    return {
      symbol, exchange: "dYdX",
      bid:       parseFloat(m.bestBid ?? "0"),
      ask:       parseFloat(m.bestAsk ?? "0"),
      last,
      volume24h: parseFloat(m.volume24H ?? "0"),
      change24h: parseFloat(m.priceChange24H ?? "0"),
      changePct: 0,
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]> {
    this.checkRequestRateLimit();
    const pair     = this.normaliseSymbol(symbol);
    const resolution = TF_MAP[timeframe] ?? "5MINS";
    const data     = await this.withRetry(
      () => this.get<{ candles: dYdXCandle[] }>(`/v4/candles/perpetualMarkets/${pair}?resolution=${resolution}&limit=${limit}`),
      3, 300, "getCandles",
    );
    return (data.candles ?? []).reverse().map(r => ({
      time:   new Date(r.startedAt).getTime(),
      open:   parseFloat(r.open),
      high:   parseFloat(r.high),
      low:    parseFloat(r.low),
      close:  parseFloat(r.close),
      volume: parseFloat(r.baseTokenVolume ?? "0"),
    }));
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    this.checkRequestRateLimit();
    const pair = this.normaliseSymbol(symbol);
    const data = await this.withRetry(
      () => this.get<{ bids: dYdXLevel[]; asks: dYdXLevel[] }>(`/v4/orderbooks/perpetualMarket/${pair}`),
      3, 300, "getOrderBook",
    );
    return {
      symbol, exchange: "dYdX",
      bids: (data.bids ?? []).slice(0, depth).map(b => ({ price: parseFloat(b.price), qty: parseFloat(b.size) })),
      asks: (data.asks ?? []).slice(0, depth).map(a => ({ price: parseFloat(a.price), qty: parseFloat(a.size) })),
      timestamp: Date.now(),
    };
  }

  async getAccount(): Promise<StandardAccount> {
    if (!this.config.apiSecret) return emptyAccount("dYdX");
    try {
      const stack = await this.getSigningStack();
      const snap = await stack.indexer.account.getSubaccount(
        stack.address, stack.subaccountNumber,
      ) as { subaccount?: { equity?: string; assetPositions?: Record<string, { symbol?: string; size?: string }>; openPerpetualPositions?: Record<string, unknown> } };

      const sub = snap.subaccount;
      const equity = parseFloat(sub?.equity ?? "0");
      const balances: Record<string, { free: number; locked: number; total: number }> = {};
      for (const pos of Object.values(sub?.assetPositions ?? {})) {
        const sym = pos?.symbol ?? "USDC";
        const sz  = Math.abs(parseFloat(pos?.size ?? "0"));
        balances[sym] = { free: sz, locked: 0, total: sz };
      }
      return {
        exchange: "dYdX",
        balances,
        totalEquityUSD: equity,
        positions: [],
        lastUpdated: Date.now(),
      };
    } catch {
      return emptyAccount("dYdX");
    }
  }

  async placeOrder(req: PlaceOrderRequest): Promise<StandardOrder> {
    if (!this.config.apiSecret) {
      throw new Error("dYdX: BIP-39 mnemonic (apiSecret) required for live trading");
    }
    this.checkOrderRateLimit();

    const stack = await this.getSigningStack();
    const { CompositeClient, OrderSide: DySide, OrderType: DyType,
            OrderTimeInForce, OrderExecution } = stack.sdk;

    const marketId = this.normaliseSymbol(req.symbol);

    // Reference price needed even for MARKET orders (used by the SDK to
    // derive `subticks` / slippage protection). Pull from the public
    // indexer ticker so we don't require the caller to supply one.
    const referencePrice = req.limitPrice ?? await this.fetchReferencePrice(marketId, req.side);

    const sdkType = req.type === "market" ? DyType.MARKET : DyType.LIMIT;
    const sdkSide = req.side === "buy"    ? DySide.BUY    : DySide.SELL;
    const tif     = req.type === "market" ? OrderTimeInForce.IOC : OrderTimeInForce.GTT;
    const goodTilSeconds = req.type === "market" ? 0 : 60;

    const clientId = Math.floor(Math.random() * MAX_CLIENT_ID);

    await stack.client.placeOrder(
      stack.subaccount,
      marketId,
      sdkType,
      sdkSide,
      referencePrice,
      req.qty,
      clientId,
      tif,
      goodTilSeconds,
      OrderExecution.DEFAULT,
      false, // postOnly
      false, // reduceOnly
    );

    // Best-effort: resolve the resulting order via the indexer so we
    // can stamp the real broker fee on the returned StandardOrder.
    const resolved = await this.findOrderByClientId(stack, marketId, clientId, 8_000);
    if (resolved) return resolved;

    // Tx was broadcast but indexer hasn't surfaced fills yet — return
    // an estimate-flagged shell so the caller can re-resolve via
    // `getOrder(exchangeOrderId)` once the indexer catches up. The
    // composite client guarantees `clientId` uniqueness per subaccount,
    // so we encode the lookup tuple in `exchangeOrderId`.
    const fallbackId = `${stack.address}|${stack.subaccountNumber}|${clientId}|${marketId}`;
    return {
      id: fallbackId,
      exchangeOrderId: fallbackId,
      exchange: "dYdX",
      symbol: req.symbol,
      nativeSymbol: marketId,
      side: req.side,
      type: req.type,
      status: "open",
      requestedQty: req.qty,
      filledQty: 0,
      requestedPrice: req.limitPrice,
      avgFillPrice: referencePrice,
      quoteQty: req.qty * referencePrice,
      fee: {
        amount: this.computeFee(req.qty * referencePrice, true),
        currency: "USDC",
        ratePct: this.config.takerFeePct,
        source: "estimate",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }> {
    if (!this.config.apiSecret) {
      return { ok: false, reason: "dYdX: mnemonic (apiSecret) required to cancel" };
    }
    try {
      const stack = await this.getSigningStack();
      // Pull the live order from the indexer so we have the exact
      // clientId / orderFlags / clobPairId / goodTil tuple required by
      // MsgCancelOrder. `exchangeOrderId` may be an indexer order UUID
      // or our placeOrder fallback string.
      const order = await this.resolveIndexerOrder(stack, req.exchangeOrderId);
      if (!order) return { ok: false, reason: "dYdX: order not found on indexer" };

      const clientId   = parseInt(order.clientId   ?? "0", 10);
      const orderFlags = parseInt(order.orderFlags ?? "0", 10);
      const marketId   = order.ticker ?? this.normaliseSymbol(req.symbol);
      const goodTilBlock     = order.goodTilBlock     ? parseInt(order.goodTilBlock, 10) : undefined;
      const goodTilBlockTime = order.goodTilBlockTime ? Math.floor(new Date(order.goodTilBlockTime).getTime() / 1000) : undefined;

      await stack.client.cancelOrder(
        stack.subaccount,
        clientId,
        orderFlags,
        marketId,
        goodTilBlock,
        goodTilBlockTime,
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: `dYdX: ${(err as Error).message}` };
    }
  }

  async getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null> {
    if (!this.config.apiSecret) return null;
    try {
      const stack = await this.getSigningStack();
      const order = await this.resolveIndexerOrder(stack, exchangeOrderId);
      if (!order) return null;

      const marketId = order.ticker ?? this.normaliseSymbol(symbol);
      const fills    = await this.fetchFillsForOrder(stack, marketId, order.id);
      return this.orderToStandard(order, fills, symbol, marketId);
    } catch {
      return null;
    }
  }

  // ── Internal: signing stack & indexer helpers ────────────────────────────

  private async getSigningStack(): Promise<SigningStack> {
    if (this.signingPromise) return this.signingPromise;
    this.signingPromise = (async () => {
      const sdk = await import("@dydxprotocol/v4-client-js");
      const network = this.config.testnet ? sdk.Network.testnet() : sdk.Network.mainnet();

      const mnemonic = this.config.apiSecret!.trim();
      const wallet   = await sdk.LocalWallet.fromMnemonic(mnemonic, BECH32_PREFIX);
      const address  = wallet.address;
      if (!address) throw new Error("dYdX: failed to derive address from mnemonic");

      const subaccountNumber = this.config.apiKey
        ? Math.max(0, parseInt(this.config.apiKey, 10) || 0)
        : 0;
      const subaccount = sdk.SubaccountInfo.forLocalWallet(wallet, subaccountNumber);

      const client = await sdk.CompositeClient.connect(network);
      return {
        sdk,
        client,
        indexer: client.indexerClient,
        wallet,
        subaccount,
        address,
        subaccountNumber,
      } satisfies SigningStack;
    })();
    return this.signingPromise;
  }

  private async fetchReferencePrice(marketId: string, side: "buy" | "sell"): Promise<number> {
    const data = await this.withRetry(
      () => this.get<dYdXMarketsResp>(`/v4/perpetualMarkets?ticker=${marketId}`),
      3, 300, "refPrice",
    );
    const m = data.markets?.[marketId];
    const oracle = parseFloat(m?.oraclePrice ?? "0");
    const bid    = parseFloat(m?.bestBid     ?? "0");
    const ask    = parseFloat(m?.bestAsk     ?? "0");
    const base   = side === "buy" ? (ask || oracle) : (bid || oracle);
    if (!base || !Number.isFinite(base)) {
      throw new Error(`dYdX: unable to derive reference price for ${marketId}`);
    }
    // 5% slippage envelope on MARKET — same convention the SDK uses in
    // its own short-term market-order helper.
    return side === "buy" ? base * 1.05 : base * 0.95;
  }

  private async findOrderByClientId(
    stack: SigningStack, marketId: string, clientId: number, timeoutMs: number,
  ): Promise<StandardOrder | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const resp = await stack.indexer.account.getSubaccountOrders(
          stack.address, stack.subaccountNumber, marketId,
        ) as IndexerOrder[];
        const match = (resp ?? []).find(o => parseInt(o.clientId ?? "-1", 10) === clientId);
        if (match?.id) {
          const fills = await this.fetchFillsForOrder(stack, marketId, match.id);
          return this.orderToStandard(match, fills, this.denormaliseSymbol(marketId), marketId);
        }
      } catch { /* indexer eventual consistency — retry */ }
      await this.sleep(750);
    }
    return null;
  }

  private async resolveIndexerOrder(stack: SigningStack, idOrFallback: string): Promise<IndexerOrder | null> {
    // Fallback shape from placeOrder when indexer was cold:
    //   "<address>|<subaccountNumber>|<clientId>|<marketId>"
    if (idOrFallback.includes("|")) {
      const [, , clientIdStr, marketId] = idOrFallback.split("|");
      const clientId = parseInt(clientIdStr ?? "-1", 10);
      if (!Number.isFinite(clientId) || !marketId) return null;
      try {
        const resp = await stack.indexer.account.getSubaccountOrders(
          stack.address, stack.subaccountNumber, marketId,
        ) as IndexerOrder[];
        return (resp ?? []).find(o => parseInt(o.clientId ?? "-1", 10) === clientId) ?? null;
      } catch { return null; }
    }
    try {
      const order = await stack.indexer.account.getOrder(idOrFallback) as IndexerOrder | IndexerOrder[];
      return Array.isArray(order) ? (order[0] ?? null) : (order ?? null);
    } catch { return null; }
  }

  private async fetchFillsForOrder(
    stack: SigningStack, marketId: string, orderId: string | undefined,
  ): Promise<IndexerFill[]> {
    if (!orderId) return [];
    try {
      const resp = await stack.indexer.account.getSubaccountFills(
        stack.address, stack.subaccountNumber, marketId, undefined, 100,
      ) as { fills?: IndexerFill[] } | IndexerFill[];
      const all = Array.isArray(resp) ? resp : (resp.fills ?? []);
      return all.filter(f => f.orderId === orderId);
    } catch { return []; }
  }

  private orderToStandard(
    order: IndexerOrder, fills: IndexerFill[], normalisedSymbol: string, nativeSymbol: string,
  ): StandardOrder {
    const filledQty = parseFloat(order.totalFilled ?? "0");
    const requestedQty = parseFloat(order.size ?? "0");
    const requestedPrice = order.price ? parseFloat(order.price) : undefined;

    let feeAmount = 0;
    let quoteQty  = 0;
    let weightedPriceNumer = 0;
    for (const f of fills) {
      const sz = parseFloat(f.size  ?? "0");
      const pr = parseFloat(f.price ?? "0");
      feeAmount += parseFloat(f.fee ?? "0");
      quoteQty  += sz * pr;
      weightedPriceNumer += sz * pr;
    }
    const avgFillPrice = filledQty > 0 ? weightedPriceNumer / filledQty
                       : (requestedPrice ?? 0);

    const statusMap: Record<string, StandardOrder["status"]> = {
      OPEN: "open", BEST_EFFORT_OPENED: "open",
      FILLED: "filled",
      CANCELED: "cancelled", BEST_EFFORT_CANCELED: "cancelled",
      UNTRIGGERED: "open",
    };
    const status: StandardOrder["status"] =
      statusMap[(order.status ?? "").toUpperCase()] ??
      (filledQty > 0 && filledQty < requestedQty ? "partial"
        : filledQty >= requestedQty && requestedQty > 0 ? "filled"
        : "open");

    const hasBrokerFee = fills.length > 0 && feeAmount !== 0;
    return {
      id: order.id ?? `${nativeSymbol}-${order.clientId ?? "?"}`,
      exchangeOrderId: order.id ?? `${nativeSymbol}-${order.clientId ?? "?"}`,
      exchange: "dYdX",
      symbol: normalisedSymbol,
      nativeSymbol,
      side: (order.side ?? "BUY").toUpperCase() === "SELL" ? "sell" : "buy",
      type: (order.type ?? "LIMIT").toUpperCase() === "MARKET" ? "market" : "limit",
      status,
      requestedQty,
      filledQty,
      requestedPrice,
      avgFillPrice,
      quoteQty,
      fee: hasBrokerFee
        ? { amount: feeAmount, currency: "USDC", ratePct: this.config.takerFeePct, source: "broker" }
        : { amount: this.computeFee(quoteQty, true), currency: "USDC", ratePct: this.config.takerFeePct, source: "estimate" },
      createdAt: order.createdAt ? new Date(order.createdAt).getTime() : Date.now(),
      updatedAt: order.updatedAt ? new Date(order.updatedAt).getTime() : Date.now(),
      rawResponse: { order, fills },
    };
  }

  // ── HTTP helper (public indexer GET) ──────────────────────────────────────

  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get({ hostname: this.BASE, path, headers: { "Accept": "application/json" } }, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error("dYdX: parse failed")); }
        });
      }).on("error", reject);
    });
  }
}

// ── Internal types ───────────────────────────────────────────────────────────
type DyDxSdk = typeof import("@dydxprotocol/v4-client-js");
type DyDxCompositeClient = Awaited<ReturnType<DyDxSdk["CompositeClient"]["connect"]>>;
type DyDxLocalWallet     = Awaited<ReturnType<DyDxSdk["LocalWallet"]["fromMnemonic"]>>;
type DyDxSubaccountInfo  = ReturnType<DyDxSdk["SubaccountClient"]["forLocalWallet"]>;
interface SigningStack {
  sdk:              DyDxSdk;
  client:           DyDxCompositeClient;
  indexer:          DyDxCompositeClient["indexerClient"];
  wallet:           DyDxLocalWallet;
  subaccount:       DyDxSubaccountInfo;
  address:          string;
  subaccountNumber: number;
}

// ── dYdX API types ────────────────────────────────────────────────────────────
interface dYdXMarketsResp {
  markets?: Record<string, {
    oraclePrice?: string; bestBid?: string; bestAsk?: string;
    volume24H?: string; priceChange24H?: string;
  }>;
}
interface dYdXCandle {
  startedAt: string; open: string; high: string; low: string; close: string; baseTokenVolume?: string;
}
interface dYdXLevel { price: string; size: string; }
