---
name: Jarvis Vault clean-restore completeness gate
description: Why a destructive full-namespace restore must reject incomplete packages BEFORE deleting anything.
---

A "clean" restore that DELETEs every registry table and then re-inserts per table
is only safe if the package is GUARANTEED to contain every table the registry
covers. Otherwise a package missing one table → that table gets wiped to empty
and the restore still reports success (silent data loss).

**Rule:** any destructive/whole-namespace restore must run a COMPLETENESS check
(every current-registry table present in both the manifest and the data map) as a
BLOCKING validation, and the import path must abort on `validation.ok === false`
BEFORE the first delete. Integrity checks (checksums, row counts, FK orphans)
are necessary but NOT sufficient — they only validate the keys that happen to be
present.

**Why:** integrity validation iterates the manifest's own key set, so an omitted
table is simply never checked; completeness must be asserted against the engine's
table registry, not against the package's self-description.

**How to apply:** keep schema-version equality INFORMATIONAL (cross-version DR
restores are legitimate) but make registry-completeness a hard gate. A future
schema that ADDS a table will then correctly reject older packages for clean
restore rather than wiping the new table.
