import type { Request } from "express";
import crypto from "node:crypto";
import { db, jarvisAuditLogsTable } from "@workspace/db";

export interface JarvisServiceAuditInput {
  action: string;
  route: string;
  method: string;
  status: number;
  scope?: string | null;
  outcome: "allowed" | "denied" | "failed";
  reason?: string | null;
  targetUserId?: string | null;
}

function hashIp(ip: unknown): string | null {
  if (typeof ip !== "string" || ip.trim() === "") return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function safeUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  if (typeof ua !== "string" || ua.trim() === "") return null;
  return ua.slice(0, 160);
}

export async function auditJarvisServiceRequest(
  req: Request,
  input: JarvisServiceAuditInput,
): Promise<void> {
  try {
    await db.insert(jarvisAuditLogsTable).values({
      userId: "jarvis-executive-service",
      userEmail: null,
      action: input.action,
      entityType: "aicandlez-executive-service",
      entityId: input.targetUserId ?? null,
      metadata: {
        route: input.route,
        method: input.method,
        status: input.status,
        scope: input.scope ?? null,
        outcome: input.outcome,
        reason: input.reason ?? null,
        actorType: "service",
        actorId: "jarvis-executive",
        ipHash: hashIp(req.ip),
        userAgent: safeUserAgent(req),
      },
    });
  } catch (err) {
    req.log?.warn?.(
      { err, action: input.action, route: input.route, status: input.status },
      "jarvis service audit log failed",
    );
  }
}
