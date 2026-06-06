/**
 * One-off remediation: backfill real broker exit prices for teedelgado's
 * zeroed-PnL live trades (the toFixed(2) "exit == entry" precision-collapse bug).
 *
 * READ-ONLY broker calls (adapter.getOrder on the recorded close order id).
 * Dry-run by default — prints an old->new report and aggregates. Pass APPLY=1
 * to commit the corrections (sim_trades rows) inside a single transaction.
 *
 * Run:  node --import tsx/esm artifacts/api-server/src/scripts/backfillZeroedExits.ts
 *       APPLY=1 node --import tsx/esm artifacts/api-server/src/scripts/backfillZeroedExits.ts
 *
 * Targets PROD via RENDER_PROD_DATABASE_URL. Uses VAULT_MASTER_KEY (same secret
 * as prod) to decrypt the user's exchange credentials.
 */
import { createRequire } from "node:module";
import { vault } from "../services/vault/CredentialVault.js";

// Minimal local typing for the `pg` surface this one-off script uses, so it
// typechecks without adding `pg` to api-server's dependency graph (it is only an
// ops script, resolved at runtime from lib/db's install).
interface PgQueryResult<T> {
  rows: T[];
  rowCount: number | null;
}
interface PgClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<PgQueryResult<T>>;
  release(): void;
}
interface PgPool {
  query<T = unknown>(text: string, params?: unknown[]): Promise<PgQueryResult<T>>;
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}
interface PgModule {
  Pool: new (config: unknown) => PgPool;
}
const require = createRequire("/home/runner/workspace/lib/db/package.json");
const pg = require("pg") as PgModule;
import { makeAdapter } from "../services/exchanges/adapterFactory.js";
import type { BaseExchangeAdapter } from "../services/exchanges/BaseExchangeAdapter.js";

const USER = "user_3EE6nUFLlXYSfvjf46CdFFRRG4A"; // teedelgado
const APPLY = process.env.APPLY === "1";
const PROD_URL = process.env.RENDER_PROD_DATABASE_URL;
const BACKFILL_TAG = "BACKFILL_REAL_FILL";
const UNRECOVERABLE_TAG = "PRICE_UNRECOVERABLE";
const BREAKEVEN_TOL = 1e-9; // |fill - entry| within this => genuine break-even

// Real Coinbase/broker order ids are UUIDs. Engine-synthetic close ids look like
// "close-u-<userprefix>-<ts>-<rand>" and are NOT queryable at the broker — those
// rows are price-unrecoverable per spec (no candle estimates).
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  entry_price: number;
  exit_price: number;
  quantity: number;
  size_usd: number;
  realized_pnl: number;
  realized_pnl_pct: number;
  exchange: string;
  exchange_close_order_id: string;
}

interface Corrected {
  id: string;
  symbol: string;
  side: string;
  entry: number;
  qty: number;
  size: number;
  oldExit: number;
  newExit: number;
  oldPnl: number;
  newPnl: number;
  newPct: number;
}

async function main() {
  if (!PROD_URL) throw new Error("RENDER_PROD_DATABASE_URL not set");
  if (!process.env.VAULT_MASTER_KEY) throw new Error("VAULT_MASTER_KEY not set");

  const pool = new pg.Pool({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false } });

  // ── Build one adapter per connected exchange (user's own keys) ──────────────
  const conns = (
    await pool.query<{ exchange: string; encrypted_blob: string; demo_mode: boolean }>(
      `SELECT exchange, encrypted_blob, demo_mode
         FROM user_exchange_connections WHERE user_id = $1`,
      [USER],
    )
  ).rows;

  const adapters = new Map<string, BaseExchangeAdapter>();
  for (const c of conns) {
    const creds = vault.decryptBlob(USER, c.encrypted_blob);
    if (!creds) {
      console.error(`[conn] decrypt FAILED for ${c.exchange} — skipping (key mismatch?)`);
      continue;
    }
    try {
      adapters.set(c.exchange, makeAdapter(c.exchange, creds, { testnet: false, demoMode: c.demo_mode }));
      console.error(`[conn] adapter ready: ${c.exchange} (demoMode=${c.demo_mode})`);
    } catch (e) {
      console.error(`[conn] makeAdapter FAILED for ${c.exchange}: ${(e as Error).message}`);
    }
  }

  // ── Candidate set: live, real broker close id, not reconciled, zeroed PnL ───
  const rows = (
    await pool.query<Row>(
      `SELECT id, symbol, side, entry_price, exit_price, quantity, size_usd,
              realized_pnl, realized_pnl_pct, exchange, exchange_close_order_id
         FROM sim_trades
        WHERE user_id = $1
          AND realized_pnl = 0
          AND exchange IS NOT NULL
          AND exchange_close_order_id IS NOT NULL
          AND reconciliation_tag IS NULL
          AND (close_reason IS NULL OR close_reason NOT LIKE 'RECONCIL%')
        ORDER BY exit_time`,
      [USER],
    )
  ).rows;

  console.error(`[scan] ${rows.length} candidate rows\n`);

  const corrected: Corrected[] = [];
  const breakeven: { id: string; symbol: string; fill: number }[] = [];
  const unrecoverable: { id: string; symbol: string; exchange: string; reason: string }[] = [];

  for (const r of rows) {
    if (!UUID_RE.test(r.exchange_close_order_id)) {
      // Engine-synthetic close id (close-u-…) — no real broker order to query.
      unrecoverable.push({ id: r.id, symbol: r.symbol, exchange: r.exchange, reason: "synthetic_close_id" });
      continue;
    }
    const adapter = adapters.get(r.exchange);
    if (!adapter) {
      unrecoverable.push({ id: r.id, symbol: r.symbol, exchange: r.exchange, reason: "no_connection" });
      continue;
    }
    let order;
    try {
      order = await adapter.getOrder(r.exchange_close_order_id, r.symbol);
    } catch (e) {
      unrecoverable.push({ id: r.id, symbol: r.symbol, exchange: r.exchange, reason: `getOrder_error:${(e as Error).message}` });
      await sleep(300);
      continue;
    }
    await sleep(300);

    if (!order) {
      unrecoverable.push({ id: r.id, symbol: r.symbol, exchange: r.exchange, reason: "not_found" });
      continue;
    }
    const fill = Number(order.avgFillPrice);
    if (!Number.isFinite(fill) || fill <= 0) {
      unrecoverable.push({ id: r.id, symbol: r.symbol, exchange: r.exchange, reason: "no_fill_price" });
      continue;
    }
    const entry = Number(r.entry_price);
    const qty = Number(r.quantity);
    const size = Number(r.size_usd);
    if (Math.abs(fill - entry) <= BREAKEVEN_TOL) {
      breakeven.push({ id: r.id, symbol: r.symbol, fill });
      continue;
    }
    const pnl = r.side === "BUY" ? (fill - entry) * qty : (entry - fill) * qty;
    const pct = size > 0 ? (pnl / size) * 100 : 0;
    corrected.push({
      id: r.id,
      symbol: r.symbol,
      side: r.side,
      entry,
      qty,
      size,
      oldExit: Number(r.exit_price),
      newExit: fill,
      oldPnl: Number(r.realized_pnl),
      newPnl: parseFloat(pnl.toFixed(2)),
      newPct: parseFloat(pct.toFixed(3)),
    });
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log("\n========== BACKFILL DRY-RUN REPORT ==========");
  console.log(`candidate rows      : ${rows.length}`);
  console.log(`-> corrected        : ${corrected.length}`);
  console.log(`-> genuine breakeven: ${breakeven.length}`);
  console.log(`-> unrecoverable    : ${unrecoverable.length}`);

  const recoveredPnL = corrected.reduce((s, c) => s + c.newPnl, 0);
  console.log(`\nrecovered P&L (sum of new realized): ${recoveredPnL.toFixed(2)}`);

  if (corrected.length) {
    console.log("\n--- corrections (old -> new) ---");
    for (const c of corrected) {
      console.log(
        `${c.id}  ${c.side} ${c.symbol}  entry=${c.entry}  exit ${c.oldExit} -> ${c.newExit}  pnl ${c.oldPnl} -> ${c.newPnl} (${c.newPct}%)`,
      );
    }
  }
  if (breakeven.length) {
    console.log("\n--- genuine break-even (fill == entry, left as-is) ---");
    for (const b of breakeven) console.log(`${b.id}  ${b.symbol}  fill=${b.fill}`);
  }
  if (unrecoverable.length) {
    console.log("\n--- unrecoverable (will be tagged price-unrecoverable) ---");
    const byReason = new Map<string, number>();
    for (const u of unrecoverable) {
      console.log(`${u.id}  ${u.exchange} ${u.symbol}  reason=${u.reason}`);
      const key = u.reason.split(":")[0];
      byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }
    console.log("\nunrecoverable by reason:");
    for (const [k, v] of byReason) console.log(`  ${k}: ${v}`);
  }

  // ── Apply ─────────────────────────────────────────────────────────────────--
  if (!APPLY) {
    console.log("\n[dry-run] no writes performed. Re-run with APPLY=1 to commit.\n");
    await pool.end();
    return;
  }

  console.log("\n[APPLY] committing corrections in a single transaction...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const c of corrected) {
      await client.query(
        `UPDATE sim_trades
            SET exit_price = $2, realized_pnl = $3, realized_pnl_pct = $4,
                reconciliation_tag = $5
          WHERE id = $1 AND user_id = $6`,
        [c.id, c.newExit, c.newPnl, c.newPct, BACKFILL_TAG, USER],
      );
    }
    for (const u of unrecoverable) {
      await client.query(
        `UPDATE sim_trades
            SET reconciliation_tag = $2
          WHERE id = $1 AND user_id = $3`,
        [u.id, UNRECOVERABLE_TAG, USER],
      );
    }
    // Reconcile the account realized ledger by the exact net delta so the
    // per-trade truth and the stored total stay consistent. Old realized was 0
    // for every corrected row, so delta == sum(newPnl). Idempotent on re-run:
    // already-corrected rows carry BACKFILL_REAL_FILL and drop out of the
    // candidate query, so a second run selects nothing and adds 0.
    const ledgerDelta = parseFloat(corrected.reduce((s, c) => s + (c.newPnl - c.oldPnl), 0).toFixed(2));
    const acctRes = await client.query<{ total_realized: number }>(
      `UPDATE sim_accounts
          SET total_realized = total_realized + $2, updated_at = now()
        WHERE user_id = $1
      RETURNING total_realized`,
      [USER, ledgerDelta],
    );
    if (acctRes.rowCount !== 1) {
      throw new Error(
        `ledger reconcile expected exactly 1 sim_accounts row for ${USER}, updated ${acctRes.rowCount} — rolling back`,
      );
    }
    await client.query("COMMIT");
    console.log(`[APPLY] committed: ${corrected.length} corrected, ${unrecoverable.length} tagged unrecoverable.`);
    console.log(`[APPLY] sim_accounts.total_realized reconciled by ${ledgerDelta >= 0 ? "+" : ""}${ledgerDelta} -> new total_realized = ${acctRes.rows[0]?.total_realized}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[APPLY] ROLLED BACK:", (e as Error).message);
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
