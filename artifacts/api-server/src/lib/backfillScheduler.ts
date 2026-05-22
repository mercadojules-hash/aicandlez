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
import { sendOperatorAlert } from "./notifications.js";
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

// Operator-alert throttle. Strategy: "alert once until healthy, with
// a long escalation re-page". Once we've notified for a given failure
// signature (e.g. "error:Kraken API 500" or "errored:close=3,open=0"),
// suppress repeats of the same signature until either (a) a healthy
// run lands and clears the throttle, or (b) the escalation interval
// elapses so the failure can't be silently lost forever. A *different*
// failure signature pages immediately even mid-window so operators
// still see new problems.
//
// Re-page interval is intentionally well above the 24h run cadence so
// a persistently failing nightly run does not spam every night.
const ALERT_REPAGE_MS       = 7 * 24 * 60 * 60_000;  // 7 days

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

// Throttle state for operator failure alerts.
let lastAlertSignature: string | null = null;
let lastAlertAt:        number        = 0;

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

  // Operator alert on failure. We page when the run threw OR when any
  // per-side rollup reports `errored > 0`, since both shapes leave gap
  // rows behind that need a human to look. Successful runs clear the
  // throttle so a fresh failure pages on the next nightly cycle.
  try {
    await maybeAlertOperators(record, trigger);
  } catch (err) {
    logger.warn({ err }, "[backfill-scheduler] operator-alert dispatch failed");
  }

  return record;
}

function failureSignature(rec: BackfillRunRecord): string | null {
  if (!rec.ok && rec.error) return `error:${rec.error}`;
  const closeErr = rec.closeSide?.errored ?? 0;
  const openErr  = rec.openSide?.errored  ?? 0;
  if (closeErr > 0 || openErr > 0) return `errored:close=${closeErr},open=${openErr}`;
  return null;
}

async function maybeAlertOperators(
  rec:     BackfillRunRecord,
  trigger: "scheduled" | "manual",
): Promise<void> {
  const signature = failureSignature(rec);
  if (!signature) {
    // Healthy run — reset throttle so the next failure fires immediately.
    lastAlertSignature = null;
    lastAlertAt        = 0;
    return;
  }

  const now            = Date.now();
  const sameAsLast     = signature === lastAlertSignature;
  const withinRepageWindow = now - lastAlertAt < ALERT_REPAGE_MS;
  // Persistent same-signature failure: stay quiet until either a
  // healthy run clears the throttle or the escalation window elapses.
  // This is what stops the nightly scheduler from paging every 24h
  // when the same failure mode persists.
  if (sameAsLast && withinRepageWindow) {
    logger.debug(
      { signature, lastAlertAt, trigger },
      "[backfill-scheduler] operator alert suppressed (same failure signature, still within re-page window)",
    );
    return;
  }

  const closeErr = rec.closeSide?.errored ?? 0;
  const openErr  = rec.openSide?.errored  ?? 0;
  const subject  = rec.error
    ? "Nightly broker order-id back-fill FAILED"
    : `Nightly broker order-id back-fill completed with errors (close=${closeErr}, open=${openErr})`;
  const lines: string[] = [
    `Trigger:  ${trigger}`,
    `Started:  ${new Date(rec.startedAt).toISOString()}`,
    `Finished: ${new Date(rec.finishedAt).toISOString()}`,
    `Duration: ${rec.durationMs}ms`,
  ];
  if (rec.error) lines.push(`Error:    ${rec.error}`);
  if (rec.closeSide) {
    lines.push(
      `Close side: matched=${rec.closeSide.matched} unmatched=${rec.closeSide.unmatched} ` +
      `ambiguous=${rec.closeSide.ambiguous} errored=${rec.closeSide.errored}`,
    );
  }
  if (rec.openSide) {
    lines.push(
      `Open side:  matched=${rec.openSide.matched} unmatched=${rec.openSide.unmatched} ` +
      `ambiguous=${rec.openSide.ambiguous} errored=${rec.openSide.errored}`,
    );
  }

  await sendOperatorAlert({
    subject,
    body:      lines.join("\n"),
    dedupeKey: `backfill-scheduler:${signature}`,
    context:   {
      source:    "backfill-scheduler",
      trigger,
      ok:        rec.ok,
      error:     rec.error,
      closeSide: rec.closeSide,
      openSide:  rec.openSide,
    },
  });

  lastAlertSignature = signature;
  lastAlertAt        = now;
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
