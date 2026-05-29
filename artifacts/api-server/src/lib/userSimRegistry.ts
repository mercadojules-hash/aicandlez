import { db } from "@workspace/db";
import {
  simAccountsTable,
  simPositionsTable,
  simTradesTable,
  userSettingsTable,
} from "@workspace/db";
import { eq, desc, sql, and, or, isNotNull } from "drizzle-orm";
import { getTicker, SUPPORTED_SYMBOLS } from "./marketData.js";
import { logger } from "./logger.js";
import {
  emitLiveCloseNotification,
  isDryRunEnabled,
  placeLiveCloseOrderForUser,
} from "./liveUserExecution.js";
import { CATALOG_BY_ID } from "../services/exchanges/catalog.js";
import { recordPerformanceFee, resolveFeePolicy } from "./feeLedger.js";
import { resolveCorrelation } from "./executionTelemetry.js";

// Synchronous equity proxy used by close-path instrumentation. Equity here =
// cashBalance + Σ position.sizeUSD (entry notional). It is NOT a live MTM —
// computing that requires async ticker fetches we cannot await mid-mutation.
// The diagnostic value of equityBefore/After comes from showing the discrete
// jump: `cash += closedSizeUSD + realizedPnL - fees` and `sizeUSD` leaves
// `positions[]`, so the delta must equal `realizedPnL - netFees - platformFee`.
function equityProxy(state: UserSimState): number {
  let total = state.account.cashBalance;
  for (const p of state.positions) total += p.sizeUSD;
  return parseFloat(total.toFixed(2));
}

// Compute a fill commission for a live trade leg using the exchange catalog's
// default taker fee rate. Returns null for paper fills (no broker, no fee).
function computeFillFee(exchange: string | undefined, notionalUSD: number): number | null {
  if (!exchange) return null;
  const meta = CATALOG_BY_ID[exchange];
  if (!meta) return null;
  // `takerFeePct` is expressed as a percent (e.g. 0.26 = 0.26%).
  const fee = (notionalUSD * meta.takerFeePct) / 100;
  return parseFloat(fee.toFixed(4));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserSimPosition {
  id: string;
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  entryTime: number;
  sizeUSD: number;
  signalId?: string;
  stopLoss?: number;
  takeProfit?: number;
  currentPrice?: number;
  unrealizedPnL?: number;
  unrealizedPnLPct?: number;
  marketValue?: number;
  exchange?: string;
  exchangeOrderId?: string;
  // Broker-reported entry-leg commission carried from the open fill so the
  // close-side receipt can prefer it over the catalog estimate. Undefined
  // for paper fills and for brokers that don't surface a per-order fee.
  entryFeeBroker?: number;
  entryFeeBrokerCurrency?: string;
  // True when the position was opened against the exchange's public
  // sandbox/testnet. Authoritative for the close-side routing decision
  // (see closeUserPosition below).
  sandbox?: boolean;
}

export interface UserSimTrade {
  id: string;
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  sizeUSD: number;
  realizedPnL: number;
  realizedPnLPct: number;
  durationMs: number;
  closeReason: string;
  exchange?: string;
  exchangeOrderId?: string;
  exchangeCloseOrderId?: string;
  // Catalog-estimated fees (existing): computed from CATALOG_BY_ID taker rate.
  entryFee?: number;
  exitFee?: number;
  netFees?: number;
  // Broker-reported fees (new): straight from the exchange's order payload.
  // Persisted alongside the estimate so the receipt can prefer the real
  // figure when present and gracefully fall back to the estimate otherwise.
  entryFeeBroker?: number;
  entryFeeBrokerCurrency?: string;
  exitFeeBroker?: number;
  exitFeeBrokerCurrency?: string;
  // True when this trade was opened against the exchange's public
  // sandbox/testnet (mirrors the open-side `sim_positions.sandbox` flag).
  sandbox?: boolean;
  // Platform performance fee (3% of NET realized PnL, charged only on
  // profitable closes). Deducted from cashBalance + totalRealized on close
  // and recorded to `performance_fees`. Absent on losing/break-even closes
  // and on accounts where the fee policy resolves to skip (internal /
  // complimentary / waived).
  platformFeeUSD?: number;
  platformFeeRate?: number;
  platformFeeSkipReason?: string;
}

interface UserSimAccount {
  userId: string;
  startingBalance: number;
  cashBalance: number;
  totalRealized: number;
  totalTrades: number;
}

interface UserSimState {
  account: UserSimAccount;
  positions: UserSimPosition[];
  tradeHistory: UserSimTrade[];
  idSeq: number;
}

// ── Symbol aliases ────────────────────────────────────────────────────────────

const SYMBOL_ALIASES: Record<string, string> = {
  BTC: "BTCUSD", ETH: "ETHUSD", SOL: "SOLUSD",
};

function normalizeSymbol(sym: string): string {
  return SYMBOL_ALIASES[sym.toUpperCase()] ?? sym.toUpperCase();
}

function newId(state: UserSimState): string {
  return `SIM-${Date.now()}-${++state.idSeq}`;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = new Map<string, UserSimState>();

// In-flight load memoization. Without this, two concurrent first-touch calls
// for the same userId (e.g. the trailing-stop fan-out closing multiple
// positions for a user whose state isn't cached yet) each miss the registry,
// each `loadFromDB`, and each `registry.set` a SEPARATE UserSimState object.
// The second close then computes its account delta off a stale base and the
// absolute-write persist clobbers the first — the lost-update race proven in
// the Phase 2 verification. Sharing one in-flight promise guarantees a single
// canonical UserSimState per user even under concurrent cold-cache access.
const inflightLoads = new Map<string, Promise<UserSimState>>();

async function getOrLoad(userId: string): Promise<UserSimState> {
  const existing = registry.get(userId);
  if (existing) return existing;

  let pending = inflightLoads.get(userId);
  if (!pending) {
    pending = loadFromDB(userId)
      .then((state) => {
        registry.set(userId, state);
        return state;
      })
      .finally(() => {
        inflightLoads.delete(userId);
      });
    inflightLoads.set(userId, pending);
  }
  return pending;
}

// Test-only: evict cached in-memory state so the next getOrLoad rehydrates from
// the database. Used by the concurrency suite to simulate a process restart for
// the recovery scenario. Not referenced by any production code path.
export function __clearRegistryForTests(userId?: string): void {
  if (userId !== undefined) {
    registry.delete(userId);
    inflightLoads.delete(userId);
  } else {
    registry.clear();
    inflightLoads.clear();
  }
}

async function loadFromDB(userId: string): Promise<UserSimState> {
  let dbAccount = await db
    .select()
    .from(simAccountsTable)
    .where(eq(simAccountsTable.userId, userId))
    .limit(1)
    .then((r) => r[0]);

  if (!dbAccount) {
    [dbAccount] = await db
      .insert(simAccountsTable)
      .values({ userId, startingBalance: 100_000, cashBalance: 100_000, totalRealized: 0, totalTrades: 0 })
      .returning();
    logger.info({ userId }, "UserSimRegistry: created new sim account");
  }

  const dbPositions = await db
    .select()
    .from(simPositionsTable)
    .where(eq(simPositionsTable.userId, userId));

  const dbTrades = await db
    .select()
    .from(simTradesTable)
    .where(eq(simTradesTable.userId, userId))
    .orderBy(desc(simTradesTable.createdAt))
    .limit(100);

  const state: UserSimState = {
    account: {
      userId,
      startingBalance: dbAccount!.startingBalance,
      cashBalance:     dbAccount!.cashBalance,
      totalRealized:   dbAccount!.totalRealized,
      totalTrades:     dbAccount!.totalTrades,
    },
    positions: dbPositions.map((p) => ({
      id:              p.id,
      userId:          p.userId,
      symbol:          p.symbol,
      side:            p.side as "BUY" | "SELL",
      quantity:        p.quantity,
      entryPrice:      p.entryPrice,
      entryTime:       p.entryTime,
      sizeUSD:         p.sizeUSD,
      signalId:        p.signalId ?? undefined,
      stopLoss:        p.stopLoss ?? undefined,
      takeProfit:      p.takeProfit ?? undefined,
      exchange:        p.exchange ?? undefined,
      exchangeOrderId: p.exchangeOrderId ?? undefined,
      entryFeeBroker:         p.entryFeeBroker ?? undefined,
      entryFeeBrokerCurrency: p.entryFeeBrokerCurrency ?? undefined,
      sandbox:                p.sandbox === true,
    })),
    tradeHistory: dbTrades.map((t) => {
      const entryFee = t.entryFee ?? undefined;
      const exitFee  = t.exitFee  ?? undefined;
      const netFees  =
        entryFee !== undefined || exitFee !== undefined
          ? parseFloat(((entryFee ?? 0) + (exitFee ?? 0)).toFixed(4))
          : undefined;
      return ({
      id:              t.id,
      userId:          t.userId,
      symbol:          t.symbol,
      side:            t.side as "BUY" | "SELL",
      quantity:        t.quantity,
      entryPrice:      t.entryPrice,
      exitPrice:       t.exitPrice,
      entryTime:       t.entryTime,
      exitTime:        t.exitTime,
      sizeUSD:         t.sizeUSD,
      realizedPnL:     t.realizedPnL,
      realizedPnLPct:  t.realizedPnLPct,
      durationMs:      t.durationMs,
      closeReason:     t.closeReason ?? "MANUAL",
      exchange:             t.exchange ?? undefined,
      exchangeOrderId:      t.exchangeOrderId ?? undefined,
      exchangeCloseOrderId: t.exchangeCloseOrderId ?? undefined,
      entryFee,
      exitFee,
      netFees,
      entryFeeBroker:         t.entryFeeBroker ?? undefined,
      entryFeeBrokerCurrency: t.entryFeeBrokerCurrency ?? undefined,
      exitFeeBroker:          t.exitFeeBroker ?? undefined,
      exitFeeBrokerCurrency:  t.exitFeeBrokerCurrency ?? undefined,
      sandbox:                t.sandbox === true,
      });
    }),
    idSeq: 0,
  };

  logger.info(
    { userId, cashBalance: state.account.cashBalance, positions: state.positions.length },
    "UserSimRegistry: loaded user sim state from DB"
  );

  return state;
}

async function persistAccount(
  state: UserSimState,
  ctx?: { correlationId?: string | null; symbol?: string; positionId?: string; tag?: string },
): Promise<void> {
  const result = await db
    .update(simAccountsTable)
    .set({
      cashBalance:   state.account.cashBalance,
      totalRealized: state.account.totalRealized,
      totalTrades:   state.account.totalTrades,
      updatedAt:     new Date(),
    })
    .where(eq(simAccountsTable.userId, state.account.userId))
    .returning({ userId: simAccountsTable.userId });

  const rowCount = result.length;
  if (rowCount === 0) {
    // Silent-failure suspect for the "realized stays $0" convergence bug:
    // UPDATE matched zero rows (account row absent for this userId), so
    // in-memory mutations to cashBalance / totalRealized are NOT durable
    // and the next process restart or getOrLoad cache miss will re-hydrate
    // a stale state. Surface as ERROR so this never goes unnoticed again.
    logger.error(
      {
        tag:           "ACCOUNT_PERSIST_NOOP",
        sourceOfTruth: "userSimRegistry.persistAccount",
        userId:        state.account.userId,
        correlationId: ctx?.correlationId ?? null,
        symbol:        ctx?.symbol,
        positionId:    ctx?.positionId,
        callerTag:     ctx?.tag,
        rowCount,
        cashBalance:   state.account.cashBalance,
        totalRealized: state.account.totalRealized,
      },
      "persistAccount UPDATE matched 0 rows — sim_accounts row missing for userId; account state will NOT be durable",
    );
  } else {
    logger.info(
      {
        tag:           "ACCOUNT_SUMMARY_PERSISTED",
        sourceOfTruth: "userSimRegistry.persistAccount",
        userId:        state.account.userId,
        correlationId: ctx?.correlationId ?? null,
        symbol:        ctx?.symbol,
        positionId:    ctx?.positionId,
        callerTag:     ctx?.tag,
        rowCount,
        cashBalance:   state.account.cashBalance,
        totalRealized: state.account.totalRealized,
        totalTrades:   state.account.totalTrades,
      },
      "persistAccount UPDATE committed",
    );
  }
}

// ── Atomic, idempotent close persistence ──────────────────────────────────────
//
// Replaces the prior `Promise.all([insert sim_trade, position mutation,
// persistAccount])` block from closeUserPosition. That block lost updates under
// concurrent same-user closes because persistAccount wrote ABSOLUTE account
// values computed from (possibly stale / duplicated) in-memory state, so two
// simultaneous closes clobbered each other's cash/realized/trade-count deltas.
//
// finalizeClose performs all three writes inside ONE transaction and settles
// the account with SQL-side increments (`cash = cash + Δ`) so simultaneous
// closes accumulate correctly regardless of in-memory state. The position
// delete/update is guarded by `.returning()`: when it matches zero rows the
// position was already closed by a concurrent or duplicate call, so we abort
// without inserting a second sim_trade or crediting the account again
// (idempotency). The RETURNING on the account UPDATE hands back the
// authoritative post-settlement totals so the caller can reconcile in-memory
// state to durable truth.
//
// Single-close behaviour is identical to the legacy path (increment from base
// == absolute write of base+Δ); only the concurrent-correctness changes. This
// is a pure correctness fix and is intentionally NOT gated behind
// EXIT_ENGINE_V2 — the per-user close fan-out runs regardless of that flag.
export async function finalizeClose(args: {
  userId:        string;
  positionId:    string;
  trade:         UserSimTrade;
  cashDelta:     number;
  realizedDelta: number;
  isPartial:     boolean;
  partial?:      { quantity: number; sizeUSD: number; entryFeeBroker: number | null; expectedQuantity: number };
}): Promise<{
  applied: boolean;
  account?: { cashBalance: number; totalRealized: number; totalTrades: number };
}> {
  const { userId, positionId, trade, cashDelta, realizedDelta, isPartial, partial } = args;

  return db.transaction(async (tx) => {
    // 1. Position mutation FIRST — its `.returning()` is the idempotency gate.
    //    A full close DELETEs the row; a partial close UPDATEs the remaining
    //    quantity/size. Zero rows back from a full close means another close
    //    already removed this position.
    //    For a partial close the WHERE also pins the EXPECTED pre-close
    //    quantity (optimistic concurrency). A duplicate/concurrent partial
    //    close of the same row reads the same pre-close quantity, so once the
    //    first commit has reduced it the second's predicate no longer matches
    //    → zero rows → idempotent skip (no second trade row, no double credit).
    //    Sequential legitimate partials still apply because each carries the
    //    then-current quantity. (param↔real coercion is exact here: the
    //    expected value was hydrated FROM the same real column.)
    const posRows = isPartial
      ? await tx
          .update(simPositionsTable)
          .set({
            quantity:       partial!.quantity,
            sizeUSD:        partial!.sizeUSD,
            entryFeeBroker: partial!.entryFeeBroker,
          })
          .where(
            and(
              eq(simPositionsTable.id, positionId),
              eq(simPositionsTable.quantity, partial!.expectedQuantity),
            ),
          )
          .returning({ id: simPositionsTable.id })
      : await tx
          .delete(simPositionsTable)
          .where(eq(simPositionsTable.id, positionId))
          .returning({ id: simPositionsTable.id });

    if (posRows.length === 0) {
      // Already closed by a concurrent / duplicate call — abort the whole
      // transaction body without inserting a second trade row or crediting
      // the account again.
      return { applied: false };
    }

    // 2. Append the closed-trade row.
    await tx.insert(simTradesTable).values({
      id:              trade.id,
      userId,
      symbol:          trade.symbol,
      side:            trade.side,
      quantity:        trade.quantity,
      entryPrice:      trade.entryPrice,
      exitPrice:       trade.exitPrice,
      entryTime:       trade.entryTime,
      exitTime:        trade.exitTime,
      sizeUSD:         trade.sizeUSD,
      realizedPnL:     trade.realizedPnL,
      realizedPnLPct:  trade.realizedPnLPct,
      durationMs:      trade.durationMs,
      closeReason:     trade.closeReason,
      exchange:             trade.exchange ?? null,
      exchangeOrderId:      trade.exchangeOrderId ?? null,
      exchangeCloseOrderId: trade.exchangeCloseOrderId ?? null,
      entryFee:             trade.entryFee ?? null,
      exitFee:              trade.exitFee ?? null,
      entryFeeBroker:         trade.entryFeeBroker ?? null,
      entryFeeBrokerCurrency: trade.entryFeeBrokerCurrency ?? null,
      exitFeeBroker:          trade.exitFeeBroker ?? null,
      exitFeeBrokerCurrency:  trade.exitFeeBrokerCurrency ?? null,
      sandbox:                trade.sandbox === true,
    });

    // 3. Atomic account settlement — SQL-side increments, NOT read-modify-write.
    //    This is the core lost-update fix: each close adds its own delta to the
    //    committed column value, so N simultaneous closes converge to
    //    base + Σ deltas with no clobbering.
    const acct = await tx
      .update(simAccountsTable)
      .set({
        cashBalance:   sql`${simAccountsTable.cashBalance} + ${cashDelta}`,
        totalRealized: sql`${simAccountsTable.totalRealized} + ${realizedDelta}`,
        totalTrades:   sql`${simAccountsTable.totalTrades} + 1`,
        updatedAt:     new Date(),
      })
      .where(eq(simAccountsTable.userId, userId))
      .returning({
        cashBalance:   simAccountsTable.cashBalance,
        totalRealized: simAccountsTable.totalRealized,
        totalTrades:   simAccountsTable.totalTrades,
      });

    if (acct.length === 0) {
      // No account row → seed/FK invariant broken. Throw to roll the whole
      // transaction back (position stays open, no orphan trade row, no
      // half-applied settlement).
      throw new Error(`finalizeClose: sim_accounts row missing for userId=${userId}`);
    }

    return { applied: true, account: acct[0] };
  });
}

// ── Enrich positions with live prices ─────────────────────────────────────────

async function enrichPositions(positions: UserSimPosition[]): Promise<UserSimPosition[]> {
  return Promise.all(
    positions.map(async (pos) => {
      try {
        const ticker = await getTicker(pos.symbol);
        const currentPrice = ticker.price;
        const unrealizedPnL =
          pos.side === "BUY"
            ? (currentPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - currentPrice) * pos.quantity;
        const marketValue =
          pos.side === "BUY"
            ? pos.quantity * currentPrice
            : pos.sizeUSD - unrealizedPnL;
        const unrealizedPnLPct = (unrealizedPnL / pos.sizeUSD) * 100;
        return { ...pos, currentPrice, unrealizedPnL, unrealizedPnLPct, marketValue };
      } catch {
        return { ...pos };
      }
    })
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

// Monthly aggregated broker commission for the last `months` calendar months
// (most recent month last). Buckets are derived from each closed trade's
// `exitTime` (ms epoch). Paper-only users see all-zero buckets because paper
// fills never persist a fee value.
export interface MonthlyFeeBucket {
  /** YYYY-MM key, e.g. "2026-04" */
  month: string;
  /** Total entry + exit broker commission across closed trades in this month */
  feesPaid: number;
  /** Number of closed trades that landed in this month */
  tradeCount: number;
  /** Sum of gross realized P&L (pre-fee) across closed trades in this month */
  realizedPnL: number;
}

export async function getUserMonthlyFees(
  userId: string,
  months: number = 6,
): Promise<MonthlyFeeBucket[]> {
  const safeMonths = Math.max(1, Math.min(months, 24));

  // Build the trailing bucket window anchored to the current month so users
  // always see a fixed number of columns (zero-filled where no activity).
  const now = new Date();
  const buckets: MonthlyFeeBucket[] = [];
  const indexByKey = new Map<string, number>();
  for (let i = safeMonths - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    indexByKey.set(key, buckets.length);
    buckets.push({ month: key, feesPaid: 0, tradeCount: 0, realizedPnL: 0 });
  }

  const windowStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - (safeMonths - 1),
    1,
  );

  const rows = await db
    .select({
      exitTime:    simTradesTable.exitTime,
      entryFee:    simTradesTable.entryFee,
      exitFee:     simTradesTable.exitFee,
      realizedPnL: simTradesTable.realizedPnL,
    })
    .from(simTradesTable)
    .where(eq(simTradesTable.userId, userId));

  for (const r of rows) {
    if (r.exitTime < windowStart) continue;
    const d = new Date(r.exitTime);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const idx = indexByKey.get(key);
    if (idx === undefined) continue;
    const fee = (r.entryFee ?? 0) + (r.exitFee ?? 0);
    if (fee > 0) buckets[idx]!.feesPaid += fee;
    buckets[idx]!.tradeCount += 1;
    buckets[idx]!.realizedPnL += r.realizedPnL ?? 0;
  }

  for (const b of buckets) {
    b.feesPaid    = parseFloat(b.feesPaid.toFixed(2));
    b.realizedPnL = parseFloat(b.realizedPnL.toFixed(2));
  }
  return buckets;
}

export async function getUserAccountSummary(userId: string) {
  const state   = await getOrLoad(userId);

  // ── Canonical convergence audit ─────────────────────────────────────────
  // Compare in-memory `state.positions.length` (what every per-user reader
  // ultimately consumes via this function) against the DB row count for
  // `sim_positions WHERE userId=…`. Any drift means the in-memory registry
  // is stale relative to the DB — i.e. SOME write path mutated DB but
  // NOT the in-memory state, or vice versa. Tagged ACCOUNT_HYDRATED
  // because this function IS the canonical per-user account SoT — every
  // /api/{account,simulation/account,mobile/portfolio,mobile/positions,
  // portfolio/overview} endpoint funnels through here.
  let dbOpenPositions = -1;
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(simPositionsTable)
      .where(eq(simPositionsTable.userId, userId));
    dbOpenPositions = Number(row?.n ?? 0);
  } catch (err) {
    logger.warn(
      { tag: "ACCOUNT_HYDRATED", subtag: "db_probe_failed", userId, err },
      "[ACCOUNT_HYDRATED] DB count probe failed — divergence check skipped",
    );
  }
  if (dbOpenPositions !== -1 && dbOpenPositions !== state.positions.length) {
    // ERROR-level: this is the convergence bug the user is hunting.
    // Customer sees "2 OPEN" from a DB-backed reader while in-memory
    // (sim-account/mobile-portfolio) shows 0 → exactly this divergence.
    logger.error(
      {
        tag:                   "STATE_DB_DIVERGENCE",
        sourceOfTruth:         "userSimRegistry.getUserAccountSummary",
        userId,
        inMemoryOpenPositions: state.positions.length,
        dbOpenPositions,
        delta:                 dbOpenPositions - state.positions.length,
        inMemoryIds:           state.positions.map((p) => p.id),
        hint:                  "in-memory registry stale vs sim_positions table — close path likely splice'd memory but DB delete failed/skipped, OR a writer pushed to DB without updating registry",
      },
      "[STATE_DB_DIVERGENCE] in-memory state.positions diverges from sim_positions DB count",
    );
  }

  const enriched = await enrichPositions(state.positions);
  const unrealizedTotal = enriched.reduce((s, p) => s + (p.unrealizedPnL ?? 0), 0);
  const positionValue   = enriched.reduce((s, p) => s + (p.marketValue ?? p.sizeUSD), 0);
  const equity          = state.account.cashBalance + positionValue;
  const totalPnL        = equity - state.account.startingBalance;
  const totalPnLPct     = (totalPnL / state.account.startingBalance) * 100;

  logger.info(
    {
      tag:              "ACCOUNT_HYDRATED",
      sourceOfTruth:    "userSimRegistry.getUserAccountSummary",
      accountSource:    "userSimRegistry.getUserAccountSummary",
      runtimeSource:    "userSimRegistry (in-memory state, DB-hydrated)",
      scope:            "PER_USER",
      userId,
      openPositions:    state.positions.length,
      dbOpenPositions,  // -1 when probe failed
      cashBalance:      parseFloat(state.account.cashBalance.toFixed(2)),
      realized:         parseFloat(state.account.totalRealized.toFixed(2)),
      unrealized:       parseFloat(unrealizedTotal.toFixed(2)),
      equity:           parseFloat(equity.toFixed(2)),
      registryHit:      registry.has(userId),
    },
    "[ACCOUNT_HYDRATED] per-user account summary computed (canonical SoT)",
  );

  // Lifetime broker commission paid across every closed leg (entry + exit fees
  // on sim_trades for this user). Stays at 0 for paper-only users since paper
  // fills never persist a fee value.
  const feeRows = await db
    .select({
      entryFee: simTradesTable.entryFee,
      exitFee:  simTradesTable.exitFee,
    })
    .from(simTradesTable)
    .where(eq(simTradesTable.userId, userId));
  const totalFeesPaid = feeRows.reduce(
    (s, r) => s + (r.entryFee ?? 0) + (r.exitFee ?? 0),
    0,
  );

  return {
    balance:       parseFloat(state.account.cashBalance.toFixed(2)),
    startBalance:  state.account.startingBalance,
    equity:        parseFloat(equity.toFixed(2)),
    totalPnL:      parseFloat(totalPnL.toFixed(2)),
    totalPnLPct:   parseFloat(totalPnLPct.toFixed(4)),
    unrealizedPnL: parseFloat(unrealizedTotal.toFixed(2)),
    positionCount: state.positions.length,
    totalTrades:   state.account.totalTrades,
    totalRealized: parseFloat(state.account.totalRealized.toFixed(2)),
    totalFeesPaid: parseFloat(totalFeesPaid.toFixed(2)),
    positions:     enriched.map((p) => ({
      ...p,
      unrealizedPnL:    p.unrealizedPnL    != null ? parseFloat(p.unrealizedPnL.toFixed(2))    : undefined,
      unrealizedPnLPct: p.unrealizedPnLPct != null ? parseFloat(p.unrealizedPnLPct.toFixed(3)) : undefined,
      marketValue:      p.marketValue      != null ? parseFloat(p.marketValue.toFixed(2))      : undefined,
    })),
  };
}

export interface UserOrderRequest {
  symbol: string;
  side:   "BUY" | "SELL";
  sizeUSD: number;
  signalId?: string;
  stopLoss?: number;
  takeProfit?: number;
}

/**
 * Eligible paper-mode AI auto-trade fan-out targets.
 *
 * Selection invariant (negotiated in Phase 5 — paper-side convergence fix):
 *   user_settings.autoMode      = true   — explicit AI auto-trade opt-in
 *   user_settings.tradingMode  != 'live' — paper / simulation runtime only
 *
 * Per-user `placeUserOrder` then layers on its own `userStatusGuard`
 * suspension check (so disabled accounts fall through with a structured
 * SKIPPED tag instead of being silently included here).
 *
 * Returns each user's preferred paper position size so the loop can honor
 * the customer's chosen sizing instead of forcing a single global notional.
 */
export async function listPaperAutoTradeUsers(): Promise<
  Array<{ userId: string; positionSizeUSD: number; stopLossPercent: number; takeProfitPercent: number }>
> {
  try {
    const rows = await db
      .select({
        userId:             userSettingsTable.userId,
        positionSizeUSD:    userSettingsTable.positionSizeUSD,
        stopLossPercent:    userSettingsTable.stopLossPercent,
        takeProfitPercent:  userSettingsTable.takeProfitPercent,
        tradingMode:        userSettingsTable.tradingMode,
      })
      .from(userSettingsTable)
      .where(
        and(
          eq(userSettingsTable.autoMode, true),
        ),
      );
    return rows
      .filter((r) => r.tradingMode !== "live")
      .map((r) => ({
        userId:            r.userId,
        positionSizeUSD:   r.positionSizeUSD,
        stopLossPercent:   r.stopLossPercent,
        takeProfitPercent: r.takeProfitPercent,
      }));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "userSimRegistry: listPaperAutoTradeUsers query failed",
    );
    return [];
  }
}

/**
 * Find all PAPER open positions for `symbol` across users with AI auto-trade
 * enabled. Used by the trailing-stop fan-out to mirror autonomous global
 * closes into each eligible user's per-user store.
 *
 * Paper-only filter: `exchange IS NULL` excludes live (exchange-routed) fills
 * — those already have their own close paths via the live execution gateway.
 */
export async function listOpenPaperPositionsBySymbol(
  symbol: string,
): Promise<Array<{ userId: string; positionId: string }>> {
  const norm = normalizeSymbol(symbol);
  try {
    const rows = await db
      .select({
        userId:     simPositionsTable.userId,
        positionId: simPositionsTable.id,
      })
      .from(simPositionsTable)
      .innerJoin(
        userSettingsTable,
        eq(userSettingsTable.userId, simPositionsTable.userId),
      )
      .where(
        and(
          eq(simPositionsTable.symbol, norm),
          sql`${simPositionsTable.exchange} IS NULL`,
          eq(userSettingsTable.autoMode, true),
        ),
      );
    return rows;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), symbol: norm },
      "userSimRegistry: listOpenPaperPositionsBySymbol query failed",
    );
    return [];
  }
}

/**
 * Enumerate EVERY open per-user position (paper AND live) that carries a
 * stop-loss and/or take-profit price, for the hard-stop risk monitor in the
 * trading loop. Unlike `listOpenPaperPositionsBySymbol`, this is NOT gated on
 * `autoMode` — a per-position SL/TP is a risk contract that must be honored
 * regardless of whether AI auto-trading is currently enabled, and it includes
 * live positions (`exchange IS NOT NULL`) so real-money downside is capped too.
 *
 * The monitor closes breaches via `closeUserPosition`, which routes live closes
 * through the broker and fires the full EXIT_ENGINE_V2 close chain.
 */
export async function listOpenPositionsForRiskMonitor(): Promise<
  Array<{
    userId:     string;
    positionId: string;
    symbol:     string;
    side:       string;
    entryPrice: number;
    stopLoss:   number | null;
    takeProfit: number | null;
    exchange:   string | null;
  }>
> {
  try {
    const rows = await db
      .select({
        userId:     simPositionsTable.userId,
        positionId: simPositionsTable.id,
        symbol:     simPositionsTable.symbol,
        side:       simPositionsTable.side,
        entryPrice: simPositionsTable.entryPrice,
        stopLoss:   simPositionsTable.stopLoss,
        takeProfit: simPositionsTable.takeProfit,
        exchange:   simPositionsTable.exchange,
      })
      .from(simPositionsTable)
      .where(
        or(
          isNotNull(simPositionsTable.stopLoss),
          isNotNull(simPositionsTable.takeProfit),
        ),
      );
    return rows;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "userSimRegistry: listOpenPositionsForRiskMonitor query failed",
    );
    return [];
  }
}

export async function placeUserOrder(userId: string, req: UserOrderRequest): Promise<{
  success: boolean;
  position?: UserSimPosition;
  error?: string;
}> {
  const symbol  = normalizeSymbol(req.symbol);
  const { side, sizeUSD } = req;

  // Status gate — `suspended` and `disabled` block paper opens too.
  // `force_paper` is allowed (it's the *only* mode those users get).
  // `active` is the default fall-through.
  const { getUserStatusVerdict } = await import("./userStatusGuard.js");
  const statusVerdict = await getUserStatusVerdict(userId);
  if (!statusVerdict.allowPaper) {
    return {
      success: false,
      error:   statusVerdict.reason ?? `Account ${statusVerdict.status} — paper trading blocked`,
    };
  }

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    return { success: false, error: `Unsupported symbol: ${symbol}` };
  }
  if (sizeUSD <= 0) {
    return { success: false, error: "sizeUSD must be positive" };
  }

  const state = await getOrLoad(userId);

  if (sizeUSD > state.account.cashBalance) {
    return {
      success: false,
      error: `Insufficient balance: have $${state.account.cashBalance.toFixed(2)}, need $${sizeUSD.toFixed(2)}`,
    };
  }

  let entryPrice: number;
  try {
    const ticker = await getTicker(symbol);
    entryPrice = ticker.price;
  } catch (e) {
    return { success: false, error: `Failed to fetch price: ${e instanceof Error ? e.message : String(e)}` };
  }

  const quantity = sizeUSD / entryPrice;
  const posId    = newId(state);
  const position: UserSimPosition = {
    id:         posId,
    userId,
    symbol,
    side,
    quantity:   parseFloat(quantity.toFixed(8)),
    entryPrice: parseFloat(entryPrice.toFixed(2)),
    entryTime:  Date.now(),
    sizeUSD:    parseFloat(sizeUSD.toFixed(2)),
    signalId:   req.signalId,
    stopLoss:   req.stopLoss,
    takeProfit: req.takeProfit,
  };

  state.account.cashBalance -= sizeUSD;
  state.positions.push(position);

  await Promise.all([
    db.insert(simPositionsTable).values({
      id:         position.id,
      userId,
      symbol:     position.symbol,
      side:       position.side,
      quantity:   position.quantity,
      entryPrice: position.entryPrice,
      entryTime:  position.entryTime,
      sizeUSD:    position.sizeUSD,
      signalId:   position.signalId ?? null,
      stopLoss:   position.stopLoss ?? null,
      takeProfit: position.takeProfit ?? null,
    }),
    persistAccount(state),
  ]);

  logger.info({ userId, symbol, side, sizeUSD, entryPrice }, "UserSimRegistry: order placed");
  return { success: true, position };
}

/**
 * Mirror a live exchange fill (executed against the customer's own broker
 * via `placeLiveAutoOrderForUser`) into the user's sim state so the position
 * appears in their portal. Cash balance is intentionally NOT debited — live
 * trades use real broker funds, not paper cash. On close, PnL flows through
 * `closeUserPosition` like any other position.
 */
export async function registerLiveUserFill(params: {
  userId:          string;
  symbol:          string;
  side:            "BUY" | "SELL";
  quantity:        number;
  entryPrice:      number;
  sizeUSD:         number;
  signalId?:       string;
  stopLoss?:       number;
  takeProfit?:     number;
  exchange:        string;
  exchangeOrderId: string;
  // Broker-reported entry-leg commission (when the adapter parsed it from
  // the exchange's order/fill response). Persisted so closeUserPosition can
  // prefer it over the catalog estimate on the close-side receipt.
  entryFeeBroker?:         number;
  entryFeeBrokerCurrency?: string;
  /** Open was routed via the exchange's public sandbox (paper-mode sandbox). */
  sandbox?: boolean;
}): Promise<UserSimPosition> {
  const state    = await getOrLoad(params.userId);
  const position: UserSimPosition = {
    id:              params.exchangeOrderId,
    userId:          params.userId,
    symbol:          normalizeSymbol(params.symbol),
    side:            params.side,
    quantity:        parseFloat(params.quantity.toFixed(8)),
    entryPrice:      parseFloat(params.entryPrice.toFixed(2)),
    entryTime:       Date.now(),
    sizeUSD:         parseFloat(params.sizeUSD.toFixed(2)),
    signalId:        params.signalId,
    stopLoss:        params.stopLoss,
    takeProfit:      params.takeProfit,
    exchange:        params.exchange,
    exchangeOrderId: params.exchangeOrderId,
    entryFeeBroker:         params.entryFeeBroker,
    entryFeeBrokerCurrency: params.entryFeeBrokerCurrency,
    sandbox:                params.sandbox === true,
  };

  state.positions.push(position);

  await db.insert(simPositionsTable).values({
    id:              position.id,
    userId:          position.userId,
    symbol:          position.symbol,
    side:            position.side,
    quantity:        position.quantity,
    entryPrice:      position.entryPrice,
    entryTime:       position.entryTime,
    sizeUSD:         position.sizeUSD,
    signalId:        position.signalId ?? null,
    stopLoss:        position.stopLoss ?? null,
    takeProfit:      position.takeProfit ?? null,
    exchange:        position.exchange ?? null,
    exchangeOrderId: position.exchangeOrderId ?? null,
    entryFeeBroker:         position.entryFeeBroker ?? null,
    entryFeeBrokerCurrency: position.entryFeeBrokerCurrency ?? null,
    sandbox:                position.sandbox === true,
  });

  logger.info(
    {
      tag:             "LIVE_VALIDATION_MODE",
      phase:           "open",
      userId:          params.userId,
      symbol:          position.symbol,
      side:            position.side,
      exchange:        position.exchange,
      exchangeOrderId: position.exchangeOrderId,
      sandbox:         position.sandbox === true,
      entryPrice:      position.entryPrice,
      sizeUSD:         position.sizeUSD,
      persistedToSimPositions: true,
    },
    "[LIVE_VALIDATION_MODE] real broker fill persisted to sim_positions",
  );
  return position;
}

// In-flight close guard. The DB-side `finalizeClose` idempotency gate prevents
// double-CREDIT, but for LIVE positions the broker close order
// (`placeLiveCloseOrderForUser`) is submitted BEFORE that gate — so two
// concurrent callers (e.g. the hard-stop monitor and a manual close) could each
// submit a real broker close for the same position. This Set claims a position
// id for the duration of one close attempt so only the first caller reaches the
// broker; the others short-circuit. Single-process is sufficient because the
// per-user registry state (and all close paths) live in this one process.
const inFlightCloses = new Set<string>();

export async function closeUserPosition(
  userId: string,
  positionId: string,
  closeReason: string = "MANUAL",
): Promise<{ success: boolean; trade?: UserSimTrade; error?: string }> {
  const state = await getOrLoad(userId);
  const idx   = state.positions.findIndex((p) => p.id === positionId);
  if (idx === -1) {
    return { success: false, error: `Position ${positionId} not found` };
  }

  // Claim this position for the duration of the close. A concurrent attempt
  // (already past this point and possibly mid-broker-submit) short-circuits
  // here so we never fire a second real broker close order.
  if (inFlightCloses.has(positionId)) {
    logger.info(
      { userId, positionId, closeReason },
      "UserSimRegistry: close already in flight for this position — skipping duplicate",
    );
    return { success: false, error: `Position ${positionId} close already in flight` };
  }
  inFlightCloses.add(positionId);
  try {

  const pos = state.positions[idx]!;

  // ── Close-path instrumentation (convergence bug trace) ──────────────────
  // Five tags emitted across the close lifecycle so log-grep can confirm
  // each stage actually fires: CLOSE_POSITION → POSITION_CLOSED →
  // REALIZED_PNL_APPLIED → ACCOUNT_SUMMARY_UPDATED → EQUITY_RECONCILED.
  // sourceOfTruth is always "userSimRegistry" — no other code path mutates
  // per-user account state. Any divergence in account/equity readings
  // downstream MUST originate elsewhere (cache, alternate close path that
  // bypasses this function, or stale getOrLoad registry entry).
  const correlationId      = resolveCorrelation(positionId);
  const closeSymbol        = pos.symbol;
  const realizedPnLBefore  = parseFloat(state.account.totalRealized.toFixed(2));
  const cashBalanceBefore  = parseFloat(state.account.cashBalance.toFixed(2));
  const equityBefore       = equityProxy(state);
  const openPositionsBefore = state.positions.length;
  logger.info(
    {
      tag:               "CLOSE_POSITION",
      stage:             "enter",
      sourceOfTruth:     "userSimRegistry.closeUserPosition",
      correlationId,
      userId,
      positionId,
      symbol:            closeSymbol,
      side:              pos.side,
      closeReason,
      isLive:            !!(pos.exchange && pos.exchangeOrderId),
      exchange:          pos.exchange ?? null,
      realizedPnLBefore,
      cashBalanceBefore,
      equityBefore,
      openPositionsBefore,
    },
    "[CLOSE_POSITION] entering closeUserPosition",
  );

  // For live positions, submit a real broker-side close order first.
  // Use the broker's fill price (when available) as the canonical exit
  // price so realized PnL matches the actual exchange execution.
  let exchangeCloseOrderId: string | undefined;
  let brokerFillPrice: number | undefined;
  let brokerFilledQty: number | undefined;
  let brokerExitFee: number | undefined;
  let brokerExitFeeCurrency: string | undefined;
  const isLive = !!(pos.exchange && pos.exchangeOrderId);
  if (isLive) {
    // Mirror the open-side sandbox decision on the close. The authoritative
    // source is the per-position `sandbox` flag persisted at open-time —
    // NEVER the user's current `paperSandboxEnabled` setting, which can
    // toggle between open and close and would route a sandbox-opened
    // position to production (real money close on a fake position).
    const useSandbox = pos.sandbox === true;
    const closeRes = await placeLiveCloseOrderForUser({
      userId,
      symbol:   pos.symbol,
      openSide: pos.side,
      quantity: pos.quantity,
      exchange: pos.exchange!,
      useSandbox,
    });
    if (!closeRes.success) {
      logger.warn(
        { userId, positionId, exchange: pos.exchange, error: closeRes.error, errorCode: closeRes.errorCode },
        "UserSimRegistry: live close order rejected — position remains open",
      );
      return {
        success: false,
        error:   `Live close order rejected on ${pos.exchange}: ${closeRes.error ?? "unknown"}`,
      };
    }
    exchangeCloseOrderId = closeRes.exchangeCloseOrderId;
    if (closeRes.fillPrice && closeRes.fillPrice > 0) {
      brokerFillPrice = closeRes.fillPrice;
    }
    if (closeRes.quantity && closeRes.quantity > 0) {
      // Clamp to position quantity in case the broker over-reports
      brokerFilledQty = Math.min(closeRes.quantity, pos.quantity);
    }
    // Accept 0 / negative (maker rebate) broker fees — only require that
    // the broker returned a finite numeric value. Catalog estimate is only
    // used when the adapter didn't report a fee at all.
    if (Number.isFinite(closeRes.brokerFee)) {
      brokerExitFee         = closeRes.brokerFee;
      brokerExitFeeCurrency = closeRes.brokerFeeCurrency;
    }
  }

  let exitPrice: number;
  if (brokerFillPrice !== undefined) {
    exitPrice = brokerFillPrice;
  } else {
    try {
      const ticker = await getTicker(pos.symbol);
      exitPrice = ticker.price;
    } catch (e) {
      return { success: false, error: `Failed to fetch price: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // Partial-fill aware close. When the broker reported a filled quantity
  // smaller than the position quantity (Kraken-style partials, or close
  // orders that the exchange only partially executed), we close only the
  // filled portion: realized PnL is computed on the filled qty, sizeUSD
  // is pro-rated, the position stays open with the remaining qty/size,
  // and the user can retry. When brokerFilledQty matches pos.quantity
  // (or this is a non-live close), behaviour is the standard full close.
  const closedQty = brokerFilledQty !== undefined ? brokerFilledQty : pos.quantity;
  const isPartial = closedQty < pos.quantity - 1e-12;
  const closedSizeUSD = isPartial
    ? parseFloat(((pos.sizeUSD * closedQty) / pos.quantity).toFixed(2))
    : pos.sizeUSD;

  const realizedPnL =
    pos.side === "BUY"
      ? (exitPrice - pos.entryPrice) * closedQty
      : (pos.entryPrice - exitPrice) * closedQty;

  const realizedPnLPct = closedSizeUSD > 0 ? (realizedPnL / closedSizeUSD) * 100 : 0;
  const exitTime       = Date.now();
  const tradeId        = newId(state);

  // Broker commission for both legs (live trades only — null for paper).
  // Fees are pro-rated against the closed portion so partial closes only
  // charge for the quantity actually filled. Estimates always recorded;
  // broker-reported amounts (when present) are stored alongside the
  // estimate and preferred for cash accounting + receipt totals.
  const exitNotional = exitPrice * closedQty;
  const entryFee = computeFillFee(pos.exchange, closedSizeUSD);
  const exitFee  = computeFillFee(pos.exchange, exitNotional);
  // Pro-rate the broker-reported entry fee against the closed portion in
  // case of a partial close — the carried entryFeeBroker reflects the full
  // open-leg charge for the original quantity.
  const entryFeeBrokerProRated =
    pos.entryFeeBroker !== undefined && pos.quantity > 0
      ? parseFloat(((pos.entryFeeBroker * closedQty) / pos.quantity).toFixed(8))
      : undefined;
  // Only treat a broker-reported fee as USD-equivalent for cash accounting
  // when the broker charged it in a USD-stable asset. Fees paid in a native
  // asset (BNB, BTC, ETH, exchange token) need an FX conversion we don't do
  // here — keep them on the receipt but fall back to the catalog estimate
  // for the cash/PnL math so account equity stays consistent.
  const USD_STABLE = new Set(["USD", "USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "FDUSD", "ZUSD"]);
  const entryBrokerIsUsd = entryFeeBrokerProRated !== undefined
    && (pos.entryFeeBrokerCurrency === undefined || USD_STABLE.has(pos.entryFeeBrokerCurrency.toUpperCase()));
  const exitBrokerIsUsd  = brokerExitFee !== undefined
    && (brokerExitFeeCurrency === undefined || USD_STABLE.has(brokerExitFeeCurrency.toUpperCase()));
  const effectiveEntryFee = entryBrokerIsUsd ? entryFeeBrokerProRated! : (entryFee ?? 0);
  const effectiveExitFee  = exitBrokerIsUsd  ? brokerExitFee!          : (exitFee  ?? 0);
  const netFees  = effectiveEntryFee + effectiveExitFee;

  // ── Platform performance fee (3% of NET realized PnL on profitable closes)
  // Computed BEFORE we mutate cash so the user actually receives the net
  // amount on this close. Guards (internal / complimentary / waiver /
  // per-user override) live in resolveFeePolicy. Losing or break-even
  // closes pay no fee. Paper closes are auditied identically to live so
  // operator telemetry reflects the simulated revenue stream too.
  const netRealizedForFee = realizedPnL - netFees;
  let platformFeeUSD = 0;
  let platformFeeRate = 0;
  let platformFeeSkipReason: string | undefined;
  if (netRealizedForFee > 0) {
    const policy = await resolveFeePolicy(userId);
    if (policy.skip || policy.rate <= 0) {
      platformFeeSkipReason = policy.reason ?? "exempt";
    } else {
      platformFeeRate = policy.rate;
      platformFeeUSD  = parseFloat((netRealizedForFee * policy.rate).toFixed(4));
    }
  }

  const trade: UserSimTrade = {
    id:              tradeId,
    userId,
    symbol:          pos.symbol,
    side:            pos.side,
    quantity:        parseFloat(closedQty.toFixed(8)),
    entryPrice:      pos.entryPrice,
    exitPrice:       parseFloat(exitPrice.toFixed(2)),
    entryTime:       pos.entryTime,
    exitTime,
    sizeUSD:         closedSizeUSD,
    realizedPnL:     parseFloat(realizedPnL.toFixed(2)),
    realizedPnLPct:  parseFloat(realizedPnLPct.toFixed(3)),
    durationMs:      exitTime - pos.entryTime,
    closeReason:     isPartial ? `${closeReason}_PARTIAL` : closeReason,
    platformFeeUSD:  platformFeeUSD > 0 ? platformFeeUSD : undefined,
    platformFeeRate: platformFeeUSD > 0 ? platformFeeRate : undefined,
    platformFeeSkipReason,
    exchange:             pos.exchange,
    exchangeOrderId:      pos.exchangeOrderId,
    exchangeCloseOrderId: exchangeCloseOrderId,
    entryFee:             entryFee ?? undefined,
    exitFee:              exitFee ?? undefined,
    netFees:
      entryFee != null || exitFee != null || entryFeeBrokerProRated != null || brokerExitFee != null
        ? parseFloat(netFees.toFixed(4))
        : undefined,
    entryFeeBroker:         entryFeeBrokerProRated,
    entryFeeBrokerCurrency: entryFeeBrokerProRated !== undefined ? pos.entryFeeBrokerCurrency : undefined,
    exitFeeBroker:          brokerExitFee,
    exitFeeBrokerCurrency:  brokerExitFee !== undefined ? brokerExitFeeCurrency : undefined,
    sandbox:                pos.sandbox === true,
  };

  // Live trades pay broker commission on both legs — deduct from cash and
  // realized PnL so account equity reconciles to the receipt's Net P&L.
  // Paper trades have null fees (no broker) and behave exactly as before.
  // Platform performance fee (3% of net realized on profitable closes) is
  // additionally deducted here so the user receives the net amount (e.g.
  // +$100 realized → $3 platform fee → +$97 net to account).
  // ── Atomic settlement (finalizeClose) ─────────────────────────────────────
  // Compute the deltas this close applies, then persist trade + position +
  // account in ONE transaction with SQL-side account increments. cashDelta is
  // the freed entry notional plus net realized PnL minus broker + platform
  // fees; realizedDelta is the same minus the freed notional (which nets to
  // zero in the equity proxy). The in-memory account is NO LONGER mutated
  // optimistically here — it is reconciled below from the transaction's
  // authoritative RETURNING so concurrent same-user closes cannot drift.
  const cashDelta     = closedSizeUSD + realizedPnL - netFees - platformFeeUSD;
  const realizedDelta = realizedPnL - netFees - platformFeeUSD;

  let partialUpdate: { quantity: number; sizeUSD: number; entryFeeBroker: number | null; expectedQuantity: number } | undefined;
  if (isPartial) {
    const newQty  = parseFloat((pos.quantity - closedQty).toFixed(8));
    const newSize = parseFloat((pos.sizeUSD - closedSizeUSD).toFixed(2));
    // Carry forward only the unallocated portion of the broker-reported entry
    // fee — otherwise a follow-up partial close would re-charge the
    // already-consumed slice. Preserve sign (maker rebates stay negative).
    let newEntryFeeBroker: number | null = pos.entryFeeBroker ?? null;
    if (pos.entryFeeBroker !== undefined && entryFeeBrokerProRated !== undefined) {
      newEntryFeeBroker = parseFloat((pos.entryFeeBroker - entryFeeBrokerProRated).toFixed(8));
    }
    partialUpdate = {
      quantity:         newQty,
      sizeUSD:          newSize,
      entryFeeBroker:   newEntryFeeBroker,
      expectedQuantity: pos.quantity,
    };
  }

  const finalize = await finalizeClose({
    userId,
    positionId,
    trade,
    cashDelta,
    realizedDelta,
    isPartial,
    partial: partialUpdate,
  });

  // Idempotency: the position row was already removed (full close) or already
  // advanced past our expected pre-close quantity (partial close) by a
  // concurrent or duplicate call. No second trade row was inserted and the
  // account was NOT credited again. Reconcile THIS position from durable DB
  // truth (so a stale cache cannot keep a phantom/old-quantity row), then
  // report not-success so the trailing-stop fan-out logs AI_FANOUT_SKIPPED
  // instead of double-counting.
  if (!finalize.applied) {
    const [dbPos] = await db
      .select({ quantity: simPositionsTable.quantity, sizeUSD: simPositionsTable.sizeUSD })
      .from(simPositionsTable)
      .where(eq(simPositionsTable.id, positionId))
      .limit(1);
    const staleIdx = state.positions.findIndex((p) => p.id === positionId);
    if (staleIdx !== -1) {
      if (dbPos === undefined) {
        // Row gone (winning full close) — drop the phantom from cache.
        state.positions.splice(staleIdx, 1);
      } else {
        // Row advanced (winning partial close) — converge cache to DB values.
        state.positions[staleIdx]!.quantity = dbPos.quantity;
        state.positions[staleIdx]!.sizeUSD  = dbPos.sizeUSD;
      }
    }
    logger.info(
      {
        tag:             "CLOSE_IDEMPOTENT_SKIP",
        sourceOfTruth:   "userSimRegistry.finalizeClose",
        correlationId,
        userId,
        positionId,
        symbol:          closeSymbol,
        isPartial,
        reconciledTo:    dbPos === undefined ? "removed" : "db-quantity",
      },
      "[CLOSE_IDEMPOTENT_SKIP] position already closed/advanced by a concurrent close — settlement skipped (no double credit); cache reconciled to DB",
    );
    return { success: false, error: `Position ${positionId} already closed` };
  }

  // ── Reconcile in-memory state to durable DB truth ─────────────────────────
  // The account totals come straight from the atomic increment's RETURNING, so
  // even when several closes for this user committed concurrently the cached
  // state converges to exactly what the DB holds (no read-modify-write).
  const settledAccount = finalize.account!;
  const liveIdx = state.positions.findIndex((p) => p.id === positionId);
  if (isPartial) {
    if (liveIdx !== -1) {
      state.positions[liveIdx]!.quantity       = partialUpdate!.quantity;
      state.positions[liveIdx]!.sizeUSD        = partialUpdate!.sizeUSD;
      state.positions[liveIdx]!.entryFeeBroker = partialUpdate!.entryFeeBroker ?? undefined;
    }
  } else if (liveIdx !== -1) {
    state.positions.splice(liveIdx, 1);
  }
  state.tradeHistory.unshift(trade);
  state.account.cashBalance   = settledAccount.cashBalance;
  state.account.totalRealized = settledAccount.totalRealized;
  state.account.totalTrades   = settledAccount.totalTrades;

  // [REALIZED_PNL_APPLIED] — account settled atomically in the DB transaction
  // and the cached state reconciled to the committed totals (from RETURNING).
  const realizedPnLAfter = parseFloat(state.account.totalRealized.toFixed(2));
  const cashBalanceAfter = parseFloat(state.account.cashBalance.toFixed(2));
  logger.info(
    {
      tag:               "REALIZED_PNL_APPLIED",
      stage:             "atomic-settlement",
      sourceOfTruth:     "userSimRegistry.finalizeClose",
      correlationId,
      userId,
      positionId,
      symbol:            closeSymbol,
      closedSizeUSD,
      realizedPnL:       parseFloat(realizedPnL.toFixed(2)),
      netFees:           parseFloat(netFees.toFixed(4)),
      platformFeeUSD,
      realizedPnLBefore,
      realizedPnLAfter,
      realizedPnLDelta:  parseFloat((realizedPnLAfter - realizedPnLBefore).toFixed(2)),
      cashBalanceBefore,
      cashBalanceAfter,
      cashBalanceDelta:  parseFloat((cashBalanceAfter - cashBalanceBefore).toFixed(2)),
    },
    "[REALIZED_PNL_APPLIED] account settled atomically (SQL increment) and cached state reconciled to DB",
  );

  logger.info(
    {
      tag:                "POSITION_CLOSED",
      stage:              "position-removed",
      sourceOfTruth:      "userSimRegistry.closeUserPosition",
      correlationId,
      userId,
      positionId,
      symbol:             closeSymbol,
      isPartial,
      openPositionsBefore,
      openPositionsAfter: state.positions.length,
      tradeHistoryLen:    state.tradeHistory.length,
    },
    "[POSITION_CLOSED] position removed from in-memory state",
  );

  // [LIVE_VALIDATION_MODE] — emitted on close ONLY when the closing trade
  // carried a real broker exchange tag, so grep over api-server logs returns
  // exactly the realised real fills (never paper sim closes).
  if (trade.exchange) {
    logger.info(
      {
        tag:                  "LIVE_VALIDATION_MODE",
        phase:                "close",
        userId,
        symbol:               trade.symbol,
        side:                 trade.side,
        exchange:             trade.exchange,
        exchangeOrderId:      trade.exchangeOrderId,
        exchangeCloseOrderId: trade.exchangeCloseOrderId,
        sandbox:              trade.sandbox === true,
        entryPrice:           trade.entryPrice,
        exitPrice:            trade.exitPrice,
        realizedPnL:          trade.realizedPnL,
        realizedPnLPct:       trade.realizedPnLPct,
        durationMs:           trade.durationMs,
        closeReason:          trade.closeReason,
        persistedToSimTrades: true,
      },
      "[LIVE_VALIDATION_MODE] real broker close persisted to sim_trades",
    );
  }

  // [ACCOUNT_SUMMARY_UPDATED] — DB writes for trade + position + account
  // all committed (Promise.all settled). At this point the next call to
  // getUserAccountSummary(userId) MUST return the updated realized/cash
  // values. If frontend still shows stale numbers after this fires, the
  // divergence is on the read side: stale query cache, a frontend reading
  // from /api/mobile/portfolio (global) instead of /api/account
  // (per-user), or a stale registry entry on a different process.
  const equityAfter = equityProxy(state);
  logger.info(
    {
      tag:               "ACCOUNT_SUMMARY_UPDATED",
      stage:             "db-committed",
      sourceOfTruth:     "userSimRegistry.closeUserPosition",
      correlationId,
      userId,
      positionId,
      symbol:            closeSymbol,
      realizedPnLBefore,
      realizedPnLAfter,
      cashBalanceBefore,
      cashBalanceAfter,
      equityBefore,
      equityAfter,
      totalTrades:       state.account.totalTrades,
    },
    "[ACCOUNT_SUMMARY_UPDATED] sim_accounts + sim_trades + sim_positions DB writes committed",
  );

  // [EQUITY_RECONCILED] — Final convergence check. Expected invariant:
  //   equityDelta === realizedPnL - netFees - platformFeeUSD
  // (closedSizeUSD leaves positions[] and re-enters cash, so it nets to 0
  // in the equity proxy — only the realized PnL net of fees changes equity.)
  // Logged as WARN when the invariant breaks so the post-close convergence
  // bug surfaces immediately instead of hiding inside a quiet info line.
  const equityDelta   = parseFloat((equityAfter - equityBefore).toFixed(2));
  const expectedDelta = parseFloat((realizedPnL - netFees - platformFeeUSD).toFixed(2));
  const reconciled    = Math.abs(equityDelta - expectedDelta) < 0.02;
  (reconciled ? logger.info : logger.warn).call(
    logger,
    {
      tag:            "EQUITY_RECONCILED",
      stage:          "post-commit-check",
      sourceOfTruth:  "userSimRegistry.closeUserPosition",
      correlationId,
      userId,
      positionId,
      symbol:         closeSymbol,
      equityBefore,
      equityAfter,
      equityDelta,
      expectedDelta,
      reconciled,
      realizedPnL:    parseFloat(realizedPnL.toFixed(2)),
      netFees:        parseFloat(netFees.toFixed(4)),
      platformFeeUSD,
    },
    reconciled
      ? "[EQUITY_RECONCILED] equity delta matches expected realizedPnL net of fees"
      : "[EQUITY_RECONCILED] MISMATCH — equity delta does not match expected realizedPnL net of fees",
  );

  logger.info(
    { userId, positionId, realizedPnL: trade.realizedPnL, netFees, platformFeeUSD, platformFeeSkipReason, closeReason },
    "UserSimRegistry: position closed",
  );

  // ── Persist platform fee to ledger ─────────────────────────────────────────
  // Awaited (not fire-and-forget) so the ledger row is durable before this
  // function returns — otherwise a process crash between cash deduction and
  // ledger insert would silently lose platform revenue. Pass the resolved
  // policy rate + feeUSD so per-user perfFeeBpsOverride is honored at the
  // ledger row (recordPerformanceFee falls back to the platform default if
  // these aren't provided). Billing-hold enforcement inside
  // recordPerformanceFee remains async and is reconcilable on the next tick.
  if (platformFeeUSD > 0) {
    try {
      await recordPerformanceFee({
        tradeId:     trade.id,
        userId,
        exchange:    trade.exchange ?? "PAPER",
        symbol:      trade.symbol,
        side:        trade.side,
        realizedPnl: netRealizedForFee,
        isPaper:     !trade.exchange,
        feeRate:     platformFeeRate,
        feeUSD:      platformFeeUSD,
      });
    } catch (err) {
      // Cash has already been deducted from the user account; the ledger
      // insert failed. Log loud — operator can reconcile from trade history.
      logger.error(
        { err, userId, tradeId: trade.id, platformFeeUSD, platformFeeRate },
        "platform fee ledger insert failed AFTER cash deduction — reconcile manually",
      );
    }
  }

  // Live position? Mirror the close into the user's notification feed +
  // push channel — symmetric counterpart to emitFillNotification on open.
  if (trade.exchange) {
    void emitLiveCloseNotification({
      userId,
      symbol:          trade.symbol,
      side:            trade.side,
      exchange:        trade.exchange,
      exitPrice:       trade.exitPrice,
      quantity:        trade.quantity,
      realizedPnL:     trade.realizedPnL,
      realizedPnLPct:  trade.realizedPnLPct,
      closeReason,
      exchangeOrderId: trade.exchangeOrderId,
      dryRun:          isDryRunEnabled(),
    });
  }

  return { success: true, trade };

  } finally {
    inFlightCloses.delete(positionId);
  }
}

export async function getUserTradeHistory(userId: string): Promise<UserSimTrade[]> {
  const state = await getOrLoad(userId);
  return [...state.tradeHistory];
}

export async function resetUserSimulation(userId: string): Promise<void> {
  const state = await getOrLoad(userId);

  await Promise.all([
    db.delete(simPositionsTable).where(eq(simPositionsTable.userId, userId)),
    db.delete(simTradesTable).where(eq(simTradesTable.userId, userId)),
    db.update(simAccountsTable)
      .set({ cashBalance: 100_000, totalRealized: 0, totalTrades: 0, updatedAt: new Date() })
      .where(eq(simAccountsTable.userId, userId)),
  ]);

  state.account.cashBalance  = 100_000;
  state.account.totalRealized = 0;
  state.account.totalTrades  = 0;
  state.positions            = [];
  state.tradeHistory         = [];

  logger.info({ userId }, "UserSimRegistry: simulation reset");
}
