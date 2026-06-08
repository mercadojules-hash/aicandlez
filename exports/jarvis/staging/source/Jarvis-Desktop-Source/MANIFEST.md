# Jarvis Desktop — Source Package

Generated 2026-06-08. Complete runnable source for Jarvis Executive Command
Center, organized for the standalone (Replit-free) repository layout.

## Layout

```
Jarvis-Desktop-Source/
├── apps/
│   ├── web/                     # Frontend — Vite 7 + React 19 (44 pages)
│   │   └── src/{pages,components,hooks,lib}
│   └── server/                  # Backend (Jarvis subset of api-server)
│       ├── routes/jarvis.ts     # 216 endpoints under /api/jarvis/*
│       └── lib/jarvis/          # 72 files, ~24k LOC
│           ├── agents/          # Agent system
│           ├── cognition/       # Cognition + provider selection
│           │   └── voice/       # Voice orchestrator + tiers
│           ├── creative/        # Creative/vision/Phoenix video
│           ├── governance/      # Policies, approvals, escalation
│           ├── orchestrator/    # Workflows, tasks, delegation
│           ├── sovereignty/     # Repo/infra awareness (read-only)
│           └── vault/           # Encrypted credential storage
└── packages/
    └── db/
        ├── schema/jarvis.ts     # 47 jarvis_* tables (Drizzle)
        ├── schema/users.ts      # Identity table
        ├── schema/index.ts
        └── drizzle.config.ts
```

## What is included
- ✅ Jarvis frontend (full `src` tree)
- ✅ Jarvis backend libraries (all 9 subsystems)
- ✅ Jarvis routes (`jarvis.ts`)
- ✅ Agent system (`lib/jarvis/agents`)
- ✅ Governance system (`lib/jarvis/governance`)
- ✅ Knowledge graph (schema `jarvis_knowledge_*` + cognition retrieval)
- ✅ Executive memory components (`lib/jarvis/cognition`, `jarvis_memories`,
  `jarvis_embeddings`)
- ✅ Voice components (`lib/jarvis/cognition/voice`, `pages/Voice.tsx`)
- ✅ Database schema files (`packages/db/schema`)

## What is intentionally excluded
- `node_modules/`, `dist/`, build caches, `.replit-artifact/`
- AICandlez-only code (trading loop, exchanges, Stripe, billing)

## Notes for the implementation phase
- This is the **lifted source**. To make it run standalone you still apply the
  Phase 1 adapters: Ollama cognition adapter, local filesystem object-storage
  adapter, thin Express bootstrap (`apps/server/src/index.ts`), and port the auth
  middleware. See the Deployment Package and the Phase 1 extraction plan.
- The three Replit coupling sites to swap are documented in the Dependency
  Inventory (`REPLIT-DEPENDENCIES.md`).
