/**
 * POST /api/internal/notify — dispatch a push notification to a user or all users.
 *
 * This route is for server-internal use only in production (should be behind
 * an internal network or service-to-service secret header). In development
 * it can be called directly for testing.
 */

import { Router } from "express";
import type { Request } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { NotificationDispatcher } from "../services/notifications/NotificationDispatcher.js";

const router = Router();
type AuthReq = Request & { clerkUserId: string };

// POST /api/user/notify — send a push notification to the authenticated user (for testing)
router.post("/user/notify", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;

  const { title, body, notifType, url, tag } = req.body as {
    title?:     string;
    body?:      string;
    notifType?: string;
    url?:       string;
    tag?:       string;
  };

  if (!title || !body) {
    res.status(400).json({ error: "title and body are required" });
    return;
  }

  const result = await NotificationDispatcher.sendToUser(userId, {
    title,
    body,
    notifType: (notifType as "signal" | "trade" | "risk" | "system" | "general") ?? "general",
    url,
    tag,
  });

  res.json({ ok: true, result });
});

export default router;
