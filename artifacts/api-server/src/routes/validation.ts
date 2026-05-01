import { Router } from "express";
import {
  runValidation, getLastValidation, isLiveLocked, getLockReason,
  isValidating, manualOverrideLock,
} from "../lib/validationEngine.js";
import { DEFAULT_PARAMS } from "../lib/backtestEngine.js";

const router = Router();

// GET /validation/status — current lock state + last result summary
router.get("/validation/status", (_req, res) => {
  const last = getLastValidation();
  res.json({
    liveLocked:      isLiveLocked(),
    lockReason:      getLockReason(),
    validating:      isValidating(),
    lastRunAt:       last?.runAt ?? null,
    lastGrade:       last?.grade ?? null,
    lastGradeScore:  last?.gradeScore ?? null,
    lastResult:      last,
  });
});

// POST /validation/run — trigger a full validation run
router.post("/validation/run", async (req, res) => {
  if (isValidating()) {
    res.status(409).json({ error: "Validation already running" });
    return;
  }
  try {
    const params = {
      emaShort:         req.body?.emaShort         ?? DEFAULT_PARAMS.emaShort,
      emaLong:          req.body?.emaLong           ?? DEFAULT_PARAMS.emaLong,
      rsiBuyThreshold:  req.body?.rsiBuyThreshold   ?? DEFAULT_PARAMS.rsiBuyThreshold,
      rsiSellThreshold: req.body?.rsiSellThreshold  ?? DEFAULT_PARAMS.rsiSellThreshold,
    };
    const result = await runValidation(params);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /validation/override — manually lock or unlock live trading
router.post("/validation/override", (req, res) => {
  const { lock, reason } = req.body ?? {};
  if (typeof lock !== "boolean") {
    res.status(400).json({ error: "Required: lock (boolean)" });
    return;
  }
  manualOverrideLock(lock, reason);
  res.json({ ok: true, liveLocked: lock });
});

export default router;
