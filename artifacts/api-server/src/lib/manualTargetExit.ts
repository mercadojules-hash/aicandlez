import { and, eq, isNotNull } from "drizzle-orm";
import { db, simPositionsTable } from "@workspace/db";
import { getTicker } from "./marketData.js";
import { closeUserPosition } from "./userSimRegistry.js";
import { logger } from "./logger.js";

export async function setManualExitTarget(args: {
  userId: string;
  positionId: string;
  targetPrice: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await db
    .update(simPositionsTable)
    .set({ manualExitTargetPrice: args.targetPrice })
    .where(and(
      eq(simPositionsTable.id, args.positionId),
      eq(simPositionsTable.userId, args.userId),
    ))
    .returning({ id: simPositionsTable.id });

  if (rows.length === 0) return { ok: false, error: "Open position not found for target user" };
  return { ok: true };
}

export async function runManualTargetExitMonitor(): Promise<void> {
  const rows = await db
    .select({
      userId:     simPositionsTable.userId,
      positionId: simPositionsTable.id,
      symbol:     simPositionsTable.symbol,
      side:       simPositionsTable.side,
      target:     simPositionsTable.manualExitTargetPrice,
    })
    .from(simPositionsTable)
    .where(isNotNull(simPositionsTable.manualExitTargetPrice));

  for (const row of rows) {
    const target = Number(row.target);
    if (!(target > 0)) continue;

    let price = 0;
    try {
      const ticker = await getTicker(row.symbol);
      price = Number(ticker.price);
    } catch (err) {
      logger.warn(
        { err, tag: "MANUAL_TARGET_PRICE_LOOKUP_FAILED", symbol: row.symbol, positionId: row.positionId },
        "[MANUAL_TARGET_PRICE_LOOKUP_FAILED] unable to price manual target position",
      );
      continue;
    }
    if (!(price > 0)) continue;

    const side = String(row.side).toUpperCase();
    const reached = side === "SELL" ? price <= target : price >= target;
    if (!reached) continue;

    const result = await closeUserPosition(row.userId, row.positionId, "MANUAL_TARGET_EXIT");
    if (result.success) {
      logger.warn(
        { tag: "MANUAL_TARGET_EXIT", userId: row.userId, positionId: row.positionId, symbol: row.symbol, target, price },
        "[MANUAL_TARGET_EXIT] operator target reached; close executed",
      );
    } else {
      logger.warn(
        {
          tag: "MANUAL_TARGET_EXIT_FAILED",
          userId: row.userId,
          positionId: row.positionId,
          symbol: row.symbol,
          target,
          price,
          error: result.error,
          errorCode: result.errorCode,
        },
        "[MANUAL_TARGET_EXIT_FAILED] operator target reached but close failed",
      );
    }
  }
}
