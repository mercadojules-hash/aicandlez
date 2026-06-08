/**
 * Jarvis Vault Package format + engine result contracts.
 *
 * The Vault Package is the portable, self-describing unit of Jarvis sovereignty:
 * a single JSON document that captures the ENTIRE `jarvis_` namespace (rows +
 * pgvector embeddings + creative-asset metadata + relationships) plus a manifest
 * with versioning and content checksums. It is designed to be written to ANY
 * storage backend (Replit object storage, S3/MinIO, or an external drive) and
 * re-imported into a fresh Postgres elsewhere with no intelligence loss.
 *
 * Bytes-in-Postgres invariant is preserved: creative binaries live behind
 * `storageKey` pointers; only OPTIONAL, best-effort base64 copies are inlined
 * when the caller asks to make the package fully self-contained.
 */

/** Bump when the on-disk package shape changes incompatibly. */
export const VAULT_FORMAT_VERSION = "1.0.0";

/**
 * Logical Jarvis schema generation. Bump when the jarvis_ table SET changes
 * (table added/removed) so an importer can detect a structural mismatch before
 * touching data. NOT a substitute for Drizzle migrations — see migrationVersion.
 */
export const VAULT_SCHEMA_VERSION = "jarvis.2026.06";

export type RestoreMode = "validate" | "incremental" | "clean";

export interface VaultAssetBinary {
  storageKey: string;
  mimeType: string;
  bytes: number;
  /** base64 of the object bytes — present only when binaries were inlined. */
  base64: string;
}

export interface VaultManifest {
  formatVersion: string;
  schemaVersion: string;
  /** Best-effort latest Drizzle migration tag (continuity hint, not a gate). */
  migrationVersion: string;
  generator: "jarvis-vault";
  createdAt: string;
  createdBy: string | null;
  /** "all" = full namespace (integrity-complete). */
  scope: "all";
  embedding: { model: string; dims: number; count: number };
  assets: {
    total: number;
    withStorageKey: number;
    binariesIncluded: number;
  };
  /** Row count per table name. */
  tableCounts: Record<string, number>;
  rowCount: number;
  /** SHA-256 per table over its canonical row array. */
  tableChecksums: Record<string, string>;
  /** SHA-256 over the canonical full table map (corruption/tamper detection). */
  payloadChecksum: string;
}

export interface VaultPackage {
  manifest: VaultManifest;
  /** tableName -> rows (JSON-safe; Dates serialized to ISO strings). */
  tables: Record<string, Record<string, unknown>[]>;
  /** Optional inlined creative binaries (when self-contained export requested). */
  assetBinaries?: VaultAssetBinary[];
}

export interface ExportOptions {
  createdBy?: string | null;
  /** Inline creative binaries as base64 to make the package self-contained. */
  includeBinaries?: boolean;
  /** Hard cap on inlined binary bytes (safety). Default 64 MiB. */
  maxBinaryBytes?: number;
}

export interface ExportResult {
  ok: boolean;
  manifest: VaultManifest | null;
  /** The full package — callers persist this to a storage backend. */
  pkg: VaultPackage | null;
  error: string | null;
}

export interface ValidationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VaultValidationReport {
  ok: boolean;
  formatVersion: string;
  schemaVersion: string;
  rowCount: number;
  tableCount: number;
  checks: ValidationCheck[];
  generatedAt: string;
}

export interface ImportResult {
  ok: boolean;
  mode: RestoreMode;
  /** Rows written per table (insert + update). Empty for validate mode. */
  applied: Record<string, number>;
  totalApplied: number;
  validation: VaultValidationReport | null;
  error: string | null;
  generatedAt: string;
}

export type BlockerSeverity = "critical" | "recommended" | "nice-to-have";

export interface ReadinessBlocker {
  severity: BlockerSeverity;
  area: string;
  detail: string;
}

export interface VaultReadinessReport {
  vaultReadinessPct: number;
  sovereigntyPct: number;
  exportReadinessPct: number;
  operationalReadinessPct: number;
  engineeringReadinessPct: number;
  /** Tables the registry covers vs tables that actually exist in the DB. */
  coverage: {
    registryTables: number;
    dbJarvisTables: number;
    missingFromRegistry: string[];
    extraInRegistry: string[];
  };
  storage: {
    objectStorageConfigured: boolean;
    portableAdapterAvailable: boolean;
    binariesSelfContainable: boolean;
  };
  embedding: {
    model: string;
    dims: number;
    present: boolean;
    portable: boolean;
  };
  blockers: ReadinessBlocker[];
  canFullyOperateFromVault: boolean;
  generatedAt: string;
}
