/**
 * Voice capability handlers (Voice v1) — the 7 read/advisory capabilities.
 *
 * Each handler is a THIN read adapter over existing Jarvis surfaces: it queries
 * `jarvis_*` tables (read-only) or calls the cognition plane to DRAFT a briefing/
 * report. None mutates domain state and none publishes — publishing a briefing
 * stays on the governed S7/S8 path, untouched. Every handler returns a concise
 * spoken-back advisory + the read entities it cited. Handlers NEVER throw; any
 * failure degrades to a spoken apology so the turn always completes.
 *
 * Budget: cognition (`think`/`synthesizeBriefing`) self-meters its own cost +
 * records its own `jarvis_cognition_runs` row, so briefing/report handlers report
 * `costMicros: 0` here (the spend is on the linked run). STT/TTS cost is metered
 * by the orchestrator (V5).
 */

import { and, desc, eq, ilike, lt, ne, or } from "drizzle-orm";
import {
  db,
  jarvisMemoriesTable,
  jarvisAgentsTable,
  jarvisTasksTable,
  jarvisProjectsTable,
} from "@workspace/db";
import { synthesizeBriefing } from "../briefingCognition.js";
import { retrieve } from "../retrieval.js";
import type {
  VoiceCapability,
  VoiceCapabilityContext,
  VoiceCapabilityResult,
  VoiceLink,
} from "./types.js";

type Handler = (ctx: VoiceCapabilityContext) => Promise<VoiceCapabilityResult>;

const LIST_LIMIT = 6;

function ok(
  capability: VoiceCapability,
  replyText: string,
  links: VoiceLink[] = [],
  extra?: { cognitionRunId?: string | null; status?: string },
): VoiceCapabilityResult {
  return {
    ok: true,
    capability,
    replyText,
    links,
    cognitionRunId: extra?.cognitionRunId ?? null,
    costMicros: 0,
    status: extra?.status ?? (links.length || replyText ? "ok" : "empty"),
    error: null,
  };
}

function degraded(
  capability: VoiceCapability,
  replyText: string,
  error: string | null,
  status = "degraded",
): VoiceCapabilityResult {
  return {
    ok: false,
    capability,
    replyText,
    links: [],
    cognitionRunId: null,
    costMicros: 0,
    status,
    error,
  };
}

/** Topic term usable as an ILIKE filter, or null when too short to be meaningful. */
function searchTerm(query: string): string | null {
  const t = query.trim();
  return t.length >= 3 ? `%${t}%` : null;
}

// ── 1 + 7: Executive Briefing / Report Generation (cognition DRAFT) ───────────
async function runCognition(
  capability: VoiceCapability,
  ctx: VoiceCapabilityContext,
  instructions: string | null,
): Promise<VoiceCapabilityResult> {
  try {
    const composedInstructions = ctx.priorContext
      ? `${instructions ?? ""}\n\nPrior conversation context (most recent last):\n${ctx.priorContext}`.trim()
      : instructions;
    const res = await synthesizeBriefing({
      query: ctx.query || "executive update",
      instructions: composedInstructions,
      audience: "executive",
      businessId: ctx.businessId ?? null,
      createdBy: ctx.createdBy ?? null,
      executiveUserId: ctx.executiveUserId ?? null,
    });
    if (!res.ok || !res.briefing) {
      const why =
        res.status === "budget_exceeded"
          ? "the cognition budget is exhausted"
          : res.reason || "I couldn't ground a confident draft";
      return degraded(
        capability,
        `I wasn't able to compile that right now — ${why}.`,
        res.reason,
        res.status === "budget_exceeded" ? "budget_exceeded" : "degraded",
      );
    }
    const b = res.briefing;
    const reply = (b.summary || b.title || "").trim() || "Draft ready.";
    const links: VoiceLink[] = (res.citations ?? []).map((c) => ({
      type: c.type,
      id: c.id,
    }));
    return ok(capability, reply, links, { cognitionRunId: res.runId });
  } catch (err) {
    return degraded(
      capability,
      "I hit an error compiling that. Please try again shortly.",
      err instanceof Error ? err.message : String(err),
      "error",
    );
  }
}

const executiveBriefing: Handler = (ctx) =>
  runCognition(
    "executive_briefing",
    ctx,
    "Produce a concise executive briefing suitable for spoken readback.",
  );

const reportGeneration: Handler = (ctx) =>
  runCognition(
    "report_generation",
    ctx,
    "Produce a focused analytical report suitable for spoken readback.",
  );

// ── 2: Memory Queries (read jarvis_memories) ─────────────────────────────────
const memoryQuery: Handler = async (ctx) => {
  try {
    const term = searchTerm(ctx.query);
    const where = term
      ? and(
          eq(jarvisMemoriesTable.status, "active"),
          or(
            ilike(jarvisMemoriesTable.title, term),
            ilike(jarvisMemoriesTable.content, term),
          ),
        )
      : eq(jarvisMemoriesTable.status, "active");
    const rows = await db
      .select()
      .from(jarvisMemoriesTable)
      .where(where)
      .orderBy(desc(jarvisMemoriesTable.pinned), desc(jarvisMemoriesTable.updatedAt))
      .limit(LIST_LIMIT);
    if (rows.length === 0) {
      return ok(
        "memory_query",
        term
          ? "I don't have any memories matching that."
          : "There are no active memories yet.",
        [],
        { status: "empty" },
      );
    }
    const titles = rows.map((r) => r.title).slice(0, 3).join("; ");
    const reply = `I found ${rows.length} relevant ${
      rows.length === 1 ? "memory" : "memories"
    }: ${titles}.`;
    return ok(
      "memory_query",
      reply,
      rows.map((r) => ({ type: "memory", id: r.id })),
    );
  } catch (err) {
    return degraded(
      "memory_query",
      "I couldn't reach memory storage just now.",
      err instanceof Error ? err.message : String(err),
      "error",
    );
  }
};

// ── 3: Knowledge Search (S9 hybrid retrieval over the corpus) ────────────────
const knowledgeSearch: Handler = async (ctx) => {
  try {
    const result = await retrieve({
      kind: "briefing",
      query: ctx.query || "",
      maxDocs: LIST_LIMIT,
      businessId: ctx.businessId ?? null,
      executiveUserId: ctx.executiveUserId ?? null,
    });
    const docs = result.docs ?? [];
    if (docs.length === 0) {
      return ok("knowledge_search", "I couldn't find anything on that.", [], {
        status: "empty",
      });
    }
    const titles = docs
      .map((d) => d.title)
      .filter(Boolean)
      .slice(0, 3)
      .join("; ");
    const reply = `I found ${docs.length} ${
      docs.length === 1 ? "result" : "results"
    }${titles ? `: ${titles}` : ""}.`;
    return ok(
      "knowledge_search",
      reply,
      docs.map((d) => ({ type: d.type, id: d.id })),
    );
  } catch (err) {
    return degraded(
      "knowledge_search",
      "Knowledge search is unavailable right now.",
      err instanceof Error ? err.message : String(err),
      "error",
    );
  }
};

// ── 4: Agent Status (read jarvis_agents fleet) ───────────────────────────────
const agentStatus: Handler = async (ctx) => {
  try {
    const term = searchTerm(ctx.query);
    const rows = await db
      .select()
      .from(jarvisAgentsTable)
      .where(term ? ilike(jarvisAgentsTable.name, term) : undefined)
      .orderBy(desc(jarvisAgentsTable.enabled), desc(jarvisAgentsTable.updatedAt))
      .limit(20);
    if (rows.length === 0) {
      return ok("agent_status", "There are no agents registered.", [], {
        status: "empty",
      });
    }
    const enabled = rows.filter((r) => r.enabled).length;
    const running = rows.filter((r) => r.runtimeStatus === "running");
    let reply = `${rows.length} ${
      rows.length === 1 ? "agent" : "agents"
    }, ${enabled} enabled`;
    reply += running.length
      ? `. Currently running: ${running.map((r) => r.name).slice(0, 3).join(", ")}.`
      : ". None are running right now.";
    return ok(
      "agent_status",
      reply,
      rows.slice(0, LIST_LIMIT).map((r) => ({ type: "agent", id: r.id })),
    );
  } catch (err) {
    return degraded(
      "agent_status",
      "I couldn't read the agent fleet status.",
      err instanceof Error ? err.message : String(err),
      "error",
    );
  }
};

// ── 5: Task Lookup (read jarvis_tasks) ───────────────────────────────────────
const taskLookup: Handler = async (ctx) => {
  try {
    const overdue = /\boverdue\b/i.test(ctx.query);
    const where = overdue
      ? and(
          lt(jarvisTasksTable.dueAt, new Date()),
          ne(jarvisTasksTable.status, "done"),
        )
      : undefined;
    const rows = await db
      .select()
      .from(jarvisTasksTable)
      .where(where)
      .orderBy(desc(jarvisTasksTable.updatedAt))
      .limit(LIST_LIMIT);
    if (rows.length === 0) {
      return ok(
        "task_lookup",
        overdue ? "No tasks are overdue." : "There are no tasks yet.",
        [],
        { status: "empty" },
      );
    }
    const open = rows.filter((r) => r.status !== "done").length;
    const titles = rows.map((r) => r.title).slice(0, 3).join("; ");
    const reply = `${rows.length} ${overdue ? "overdue " : ""}${
      rows.length === 1 ? "task" : "tasks"
    }${overdue ? "" : `, ${open} open`}: ${titles}.`;
    return ok(
      "task_lookup",
      reply,
      rows.map((r) => ({ type: "task", id: r.id })),
    );
  } catch (err) {
    return degraded(
      "task_lookup",
      "I couldn't reach the task list.",
      err instanceof Error ? err.message : String(err),
      "error",
    );
  }
};

// ── 6: Project Lookup (read jarvis_projects) ─────────────────────────────────
const projectLookup: Handler = async (ctx) => {
  try {
    const term = searchTerm(ctx.query);
    const rows = await db
      .select()
      .from(jarvisProjectsTable)
      .where(term ? ilike(jarvisProjectsTable.name, term) : undefined)
      .orderBy(desc(jarvisProjectsTable.updatedAt))
      .limit(LIST_LIMIT);
    if (rows.length === 0) {
      return ok("project_lookup", "There are no projects yet.", [], {
        status: "empty",
      });
    }
    const active = rows.filter((r) => r.status === "active").length;
    const names = rows.map((r) => r.name).slice(0, 3).join("; ");
    const reply = `${rows.length} ${
      rows.length === 1 ? "project" : "projects"
    }, ${active} active: ${names}.`;
    return ok(
      "project_lookup",
      reply,
      rows.map((r) => ({ type: "project", id: r.id })),
    );
  } catch (err) {
    return degraded(
      "project_lookup",
      "I couldn't reach the project list.",
      err instanceof Error ? err.message : String(err),
      "error",
    );
  }
};

/** Capability id → handler. The orchestrator dispatches strictly through this. */
export const CAPABILITY_HANDLERS: Record<VoiceCapability, Handler> = {
  executive_briefing: executiveBriefing,
  memory_query: memoryQuery,
  knowledge_search: knowledgeSearch,
  agent_status: agentStatus,
  task_lookup: taskLookup,
  project_lookup: projectLookup,
  report_generation: reportGeneration,
};

/** Dispatch a resolved capability. NEVER throws. */
export async function runCapability(
  capability: VoiceCapability,
  ctx: VoiceCapabilityContext,
): Promise<VoiceCapabilityResult> {
  const handler = CAPABILITY_HANDLERS[capability];
  return handler(ctx);
}
