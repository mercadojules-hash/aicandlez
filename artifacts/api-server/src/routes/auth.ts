import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable, userTradeLimitsTable, DEFAULT_TRADE_LIMIT_CAP } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { isSuperAdminEmail, isOperatorAdminEmail } from "../lib/adminAllowlist.js";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/me
// JIT-provisions a user row from Clerk. Auto-promotes allowlisted emails to
// `super-admin`. Idempotent — safe to call on every page load.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId =
    (auth?.sessionClaims?.userId as string | undefined) ?? auth?.userId ?? "";
  const ipAddress = req.ip ?? req.socket?.remoteAddress ?? null;

  // Pull authoritative email from Clerk (session claims may not include it).
  let email = (auth?.sessionClaims?.email as string | undefined) ?? "";
  if (!email && clerkUserId) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      email =
        clerkUser?.primaryEmailAddress?.emailAddress ??
        clerkUser?.emailAddresses?.[0]?.emailAddress ??
        "";
    } catch (err) {
      req.log.warn({ err, clerkUserId }, "Clerk user fetch failed");
    }
  }

  // Allowlist-driven role, AUTHORITATIVE in both directions for the operator
  // `admin` role: super-admin wins; otherwise operator allowlist → `admin`;
  // otherwise → `user`. A super-admin is NEVER auto-downgraded here (on-call
  // safety: super-admin removal is a deliberate manual action, not a silent
  // side effect of an /auth/me call).
  const shouldBeSuperAdmin    = isSuperAdminEmail(email);
  const shouldBeOperatorAdmin = !shouldBeSuperAdmin && isOperatorAdminEmail(email);

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));

  if (existing) {
    // Resolve the role this account SHOULD have. The operator allowlist is
    // authoritative: an account previously promoted to `admin` whose email is
    // no longer listed is reset to `user` — this is how operator access is
    // revoked (remove the email from the allowlist + redeploy). The lone
    // exception is super-admin, which is never auto-demoted.
    let desiredRole: "super-admin" | "admin" | "user";
    if (shouldBeSuperAdmin) {
      desiredRole = "super-admin";
    } else if (existing.role === "super-admin") {
      desiredRole = "super-admin"; // never auto-downgrade a super-admin
    } else if (shouldBeOperatorAdmin) {
      desiredRole = "admin";
    } else {
      desiredRole = "user";
    }

    if (existing.role !== desiredRole) {
      const [updated] = await db
        .update(usersTable)
        .set({ role: desiredRole, updatedAt: new Date() })
        .where(eq(usersTable.clerkUserId, clerkUserId))
        .returning();
      const isPromotion =
        (existing.role === "user" && desiredRole !== "user") ||
        (existing.role === "admin" && desiredRole === "super-admin");
      req.log.info(
        { clerkUserId, email, previousRole: existing.role, role: desiredRole },
        isPromotion ? "Role auto-promoted" : "Role auto-corrected (downgrade)",
      );
      auditLogger.append(clerkUserId, "ADMIN_ACTION", {
        action:       isPromotion ? "ROLE_PROMOTED" : "ROLE_DOWNGRADED",
        email,
        previousRole: existing.role,
        newRole:      desiredRole,
      }, { severity: "warn", ipAddress: ipAddress ?? undefined });
      res.json(updated);
      return;
    }
    res.json(existing);
    return;
  }

  const newUserRole: "super-admin" | "admin" | "user" = shouldBeSuperAdmin
    ? "super-admin"
    : shouldBeOperatorAdmin
      ? "admin"
      : "user";

  const [created] = await db
    .insert(usersTable)
    .values({
      clerkUserId,
      email,
      role: newUserRole,
    })
    .returning();

  // Persist the default trade-limit row for every new user. Idempotent —
  // duplicate provisioning races (rare) are absorbed by the unique
  // constraint via onConflictDoNothing.
  try {
    await db
      .insert(userTradeLimitsTable)
      .values({
        userId:  clerkUserId,
        capTier: DEFAULT_TRADE_LIMIT_CAP,
      })
      .onConflictDoNothing();
  } catch (err) {
    req.log.warn({ err, clerkUserId }, "Default trade-limit row provisioning failed");
  }

  req.log.info(
    { clerkUserId, email, role: created?.role },
    "New user provisioned",
  );

  auditLogger.append(clerkUserId, "USER_LOGIN", {
    firstLogin:  true,
    email,
    role:        created?.role,
    provisioned: true,
  }, { ipAddress: ipAddress ?? undefined });

  res.status(201).json(created);
});

router.put("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) ?? auth?.userId ?? "";

  const [updated] = await db
    .update(usersTable)
    .set({ updatedAt: new Date() })
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(updated);
});

export default router;
