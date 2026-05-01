import { Router } from "express";
import { computeCorrelationMatrix } from "../lib/correlationEngine.js";
import { checkTrailingStops, getTrailingStopConfig, updateTrailingStopConfig } from "../lib/trailingStopEngine.js";
import { getAccountSummary } from "../lib/simulationEngine.js";

const router = Router();

// GET /correlation/overview — combined matrix + stops in one call
router.get("/correlation/overview", async (_req, res) => {
  try {
    const summary     = await getAccountSummary();
    const openSymbols = summary.positions.map(p => p.symbol);
    const [matrix, stopResult] = await Promise.all([
      computeCorrelationMatrix(openSymbols),
      checkTrailingStops(),
    ]);
    res.json({
      matrix,
      stops:          stopResult.statuses,
      stopsConfig:    stopResult.config,
      triggeredCount: stopResult.triggeredCount,
      triggeredSymbols: stopResult.triggeredSymbols,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /correlation/matrix — correlation matrix only
router.get("/correlation/matrix", async (_req, res) => {
  try {
    const summary     = await getAccountSummary();
    const openSymbols = summary.positions.map(p => p.symbol);
    const matrix      = await computeCorrelationMatrix(openSymbols);
    res.json(matrix);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /correlation/stops — trailing stop statuses (also runs a check + auto-closes triggered)
router.get("/correlation/stops", async (_req, res) => {
  try {
    const result = await checkTrailingStops();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /correlation/stops/config — update trailing stop settings
router.patch("/correlation/stops/config", (req, res) => {
  const { activateAfterPct, trailDistancePct, enabled } = req.body ?? {};
  const patch: Parameters<typeof updateTrailingStopConfig>[0] = {};

  if (activateAfterPct !== undefined) {
    const n = Number(activateAfterPct);
    if (isNaN(n) || n < 0.5 || n > 20) {
      res.status(400).json({ error: "activateAfterPct must be 0.5–20" });
      return;
    }
    patch.activateAfterPct = n;
  }
  if (trailDistancePct !== undefined) {
    const n = Number(trailDistancePct);
    if (isNaN(n) || n < 0.5 || n > 15) {
      res.status(400).json({ error: "trailDistancePct must be 0.5–15" });
      return;
    }
    patch.trailDistancePct = n;
  }
  if (enabled !== undefined) {
    patch.enabled = Boolean(enabled);
  }

  const updated = updateTrailingStopConfig(patch);
  res.json({ config: updated });
});

export default router;
