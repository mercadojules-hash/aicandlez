/**
 * Voice turn orchestrator (Voice v1).
 *
 * The single pipeline for one PTT turn:
 *   STT → deterministic intent classification → read/advisory capability →
 *   spoken-back text → TTS → persist transcript turn.
 *
 * Two-plane discipline: STT/TTS are pure I/O (no authority); the deterministic
 * control plane owns routing; the model only DRAFTS (briefing/report) and never
 * publishes. Fail-open availability (provider down ⇒ degrade to text-only, the
 * turn still completes) and fail-safe authority (ambiguous ⇒ clarify, never act).
 * NEVER throws — every failure resolves to a persisted turn with a spoken reply.
 */

import { db, jarvisVoiceTurnsTable, jarvisVoiceSessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { consumeCognitionBudget } from "../budget.js";
import {
  estimateSttCostMicros,
  estimateTtsCostMicros,
  getVoiceEnabled,
} from "./config.js";
import { transcribe } from "./stt.js";
import { synthesize } from "./tts.js";
import { classifyIntent } from "./intentRouter.js";
import { runCapability } from "./capabilities.js";
import { buildConversationContext } from "./conversation.js";
import type { VoiceIntent, VoiceCapability, VoiceLink } from "./types.js";

export interface VoiceTurnInput {
  sessionId: string;
  audio: Buffer;
  mimeType: string;
  createdBy: string | null;
  executiveUserId?: string | null;
  businessId?: string | null;
}

export interface VoiceTurnOutcome {
  turnId: string | null;
  sessionId: string;
  intent: VoiceIntent;
  capability: VoiceCapability | null;
  transcript: string;
  transcriptConfidence: number | null;
  replyText: string;
  /** Synthesized readback audio for the HTTP response (NOT persisted). */
  audio: Buffer | null;
  audioContentType: string | null;
  ttsOk: boolean;
  status: string;
  cognitionRunId: string | null;
  links: VoiceLink[];
  costMicros: number;
  latencyMs: number;
  error: string | null;
}

/** Run one voice turn end-to-end. NEVER throws. */
export async function runVoiceTurn(
  input: VoiceTurnInput,
): Promise<VoiceTurnOutcome> {
  const startedAt = Date.now();
  let intent: VoiceIntent = "clarify";
  let capability: VoiceCapability | null = null;
  let transcript = "";
  let transcriptConfidence: number | null = null;
  let intentConfidence = 0;
  let replyText = "";
  let cognitionRunId: string | null = null;
  let links: VoiceLink[] = [];
  let status = "ok";
  let error: string | null = null;
  let costMicros = 0;

  // Availability gate — voice OFF by default; admin must enable.
  if (!(await getVoiceEnabled())) {
    return {
      turnId: null,
      sessionId: input.sessionId,
      intent: "reject",
      capability: null,
      transcript: "",
      transcriptConfidence: null,
      replyText: "Voice is currently disabled.",
      audio: null,
      audioContentType: null,
      ttsOk: false,
      status: "disabled",
      cognitionRunId: null,
      links: [],
      costMicros: 0,
      latencyMs: Date.now() - startedAt,
      error: "voice_disabled",
    };
  }

  // ── STT (pure I/O) ──────────────────────────────────────────────────────────
  const stt = await transcribe(input.audio, input.mimeType);
  costMicros += estimateSttCostMicros();
  if (!stt.ok || !stt.transcript.trim()) {
    intent = "clarify";
    status = "stt_failed";
    error = stt.error;
    replyText =
      "I couldn't make out what you said. Please hold the button and try again.";
  } else {
    transcript = stt.transcript.trim();
    transcriptConfidence = stt.confidence;

    // ── Deterministic control plane ─────────────────────────────────────────
    const classification = classifyIntent(transcript);
    intent = classification.intent;
    capability = classification.capability;
    intentConfidence = classification.confidence;

    if (!capability) {
      // clarify / reject — advisory only, nothing executes.
      replyText = classification.reason ?? "Could you rephrase that?";
      status = intent;
    } else {
      // ── Read/advisory capability ──────────────────────────────────────────
      const priorContext = await buildConversationContext(input.sessionId);
      const result = await runCapability(capability, {
        query: classification.query,
        businessId: input.businessId ?? null,
        createdBy: input.createdBy,
        executiveUserId: input.executiveUserId ?? input.createdBy,
        priorContext,
      });
      replyText = result.replyText;
      links = result.links;
      cognitionRunId = result.cognitionRunId;
      status = result.status;
      if (!result.ok && !error) error = result.error;
    }
  }

  // ── TTS (pure I/O; fail-open to text-only) ──────────────────────────────────
  const tts = await synthesize(replyText);
  const ttsOk = tts.ok && !!tts.audio;
  if (ttsOk) costMicros += estimateTtsCostMicros(tts.chars);

  // Track provider spend on the cognition budget (best-effort).
  if (costMicros > 0) {
    try {
      await consumeCognitionBudget(costMicros);
    } catch {
      /* budget accounting must never break the turn */
    }
  }

  const latencyMs = Date.now() - startedAt;

  // ── Persist transcript turn (best-effort) ──────────────────────────────────
  let turnId: string | null = null;
  try {
    const [session] = await db
      .update(jarvisVoiceSessionsTable)
      .set({
        turnCount: sql`${jarvisVoiceSessionsTable.turnCount} + 1`,
        lastTurnAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jarvisVoiceSessionsTable.id, input.sessionId))
      .returning({ turnCount: jarvisVoiceSessionsTable.turnCount });
    const turnIndex = session ? Math.max(0, session.turnCount - 1) : 0;

    const [row] = await db
      .insert(jarvisVoiceTurnsTable)
      .values({
        sessionId: input.sessionId,
        turnIndex,
        transcript: transcript || null,
        transcriptConfidence,
        intent,
        intentConfidence,
        capability,
        replyText: replyText || null,
        ttsOk,
        status,
        error,
        cognitionRunId,
        links: links.length ? links : null,
        costMicros,
        latencyMs,
        createdBy: input.createdBy,
      })
      .returning({ id: jarvisVoiceTurnsTable.id });
    turnId = row?.id ?? null;
  } catch {
    /* persistence failure must not drop the spoken reply */
  }

  return {
    turnId,
    sessionId: input.sessionId,
    intent,
    capability,
    transcript,
    transcriptConfidence,
    replyText,
    audio: ttsOk ? tts.audio : null,
    audioContentType: ttsOk ? tts.contentType : null,
    ttsOk,
    status,
    cognitionRunId,
    links,
    costMicros,
    latencyMs,
    error,
  };
}
