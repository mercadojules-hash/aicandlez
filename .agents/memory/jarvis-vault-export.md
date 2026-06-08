---
name: Jarvis Vault export
description: How the Jarvis Vault export works, where Jarvis data lives, and the no-secrets guarantee
---

# Jarvis Vault export

**Jarvis is NOT deployed to Render** (absent from `render.yaml`). It runs only in
the Replit workspace, against the Replit `DATABASE_URL` and Replit object storage
(`PRIVATE_OBJECT_DIR` / `DEFAULT_OBJECT_STORAGE_BUCKET_ID`). So "production Jarvis
data" = the Replit dev DB, NOT the Render prod DB. Run exports here.

**Export path is admin-auth gated** (`requireAuth + requireRole(ADMIN_ROLES)` on
`POST /jarvis/vault/export`). The agent cannot mint a Clerk token, so run the
export programmatically via the api-server's `tsx` runtime importing
`exportVault`/`validateVaultPackage`/`vaultReadiness`/`defaultVaultStorage` from
`lib/jarvis/vault/index.js`. Replicate the route's persist step yourself:
serialize pkg → `defaultVaultStorage().put(buf,"application/json")` → returns the
`/objects/...` storageKey.

**No-secrets guarantee (structural):** the vault registry references the
`jarvis_` namespace ONLY — never `user_exchange_connections`, Clerk/Stripe
secrets, or env values. `jarvis_credentials` is metadata-only by schema (env var
NAME + a `present` boolean, never a value); `jarvis_render_services.raw` is a
sanitized projection. **Why:** lets the export double as an off-platform backup
without leaking credentials.

**Secret-scan false positives to expect** when grepping the package: it includes
`jarvis_code_files` (a full source-code mirror). Matches for `password`,
`-----BEGIN PRIVATE KEY-----`, `postgres://user:pass@`, and Stripe `price_…` IDs
are NOT real secrets — they are HTML `type="password"` attrs, PEM *marker*
strings in exchange-key UI (no base64 body → `realKeyBody=false`), the
`.env.production.example` placeholder, and public price IDs. **How to apply:**
to prove no real leak, test membership of actual `process.env` secret VALUES
(len≥8) and confirm any PEM marker has no key body; never just pattern-match.

**Run quirk:** `pnpm --filter @workspace/api-server exec tsx <script>` runs with
cwd = the package dir, so relative output paths land under
`artifacts/api-server/`, not the workspace root.
