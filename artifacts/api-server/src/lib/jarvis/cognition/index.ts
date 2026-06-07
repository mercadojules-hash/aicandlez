import { db } from "@workspace/db";
import { jarvisCognitionRunsTable } from "@workspace/db";
import { agentBus } from "../agentBus.js";
import { callModel } from "./provider.js";
import { retrieve } from "./retrieval.js";
import { assemblePrompt } from "./promptAssembly.js";
import { computeGroundingScore, validateCitations } from "./grounding.js";
import { checkCognitionBudget, consumeCognitionBudget } from "./budget.js";
import type {
  CognitionProposal,
  CognitionProposalSection,
  CognitionResult,
  CognitionStatus,
  GraphNodeType,
  RetrievedRef,
  ThinkInput,
} from "./types.js";

/**
 * Cognition entrypoint — `think()`. Orchestrates budget → retrieve → assemble →
 * call → parse → ground → record. ADVISORY-ONLY: it returns a proposal and an
 * immutable audit run; it NEVER mutates a domain table or performs an action.
 * Every failure path is FAIL-SAFE — it records a run and returns a non-"ok"
 * status so the caller leaves the existing surface unchanged.
 */

export * from "./types.js";
export { retrieve, tokenize } from "./retrieval.js";
export { computeGroundingScore, validateCitations } from "./grounding.js";
export {
  checkCognitionBudget,
  consumeCognitionBudget,
  type CognitionBudgetState,
} from "./budget.js";
export { callModel, estimateCostMicros, COGNITION_MODEL } from "./provider.js";
export {
  embed,
  embedOne,
  estimateEmbeddingCostMicros,
  recordEmbeddingRun,
  EMBEDDING_MODEL,
  EMBEDDING_DIMS,
  EMBEDDING_MAX_BATCH,
  type EmbeddingResult,
} from "./embeddings.js";
export {
  runIndexerPass,
  getSemanticStatus,
  getSemanticRetrievalEnabled,
  setSemanticRetrievalEnabled,
  getIndexerTickEnabled,
  setIndexerTickEnabled,
  INDEXED_SUBJECT_TYPES,
  SETTING_SEMANTIC_ENABLED,
  SETTING_INDEXER_TICK_ENABLED,
  type IndexerPassResult,
  type SemanticStatus,
} from "./indexer.js";

const VALID_TYPES: ReadonlySet<string> = new Set([
  "memory", "asset", "category", "decision", "task",
]);

interface RecordRunArgs {
  input: ThinkInput;
  status: CognitionStatus;
  model: string | null;
  promptHash: string | null;
  retrievedRefs: RetrievedRef[];
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  latencyMs: number | null;
  groundingScore: number | null;
  rawOutput: string | null;
  parsedProposal: CognitionProposal | null;
  error: string | null;
}

async function recordRun(args: RecordRunArgs): Promise<string | null> {
  try {
    const [row] = await db
      .insert(jarvisCognitionRunsTable)
      .values({
        kind: args.input.kind,
        agentId: args.input.agentId ?? null,
        agentType: args.input.agentType ?? null,
        model: args.model,
        params: {
          query: args.input.query,
          period: args.input.period ?? null,
          audience: args.input.audience ?? null,
          businessId: args.input.businessId ?? null,
          executiveUserId: args.input.executiveUserId ?? null,
        },
        promptHash: args.promptHash,
        retrievedRefs: args.retrievedRefs,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        costMicros: args.costMicros,
        latencyMs: args.latencyMs,
        status: args.status,
        groundingScore: args.groundingScore,
        rawOutput: args.rawOutput,
        parsedProposal: args.parsedProposal
          ? (args.parsedProposal as unknown as Record<string, unknown>)
          : null,
        error: args.error,
        createdBy: args.input.createdBy ?? null,
      })
      .returning({ id: jarvisCognitionRunsTable.id });
    return row?.id ?? null;
  } catch {
    // Audit insert must never break the advisory flow.
    return null;
  }
}

/** Strip code fences and isolate the outermost JSON object. */
function extractJson(text: string): string | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return stripped.slice(start, end + 1);
}

function normalizeRefs(raw: unknown): RetrievedRef[] {
  if (!Array.isArray(raw)) return [];
  const out: RetrievedRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = (item as Record<string, unknown>).type;
    const id = (item as Record<string, unknown>).id;
    if (typeof type === "string" && typeof id === "string" && VALID_TYPES.has(type)) {
      out.push({ type: type as GraphNodeType, id });
    }
  }
  return out;
}

/**
 * Parse the model's JSON into a normalized proposal. Citations are validated
 * against the retrieval set so a hallucinated ref cannot inflate grounding.
 * Returns null on any structural failure (→ degraded).
 */
function parseProposal(
  text: string,
  retrievedRefs: RetrievedRef[],
): CognitionProposal | null {
  const json = extractJson(text);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];

  const sections: CognitionProposalSection[] = [];
  for (const s of rawSections) {
    if (!s || typeof s !== "object") continue;
    const so = s as Record<string, unknown>;
    const heading = typeof so.heading === "string" ? so.heading.trim() : "";
    const body = typeof so.body === "string" ? so.body.trim() : "";
    if (!heading && !body) continue;
    sections.push({
      heading: heading || "Section",
      body,
      citations: validateCitations(normalizeRefs(so.citations), retrievedRefs),
    });
  }

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (!title && sections.length === 0) return null;

  const citations = validateCitations(
    sections.flatMap((s) => s.citations),
    retrievedRefs,
  );
  const content = sections
    .map((s) => `## ${s.heading}\n\n${s.body}`)
    .join("\n\n");

  return {
    title: title || "Executive Briefing",
    summary,
    content,
    sections,
    citations,
  };
}

function emptyResult(
  status: CognitionStatus,
  degradedReason: string,
): CognitionResult {
  return {
    runId: null,
    status,
    proposal: null,
    groundingScore: null,
    citations: [],
    retrievedRefs: [],
    model: null,
    promptHash: null,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    latencyMs: null,
    error: null,
    degradedReason,
  };
}

export async function think(input: ThinkInput): Promise<CognitionResult> {
  // 1. Budget gate — refuse BEFORE any spend if the cognition budget is spent.
  const budget = await checkCognitionBudget();
  if (budget?.exceeded) {
    const reason = `cognition budget "${budget.name}" exhausted (${budget.consumedMicros}/${budget.limitMicros} micros)`;
    const runId = await recordRun({
      input,
      status: "budget_exceeded",
      model: null,
      promptHash: null,
      retrievedRefs: [],
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
      latencyMs: null,
      groundingScore: null,
      rawOutput: null,
      parsedProposal: null,
      error: reason,
    });
    agentBus.emitEvent({
      type: "cognition_degraded",
      severity: "warn",
      agentType: input.agentType ?? "cognition",
      runId,
      message: reason,
      details: { kind: input.kind, status: "budget_exceeded" },
    });
    return { ...emptyResult("budget_exceeded", reason), runId };
  }

  // 2. Retrieve grounding context (lexical + one-hop graph).
  const retrieval = await retrieve(input);
  const { system, user, promptHash } = assemblePrompt(input, retrieval.docs);

  agentBus.emitEvent({
    type: "cognition_started",
    severity: "info",
    agentType: input.agentType ?? "cognition",
    message: `cognition started: ${input.kind} "${input.query}"`,
    details: {
      kind: input.kind,
      retrievedDocs: retrieval.docs.length,
      promptHash,
    },
  });

  // 3. Provider call (fail-safe — never throws).
  const call = await callModel({ system, user });
  if (!call.ok || !call.text) {
    const reason = call.error ?? "provider returned no content";
    const runId = await recordRun({
      input,
      status: "error",
      model: call.model,
      promptHash,
      retrievedRefs: retrieval.refs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costMicros: call.costMicros,
      latencyMs: call.latencyMs,
      groundingScore: null,
      rawOutput: call.text,
      parsedProposal: null,
      error: reason,
    });
    agentBus.emitEvent({
      type: "cognition_degraded",
      severity: "error",
      agentType: input.agentType ?? "cognition",
      runId,
      message: `cognition degraded: ${reason}`,
      details: { kind: input.kind, status: "error" },
    });
    return {
      ...emptyResult("degraded", reason),
      runId,
      model: call.model,
      promptHash,
      retrievedRefs: retrieval.refs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costMicros: call.costMicros,
      latencyMs: call.latencyMs,
      error: reason,
    };
  }

  // 4. Parse + ground.
  const proposal = parseProposal(call.text, retrieval.refs);
  if (!proposal) {
    const reason = "model output could not be parsed into a proposal";
    const runId = await recordRun({
      input,
      status: "degraded",
      model: call.model,
      promptHash,
      retrievedRefs: retrieval.refs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costMicros: call.costMicros,
      latencyMs: call.latencyMs,
      groundingScore: null,
      rawOutput: call.text,
      parsedProposal: null,
      error: reason,
    });
    agentBus.emitEvent({
      type: "cognition_degraded",
      severity: "warn",
      agentType: input.agentType ?? "cognition",
      runId,
      message: `cognition degraded: ${reason}`,
      details: { kind: input.kind, status: "degraded" },
    });
    return {
      ...emptyResult("degraded", reason),
      runId,
      model: call.model,
      promptHash,
      retrievedRefs: retrieval.refs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costMicros: call.costMicros,
      latencyMs: call.latencyMs,
      error: reason,
    };
  }

  const groundingScore = computeGroundingScore(
    proposal.citations,
    retrieval.refs,
  );

  // 5. Record immutable run, then meter the budget.
  const runId = await recordRun({
    input,
    status: "ok",
    model: call.model,
    promptHash,
    retrievedRefs: retrieval.refs,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costMicros: call.costMicros,
    latencyMs: call.latencyMs,
    groundingScore,
    rawOutput: call.text,
    parsedProposal: proposal,
    error: null,
  });
  await consumeCognitionBudget(call.costMicros);

  agentBus.emitEvent({
    type: "cognition_finished",
    severity: "success",
    agentType: input.agentType ?? "cognition",
    runId,
    message: `cognition finished: ${input.kind} (grounding ${groundingScore})`,
    details: {
      kind: input.kind,
      groundingScore,
      costMicros: call.costMicros,
      citations: proposal.citations.length,
    },
  });
  agentBus.emitEvent({
    type: "cognition_proposal",
    severity: "info",
    agentType: input.agentType ?? "cognition",
    runId,
    message: `proposal ready: ${proposal.title}`,
    details: { kind: input.kind, groundingScore },
  });

  return {
    runId,
    status: "ok",
    proposal,
    groundingScore,
    citations: proposal.citations,
    retrievedRefs: retrieval.refs,
    model: call.model,
    promptHash,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costMicros: call.costMicros,
    latencyMs: call.latencyMs,
    error: null,
    degradedReason: null,
  };
}
