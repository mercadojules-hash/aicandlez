import { Router } from "express";
import type { Request } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { db } from "@workspace/db";
import { userPushTokensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();
type AuthReq = Request & { clerkUserId: string };

// POST /api/user/push-token — register or update a push token
router.post("/user/push-token", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;

  const { token, platform, deviceName } = req.body as {
    token?: string;
    platform?: string;
    deviceName?: string;
  };

  if (!token || typeof token !== "string" || token.length < 10) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  if (!platform || !["expo", "web"].includes(platform)) {
    res.status(400).json({ error: "platform must be 'expo' or 'web'" });
    return;
  }

  try {
    await db
      .insert(userPushTokensTable)
      .values({
        userId,
        token,
        platform,
        deviceName: typeof deviceName === "string" ? deviceName : null,
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPushTokensTable.token,
        set: {
          userId,
          lastUsedAt: new Date(),
          deviceName: typeof deviceName === "string" ? deviceName : null,
        },
      });

    req.log.info({ userId, platform }, "Push token registered");
    res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to register push token");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/user/push-token — deregister a push token (logout / unsubscribe)
router.delete("/user/push-token", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const { token } = req.body as { token?: string };

  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    await db
      .delete(userPushTokensTable)
      .where(
        and(
          eq(userPushTokensTable.userId, userId),
          eq(userPushTokensTable.token, token),
        ),
      );
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to deregister push token");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/user/push-tokens — list user's registered tokens
router.get("/user/push-tokens", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;

  try {
    const tokens = await db
      .select({
        id:         userPushTokensTable.id,
        platform:   userPushTokensTable.platform,
        deviceName: userPushTokensTable.deviceName,
        createdAt:  userPushTokensTable.createdAt,
        lastUsedAt: userPushTokensTable.lastUsedAt,
      })
      .from(userPushTokensTable)
      .where(eq(userPushTokensTable.userId, userId));

    res.json({ tokens });
  } catch (err) {
    logger.error({ err }, "Failed to list push tokens");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
