/**
 * Deterministic voice intent router (Voice v1).
 *
 * Pure, LLM-free classification: a transcript is matched against a fixed
 * capability registry (keyword/pattern rules) and resolves to exactly one of the
 * 7 read/advisory capabilities or a control outcome (`clarify`/`reject`). This is
 * the control plane: the model has ZERO authority over routing. Because v1 has no
 * state-changing capability, the router can never reach an effector — `reject` is
 * a pure UX courtesy ("voice is read-only in v1"), not a safety dependency.
 *
 * Fail-safe bias: when intent is ambiguous (tie) or unrecognized, resolve to
 * `clarify` rather than guessing — the system never acts on a low-confidence
 * interpretation.
 */

import type {
  IntentClassification,
  VoiceCapability,
} from "./types.js";

interface CapabilityRule {
  capability: VoiceCapability;
  patterns: RegExp[];
}

// Ordered by specificity: narrow entity lookups before broad generative intents,
// so "show me the tasks" routes to task_lookup, not executive_briefing.
const RULES: CapabilityRule[] = [
  {
    capability: "agent_status",
    patterns: [/\bagents?\b/i, /\bfleet\b/i, /\bruntime\b/i, /\bworkers?\b/i],
  },
  {
    capability: "task_lookup",
    patterns: [
      /\btasks?\b/i,
      /\bto-?dos?\b/i,
      /\boverdue\b/i,
      /\bdue\b/i,
      /\bbacklog\b/i,
    ],
  },
  {
    capability: "project_lookup",
    patterns: [
      /\bprojects?\b/i,
      /\bbusiness(es)?\b/i,
      /\bportfolio\b/i,
      /\binitiatives?\b/i,
    ],
  },
  {
    capability: "memory_query",
    patterns: [/\bmemor(y|ies)\b/i, /\bremember\b/i, /\brecall\b/i, /\bnoted?\b/i],
  },
  {
    capability: "knowledge_search",
    patterns: [
      /\bsearch\b/i,
      /\bfind\b/i,
      /\blook ?up\b/i,
      /\bknowledge\b/i,
      /\bdocument(s|ation)?\b/i,
      /\bassets?\b/i,
      /\bwhat do (you|we) know\b/i,
      /\binformation\b/i,
    ],
  },
  {
    capability: "report_generation",
    patterns: [/\breports?\b/i, /\banalysis\b/i, /\bwrite ?up\b/i, /\bdeep dive\b/i],
  },
  {
    capability: "executive_briefing",
    patterns: [
      /\bbrief(ing)?\b/i,
      /\bsummar(y|ize|ise)\b/i,
      /\boverview\b/i,
      /\bcatch me up\b/i,
      /\bupdate me\b/i,
      /\bwhat'?s (new|happening|going on)\b/i,
      /\bstatus\b/i,
    ],
  },
];

// Out-of-scope action verbs. Only consulted when NO capability matched, purely to
// return a clearer `reject` message — never a safety gate (no effector exists).
const MUTATION_PATTERN =
  /\b(create|delete|remove|update|edit|change|modify|send|email|execute|launch|approve|reject|publish|assign|delegate|buy|sell|trade|transfer|pay|cancel)\b/i;

// Informational / definitional question forms. When NO capability keyword matched
// and the request is not a mutation, a natural-language question about an entity
// ("what is X?", "who is X?", "tell me about X", "define X") should ATTEMPT
// knowledge retrieval before falling back to clarification — the retrieval handler
// itself degrades gracefully ("I couldn't find anything") if the corpus is silent.
// Tested against the RAW transcript because cleanQuery strips leading "what is/are".
const INFORMATIONAL_PATTERN =
  /^(?:what|whats|what's|who|whos|who's|whose|where|when|why|how|which)\b|\b(?:tell me about|what do (?:you|we) know about|do you know|explain|describe|define|info(?:rmation)? (?:on|about)|details? (?:on|about)|more (?:on|about))\b/i;

const FILLER_PATTERN =
  /^(?:ok(?:ay)?|hey|hi|yo|please|jarvis|so|um+|uh+|well|can you|could you|would you|will you|tell me|show me|give me|get me|i want to|i'd like to|let'?s|pull up|bring up|what(?:'s| is| are)?)\s+/i;

/** Strip leading filler so the topic forwarded to handlers is clean. */
export function cleanQuery(transcript: string): string {
  let q = transcript.trim().replace(/\s+/g, " ");
  // Strip repeatedly to peel stacked filler ("hey jarvis can you ...").
  for (let i = 0; i < 4; i++) {
    const next = q.replace(FILLER_PATTERN, "");
    if (next === q) break;
    q = next.trim();
  }
  return q.replace(/[?.!,]+$/g, "").trim() || transcript.trim();
}

const CLARIFY_REASON =
  "I can brief you, generate a report, search knowledge or memory, " +
  "or look up agents, tasks, and projects. What would you like?";

/**
 * Classify a transcript into a capability or control outcome. PURE — no I/O, no
 * model call, fully deterministic.
 */
export function classifyIntent(transcript: string): IntentClassification {
  const raw = (transcript ?? "").trim();
  const query = cleanQuery(raw);

  if (!raw) {
    return {
      intent: "clarify",
      capability: null,
      confidence: 0,
      query: "",
      reason: "I didn't catch that — please try again.",
    };
  }

  const scored = RULES.map((rule) => ({
    capability: rule.capability,
    score: rule.patterns.reduce((n, p) => n + (p.test(raw) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];

  if (!best || best.score === 0) {
    // Nothing matched. Distinguish an out-of-scope action from genuine confusion.
    if (MUTATION_PATTERN.test(raw)) {
      return {
        intent: "reject",
        capability: null,
        confidence: 0,
        query,
        reason:
          "Voice is read-only in this version — I can't make changes. " +
          "I can look things up or brief you instead.",
      };
    }
    // Natural-language question about an entity ("what is AICandlez?", "who is X",
    // "tell me about Y") with a substantive topic ⇒ ATTEMPT knowledge retrieval
    // before clarifying. The handler degrades gracefully if the corpus is silent,
    // so this never asserts an answer it doesn't have — it just stops sending real
    // questions to the clarify dead-end.
    if (INFORMATIONAL_PATTERN.test(raw) && query.length >= 3) {
      return {
        intent: "knowledge_search",
        capability: "knowledge_search",
        confidence: 45,
        query,
        reason: null,
      };
    }
    return {
      intent: "clarify",
      capability: null,
      confidence: 0,
      query,
      reason: CLARIFY_REASON,
    };
  }

  // Tie between two DIFFERENT capabilities ⇒ ambiguous ⇒ clarify (never guess).
  if (second && second.score === best.score) {
    return {
      intent: "clarify",
      capability: null,
      confidence: 40,
      query,
      reason: CLARIFY_REASON,
    };
  }

  const confidence = Math.max(
    0,
    Math.min(100, 50 + best.score * 20 - (second?.score ?? 0) * 10),
  );

  return {
    intent: best.capability,
    capability: best.capability,
    confidence,
    query,
    reason: null,
  };
}
