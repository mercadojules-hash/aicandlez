import { EventEmitter } from "node:events";
import { logger } from "../../lib/logger.js";

// ── ExecutionQueue ────────────────────────────────────────────────────────────
//
// Priority queue for trade execution requests.
//
// Why a queue?
//   - Prevents concurrent execution of multiple orders for the same user
//   - Provides backpressure when exchange rate limits are hit
//   - Enables ordered, auditable execution history
//   - Decouples signal generation from order placement (important at scale)
//   - In Phase 2: backed by BullMQ + Redis for distributed worker execution
//
// Current implementation: in-process priority queue with concurrency control.
// Safe for single-node deployment (prototype / MVP).
//
// Priority levels:
//   CRITICAL (0) — kill switch, emergency exit
//   HIGH     (1) — stop-loss triggers, take-profit orders
//   NORMAL   (2) — standard auto-trade signals
//   LOW      (3) — background jobs (balance sync, journal update)

export type QueuePriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
export type JobStatus     = "queued" | "processing" | "completed" | "failed" | "cancelled";

const PRIORITY_VALUE: Record<QueuePriority, number> = {
  CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3,
};

export interface ExecutionJob<T = unknown> {
  id:           string;
  userId:       string;
  exchange:     string;
  type:         string;         // e.g. "PLACE_ORDER", "CANCEL_ORDER", "BALANCE_SYNC"
  priority:     QueuePriority;
  payload:      T;
  status:       JobStatus;
  attempts:     number;
  maxAttempts:  number;
  createdAt:    number;
  startedAt:    number | null;
  completedAt:  number | null;
  result?:      unknown;
  error?:       string;
}

export interface QueueStats {
  depth:        number;
  processing:   number;
  completed:    number;
  failed:       number;
  avgLatencyMs: number;
}

// ── Queue implementation ──────────────────────────────────────────────────────

class ExecutionQueue extends EventEmitter {
  private queue:       ExecutionJob[]  = [];
  private processing   = new Set<string>();
  private history:     ExecutionJob[]  = [];
  private concurrency: number;
  private handler: ((job: ExecutionJob) => Promise<unknown>) | null = null;
  private running      = false;

  constructor(concurrency = 3) {
    super();
    this.concurrency = concurrency;
  }

  // ── Register handler (called once at startup) ─────────────────────────────

  register(handler: (job: ExecutionJob) => Promise<unknown>): void {
    this.handler = handler;
    logger.info({ concurrency: this.concurrency }, "ExecutionQueue: handler registered");
  }

  // ── Start / stop ──────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
    logger.info({ concurrency: this.concurrency }, "ExecutionQueue: started");
  }

  stop(): void {
    this.running = false;
    logger.info("ExecutionQueue: stopped");
  }

  // ── Enqueue ───────────────────────────────────────────────────────────────

  enqueue<T>(
    userId:      string,
    exchange:    string,
    type:        string,
    payload:     T,
    priority:    QueuePriority = "NORMAL",
    maxAttempts  = 3,
  ): ExecutionJob<T> {
    const job: ExecutionJob<T> = {
      id:          `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      exchange,
      type,
      priority,
      payload,
      status:      "queued",
      attempts:    0,
      maxAttempts,
      createdAt:   Date.now(),
      startedAt:   null,
      completedAt: null,
    };

    // Insert sorted by priority then creation time
    const idx = this.queue.findIndex(q =>
      PRIORITY_VALUE[q.priority] > PRIORITY_VALUE[priority]
    );
    if (idx === -1) this.queue.push(job as unknown as ExecutionJob);
    else            this.queue.splice(idx, 0, job as unknown as ExecutionJob);

    this.emit("enqueued", job);
    logger.info({ jobId: job.id, userId, exchange, type, priority }, "ExecutionQueue: job enqueued");
    this.tick();

    return job;
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  cancel(jobId: string): boolean {
    const idx = this.queue.findIndex(j => j.id === jobId);
    if (idx === -1) return false;
    const [job] = this.queue.splice(idx, 1);
    if (job) {
      job!.status = "cancelled";
      this.archiveJob(job!);
    }
    return true;
  }

  // ── Cancel all queued jobs for a user (e.g. kill switch) ──────────────────

  cancelUser(userId: string): number {
    const toCancel = this.queue.filter(j => j.userId === userId);
    for (const job of toCancel) {
      job.status = "cancelled";
      this.archiveJob(job);
    }
    this.queue = this.queue.filter(j => j.userId !== userId);
    logger.warn({ userId, cancelled: toCancel.length }, "ExecutionQueue: all user jobs cancelled");
    return toCancel.length;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  stats(): QueueStats {
    const completed = this.history.filter(j => j.status === "completed");
    const failed    = this.history.filter(j => j.status === "failed");
    const latencies = completed
      .filter(j => j.startedAt && j.completedAt)
      .map(j => j.completedAt! - j.startedAt!);
    return {
      depth:        this.queue.length,
      processing:   this.processing.size,
      completed:    completed.length,
      failed:       failed.length,
      avgLatencyMs: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
    };
  }

  getJob(jobId: string): ExecutionJob | undefined {
    return this.queue.find(j => j.id === jobId)
        ?? this.history.find(j => j.id === jobId);
  }

  depth(): number { return this.queue.length; }

  // ── Internal tick ─────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (!this.running || !this.handler) return;
    while (this.processing.size < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      this.runJob(job);
    }
  }

  private async runJob(job: ExecutionJob): Promise<void> {
    if (!this.handler) return;
    this.processing.add(job.id);
    job.status    = "processing";
    job.startedAt = Date.now();
    job.attempts++;

    try {
      job.result      = await this.handler(job);
      job.status      = "completed";
      job.completedAt = Date.now();
      this.emit("completed", job);
      logger.info({ jobId: job.id, userId: job.userId, latencyMs: job.completedAt - job.startedAt! }, "ExecutionQueue: job completed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.error = msg;
      if (job.attempts < job.maxAttempts) {
        job.status = "queued";
        // Exponential backoff re-queue
        setTimeout(() => {
          this.queue.unshift(job);
          this.tick();
        }, 500 * 2 ** (job.attempts - 1));
        logger.warn({ jobId: job.id, attempt: job.attempts, error: msg }, "ExecutionQueue: job failed, retrying");
      } else {
        job.status      = "failed";
        job.completedAt = Date.now();
        this.emit("failed", job);
        logger.error({ jobId: job.id, attempts: job.attempts, error: msg }, "ExecutionQueue: job permanently failed");
      }
    } finally {
      this.processing.delete(job.id);
      if (job.status === "completed" || job.status === "failed") {
        this.archiveJob(job);
      }
      this.tick();
    }
  }

  private archiveJob(job: ExecutionJob): void {
    this.history.unshift(job);
    if (this.history.length > 1000) this.history.pop();
  }
}

// Singleton queue — Phase 2 will swap for BullMQ
export const executionQueue = new ExecutionQueue(3);
