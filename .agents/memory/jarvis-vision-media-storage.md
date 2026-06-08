---
name: Jarvis Vision media + storage pattern
description: How Jarvis Creative media assets (images) are generated, stored, and served; and the code_execution sandbox env-isolation gotcha that affects storage testing.
---

# Jarvis Vision (Creative Intelligence Phase 2) media + storage

The Vision agent is the first **media-generation** creative component. Pattern to
keep consistent for any future media agent (video, audio, etc.):

- **Bytes NEVER in Postgres.** Image binaries go to object storage; only metadata
  (`storageKey`, `mimeType`, kind, status, governance, grounding) lands in
  `jarvis_creative_assets`. Same two-tier split as the live trading invariant.
- **Direct provider first, no invented fallback.** Image gen uses OpenAI Images
  (`gpt-image-1`) directly. There is intentionally NO Replit-proxy image fallback
  because no `@workspace/integrations-openai` lib exists — do not invent a
  dependency for "sovereignty". A Replit fallback may be added later only if a
  real lib is present.
- **Fail-safe + honest degradation is mandatory.** Provider/upload helpers never
  throw (return structured failure / null). On non-ok text synthesis: write NO
  campaign and NO assets. On image failure: the grounded TEXT concept still
  persists; only that concept's image is dropped and counted
  (`imagesGenerated`/`imagesFailed`/`imageProviderAvailable`/`reason` reported).
- **Advisory-only, never publishes.** Image assets are created `status:"draft"`,
  `governanceState:"none"`, grounding null → the existing publish gate routes
  null-grounding to `require_approval` and never auto-promotes binaries. Reuse the
  existing publish route; do NOT add a new publish path and do NOT extend
  `GovernedSubjectType` (audit binaries under subject `"creative_asset"`).
- **Serving binaries:** admin-gated GET streams from object storage via
  `ObjectStorageService.getObjectEntityFile(storageKey)` →
  `file.createReadStream().pipe(res)`; map `ObjectNotFoundError`→404, set
  Content-Type from object metadata (fallback to row `mimeType`), audit the read.

## Object-storage template typecheck trap
The copied Replit `objectStorage.ts` template has `const { signed_url } = await
response.json()` which fails strict TS (`unknown`). Cast the JSON:
`(await response.json()) as { signed_url: string }`. Expect this every time the
template is copied into a strict package.

## code_execution sandbox does NOT see project secrets/env
**Why:** the JS `code_execution` notebook runs in an isolated runtime that does
**not** inherit the workspace secrets/env (`process.env` is largely empty —
`PRIVATE_OBJECT_DIR`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, API keys are absent).
**How to apply:** never try to prove an object-storage / signed-URL / secret-
dependent round-trip from `code_execution`. Run such checks inside the artifact's
own process (e.g. a route probe after `restart_workflow`, or a script run in the
api-server package) where the provisioned env vars exist. Route-mounted (401 not
404) + typecheck + the helper being the standard template is sufficient proof at
the unit level.
