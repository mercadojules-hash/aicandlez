---
name: Optional-field end-to-end wiring is not typecheck-caught
description: Adding an optional field to a deep cognition input chain leaves separate ingress wiring points silently unreached, and a green typecheck does not prove reachability.
---

When you add an optional field (e.g. `executiveUserId?`) to a deep input type
chain (cognition `ThinkInput` → `index.ts` run audit params →
`briefingCognition.ts` `SynthesizeBriefingInput`), the value still only reaches
the engine if EVERY ingress point is wired separately:
1. the route Zod request schema (`generateBriefingSchema` in `routes/jarvis.ts`),
2. the route's call into the service (`synthesizeBriefing({ ... })`),
3. the frontend request interface (`GenerateBriefingInput` in `useJarvisApi.ts`).

**Why:** because the field is OPTIONAL everywhere, `tsc` stays green even when the
ingress drops it — the type just defaults to `undefined`/`null`. A passing
typecheck is NOT evidence the feature is reachable from the API surface. This was
caught only by an architect review, not by the build.

**How to apply:** after threading a new optional field through any deep input
type, grep the field name across the route schema, the route handler call, and
the frontend request type. If it is missing from any of the three, the feature is
dead on that path. Treat "green typecheck" as necessary but not sufficient for
optional-field plumbing.
