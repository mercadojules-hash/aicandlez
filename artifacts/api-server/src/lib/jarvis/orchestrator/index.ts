import { logger } from "../../logger.js";
import { pumpWorkflowRuns } from "./engine.js";
import { pumpDelegations } from "./delegation.js";
import { pumpEscalations } from "./escalation.js";
import { pumpCommands } from "./commands.js";
import type { PumpDeps } from "./types.js";

/**
 * Jarvis Orchestrator — the coordination brain pumped from the SAME single
 * runtime tick (one loop, off by default, admin-gated). Each pump runs the
 * orchestration passes in a fixed order:
 *
 *   command → workflow → delegation → escalation
 *
 * Every pass is bounded per tick and deterministic. Passes are added across
 * Sprint 6 milestones; the workflow pass lands in M2, delegation + escalation in
 * M3, and the command pass in M4. All passes are advisory-safe (no deletes, no
 * external calls, `jarvis_*` surface only) and fail soft so one failing pass
 * never wedges the loop.
 */
class Orchestrator {
  async pump(deps: PumpDeps): Promise<void> {
    // ── Command pass (M4) — runs first so it can feed the passes below ────────
    try {
      await pumpCommands(deps.runAgent);
    } catch (err) {
      logger.warn({ err }, "jarvis orchestrator: command pass failed");
    }

    // ── Workflow pass (M2) ───────────────────────────────────────────────────
    try {
      await pumpWorkflowRuns(deps.runAgent);
    } catch (err) {
      logger.warn({ err }, "jarvis orchestrator: workflow pass failed");
    }

    // ── Delegation pass (M3) ─────────────────────────────────────────────────
    try {
      await pumpDelegations(deps.runAgent);
    } catch (err) {
      logger.warn({ err }, "jarvis orchestrator: delegation pass failed");
    }

    // ── Escalation pass (M3) ─────────────────────────────────────────────────
    try {
      await pumpEscalations();
    } catch (err) {
      logger.warn({ err }, "jarvis orchestrator: escalation pass failed");
    }
  }
}

export const orchestrator = new Orchestrator();

// Re-exports so routes + other callers have one import surface.
export {
  startWorkflowRun,
  advanceWorkflowRun,
  resolveAgentByType,
  pumpWorkflowRuns,
} from "./engine.js";
export { executeDelegation, pumpDelegations } from "./delegation.js";
export { advanceEscalation, pumpEscalations } from "./escalation.js";
export { routeCommand, matchRule, selectRule } from "./router.js";
export {
  processCommand,
  pumpCommands,
  findVerb,
  VERB_REGISTRY,
} from "./commands.js";
export type { VerbSpec, CommandKind } from "./commands.js";
export type { RouteInput, RouteResult } from "./router.js";
export type { OrchestrationRunner, PumpDeps } from "./types.js";
