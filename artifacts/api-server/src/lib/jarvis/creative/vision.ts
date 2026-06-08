import crypto from "crypto";
import { db } from "@workspace/db";
import {
  jarvisCognitionRunsTable,
  jarvisCreativeCampaignsTable,
  jarvisCreativeAssetsTable,
  type JarvisCreativeCampaign,
  type JarvisCreativeAsset,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { agentBus } from "../agentBus.js";
import {
  checkCognitionBudget,
  consumeCognitionBudget,
} from "../cognition/budget.js";
import {
  computeGroundingScore,
  validateCitations,
} from "../cognition/grounding.js";
import type {
  CitationNodeType,
  RetrievedDoc,
  RetrievedRef,
} from "../cognition/types.js";
import {
  callCreativeText,
  callCreativeImage,
  imageProviderAvailable,
} from "./provider.js";
import {
  loadBrandContext,
  buildBrandBlock,
  buildBusinessBlock,
} from "./brandContext.js";
import { recordCampaignMemory } from "./memoryWriteback.js";
import { uploadCreativeImage } from "./visionStorage.js";
import type {
  CreativeStatus,
  GenerateVisionInput,
  VisionConcept,
  VisionImageAspect,
  VisionProposal,
} from "./types.js";

/**
 * Vision — the media-generation creative agent (Phase 2). ADVISORY-ONLY: it
 * composes the same cognition primitives Prometheus uses (budget → retrieve →
 * call → parse → ground → record) to draft BRANDED visual concepts, then draws a
 * marketing image per concept via the sovereign image provider. Output is a DRAFT
 * creative package — concept copy (grounded TEXT assets) + draft images (binary
 * assets in object storage) — that NEVER publishes or auto-posts. Image binaries
 * live in object storage (storageKey); the DB holds only the key + mimeType.
 *
 * FAIL-SAFE at every layer:
 *  - budget/synthesis/parse failure → a run is recorded and NO draft is written.
 *  - image-provider or storage failure for a concept degrades ONLY that image;
 *    the grounded text concept still persists, and the failure is counted +
 *    reported (never fabricated, never a placeholder image).
 */

const VISION_AGENT = "vision";
const CREATIVE_RUN_KIND = "creative_vision";
const VALID_REF_TYPES: ReadonlySet<string> = new Set([
  "memory",
  "asset",
  "category",
  "decision",
  "task",
  "code",
]);
const VALID_ASPECTS: ReadonlySet<string> = new Set([
  "1:1",
  "4:3",
  "16:9",
  "3:4",
  "9:16",
]);
const MAX_CONTEXT_CHARS = 9000;
const DEFAULT_CONCEPT_COUNT = 5;
const MIN_CONCEPT_COUNT = 1;
const MAX_CONCEPT_COUNT = 8;

export interface GenerateVisionResult {
  ok: boolean;
  status: CreativeStatus;
  campaign: JarvisCreativeCampaign | null;
  /** Concept TEXT assets + generated IMAGE assets (draft, ungoverned). */
  assets: JarvisCreativeAsset[];
  runId: string | null;
  groundingScore: number | null;
  citations: RetrievedRef[];
  conceptCount: number;
  imagesGenerated: number;
  imagesFailed: number;
  imageProviderAvailable: boolean;
  reason: string | null;
}

const SYSTEM_PROMPT = [
  "You are Vision, an ADVISORY creative director inside an executive intelligence",
  "system. You PROPOSE branded ad concepts and the image briefs to render them.",
  "You NEVER take actions, never publish, never post to any channel, and never",
  "instruct anyone to post.",
  "",
  "Rules:",
  "1. Honor the BRAND PROFILE and BUSINESS REGISTRY blocks verbatim — match the",
  "   voice, tone, positioning, palette, and DO/DON'T guardrails. Never contradict",
  "   them. Each imagePrompt MUST express the brand's visual identity.",
  "2. Ground factual claims about the business in the CONTEXT refs. A ref looks",
  '   like {"type":"memory","id":"<uuid>"}. Only cite refs that appear in CONTEXT;',
  "   never fabricate a ref, a metric, or a result. Creative copy may be original,",
  "   but business facts must be grounded or omitted.",
  "3. Institutional, premium tone. No arcade/gambling cues, no emojis.",
  "4. imagePrompt: a single vivid paragraph a text-to-image model can render —",
  "   subject, composition, lighting, color, mood, and on-image text if any.",
  "   negativePrompt: what to avoid. aspect: one of 1:1, 4:3, 16:9, 3:4, 9:16.",
  "5. Output STRICT JSON only — no markdown fences, no commentary before/after.",
  "",
  "Output schema:",
  "{",
  '  "packageName": string, "objective": string, "audience": string,',
  '  "concepts": [ { "title": string, "channel": string, "angle": string,',
  '     "headline": string, "primaryText": string, "cta": string,',
  '     "visualDirection": string, "imagePrompt": string,',
  '     "negativePrompt": string, "aspect": string } ],',
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
    const block = [
      `[${d.type}:${d.id}]${tag} ${d.title}`,
      d.text || "(no body)",
    ].join("\n");
    if (lines.length > 0 && used + block.length > MAX_CONTEXT_CHARS) break;
    lines.push(block);
    used += block.length;
  }
  return ["CONTEXT:", ...lines].join("\n\n");
}

function buildUserPrompt(args: {
  input: GenerateVisionInput;
  conceptCount: number;
  brandBlock: string;
  businessBlock: string;
  docs: RetrievedDoc[];
}): { user: string; promptHash: string } {
  const { input, conceptCount } = args;
  const taskLines = [
    `TASK: Produce ${conceptCount} advisory, on-brand ad concept(s), each with a`,
    "render-ready image brief.",
    input.objective ? `Objective: ${input.objective}.` : null,
    input.channel ? `Primary channel: ${input.channel}.` : null,
    input.audience ? `Audience: ${input.audience}.` : null,
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
function objArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    : [];
}

function normalizeAspect(v: unknown): VisionImageAspect {
  const s = str(v);
  return (VALID_ASPECTS.has(s) ? s : "1:1") as VisionImageAspect;
}

function normalizeRefs(raw: unknown): RetrievedRef[] {
  if (!Array.isArray(raw)) return [];
  const out: RetrievedRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = (item as Record<string, unknown>).type;
    const id = (item as Record<string, unknown>).id;
    if (
      typeof type === "string" &&
      typeof id === "string" &&
      VALID_REF_TYPES.has(type)
    ) {
      out.push({ type: type as CitationNodeType, id });
    }
  }
  return out;
}

function parseVision(
  text: string,
  retrievedRefs: RetrievedRef[],
  fallback: GenerateVisionInput,
  conceptCount: number,
): VisionProposal | null {
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

  const concepts: VisionConcept[] = objArr(o.concepts)
    .map((e) => ({
      title: str(e.title),
      channel: str(e.channel) || str(fallback.channel),
      angle: str(e.angle),
      headline: str(e.headline),
      primaryText: str(e.primaryText),
      cta: str(e.cta),
      visualDirection: str(e.visualDirection),
      imagePrompt: str(e.imagePrompt),
      negativePrompt: str(e.negativePrompt) || undefined,
      aspect: normalizeAspect(e.aspect),
    }))
    .filter((c) => c.imagePrompt.length > 0 || c.headline.length > 0)
    .slice(0, conceptCount);

  if (concepts.length === 0) return null;

  const citations = validateCitations(normalizeRefs(o.citations), retrievedRefs);

  return {
    packageName:
      str(o.packageName) || `Vision package: ${fallback.query}`.slice(0, 200),
    objective: str(o.objective) || str(fallback.objective),
    audience: str(o.audience) || str(fallback.audience),
    concepts,
    citations,
  };
}

interface RecordVisionRunArgs {
  input: GenerateVisionInput;
  conceptCount: number;
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
  parsedProposal: VisionProposal | null;
  error: string | null;
}

async function recordVisionRun(
  args: RecordVisionRunArgs,
): Promise<string | null> {
  try {
    const [row] = await db
      .insert(jarvisCognitionRunsTable)
      .values({
        kind: CREATIVE_RUN_KIND,
        agentId: null,
        agentType: VISION_AGENT,
        model: args.model,
        params: {
          query: args.input.query,
          objective: args.input.objective ?? null,
          channel: args.input.channel ?? null,
          audience: args.input.audience ?? null,
          conceptCount: args.conceptCount,
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

function conceptBody(c: VisionConcept): string {
  return [
    `Channel: ${c.channel}`,
    `Angle: ${c.angle}`,
    `Headline: ${c.headline}`,
    `Primary text: ${c.primaryText}`,
    `CTA: ${c.cta}`,
    `Visual direction: ${c.visualDirection}`,
    `Image prompt: ${c.imagePrompt}`,
    c.negativePrompt ? `Negative prompt: ${c.negativePrompt}` : "",
    `Aspect: ${c.aspect ?? "1:1"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function clampConceptCount(input: GenerateVisionInput): number {
  const raw = input.conceptCount;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(MAX_CONCEPT_COUNT, Math.max(MIN_CONCEPT_COUNT, Math.round(raw)));
  }
  return DEFAULT_CONCEPT_COUNT;
}

/**
 * Resolve the campaign container for the package. Uses an explicit campaignId
 * when supplied + valid (same business); otherwise creates a draft package
 * campaign. Returns null on failure.
 */
async function resolveCampaign(
  proposal: VisionProposal,
  input: GenerateVisionInput,
  runId: string | null,
  groundingScore: number,
): Promise<JarvisCreativeCampaign | null> {
  if (input.campaignId) {
    const [existing] = await db
      .select()
      .from(jarvisCreativeCampaignsTable)
      .where(eq(jarvisCreativeCampaignsTable.id, input.campaignId))
      .limit(1);
    if (existing && existing.businessId === input.businessId) return existing;
  }
  const [campaign] = await db
    .insert(jarvisCreativeCampaignsTable)
    .values({
      businessId: input.businessId,
      name: proposal.packageName.slice(0, 200),
      objective: proposal.objective || null,
      channel: (input.channel ?? "multi").slice(0, 64),
      audience: proposal.audience || null,
      durationDays: 0,
      strategy: null,
      schedule: { conceptCount: proposal.concepts.length },
      status: "draft",
      sourceMode: "cognition",
      cognitionRunId: runId,
      citations: proposal.citations,
      groundingScore,
      governanceState: "none",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return campaign ?? null;
}

export async function generateVisionConcepts(
  input: GenerateVisionInput,
): Promise<GenerateVisionResult> {
  const conceptCount = clampConceptCount(input);
  const providerUp = imageProviderAvailable();

  // 1. Budget gate — refuse BEFORE any spend.
  const budget = await checkCognitionBudget();
  if (budget?.exceeded) {
    const reason = `cognition budget "${budget.name}" exhausted (${budget.consumedMicros}/${budget.limitMicros} micros)`;
    const runId = await recordVisionRun({
      input,
      conceptCount,
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
      conceptCount,
      imagesGenerated: 0,
      imagesFailed: 0,
      imageProviderAvailable: providerUp,
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
    conceptCount,
    brandBlock: buildBrandBlock(ctx.brandProfile),
    businessBlock: buildBusinessBlock(ctx.business),
    docs: ctx.retrieval.docs,
  });

  agentBus.emitEvent({
    type: "cognition_started",
    severity: "info",
    agentType: VISION_AGENT,
    message: `vision concepts: "${input.query}"`,
    details: {
      retrievedDocs: ctx.retrieval.docs.length,
      conceptCount,
      promptHash,
    },
  });

  // 3. Concept synthesis (fail-safe — never throws).
  const call = await callCreativeText({ system: SYSTEM_PROMPT, user });
  if (!call.ok || !call.text) {
    const reason = call.error ?? "provider returned no content";
    const runId = await recordVisionRun({
      input,
      conceptCount,
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
      conceptCount,
      imagesGenerated: 0,
      imagesFailed: 0,
      imageProviderAvailable: providerUp,
      reason,
    };
  }

  // 4. Parse + ground.
  const proposal = parseVision(call.text, ctx.retrieval.refs, input, conceptCount);
  if (!proposal) {
    const reason = "model output could not be parsed into vision concepts";
    const runId = await recordVisionRun({
      input,
      conceptCount,
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
      conceptCount,
      imagesGenerated: 0,
      imagesFailed: 0,
      imageProviderAvailable: providerUp,
      reason,
    };
  }

  const groundingScore = computeGroundingScore(
    proposal.citations,
    ctx.retrieval.refs,
  );

  // 5. Record immutable run, meter the text-synthesis spend.
  const runId = await recordVisionRun({
    input,
    conceptCount,
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

  // 6. Campaign package container.
  const campaign = await resolveCampaign(proposal, input, runId, groundingScore);
  if (!campaign) {
    return {
      ok: false,
      status: "degraded",
      campaign: null,
      assets: [],
      runId,
      groundingScore,
      citations: proposal.citations,
      conceptCount,
      imagesGenerated: 0,
      imagesFailed: 0,
      imageProviderAvailable: providerUp,
      reason: "failed to create campaign package",
    };
  }

  // 7. Per concept: persist grounded TEXT asset, then attempt the draft image.
  const assets: JarvisCreativeAsset[] = [];
  let imagesGenerated = 0;
  let imagesFailed = 0;
  const imageFailures: string[] = [];

  for (const concept of proposal.concepts) {
    const title = concept.title || `Ad concept (${concept.channel})`;
    const [textAsset] = await db
      .insert(jarvisCreativeAssetsTable)
      .values({
        businessId: input.businessId,
        campaignId: campaign.id,
        agent: VISION_AGENT,
        kind: "ad_concept",
        title: title.slice(0, 300),
        prompt: input.query.slice(0, 4000),
        rationale: concept.angle || null,
        bodyText: conceptBody(concept),
        metadata: { ...concept },
        citations: proposal.citations,
        groundingScore,
        sourceMode: "cognition",
        cognitionRunId: runId,
        governanceState: "none",
        status: "draft",
        contentHash: hashContent(["ad_concept", title, conceptBody(concept)]),
        version: 1,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    if (textAsset) assets.push(textAsset);

    // Attempt the image. A provider/storage failure degrades ONLY this image.
    if (!providerUp) {
      imagesFailed += 1;
      continue;
    }
    const image = await callCreativeImage({
      prompt: concept.imagePrompt,
      aspect: concept.aspect ?? "1:1",
    });
    if (!image.ok || !image.bytes) {
      imagesFailed += 1;
      if (image.error) imageFailures.push(image.error);
      continue;
    }
    const uploaded = await uploadCreativeImage(image.bytes, image.mimeType);
    if (!uploaded) {
      imagesFailed += 1;
      imageFailures.push("object storage upload failed");
      continue;
    }
    await consumeCognitionBudget(image.costMicros);
    const imgTitle = `Image — ${title}`;
    const [imageAsset] = await db
      .insert(jarvisCreativeAssetsTable)
      .values({
        businessId: input.businessId,
        campaignId: campaign.id,
        agent: VISION_AGENT,
        kind: "image",
        title: imgTitle.slice(0, 300),
        prompt: concept.imagePrompt.slice(0, 4000),
        rationale: concept.visualDirection || null,
        bodyText: null,
        storageKey: uploaded.storageKey,
        mimeType: uploaded.mimeType,
        metadata: {
          linkedConceptTitle: title,
          linkedConceptAssetId: textAsset?.id ?? null,
          aspect: concept.aspect ?? "1:1",
          model: image.model,
          bytes: uploaded.bytes,
          negativePrompt: concept.negativePrompt ?? null,
        },
        // Binaries are NOT citable; null grounding routes publish → approval.
        citations: null,
        groundingScore: null,
        sourceMode: "cognition",
        cognitionRunId: runId,
        governanceState: "none",
        status: "draft",
        contentHash: hashContent(["image", imgTitle, uploaded.storageKey]),
        version: 1,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    if (imageAsset) {
      assets.push(imageAsset);
      imagesGenerated += 1;
    }
  }

  // 8. Memory breadcrumb (never breaks synthesis).
  try {
    await recordCampaignMemory(campaign, input.createdBy ?? null);
  } catch {
    // best-effort
  }

  const reason =
    imagesGenerated === 0
      ? providerUp
        ? `concepts drafted; image generation unavailable (${imageFailures[0] ?? "provider error"})`
        : "concepts drafted; no image provider configured"
      : null;

  agentBus.emitEvent({
    type: "cognition_finished",
    severity: imagesGenerated > 0 ? "success" : "warn",
    agentType: VISION_AGENT,
    runId,
    message: `vision package ready: ${campaign.name} (${proposal.concepts.length} concepts, ${imagesGenerated} images, grounding ${groundingScore})`,
    details: {
      groundingScore,
      concepts: proposal.concepts.length,
      imagesGenerated,
      imagesFailed,
      costMicros: call.costMicros,
    },
  });

  return {
    ok: true,
    status: imagesGenerated > 0 ? "ok" : "degraded",
    campaign,
    assets,
    runId,
    groundingScore,
    citations: proposal.citations,
    conceptCount: proposal.concepts.length,
    imagesGenerated,
    imagesFailed,
    imageProviderAvailable: providerUp,
    reason,
  };
}
