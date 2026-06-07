/**
 * Voice interface — shared configuration, toggle, and cost estimators (Voice v1).
 *
 * Voice is an I/O modality, NOT an authority layer. This module owns ONLY the
 * `cognition.voice.enabled` toggle (default OFF, admin-gated upstream) and the
 * provider constants / coarse cost estimators used by the STT + TTS providers and
 * the turn orchestrator. It contains no model authority and no effector.
 *
 * DEVIATION FROM THE MANAGED-PROXY INVARIANT (approved, documented — mirrors the
 * S9 embeddings deviation): the Replit-managed ElevenLabs path
 * (`externalApi__elevenlabs`) exists ONLY in the agent sandbox, never in the
 * api-server runtime, and never on Render production (no Replit connector proxy
 * there). The locked decision is ElevenLabs for STT + TTS, so the providers call
 * the ElevenLabs REST API directly using `ELEVENLABS_API_KEY`. A missing key MUST
 * degrade voice to off / text-only — never crash the api-server boot (which would
 * take down the deterministic AICandlez plane). Rationale + migration notes:
 * `.local/docs/jarvis-voice-architecture.md` §3.
 */

import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { jarvisSettingsTable } from "@workspace/db";

// ── jarvis_settings toggle (default OFF) ─────────────────────────────────────
export const SETTING_VOICE_ENABLED = "cognition.voice.enabled";

/** Is the voice interface enabled? (default false). Never throws. */
export async function getVoiceEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(jarvisSettingsTable)
      .where(eq(jarvisSettingsTable.key, SETTING_VOICE_ENABLED))
      .limit(1);
    return row?.value === true;
  } catch {
    return false;
  }
}

export async function setVoiceEnabled(
  enabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  await db
    .insert(jarvisSettingsTable)
    .values({
      key: SETTING_VOICE_ENABLED,
      value: enabled,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: jarvisSettingsTable.key,
      set: { value: enabled, updatedBy, updatedAt: new Date() },
    });
}

// ── Provider configuration ───────────────────────────────────────────────────
export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

/** Speech-to-Text: ElevenLabs Scribe v1. */
export const STT_MODEL = "scribe_v1";
export const STT_TIMEOUT_MS = 30_000;
/** Reject oversized uploads early (PTT turns are short). */
export const STT_MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

/** Text-to-Speech model + a configurable premade voice. */
export const TTS_MODEL = "eleven_multilingual_v2";
export const TTS_TIMEOUT_MS = 30_000;
/** Default ElevenLabs premade voice ("Rachel"); override with ELEVENLABS_VOICE_ID. */
export const DEFAULT_TTS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
export const TTS_OUTPUT_FORMAT = "mp3_44100_128";
export const TTS_CONTENT_TYPE = "audio/mpeg";
/** Cap synthesized characters so one readback cannot run away on cost. */
export const TTS_MAX_CHARS = 5_000;

export function resolveVoiceId(): string {
  const v = process.env.ELEVENLABS_VOICE_ID;
  return v && v.trim().length > 0 ? v.trim() : DEFAULT_TTS_VOICE_ID;
}

// ── Coarse cost estimators (budget ledger + audit ONLY — never billing truth) ─
// ElevenLabs bills STT by audio duration and TTS by character count. These are
// deliberately rough estimates used only to debit the existing cognition budget
// (`jarvis_budgets` scopeType="cognition") and to populate the cost_micros audit
// field — mirroring `estimateEmbeddingCostMicros`.
const STT_MICROS_PER_SECOND = 111; // ≈ $0.40 / audio-hour
const TTS_MICROS_PER_CHAR = 300; // ≈ $0.30 / 1k chars

export function estimateSttCostMicros(durationSec?: number | null): number {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }
  return Math.ceil(durationSec * STT_MICROS_PER_SECOND);
}

export function estimateTtsCostMicros(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars * TTS_MICROS_PER_CHAR);
}
