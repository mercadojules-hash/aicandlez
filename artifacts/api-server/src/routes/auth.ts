import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) ?? auth?.userId ?? "";
  const email = (auth?.sessionClaims?.email as string | undefined) ?? "";
  const ipAddress = req.ip ?? req.socket?.remoteAddress ?? null;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));

  if (existing) {
    res.json(existing);
    return;
  }

  const [created] = await db
    .insert(usersTable)
    .values({ clerkUserId, email, role: "user" })
    .returning();

  req.log.info({ clerkUserId }, "New user provisioned");

  auditLogger.append(clerkUserId, "USER_LOGIN", {
    firstLogin:  true,
    email,
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
