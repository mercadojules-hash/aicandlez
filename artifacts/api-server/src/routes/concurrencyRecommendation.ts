/**
 * GET /api/user/concurrency-recommendation — balance-aware concurrency
 * RECOMMENDATION (Profit Optimization P6).
 *
 * Advisory only. Resolves the customer's equity (active live venue equity if a
 * funded live connection exists, otherwise paper equity) and their per-trade
 * size, then returns how many concurrent positions their balance can fund
 * while keeping a cash cushion. Does NOT change any execution cap. requireAuth-
 * gated — each user only ever sees their own numbers.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  userSettingsTable,
  usersTable,
  userExchangeConnectionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { recommendConcurrency } from "../lib/concurrencyAdvisor.js";
import type { CustomerPlan } from "../lib/liquidityGuard.js";
import { getUserAccountSummary } from "../lib/userSimRegistry.js";
import { loadBalanceForRow } from "./userExchanges.js";

type AuthReq = Request & { clerkUserId: string };

const router: IRouter = Router();

const PLAN_SET: ReadonlySet<string> = new Set(["free", "starter", "pro", "elite"]);
function asPlan(v: string | null | undefined): CustomerPlan {
  return v && PLAN_SET.has(v) ? (v as CustomerPlan) : "free";
}

router.get(
  "/user/concurrency-recommendation",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthReq).clerkUserId;

    const [userRow] = await db
      .select({
        role: usersTable.role,
        plan: usersTable.plan,
        isInternalAccount: usersTable.isInternalAccount,
      })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);

    const [settingsRow] = await db
      .select({
        preferredLiveOrderSizeUsd: userSettingsTable.preferredLiveOrderSizeUsd,
        positionSizeUSD:           userSettingsTable.positionSizeUSD,
        activeRuntimeExchange:     userSettingsTable.activeRuntimeExchange,
      })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    const role = userRow?.role ?? "user";
    const isUnlimited =
      role === "admin" || role === "super-admin" || !!userRow?.isInternalAccount;
    const plan = asPlan(userRow?.plan);
    const liveTradeSizeUSD  = settingsRow?.preferredLiveOrderSizeUsd ?? 10;
    const paperTradeSizeUSD = settingsRow?.positionSizeUSD ?? liveTradeSizeUSD;
    const activeRuntimeExchange = settingsRow?.activeRuntimeExchange ?? null;

    // Equity sourcing: resolve the customer's ACTIVE live venue using the same
    // decision rule the runtime state uses (honor an explicit
    // `activeRuntimeExchange` pin; otherwise auto-promote when there is exactly
    // ONE active live connection), NOT just `isDefault`. Fall back to paper
    // equity when no single funded live venue resolves. Trade size follows the
    // resolved mode so the recommendation reflects the size that actually ships
    // (live → preferredLiveOrderSizeUsd; paper → positionSizeUSD).
    let equityUSD = 0;
    let equitySource: "live" | "paper" = "paper";
    let tradeSizeUSD = paperTradeSizeUSD;

    // Explicit paper opt-out short-circuits any live resolution.
    if (activeRuntimeExchange !== "paper") {
      const liveConns = await db
        .select()
        .from(userExchangeConnectionsTable)
        .where(
          and(
            eq(userExchangeConnectionsTable.userId, userId),
            eq(userExchangeConnectionsTable.status, "active"),
            eq(userExchangeConnectionsTable.tradingMode, "live"),
          ),
        );

      // Resolve the single active venue: a specific pin wins; else auto-promote
      // only when exactly one live connection exists (two → stay paper until the
      // user picks, mirroring the runtime aggregator).
      let activeConn: (typeof liveConns)[number] | undefined;
      if (activeRuntimeExchange) {
        activeConn = liveConns.find((c) => c.exchange === activeRuntimeExchange);
      } else if (liveConns.length === 1) {
        activeConn = liveConns[0];
      }

      if (activeConn) {
        try {
          const snap = await loadBalanceForRow(userId, activeConn);
          if (snap.ok && Number.isFinite(snap.totalEquityUSD) && snap.totalEquityUSD > 0) {
            equityUSD = snap.totalEquityUSD;
            equitySource = "live";
            tradeSizeUSD = liveTradeSizeUSD;
          }
        } catch (err) {
          req.log.warn(
            { tag: "CONCURRENCY_REC", userId, err },
            "[CONCURRENCY_REC] live balance poll failed — falling back to paper equity",
          );
        }
      }
    }

    if (equitySource === "paper") {
      try {
        const summary = await getUserAccountSummary(userId);
        equityUSD = summary.equity;
      } catch (err) {
        req.log.warn(
          { tag: "CONCURRENCY_REC", userId, err },
          "[CONCURRENCY_REC] paper equity read failed — defaulting to 0",
        );
        equityUSD = 0;
      }
    }

    const recommendation = recommendConcurrency({
      equityUSD,
      tradeSizeUSD,
      plan,
      isUnlimited,
    });

    res.json({ ...recommendation, equitySource });
  },
);

export default router;
