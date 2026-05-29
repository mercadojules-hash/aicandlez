#!/usr/bin/env node
/*
 * EXIT_ENGINE_V2 backlog reconciliation (operator-approved, controlled run).
 *
 * Policy (locked, see .local/docs/exit-engine-v2-reconciliation-FINAL-dryrun.md):
 *   1. Valid paper backlog (trades, price>0 AND amount>0, exchange IS NULL):
 *      close via lifecycle -> status='closed', exit/pnl set, reason='RECONCILED_BACKLOG'.
 *   2. sim_positions (exchange IS NULL): finalizeClose semantics — per-position tx:
 *      DELETE-returning idempotency gate -> INSERT sim_trades -> atomic
 *      sim_accounts increment (cash += sizeUSD+realizedPnL, realized += realizedPnL,
 *      total_trades += 1). close_reason='RECONCILED_BACKLOG'.
 *   3. Malformed (price<=0 OR amount<=0): LEFT UNTOUCHED. No P&L, no close, no write.
 *      Reported for manual review (tag MALFORMED_LEGACY_ROW applied later by operator).
 *
 * Faithfulness: replicates closeUserPosition/finalizeClose SQL effects for PAPER
 * (exchange IS NULL) positions — computeFillFee returns null for paper (netFees=0),
 * and platform performance fees are intentionally NOT assessed on a backlog
 * reconciliation pass (documented policy deviation). No app modules are imported,
 * so the global trading loop and ALL broker code paths are guaranteed never to run.
 *
 * Safety: never sends to any broker. Re-asserts 0 exchange rows before writing.
 * Idempotent + resumable (close predicate pinned to status='open'; position
 * migration gated by DELETE ... RETURNING). Batched. READ-ONLY unless --execute.
 *
 * Usage:
 *   node scripts/reconcile-exit-engine-v2-backlog.cjs            # dry run (no writes)
 *   node scripts/reconcile-exit-engine-v2-backlog.cjs --execute  # live run
 *
 * DB target: RENDER_PROD_DATABASE_URL.
 */
const { Client } = require("pg");
const crypto = require("crypto");

const EXECUTE = process.argv.includes("--execute");
const RECON_TAG = "RECONCILED_BACKLOG";
const TRADE_BATCH = 25;

const BASE_MAP = { BTC: "XBT", DOGE: "XDG" };
const baseOf = (s) => { const b = s.replace(/USD$/, ""); return BASE_MAP[b] || b; };
async function fetchMarks(symbols) {
  const marks = {};
  const missed = [];
  if (symbols.length === 0) return { marks, missed };
  const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=" + symbols.map((s) => baseOf(s) + "USD").join(","));
  const res = (await r.json()).result || {};
  for (const sym of symbols) {
    const base = baseOf(sym);
    const key = Object.keys(res).find((k) => k.includes(base) && k.endsWith("USD"));
    const last = key ? parseFloat(res[key].c[0]) : NaN;
    if (key && last > 0) marks[sym] = last; else missed.push(sym);
  }
  return { marks, missed };
}
const r2 = (n) => parseFloat(n.toFixed(2));
const r3 = (n) => parseFloat(n.toFixed(3));

(async () => {
  const c = new Client({ connectionString: process.env.RENDER_PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const L = console.log;

  L("=================================================================");
  L(`EXIT_ENGINE_V2 BACKLOG RECONCILIATION — ${EXECUTE ? "LIVE EXECUTE" : "DRY RUN (no writes)"}`);
  L(`server: ${(await q("show server_version"))[0].server_version}`);
  L("=================================================================");

  // ── Gate: re-assert 0 exchange (never live / never broker) ──────────────────
  const liveT = Number((await q("select count(*) n from trades where status='open' and exchange is not null"))[0].n);
  const liveP = Number((await q("select count(*) n from sim_positions where exchange is not null"))[0].n);
  L(`SAFETY ASSERT — open trades w/ exchange: ${liveT} | sim_positions w/ exchange: ${liveP}`);
  if (liveT !== 0 || liveP !== 0) {
    L("ABORT: exchange-tagged rows present. Refusing to proceed (broker-safety invariant).");
    await c.end();
    process.exit(2);
  }
  L("OK — all paper. No broker order will be submitted by this script (no broker code is imported).");

  const trades = await q("select id,symbol,side,price,amount,mode from trades where status='open'");
  const valid = trades.filter((t) => Number(t.price) > 0 && Number(t.amount) > 0);
  const malformed = trades.filter((t) => !(Number(t.price) > 0) || !(Number(t.amount) > 0));
  const pos = await q("select id,user_id,symbol,side,quantity,entry_price,entry_time,size_usd,sandbox from sim_positions where exchange is null");

  const syms = [...new Set([...valid.map((t) => t.symbol), ...pos.map((p) => p.symbol)])];
  const { marks, missed } = await fetchMarks(syms);
  L(`marks: ${syms.length - missed.length}/${syms.length}${missed.length ? " (UNPRICED, will be deferred: " + missed.join(",") + ")" : ""}`);

  // ── [1] Valid paper trades -> close (batched, idempotent) ───────────────────
  let closed = 0, closedPnl = 0, deferredT = [];
  L(`\n[1] VALID TRADES TO CLOSE: ${valid.length}`);
  for (let i = 0; i < valid.length; i += TRADE_BATCH) {
    const batch = valid.slice(i, i + TRADE_BATCH);
    if (EXECUTE) await c.query("BEGIN");
    try {
      for (const t of batch) {
        const mark = marks[t.symbol];
        if (mark === undefined) { deferredT.push(t.id); continue; }
        const price = Number(t.price), amount = Number(t.amount);
        const qty = amount / price;
        const pnl = t.side === "BUY" ? (mark - price) * qty : (price - mark) * qty;
        const pnlPct = (pnl / amount) * 100;
        if (EXECUTE) {
          const upd = await q(
            "update trades set status='closed', exit_price=$2, pnl=$3, pnl_percent=$4, closed_at=now(), reason=$5 where id=$1 and status='open' and exchange is null and price>0 and amount>0 returning id",
            [t.id, r2(mark), r2(pnl), r2(pnlPct), RECON_TAG],
          );
          if (upd.length === 1) { closed++; closedPnl += pnl; }
        } else { closed++; closedPnl += pnl; }
      }
      if (EXECUTE) await c.query("COMMIT");
    } catch (e) { if (EXECUTE) await c.query("ROLLBACK"); throw e; }
    L(`   batch ${i / TRADE_BATCH + 1}: processed ${Math.min(i + TRADE_BATCH, valid.length)}/${valid.length}`);
  }
  L(`   -> trades closed (${RECON_TAG}): ${closed} | projected realized P&L: ${closedPnl >= 0 ? "+" : ""}${closedPnl.toFixed(2)}${deferredT.length ? " | DEFERRED(unpriced): " + deferredT.length : ""}`);

  // ── [2] sim_positions -> finalizeClose (per-position tx) ─────────────────────
  let migrated = 0, simPnl = 0, deferredP = [], acctErr = [];
  L(`\n[2] SIM_POSITIONS TO MIGRATE: ${pos.length}`);
  for (const p of pos) {
    const mark = marks[p.symbol];
    if (mark === undefined) { deferredP.push(p.id); continue; }
    const entry = Number(p.entry_price), qty = Number(p.quantity), sizeUSD = Number(p.size_usd);
    const realizedPnL = p.side === "BUY" ? (mark - entry) * qty : (entry - mark) * qty;
    const realizedPnLPct = sizeUSD > 0 ? (realizedPnL / sizeUSD) * 100 : 0;
    const exitTime = Date.now();
    const entryTime = Number(p.entry_time);
    const cashDelta = sizeUSD + realizedPnL; // paper: netFees=0, platformFee=0 (policy)
    const realizedDelta = realizedPnL;
    if (EXECUTE) {
      await c.query("BEGIN");
      try {
        const del = await q("delete from sim_positions where id=$1 returning id", [p.id]);
        if (del.length === 0) { await c.query("ROLLBACK"); continue; } // already migrated (idempotent)
        await c.query(
          `insert into sim_trades
             (id,user_id,symbol,side,quantity,entry_price,exit_price,entry_time,exit_time,size_usd,realized_pnl,realized_pnl_pct,duration_ms,close_reason,exchange,sandbox,created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,null,$15,now())`,
          [crypto.randomUUID(), p.user_id, p.symbol, p.side, parseFloat(qty.toFixed(8)), entry, r2(mark),
           entryTime, exitTime, sizeUSD, r2(realizedPnL), r3(realizedPnLPct), exitTime - entryTime, RECON_TAG, p.sandbox === true],
        );
        const acct = await q(
          "update sim_accounts set cash_balance = cash_balance + $2, total_realized = total_realized + $3, total_trades = total_trades + 1, updated_at=now() where user_id=$1 returning user_id",
          [p.user_id, cashDelta, realizedDelta],
        );
        if (acct.length === 0) { await c.query("ROLLBACK"); acctErr.push(p.id); continue; } // no account -> no orphan
        await c.query("COMMIT");
        migrated++; simPnl += realizedPnL;
      } catch (e) { await c.query("ROLLBACK"); throw e; }
    } else { migrated++; simPnl += realizedPnL; }
  }
  L(`   -> positions migrated to sim_trades: ${migrated} | projected realized P&L: ${simPnl >= 0 ? "+" : ""}${simPnl.toFixed(2)}${deferredP.length ? " | DEFERRED(unpriced): " + deferredP.length : ""}${acctErr.length ? " | ACCOUNT-MISSING(skipped): " + acctErr.length : ""}`);

  // ── [3] Malformed -> held aside (manual review) ─────────────────────────────
  L(`\n[3] MALFORMED — HELD ASIDE (untouched, no P&L, no close): ${malformed.length}`);
  for (const m of malformed) {
    const reasons = [];
    if (!(Number(m.price) > 0)) reasons.push(`price<=0 (${m.price})`);
    if (!(Number(m.amount) > 0)) reasons.push(`amount<=0 (${m.amount})`);
    L(`   id=${m.id} ${m.symbol} ${m.side} mode=${m.mode} REASON: ${reasons.join(" & ")}`);
  }

  await c.end();
  L(`\n${EXECUTE ? "LIVE RUN COMPLETE." : "DRY RUN COMPLETE (no writes performed)."}`);
})().catch((e) => { console.error("ERR", e.stack || e.message); process.exit(1); });
