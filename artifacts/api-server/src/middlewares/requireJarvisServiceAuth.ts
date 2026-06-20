import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { auditJarvisServiceRequest } from "../lib/jarvisServiceAudit.js";

export interface JarvisServiceAuthContext {
  actorType: "service";
  actorId: "jarvis-executive";
  scopes: string[];
}

export type JarvisServiceRequest = Request & {
  jarvisServiceAuth?: JarvisServiceAuthContext;
};

export function isJarvisExecutiveServiceEnabled(): boolean {
  return process.env["JARVIS_EXECUTIVE_SERVICE_ENABLED"] === "true";
}

export function parseJarvisExecutiveServiceScopes(): string[] {
  return (process.env["JARVIS_EXECUTIVE_SERVICE_SCOPES"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hashJarvisExecutiveServiceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function extractBearer(req: Request): string | null {
  const raw = req.headers.authorization;
  if (typeof raw !== "string") return null;
  const [scheme, ...parts] = raw.split(" ");
  if (scheme !== "Bearer" || parts.length !== 1 || !parts[0]) return null;
  return parts[0];
}

async function auditDenied(
  req: Request,
  status: number,
  requiredScope: string,
  reason: string,
): Promise<void> {
  await auditJarvisServiceRequest(req, {
    action: "jarvis.service.auth",
    route: req.originalUrl || req.path,
    method: req.method,
    status,
    scope: requiredScope,
    outcome: "denied",
    reason,
  });
}

export function requireJarvisServiceAuth(requiredScope: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!isJarvisExecutiveServiceEnabled()) {
      await auditDenied(req, 404, requiredScope, "service_disabled");
      res.status(404).json({ error: "jarvis_executive_service_disabled" });
      return;
    }

    const configuredHash = (process.env["JARVIS_EXECUTIVE_SERVICE_TOKEN_HASH"] ?? "").trim();
    if (!configuredHash) {
      await auditDenied(req, 503, requiredScope, "token_hash_unconfigured");
      res.status(503).json({ error: "jarvis_executive_service_unconfigured" });
      return;
    }

    const token = extractBearer(req);
    if (!token) {
      await auditDenied(req, 401, requiredScope, "missing_token");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const suppliedHash = hashJarvisExecutiveServiceToken(token);
    if (!safeEqualHex(suppliedHash, configuredHash)) {
      await auditDenied(req, 401, requiredScope, "invalid_token");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const scopes = parseJarvisExecutiveServiceScopes();
    if (!scopes.includes(requiredScope)) {
      await auditDenied(req, 403, requiredScope, "missing_scope");
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    (req as JarvisServiceRequest).jarvisServiceAuth = {
      actorType: "service",
      actorId: "jarvis-executive",
      scopes,
    };
    next();
  };
}
