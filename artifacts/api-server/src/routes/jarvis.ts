/**
 * Jarvis Executive Command Center — isolated product API.
 *
 * All routes are mounted under `/api/jarvis/*` and are fully decoupled from the
 * AICandlez trading surfaces. Identity/role reuses the shared Clerk-backed
 * `users` table; every mutation is recorded to `jarvis_audit_logs`.
 *
 *   GET    /jarvis/dashboard                 (auth)  — counts + recent activity + health
 *   GET    /jarvis/businesses                (auth)
 *   POST   /jarvis/businesses                (auth)
 *   GET    /jarvis/businesses/:id            (auth)
 *   PUT    /jarvis/businesses/:id            (auth)
 *   DELETE /jarvis/businesses/:id            (auth)
 *   …same CRUD shape for /jarvis/projects, /jarvis/agents, /jarvis/workflows
 *   GET    /jarvis/audit-logs                (auth)  — recent activity feed
 *   GET    /jarvis/settings                  (auth)  — key/value map
 *   PUT    /jarvis/settings                  (admin) — upsert keys (role-gated)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  usersTable,
  jarvisBusinessesTable,
  jarvisProjectsTable,
  jarvisAgentsTable,
  jarvisWorkflowsTable,
  jarvisAuditLogsTable,
  jarvisSettingsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

type AuthReq = Request & { clerkUserId: string };

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolveActor(
  clerkUserId: string,
): Promise<{ userId: string; email: string | null }> {
  try {
    const [row] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);
    return { userId: clerkUserId, email: row?.email ?? null };
  } catch {
    return { userId: clerkUserId, email: null };
  }
}

async function audit(
  req: Request,
  actor: { userId: string; email: string | null },
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(jarvisAuditLogsTable).values({
      userId: actor.userId,
      userEmail: actor.email,
      action,
      entityType,
      entityId,
      metadata: metadata ?? null,
    });
  } catch (err) {
    // Audit logging must never break the primary mutation.
    req.log.warn({ err, action, entityType, entityId }, "jarvis audit log failed");
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || `business-${Date.now()}`
  );
}

const statusSchema = z.string().trim().min(1).max(32);

// ── dashboard ────────────────────────────────────────────────────────────────

router.get(
  "/jarvis/dashboard",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [
        [businesses],
        [projects],
        [agents],
        [workflows],
        [activeAgents],
        [activeWorkflows],
        recentActivity,
      ] = await Promise.all([
        db.select({ c: sql<number>`count(*)::int` }).from(jarvisBusinessesTable),
        db.select({ c: sql<number>`count(*)::int` }).from(jarvisProjectsTable),
        db.select({ c: sql<number>`count(*)::int` }).from(jarvisAgentsTable),
        db.select({ c: sql<number>`count(*)::int` }).from(jarvisWorkflowsTable),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(jarvisAgentsTable)
          .where(eq(jarvisAgentsTable.status, "active")),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(jarvisWorkflowsTable)
          .where(eq(jarvisWorkflowsTable.status, "active")),
        db
          .select()
          .from(jarvisAuditLogsTable)
          .orderBy(desc(jarvisAuditLogsTable.createdAt))
          .limit(12),
      ]);

      res.json({
        counts: {
          businesses: businesses?.c ?? 0,
          projects: projects?.c ?? 0,
          agents: agents?.c ?? 0,
          workflows: workflows?.c ?? 0,
        },
        recentActivity,
        systemHealth: {
          apiStatus: "operational",
          databaseStatus: "connected",
          uptimeSeconds: Math.round(process.uptime()),
          activeAgents: activeAgents?.c ?? 0,
          activeWorkflows: activeWorkflows?.c ?? 0,
          timestamp: Date.now(),
        },
        generatedAt: Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/dashboard failed");
      res.status(500).json({ error: "jarvis_dashboard_failed" });
    }
  },
);

// ── businesses ───────────────────────────────────────────────────────────────

const businessBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/businesses",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisBusinessesTable)
        .orderBy(desc(jarvisBusinessesTable.createdAt));
      res.json({ businesses: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/businesses failed");
      res.status(500).json({ error: "jarvis_businesses_read_failed" });
    }
  },
);

router.post(
  "/jarvis/businesses",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = businessBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_business" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisBusinessesTable)
        .values({
          name: parsed.data.name,
          slug: slugify(parsed.data.name),
          description: parsed.data.description ?? null,
          status: parsed.data.status ?? "active",
        })
        .returning();
      await audit(req, actor, "create", "business", row.id, { name: row.name });
      res.status(201).json({ business: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/businesses failed");
      res.status(500).json({ error: "jarvis_business_create_failed" });
    }
  },
);

router.get(
  "/jarvis/businesses/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisBusinessesTable)
        .where(eq(jarvisBusinessesTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ business: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/businesses/:id failed");
      res.status(500).json({ error: "jarvis_business_read_failed" });
    }
  },
);

router.put(
  "/jarvis/businesses/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = businessBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_business" });
      return;
    }
    try {
      const [row] = await db
        .update(jarvisBusinessesTable)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description ?? null }
            : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisBusinessesTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "business", row.id, { name: row.name });
      res.json({ business: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/businesses/:id failed");
      res.status(500).json({ error: "jarvis_business_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/businesses/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisBusinessesTable)
        .where(eq(jarvisBusinessesTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "business", row.id, { name: row.name });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/businesses/:id failed");
      res.status(500).json({ error: "jarvis_business_delete_failed" });
    }
  },
);

// ── projects ─────────────────────────────────────────────────────────────────

const projectBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  businessId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  status: statusSchema.optional(),
});

// Validate a referenced business exists before write so a well-formed but
// unknown UUID returns a 4xx domain error instead of a raw FK 500.
async function businessExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisBusinessesTable.id })
    .from(jarvisBusinessesTable)
    .where(eq(jarvisBusinessesTable.id, id))
    .limit(1);
  return Boolean(row);
}

router.get(
  "/jarvis/projects",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisProjectsTable)
        .orderBy(desc(jarvisProjectsTable.createdAt));
      res.json({ projects: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/projects failed");
      res.status(500).json({ error: "jarvis_projects_read_failed" });
    }
  },
);

router.post(
  "/jarvis/projects",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = projectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_project" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "invalid_business_reference" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisProjectsTable)
        .values({
          name: parsed.data.name,
          businessId: parsed.data.businessId ?? null,
          description: parsed.data.description ?? null,
          status: parsed.data.status ?? "active",
        })
        .returning();
      await audit(req, actor, "create", "project", row.id, { name: row.name });
      res.status(201).json({ project: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/projects failed");
      res.status(500).json({ error: "jarvis_project_create_failed" });
    }
  },
);

router.get(
  "/jarvis/projects/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisProjectsTable)
        .where(eq(jarvisProjectsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ project: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/projects/:id failed");
      res.status(500).json({ error: "jarvis_project_read_failed" });
    }
  },
);

router.put(
  "/jarvis/projects/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = projectBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_project" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "invalid_business_reference" });
      return;
    }
    try {
      const [row] = await db
        .update(jarvisProjectsTable)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.businessId !== undefined
            ? { businessId: parsed.data.businessId ?? null }
            : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description ?? null }
            : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisProjectsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "project", row.id, { name: row.name });
      res.json({ project: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/projects/:id failed");
      res.status(500).json({ error: "jarvis_project_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/projects/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisProjectsTable)
        .where(eq(jarvisProjectsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "project", row.id, { name: row.name });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/projects/:id failed");
      res.status(500).json({ error: "jarvis_project_delete_failed" });
    }
  },
);

// ── agents ───────────────────────────────────────────────────────────────────

const agentBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/agents",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisAgentsTable)
        .orderBy(desc(jarvisAgentsTable.createdAt));
      res.json({ agents: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/agents failed");
      res.status(500).json({ error: "jarvis_agents_read_failed" });
    }
  },
);

router.post(
  "/jarvis/agents",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = agentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_agent" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisAgentsTable)
        .values({
          name: parsed.data.name,
          role: parsed.data.role ?? "",
          description: parsed.data.description ?? null,
          status: parsed.data.status ?? "active",
        })
        .returning();
      await audit(req, actor, "create", "agent", row.id, { name: row.name });
      res.status(201).json({ agent: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/agents failed");
      res.status(500).json({ error: "jarvis_agent_create_failed" });
    }
  },
);

router.get(
  "/jarvis/agents/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisAgentsTable)
        .where(eq(jarvisAgentsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ agent: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/agents/:id failed");
      res.status(500).json({ error: "jarvis_agent_read_failed" });
    }
  },
);

router.put(
  "/jarvis/agents/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = agentBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_agent" });
      return;
    }
    try {
      const [row] = await db
        .update(jarvisAgentsTable)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.role !== undefined ? { role: parsed.data.role ?? "" } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description ?? null }
            : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisAgentsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "agent", row.id, { name: row.name });
      res.json({ agent: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/agents/:id failed");
      res.status(500).json({ error: "jarvis_agent_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/agents/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisAgentsTable)
        .where(eq(jarvisAgentsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "agent", row.id, { name: row.name });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/agents/:id failed");
      res.status(500).json({ error: "jarvis_agent_delete_failed" });
    }
  },
);

// ── workflows ────────────────────────────────────────────────────────────────

const workflowBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  trigger: z.string().trim().max(120).optional().nullable(),
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/workflows",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisWorkflowsTable)
        .orderBy(desc(jarvisWorkflowsTable.createdAt));
      res.json({ workflows: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/workflows failed");
      res.status(500).json({ error: "jarvis_workflows_read_failed" });
    }
  },
);

router.post(
  "/jarvis/workflows",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = workflowBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_workflow" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisWorkflowsTable)
        .values({
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          trigger: parsed.data.trigger ?? "manual",
          status: parsed.data.status ?? "active",
        })
        .returning();
      await audit(req, actor, "create", "workflow", row.id, { name: row.name });
      res.status(201).json({ workflow: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/workflows failed");
      res.status(500).json({ error: "jarvis_workflow_create_failed" });
    }
  },
);

router.get(
  "/jarvis/workflows/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisWorkflowsTable)
        .where(eq(jarvisWorkflowsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ workflow: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/workflows/:id failed");
      res.status(500).json({ error: "jarvis_workflow_read_failed" });
    }
  },
);

router.put(
  "/jarvis/workflows/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = workflowBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_workflow" });
      return;
    }
    try {
      const [row] = await db
        .update(jarvisWorkflowsTable)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description ?? null }
            : {}),
          ...(parsed.data.trigger !== undefined
            ? { trigger: parsed.data.trigger ?? "manual" }
            : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisWorkflowsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "workflow", row.id, { name: row.name });
      res.json({ workflow: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/workflows/:id failed");
      res.status(500).json({ error: "jarvis_workflow_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/workflows/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisWorkflowsTable)
        .where(eq(jarvisWorkflowsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "workflow", row.id, { name: row.name });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/workflows/:id failed");
      res.status(500).json({ error: "jarvis_workflow_delete_failed" });
    }
  },
);

// ── audit logs ───────────────────────────────────────────────────────────────

router.get(
  "/jarvis/audit-logs",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    try {
      const rows = await db
        .select()
        .from(jarvisAuditLogsTable)
        .orderBy(desc(jarvisAuditLogsTable.createdAt))
        .limit(limit);
      res.json({ auditLogs: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/audit-logs failed");
      res.status(500).json({ error: "jarvis_audit_logs_read_failed" });
    }
  },
);

// ── settings ─────────────────────────────────────────────────────────────────

router.get(
  "/jarvis/settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db.select().from(jarvisSettingsTable);
      const settings: Record<string, unknown> = {};
      for (const r of rows) settings[r.key] = r.value;
      res.json({ settings });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/settings failed");
      res.status(500).json({ error: "jarvis_settings_read_failed" });
    }
  },
);

const settingsBodySchema = z.record(z.string().min(1).max(120), z.unknown());

router.put(
  "/jarvis/settings",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = settingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_settings" });
      return;
    }
    const entries = Object.entries(parsed.data);
    try {
      for (const [key, value] of entries) {
        await db
          .insert(jarvisSettingsTable)
          .values({ key, value: value ?? null, updatedBy: actor.userId })
          .onConflictDoUpdate({
            target: jarvisSettingsTable.key,
            set: { value: value ?? null, updatedBy: actor.userId, updatedAt: new Date() },
          });
      }
      await audit(req, actor, "update", "settings", null, {
        keys: entries.map(([k]) => k),
      });
      const rows = await db.select().from(jarvisSettingsTable);
      const settings: Record<string, unknown> = {};
      for (const r of rows) settings[r.key] = r.value;
      res.json({ settings });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/settings failed");
      res.status(500).json({ error: "jarvis_settings_write_failed" });
    }
  },
);

export default router;
