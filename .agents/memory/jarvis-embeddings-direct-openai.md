---
name: Jarvis embeddings use direct OpenAI, not the managed proxy
description: Why Jarvis Sprint 9 semantic retrieval calls OpenAI directly with OPENAI_API_KEY instead of the Replit-managed AI proxy.
---

# Jarvis embeddings: direct OpenAI (deviation from managed-proxy invariant)

Jarvis cognition's S8 invariant was "managed AI proxy only, no raw key." S9
semantic retrieval breaks that for the embedding path ONLY, on purpose.

**The rule:** the embedding path (`cognition/embeddings.ts`) calls the OpenAI SDK
directly using the `OPENAI_API_KEY` secret. All other cognition LLM calls still go
through the managed Anthropic proxy.

**Why:** the Replit-managed AI Integrations proxy does **not** support the
embeddings API. Verified across the OpenAI, Gemini, and OpenRouter integration
skills — all three list "embeddings" under *Unsupported Capabilities* — and
Anthropic has no embeddings API at all. There is no managed-billing embeddings
path anywhere, so the locked model (`text-embedding-3-small`, 1536 dims) is only
reachable via a raw OpenAI key. User approved Option A (2026-06-07) over a local
in-process model (Option B, rejected: would load an ML runtime into the same
api-server process that runs AICandlez live trading; lower quality; 384 dims).

**How to apply:**
- Keep `cognition/embeddings.ts` the SINGLE egress point for embeddings. If a
  managed embeddings proxy ever appears, swap the client there and re-backfill
  keyed by `model`; the `jarvis_embeddings` schema needs no change.
- The path must stay OFF-by-default, admin-gated, lazy-imported, and FAIL-SAFE:
  missing key/SDK or any provider error returns `{ ok:false }` and retrieval
  degrades to lexical — never throws, never crashes api-server boot (which would
  take down the deterministic AICandlez trading plane).
- Cost is booked to `jarvis_budgets` (scopeType="cognition"); calls are logged to
  `jarvis_cognition_runs` with kind="embedding".
- Do NOT "fix" this back to the managed proxy on the assumption it supports
  embeddings — it does not. Re-verify the integration skills before any such change.
