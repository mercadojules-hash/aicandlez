---
name: Jarvis cognition provider priority
description: How callModel picks an LLM provider, and the cost-attribution rule that keeps the budget ledger correct.
---

`callModel` (cognition provider.ts) selects its LLM provider by KEY AVAILABILITY,
not by error cascade:
1. `ANTHROPIC_API_KEY` -> direct `@anthropic-ai/sdk` (claude-sonnet-4-6)
2. else `OPENAI_API_KEY` -> direct `openai` chat completions (default gpt-4o,
   override `JARVIS_OPENAI_COGNITION_MODEL`)
3. else -> Replit AI Integrations proxy via shared
   `@workspace/integrations-anthropic-ai` (last-resort fallback)

**Why availability not cascade:** a provider runtime failure returns `{ok:false}`
rather than silently falling through to another provider, so cost + audit
attribution (`think()` consumes `call.costMicros` into the cognition budget
ledger) stays deterministic — you always know which provider a run was billed to.

**Cost-attribution rule (do not regress):** each provider path MUST estimate
`costMicros` with ITS OWN price constants. The OpenAI path uses
`estimateOpenAiCostMicros` (gpt-4o rates); Anthropic/proxy paths use
`estimateCostMicros` (Sonnet rates). Reusing Sonnet rates on the OpenAI path
systematically mis-bills the budget ledger — caught in code review.

**Boot-safety invariant:** every provider client is `await import()`-ed INSIDE
its helper, never at module top level. The shared proxy client throws at
module-eval when its integration env is missing; a top-level import of any
provider would crash api-server boot and take the deterministic live-trading
plane down with it. embeddings.ts already follows this lazy pattern.
