/**
 * Vault Export Engine.
 *
 * Walks the dependency-ordered registry, SELECTs every row of every jarvis_
 * table (pgvector embeddings come back as number[] via the Drizzle vector type),
 * normalizes to JSON-safe values (Dates -> ISO strings) so the package is a
 * portable, checksummable document, and assembles a manifest with per-table +
 * whole-payload SHA-256 checksums for tamper/corruption detection.
 *
 * Relationships, source paths, identifiers, timestamps and business associations
 * survive verbatim because we export FULL rows (all columns) — nothing is
 * projected away. Creative binaries stay as `storageKey` pointers unless the
 * caller asks to inline them (best-effort, capped) for a fully self-contained
 * package.
 *
 * FAIL-SAFE: never throws. Any failure resolves to `{ ok:false, error }`.
 * READ-ONLY: this engine performs SELECTs only — it never mutates jarvis_ data.
 */
import { db } from "@workspace/db";
import { EMBEDDING_MODEL, EMBEDDING_DIMS } from "../cognition/embeddings.js";
import { checksumValue } from "./checksum.js";
import { VAULT_REGISTRY } from "./registry.js";
import {
  VAULT_FORMAT_VERSION,
  VAULT_SCHEMA_VERSION,
  type ExportOptions,
  type ExportResult,
  type VaultAssetBinary,
  type VaultManifest,
  type VaultPackage,
} from "./types.js";
import { defaultVaultStorage } from "./storage.js";

const DEFAULT_MAX_BINARY_BYTES = 64 * 1024 * 1024;

/** JSON-safe deep clone (Date -> ISO string, strips undefined). */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function migrationVersion(): string {
  return process.env.JARVIS_VAULT_MIGRATION_VERSION?.trim() || "baseline";
}

export async function exportVault(opts: ExportOptions = {}): Promise<ExportResult> {
  try {
    const tables: Record<string, Record<string, unknown>[]> = {};
    const tableCounts: Record<string, number> = {};
    const tableChecksums: Record<string, string> = {};
    let rowCount = 0;
    let embeddingCount = 0;
    let assetsTotal = 0;
    let assetsWithKey = 0;
    const assetKeys: { storageKey: string; mimeCol?: string }[] = [];

    for (const entry of VAULT_REGISTRY) {
      const rows = (await db.select().from(entry.table)) as Record<
        string,
        unknown
      >[];
      const safe = rows.map((r) => jsonSafe(r));
      tables[entry.name] = safe;
      tableCounts[entry.name] = safe.length;
      tableChecksums[entry.name] = checksumValue(safe);
      rowCount += safe.length;

      if (entry.hasEmbedding) embeddingCount = safe.length;

      if (entry.storageKeyCol) {
        for (const row of safe) {
          const key = row[entry.storageKeyCol];
          if (entry.name === "jarvis_creative_assets") assetsTotal += 1;
          if (typeof key === "string" && key.startsWith("/objects/")) {
            assetsWithKey += 1;
            assetKeys.push({ storageKey: key });
          }
        }
      }
    }

    // Optional: inline creative binaries for a fully self-contained package.
    let assetBinaries: VaultAssetBinary[] | undefined;
    let binariesIncluded = 0;
    if (opts.includeBinaries && assetKeys.length > 0) {
      const cap = opts.maxBinaryBytes ?? DEFAULT_MAX_BINARY_BYTES;
      const storage = defaultVaultStorage();
      assetBinaries = [];
      let used = 0;
      const seen = new Set<string>();
      for (const { storageKey } of assetKeys) {
        if (seen.has(storageKey)) continue;
        seen.add(storageKey);
        const bytes = await storage.get(storageKey);
        if (!bytes) continue;
        if (used + bytes.length > cap) continue;
        used += bytes.length;
        assetBinaries.push({
          storageKey,
          mimeType: "application/octet-stream",
          bytes: bytes.length,
          base64: bytes.toString("base64"),
        });
        binariesIncluded += 1;
      }
    }

    const payloadChecksum = checksumValue(tables);

    const manifest: VaultManifest = {
      formatVersion: VAULT_FORMAT_VERSION,
      schemaVersion: VAULT_SCHEMA_VERSION,
      migrationVersion: migrationVersion(),
      generator: "jarvis-vault",
      createdAt: new Date().toISOString(),
      createdBy: opts.createdBy ?? null,
      scope: "all",
      embedding: {
        model: EMBEDDING_MODEL,
        dims: EMBEDDING_DIMS,
        count: embeddingCount,
      },
      assets: {
        total: assetsTotal,
        withStorageKey: assetsWithKey,
        binariesIncluded,
      },
      tableCounts,
      rowCount,
      tableChecksums,
      payloadChecksum,
    };

    const pkg: VaultPackage = { manifest, tables };
    if (assetBinaries && assetBinaries.length > 0) pkg.assetBinaries = assetBinaries;

    return { ok: true, manifest, pkg, error: null };
  } catch (err) {
    return {
      ok: false,
      manifest: null,
      pkg: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
