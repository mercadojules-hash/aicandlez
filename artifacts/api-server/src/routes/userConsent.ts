import { Router } from "express";
import {
  db,
  userConsentsTable,
  usersTable,
  DISCLAIMER_VERSION,
  DISCLAIMER_ACK_KEYS,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { clerkUserId: string };

const CURRENT_CONSENT_VERSION = "v1.0";

// ── Helper: is this user an operator (admin / super-admin)? ──────────────────
async function isOperator(clerkUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  const role = row?.role;
  return role === "admin" || role === "super-admin";
}

// ── GET /api/user/consent ─────────────────────────────────────────────────────
// Legacy v1.0 fee acknowledgement status. Kept for back-compat.

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
// Records explicit v1.0 fee acceptance. All five checkboxes must be true.

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

// ── GET /api/user/disclaimer ──────────────────────────────────────────────────
// Returns whether the current customer user has accepted the current
// risk-disclaimer version. Operators (admin / super-admin) always return
// `needsAcceptance: false` regardless of DB state.

router.get("/user/disclaimer", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const operator = await isOperator(userId);
    if (operator) {
      res.json({
        needsAcceptance: false,
        bypass:          true,
        reason:          "operator",
        currentVersion:  DISCLAIMER_VERSION,
        accepted:        true,
        acceptedVersion: null,
        acceptedAt:      null,
      });
      return;
    }

    const [latest] = await db
      .select({
        consentVersion: userConsentsTable.consentVersion,
        createdAt:      userConsentsTable.createdAt,
      })
      .from(userConsentsTable)
      .where(and(
        eq(userConsentsTable.userId, userId),
        eq(userConsentsTable.consentVersion, DISCLAIMER_VERSION),
      ))
      .orderBy(desc(userConsentsTable.createdAt))
      .limit(1);

    const accepted = !!latest;
    res.json({
      needsAcceptance: !accepted,
      bypass:          false,
      currentVersion:  DISCLAIMER_VERSION,
      accepted,
      acceptedVersion: latest?.consentVersion ?? null,
      acceptedAt:      latest?.createdAt ?? null,
    });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    req.log.error({ err, pgCode: e?.code, pgMsg: e?.message, userId }, "GET /user/disclaimer failed");
    res.status(500).json({
      error:  "Failed to check disclaimer status",
      code:   e?.code ?? "UNKNOWN",
      detail: e?.message ?? "no error message",
    });
  }
});

// ── POST /api/user/disclaimer ─────────────────────────────────────────────────
// Records explicit acceptance of the current risk disclaimer. All six
// acknowledgements must be true. Operators don't need to call this but
// the endpoint accepts their submissions as no-ops for UI symmetry.

router.post("/user/disclaimer", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const body = req.body as Partial<Record<string, boolean>>;

  // Validate all six acks are explicitly true
  const missing = DISCLAIMER_ACK_KEYS.filter(k => body[k] !== true);
  if (missing.length > 0) {
    res.status(400).json({
      error:   "All risk acknowledgements must be explicitly accepted",
      missing,
    });
    return;
  }

  try {
    // Operator? Don't write a row, but return ok so client UI proceeds.
    if (await isOperator(userId)) {
      res.json({
        ok:              true,
        bypass:          true,
        disclaimerVersion: DISCLAIMER_VERSION,
      });
      return;
    }

    const id = `DISCLAIMER-${userId}-${Date.now()}`;
    await db.insert(userConsentsTable).values({
      id,
      userId,
      consentVersion:          DISCLAIMER_VERSION,
      // legacy v1.0 columns (notNull default false) — leave default
      acceptedTerms:           false,
      acceptedMembershipFee:   false,
      acceptedPerformanceFee:  false,
      acceptedNoFeeOnLosses:   false,
      acceptedNoUnrealizedFee: false,
      // v1.0 disclaimer columns
      acceptedNotAdvice:       true,
      acceptedTradingRisk:     true,
      acceptedAiInaccuracy:    true,
      acceptedPastPerformance: true,
      acceptedUserResponsible: true,
      acceptedAutomatedLosses: true,
      ipAddress:               req.ip ?? null,
      userAgent:               req.headers["user-agent"] ?? null,
      metadata:                {
        timestamp: new Date().toISOString(),
        source:    "risk-disclaimer-modal",
        version:   DISCLAIMER_VERSION,
      },
    });

    res.json({
      ok:                true,
      disclaimerVersion: DISCLAIMER_VERSION,
      acceptedAt:        new Date().toISOString(),
    });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    req.log.error({ err, pgCode: e?.code, pgMsg: e?.message, userId }, "POST /user/disclaimer failed");
    res.status(500).json({
      error:  "Failed to record disclaimer acceptance",
      code:   e?.code ?? "UNKNOWN",
      detail: e?.message ?? "no error message",
      hint:   e?.code === "42703"
        ? "user_consents is missing a disclaimer-v1.0 column — run drizzle-kit push against the production DB."
        : undefined,
    });
  }
});

export default router;
