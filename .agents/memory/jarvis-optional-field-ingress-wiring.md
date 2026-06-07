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

Same trap for a CRUD entity field (e.g. `monthlyRevenue`/`healthStatus` on
`jarvis_businesses`): DB column + server Zod body + client `*Input` type is NOT
enough — for entities edited through the generic `RegistryView` form you must
also add the field to `fields[]`, `toFormValues`, AND `onCreate`/`onUpdate` in
the page (e.g. `Businesses.tsx`), or the column is unreachable from the UI while
tsc stays green. Also keep enum vocab identical across server Zod and UI
branches (server is SoT: business health = `healthy|watch|critical`, NOT
`warning`) or valid values render with no styling.

**Why:** because the field is OPTIONAL everywhere, `tsc` stays green even when the
ingress drops it — the type just defaults to `undefined`/`null`. A passing
typecheck is NOT evidence the feature is reachable from the API surface. This was
caught only by an architect review, not by the build.

**How to apply:** after threading a new optional field through any deep input
type, grep the field name across the route schema, the route handler call, and
the frontend request type. If it is missing from any of the three, the feature is
dead on that path. Treat "green typecheck" as necessary but not sufficient for
optional-field plumbing.
