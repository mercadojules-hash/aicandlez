/**
 * Admin user telemetry + platform leaderboard endpoints (Task #158).
 *
 *   GET /api/admin/users
 *     Paginated, sortable, filterable list of all users with the activity
 *     intelligence columns required by the ALL USERS operator console.
 *
 *   GET /api/admin/users/:id
 *     Cinematic detail-panel payload: positions, closed trades, exchange
 *     health, audit trail, AI/risk settings, status, trade-limit verdict,
 *     aggregates (PnL, exposure, fees generated, win rate, frequency,
 *     avg confidence).
 *
 *   GET /api/admin/platform/leaderboards?window=24h|7d|30d|all
 *     Top traders, most profitable, highest volume, drawdown, fee
 *     leaderboard, total exposure, live capital deployed, platform fee
 *     revenue. Time-window scoped via `window` query param.
 *
 * Read-only. No new schema. No writes. Operator path (placeLiveAutoOrder,
 * exchangeEngine, queue, Kraken adapter) is untouched. Customer experience
 * unchanged.
 *
 * Auth: requireAuth + requireRole(["admin","super-admin"]). Non-admin
 * receives 403 from the role middleware.
 *
 * Caching: tiny in-memory TTL cache (5s) per (path + querystring) tuple,
 * keyed under the calling admin's clerk id so two operators don't poison
 * each other's view (different filter combos resolve to different keys).
 * Invalidate via `__invalidateAdminUserTelemetryCache()` from operator
 * write paths (next task).
 */

import { Router, type Request } from "express";
import { db, userSettingsTable, getPlanDefaultCap } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { getTradeLimitVerdict } from "../lib/tradeLimitEngine.js";
import { getExcursion } from "../lib/excursionTracker.js";
import { getTicker } from "../lib/marketData.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(v: number | null, digits = 4): number | null {
  return v === null || !Number.isFinite(v) ? null : Number(v.toFixed(digits));
}

async function getTickerPriceForAdmin(symbol: string): Promise<number | null> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 400);
  });
  const fetched = getTicker(symbol)
    .then(ticker => ticker.price > 0 ? ticker.price : null)
    .catch(() => null);
  return Promise.race([fetched, timeout]);
}

// ── Effective trade-cap resolver (list endpoint) ─────────────────────────────
// Mirrors tradeLimitEngine.resolveCap() so the operator grid + list rows
// hydrate from identical math, just sourced from in-SQL columns instead
// of a per-row engine call. Single source of truth for the "what number
// renders in the TRADE CAP card / `n / cap` usage cell".
//
// Priority order (same as engine):
//   1. operator override active     → row.cap_tier (−1 = UNLIMITED)
//   2. operator override expired    → plan default
//   3. usePlanDefault=true / no row → plan default
//
// `getPlanDefaultCap` falls back to FREE for unknown / legacy plan strings,
// so a missing/garbled `users.plan` never returns NaN.
type ListEffectiveCap = {
  effectiveCap:   number;
  planDefaultCap: number;
  source:         "plan-default" | "operator-override";
};
function resolveListEffectiveCap(
  r: Record<string, unknown>,
  nowMs: number,
): ListEffectiveCap {
  const planDefaultCap   = getPlanDefaultCap(
    typeof r["plan"] === "string" ? (r["plan"] as string) : null,
  );
  const rawCapTier       = r["trade_cap_tier_raw"];
  const usePlanDefaultRaw = r["trade_use_plan_default"];
  const overrideExpiresAt = r["trade_cap_override_expires_at"];

  // No override row at all → plan default.
  if (rawCapTier === null || rawCapTier === undefined) {
    return { effectiveCap: planDefaultCap, planDefaultCap, source: "plan-default" };
  }
  // Operator chose "use plan default" (the flag is the authoritative
  // discriminator per the schema doc) → plan default, ignore cap_tier.
  if (usePlanDefaultRaw !== false) {
    return { effectiveCap: planDefaultCap, planDefaultCap, source: "plan-default" };
  }
  // Override window elapsed → revert to plan default. Permanent overrides
  // set overrideExpiresAt=NULL, which never trips this branch.
  if (overrideExpiresAt && new Date(String(overrideExpiresAt)).getTime() < nowMs) {
    return { effectiveCap: planDefaultCap, planDefaultCap, source: "plan-default" };
  }
  return {
    effectiveCap:   Number(rawCapTier),
    planDefaultCap,
    source:         "operator-override",
  };
}

// ── In-memory cache ──────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5_000;
interface CacheEntry { payload: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>();

function cacheKey(adminId: string, req: Request): string {
  // Stable-sorted querystring so `?a=1&b=2` and `?b=2&a=1` share an entry.
  const params = Object.entries(req.query)
    .map(([k, v]) => [k, String(v ?? "")] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${adminId}::${req.path}?${params}`;
}

function readCache(key: string): unknown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeCache(key: string, payload: unknown): void {
  cache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Operator-write paths call this after mutating user state. Test-only helper. */
export function __invalidateAdminUserTelemetryCache(): void {
  cache.clear();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Schema-probe defenses (broker-fee + `exchange` cols on sim_trades /
// sim_positions, plus `user_trade_limits` / `user_admin_status` tables) were
// stripped under Task #174 once the prod DB was reconciled with `lib/db`.
// Failures now surface loudly instead of silently degrading to 0/false/null.
function getAdminId(req: Request): string {
  // `requireAuth` populates req.auth.userId — clerk id of the calling admin.
  const auth = (req as Request & { auth?: { userId?: string } }).auth;
  return auth?.userId ?? "unknown-admin";
}

function parsePositiveInt(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

type Window = "24h" | "7d" | "30d" | "all";
function parseWindow(raw: unknown): Window {
  const v = String(raw ?? "all");
  if (v === "24h" || v === "7d" || v === "30d" || v === "all") return v;
  return "all";
}
function windowStartMs(w: Window): number {
  const now = Date.now();
  switch (w) {
    case "24h": return now - 24 * 60 * 60 * 1000;
    case "7d":  return now - 7 * 24 * 60 * 60 * 1000;
    case "30d": return now - 30 * 24 * 60 * 60 * 1000;
    case "all": return 0;
  }
}

// ── GET /admin/users ─────────────────────────────────────────────────────────
// Activity-intelligence list. Pre-aggregates per-user totals from sim_trades
// + sim_positions + user_exchange_connections + user_admin_status so the
// operator UI doesn't fan out N+1 calls.
router.get("/admin/users", ...requireOperator, async (req, res): Promise<void> => {
  const key = cacheKey(getAdminId(req), req);
  const cached = readCache(key);
  if (cached !== null) { res.json(cached); return; }

  // [ADMIN_USERS_REQUEST] — diagnostic added 2026-05-28 for the
  // "Failed to load users" regression. Captures every request that
  // miss-traverses the cache so on-call can correlate the failing
  // call with the SQL/serialize/mapper error logged below.
  const adminUsersStartedAt = Date.now();
  req.log.info({
    tag: "ADMIN_USERS_REQUEST",
    stage: "start",
    adminId: getAdminId(req),
    query: req.query,
  }, "[ADMIN_USERS_REQUEST] start");

  try {
    const q          = String(req.query["q"] ?? "").trim().toLowerCase();
    const planFilter = String(req.query["plan"] ?? "").trim().toLowerCase();
    const statusF    = String(req.query["status"] ?? "").trim().toLowerCase();
    const hasLive    = String(req.query["hasLive"] ?? "") === "true";
    const sort       = String(req.query["sort"] ?? "lastActivityAt");
    const dir        = String(req.query["dir"] ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const page       = parsePositiveInt(req.query["page"], 1, 10_000);
    const pageSize   = parsePositiveInt(req.query["pageSize"], 50, 200);
    const offset     = (page - 1) * pageSize;

    // Whitelist sort columns to avoid arbitrary SQL injection through the
    // ORDER BY clause.
    const SORTABLE: Record<string, string> = {
      email:           "u.email",
      createdAt:       "u.created_at",
      plan:            "u.plan",
      totalPnl:        "agg.total_pnl",
      tradesCount:     "agg.trades_count",
      // last_activity_at is a top-level SELECT alias (GREATEST(...) below),
      // NOT a column on the trade_agg CTE — qualifying it with `agg.` raises
      // `column agg.last_activity_at does not exist` and 500s the whole
      // endpoint. This is the default sort, so the bug torched every
      // unsorted /admin/users call.
      lastActivityAt:  "last_activity_at",
      openPositions:   "pos.open_positions",
      mrr:             "mrr_usd",
    };
    const orderBy = SORTABLE[sort] ?? SORTABLE["lastActivityAt"]!;

    const search   = q ? `%${q}%` : null;
    const planArg  = planFilter || null;
    const statArg  = statusF || null;

    const sqlStartedAt = Date.now();
    const rows = await db.execute(sql`
      WITH trade_agg AS (
        SELECT
          user_id,
          COUNT(*)::int                                         AS trades_count,
          COUNT(*) FILTER (WHERE realized_pnl > 0)::int          AS wins,
          COUNT(*) FILTER (WHERE realized_pnl <= 0)::int         AS losses,
          COALESCE(SUM(realized_pnl), 0)::float                  AS total_pnl,
          COALESCE(SUM(
            COALESCE(entry_fee_broker, entry_fee, 0)
            + COALESCE(exit_fee_broker, exit_fee, 0)
          ), 0)::float                                           AS fees_generated,
          MAX(exit_time)::bigint                                 AS last_trade_ms,
          COUNT(*) FILTER (WHERE exchange IS NOT NULL)::int      AS live_trades_count
        FROM sim_trades
        GROUP BY user_id
      ),
      pos_agg AS (
        SELECT
          user_id,
          COUNT(*)::int                                         AS open_positions,
          COALESCE(SUM(size_usd), 0)::float                      AS open_exposure_usd,
          COUNT(*) FILTER (WHERE exchange IS NOT NULL)::int      AS open_live_positions
        FROM sim_positions
        GROUP BY user_id
      ),
      conn_agg AS (
        SELECT
          user_id,
          COUNT(*)::int                                         AS exchange_total,
          COUNT(*) FILTER (WHERE status = 'active')::int        AS exchange_active,
          COUNT(*) FILTER (WHERE status = 'error')::int         AS exchange_error,
          BOOL_OR(trading_mode = 'live' AND status = 'active')  AS has_live_exchange
        FROM user_exchange_connections
        GROUP BY user_id
      ),
      -- Mirrors tradeLimitEngine.getTradeLimitVerdict: count opens in the
      -- last 24h across both currently-open positions AND already-closed
      -- trades where exchange IS NOT NULL. Done in SQL so the list call
      -- delivers engine-equivalent telemetry in one round-trip instead of
      -- N+1 engine invocations per row.
      live_opens_24h AS (
        SELECT user_id, COUNT(*)::int AS used_24h FROM (
          SELECT user_id, entry_time FROM sim_positions
            WHERE exchange IS NOT NULL AND entry_time >= ${Date.now() - 24 * 60 * 60 * 1000}
          UNION ALL
          SELECT user_id, entry_time FROM sim_trades
            WHERE exchange IS NOT NULL AND entry_time >= ${Date.now() - 24 * 60 * 60 * 1000}
        ) o
        WHERE user_id IS NOT NULL
        GROUP BY user_id
      ),
      trades_today AS (
        -- Trades closed in the last 24h (exit-time based, per CRM telemetry
        -- spec — counts realised activity, not just orders opened in the
        -- window).
        SELECT user_id, COUNT(*)::int AS today_count
        FROM sim_trades
        WHERE exit_time >= ${Date.now() - 24 * 60 * 60 * 1000}
        GROUP BY user_id
      ),
      -- CRM Phase A: surface the user's currently-active/default exchange
      -- so the operator grid can render an "Active Exchange" column without
      -- a per-row fan-out. Picks the is_default=true connection (or the most
      -- recently-verified one as a fallback) per user.
      active_exchange_agg AS (
        SELECT DISTINCT ON (user_id) user_id, exchange, trading_mode
        FROM user_exchange_connections
        WHERE status = 'active'
        ORDER BY user_id, is_default DESC, last_verified_at DESC NULLS LAST
      ),
      -- CRM Phase A: AI activity intensity in the last 24h, derived from
      -- the immutable audit_log. Used as the operator's "AI Usage" column.
      -- Filters to event types known to be emitted by the AI / execution
      -- pipeline (signal_emit, ai_decision, auto_trade, order_placed,
      -- order_rejected). Falls back to 0 when nothing was recorded.
      ai_usage_24h AS (
        SELECT user_id, COUNT(*)::int AS ai_events_24h
        FROM audit_log
        WHERE ts_ms >= ${Date.now() - 24 * 60 * 60 * 1000}
          AND type IN (
            'signal_emit', 'ai_decision', 'auto_trade',
            'order_placed', 'order_rejected', 'trade_open', 'trade_close'
          )
        GROUP BY user_id
      )
      SELECT
        u.clerk_user_id                                         AS clerk_user_id,
        u.email                                                  AS email,
        u.role                                                   AS role,
        u.plan                                                   AS plan,
        u.plan_status                                            AS plan_status,
        u.trial_ends_at                                          AS trial_ends_at,
        u.stripe_subscription_id                                 AS stripe_subscription_id,
        u.created_at                                             AS created_at,
        CASE
          WHEN u.plan = 'starter' THEN 39.99
          WHEN u.plan = 'pro'     THEN 79.99
          ELSE 0
        END                                                      AS mrr_usd,
        COALESCE(status.status, 'active')                        AS admin_status,
        COALESCE(s.auto_mode, false)                             AS ai_enabled,
        s.position_size_usd                                      AS position_size_usd,
        s.max_active_positions                                   AS max_active_positions,
        s.min_confidence                                         AS min_confidence,
        s.risk_level                                             AS risk_level,
        COALESCE(agg.trades_count, 0)                            AS trades_count,
        COALESCE(agg.wins, 0)                                    AS wins,
        COALESCE(agg.losses, 0)                                  AS losses,
        COALESCE(agg.total_pnl, 0)                               AS total_pnl,
        COALESCE(agg.fees_generated, 0)                          AS fees_generated,
        COALESCE(agg.live_trades_count, 0)                       AS live_trades_count,
        agg.last_trade_ms                                        AS last_trade_ms,
        COALESCE(pos.open_positions, 0)                          AS open_positions,
        COALESCE(pos.open_exposure_usd, 0)                       AS open_exposure_usd,
        COALESCE(pos.open_live_positions, 0)                     AS open_live_positions,
        COALESCE(conn.exchange_total, 0)                         AS exchange_total,
        COALESCE(conn.exchange_active, 0)                        AS exchange_active,
        COALESCE(conn.exchange_error, 0)                         AS exchange_error,
        COALESCE(conn.has_live_exchange, false)                  AS has_live_exchange,
        -- Raw operator-override row. JS shaping below resolves the
        -- EFFECTIVE cap from these three fields + u.plan via
        -- getPlanDefaultCap(), mirroring tradeLimitEngine.resolveCap().
        -- Returning the raw row (NULL when missing) means the JS layer
        -- can faithfully distinguish "no override" (→ plan default)
        -- from "operator picked 50" (→ explicit override). The legacy
        -- COALESCE(..., 50) silently collapsed both into "50" — which
        -- is why PRO users were rendering 50 in the operator grid.
        tl.cap_tier                                              AS trade_cap_tier_raw,
        tl.use_plan_default                                      AS trade_use_plan_default,
        tl.override_expires_at                                   AS trade_cap_override_expires_at,
        COALESCE(o24.used_24h, 0)                                AS used_24h,
        COALESCE(td.today_count, 0)                              AS trades_today,
        COALESCE(a.cash_balance, 0)                              AS cash_balance,
        ax.exchange                                              AS active_exchange,
        ax.trading_mode                                          AS active_exchange_mode,
        COALESCE(ai24.ai_events_24h, 0)                          AS ai_events_24h,
        GREATEST(
          COALESCE(agg.last_trade_ms, 0),
          COALESCE(EXTRACT(EPOCH FROM u.created_at)::bigint * 1000, 0)
        )                                                        AS last_activity_at
      FROM users u
      LEFT JOIN user_settings        s      ON s.user_id      = u.clerk_user_id
      LEFT JOIN user_admin_status    status ON status.user_id = u.clerk_user_id
      LEFT JOIN trade_agg            agg    ON agg.user_id    = u.clerk_user_id
      LEFT JOIN pos_agg              pos    ON pos.user_id    = u.clerk_user_id
      LEFT JOIN conn_agg             conn   ON conn.user_id   = u.clerk_user_id
      LEFT JOIN user_trade_limits    tl     ON tl.user_id     = u.clerk_user_id
      LEFT JOIN live_opens_24h       o24    ON o24.user_id    = u.clerk_user_id
      LEFT JOIN trades_today         td     ON td.user_id     = u.clerk_user_id
      LEFT JOIN sim_accounts         a      ON a.user_id      = u.clerk_user_id
      LEFT JOIN active_exchange_agg  ax     ON ax.user_id     = u.clerk_user_id
      LEFT JOIN ai_usage_24h         ai24   ON ai24.user_id   = u.clerk_user_id
      WHERE (${search}::text IS NULL OR LOWER(u.email) LIKE ${search})
        AND (${planArg}::text IS NULL OR LOWER(u.plan) = ${planArg})
        AND (${statArg}::text IS NULL OR COALESCE(status.status, 'active') = ${statArg})
        AND (${hasLive} = false OR COALESCE(conn.has_live_exchange, false) = true)
      ORDER BY ${sql.raw(orderBy)} ${sql.raw(dir)} NULLS LAST
      LIMIT ${sql.raw(String(pageSize))}
      OFFSET ${sql.raw(String(offset))}
    `).then(r => r.rows as Array<Record<string, unknown>>);

    const [countRow] = await db.execute(sql`
      WITH conn_has_live AS (
        SELECT user_id, BOOL_OR(trading_mode = 'live' AND status = 'active') AS has_live
        FROM user_exchange_connections
        GROUP BY user_id
      )
      SELECT COUNT(*)::int AS total
      FROM users u
      LEFT JOIN user_admin_status status ON status.user_id = u.clerk_user_id
      LEFT JOIN conn_has_live    c      ON c.user_id      = u.clerk_user_id
      WHERE (${search}::text IS NULL OR LOWER(u.email) LIKE ${search})
        AND (${planArg}::text IS NULL OR LOWER(u.plan) = ${planArg})
        AND (${statArg}::text IS NULL OR COALESCE(status.status, 'active') = ${statArg})
        AND (${hasLive} = false OR COALESCE(c.has_live, false) = true)
    `).then(r => r.rows as Array<{ total: number }>);

    req.log.info({
      tag: "ADMIN_USERS_SQL_OK",
      stage: "sql",
      rowCount: rows.length,
      total: countRow?.total ?? 0,
      durationMs: Date.now() - sqlStartedAt,
    }, "[ADMIN_USERS_SQL_OK]");

    // [ADMIN_USERS_ROW_SCHEMA] — Phase-5 diagnostic for the
    // /api/admin/users 500 regression. Snapshots the raw first row coming
    // back from pg so on-call can see column keys + per-column `typeof` +
    // the presence of any of the four serializer landmines:
    //   - BigInt    → res.json throws `Do not know how to serialize a BigInt`
    //   - Date      → safe (ISO string), but logged for completeness
    //   - undefined → drops keys silently — usually fine, but worth flagging
    //   - object    → must be plain (no circulars). Captured shallowly.
    // Fires only when rowCount > 0 to avoid noise on empty result sets.
    if (rows.length > 0) {
      const first = rows[0] ?? {};
      const keyTypes: Record<string, string> = {};
      const bigIntKeys: string[] = [];
      const dateKeys:   string[] = [];
      const undefinedKeys: string[] = [];
      for (const k of Object.keys(first)) {
        const v = (first as Record<string, unknown>)[k];
        const t = typeof v;
        keyTypes[k] = v === null ? "null" : t;
        if (t === "bigint")               bigIntKeys.push(k);
        if (v instanceof Date)            dateKeys.push(k);
        if (v === undefined)              undefinedKeys.push(k);
      }
      req.log.info({
        tag:            "ADMIN_USERS_ROW_SCHEMA",
        stage:          "sql-probe",
        rowCount:       rows.length,
        firstRowKeys:   Object.keys(first),
        keyTypes,
        bigIntKeys,
        dateKeys,
        undefinedKeys,
      }, "[ADMIN_USERS_ROW_SCHEMA] first raw DB row schema");
    }

    // "Online" heuristic — last activity within 10 min. Cheap and DB-derivable.
    const now = Date.now();
    const mapStartedAt = Date.now();
    // [ADMIN_USERS_ROW_FAIL] — per-row try/catch so one malformed row
    // (bad date / NaN / unexpected null) DEGRADES into a skeleton row
    // instead of throwing the whole `rows.map()` and 500-ing the entire
    // grid. Acceptance criteria from the 2026-05-28 regression report:
    // "Operator USERS grid should render even if one user row is
    // malformed. Bad rows should degrade gracefully instead of killing
    // the entire collection render."
    let rowFailures = 0;
    const users = rows.map((r) => {
      const clerkUserId = String(r["clerk_user_id"] ?? "unknown");
      try {
      const last = Number(r["last_activity_at"] ?? 0);
      const lastTrade = r["last_trade_ms"] == null ? null : Number(r["last_trade_ms"]);
      // Hardened ISO conversion: a malformed `trial_ends_at` (legacy
      // string row, drift, etc.) would otherwise throw RangeError out
      // of `.toISOString()` and torch the whole list.
      let trialEndsAtIso: string | null = null;
      if (r["trial_ends_at"] != null) {
        const t = new Date(String(r["trial_ends_at"])).getTime();
        if (Number.isFinite(t)) trialEndsAtIso = new Date(t).toISOString();
      }
      return {
        clerkUserId:         String(r["clerk_user_id"]),
        email:               String(r["email"]),
        role:                String(r["role"]),
        plan:                String(r["plan"]),
        planStatus:          String(r["plan_status"]),
        trialEndsAt:         trialEndsAtIso,
        // Complimentary marker: FREE comp has no Stripe sub but has trial_ends_at;
        // STARTER/PRO comp has both. Real paid trials also have both — operator
        // distinguishes via audit log. UI labels both as "TRIAL · Nd" (neutral).
        isComplimentary:     r["plan_status"] === "trialing" && r["trial_ends_at"] != null && r["stripe_subscription_id"] == null,
        adminStatus:         String(r["admin_status"]),
        createdAt:           r["created_at"],
        mrrUsd:              Number(r["mrr_usd"] ?? 0),
        aiEnabled:           Boolean(r["ai_enabled"]),
        positionSizeUsd:     r["position_size_usd"] == null ? null : Number(r["position_size_usd"]),
        maxActivePositions:  r["max_active_positions"] == null ? null : Number(r["max_active_positions"]),
        minConfidence:       r["min_confidence"] == null ? null : Number(r["min_confidence"]),
        riskLevel:           r["risk_level"] == null ? null : String(r["risk_level"]),
        tradesCount:         Number(r["trades_count"] ?? 0),
        wins:                Number(r["wins"] ?? 0),
        losses:              Number(r["losses"] ?? 0),
        winRate:             Number(r["trades_count"] ?? 0) > 0
          ? Number(r["wins"]) / Number(r["trades_count"])
          : null,
        totalPnl:            Number(r["total_pnl"] ?? 0),
        feesGenerated:       Number(r["fees_generated"] ?? 0),
        liveTradesCount:     Number(r["live_trades_count"] ?? 0),
        lastTradeMs:         lastTrade && lastTrade > 0 ? lastTrade : null,
        openPositions:       Number(r["open_positions"] ?? 0),
        openExposureUsd:     Number(r["open_exposure_usd"] ?? 0),
        openLivePositions:   Number(r["open_live_positions"] ?? 0),
        exchangeTotal:       Number(r["exchange_total"] ?? 0),
        exchangeActive:      Number(r["exchange_active"] ?? 0),
        exchangeError:       Number(r["exchange_error"] ?? 0),
        hasLiveExchange:     Boolean(r["has_live_exchange"]),
        // tradeCapTier in the list payload = EFFECTIVE cap (the number
        // the operator grid's "TRADE CAP" cell renders). Resolution
        // mirrors tradeLimitEngine.resolveCap() — see the IIFE below.
        tradeCapTier:        resolveListEffectiveCap(r, now).effectiveCap,
        tradesToday:         Number(r["trades_today"] ?? 0),
        equityUsd:           Number(r["cash_balance"] ?? 0),
        // Trade-limit engine-equivalent telemetry, derived in-SQL +
        // resolveListEffectiveCap() so the list endpoint never N+1s
        // the engine per row. Shape matches the per-user verdict
        // (source + planDefaultCap) so the drawer + grid hydrate
        // from a single canonical schema.
        tradeLimit: (() => {
          const { effectiveCap, planDefaultCap, source } =
            resolveListEffectiveCap(r, now);
          const used = Number(r["used_24h"] ?? 0);
          const remaining = effectiveCap === -1
            ? Number.POSITIVE_INFINITY
            : Math.max(0, effectiveCap - used);
          const blocked = effectiveCap !== -1 && used >= effectiveCap;
          return {
            used24h:        used,
            capTier:        effectiveCap,
            source,
            planDefaultCap,
            remaining: remaining === Number.POSITIVE_INFINITY ? null : remaining,
            blocked,
            reason:    blocked ? "trade_limit_exhausted" as const : "ok" as const,
          };
        })(),
        lastActivityAt:      last > 0 ? last : null,
        onlineNow:           last > 0 && (now - last) < 10 * 60 * 1000,
        // ── CRM Phase A telemetry overlay ────────────────────────────────
        // activeExchange: the user's default/most-recently-verified active
        // exchange (or null if none). Operator grid renders the canonical
        // exchange name; null collapses to "—".
        activeExchange:      r["active_exchange"] == null
          ? null
          : { name: String(r["active_exchange"]), mode: String(r["active_exchange_mode"] ?? "paper") },
        // exchangesConnected: redundant alias of exchange_active so the
        // operator grid can read a single canonical column name.
        exchangesConnected:  Number(r["exchange_active"] ?? 0),
        // aiUsage24h: count of AI/execution audit_log events in the last
        // 24h. Used as a "usage intensity" column.
        aiUsage24h:          Number(r["ai_events_24h"] ?? 0),
        // sessionStatus: derived purely from lastActivityAt. Real session
        // tracking lands in Phase A3; this placeholder lets the operator
        // grid render a session pill today without inventing data.
        //   active  — last activity < 2 min
        //   idle    — last activity < 30 min
        //   offline — older or null
        sessionStatus: (() => {
          if (!last) return "offline" as const;
          const ageMs = now - last;
          if (ageMs < 2 * 60 * 1000)  return "active"  as const;
          if (ageMs < 30 * 60 * 1000) return "idle"    as const;
          return "offline" as const;
        })(),
        // revenueGenerated: lifetime performance fees + current-month MRR.
        // Operator-grade single-number revenue read; precise lifetime sub
        // revenue is materialised separately from Stripe in BillingAdmin.
        revenueGenerated:    Number(r["fees_generated"] ?? 0) + Number(r["mrr_usd"] ?? 0),
      };
      } catch (rowErr) {
        rowFailures += 1;
        req.log.error({
          tag: "ADMIN_USERS_ROW_FAIL",
          stage: "row-map",
          failingClerkUserId: clerkUserId,
          failingEmail:       r["email"] == null ? null : String(r["email"]),
          err:                rowErr instanceof Error ? { message: rowErr.message, stack: rowErr.stack } : rowErr,
        }, "[ADMIN_USERS_ROW_FAIL] row mapper threw — degrading to skeleton");
        // Skeleton row — preserves identity so the grid still renders a
        // row (with a visible degraded marker via planStatus='error')
        // instead of dropping the user silently or 500ing the entire
        // collection. tradeLimit defaults to a safe plan-default shape.
        return {
          clerkUserId,
          email:              r["email"] == null ? "" : String(r["email"]),
          role:               "user",
          plan:               "free",
          planStatus:         "error",
          trialEndsAt:        null,
          isComplimentary:    false,
          adminStatus:        "active",
          createdAt:          null,
          mrrUsd:             0,
          aiEnabled:          false,
          positionSizeUsd:    null,
          maxActivePositions: null,
          minConfidence:      null,
          riskLevel:          null,
          tradesCount:        0,
          wins:               0,
          losses:             0,
          winRate:            null,
          totalPnl:           0,
          feesGenerated:      0,
          liveTradesCount:    0,
          lastTradeMs:        null,
          openPositions:      0,
          openExposureUsd:    0,
          openLivePositions:  0,
          exchangeTotal:      0,
          exchangeActive:     0,
          exchangeError:      0,
          hasLiveExchange:    false,
          tradeCapTier:       50,
          tradesToday:        0,
          equityUsd:          0,
          tradeLimit: {
            used24h:        0,
            capTier:        50,
            source:         "plan-default" as const,
            planDefaultCap: 50,
            remaining:      50,
            blocked:        false,
            reason:         "ok" as const,
          },
          lastActivityAt:     null,
          onlineNow:          false,
          activeExchange:     null,
          exchangesConnected: 0,
          aiUsage24h:         0,
          sessionStatus:      "offline" as const,
          revenueGenerated:   0,
        };
      }
    });

    req.log.info({
      tag: "ADMIN_USERS_MAP_OK",
      stage: "map",
      rowCount: users.length,
      rowFailures,
      durationMs: Date.now() - mapStartedAt,
    }, "[ADMIN_USERS_MAP_OK]");

    const payload = {
      users,
      page,
      pageSize,
      total:     countRow?.total ?? 0,
      sort,
      dir,
      filters:   { q: q || null, plan: planFilter || null, status: statusF || null, hasLive },
      timestamp: now,
    };
    // [ADMIN_USERS_PAYLOAD_PROBE] — Phase-5 diagnostic. Walks the
    // assembled payload (depth-capped, first user only) hunting for the
    // four serializer landmines BEFORE JSON.stringify gets a chance to
    // throw. The path of any offending value is logged so on-call can
    // jump straight to the offending mapper field (e.g.
    // "users[0].tradeLimit.remaining = bigint").
    //
    // Bounded scan: depth ≤ 4, first user only, short-circuits on first
    // 5 hits per kind. Cheap enough to run every request; the structured
    // log is what makes the difference between "500 with no clue" and
    // "500 + exact field path".
    const probeStartedAt = Date.now();
    const probeHits: Array<{ path: string; kind: string; sample?: string }> = [];
    function probe(value: unknown, path: string, depth: number, seen: WeakSet<object>): void {
      if (probeHits.length >= 20 || depth > 4) return;
      if (typeof value === "bigint") {
        probeHits.push({ path, kind: "bigint", sample: String(value) });
        return;
      }
      if (value instanceof Date) {
        probeHits.push({ path, kind: "date", sample: value.toISOString() });
        return;
      }
      if (typeof value === "function") {
        probeHits.push({ path, kind: "function" });
        return;
      }
      if (value === null || typeof value !== "object") return;
      if (seen.has(value as object)) {
        probeHits.push({ path, kind: "circular" });
        return;
      }
      seen.add(value as object);
      if (Array.isArray(value)) {
        // Sample first element only — payload arrays here are homogenous.
        if (value.length > 0) probe(value[0], `${path}[0]`, depth + 1, seen);
      } else {
        for (const k of Object.keys(value as Record<string, unknown>)) {
          if (probeHits.length >= 20) break;
          probe((value as Record<string, unknown>)[k], `${path}.${k}`, depth + 1, seen);
        }
      }
    }
    probe(payload, "payload", 0, new WeakSet());
    if (probeHits.length > 0) {
      req.log.warn({
        tag:        "ADMIN_USERS_PAYLOAD_PROBE",
        stage:      "pre-serialize",
        rowCount:   users.length,
        hits:       probeHits,
        durationMs: Date.now() - probeStartedAt,
      }, "[ADMIN_USERS_PAYLOAD_PROBE] non-JSON-safe values detected in payload");
    }

    // [ADMIN_USERS_SERIALIZE_FAIL] — JSON serialization can still throw
    // (e.g. circular ref slipping in, BigInt drift from a future column
    // type change). Catching here lets us emit a structured log that
    // identifies the serialize stage as the failing surface, instead
    // of conflating it with SQL/mapper errors at the outer catch.
    const serializeStartedAt = Date.now();
    let serialized: string;
    try {
      serialized = JSON.stringify(payload);
    } catch (serErr) {
      req.log.error({
        tag: "ADMIN_USERS_SERIALIZE_FAIL",
        stage: "serialize",
        rowCount: users.length,
        rowFailures,
        err: serErr instanceof Error ? { message: serErr.message, stack: serErr.stack } : serErr,
      }, "[ADMIN_USERS_SERIALIZE_FAIL] JSON.stringify(payload) threw");
      res.status(500).json({ error: "Failed to load users", stage: "serialize" });
      return;
    }

    req.log.info({
      tag: "ADMIN_USERS_SERIALIZE_OK",
      stage: "serialize",
      bytes: serialized.length,
      durationMs: Date.now() - serializeStartedAt,
    }, "[ADMIN_USERS_SERIALIZE_OK]");

    writeCache(key, payload);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(serialized);

    req.log.info({
      tag: "ADMIN_USERS_RESPONSE_OK",
      stage: "response",
      rowCount: users.length,
      rowFailures,
      total: countRow?.total ?? 0,
      bytes: serialized.length,
      durationMs: Date.now() - adminUsersStartedAt,
    }, "[ADMIN_USERS_RESPONSE_OK]");
  } catch (err) {
    // Surface the underlying error message in the response so on-call
    // (admin-only route) can read the root cause from the network tab
    // without round-tripping through the server logs. Includes the
    // failing stage so SQL vs mapper vs serialize is grep-able.
    req.log.error({
      tag: "ADMIN_USERS_FATAL",
      stage: "fail",
      adminId: getAdminId(req),
      durationMs: Date.now() - adminUsersStartedAt,
      err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    }, "[ADMIN_USERS_FATAL]");
    res.status(500).json({
      error: "Failed to load users",
      message: err instanceof Error ? err.message : String(err),
      stage: "sql-or-prepare",
    });
  }
});

// ── GET /admin/users/:id ─────────────────────────────────────────────────────
// CACHING DELIBERATELY DISABLED on this route. This is operator control
// infrastructure: every reopen of the User Intelligence Panel must reflect
// the post-commit DB state. The previous 5s TTL cache caused a hydration
// bug where saving AI settings (autoMode / tradingMode / preferredExchange
// / volumeFilter) appeared to "revert" on drawer reopen if any other admin
// had hit the route within the prior 5s, because cache invalidation only
// fires when `changedFields > 0` AND the cache is keyed per admin (so
// admin-A's write does not invalidate admin-B's cached view).
//
// We deliberately do NOT call `readCache`/`writeCache` here — the row is
// always re-queried. The detail panel is opened by hand, has zero
// auto-polling, and the underlying consolidated query is ~6 round-trips
// total, so the cache provided no meaningful protection against load
// anyway. The list endpoint (`GET /admin/users`) keeps its cache.
router.get("/admin/users/:id", ...requireOperator, async (req, res): Promise<void> => {
  const userId = String(req.params["id"] ?? "");
  if (!userId) { res.status(400).json({ error: "Missing user id" }); return; }

  try {
    // Single consolidated user/header query — pulls user + admin_status +
    // settings + sim_account + fee aggregate in one round-trip. Cuts the
    // detail endpoint's cache-miss query count from 9 → 6.
    const [headerRow] = await db.execute(sql`
      SELECT
        u.clerk_user_id, u.email, u.role, u.plan, u.plan_status,
        u.stripe_customer_id, u.stripe_subscription_id, u.billing_email,
        u.trial_ends_at, u.created_at, u.updated_at,
        u.perf_fee_bps_override, u.fee_waiver_active, u.fee_waiver_until,
        u.is_complimentary_account, u.is_internal_account,
        u.revenue_share_bps, u.billing_override_notes,
        COALESCE(status.status, 'active') AS admin_status,
        status.reason                    AS admin_status_reason,
        status.since                     AS admin_status_since,
        CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id',                         s.id,
          'userId',                     s.user_id,
          'aiPersonality',              s.ai_personality,
          'minConfidence',              s.min_confidence,
          'riskLevel',                  s.risk_level,
          'positionSizeUSD',            s.position_size_usd,
          'maxTradesPerDay',            s.max_trades_per_day,
          'maxActivePositions',         s.max_active_positions,
          'stopLossPercent',            s.stop_loss_percent,
          'takeProfitPercent',          s.take_profit_percent,
          'trailingStopPercent',        s.trailing_stop_percent,
          'maxHoldHours',               s.max_hold_hours,
          'autoMode',                   s.auto_mode,
          'tradingMode',                s.trading_mode,
          'volumeFilter',               s.volume_filter,
          'require1HTrend',             s.require_1h_trend,
          'preferredExchange',          s.preferred_exchange,
          'activeRuntimeExchange',      s.active_runtime_exchange,
          'preferredLiveOrderSizeUsd',  s.preferred_live_order_size_usd,
          'paperSandboxEnabled',        s.paper_sandbox_enabled,
          'notificationsTradeExec',     s.notifications_trade_exec,
          'notificationsSignals',       s.notifications_signals,
          'notificationsRiskAlerts',    s.notifications_risk_alerts,
          'notificationsLiveFills',     s.notifications_live_fills,
          'exchangeOutageEmailEnabled', s.exchange_outage_email_enabled,
          'exchangeOutagePushEnabled',  s.exchange_outage_push_enabled,
          'alertPrefs',                 s.alert_prefs,
          'timezone',                   s.timezone,
          'currency',                   s.currency,
          'createdAt',                  s.created_at,
          'updatedAt',                  s.updated_at
        ) END                            AS settings_json,
        row_to_json(a.*)                 AS sim_account_json,
        COALESCE(pf.fee_records, 0)      AS fee_records,
        COALESCE(pf.fees_total, 0)       AS fees_total,
        COALESCE(pf.profitable_pnl, 0)   AS profitable_pnl
      FROM users u
      LEFT JOIN user_admin_status status ON status.user_id = u.clerk_user_id
      LEFT JOIN user_settings    s      ON s.user_id      = u.clerk_user_id
      LEFT JOIN sim_accounts     a      ON a.user_id      = u.clerk_user_id
      LEFT JOIN (
        SELECT user_id,
               COUNT(*)::int                       AS fee_records,
               COALESCE(SUM(fee_amount_usd), 0)::float AS fees_total,
               COALESCE(SUM(realized_pnl), 0)::float   AS profitable_pnl
        FROM performance_fees
        WHERE user_id = ${userId}
        GROUP BY user_id
      ) pf ON pf.user_id = u.clerk_user_id
      WHERE u.clerk_user_id = ${userId}
      LIMIT 1
    `).then(r => r.rows as Array<Record<string, unknown>>);

    if (!headerRow) { res.status(404).json({ error: "User not found" }); return; }

    // JIT-provision user_settings so the admin panel never sees `null` for
    // a user who hasn't booted the portal yet. Without this, the read path
    // returns `settings: null`, the operator UI falls back to in-memory
    // defaults (60% conf / moderate / 20 USD / etc.), and a subsequent
    // PATCH from the panel would write defaults over the user's *actual*
    // (unread) preferences. Mirrors the bootstrap pattern in
    // `userSettings.ts:getOrCreateSettings` (idempotent via
    // `onConflictDoNothing`, race-safe via re-select).
    // FK is safe: we already confirmed the parent `users` row exists via
    // `headerRow` above. Only runs on cache-miss + null-settings path; the
    // 5s telemetry cache absorbs repeated drawer opens.
    let settingsJson: unknown = headerRow["settings_json"] ?? null;
    if (settingsJson == null) {
      const [inserted] = await db.insert(userSettingsTable)
        .values({ userId })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        settingsJson = inserted;
      } else {
        const [existing] = await db.select().from(userSettingsTable)
          .where(eq(userSettingsTable.userId, userId)).limit(1);
        settingsJson = existing ?? null;
      }
    }

    // Fan-out the multi-row reads in parallel — each is user_id-indexed.
    const [
      positionsRows, closedRows, connectionsRows, auditRows, eventRows,
    ] = await Promise.all([
      db.execute(sql`
        SELECT * FROM sim_positions
        WHERE user_id = ${userId}
        ORDER BY entry_time DESC
        LIMIT 100
      `).then(r => r.rows as Array<Record<string, unknown>>),
      db.execute(sql`
        SELECT * FROM sim_trades
        WHERE user_id = ${userId}
        ORDER BY exit_time DESC
        LIMIT 50
      `).then(r => r.rows as Array<Record<string, unknown>>),
      // NEVER select encrypted_blob — only metadata is returned to the operator UI.
      db.execute(sql`
        SELECT id, exchange, label, status, is_default, trading_mode,
               demo_mode, permissions, last_verified_at, last_error,
               created_at, updated_at
        FROM user_exchange_connections
        WHERE user_id = ${userId}
        ORDER BY is_default DESC, created_at DESC
      `).then(r => r.rows as Array<Record<string, unknown>>),
      db.execute(sql`
        SELECT id, actor_admin_id, target_user_id, action, payload, created_at
        FROM user_admin_actions
        WHERE target_user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 50
      `).then(r => r.rows as Array<Record<string, unknown>>),
      // Execution / API event stream from the immutable audit log. Covers
      // AI decisions, exchange API errors, latency markers, and any other
      // typed event the engine recorded for this user. Capped at 200 rows
      // so a noisy account doesn't blow up the payload.
      db.execute(sql`
        SELECT id, ts_ms, type, exchange, symbol, severity, payload
        FROM audit_log
        WHERE user_id = ${userId}
        ORDER BY ts_ms DESC
        LIMIT 200
      `).then(r => r.rows as Array<Record<string, unknown>>),
    ]);

    // Average confidence is derived from the user's recent audit_log AI
    // decisions when available. sim_trades carries no signalId link, so we
    // intentionally avoid fabricating a join — if no AI events are recorded
    // we surface `null` and the operator UI renders a dash (consistent
    // with adminTopTelemetry's "no mocks" rule).
    const confEvents = eventRows.filter(e =>
      typeof e["payload"] === "object" && e["payload"] !== null
      && typeof (e["payload"] as Record<string, unknown>)["confidence"] === "number"
    );
    const avgConf = confEvents.length > 0
      ? confEvents.reduce(
          (s, e) => s + Number((e["payload"] as Record<string, number>)["confidence"]),
          0,
        ) / confEvents.length
      : null;

    // Lightweight API latency aggregate from any event that recorded one.
    const latencyEvents = eventRows.filter(e =>
      typeof e["payload"] === "object" && e["payload"] !== null
      && typeof (e["payload"] as Record<string, unknown>)["latencyMs"] === "number"
    );
    const avgLatencyMs = latencyEvents.length > 0
      ? latencyEvents.reduce(
          (s, e) => s + Number((e["payload"] as Record<string, number>)["latencyMs"]),
          0,
        ) / latencyEvents.length
      : null;

    const errorEvents = eventRows.filter(e => String(e["severity"] ?? "").toLowerCase() === "error");

    // Live trade-limit verdict — uses the shared engine (5s TTL inside).
    let tradeLimit: Awaited<ReturnType<typeof getTradeLimitVerdict>> | null = null;
    try { tradeLimit = await getTradeLimitVerdict(userId); } catch { /* tolerate */ }

    // Aggregates derived in-process so the response is a single self-
    // contained payload the cinematic panel can render without follow-up
    // calls. Math mirrors the per-user numbers in the list endpoint.
    const symbolsForPrices = [...new Set(positionsRows.map(p => String(p["symbol"] ?? "")).filter(Boolean))];
    const priceBySymbol = new Map<string, number>();
    await Promise.all(symbolsForPrices.map(async (symbol) => {
      const price = await getTickerPriceForAdmin(symbol);
      if (price !== null) priceBySymbol.set(symbol, price);
    }));

    const nowForPositions = Date.now();
    const settingsRecord = settingsJson && typeof settingsJson === "object"
      ? settingsJson as Record<string, unknown>
      : {};
    const accountTrailPct = num(settingsRecord["trailingStopPercent"] ?? settingsRecord["trailing_stop_percent"]);
    const accountMaxHoldHours = num(settingsRecord["maxHoldHours"] ?? settingsRecord["max_hold_hours"]) ?? 24;
    const positions: Array<Record<string, unknown>> = positionsRows.map((p): Record<string, unknown> => {
      const symbol       = String(p["symbol"] ?? "");
      const sideRaw      = String(p["side"] ?? "BUY").toUpperCase();
      const isSell       = sideRaw === "SELL" || sideRaw === "SHORT";
      const entryPrice   = num(p["entry_price"]);
      const quantity     = num(p["quantity"]);
      const sizeUsd      = num(p["size_usd"]);
      const entryTime    = num(p["entry_time"]);
      const stopLoss     = num(p["stop_loss"]);
      const takeProfit   = num(p["take_profit"]);
      const confidence   = num(p["confidence"]);
      const currentPrice = priceBySymbol.get(symbol) ?? null;
      const positionId   = String(p["id"] ?? "");

      const unrealizedPnl =
        currentPrice !== null && entryPrice !== null && quantity !== null
          ? (isSell ? entryPrice - currentPrice : currentPrice - entryPrice) * quantity
          : null;
      const currentProfitPct =
        currentPrice !== null && entryPrice !== null && entryPrice > 0
          ? (isSell ? (entryPrice - currentPrice) : (currentPrice - entryPrice)) / entryPrice * 100
          : null;
      const unrealizedPnlPct =
        unrealizedPnl !== null && sizeUsd !== null && sizeUsd > 0
          ? (unrealizedPnl / sizeUsd) * 100
          : currentProfitPct;

      const trailDistancePct = accountTrailPct !== null
        ? accountTrailPct
        : stopLoss !== null && entryPrice !== null && entryPrice > 0
          ? Math.abs(entryPrice - stopLoss) / entryPrice * 100
          : null;
      const excursion = positionId ? getExcursion(positionId) : undefined;
      const peakProfitPct = excursion?.mfePct ?? currentProfitPct;
      const peakProfitUsd = excursion?.mfeUsd ?? unrealizedPnl;
      const peakTimestamp = excursion?.mfeAt ?? null;
      const drawdownFromPeakPct =
        peakProfitPct !== null && currentProfitPct !== null
          ? peakProfitPct - currentProfitPct
          : null;
      const drawdownFromPeakUsd =
        peakProfitUsd !== null && unrealizedPnl !== null
          ? peakProfitUsd - unrealizedPnl
          : null;

      let exitTriggerPrice: number | null = null;
      let exitTriggerProfitPct: number | null = null;
      let trailingActive = false;
      if (
        entryPrice !== null &&
        entryPrice > 0 &&
        peakProfitPct !== null &&
        trailDistancePct !== null &&
        trailDistancePct > 0
      ) {
        const peakPrice = isSell
          ? entryPrice * (1 - Math.max(0, peakProfitPct) / 100)
          : entryPrice * (1 + Math.max(0, peakProfitPct) / 100);
        exitTriggerPrice = isSell
          ? peakPrice * (1 + trailDistancePct / 100)
          : peakPrice * (1 - trailDistancePct / 100);
        trailingActive = isSell ? exitTriggerPrice < entryPrice : exitTriggerPrice > entryPrice;
        exitTriggerProfitPct = (isSell
          ? (entryPrice - exitTriggerPrice) / entryPrice
          : (exitTriggerPrice - entryPrice) / entryPrice) * 100;
      }
      const distanceToExitPct =
        currentPrice !== null && exitTriggerPrice !== null && currentPrice > 0
          ? (isSell ? (exitTriggerPrice - currentPrice) : (currentPrice - exitTriggerPrice)) / currentPrice * 100
          : null;
      const takeProfitTargetPct =
        takeProfit !== null && entryPrice !== null && entryPrice > 0
          ? (isSell ? (entryPrice - takeProfit) : (takeProfit - entryPrice)) / entryPrice * 100
          : null;
      const takeProfitDistancePct =
        takeProfitTargetPct !== null && currentProfitPct !== null
          ? takeProfitTargetPct - currentProfitPct
          : null;
      const stopLossPct =
        stopLoss !== null && entryPrice !== null && entryPrice > 0
          ? (isSell ? (entryPrice - stopLoss) : (stopLoss - entryPrice)) / entryPrice * 100
          : null;
      const stopLossDistancePct =
        stopLossPct !== null && currentProfitPct !== null
          ? currentProfitPct - stopLossPct
          : null;
      const minutesOpen =
        entryTime !== null ? Math.max(0, (nowForPositions - entryTime) / 60_000) : null;
      const maxHoldMinutes = accountMaxHoldHours > 0 ? accountMaxHoldHours * 60 : null;
      const maxHoldRemainingMinutes =
        minutesOpen !== null && maxHoldMinutes !== null
          ? Math.max(0, maxHoldMinutes - minutesOpen)
          : null;

      const tpReached = takeProfitDistancePct !== null && takeProfitDistancePct <= 0;
      const trailTriggered = trailingActive && distanceToExitPct !== null && distanceToExitPct <= 0;
      const stopBreached = stopLossDistancePct !== null && stopLossDistancePct <= 0;
      const maxHoldReached = maxHoldRemainingMinutes !== null && maxHoldRemainingMinutes <= 0;

      const exitCandidates = [
        takeProfitDistancePct !== null && takeProfitDistancePct > 0
          ? { label: "Take Profit", distance: takeProfitDistancePct }
          : null,
        trailingActive && distanceToExitPct !== null && distanceToExitPct > 0
          ? { label: "Trailing Stop", distance: distanceToExitPct }
          : null,
        stopLossDistancePct !== null && stopLossDistancePct > 0
          ? { label: "Stop Loss", distance: stopLossDistancePct }
          : null,
      ].filter((v): v is { label: string; distance: number } => v !== null)
        .sort((a, b) => a.distance - b.distance);

      let exitModeStatus = "MONITORING";
      if (stopBreached) exitModeStatus = "STOP LOSS READY";
      else if (tpReached) exitModeStatus = "TAKE PROFIT READY";
      else if (trailTriggered) exitModeStatus = "TRAILING EXIT READY";
      else if (trailingActive) exitModeStatus = "TRAIL TRACKING";
      else if (maxHoldRemainingMinutes !== null && maxHoldRemainingMinutes <= 30) exitModeStatus = "MAX HOLD WATCH";

      const holdReasons: string[] = [];
      if (!tpReached) holdReasons.push("TP target not reached");
      if (!maxHoldReached) holdReasons.push("Max hold not reached");
      if (!stopBreached) holdReasons.push("Stop loss not breached");
      if (!trailTriggered) holdReasons.push(trailingActive ? "Trailing stop not triggered" : "Trailing stop not armed yet");
      holdReasons.push("Trend/reversal logic has not requested an exit");

      const nextLikelyExit =
        stopBreached ? "Stop Loss" :
        tpReached ? "Take Profit" :
        trailTriggered ? "Trailing Stop" :
        maxHoldReached ? "Max Hold" :
        exitCandidates[0]?.label ??
        (maxHoldRemainingMinutes !== null ? "Max Hold" : "Waiting for price data");

      return {
        ...p,
        current_price: currentPrice,
        unrealized_pnl: round(unrealizedPnl, 4),
        unrealized_pnl_pct: round(unrealizedPnlPct, 4),
        time_open_ms: entryTime !== null ? Math.max(0, nowForPositions - entryTime) : null,
        peak_profit_usd: round(peakProfitUsd, 4),
        peak_profit_pct: round(peakProfitPct, 4),
        peak_profit_at: peakTimestamp,
        drawdown_from_peak_usd: round(drawdownFromPeakUsd, 4),
        drawdown_from_peak_pct: round(drawdownFromPeakPct, 4),
        minutes_open: round(minutesOpen, 2),
        exit_mode_status: exitModeStatus,
        trailing_diagnostics: {
          current_profit_pct: round(currentProfitPct, 4),
          peak_profit_pct: round(peakProfitPct, 4),
          peak_profit_usd: round(peakProfitUsd, 4),
          peak_profit_at: peakTimestamp,
          trail_distance_pct: round(trailDistancePct, 4),
          trailing_active: trailingActive,
          distance_to_exit_pct: round(distanceToExitPct, 4),
          exit_trigger_price: round(exitTriggerPrice, 8),
          exit_trigger_profit_pct: round(exitTriggerProfitPct, 4),
        },
        exit_rules: {
          take_profit: {
            target_pct: round(takeProfitTargetPct, 4),
            current_pct: round(currentProfitPct, 4),
            distance_pct: round(takeProfitDistancePct, 4),
            trigger_price: round(takeProfit, 8),
            status: tpReached ? "READY" : takeProfit === null ? "UNAVAILABLE" : "PENDING",
          },
          trailing_stop: {
            peak_pct: round(peakProfitPct, 4),
            current_pct: round(currentProfitPct, 4),
            trail_distance_pct: round(drawdownFromPeakPct, 4),
            configured_distance_pct: round(trailDistancePct, 4),
            status: trailingActive ? "ARMED" : "NOT_ARMED",
            trigger_price: round(exitTriggerPrice, 8),
            distance_pct: round(distanceToExitPct, 4),
          },
          stop_loss: {
            current_pct: round(currentProfitPct, 4),
            stop_pct: round(stopLossPct, 4),
            distance_pct: round(stopLossDistancePct, 4),
            trigger_price: round(stopLoss, 8),
            status: stopBreached ? "BREACHED" : stopLoss === null ? "UNAVAILABLE" : "SAFE",
          },
          max_hold: {
            minutes_open: round(minutesOpen, 2),
            max_minutes: round(maxHoldMinutes, 2),
            remaining_minutes: round(maxHoldRemainingMinutes, 2),
            status: maxHoldReached ? "READY" : maxHoldMinutes === null ? "DISABLED" : "PENDING",
          },
        },
        ai_decision: {
          reason_holding: holdReasons,
          next_likely_exit: nextLikelyExit,
          confidence: round(confidence, 2),
        },
      };
    });

    const closed = closedRows;
    const tradesCount = closed.length;
    const wins        = closed.filter(t => Number(t["realized_pnl"] ?? 0) > 0).length;
    const losses      = tradesCount - wins;
    const realizedPnl = closed.reduce((s, t) => s + Number(t["realized_pnl"] ?? 0), 0);
    const exposureUsd = positions.reduce((s, p) => s + Number(p["size_usd"] ?? 0), 0);
    const openLive    = positions.filter(p => p["exchange"] != null).length;

    // Frequency = trades / day over the user's lifetime (since created_at).
    const createdMs    = headerRow["created_at"] instanceof Date
      ? headerRow["created_at"].getTime()
      : Number(headerRow["created_at"] ?? Date.now());
    const lifetimeDays = Math.max(1, (Date.now() - createdMs) / (24 * 60 * 60 * 1000));
    const tradesPerDay = tradesCount / lifetimeDays;

    const payload = {
      user: {
        clerkUserId:        headerRow["clerk_user_id"],
        email:              headerRow["email"],
        role:               headerRow["role"],
        plan:               headerRow["plan"],
        planStatus:         headerRow["plan_status"],
        stripeCustomerId:   headerRow["stripe_customer_id"] ?? null,
        stripeSubscriptionId: headerRow["stripe_subscription_id"] ?? null,
        billingEmail:       headerRow["billing_email"] ?? null,
        trialEndsAt:        headerRow["trial_ends_at"] ?? null,
        createdAt:          headerRow["created_at"],
        updatedAt:          headerRow["updated_at"],
        adminStatus:        headerRow["admin_status"],
        adminStatusReason:  headerRow["admin_status_reason"] ?? null,
        adminStatusSince:   headerRow["admin_status_since"] ?? null,
        // ── Billing overrides (super-admin editable surface) ──
        perfFeeBpsOverride:     headerRow["perf_fee_bps_override"] ?? null,
        feeWaiverActive:        Boolean(headerRow["fee_waiver_active"]),
        feeWaiverUntil:         headerRow["fee_waiver_until"] ?? null,
        isComplimentaryAccount: Boolean(headerRow["is_complimentary_account"]),
        isInternalAccount:      Boolean(headerRow["is_internal_account"]),
        revenueShareBps:        Number(headerRow["revenue_share_bps"] ?? 0),
        billingOverrideNotes:   headerRow["billing_override_notes"] ?? null,
      },
      settings:    settingsJson,
      simAccount:  headerRow["sim_account_json"] ?? null,
      positions,
      closedTrades: closed,
      exchangeConnections: connectionsRows,
      auditTrail:  auditRows,
      events:      eventRows,
      apiErrors:   errorEvents,
      tradeLimit,
      aggregates: {
        tradesCount,
        wins,
        losses,
        winRate:       tradesCount > 0 ? wins / tradesCount : null,
        realizedPnl,
        openPositions: positions.length,
        openLivePositions: openLive,
        exposureUsd,
        feesGenerated: Number(headerRow["fees_total"] ?? 0),
        feeRecords:    Number(headerRow["fee_records"] ?? 0),
        profitablePnl: Number(headerRow["profitable_pnl"] ?? 0),
        tradesPerDay,
        lifetimeDays,
        avgConfidence: avgConf,
        avgLatencyMs,
        errorEventCount: errorEvents.length,
      },
      timestamp: Date.now(),
    };

    // No writeCache here — see header comment on this route. Operator
    // control infrastructure must never serve a stale row after a PATCH.
    res.json(payload);
  } catch (err) {
    req.log.error({ err, userId }, "GET /admin/users/:id failed");
    // Operator-only route (requireOperator gate above), so it is safe to
    // surface the underlying error to the response. Render's hosted logs
    // are not reachable from the agent dev loop; passing the message
    // back in the body is how the operator captures the actual cause
    // from their browser DevTools Network tab.
    const e          = err as { message?: unknown; code?: unknown; name?: unknown; stack?: unknown; constructor?: { name?: string } };
    const message    = typeof e?.message === "string" ? e.message : String(err);
    const code       = typeof e?.code    === "string" ? e.code    : undefined;
    const name       = typeof e?.name    === "string" ? e.name    : e?.constructor?.name;
    const stackLine0 = typeof e?.stack   === "string" ? e.stack.split("\n").slice(0, 6).join("\n") : undefined;
    res.status(500).json({
      error:    "Failed to load user detail",
      errorDetail: { message, code, name, stack: stackLine0 },
      userId,
    });
  }
});

// ── GET /admin/platform/leaderboards ─────────────────────────────────────────
router.get("/admin/platform/leaderboards", ...requireOperator, async (req, res): Promise<void> => {
  const key = cacheKey(getAdminId(req), req);
  const cached = readCache(key);
  if (cached !== null) { res.json(cached); return; }

  try {
    const window     = parseWindow(req.query["window"]);
    const startMs    = windowStartMs(window);
    const startTsSec = Math.floor(startMs / 1000); // for performance_fees.created_at filter

    // Per-user aggregates inside the window. All leaderboards derive from
    // this single CTE to keep query count low.
    const aggRows = await db.execute(sql`
      SELECT
        t.user_id                                                   AS user_id,
        u.email                                                      AS email,
        COUNT(*)::int                                                AS trades,
        COUNT(*) FILTER (WHERE t.realized_pnl > 0)::int              AS wins,
        COALESCE(SUM(t.realized_pnl), 0)::float                      AS realized_pnl,
        COALESCE(SUM(t.size_usd), 0)::float                          AS volume_usd,
        COALESCE(SUM(
          COALESCE(t.entry_fee_broker, t.entry_fee, 0)
          + COALESCE(t.exit_fee_broker, t.exit_fee, 0)
        ), 0)::float                                                 AS fees_paid
      FROM sim_trades t
      LEFT JOIN users u ON u.clerk_user_id = t.user_id
      WHERE t.exit_time >= ${startMs}
      GROUP BY t.user_id, u.email
    `).then(r => r.rows as Array<{
      user_id: string; email: string | null; trades: number;
      wins: number; realized_pnl: number; volume_usd: number; fees_paid: number;
    }>);

    const topTraders = [...aggRows]
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 10);

    const mostProfitable = [...aggRows]
      .filter(r => r.realized_pnl > 0)
      .sort((a, b) => b.realized_pnl - a.realized_pnl)
      .slice(0, 10);

    const highestVolume = [...aggRows]
      .sort((a, b) => b.volume_usd - a.volume_usd)
      .slice(0, 10);

    const inDrawdown = [...aggRows]
      .filter(r => r.realized_pnl < 0)
      .sort((a, b) => a.realized_pnl - b.realized_pnl)
      .slice(0, 10);

    // Fee leaderboard is sourced from the performance_fees ledger (the
    // billing-authoritative table), not sim_trades, so the numbers line up
    // with the existing /admin/analytics/fees view.
    const feeRows = await db.execute(sql`
      SELECT
        pf.user_id                                AS user_id,
        u.email                                    AS email,
        COUNT(*)::int                              AS profitable_trades,
        COALESCE(SUM(pf.fee_amount_usd), 0)::float AS fees_generated,
        COALESCE(SUM(pf.realized_pnl), 0)::float   AS realized_pnl
      FROM performance_fees pf
      LEFT JOIN users u ON u.clerk_user_id = pf.user_id
      WHERE pf.created_at >= to_timestamp(${startTsSec})
      GROUP BY pf.user_id, u.email
      ORDER BY fees_generated DESC
      LIMIT 10
    `).then(r => r.rows);

    // Platform totals — collapsed into a single query via scalar subquery.
    const [totalsRow] = await db.execute(sql`
      SELECT
        COALESCE(SUM(size_usd), 0)::float                                          AS total_exposure_usd,
        COALESCE(SUM(CASE WHEN exchange IS NOT NULL THEN size_usd ELSE 0 END),0)::float AS live_capital_deployed_usd,
        COUNT(*)::int                                                              AS open_positions,
        COUNT(*) FILTER (WHERE exchange IS NOT NULL)::int                          AS open_live_positions,
        (
          SELECT COALESCE(SUM(fee_amount_usd), 0)::float
          FROM performance_fees
          WHERE created_at >= to_timestamp(${startTsSec})
        )                                                                          AS platform_fee_revenue_usd
      FROM sim_positions
    `).then(r => r.rows as Array<{
      total_exposure_usd: number; live_capital_deployed_usd: number;
      open_positions: number; open_live_positions: number;
      platform_fee_revenue_usd: number;
    }>);

    const payload = {
      window,
      windowStartMs: startMs,
      topTraders,
      mostProfitable,
      highestVolume,
      inDrawdown,
      feeLeaderboard: feeRows,
      totals: {
        platformFeeRevenueUsd:   totalsRow?.platform_fee_revenue_usd ?? 0,
        totalExposureUsd:        totalsRow?.total_exposure_usd ?? 0,
        liveCapitalDeployedUsd:  totalsRow?.live_capital_deployed_usd ?? 0,
        openPositions:           totalsRow?.open_positions ?? 0,
        openLivePositions:       totalsRow?.open_live_positions ?? 0,
      },
      timestamp: Date.now(),
    };
    writeCache(key, payload);
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "GET /admin/platform/leaderboards failed");
    res.status(500).json({ error: "Failed to load platform leaderboards" });
  }
});

export default router;
