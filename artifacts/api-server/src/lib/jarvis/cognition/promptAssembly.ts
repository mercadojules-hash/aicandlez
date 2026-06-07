import crypto from "crypto";
import type { RetrievedDoc, ThinkInput } from "./types.js";

/**
 * Deterministic prompt assembly + hashing. The system prompt pins the cognition
 * contract: advisory-only, ground every claim in the supplied CONTEXT, cite by
 * the exact `[type:id]` refs, and emit STRICT JSON. The user prompt carries the
 * task + the retrieved context blocks. `promptHash` is a stable sha256 of the
 * assembled prompt — it lets identical inputs be recognized across runs and is
 * persisted on the immutable cognition run for audit.
 */

const SYSTEM_PROMPT = [
  "You are Jarvis Cognition, an ADVISORY reasoning component for an executive",
  "intelligence system. You PROPOSE content; you NEVER take actions, never call",
  "tools, never instruct anyone to act.",
  "",
  "Rules:",
  "1. Use ONLY the information in the CONTEXT block. Do not invent facts,",
  "   numbers, names, or sources that are not present in CONTEXT.",
  "2. Every substantive claim MUST be supported by one or more citations drawn",
  "   from the CONTEXT refs. A ref looks like {\"type\":\"asset\",\"id\":\"<uuid>\"}.",
  "   CONTEXT may also include source-code refs of type \"code\" whose text is an",
  "   excerpt of an actual project file (the title is the file path); cite these",
  "   the same way when reasoning about the codebase.",
  "   Only cite refs that appear in CONTEXT — never fabricate a ref.",
  "3. If CONTEXT is insufficient to support a section, write a brief honest note",
  "   and cite nothing rather than inventing support.",
  "4. Output STRICT JSON only — no markdown fences, no commentary before/after.",
  "",
  "Output schema:",
  "{",
  '  "title": string,',
  '  "summary": string,',
  '  "sections": [',
  '    { "heading": string, "body": string,',
  '      "citations": [ { "type": string, "id": string } ] }',
  "  ]",
  "}",
].join("\n");

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Approximate token budget for the assembled CONTEXT block. We greedily include
 * docs (already ranked: hop-0 fused hits first, hop-1 neighbours last) until the
 * budget is reached, always keeping at least the top doc. ~4 chars/token is the
 * standard rough proxy — this bounds prompt cost without a tokenizer dependency.
 */
const MAX_CONTEXT_CHARS = 9000;

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
      d.text ? d.text : "(no body)",
    ].join("\n");
    // Always include the first (highest-ranked) doc; budget-gate the rest.
    if (lines.length > 0 && used + block.length > MAX_CONTEXT_CHARS) break;
    lines.push(block);
    used += block.length;
  }
  return ["CONTEXT:", ...lines].join("\n\n");
}

export interface AssembledPrompt {
  system: string;
  user: string;
  promptHash: string;
}

export function assemblePrompt(
  input: ThinkInput,
  docs: RetrievedDoc[],
): AssembledPrompt {
  const taskLines = [
    `TASK: Produce an executive ${input.kind} draft.`,
    input.period ? `Period: ${input.period}.` : null,
    input.audience ? `Audience: ${input.audience}.` : null,
    `Focus: ${input.query}.`,
    input.instructions ? `Guidance: ${input.instructions}` : null,
  ].filter(Boolean);

  const user = [taskLines.join("\n"), "", contextBlock(docs)].join("\n");
  const promptHash = crypto
    .createHash("sha256")
    .update(`${SYSTEM_PROMPT}\n\n${user}`)
    .digest("hex");

  return { system: SYSTEM_PROMPT, user, promptHash };
}
