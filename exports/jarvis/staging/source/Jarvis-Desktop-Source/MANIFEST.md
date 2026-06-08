# Jarvis Desktop — Source Package (Complete)

Generated 2026-06-08. Complete portable source for Jarvis Executive Command
Center, organized for the standalone (Replit-free) repository layout. This is the
**Complete** edition: the Jarvis-specific code plus all portable shared backend
scaffolding (logger, auth middleware + guards, full `@workspace/db` client).

Verified: **0 unresolved relative imports** across 230 TS/TSX files; the only
workspace dependency is `@workspace/db`, which is included in full.

## Layout

```
Jarvis-Desktop-Source/
├── apps/
│   ├── web/                     # Frontend — Vite 7 + React 19 (44 pages)
│   │   └── src/{pages,components,hooks,lib}
│   └── server/                  # Backend (Jarvis subset of api-server)
│       ├── routes/jarvis.ts     # 216 endpoints under /api/jarvis/*
│       ├── middlewares/
│       │   └── requireAuth.ts   # Clerk auth middleware (shared)
│       ├── lib/                  # Portable shared backend utilities
│       │   ├── logger.ts        # pino logger
│       │   ├── sessionTracker.ts
│       │   ├── userStatusGuard.ts
│       │   ├── objectStorage.ts # Replit App Storage (REPLACE w/ local adapter)
│       │   └── objectAcl.ts     # storage ACL helper (paired w/ objectStorage)
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
- ✅ Jarvis frontend (full `src` tree + vite/tsconfig/package.json — self-contained)
- ✅ Jarvis backend libraries (all 9 subsystems)
- ✅ Jarvis routes (`jarvis.ts`)
- ✅ Agent system (`lib/jarvis/agents`)
- ✅ Governance system (`lib/jarvis/governance`)
- ✅ Knowledge graph (schema `jarvis_knowledge_*` + cognition retrieval)
- ✅ Executive memory components (`lib/jarvis/cognition`, `jarvis_memories`,
  `jarvis_embeddings`)
- ✅ Voice components (`lib/jarvis/cognition/voice`, `pages/Voice.tsx`)
- ✅ **Shared backend scaffolding** (NEW): `logger.ts`, `requireAuth.ts`,
  `sessionTracker.ts`, `userStatusGuard.ts`, `objectStorage.ts`, `objectAcl.ts`
- ✅ **Complete `@workspace/db` package** (NEW): db client (`src/index.ts`),
  full schema barrel (all tables), constants, `package.json`, `tsconfig.json`,
  `drizzle.config.ts`, migrations

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
