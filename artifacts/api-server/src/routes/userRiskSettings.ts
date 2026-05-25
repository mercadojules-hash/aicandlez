import { Router } from "express";
import type { Request } from "express";
import { db } from "@workspace/db";
import {
  userRiskSettingsTable,
  usersTable,
  type RiskUnit,
  type RiskPreset,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  DEFAULT_RISK_SETTINGS,
  loadRiskSettings,
  composeRiskSnapshot,
} from "../lib/riskGate.js";

const router = Router();
type AuthReq = Request & { clerkUserId: string };

// ── /api/user/risk-settings ─────────────────────────────────────────────────
//
// GET: returns the user's saved risk caps (or defaults if no row exists),
// the canonical preset list, and the static field metadata the customer
// panel needs to render unit pickers + tooltips without bespoke wiring.
//
// PUT: allowlist-style patch. Only the four caps + enabled + preset are
// writeable. Server normalizes units to lowercase, clamps pct values to
// 0..100, rejects negatives, and JIT-creates the row so a customer who
// has never opened the panel still gets persistence on first save.

const VALID_UNITS:   ReadonlySet<RiskUnit>   = new Set(["usd", "pct"]);
const VALID_PRESETS: ReadonlySet<RiskPreset> = new Set(["conservative", "moderate", "aggressive", "custom"]);

interface RiskPatch {
  enabled?: boolean;
  preset?:  RiskPreset;
  maxCapitalPerTradeValue?: number;
  maxCapitalPerTradeUnit?:  RiskUnit;
  maxSimultaneousTrades?:   number;
  maxTotalAllocationValue?: number;
  maxTotalAllocationUnit?:  RiskUnit;
  reserveCashValue?:        number;
  reserveCashUnit?:         RiskUnit;
}

function sanitizeValue(v: unknown, unit: RiskUnit | undefined): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
  if (unit === "pct") return Math.min(100, v);
  return v;
}

function sanitizeUnit(v: unknown): RiskUnit | undefined {
  if (typeof v !== "string") return undefined;
  const lower = v.toLowerCase();
  return VALID_UNITS.has(lower as RiskUnit) ? (lower as RiskUnit) : undefined;
}

function sanitizePreset(v: unknown): RiskPreset | undefined {
  if (typeof v !== "string") return undefined;
  return VALID_PRESETS.has(v as RiskPreset) ? (v as RiskPreset) : undefined;
}

// ── Read ────────────────────────────────────────────────────────────────────

router.get("/user/risk-settings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const settings = await loadRiskSettings(userId);
    res.json({ settings, defaults: DEFAULT_RISK_SETTINGS });
  } catch (err) {
    req.log.error({ err, userId }, "GET /user/risk-settings failed — returning defaults");
    res.json({ settings: DEFAULT_RISK_SETTINGS, defaults: DEFAULT_RISK_SETTINGS });
  }
});

// ── Live status snapshot ────────────────────────────────────────────────────

router.get("/user/risk-status", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const { snapshot, equityAvailable } = await composeRiskSnapshot(userId, 0);
    res.json({ snapshot, equityAvailable });
  } catch (err) {
    req.log.error({ err, userId }, "GET /user/risk-status failed");
    res.status(500).json({ error: "risk_status_failed" });
  }
});

// ── Write ───────────────────────────────────────────────────────────────────

router.put("/user/risk-settings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const body   = (req.body ?? {}) as Record<string, unknown>;

  // Build a clean patch object. Unknown keys are silently dropped.
  const patch: RiskPatch = {};
  if (typeof body["enabled"] === "boolean") patch.enabled = body["enabled"];
  const preset = sanitizePreset(body["preset"]);
  if (preset) patch.preset = preset;

  const u1 = sanitizeUnit(body["maxCapitalPerTradeUnit"]);
  if (u1) patch.maxCapitalPerTradeUnit = u1;
  const v1 = sanitizeValue(body["maxCapitalPerTradeValue"], u1);
  if (v1 !== undefined) patch.maxCapitalPerTradeValue = v1;

  if (typeof body["maxSimultaneousTrades"] === "number" && Number.isFinite(body["maxSimultaneousTrades"]) && (body["maxSimultaneousTrades"] as number) >= 0) {
    patch.maxSimultaneousTrades = Math.floor(body["maxSimultaneousTrades"] as number);
  }

  const u2 = sanitizeUnit(body["maxTotalAllocationUnit"]);
  if (u2) patch.maxTotalAllocationUnit = u2;
  const v2 = sanitizeValue(body["maxTotalAllocationValue"], u2);
  if (v2 !== undefined) patch.maxTotalAllocationValue = v2;

  const u3 = sanitizeUnit(body["reserveCashUnit"]);
  if (u3) patch.reserveCashUnit = u3;
  const v3 = sanitizeValue(body["reserveCashValue"], u3);
  if (v3 !== undefined) patch.reserveCashValue = v3;

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "no_valid_fields" });
    return;
  }

  try {
    // JIT-provision parent users row + insert/update settings row. Mirrors
    // the `getOrCreateSettings` pattern in /user/settings — first-touch
    // PUT from a fresh Clerk session must not 500 on FK violation.
    await db
      .insert(usersTable)
      .values({ clerkUserId: userId, email: "", role: "user" })
      .onConflictDoNothing();

    const existing = await db
      .select()
      .from(userRiskSettingsTable)
      .where(eq(userRiskSettingsTable.userId, userId))
      .limit(1)
      .then((r) => r[0]);

    if (existing) {
      await db
        .update(userRiskSettingsTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(userRiskSettingsTable.userId, userId));
    } else {
      await db
        .insert(userRiskSettingsTable)
        .values({ userId, ...patch })
        .onConflictDoNothing();
    }

    const settings = await loadRiskSettings(userId);
    res.json({ settings, defaults: DEFAULT_RISK_SETTINGS });
  } catch (err) {
    req.log.error({ err, userId }, "PUT /user/risk-settings failed");
    res.status(500).json({ error: "risk_settings_write_failed" });
  }
});

export default router;
