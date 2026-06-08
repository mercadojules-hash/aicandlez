/**
 * Browser-native speech layer (Voice v1) — the provider-agnostic client side of
 * the voice interface.
 *
 * Jarvis must stay fully operational with NO speech vendor configured, so this
 * module wraps the browser's built-in Web Speech APIs:
 *   - STT  → `SpeechRecognition` / `webkitSpeechRecognition`
 *   - TTS  → `speechSynthesis` (with an en-GB voice preference)
 *
 * The persona target is a professional British executive in the spirit of Iron
 * Man's J.A.R.V.I.S. The premium provider (ElevenLabs, server-side) uses a
 * British voice too; here we pick the closest en-GB system voice so the persona
 * stays consistent across providers. ElevenLabs can be plugged in later WITHOUT
 * touching this file — it is a sibling provider, not a replacement.
 *
 * Everything degrades gracefully: callers must treat unsupported as "fall back
 * to typing", never as an error.
 */

export type VoiceProvider = "browser" | "server";

// ── Capability detection ─────────────────────────────────────────────────────

interface SpeechResultLike extends ArrayLike<{ transcript: string }> {
  isFinal?: boolean;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        resultIndex?: number;
        results: ArrayLike<SpeechResultLike>;
      }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Does this browser expose native speech-to-text? */
export function supportsBrowserSTT(): boolean {
  return getRecognitionCtor() !== null;
}

/** Does this browser expose native speech synthesis? */
export function supportsBrowserTTS(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Does this browser expose microphone capture (for the server STT path)? */
export function supportsMicrophone(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

// ── Speech-to-text (browser) ─────────────────────────────────────────────────

export interface BrowserRecognizer {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/**
 * Start a single browser STT capture. Resolves the final transcript through
 * `onResult`; surfaces errors through `onError`; always calls `onEnd`. Returns a
 * handle to stop/abort, or null when unsupported (caller should fall back).
 */
export function startBrowserRecognition(handlers: {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  lang?: string;
}): BrowserRecognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = handlers.lang ?? "en-GB";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i += 1) {
      const alt = event.results[i]?.[0];
      if (alt?.transcript) transcript += alt.transcript;
    }
    const clean = transcript.trim();
    if (clean) handlers.onResult(clean);
  };
  recognition.onerror = (event) => {
    handlers.onError?.(event.error ?? "speech_error");
  };
  recognition.onend = () => {
    handlers.onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}

// ── Hands-free continuous STT (browser) ──────────────────────────────────────

export interface ContinuousRecognizer {
  stop: () => void;
  abort: () => void;
}

/**
 * Start a CONTINUOUS browser STT capture for hands-free operation. Unlike the
 * single-shot recognizer, this keeps the microphone open: interim transcripts
 * stream through `onInterim` (for the live transcript window and barge-in), and
 * each completed utterance fires `onFinal` (the caller decides whether to send
 * it, e.g. after a wake-phrase check). The recognizer auto-restarts after the
 * browser's idle timeout until `stop()`/`abort()` is called, so the executive
 * can speak repeatedly without touching the UI.
 *
 * Returns null when unsupported (caller should fall back to push-to-talk/text).
 */
export function startContinuousRecognition(handlers: {
  onInterim?: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  lang?: string;
}): ContinuousRecognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  let stopped = false;
  let recognition: SpeechRecognitionLike | null = null;

  const build = (): SpeechRecognitionLike => {
    const r = new Ctor();
    r.lang = handlers.lang ?? "en-GB";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      let interim = "";
      const start = event.resultIndex ?? 0;
      for (let i = start; i < event.results.length; i += 1) {
        const result = event.results[i];
        const alt = result?.[0];
        const text = alt?.transcript ?? "";
        if (!text) continue;
        if (result?.isFinal) {
          const clean = text.trim();
          if (clean) handlers.onFinal(clean);
        } else {
          interim += text;
        }
      }
      const cleanInterim = interim.trim();
      if (cleanInterim) handlers.onInterim?.(cleanInterim);
    };
    r.onerror = (event) => {
      const err = event.error ?? "speech_error";
      // "no-speech"/"aborted" are benign in continuous mode — let onend restart.
      if (err !== "no-speech" && err !== "aborted") {
        handlers.onError?.(err);
      }
    };
    r.onend = () => {
      if (stopped) {
        handlers.onEnd?.();
        return;
      }
      // Browser ended the session after idle — restart to stay hands-free.
      try {
        recognition = build();
        recognition.start();
      } catch {
        stopped = true;
        handlers.onEnd?.();
      }
    };
    return r;
  };

  try {
    recognition = build();
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop: () => {
      stopped = true;
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
    },
    abort: () => {
      stopped = true;
      try {
        recognition?.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Detect a wake phrase (default "jarvis") at/near the start of a transcript and
 * return the command with the wake word stripped. When `matched` is false the
 * utterance did not address Jarvis and the caller should ignore it (hands-free
 * gating). Matching is case-insensitive and tolerant of leading filler.
 */
export function stripWakePhrase(
  transcript: string,
  wake = "jarvis",
): { matched: boolean; command: string } {
  const t = transcript.trim();
  const lower = t.toLowerCase();
  const needle = wake.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return { matched: false, command: t };
  const after = t
    .slice(idx + needle.length)
    .replace(/^[\s,.:;!?-]+/, "")
    .trim();
  return { matched: true, command: after };
}

// ── Text-to-speech (browser) ─────────────────────────────────────────────────

/**
 * Pick the most "British executive" voice the system offers, in priority order:
 * a named en-GB male voice (Daniel / George / "Google UK English Male"), then any
 * en-GB voice, then any English voice. Returns null when none are available yet
 * (the voice list loads asynchronously on some browsers).
 */
export function pickBritishVoice(): SpeechSynthesisVoice | null {
  if (!supportsBrowserTTS()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const byName = (needle: string) =>
    voices.find((v) => v.name.toLowerCase().includes(needle));

  const preferred =
    byName("daniel") ??
    byName("google uk english male") ??
    byName("george") ??
    byName("arthur") ??
    voices.find((v) => v.lang === "en-GB") ??
    voices.find((v) => v.lang?.toLowerCase().startsWith("en-gb")) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ??
    null;

  return preferred;
}

/**
 * Speak text with the browser synthesizer using the British executive voice.
 * No-op (returns false) when unsupported. Cancels any in-flight utterance first
 * so readbacks never overlap.
 */
export function speakBrowser(
  text: string,
  handlers?: { onStart?: () => void; onEnd?: () => void },
): boolean {
  if (!supportsBrowserTTS()) return false;
  const clean = text.trim();
  if (!clean) return false;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = pickBritishVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-GB";
    }
    // Composed, unhurried executive cadence.
    utterance.rate = 1.0;
    utterance.pitch = 0.95;
    if (handlers?.onStart) utterance.onstart = () => handlers.onStart?.();
    // Fire onEnd on both natural end and error/cancel so callers can always
    // clear their "speaking" state (barge-in cancels mid-utterance).
    utterance.onend = () => handlers?.onEnd?.();
    utterance.onerror = () => handlers?.onEnd?.();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** Stop any in-flight browser speech. Safe to call when unsupported. */
export function cancelBrowserSpeech(): void {
  if (supportsBrowserTTS()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}
