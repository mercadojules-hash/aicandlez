import { Router } from "express";
import { getPortfolioOverview, updatePortfolioConfig } from "../lib/portfolioEngine.js";

const router = Router();

// GET /portfolio/overview — full live portfolio state (backed by simulation engine)
router.get("/portfolio/overview", async (_req, res) => {
  try {
    const overview = await getPortfolioOverview();
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /portfolio/config — update position / exposure limits
router.patch("/portfolio/config", (req, res) => {
  const { maxPositions, maxExposurePct, maxSinglePositionPct } = req.body ?? {};
  const patch: Parameters<typeof updatePortfolioConfig>[0] = {};

  if (maxPositions !== undefined) {
    const n = Number(maxPositions);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      res.status(400).json({ error: "maxPositions must be integer 1–10" });
      return;
    }
    patch.maxPositions = n;
  }
  if (maxExposurePct !== undefined) {
    const n = Number(maxExposurePct);
    if (isNaN(n) || n < 10 || n > 100) {
      res.status(400).json({ error: "maxExposurePct must be 10–100" });
      return;
    }
    patch.maxExposurePct = n;
  }
  if (maxSinglePositionPct !== undefined) {
    const n = Number(maxSinglePositionPct);
    if (isNaN(n) || n < 5 || n > 100) {
      res.status(400).json({ error: "maxSinglePositionPct must be 5–100" });
      return;
    }
    patch.maxSinglePositionPct = n;
  }

  const updated = updatePortfolioConfig(patch);
  res.json({ config: updated });
});

export default router;
