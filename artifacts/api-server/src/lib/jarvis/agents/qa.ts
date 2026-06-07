import { db } from "@workspace/db";
import {
  jarvisFindingsTable,
  jarvisRecommendationsTable,
  jarvisBriefingsTable,
} from "@workspace/db";
import { and, asc, eq, lt } from "drizzle-orm";
import type { AgentHandler } from "../types.js";

const isBlank = (v: string | null | undefined): boolean =>
  v == null || v.trim().length === 0;

/**
 * QA Agent — data-integrity sweep over the intelligence corpus. Flags
 * low-confidence open findings, proposed recommendations with no rationale, and
 * published briefings with empty content. Notifies the fleet and escalates when
 * integrity issues are material. Advisory only.
 */
export const qaAgent: AgentHandler = {
  type: "qa",
  label: "QA Agent",
  description:
    "Validates data integrity — low-confidence findings, rationale-less recommendations, and empty published briefings.",
  defaultCapabilities: ["data-integrity", "validation", "quality-gate"],
  defaultScheduleSeconds: 240,
  defaultPriority: 25,
  actions: ["sweep", "report"],

  async run(ctx) {
    // Read-only orchestrated action — integrity issue counts, no notify/escalate.
    if (ctx.action === "report") {
      const [lowConf, recs, briefings] = await Promise.all([
        db
          .select()
          .from(jarvisFindingsTable)
          .where(
            and(
              eq(jarvisFindingsTable.status, "open"),
              lt(jarvisFindingsTable.confidence, 30),
            ),
          ),
        db
          .select()
          .from(jarvisRecommendationsTable)
          .where(eq(jarvisRecommendationsTable.status, "proposed")),
        db
          .select()
          .from(jarvisBriefingsTable)
          .where(eq(jarvisBriefingsTable.status, "published")),
      ]);
      const recsMissingRationale = recs.filter((r) => isBlank(r.rationale)).length;
      const emptyBriefings = briefings.filter((b) => isBlank(b.content)).length;
      const totalIssues = lowConf.length + recsMissingRationale + emptyBriefings;
      ctx.log(
        `QA report: ${lowConf.length} low-confidence, ${recsMissingRationale} rationale-less, ${emptyBriefings} empty briefing(s)`,
      );
      return {
        summary: `${totalIssues} integrity issue(s) across findings, recommendations and briefings`,
        itemsProcessed: lowConf.length + recs.length + briefings.length,
        output: {
          lowConfidenceFindings: lowConf.length,
          recsMissingRationale,
          emptyBriefings,
          totalIssues,
        },
      };
    }

    const lowConfidenceFindings = await db
      .select()
      .from(jarvisFindingsTable)
      .where(
        and(
          eq(jarvisFindingsTable.status, "open"),
          lt(jarvisFindingsTable.confidence, 30),
        ),
      );
    const proposedRecs = await db
      .select()
      .from(jarvisRecommendationsTable)
      .where(eq(jarvisRecommendationsTable.status, "proposed"));
    const publishedBriefings = await db
      .select()
      .from(jarvisBriefingsTable)
      .where(eq(jarvisBriefingsTable.status, "published"))
      .orderBy(asc(jarvisBriefingsTable.createdAt), asc(jarvisBriefingsTable.id));

    const recsMissingRationale = proposedRecs.filter((r) => isBlank(r.rationale));
    const emptyBriefings = publishedBriefings.filter((b) => isBlank(b.content));

    const totalIssues =
      lowConfidenceFindings.length +
      recsMissingRationale.length +
      emptyBriefings.length;

    ctx.log(
      `QA sweep: ${lowConfidenceFindings.length} low-confidence finding(s), ${recsMissingRationale.length} rationale-less rec(s), ${emptyBriefings.length} empty briefing(s)`,
    );

    if (totalIssues > 0) {
      await ctx.emitMessage({
        toAgentType: "chief_of_staff",
        messageType: "notify",
        subject: "Data-integrity report",
        body: `${totalIssues} integrity issue(s): ${lowConfidenceFindings.length} low-confidence findings, ${recsMissingRationale.length} recommendations missing rationale, ${emptyBriefings.length} empty published briefings.`,
        payload: {
          lowConfidenceFindings: lowConfidenceFindings.length,
          recsMissingRationale: recsMissingRationale.length,
          emptyBriefings: emptyBriefings.length,
        },
      });
    }

    if (emptyBriefings.length > 0) {
      await ctx.raiseEscalation({
        title: `${emptyBriefings.length} published briefing(s) have no content`,
        description: emptyBriefings
          .slice(0, 5)
          .map((b) => `• ${b.title}`)
          .join("\n"),
        severity: "medium",
      });
    }

    return {
      summary: `Found ${totalIssues} integrity issue(s) across findings, recommendations and briefings`,
      itemsProcessed:
        lowConfidenceFindings.length + proposedRecs.length + publishedBriefings.length,
      output: {
        lowConfidenceFindings: lowConfidenceFindings.length,
        recsMissingRationale: recsMissingRationale.length,
        emptyBriefings: emptyBriefings.length,
        totalIssues,
      },
    };
  },
};
