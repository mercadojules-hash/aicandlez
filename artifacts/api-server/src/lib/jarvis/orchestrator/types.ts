import type { JarvisAgent } from "@workspace/db";
import type { AgentRunResult, AgentTrigger, OrchestrationExtra } from "../types.js";

/**
 * Jarvis Orchestration Layer (Sprint 6) — shared types.
 *
 * The orchestrator turns the Sprint 5 independent ticking agents into a
 * coordinated layer (routing → delegation → workflow execution → escalation
 * chains → executive commands). It is pumped from the SAME single runtime tick
 * (one loop, off by default, admin-gated), is fully deterministic (stable
 * ordering on every side-effect read) and advisory-safe (no deletes, no external
 * LLM, `jarvis_*` surface only). Spec: `.local/docs/jarvis-orchestration-spec.md`.
 */

/**
 * A runner the orchestrator uses to execute an agent handler. The runtime passes
 * its own bound `runAgent` in via `orchestrator.pump(deps)` so the orchestrator
 * module never imports the runtime (avoids an import cycle). Structurally matches
 * `RunOutcome` from `runtime.ts`.
 */
export type OrchestrationRunner = (
  agent: JarvisAgent,
  trigger: AgentTrigger,
  extra?: OrchestrationExtra,
) => Promise<{
  ok: boolean;
  runId: string | null;
  summary?: string;
  error?: string;
  result?: AgentRunResult;
}>;

export interface PumpDeps {
  runAgent: OrchestrationRunner;
}
