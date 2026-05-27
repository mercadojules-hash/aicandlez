import { Router } from "express";
import { db, userExchangeConnectionsTable, userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { loadBalanceForRow, type BalanceConnection } from "./userExchanges.js";
import { logger } from "../lib/logger.js";
import type { Request } from "express";

// ── GET /api/user/runtime-state ───────────────────────────────────────────────
//
// Task #198 (spec + foundation). Read-only aggregator that returns the
// customer's CustomerTradingRuntimeContext shape from the server's
// point of view. NO MUTATIONS.
//
// Computed from:
//   - user_exchange_connections (all rows for this user)
//   - user_settings.activeRuntimeExchange
//   - one per-row balance poll round-trip via Task #197's
//     loadBalanceForRow (so the same telemetry columns are advanced;
//     we never introduce a parallel balance fetcher).
//
// Auto-promotion rule (when activeRuntimeExchange IS NULL):
//   - exactly ONE active connection with a healthy live balance
//     → mode = "live", activeExchange = that exchange's id
//   - otherwise
//     → mode = "paper", activeExchange = null
//
// Explicit user override semantics:
//   - activeRuntimeExchange = "paper"
//     → mode = "paper" regardless of connection state (user opt-out)
//   - activeRuntimeExchange = "<exchange id>"
//     → mode = "live" iff that exchange's row exists AND status=="active"
//       AND its current balance poll ok=true
//     → otherwise mode = "paper", liveReady=false,
//       exchangeConnectionState reports the failure reason
//
// liveReady = mode === "live" && activeExchange has ok-balance AND
//             the row is status="active". It is the precondition that
//             the future ARM gate (Task #200, errorCode
//             "runtime_not_armed") consumes. Real-money execution is
//             still independently gated by the env flag
//             CUSTOMER_LIVE_EXECUTION_ENABLED — this endpoint never
//             bypasses that.
//
// Admin path: untouched. This route is gated only by requireAuth — it
// returns the same shape for an admin caller, but the customer portal
// shell is the only consumer Task #199 will wire up. The admin
// `/admintrade./command` shell remains byte-identical (does not mount
// this hook).

const router = Router();
type AuthReq = Request & { clerkUserId: string };

type RuntimeMode = "paper" | "live";

interface ExchangeConnectionState {
  exchange:               string;
  label:                  string | null;
  status:                 string;           // "active" | "error" | "revoked"
  ok:                     boolean;          // balance poll succeeded just now
  error:                  string | null;
  lastBalanceFetchAt:     Date | null;
  lastBalanceFetchError:  string | null;
  totalEquityUSD:         number;
}

interface CustomerTradingRuntimeContext {
  mode:                   RuntimeMode;
  activeExchange:         string | null;
  connectedExchanges:     ExchangeConnectionState[];
  totalEquityUSD:         number;
  liveReady:              boolean;
  activeRuntimeExchange:  string | null;    // raw stored preference
  autoPromoted:           boolean;          // true iff stored=null AND we auto-resolved to live
  fetchedAt:              number;
}

function shapeConnection(
  row: typeof userExchangeConnectionsTable.$inferSelect,
  snapshot: BalanceConnection,
): ExchangeConnectionState {
  return {
    exchange:              row.exchange,
    label:                 row.label,
    status:                row.status,
    ok:                    snapshot.ok,
    error:                 snapshot.error ?? null,
    lastBalanceFetchAt:    row.lastBalanceFetchAt,
    lastBalanceFetchError: row.lastBalanceFetchError,
    totalEquityUSD:        snapshot.ok ? snapshot.totalEquityUSD : 0,
  };
}

router.get("/user/runtime-state", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const t0     = Date.now();
  try {
    const [settingsRow] = await db
      .select({ activeRuntimeExchange: userSettingsTable.activeRuntimeExchange })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    const activeRuntimeExchange: string | null = settingsRow?.activeRuntimeExchange ?? null;

    const rows = await db
      .select()
      .from(userExchangeConnectionsTable)
      .where(eq(userExchangeConnectionsTable.userId, userId));

    // Reuse Task #197's hydration path. One poll per row; failures
    // degrade per-connection (loadBalanceForRow returns ok=false with
    // an error field — it never throws here).
    // Task #205 — per-exchange observability. Wrap each row's balance
    // poll so we emit a structured [RUNTIME_BALANCE_REFRESH] /
    // [RUNTIME_BALANCE_FAILED] log carrying { userId, exchange,
    // adapter, equityUsd, healthy, latencyMs }. The aggregate
    // [RUNTIME_HYDRATED] line below still summarizes the whole
    // request; these per-row lines let us trace "which adapter
    // produced what equity for which user" without re-deriving from
    // upstream DB columns.
    const snapshots = await Promise.all(rows.map(async (r) => {
      const t1 = Date.now();
      const snap = await loadBalanceForRow(userId, r);
      const latencyMs = Date.now() - t1;
      if (snap.ok) {
        logger.info({
          tag:       "RUNTIME_BALANCE_REFRESH",
          userId,
          exchange:  r.exchange,
          adapter:   r.exchange,
          equityUsd: snap.totalEquityUSD,
          healthy:   true,
          latencyMs,
        }, "[RUNTIME_BALANCE_REFRESH] per-exchange poll ok");
      } else {
        logger.warn({
          tag:       "RUNTIME_BALANCE_FAILED",
          userId,
          exchange:  r.exchange,
          adapter:   r.exchange,
          equityUsd: 0,
          healthy:   false,
          error:     snap.error ?? null,
          latencyMs,
        }, "[RUNTIME_BALANCE_FAILED] per-exchange poll failed");
      }
      return snap;
    }));
    const connectedExchanges = rows.map((r, i) => shapeConnection(r, snapshots[i]!));

    const totalEquityUSD = connectedExchanges
      .filter(c => c.ok)
      .reduce((sum, c) => sum + (Number.isFinite(c.totalEquityUSD) ? c.totalEquityUSD : 0), 0);

    const healthyLive = connectedExchanges.filter(c => c.status === "active" && c.ok);

    let mode: RuntimeMode      = "paper";
    let activeExchange: string | null = null;
    let autoPromoted           = false;

    if (activeRuntimeExchange === "paper") {
      mode = "paper";
      activeExchange = null;
    } else if (activeRuntimeExchange && activeRuntimeExchange !== "paper") {
      const pinned = healthyLive.find(c => c.exchange === activeRuntimeExchange);
      if (pinned) {
        mode = "live";
        activeExchange = pinned.exchange;
      } else {
        mode = "paper";
        activeExchange = null;
      }
    } else {
      // No explicit choice — apply auto-promotion rule.
      if (healthyLive.length === 1) {
        mode = "live";
        activeExchange = healthyLive[0]!.exchange;
        autoPromoted = true;
      }
    }

    const liveReady = mode === "live" && activeExchange !== null;

    const payload: CustomerTradingRuntimeContext = {
      mode,
      activeExchange,
      connectedExchanges,
      totalEquityUSD,
      liveReady,
      activeRuntimeExchange,
      autoPromoted,
      fetchedAt: Date.now(),
    };

    logger.info({
      tag:             "RUNTIME_HYDRATED",
      userId,
      mode,
      activeExchange,
      runtime:         mode === "live" ? (activeExchange ?? "paper") : "paper",
      equityUsd:       totalEquityUSD,
      healthy:         liveReady,
      connectionCount: connectedExchanges.length,
      healthyLive:     healthyLive.length,
      autoPromoted,
      liveReady,
      latencyMs:       Date.now() - t0,
    }, "[RUNTIME_HYDRATED] aggregator ok");

    res.json(payload);
  } catch (err) {
    req.log.error({ err, userId }, "GET /user/runtime-state failed");
    res.status(500).json({ error: "Failed to load runtime state" });
  }
});

export default router;
export type { CustomerTradingRuntimeContext, ExchangeConnectionState, RuntimeMode };
