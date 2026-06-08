# Jarvis Desktop Edition — Remaining Limitations Report

**Task:** T009 — Final Runtime Validation
**Date:** 2026-06-08

This document lists everything that could **not** be fully exercised inside the
Linux validation environment and therefore must be confirmed on the user's
physical Mac, plus known design constraints. Nothing here blocks a launch; each
item is either hardware-bound or a deliberate, documented design decision.

---

## A. Hardware / host-binary limitations (must be confirmed on the Mac)

### A1. Real Ollama runtime + `llama3.1` model — MAC-ONLY
- **Why not here:** Ollama is a native host binary and `llama3.1` is a multi-GB
  model download; neither can be installed/run in this validation sandbox.
- **What WAS proven:** the provider selects the Ollama path and issues a real
  `POST /v1/chat/completions` to `OLLAMA_BASE_URL` (captured against an
  OpenAI-compatible stand-in). Transport, base URL, model name, and provider
  selection are correct.
- **Mac confirmation:** `brew install ollama` (or the official installer),
  `ollama serve`, `ollama pull llama3.1`, leave `OLLAMA_BASE_URL` at
  `http://localhost:11434`. No code change. Real completions then replace the
  stub's free-form text, clearing the `degraded` / "could not be parsed" status
  seen with the stub.

### A2. Microphone capture — MAC-ONLY
- Browser `getUserMedia` against a physical mic; impossible headless.
- **Mac confirmation:** grant the browser microphone permission, press-to-talk
  in the voice UI.

### A3. Speech-to-text from recorded audio — MAC-ONLY
- Two tiers: **premium** ElevenLabs Scribe (`scribe_v1`, needs
  `ELEVENLABS_API_KEY`) and **fallback** browser Web Speech API. Both need real
  captured audio.
- The server `POST /api/jarvis/voice/turn` (raw audio) path was not exercised
  because there is no real microphone input to send.

### A4. Text-to-speech playback — MAC-ONLY
- Premium ElevenLabs TTS (en-GB "Daniel" persona) when `ELEVENLABS_API_KEY` is
  set; otherwise the client uses browser `speechSynthesis` (en-GB). Audio
  *playback* is a browser concern.
- Verified here that with **no** ElevenLabs key the server correctly returns
  `ttsOk:false` / `audioBase64:null` (the client then speaks via the browser) —
  i.e. the graceful-degradation contract holds.

---

## B. Design constraints carried over from the platform build (by design)

### B1. Voice is OFF by default
- Gated by the `cognition.voice.enabled` row in `jarvis_settings` (default
  false). Enable via the admin UI/setting (or a one-row upsert) before voice
  turns do anything but return a governed `disabled` envelope. This is the
  intended safety default, confirmed during validation.

### B2. ElevenLabs is optional (premium tier)
- `ELEVENLABS_API_KEY` is **not required** to run Jarvis. Absent it, voice STT/TTS
  degrade to the browser's native engines. Set it only to upgrade voice quality.

### C3. Cognition quality tracks the chosen model
- Jarvis emits structured "proposals"; small/weak local models may occasionally
  produce output that fails strict parsing and falls back to an extractive
  answer. `llama3.1` (or larger) is the recommended local model.

### B4. Object-storage & GitHub-awareness features degrade off-platform
- Vault media / creative-asset bytes and GitHub repo awareness retain their
  original code paths but **degrade gracefully** (explicit error / null) when
  the Replit object-storage sidecar / GitHub connector is absent. They never
  crash boot. Core Jarvis (memory, cognition, voice envelope, graph) is fully
  local. Re-homing these to local filesystem / a direct GitHub token is possible
  future work, intentionally out of scope for this recovery package.

### B5. Local auth shim authorizes every request as a single super-admin
- The desktop edition replaces Clerk with a local shim: there is no multi-user
  login; whoever can reach the server is the super-admin. **Mitigation already
  applied:** the server binds to `127.0.0.1` with a CORS allow-list by default;
  LAN exposure is an explicit opt-in (`JARVIS_BIND_HOST` / `JARVIS_CORS_ORIGINS`).
  Keep it loopback-only on a personal machine.

---

## C. Not applicable to this package (intentionally removed)

- No Replit, Clerk, Stripe, exchange, or AICandlez trading/execution code paths.
  The only cross-product surface retained is the **read-only** AICandlez
  historical-intelligence SELECT (fail-safe to dashes), a native Jarvis feature
  whose tables ship in the schema.
