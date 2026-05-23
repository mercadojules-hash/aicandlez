// GET /api/user/trade-limit — calling user's current trade-limit verdict.
// GET /api/admin/users/:id/trade-limit — admin variant for any target user.

import { Router, type IRouter, type Request } from "express";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { getTradeLimitVerdict } from "../lib/tradeLimitEngine.js";

type AuthedRequest = Request & { clerkUserId: string };

const router: IRouter = Router();

router.get("/user/trade-limit", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).clerkUserId;
  try {
    const verdict = await getTradeLimitVerdict(userId);
    // JSON can't serialize Infinity — surface unlimited as null on the wire.
    res.json({
      ...verdict,
      remaining: Number.isFinite(verdict.remaining) ? verdict.remaining : null,
    });
  } catch (err) {
    req.log.error({ err, userId }, "GET /user/trade-limit failed");
    res.status(500).json({ error: "Trade-limit lookup failed" });
  }
});

router.get(
  "/admin/users/:id/trade-limit",
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    const rawId = req.params.id;
    const targetUserId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";
    if (!targetUserId) { res.status(400).json({ error: "Missing user id" }); return; }
    try {
      const verdict = await getTradeLimitVerdict(targetUserId);
      res.json({
        ...verdict,
        remaining: Number.isFinite(verdict.remaining) ? verdict.remaining : null,
      });
    } catch (err) {
      req.log.error({ err, targetUserId }, "GET /admin/users/:id/trade-limit failed");
      res.status(500).json({ error: "Trade-limit lookup failed" });
    }
  },
);

export default router;
