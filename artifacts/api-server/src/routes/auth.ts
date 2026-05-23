import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable, userTradeLimitsTable, DEFAULT_TRADE_LIMIT_CAP } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import { isSuperAdminEmail } from "../lib/adminAllowlist.js";

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

  const shouldBeSuperAdmin = isSuperAdminEmail(email);
  const targetRole = shouldBeSuperAdmin ? "super-admin" : undefined;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));

  if (existing) {
    // Re-assert super-admin role on every login (defends against accidental
    // role downgrades in the DB).
    if (targetRole && existing.role !== targetRole) {
      const [updated] = await db
        .update(usersTable)
        .set({ role: targetRole, updatedAt: new Date() })
        .where(eq(usersTable.clerkUserId, clerkUserId))
        .returning();
      req.log.info({ clerkUserId, email, role: targetRole }, "Role auto-promoted");
      auditLogger.append(clerkUserId, "ADMIN_ACTION", {
        action:       "ROLE_PROMOTED",
        email,
        previousRole: existing.role,
        newRole:      targetRole,
      }, { severity: "warn", ipAddress: ipAddress ?? undefined });
      res.json(updated);
      return;
    }
    res.json(existing);
    return;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      clerkUserId,
      email,
      role: targetRole ?? "user",
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
