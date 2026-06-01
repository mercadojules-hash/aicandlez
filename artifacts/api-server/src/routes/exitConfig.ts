import { Router } from "express";
import { db } from "@workspace/db";
import { userSettingsTable, userExchangeSettingsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { CONNECTABLE_EXCHANGE_IDS } from "../services/exchanges/catalog.js";
import {
  EXIT_DEFAULTS,
  EXIT_BOUNDS,
  type ExitField,
} from "../lib/exitConfig.js";
import type { Request } from "express";

// ── Per-account / per-exchange live-exit controls (Task #220) ─────────────────
//
// Customer-facing CRUD for the four live-exit values — take-profit %,
// stop-loss %, trailing-stop %, max-hold hours — at TWO scopes:
//   - Account default  → `user_settings` (SL/TP are NOT NULL; trailing/maxHold
//     nullable, null = mirror-SL / env-default behavior).
//   - Per-exchange      → `user_exchange_settings` (all four nullable, null =
//     inherit the account default).
//
// Resolution + engine application lives in `lib/exitConfig.ts`. These routes
// only persist raw config; the resolver folds in env operator overrides.
//
// Base path: /api/user/exit-config

const router = Router();
type AuthReq = Request & { clerkUserId: string };

type FieldResult = { ok: true; value: number | null } | { ok: false; error: string };

// Validate + range-check a single exit field. `allowNull` distinguishes the
// account-level SL/TP (must be concrete) from nullable inherit-able fields.
function parseExitField(field: ExitField, raw: unknown, allowNull: boolean): FieldResult {
  if (raw === null) {
    return allowNull
      ? { ok: true, value: null }
      : { ok: false, error: `${field} cannot be null` };
  }
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return { ok: false, error: `${field} must be a number` };
  }
  const { min, max } = EXIT_BOUNDS[field];
  if (n < min || n > max) {
    return { ok: false, error: `${field} must be between ${min} and ${max}` };
  }
  return { ok: true, value: parseFloat(n.toFixed(4)) };
}

// JIT-provision the parent users + user_settings rows so a fresh Clerk session
// that raced ahead of /auth/me can't FK-violate (mirrors userSettings.ts).
async function ensureSettingsRow(userId: string) {
  await db.insert(usersTable)
    .values({ clerkUserId: userId, email: "", role: "user" })
    .onConflictDoNothing();
  await db.insert(userSettingsTable)
    .values({ userId })
    .onConflictDoNothing();
}

// Shared response shape so customer GET and (re-used) admin GET agree.
async function loadExitConfig(userId: string) {
  const [account] = await db
    .select({
      stopLossPercent:     userSettingsTable.stopLossPercent,
      takeProfitPercent:   userSettingsTable.takeProfitPercent,
      trailingStopPercent: userSettingsTable.trailingStopPercent,
      maxHoldHours:        userSettingsTable.maxHoldHours,
    })
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId))
    .limit(1);

  const exchanges = await db
    .select({
      exchange:            userExchangeSettingsTable.exchange,
      takeProfitPercent:   userExchangeSettingsTable.takeProfitPercent,
      stopLossPercent:     userExchangeSettingsTable.stopLossPercent,
      trailingStopPercent: userExchangeSettingsTable.trailingStopPercent,
      maxHoldHours:        userExchangeSettingsTable.maxHoldHours,
    })
    .from(userExchangeSettingsTable)
    .where(eq(userExchangeSettingsTable.userId, userId));

  return {
    account: account ?? {
      stopLossPercent:     EXIT_DEFAULTS.stopLossPercent,
      takeProfitPercent:   EXIT_DEFAULTS.takeProfitPercent,
      trailingStopPercent: null as number | null,
      maxHoldHours:        null as number | null,
    },
    // Only surface exchanges that actually have at least one exit override set,
    // so the per-exchange rows created purely for tradeSize/maxPositions don't
    // masquerade as exit overrides.
    exchanges: exchanges.filter((e) =>
      e.takeProfitPercent !== null ||
      e.stopLossPercent !== null ||
      e.trailingStopPercent !== null ||
      e.maxHoldHours !== null,
    ),
    defaults: EXIT_DEFAULTS,
    bounds:   EXIT_BOUNDS,
  };
}

// Build a validated account-level patch from a request body. Returns either the
// patch object or a 400-worthy error string.
function buildAccountPatch(body: Record<string, unknown>):
  { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};
  // SL/TP must be concrete (NOT NULL columns); trailing/maxHold may be null.
  const spec: Array<[string, ExitField, boolean]> = [
    ["stopLossPercent",     "stopLossPercent",     false],
    ["takeProfitPercent",   "takeProfitPercent",   false],
    ["trailingStopPercent", "trailingStopPercent", true],
    ["maxHoldHours",        "maxHoldHours",        true],
  ];
  for (const [key, field, allowNull] of spec) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const r = parseExitField(field, body[key], allowNull);
    if (!r.ok) return { ok: false, error: r.error };
    patch[key] = r.value;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No valid exit-config fields provided" };
  }
  return { ok: true, patch };
}

// Build a validated per-exchange patch (all four fields nullable = inherit).
function buildExchangePatch(body: Record<string, unknown>):
  { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};
  const spec: Array<[string, ExitField]> = [
    ["takeProfitPercent",   "takeProfitPercent"],
    ["stopLossPercent",     "stopLossPercent"],
    ["trailingStopPercent", "trailingStopPercent"],
    ["maxHoldHours",        "maxHoldHours"],
  ];
  for (const [key, field] of spec) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const r = parseExitField(field, body[key], true);
    if (!r.ok) return { ok: false, error: r.error };
    patch[key] = r.value;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No valid exit-config fields provided" };
  }
  return { ok: true, patch };
}

// Exported so the admin route can reuse the exact persistence + validation.
export async function applyAccountExitConfig(userId: string, body: Record<string, unknown>) {
  const built = buildAccountPatch(body);
  if (!built.ok) return built;
  await ensureSettingsRow(userId);
  await db.update(userSettingsTable)
    .set({ ...built.patch, updatedAt: new Date() })
    .where(eq(userSettingsTable.userId, userId));
  return { ok: true as const, config: await loadExitConfig(userId) };
}

export async function applyExchangeExitConfig(userId: string, exchange: string, body: Record<string, unknown>) {
  if (!exchange || !CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    return { ok: false as const, error: `Unknown exchange "${exchange}"` };
  }
  const built = buildExchangePatch(body);
  if (!built.ok) return built;
  await db.insert(usersTable)
    .values({ clerkUserId: userId, email: "", role: "user" })
    .onConflictDoNothing();
  await db.insert(userExchangeSettingsTable)
    .values({ userId, exchange, ...built.patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [userExchangeSettingsTable.userId, userExchangeSettingsTable.exchange],
      set:    { ...built.patch, updatedAt: new Date() },
    });
  return { ok: true as const, config: await loadExitConfig(userId) };
}

export async function clearExchangeExitConfig(userId: string, exchange: string) {
  if (!exchange || !CONNECTABLE_EXCHANGE_IDS.has(exchange)) {
    return { ok: false as const, error: `Unknown exchange "${exchange}"` };
  }
  // Null only the exit columns — the row may also carry tradeSizeUsd /
  // maxPositions, so we do NOT delete it.
  await db.update(userExchangeSettingsTable)
    .set({
      takeProfitPercent:   null,
      stopLossPercent:     null,
      trailingStopPercent: null,
      maxHoldHours:        null,
      updatedAt:           new Date(),
    })
    .where(and(
      eq(userExchangeSettingsTable.userId, userId),
      eq(userExchangeSettingsTable.exchange, exchange),
    ));
  return { ok: true as const, config: await loadExitConfig(userId) };
}

export { loadExitConfig };

// ── Customer routes ───────────────────────────────────────────────────────────

router.get("/user/exit-config", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    res.json(await loadExitConfig(userId));
  } catch (err) {
    req.log.error({ err, userId }, "GET /user/exit-config failed");
    res.status(500).json({ error: "Failed to load exit config" });
  }
});

router.put("/user/exit-config", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const result = await applyAccountExitConfig(userId, (req.body ?? {}) as Record<string, unknown>);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.config);
  } catch (err) {
    req.log.error({ err, userId }, "PUT /user/exit-config failed");
    res.status(500).json({ error: "Failed to save exit config" });
  }
});

router.put("/user/exit-config/:exchange", requireAuth, async (req, res): Promise<void> => {
  const userId   = (req as AuthReq).clerkUserId;
  const exchange = String(req.params["exchange"] ?? "").trim();
  try {
    const result = await applyExchangeExitConfig(userId, exchange, (req.body ?? {}) as Record<string, unknown>);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.config);
  } catch (err) {
    req.log.error({ err, userId, exchange }, "PUT /user/exit-config/:exchange failed");
    res.status(500).json({ error: "Failed to save per-exchange exit config" });
  }
});

router.delete("/user/exit-config/:exchange", requireAuth, async (req, res): Promise<void> => {
  const userId   = (req as AuthReq).clerkUserId;
  const exchange = String(req.params["exchange"] ?? "").trim();
  try {
    const result = await clearExchangeExitConfig(userId, exchange);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.config);
  } catch (err) {
    req.log.error({ err, userId, exchange }, "DELETE /user/exit-config/:exchange failed");
    res.status(500).json({ error: "Failed to clear per-exchange exit config" });
  }
});

export default router;
