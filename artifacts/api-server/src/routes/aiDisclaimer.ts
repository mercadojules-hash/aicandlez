import { Router } from "express";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  AI_DISCLAIMER_ACKNOWLEDGEMENTS,
  AI_DISCLAIMER_BODY,
  AI_DISCLAIMER_CURRENT_VERSION,
  AI_DISCLAIMER_LINKS,
  AI_DISCLAIMER_RISK_DISCLOSURE,
  AI_DISCLAIMER_TITLE,
  getAiDisclaimerStatus,
  recordAiDisclaimerAcceptance,
} from "../lib/aiDisclaimer.js";

// ── /api/user/ai-disclaimer ─────────────────────────────────────────────────
//
// GET → returns current disclaimer text + the user's acceptance status.
// POST → records acceptance. Requires explicit `acknowledged: true` body
//        flag AND the client must echo the current `version` to prevent
//        accidental re-confirmation of stale terms.
//
// Server-enforced via `gate 0e` in `placeLiveAutoOrderForUser`. This route
// is the *only* path that may flip the acceptance flag on.

const router = Router();
type AuthReq = Request & { clerkUserId: string; clerkUserEmail?: string };

function hashIp(req: Request): string | null {
  const fwd = req.header("x-forwarded-for");
  const ip  = (fwd?.split(",")[0]?.trim() || req.socket.remoteAddress || "").trim();
  if (!ip) return null;
  // Salted hash so audit trail doesn't store raw IPs.
  return createHash("sha256").update(`aicandlez:${ip}`).digest("hex").slice(0, 32);
}

router.get("/user/ai-disclaimer", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const status = await getAiDisclaimerStatus(userId);
    res.json({
      status,
      disclaimer: {
        version:          AI_DISCLAIMER_CURRENT_VERSION,
        title:            AI_DISCLAIMER_TITLE,
        body:             AI_DISCLAIMER_BODY,
        acknowledgements: AI_DISCLAIMER_ACKNOWLEDGEMENTS,
        riskDisclosure:   AI_DISCLAIMER_RISK_DISCLOSURE,
        links:            AI_DISCLAIMER_LINKS,
      },
    });
  } catch (err) {
    req.log.error({ err, userId }, "GET /user/ai-disclaimer failed");
    res.status(500).json({ error: "ai_disclaimer_read_failed" });
  }
});

router.post("/user/ai-disclaimer", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const email  = (req as AuthReq).clerkUserEmail ?? "";
  const body   = (req.body ?? {}) as Record<string, unknown>;

  if (body["acknowledged"] !== true) {
    res.status(400).json({ error: "acknowledgement_required" });
    return;
  }
  if (body["version"] !== AI_DISCLAIMER_CURRENT_VERSION) {
    res.status(409).json({
      error: "stale_version",
      currentVersion: AI_DISCLAIMER_CURRENT_VERSION,
    });
    return;
  }

  try {
    const status = await recordAiDisclaimerAcceptance(userId, email, hashIp(req));
    req.log.info({ userId, version: status.acceptedVersion }, "AI disclaimer accepted");
    res.json({ status });
  } catch (err) {
    req.log.error({ err, userId }, "POST /user/ai-disclaimer failed");
    res.status(500).json({ error: "ai_disclaimer_write_failed" });
  }
});

export default router;
