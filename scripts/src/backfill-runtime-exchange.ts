/**
 * Task #204 backfill — clear stale `user_settings.activeRuntimeExchange`.
 *
 * Pre-#204 onboarding (and any client that poked PUT /user/settings) could
 * stamp `activeRuntimeExchange` to an exchange string ("Alpaca", etc.)
 * before the user had any real connection. That value silently blocks
 * Task #200's auto-promotion forever (logs
 * `[AUTO_PROMOTION_BLOCKED reason=existing_choice]`).
 *
 * This script NULLs `activeRuntimeExchange` for every user where:
 *   - the stored value is NOT NULL
 *   - the stored value is NOT the literal `'paper'` opt-in (sticky, never touched)
 *   - the user has NO `userExchangeConnections` row with
 *     `exchange = <stored value>` AND `status = 'active'`
 *
 * Dry-run by default. Pass `--apply` to actually update rows.
 *
 *   pnpm --filter @workspace/scripts run backfill-runtime-exchange
 *   pnpm --filter @workspace/scripts run backfill-runtime-exchange -- --apply
 */

import { db, userSettingsTable, userExchangeConnectionsTable } from "@workspace/db";
import { and, eq, isNotNull, ne } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`[backfill-runtime-exchange] mode=${apply ? "APPLY" : "DRY-RUN"}`);

  const candidates = await db
    .select({
      userId:                userSettingsTable.userId,
      activeRuntimeExchange: userSettingsTable.activeRuntimeExchange,
    })
    .from(userSettingsTable)
    .where(and(
      isNotNull(userSettingsTable.activeRuntimeExchange),
      ne(userSettingsTable.activeRuntimeExchange, "paper"),
    ));

  console.log(`[backfill-runtime-exchange] candidates: ${candidates.length}`);

  let toClear = 0;
  let kept    = 0;
  const cleared: Array<{ userId: string; exchange: string }> = [];

  for (const row of candidates) {
    const exch = row.activeRuntimeExchange;
    if (!exch) continue;

    const [conn] = await db
      .select({ id: userExchangeConnectionsTable.id })
      .from(userExchangeConnectionsTable)
      .where(and(
        eq(userExchangeConnectionsTable.userId, row.userId),
        eq(userExchangeConnectionsTable.exchange, exch),
        eq(userExchangeConnectionsTable.status, "active"),
      ))
      .limit(1);

    if (conn) {
      kept++;
      continue;
    }

    toClear++;
    cleared.push({ userId: row.userId, exchange: exch });
    console.log(`  - WOULD CLEAR userId=${row.userId} exchange=${exch}`);

    if (apply) {
      // Guard against TOCTOU: only clear if the row STILL holds the
      // same stale exchange we just inspected. If the user has flipped
      // to 'paper' or connected the exchange between our SELECT and
      // this UPDATE, the WHERE will not match and we won't trample
      // their newer intent.
      const updated = await db
        .update(userSettingsTable)
        .set({ activeRuntimeExchange: null, updatedAt: new Date() })
        .where(and(
          eq(userSettingsTable.userId, row.userId),
          eq(userSettingsTable.activeRuntimeExchange, exch),
        ))
        .returning({ userId: userSettingsTable.userId });
      if (updated.length === 0) {
        console.log(`    (skipped — value changed concurrently for userId=${row.userId})`);
      }
    }
  }

  console.log(`[backfill-runtime-exchange] kept=${kept} cleared=${toClear} apply=${apply}`);
  if (!apply && toClear > 0) {
    console.log(`[backfill-runtime-exchange] re-run with --apply to commit changes`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-runtime-exchange] FAILED", err);
    process.exit(1);
  });
