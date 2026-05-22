// ── backfillScheduler ────────────────────────────────────────────────────
//
// Runs the broker order-ID back-fill scripts (`backfill-close-order-ids`
// and `backfill-open-order-ids`) on a nightly schedule so historical
// `sim_trades` rows stay in sync with broker history without an operator
// having to remember to invoke them manually.
//
// New gap rows can appear any time a live trade hits a partial failure
// path (e.g. open-side fill, close-side submit error). Letting those sit
// indefinitely makes trade-history reconciliation noisier than it needs
// to be, so we sweep them once a day.
//
// Behaviour:
//   - First run fires ~5 min after boot so a freshly-restarted server
//     immediately closes any gap accumulated while it was down.
//   - Subsequent runs fire every 24h at the configured hour (UTC).
//   - Runs are serialised — if a run is still in flight when the timer
//     fires, the next run is skipped (logged at warn).
//   - Each run's structured summary is captured in memory (last 10) and
//     exposed via `GET /api/admin/backfill-status` for the operator
//     telemetry surfaces. Failures log at ERROR so they surface in the
//     same channels as other operator-visible incidents.

import { logger } from "./logger.js";
import {
  runCloseOrderIdBackfill,
  type BackfillSummary as CloseSummary,
} from "@workspace/scripts/backfill-close-order-ids";
import {
  runOpenOrderIdBackfill,
  type BackfillSummary as OpenSummary,
} from "@workspace/scripts/backfill-open-order-ids";

// ── Tunables ─────────────────────────────────────────────────────────────

const FIRST_RUN_DELAY_MS    = 5 * 60_000;        // 5 min after boot
const RUN_INTERVAL_MS       = 24 * 60 * 60_000;  // nightly
const HISTORY_CAP           = 10;                // remember last 10 runs

// ── Public types ─────────────────────────────────────────────────────────

export interface BackfillRunRecord {
  startedAt:   number;
  finishedAt:  number;
  durationMs:  number;
  ok:          boolean;
  closeSide:   CloseSummary | null;
  openSide:    OpenSummary  | null;
  error:       string | null;
}

// ── State ────────────────────────────────────────────────────────────────

const history: BackfillRunRecord[] = [];
let lastRun:     BackfillRunRecord | null = null;
let nextRunAt:   number | null            = null;
let inFlight                              = false;
let timer:       NodeJS.Timeout | null    = null;
let started                               = false;

// ── Public API ───────────────────────────────────────────────────────────

export function getBackfillSchedulerStatus(): {
  enabled:    boolean;
  inFlight:   boolean;
  nextRunAt:  number | null;
  lastRun:    BackfillRunRecord | null;
  history:    BackfillRunRecord[];
} {
  return {
    enabled:   started,
    inFlight,
    nextRunAt,
    lastRun,
    history:   [...history],
  };
}

/** Run both back-fills now. Used by the timer and by the manual admin trigger. */
export async function runBackfillsNow(trigger: "scheduled" | "manual" = "manual"): Promise<BackfillRunRecord> {
  if (inFlight) {
    logger.warn({ trigger }, "[backfill-scheduler] run requested while one is already in flight — skipping");
    // Return the last known run so callers always get something.
    if (lastRun) return lastRun;
    return {
      startedAt: Date.now(), finishedAt: Date.now(), durationMs: 0,
      ok: false, closeSide: null, openSide: null,
      error: "another run is already in flight",
    };
  }

  inFlight = true;
  const startedAt = Date.now();
  let closeSide: CloseSummary | null = null;
  let openSide:  OpenSummary  | null = null;
  let error:     string | null       = null;

  try {
    logger.info({ trigger }, "[backfill-scheduler] starting nightly broker order-id back-fill");
    // Run both back-fills sequentially. They both connect to the same DB
    // pool and hit broker APIs — serialising keeps memory + rate-limit
    // pressure predictable and makes log output easier to read.
    closeSide = await runCloseOrderIdBackfill();
    openSide  = await runOpenOrderIdBackfill();
    logger.info(
      {
        trigger,
        close: {
          totalCandidates: closeSide.totalCandidates,
          matched:         closeSide.matched,
          unmatched:       closeSide.unmatched,
          ambiguous:       closeSide.ambiguous,
          errored:         closeSide.errored,
        },
        open: {
          totalCandidates: openSide.totalCandidates,
          matched:         openSide.matched,
          unmatched:       openSide.unmatched,
          ambiguous:       openSide.ambiguous,
          errored:         openSide.errored,
        },
      },
      "[backfill-scheduler] back-fill run complete",
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    // Log at error so the failure surfaces in the same place all other
    // operator-visible incidents do, rather than being silently lost.
    logger.error({ err, trigger }, "[backfill-scheduler] back-fill run FAILED");
  } finally {
    inFlight = false;
  }

  const finishedAt = Date.now();
  const record: BackfillRunRecord = {
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    ok:         error === null,
    closeSide,
    openSide,
    error,
  };
  lastRun = record;
  history.unshift(record);
  if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
  return record;
}

/**
 * Start the nightly scheduler. Idempotent — safe to call from server
 * boot. Set `BACKFILL_SCHEDULER_DISABLED=true` to opt out (useful for
 * read-only / preview environments).
 */
export function startBackfillScheduler(): void {
  if (started) return;
  if (process.env["BACKFILL_SCHEDULER_DISABLED"] === "true") {
    logger.info("[backfill-scheduler] disabled via BACKFILL_SCHEDULER_DISABLED=true");
    return;
  }
  // Skip on non-default node test runners — the runs hit broker APIs +
  // the live DB pool, which is the wrong default for unit-test boots.
  if (process.env["NODE_ENV"] === "test") {
    logger.info("[backfill-scheduler] disabled in NODE_ENV=test");
    return;
  }
  started = true;

  const scheduleNext = (delayMs: number): void => {
    if (timer) clearTimeout(timer);
    nextRunAt = Date.now() + delayMs;
    timer = setTimeout(() => {
      void runBackfillsNow("scheduled").finally(() => {
        scheduleNext(RUN_INTERVAL_MS);
      });
    }, delayMs);
    // Don't keep the event loop alive solely for this timer — process
    // should still exit cleanly on shutdown signals.
    if (timer.unref) timer.unref();
  };

  logger.info(
    { firstRunInMs: FIRST_RUN_DELAY_MS, intervalMs: RUN_INTERVAL_MS },
    "[backfill-scheduler] enabled — first run scheduled",
  );
  scheduleNext(FIRST_RUN_DELAY_MS);
}

export function stopBackfillScheduler(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  nextRunAt = null;
  started   = false;
}
