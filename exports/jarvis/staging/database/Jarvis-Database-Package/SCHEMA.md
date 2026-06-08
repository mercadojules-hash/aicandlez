# Jarvis Database Schema

47 `jarvis_*` tables + the shared `users` identity table. Grouped by subsystem.

## Identity
- `users` — Clerk identity + role (`user` / `admin` / `super-admin`). FK target.

## Cognition & Memory
- `jarvis_cognition_runs` — immutable audit ledger of every LLM call (provider,
  model, tokens, cost estimate, ok/error, kind).
- `jarvis_memories` — executive memory entries.
- `jarvis_embeddings` — `vector(1536)` semantic index (HNSW cosine). Derived read
  index over embeddable subjects.
- `jarvis_budgets` — per-scope cognition spend ledger.

## Knowledge Graph
- `jarvis_knowledge_assets` — nodes.
- `jarvis_knowledge_categories` — taxonomy.
- `jarvis_knowledge_relationships` — polymorphic edges (no DB FK by design).
- `jarvis_insights`, `jarvis_findings`, `jarvis_recommendations`.

## Agents & Orchestration
- `jarvis_agents`, `jarvis_agent_runs`, `jarvis_agent_messages`,
  `jarvis_agent_trust`.
- `jarvis_workflows`, `jarvis_workflow_runs`, `jarvis_workflow_steps`.
- `jarvis_tasks`, `jarvis_projects`, `jarvis_delegations`, `jarvis_commands`.

## Governance
- `jarvis_policies`, `jarvis_policy_evaluations`, `jarvis_routing_rules`.
- `jarvis_approvals`, `jarvis_decisions`.
- `jarvis_escalations`, `jarvis_escalation_chains`, `jarvis_escalation_chain_steps`.
- `jarvis_audit_logs` — admin-gated action + read audit trail.

## Voice
- `jarvis_voice_sessions`, `jarvis_voice_turns` — transcripts only (no audio blobs).

## Creative (advisory)
- `jarvis_creative_assets`, `jarvis_creative_campaigns`.
- `jarvis_brand_profiles`, `jarvis_businesses`.

## Sovereignty (read-only awareness)
- `jarvis_repositories`, `jarvis_code_files`, `jarvis_systems`.
- `jarvis_infra_resources`, `jarvis_render_services`, `jarvis_runbooks`.
- `jarvis_credentials` — encrypted credential metadata (vault).

## Reporting & Settings
- `jarvis_reports`, `jarvis_briefings`.
- `jarvis_aicandlez_daily_snapshots` — cross-product read snapshots.
- `jarvis_settings` — key/value config (e.g. `cognition.voice.enabled`).

> The complete, authoritative DDL is `jarvis_schema.sql`. The Drizzle source in
> `drizzle/schema/jarvis.ts` is the type-safe definition used by the application.
