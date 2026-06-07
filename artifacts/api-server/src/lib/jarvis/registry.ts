import type { AgentHandler } from "./types.js";
import { chiefOfStaffAgent } from "./agents/chiefOfStaff.js";
import { operationsAgent } from "./agents/operations.js";
import { riskAgent } from "./agents/risk.js";
import { memoryAgent } from "./agents/memory.js";
import { qaAgent } from "./agents/qa.js";

/**
 * The runtime handler registry. `jarvis_agents.agent_type` keys into this map;
 * registry rows whose type has no handler are ignored by the scheduler (treated
 * as inert/custom). Adding a new agent type = add a handler here.
 */
const HANDLERS: AgentHandler[] = [
  chiefOfStaffAgent,
  operationsAgent,
  riskAgent,
  memoryAgent,
  qaAgent,
];

export const AGENT_HANDLERS: Record<string, AgentHandler> = Object.fromEntries(
  HANDLERS.map((h) => [h.type, h]),
);

export function getHandler(type: string): AgentHandler | undefined {
  return AGENT_HANDLERS[type];
}

/** Catalog of installable agent types — surfaced to the frontend for seeding. */
export const AGENT_CATALOG = HANDLERS.map((h) => ({
  type: h.type,
  label: h.label,
  description: h.description,
  defaultCapabilities: h.defaultCapabilities,
  defaultScheduleSeconds: h.defaultScheduleSeconds,
  defaultPriority: h.defaultPriority,
}));
