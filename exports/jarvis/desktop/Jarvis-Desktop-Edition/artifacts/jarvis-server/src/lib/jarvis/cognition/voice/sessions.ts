/**
 * Voice session lifecycle + transcript history (Voice v1).
 *
 * Read/admin CRUD over `jarvis_voice_sessions` and `jarvis_voice_turns`. Purge
 * exists so an executive can erase transcripts (privacy: transcripts-only, no
 * audio is ever stored, so purge is a complete erasure of what we retained).
 */

import { desc, eq } from "drizzle-orm";
import {
  db,
  jarvisVoiceSessionsTable,
  jarvisVoiceTurnsTable,
  type JarvisVoiceSession,
  type JarvisVoiceTurn,
} from "@workspace/db";

export async function startSession(args: {
  createdBy: string | null;
  userEmail: string | null;
  businessId?: string | null;
}): Promise<JarvisVoiceSession> {
  const [row] = await db
    .insert(jarvisVoiceSessionsTable)
    .values({
      status: "active",
      createdBy: args.createdBy,
      userEmail: args.userEmail,
      businessId: args.businessId ?? null,
    })
    .returning();
  return row;
}

export async function getSession(
  sessionId: string,
): Promise<JarvisVoiceSession | null> {
  const [row] = await db
    .select()
    .from(jarvisVoiceSessionsTable)
    .where(eq(jarvisVoiceSessionsTable.id, sessionId))
    .limit(1);
  return row ?? null;
}

export async function listSessions(limit = 30): Promise<JarvisVoiceSession[]> {
  return db
    .select()
    .from(jarvisVoiceSessionsTable)
    .orderBy(desc(jarvisVoiceSessionsTable.createdAt))
    .limit(limit);
}

export async function endSession(
  sessionId: string,
): Promise<JarvisVoiceSession | null> {
  const [row] = await db
    .update(jarvisVoiceSessionsTable)
    .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(jarvisVoiceSessionsTable.id, sessionId))
    .returning();
  return row ?? null;
}

export async function getSessionTurns(
  sessionId: string,
  limit = 100,
): Promise<JarvisVoiceTurn[]> {
  return db
    .select()
    .from(jarvisVoiceTurnsTable)
    .where(eq(jarvisVoiceTurnsTable.sessionId, sessionId))
    .orderBy(desc(jarvisVoiceTurnsTable.turnIndex))
    .limit(limit);
}

/** Erase a session and all its retained transcripts. Returns turns deleted. */
export async function purgeSession(sessionId: string): Promise<number> {
  const deletedTurns = await db
    .delete(jarvisVoiceTurnsTable)
    .where(eq(jarvisVoiceTurnsTable.sessionId, sessionId))
    .returning({ id: jarvisVoiceTurnsTable.id });
  await db
    .delete(jarvisVoiceSessionsTable)
    .where(eq(jarvisVoiceSessionsTable.id, sessionId));
  return deletedTurns.length;
}
