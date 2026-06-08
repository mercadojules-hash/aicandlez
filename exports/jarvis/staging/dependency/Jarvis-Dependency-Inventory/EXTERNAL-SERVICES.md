# External Service Dependencies

How each external dependency is used and what it requires in the standalone build.

## OpenAI (embeddings — KEPT in hybrid)
- **Use:** semantic memory + knowledge-graph retrieval via
  `text-embedding-3-small` (1536-dim). Called **directly** with `OPENAI_API_KEY`
  (no proxy).
- **Required?** For semantic search, yes. Absent → Jarvis degrades to lexical
  search automatically (no crash).
- **Cognition?** No — cognition is Ollama in this build. OpenAI cognition is not
  used unless you remove `OLLAMA_BASE_URL`.
- **Cost:** ~$0.02 / 1M tokens (negligible for a single user).

## Clerk (auth — KEPT)
- **Use:** sign-in + role resolution (`user`/`admin`/`super-admin`). All Jarvis
  routes are admin-gated.
- **Replit coupling?** None intrinsic — Clerk is independent SaaS. On Replit the
  tenant is auto-provisioned; locally you supply your **own** Clerk application's
  `CLERK_SECRET_KEY` + `VITE_CLERK_PUBLISHABLE_KEY`.
- **Fully local alternative (Phase 2):** replace with local session/JWT auth.

## Ollama (cognition — NEW, local)
- **Use:** all reasoning/chat via OpenAI-compatible `/v1/chat/completions`.
- **Requires:** Ollama running on localhost + a pulled model matching
  `JARVIS_OLLAMA_MODEL`.
- **Network:** fully local, no external calls, no quota/billing.

## ElevenLabs (premium voice — OPTIONAL)
- **Use:** premium TTS readback. Direct REST call with `ELEVENLABS_API_KEY`.
- **Required?** No. The browser-native voice tier needs no key. Voice text in/out
  works regardless.

## ffmpeg (video — OPTIONAL, local binary)
- **Use:** Phoenix video agent renders MP4 locally. Already a host binary — works
  natively on macOS via `brew install ffmpeg`.

## GitHub (sovereignty — DEFERRED)
- **Use:** read-only repository awareness.
- **Phase 1:** disabled. **Phase 2:** Octokit + a GitHub PAT (`GITHUB_PAT`).

## Render (sovereignty — OPTIONAL)
- **Use:** read-only infra awareness via `RENDER_API_KEY` (direct REST — works
  anywhere). Disable if not needed.
