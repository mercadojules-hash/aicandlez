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
import { isCustomerLiveExecutionEnabled } from "../lib/liveUserExecution.js";
import { executeCustomerOrder } from "../lib/executionGateway.js";
import { registerLiveUserFill } from "../lib/userSimRegistry.js";
import { TIER_MAX_SIZE_USD, type TierPlan } from "../lib/tierLimits.js";
import { getSupportedExchanges, UnsupportedSymbolError } from "../lib/marketData.js";

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
    //
    // Sandbox / testnet flow: when `useSandbox` is true, the order routes
    // through the exchange's public testnet (no real money). We still
    // require an exchange that supports a sandbox host (`hasSandbox`) and
    // an authenticated user — but we bypass the plan paywall and the
    // per-tier sizeUSD ceiling, since sandbox is the paper-trading path.
    // The 100_000 schema cap in parseBody remains the absolute ceiling.
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
        { userId, err: err instanceof Error ? err.message : String(err) },
        "userLiveOrder: tier lookup failed — falling back to free plan",
      );
    }

    // Customer-portal live-execution kill switch (Task #157). Non-admin
    // callers are hard-rejected unless the global flag is explicitly
    // re-enabled via env. Same gate as `placeLiveAutoOrderForUser` —
    // duplicated here so we don't even hit the tier-cap branch from a
    // leaked client. Sandbox calls are blocked too (still hit broker net).
    if (!isOperator && !isCustomerLiveExecutionEnabled()) {
      req.log.warn(
        { userId, symbol: parsed.symbol, side: parsed.side },
        "userLiveOrder: rejected — customer_live_execution_disabled",
      );
      res.status(403).json({
        ok:        false,
        errorCode: "customer_live_execution_disabled",
        error:     "Live execution is operated by AICandlez and is not available from the customer portal.",
      });
      return;
    }

    if (!parsed.useSandbox) {
      // Real-money path → enforce plan gate + tier cap.
      if (!isOperator && (PLAN_RANK[userPlan] ?? 0) < PLAN_RANK.starter) {
        res.status(402).json({
          ok:           false,
          errorCode:    "MEMBERSHIP_REQUIRED",
          error:        "Live exchange execution requires a paid plan",
          currentPlan:  userPlan,
          requiredPlan: "starter",
          upgradeUrl:   "/subscribe",
        });
        return;
      }
      const tierCap = isOperator
        ? 100_000
        : (TIER_MAX_SIZE_USD[userPlan] ?? 0);
      if (requestedSize > tierCap) {
        res.status(409).json({
          ok:        false,
          errorCode: "SIZE_EXCEEDS_TIER_CAP",
          error:     `Order size $${requestedSize} exceeds your plan's per-trade cap of $${tierCap}`,
          tierCap,
        });
        return;
      }
    }
    const sizeUSD = requestedSize;

    // [MANUAL_TRADE_REQUEST] — structured request log so on-call can
    // grep one tag across the manual-BUY funnel + correlate against
    // [MANUAL_TRADE_EXECUTED]/[MANUAL_TRADE_REJECTED] for the same
    // request. `runtime` is "live" or "sandbox"; the actual exchange
    // is unknown until `placeLiveAutoOrderForUser` resolves it.
    req.log.info(
      {
        tag:               "MANUAL_TRADE_REQUEST",
        userId,
        normalizedSymbol:  parsed.symbol,
        side:              parsed.side,
        sizeUSD,
        runtime:           parsed.useSandbox ? "sandbox" : "live",
        // Unknown at request time — resolved by placeLiveAutoOrderForUser.
        // Kept as a null placeholder for grep-friendly schema uniformity
        // across REQUEST/EXECUTED/REJECTED tags.
        exchange:          null,
        persistenceResult: null,
        positionId:        null,
        rejectionReason:   null,
        isOperator,
        userPlan,
      },
      "[MANUAL_TRADE_REQUEST] manual customer order received",
    );

    try {
      // Phase-1 unification (Task #206): manual customer BUY/SELL routes
      // through the single execution gateway alongside the AI fan-out so
      // both surfaces emit the canonical `[EXECUTION_GATEWAY_*]` log tags
      // with `trigger: "manual"`. Behavior is byte-identical to the prior
      // direct `placeLiveAutoOrderForUser` call.
      const result = await executeCustomerOrder({
        trigger:    "manual",
        userId,
        symbol:     parsed.symbol,
        side:       parsed.side,
        sizeUSD,
        useSandbox: parsed.useSandbox,
      });

      if (!result.success) {
        req.log.warn(
          {
            tag:               "MANUAL_TRADE_REJECTED",
            userId,
            normalizedSymbol:  parsed.symbol,
            exchange:          result.exchange,
            runtime:           parsed.useSandbox ? "sandbox" : "live",
            persistenceResult: "skipped",
            positionId:        null,
            rejectionReason:   result.errorCode ?? "unknown",
            error:             result.error,
          },
          "[MANUAL_TRADE_REJECTED] placement failed",
        );
        // unsupported_symbol → 400 (client error). Everything else → 409.
        const status = result.errorCode === "unsupported_symbol" ? 400 : 409;
        res.status(status).json({
          ok:                 false,
          errorCode:          result.errorCode,
          error:              result.error,
          exchange:           result.exchange,
          // Echo supportedExchanges so the client can render
          // "Not on Coinbase — try Kraken" without re-deriving.
          supportedExchanges: result.errorCode === "unsupported_symbol"
            ? getSupportedExchanges(parsed.symbol)
            : undefined,
        });
        return;
      }

      // Track persistence outcome for the [MANUAL_TRADE_EXECUTED] log
      // emitted below. Flipped to "failed" inside the mirror catch.
      let persistenceResult: "persisted" | "failed" | "skipped" = "persisted";

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
            sandbox:                parsed.useSandbox,
          });
        }
      } catch (mirrorErr) {
        // Mirror failure is non-fatal — the broker order is still placed.
        persistenceResult = "failed";
        req.log.warn(
          {
            tag:               "MANUAL_TRADE_EXECUTED",
            userId,
            normalizedSymbol:  parsed.symbol,
            exchange:          result.exchange,
            runtime:           parsed.useSandbox ? "sandbox" : "live",
            persistenceResult,
            positionId:        null,
            err:               mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
          },
          "[MANUAL_TRADE_EXECUTED] registerLiveUserFill failed (broker fill still placed)",
        );
      }

      req.log.info(
        {
          tag:               "MANUAL_TRADE_EXECUTED",
          userId,
          normalizedSymbol:  parsed.symbol,
          exchange:          result.exchange,
          runtime:           parsed.useSandbox ? "sandbox" : "live",
          persistenceResult,
          positionId:        result.exchangeOrderId ?? null,
          fillPrice:         result.fillPrice,
        },
        "[MANUAL_TRADE_EXECUTED] broker fill confirmed",
      );

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
      // 2026-05 unification — prefer the typed `UnsupportedSymbolError`
      // (thrown by adapters whose `normaliseSymbol` no longer silently
      // synthesizes pairs). Fall back to the legacy regex on .message
      // for any unconverted adapter or for the plain Error thrown by
      // BaseExchangeAdapter.normaliseSymbolGeneric.
      const isUnsupported =
        err instanceof UnsupportedSymbolError ||
        /^Unsupported symbol:/.test(msg);
      req.log.error(
        {
          tag:               "MANUAL_TRADE_REJECTED",
          userId,
          normalizedSymbol:  parsed.symbol,
          exchange:          null,
          runtime:           parsed.useSandbox ? "sandbox" : "live",
          persistenceResult: "skipped",
          positionId:        null,
          rejectionReason:   isUnsupported ? "unsupported_symbol" : "internal_error",
          error:             msg,
        },
        "[MANUAL_TRADE_REJECTED] unexpected error",
      );
      res.status(isUnsupported ? 400 : 500).json({
        ok:                 false,
        errorCode:          isUnsupported ? "unsupported_symbol" : "internal_error",
        error:              msg,
        supportedExchanges: isUnsupported
          ? getSupportedExchanges(parsed.symbol)
          : undefined,
      });
    }
  },
);

export default router;
