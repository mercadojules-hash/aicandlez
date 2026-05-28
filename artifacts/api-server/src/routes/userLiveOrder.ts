/**
 * POST /api/user/live-order — manual customer-triggered live order.
 *
 * Customer-facing wrapper around `placeLiveAutoOrderForUser`. Used by the
 * Portal SignalRow BUY/SELL pills when the per-user LIVE mode toggle is
 * engaged. Free tier and missing-connection cases are rejected; the client
 * is expected to fall back to PAPER and surface a one-shot toast.
 *
 * Phase 4 (Task #209) — accepts `X-Correlation-Id` from the client (or
 * mints one) and threads it through every downstream telemetry row +
 * echoes it back in the response header so the client log chain stays
 * linked end-to-end.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isCustomerLiveExecutionEnabled } from "../lib/liveUserExecution.js";
import { executeCustomerOrder } from "../lib/executionGateway.js";
import { registerLiveUserFill } from "../lib/userSimRegistry.js";
import { TIER_MAX_SIZE_USD, type TierPlan } from "../lib/tierLimits.js";
import { getSupportedExchanges, UnsupportedSymbolError } from "../lib/marketData.js";
import { emit as emitTelemetry, genCorrelationId, rememberCorrelation } from "../lib/executionTelemetry.js";

type Plan = TierPlan;
const PLAN_RANK: Record<Plan, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

const router: IRouter = Router();

const DEFAULT_SIZE_USD = 100;

function parseBody(raw: unknown): { symbol: string; side: "BUY" | "SELL"; sizeUSD?: number; useSandbox: boolean } | null {
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
  const useSandbox = b.useSandbox === true;
  return { symbol, side, sizeUSD, useSandbox };
}

router.post(
  "/user/live-order",
  requireAuth,
  async (req, res): Promise<void> => {
    // ── Phase 4 correlationId resolution ───────────────────────────────
    // Accept client-minted UUID via X-Correlation-Id; fall back to a
    // freshly minted one. Echo back as both response header and JSON
    // field so the client can stamp its [MANUAL_TRADE_EXECUTED] /
    // [MANUAL_TRADE_REJECTED] logs with the same id and on-call can
    // grep one id across the full funnel.
    const headerId = req.get("X-Correlation-Id");
    const correlationId = headerId && headerId.length >= 8 && headerId.length <= 64
      ? headerId
      : genCorrelationId();
    res.setHeader("X-Correlation-Id", correlationId);
    const acceptedAt = Date.now();

    const parsed = parseBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: "Invalid request body", correlationId });
      return;
    }

    const userId = (req as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized", correlationId });
      return;
    }

    const requestedSize = parsed.sizeUSD ?? DEFAULT_SIZE_USD;
    let userPlan: Plan = "free";
    let isOperator = false;
    try {
      const [u] = await db
        .select({ plan: usersTable.plan, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, userId))
        .limit(1);
      isOperator = u?.role === "admin" || u?.role === "super-admin";
      userPlan   = (u?.plan ?? "free") as Plan;
    } catch (err) {
      req.log.warn(
        { userId, correlationId, err: err instanceof Error ? err.message : String(err) },
        "userLiveOrder: tier lookup failed — falling back to free plan",
      );
    }

    const runtimeMode = parsed.useSandbox ? "sandbox" : "live";

    // [MANUAL_TRADE_REQUEST] — Phase 4 canonical row. Server-stamped on
    // receipt even when the client also emits one (the client emit lives
    // in the browser console; the server emit lives in pino).
    emitTelemetry({
      tag:               "MANUAL_TRADE_REQUEST",
      correlationId,
      userId,
      symbol:            parsed.symbol,
      normalizedSymbol:  parsed.symbol,
      exchange:          null,
      runtimeMode,
      persistenceResult: "pending",
      positionId:        null,
      latencyMs:         0,
      trigger:           "manual",
      side:              parsed.side,
      sizeUSD:           requestedSize,
      isOperator,
      userPlan,
    });

    if (!isOperator && !isCustomerLiveExecutionEnabled()) {
      emitTelemetry({
        tag:               "EXECUTION_REJECTED",
        correlationId,
        userId,
        symbol:            parsed.symbol,
        normalizedSymbol:  parsed.symbol,
        exchange:          null,
        runtimeMode,
        persistenceResult: "skipped",
        positionId:        null,
        latencyMs:         Date.now() - acceptedAt,
        rejectionReason:   "customer_live_execution_disabled",
        trigger:           "manual",
        side:              parsed.side,
        sizeUSD:           requestedSize,
      });
      res.status(403).json({
        ok:        false,
        errorCode: "customer_live_execution_disabled",
        error:     "Live execution is operated by AICandlez and is not available from the customer portal.",
        correlationId,
      });
      return;
    }

    if (!parsed.useSandbox) {
      if (!isOperator && (PLAN_RANK[userPlan] ?? 0) < PLAN_RANK.starter) {
        emitTelemetry({
          tag:               "EXECUTION_REJECTED",
          correlationId,
          userId,
          symbol:            parsed.symbol,
          normalizedSymbol:  parsed.symbol,
          exchange:          null,
          runtimeMode,
          persistenceResult: "skipped",
          positionId:        null,
          latencyMs:         Date.now() - acceptedAt,
          rejectionReason:   "MEMBERSHIP_REQUIRED",
          trigger:           "manual",
          side:              parsed.side,
          sizeUSD:           requestedSize,
        });
        res.status(402).json({
          ok:           false,
          errorCode:    "MEMBERSHIP_REQUIRED",
          error:        "Live exchange execution requires a paid plan",
          currentPlan:  userPlan,
          requiredPlan: "starter",
          upgradeUrl:   "/subscribe",
          correlationId,
        });
        return;
      }
      const tierCap = isOperator
        ? 100_000
        : (TIER_MAX_SIZE_USD[userPlan] ?? 0);
      if (requestedSize > tierCap) {
        emitTelemetry({
          tag:               "EXECUTION_REJECTED",
          correlationId,
          userId,
          symbol:            parsed.symbol,
          normalizedSymbol:  parsed.symbol,
          exchange:          null,
          runtimeMode,
          persistenceResult: "skipped",
          positionId:        null,
          latencyMs:         Date.now() - acceptedAt,
          rejectionReason:   "SIZE_EXCEEDS_TIER_CAP",
          trigger:           "manual",
          side:              parsed.side,
          sizeUSD:           requestedSize,
          tierCap,
        });
        res.status(409).json({
          ok:        false,
          errorCode: "SIZE_EXCEEDS_TIER_CAP",
          error:     `Order size $${requestedSize} exceeds your plan's per-trade cap of $${tierCap}`,
          tierCap,
          correlationId,
        });
        return;
      }
    }
    const sizeUSD = requestedSize;

    // [MANUAL_TRADE_NORMALIZED] — emitted after body parse + plan/cap
    // gates pass and just before we hand off to the gateway. The symbol
    // is already engine-native ("BTCUSD") from the client — adapter-
    // specific normalization happens deeper inside placeLiveAutoOrderForUser
    // but the request-time view of normalizedSymbol is the engine form.
    emitTelemetry({
      tag:               "MANUAL_TRADE_NORMALIZED",
      correlationId,
      userId,
      symbol:            parsed.symbol,
      normalizedSymbol:  parsed.symbol,
      exchange:          null,
      runtimeMode,
      persistenceResult: "pending",
      positionId:        null,
      latencyMs:         Date.now() - acceptedAt,
      trigger:           "manual",
      side:              parsed.side,
      sizeUSD,
    });

    try {
      const result = await executeCustomerOrder({
        trigger:       "manual",
        userId,
        symbol:        parsed.symbol,
        side:          parsed.side,
        sizeUSD,
        useSandbox:    parsed.useSandbox,
        correlationId,
      });

      if (!result.success) {
        // Gateway already emitted [EXECUTION_REJECTED]; route handler
        // doesn't re-emit. Echo correlationId in the response body so the
        // client can correlate the toast back to the funnel.
        const status = result.errorCode === "unsupported_symbol" ? 400 : 409;
        res.status(status).json({
          ok:                 false,
          errorCode:          result.errorCode,
          error:              result.error,
          exchange:           result.exchange,
          supportedExchanges: result.errorCode === "unsupported_symbol"
            ? getSupportedExchanges(parsed.symbol)
            : undefined,
          correlationId,
        });
        return;
      }

      let persistenceResult: "persisted" | "failed" | "skipped" = "persisted";
      let mirroredPositionId: string | null = null;

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
          const orderId = result.exchangeOrderId
            ?? `LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const pos = await registerLiveUserFill({
            userId,
            symbol:                 parsed.symbol,
            side:                   parsed.side,
            quantity:               qty,
            entryPrice:             entry,
            sizeUSD,
            stopLoss:               parseFloat(sl.toFixed(2)),
            takeProfit:             parseFloat(tp.toFixed(2)),
            exchange:               result.exchange ?? "unknown",
            exchangeOrderId:        orderId,
            entryFeeBroker:         result.brokerFee,
            entryFeeBrokerCurrency: result.brokerFeeCurrency,
            sandbox:                parsed.useSandbox,
          });
          mirroredPositionId = pos?.id ?? orderId;
        }
      } catch (mirrorErr) {
        persistenceResult = "failed";
        req.log.warn(
          {
            correlationId,
            userId,
            err: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
          },
          "userLiveOrder: registerLiveUserFill failed (broker fill still placed)",
        );
      }

      // [POSITION_PERSISTED] — canonical Phase 4 row after the legacy
      // mirror completes. persistenceResult reflects the actual outcome
      // ("persisted" | "failed"); LIVE_TRADES_HYDRATED already fired
      // from `notifyFillExecuted` inside the gateway. Remember the
      // positionId→correlationId mapping so the eventual close emit
      // (loop-driven, no upstream id) can preserve the chain.
      if (persistenceResult === "persisted") {
        rememberCorrelation(mirroredPositionId, correlationId);
        rememberCorrelation(result.exchangeOrderId ?? null, correlationId);
      }
      emitTelemetry({
        tag:               "POSITION_PERSISTED",
        correlationId,
        userId,
        symbol:            parsed.symbol,
        normalizedSymbol:  parsed.symbol,
        exchange:          result.exchange ?? null,
        runtimeMode,
        persistenceResult,
        positionId:        mirroredPositionId ?? result.exchangeOrderId ?? null,
        latencyMs:         Date.now() - acceptedAt,
        trigger:           "manual",
        side:              parsed.side,
        sizeUSD,
        fillPrice:         result.fillPrice ?? null,
      });

      res.json({
        ok:              true,
        exchange:        result.exchange,
        exchangeOrderId: result.exchangeOrderId,
        fillPrice:       result.fillPrice,
        quantity:        result.quantity,
        dryRun:          result.dryRun ?? false,
        correlationId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isUnsupported =
        err instanceof UnsupportedSymbolError ||
        /^Unsupported symbol:/.test(msg);
      emitTelemetry({
        tag:               "EXECUTION_REJECTED",
        correlationId,
        userId,
        symbol:            parsed.symbol,
        normalizedSymbol:  parsed.symbol,
        exchange:          null,
        runtimeMode,
        persistenceResult: "skipped",
        positionId:        null,
        latencyMs:         Date.now() - acceptedAt,
        rejectionReason:   isUnsupported ? "unsupported_symbol" : "internal_error",
        trigger:           "manual",
        side:              parsed.side,
        sizeUSD,
        error:             msg,
      });
      res.status(isUnsupported ? 400 : 500).json({
        ok:                 false,
        errorCode:          isUnsupported ? "unsupported_symbol" : "internal_error",
        error:              msg,
        supportedExchanges: isUnsupported
          ? getSupportedExchanges(parsed.symbol)
          : undefined,
        correlationId,
      });
    }
  },
);

export default router;
