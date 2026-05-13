import { Router } from "express";
import { db } from "@workspace/db";
import { userNotificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { clerkUserId: string };

router.get("/user/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const rows = await db
      .select()
      .from(userNotificationsTable)
      .where(eq(userNotificationsTable.userId, userId))
      .orderBy(desc(userNotificationsTable.createdAt))
      .limit(50);
    const unread = rows.filter((r) => !r.read).length;
    res.json({ notifications: rows, unread });
  } catch (err) {
    req.log.error({ err }, "GET /user/notifications failed");
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.post("/user/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    await db
      .update(userNotificationsTable)
      .set({ read: true })
      .where(and(eq(userNotificationsTable.userId, userId), eq(userNotificationsTable.read, false)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "POST /user/notifications/read-all failed");
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

router.post("/user/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const id = String(req.params.id);
  try {
    await db
      .update(userNotificationsTable)
      .set({ read: true })
      .where(and(eq(userNotificationsTable.id, id), eq(userNotificationsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "POST /user/notifications/:id/read failed");
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(userNotificationsTable).values({
    userId:  params.userId,
    type:    params.type,
    title:   params.title,
    message: params.message,
    data:    params.data,
  });
}

export default router;
