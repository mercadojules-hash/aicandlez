/**
 * executionTelemetry — Phase 4 (Task #209) canonical structured-log chain
 * for every CUSTOMER trade lifecycle event.
 *
 * One row per state transition, every row stamped with the same
 * `correlationId` so on-call can grep one id and see the complete funnel:
 *
 *   [MANUAL_TRADE_REQUEST]|[AI_TRADE_REQUEST]
 *     → [MANUAL_TRADE_NORMALIZED]
 *       → [EXECUTION_GATEWAY_ACCEPTED]
 *         → [POSITION_PERSISTED]
 *           → [LIVE_TRADES_HYDRATED]
 *             → [POSITION_CLOSED] | [EXECUTION_REJECTED]
 *
 * Required schema (every row):
 *   correlationId, userId, symbol, normalizedSymbol, exchange,
 *   runtimeMode, persistenceResult, positionId?, latencyMs,
 *   rejectionReason?, trigger
 *
 * Verbose flag:
 *   EXECUTION_TELEMETRY_VERBOSE (default true). When false, only the
 *   audit-grade tags (EXECUTION_GATEWAY_ACCEPTED, EXECUTION_REJECTED,
 *   POSITION_CLOSED) emit — the diagnostic mids (REQUEST/NORMALIZED/
 *   PERSISTED/HYDRATED) collapse into no-ops so production logs stay
 *   compact when triage isn't active.
 *
 * Rate-limiting:
 *   POSITION_PERSISTED + LIVE_TRADES_HYDRATED are bursty (paper-trade
 *   fan-out can fire 10/s per user). Capped to 1 row per (userId, tag,
 *   second) so logs don't drown out the lifecycle signal. Other tags
 *   are one-shot per correlationId by construction and not rate-limited.
 *
 * Operator path is OUT OF SCOPE (Task #209 spec). Regression tests
 * land in Phase 5.
 */

import crypto from "crypto";
import { logger } from "./logger.js";

export type ExecutionTag =
  | "MANUAL_TRADE_REQUEST"
  | "AI_TRADE_REQUEST"
  | "MANUAL_TRADE_NORMALIZED"
  | "AI_TRADE_NORMALIZED"
  | "EXECUTION_GATEWAY_ACCEPTED"
  | "POSITION_PERSISTED"
  | "LIVE_TRADES_HYDRATED"
  | "POSITION_CLOSED"
  | "EXECUTION_REJECTED";

/** Canonical trigger contract. Phase 4 spec restricts `trigger` to the
 *  two customer-funnel sources; the close path recalls the original
 *  opening trigger via `resolveTrigger(positionId)`. */
export type ExecutionTrigger = "manual" | "ai";

export type RuntimeMode = "paper" | "live" | "sandbox";

export type PersistenceResult = "persisted" | "failed" | "skipped" | "pending";

/** Canonical row shape. Every emitted log carries these keys; extra
 *  keys are allowed (e.g. fillPrice on PERSISTED, durationMs on CLOSED)
 *  but the eight required fields are always present.
 *
 *  `positionId` is allowed-null because some lifecycle stages run before
 *  a position id exists (REQUEST/NORMALIZED/ACCEPTED). Once persisted it
 *  is the exchangeOrderId for live fills, the sim position id for paper. */
export interface ExecutionTelemetryRow {
  tag:               ExecutionTag;
  correlationId:     string;
  userId:            string;
  symbol:            string;
  normalizedSymbol:  string;
  exchange:          string | null;
  runtimeMode:       RuntimeMode;
  persistenceResult: PersistenceResult;
  positionId:        string | null;
  latencyMs:         number;
  rejectionReason?:  string;
  trigger:           ExecutionTrigger;
  [extra: string]:   unknown;
}

/** Tags that always emit, even when verbose=false. Phase 4 spec defines
 *  these as the only two audit-grade tags that survive the verbose
 *  collapse — everything else is diagnostic. POSITION_CLOSED is NOT
 *  audit per spec; downstream realized-PnL persistence is the SoT for
 *  that fact. */
const AUDIT_TAGS: ReadonlySet<ExecutionTag> = new Set<ExecutionTag>([
  "EXECUTION_GATEWAY_ACCEPTED",
  "EXECUTION_REJECTED",
]);

/** Tags subject to 1/sec/user rate-limit. */
const RATE_LIMITED_TAGS: ReadonlySet<ExecutionTag> = new Set<ExecutionTag>([
  "POSITION_PERSISTED",
  "LIVE_TRADES_HYDRATED",
]);

/** Default-true so triage is the default until ops dial it down. */
export function isExecutionTelemetryVerbose(): boolean {
  const raw = process.env["EXECUTION_TELEMETRY_VERBOSE"];
  if (raw == null || raw === "") return true;
  return raw !== "false" && raw !== "0";
}

/** UUID v4. Single helper so client + server share one id schema. */
export function genCorrelationId(): string {
  return crypto.randomUUID();
}

// ── positionId → correlationId memory (chain preservation) ──────────────
// Close is loop-driven (trailing stop / SL / TP / manual close) and has no
// upstream HTTP request to carry the original trade's correlationId in. To
// keep the lifecycle grep chain unbroken (REQUEST → ACCEPTED → PERSISTED →
// CLOSED with the SAME id), persistence sites call `rememberCorrelation`
// after registering the fill; `closePosition` calls `resolveCorrelation`
// at emit time.
//
// In-memory only — acceptable because the close happens within the same
// process/session as the open in 99%+ of cases (trading loop owns the
// close decision). Surviving a process restart is NOT a requirement for
// telemetry chain correlation. Bounded by `CORR_CAP`.
const CORR_CAP = 25_000;
interface PositionCorrelation {
  correlationId: string;
  trigger:       ExecutionTrigger;
}
const corrByPosition = new Map<string, PositionCorrelation>();

export function rememberCorrelation(
  positionId:    string | null | undefined,
  correlationId: string | null | undefined,
  trigger:       ExecutionTrigger,
): void {
  if (!positionId || !correlationId) return;
  corrByPosition.set(positionId, { correlationId, trigger });
  if (corrByPosition.size > CORR_CAP) {
    // Drop oldest half by recreating from recent slice.
    const recent = Array.from(corrByPosition.entries()).slice(-CORR_CAP / 2);
    corrByPosition.clear();
    for (const [k, v] of recent) corrByPosition.set(k, v);
  }
}

/** Return the trade's original correlationId for `positionId`, or `null`
 *  when unknown (process restarted, or close ran before persist remember).
 *  Callers fall back to `close-<positionId>` so the row still validates. */
export function resolveCorrelation(positionId: string | null | undefined): string | null {
  if (!positionId) return null;
  return corrByPosition.get(positionId)?.correlationId ?? null;
}

/** Return the trade's opening trigger ("manual"|"ai") for `positionId`,
 *  or `null` when unknown. Used by POSITION_CLOSED so the close row's
 *  `trigger` field reflects who opened the trade rather than the system
 *  loop that triggered the close. */
export function resolveTrigger(positionId: string | null | undefined): ExecutionTrigger | null {
  if (!positionId) return null;
  return corrByPosition.get(positionId)?.trigger ?? null;
}

/** Drop the mapping after close — bounds memory. */
export function forgetCorrelation(positionId: string | null | undefined): void {
  if (!positionId) return;
  corrByPosition.delete(positionId);
}

// ── Rate-limiter (in-memory, per-process) ───────────────────────────────
// Bounded by `LIMIT_CAP`: a `Map<string, number>` of bucket→count, pruned
// every minute. Sized for ≤10k active correlationIds × 2 rate-limited
// tags — well under 1MB resident.
const LIMIT_CAP = 50_000;
const limitBuckets = new Map<string, number>();
let _lastPrune = Date.now();

function rateLimited(tag: ExecutionTag, userId: string): boolean {
  if (!RATE_LIMITED_TAGS.has(tag)) return false;
  const now = Date.now();
  if (now - _lastPrune > 60_000) {
    // Cheap prune: drop everything older than the current second.
    limitBuckets.clear();
    _lastPrune = now;
  }
  const bucket = `${tag}::${userId}::${Math.floor(now / 1000)}`;
  const prior  = limitBuckets.get(bucket) ?? 0;
  if (prior >= 1) return true;
  limitBuckets.set(bucket, prior + 1);
  if (limitBuckets.size > LIMIT_CAP) {
    // Hard ceiling — drop oldest half by recreating from recent slice.
    const recent = Array.from(limitBuckets.entries()).slice(-LIMIT_CAP / 2);
    limitBuckets.clear();
    for (const [k, v] of recent) limitBuckets.set(k, v);
  }
  return false;
}

/** Validate the eight required fields. Returns null when valid, an
 *  error message when not. Exported so the unit test can assert the
 *  contract directly. */
export function validateRow(row: ExecutionTelemetryRow): string | null {
  if (!row.tag) return "missing tag";
  if (typeof row.correlationId !== "string" || row.correlationId.length < 8) {
    return "correlationId must be a non-empty string";
  }
  if (typeof row.userId !== "string") return "userId must be a string";
  if (typeof row.symbol !== "string") return "symbol must be a string";
  if (typeof row.normalizedSymbol !== "string") return "normalizedSymbol must be a string";
  if (row.exchange !== null && typeof row.exchange !== "string") return "exchange must be string|null";
  if (!["paper", "live", "sandbox"].includes(row.runtimeMode)) return "runtimeMode invalid";
  if (!["persisted", "failed", "skipped", "pending"].includes(row.persistenceResult)) {
    return "persistenceResult invalid";
  }
  if (row.positionId !== null && typeof row.positionId !== "string") {
    return "positionId must be string|null";
  }
  if (typeof row.latencyMs !== "number" || !Number.isFinite(row.latencyMs) || row.latencyMs < 0) {
    return "latencyMs must be a non-negative number";
  }
  if (!["manual", "ai"].includes(row.trigger)) return "trigger invalid";
  if (row.rejectionReason != null && typeof row.rejectionReason !== "string") {
    return "rejectionReason must be string when present";
  }
  return null;
}

/**
 * Emit a canonical telemetry row. Routes through the singleton pino
 * `logger` so output stays consistent with the rest of the api-server.
 *
 * - Validates the row schema in dev/test (throws on misuse so the
 *   contract surfaces at the failing call site, not in a downstream
 *   grep). In production, an invalid row is logged as a warn and the
 *   original tag is still emitted (telemetry must never break execution).
 * - Honors the verbose flag (collapses diagnostic mids to no-ops).
 * - Honors the 1/sec/user rate-limit for high-cardinality tags.
 */
export function emit(row: ExecutionTelemetryRow): void {
  const err = validateRow(row);
  if (err) {
    if (process.env["NODE_ENV"] === "test") {
      throw new Error(`[executionTelemetry] invalid row (${row.tag}): ${err}`);
    }
    logger.warn({ row, err }, "[executionTelemetry] invalid row — emitting anyway");
  }

  if (!AUDIT_TAGS.has(row.tag) && !isExecutionTelemetryVerbose()) return;
  if (rateLimited(row.tag, row.userId)) return;

  const isError =
    row.tag === "EXECUTION_REJECTED" ||
    row.persistenceResult === "failed";

  const fn = isError ? logger.warn.bind(logger) : logger.info.bind(logger);
  fn(row, `[${row.tag}] ${row.symbol} ${row.trigger}/${row.runtimeMode}`);
}
