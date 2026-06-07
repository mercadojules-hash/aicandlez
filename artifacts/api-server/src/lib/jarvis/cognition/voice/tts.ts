/**
 * Text-to-Speech provider — Voice v1. The ONLY TTS egress point. TTS is a
 * side-effect-free transducer on the content plane: it reads back advisory text
 * the control plane already produced. It NEVER acts and NEVER throws.
 *
 * Pure compute (mirrors `embeddings.ts:embed`): no budget consumption, no audit
 * write — the turn orchestrator (V5) owns those. FAIL-SAFE: any missing-key /
 * provider / timeout failure resolves to `{ ok:false }`; the caller then serves a
 * TEXT-ONLY reply (the readback transcript is still shown), so a TTS outage never
 * blocks the answer. PRIVACY: the returned audio is streamed to the client and is
 * never persisted server-side.
 *
 * Deviation rationale (raw ELEVENLABS_API_KEY, not the managed proxy): see
 * `./config.ts` and `.local/docs/jarvis-voice-architecture.md` §3.
 */

import {
  ELEVENLABS_API_BASE,
  TTS_MODEL,
  TTS_TIMEOUT_MS,
  TTS_OUTPUT_FORMAT,
  TTS_CONTENT_TYPE,
  TTS_MAX_CHARS,
  resolveVoiceId,
} from "./config.js";

export interface TtsResult {
  ok: boolean;
  /** Synthesized audio. Null when `ok` is false (caller falls back to text). */
  audio: Buffer | null;
  contentType: string;
  voiceId: string;
  model: string;
  chars: number;
  latencyMs: number;
  error: string | null;
}

function emptyResult(
  startedAt: number,
  chars: number,
  voiceId: string,
  error: string | null,
): TtsResult {
  return {
    ok: false,
    audio: null,
    contentType: TTS_CONTENT_TYPE,
    voiceId,
    model: TTS_MODEL,
    chars,
    latencyMs: Date.now() - startedAt,
    error,
  };
}

/** Synthesize advisory readback text to speech. NEVER throws. */
export async function synthesize(
  text: string,
  opts?: { voiceId?: string; timeoutMs?: number },
): Promise<TtsResult> {
  const startedAt = Date.now();
  const voiceId = opts?.voiceId?.trim() || resolveVoiceId();
  const clean = typeof text === "string" ? text.trim() : "";
  const chars = clean.length;

  if (!chars) {
    return emptyResult(startedAt, 0, voiceId, "empty_text");
  }
  if (chars > TTS_MAX_CHARS) {
    return emptyResult(startedAt, chars, voiceId, `text_too_long:${chars}`);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return emptyResult(startedAt, chars, voiceId, "ELEVENLABS_API_KEY missing");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? TTS_TIMEOUT_MS,
  );
  try {
    const url =
      `${ELEVENLABS_API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}` +
      `?output_format=${encodeURIComponent(TTS_OUTPUT_FORMAT)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: TTS_CONTENT_TYPE,
      },
      body: JSON.stringify({ text: clean, model_id: TTS_MODEL }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return emptyResult(
        startedAt,
        chars,
        voiceId,
        `http_${res.status}${detail ? `:${detail.slice(0, 200)}` : ""}`,
      );
    }

    const arrayBuf = await res.arrayBuffer();
    const audio = Buffer.from(arrayBuf);
    if (audio.byteLength === 0) {
      return emptyResult(startedAt, chars, voiceId, "empty_audio");
    }

    return {
      ok: true,
      audio,
      contentType: TTS_CONTENT_TYPE,
      voiceId,
      model: TTS_MODEL,
      chars,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return emptyResult(
      startedAt,
      chars,
      voiceId,
      aborted ? "timeout" : err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timeout);
  }
}
