---
name: Cognition provider lazy-import fail-safe
description: Why the cognition LLM client must be imported lazily inside the call, never at module top level
---

The shared `@workspace/integrations-anthropic-ai` client THROWS at module-eval
when its integration env vars are missing. Any module that `import`s it at the
top level will crash whatever process loads it.

**Rule:** in the Jarvis cognition provider, import the Anthropic client LAZILY
inside `callModel` (`const { anthropic } = await import(...)`) wrapped in the
existing try/catch — never as a top-level `import`.

**Why:** Jarvis routes are mounted into the SAME api-server process that runs the
deterministic AICandlez trading plane. A top-level import means an unprovisioned
Anthropic integration crashes api-server BOOT — taking down live trading — even
though cognition is OFF by default and advisory-only. Lazy import turns that into
a caught error → `{ok:false}` degrade, preserving both "degrade, don't crash" and
cross-product blast-radius isolation.

**How to apply:** any future cognition/LLM surface that talks to a shared
integration client that validates env at module scope must defer the import to
call time. A green typecheck and a running dev server (where env IS present) will
NOT reveal this — it only bites when the integration env is absent.
