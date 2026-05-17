import { Router } from "express";
import type { Request } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getPortfolioOverview, updatePortfolioConfig } from "../lib/portfolioEngine.js";

type AuthReq = Request & { clerkUserId: string };

const router = Router();

// GET /portfolio/overview — auth-gated, returns the signed-in user's personal
// simulation portfolio (positions, realised PnL, allocation).
router.get("/portfolio/overview", requireAuth, async (req, res) => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const overview = await getPortfolioOverview(userId);
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /portfolio/config — update position / exposure limits
router.patch("/portfolio/config", requireAuth, (req, res) => {
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
