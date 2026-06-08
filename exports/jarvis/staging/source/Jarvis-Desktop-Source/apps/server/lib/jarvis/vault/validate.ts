/**
 * Vault Validation Framework.
 *
 * Proves a package is structurally sound and internally consistent BEFORE it is
 * trusted for a restore (disaster-recovery gate). Checks, in order of severity:
 *   1. format compatibility (major formatVersion match)
 *   2. per-table checksum recomputation vs manifest
 *   3. whole-payload checksum recomputation vs manifest (corruption/tamper)
 *   4. row-count consistency (manifest vs actual arrays)
 *   5. embedding dimensionality + model continuity
 *   6. relationship integrity — declared FK columns resolve WITHIN the package
 *      (orphan detection; an orphan would break a clean FK restore)
 *   7. asset integrity — storageKey pointers / inlined-binary coverage (info)
 *
 * `ok` is true only when every integrity check passes; asset coverage is
 * informational and never fails the report. Pure + fail-safe.
 */
import { checksumValue } from "./checksum.js";
import { VAULT_FORMAT_VERSION, VAULT_SCHEMA_VERSION, type VaultPackage, type VaultValidationReport, type ValidationCheck } from "./types.js";
import { VAULT_REGISTRY, entryByName, registryTableNames } from "./registry.js";

function majorOf(v: string): string {
  return (v || "0").split(".")[0] ?? "0";
}

export function validateVaultPackage(pkg: VaultPackage): VaultValidationReport {
  const checks: ValidationCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, ok, detail });

  const m = pkg?.manifest;
  const tables = pkg?.tables ?? {};

  if (!m) {
    return {
      ok: false,
      formatVersion: "unknown",
      schemaVersion: "unknown",
      rowCount: 0,
      tableCount: 0,
      checks: [{ name: "manifest.present", ok: false, detail: "manifest missing" }],
      generatedAt: new Date().toISOString(),
    };
  }

  // 1. format compatibility
  add(
    "format.compatible",
    majorOf(m.formatVersion) === majorOf(VAULT_FORMAT_VERSION),
    `package ${m.formatVersion} vs engine ${VAULT_FORMAT_VERSION}`,
  );

  // 2. per-table checksums
  let checksumMismatches = 0;
  for (const [name, expected] of Object.entries(m.tableChecksums ?? {})) {
    const actual = checksumValue(tables[name] ?? []);
    if (actual !== expected) checksumMismatches += 1;
  }
  add(
    "checksum.tables",
    checksumMismatches === 0,
    checksumMismatches === 0
      ? `all ${Object.keys(m.tableChecksums ?? {}).length} table checksums match`
      : `${checksumMismatches} table checksum mismatch(es)`,
  );

  // 3. whole-payload checksum
  const payloadActual = checksumValue(tables);
  add(
    "checksum.payload",
    payloadActual === m.payloadChecksum,
    payloadActual === m.payloadChecksum ? "payload checksum matches" : "payload checksum MISMATCH",
  );

  // 4. row counts
  let countMismatches = 0;
  let rowCount = 0;
  for (const [name, count] of Object.entries(m.tableCounts ?? {})) {
    const actual = (tables[name] ?? []).length;
    rowCount += actual;
    if (actual !== count) countMismatches += 1;
  }
  add(
    "rowcount.consistent",
    countMismatches === 0,
    countMismatches === 0 ? `${rowCount} rows consistent` : `${countMismatches} table row-count mismatch(es)`,
  );

  // 5. embedding dims + model
  const embRows = tables["jarvis_embeddings"] ?? [];
  let badDims = 0;
  for (const row of embRows) {
    const vec = row["embedding"];
    if (!Array.isArray(vec) || vec.length !== m.embedding.dims) badDims += 1;
  }
  add(
    "embedding.dims",
    badDims === 0,
    badDims === 0
      ? `${embRows.length} embeddings @ ${m.embedding.dims}d (${m.embedding.model})`
      : `${badDims} embedding(s) with wrong dimensionality`,
  );

  // 6. relationship integrity (FK orphans within package)
  let orphanTables = 0;
  let orphanRows = 0;
  for (const entry of VAULT_REGISTRY) {
    if (!entry.refs?.length) continue;
    const rows = tables[entry.name] ?? [];
    if (rows.length === 0) continue;
    for (const ref of entry.refs) {
      const parent = tables[ref.ref] ?? [];
      const parentIds = new Set(parent.map((r) => r["id"] as string));
      let localOrphans = 0;
      for (const row of rows) {
        const v = row[ref.col];
        if (v == null) continue;
        if (!parentIds.has(v as string)) localOrphans += 1;
      }
      if (localOrphans > 0) {
        orphanTables += 1;
        orphanRows += localOrphans;
      }
    }
  }
  add(
    "relationships.integrity",
    orphanRows === 0,
    orphanRows === 0
      ? "all declared foreign keys resolve within the package"
      : `${orphanRows} orphan FK value(s) across ${orphanTables} column(s)`,
  );

  // 7. asset integrity (informational — never fails the report)
  let withKey = 0;
  for (const entry of VAULT_REGISTRY) {
    if (!entry.storageKeyCol) continue;
    for (const row of tables[entry.name] ?? []) {
      const k = row[entry.storageKeyCol];
      if (typeof k === "string" && k.startsWith("/objects/")) withKey += 1;
    }
  }
  const inlined = pkg.assetBinaries?.length ?? 0;
  add(
    "assets.integrity",
    true,
    `${withKey} storageKey pointer(s); ${inlined} binary(ies) inlined`,
  );

  // sanity: every table present has a registry entry (forward-compat note)
  const unknown = Object.keys(tables).filter((n) => !entryByName(n));
  if (unknown.length > 0) {
    add("schema.coverage", false, `unknown table(s) not in registry: ${unknown.join(", ")}`);
  }

  // COMPLETENESS GATE (critical): every registry table must be present in BOTH
  // the manifest checksums and the table map. Without this, a clean restore —
  // which DELETEs every registry table before inserting — would silently wipe
  // any table omitted from the package and still report success (data loss).
  const checksumKeys = m.tableChecksums ?? {};
  const missing = registryTableNames().filter(
    (n) => !(n in checksumKeys) || !(n in tables),
  );
  add(
    "schema.completeness",
    missing.length === 0,
    missing.length === 0
      ? `package covers all ${registryTableNames().length} registry tables`
      : `package is MISSING ${missing.length} registry table(s) — unsafe for clean restore: ${missing.join(", ")}`,
  );

  // schema-version continuity (informational — DR across versions is allowed so
  // long as the completeness gate above holds for the current registry).
  add(
    "schema.version",
    true,
    m.schemaVersion === VAULT_SCHEMA_VERSION
      ? `schemaVersion matches engine (${VAULT_SCHEMA_VERSION})`
      : `schemaVersion ${m.schemaVersion} differs from engine ${VAULT_SCHEMA_VERSION} (completeness still enforced)`,
  );

  const ok = checks.every((c) => c.ok);
  return {
    ok,
    formatVersion: m.formatVersion,
    schemaVersion: m.schemaVersion,
    rowCount,
    tableCount: Object.keys(m.tableCounts ?? {}).length,
    checks,
    generatedAt: new Date().toISOString(),
  };
}
