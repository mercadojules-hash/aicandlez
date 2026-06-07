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
import { eq, desc, asc, sql, ilike, or, and } from "drizzle-orm";
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
  jarvisAgentRunsTable,
  jarvisAgentMessagesTable,
  jarvisWorkflowRunsTable,
  jarvisWorkflowStepsTable,
  jarvisDelegationsTable,
  jarvisRoutingRulesTable,
  jarvisEscalationChainsTable,
  jarvisEscalationChainStepsTable,
  jarvisCommandsTable,
  jarvisPoliciesTable,
  jarvisPolicyEvaluationsTable,
  jarvisAgentTrustTable,
  jarvisBudgetsTable,
  jarvisCognitionRunsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { agentRuntime } from "../lib/jarvis/runtime.js";
import { agentBus } from "../lib/jarvis/agentBus.js";
import { AGENT_CATALOG, getHandler } from "../lib/jarvis/registry.js";
import {
  startWorkflowRun,
  routeCommand,
  findVerb,
  VERB_REGISTRY,
} from "../lib/jarvis/orchestrator/index.js";
import { evaluateGovernance } from "../lib/jarvis/governance/index.js";
import { synthesizeBriefing } from "../lib/jarvis/cognition/briefingCognition.js";
import { publishBriefing } from "../lib/jarvis/cognition/publishGate.js";
import {
  checkCognitionBudget,
  runIndexerPass,
  getSemanticStatus,
  setSemanticRetrievalEnabled,
  setIndexerTickEnabled,
} from "../lib/jarvis/cognition/index.js";
import { raw } from "express";
import {
  getVoiceEnabled,
  setVoiceEnabled,
} from "../lib/jarvis/cognition/voice/config.js";
import { runVoiceTurn } from "../lib/jarvis/cognition/voice/orchestrator.js";
import {
  startSession,
  getSession,
  listSessions,
  endSession,
  getSessionTurns,
  purgeSession,
} from "../lib/jarvis/cognition/voice/sessions.js";

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
  // Sprint 5 runtime registry fields. runtimeStatus/lastRun* are runtime-owned
  // and never accepted from the client.
  agentType: z.string().trim().min(1).max(48).optional(),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(40).optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
  enabled: z.boolean().optional(),
  scheduleSeconds: z.number().int().min(5).max(86_400).optional().nullable(),
  priority: z.number().int().min(0).max(1000).optional(),
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
          ...(parsed.data.agentType !== undefined
            ? { agentType: parsed.data.agentType }
            : {}),
          ...(parsed.data.capabilities !== undefined
            ? { capabilities: parsed.data.capabilities ?? null }
            : {}),
          ...(parsed.data.config !== undefined
            ? { config: (parsed.data.config as Record<string, unknown>) ?? null }
            : {}),
          ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
          ...(parsed.data.scheduleSeconds !== undefined
            ? { scheduleSeconds: parsed.data.scheduleSeconds ?? null }
            : {}),
          ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
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
          ...(parsed.data.agentType !== undefined
            ? { agentType: parsed.data.agentType }
            : {}),
          ...(parsed.data.capabilities !== undefined
            ? { capabilities: parsed.data.capabilities ?? null }
            : {}),
          ...(parsed.data.config !== undefined
            ? { config: (parsed.data.config as Record<string, unknown>) ?? null }
            : {}),
          ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
          ...(parsed.data.scheduleSeconds !== undefined
            ? { scheduleSeconds: parsed.data.scheduleSeconds ?? null }
            : {}),
          ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
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

// ── agent runtime (Sprint 5) ─────────────────────────────────────────────────
//
// A SEPARATE loop/bus from the AICandlez trading engine. OFF by default. The
// runtime is a single GLOBAL loop, so control-plane mutations (start/stop/run/
// seed) are admin-gated (requireRole) — any signed-in user could otherwise
// affect every user's runtime. Read endpoints stay requireAuth. Every mutation
// is audit-logged. Agents are deterministic + advisory-safe (no destructive
// autonomy, no external LLM).

const runtimeStartSchema = z.object({
  tickIntervalMs: z.number().int().min(5_000).max(3_600_000).optional(),
});

router.get(
  "/jarvis/runtime/status",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({ status: agentRuntime.status(), catalog: AGENT_CATALOG });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/runtime/status failed");
      res.status(500).json({ error: "jarvis_runtime_status_failed" });
    }
  },
);

router.post(
  "/jarvis/runtime/start",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = runtimeStartSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_runtime_options" });
      return;
    }
    try {
      const status = agentRuntime.start({ tickIntervalMs: parsed.data.tickIntervalMs });
      await audit(req, actor, "start", "agent_runtime", null, {
        tickIntervalMs: status.tickIntervalMs,
      });
      res.json({ status });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/runtime/start failed");
      res.status(500).json({ error: "jarvis_runtime_start_failed" });
    }
  },
);

router.post(
  "/jarvis/runtime/stop",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const status = agentRuntime.stop();
      await audit(req, actor, "stop", "agent_runtime", null);
      res.json({ status });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/runtime/stop failed");
      res.status(500).json({ error: "jarvis_runtime_stop_failed" });
    }
  },
);

router.get(
  "/jarvis/runtime/activity",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
      const { events, cursor } = agentBus.getRecent(limit);
      res.json({ events, cursor, status: agentRuntime.status() });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/runtime/activity failed");
      res.status(500).json({ error: "jarvis_runtime_activity_failed" });
    }
  },
);

router.get(
  "/jarvis/runtime/overview",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [
        agents,
        [totalRuns],
        runsByStatus,
        [totalMessages],
        recentRuns,
        recentMessages,
      ] = await Promise.all([
        db.select().from(jarvisAgentsTable).orderBy(jarvisAgentsTable.priority),
        db.select({ c: sql<number>`count(*)::int` }).from(jarvisAgentRunsTable),
        db
          .select({
            status: jarvisAgentRunsTable.status,
            c: sql<number>`count(*)::int`,
          })
          .from(jarvisAgentRunsTable)
          .groupBy(jarvisAgentRunsTable.status),
        db.select({ c: sql<number>`count(*)::int` }).from(jarvisAgentMessagesTable),
        db
          .select()
          .from(jarvisAgentRunsTable)
          .orderBy(desc(jarvisAgentRunsTable.startedAt))
          .limit(20),
        db
          .select()
          .from(jarvisAgentMessagesTable)
          .orderBy(desc(jarvisAgentMessagesTable.createdAt))
          .limit(20),
      ]);

      const handled = new Set(AGENT_CATALOG.map((c) => c.type));
      const fleet = agents.map((a) => ({
        ...a,
        hasHandler: handled.has(a.agentType),
      }));

      res.json({
        runtime: agentRuntime.status(),
        catalog: AGENT_CATALOG,
        fleet,
        totals: {
          agents: agents.length,
          enabled: agents.filter((a) => a.enabled).length,
          runs: totalRuns?.c ?? 0,
          messages: totalMessages?.c ?? 0,
        },
        runsByStatus,
        recentRuns,
        recentMessages,
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/runtime/overview failed");
      res.status(500).json({ error: "jarvis_runtime_overview_failed" });
    }
  },
);

router.post(
  "/jarvis/agents/:id/run",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const outcome = await agentRuntime.runAgentById(String(req.params.id), "manual");
      if (!outcome.ok && outcome.runId == null) {
        const code =
          outcome.error === "Agent not found" ? 404 : 409;
        res.status(code).json({ error: outcome.error ?? "agent_run_failed" });
        return;
      }
      await audit(req, actor, "run", "agent", String(req.params.id), {
        trigger: "manual",
        runId: outcome.runId,
        ok: outcome.ok,
      });
      res.json({ outcome });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/agents/:id/run failed");
      res.status(500).json({ error: "jarvis_agent_run_failed" });
    }
  },
);

router.post(
  "/jarvis/agents/seed-defaults",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const existing = await db
        .select({ agentType: jarvisAgentsTable.agentType })
        .from(jarvisAgentsTable);
      const present = new Set(existing.map((r) => r.agentType));
      const toCreate = AGENT_CATALOG.filter((c) => !present.has(c.type));
      const created: { id: string; name: string; agentType: string }[] = [];
      for (const c of toCreate) {
        const [row] = await db
          .insert(jarvisAgentsTable)
          .values({
            name: c.label,
            role: c.label,
            description: c.description,
            status: "active",
            agentType: c.type,
            capabilities: c.defaultCapabilities,
            enabled: false,
            scheduleSeconds: c.defaultScheduleSeconds,
            priority: c.defaultPriority,
          })
          .returning();
        if (row) {
          created.push({ id: row.id, name: row.name, agentType: row.agentType });
          await audit(req, actor, "seed", "agent", row.id, { agentType: row.agentType });
        }
      }
      res.json({ created, skipped: AGENT_CATALOG.length - toCreate.length });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/agents/seed-defaults failed");
      res.status(500).json({ error: "jarvis_agent_seed_failed" });
    }
  },
);

router.get(
  "/jarvis/agent-runs",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const conds = [];
      if (req.query.agentId) {
        conds.push(eq(jarvisAgentRunsTable.agentId, String(req.query.agentId)));
      }
      if (req.query.status) {
        conds.push(eq(jarvisAgentRunsTable.status, String(req.query.status)));
      }
      const rows = await db
        .select()
        .from(jarvisAgentRunsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(jarvisAgentRunsTable.startedAt))
        .limit(limit);
      res.json({ runs: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/agent-runs failed");
      res.status(500).json({ error: "jarvis_agent_runs_read_failed" });
    }
  },
);

router.get(
  "/jarvis/agent-messages",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const conds = [];
      if (req.query.status) {
        conds.push(eq(jarvisAgentMessagesTable.status, String(req.query.status)));
      }
      if (req.query.runId) {
        conds.push(eq(jarvisAgentMessagesTable.runId, String(req.query.runId)));
      }
      const rows = await db
        .select()
        .from(jarvisAgentMessagesTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(jarvisAgentMessagesTable.createdAt))
        .limit(limit);
      res.json({ messages: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/agent-messages failed");
      res.status(500).json({ error: "jarvis_agent_messages_read_failed" });
    }
  },
);

// ── workflows ────────────────────────────────────────────────────────────────

const workflowStepSchema = z.object({
  key: z.string().trim().min(1).max(120),
  agentType: z.string().trim().min(1).max(48),
  action: z.string().trim().min(1).max(64),
  dependsOn: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  condition: z.string().trim().max(200).optional(),
});

const workflowDefinitionSchema = z.object({
  steps: z.array(workflowStepSchema).max(50),
});

const workflowBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  trigger: z.string().trim().max(120).optional().nullable(),
  status: statusSchema.optional(),
  definition: workflowDefinitionSchema.optional().nullable(),
  enabled: z.boolean().optional(),
});

/** Normalize a validated definition into the stored JarvisWorkflowStep shape. */
function normalizeWorkflowDefinition(
  def: z.infer<typeof workflowDefinitionSchema>,
): { steps: { key: string; agentType: string; action: string; dependsOn: string[]; input?: Record<string, unknown>; condition?: string }[] } {
  return {
    steps: def.steps.map((s) => ({
      key: s.key,
      agentType: s.agentType,
      action: s.action,
      dependsOn: s.dependsOn ?? [],
      ...(s.input !== undefined ? { input: s.input } : {}),
      ...(s.condition !== undefined ? { condition: s.condition } : {}),
    })),
  };
}

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
  requireRole(["admin", "super-admin"]),
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
          definition: parsed.data.definition
            ? normalizeWorkflowDefinition(parsed.data.definition)
            : null,
          enabled: parsed.data.enabled ?? false,
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
  requireRole(["admin", "super-admin"]),
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
          ...(parsed.data.definition !== undefined
            ? {
                definition: parsed.data.definition
                  ? normalizeWorkflowDefinition(parsed.data.definition)
                  : null,
                version: sql`${jarvisWorkflowsTable.version} + 1`,
              }
            : {}),
          ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
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
  requireRole(["admin", "super-admin"]),
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

// ── Sprint 8: cognition (advisory-only LLM plane) ────────────────────────────
// OFF by default + admin-gated. The advisory plane PROPOSES briefing drafts; the
// deterministic control plane is untouched. PUBLISH is the governed action (D1):
// weak/ungrounded cognition drafts require approval (D2), but stay visible.

const COGNITION_ENABLED_KEY = "cognition.enabled";

async function isCognitionEnabled(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(jarvisSettingsTable)
    .where(eq(jarvisSettingsTable.key, COGNITION_ENABLED_KEY))
    .limit(1);
  return row?.value === true;
}

const cognitionEnabledSchema = z.object({ enabled: z.boolean() });

router.get(
  "/jarvis/cognition/enabled",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({ enabled: await isCognitionEnabled() });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/cognition/enabled failed");
      res.status(500).json({ error: "jarvis_cognition_enabled_read_failed" });
    }
  },
);

router.post(
  "/jarvis/cognition/enabled",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = cognitionEnabledSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_cognition_toggle" });
      return;
    }
    try {
      await db
        .insert(jarvisSettingsTable)
        .values({
          key: COGNITION_ENABLED_KEY,
          value: parsed.data.enabled,
          updatedBy: actor.userId,
        })
        .onConflictDoUpdate({
          target: jarvisSettingsTable.key,
          set: {
            value: parsed.data.enabled,
            updatedBy: actor.userId,
            updatedAt: new Date(),
          },
        });
      await audit(req, actor, "update", "settings", null, {
        key: COGNITION_ENABLED_KEY,
        enabled: parsed.data.enabled,
      });
      res.json({ enabled: parsed.data.enabled });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/cognition/enabled failed");
      res.status(500).json({ error: "jarvis_cognition_enabled_write_failed" });
    }
  },
);

const generateBriefingSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  instructions: z.string().trim().max(4000).optional().nullable(),
  period: z.string().trim().min(1).max(32).optional(),
  audience: z.string().trim().min(1).max(64).optional(),
  businessId: z.string().uuid().optional().nullable(),
  executiveUserId: z.string().uuid().optional().nullable(),
});

// Synthesize a DRAFT briefing via cognition. Admin-gated + globally toggled OFF
// by default. Degraded outcomes return 200 with ok=false and write NO draft.
router.post(
  "/jarvis/briefings/generate",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = generateBriefingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_generate_request" });
      return;
    }
    if (!(await isCognitionEnabled())) {
      res.status(409).json({ error: "cognition_disabled" });
      return;
    }
    if (parsed.data.businessId && !(await businessExists(parsed.data.businessId))) {
      res.status(400).json({ error: "unknown_business" });
      return;
    }
    try {
      const result = await synthesizeBriefing({
        query: parsed.data.query,
        instructions: parsed.data.instructions ?? null,
        period: parsed.data.period ?? null,
        audience: parsed.data.audience ?? null,
        businessId: parsed.data.businessId ?? null,
        createdBy: actor.email ?? actor.userId,
        executiveUserId: parsed.data.executiveUserId ?? null,
      });
      if (result.ok && result.briefing) {
        await audit(req, actor, "create", "briefing", result.briefing.id, {
          title: result.briefing.title,
          sourceMode: "cognition",
          runId: result.runId,
          groundingScore: result.groundingScore,
        });
      }
      res.status(result.ok ? 201 : 200).json({
        ok: result.ok,
        status: result.status,
        briefing: result.briefing,
        runId: result.runId,
        groundingScore: result.groundingScore,
        citations: result.citations,
        reason: result.reason,
      });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/briefings/generate failed");
      res.status(500).json({ error: "jarvis_briefing_generate_failed" });
    }
  },
);

// Governed publish. Reuses approvals + policy_evaluations; weak/ungrounded
// cognition drafts route to require_approval and stay visible as drafts (D2).
router.post(
  "/jarvis/briefings/:id/publish",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [briefing] = await db
        .select()
        .from(jarvisBriefingsTable)
        .where(eq(jarvisBriefingsTable.id, String(req.params.id)))
        .limit(1);
      if (!briefing) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const outcome = await publishBriefing(briefing, actor.email ?? actor.userId);
      await audit(req, actor, "update", "briefing", briefing.id, {
        action: "publish",
        decision: outcome.decision,
        reason: outcome.reason,
        approvalId: outcome.approvalId,
      });
      res.json({
        decision: outcome.decision,
        reason: outcome.reason,
        groundingScore: outcome.groundingScore,
        threshold: outcome.threshold,
        approvalId: outcome.approvalId,
        briefing: outcome.briefing,
      });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/briefings/:id/publish failed");
      res.status(500).json({ error: "jarvis_briefing_publish_failed" });
    }
  },
);

router.get(
  "/jarvis/cognition/runs",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisCognitionRunsTable)
        .orderBy(desc(jarvisCognitionRunsTable.createdAt))
        .limit(100);
      res.json({ runs: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/cognition/runs failed");
      res.status(500).json({ error: "jarvis_cognition_runs_read_failed" });
    }
  },
);

router.get(
  "/jarvis/cognition/runs/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisCognitionRunsTable)
        .where(eq(jarvisCognitionRunsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ run: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/cognition/runs/:id failed");
      res.status(500).json({ error: "jarvis_cognition_run_read_failed" });
    }
  },
);

router.get(
  "/jarvis/cognition/overview",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [enabled, runs, budget] = await Promise.all([
        isCognitionEnabled(),
        db
          .select()
          .from(jarvisCognitionRunsTable)
          .orderBy(desc(jarvisCognitionRunsTable.createdAt)),
        checkCognitionBudget(),
      ]);

      const byStatus: Record<string, number> = {};
      const byKind: Record<string, number> = {};
      let totalCostMicros = 0;
      let groundedRuns = 0;
      let groundingSum = 0;
      for (const r of runs) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
        totalCostMicros += r.costMicros ?? 0;
        if (r.groundingScore != null) {
          groundedRuns += 1;
          groundingSum += r.groundingScore;
        }
      }

      res.json({
        enabled,
        counts: {
          totalRuns: runs.length,
          byStatus,
          byKind,
        },
        totalCostMicros,
        avgGroundingScore:
          groundedRuns > 0 ? Math.round(groundingSum / groundedRuns) : null,
        budget: budget
          ? {
              name: budget.name,
              consumedMicros: budget.consumedMicros,
              limitMicros: budget.limitMicros,
              exceeded: budget.exceeded,
            }
          : null,
        recentRuns: runs.slice(0, 10),
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/cognition/overview failed");
      res.status(500).json({ error: "jarvis_cognition_overview_read_failed" });
    }
  },
);

// ── Sprint 9: semantic retrieval (hybrid lexical + pgvector) ──────────────────
// OFF by default + admin-gated. `jarvis_embeddings` is a DERIVED read index; these
// routes only flip the toggles and trigger the deterministic indexer/backfill —
// the cognition model never writes corpus and PUBLISH stays governed. Status read
// is requireAuth; every mutation (toggle, indexer tick, backfill) is requireRole.

router.get(
  "/jarvis/cognition/semantic/status",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await getSemanticStatus());
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/cognition/semantic/status failed");
      res.status(500).json({ error: "jarvis_semantic_status_read_failed" });
    }
  },
);

const semanticEnabledSchema = z.object({ enabled: z.boolean() });

router.post(
  "/jarvis/cognition/semantic/enabled",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = semanticEnabledSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_semantic_toggle" });
      return;
    }
    try {
      await setSemanticRetrievalEnabled(parsed.data.enabled, actor.userId);
      await audit(req, actor, "update", "settings", null, {
        key: "cognition.semanticRetrieval.enabled",
        enabled: parsed.data.enabled,
      });
      res.json({ enabled: parsed.data.enabled });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/cognition/semantic/enabled failed");
      res.status(500).json({ error: "jarvis_semantic_enabled_write_failed" });
    }
  },
);

router.post(
  "/jarvis/cognition/semantic/indexer-tick",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = semanticEnabledSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_indexer_tick_toggle" });
      return;
    }
    try {
      await setIndexerTickEnabled(parsed.data.enabled, actor.userId);
      await audit(req, actor, "update", "settings", null, {
        key: "cognition.semanticIndexer.tickEnabled",
        enabled: parsed.data.enabled,
      });
      res.json({ enabled: parsed.data.enabled });
    } catch (err) {
      req.log.error(
        { err },
        "POST /jarvis/cognition/semantic/indexer-tick failed",
      );
      res.status(500).json({ error: "jarvis_indexer_tick_write_failed" });
    }
  },
);

const backfillSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
});

router.post(
  "/jarvis/cognition/semantic/backfill",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = backfillSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_backfill_request" });
      return;
    }
    try {
      const result = await runIndexerPass({ limit: parsed.data.limit });
      await audit(req, actor, "execute", "settings", null, {
        action: "semantic_backfill",
        upserted: result.upserted,
        scanned: result.scanned,
        budgetExceeded: result.budgetExceeded,
      });
      res.json(result);
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/cognition/semantic/backfill failed");
      res.status(500).json({ error: "jarvis_semantic_backfill_failed" });
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

// ── Sprint 6 — orchestration & coordination ──────────────────────────────────
//
// Coordination surfaces pumped from the SAME single runtime tick (workflow runs,
// delegations, escalation chains, executive commands). Reads stay requireAuth;
// execute/control mutations are admin-gated (the orchestrator is one global
// loop). All mutations are advisory-safe (no destructive autonomy) + audited.

async function resolveAgentRef(opts: {
  agentId?: string | null;
  agentType?: string | null;
}): Promise<{ id: string; name: string } | null> {
  if (opts.agentId) {
    const [a] = await db
      .select({ id: jarvisAgentsTable.id, name: jarvisAgentsTable.name })
      .from(jarvisAgentsTable)
      .where(eq(jarvisAgentsTable.id, opts.agentId))
      .limit(1);
    return a ?? null;
  }
  if (opts.agentType) {
    const [a] = await db
      .select({ id: jarvisAgentsTable.id, name: jarvisAgentsTable.name })
      .from(jarvisAgentsTable)
      .where(eq(jarvisAgentsTable.agentType, opts.agentType))
      .orderBy(asc(jarvisAgentsTable.createdAt), asc(jarvisAgentsTable.id))
      .limit(1);
    return a ?? null;
  }
  return null;
}

// ── workflow execution ───────────────────────────────────────────────────────

router.post(
  "/jarvis/workflows/:id/execute",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = z
      .object({ context: z.record(z.string(), z.unknown()).optional().nullable() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_execute_options" });
      return;
    }
    try {
      const outcome = await startWorkflowRun({
        workflowId: String(req.params.id),
        trigger: "manual",
        context: parsed.data.context ?? null,
        initiatedBy: actor.email ?? actor.userId,
      });
      if (!outcome.ok) {
        const code = outcome.error === "Workflow not found" ? 404 : 409;
        res.status(code).json({ error: outcome.error ?? "workflow_execute_failed" });
        return;
      }
      await audit(req, actor, "execute", "workflow", String(req.params.id), {
        runId: outcome.runId,
      });
      res.status(202).json({ runId: outcome.runId });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/workflows/:id/execute failed");
      res.status(500).json({ error: "jarvis_workflow_execute_failed" });
    }
  },
);

// ── workflow runs ────────────────────────────────────────────────────────────

router.get(
  "/jarvis/workflow-runs",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    try {
      const conds = [];
      if (req.query.workflowId) {
        conds.push(eq(jarvisWorkflowRunsTable.workflowId, String(req.query.workflowId)));
      }
      if (req.query.status) {
        conds.push(eq(jarvisWorkflowRunsTable.status, String(req.query.status)));
      }
      const rows = await db
        .select()
        .from(jarvisWorkflowRunsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(jarvisWorkflowRunsTable.startedAt))
        .limit(limit);
      res.json({ workflowRuns: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/workflow-runs failed");
      res.status(500).json({ error: "jarvis_workflow_runs_read_failed" });
    }
  },
);

router.get(
  "/jarvis/workflow-runs/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [run] = await db
        .select()
        .from(jarvisWorkflowRunsTable)
        .where(eq(jarvisWorkflowRunsTable.id, String(req.params.id)))
        .limit(1);
      if (!run) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const steps = await db
        .select()
        .from(jarvisWorkflowStepsTable)
        .where(eq(jarvisWorkflowStepsTable.workflowRunId, run.id))
        .orderBy(asc(jarvisWorkflowStepsTable.sequence), asc(jarvisWorkflowStepsTable.id));
      res.json({ workflowRun: run, steps });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/workflow-runs/:id failed");
      res.status(500).json({ error: "jarvis_workflow_run_read_failed" });
    }
  },
);

// ── delegations ──────────────────────────────────────────────────────────────

const delegationBodySchema = z.object({
  toAgentId: z.string().uuid().optional().nullable(),
  toAgentType: z.string().trim().max(48).optional().nullable(),
  objective: z.string().trim().min(1).max(300),
  action: z.string().trim().max(64).optional().nullable(),
  input: z.record(z.string(), z.unknown()).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
});

router.get(
  "/jarvis/delegations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    try {
      const conds = [];
      if (req.query.status) {
        conds.push(eq(jarvisDelegationsTable.status, String(req.query.status)));
      }
      const rows = await db
        .select()
        .from(jarvisDelegationsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(jarvisDelegationsTable.createdAt))
        .limit(limit);
      res.json({ delegations: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/delegations failed");
      res.status(500).json({ error: "jarvis_delegations_read_failed" });
    }
  },
);

router.post(
  "/jarvis/delegations",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = delegationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_delegation" });
      return;
    }
    if (!parsed.data.toAgentId && !parsed.data.toAgentType) {
      res.status(400).json({ error: "delegation_target_required" });
      return;
    }
    try {
      const target = await resolveAgentRef({
        agentId: parsed.data.toAgentId,
        agentType: parsed.data.toAgentType,
      });
      if (!target) {
        res.status(400).json({ error: "delegation_target_not_found" });
        return;
      }
      const [row] = await db
        .insert(jarvisDelegationsTable)
        .values({
          toAgentId: target.id,
          toAgentName: target.name,
          objective: parsed.data.objective,
          action: parsed.data.action ?? null,
          input: parsed.data.input ?? null,
          status: "assigned",
          priority: parsed.data.priority ?? "medium",
          dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
          createdBy: actor.email ?? actor.userId,
        })
        .returning();
      await audit(req, actor, "create", "delegation", row.id, {
        toAgentName: row.toAgentName,
        objective: row.objective,
      });
      res.status(201).json({ delegation: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/delegations failed");
      res.status(500).json({ error: "jarvis_delegation_create_failed" });
    }
  },
);

router.get(
  "/jarvis/delegations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisDelegationsTable)
        .where(eq(jarvisDelegationsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ delegation: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/delegations/:id failed");
      res.status(500).json({ error: "jarvis_delegation_read_failed" });
    }
  },
);

// ── routing rules ────────────────────────────────────────────────────────────

const routingRuleBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  matchType: z
    .enum(["any", "command", "category", "capability", "keyword"])
    .optional(),
  matchValue: z.string().trim().max(200).optional().nullable(),
  targetAgentType: z.string().trim().max(48).optional().nullable(),
  targetAgentId: z.string().uuid().optional().nullable(),
  chainId: z.string().uuid().optional().nullable(),
  fallbackAgentType: z.string().trim().max(48).optional().nullable(),
  priority: z.number().int().min(0).max(100_000).optional(),
  enabled: z.boolean().optional(),
});

router.get(
  "/jarvis/routing-rules",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisRoutingRulesTable)
        .orderBy(desc(jarvisRoutingRulesTable.priority), asc(jarvisRoutingRulesTable.createdAt));
      res.json({ routingRules: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/routing-rules failed");
      res.status(500).json({ error: "jarvis_routing_rules_read_failed" });
    }
  },
);

router.post(
  "/jarvis/routing-rules/test",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = z
      .object({
        verb: z.string().trim().max(64).optional().nullable(),
        category: z.string().trim().max(64).optional().nullable(),
        capability: z.string().trim().max(64).optional().nullable(),
        text: z.string().trim().max(500).optional().nullable(),
        keywords: z.array(z.string().trim().max(64)).max(25).optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_route_input" });
      return;
    }
    try {
      const result = await routeCommand({
        verb: parsed.data.verb,
        category: parsed.data.category,
        capability: parsed.data.capability,
        text: parsed.data.text,
        keywords: parsed.data.keywords,
      });
      res.json({ result });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/routing-rules/test failed");
      res.status(500).json({ error: "jarvis_routing_rule_test_failed" });
    }
  },
);

router.post(
  "/jarvis/routing-rules",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = routingRuleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_routing_rule" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisRoutingRulesTable)
        .values({
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          matchType: parsed.data.matchType ?? "any",
          matchValue: parsed.data.matchValue ?? null,
          targetAgentType: parsed.data.targetAgentType ?? null,
          targetAgentId: parsed.data.targetAgentId ?? null,
          chainId: parsed.data.chainId ?? null,
          fallbackAgentType: parsed.data.fallbackAgentType ?? null,
          priority: parsed.data.priority ?? 100,
          enabled: parsed.data.enabled ?? true,
          createdBy: actor.email ?? actor.userId,
        })
        .returning();
      await audit(req, actor, "create", "routing_rule", row.id, { name: row.name });
      res.status(201).json({ routingRule: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/routing-rules failed");
      res.status(500).json({ error: "jarvis_routing_rule_create_failed" });
    }
  },
);

router.put(
  "/jarvis/routing-rules/:id",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = routingRuleBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_routing_rule" });
      return;
    }
    try {
      const d = parsed.data;
      const [row] = await db
        .update(jarvisRoutingRulesTable)
        .set({
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.description !== undefined ? { description: d.description ?? null } : {}),
          ...(d.matchType !== undefined ? { matchType: d.matchType } : {}),
          ...(d.matchValue !== undefined ? { matchValue: d.matchValue ?? null } : {}),
          ...(d.targetAgentType !== undefined
            ? { targetAgentType: d.targetAgentType ?? null }
            : {}),
          ...(d.targetAgentId !== undefined
            ? { targetAgentId: d.targetAgentId ?? null }
            : {}),
          ...(d.chainId !== undefined ? { chainId: d.chainId ?? null } : {}),
          ...(d.fallbackAgentType !== undefined
            ? { fallbackAgentType: d.fallbackAgentType ?? null }
            : {}),
          ...(d.priority !== undefined ? { priority: d.priority } : {}),
          ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisRoutingRulesTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "routing_rule", row.id, { name: row.name });
      res.json({ routingRule: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/routing-rules/:id failed");
      res.status(500).json({ error: "jarvis_routing_rule_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/routing-rules/:id",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisRoutingRulesTable)
        .where(eq(jarvisRoutingRulesTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "routing_rule", row.id, { name: row.name });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/routing-rules/:id failed");
      res.status(500).json({ error: "jarvis_routing_rule_delete_failed" });
    }
  },
);

// ── escalation chains ────────────────────────────────────────────────────────

const escalationChainBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  enabled: z.boolean().optional(),
  status: statusSchema.optional(),
});

const escalationChainStepBodySchema = z.object({
  level: z.number().int().min(0).max(100).optional(),
  sequence: z.number().int().min(0).max(100).optional(),
  agentType: z.string().trim().max(48).optional().nullable(),
  agentId: z.string().uuid().optional().nullable(),
  slaSeconds: z.number().int().min(60).max(2_592_000).optional(),
  notifyRole: z.string().trim().max(32).optional().nullable(),
  instruction: z.string().trim().max(5000).optional().nullable(),
});

async function loadChainSteps(chainId: string) {
  return db
    .select()
    .from(jarvisEscalationChainStepsTable)
    .where(eq(jarvisEscalationChainStepsTable.chainId, chainId))
    .orderBy(
      asc(jarvisEscalationChainStepsTable.level),
      asc(jarvisEscalationChainStepsTable.sequence),
      asc(jarvisEscalationChainStepsTable.id),
    );
}

router.get(
  "/jarvis/escalation-chains",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const chains = await db
        .select()
        .from(jarvisEscalationChainsTable)
        .orderBy(desc(jarvisEscalationChainsTable.createdAt));
      const steps = await db
        .select()
        .from(jarvisEscalationChainStepsTable)
        .orderBy(
          asc(jarvisEscalationChainStepsTable.level),
          asc(jarvisEscalationChainStepsTable.sequence),
          asc(jarvisEscalationChainStepsTable.id),
        );
      const byChain = new Map<string, typeof steps>();
      for (const s of steps) {
        if (!s.chainId) continue;
        const list = byChain.get(s.chainId) ?? [];
        list.push(s);
        byChain.set(s.chainId, list);
      }
      res.json({
        escalationChains: chains.map((c) => ({
          ...c,
          steps: byChain.get(c.id) ?? [],
        })),
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/escalation-chains failed");
      res.status(500).json({ error: "jarvis_escalation_chains_read_failed" });
    }
  },
);

router.post(
  "/jarvis/escalation-chains",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = escalationChainBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_escalation_chain" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisEscalationChainsTable)
        .values({
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          enabled: parsed.data.enabled ?? true,
          status: parsed.data.status ?? "active",
          createdBy: actor.email ?? actor.userId,
        })
        .returning();
      await audit(req, actor, "create", "escalation_chain", row.id, { name: row.name });
      res.status(201).json({ escalationChain: { ...row, steps: [] } });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/escalation-chains failed");
      res.status(500).json({ error: "jarvis_escalation_chain_create_failed" });
    }
  },
);

router.get(
  "/jarvis/escalation-chains/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [chain] = await db
        .select()
        .from(jarvisEscalationChainsTable)
        .where(eq(jarvisEscalationChainsTable.id, String(req.params.id)))
        .limit(1);
      if (!chain) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const steps = await loadChainSteps(chain.id);
      res.json({ escalationChain: { ...chain, steps } });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/escalation-chains/:id failed");
      res.status(500).json({ error: "jarvis_escalation_chain_read_failed" });
    }
  },
);

router.put(
  "/jarvis/escalation-chains/:id",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = escalationChainBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_escalation_chain" });
      return;
    }
    try {
      const d = parsed.data;
      const [row] = await db
        .update(jarvisEscalationChainsTable)
        .set({
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.description !== undefined ? { description: d.description ?? null } : {}),
          ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisEscalationChainsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const steps = await loadChainSteps(row.id);
      await audit(req, actor, "update", "escalation_chain", row.id, { name: row.name });
      res.json({ escalationChain: { ...row, steps } });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/escalation-chains/:id failed");
      res.status(500).json({ error: "jarvis_escalation_chain_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/escalation-chains/:id",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisEscalationChainsTable)
        .where(eq(jarvisEscalationChainsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "escalation_chain", row.id, { name: row.name });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/escalation-chains/:id failed");
      res.status(500).json({ error: "jarvis_escalation_chain_delete_failed" });
    }
  },
);

router.post(
  "/jarvis/escalation-chains/:id/steps",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = escalationChainStepBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_escalation_chain_step" });
      return;
    }
    try {
      const [chain] = await db
        .select({ id: jarvisEscalationChainsTable.id })
        .from(jarvisEscalationChainsTable)
        .where(eq(jarvisEscalationChainsTable.id, String(req.params.id)))
        .limit(1);
      if (!chain) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      let agentName: string | null = null;
      if (parsed.data.agentId || parsed.data.agentType) {
        const ref = await resolveAgentRef({
          agentId: parsed.data.agentId,
          agentType: parsed.data.agentType,
        });
        agentName = ref?.name ?? null;
      }
      const [row] = await db
        .insert(jarvisEscalationChainStepsTable)
        .values({
          chainId: chain.id,
          level: parsed.data.level ?? 0,
          sequence: parsed.data.sequence ?? 0,
          agentType: parsed.data.agentType ?? null,
          agentId: parsed.data.agentId ?? null,
          slaSeconds: parsed.data.slaSeconds ?? 3600,
          notifyRole: parsed.data.notifyRole ?? null,
          instruction: parsed.data.instruction ?? null,
        })
        .returning();
      await audit(req, actor, "create", "escalation_chain_step", row.id, {
        chainId: chain.id,
        agentName,
      });
      res.status(201).json({ step: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/escalation-chains/:id/steps failed");
      res.status(500).json({ error: "jarvis_escalation_chain_step_create_failed" });
    }
  },
);

router.delete(
  "/jarvis/escalation-chains/:chainId/steps/:stepId",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisEscalationChainStepsTable)
        .where(
          and(
            eq(jarvisEscalationChainStepsTable.id, String(req.params.stepId)),
            eq(jarvisEscalationChainStepsTable.chainId, String(req.params.chainId)),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "escalation_chain_step", row.id, {
        chainId: String(req.params.chainId),
      });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/escalation-chains/:chainId/steps/:stepId failed");
      res.status(500).json({ error: "jarvis_escalation_chain_step_delete_failed" });
    }
  },
);

// ── executive commands ───────────────────────────────────────────────────────

const commandBodySchema = z.object({
  verb: z.string().trim().min(1).max(64),
  commandText: z.string().trim().max(500).optional().nullable(),
  args: z.record(z.string(), z.unknown()).optional().nullable(),
});

router.get(
  "/jarvis/commands/registry",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({ registry: VERB_REGISTRY });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/commands/registry failed");
      res.status(500).json({ error: "jarvis_commands_registry_failed" });
    }
  },
);

router.get(
  "/jarvis/commands",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    try {
      const conds = [];
      if (req.query.status) {
        conds.push(eq(jarvisCommandsTable.status, String(req.query.status)));
      }
      const rows = await db
        .select()
        .from(jarvisCommandsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(jarvisCommandsTable.createdAt))
        .limit(limit);
      res.json({ commands: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/commands failed");
      res.status(500).json({ error: "jarvis_commands_read_failed" });
    }
  },
);

router.post(
  "/jarvis/commands",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = commandBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_command" });
      return;
    }
    const spec = findVerb(parsed.data.verb);
    if (!spec) {
      res.status(400).json({ error: "unknown_verb" });
      return;
    }
    try {
      const [row] = await db
        .insert(jarvisCommandsTable)
        .values({
          commandText: parsed.data.commandText?.trim() || spec.verb,
          verb: spec.verb,
          args: parsed.data.args ?? null,
          issuedBy: actor.email ?? actor.userId,
          status: "received",
        })
        .returning();
      await audit(req, actor, "issue", "command", row.id, { verb: row.verb });
      res.status(202).json({ command: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/commands failed");
      res.status(500).json({ error: "jarvis_command_create_failed" });
    }
  },
);

router.get(
  "/jarvis/commands/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisCommandsTable)
        .where(eq(jarvisCommandsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ command: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/commands/:id failed");
      res.status(500).json({ error: "jarvis_command_read_failed" });
    }
  },
);

// ── orchestration overview ───────────────────────────────────────────────────

router.get(
  "/jarvis/orchestration/overview",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [
        [workflows],
        [enabledWorkflows],
        runsByStatus,
        delegationsByStatus,
        commandsByStatus,
        [routingRules],
        [escalationChains],
        recentRuns,
        recentDelegations,
        recentCommands,
        recentMessages,
      ] = await Promise.all([
        db.select({ c: sql<number>`count(*)::int` }).from(jarvisWorkflowsTable),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(jarvisWorkflowsTable)
          .where(eq(jarvisWorkflowsTable.enabled, true)),
        db
          .select({
            status: jarvisWorkflowRunsTable.status,
            c: sql<number>`count(*)::int`,
          })
          .from(jarvisWorkflowRunsTable)
          .groupBy(jarvisWorkflowRunsTable.status),
        db
          .select({
            status: jarvisDelegationsTable.status,
            c: sql<number>`count(*)::int`,
          })
          .from(jarvisDelegationsTable)
          .groupBy(jarvisDelegationsTable.status),
        db
          .select({
            status: jarvisCommandsTable.status,
            c: sql<number>`count(*)::int`,
          })
          .from(jarvisCommandsTable)
          .groupBy(jarvisCommandsTable.status),
        db.select({ c: sql<number>`count(*)::int` }).from(jarvisRoutingRulesTable),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(jarvisEscalationChainsTable),
        db
          .select()
          .from(jarvisWorkflowRunsTable)
          .orderBy(desc(jarvisWorkflowRunsTable.startedAt))
          .limit(10),
        db
          .select()
          .from(jarvisDelegationsTable)
          .orderBy(desc(jarvisDelegationsTable.createdAt))
          .limit(10),
        db
          .select()
          .from(jarvisCommandsTable)
          .orderBy(desc(jarvisCommandsTable.createdAt))
          .limit(10),
        db
          .select()
          .from(jarvisAgentMessagesTable)
          .orderBy(desc(jarvisAgentMessagesTable.createdAt))
          .limit(25),
      ]);

      res.json({
        runtime: agentRuntime.status(),
        totals: {
          workflows: workflows?.c ?? 0,
          enabledWorkflows: enabledWorkflows?.c ?? 0,
          routingRules: routingRules?.c ?? 0,
          escalationChains: escalationChains?.c ?? 0,
        },
        runsByStatus,
        delegationsByStatus,
        commandsByStatus,
        recentRuns,
        recentDelegations,
        recentCommands,
        recentMessages,
        generatedAt: Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/orchestration/overview failed");
      res.status(500).json({ error: "jarvis_orchestration_overview_failed" });
    }
  },
);

// ── Sprint 7 — Governance, Policy & Trust ────────────────────────────────────
//
// Reads = requireAuth. Control-plane mutations (policies, budgets) =
// requireRole(admin) — they shape the global loop. Approval decisions are gated
// dynamically by the linked policy's requireApprovalRole. All mutations are
// Zod-validated + audited. Surface is `/api/jarvis/*` only; governance is
// advisory-safe (it only narrows authority) and rides the single S5 tick.

const policyScopeTypeSchema = z.enum([
  "global",
  "agent_type",
  "action",
  "verb",
  "category",
  "workflow",
]);
const policyEffectSchema = z.enum(["allow", "deny", "require_approval"]);
const policyConditionsSchema = z
  .object({
    minTrustScore: z.number().int().min(0).max(100).optional(),
    maxPerWindow: z.number().int().min(0).optional(),
    windowSeconds: z.number().int().min(1).optional(),
  })
  .strict();
const policyBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  scopeType: policyScopeTypeSchema.optional(),
  scopeValue: z.string().trim().max(200).nullish(),
  effect: policyEffectSchema.optional(),
  priority: z.number().int().min(0).max(100000).optional(),
  enabled: z.boolean().optional(),
  conditions: policyConditionsSchema.nullish(),
  requireApprovalRole: z.string().trim().min(1).max(32).optional(),
});

const budgetScopeTypeSchema = z.enum(["global", "agent_type", "action", "verb"]);
const budgetBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  scopeType: budgetScopeTypeSchema.optional(),
  scopeValue: z.string().trim().max(200).nullish(),
  limitCount: z.number().int().min(0).optional(),
  windowSeconds: z.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
});

const policyTestSchema = z.object({
  subjectType: z.enum(["command", "delegation", "workflow_step", "escalation"]),
  agentType: z.string().trim().max(48).nullish(),
  action: z.string().trim().max(64).nullish(),
  verb: z.string().trim().max(64).nullish(),
  category: z.string().trim().max(64).nullish(),
  workflowName: z.string().trim().max(200).nullish(),
});

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(2000).nullish(),
});

async function resolveActorRole(clerkUserId: string): Promise<string> {
  try {
    const [row] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);
    return row?.role ?? "user";
  } catch {
    return "user";
  }
}

// ── policies ─────────────────────────────────────────────────────────────────
router.get(
  "/jarvis/policies",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisPoliciesTable)
        .orderBy(
          desc(jarvisPoliciesTable.priority),
          asc(jarvisPoliciesTable.createdAt),
        );
      res.json({ policies: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/policies failed");
      res.status(500).json({ error: "jarvis_policies_read_failed" });
    }
  },
);

router.post(
  "/jarvis/policies/test",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = policyTestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_policy_test" });
      return;
    }
    try {
      const result = await evaluateGovernance({
        subjectType: parsed.data.subjectType,
        subjectId: "00000000-0000-0000-0000-000000000000",
        agentId: null,
        agentType: parsed.data.agentType ?? null,
        action: parsed.data.action ?? null,
        verb: parsed.data.verb ?? null,
        category: parsed.data.category ?? null,
        workflowName: parsed.data.workflowName ?? null,
      });
      res.json({ result });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/policies/test failed");
      res.status(500).json({ error: "jarvis_policy_test_failed" });
    }
  },
);

router.post(
  "/jarvis/policies",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = policyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_policy" });
      return;
    }
    const d = parsed.data;
    try {
      const [row] = await db
        .insert(jarvisPoliciesTable)
        .values({
          name: d.name,
          description: d.description ?? null,
          scopeType: d.scopeType ?? "global",
          scopeValue: d.scopeValue ?? null,
          effect: d.effect ?? "allow",
          priority: d.priority ?? 100,
          enabled: d.enabled ?? true,
          conditions: d.conditions ?? null,
          requireApprovalRole: d.requireApprovalRole ?? "admin",
          createdBy: actor.email ?? actor.userId,
        })
        .returning();
      await audit(req, actor, "create", "policy", row.id, { name: row.name });
      res.status(201).json({ policy: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/policies failed");
      res.status(500).json({ error: "jarvis_policy_create_failed" });
    }
  },
);

router.get(
  "/jarvis/policies/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisPoliciesTable)
        .where(eq(jarvisPoliciesTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ policy: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/policies/:id failed");
      res.status(500).json({ error: "jarvis_policy_read_failed" });
    }
  },
);

router.put(
  "/jarvis/policies/:id",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = policyBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_policy" });
      return;
    }
    const d = parsed.data;
    try {
      const [row] = await db
        .update(jarvisPoliciesTable)
        .set({
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.description !== undefined
            ? { description: d.description ?? null }
            : {}),
          ...(d.scopeType !== undefined ? { scopeType: d.scopeType } : {}),
          ...(d.scopeValue !== undefined
            ? { scopeValue: d.scopeValue ?? null }
            : {}),
          ...(d.effect !== undefined ? { effect: d.effect } : {}),
          ...(d.priority !== undefined ? { priority: d.priority } : {}),
          ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
          ...(d.conditions !== undefined
            ? { conditions: d.conditions ?? null }
            : {}),
          ...(d.requireApprovalRole !== undefined
            ? { requireApprovalRole: d.requireApprovalRole }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisPoliciesTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "policy", row.id, { name: row.name });
      res.json({ policy: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/policies/:id failed");
      res.status(500).json({ error: "jarvis_policy_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/policies/:id",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisPoliciesTable)
        .where(eq(jarvisPoliciesTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "policy", row.id, { name: row.name });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/policies/:id failed");
      res.status(500).json({ error: "jarvis_policy_delete_failed" });
    }
  },
);

// ── budgets ──────────────────────────────────────────────────────────────────
router.get(
  "/jarvis/budgets",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisBudgetsTable)
        .orderBy(asc(jarvisBudgetsTable.createdAt));
      res.json({ budgets: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/budgets failed");
      res.status(500).json({ error: "jarvis_budgets_read_failed" });
    }
  },
);

router.post(
  "/jarvis/budgets",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = budgetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_budget" });
      return;
    }
    const d = parsed.data;
    try {
      const [row] = await db
        .insert(jarvisBudgetsTable)
        .values({
          name: d.name,
          description: d.description ?? null,
          scopeType: d.scopeType ?? "global",
          scopeValue: d.scopeValue ?? null,
          limitCount: d.limitCount ?? 0,
          windowSeconds: d.windowSeconds ?? 3600,
          enabled: d.enabled ?? true,
          createdBy: actor.email ?? actor.userId,
        })
        .returning();
      await audit(req, actor, "create", "budget", row.id, { name: row.name });
      res.status(201).json({ budget: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/budgets failed");
      res.status(500).json({ error: "jarvis_budget_create_failed" });
    }
  },
);

router.get(
  "/jarvis/budgets/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisBudgetsTable)
        .where(eq(jarvisBudgetsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ budget: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/budgets/:id failed");
      res.status(500).json({ error: "jarvis_budget_read_failed" });
    }
  },
);

router.put(
  "/jarvis/budgets/:id",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = budgetBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_budget" });
      return;
    }
    const d = parsed.data;
    try {
      const [row] = await db
        .update(jarvisBudgetsTable)
        .set({
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.description !== undefined
            ? { description: d.description ?? null }
            : {}),
          ...(d.scopeType !== undefined ? { scopeType: d.scopeType } : {}),
          ...(d.scopeValue !== undefined
            ? { scopeValue: d.scopeValue ?? null }
            : {}),
          ...(d.limitCount !== undefined ? { limitCount: d.limitCount } : {}),
          ...(d.windowSeconds !== undefined
            ? { windowSeconds: d.windowSeconds }
            : {}),
          ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jarvisBudgetsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "update", "budget", row.id, { name: row.name });
      res.json({ budget: row });
    } catch (err) {
      req.log.error({ err }, "PUT /jarvis/budgets/:id failed");
      res.status(500).json({ error: "jarvis_budget_update_failed" });
    }
  },
);

router.delete(
  "/jarvis/budgets/:id",
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const [row] = await db
        .delete(jarvisBudgetsTable)
        .where(eq(jarvisBudgetsTable.id, String(req.params.id)))
        .returning();
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await audit(req, actor, "delete", "budget", row.id, { name: row.name });
      res.json({ ok: true, id: row.id });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/budgets/:id failed");
      res.status(500).json({ error: "jarvis_budget_delete_failed" });
    }
  },
);

// ── policy evaluations (read-only audit trail) ───────────────────────────────
router.get(
  "/jarvis/policy-evaluations",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisPolicyEvaluationsTable)
        .orderBy(desc(jarvisPolicyEvaluationsTable.createdAt))
        .limit(200);
      res.json({ evaluations: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/policy-evaluations failed");
      res.status(500).json({ error: "jarvis_policy_evaluations_read_failed" });
    }
  },
);

router.get(
  "/jarvis/policy-evaluations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisPolicyEvaluationsTable)
        .where(eq(jarvisPolicyEvaluationsTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ evaluation: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/policy-evaluations/:id failed");
      res.status(500).json({ error: "jarvis_policy_evaluation_read_failed" });
    }
  },
);

// ── agent trust (read-only scorecards) ───────────────────────────────────────
router.get(
  "/jarvis/agent-trust",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(jarvisAgentTrustTable)
        .orderBy(desc(jarvisAgentTrustTable.score));
      res.json({ trust: rows });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/agent-trust failed");
      res.status(500).json({ error: "jarvis_agent_trust_read_failed" });
    }
  },
);

router.get(
  "/jarvis/agent-trust/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [row] = await db
        .select()
        .from(jarvisAgentTrustTable)
        .where(eq(jarvisAgentTrustTable.id, String(req.params.id)))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ trust: row });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/agent-trust/:id failed");
      res.status(500).json({ error: "jarvis_agent_trust_detail_read_failed" });
    }
  },
);

// ── approval decision (resume / block a held subject) ────────────────────────
// Gated dynamically by the linked policy's requireApprovalRole. Separation of
// duties: only humans (admin / requireApprovalRole) resolve approvals; the
// governance-resume pass then continues or blocks the held subject.
router.post(
  "/jarvis/approvals/:id/decision",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_decision" });
      return;
    }
    try {
      const [approval] = await db
        .select()
        .from(jarvisApprovalsTable)
        .where(eq(jarvisApprovalsTable.id, String(req.params.id)))
        .limit(1);
      if (!approval) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      // Resolve the required approval role from the linked policy (default admin).
      let requiredRole = "admin";
      if (approval.policyId) {
        const [policy] = await db
          .select({ role: jarvisPoliciesTable.requireApprovalRole })
          .from(jarvisPoliciesTable)
          .where(eq(jarvisPoliciesTable.id, approval.policyId))
          .limit(1);
        if (policy?.role) requiredRole = policy.role;
      }
      const allowedRoles =
        requiredRole === "super-admin"
          ? ["super-admin"]
          : ["admin", "super-admin"];
      const role = await resolveActorRole((req as AuthReq).clerkUserId);
      if (!allowedRoles.includes(role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      if (approval.status !== "pending") {
        res.status(409).json({ error: "already_decided", status: approval.status });
        return;
      }

      const newStatus = parsed.data.decision === "approve" ? "approved" : "rejected";
      const [row] = await db
        .update(jarvisApprovalsTable)
        .set({
          status: newStatus,
          decidedBy: actor.email ?? actor.userId,
          decidedAt: new Date(),
          decisionReason: parsed.data.reason ?? null,
          updatedAt: new Date(),
        })
        .where(eq(jarvisApprovalsTable.id, String(req.params.id)))
        .returning();
      await audit(req, actor, "decision", "approval", row.id, {
        decision: parsed.data.decision,
        autoGenerated: row.autoGenerated,
      });
      res.json({ approval: row });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/approvals/:id/decision failed");
      res.status(500).json({ error: "jarvis_approval_decision_failed" });
    }
  },
);

// ── governance overview (dashboard read) ─────────────────────────────────────
router.get(
  "/jarvis/governance/overview",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [
        decisionBreakdown,
        pendingApprovals,
        budgets,
        trustLeaderboard,
        recentEvaluations,
      ] = await Promise.all([
        db
          .select({
            decision: jarvisPolicyEvaluationsTable.decision,
            c: sql<number>`count(*)::int`,
          })
          .from(jarvisPolicyEvaluationsTable)
          .groupBy(jarvisPolicyEvaluationsTable.decision),
        db
          .select()
          .from(jarvisApprovalsTable)
          .where(
            and(
              eq(jarvisApprovalsTable.autoGenerated, true),
              eq(jarvisApprovalsTable.status, "pending"),
            ),
          )
          .orderBy(desc(jarvisApprovalsTable.createdAt))
          .limit(25),
        db
          .select()
          .from(jarvisBudgetsTable)
          .orderBy(asc(jarvisBudgetsTable.createdAt)),
        db
          .select()
          .from(jarvisAgentTrustTable)
          .orderBy(desc(jarvisAgentTrustTable.score))
          .limit(10),
        db
          .select()
          .from(jarvisPolicyEvaluationsTable)
          .orderBy(desc(jarvisPolicyEvaluationsTable.createdAt))
          .limit(25),
      ]);
      res.json({
        decisionBreakdown,
        pendingApprovals,
        budgets,
        trustLeaderboard,
        recentEvaluations,
        generatedAt: Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/governance/overview failed");
      res.status(500).json({ error: "jarvis_governance_overview_failed" });
    }
  },
);

// ── voice (Voice v1) ─────────────────────────────────────────────────────────
//
// Admin-gated executive voice interface. OFF by default; transcripts-only (no
// audio is ever persisted). Every route is `requireAuth` + `requireRole`. The
// turn route ingests a raw audio body; all others are JSON. Two-plane discipline
// lives in the orchestrator — routes are thin and audited.

const ADMIN_ROLES = ["admin", "super-admin"];

const voiceSettingsSchema = z.object({ enabled: z.boolean() });
const voiceSessionStartSchema = z.object({
  businessId: z.string().uuid().optional().nullable(),
});
const voiceTurnQuerySchema = z.object({
  sessionId: z.string().uuid(),
  mimeType: z.string().trim().min(1).max(128).optional(),
});
const voiceTurnTextSchema = z.object({
  sessionId: z.string().uuid(),
  transcript: z.string().trim().min(1).max(4000),
  source: z.enum(["browser-stt", "text"]).optional(),
});

router.get(
  "/jarvis/voice/settings",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({ enabled: await getVoiceEnabled() });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/voice/settings failed");
      res.status(500).json({ error: "jarvis_voice_settings_read_failed" });
    }
  },
);

router.post(
  "/jarvis/voice/settings",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = voiceSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_voice_settings" });
      return;
    }
    try {
      await setVoiceEnabled(parsed.data.enabled, actor.userId);
      await audit(req, actor, "update", "voice_settings", null, {
        key: "cognition.voice.enabled",
        enabled: parsed.data.enabled,
      });
      res.json({ enabled: parsed.data.enabled });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/voice/settings failed");
      res.status(500).json({ error: "jarvis_voice_settings_write_failed" });
    }
  },
);

router.get(
  "/jarvis/voice/sessions",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({ sessions: await listSessions() });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/voice/sessions failed");
      res.status(500).json({ error: "jarvis_voice_sessions_read_failed" });
    }
  },
);

router.post(
  "/jarvis/voice/sessions",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = voiceSessionStartSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_voice_session" });
      return;
    }
    try {
      const session = await startSession({
        createdBy: actor.userId,
        userEmail: actor.email,
        businessId: parsed.data.businessId ?? null,
      });
      await audit(req, actor, "create", "voice_session", session.id);
      res.status(201).json({ session });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/voice/sessions failed");
      res.status(500).json({ error: "jarvis_voice_session_create_failed" });
    }
  },
);

router.get(
  "/jarvis/voice/sessions/:id/turns",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await getSession(String(req.params.id));
      if (!session) {
        res.status(404).json({ error: "voice_session_not_found" });
        return;
      }
      res.json({ session, turns: await getSessionTurns(String(req.params.id)) });
    } catch (err) {
      req.log.error({ err }, "GET /jarvis/voice/sessions/:id/turns failed");
      res.status(500).json({ error: "jarvis_voice_turns_read_failed" });
    }
  },
);

router.post(
  "/jarvis/voice/sessions/:id/end",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const session = await endSession(String(req.params.id));
      if (!session) {
        res.status(404).json({ error: "voice_session_not_found" });
        return;
      }
      await audit(req, actor, "update", "voice_session", session.id, {
        status: "ended",
      });
      res.json({ session });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/voice/sessions/:id/end failed");
      res.status(500).json({ error: "jarvis_voice_session_end_failed" });
    }
  },
);

router.delete(
  "/jarvis/voice/sessions/:id",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    try {
      const turnsDeleted = await purgeSession(String(req.params.id));
      await audit(req, actor, "delete", "voice_session", String(req.params.id), {
        turnsDeleted,
      });
      res.json({ purged: true, turnsDeleted });
    } catch (err) {
      req.log.error({ err }, "DELETE /jarvis/voice/sessions/:id failed");
      res.status(500).json({ error: "jarvis_voice_session_purge_failed" });
    }
  },
);

router.post(
  "/jarvis/voice/turn",
  requireAuth,
  requireRole(ADMIN_ROLES),
  raw({ type: () => true, limit: "25mb" }),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = voiceTurnQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_voice_turn" });
      return;
    }
    const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (audio.length === 0) {
      res.status(400).json({ error: "empty_audio" });
      return;
    }
    try {
      const session = await getSession(parsed.data.sessionId);
      if (!session) {
        res.status(404).json({ error: "voice_session_not_found" });
        return;
      }
      const outcome = await runVoiceTurn({
        sessionId: parsed.data.sessionId,
        audio,
        mimeType: parsed.data.mimeType || req.headers["content-type"] || "audio/webm",
        createdBy: actor.userId,
        executiveUserId: actor.userId,
        businessId: session.businessId ?? null,
      });
      await audit(req, actor, "voice_turn", "voice_turn", outcome.turnId, {
        sessionId: outcome.sessionId,
        intent: outcome.intent,
        capability: outcome.capability,
        status: outcome.status,
      });
      res.json({
        turnId: outcome.turnId,
        sessionId: outcome.sessionId,
        intent: outcome.intent,
        capability: outcome.capability,
        transcript: outcome.transcript,
        transcriptConfidence: outcome.transcriptConfidence,
        replyText: outcome.replyText,
        ttsOk: outcome.ttsOk,
        audioBase64: outcome.audio ? outcome.audio.toString("base64") : null,
        audioContentType: outcome.audioContentType,
        links: outcome.links,
        cognitionRunId: outcome.cognitionRunId,
        status: outcome.status,
        latencyMs: outcome.latencyMs,
      });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/voice/turn failed");
      res.status(500).json({ error: "jarvis_voice_turn_failed" });
    }
  },
);

// Text turn — a transcript that was produced in the browser (Web Speech API) or
// typed by the executive. No audio leaves the browser; the server skips STT and
// runs the same deterministic intent → capability → readback pipeline. This is
// the always-available path that keeps Jarvis fully operational with no speech
// vendor configured. JSON in, readback envelope (with optional TTS audio) out.
router.post(
  "/jarvis/voice/turn-text",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const actor = await resolveActor((req as AuthReq).clerkUserId);
    const parsed = voiceTurnTextSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_voice_turn" });
      return;
    }
    try {
      const session = await getSession(parsed.data.sessionId);
      if (!session) {
        res.status(404).json({ error: "voice_session_not_found" });
        return;
      }
      const outcome = await runVoiceTurn({
        sessionId: parsed.data.sessionId,
        transcript: parsed.data.transcript,
        source: parsed.data.source ?? "text",
        createdBy: actor.userId,
        executiveUserId: actor.userId,
        businessId: session.businessId ?? null,
      });
      await audit(req, actor, "voice_turn", "voice_turn", outcome.turnId, {
        sessionId: outcome.sessionId,
        intent: outcome.intent,
        capability: outcome.capability,
        status: outcome.status,
        source: parsed.data.source ?? "text",
      });
      res.json({
        turnId: outcome.turnId,
        sessionId: outcome.sessionId,
        intent: outcome.intent,
        capability: outcome.capability,
        transcript: outcome.transcript,
        transcriptConfidence: outcome.transcriptConfidence,
        replyText: outcome.replyText,
        ttsOk: outcome.ttsOk,
        audioBase64: outcome.audio ? outcome.audio.toString("base64") : null,
        audioContentType: outcome.audioContentType,
        links: outcome.links,
        cognitionRunId: outcome.cognitionRunId,
        status: outcome.status,
        latencyMs: outcome.latencyMs,
      });
    } catch (err) {
      req.log.error({ err }, "POST /jarvis/voice/turn-text failed");
      res.status(500).json({ error: "jarvis_voice_turn_failed" });
    }
  },
);

export default router;
