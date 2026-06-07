import { db } from "@workspace/db";
import { jarvisTasksTable } from "@workspace/db";
import { and, asc, ne } from "drizzle-orm";
import type { AgentHandler } from "../types.js";

/**
 * Operations Agent — keeps the task queue healthy. Scans open tasks for overdue
 * and unassigned work, notifies the fleet, and raises a (deduped) escalation
 * when high-priority work is overdue. Advisory only — it does not auto-close or
 * reassign tasks.
 */
export const operationsAgent: AgentHandler = {
  type: "operations",
  label: "Operations Agent",
  description:
    "Monitors the task queue — surfaces overdue and unassigned work and escalates overdue high-priority tasks.",
  defaultCapabilities: ["task-monitoring", "sla-tracking", "escalation"],
  defaultScheduleSeconds: 120,
  defaultPriority: 20,

  async run(ctx) {
    const openTasks = await db
      .select()
      .from(jarvisTasksTable)
      .where(
        and(
          ne(jarvisTasksTable.status, "done"),
          ne(jarvisTasksTable.status, "cancelled"),
        ),
      )
      .orderBy(asc(jarvisTasksTable.createdAt), asc(jarvisTasksTable.id));

    const now = Date.now();
    const overdue = openTasks.filter(
      (t) => t.dueAt != null && new Date(t.dueAt).getTime() < now,
    );
    const unassigned = openTasks.filter((t) => t.assigneeAgentId == null);
    const overdueHighPriority = overdue.filter((t) =>
      ["high", "urgent"].includes(t.priority),
    );

    ctx.log(
      `Scanned ${openTasks.length} open task(s): ${overdue.length} overdue, ${unassigned.length} unassigned`,
    );

    if (overdue.length > 0 || unassigned.length > 0) {
      await ctx.emitMessage({
        toAgentType: "chief_of_staff",
        messageType: "notify",
        subject: "Task queue health report",
        body: `${overdue.length} overdue task(s), ${unassigned.length} unassigned task(s) out of ${openTasks.length} open.`,
        payload: {
          open: openTasks.length,
          overdue: overdue.length,
          unassigned: unassigned.length,
        },
      });
    }

    if (overdueHighPriority.length > 0) {
      await ctx.raiseEscalation({
        title: `${overdueHighPriority.length} high-priority task(s) overdue`,
        description: overdueHighPriority
          .slice(0, 5)
          .map((t) => `• ${t.title}`)
          .join("\n"),
        severity: "high",
      });
    }

    const itemsProcessed = openTasks.length;
    return {
      summary: `Reviewed ${itemsProcessed} task(s) — ${overdue.length} overdue (${overdueHighPriority.length} high-priority), ${unassigned.length} unassigned`,
      itemsProcessed,
      output: {
        open: openTasks.length,
        overdue: overdue.length,
        overdueHighPriority: overdueHighPriority.length,
        unassigned: unassigned.length,
      },
    };
  },
};
