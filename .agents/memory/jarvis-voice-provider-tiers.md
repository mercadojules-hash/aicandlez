---
name: Jarvis voice provider tiers
description: Why Jarvis voice has two client tiers (browser-native + premium ElevenLabs) and the invariant that both flow through one governed orchestrator
---

# Jarvis voice provider tiers

Jarvis voice v1 does NOT hard-depend on `ELEVENLABS_API_KEY`. It ships with a
provider abstraction of two tiers, and a typed fallback that is always available:

1. **Browser-native (default):** Web Speech API does STT (`en-GB`) and
   `speechSynthesis` does readback (British male voice). The transcript is made
   in the browser and POSTed as text to `POST /jarvis/voice/turn-text`.
2. **Premium (ElevenLabs, server-side):** binary `POST /jarvis/voice/turn`
   uploads audio for server STT and returns synthesized British audio. Sibling
   provider — plugging it in changes neither the orchestrator nor the client.
3. **Typed fallback:** same `turn-text` route, `source:"text"`.

**The load-bearing invariant:** both client paths run the SAME deterministic
server orchestrator (`runVoiceTurn`). Browser Web Speech is permitted ONLY as a
client-side I/O convenience that still flows through the governed server — it is
never an ungoverned egress. The text plane stays separate; governance / two-plane
is unchanged. Transcripts-only holds (browser-native sends NO audio at all).

**Why:** the original architecture (§3) rejected Web Speech and made ElevenLabs
the only path, which would have blocked v1 on a missing key. User direction
2026-06-07 reframed ElevenLabs as premium-only. Doc deviation lives in
`.local/docs/jarvis-voice-architecture.md` §3.1 + §8.

**How to apply:**
- Adding any new voice input path MUST funnel through `runVoiceTurn`; never let a
  client transcribe-and-act without the server orchestrator.
- Client readback must be idempotent per `turnId` and cancel prior speech before
  starting a new utterance, or rapid turns overlap/stutter (browser TTS has no
  built-in queue discipline for our use). Guard with a `spokenTurnRef`.
- Fail-open everywhere on availability: no key → browser tier; no Web Speech →
  text mode; no `speechSynthesis` → text-only display. Never throw.
