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
/** Operator-chosen ElevenLabs voice id (overrides the env var when set). */
export const SETTING_VOICE_ID = "cognition.voice.voiceId";

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
/**
 * Default ElevenLabs premade voice for the Jarvis persona: "Daniel" — an
 * authoritative, refined RP British male (news-presenter timbre). This is the
 * intended "professional British executive" readback voice, in the spirit of
 * Iron Man's J.A.R.V.I.S. Override with ELEVENLABS_VOICE_ID (e.g. "George"
 * `JBFqnCBsd6RMkjVDRZzb` for a warmer British tone). ElevenLabs is the PREMIUM
 * tier here — when no key is present the client falls back to a browser en-GB
 * voice, so the persona stays British across both providers.
 */
export const DEFAULT_TTS_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";
export const TTS_OUTPUT_FORMAT = "mp3_44100_128";
export const TTS_CONTENT_TYPE = "audio/mpeg";
/** Cap synthesized characters so one readback cannot run away on cost. */
export const TTS_MAX_CHARS = 5_000;

/**
 * Voice-design settings tuned for a calm, composed executive delivery: higher
 * stability keeps the cadence even and unflappable; moderate similarity keeps
 * the voice's character; a touch of style adds gravitas without theatrics.
 */
export const TTS_VOICE_SETTINGS = {
  stability: 0.6,
  similarity_boost: 0.8,
  style: 0.15,
  use_speaker_boost: true,
} as const;

export function resolveVoiceId(): string {
  const v = process.env.ELEVENLABS_VOICE_ID;
  return v && v.trim().length > 0 ? v.trim() : DEFAULT_TTS_VOICE_ID;
}

/** Is a premium ElevenLabs key configured? (gates server STT + premium TTS). */
export function hasElevenLabsKey(): boolean {
  const k = process.env.ELEVENLABS_API_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

/**
 * The active readback voice id. Precedence: operator UI setting
 * (`cognition.voice.voiceId` in jarvis_settings) > `ELEVENLABS_VOICE_ID` env >
 * `DEFAULT_TTS_VOICE_ID`. This lets the executive set a voice in the Voice
 * Settings page with no redeploy, while the env var stays a valid fallback.
 * Never throws — any DB error degrades to the env/default resolution.
 */
export async function getVoiceId(): Promise<string> {
  try {
    const [row] = await db
      .select()
      .from(jarvisSettingsTable)
      .where(eq(jarvisSettingsTable.key, SETTING_VOICE_ID))
      .limit(1);
    const v = typeof row?.value === "string" ? row.value.trim() : "";
    if (v) return v;
  } catch {
    /* fall through to env/default */
  }
  return resolveVoiceId();
}

/**
 * Persist (or clear) the operator-chosen voice id. An empty/blank value clears
 * the setting so resolution falls back to the env var / default.
 */
export async function setVoiceId(
  voiceId: string,
  updatedBy: string | null,
): Promise<void> {
  const value = typeof voiceId === "string" ? voiceId.trim() : "";
  await db
    .insert(jarvisSettingsTable)
    .values({
      key: SETTING_VOICE_ID,
      value,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: jarvisSettingsTable.key,
      set: { value, updatedBy, updatedAt: new Date() },
    });
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
