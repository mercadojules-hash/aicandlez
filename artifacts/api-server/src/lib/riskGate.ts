import { db } from "@workspace/db";
import {
  simAccountsTable,
  simPositionsTable,
  userExchangeConnectionsTable,
  userRiskSettingsTable,
  usersTable,
  type UserRiskSettings,
  type RiskUnit,
  type RiskReasonCode,
} from "@workspace/db";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { getCachedSpotPriceUSD } from "./exchangeEngine.js";
import { makeAdapter } from "../services/exchanges/adapterFactory.js";
import { vault } from "../services/vault/CredentialVault.js";

// ── riskGate ────────────────────────────────────────────────────────────────
//
// Per-user AI LIVE-trade risk budgeting. Pure evaluation function — does
// NOT mutate anything. Caller (`placeLiveAutoOrderForUser`) decides what
// to do with the verdict (notify, log, audit, return errorCode).
//
// Caps come from `user_risk_settings`; defaults are returned when no row
// exists (user never visited the risk panel). Two of the caps support
// either USD or PCT-of-equity units; resolution happens here so the gate
// always works in absolute USD.
//
// Snapshot mechanics:
//   - equityUsd       = fetchLiveEquityWithMeta().totalEquityUsd
//   - openCount       = SELECT count(*) sim_positions WHERE user=X AND exchange IS NOT NULL
//   - openNotionalUsd = SELECT sum(size_usd) for that same set
//   - intendedSizeUsd = caller-provided
//
// If equity can't be priced (`fetchLiveEquityWithMeta` throws / returns 0)
// we DO NOT silently allow the trade — pct-based caps would otherwise
// collapse to "$0" and lock the user out entirely. Instead we reject with
// `risk_no_equity` and the caller surfaces a clear error.

const ALLOWED_OPS_BYPASS_ROLES = new Set(["admin", "super-admin"]);

export interface RiskSettingsView {
  enabled:                boolean;
  preset:                 UserRiskSettings["preset"];
  maxCapitalPerTradeValue: number;
  maxCapitalPerTradeUnit:  RiskUnit;
  maxSimultaneousTrades:   number;
  maxTotalAllocationValue: number;
  maxTotalAllocationUnit:  RiskUnit;
  reserveCashValue:        number;
  reserveCashUnit:         RiskUnit;
}

export const DEFAULT_RISK_SETTINGS: RiskSettingsView = {
  enabled:                 true,
  preset:                  "moderate",
  maxCapitalPerTradeValue: 1000,
  maxCapitalPerTradeUnit:  "usd",
  maxSimultaneousTrades:   3,
  maxTotalAllocationValue: 30000,
  maxTotalAllocationUnit:  "usd",
  reserveCashValue:        0,
  reserveCashUnit:         "usd",
};

export interface RiskSnapshot {
  equityUsd:           number;
  openCount:           number;
  openNotionalUsd:     number;
  intendedSizeUsd:     number;
  effective: {
    /** Resolved to absolute USD using equityUsd × pct when unit="pct". */
    maxCapitalPerTradeUsd:  number;
    maxSimultaneousTrades:  number;
    maxTotalAllocationUsd:  number;
    reserveCashUsd:         number;
  };
  derived: {
    /** Free capital BEFORE this trade = equity − openNotional − reserveCash. */
    freeCapitalUsd:         number;
    /** Headroom for additional allocation under maxTotal cap. */
    allocationHeadroomUsd:  number;
    /** Largest size the gate would allow for the NEXT new trade. */
    maxNextSizeUsd:         number;
    slotsRemaining:         number;
  };
  settings: RiskSettingsView;
}

export type RiskRejectCode = Exclude<RiskReasonCode, "risk_disabled_by_user">;

export type RiskVerdict =
  | { allowed: true;  reasonCode?: "risk_disabled_by_user"; snapshot: RiskSnapshot }
  | { allowed: false; reasonCode: RiskRejectCode; reasonText: string; snapshot: RiskSnapshot };

// ── Settings loader (with default fallback) ─────────────────────────────────

export async function loadRiskSettings(userId: string): Promise<RiskSettingsView> {
  try {
    const [row] = await db
      .select()
      .from(userRiskSettingsTable)
      .where(eq(userRiskSettingsTable.userId, userId))
      .limit(1);
    if (!row) return DEFAULT_RISK_SETTINGS;
    return {
      enabled:                 row.enabled,
      preset:                  row.preset,
      maxCapitalPerTradeValue: row.maxCapitalPerTradeValue,
      maxCapitalPerTradeUnit:  row.maxCapitalPerTradeUnit,
      maxSimultaneousTrades:   row.maxSimultaneousTrades,
      maxTotalAllocationValue: row.maxTotalAllocationValue,
      maxTotalAllocationUnit:  row.maxTotalAllocationUnit,
      reserveCashValue:        row.reserveCashValue,
      reserveCashUnit:         row.reserveCashUnit,
    };
  } catch (err) {
    logger.warn({ err, userId }, "riskGate: settings load failed — using defaults");
    return DEFAULT_RISK_SETTINGS;
  }
}

// ── Per-user live exposure snapshot ─────────────────────────────────────────

interface LiveExposure {
  openCount:       number;
  openNotionalUsd: number;
}

async function getUserLiveExposure(userId: string): Promise<LiveExposure> {
  try {
    const [row] = await db
      .select({
        n: sql<number>`count(*)::int`,
        s: sql<number>`coalesce(sum(${simPositionsTable.sizeUSD}), 0)::float8`,
      })
      .from(simPositionsTable)
      .where(and(
        eq(simPositionsTable.userId, userId),
        isNotNull(simPositionsTable.exchange),
      ));
    return {
      openCount:       Number(row?.n ?? 0),
      openNotionalUsd: Number(row?.s ?? 0),
    };
  } catch (err) {
    logger.warn({ err, userId }, "riskGate: live-exposure read failed — assuming zero");
    return { openCount: 0, openNotionalUsd: 0 };
  }
}

// ── Per-USER live equity (best-effort, 30s cache) ───────────────────────────
//
// SEVERE-fix: previously used `fetchLiveEquityWithMeta()` which returns the
// OPERATOR/platform Kraken equity — wrong source for per-user risk caps.
// Now we read the user's OWN default live exchange connection. Customers
// without a live connection (paper-only today) fall back to their paper
// balance (sim_accounts.cashBalance + open paper notional) so the status
// panel still shows meaningful numbers and pct-based caps remain sane.
//
// 30s per-user cache prevents broker API hammering on every signal eval.

const USD_STABLES = new Set(["USD", "USDT", "USDC", "ZUSD", "DAI", "BUSD"]);
const EQUITY_CACHE_TTL_MS = 30_000;
const _userEquityCache = new Map<string, { equity: number | null; ts: number }>();

async function priceUserLiveAccount(exchange: string, balances: Record<string, { total: number }>): Promise<number> {
  let total = 0;
  const nonUsd: Array<[string, number]> = [];
  for (const [asset, bal] of Object.entries(balances)) {
    if (!(bal.total > 0)) continue;
    if (USD_STABLES.has(asset)) total += bal.total;
    else nonUsd.push([asset, bal.total]);
  }
  // Parallel priced lookups; failures are skipped (under-report rather than
  // null-out — consistent with operator path in fetchLiveEquityWithMeta).
  const priced = await Promise.all(nonUsd.map(async ([asset, qty]) => {
    try {
      const r = await getCachedSpotPriceUSD(exchange, asset);
      if (r.source === "error") return 0;
      return qty * r.price;
    } catch { return 0; }
  }));
  for (const v of priced) total += v;
  return total;
}

async function readUserLiveEquity(userId: string): Promise<number | null> {
  const [row] = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(and(
      eq(userExchangeConnectionsTable.userId,      userId),
      eq(userExchangeConnectionsTable.isDefault,   true),
      eq(userExchangeConnectionsTable.status,      "active"),
      eq(userExchangeConnectionsTable.tradingMode, "live"),
    ))
    .limit(1);
  if (!row) return null;
  const creds = vault.decryptBlob(userId, row.encryptedBlob);
  if (!creds) return null;
  const adapter = makeAdapter(row.exchange, creds, { testnet: false, demoMode: row.demoMode });
  const acct = await adapter.getAccount();
  return priceUserLiveAccount(row.exchange, acct.balances);
}

async function readUserPaperEquity(userId: string): Promise<number | null> {
  const [acct] = await db
    .select({ cash: simAccountsTable.cashBalance })
    .from(simAccountsTable)
    .where(eq(simAccountsTable.userId, userId))
    .limit(1);
  if (!acct) return null;
  const [pos] = await db
    .select({ s: sql<number>`coalesce(sum(${simPositionsTable.sizeUSD}),0)::float8` })
    .from(simPositionsTable)
    .where(and(
      eq(simPositionsTable.userId, userId),
      isNull(simPositionsTable.exchange),
    ));
  const openNotional = Number(pos?.s ?? 0);
  const total = Number(acct.cash) + openNotional;
  return total > 0 ? total : null;
}

async function getUserEquityUsdSafe(userId: string): Promise<number | null> {
  const now = Date.now();
  const cached = _userEquityCache.get(userId);
  if (cached && (now - cached.ts) < EQUITY_CACHE_TTL_MS) return cached.equity;

  let equity: number | null = null;
  try {
    equity = await readUserLiveEquity(userId);
  } catch (err) {
    logger.warn({ err, userId }, "riskGate: per-user live equity read failed — trying paper fallback");
  }
  if (equity === null) {
    try {
      equity = await readUserPaperEquity(userId);
    } catch (err) {
      logger.warn({ err, userId }, "riskGate: per-user paper equity read failed");
    }
  }
  _userEquityCache.set(userId, { equity, ts: now });
  return equity;
}

/** Test/admin hook: drop cached equity for a user (e.g. after manual restore). */
export function invalidateUserEquityCache(userId?: string): void {
  if (userId) _userEquityCache.delete(userId);
  else _userEquityCache.clear();
}

// ── Unit resolution ─────────────────────────────────────────────────────────

function resolveUsd(value: number, unit: RiskUnit, equityUsd: number): number {
  if (unit === "usd") return Math.max(0, value);
  // pct: 0..100 → fraction × equity
  const pct = Math.max(0, Math.min(100, value));
  return (pct / 100) * Math.max(0, equityUsd);
}

// ── Snapshot composer (used by gate + status endpoint) ──────────────────────

export async function composeRiskSnapshot(
  userId: string,
  intendedSizeUsd: number,
  opts?: { equityUsdOverride?: number | null },
): Promise<{ snapshot: RiskSnapshot; equityAvailable: boolean }> {
  const [settings, exposure, equityFetched] = await Promise.all([
    loadRiskSettings(userId),
    getUserLiveExposure(userId),
    opts?.equityUsdOverride !== undefined
      ? Promise.resolve(opts.equityUsdOverride)
      : getUserEquityUsdSafe(userId),
  ]);
  const equityAvailable = equityFetched !== null;
  const equityUsd = equityFetched ?? 0;

  const maxCapitalPerTradeUsd = resolveUsd(settings.maxCapitalPerTradeValue, settings.maxCapitalPerTradeUnit, equityUsd);
  const maxTotalAllocationUsd = resolveUsd(settings.maxTotalAllocationValue, settings.maxTotalAllocationUnit, equityUsd);
  const reserveCashUsd        = resolveUsd(settings.reserveCashValue,        settings.reserveCashUnit,        equityUsd);

  const freeCapitalUsd        = Math.max(0, equityUsd - exposure.openNotionalUsd - reserveCashUsd);
  const allocationHeadroomUsd = Math.max(0, maxTotalAllocationUsd - exposure.openNotionalUsd);
  // The maximum new-trade size is the most restrictive of three numbers:
  //   per-trade cap, allocation headroom, free capital after reserve.
  const maxNextSizeUsd        = Math.max(0, Math.min(maxCapitalPerTradeUsd, allocationHeadroomUsd, freeCapitalUsd));
  const slotsRemaining        = Math.max(0, settings.maxSimultaneousTrades - exposure.openCount);

  return {
    snapshot: {
      equityUsd,
      openCount:       exposure.openCount,
      openNotionalUsd: exposure.openNotionalUsd,
      intendedSizeUsd,
      effective: { maxCapitalPerTradeUsd, maxSimultaneousTrades: settings.maxSimultaneousTrades, maxTotalAllocationUsd, reserveCashUsd },
      derived:   { freeCapitalUsd, allocationHeadroomUsd, maxNextSizeUsd, slotsRemaining },
      settings,
    },
    equityAvailable,
  };
}

// ── Operator bypass helper ──────────────────────────────────────────────────

export async function isRiskBypassRole(userId: string): Promise<boolean> {
  try {
    const [u] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);
    return !!u && ALLOWED_OPS_BYPASS_ROLES.has(u.role);
  } catch (err) {
    logger.warn({ userId, err }, "riskGate: role lookup failed — assuming non-operator");
    return false;
  }
}

// ── Main gate ───────────────────────────────────────────────────────────────

export async function evaluateRiskGate(args: {
  userId:         string;
  intendedSizeUsd: number;
}): Promise<RiskVerdict> {
  const { userId, intendedSizeUsd } = args;
  const { snapshot, equityAvailable } = await composeRiskSnapshot(userId, intendedSizeUsd);

  // Opt-out short-circuit. Caller still records the event with
  // `risk_disabled_by_user` so the operator audit shows who's bypassing
  // their own caps. Not a rejection — `allowed: true`.
  if (!snapshot.settings.enabled) {
    return { allowed: true, reasonCode: "risk_disabled_by_user", snapshot };
  }

  // No-equity short-circuit. We refuse to evaluate when we couldn't read
  // a live equity number: pct-based caps would collapse to $0 and
  // erroneously block every trade, OR collapse caps to "infinite" and
  // erroneously allow a trade the user said they didn't want. Fail-closed.
  if (!equityAvailable || snapshot.equityUsd <= 0) {
    return {
      allowed:    false,
      reasonCode: "risk_no_equity",
      reasonText: "Unable to read live account equity — risk caps cannot be evaluated. Try again shortly.",
      snapshot,
    };
  }

  const { effective, derived } = snapshot;

  // Cap 1 — per-trade max.
  if (intendedSizeUsd > effective.maxCapitalPerTradeUsd) {
    return {
      allowed:    false,
      reasonCode: "risk_max_per_trade",
      reasonText: `Trade size $${intendedSizeUsd.toFixed(2)} exceeds your per-trade cap of $${effective.maxCapitalPerTradeUsd.toFixed(2)}.`,
      snapshot,
    };
  }

  // Cap 2 — concurrent open positions.
  if (snapshot.openCount >= effective.maxSimultaneousTrades) {
    return {
      allowed:    false,
      reasonCode: "risk_max_simultaneous",
      reasonText: `You have ${snapshot.openCount} open AI trade(s); your cap is ${effective.maxSimultaneousTrades}. Close a position before opening a new one.`,
      snapshot,
    };
  }

  // Cap 3 — total allocation across open AI positions.
  if (snapshot.openNotionalUsd + intendedSizeUsd > effective.maxTotalAllocationUsd) {
    return {
      allowed:    false,
      reasonCode: "risk_max_allocation",
      reasonText: `Total AI allocation would reach $${(snapshot.openNotionalUsd + intendedSizeUsd).toFixed(2)}, exceeding your cap of $${effective.maxTotalAllocationUsd.toFixed(2)}.`,
      snapshot,
    };
  }

  // Cap 4 — reserve cash floor must hold AFTER this trade.
  // freeCapital already subtracts reserveCash; if intended size > freeCapital,
  // taking it would breach the reserve.
  if (intendedSizeUsd > derived.freeCapitalUsd) {
    return {
      allowed:    false,
      reasonCode: "risk_reserve_cash_breach",
      reasonText: `Trade size $${intendedSizeUsd.toFixed(2)} would breach your reserve cash floor of $${effective.reserveCashUsd.toFixed(2)} (free capital: $${derived.freeCapitalUsd.toFixed(2)}).`,
      snapshot,
    };
  }

  return { allowed: true, snapshot };
}
