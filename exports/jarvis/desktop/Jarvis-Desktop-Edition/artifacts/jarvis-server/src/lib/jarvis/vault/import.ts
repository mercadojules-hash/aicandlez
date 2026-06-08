/**
 * Vault Import Engine — reconstruction / restore.
 *
 * Three modes:
 *   - "validate"    : dry-run; runs the validation framework, writes nothing.
 *   - "incremental" : upsert by primary key (id) in dependency order — merges a
 *                     package into an existing namespace without dropping data.
 *   - "clean"       : full reconstruction into an empty namespace — DELETE all
 *                     jarvis_ rows in REVERSE dependency order, then INSERT in
 *                     forward order. Destructive; caller must pass confirm:true.
 *
 * Safety:
 *   - Every restore is preceded by validation; a structurally invalid / corrupt
 *     package aborts BEFORE any write (DR corruption gate).
 *   - All writes run inside a single transaction — partial restores never land.
 *   - Dates are revived to Date objects from ISO strings via Drizzle column
 *     metadata; pgvector embeddings pass through as number[]; unknown columns are
 *     dropped (forward-compat).
 *   - Self-referential tables are topologically sorted parents-first.
 *
 * jarvis_ ONLY: writes are confined to registry tables — no trading/AICandlez
 * surface is ever touched. Fail-safe: never throws to the caller.
 */
import { getTableColumns } from "drizzle-orm";
import { db } from "@workspace/db";
import { VAULT_REGISTRY, type VaultTableEntry } from "./registry.js";
import { validateVaultPackage } from "./validate.js";
import type { ImportResult, RestoreMode, VaultPackage } from "./types.js";

/** Revive a JSON-safe row into DB-insertable values using column metadata. */
function reviveRow(
  entry: VaultTableEntry,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const cols = getTableColumns(entry.table) as Record<string, { dataType: string }>;
  const out: Record<string, unknown> = {};
  for (const [prop, col] of Object.entries(cols)) {
    if (!(prop in row)) continue;
    const v = row[prop];
    if (v !== null && col.dataType === "date" && typeof v === "string") {
      out[prop] = new Date(v);
    } else {
      out[prop] = v;
    }
  }
  return out;
}

/** Topologically order self-referential rows so parents precede children. */
function sortSelfRef(
  rows: Record<string, unknown>[],
  selfRefProp: string,
): Record<string, unknown>[] {
  const byId = new Map(rows.map((r) => [r["id"] as string, r]));
  const placed = new Set<string>();
  const result: Record<string, unknown>[] = [];
  let remaining = [...rows];
  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    const next: Record<string, unknown>[] = [];
    for (const row of remaining) {
      const parent = row[selfRefProp] as string | null | undefined;
      if (parent == null || placed.has(parent) || !byId.has(parent)) {
        result.push(row);
        placed.add(row["id"] as string);
        progress = true;
      } else {
        next.push(row);
      }
    }
    remaining = next;
  }
  // append any cyclic leftovers verbatim
  for (const row of remaining) result.push(row);
  return result;
}

export async function importVault(
  pkg: VaultPackage,
  mode: RestoreMode,
  opts: { confirm?: boolean } = {},
): Promise<ImportResult> {
  const generatedAt = new Date().toISOString();
  const applied: Record<string, number> = {};

  const validation = validateVaultPackage(pkg);

  if (mode === "validate") {
    return { ok: validation.ok, mode, applied, totalApplied: 0, validation, error: null, generatedAt };
  }

  if (!validation.ok) {
    return {
      ok: false,
      mode,
      applied,
      totalApplied: 0,
      validation,
      error: "validation failed — refusing to restore an invalid/corrupt package",
      generatedAt,
    };
  }

  if (mode === "clean" && opts.confirm !== true) {
    return {
      ok: false,
      mode,
      applied,
      totalApplied: 0,
      validation,
      error: "clean restore is destructive — confirm:true required",
      generatedAt,
    };
  }

  try {
    let totalApplied = 0;
    await db.transaction(async (tx) => {
      if (mode === "clean") {
        // DELETE in reverse dependency order (children first).
        for (let i = VAULT_REGISTRY.length - 1; i >= 0; i--) {
          await tx.delete(VAULT_REGISTRY[i].table);
        }
      }

      // INSERT / UPSERT in forward dependency order (parents first).
      for (const entry of VAULT_REGISTRY) {
        const raw = pkg.tables[entry.name] ?? [];
        if (raw.length === 0) {
          applied[entry.name] = 0;
          continue;
        }
        const ordered = entry.selfRef ? sortSelfRef(raw, entry.selfRef) : raw;
        const idCol = (getTableColumns(entry.table) as Record<string, unknown>)["id"];
        let count = 0;
        for (const row of ordered) {
          const values = reviveRow(entry, row);
          if (mode === "incremental") {
            const set: Record<string, unknown> = { ...values };
            delete set["id"];
            await tx
              .insert(entry.table)
              .values(values)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .onConflictDoUpdate({ target: idCol as any, set });
          } else {
            await tx.insert(entry.table).values(values);
          }
          count += 1;
        }
        applied[entry.name] = count;
        totalApplied += count;
      }
    });

    return { ok: true, mode, applied, totalApplied, validation, error: null, generatedAt };
  } catch (err) {
    return {
      ok: false,
      mode,
      applied: {},
      totalApplied: 0,
      validation,
      error: err instanceof Error ? err.message : String(err),
      generatedAt,
    };
  }
}
