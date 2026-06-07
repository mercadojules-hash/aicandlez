import { db } from "@workspace/db";
import { jarvisSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { agentBus } from "../agentBus.js";
import {
  evaluateGovernance,
  recordEvaluation,
  createGovernanceApproval,
  markSubjectGovernance,
  consumeBudget,
  recordGovernanceOutcome,
  type GovernanceDecision,
  type GovernanceResult,
  type GovernedSubject,
} from "../governance/index.js";

/**
 * The single pre-execution governance chokepoint shared by every orchestration
 * pass (command / workflow step / delegation / escalation). Before an action
 * runs the pass calls `gateSubject`, which:
 *
 *   - short-circuits to ALLOW when governance is disabled (off by default) or the
 *     subject was already approved by a human (re-entry after the resume pass),
 *   - otherwise evaluates policy + trust + budget → allow / deny / require_approval,
 *   - records the immutable evaluation, stamps the subject's governance columns,
 *     consumes budget on allow, and creates an auto-approval on require_approval.
 *
 * It NEVER widens authority: a disabled engine or an empty policy set means
 * "allow" (status quo), and any matching policy can only narrow the outcome.
 */

const GOVERNANCE_ENABLED_KEY = "governance.enabled";

export async function isGovernanceEnabled(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(jarvisSettingsTable)
    .where(eq(jarvisSettingsTable.key, GOVERNANCE_ENABLED_KEY))
    .limit(1);
  return row?.value === true;
}

export interface GateOutcome {
  proceed: boolean;
  decision: GovernanceDecision;
  result: GovernanceResult | null;
  approvalId: string | null;
}

const ALLOW_DISABLED: GateOutcome = {
  proceed: true,
  decision: "allow",
  result: null,
  approvalId: null,
};

/**
 * Gate a single subject. `currentState` is the subject's existing
 * `governanceState` so an already-approved subject (resumed by a human) proceeds
 * without being re-held.
 */
export async function gateSubject(
  subject: GovernedSubject,
  title: string,
  currentState: string | null | undefined,
): Promise<GateOutcome> {
  if (!(await isGovernanceEnabled())) return ALLOW_DISABLED;

  // Re-entry: a human already approved this subject in the resume pass.
  if (currentState === "approved") {
    await consumeBudget(subject);
    return { proceed: true, decision: "allow", result: null, approvalId: null };
  }

  const result = await evaluateGovernance(subject);

  if (result.decision === "allow") {
    await consumeBudget(subject);
    const evalId = await recordEvaluation(subject, result);
    await markSubjectGovernance(subject.subjectType, subject.subjectId, {
      governanceState: "allowed",
      policyEvaluationId: evalId,
    });
    agentBus.emitEvent({
      type: "governance_allowed",
      severity: "info",
      agentType: subject.agentType ?? null,
      message: `Governance allowed ${subject.subjectType}: ${result.reason}`,
      details: { subjectId: subject.subjectId, policyId: result.policyId },
    });
    return { proceed: true, decision: "allow", result, approvalId: null };
  }

  if (result.decision === "deny") {
    const evalId = await recordEvaluation(subject, result);
    await markSubjectGovernance(subject.subjectType, subject.subjectId, {
      governanceState: "denied",
      policyEvaluationId: evalId,
    });
    await recordGovernanceOutcome({
      agentId: subject.agentId ?? null,
      agentType: subject.agentType ?? null,
      denied: true,
    });
    agentBus.emitEvent({
      type: "governance_denied",
      severity: "warn",
      agentType: subject.agentType ?? null,
      message: `Governance denied ${subject.subjectType}: ${result.reason}`,
      details: { subjectId: subject.subjectId, policyId: result.policyId },
    });
    return { proceed: false, decision: "deny", result, approvalId: null };
  }

  // require_approval — create the auto-approval that pauses the subject.
  const approvalId = await createGovernanceApproval(subject, result, title);
  const evalId = await recordEvaluation(subject, result, approvalId);
  await markSubjectGovernance(subject.subjectType, subject.subjectId, {
    governanceState: "pending_approval",
    policyEvaluationId: evalId,
    approvalId,
  });
  agentBus.emitEvent({
    type: "governance_held",
    severity: "warn",
    agentType: subject.agentType ?? null,
    message: `Governance held ${subject.subjectType} for approval: ${result.reason}`,
    details: { subjectId: subject.subjectId, approvalId, policyId: result.policyId },
  });
  return { proceed: false, decision: "require_approval", result, approvalId };
}
