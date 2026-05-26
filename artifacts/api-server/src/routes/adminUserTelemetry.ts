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
import { db, userSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { getTradeLimitVerdict } from "../lib/tradeLimitEngine.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

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
        COALESCE(tl.cap_tier, 50)                                AS trade_cap_tier,
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

    // "Online" heuristic — last activity within 10 min. Cheap and DB-derivable.
    const now = Date.now();
    const users = rows.map((r) => {
      const last = Number(r["last_activity_at"] ?? 0);
      const lastTrade = r["last_trade_ms"] == null ? null : Number(r["last_trade_ms"]);
      return {
        clerkUserId:         String(r["clerk_user_id"]),
        email:               String(r["email"]),
        role:                String(r["role"]),
        plan:                String(r["plan"]),
        planStatus:          String(r["plan_status"]),
        trialEndsAt:         r["trial_ends_at"] == null ? null : new Date(String(r["trial_ends_at"])).toISOString(),
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
        tradeCapTier:        Number(r["trade_cap_tier"] ?? 50),
        tradesToday:         Number(r["trades_today"] ?? 0),
        equityUsd:           Number(r["cash_balance"] ?? 0),
        // Trade-limit engine-equivalent telemetry, derived in-SQL so the
        // list endpoint never N+1s the engine per row.
        tradeLimit: (() => {
          const cap = Number(r["trade_cap_tier"] ?? 50);
          const used = Number(r["used_24h"] ?? 0);
          const override = r["trade_cap_override_expires_at"];
          const effectiveCap = cap === -1 ? -1
            : (override && new Date(String(override)).getTime() < now) ? 50
            : cap;
          const remaining = effectiveCap === -1
            ? Number.POSITIVE_INFINITY
            : Math.max(0, effectiveCap - used);
          const blocked = effectiveCap !== -1 && used >= effectiveCap;
          return {
            used24h:   used,
            capTier:   effectiveCap,
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
    });

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
    writeCache(key, payload);
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "GET /admin/users failed");
    res.status(500).json({ error: "Failed to load users" });
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
          'autoMode',                   s.auto_mode,
          'tradingMode',                s.trading_mode,
          'volumeFilter',               s.volume_filter,
          'require1HTrend',             s.require_1h_trend,
          'preferredExchange',          s.preferred_exchange,
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
    const closed = closedRows;
    const tradesCount = closed.length;
    const wins        = closed.filter(t => Number(t["realized_pnl"] ?? 0) > 0).length;
    const losses      = tradesCount - wins;
    const realizedPnl = closed.reduce((s, t) => s + Number(t["realized_pnl"] ?? 0), 0);
    const positions   = positionsRows;
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
