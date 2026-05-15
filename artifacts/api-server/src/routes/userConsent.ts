import { Router } from "express";
import { db } from "@workspace/db";
import { userConsentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { clerkUserId: string };

const CURRENT_CONSENT_VERSION = "v1.0";

// ── GET /api/user/consent ─────────────────────────────────────────────────────
// Returns whether the current user has accepted the latest consent version.

router.get("/user/consent", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const [consent] = await db
      .select({ id: userConsentsTable.id, createdAt: userConsentsTable.createdAt })
      .from(userConsentsTable)
      .where(and(
        eq(userConsentsTable.userId, userId),
        eq(userConsentsTable.consentVersion, CURRENT_CONSENT_VERSION),
      ))
      .limit(1);

    res.json({
      hasConsented:    !!consent,
      consentVersion:  CURRENT_CONSENT_VERSION,
      consentedAt:     consent?.createdAt ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "GET /user/consent failed");
    res.status(500).json({ error: "Failed to check consent status" });
  }
});

// ── POST /api/user/consent ────────────────────────────────────────────────────
// Records explicit user acceptance. All five checkboxes must be true.

router.post("/user/consent", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const {
    acceptedTerms,
    acceptedMembershipFee,
    acceptedPerformanceFee,
    acceptedNoFeeOnLosses,
    acceptedNoUnrealizedFee,
  } = req.body as {
    acceptedTerms?:           boolean;
    acceptedMembershipFee?:   boolean;
    acceptedPerformanceFee?:  boolean;
    acceptedNoFeeOnLosses?:   boolean;
    acceptedNoUnrealizedFee?: boolean;
  };

  if (
    !acceptedTerms ||
    !acceptedMembershipFee ||
    !acceptedPerformanceFee ||
    !acceptedNoFeeOnLosses ||
    !acceptedNoUnrealizedFee
  ) {
    res.status(400).json({ error: "All consent items must be explicitly accepted" });
    return;
  }

  try {
    const id = `CONSENT-${userId}-${Date.now()}`;
    await db.insert(userConsentsTable).values({
      id,
      userId,
      consentVersion:          CURRENT_CONSENT_VERSION,
      acceptedTerms:           true,
      acceptedMembershipFee:   true,
      acceptedPerformanceFee:  true,
      acceptedNoFeeOnLosses:   true,
      acceptedNoUnrealizedFee: true,
      ipAddress:               req.ip ?? null,
      userAgent:               req.headers["user-agent"] ?? null,
      metadata:                { timestamp: new Date().toISOString(), source: "web-onboarding" },
    });

    res.json({ ok: true, consentVersion: CURRENT_CONSENT_VERSION });
  } catch (err) {
    req.log.error({ err }, "POST /user/consent failed");
    res.status(500).json({ error: "Failed to record consent" });
  }
});

export default router;
