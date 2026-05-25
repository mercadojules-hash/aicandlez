/**
 * GET /api/execution/state — canonical execution-state source of truth.
 *
 * Read-only. Surfaces a single shape that the customer portal, the admin
 * portal, and the operator Command Center all consume so the three views
 * cannot drift out of sync.
 *
 * Derivation only — does NOT introduce a new state machine. State comes from:
 *   - engineStats.running (tradingLoop)
 *   - executionStreamBus recent activity window (last 6s)
 *   - CUSTOMER_LIVE_EXECUTION_ENABLED env (kill switch — see replit.md
 *     "customer_live_execution_disabled" LOCKED INVARIANT)
 *   - caller role (admin/super-admin bypass customer kill switch)
 *
 * Per-stream (`crypto`, `equities`) state:
 *   - "halted"    → engine not running OR customer live execution disabled
 *                   (for non-admin role) OR engine paused.
 *   - "executing" → live or test execution event for that stream in the
 *                   last EXECUTING_WINDOW_MS milliseconds.
 *   - "armed"     → engine running, not halted, no recent exec activity.
 *
 * Never touches the Kraken bridge, execution queue, auth middleware,
 * operator routing, or BUY-TRACE diagnostics. Pure telemetry projection.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { engineStats } from "../lib/tradingLoop.js";
import { executionStreamBus } from "../lib/executionStreamBus.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const EXECUTING_WINDOW_MS = 6_000;

// Symbol classification — kept aligned with CommandCenter.tsx CRYPTO_SYMS.
// Anything not in this set is treated as equities.
const CRYPTO_BASES = new Set([
  "BTC","ETH","SOL","XRP","ADA","AVAX","DOGE","LINK","DOT","POL","MATIC","LTC",
  "ATOM","NEAR","ALGO","FIL","ARB","OP","INJ","SUI","APT","BCH","UNI",
  "AAVE","ETC",
]);

function classifyStream(symbol: string | undefined): "crypto" | "equities" | null {
  if (!symbol) return null;
  const base = symbol
    .replace(/[/\-_].*$/, "")
    .replace(/USD[TC]?$/i, "")
    .toUpperCase();
  if (CRYPTO_BASES.has(base)) return "crypto";
  // Common equity tickers are 1–5 alpha chars and not in crypto set.
  if (/^[A-Z]{1,5}$/.test(base)) return "equities";
  return null;
}

const StreamStateSchema = z.object({
  state:        z.enum(["halted", "armed", "executing"]),
  lastExecAt:   z.number().nullable(),
  lastSignalAt: z.number().nullable(),
  reason:       z.string().nullable(),
});

const ExecutionStateResponseSchema = z.object({
  ts:       z.number(),
  engine:   z.object({
    running:        z.boolean(),
    lastTickAt:     z.number().nullable(),
    signalsGenerated: z.number(),
    tradesExecuted: z.number(),
  }),
  role:     z.enum(["admin", "customer", "anonymous"]),
  // Customer live execution kill switch (server-side invariant). When true,
  // non-admin viewers see crypto/equities as halted regardless of engine
  // state. Admins bypass this — they see real engine state.
  customerLiveExecutionDisabled: z.boolean(),
  crypto:   StreamStateSchema,
  equities: StreamStateSchema,
});

export type ExecutionStateResponse = z.infer<typeof ExecutionStateResponseSchema>;

async function resolveRole(req: Request): Promise<"admin" | "customer" | "anonymous"> {
  // Clerk middleware populates req.auth(); we read clerkUserId without
  // touching auth middleware. If unavailable, treat as anonymous.
  const auth = (req as Request & { auth?: () => { userId?: string | null } }).auth;
  if (typeof auth !== "function") return "anonymous";
  const clerkUserId = auth().userId;
  if (!clerkUserId) return "anonymous";
  try {
    const rows = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);
    const role = rows[0]?.role;
    if (role === "admin" || role === "super-admin") return "admin";
    return "customer";
  } catch {
    return "customer";
  }
}

function deriveStreamState(args: {
  stream:        "crypto" | "equities";
  engineRunning: boolean;
  halted:        boolean;
  haltReason:    string | null;
  now:           number;
}): z.infer<typeof StreamStateSchema> {
  const { stream, engineRunning, halted, haltReason, now } = args;

  // Walk the recent ring once to find the latest matching exec / signal.
  const { events } = executionStreamBus.getRecent(200);
  let lastExecAt:   number | null = null;
  let lastSignalAt: number | null = null;
  for (const ev of events) {
    const cls = classifyStream(ev.symbol);
    if (cls !== stream) continue;
    if (lastExecAt === null && (ev.type === "execution_sent" || ev.type === "order_filled" || ev.type === "order_acknowledged")) {
      lastExecAt = ev.ts;
    }
    if (lastSignalAt === null && (ev.type === "signal_detected" || ev.type === "signal_accepted")) {
      lastSignalAt = ev.ts;
    }
    if (lastExecAt !== null && lastSignalAt !== null) break;
  }

  if (halted || !engineRunning) {
    return {
      state:        "halted",
      lastExecAt,
      lastSignalAt,
      reason:       haltReason ?? (engineRunning ? null : "engine_not_running"),
    };
  }

  if (lastExecAt !== null && now - lastExecAt <= EXECUTING_WINDOW_MS) {
    return { state: "executing", lastExecAt, lastSignalAt, reason: null };
  }

  return { state: "armed", lastExecAt, lastSignalAt, reason: null };
}

// Auth-gated: response includes engine counters that should not be public.
// Both signed-in customers and admins consume this — admins get true engine
// state, customers get the kill-switch-respecting projection.
router.get("/execution/state", requireAuth, async (req: Request, res: Response) => {
  const now            = Date.now();
  const engineRunning  = engineStats.running;
  const role           = await resolveRole(req);

  // Customer live execution kill switch. Default OFF (disabled) unless env
  // CUSTOMER_LIVE_EXECUTION_ENABLED is the literal string "true". Admins
  // bypass — they see true engine state regardless. Matches the enforcement
  // contract in placeLiveAutoOrderForUser / userLiveOrder route / tradingLoop
  // customer fan-out branch (replit.md Task #157).
  const customerLiveExecutionDisabled =
    process.env["CUSTOMER_LIVE_EXECUTION_ENABLED"] !== "true";

  const customerHalted = role !== "admin" && customerLiveExecutionDisabled;
  const haltReason =
    customerHalted ? "customer_live_execution_disabled" :
    !engineRunning ? "engine_not_running" :
    null;

  const payload: ExecutionStateResponse = {
    ts:       now,
    engine: {
      running:          engineRunning,
      lastTickAt:       engineStats.lastTickAt,
      signalsGenerated: engineStats.signalsGenerated,
      tradesExecuted:   engineStats.tradesExecuted,
    },
    role,
    customerLiveExecutionDisabled,
    crypto: deriveStreamState({
      stream: "crypto",
      engineRunning,
      halted: customerHalted,
      haltReason,
      now,
    }),
    equities: deriveStreamState({
      stream: "equities",
      engineRunning,
      halted: customerHalted,
      haltReason,
      now,
    }),
  };

  // Validate outgoing shape — drops the response on schema drift so the
  // client never receives a malformed state payload.
  const parsed = ExecutionStateResponseSchema.safeParse(payload);
  if (!parsed.success) {
    req.log.error({ err: parsed.error.format() }, "execution state schema mismatch");
    return res.status(500).json({ error: "execution_state_schema_mismatch" });
  }

  // Short cache — clients poll every 4s, so 2s is enough headroom without
  // serving stale state across operators.
  res.setHeader("Cache-Control", "private, max-age=2");
  return res.json(parsed.data);
});

export default router;
