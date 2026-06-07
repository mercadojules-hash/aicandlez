---
name: Jarvis Creative Intelligence Division (advisory plane)
description: How the creative/marketing agents (Prometheus + reserved Vision/Phoenix) are wired — governance reuse, grounding rules, writeback boundaries.
---

# Jarvis Creative Intelligence Division

The creative plane mirrors the cognition plane: advisory-only agents that PROPOSE
drafts, never act/publish/auto-post. Lives under
`artifacts/api-server/src/lib/jarvis/creative/*`, routes under
`/api/jarvis/creative/*`. jarvis_-scoped; zero coupling to trading execution.

## Governance reuse — do NOT extend the enum
Creative publish reuses the EXISTING governance tables (`jarvis_approvals` +
`jarvis_policy_evaluations`) by writing the polymorphic `subjectType="creative_asset"`
**directly** — it does NOT add to the orchestration `GovernedSubjectType` enum
(locked invariant). Same pattern the briefing gate uses.
**Why:** the enum gates the deterministic control plane; the advisory plane must
not widen it. **How to apply:** any new advisory subject (vision/phoenix assets)
writes its own `subjectType` string + reuses the same two tables, never the enum.

## Grounding: brand/business are CONTEXT, not citable
`buildBrandBlock` (brand profile) + `buildBusinessBlock` (business registry) are
injected verbatim into the prompt but are NOT graph nodes. Only retrieved
memory/asset/decision/task/category refs are citable; `computeGroundingScore`
runs against the retrieval set only. **Why:** brand/registry are editable
guidance, not evidence — letting them count would inflate grounding for free.

## PUBLISH is the only governed action; generation is always a draft
`generateCampaign` writes `status="draft"`, `governanceState="none"`. Fail-safe:
on budget/provider/parse failure NO draft is written but the cognition run IS
recorded (verified: an OpenAI 429 → status=degraded, ok=false, no draft, run
recorded). Publish (`publishCreativeAsset`) flips draft→published only on
allow/approved; cognition asset below `JARVIS_COGNITION_MIN_GROUNDING` (default
60) routes to require_approval and stays a visible draft.

## Memory writeback boundaries
- Drafted campaign → deduped breadcrumb in `jarvis_memories`
  (`source_type="creative_campaign"`, unique on source_type+source_id).
- Only PUBLISHED **text** assets promote into `jarvis_knowledge_assets` (unique
  `source_path = creative-asset://<id>`) + `derived_from` edges to cited refs.
- **TEXT ONLY:** `promotePublishedAsset` returns null for image/video — binaries
  promote NEITHER bytes NOR a metadata pointer. Keeps the citable corpus textual.

## Access control
ALL creative routes (reads included) are `requireRole(["admin","super-admin"])`;
seed is super-admin only. The advisory campaign/brand data is operator-only — do
not drop creative reads to bare `requireAuth` (an early version did; corrected).

## Provider + budget
Text reuses cognition `callModel` (precedence ANTHROPIC_API_KEY → OPENAI_API_KEY
→ Replit proxy). Image/video are reserved (Vision Phase 2 / Phoenix Phase 3), no
secrets, advertised via `MEDIA_PROVIDER_STATUS`. Cost metered through the shared
cognition budget (`scopeType="cognition"`, limit interpreted as USD-micros).
