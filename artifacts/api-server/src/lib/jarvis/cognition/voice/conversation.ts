/**
 * Multi-turn conversation context (Voice v1).
 *
 * Assembles a BOUNDED, token-budgeted window of recent turns in a session into a
 * compact string folded into cognition drafts (briefing/report). Read-only over
 * `jarvis_voice_turns`. The cap mirrors the S9 retrieval discipline: never let
 * unbounded history blow the prompt — newest turns win, oldest are dropped.
 */

import { and, desc, eq } from "drizzle-orm";
import { db, jarvisVoiceTurnsTable } from "@workspace/db";

/** Max turns and characters folded into a draft (coarse token budget). */
const MAX_CONTEXT_TURNS = 6;
const MAX_CONTEXT_CHARS = 1_500;

/**
 * Build a compact prior-conversation context string for a session, or null when
 * there is no usable history. NEVER throws — context is best-effort.
 */
export async function buildConversationContext(
  sessionId: string,
): Promise<string | null> {
  try {
    const rows = await db
      .select({
        transcript: jarvisVoiceTurnsTable.transcript,
        replyText: jarvisVoiceTurnsTable.replyText,
      })
      .from(jarvisVoiceTurnsTable)
      .where(
        and(
          eq(jarvisVoiceTurnsTable.sessionId, sessionId),
          eq(jarvisVoiceTurnsTable.status, "ok"),
        ),
      )
      .orderBy(desc(jarvisVoiceTurnsTable.turnIndex))
      .limit(MAX_CONTEXT_TURNS);

    if (rows.length === 0) return null;

    // Reverse to chronological (oldest first) for natural reading order.
    const lines: string[] = [];
    for (const r of rows.reverse()) {
      const q = (r.transcript ?? "").trim();
      const a = (r.replyText ?? "").trim();
      if (!q && !a) continue;
      if (q) lines.push(`Executive: ${q}`);
      if (a) lines.push(`Jarvis: ${a}`);
    }
    if (lines.length === 0) return null;

    let ctx = lines.join("\n");
    if (ctx.length > MAX_CONTEXT_CHARS) {
      // Keep the most recent characters (tail) within budget.
      ctx = ctx.slice(ctx.length - MAX_CONTEXT_CHARS);
    }
    return ctx;
  } catch {
    return null;
  }
}
