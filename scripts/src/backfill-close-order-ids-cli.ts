// CLI entrypoint for the close-side broker order-ID back-fill.
// Kept separate from the importable module so importing the runner
// (e.g. from api-server's nightly scheduler) has no top-level side
// effects and cannot tear down the shared DB pool.

import { pool } from "@workspace/db";
import { runCloseOrderIdBackfill } from "./backfill-close-order-ids.js";

runCloseOrderIdBackfill()
  .then(async () => { await pool?.end(); })
  .catch(async err => {
    console.error("[backfill] fatal:", err);
    await pool?.end();
    process.exit(1);
  });
