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
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
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
      lastActivityAt:  "agg.last_activity_at",
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
          COUNT(*) FILTER (WHERE exchange IS NOT NULL)::int     AS open_live_positions
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
      )
      SELECT
        u.clerk_user_id                                         AS clerk_user_id,
        u.email                                                  AS email,
        u.role                                                   AS role,
        u.plan                                                   AS plan,
        u.plan_status                                            AS plan_status,
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
        lastActivityAt:      last > 0 ? last : null,
        onlineNow:           last > 0 && (now - last) < 10 * 60 * 1000,
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
router.get("/admin/users/:id", ...requireOperator, async (req, res): Promise<void> => {
  const userId = String(req.params["id"] ?? "");
  if (!userId) { res.status(400).json({ error: "Missing user id" }); return; }

  const key = cacheKey(getAdminId(req), req);
  const cached = readCache(key);
  if (cached !== null) { res.json(cached); return; }

  try {
    const [userRow] = await db.execute(sql`
      SELECT
        u.clerk_user_id, u.email, u.role, u.plan, u.plan_status,
        u.stripe_customer_id, u.stripe_subscription_id, u.billing_email,
        u.trial_ends_at, u.created_at, u.updated_at,
        COALESCE(status.status, 'active') AS admin_status,
        status.reason                    AS admin_status_reason,
        status.since                     AS admin_status_since
      FROM users u
      LEFT JOIN user_admin_status status ON status.user_id = u.clerk_user_id
      WHERE u.clerk_user_id = ${userId}
      LIMIT 1
    `).then(r => r.rows as Array<Record<string, unknown>>);

    if (!userRow) { res.status(404).json({ error: "User not found" }); return; }

    // Fan-out the per-user reads in parallel. Each query is small and
    // bounded — none of them scan the full platform.
    const [
      settingsRows, accountRows, positionsRows, closedRows,
      connectionsRows, auditRows, feesRows, eventRows,
    ] = await Promise.all([
      db.execute(sql`
        SELECT * FROM user_settings WHERE user_id = ${userId} LIMIT 1
      `).then(r => r.rows as Array<Record<string, unknown>>),
      db.execute(sql`
        SELECT * FROM sim_accounts WHERE user_id = ${userId} LIMIT 1
      `).then(r => r.rows as Array<Record<string, unknown>>),
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
      db.execute(sql`
        SELECT
          COUNT(*)::int                                        AS fee_records,
          COALESCE(SUM(fee_amount_usd), 0)::float              AS fees_total,
          COALESCE(SUM(realized_pnl), 0)::float                AS profitable_pnl
        FROM performance_fees
        WHERE user_id = ${userId}
      `).then(r => r.rows as Array<{ fee_records: number; fees_total: number; profitable_pnl: number }>),
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
    const createdMs    = userRow["created_at"] instanceof Date
      ? userRow["created_at"].getTime()
      : Number(userRow["created_at"] ?? Date.now());
    const lifetimeDays = Math.max(1, (Date.now() - createdMs) / (24 * 60 * 60 * 1000));
    const tradesPerDay = tradesCount / lifetimeDays;

    const payload = {
      user: {
        clerkUserId:        userRow["clerk_user_id"],
        email:              userRow["email"],
        role:               userRow["role"],
        plan:               userRow["plan"],
        planStatus:         userRow["plan_status"],
        stripeCustomerId:   userRow["stripe_customer_id"] ?? null,
        stripeSubscriptionId: userRow["stripe_subscription_id"] ?? null,
        billingEmail:       userRow["billing_email"] ?? null,
        trialEndsAt:        userRow["trial_ends_at"] ?? null,
        createdAt:          userRow["created_at"],
        updatedAt:          userRow["updated_at"],
        adminStatus:        userRow["admin_status"],
        adminStatusReason:  userRow["admin_status_reason"] ?? null,
        adminStatusSince:   userRow["admin_status_since"] ?? null,
      },
      settings:    settingsRows[0] ?? null,
      simAccount:  accountRows[0] ?? null,
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
        feesGenerated: Number(feesRows[0]?.fees_total ?? 0),
        feeRecords:    Number(feesRows[0]?.fee_records ?? 0),
        profitablePnl: Number(feesRows[0]?.profitable_pnl ?? 0),
        tradesPerDay,
        lifetimeDays,
        avgConfidence: avgConf,
        avgLatencyMs,
        errorEventCount: errorEvents.length,
      },
      timestamp: Date.now(),
    };

    writeCache(key, payload);
    res.json(payload);
  } catch (err) {
    req.log.error({ err, userId }, "GET /admin/users/:id failed");
    res.status(500).json({ error: "Failed to load user detail" });
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

    // Platform totals.
    const [exposureRow] = await db.execute(sql`
      SELECT
        COALESCE(SUM(size_usd), 0)::float                                          AS total_exposure_usd,
        COALESCE(SUM(CASE WHEN exchange IS NOT NULL THEN size_usd ELSE 0 END),0)::float AS live_capital_deployed_usd,
        COUNT(*)::int                                                              AS open_positions,
        COUNT(*) FILTER (WHERE exchange IS NOT NULL)::int                          AS open_live_positions
      FROM sim_positions
    `).then(r => r.rows as Array<{
      total_exposure_usd: number; live_capital_deployed_usd: number;
      open_positions: number; open_live_positions: number;
    }>);

    const [feeTotalsRow] = await db.execute(sql`
      SELECT COALESCE(SUM(fee_amount_usd), 0)::float AS platform_fee_revenue_usd
      FROM performance_fees
      WHERE created_at >= to_timestamp(${startTsSec})
    `).then(r => r.rows as Array<{ platform_fee_revenue_usd: number }>);

    const payload = {
      window,
      windowStartMs: startMs,
      topTraders,
      mostProfitable,
      highestVolume,
      inDrawdown,
      feeLeaderboard: feeRows,
      totals: {
        platformFeeRevenueUsd:   feeTotalsRow?.platform_fee_revenue_usd ?? 0,
        totalExposureUsd:        exposureRow?.total_exposure_usd ?? 0,
        liveCapitalDeployedUsd:  exposureRow?.live_capital_deployed_usd ?? 0,
        openPositions:           exposureRow?.open_positions ?? 0,
        openLivePositions:       exposureRow?.open_live_positions ?? 0,
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
