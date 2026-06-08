import { db } from "@workspace/db";
import {
  jarvisEscalationsTable,
  jarvisApprovalsTable,
  jarvisTasksTable,
} from "@workspace/db";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { AgentHandler } from "../types.js";

/**
 * Chief of Staff — the orchestrator. Reviews the executive queue (open
 * escalations, pending approvals, high-priority open tasks) and coordinates the
 * fleet: it hands off unassigned escalations to Operations and broadcasts a
 * posture summary. Advisory only — it never decides approvals or mutates tasks.
 */
export const chiefOfStaffAgent: AgentHandler = {
  type: "chief_of_staff",
  label: "Chief of Staff",
  description:
    "Orchestrates the agent fleet — triages escalations, approvals and high-priority tasks, and routes work via handoffs.",
  defaultCapabilities: ["orchestration", "triage", "coordination", "reporting"],
  defaultScheduleSeconds: 300,
  defaultPriority: 10,
  actions: ["triage", "status_report"],

  async run(ctx) {
    // Read-only orchestrated action — surface executive-queue counts without any
    // handoffs or messages. Safe to compose into workflows/commands.
    if (ctx.action === "status_report") {
      const [escalations, approvals, tasks] = await Promise.all([
        db
          .select()
          .from(jarvisEscalationsTable)
          .where(eq(jarvisEscalationsTable.status, "open")),
        db
          .select()
          .from(jarvisApprovalsTable)
          .where(eq(jarvisApprovalsTable.status, "pending")),
        db
          .select()
          .from(jarvisTasksTable)
          .where(
            and(
              inArray(jarvisTasksTable.priority, ["high", "urgent"]),
              ne(jarvisTasksTable.status, "done"),
            ),
          ),
      ]);
      ctx.log(
        `Status report: ${escalations.length} open escalation(s), ${approvals.length} pending approval(s), ${tasks.length} priority task(s)`,
      );
      const itemsProcessed = escalations.length + approvals.length + tasks.length;
      return {
        summary: `Status: ${escalations.length} escalation(s), ${approvals.length} approval(s), ${tasks.length} priority task(s)`,
        itemsProcessed,
        output: {
          openEscalations: escalations.length,
          pendingApprovals: approvals.length,
          highPriorityTasks: tasks.length,
        },
      };
    }

    const openEscalations = await db
      .select()
      .from(jarvisEscalationsTable)
      .where(eq(jarvisEscalationsTable.status, "open"))
      .orderBy(asc(jarvisEscalationsTable.createdAt), asc(jarvisEscalationsTable.id));
    const pendingApprovals = await db
      .select()
      .from(jarvisApprovalsTable)
      .where(eq(jarvisApprovalsTable.status, "pending"));
    const highPriorityTasks = await db
      .select()
      .from(jarvisTasksTable)
      .where(
        and(
          inArray(jarvisTasksTable.priority, ["high", "urgent"]),
          ne(jarvisTasksTable.status, "done"),
        ),
      );

    const unassigned = openEscalations.filter((e) => e.assigneeAgentId == null);
    ctx.log(
      `Reviewing ${openEscalations.length} escalation(s), ${pendingApprovals.length} approval(s), ${highPriorityTasks.length} priority task(s)`,
    );

    // Hand off unassigned escalations to Operations.
    let handoffs = 0;
    for (const esc of unassigned.slice(0, 10)) {
      await ctx.emitMessage({
        toAgentType: "operations",
        messageType: "handoff",
        subject: `Unassigned escalation needs ownership: ${esc.title}`,
        body: esc.description ?? undefined,
        payload: { escalationId: esc.id, severity: esc.severity },
      });
      handoffs += 1;
    }

    // Broadcast a posture summary for the activity feed / coordination log.
    await ctx.emitMessage({
      messageType: "notify",
      subject: "Executive posture summary",
      body: `${openEscalations.length} open escalation(s) (${unassigned.length} unassigned), ${pendingApprovals.length} pending approval(s), ${highPriorityTasks.length} high-priority task(s).`,
      payload: {
        openEscalations: openEscalations.length,
        unassignedEscalations: unassigned.length,
        pendingApprovals: pendingApprovals.length,
        highPriorityTasks: highPriorityTasks.length,
        handoffs,
      },
    });

    const itemsProcessed =
      openEscalations.length + pendingApprovals.length + highPriorityTasks.length;
    return {
      summary: `Triaged ${itemsProcessed} item(s); ${handoffs} handoff(s) to Operations`,
      itemsProcessed,
      output: {
        openEscalations: openEscalations.length,
        unassignedEscalations: unassigned.length,
        pendingApprovals: pendingApprovals.length,
        highPriorityTasks: highPriorityTasks.length,
        handoffs,
      },
    };
  },
};
