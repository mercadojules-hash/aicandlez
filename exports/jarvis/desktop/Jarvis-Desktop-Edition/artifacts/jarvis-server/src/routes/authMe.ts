// ─────────────────────────────────────────────────────────────────────────────
// Desktop identity endpoint — local replacement for AICandlez /api/auth/me.
// Mirrors the response shape `useUserRole` expects ({ role, email }) but always
// resolves to the single local super-admin, JIT-provisioning the `users` row so
// downstream DB role lookups + actor resolution succeed. Fail-safe: if the DB is
// unavailable it still returns the default local identity.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { LOCAL_USER_ID } from "../middlewares/requireAuth.js";

const LOCAL_EMAIL = process.env.JARVIS_LOCAL_EMAIL?.trim() || "admin@localhost";

export const authMeRouter: Router = Router();

authMeRouter.get("/auth/me", async (req: Request, res: Response) => {
  let role: "user" | "admin" | "super-admin" = "super-admin";
  let email = LOCAL_EMAIL;
  try {
    const rows = await db
      .insert(usersTable)
      .values({
        clerkUserId: LOCAL_USER_ID,
        email: LOCAL_EMAIL,
        role: "super-admin",
      })
      .onConflictDoUpdate({
        target: usersTable.clerkUserId,
        set: { role: "super-admin", updatedAt: new Date() },
      })
      .returning();
    const row = rows[0];
    if (row) {
      role = (row.role as typeof role) ?? "super-admin";
      email = row.email ?? LOCAL_EMAIL;
    }
  } catch (err) {
    req.log?.warn(
      { err },
      "auth/me upsert failed; serving default local identity",
    );
  }
  res.json({
    userId: LOCAL_USER_ID,
    clerkUserId: LOCAL_USER_ID,
    email,
    role,
  });
});
