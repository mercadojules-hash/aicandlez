# Replit Dependencies & Their Local Replacements

The complete list of Replit couplings in Jarvis and how each is removed for the
standalone Mac build. **There are only three code-level coupling sites.**

## Code-level couplings (3 import sites)

| File                                   | Replit dependency           | Replacement                          |
| -------------------------------------- | --------------------------- | ------------------------------------ |
| `lib/jarvis/vault/storage.ts`          | `ObjectStorageService` (App Storage / GCS) | Local filesystem adapter |
| `lib/jarvis/creative/visionStorage.ts` | `ObjectStorageService`      | Local filesystem adapter             |
| `lib/jarvis/githubClient.ts`           | `@replit/connectors-sdk`    | Octokit + PAT, or disabled (Phase 1) |

Everything else in the 72-file / ~24k-LOC backend depends only on portable
packages (`@workspace/db`, logger, Clerk middleware, OpenAI SDK).

## Object Storage (Replit App Storage → local FS)
- **Used by:** creative/vision image assets, Phoenix video binaries, vault
  binary exports.
- **Replit form:** `@google-cloud/storage`-backed App Storage with presigned URLs;
  env `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`,
  `PUBLIC_OBJECT_SEARCH_PATHS`.
- **Local replacement:** a `localStorage.ts` adapter exposing the same surface
  (`getObjectEntityUploadURL`, `normalizeObjectEntityPath`,
  `trySetObjectEntityAclPolicy`, read/stream) backed by `JARVIS_STORAGE_DIR`.
  Optionally MinIO for S3-compatible presigned-URL parity.
- **Phase 1:** swap the 2 import sites; features degrade gracefully until wired.

## GitHub Connector (`@replit/connectors-sdk` → Octokit)
- **Used by:** `githubClient.ts` for read-only repo awareness (sovereignty).
- **Replit form:** `ReplitConnectors` proxy (GET-only).
- **Local replacement:** Octokit + a personal access token, OR feature-flag off.
- **Phase 1:** disabled (non-critical, read-only).

## Replit-managed Clerk (→ your own Clerk app)
- Not a code coupling — only the *key provisioning* is Replit-managed. Supply your
  own Clerk application keys locally. Auth code is unchanged.

## Replit AI Proxy (dropped)
- The last-resort cognition fallback (`@workspace/integrations-anthropic-ai`).
  Irrelevant once Ollama is the primary cognition provider; the dependency is
  dropped from the standalone build.

## Replit Vite dev plugins (dropped)
- `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`,
  `@replit/vite-plugin-runtime-error-modal` — cosmetic dev tooling; removed from
  the frontend Vite config.

## Replit workspace proxy / path routing (dropped)
- On Replit, services are reached through a shared mTLS proxy with path prefixes.
  Locally, frontend talks to the backend directly via `VITE_API_BASE_URL`
  (`http://localhost:3000`). No proxy needed.

## Summary

| Replit dependency        | Severity | Phase 1 action          |
| ------------------------ | -------- | ----------------------- |
| Object storage           | Medium   | Local FS adapter        |
| GitHub connector         | Low      | Disable (Octokit later) |
| Replit-managed Clerk     | Low      | Own Clerk keys          |
| Replit AI proxy          | None     | Drop (Ollama primary)   |
| Vite dev plugins         | None     | Remove                  |
| Workspace proxy          | None     | Direct localhost        |

**Net:** no hard Replit lock-in. Two adapters (storage + cognition) are the only
real engineering; the rest is configuration.
