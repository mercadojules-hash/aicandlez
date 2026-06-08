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

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
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
export function speakBrowser(text: string): boolean {
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
