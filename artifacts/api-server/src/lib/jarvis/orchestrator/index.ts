import { logger } from "../../logger.js";
import { agentBus } from "../agentBus.js";
import { runGovernanceMaintain } from "../governance/index.js";
import { pumpWorkflowRuns } from "./engine.js";
import { pumpDelegations } from "./delegation.js";
import { pumpEscalations } from "./escalation.js";
import { pumpCommands } from "./commands.js";
import { pumpGovernanceResume } from "./governanceResume.js";
import type { PumpDeps } from "./types.js";

/**
 * Jarvis Orchestrator — the coordination brain pumped from the SAME single
 * runtime tick (one loop, off by default, admin-gated). Each pump runs the
 * orchestration passes in a fixed order:
 *
 *   governance-resume → command → workflow → delegation → escalation →
 *   governance-maintain
 *
 * The Sprint 7 governance passes bookend the Sprint 6 coordination passes: the
 * FRONT resume pass releases/blocks subjects whose auto-approval a human has
 * resolved (before any pass re-evaluates them); each coordination pass gates its
 * action through the governance chokepoint pre-execution; the TAIL maintain pass
 * recomputes trust + resets expired budget windows. Every pass is bounded per
 * tick and deterministic. All passes are advisory-safe (no deletes, no external
 * calls, `jarvis_*` surface only) and fail soft so one failing pass never wedges
 * the loop.
 */
class Orchestrator {
  async pump(deps: PumpDeps): Promise<void> {
    // ── Governance resume pass (S7) — FRONT: release/block subjects whose
    //    auto-approval a human has resolved, before any pass re-evaluates them ──
    try {
      await pumpGovernanceResume();
    } catch (err) {
      logger.warn({ err }, "jarvis orchestrator: governance resume pass failed");
    }

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

    // ── Governance maintain pass (S7) — TAIL: recompute trust + reset expired
    //    budget windows. Deterministic, bounded, advisory-safe ─────────────────
    try {
      const { trustRows, budgetsReset } = await runGovernanceMaintain();
      if (trustRows > 0) {
        agentBus.emitEvent({
          type: "trust_recomputed",
          severity: "info",
          message: `Trust recomputed for ${trustRows} agent${trustRows === 1 ? "" : "s"}`,
          details: { trustRows },
        });
      }
      if (budgetsReset > 0) {
        agentBus.emitEvent({
          type: "budget_reset",
          severity: "info",
          message: `${budgetsReset} budget window${budgetsReset === 1 ? "" : "s"} reset`,
          details: { budgetsReset },
        });
      }
    } catch (err) {
      logger.warn({ err }, "jarvis orchestrator: governance maintain pass failed");
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
export { gateSubject, isGovernanceEnabled } from "./governanceGate.js";
export { pumpGovernanceResume } from "./governanceResume.js";
export {
  processCommand,
  pumpCommands,
  findVerb,
  VERB_REGISTRY,
} from "./commands.js";
export type { VerbSpec, CommandKind } from "./commands.js";
export type { RouteInput, RouteResult } from "./router.js";
export type { OrchestrationRunner, PumpDeps } from "./types.js";
