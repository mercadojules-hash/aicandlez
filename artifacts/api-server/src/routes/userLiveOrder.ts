/**
 * POST /api/user/live-order — manual customer-triggered live order.
 *
 * Customer-facing wrapper around `placeLiveAutoOrderForUser`. Used by the
 * Portal SignalRow BUY/SELL pills when the per-user LIVE mode toggle is
 * engaged. Free tier and missing-connection cases are rejected; the client
 * is expected to fall back to PAPER and surface a one-shot toast.
 *
 * Admins never call this endpoint — their /portal is admin-only and uses
 * server-side env Kraken keys via /api/exchange/order/execute (operator-only).
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requirePlan } from "../middlewares/requirePlan.js";
import { placeLiveAutoOrderForUser } from "../lib/liveUserExecution.js";
import { registerLiveUserFill } from "../lib/userSimRegistry.js";

const router: IRouter = Router();

// Per-tier risk policy cap on a single manual-LIVE order. Operators (admin /
// super-admin) bypass these caps entirely; the hard ceiling for any path
// remains the 100_000 schema validation in parseBody.
const TIER_MAX_SIZE_USD: Record<string, number> = {
  free:       0,
  starter:    500,
  pro:        2500,
  enterprise: 100_000,
};
const DEFAULT_SIZE_USD = 100;

function parseBody(raw: unknown): { symbol: string; side: "BUY" | "SELL"; sizeUSD?: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const symbol = typeof b.symbol === "string" ? b.symbol.trim() : "";
  const side   = b.side;
  if (symbol.length < 2 || symbol.length > 20) return null;
  if (side !== "BUY" && side !== "SELL") return null;
  let sizeUSD: number | undefined;
  if (b.sizeUSD != null) {
    const n = Number(b.sizeUSD);
    if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null;
    sizeUSD = n;
  }
  return { symbol, side, sizeUSD };
}

router.post(
  "/user/live-order",
  requireAuth,
  requirePlan("starter"),
  async (req, res): Promise<void> => {
    const parsed = parseBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const userId = (req as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Per-tier risk cap. Customers may pick their own per-trade size in the
    // Portal SignalRow size picker; the request body carries the chosen
    // sizeUSD. We enforce the tier cap server-side regardless — the client
    // hint is advisory. Default to $100 when the client omits the field
    // (legacy callers / paranoid fallback).
    const requestedSize = parsed.sizeUSD ?? DEFAULT_SIZE_USD;
    let tierCap = TIER_MAX_SIZE_USD.starter ?? 500;
    try {
      const [u] = await db
        .select({ plan: usersTable.plan, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, userId))
        .limit(1);
      if (u?.role === "admin" || u?.role === "super-admin") {
        tierCap = 100_000;
      } else {
        tierCap = TIER_MAX_SIZE_USD[u?.plan ?? "free"] ?? 0;
      }
    } catch (err) {
      req.log.warn(
        { userId, err: err instanceof Error ? err.message : String(err) },
        "userLiveOrder: tier lookup failed — falling back to starter cap",
      );
    }

    if (requestedSize > tierCap) {
      res.status(409).json({
        ok:        false,
        errorCode: "SIZE_EXCEEDS_TIER_CAP",
        error:     `Order size $${requestedSize} exceeds your plan's per-trade cap of $${tierCap}`,
        tierCap,
      });
      return;
    }
    const sizeUSD = requestedSize;

    try {
      const result = await placeLiveAutoOrderForUser({
        userId,
        symbol:  parsed.symbol,
        side:    parsed.side,
        sizeUSD,
      });

      if (!result.success) {
        req.log.warn(
          { userId, symbol: parsed.symbol, side: parsed.side, errorCode: result.errorCode, error: result.error },
          "userLiveOrder: placement failed",
        );
        res.status(409).json({
          ok:        false,
          errorCode: result.errorCode,
          error:     result.error,
        });
        return;
      }

      // Mirror the live fill into the user's sim registry (cache + DB) so the
      // position appears immediately in the customer's portal panels
      // (`/api/simulation/account`, `/api/simulation/trades`) with `exchange`
      // populated → Trade History/Active Trades render the LIVE chip.
      // SL/TP defaults mirror SignalRow's PAPER fallback (2% / 4.5%).
      try {
        const entry = result.fillPrice ?? 0;
        const qty   = result.quantity  ?? (entry > 0 ? sizeUSD / entry : 0);
        if (entry > 0 && qty > 0) {
          const SL_PCT = 2;
          const TP_PCT = 4.5;
          const sl = parsed.side === "BUY"
            ? entry * (1 - SL_PCT / 100)
            : entry * (1 + SL_PCT / 100);
          const tp = parsed.side === "BUY"
            ? entry * (1 + TP_PCT / 100)
            : entry * (1 - TP_PCT / 100);
          await registerLiveUserFill({
            userId,
            symbol:                 parsed.symbol,
            side:                   parsed.side,
            quantity:               qty,
            entryPrice:             entry,
            sizeUSD,
            stopLoss:               parseFloat(sl.toFixed(2)),
            takeProfit:             parseFloat(tp.toFixed(2)),
            exchange:               result.exchange ?? "unknown",
            exchangeOrderId:        result.exchangeOrderId
                                    ?? `LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            entryFeeBroker:         result.brokerFee,
            entryFeeBrokerCurrency: result.brokerFeeCurrency,
          });
        }
      } catch (mirrorErr) {
        // Mirror failure is non-fatal — the broker order is still placed.
        req.log.warn(
          { userId, symbol: parsed.symbol, err: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr) },
          "userLiveOrder: registerLiveUserFill failed (broker fill still placed)",
        );
      }

      res.json({
        ok:              true,
        exchange:        result.exchange,
        exchangeOrderId: result.exchangeOrderId,
        fillPrice:       result.fillPrice,
        quantity:        result.quantity,
        dryRun:          result.dryRun ?? false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.error({ userId, err: msg }, "userLiveOrder: unexpected error");
      res.status(500).json({ ok: false, error: msg });
    }
  },
);

export default router;
