import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("../../../lib/logger.js", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { ExecutionQueueCtor } = await (async () => {
  const mod = await import("../ExecutionQueue.js");
  const Singleton = mod.executionQueue as unknown as EventEmitter & { constructor: unknown };
  return { ExecutionQueueCtor: Singleton.constructor as new (concurrency?: number) => {
    register(h: (job: { id: string; payload: unknown }) => Promise<unknown>): void;
    start(): void;
    stop(): void;
    enqueue(userId: string, exchange: string, type: string, payload: unknown, priority?: "CRITICAL"|"HIGH"|"NORMAL"|"LOW", maxAttempts?: number): { id: string };
    stats(): { depth: number; processing: number; completed: number; failed: number; avgLatencyMs: number };
    cancel(id: string): boolean;
    on(ev: string, cb: (...args: unknown[]) => void): unknown;
  }};
})();

describe("ExecutionQueue — saturation diagnostic (no real orders)", () => {
  let q: InstanceType<typeof ExecutionQueueCtor>;

  beforeEach(() => {
    q = new ExecutionQueueCtor(3);
  });

  afterEach(() => {
    q.stop();
  });

  it("drains 35 stub jobs under concurrency=3 without stalling", async () => {
    const CONCURRENCY = 3;
    const TOTAL = 35;
    let observedMaxProcessing = 0;
    let observedMaxDepth = 0;
    let completedCount = 0;

    const probe = setInterval(() => {
      const s = q.stats();
      if (s.processing > observedMaxProcessing) observedMaxProcessing = s.processing;
      if (s.depth      > observedMaxDepth)      observedMaxDepth      = s.depth;
    }, 5);

    q.register(async () => {
      await new Promise<void>((r) => setTimeout(r, 5 + Math.floor(Math.random() * 15)));
      return { ok: true };
    });
    q.on("completed", () => { completedCount++; });

    q.start();
    for (let i = 0; i < TOTAL; i++) {
      q.enqueue(`u${i % 4}`, "Kraken", "STUB_BUY", { i, symbol: "BTCUSD", sizeUSD: 25 });
    }

    const deadline = Date.now() + 5_000;
    while (completedCount < TOTAL && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    clearInterval(probe);

    const final = q.stats();
    expect(completedCount).toBe(TOTAL);
    expect(final.depth).toBe(0);
    expect(final.processing).toBe(0);
    expect(final.completed).toBe(TOTAL);
    expect(final.failed).toBe(0);
    expect(observedMaxProcessing).toBeGreaterThan(0);
    expect(observedMaxProcessing).toBeLessThanOrEqual(CONCURRENCY);
    expect(observedMaxDepth).toBeGreaterThan(0);
  }, 10_000);

  it("recovers from handler failures (5/35 throw) without halting queue", async () => {
    const TOTAL = 35;
    const FAIL_EVERY = 7;
    let completedCount = 0;
    let failedCount = 0;

    q.register(async (job: { payload: unknown }) => {
      const p = job.payload as { i: number };
      await new Promise<void>((r) => setTimeout(r, 5));
      if (p.i % FAIL_EVERY === 0 && p.i > 0) throw new Error(`stub_failure_${p.i}`);
      return { ok: true };
    });
    q.on("completed", () => { completedCount++; });
    q.on("failed",    () => { failedCount++; });

    q.start();
    for (let i = 0; i < TOTAL; i++) {
      q.enqueue(`u${i % 4}`, "Kraken", "STUB_BUY", { i }, "NORMAL", 1);
    }

    const deadline = Date.now() + 5_000;
    while ((completedCount + failedCount) < TOTAL && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }

    const final = q.stats();
    // i=0 is excluded by the `> 0` guard in the handler, so expected fails
    // = floor((TOTAL-1) / FAIL_EVERY) (covers i=7,14,21,28 for TOTAL=35).
    const expectedFails = Math.floor((TOTAL - 1) / FAIL_EVERY);
    expect(failedCount).toBe(expectedFails);
    expect(completedCount).toBe(TOTAL - expectedFails);
    expect(final.depth).toBe(0);
    expect(final.processing).toBe(0);
  }, 10_000);

  it("honors priority ordering (CRITICAL ahead of NORMAL ahead of LOW)", async () => {
    const order: string[] = [];
    q.register(async (job: { payload: unknown }) => {
      const p = job.payload as { tag: string };
      await new Promise<void>((r) => setTimeout(r, 5));
      order.push(p.tag);
      return { ok: true };
    });

    // Enqueue BEFORE start so all queue up first, then drain in priority order.
    for (let i = 0; i < 6; i++) q.enqueue("u", "Kraken", "STUB", { tag: `LOW${i}` }, "LOW");
    for (let i = 0; i < 6; i++) q.enqueue("u", "Kraken", "STUB", { tag: `NORM${i}` }, "NORMAL");
    for (let i = 0; i < 3; i++) q.enqueue("u", "Kraken", "STUB", { tag: `CRIT${i}` }, "CRITICAL");

    q.start();
    const deadline = Date.now() + 5_000;
    while (order.length < 15 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(order.length).toBe(15);
    // First 3 finishing must be the CRITICAL batch (concurrency=3 picks them
    // off the head first). Allow any within-tier interleave due to parallel
    // handler resolution.
    const firstThree = order.slice(0, 3).sort();
    expect(firstThree).toEqual(["CRIT0", "CRIT1", "CRIT2"]);
    // Last six must be the LOW batch.
    const lastSix = order.slice(-6).sort();
    expect(lastSix).toEqual(["LOW0","LOW1","LOW2","LOW3","LOW4","LOW5"]);
  }, 10_000);
});
