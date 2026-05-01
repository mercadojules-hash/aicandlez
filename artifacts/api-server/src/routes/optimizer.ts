import { Router } from "express";
import { runOptimizer, PARAM_GRID, type OptimizeTarget } from "../lib/strategyOptimizer.js";
import { SUPPORTED_SYMBOLS, SUPPORTED_TIMEFRAMES } from "../lib/marketData.js";

const router = Router();

const VALID_TARGETS: OptimizeTarget[] = ["totalReturn", "sharpeRatio", "winRate", "profitFactor"];

// GET /optimizer/grid — return the parameter grid (no computation)
router.get("/optimizer/grid", (_req, res) => {
  res.json({ grid: PARAM_GRID, totalCombinations: "see POST /optimizer/run" });
});

// POST /optimizer/run — run grid search
router.post("/optimizer/run", async (req, res) => {
  const {
    symbol         = "BTCUSD",
    timeframe      = "1h",
    initialCapital = 10000,
    optimizeFor    = "totalReturn",
  } = req.body ?? {};

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    res.status(400).json({ error: `Unsupported symbol. Supported: ${SUPPORTED_SYMBOLS.join(", ")}` });
    return;
  }
  if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
    res.status(400).json({ error: `Unsupported timeframe. Supported: ${SUPPORTED_TIMEFRAMES.join(", ")}` });
    return;
  }
  if (!VALID_TARGETS.includes(optimizeFor)) {
    res.status(400).json({ error: `Invalid optimizeFor. Supported: ${VALID_TARGETS.join(", ")}` });
    return;
  }
  if (typeof initialCapital !== "number" || initialCapital < 100) {
    res.status(400).json({ error: "initialCapital must be >= 100" });
    return;
  }

  try {
    const result = await runOptimizer({ symbol, timeframe, initialCapital, optimizeFor });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
