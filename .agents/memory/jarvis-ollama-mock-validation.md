---
name: Jarvis offline LLM mock-validation gotcha
description: How to validate Jarvis' Ollama/local-LLM wiring without a real model pull, and the false-degraded trap it produces.
---

When validating Jarvis Desktop (or any Ollama-default cognition) in an
environment where you cannot install the real multi-GB model:

- Stand up a tiny **OpenAI-compatible** HTTP stub on `127.0.0.1:11434` exposing
  `POST /v1/chat/completions` (and optionally `/v1/models`). Set
  `OLLAMA_BASE_URL=http://127.0.0.1:11434`. The provider will issue a real
  request to it — capturing the hit proves transport + base-URL + model-name +
  provider-selection are correct end to end (including inside a voice turn).

- **Provider selection is by KEY AVAILABILITY**, not error cascade. The Replit
  workspace env has `OPENAI_API_KEY` (and sometimes Anthropic) set, which would
  be chosen over Ollama. To force the Ollama path you MUST strip them from the
  child process: `env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY ... pnpm start`.

**The trap (looks like a bug, isn't):** a stub that returns plain text rather
than the structured JSON "proposal" Jarvis expects makes `think()` /
`/api/jarvis/query` / voice turns return
`degradedReason: "model output could not be parsed into a proposal"` and fall
back to an extractive/degraded answer. This is a **stub artifact**, not a wiring
fault — a real `llama3.1` returns parseable structured output. Do not chase it
as a connectivity or parsing defect.

**Also:** Jarvis voice is gated by the `cognition.voice.enabled` row in
`jarvis_settings` (default OFF) — until enabled, voice turns return a governed
`disabled` envelope and never reach the LLM. Server TTS needs
`ELEVENLABS_API_KEY`; absent it the server returns `ttsOk:false`/no audio and the
browser speaks via native `speechSynthesis` (en-GB) — that degradation is by
design, not a failure.
