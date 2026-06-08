import { EventEmitter } from "events";
import crypto from "crypto";

/**
 * In-memory activity bus for the Jarvis agent runtime. Mirrors the pattern of
 * `executionStreamBus` (ring buffer + EventEmitter) but is a SEPARATE instance
 * dedicated to Jarvis — it never carries AICandlez trading telemetry. Surfaced
 * to the Agent Activity Dashboard via polling (`GET /api/jarvis/runtime/activity`).
 */

export type AgentEventType =
  | "runtime_started"
  | "runtime_stopped"
  | "tick"
  | "agent_started"
  | "agent_finished"
  | "agent_error"
  | "agent_message"
  | "agent_escalation"
  | "agent_log"
  // ── Sprint 6 — orchestration events ───────────────────────────────────────
  | "workflow_started"
  | "workflow_step"
  | "workflow_finished"
  | "delegation_created"
  | "delegation_executed"
  | "command_received"
  | "command_dispatched"
  | "command_completed"
  | "escalation_advanced"
  | "routing_decision"
  // ── Sprint 7 — governance events ──────────────────────────────────────────
  | "governance_allowed"
  | "governance_denied"
  | "governance_held"
  | "governance_resumed"
  | "trust_recomputed"
  | "budget_reset"
  // ── Sprint 8 — cognition events ───────────────────────────────────────────
  | "cognition_started"
  | "cognition_finished"
  | "cognition_degraded"
  | "cognition_proposal";

export type AgentEventSeverity = "info" | "success" | "warn" | "error";

export interface AgentBusEvent {
  id: string;
  ts: number;
  type: AgentEventType;
  severity: AgentEventSeverity;
  agentId?: string | null;
  agentName?: string | null;
  agentType?: string | null;
  runId?: string | null;
  message: string;
  details?: Record<string, unknown>;
}

const RING_MAX = 500;

class AgentBus extends EventEmitter {
  private ring: AgentBusEvent[] = [];
  private cursor = 0;

  emitEvent(ev: Omit<AgentBusEvent, "id" | "ts"> & { ts?: number }): AgentBusEvent {
    const full: AgentBusEvent = {
      id: crypto.randomUUID(),
      ts: ev.ts ?? Date.now(),
      ...ev,
    };
    this.cursor++;
    this.ring.unshift(full);
    if (this.ring.length > RING_MAX) this.ring.length = RING_MAX;
    this.emit("event", full);
    return full;
  }

  getRecent(limit = 200): { events: AgentBusEvent[]; cursor: number } {
    return { events: this.ring.slice(0, limit), cursor: this.cursor };
  }

  clear(): void {
    this.ring = [];
  }

  size(): number {
    return this.ring.length;
  }
}

export const agentBus = new AgentBus();
