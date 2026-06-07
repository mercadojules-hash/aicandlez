/**
 * Speech-to-Text provider — Voice v1. The ONLY place the voice layer transcribes
 * audio. STT is a side-effect-free transducer on the content plane: it converts
 * an admin's PTT audio into a transcript and nothing more. It NEVER acts, NEVER
 * writes corpus, and NEVER throws.
 *
 * Pure compute (mirrors `embeddings.ts:embed`): it does NOT consult/consume the
 * budget and does NOT record a run — the turn orchestrator (V5) owns budget +
 * audit + persistence. FAIL-SAFE: any missing-key / provider / timeout / parse
 * failure resolves to `{ ok:false }` so voice degrades to a clarify/retry prompt
 * instead of crashing. PRIVACY: the audio buffer is transcribed in-flight and is
 * never persisted by this module.
 *
 * Deviation rationale (raw ELEVENLABS_API_KEY, not the managed proxy): see
 * `./config.ts` and `.local/docs/jarvis-voice-architecture.md` §3.
 */

import {
  ELEVENLABS_API_BASE,
  STT_MODEL,
  STT_TIMEOUT_MS,
  STT_MAX_AUDIO_BYTES,
} from "./config.js";

export interface SttResult {
  ok: boolean;
  /** Transcribed text. Empty when `ok` is false. */
  transcript: string;
  /** 0–100 coarse confidence (from language_probability); null when unknown. */
  confidence: number | null;
  languageCode: string | null;
  model: string;
  bytes: number;
  latencyMs: number;
  error: string | null;
}

function emptyResult(
  startedAt: number,
  bytes: number,
  error: string | null,
): SttResult {
  return {
    ok: false,
    transcript: "",
    confidence: null,
    languageCode: null,
    model: STT_MODEL,
    bytes,
    latencyMs: Date.now() - startedAt,
    error,
  };
}

/**
 * Transcribe a single PTT audio clip. NEVER throws.
 *
 * @param audio    raw audio bytes (e.g. webm/opus from the browser MediaRecorder)
 * @param mimeType the audio MIME type (used only for the multipart filename hint)
 */
export async function transcribe(
  audio: Buffer | Uint8Array,
  mimeType: string,
  opts?: { timeoutMs?: number },
): Promise<SttResult> {
  const startedAt = Date.now();
  const bytes = audio?.byteLength ?? 0;

  if (!bytes) {
    return emptyResult(startedAt, 0, "empty_audio");
  }
  if (bytes > STT_MAX_AUDIO_BYTES) {
    return emptyResult(startedAt, bytes, `audio_too_large:${bytes}`);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return emptyResult(startedAt, bytes, "ELEVENLABS_API_KEY missing");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? STT_TIMEOUT_MS,
  );
  try {
    const ext = mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("mp3") || mimeType.includes("mpeg")
        ? "mp3"
        : mimeType.includes("ogg")
          ? "ogg"
          : "webm";
    const form = new FormData();
    form.append("model_id", STT_MODEL);
    form.append(
      "file",
      new Blob([new Uint8Array(audio)], {
        type: mimeType || "application/octet-stream",
      }),
      `audio.${ext}`,
    );

    const res = await fetch(`${ELEVENLABS_API_BASE}/v1/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return emptyResult(
        startedAt,
        bytes,
        `http_${res.status}${detail ? `:${detail.slice(0, 200)}` : ""}`,
      );
    }

    const data = (await res.json()) as {
      text?: unknown;
      language_code?: unknown;
      language_probability?: unknown;
    };
    const transcript =
      typeof data.text === "string" ? data.text.trim() : "";
    if (!transcript) {
      return emptyResult(startedAt, bytes, "no_transcript");
    }
    const prob =
      typeof data.language_probability === "number"
        ? data.language_probability
        : null;
    const confidence =
      prob != null ? Math.max(0, Math.min(100, Math.round(prob * 100))) : null;

    return {
      ok: true,
      transcript,
      confidence,
      languageCode:
        typeof data.language_code === "string" ? data.language_code : null,
      model: STT_MODEL,
      bytes,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return emptyResult(
      startedAt,
      bytes,
      aborted ? "timeout" : err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timeout);
  }
}
