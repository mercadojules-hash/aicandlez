import { db } from "@workspace/db";
import { jarvisFindingsTable, jarvisRecommendationsTable } from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AgentHandler } from "../types.js";

/**
 * Risk Agent — watches the intelligence corpus for danger. Scans open
 * high/critical findings and high-impact proposed recommendations. Critical
 * findings are escalated (deduped); high-severity findings are notified to the
 * Chief of Staff. Advisory only — it never changes finding status.
 */
export const riskAgent: AgentHandler = {
  type: "risk",
  label: "Risk Agent",
  description:
    "Monitors findings and recommendations for high/critical risk and escalates critical items.",
  defaultCapabilities: ["risk-monitoring", "finding-analysis", "escalation"],
  defaultScheduleSeconds: 180,
  defaultPriority: 15,

  async run(ctx) {
    const severeFindings = await db
      .select()
      .from(jarvisFindingsTable)
      .where(
        and(
          eq(jarvisFindingsTable.status, "open"),
          inArray(jarvisFindingsTable.severity, ["high", "critical"]),
        ),
      )
      .orderBy(asc(jarvisFindingsTable.createdAt), asc(jarvisFindingsTable.id));
    const highImpactRecs = await db
      .select()
      .from(jarvisRecommendationsTable)
      .where(
        and(
          eq(jarvisRecommendationsTable.status, "proposed"),
          eq(jarvisRecommendationsTable.impact, "high"),
        ),
      );

    const critical = severeFindings.filter((f) => f.severity === "critical");
    const high = severeFindings.filter((f) => f.severity === "high");

    ctx.log(
      `Scanned ${severeFindings.length} severe finding(s) (${critical.length} critical) and ${highImpactRecs.length} high-impact recommendation(s)`,
    );

    let escalated = 0;
    for (const f of critical.slice(0, 10)) {
      const id = await ctx.raiseEscalation({
        title: `Critical risk finding: ${f.title}`,
        description: f.summary ?? f.detail ?? undefined,
        severity: "critical",
        businessId: f.businessId,
      });
      if (id) escalated += 1;
    }

    if (high.length > 0 || highImpactRecs.length > 0) {
      await ctx.emitMessage({
        toAgentType: "chief_of_staff",
        messageType: "notify",
        subject: "Risk posture report",
        body: `${critical.length} critical and ${high.length} high-severity open finding(s); ${highImpactRecs.length} high-impact recommendation(s) awaiting decision.`,
        payload: {
          critical: critical.length,
          high: high.length,
          highImpactRecs: highImpactRecs.length,
        },
      });
    }

    const itemsProcessed = severeFindings.length + highImpactRecs.length;
    return {
      summary: `Assessed ${itemsProcessed} item(s); escalated ${escalated} critical finding(s)`,
      itemsProcessed,
      output: {
        critical: critical.length,
        high: high.length,
        highImpactRecs: highImpactRecs.length,
        escalated,
      },
    };
  },
};
