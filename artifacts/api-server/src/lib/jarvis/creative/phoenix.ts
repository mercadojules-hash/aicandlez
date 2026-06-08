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
import { callCreativeText } from "./provider.js";
import {
  loadBrandContext,
  buildBrandBlock,
  buildBusinessBlock,
} from "./brandContext.js";
import { recordCampaignMemory } from "./memoryWriteback.js";
import { uploadCreativeBinary } from "./visionStorage.js";
import {
  renderStoryboardVideo,
  videoRendererAvailable,
} from "./phoenixRender.js";
import type {
  CreativeStatus,
  GeneratePhoenixInput,
  PhoenixScene,
  PhoenixStoryboard,
  PhoenixVideoFormat,
} from "./types.js";

/**
 * Phoenix — the video-generation creative agent (Phase 3, Tier-1). ADVISORY-ONLY:
 * it composes the same cognition primitives Prometheus/Vision use (budget →
 * retrieve → call → parse → ground → record) to draft a grounded STORYBOARD +
 * SCENE BREAKDOWN, then renders best-effort MP4 renditions PROGRAMMATICALLY via
 * the local ffmpeg binary — no AI video clip provider, no ElevenLabs, no new
 * secrets. Output is a DRAFT creative package — storyboard + scene breakdown
 * (grounded TEXT assets; the scene breakdown doubles as a portable, re-renderable
 * render manifest) + draft videos (binary assets in object storage). It NEVER
 * publishes or auto-posts. Video binaries live in object storage (storageKey);
 * the DB holds only the key + mimeType.
 *
 * FAIL-SAFE at every layer:
 *  - budget/synthesis/parse failure → a run is recorded and NO draft is written.
 *  - the video renderer (ffmpeg) being absent or failing for a format degrades
 *    ONLY that video; the grounded storyboard + scene breakdown still persist
 *    (the render manifest is fully portable), and the failure is counted +
 *    reported (never fabricated, never a placeholder video).
 */

const PHOENIX_AGENT = "phoenix";
const CREATIVE_RUN_KIND = "creative_phoenix";
const VALID_REF_TYPES: ReadonlySet<string> = new Set([
  "memory",
  "asset",
  "category",
  "decision",
  "task",
  "code",
]);
const VALID_FORMATS: ReadonlySet<string> = new Set(["16:9", "9:16", "1:1"]);
const DEFAULT_FORMATS: PhoenixVideoFormat[] = ["16:9", "9:16"];
const MAX_CONTEXT_CHARS = 9000;
const DEFAULT_DURATION_SEC = 30;
const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 120;
const MAX_SCENES = 12;

const FORMAT_LABEL: Record<PhoenixVideoFormat, string> = {
  "16:9": "Marketing video",
  "9:16": "Promotional reel",
  "1:1": "Square reel",
};

export interface GeneratePhoenixResult {
  ok: boolean;
  status: CreativeStatus;
  campaign: JarvisCreativeCampaign | null;
  /** Storyboard + scene-breakdown TEXT assets + rendered VIDEO assets (draft). */
  assets: JarvisCreativeAsset[];
  runId: string | null;
  groundingScore: number | null;
  citations: RetrievedRef[];
  sceneCount: number;
  videosRendered: number;
  videosFailed: number;
  formats: PhoenixVideoFormat[];
  rendererAvailable: boolean;
  reason: string | null;
}

const SYSTEM_PROMPT = [
  "You are Phoenix, an ADVISORY creative director for VIDEO inside an executive",
  "intelligence system. You PROPOSE a storyboard + scene breakdown for a short",
  "marketing video (product demo, marketing video, launch trailer, promotional",
  "reel, social video, or app walkthrough). You NEVER take actions, never publish,",
  "never post to any channel, and never instruct anyone to post.",
  "",
  "Rules:",
  "1. Honor the BRAND PROFILE and BUSINESS REGISTRY blocks verbatim — match the",
  "   voice, tone, positioning, palette, and DO/DON'T guardrails. Never contradict",
  "   them. Scene colors MUST express the brand palette.",
  "2. Ground factual claims about the business in the CONTEXT refs. A ref looks",
  '   like {"type":"memory","id":"<uuid>"}. Only cite refs that appear in CONTEXT;',
  "   never fabricate a ref, a metric, or a result. Creative copy may be original,",
  "   but business facts must be grounded or omitted.",
  "3. Institutional, premium tone. No arcade/gambling cues, no emojis.",
  "4. The video is rendered programmatically as on-brand title cards: each scene",
  "   is a solid background color with a short TITLE and a one-line CAPTION. Keep",
  "   title <= 6 words; caption <= 14 words. bgColor/textColor are 6-digit hex",
  "   (e.g. 0A1410) with strong contrast. voiceover is the narration script for",
  "   that scene (text only — not synthesized). motion is an advisory hint",
  '   ("fade", "slide", or "zoom"). durationSec per scene is 3-6.',
  "5. Scene durations should sum to approximately the requested total length.",
  "6. Output STRICT JSON only — no markdown fences, no commentary before/after.",
  "",
  "Output schema:",
  "{",
  '  "packageName": string, "objective": string, "audience": string,',
  '  "logline": string, "durationSec": number,',
  '  "scenes": [ { "durationSec": number, "bgColor": string, "textColor": string,',
  '     "title": string, "caption": string, "voiceover": string,',
  '     "motion": string } ],',
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
  input: GeneratePhoenixInput;
  durationSec: number;
  brandBlock: string;
  businessBlock: string;
  docs: RetrievedDoc[];
}): { user: string; promptHash: string } {
  const { input, durationSec } = args;
  const taskLines = [
    `TASK: Produce a storyboard + scene breakdown for an approximately`,
    `${durationSec}-second on-brand marketing video.`,
    input.objective ? `Objective: ${input.objective}.` : null,
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

function normHex(value: unknown, fallback: string): string {
  const s = str(value).replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

function normSceneDuration(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 4;
  return Math.min(10, Math.max(1, Math.round(n)));
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

function normalizeFormats(raw: PhoenixVideoFormat[] | null | undefined): PhoenixVideoFormat[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_FORMATS];
  const seen = new Set<string>();
  const out: PhoenixVideoFormat[] = [];
  for (const f of raw) {
    if (VALID_FORMATS.has(f) && !seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_FORMATS];
}

function clampDuration(input: GeneratePhoenixInput): number {
  const raw = input.durationSec;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, Math.round(raw)));
  }
  return DEFAULT_DURATION_SEC;
}

function parsePhoenix(
  text: string,
  retrievedRefs: RetrievedRef[],
  fallback: GeneratePhoenixInput,
  durationSec: number,
): PhoenixStoryboard | null {
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

  const scenes: PhoenixScene[] = objArr(o.scenes)
    .map((e, i) => ({
      index: i,
      durationSec: normSceneDuration(e.durationSec),
      bgColor: normHex(e.bgColor, "0A1410"),
      textColor: normHex(e.textColor, "FFFFFF"),
      title: str(e.title),
      caption: str(e.caption),
      voiceover: str(e.voiceover) || undefined,
      motion: str(e.motion) || undefined,
    }))
    .filter((s) => s.title.length > 0 || s.caption.length > 0)
    .slice(0, MAX_SCENES)
    .map((s, i) => ({ ...s, index: i }));

  if (scenes.length === 0) return null;

  const citations = validateCitations(normalizeRefs(o.citations), retrievedRefs);

  return {
    packageName:
      str(o.packageName) || `Phoenix video: ${fallback.query}`.slice(0, 200),
    objective: str(o.objective) || str(fallback.objective),
    audience: str(o.audience) || str(fallback.audience),
    logline: str(o.logline),
    durationSec:
      typeof o.durationSec === "number" && Number.isFinite(o.durationSec)
        ? Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, Math.round(o.durationSec)))
        : durationSec,
    scenes,
    citations,
  };
}

interface RecordPhoenixRunArgs {
  input: GeneratePhoenixInput;
  durationSec: number;
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
  parsedProposal: PhoenixStoryboard | null;
  error: string | null;
}

async function recordPhoenixRun(
  args: RecordPhoenixRunArgs,
): Promise<string | null> {
  try {
    const [row] = await db
      .insert(jarvisCognitionRunsTable)
      .values({
        kind: CREATIVE_RUN_KIND,
        agentId: null,
        agentType: PHOENIX_AGENT,
        model: args.model,
        params: {
          query: args.input.query,
          objective: args.input.objective ?? null,
          audience: args.input.audience ?? null,
          durationSec: args.durationSec,
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

function storyboardBody(s: PhoenixStoryboard): string {
  const lines = [
    `Logline: ${s.logline || "(none)"}`,
    `Objective: ${s.objective || "(none)"}`,
    `Audience: ${s.audience || "(none)"}`,
    `Target length: ~${s.durationSec}s across ${s.scenes.length} scene(s)`,
    "",
    "Scenes:",
  ];
  for (const sc of s.scenes) {
    lines.push(
      `  ${sc.index + 1}. [${sc.durationSec}s] ${sc.title || "(untitled)"} — ${sc.caption || ""}`.trimEnd(),
    );
  }
  return lines.join("\n");
}

function sceneBreakdownBody(s: PhoenixStoryboard): string {
  const lines: string[] = [];
  for (const sc of s.scenes) {
    lines.push(
      `Scene ${sc.index + 1} (${sc.durationSec}s)`,
      `  Title: ${sc.title || "(none)"}`,
      `  Caption: ${sc.caption || "(none)"}`,
      `  Background: #${sc.bgColor}  Text: #${sc.textColor}`,
      sc.motion ? `  Motion: ${sc.motion}` : "",
      sc.voiceover ? `  Voiceover: ${sc.voiceover}` : "",
      "",
    );
  }
  return lines.filter((l) => l !== undefined).join("\n").trimEnd();
}

/**
 * Resolve the campaign container for the package. Uses an explicit campaignId
 * when supplied + valid (same business); otherwise creates a draft package
 * campaign. Returns null on failure.
 */
async function resolveCampaign(
  storyboard: PhoenixStoryboard,
  input: GeneratePhoenixInput,
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
      name: storyboard.packageName.slice(0, 200),
      objective: storyboard.objective || null,
      channel: "video",
      audience: storyboard.audience || null,
      durationDays: 0,
      strategy: null,
      schedule: { sceneCount: storyboard.scenes.length, durationSec: storyboard.durationSec },
      status: "draft",
      sourceMode: "cognition",
      cognitionRunId: runId,
      citations: storyboard.citations,
      groundingScore,
      governanceState: "none",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return campaign ?? null;
}

function failure(
  status: CreativeStatus,
  runId: string | null,
  reason: string,
  formats: PhoenixVideoFormat[],
  rendererUp: boolean,
  groundingScore: number | null = null,
  citations: RetrievedRef[] = [],
): GeneratePhoenixResult {
  return {
    ok: false,
    status,
    campaign: null,
    assets: [],
    runId,
    groundingScore,
    citations,
    sceneCount: 0,
    videosRendered: 0,
    videosFailed: 0,
    formats,
    rendererAvailable: rendererUp,
    reason,
  };
}

export async function generatePhoenixVideo(
  input: GeneratePhoenixInput,
): Promise<GeneratePhoenixResult> {
  const durationSec = clampDuration(input);
  const formats = normalizeFormats(input.formats);
  const rendererUp = videoRendererAvailable();

  try {
  // 1. Budget gate — refuse BEFORE any spend.
  const budget = await checkCognitionBudget();
  if (budget?.exceeded) {
    const reason = `cognition budget "${budget.name}" exhausted (${budget.consumedMicros}/${budget.limitMicros} micros)`;
    const runId = await recordPhoenixRun({
      input,
      durationSec,
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
    return failure("budget_exceeded", runId, reason, formats, rendererUp);
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
    durationSec,
    brandBlock: buildBrandBlock(ctx.brandProfile),
    businessBlock: buildBusinessBlock(ctx.business),
    docs: ctx.retrieval.docs,
  });

  agentBus.emitEvent({
    type: "cognition_started",
    severity: "info",
    agentType: PHOENIX_AGENT,
    message: `phoenix storyboard: "${input.query}"`,
    details: {
      retrievedDocs: ctx.retrieval.docs.length,
      durationSec,
      formats,
      promptHash,
    },
  });

  // 3. Storyboard synthesis (fail-safe — never throws).
  const call = await callCreativeText({ system: SYSTEM_PROMPT, user });
  if (!call.ok || !call.text) {
    const reason = call.error ?? "provider returned no content";
    const runId = await recordPhoenixRun({
      input,
      durationSec,
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
    return failure("degraded", runId, reason, formats, rendererUp);
  }

  // 4. Parse + ground.
  const storyboard = parsePhoenix(call.text, ctx.retrieval.refs, input, durationSec);
  if (!storyboard) {
    const reason = "model output could not be parsed into a storyboard";
    const runId = await recordPhoenixRun({
      input,
      durationSec,
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
    return failure("degraded", runId, reason, formats, rendererUp);
  }

  const groundingScore = computeGroundingScore(
    storyboard.citations,
    ctx.retrieval.refs,
  );

  // 5. Record immutable run, meter the text-synthesis spend (render is local).
  const runId = await recordPhoenixRun({
    input,
    durationSec,
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
    parsedProposal: storyboard,
    error: null,
  });
  await consumeCognitionBudget(call.costMicros);

  // 6. Campaign package container.
  const campaign = await resolveCampaign(storyboard, input, runId, groundingScore);
  if (!campaign) {
    return failure(
      "degraded",
      runId,
      "failed to create campaign package",
      formats,
      rendererUp,
      groundingScore,
      storyboard.citations,
    );
  }

  const assets: JarvisCreativeAsset[] = [];

  // 7a. Storyboard TEXT asset (grounded).
  const sbBody = storyboardBody(storyboard);
  const [storyboardAsset] = await db
    .insert(jarvisCreativeAssetsTable)
    .values({
      businessId: input.businessId,
      campaignId: campaign.id,
      agent: PHOENIX_AGENT,
      kind: "storyboard",
      title: `Storyboard — ${storyboard.packageName}`.slice(0, 300),
      prompt: input.query.slice(0, 4000),
      rationale: storyboard.logline || null,
      bodyText: sbBody,
      metadata: {
        logline: storyboard.logline,
        objective: storyboard.objective,
        audience: storyboard.audience,
        durationSec: storyboard.durationSec,
        sceneCount: storyboard.scenes.length,
      },
      citations: storyboard.citations,
      groundingScore,
      sourceMode: "cognition",
      cognitionRunId: runId,
      governanceState: "none",
      status: "draft",
      contentHash: hashContent(["storyboard", storyboard.packageName, sbBody]),
      version: 1,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  if (storyboardAsset) assets.push(storyboardAsset);

  // 7b. Scene-breakdown TEXT asset (grounded). metadata = the RENDER MANIFEST:
  // the full storyboard object, so the video is re-renderable from Postgres
  // alone (Vault portability — no dependency on the rendered binary).
  const breakdownBody = sceneBreakdownBody(storyboard);
  const [breakdownAsset] = await db
    .insert(jarvisCreativeAssetsTable)
    .values({
      businessId: input.businessId,
      campaignId: campaign.id,
      agent: PHOENIX_AGENT,
      kind: "scene_breakdown",
      title: `Scene breakdown — ${storyboard.packageName}`.slice(0, 300),
      prompt: input.query.slice(0, 4000),
      rationale: "Portable render manifest — re-renderable anywhere ffmpeg exists",
      bodyText: breakdownBody,
      metadata: {
        renderManifest: storyboard as unknown as Record<string, unknown>,
        formats,
      },
      citations: storyboard.citations,
      groundingScore,
      sourceMode: "cognition",
      cognitionRunId: runId,
      governanceState: "none",
      status: "draft",
      contentHash: hashContent([
        "scene_breakdown",
        storyboard.packageName,
        breakdownBody,
      ]),
      version: 1,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  if (breakdownAsset) assets.push(breakdownAsset);

  // 8. Per format: render the MP4, upload, persist the draft VIDEO asset. A
  // renderer/storage failure degrades ONLY that video (never fabricated).
  let videosRendered = 0;
  let videosFailed = 0;
  const renderFailures: string[] = [];

  for (const format of formats) {
    if (!rendererUp) {
      videosFailed += 1;
      continue;
    }
    const rendered = await renderStoryboardVideo(storyboard, format);
    if (!rendered) {
      videosFailed += 1;
      renderFailures.push(`render failed (${format})`);
      continue;
    }
    const uploaded = await uploadCreativeBinary(
      rendered.bytes,
      rendered.mimeType,
      "jarvis-phoenix",
    );
    if (!uploaded) {
      videosFailed += 1;
      renderFailures.push(`object storage upload failed (${format})`);
      continue;
    }
    const label = FORMAT_LABEL[format];
    const vidTitle = `${label} — ${storyboard.packageName}`;
    try {
      const [videoAsset] = await db
        .insert(jarvisCreativeAssetsTable)
        .values({
          businessId: input.businessId,
          campaignId: campaign.id,
          agent: PHOENIX_AGENT,
          kind: "video",
          title: vidTitle.slice(0, 300),
          prompt: input.query.slice(0, 4000),
          rationale: storyboard.logline || null,
          bodyText: null,
          storageKey: uploaded.storageKey,
          mimeType: uploaded.mimeType,
          metadata: {
            format,
            label,
            width: rendered.width,
            height: rendered.height,
            durationSec: rendered.durationSec,
            renderer: "ffmpeg",
            sceneCount: storyboard.scenes.length,
            linkedStoryboardAssetId: storyboardAsset?.id ?? null,
            linkedManifestAssetId: breakdownAsset?.id ?? null,
            bytes: uploaded.bytes,
          },
          // Binaries are NOT citable; null grounding routes publish → approval.
          citations: null,
          groundingScore: null,
          sourceMode: "cognition",
          cognitionRunId: runId,
          governanceState: "none",
          status: "draft",
          contentHash: hashContent(["video", vidTitle, uploaded.storageKey]),
          version: 1,
          createdBy: input.createdBy ?? null,
        })
        .returning();
      if (videoAsset) {
        assets.push(videoAsset);
        videosRendered += 1;
      } else {
        videosFailed += 1;
        renderFailures.push(`video asset insert returned no row (${format})`);
      }
    } catch {
      // A single-format persistence failure degrades only that video; the
      // grounded storyboard + scene breakdown (the render manifest) still stand.
      videosFailed += 1;
      renderFailures.push(`video asset persist failed (${format})`);
    }
  }

  // 9. Memory breadcrumb (never breaks synthesis).
  try {
    await recordCampaignMemory(campaign, input.createdBy ?? null);
  } catch {
    // best-effort
  }

  const reason =
    videosRendered === 0
      ? rendererUp
        ? `storyboard drafted; video rendering unavailable (${renderFailures[0] ?? "render error"})`
        : "storyboard drafted; no video renderer (ffmpeg) on host — render manifest persisted for later rendering"
      : null;

  agentBus.emitEvent({
    type: "cognition_finished",
    severity: videosRendered > 0 ? "success" : "warn",
    agentType: PHOENIX_AGENT,
    runId,
    message: `phoenix package ready: ${campaign.name} (${storyboard.scenes.length} scenes, ${videosRendered} videos, grounding ${groundingScore})`,
    details: {
      groundingScore,
      scenes: storyboard.scenes.length,
      videosRendered,
      videosFailed,
      costMicros: call.costMicros,
    },
  });

  return {
    ok: true,
    status: videosRendered > 0 ? "ok" : "degraded",
    campaign,
    assets,
    runId,
    groundingScore,
    citations: storyboard.citations,
    sceneCount: storyboard.scenes.length,
    videosRendered,
    videosFailed,
    formats,
    rendererAvailable: rendererUp,
    reason,
  };
  } catch (err) {
    // Top-level fail-safe: any unexpected throw (brand-context load, DB insert,
    // budget write) degrades to a structured result rather than propagating —
    // generatePhoenixVideo never throws.
    const reason =
      err instanceof Error
        ? `phoenix synthesis failed: ${err.message}`
        : "phoenix synthesis failed: unexpected error";
    return failure("degraded", null, reason, formats, rendererUp);
  }
}
