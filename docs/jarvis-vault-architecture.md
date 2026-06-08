# Jarvis Vault — Architecture Plan (DESIGN ONLY)

> **Status: DESIGN ONLY.** This document describes a proposed architecture. It
> contains **no implementation**, schedules no migration, and changes no running
> code. Nothing here is wired until a separate, explicitly-approved build task is
> opened. Treat every "will" / "would" below as a proposal, not a commitment.

## 0. Purpose & motivation

Jarvis is the isolated Creative + Executive Intelligence product inside the
AICandlez monorepo. Its durable state is currently spread across three storage
tiers:

1. **Relational rows** in Postgres (`jarvis_*` tables) — businesses, brand
   profiles, executive memory, cognition runs, creative campaigns/assets metadata,
   governance.
2. **Vector embeddings** — the semantic index used by retrieval/grounding.
3. **Binary objects** in object storage — creative image binaries, referenced
   from `jarvis_creative_assets.storageKey` (bytes are **never** in Postgres).

The **Vault** is a proposed portability + durability layer that lets a single
business's entire Jarvis footprint be **exported, archived, and re-imported**
(same environment, a fresh environment, or an external/offline drive) as one
self-describing bundle, without coupling to the trading system and without
breaking the existing advisory / governed / audited invariants.

This plan covers seven areas:

1. Export strategy
2. Import strategy
3. Embedding migration
4. Creative-asset migration
5. External-drive folder structure
6. Object-storage migration
7. Business portability

---

## 1. Export strategy

### 1.1 Unit of export

The atomic export unit is **one business** (`jarvis_businesses.id`), because every
other Jarvis record is — directly or transitively — scoped to a business. A
"full vault" export is simply the union of per-business bundles plus a small set
of global/shared rows (e.g. provider/model catalogs that are not business-scoped).

### 1.2 What is exported (logical layers)

| Layer | Source | Export form |
| ----- | ------ | ----------- |
| Registry | `jarvis_businesses` + brand profile rows | JSON records |
| Executive memory | memory/breadcrumb tables (business-scoped) | JSON records |
| Cognition runs | run/ledger tables (business-scoped) | JSON records (metadata only) |
| Creative | `jarvis_creative_campaigns`, `jarvis_creative_assets` | JSON records + referenced binaries |
| Governance | governance/audit rows tied to the above | JSON records |
| Embeddings | vector index entries for the business | see §3 |
| Binaries | object storage objects referenced by `storageKey` | copied into the bundle (see §4, §6) |

### 1.3 Bundle shape (proposed)

A bundle is a directory (optionally zipped) with a top-level `manifest.json` and
one sub-tree per layer:

```
vault-bundle/
  manifest.json                # schema version, business id(s), counts, checksums, createdAt
  registry/business.json
  registry/brand-profile.json
  memory/*.json
  cognition/runs.json
  creative/campaigns.json
  creative/assets.json         # metadata; each row carries a *relative* binaryPath
  governance/*.json
  embeddings/embeddings.jsonl   # see §3 (vectors + the text + the embedding-model id)
  objects/<sha256>/<originalName>   # binary payloads, content-addressed
```

### 1.4 Principles

- **Metadata/bytes split preserved.** JSON records hold metadata; binaries live
  under `objects/` and are referenced by relative path. This mirrors the live
  invariant (no bytes in Postgres).
- **Content-addressed binaries.** Each object is stored under its `sha256`, so
  the same image referenced by N assets is stored once and integrity is
  verifiable on import.
- **Deterministic + resumable.** Export streams layer-by-layer and records
  progress in the manifest so a large business can resume after interruption.
- **Read-only producer.** Export never mutates live state. It is advisory and
  audited (one `audit` row: `vault.export`), consistent with all Jarvis actions.
- **Schema-versioned.** `manifest.schemaVersion` gates import-time compatibility
  (see §2.3).
- **No secrets.** Credentials, vault master keys, provider API keys, and PII are
  **never** exported. Encrypted exchange credentials and any trading-system data
  are explicitly out of scope — the Vault is Jarvis-only.

---

## 2. Import strategy

### 2.1 Modes

- **Restore** — re-create a business that no longer exists (new id allowed via a
  remap, or original id if free).
- **Clone** — import under a brand-new business id into the same environment
  (always remapped), for duplication/templating.
- **Merge** (advanced, opt-in) — reconcile a bundle into an existing business;
  default OFF because it risks silent overwrite. Merge would be additive-only
  with explicit conflict reporting.

### 2.2 ID remapping

Every primary key in the bundle passes through an **id remap table** built at
import start: `oldId -> newId`. All foreign-key references (campaign→asset,
asset→business, memory→business, embedding→sourceRow) are rewritten through this
table before insert. This makes Clone safe and makes Restore tolerant of id
collisions.

### 2.3 Ordering, idempotency, validation

- **Topological insert order:** business → brand profile → memory/cognition →
  campaigns → assets → governance → embeddings, so FKs always resolve.
- **Pre-flight validation:** verify `manifest.schemaVersion` is supported, verify
  every `objects/<sha256>` checksum, verify every asset `binaryPath` resolves,
  and verify the embedding model id is one the target can serve (see §3.3).
- **Idempotent + transactional per layer:** re-running an interrupted import does
  not duplicate rows (keyed on remap + natural keys); a layer failure rolls back
  that layer and reports, leaving the system in a known state. Import is
  **fail-safe and advisory** — a degraded import (e.g. embeddings unsupported)
  still restores everything it can and reports exactly what was skipped.
- **Audited:** one `vault.import` audit row with counts + outcome.

### 2.4 Binary rehydration

For each asset, the importer uploads `objects/<sha256>` into the target object
store and writes the resulting **new** `storageKey` onto the imported asset row
(see §6). The bundle's relative path is never persisted as a `storageKey`.

---

## 3. Embedding migration

### 3.1 The core risk

Embeddings are only comparable **within the same embedding model + dimensionality**.
A vector produced by model A is meaningless in an index built for model B. The
Vault must therefore treat the **embedding model id as part of the data**, not an
environment assumption.

### 3.2 What the bundle carries

`embeddings/embeddings.jsonl` — one line per indexed chunk:

```
{ "sourceType": "...", "sourceId": "<oldId>", "text": "<the chunk text>",
  "vector": [ ... ], "model": "<embedding-model-id>", "dim": <n> }
```

Carrying **both the vector and the original text** is deliberate: it enables two
import paths.

### 3.3 Two import paths (chosen at import time)

1. **Same model available → copy vectors.** If the target can serve the same
   `model`/`dim`, vectors are inserted as-is (fast, exact). Manifest records the
   model so this is a hard precondition, not a guess.
2. **Model differs/unavailable → re-embed from text.** The importer re-embeds the
   carried `text` with the target's current embedding model and rebuilds the
   index. Slower and costs budget, but always correct. This is the **default
   fallback** and the reason text is carried alongside vectors.

### 3.4 Migration (model upgrade) as a first-class case

The same machinery handles an in-place embedding-model **upgrade**: export →
re-embed-from-text on import. The Vault thus doubles as the safe path for rotating
the embedding model without losing semantic memory. Re-embedding is budget-gated
through the existing cognition budget primitives and is fail-safe (partial
re-embed reports what remains stale).

---

## 4. Creative-asset migration

### 4.1 Two-part asset

A creative asset is **a Postgres metadata row** (`jarvis_creative_assets`:
kind, status, governanceState, groundingScore, citations, `storageKey`,
`mimeType`, …) **plus**, for image/binary kinds, **one object in object storage**.
TEXT kinds (`ad_concept`) have no binary.

### 4.2 Export

- Metadata rows → `creative/assets.json`, but the live `storageKey` is **replaced
  by a relative `binaryPath`** (`objects/<sha256>/<name>`) for portability.
- For each binary asset, the referenced object is streamed from object storage,
  hashed, and written under `objects/`. Missing/unreadable binaries are recorded
  as `binaryMissing: true` rather than failing the whole export (honest
  degradation).

### 4.3 Import

- Insert metadata rows through the id remap.
- Rehydrate binaries (§2.4) and set the new `storageKey`.
- **Governance is preserved, not bypassed.** Asset `status`/`governanceState`
  import exactly as captured: a `draft`/`require_approval` asset stays
  unapproved. Import must **never** silently promote an asset to published, and
  must never auto-post. (Published-state assets import as published *metadata*
  only; the publish gate's existing rule that binaries are never auto-promoted
  still holds.)
- Null-grounding image assets retain their null grounding + `require_approval`
  posture, consistent with the live publish gate.

---

## 5. External-drive folder structure

For offline / cold-archive / hand-carry use, a vault is laid out so it is
self-describing and browsable without any service running:

```
JarvisVault/
  VAULT.json                     # top-level index: every business + bundle path + schema version
  businesses/
    <business-slug>-<shortId>/
      manifest.json
      registry/ memory/ cognition/ creative/ governance/ embeddings/ objects/
  _global/                       # non-business-scoped shared catalogs (model lists, etc.)
  CHECKSUMS.txt                  # sha256 of every file, for integrity verification
  README.txt                    # human-readable description, schema version, restore steps
```

Principles:

- **Self-contained & inspectable.** A human (or a future importer) can open
  `VAULT.json`, see what's inside, and verify integrity from `CHECKSUMS.txt`
  with standard tools — no Jarvis instance required.
- **One folder per business** keeps Business Portability (§7) trivial: copy a
  single sub-tree to move one business.
- **Content-addressed `objects/`** dedupes binaries within a business and makes
  the tree safe to `rsync`.
- **Compression optional.** The tree zips cleanly; the zip is the transport form,
  the tree is the canonical form.

---

## 6. Object-storage migration

### 6.1 The portability problem

`storageKey` values (`/objects/<entity>`) resolve against a **specific bucket**
configured by `PRIVATE_OBJECT_DIR` / `DEFAULT_OBJECT_STORAGE_BUCKET_ID`. They are
**not portable** across environments. Therefore the bundle must never persist a
foreign `storageKey`; it carries content-addressed bytes + relative paths and
re-derives a fresh `storageKey` on import.

### 6.2 Export

For each referenced object: resolve via the storage service, stream bytes into
`objects/<sha256>/<name>`, record `{ sha256, size, mimeType }` in the manifest.
Never copy the raw `storageKey` string into the bundle as an address.

### 6.3 Import / cross-bucket copy

For each object: upload bytes into the **target** bucket via the standard upload
path, obtain the new entity path, normalize it to a `storageKey`, and stamp it on
the imported asset row. This is effectively a **bucket-to-bundle-to-bucket** copy,
so it works across Replit object storage instances, across Render/prod, and to/from
an external drive identically.

### 6.4 Integrity & ACL

- Every object is verified against its `sha256` before its `storageKey` is
  committed (no dangling/corrupt references).
- Imported objects are written with the **same private ACL posture** as live
  creative binaries (`{ owner, visibility: private }`); the Vault never relaxes
  visibility on import.

---

## 7. Business portability

### 7.1 Goal

Move or copy **one business's entire Jarvis identity** — registry, brand,
executive memory, semantic index, creative history + binaries, governance trail —
between environments (dev ↔ prod ↔ external drive ↔ a fresh Jarvis instance)
losslessly, with the trading system entirely uninvolved.

### 7.2 How the prior sections compose

- **Self-contained bundle** (§1) + **id remap import** (§2) = a business can land
  in any environment without id collisions.
- **Embeddings carry text + model** (§3) = semantic memory survives even when the
  destination uses a different embedding model.
- **Content-addressed binaries + cross-bucket copy** (§4, §6) = images follow the
  business regardless of which bucket each environment uses.
- **One folder per business** (§5) = "send a business to someone" is literally
  copying one directory.

### 7.3 Invariants that MUST survive a move

1. **Isolation:** Vault touches `jarvis_*` + Jarvis object-storage only. No
   trading tables, no exchange credentials, no `users`/billing data.
2. **Advisory-only:** import restores drafts/approvals **as captured**; it never
   publishes, never auto-posts, never escalates governance.
3. **Audited:** export and import each write an audit row.
4. **Fail-safe + honest degradation:** any unreadable binary, unsupported
   embedding model, or partial layer is reported, not hidden; the operation
   restores everything it safely can.
5. **No secrets in the bundle.**
6. **Admin/super-admin gated**, like every other Jarvis Creative surface.

### 7.4 Explicit non-goals (this design)

- No live/continuous replication or sync — Vault is point-in-time bundles.
- No cross-business merge of memory/embeddings — businesses stay isolated.
- No trading-system data of any kind.
- No automated scheduling — invocation is an explicit, audited admin action.

---

## 8. Open questions (to resolve before any build task)

1. **Bundle transport format** — directory-first with optional zip, or a single
   streamed archive (e.g. tar) for very large businesses?
2. **Embedding default on import** — prefer copy-when-model-matches, or always
   re-embed for a guaranteed-consistent index (slower, costs budget)?
3. **Merge mode** — needed at all in v1, or Restore + Clone only?
4. **Size ceilings** — chunking/resume thresholds for businesses with large
   creative-binary histories.
5. **Encryption at rest** for external-drive bundles — out of scope here, but
   should the manifest reserve a field for it?

> Again: **DESIGN ONLY.** No code, schema, or migration is implied by this
> document. A separate approved task is required to implement any part of it.
