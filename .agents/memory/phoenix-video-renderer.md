---
name: Phoenix programmatic video renderer (ffmpeg)
description: How Jarvis's Phoenix video agent renders MP4s and why the render manifest, not the binary, is the durable SoT — plus the sovereignty gap this creates.
---

Phoenix (Jarvis Creative Intelligence, Phase 3) drafts a grounded storyboard +
scene breakdown and renders best-effort MP4 renditions PROGRAMMATICALLY via the
local **ffmpeg** binary — no npm encoder, no AI-video provider, no ElevenLabs, no
new secrets. It mirrors the Vision agent's pipeline (budget → brand context →
grounded synthesis → record run → consume budget → draft campaign → per-artifact
persist).

**The render manifest is the SoT, not the MP4.** The `scene_breakdown` asset's
`metadata.renderManifest` holds the full normalized storyboard object, so a video
is re-renderable from Postgres alone anywhere ffmpeg exists. Video bytes go to
object storage (`storageKey` + `mimeType`); Postgres NEVER holds binary bytes.

**Why this matters (sovereignty gap):** ffmpeg is the ONE part of Phoenix that
depends on a system binary rather than pure JS. In dev it resolves to a Replit
nix-store path (`/nix/store/.../bin/ffmpeg`); a host without ffmpeg (e.g. a bare
Render image) makes `videoRendererAvailable()` false and degrades ONLY the video
— the grounded text artifacts + portable manifest still persist. This is the key
honest finding blocking full Vault/external-drive/Replit-independence: text
intelligence is portable, video rendering is host-capability-dependent.

**ffmpeg-arg safety (injection):** never inline storyboard text into args. Pass
scene title/caption via `drawtext=textfile=...` (file, not inline), strict-
hex-validate colors before interpolating, and single-quote-escape the concat list
entries. `spawn` with no shell. Override binary path with `FFMPEG_PATH`.

**Fail-safe contract:** `generatePhoenixVideo` NEVER throws. It has a top-level
try/catch returning a structured degraded result, AND each per-format video
persist is independently guarded so one format's render/upload/insert failure
just increments `videosFailed` and continues. Vision relies on the route's
try/catch for unexpected throws; Phoenix additionally self-contains them because
the spec demands end-to-end fail-safe. Verify the renderer via a synthetic-
storyboard smoke test (render → ffprobe duration/dims) — this proves the pipeline
independent of OpenAI quota, which Vision's image path cannot do in dev.
