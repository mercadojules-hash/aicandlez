import crypto from "crypto";
import { db } from "@workspace/db";
import {
  jarvisCognitionRunsTable,
  jarvisCreativeCampaignsTable,
  jarvisCreativeAssetsTable,
  type JarvisCreativeCampaign,
  type JarvisCreativeAsset,
} from "@workspace/db";
import { agentBus } from "../agentBus.js";
import {
  checkCognitionBudget,
  consumeCognitionBudget,
} from "../cognition/budget.js";
import { computeGroundingScore, validateCitations } from "../cognition/grounding.js";
import type { CitationNodeType, RetrievedDoc, RetrievedRef } from "../cognition/types.js";
import { callCreativeText } from "./provider.js";
import { loadBrandContext, buildBrandBlock, buildBusinessBlock } from "./brandContext.js";
import { recordCampaignMemory } from "./memoryWriteback.js";
import type {
  AdConcept,
  CampaignProposal,
  ContentCalendarEntry,
  CreativeAssetKind,
  CreativeBrief,
  CreativeStatus,
  FunnelStage,
  GenerateCampaignInput,
  LaunchPhase,
  SocialScheduleEntry,
} from "./types.js";

/**
 * Prometheus — the marketing-strategy creative agent (Phase 1). ADVISORY-ONLY:
 * it composes the cognition primitives (budget → retrieve → call → parse →
 * ground → record) the same way `think()` does, but with its own structured
 * campaign schema. It writes DRAFT campaigns + assets (never published, never
 * auto-posted) plus an immutable cognition run, and a working-memory breadcrumb.
 * Every non-"ok" outcome is FAIL-SAFE: a run is recorded and NO draft is written.
 */

const PROMETHEUS_AGENT = "prometheus";
const CREATIVE_RUN_KIND = "creative_campaign";
const VALID_REF_TYPES: ReadonlySet<string> = new Set([
  "memory",
  "asset",
  "category",
  "decision",
  "task",
  "code",
]);
const MAX_CONTEXT_CHARS = 9000;

export interface GenerateCampaignResult {
  ok: boolean;
  status: CreativeStatus;
  campaign: JarvisCreativeCampaign | null;
  assets: JarvisCreativeAsset[];
  runId: string | null;
  groundingScore: number | null;
  citations: RetrievedRef[];
  reason: string | null;
}

const SYSTEM_PROMPT = [
  "You are Prometheus, an ADVISORY marketing strategist inside an executive",
  "intelligence system. You PROPOSE marketing campaigns; you NEVER take actions,",
  "never publish, never post to any channel, and never instruct anyone to post.",
  "",
  "Rules:",
  "1. Honor the BRAND PROFILE and BUSINESS REGISTRY blocks verbatim — match the",
  "   voice, tone, positioning, and DO/DON'T guardrails. Never contradict them.",
  "2. Ground factual claims about the business in the CONTEXT refs. A ref looks",
  '   like {"type":"memory","id":"<uuid>"}. Only cite refs that appear in CONTEXT;',
  "   never fabricate a ref, a metric, or a result. Creative copy may be original,",
  "   but business facts must be grounded or omitted.",
  "3. Keep an institutional, premium tone. No arcade/gambling cues, no emojis.",
  "4. Output STRICT JSON only — no markdown fences, no commentary before/after.",
  "",
  "Output schema:",
  "{",
  '  "name": string, "objective": string, "audience": string,',
  '  "durationDays": number, "strategy": string (markdown narrative),',
  '  "contentCalendar": [ { "day": number, "channel": string, "theme": string,',
  '     "format": string, "copy": string, "cta": string } ],',
  '  "adConcepts": [ { "title": string, "channel": string, "angle": string,',
  '     "headline": string, "primaryText": string, "cta": string,',
  '     "visualDirection": string } ],',
  '  "creativeBriefs": [ { "title": string, "objective": string,',
  '     "deliverable": string, "audience": string, "keyMessage": string,',
  '     "toneNotes": string, "specs": string } ],',
  '  "socialSchedule": [ { "day": number, "platform": string, "time": string,',
  '     "postType": string, "caption": string, "hashtags": [string] } ],',
  '  "funnelPlan": [ { "stage": string, "goal": string, "tactic": string,',
  '     "metric": string } ],',
  '  "launchPlan": [ { "phase": string, "window": string, "actions": [string] } ],',
  '  "citations": [ { "type": string, "id": string } ]',
  "}",
].join("\n");

function contextBlock(docs: RetrievedDoc[]): string {
  if (docs.length === 0) {
    return "CONTEXT: (none — no grounding sources were retrieved)";
  }
  const lines: string[] = [];
  let used = 0;
  for (const d of docs) {
    const tag = d.hop === 1 ? " (related)" : "";
    const block = [`[${d.type}:${d.id}]${tag} ${d.title}`, d.text || "(no body)"].join(
      "\n",
    );
    if (lines.length > 0 && used + block.length > MAX_CONTEXT_CHARS) break;
    lines.push(block);
    used += block.length;
  }
  return ["CONTEXT:", ...lines].join("\n\n");
}

function buildUserPrompt(args: {
  input: GenerateCampaignInput;
  brandBlock: string;
  businessBlock: string;
  docs: RetrievedDoc[];
}): { user: string; promptHash: string } {
  const { input } = args;
  const taskLines = [
    "TASK: Produce a complete, advisory marketing campaign draft.",
    input.objective ? `Objective: ${input.objective}.` : null,
    input.channel ? `Primary channel: ${input.channel}.` : null,
    input.audience ? `Audience: ${input.audience}.` : null,
    input.durationDays ? `Duration: ${input.durationDays} days.` : null,
    `Focus: ${input.query}.`,
    input.instructions ? `Guidance: ${input.instructions}` : null,
  ].filter(Boolean);

  const user = [
    taskLines.join("\n"),
    "",
    args.businessBlock,
    "",
    args.brandBlock,
    "",
    contextBlock(args.docs),
  ].join("\n");

  const promptHash = crypto
    .createHash("sha256")
    .update(`${SYSTEM_PROMPT}\n\n${user}`)
    .digest("hex");
  return { user, promptHash };
}

function stripFences(text: string): string | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return stripped.slice(start, end + 1);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}
function objArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    : [];
}

function normalizeRefs(raw: unknown): RetrievedRef[] {
  if (!Array.isArray(raw)) return [];
  const out: RetrievedRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = (item as Record<string, unknown>).type;
    const id = (item as Record<string, unknown>).id;
    if (typeof type === "string" && typeof id === "string" && VALID_REF_TYPES.has(type)) {
      out.push({ type: type as CitationNodeType, id });
    }
  }
  return out;
}

/** Parse the model JSON into a normalized campaign. Returns null on failure. */
function parseCampaign(
  text: string,
  retrievedRefs: RetrievedRef[],
  fallback: GenerateCampaignInput,
): CampaignProposal | null {
  const json = stripFences(text);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;

  const strategy = str(o.strategy);
  const name = str(o.name) || `Campaign: ${fallback.query}`.slice(0, 200);
  if (!strategy && objArr(o.contentCalendar).length === 0) return null;

  const contentCalendar: ContentCalendarEntry[] = objArr(o.contentCalendar).map((e) => ({
    day: num(e.day),
    channel: str(e.channel),
    theme: str(e.theme),
    format: str(e.format),
    copy: str(e.copy),
    cta: str(e.cta) || undefined,
  }));
  const adConcepts: AdConcept[] = objArr(o.adConcepts).map((e) => ({
    title: str(e.title),
    channel: str(e.channel),
    angle: str(e.angle),
    headline: str(e.headline),
    primaryText: str(e.primaryText),
    cta: str(e.cta),
    visualDirection: str(e.visualDirection),
  }));
  const creativeBriefs: CreativeBrief[] = objArr(o.creativeBriefs).map((e) => ({
    title: str(e.title),
    objective: str(e.objective),
    deliverable: str(e.deliverable),
    audience: str(e.audience),
    keyMessage: str(e.keyMessage),
    toneNotes: str(e.toneNotes),
    specs: str(e.specs) || undefined,
  }));
  const socialSchedule: SocialScheduleEntry[] = objArr(o.socialSchedule).map((e) => ({
    day: num(e.day),
    platform: str(e.platform),
    time: str(e.time) || undefined,
    postType: str(e.postType),
    caption: str(e.caption),
    hashtags: strArr(e.hashtags),
  }));
  const funnelPlan: FunnelStage[] = objArr(o.funnelPlan).map((e) => ({
    stage: str(e.stage),
    goal: str(e.goal),
    tactic: str(e.tactic),
    metric: str(e.metric),
  }));
  const launchPlan: LaunchPhase[] = objArr(o.launchPlan).map((e) => ({
    phase: str(e.phase),
    window: str(e.window),
    actions: strArr(e.actions),
  }));

  const citations = validateCitations(normalizeRefs(o.citations), retrievedRefs);

  return {
    name,
    objective: str(o.objective) || str(fallback.objective),
    audience: str(o.audience) || str(fallback.audience),
    durationDays: num(o.durationDays) || num(fallback.durationDays) || 30,
    strategy,
    contentCalendar,
    adConcepts,
    creativeBriefs,
    socialSchedule,
    funnelPlan,
    launchPlan,
    citations,
  };
}

interface RecordCreativeRunArgs {
  input: GenerateCampaignInput;
  status: CreativeStatus;
  model: string | null;
  promptHash: string | null;
  retrievedRefs: RetrievedRef[];
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  latencyMs: number | null;
  groundingScore: number | null;
  rawOutput: string | null;
  parsedProposal: CampaignProposal | null;
  error: string | null;
}

async function recordCreativeRun(args: RecordCreativeRunArgs): Promise<string | null> {
  try {
    const [row] = await db
      .insert(jarvisCognitionRunsTable)
      .values({
        kind: CREATIVE_RUN_KIND,
        agentId: null,
        agentType: PROMETHEUS_AGENT,
        model: args.model,
        params: {
          query: args.input.query,
          objective: args.input.objective ?? null,
          channel: args.input.channel ?? null,
          audience: args.input.audience ?? null,
          durationDays: args.input.durationDays ?? null,
          businessId: args.input.businessId,
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
    return null;
  }
}

function hashContent(parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function calendarMarkdown(entries: ContentCalendarEntry[]): string {
  return entries
    .map(
      (e) =>
        `- Day ${e.day} · ${e.channel} · ${e.theme} (${e.format})\n  ${e.copy}${
          e.cta ? `\n  CTA: ${e.cta}` : ""
        }`,
    )
    .join("\n");
}
function scheduleMarkdown(entries: SocialScheduleEntry[]): string {
  return entries
    .map(
      (e) =>
        `- Day ${e.day} · ${e.platform}${e.time ? ` @ ${e.time}` : ""} · ${e.postType}\n  ${e.caption}${
          e.hashtags?.length ? `\n  ${e.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""
        }`,
    )
    .join("\n");
}

/**
 * Persist the campaign + its decomposed draft assets. Each asset is an
 * independent governed unit (governanceState="none", status="draft"). Returns
 * the campaign row + asset rows.
 */
async function persistCampaign(
  proposal: CampaignProposal,
  input: GenerateCampaignInput,
  runId: string | null,
  groundingScore: number,
): Promise<{ campaign: JarvisCreativeCampaign; assets: JarvisCreativeAsset[] }> {
  const citations = proposal.citations;
  const [campaign] = await db
    .insert(jarvisCreativeCampaignsTable)
    .values({
      businessId: input.businessId,
      name: proposal.name.slice(0, 200),
      objective: proposal.objective || null,
      channel: (input.channel ?? "multi").slice(0, 64),
      audience: proposal.audience || null,
      durationDays: proposal.durationDays,
      strategy: proposal.strategy || null,
      schedule: {
        contentCalendar: proposal.contentCalendar,
        socialSchedule: proposal.socialSchedule,
        funnelPlan: proposal.funnelPlan,
        launchPlan: proposal.launchPlan,
      },
      status: "draft",
      sourceMode: "cognition",
      cognitionRunId: runId,
      citations,
      groundingScore,
      governanceState: "none",
      createdBy: input.createdBy ?? null,
    })
    .returning();

  const assetSeeds: {
    kind: CreativeAssetKind;
    title: string;
    bodyText: string;
    rationale?: string;
    metadata?: Record<string, unknown>;
  }[] = [];

  if (proposal.strategy) {
    assetSeeds.push({
      kind: "strategy",
      title: `Strategy — ${proposal.name}`,
      bodyText: proposal.strategy,
      rationale: proposal.objective || undefined,
    });
  }
  if (proposal.contentCalendar.length) {
    assetSeeds.push({
      kind: "content_calendar",
      title: `Content calendar — ${proposal.name}`,
      bodyText: calendarMarkdown(proposal.contentCalendar),
      metadata: { entries: proposal.contentCalendar },
    });
  }
  for (const ad of proposal.adConcepts) {
    assetSeeds.push({
      kind: "ad_concept",
      title: ad.title || `Ad concept (${ad.channel})`,
      bodyText: [
        `Channel: ${ad.channel}`,
        `Angle: ${ad.angle}`,
        `Headline: ${ad.headline}`,
        `Primary text: ${ad.primaryText}`,
        `CTA: ${ad.cta}`,
        `Visual direction: ${ad.visualDirection}`,
      ].join("\n"),
      rationale: ad.angle,
      metadata: { ...ad },
    });
  }
  for (const brief of proposal.creativeBriefs) {
    assetSeeds.push({
      kind: "creative_brief",
      title: brief.title || "Creative brief",
      bodyText: [
        `Objective: ${brief.objective}`,
        `Deliverable: ${brief.deliverable}`,
        `Audience: ${brief.audience}`,
        `Key message: ${brief.keyMessage}`,
        `Tone notes: ${brief.toneNotes}`,
        brief.specs ? `Specs: ${brief.specs}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      rationale: brief.keyMessage,
      metadata: { ...brief },
    });
  }
  if (proposal.socialSchedule.length) {
    assetSeeds.push({
      kind: "social_schedule",
      title: `Social schedule — ${proposal.name}`,
      bodyText: scheduleMarkdown(proposal.socialSchedule),
      metadata: { entries: proposal.socialSchedule },
    });
  }
  if (proposal.funnelPlan.length) {
    assetSeeds.push({
      kind: "funnel_plan",
      title: `Funnel plan — ${proposal.name}`,
      bodyText: proposal.funnelPlan
        .map((f) => `- ${f.stage}: ${f.goal} — ${f.tactic} (metric: ${f.metric})`)
        .join("\n"),
      metadata: { stages: proposal.funnelPlan },
    });
  }
  if (proposal.launchPlan.length) {
    assetSeeds.push({
      kind: "launch_plan",
      title: `Launch plan — ${proposal.name}`,
      bodyText: proposal.launchPlan
        .map((p) => `- ${p.phase} (${p.window}):\n  ${p.actions.join("\n  ")}`)
        .join("\n"),
      metadata: { phases: proposal.launchPlan },
    });
  }

  const assets: JarvisCreativeAsset[] = [];
  for (const seed of assetSeeds) {
    const [row] = await db
      .insert(jarvisCreativeAssetsTable)
      .values({
        businessId: input.businessId,
        campaignId: campaign!.id,
        agent: PROMETHEUS_AGENT,
        kind: seed.kind,
        title: seed.title.slice(0, 300),
        prompt: input.query.slice(0, 4000),
        rationale: seed.rationale ?? null,
        bodyText: seed.bodyText,
        metadata: seed.metadata ?? null,
        citations,
        groundingScore,
        sourceMode: "cognition",
        cognitionRunId: runId,
        governanceState: "none",
        status: "draft",
        contentHash: hashContent([seed.kind, seed.title, seed.bodyText]),
        version: 1,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    if (row) assets.push(row);
  }

  return { campaign: campaign!, assets };
}

export async function generateCampaign(
  input: GenerateCampaignInput,
): Promise<GenerateCampaignResult> {
  // 1. Budget gate — refuse BEFORE any spend.
  const budget = await checkCognitionBudget();
  if (budget?.exceeded) {
    const reason = `cognition budget "${budget.name}" exhausted (${budget.consumedMicros}/${budget.limitMicros} micros)`;
    const runId = await recordCreativeRun({
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
    return {
      ok: false,
      status: "budget_exceeded",
      campaign: null,
      assets: [],
      runId,
      groundingScore: null,
      citations: [],
      reason,
    };
  }

  // 2. Load brand context (business + brand profile + memory retrieval).
  const ctx = await loadBrandContext({
    businessId: input.businessId,
    query: input.query,
    instructions: input.instructions ?? null,
    executiveUserId: input.executiveUserId ?? null,
  });
  const { user, promptHash } = buildUserPrompt({
    input,
    brandBlock: buildBrandBlock(ctx.brandProfile),
    businessBlock: buildBusinessBlock(ctx.business),
    docs: ctx.retrieval.docs,
  });

  agentBus.emitEvent({
    type: "cognition_started",
    severity: "info",
    agentType: PROMETHEUS_AGENT,
    message: `prometheus campaign: "${input.query}"`,
    details: { retrievedDocs: ctx.retrieval.docs.length, promptHash },
  });

  // 3. Provider call (fail-safe — never throws).
  const call = await callCreativeText({ system: SYSTEM_PROMPT, user });
  if (!call.ok || !call.text) {
    const reason = call.error ?? "provider returned no content";
    const runId = await recordCreativeRun({
      input,
      status: "error",
      model: call.model,
      promptHash,
      retrievedRefs: ctx.retrieval.refs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costMicros: call.costMicros,
      latencyMs: call.latencyMs,
      groundingScore: null,
      rawOutput: call.text,
      parsedProposal: null,
      error: reason,
    });
    return {
      ok: false,
      status: "degraded",
      campaign: null,
      assets: [],
      runId,
      groundingScore: null,
      citations: [],
      reason,
    };
  }

  // 4. Parse + ground.
  const proposal = parseCampaign(call.text, ctx.retrieval.refs, input);
  if (!proposal) {
    const reason = "model output could not be parsed into a campaign";
    const runId = await recordCreativeRun({
      input,
      status: "degraded",
      model: call.model,
      promptHash,
      retrievedRefs: ctx.retrieval.refs,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costMicros: call.costMicros,
      latencyMs: call.latencyMs,
      groundingScore: null,
      rawOutput: call.text,
      parsedProposal: null,
      error: reason,
    });
    return {
      ok: false,
      status: "degraded",
      campaign: null,
      assets: [],
      runId,
      groundingScore: null,
      citations: [],
      reason,
    };
  }

  const groundingScore = computeGroundingScore(proposal.citations, ctx.retrieval.refs);

  // 5. Record immutable run, meter budget.
  const runId = await recordCreativeRun({
    input,
    status: "ok",
    model: call.model,
    promptHash,
    retrievedRefs: ctx.retrieval.refs,
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

  // 6. Persist draft campaign + assets, then write the memory breadcrumb.
  const { campaign, assets } = await persistCampaign(
    proposal,
    input,
    runId,
    groundingScore,
  );
  try {
    await recordCampaignMemory(campaign, input.createdBy ?? null);
  } catch {
    // Writeback breadcrumb must never break synthesis.
  }

  agentBus.emitEvent({
    type: "cognition_finished",
    severity: "success",
    agentType: PROMETHEUS_AGENT,
    runId,
    message: `prometheus campaign ready: ${campaign.name} (grounding ${groundingScore})`,
    details: { groundingScore, assets: assets.length, costMicros: call.costMicros },
  });

  return {
    ok: true,
    status: "ok",
    campaign,
    assets,
    runId,
    groundingScore,
    citations: proposal.citations,
    reason: null,
  };
}
