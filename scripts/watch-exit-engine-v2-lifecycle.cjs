/**
 * EXIT_ENGINE_V2 — first complete trade-lifecycle watcher (READ-ONLY).
 *
 * Verifies, against the production DB, the full V2 lifecycle exactly as designed:
 *   1. Trade opens (status='open', mode in auto/live/test, price>0, amount>0)
 *   2. trade.id == sim_position.id (linkage integrity)
 *   3. Position is managed by EXIT_ENGINE_V2 (present in sim_positions)
 *   4. Trailing stop executes (engine trailingStopHits increments)
 *   5. Trade row persists as closed (status='closed', exit_price/pnl/pnl_percent set, reason)
 *   6. Slot released (cap-counted open decrements; a new open becomes possible)
 *
 * READ-ONLY: never writes to the DB or touches brokers. Safe to leave running.
 *
 * Usage:
 *   NODE_PATH=lib/db/node_modules node scripts/watch-exit-engine-v2-lifecycle.cjs [maxMinutes]
 *   (default maxMinutes = 720 = 12h; poll every 15s)
 *
 * Env: RENDER_PROD_DATABASE_URL
 * Output: appends a report to .local/docs/exit-engine-v2-lifecycle-report.md
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const STATUS_URL = "https://api.aicandlez.com/api/engine/status";
const POLL_MS = 15000;
const MAX_MIN = Number(process.argv[2] || 720);
const REPORT = path.join(__dirname, "..", ".local", "docs", "exit-engine-v2-lifecycle-report.md");

const V2_OPEN = `status='open' and mode in ('auto','live','test') and price>0 and amount>0`;

function ts() { return new Date().toISOString(); }
function log(...a) { console.log(ts(), ...a); }

async function engineStatus() {
  try {
    const r = await fetch(STATUS_URL, { signal: AbortSignal.timeout(10000) });
    return await r.json();
  } catch { return null; }
}

async function main() {
  const c = new Client({ connectionString: process.env.RENDER_PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const rows = async (s, p) => (await c.query(s, p)).rows;
  const one = async (s, p) => Number((await c.query(s, p)).rows[0].n);

  const startIso = ts();
  const deadline = Date.now() + MAX_MIN * 60000;
  log(`watcher started; window=${MAX_MIN}min; baseline cap-counted=${await one(`select count(*) n from trades where ${V2_OPEN}`)}`);

  // ── Phase 1: wait for first NEW V2 open ─────────────────────────────────────
  let open = null;
  while (Date.now() < deadline && !open) {
    const r = await rows(`select id,symbol,side,price,amount,mode,reason,signal_id,timestamp from trades where ${V2_OPEN} and timestamp > $1 order by timestamp asc limit 1`, [startIso]);
    if (r.length) { open = r[0]; break; }
    await new Promise(x => setTimeout(x, POLL_MS));
  }
  if (!open) { log("no qualifying V2 open within window; exiting (no false report written)"); await c.end(); return; }

  const st0 = await engineStatus();
  const linkAtOpen = await one(`select count(*) n from sim_positions where id=$1`, [open.id]);
  const capAtOpen = await one(`select count(*) n from trades where ${V2_OPEN}`);
  log(`OPEN ${open.symbol} ${open.side} id=${open.id} price=${open.price} amount=${open.amount} | linkage=${linkAtOpen} cap=${capAtOpen} execAtOpen=${st0 && st0.tradesExecuted}`);

  // ── Phase 2: wait for that row to persist as closed ─────────────────────────
  let closed = null;
  while (Date.now() < deadline && !closed) {
    const r = await rows(`select id,symbol,status,exit_price,pnl,pnl_percent,reason,closed_at,exchange,exchange_order_id from trades where id=$1`, [open.id]);
    if (r.length && r[0].status === "closed") { closed = r[0]; break; }
    await new Promise(x => setTimeout(x, POLL_MS));
  }
  if (!closed) { log("V2 open detected but did not close within window; partial capture only"); }

  const st1 = await engineStatus();
  const capAfter = closed ? await one(`select count(*) n from trades where ${V2_OPEN}`) : null;
  const linkAfter = closed ? await one(`select count(*) n from sim_positions where id=$1`, [open.id]) : null;

  // ── Report ──────────────────────────────────────────────────────────────────
  const lines = [];
  lines.push(`\n## V2 lifecycle capture — ${ts()}`);
  lines.push(`- **1. OPEN**: ${open.symbol} ${open.side} \`id=${open.id}\` price=${open.price} amount=${open.amount} mode=${open.mode} reason="${open.reason || ""}" at ${open.timestamp instanceof Date ? open.timestamp.toISOString() : open.timestamp}`);
  lines.push(`- **2. LINKAGE (trade.id == sim_position.id)**: sim_positions match at open = ${linkAtOpen} ${linkAtOpen === 1 ? "✓" : "✗"}`);
  lines.push(`- **3. MANAGED BY V2**: position present in sim_positions = ${linkAtOpen === 1 ? "yes ✓" : "NO ✗"}`);
  if (st0 && st1) lines.push(`- **4. TRAILING STOP**: trailingStopHits ${st0.trailingStopHits} → ${st1.trailingStopHits} ${st1.trailingStopHits > st0.trailingStopHits ? "(fired ✓)" : "(no increment)"}; tradesExecuted ${st0.tradesExecuted} → ${st1.tradesExecuted}`);
  if (closed) {
    lines.push(`- **5. CLOSED PERSISTED**: status=closed reason="${closed.reason}" exit_price=${closed.exit_price} pnl=${closed.pnl} pnl_percent=${closed.pnl_percent} closed_at=${closed.closed_at instanceof Date ? closed.closed_at.toISOString() : closed.closed_at}`);
    lines.push(`  - realized P&L persisted: ${closed.exit_price != null && closed.pnl != null && closed.pnl_percent != null ? "✓" : "✗"}`);
    lines.push(`  - broker safety: exchange=${closed.exchange || "null"} exchange_order_id=${closed.exchange_order_id || "null"} ${(!closed.exchange && !closed.exchange_order_id) ? "(paper/sim ✓)" : "(LIVE — review)"}`);
    lines.push(`- **6. SLOT RELEASE**: cap-counted ${capAtOpen} → ${capAfter} ${capAfter < capAtOpen ? "(released ✓)" : "(not released ✗)"}; row removed from open set = ${linkAfter === 0 ? "n/a (position closed)" : ""}`);
  } else {
    lines.push(`- **5/6.** open not yet closed within window — re-run watcher to capture close + slot release.`);
  }
  const out = lines.join("\n") + "\n";
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.appendFileSync(REPORT, out);
  log("report appended to", REPORT);
  console.log(out);
  await c.end();
}
main().catch(e => { console.error("ERR", e.message); process.exit(1); });
