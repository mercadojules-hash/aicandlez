import { db } from "@workspace/db";
import {
  jarvisAgentsTable,
  jarvisAgentRunsTable,
  type JarvisAgent,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { agentBus } from "./agentBus.js";
import { buildContext } from "./context.js";
import { getHandler } from "./registry.js";
import { orchestrator } from "./orchestrator/index.js";
import { recordRunOutcome } from "./governance/index.js";
import { getIndexerTickEnabled, runIndexerPass } from "./cognition/index.js";
import type { AgentRunResult, AgentTrigger, OrchestrationExtra } from "./types.js";

/**
 * Jarvis Agent Runtime — a SEPARATE periodic loop from the AICandlez trading
 * engine. OFF by default; started/stopped via `/api/jarvis/runtime/*`. Each
 * tick selects enabled, due agents (by `scheduleSeconds` since `lastRunAt`),
 * runs them in `priority` order, and guards against overlap with a per-agent
 * in-flight lock. Every execution is recorded in `jarvis_agent_runs`.
 */

const DEFAULT_TICK_MS = 30_000;
const MIN_TICK_MS = 5_000;

export interface RuntimeStatus {
  running: boolean;
  startedAt: number | null;
  tickIntervalMs: number;
  lastTickAt: number | null;
  tickCount: number;
  inFlight: string[];
}

export interface RunOutcome {
  ok: boolean;
  runId: string | null;
  summary?: string;
  error?: string;
  /** Full handler result (orchestration reads `output` for workflow steps). */
  result?: AgentRunResult;
}

class AgentRuntime {
  private handle: NodeJS.Timeout | null = null;
  private startedAt: number | null = null;
  private lastTickAt: number | null = null;
  private tickCount = 0;
  private tickIntervalMs = DEFAULT_TICK_MS;
  private readonly inFlight = new Set<string>();

  isRunning(): boolean {
    return this.handle !== null;
  }

  status(): RuntimeStatus {
    return {
      running: this.isRunning(),
      startedAt: this.startedAt,
      tickIntervalMs: this.tickIntervalMs,
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
      inFlight: [...this.inFlight],
    };
  }

  start(opts?: { tickIntervalMs?: number }): RuntimeStatus {
    if (this.handle) return this.status();
    const requested = opts?.tickIntervalMs ?? DEFAULT_TICK_MS;
    this.tickIntervalMs = Math.max(MIN_TICK_MS, requested);
    this.startedAt = Date.now();
    this.handle = setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);
    agentBus.emitEvent({
      type: "runtime_started",
      severity: "success",
      message: `Jarvis agent runtime started (tick ${Math.round(this.tickIntervalMs / 1000)}s)`,
    });
    void this.tick();
    return this.status();
  }

  stop(): RuntimeStatus {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
    this.startedAt = null;
    agentBus.emitEvent({
      type: "runtime_stopped",
      severity: "info",
      message: "Jarvis agent runtime stopped",
    });
    return this.status();
  }

  private async tick(): Promise<void> {
    this.lastTickAt = Date.now();
    this.tickCount += 1;
    try {
      const agents = await db
        .select()
        .from(jarvisAgentsTable)
        .where(eq(jarvisAgentsTable.enabled, true));
      const due = agents
        .filter((a) => getHandler(a.agentType))
        .filter((a) => this.isDue(a))
        // Deterministic order: priority asc, then stable tie-breakers
        // (createdAt, then id) so equal-priority agents always run in the same
        // order across ticks and process restarts.
        .sort(
          (x, y) =>
            x.priority - y.priority ||
            new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime() ||
            x.id.localeCompare(y.id),
        );
      agentBus.emitEvent({
        type: "tick",
        severity: "info",
        message: `Tick #${this.tickCount}: ${due.length} agent(s) due`,
        details: { due: due.length, enabled: agents.length },
      });
      for (const agent of due) {
        await this.runAgent(agent, "scheduled");
      }
      // Orchestration pump — runs AFTER the scheduled-agent pass on the SAME
      // single loop (no second timer). Bounded + deterministic; advisory-safe.
      await orchestrator.pump({
        runAgent: (agent, trigger, extra) => this.runAgent(agent, trigger, extra),
      });
      // Sprint 9: OPTIONAL semantic indexer pass — OFF by default, admin-gated
      // via the `cognition.semanticIndexer.tickEnabled` setting. Runs on the SAME
      // single loop (no second timer), bounded + budgeted, fail-safe (never
      // throws). Keeps `jarvis_embeddings` (a derived read index) fresh without a
      // separate scheduler; a disabled flag = a single cheap settings read.
      await this.maybeIndexerPass();
    } catch (err) {
      logger.error({ err }, "jarvis runtime tick failed");
      agentBus.emitEvent({
        type: "agent_error",
        severity: "error",
        message: `Runtime tick error: ${(err as Error).message}`,
      });
    }
  }

  /**
   * OFF-by-default semantic indexer pass. Reads one settings flag; when disabled
   * (the default) it returns immediately. Bounded + budgeted inside
   * `runIndexerPass`, which never throws — but we still wrap it so a settings-read
   * failure can never break the agent tick.
   */
  private async maybeIndexerPass(): Promise<void> {
    try {
      if (!(await getIndexerTickEnabled())) return;
      const result = await runIndexerPass({ limit: 16 });
      if (result.upserted > 0 || result.budgetExceeded || result.errored) {
        agentBus.emitEvent({
          type: "tick",
          severity: result.errored ? "error" : "info",
          message: `Semantic indexer: ${result.upserted} embedded, ${result.skipped} unchanged`,
          details: {
            upserted: result.upserted,
            skipped: result.skipped,
            budgetExceeded: result.budgetExceeded,
            error: result.error,
          },
        });
      }
    } catch (err) {
      logger.error({ err }, "jarvis semantic indexer pass failed");
    }
  }

  private isDue(a: JarvisAgent): boolean {
    if (a.scheduleSeconds == null) return false; // manual-only
    if (!a.lastRunAt) return true;
    const elapsed = Date.now() - new Date(a.lastRunAt).getTime();
    return elapsed >= a.scheduleSeconds * 1000;
  }

  async runAgent(
    agent: JarvisAgent,
    trigger: AgentTrigger,
    extra?: OrchestrationExtra,
  ): Promise<RunOutcome> {
    const handler = getHandler(agent.agentType);
    if (!handler) {
      return {
        ok: false,
        runId: null,
        error: `No runtime handler for agent type "${agent.agentType}"`,
      };
    }
    if (this.inFlight.has(agent.id)) {
      return { ok: false, runId: null, error: "Agent is already running" };
    }
    this.inFlight.add(agent.id);
    const startedAt = new Date();

    let runId: string | null = null;
    try {
      const [run] = await db
        .insert(jarvisAgentRunsTable)
        .values({
          agentId: agent.id,
          agentName: agent.name,
          agentType: agent.agentType,
          trigger,
          status: "running",
          startedAt,
        })
        .returning();
      runId = run?.id ?? null;
    } catch (err) {
      this.inFlight.delete(agent.id);
      logger.error({ err }, "jarvis runtime: failed to create run row");
      return { ok: false, runId: null, error: (err as Error).message };
    }

    if (!runId) {
      this.inFlight.delete(agent.id);
      return { ok: false, runId: null, error: "Failed to create run record" };
    }

    // Everything from here on is inside a single try/finally so the in-flight
    // lock is ALWAYS released — even if the "running" status write or the
    // handler throws. Otherwise a throw here would strand the agent in-flight
    // (unrunnable until process restart).
    const ctx = buildContext({
      agent,
      runId,
      trigger,
      startedAt,
      action: extra?.action ?? null,
      input: extra?.input ?? null,
      delegation: extra?.delegation ?? null,
      workflowStep: extra?.workflowStep ?? null,
    });
    try {
      await db
        .update(jarvisAgentsTable)
        .set({ runtimeStatus: "running", updatedAt: new Date() })
        .where(eq(jarvisAgentsTable.id, agent.id));
      agentBus.emitEvent({
        type: "agent_started",
        severity: "info",
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.agentType,
        runId,
        message: `${agent.name} started (${trigger})`,
      });

      const result = await handler.run(ctx);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      await db
        .update(jarvisAgentRunsTable)
        .set({
          status: "succeeded",
          summary: result.summary,
          output: result.output ?? null,
          itemsProcessed: result.itemsProcessed,
          finishedAt,
          durationMs,
        })
        .where(eq(jarvisAgentRunsTable.id, runId));
      await db
        .update(jarvisAgentsTable)
        .set({
          runtimeStatus: "idle",
          lastRunAt: finishedAt,
          lastRunStatus: "succeeded",
          lastError: null,
          updatedAt: finishedAt,
        })
        .where(eq(jarvisAgentsTable.id, agent.id));
      agentBus.emitEvent({
        type: "agent_finished",
        severity: "success",
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.agentType,
        runId,
        message: `${agent.name}: ${result.summary}`,
        details: { itemsProcessed: result.itemsProcessed, durationMs },
      });
      // Governance trust signal (additive, fail-soft — never breaks the run).
      try {
        await recordRunOutcome({
          agentId: agent.id,
          agentName: agent.name,
          agentType: agent.agentType,
          ok: true,
        });
      } catch (trustErr) {
        logger.warn({ trustErr, agent: agent.id }, "jarvis trust record (ok) failed");
      }
      return { ok: true, runId, summary: result.summary, result };
    } catch (err) {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const msg = (err as Error).message;
      await db
        .update(jarvisAgentRunsTable)
        .set({ status: "failed", error: msg, finishedAt, durationMs })
        .where(eq(jarvisAgentRunsTable.id, runId));
      await db
        .update(jarvisAgentsTable)
        .set({
          runtimeStatus: "error",
          lastRunAt: finishedAt,
          lastRunStatus: "failed",
          lastError: msg,
          updatedAt: finishedAt,
        })
        .where(eq(jarvisAgentsTable.id, agent.id));
      agentBus.emitEvent({
        type: "agent_error",
        severity: "error",
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.agentType,
        runId,
        message: `${agent.name} failed: ${msg}`,
      });
      logger.error({ err, agent: agent.id }, "jarvis agent run failed");
      // Governance trust signal (additive, fail-soft — never breaks the run).
      try {
        await recordRunOutcome({
          agentId: agent.id,
          agentName: agent.name,
          agentType: agent.agentType,
          ok: false,
        });
      } catch (trustErr) {
        logger.warn({ trustErr, agent: agent.id }, "jarvis trust record (fail) failed");
      }
      return { ok: false, runId, error: msg };
    } finally {
      this.inFlight.delete(agent.id);
    }
  }

  async runAgentById(agentId: string, trigger: AgentTrigger): Promise<RunOutcome> {
    const [agent] = await db
      .select()
      .from(jarvisAgentsTable)
      .where(eq(jarvisAgentsTable.id, agentId));
    if (!agent) return { ok: false, runId: null, error: "Agent not found" };
    return this.runAgent(agent, trigger);
  }
}

export const agentRuntime = new AgentRuntime();
