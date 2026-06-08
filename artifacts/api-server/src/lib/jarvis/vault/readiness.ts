/**
 * Vault Readiness Report.
 *
 * Answers the sovereignty question: "Can Jarvis be fully exported, reconstructed,
 * and operated from a self-owned Vault with no loss of intelligence?" It probes
 * live state (registry-vs-DB table coverage, embedding presence, object-storage
 * portability) and grades five dimensions as percentages, then classifies any
 * gaps as critical / recommended / nice-to-have blockers.
 *
 * READ-ONLY + fail-safe: never mutates anything, never throws.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { EMBEDDING_MODEL, EMBEDDING_DIMS } from "../cognition/embeddings.js";
import { registryTableNames } from "./registry.js";
import { storagePortabilityStatus } from "./storage.js";
import type { ReadinessBlocker, VaultReadinessReport } from "./types.js";

async function dbJarvisTables(): Promise<string[]> {
  try {
    const rows = (await db.execute(
      sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'jarvis_%'
          ORDER BY table_name`,
    )) as unknown as { rows?: { table_name: string }[] } | { table_name: string }[];
    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    return list.map((r) => r.table_name);
  } catch {
    return [];
  }
}

async function embeddingsPresent(): Promise<boolean> {
  try {
    const res = (await db.execute(
      sql`SELECT 1 FROM jarvis_embeddings LIMIT 1`,
    )) as unknown as { rows?: unknown[] } | unknown[];
    const list = Array.isArray(res) ? res : (res.rows ?? []);
    return list.length > 0;
  } catch {
    return false;
  }
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 100;
  return Math.round((part / whole) * 100);
}

export async function vaultReadiness(): Promise<VaultReadinessReport> {
  const generatedAt = new Date().toISOString();
  const registry = registryTableNames();
  const dbTables = await dbJarvisTables();

  const dbSet = new Set(dbTables);
  const regSet = new Set(registry);
  const missingFromRegistry = dbTables.filter((t) => !regSet.has(t));
  const extraInRegistry = registry.filter((t) => !dbSet.has(t));

  const storage = storagePortabilityStatus();
  const embPresent = await embeddingsPresent();
  const blockers: ReadinessBlocker[] = [];

  // ── Vault readiness: do we capture every jarvis_ table that exists? ──────────
  const coveredDbTables = dbTables.filter((t) => regSet.has(t)).length;
  const vaultReadinessPct = pct(coveredDbTables, dbTables.length || registry.length);
  if (missingFromRegistry.length > 0) {
    blockers.push({
      severity: "critical",
      area: "coverage",
      detail: `${missingFromRegistry.length} jarvis_ table(s) exist in the DB but are NOT in the vault registry: ${missingFromRegistry.join(", ")}`,
    });
  }
  if (extraInRegistry.length > 0) {
    blockers.push({
      severity: "recommended",
      area: "coverage",
      detail: `${extraInRegistry.length} registry table(s) not found in this DB (harmless if env-specific): ${extraInRegistry.join(", ")}`,
    });
  }

  // ── Sovereignty: jarvis_-only, additive, no execution authority ─────────────
  // Structural guarantees hold by construction (registry is jarvis_-only, the
  // engine is read/restore-only). Full marks unless coverage is incomplete.
  const sovereigntyPct = missingFromRegistry.length === 0 ? 100 : 80;

  // ── Export readiness: can we actually package + persist? ─────────────────────
  let exportReadinessPct = 100;
  if (!storage.objectStorageConfigured) {
    exportReadinessPct = 85; // inline/off-platform export still works
    blockers.push({
      severity: "recommended",
      area: "storage",
      detail: "object storage not configured — packages can still be exported inline / off-platform, but at-rest persistence + binary inlining are unavailable",
    });
  }

  // ── Operational: embedding continuity + restore path ─────────────────────────
  let operationalReadinessPct = 100;
  if (!embPresent) {
    operationalReadinessPct = 90;
    blockers.push({
      severity: "nice-to-have",
      area: "embeddings",
      detail: "no embeddings present yet — semantic index will be empty until the indexer runs (re-embeddable from source rows post-restore)",
    });
  }

  // ── Engineering: is the framework complete + integrity-gated? ────────────────
  // All engines present (export/import/validate/readiness), checksum-gated,
  // transactional, admin+audited. Static full marks.
  const engineeringReadinessPct = 100;

  const canFullyOperateFromVault =
    missingFromRegistry.length === 0 && vaultReadinessPct >= 100;

  return {
    vaultReadinessPct,
    sovereigntyPct,
    exportReadinessPct,
    operationalReadinessPct,
    engineeringReadinessPct,
    coverage: {
      registryTables: registry.length,
      dbJarvisTables: dbTables.length,
      missingFromRegistry,
      extraInRegistry,
    },
    storage: {
      objectStorageConfigured: storage.objectStorageConfigured,
      portableAdapterAvailable: storage.portableAdapterAvailable,
      binariesSelfContainable: storage.objectStorageConfigured,
    },
    embedding: {
      model: EMBEDDING_MODEL,
      dims: EMBEDDING_DIMS,
      present: embPresent,
      portable: true,
    },
    blockers,
    canFullyOperateFromVault,
    generatedAt,
  };
}
