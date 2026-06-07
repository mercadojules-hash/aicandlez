import { db } from "@workspace/db";
import { jarvisFindingsTable, jarvisMemoriesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import type { AgentHandler } from "../types.js";

/**
 * Memory Agent — curates the executive memory. Promotes critical open findings
 * into durable memory entries (additive, deduped by source) so the knowledge
 * corpus retains high-signal context. Only creates — never deletes or rewrites
 * existing memories.
 */
export const memoryAgent: AgentHandler = {
  type: "memory",
  label: "Memory Agent",
  description:
    "Curates executive memory — promotes critical findings into durable, deduped memory entries.",
  defaultCapabilities: ["memory-curation", "knowledge-promotion", "dedup"],
  defaultScheduleSeconds: 600,
  defaultPriority: 30,

  async run(ctx) {
    const criticalFindings = await db
      .select()
      .from(jarvisFindingsTable)
      .where(
        and(
          eq(jarvisFindingsTable.status, "open"),
          eq(jarvisFindingsTable.severity, "critical"),
        ),
      )
      .orderBy(asc(jarvisFindingsTable.createdAt), asc(jarvisFindingsTable.id));

    ctx.log(
      `Evaluating ${criticalFindings.length} critical finding(s) for memory promotion`,
    );

    let promoted = 0;
    for (const f of criticalFindings.slice(0, 25)) {
      // Dedupe: skip if a memory already references this finding.
      const existing = await db
        .select({ id: jarvisMemoriesTable.id })
        .from(jarvisMemoriesTable)
        .where(
          and(
            eq(jarvisMemoriesTable.sourceType, "jarvis_finding"),
            eq(jarvisMemoriesTable.sourceId, f.id),
          ),
        )
        .limit(1);
      if (existing[0]) continue;

      const [row] = await db
        .insert(jarvisMemoriesTable)
        .values({
          title: `Critical finding: ${f.title}`,
          content: f.summary ?? f.detail ?? null,
          memoryType: "fact",
          importance: "high",
          businessId: f.businessId,
          sourceType: "jarvis_finding",
          sourceId: f.id,
          pinned: true,
          tags: ["risk", "auto-promoted"],
          createdBy: "jarvis-runtime",
        })
        .returning();
      if (row) {
        promoted += 1;
        await ctx.audit("promote_memory", "jarvis_memory", row.id, {
          findingId: f.id,
        });
      }
    }

    if (promoted > 0) {
      await ctx.emitMessage({
        toAgentType: "chief_of_staff",
        messageType: "notify",
        subject: "Memory corpus updated",
        body: `Promoted ${promoted} critical finding(s) into durable memory.`,
        payload: { promoted },
      });
    }

    return {
      summary: `Reviewed ${criticalFindings.length} critical finding(s); promoted ${promoted} to memory`,
      itemsProcessed: criticalFindings.length,
      output: { evaluated: criticalFindings.length, promoted },
    };
  },
};
