import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

// ── AI Trading Disclaimer ──────────────────────────────────────────────────
//
// Customer must affirmatively accept this disclaimer before AI auto-trading
// can be enabled. Server-enforced (gate 0e in `placeLiveAutoOrderForUser`)
// so a tampered frontend cannot bypass it.
//
// Bump CURRENT_VERSION when disclaimer text materially changes — existing
// acceptances will no longer match and customers will be re-prompted.

export const AI_DISCLAIMER_CURRENT_VERSION = "2026-05-25-v1";

export const AI_DISCLAIMER_TITLE = "AI Trading — Eligibility & Risk Acknowledgement";

export const AI_DISCLAIMER_BODY =
  "By enabling AI Trading, you confirm that you are at least 18 years old and " +
  "legally eligible to participate in cryptocurrency trading in your jurisdiction. " +
  "Trading involves financial risk and may result in loss of funds.";

export const AI_DISCLAIMER_ACKNOWLEDGEMENTS = [
  "I am at least 18 years of age.",
  "I am legally permitted to trade cryptocurrency in my jurisdiction.",
  "I understand AICandlez does not provide financial advice and I am solely responsible for financial decisions made on my account.",
] as const;

export const AI_DISCLAIMER_RISK_DISCLOSURE =
  "Cryptocurrency markets are volatile and AI-assisted trading can result in rapid losses. " +
  "Past performance is not indicative of future results. Only trade with funds you can afford " +
  "to lose. AICandlez is not a registered investment adviser; nothing on this platform " +
  "constitutes financial advice.";

export const AI_DISCLAIMER_LINKS = {
  terms: "/legal/terms",
  risk:  "/legal/risk-disclosure",
} as const;

export interface AiDisclaimerStatus {
  accepted:       boolean;
  acceptedAt:     string | null;
  acceptedVersion: string | null;
  currentVersion: string;
  needsReaccept:  boolean;
}

export async function getAiDisclaimerStatus(userId: string): Promise<AiDisclaimerStatus> {
  try {
    const [row] = await db
      .select({
        acceptedAt: usersTable.aiDisclaimerAcceptedAt,
        version:    usersTable.aiDisclaimerVersion,
      })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);
    const acceptedAt     = row?.acceptedAt ?? null;
    const acceptedVersion = row?.version    ?? null;
    const versionMatch   = acceptedVersion === AI_DISCLAIMER_CURRENT_VERSION;
    const accepted       = Boolean(acceptedAt) && versionMatch;
    return {
      accepted,
      acceptedAt:     acceptedAt ? acceptedAt.toISOString() : null,
      acceptedVersion,
      currentVersion: AI_DISCLAIMER_CURRENT_VERSION,
      needsReaccept:  Boolean(acceptedAt) && !versionMatch,
    };
  } catch (err) {
    logger.warn({ err, userId }, "aiDisclaimer: status read failed — assuming not accepted");
    return {
      accepted:       false,
      acceptedAt:     null,
      acceptedVersion: null,
      currentVersion: AI_DISCLAIMER_CURRENT_VERSION,
      needsReaccept:  false,
    };
  }
}

export async function isAiDisclaimerAccepted(userId: string): Promise<boolean> {
  const status = await getAiDisclaimerStatus(userId);
  return status.accepted;
}

export async function recordAiDisclaimerAcceptance(
  userId: string,
  email: string,
  ipHash: string | null,
): Promise<AiDisclaimerStatus> {
  // JIT-provision parent users row in case this is a fresh Clerk session
  // that has never written to the users table.
  await db
    .insert(usersTable)
    .values({ clerkUserId: userId, email: email || "", role: "user" })
    .onConflictDoNothing();

  await db
    .update(usersTable)
    .set({
      aiDisclaimerAcceptedAt: new Date(),
      aiDisclaimerVersion:    AI_DISCLAIMER_CURRENT_VERSION,
      aiDisclaimerIp:         ipHash,
      updatedAt:              new Date(),
    })
    .where(eq(usersTable.clerkUserId, userId));

  return getAiDisclaimerStatus(userId);
}
