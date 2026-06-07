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
import { eq, desc, sql, ilike, or, and } from "drizzle-orm";
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
  jarvisTasksTable,
  jarvisDecisionsTable,
  jarvisEscalationsTable,
  jarvisApprovalsTable,
  jarvisKnowledgeCategoriesTable,
  jarvisKnowledgeAssetsTable,
  jarvisMemoriesTable,
  jarvisKnowledgeRelationshipsTable,
  jarvisFindingsTable,
  jarvisRecommendationsTable,
  jarvisInsightsTable,
  jarvisBriefingsTable,
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

// ── Sprint 2: operations layer ───────────────────────────────────────────────
// Task / Decision / Escalation / Approval management + an aggregated operations
// dashboard. Same isolation + audit posture as the Sprint 1 registries.

async function projectExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisProjectsTable.id })
    .from(jarvisProjectsTable)
    .where(eq(jarvisProjectsTable.id, id))
    .limit(1);
  return Boolean(row);
}

async function agentExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisAgentsTable.id })
    .from(jarvisAgentsTable)
    .where(eq(jarvisAgentsTable.id, id))
    .limit(1);
  return Boolean(row);
}

// Validate any provided FK before write so a well-formed but unknown UUID
// returns a 4xx domain error instead of a raw FK 500.
async function validateRefs(refs: {
  businessId?: string | null;
  projectId?: string | null;
  assigneeAgentId?: string | null;
}): Promise<string | null> {
  if (refs.businessId && !(await businessExists(refs.businessId)))
    return "invalid_business_reference";
  if (refs.projectId && !(await projectExists(refs.projectId)))
    return "invalid_project_reference";
  if (refs.assigneeAgentId && !(await agentExists(refs.assigneeAgentId)))
    return "invalid_agent_reference";
  return null;
}

const optionalUuid = z.string().uuid().optional().nullable();
const optionalText = z.string().trim().max(5000).optional().nullable();
const optionalIsoDate = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "invalid_date" })
  .optional()
  .nullable();

function toDate(v: string | null | undefined): Date | null {
  return v ? new Date(v) : null;
}

// ── tasks ────────────────────────────────────────────────────────────────────

const taskBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText,
  status: statusSchema.optional(),
  priority: z.string().trim().min(1).max(16).optional(),
  businessId: optionalUuid,
  projectId: optionalUuid,
  assigneeAgentId: optionalUuid,
  dueAt: optionalIsoDate,
});

router.get(
  "/jarvis/tasks",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisTasksTable)
        .orderBy(desc(jarvisTasksTable.createdAt));
      res.json({ tasks: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/tasks failed");
      res.status(500).json({ error: "jarvis_tasks_read_failed" });
    }
  },
);

router.post(
  "/jarvis/tasks",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = taskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_task" });
      return;
    }
    const refErr = await validateRefs(parsed.data);
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisTasksTable)
        .values({
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          status: parsed.data.status ?? "todo",
          priority: parsed.data.priority ?? "medium",
          businessId: parsed.data.businessId ?? null,
          projectId: parsed.data.projectId ?? null,
          assigneeAgentId: parsed.data.assigneeAgentId ?? null,
          dueAt: toDate(parsed.data.dueAt),
        })
        .returning();
      await audit(req, actor, "create", "task", row.id, { title: row.title });
      res.status(201).json({ task: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/tasks failed");
      res.status(500).json({ error: "jarvis_task_create_failed" });
    }
  },
);

router.get(
  "/jarvis/tasks/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisTasksTable)
        .where(eq(jarvisTasksTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ task: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/tasks/:id failed");
      res.status(500).json({ error: "jarvis_task_read_failed" });
    }
  },
);

router.put(
  "/jarvis/tasks/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = taskBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_task" });
      return;
    }
    const refErr = await validateRefs(parsed.data);
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
    const d = parsed.data;
    try {
      const [row] = await db
        .update(jarvisTasksTable)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.description !== undefined ? { description: d.description ?? null } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          ...(d.priority !== undefined ? { priority: d.priority } : {}),
          ...(d.businessId !== undefined ? { businessId: d.businessId ?? null } : {}),
          ...(d.projectId !== undefined ? { projectId: d.projectId ?? null } : {}),
          ...(d.assigneeAgentId !== undefined
            ? { assigneeAgentId: d.assigneeAgentId ?? null }
            : {}),
          ...(d.dueAt !== undefined ? { dueAt: toDate(d.dueAt) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisTasksTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "task", row.id, { title: row.title });
      res.json({ task: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/tasks/:id failed");
      res.status(500).json({ error: "jarvis_task_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/tasks/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisTasksTable)
        .where(eq(jarvisTasksTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await deleteRelationshipsForNode("task", row.id);
      await audit(req, actor, "delete", "task", row.id, { title: row.title });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/tasks/:id failed");
      res.status(500).json({ error: "jarvis_task_delete_failed" });
    }
  },
);

// ── decisions ────────────────────────────────────────────────────────────────

const decisionBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  context: optionalText,
  decision: optionalText,
  rationale: optionalText,
  status: statusSchema.optional(),
  businessId: optionalUuid,
});

// Terminal decision states stamp who decided + when.
function decisionStamp(
  status: string | undefined,
  actor: { userId: string; email: string | null },
): { decidedBy: string; decidedAt: Date } | null {
  if (status && status !== "proposed") {
    return { decidedBy: actor.email ?? actor.userId, decidedAt: new Date() };
  }
  return null;
}

router.get(
  "/jarvis/decisions",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisDecisionsTable)
        .orderBy(desc(jarvisDecisionsTable.createdAt));
      res.json({ decisions: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/decisions failed");
      res.status(500).json({ error: "jarvis_decisions_read_failed" });
    }
  },
);

router.post(
  "/jarvis/decisions",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = decisionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_decision" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "invalid_business_reference" });
      return;
    }
    const stamp = decisionStamp(parsed.data.status, actor);
    try {
      const [row] = await db
        .insert(jarvisDecisionsTable)
        .values({
          title: parsed.data.title,
          context: parsed.data.context ?? null,
          decision: parsed.data.decision ?? null,
          rationale: parsed.data.rationale ?? null,
          status: parsed.data.status ?? "proposed",
          businessId: parsed.data.businessId ?? null,
          decidedBy: stamp?.decidedBy ?? null,
          decidedAt: stamp?.decidedAt ?? null,
        })
        .returning();
      await audit(req, actor, "create", "decision", row.id, { title: row.title });
      res.status(201).json({ decision: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/decisions failed");
      res.status(500).json({ error: "jarvis_decision_create_failed" });
    }
  },
);

router.get(
  "/jarvis/decisions/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisDecisionsTable)
        .where(eq(jarvisDecisionsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ decision: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/decisions/:id failed");
      res.status(500).json({ error: "jarvis_decision_read_failed" });
    }
  },
);

router.put(
  "/jarvis/decisions/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = decisionBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_decision" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "invalid_business_reference" });
      return;
    }
    const d = parsed.data;
    const stamp = decisionStamp(d.status, actor);
    try {
      const [row] = await db
        .update(jarvisDecisionsTable)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.context !== undefined ? { context: d.context ?? null } : {}),
          ...(d.decision !== undefined ? { decision: d.decision ?? null } : {}),
          ...(d.rationale !== undefined ? { rationale: d.rationale ?? null } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          ...(d.businessId !== undefined ? { businessId: d.businessId ?? null } : {}),
          ...(d.status !== undefined
            ? stamp
              ? { decidedBy: stamp.decidedBy, decidedAt: stamp.decidedAt }
              : { decidedBy: null, decidedAt: null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisDecisionsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "decision", row.id, { title: row.title });
      res.json({ decision: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/decisions/:id failed");
      res.status(500).json({ error: "jarvis_decision_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/decisions/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisDecisionsTable)
        .where(eq(jarvisDecisionsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await deleteRelationshipsForNode("decision", row.id);
      await audit(req, actor, "delete", "decision", row.id, { title: row.title });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/decisions/:id failed");
      res.status(500).json({ error: "jarvis_decision_delete_failed" });
    }
  },
);

// ── escalations ──────────────────────────────────────────────────────────────

const escalationBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText,
  severity: z.string().trim().min(1).max(16).optional(),
  status: statusSchema.optional(),
  businessId: optionalUuid,
  assigneeAgentId: optionalUuid,
});

router.get(
  "/jarvis/escalations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisEscalationsTable)
        .orderBy(desc(jarvisEscalationsTable.createdAt));
      res.json({ escalations: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/escalations failed");
      res.status(500).json({ error: "jarvis_escalations_read_failed" });
    }
  },
);

router.post(
  "/jarvis/escalations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = escalationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_escalation" });
      return;
    }
    const refErr = await validateRefs(parsed.data);
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
    const resolved = parsed.data.status === "resolved" ? new Date() : null;
    try {
      const [row] = await db
        .insert(jarvisEscalationsTable)
        .values({
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          severity: parsed.data.severity ?? "medium",
          status: parsed.data.status ?? "open",
          businessId: parsed.data.businessId ?? null,
          assigneeAgentId: parsed.data.assigneeAgentId ?? null,
          resolvedAt: resolved,
        })
        .returning();
      await audit(req, actor, "create", "escalation", row.id, { title: row.title });
      res.status(201).json({ escalation: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/escalations failed");
      res.status(500).json({ error: "jarvis_escalation_create_failed" });
    }
  },
);

router.get(
  "/jarvis/escalations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisEscalationsTable)
        .where(eq(jarvisEscalationsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ escalation: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/escalations/:id failed");
      res.status(500).json({ error: "jarvis_escalation_read_failed" });
    }
  },
);

router.put(
  "/jarvis/escalations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = escalationBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_escalation" });
      return;
    }
    const refErr = await validateRefs(parsed.data);
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
    const d = parsed.data;
    try {
      const [row] = await db
        .update(jarvisEscalationsTable)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.description !== undefined ? { description: d.description ?? null } : {}),
          ...(d.severity !== undefined ? { severity: d.severity } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          ...(d.businessId !== undefined ? { businessId: d.businessId ?? null } : {}),
          ...(d.assigneeAgentId !== undefined
            ? { assigneeAgentId: d.assigneeAgentId ?? null }
            : {}),
          ...(d.status !== undefined
            ? { resolvedAt: d.status === "resolved" ? new Date() : null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisEscalationsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "escalation", row.id, { title: row.title });
      res.json({ escalation: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/escalations/:id failed");
      res.status(500).json({ error: "jarvis_escalation_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/escalations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisEscalationsTable)
        .where(eq(jarvisEscalationsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "escalation", row.id, { title: row.title });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/escalations/:id failed");
      res.status(500).json({ error: "jarvis_escalation_delete_failed" });
    }
  },
);

// ── approvals ────────────────────────────────────────────────────────────────

const approvalBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText,
  status: statusSchema.optional(),
  businessId: optionalUuid,
});

router.get(
  "/jarvis/approvals",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisApprovalsTable)
        .orderBy(desc(jarvisApprovalsTable.createdAt));
      res.json({ approvals: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/approvals failed");
      res.status(500).json({ error: "jarvis_approvals_read_failed" });
    }
  },
);

router.post(
  "/jarvis/approvals",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = approvalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_approval" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "invalid_business_reference" });
      return;
    }
    const decided = parsed.data.status && parsed.data.status !== "pending";
    try {
      const [row] = await db
        .insert(jarvisApprovalsTable)
        .values({
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          status: parsed.data.status ?? "pending",
          requestedBy: actor.email ?? actor.userId,
          decidedBy: decided ? (actor.email ?? actor.userId) : null,
          decidedAt: decided ? new Date() : null,
          businessId: parsed.data.businessId ?? null,
        })
        .returning();
      await audit(req, actor, "create", "approval", row.id, { title: row.title });
      res.status(201).json({ approval: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/approvals failed");
      res.status(500).json({ error: "jarvis_approval_create_failed" });
    }
  },
);

router.get(
  "/jarvis/approvals/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisApprovalsTable)
        .where(eq(jarvisApprovalsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ approval: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/approvals/:id failed");
      res.status(500).json({ error: "jarvis_approval_read_failed" });
    }
  },
);

router.put(
  "/jarvis/approvals/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = approvalBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_approval" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "invalid_business_reference" });
      return;
    }
    const d = parsed.data;
    const decided = d.status && d.status !== "pending";
    try {
      const [row] = await db
        .update(jarvisApprovalsTable)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.description !== undefined ? { description: d.description ?? null } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          ...(d.businessId !== undefined ? { businessId: d.businessId ?? null } : {}),
          ...(d.status !== undefined
            ? decided
              ? { decidedBy: actor.email ?? actor.userId, decidedAt: new Date() }
              : { decidedBy: null, decidedAt: null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisApprovalsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "approval", row.id, { title: row.title });
      res.json({ approval: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/approvals/:id failed");
      res.status(500).json({ error: "jarvis_approval_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/approvals/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisApprovalsTable)
        .where(eq(jarvisApprovalsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "approval", row.id, { title: row.title });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/approvals/:id failed");
      res.status(500).json({ error: "jarvis_approval_delete_failed" });
    }
  },
);

// ── operations dashboard (aggregate, read-only) ──────────────────────────────

function tallyBy<T>(rows: T[], pick: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = pick(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

router.get(
  "/jarvis/operations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [tasks, decisions, escalations, approvals] = await Promise.all([
        db.select().from(jarvisTasksTable).orderBy(desc(jarvisTasksTable.createdAt)),
        db
          .select()
          .from(jarvisDecisionsTable)
          .orderBy(desc(jarvisDecisionsTable.createdAt)),
        db
          .select()
          .from(jarvisEscalationsTable)
          .orderBy(desc(jarvisEscalationsTable.createdAt)),
        db
          .select()
          .from(jarvisApprovalsTable)
          .orderBy(desc(jarvisApprovalsTable.createdAt)),
      ]);

      const now = Date.now();
      const overdue = tasks.filter(
        (t) =>
          t.dueAt !== null &&
          new Date(t.dueAt).getTime() < now &&
          t.status !== "done",
      ).length;

      res.json({
        tasks: {
          total: tasks.length,
          byStatus: tallyBy(tasks, (t) => t.status),
          byPriority: tallyBy(tasks, (t) => t.priority),
          overdue,
        },
        decisions: {
          total: decisions.length,
          byStatus: tallyBy(decisions, (d) => d.status),
          pending: decisions.filter((d) => d.status === "proposed").length,
        },
        escalations: {
          total: escalations.length,
          byStatus: tallyBy(escalations, (e) => e.status),
          bySeverity: tallyBy(escalations, (e) => e.severity),
          open: escalations.filter((e) => e.status !== "resolved").length,
          criticalOpen: escalations.filter(
            (e) => e.severity === "critical" && e.status !== "resolved",
          ).length,
        },
        approvals: {
          total: approvals.length,
          byStatus: tallyBy(approvals, (a) => a.status),
          pending: approvals.filter((a) => a.status === "pending").length,
        },
        queues: {
          openTasks: tasks.filter((t) => t.status !== "done").slice(0, 8),
          openEscalations: escalations
            .filter((e) => e.status !== "resolved")
            .slice(0, 8),
          pendingApprovals: approvals.filter((a) => a.status === "pending").slice(0, 8),
          recentDecisions: decisions.slice(0, 8),
        },
        generatedAt: now,
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/operations failed");
      res.status(500).json({ error: "jarvis_operations_failed" });
    }
  },
);

// ── Sprint 3 — memory & knowledge layer ──────────────────────────────────────
// Knowledge Categories (taxonomy) · Knowledge Assets (repository) · Memories
// (executive memory) · Knowledge Relationships (typed graph edges). Search,
// knowledge-graph and memory/overview are derived read surfaces.

const KNOWLEDGE_NODE_TYPES = [
  "memory",
  "asset",
  "category",
  "decision",
  "task",
] as const;
type KnowledgeNodeType = (typeof KNOWLEDGE_NODE_TYPES)[number];

async function categoryExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisKnowledgeCategoriesTable.id })
    .from(jarvisKnowledgeCategoriesTable)
    .where(eq(jarvisKnowledgeCategoriesTable.id, id))
    .limit(1);
  return Boolean(row);
}

async function assetExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisKnowledgeAssetsTable.id })
    .from(jarvisKnowledgeAssetsTable)
    .where(eq(jarvisKnowledgeAssetsTable.id, id))
    .limit(1);
  return Boolean(row);
}

async function memoryExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisMemoriesTable.id })
    .from(jarvisMemoriesTable)
    .where(eq(jarvisMemoriesTable.id, id))
    .limit(1);
  return Boolean(row);
}

async function decisionExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisDecisionsTable.id })
    .from(jarvisDecisionsTable)
    .where(eq(jarvisDecisionsTable.id, id))
    .limit(1);
  return Boolean(row);
}

async function taskExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisTasksTable.id })
    .from(jarvisTasksTable)
    .where(eq(jarvisTasksTable.id, id))
    .limit(1);
  return Boolean(row);
}

async function nodeExists(type: KnowledgeNodeType, id: string): Promise<boolean> {
  switch (type) {
    case "memory":
      return memoryExists(id);
    case "asset":
      return assetExists(id);
    case "category":
      return categoryExists(id);
    case "decision":
      return decisionExists(id);
    case "task":
      return taskExists(id);
    default:
      return false;
  }
}

// Detach typed edges that reference a node being deleted (best-effort; the
// polymorphic relationship table carries no DB-level FK).
async function deleteRelationshipsForNode(
  type: KnowledgeNodeType,
  id: string,
): Promise<void> {
  await db.delete(jarvisKnowledgeRelationshipsTable).where(
    or(
      and(
        eq(jarvisKnowledgeRelationshipsTable.sourceType, type),
        eq(jarvisKnowledgeRelationshipsTable.sourceId, id),
      ),
      and(
        eq(jarvisKnowledgeRelationshipsTable.targetType, type),
        eq(jarvisKnowledgeRelationshipsTable.targetId, id),
      ),
    ),
  );
}

async function uniqueCategorySlug(name: string): Promise<string> {
  const base = slugify(name);
  const [clash] = await db
    .select({ id: jarvisKnowledgeCategoriesTable.id })
    .from(jarvisKnowledgeCategoriesTable)
    .where(eq(jarvisKnowledgeCategoriesTable.slug, base))
    .limit(1);
  return clash ? `${base}-${Date.now().toString(36).slice(-4)}` : base;
}

const tagsSchema = z.array(z.string().trim().min(1).max(60)).max(40).optional().nullable();
const longText = z.string().trim().max(50000).optional().nullable();

// ── knowledge categories ─────────────────────────────────────────────────────

const categoryBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  color: z.string().trim().max(32).optional().nullable(),
  parentId: optionalUuid,
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/knowledge-categories",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisKnowledgeCategoriesTable)
        .orderBy(desc(jarvisKnowledgeCategoriesTable.createdAt));
      res.json({ categories: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/knowledge-categories failed");
      res.status(500).json({ error: "jarvis_categories_read_failed" });
    }
  },
);

router.post(
  "/jarvis/knowledge-categories",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = categoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_category" });
      return;
    }
    if (parsed.data.parentId && !(await categoryExists(parsed.data.parentId))) {
      res.status(400).json({ error: "invalid_parent_reference" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisKnowledgeCategoriesTable)
        .values({
          name: parsed.data.name,
          slug: await uniqueCategorySlug(parsed.data.name),
          description: parsed.data.description ?? null,
          color: parsed.data.color ?? null,
          parentId: parsed.data.parentId ?? null,
          status: parsed.data.status ?? "active",
        })
        .returning();
      await audit(req, actor, "create", "knowledge_category", row.id, {
        name: row.name,
      });
      res.status(201).json({ category: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/knowledge-categories failed");
      res.status(500).json({ error: "jarvis_category_create_failed" });
    }
  },
);

router.get(
  "/jarvis/knowledge-categories/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisKnowledgeCategoriesTable)
        .where(eq(jarvisKnowledgeCategoriesTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ category: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/knowledge-categories/:id failed");
      res.status(500).json({ error: "jarvis_category_read_failed" });
    }
  },
);

router.put(
  "/jarvis/knowledge-categories/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const id = String(req.params.id);
    const parsed = categoryBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_category" });
      return;
    }
    if (parsed.data.parentId) {
      if (parsed.data.parentId === id) {
        res.status(400).json({ error: "category_cannot_parent_itself" });
        return;
      }
      if (!(await categoryExists(parsed.data.parentId))) {
        res.status(400).json({ error: "invalid_parent_reference" });
        return;
      }
    }
    try {
      const [row] = await db
        .update(jarvisKnowledgeCategoriesTable)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description ?? null }
            : {}),
          ...(parsed.data.color !== undefined
            ? { color: parsed.data.color ?? null }
            : {}),
          ...(parsed.data.parentId !== undefined
            ? { parentId: parsed.data.parentId ?? null }
            : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisKnowledgeCategoriesTable.id, id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "knowledge_category", row.id, {
        name: row.name,
      });
      res.json({ category: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/knowledge-categories/:id failed");
      res.status(500).json({ error: "jarvis_category_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/knowledge-categories/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const id = String(req.params.id);
    try {
      const [row] = await db
        .delete(jarvisKnowledgeCategoriesTable)
        .where(eq(jarvisKnowledgeCategoriesTable.id, id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await deleteRelationshipsForNode("category", id);
      await audit(req, actor, "delete", "knowledge_category", id, { name: row.name });
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/knowledge-categories/:id failed");
      res.status(500).json({ error: "jarvis_category_delete_failed" });
    }
  },
);

// ── knowledge assets (repository) ────────────────────────────────────────────

const assetBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: optionalText,
  content: longText,
  assetType: z.string().trim().min(1).max(32).optional(),
  sourceUrl: z.string().trim().max(2048).optional().nullable(),
  categoryId: optionalUuid,
  businessId: optionalUuid,
  tags: tagsSchema,
  status: statusSchema.optional(),
});

async function validateAssetRefs(refs: {
  categoryId?: string | null;
  businessId?: string | null;
}): Promise<string | null> {
  if (refs.categoryId && !(await categoryExists(refs.categoryId)))
    return "invalid_category_reference";
  if (refs.businessId && !(await businessExists(refs.businessId)))
    return "invalid_business_reference";
  return null;
}

router.get(
  "/jarvis/knowledge-assets",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisKnowledgeAssetsTable)
        .orderBy(desc(jarvisKnowledgeAssetsTable.updatedAt));
      res.json({ assets: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/knowledge-assets failed");
      res.status(500).json({ error: "jarvis_assets_read_failed" });
    }
  },
);

router.post(
  "/jarvis/knowledge-assets",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = assetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_asset" });
      return;
    }
    const refErr = await validateAssetRefs(parsed.data);
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisKnowledgeAssetsTable)
        .values({
          title: parsed.data.title,
          summary: parsed.data.summary ?? null,
          content: parsed.data.content ?? null,
          assetType: parsed.data.assetType ?? "document",
          sourceUrl: parsed.data.sourceUrl ?? null,
          categoryId: parsed.data.categoryId ?? null,
          businessId: parsed.data.businessId ?? null,
          tags: parsed.data.tags ?? null,
          status: parsed.data.status ?? "active",
          createdBy: actor.email ?? actor.userId,
        })
        .returning();
      await audit(req, actor, "create", "knowledge_asset", row.id, {
        title: row.title,
      });
      res.status(201).json({ asset: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/knowledge-assets failed");
      res.status(500).json({ error: "jarvis_asset_create_failed" });
    }
  },
);

router.get(
  "/jarvis/knowledge-assets/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisKnowledgeAssetsTable)
        .where(eq(jarvisKnowledgeAssetsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ asset: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/knowledge-assets/:id failed");
      res.status(500).json({ error: "jarvis_asset_read_failed" });
    }
  },
);

router.put(
  "/jarvis/knowledge-assets/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = assetBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_asset" });
      return;
    }
    const refErr = await validateAssetRefs(parsed.data);
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
    try {
      const [row] = await db
        .update(jarvisKnowledgeAssetsTable)
        .set({
          ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
          ...(parsed.data.summary !== undefined
            ? { summary: parsed.data.summary ?? null }
            : {}),
          ...(parsed.data.content !== undefined
            ? { content: parsed.data.content ?? null }
            : {}),
          ...(parsed.data.assetType !== undefined
            ? { assetType: parsed.data.assetType }
            : {}),
          ...(parsed.data.sourceUrl !== undefined
            ? { sourceUrl: parsed.data.sourceUrl ?? null }
            : {}),
          ...(parsed.data.categoryId !== undefined
            ? { categoryId: parsed.data.categoryId ?? null }
            : {}),
          ...(parsed.data.businessId !== undefined
            ? { businessId: parsed.data.businessId ?? null }
            : {}),
          ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags ?? null } : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisKnowledgeAssetsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "knowledge_asset", row.id, {
        title: row.title,
      });
      res.json({ asset: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/knowledge-assets/:id failed");
      res.status(500).json({ error: "jarvis_asset_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/knowledge-assets/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const id = String(req.params.id);
    try {
      const [row] = await db
        .delete(jarvisKnowledgeAssetsTable)
        .where(eq(jarvisKnowledgeAssetsTable.id, id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await deleteRelationshipsForNode("asset", id);
      await audit(req, actor, "delete", "knowledge_asset", id, { title: row.title });
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/knowledge-assets/:id failed");
      res.status(500).json({ error: "jarvis_asset_delete_failed" });
    }
  },
);

// ── memories (executive memory) ──────────────────────────────────────────────

const memoryBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: longText,
  memoryType: z.string().trim().min(1).max(32).optional(),
  importance: z.string().trim().min(1).max(16).optional(),
  categoryId: optionalUuid,
  businessId: optionalUuid,
  sourceType: z.string().trim().max(64).optional().nullable(),
  sourceId: z.string().trim().max(255).optional().nullable(),
  pinned: z.boolean().optional(),
  tags: tagsSchema,
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/memories",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisMemoriesTable)
        .orderBy(desc(jarvisMemoriesTable.pinned), desc(jarvisMemoriesTable.updatedAt));
      res.json({ memories: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/memories failed");
      res.status(500).json({ error: "jarvis_memories_read_failed" });
    }
  },
);

router.post(
  "/jarvis/memories",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = memoryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_memory" });
      return;
    }
    const refErr = await validateAssetRefs(parsed.data);
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisMemoriesTable)
        .values({
          title: parsed.data.title,
          content: parsed.data.content ?? null,
          memoryType: parsed.data.memoryType ?? "fact",
          importance: parsed.data.importance ?? "normal",
          categoryId: parsed.data.categoryId ?? null,
          businessId: parsed.data.businessId ?? null,
          sourceType: parsed.data.sourceType ?? null,
          sourceId: parsed.data.sourceId ?? null,
          pinned: parsed.data.pinned ?? false,
          tags: parsed.data.tags ?? null,
          status: parsed.data.status ?? "active",
          createdBy: actor.email ?? actor.userId,
        })
        .returning();
      await audit(req, actor, "create", "memory", row.id, { title: row.title });
      res.status(201).json({ memory: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/memories failed");
      res.status(500).json({ error: "jarvis_memory_create_failed" });
    }
  },
);

router.get(
  "/jarvis/memories/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisMemoriesTable)
        .where(eq(jarvisMemoriesTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ memory: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/memories/:id failed");
      res.status(500).json({ error: "jarvis_memory_read_failed" });
    }
  },
);

router.put(
  "/jarvis/memories/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = memoryBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_memory" });
      return;
    }
    const refErr = await validateAssetRefs(parsed.data);
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }
    try {
      const [row] = await db
        .update(jarvisMemoriesTable)
        .set({
          ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
          ...(parsed.data.content !== undefined
            ? { content: parsed.data.content ?? null }
            : {}),
          ...(parsed.data.memoryType !== undefined
            ? { memoryType: parsed.data.memoryType }
            : {}),
          ...(parsed.data.importance !== undefined
            ? { importance: parsed.data.importance }
            : {}),
          ...(parsed.data.categoryId !== undefined
            ? { categoryId: parsed.data.categoryId ?? null }
            : {}),
          ...(parsed.data.businessId !== undefined
            ? { businessId: parsed.data.businessId ?? null }
            : {}),
          ...(parsed.data.sourceType !== undefined
            ? { sourceType: parsed.data.sourceType ?? null }
            : {}),
          ...(parsed.data.sourceId !== undefined
            ? { sourceId: parsed.data.sourceId ?? null }
            : {}),
          ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
          ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags ?? null } : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisMemoriesTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "memory", row.id, { title: row.title });
      res.json({ memory: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/memories/:id failed");
      res.status(500).json({ error: "jarvis_memory_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/memories/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const id = String(req.params.id);
    try {
      const [row] = await db
        .delete(jarvisMemoriesTable)
        .where(eq(jarvisMemoriesTable.id, id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await deleteRelationshipsForNode("memory", id);
      await audit(req, actor, "delete", "memory", id, { title: row.title });
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/memories/:id failed");
      res.status(500).json({ error: "jarvis_memory_delete_failed" });
    }
  },
);

// ── knowledge relationships (graph edges) ────────────────────────────────────

const relationshipBodySchema = z.object({
  sourceType: z.enum(KNOWLEDGE_NODE_TYPES),
  sourceId: z.string().uuid(),
  targetType: z.enum(KNOWLEDGE_NODE_TYPES),
  targetId: z.string().uuid(),
  relationType: z.string().trim().min(1).max(48).optional(),
  note: optionalText,
});

router.get(
  "/jarvis/knowledge-relationships",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisKnowledgeRelationshipsTable)
        .orderBy(desc(jarvisKnowledgeRelationshipsTable.createdAt));
      res.json({ relationships: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/knowledge-relationships failed");
      res.status(500).json({ error: "jarvis_relationships_read_failed" });
    }
  },
);

router.post(
  "/jarvis/knowledge-relationships",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = relationshipBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_relationship" });
      return;
    }
    const { sourceType, sourceId, targetType, targetId } = parsed.data;
    if (sourceType === targetType && sourceId === targetId) {
      res.status(400).json({ error: "relationship_cannot_self_link" });
      return;
    }
    if (!(await nodeExists(sourceType, sourceId))) {
      res.status(400).json({ error: "invalid_source_reference" });
      return;
    }
    if (!(await nodeExists(targetType, targetId))) {
      res.status(400).json({ error: "invalid_target_reference" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisKnowledgeRelationshipsTable)
        .values({
          sourceType,
          sourceId,
          targetType,
          targetId,
          relationType: parsed.data.relationType ?? "relates_to",
          note: parsed.data.note ?? null,
          createdBy: actor.email ?? actor.userId,
        })
        .returning();
      await audit(req, actor, "create", "knowledge_relationship", row.id, {
        relationType: row.relationType,
      });
      res.status(201).json({ relationship: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/knowledge-relationships failed");
      res.status(500).json({ error: "jarvis_relationship_create_failed" });
    }
  },
);

router.delete(
  "/jarvis/knowledge-relationships/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const id = String(req.params.id);
    try {
      const [row] = await db
        .delete(jarvisKnowledgeRelationshipsTable)
        .where(eq(jarvisKnowledgeRelationshipsTable.id, id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "knowledge_relationship", id, {
        relationType: row.relationType,
      });
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/knowledge-relationships/:id failed");
      res.status(500).json({ error: "jarvis_relationship_delete_failed" });
    }
  },
);

// ── enterprise search ────────────────────────────────────────────────────────

router.get(
  "/jarvis/search",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const q = String(req.query.q ?? "").trim();
    const typesParam = String(req.query.types ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const wantMemories = typesParam.length === 0 || typesParam.includes("memory");
    const wantAssets = typesParam.length === 0 || typesParam.includes("asset");
    if (!q) {
      res.json({ query: "", memories: [], assets: [], total: 0 });
      return;
    }
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    try {
      const [memories, assets] = await Promise.all([
        wantMemories
          ? db
              .select()
              .from(jarvisMemoriesTable)
              .where(
                or(
                  ilike(jarvisMemoriesTable.title, like),
                  ilike(jarvisMemoriesTable.content, like),
                ),
              )
              .orderBy(desc(jarvisMemoriesTable.updatedAt))
              .limit(50)
          : Promise.resolve([]),
        wantAssets
          ? db
              .select()
              .from(jarvisKnowledgeAssetsTable)
              .where(
                or(
                  ilike(jarvisKnowledgeAssetsTable.title, like),
                  ilike(jarvisKnowledgeAssetsTable.summary, like),
                  ilike(jarvisKnowledgeAssetsTable.content, like),
                ),
              )
              .orderBy(desc(jarvisKnowledgeAssetsTable.updatedAt))
              .limit(50)
          : Promise.resolve([]),
      ]);
      res.json({
        query: q,
        memories,
        assets,
        total: memories.length + assets.length,
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/search failed");
      res.status(500).json({ error: "jarvis_search_failed" });
    }
  },
);

// ── knowledge graph (memory navigation) ──────────────────────────────────────

router.get(
  "/jarvis/knowledge-graph",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [categories, assets, memories, decisions, tasks, relationships] =
        await Promise.all([
          db
            .select()
            .from(jarvisKnowledgeCategoriesTable)
            .orderBy(desc(jarvisKnowledgeCategoriesTable.createdAt))
            .limit(300),
          db
            .select()
            .from(jarvisKnowledgeAssetsTable)
            .orderBy(desc(jarvisKnowledgeAssetsTable.updatedAt))
            .limit(300),
          db
            .select()
            .from(jarvisMemoriesTable)
            .orderBy(desc(jarvisMemoriesTable.updatedAt))
            .limit(300),
          db
            .select()
            .from(jarvisDecisionsTable)
            .orderBy(desc(jarvisDecisionsTable.createdAt))
            .limit(300),
          db
            .select()
            .from(jarvisTasksTable)
            .orderBy(desc(jarvisTasksTable.createdAt))
            .limit(300),
          db
            .select()
            .from(jarvisKnowledgeRelationshipsTable)
            .orderBy(desc(jarvisKnowledgeRelationshipsTable.createdAt))
            .limit(1000),
        ]);
      const nodes = [
        ...categories.map((c) => ({
          id: c.id,
          type: "category" as const,
          label: c.name,
          meta: { color: c.color, status: c.status },
        })),
        ...assets.map((a) => ({
          id: a.id,
          type: "asset" as const,
          label: a.title,
          meta: { assetType: a.assetType, status: a.status },
        })),
        ...memories.map((m) => ({
          id: m.id,
          type: "memory" as const,
          label: m.title,
          meta: {
            memoryType: m.memoryType,
            importance: m.importance,
            pinned: m.pinned,
          },
        })),
        ...decisions.map((d) => ({
          id: d.id,
          type: "decision" as const,
          label: d.title,
          meta: { status: d.status },
        })),
        ...tasks.map((t) => ({
          id: t.id,
          type: "task" as const,
          label: t.title,
          meta: { status: t.status, priority: t.priority },
        })),
      ];
      const edges = relationships.map((r) => ({
        id: r.id,
        source: { type: r.sourceType, id: r.sourceId },
        target: { type: r.targetType, id: r.targetId },
        relationType: r.relationType,
        note: r.note,
      }));
      res.json({
        nodes,
        edges,
        counts: {
          categories: categories.length,
          assets: assets.length,
          memories: memories.length,
          relationships: relationships.length,
        },
        generatedAt: Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/knowledge-graph failed");
      res.status(500).json({ error: "jarvis_knowledge_graph_failed" });
    }
  },
);

// ── memory dashboard (overview) ──────────────────────────────────────────────

router.get(
  "/jarvis/memory/overview",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [memories, assets, categories, relationships] = await Promise.all([
        db
          .select()
          .from(jarvisMemoriesTable)
          .orderBy(desc(jarvisMemoriesTable.updatedAt)),
        db
          .select()
          .from(jarvisKnowledgeAssetsTable)
          .orderBy(desc(jarvisKnowledgeAssetsTable.updatedAt)),
        db.select().from(jarvisKnowledgeCategoriesTable),
        db
          .select({
            relationType: jarvisKnowledgeRelationshipsTable.relationType,
          })
          .from(jarvisKnowledgeRelationshipsTable),
      ]);
      res.json({
        counts: {
          memories: memories.length,
          assets: assets.length,
          categories: categories.length,
          relationships: relationships.length,
          pinned: memories.filter((m) => m.pinned).length,
        },
        memories: {
          byType: tallyBy(memories, (m) => m.memoryType),
          byImportance: tallyBy(memories, (m) => m.importance),
        },
        assets: {
          byType: tallyBy(assets, (a) => a.assetType),
        },
        relationships: {
          byType: tallyBy(relationships, (r) => r.relationType),
        },
        pinnedMemories: memories.filter((m) => m.pinned).slice(0, 8),
        recentMemories: memories.slice(0, 8),
        recentAssets: assets.slice(0, 8),
        generatedAt: Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/memory/overview failed");
      res.status(500).json({ error: "jarvis_memory_overview_failed" });
    }
  },
);

// ── Executive Intelligence Layer (Sprint 4) ──────────────────────────────────
// Findings → Recommendations → Insights → Briefings + an intelligence overview.
// Fully isolated under /api/jarvis/*; every mutation audited.

async function findingExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jarvisFindingsTable.id })
    .from(jarvisFindingsTable)
    .where(eq(jarvisFindingsTable.id, id))
    .limit(1);
  return Boolean(row);
}

const confidenceSchema = z.number().int().min(0).max(100);

// ── findings ─────────────────────────────────────────────────────────────────

const findingBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(10000).optional().nullable(),
  detail: z.string().trim().max(20000).optional().nullable(),
  category: z.string().trim().min(1).max(64).optional(),
  severity: z.string().trim().min(1).max(16).optional(),
  confidence: confidenceSchema.optional(),
  source: z.string().trim().max(255).optional().nullable(),
  businessId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  tags: tagsSchema.optional().nullable(),
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/findings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisFindingsTable)
        .orderBy(desc(jarvisFindingsTable.createdAt));
      res.json({ findings: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/findings failed");
      res.status(500).json({ error: "jarvis_findings_read_failed" });
    }
  },
);

router.post(
  "/jarvis/findings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = findingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_finding" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    if (parsed.data.projectId && !(await projectExists(parsed.data.projectId))) {
      res.status(400).json({ error: "unknown_project" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisFindingsTable)
        .values({
          title: parsed.data.title,
          summary: parsed.data.summary ?? null,
          detail: parsed.data.detail ?? null,
          category: parsed.data.category ?? "general",
          severity: parsed.data.severity ?? "medium",
          confidence: parsed.data.confidence ?? 50,
          source: parsed.data.source ?? null,
          businessId: parsed.data.businessId ?? null,
          projectId: parsed.data.projectId ?? null,
          tags: parsed.data.tags ?? null,
          status: parsed.data.status ?? "open",
          createdBy: actor.email,
        })
        .returning();
      await audit(req, actor, "create", "finding", row.id, { title: row.title });
      res.status(201).json({ finding: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/findings failed");
      res.status(500).json({ error: "jarvis_finding_create_failed" });
    }
  },
);

router.get(
  "/jarvis/findings/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisFindingsTable)
        .where(eq(jarvisFindingsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ finding: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/findings/:id failed");
      res.status(500).json({ error: "jarvis_finding_read_failed" });
    }
  },
);

router.put(
  "/jarvis/findings/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = findingBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_finding" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    if (parsed.data.projectId && !(await projectExists(parsed.data.projectId))) {
      res.status(400).json({ error: "unknown_project" });
      return;
    }
    try {
      const d = parsed.data;
      const [row] = await db
        .update(jarvisFindingsTable)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.summary !== undefined ? { summary: d.summary ?? null } : {}),
          ...(d.detail !== undefined ? { detail: d.detail ?? null } : {}),
          ...(d.category !== undefined ? { category: d.category } : {}),
          ...(d.severity !== undefined ? { severity: d.severity } : {}),
          ...(d.confidence !== undefined ? { confidence: d.confidence } : {}),
          ...(d.source !== undefined ? { source: d.source ?? null } : {}),
          ...(d.businessId !== undefined ? { businessId: d.businessId ?? null } : {}),
          ...(d.projectId !== undefined ? { projectId: d.projectId ?? null } : {}),
          ...(d.tags !== undefined ? { tags: d.tags ?? null } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisFindingsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "finding", row.id, { title: row.title });
      res.json({ finding: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/findings/:id failed");
      res.status(500).json({ error: "jarvis_finding_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/findings/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisFindingsTable)
        .where(eq(jarvisFindingsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "finding", row.id, { title: row.title });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/findings/:id failed");
      res.status(500).json({ error: "jarvis_finding_delete_failed" });
    }
  },
);

// ── recommendations ──────────────────────────────────────────────────────────

const recommendationBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  rationale: z.string().trim().max(20000).optional().nullable(),
  action: z.string().trim().max(20000).optional().nullable(),
  priority: z.string().trim().min(1).max(16).optional(),
  impact: z.string().trim().min(1).max(16).optional(),
  effort: z.string().trim().min(1).max(16).optional(),
  findingId: z.string().uuid().optional().nullable(),
  businessId: z.string().uuid().optional().nullable(),
  tags: tagsSchema.optional().nullable(),
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/recommendations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisRecommendationsTable)
        .orderBy(desc(jarvisRecommendationsTable.createdAt));
      res.json({ recommendations: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/recommendations failed");
      res.status(500).json({ error: "jarvis_recommendations_read_failed" });
    }
  },
);

router.post(
  "/jarvis/recommendations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = recommendationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_recommendation" });
      return;
    }
    if (parsed.data.findingId && !(await findingExists(parsed.data.findingId))) {
      res.status(400).json({ error: "unknown_finding" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisRecommendationsTable)
        .values({
          title: parsed.data.title,
          rationale: parsed.data.rationale ?? null,
          action: parsed.data.action ?? null,
          priority: parsed.data.priority ?? "medium",
          impact: parsed.data.impact ?? "medium",
          effort: parsed.data.effort ?? "medium",
          findingId: parsed.data.findingId ?? null,
          businessId: parsed.data.businessId ?? null,
          tags: parsed.data.tags ?? null,
          status: parsed.data.status ?? "proposed",
          createdBy: actor.email,
        })
        .returning();
      await audit(req, actor, "create", "recommendation", row.id, {
        title: row.title,
      });
      res.status(201).json({ recommendation: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/recommendations failed");
      res.status(500).json({ error: "jarvis_recommendation_create_failed" });
    }
  },
);

router.get(
  "/jarvis/recommendations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisRecommendationsTable)
        .where(eq(jarvisRecommendationsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ recommendation: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/recommendations/:id failed");
      res.status(500).json({ error: "jarvis_recommendation_read_failed" });
    }
  },
);

router.put(
  "/jarvis/recommendations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = recommendationBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_recommendation" });
      return;
    }
    if (parsed.data.findingId && !(await findingExists(parsed.data.findingId))) {
      res.status(400).json({ error: "unknown_finding" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    try {
      const d = parsed.data;
      const [row] = await db
        .update(jarvisRecommendationsTable)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.rationale !== undefined ? { rationale: d.rationale ?? null } : {}),
          ...(d.action !== undefined ? { action: d.action ?? null } : {}),
          ...(d.priority !== undefined ? { priority: d.priority } : {}),
          ...(d.impact !== undefined ? { impact: d.impact } : {}),
          ...(d.effort !== undefined ? { effort: d.effort } : {}),
          ...(d.findingId !== undefined ? { findingId: d.findingId ?? null } : {}),
          ...(d.businessId !== undefined ? { businessId: d.businessId ?? null } : {}),
          ...(d.tags !== undefined ? { tags: d.tags ?? null } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisRecommendationsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "recommendation", row.id, {
        title: row.title,
      });
      res.json({ recommendation: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/recommendations/:id failed");
      res.status(500).json({ error: "jarvis_recommendation_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/recommendations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisRecommendationsTable)
        .where(eq(jarvisRecommendationsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "recommendation", row.id, {
        title: row.title,
      });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/recommendations/:id failed");
      res.status(500).json({ error: "jarvis_recommendation_delete_failed" });
    }
  },
);

// ── insights ─────────────────────────────────────────────────────────────────

const insightBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(20000).optional().nullable(),
  insightType: z.string().trim().min(1).max(32).optional(),
  confidence: confidenceSchema.optional(),
  source: z.string().trim().max(255).optional().nullable(),
  findingId: z.string().uuid().optional().nullable(),
  businessId: z.string().uuid().optional().nullable(),
  tags: tagsSchema.optional().nullable(),
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/insights",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisInsightsTable)
        .orderBy(desc(jarvisInsightsTable.createdAt));
      res.json({ insights: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/insights failed");
      res.status(500).json({ error: "jarvis_insights_read_failed" });
    }
  },
);

router.post(
  "/jarvis/insights",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = insightBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_insight" });
      return;
    }
    if (parsed.data.findingId && !(await findingExists(parsed.data.findingId))) {
      res.status(400).json({ error: "unknown_finding" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisInsightsTable)
        .values({
          title: parsed.data.title,
          content: parsed.data.content ?? null,
          insightType: parsed.data.insightType ?? "trend",
          confidence: parsed.data.confidence ?? 50,
          source: parsed.data.source ?? null,
          findingId: parsed.data.findingId ?? null,
          businessId: parsed.data.businessId ?? null,
          tags: parsed.data.tags ?? null,
          status: parsed.data.status ?? "active",
          createdBy: actor.email,
        })
        .returning();
      await audit(req, actor, "create", "insight", row.id, { title: row.title });
      res.status(201).json({ insight: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/insights failed");
      res.status(500).json({ error: "jarvis_insight_create_failed" });
    }
  },
);

router.get(
  "/jarvis/insights/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisInsightsTable)
        .where(eq(jarvisInsightsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ insight: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/insights/:id failed");
      res.status(500).json({ error: "jarvis_insight_read_failed" });
    }
  },
);

router.put(
  "/jarvis/insights/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = insightBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_insight" });
      return;
    }
    if (parsed.data.findingId && !(await findingExists(parsed.data.findingId))) {
      res.status(400).json({ error: "unknown_finding" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    try {
      const d = parsed.data;
      const [row] = await db
        .update(jarvisInsightsTable)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.content !== undefined ? { content: d.content ?? null } : {}),
          ...(d.insightType !== undefined ? { insightType: d.insightType } : {}),
          ...(d.confidence !== undefined ? { confidence: d.confidence } : {}),
          ...(d.source !== undefined ? { source: d.source ?? null } : {}),
          ...(d.findingId !== undefined ? { findingId: d.findingId ?? null } : {}),
          ...(d.businessId !== undefined ? { businessId: d.businessId ?? null } : {}),
          ...(d.tags !== undefined ? { tags: d.tags ?? null } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisInsightsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "insight", row.id, { title: row.title });
      res.json({ insight: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/insights/:id failed");
      res.status(500).json({ error: "jarvis_insight_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/insights/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisInsightsTable)
        .where(eq(jarvisInsightsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "insight", row.id, { title: row.title });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/insights/:id failed");
      res.status(500).json({ error: "jarvis_insight_delete_failed" });
    }
  },
);

// ── briefings ────────────────────────────────────────────────────────────────

const briefingBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(20000).optional().nullable(),
  content: z.string().trim().max(50000).optional().nullable(),
  period: z.string().trim().min(1).max(32).optional(),
  audience: z.string().trim().min(1).max(64).optional(),
  businessId: z.string().uuid().optional().nullable(),
  tags: tagsSchema.optional().nullable(),
  status: statusSchema.optional(),
});

router.get(
  "/jarvis/briefings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisBriefingsTable)
        .orderBy(desc(jarvisBriefingsTable.createdAt));
      res.json({ briefings: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/briefings failed");
      res.status(500).json({ error: "jarvis_briefings_read_failed" });
    }
  },
);

router.post(
  "/jarvis/briefings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = briefingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_briefing" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    try {
      const status = parsed.data.status ?? "draft";
      const [row] = await db
        .insert(jarvisBriefingsTable)
        .values({
          title: parsed.data.title,
          summary: parsed.data.summary ?? null,
          content: parsed.data.content ?? null,
          period: parsed.data.period ?? "weekly",
          audience: parsed.data.audience ?? "executive",
          businessId: parsed.data.businessId ?? null,
          publishedAt: status === "published" ? new Date() : null,
          tags: parsed.data.tags ?? null,
          status,
          createdBy: actor.email,
        })
        .returning();
      await audit(req, actor, "create", "briefing", row.id, { title: row.title });
      res.status(201).json({ briefing: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/briefings failed");
      res.status(500).json({ error: "jarvis_briefing_create_failed" });
    }
  },
);

router.get(
  "/jarvis/briefings/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisBriefingsTable)
        .where(eq(jarvisBriefingsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ briefing: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/briefings/:id failed");
      res.status(500).json({ error: "jarvis_briefing_read_failed" });
    }
  },
);

router.put(
  "/jarvis/briefings/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = briefingBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_briefing" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    try {
      const d = parsed.data;
      // Stamp publishedAt the first time a briefing transitions to "published".
      const [existing] = await db
        .select({
          status: jarvisBriefingsTable.status,
          publishedAt: jarvisBriefingsTable.publishedAt,
        })
        .from(jarvisBriefingsTable)
        .where(eq(jarvisBriefingsTable.id, String(req.params.id)))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      let publishedAtPatch: Record<string, Date | null> = {};
      if (d.status !== undefined) {
        if (d.status === "published" && !existing.publishedAt) {
          publishedAtPatch = { publishedAt: new Date() };
        } else if (d.status !== "published") {
          publishedAtPatch = { publishedAt: null };
        }
      }
      const [row] = await db
        .update(jarvisBriefingsTable)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.summary !== undefined ? { summary: d.summary ?? null } : {}),
          ...(d.content !== undefined ? { content: d.content ?? null } : {}),
          ...(d.period !== undefined ? { period: d.period } : {}),
          ...(d.audience !== undefined ? { audience: d.audience } : {}),
          ...(d.businessId !== undefined ? { businessId: d.businessId ?? null } : {}),
          ...(d.tags !== undefined ? { tags: d.tags ?? null } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          ...publishedAtPatch,
          updatedAt: new Date(),
        })
        .where(eq(jarvisBriefingsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "briefing", row.id, { title: row.title });
      res.json({ briefing: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/briefings/:id failed");
      res.status(500).json({ error: "jarvis_briefing_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/briefings/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisBriefingsTable)
        .where(eq(jarvisBriefingsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "briefing", row.id, { title: row.title });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/briefings/:id failed");
      res.status(500).json({ error: "jarvis_briefing_delete_failed" });
    }
  },
);

// ── intelligence overview ────────────────────────────────────────────────────

router.get(
  "/jarvis/intelligence/overview",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [findings, recommendations, insights, briefings] = await Promise.all([
        db
          .select()
          .from(jarvisFindingsTable)
          .orderBy(desc(jarvisFindingsTable.createdAt)),
        db
          .select()
          .from(jarvisRecommendationsTable)
          .orderBy(desc(jarvisRecommendationsTable.createdAt)),
        db
          .select()
          .from(jarvisInsightsTable)
          .orderBy(desc(jarvisInsightsTable.createdAt)),
        db
          .select()
          .from(jarvisBriefingsTable)
          .orderBy(desc(jarvisBriefingsTable.createdAt)),
      ]);
      res.json({
        counts: {
          findings: findings.length,
          recommendations: recommendations.length,
          insights: insights.length,
          briefings: briefings.length,
          openFindings: findings.filter(
            (f) => f.status !== "resolved" && f.status !== "dismissed",
          ).length,
          pendingRecommendations: recommendations.filter(
            (r) => r.status === "proposed",
          ).length,
        },
        findings: {
          bySeverity: tallyBy(findings, (f) => f.severity),
          byStatus: tallyBy(findings, (f) => f.status),
        },
        recommendations: {
          byPriority: tallyBy(recommendations, (r) => r.priority),
          byStatus: tallyBy(recommendations, (r) => r.status),
        },
        insights: {
          byType: tallyBy(insights, (i) => i.insightType),
        },
        briefings: {
          byStatus: tallyBy(briefings, (b) => b.status),
        },
        recentFindings: findings.slice(0, 8),
        recentRecommendations: recommendations.slice(0, 8),
        recentInsights: insights.slice(0, 8),
        recentBriefings: briefings.slice(0, 8),
        generatedAt: Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/intelligence/overview failed");
      res.status(500).json({ error: "jarvis_intelligence_overview_failed" });
    }
  },
);

export default router;
