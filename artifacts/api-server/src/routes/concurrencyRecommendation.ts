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
      })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    const role = userRow?.role ?? "user";
    const isUnlimited =
      role === "admin" || role === "super-admin" || !!userRow?.isInternalAccount;
    const plan = asPlan(userRow?.plan);
    const tradeSizeUSD = settingsRow?.preferredLiveOrderSizeUsd ?? 10;

    // Equity sourcing: prefer the funded active live venue; fall back to paper.
    let equityUSD = 0;
    let equitySource: "live" | "paper" = "paper";

    const [liveConn] = await db
      .select()
      .from(userExchangeConnectionsTable)
      .where(
        and(
          eq(userExchangeConnectionsTable.userId, userId),
          eq(userExchangeConnectionsTable.isDefault, true),
          eq(userExchangeConnectionsTable.status, "active"),
          eq(userExchangeConnectionsTable.tradingMode, "live"),
        ),
      )
      .limit(1);

    if (liveConn) {
      try {
        const snap = await loadBalanceForRow(userId, liveConn);
        if (snap.ok && Number.isFinite(snap.totalEquityUSD) && snap.totalEquityUSD > 0) {
          equityUSD = snap.totalEquityUSD;
          equitySource = "live";
        }
      } catch (err) {
        req.log.warn(
          { tag: "CONCURRENCY_REC", userId, err },
          "[CONCURRENCY_REC] live balance poll failed — falling back to paper equity",
        );
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
